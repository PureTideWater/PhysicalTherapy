-- Billing, after review (PRD 5, J18: "failed payments follow dunning and suspend new runs after 30 days"; PRD 6,
-- Billing; PRD 13, ROI statement: "fees paid to the product in the period", recomputable from records;
-- docs/adr/0050 and 0055).
--
-- - invoice_rules: an invoice's dunning clock (first_failed_at) may move earlier, never later. Stripe does not
--   promise the order of its events, so a failure delivered after a later one is the clock's true start.
-- - practice.deleted_at: when a practice was deleted, stamped by the database as its status moves to deleted.
-- - practice_fees_paid: a paid invoice is shared among the practices that existed and were not deleted when it
--   was paid, so deleting a practice later never changes the fees of a past period.
-- - subscription_claim: one subscription being set up or in place per organization, claimed in the database
--   before Stripe is asked, so two submissions (two tabs, a form rendered twice) cannot both subscribe while the
--   first one's webhook is still on its way. Billing writes it (tp_billing); nobody else reads it.
--
-- Runs as tp_owner. Safe with the previous image running: the previous image never reads the new table or
-- column, its webhooks write first_failed_at only where it is null (allowed before and after), and the fees
-- function keeps its signature.

-- ---------------------------------------------------------------------------------------------------
-- The dunning clock moves earlier only
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION invoice_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
  IF OLD.first_failed_at IS NOT NULL AND (NEW.first_failed_at IS NULL OR NEW.first_failed_at > OLD.first_failed_at) THEN
    RAISE EXCEPTION 'an invoice''s first failed payment moves earlier only' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- When a practice was deleted, and the fees of the practices that existed then
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE practice ADD COLUMN deleted_at timestamptz;

-- A practice deleted before this column existed (only in a development database) takes its last change.
SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice WHERE status = 'deleted'), '{}'), true);
UPDATE practice SET deleted_at = updated_at WHERE status = 'deleted' AND deleted_at IS NULL;
SELECT set_config('app.practice_ids', '{}', true);

ALTER TABLE practice ADD CONSTRAINT practice_deleted_at CHECK ((status = 'deleted') = (deleted_at IS NOT NULL));

CREATE FUNCTION practice_deleted_at() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NEW.status = 'deleted' AND OLD.status <> 'deleted' THEN
    NEW.deleted_at := now();
  ELSIF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'a practice''s deletion time is the database''s, set once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER practice_deleted_at BEFORE UPDATE ON practice FOR EACH ROW EXECUTE FUNCTION practice_deleted_at();
REVOKE ALL ON FUNCTION practice_deleted_at() FROM PUBLIC;

-- The fees paid to the product in a period (calendar dates, UTC) for a practice in the caller's scope: each
-- paid invoice of its owning group, paid in the period, shared equally among the group's practices that existed
-- and were not deleted when it was paid, the cents left over going one each to the earliest of them, so the
-- shares add up to the invoice exactly. Integer cents only.
CREATE OR REPLACE FUNCTION practice_fees_paid(target_practice uuid, period_from date, period_to date) RETURNS bigint
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
        JOIN practice p ON p.organization_id = i.organization_id AND p.created_at <= i.paid_at AND (p.deleted_at IS NULL OR p.deleted_at > i.paid_at)
       WHERE i.organization_id = owner_organization AND i.status = 'paid'
         AND (i.paid_at AT TIME ZONE 'UTC')::date BETWEEN period_from AND period_to
    ) s
   WHERE s.practice_id = target_practice;
  RETURN total;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- One subscription being set up or in place per organization
-- ---------------------------------------------------------------------------------------------------

-- pending: claimed, Stripe not yet answered; created: Stripe created the subscription; failed: Stripe refused,
-- or the claim was abandoned (its process gone before Stripe answered); ended: the subscription ended
-- (canceled, or expired incomplete), so the organization may choose a plan again.
CREATE TABLE subscription_claim (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organization (id),
  plan text NOT NULL CHECK (plan IN ('monthly', 'annual')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'created', 'failed', 'ended')),
  stripe_subscription_id text CHECK (stripe_subscription_id ~ '^sub_[A-Za-z0-9_]{1,250}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_claim_subscription CHECK ((stripe_subscription_id IS NOT NULL) = (status IN ('created', 'ended')))
);
CREATE UNIQUE INDEX subscription_claim_one_per_organization ON subscription_claim (organization_id) WHERE status IN ('pending', 'created');
CREATE INDEX subscription_claim_by_subscription ON subscription_claim (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE TRIGGER subscription_claim_updated_at BEFORE UPDATE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A claim moves forward only: pending to created or failed, created to ended; its organization and plan never change.
CREATE FUNCTION subscription_claim_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a subscription claim is kept' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.plan, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.organization_id, OLD.plan, OLD.created_at)
     OR NOT ((OLD.status = NEW.status AND OLD.stripe_subscription_id IS NOT DISTINCT FROM NEW.stripe_subscription_id)
             OR (OLD.status = 'pending' AND NEW.status IN ('created', 'failed'))
             OR (OLD.status = 'created' AND NEW.status = 'ended' AND NEW.stripe_subscription_id = OLD.stripe_subscription_id)) THEN
    RAISE EXCEPTION 'a subscription claim moves from pending to created or failed, and from created to ended' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER subscription_claim_rules BEFORE UPDATE OR DELETE ON subscription_claim FOR EACH ROW EXECUTE FUNCTION subscription_claim_rules();
CREATE TRIGGER subscription_claim_no_truncate BEFORE TRUNCATE ON subscription_claim FOR EACH STATEMENT EXECUTE FUNCTION billing_records_kept();

ALTER TABLE subscription_claim ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_claim FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_claim_billing ON subscription_claim FOR ALL TO tp_billing USING (true) WITH CHECK (true);
CREATE POLICY subscription_claim_owner ON subscription_claim FOR SELECT TO tp_owner USING (true);

REVOKE ALL ON subscription_claim FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON subscription_claim TO tp_billing;
REVOKE ALL ON FUNCTION subscription_claim_rules() FROM PUBLIC;
