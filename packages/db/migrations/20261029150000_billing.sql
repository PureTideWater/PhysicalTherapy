-- Billing (PRD 4, Monitoring v1: "Stripe billing: annual and monthly plans, invoices, ACH"; PRD 5, J18; PRD 6,
-- Billing: "Stripe customers, subscriptions, invoices, ACH and card; firm invoicing by nightly grant count;
-- dunning; suspension rules", acceptance "a suspended organization can read but not run"; PRD 8: subscription,
-- invoice, usage_snapshot, "Billing never reads PHI tables"; PRD 13, ROI statement: "fees paid to the product
-- in the period"; PRD 15 and 16: Stripe for non-PHI; Data dictionary, Operations; docs/adr/0050).
--
-- - subscription, invoice: the organization's Stripe records as Stripe's webhooks report them (references,
--   statuses, integer cents, dates; never PHI). The dunning clock is an invoice's first failed payment.
-- - usage_snapshot: each organization's granted and active practices, counted nightly (the seam firm
--   per-practice invoicing reads in milestone 12).
-- - billing_event: every Stripe event received, once, by its event ID, so a webhook delivered twice does
--   nothing the second time.
--
-- These are organization-level tables: no practice_id, so no PHI table and no tenant policy. They force
-- row-level security with policies by organization. Billing code runs as tp_billing (created by the role
-- bootstrap: NOLOGIN, owns nothing, cannot bypass), which the application and operator roles may SET ROLE to
-- but do not inherit. tp_billing holds privileges on the billing tables, reads the organization's name,
-- kind, status and customer reference, records the customer reference once, and calls the functions below;
-- it holds nothing on any PHI table, and billing.db.test.ts proves it reads none.
--
-- Suspension (PRD 5, J18: "failed payments follow dunning and suspend new runs after 30 days while leaving
-- data readable"): billing_standing says, for every organization, whether an invoice whose payment failed
-- has stayed unpaid for 30 days. While it has (or while a platform administrator holds the organization
-- suspended), the database refuses new work for the organization's practices: a pricing run, an audit
-- report, a report document, an ROI statement, a digest, a new upload, a packet export. Paying the invoice
-- lifts it at once; nothing has to be undone. Reads are never refused.
--
-- The organization's administrators (organization.billing: the practice administrator of a group, the firm
-- principal of a firm) read its billing records, and platform administrators (billing.manage) read every
-- organization's. Nobody but tp_billing writes them.
--
-- Runs as tp_owner. Safe with the previous image running: new tables, functions and triggers; the previous
-- image never reads the tables, and the triggers refuse work only for an organization billing has suspended,
-- which needs a failed invoice only this image records.

-- ---------------------------------------------------------------------------------------------------
-- The permission matrix: the organization's administrators manage its billing (PRD 3: the firm principal
-- "is billed"; PRD 5, J18: the organization owner).
-- ---------------------------------------------------------------------------------------------------

INSERT INTO role_permission (role, action, effect) VALUES
  ('firm_principal', 'organization.billing', 'allow'),
  ('practice_admin', 'organization.billing', 'allow'),
  ('reviewer', 'organization.billing', 'deny');

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE subscription (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  stripe_subscription_id text NOT NULL UNIQUE CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'),
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9_]{1,250}$'),
  stripe_price_id text NOT NULL CHECK (stripe_price_id ~ '^price_[A-Za-z0-9_]{1,250}$'),
  plan text NOT NULL CHECK (plan IN ('monthly', 'annual')),
  status text NOT NULL CHECK (status IN ('incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  -- When Stripe created the event this row last took (an older event never overwrites a newer one).
  stripe_event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_period CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end >= current_period_start)
);
CREATE INDEX subscription_by_organization ON subscription (organization_id, created_at DESC);
CREATE TRIGGER subscription_updated_at BEFORE UPDATE ON subscription FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE invoice (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  stripe_invoice_id text NOT NULL UNIQUE CHECK (stripe_invoice_id ~ '^in_[A-Za-z0-9_]{1,250}$'),
  stripe_customer_id text NOT NULL CHECK (stripe_customer_id ~ '^cus_[A-Za-z0-9_]{1,250}$'),
  -- The subscription that billed it; null for an audit invoice.
  stripe_subscription_id text CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'),
  kind text NOT NULL CHECK (kind IN ('subscription', 'audit', 'other')),
  number text CHECK (number ~ '^[A-Za-z0-9-]{1,64}$'),
  status text NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  currency text NOT NULL CHECK (currency = 'usd'),
  amount_due_cents bigint NOT NULL CHECK (amount_due_cents >= 0),
  amount_paid_cents bigint NOT NULL CHECK (amount_paid_cents >= 0),
  amount_remaining_cents bigint NOT NULL CHECK (amount_remaining_cents >= 0 AND amount_remaining_cents <= amount_due_cents),
  period_start timestamptz,
  period_end timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  -- How it was paid, where Stripe's event says (ACH debit or card).
  payment_method_kind text CHECK (payment_method_kind IN ('us_bank_account', 'card')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  -- The dunning clock: the first failed payment of this invoice, and the latest failure's code.
  first_failed_at timestamptz,
  last_failure_code text CHECK (last_failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- Stripe's hosted invoice page, where the customer sees and pays it.
  hosted_invoice_url text CHECK (hosted_invoice_url ~ '^https://[a-z0-9.-]+\.stripe\.com/[A-Za-z0-9/_.~=?&%-]{1,2000}$'),
  -- The last dunning notice sent for it (the worker's daily billing_dunning job).
  dunning_stage text CHECK (dunning_stage IN ('payment_failed', 'second_notice', 'third_notice', 'final_notice', 'suspended', 'reinstated', 'resolved')),
  dunning_notified_at timestamptz,
  stripe_event_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_paid CHECK ((status = 'paid') = (paid_at IS NOT NULL)),
  CONSTRAINT invoice_subscription_kind CHECK (kind <> 'subscription' OR stripe_subscription_id IS NOT NULL),
  CONSTRAINT invoice_dunning CHECK ((dunning_stage IS NULL) = (dunning_notified_at IS NULL) AND (dunning_stage IS NULL OR first_failed_at IS NOT NULL))
);
CREATE INDEX invoice_by_organization ON invoice (organization_id, created_at DESC);
CREATE INDEX invoice_failing ON invoice (organization_id, first_failed_at) WHERE status IN ('open', 'uncollectible') AND first_failed_at IS NOT NULL;
CREATE INDEX invoice_paid_by_organization ON invoice (organization_id, paid_at) WHERE status = 'paid';
CREATE TRIGGER invoice_updated_at BEFORE UPDATE ON invoice FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE usage_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  date date NOT NULL,
  -- Practices the organization reaches through a grant in force (a firm's clients).
  granted_practices integer NOT NULL CHECK (granted_practices >= 0),
  -- Active practices the organization owns or reaches through a grant in force.
  active_practices integer NOT NULL CHECK (active_practices >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT usage_snapshot_once UNIQUE (organization_id, date)
);

CREATE TABLE billing_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE CHECK (stripe_event_id ~ '^evt_[A-Za-z0-9_]{1,250}$'),
  type text NOT NULL CHECK (type ~ '^[a-z_]{1,64}(\.[a-z_]{1,64}){0,4}$'),
  occurred_at timestamptz NOT NULL,
  organization_id uuid REFERENCES organization (id),
  -- received: claimed, not yet applied (inside its transaction only); applied; stale (an older event than
  -- the record already took); ignored (a type billing does not keep); unknown_customer (no organization).
  outcome text NOT NULL CHECK (outcome IN ('received', 'applied', 'stale', 'ignored', 'unknown_customer')),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_event_by_organization ON billing_event (organization_id, received_at);

-- A usage snapshot and a received event are kept as they were recorded.
CREATE FUNCTION billing_records_kept() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION '% rows are kept', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  IF TG_TABLE_NAME = 'usage_snapshot' THEN
    RAISE EXCEPTION 'a usage snapshot never changes' USING ERRCODE = 'check_violation';
  END IF;
  -- billing_event: only its outcome, once, from received.
  IF (NEW.id, NEW.stripe_event_id, NEW.type, NEW.occurred_at, NEW.received_at) IS DISTINCT FROM (OLD.id, OLD.stripe_event_id, OLD.type, OLD.occurred_at, OLD.received_at)
     OR OLD.outcome <> 'received' THEN
    RAISE EXCEPTION 'a billing event is recorded once; only its outcome follows' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER usage_snapshot_kept BEFORE UPDATE OR DELETE ON usage_snapshot FOR EACH ROW EXECUTE FUNCTION billing_records_kept();
CREATE TRIGGER usage_snapshot_no_truncate BEFORE TRUNCATE ON usage_snapshot FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept();
CREATE TRIGGER billing_event_kept BEFORE UPDATE OR DELETE ON billing_event FOR EACH ROW EXECUTE FUNCTION billing_records_kept();
CREATE TRIGGER billing_event_no_truncate BEFORE TRUNCATE ON billing_event FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept();

-- An invoice's status moves forward only (draft, open, then paid, void or uncollectible; uncollectible
-- may still be paid or voided), and its dunning clock, once started, is never moved.
CREATE FUNCTION invoice_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  rank_of constant jsonb := '{"draft": 0, "open": 1, "uncollectible": 2, "paid": 3, "void": 3}';
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an invoice is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.stripe_invoice_id, NEW.stripe_customer_id) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.stripe_invoice_id, OLD.stripe_customer_id) THEN
    RAISE EXCEPTION 'an invoice belongs to its organization and Stripe invoice for good' USING ERRCODE = 'check_violation';
  END IF;
  IF (rank_of ->> NEW.status)::int < (rank_of ->> OLD.status)::int OR (OLD.status IN ('paid', 'void') AND NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'an invoice''s status moves forward only' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.first_failed_at IS NOT NULL AND NEW.first_failed_at IS DISTINCT FROM OLD.first_failed_at THEN
    RAISE EXCEPTION 'an invoice''s first failed payment is recorded once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_rules BEFORE UPDATE OR DELETE ON invoice FOR EACH ROW EXECUTE FUNCTION invoice_rules();
CREATE TRIGGER invoice_no_truncate BEFORE TRUNCATE ON invoice FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept();
CREATE TRIGGER subscription_no_truncate BEFORE TRUNCATE ON subscription FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept();

CREATE FUNCTION subscription_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a subscription is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.stripe_subscription_id, NEW.stripe_customer_id) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.stripe_subscription_id, OLD.stripe_customer_id) THEN
    RAISE EXCEPTION 'a subscription belongs to its organization and Stripe subscription for good' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subscription_rules BEFORE UPDATE OR DELETE ON subscription FOR EACH ROW EXECUTE FUNCTION subscription_rules();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security and privileges
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice FORCE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_snapshot FORCE ROW LEVEL SECURITY;
ALTER TABLE billing_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_event FORCE ROW LEVEL SECURITY;

-- Billing keeps every organization's records (a webhook names any customer).
CREATE POLICY subscription_billing ON subscription FOR ALL TO tp_billing USING (true) WITH CHECK (true);
CREATE POLICY invoice_billing ON invoice FOR ALL TO tp_billing USING (true) WITH CHECK (true);
CREATE POLICY usage_snapshot_billing ON usage_snapshot FOR ALL TO tp_billing USING (true) WITH CHECK (true);
CREATE POLICY billing_event_billing ON billing_event FOR ALL TO tp_billing USING (true) WITH CHECK (true);

-- The organization's administrators read its billing; platform administrators read every organization's.
CREATE POLICY subscription_owners_read ON subscription FOR SELECT TO tp_app
  USING (app_actor_organization_permitted(organization_id, 'organization.billing') OR (SELECT app_actor_platform_permitted('billing.manage')));
CREATE POLICY invoice_owners_read ON invoice FOR SELECT TO tp_app
  USING (app_actor_organization_permitted(organization_id, 'organization.billing') OR (SELECT app_actor_platform_permitted('billing.manage')));
CREATE POLICY usage_snapshot_owners_read ON usage_snapshot FOR SELECT TO tp_app
  USING (app_actor_organization_permitted(organization_id, 'organization.billing') OR (SELECT app_actor_platform_permitted('billing.manage')));

-- The owner reads them for the functions below (the standing, the refusal, the fees).
CREATE POLICY subscription_owner ON subscription FOR SELECT TO tp_owner USING (true);
CREATE POLICY invoice_owner ON invoice FOR SELECT TO tp_owner USING (true);
CREATE POLICY usage_snapshot_owner ON usage_snapshot FOR SELECT TO tp_owner USING (true);

-- Billing reads an organization's name (Stripe's customer name), kind and status, and records its
-- customer reference once.
CREATE POLICY organization_billing_read ON organization FOR SELECT TO tp_billing USING (true);
CREATE POLICY organization_billing_customer ON organization FOR UPDATE TO tp_billing USING (billing_customer_ref IS NULL) WITH CHECK (true);

REVOKE ALL ON subscription, invoice, usage_snapshot, billing_event FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON subscription, invoice, billing_event TO tp_billing;
GRANT SELECT, INSERT ON usage_snapshot TO tp_billing;
GRANT SELECT ON subscription, invoice, usage_snapshot TO tp_app;
GRANT SELECT (id, kind, name, status, billing_customer_ref) ON organization TO tp_billing;
GRANT UPDATE (billing_customer_ref) ON organization TO tp_billing;

-- ---------------------------------------------------------------------------------------------------
-- The standing: past due from an invoice's first failed payment, suspended 30 days later, until paid
-- ---------------------------------------------------------------------------------------------------

-- One row per organization: good, past_due (an invoice's payment failed and it is unpaid) or suspended
-- (that has lasted 30 days), from its oldest such invoice. Read with the caller's own policies, so an
-- organization's administrators see their organization's and platform administrators every one.
CREATE VIEW billing_standing WITH (security_invoker = true) AS
  SELECT o.id AS organization_id,
         CASE WHEN f.first_failed_at IS NULL THEN 'good'
              WHEN f.first_failed_at <= now() - interval '30 days' THEN 'suspended'
              ELSE 'past_due' END AS standing,
         f.first_failed_at AS past_due_since,
         CASE WHEN f.first_failed_at <= now() - interval '30 days' THEN f.first_failed_at + interval '30 days' END AS suspended_since,
         f.id AS invoice_id
    FROM organization o
    LEFT JOIN LATERAL (
      SELECT i.id, i.first_failed_at FROM invoice i
       WHERE i.organization_id = o.id AND i.status IN ('open', 'uncollectible') AND i.first_failed_at IS NOT NULL
       ORDER BY i.first_failed_at, i.id LIMIT 1
    ) f ON true;

REVOKE ALL ON billing_standing FROM PUBLIC;
GRANT SELECT ON billing_standing TO tp_app, tp_billing;

-- Why an organization's practices may not start new work now, or null: a platform administrator holds it
-- suspended or closed, or billing has suspended it for nonpayment. Sentences only, never an amount.
CREATE FUNCTION organization_run_refusal(target_organization uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE
    WHEN o.status = 'suspended' THEN 'the organization is suspended: its data stays readable, and new runs start again once a platform administrator reinstates it'
    WHEN o.status = 'closed' THEN 'the organization is closed: its data stays readable, and no new run starts'
    WHEN s.standing = 'suspended' THEN 'the organization is suspended for nonpayment: an invoice has stayed unpaid for 30 days since its payment failed; its data stays readable, and new runs start again once the invoice is paid'
  END
    FROM organization o JOIN billing_standing s ON s.organization_id = o.id
   WHERE o.id = target_organization
$$;

-- The same for a practice in the caller's scope (the route wrapper, the job chain, the dashboard): its
-- owning group's refusal, or null.
CREATE FUNCTION practice_run_refusal(target_practice uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  reason text;
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT organization_run_refusal(p.organization_id) INTO reason FROM practice p WHERE p.id = target_practice AND p.organization_id IS NOT NULL;
  RETURN reason;
END;
$$;

-- The database refuses new work for a suspended organization's practices, whoever asks (the routes refuse
-- first, with the reason; the job chain refuses its own steps). A zip's entries (an upload already
-- taken) and the work started before the suspension finish.
CREATE FUNCTION refuse_new_work_while_suspended() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  reason text;
BEGIN
  SELECT organization_run_refusal(p.organization_id) INTO reason FROM practice p WHERE p.id = NEW.practice_id AND p.organization_id IS NOT NULL;
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pricing_run_refused_while_suspended BEFORE INSERT ON pricing_run FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER audit_report_refused_while_suspended BEFORE INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER report_document_refused_while_suspended BEFORE INSERT ON report_document FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER roi_statement_refused_while_suspended BEFORE INSERT ON roi_statement FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER digest_refused_while_suspended BEFORE INSERT ON digest FOR EACH ROW EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER source_document_refused_while_suspended BEFORE INSERT ON source_document
  FOR EACH ROW WHEN (NEW.parent_document_id IS NULL) EXECUTE FUNCTION refuse_new_work_while_suspended();
CREATE TRIGGER packet_version_export_refused_while_suspended BEFORE UPDATE OF exported_at ON packet_version
  FOR EACH ROW WHEN (OLD.exported_at IS NULL AND NEW.exported_at IS NOT NULL) EXECUTE FUNCTION refuse_new_work_while_suspended();

-- A refused job is recorded as refused (with its reason's code), not as failed: it is not retried and
-- raises no alert.
ALTER TABLE job_run DROP CONSTRAINT job_run_outcome_check;
ALTER TABLE job_run ADD CONSTRAINT job_run_outcome_check CHECK (outcome IN ('running', 'retrying', 'succeeded', 'failed', 'refused'));

-- ---------------------------------------------------------------------------------------------------
-- The ROI statement's fees (PRD 13): what the practice's group paid in the period
-- ---------------------------------------------------------------------------------------------------

-- The fees paid to the product in a period (calendar dates, UTC) for a practice in the caller's scope:
-- each paid invoice of its owning group, paid in the period, shared equally among the group's active
-- practices that existed when it was paid, the cents left over going one each to the earliest of them,
-- so the shares add up to the invoice exactly. Integer cents only.
CREATE FUNCTION practice_fees_paid(target_practice uuid, period_from date, period_to date) RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  owner_organization uuid;
  total bigint;
BEGIN
  IF NOT practice_in_scope(target_practice) THEN
    RAISE EXCEPTION 'the practice is not in this transaction''s scope' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT p.organization_id INTO owner_organization FROM practice p WHERE p.id = target_practice;
  IF owner_organization IS NULL THEN
    RETURN 0;
  END IF;
  SELECT coalesce(sum(s.amount_paid_cents / s.practices + CASE WHEN s.position <= s.amount_paid_cents % s.practices THEN 1 ELSE 0 END), 0)::bigint
    INTO total
    FROM (
      SELECT i.amount_paid_cents, p.id AS practice_id,
             row_number() OVER (PARTITION BY i.id ORDER BY p.created_at, p.id) AS position,
             count(*) OVER (PARTITION BY i.id) AS practices
        FROM invoice i
        JOIN practice p ON p.organization_id = i.organization_id AND p.status = 'active' AND p.created_at <= i.paid_at
       WHERE i.organization_id = owner_organization AND i.status = 'paid'
         AND (i.paid_at AT TIME ZONE 'UTC')::date BETWEEN period_from AND period_to
    ) s
   WHERE s.practice_id = target_practice;
  RETURN total;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- What billing may ask of the tenancy tables: counts and its owners' addresses, never a practice's record
-- ---------------------------------------------------------------------------------------------------

-- Each group's and firm's practices, counted now (the nightly usage snapshot): practices it reaches through
-- a grant in force, and active practices it owns or reaches through one. Counts only.
CREATE FUNCTION billing_usage_counts() RETURNS TABLE (organization_id uuid, granted_practices integer, active_practices integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT o.id,
         (SELECT count(DISTINCT g.practice_id) FROM "grant" g JOIN practice p ON p.id = g.practice_id
           WHERE g.organization_id = o.id AND g.revoked_at IS NULL AND g.starts_at <= now() AND g.ends_at > now() AND p.status = 'active')::integer,
         (SELECT count(*) FROM practice p
           WHERE p.status = 'active'
             AND (p.organization_id = o.id
                  OR EXISTS (SELECT 1 FROM "grant" g WHERE g.organization_id = o.id AND g.practice_id = p.id AND g.revoked_at IS NULL AND g.starts_at <= now() AND g.ends_at > now())))::integer
    FROM organization o
   WHERE o.kind IN ('group', 'firm')
   ORDER BY o.id
$$;

-- Where a dunning notice goes: the organization's current, active administrators who manage its billing.
CREATE FUNCTION billing_owner_emails(target_organization uuid) RETURNS TABLE (email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT DISTINCT u.email FROM membership m JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = target_organization AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active'
     AND roles_permit(ARRAY[m.role], 'organization.billing')
   ORDER BY u.email
$$;

-- Billing's audit events, as the system: an event applied, a dunning notice, a suspension or reinstatement
-- the notices report, a night's usage snapshot. Never a practice.
CREATE FUNCTION billing_record_audit(event_action text, target_type text, target_id uuid, event_purpose text, request text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF event_action NOT IN ('billing_event_applied', 'billing_dunning_notice', 'billing_suspended', 'billing_reinstated', 'billing_usage_snapshot')
     OR target_type NOT IN ('billing_event', 'invoice', 'organization', 'usage_snapshot') THEN
    RAISE EXCEPTION 'billing records only its own audit events' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES ('system', event_action, target_type, target_id, event_purpose, request);
END;
$$;

REVOKE ALL ON FUNCTION billing_records_kept(), invoice_rules(), subscription_rules(), organization_run_refusal(uuid), practice_run_refusal(uuid),
  refuse_new_work_while_suspended(), practice_fees_paid(uuid, date, date), billing_usage_counts(), billing_owner_emails(uuid),
  billing_record_audit(text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION practice_run_refusal(uuid), practice_fees_paid(uuid, date, date) TO tp_app;
GRANT EXECUTE ON FUNCTION billing_usage_counts(), billing_owner_emails(uuid), billing_record_audit(text, text, uuid, text, text) TO tp_billing;
