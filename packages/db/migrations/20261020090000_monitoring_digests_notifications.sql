-- Monthly monitoring jobs, digests and in-app notifications (PRD 5, J11 and J12; PRD 6, Monitoring
-- jobs and notifications: "parse, price, triage, reconcile on new batches; schedules; retries; digests
-- without PHI; in-app notifications", acceptance "a digest contains counts and totals only"; PRD 8,
-- job and job_run, notification and digest: "counts and totals only; no PHI field exists on the
-- table"; PRD 15, Stack: "SES; links only, never PHI in a body"; PRD 19, Monitoring and alerts; Data
-- dictionary, Operations; test matrix JOB-01 to JOB-04; docs/adr/0039).
--
-- - job_run takes the job types the worker now runs: monitor (the chain's planning step, which creates
--   a month's pricing run under the release in force) and audit_report (milestone 6's report job,
--   which the check left out).
-- - pricing_run: a run the monitoring chain creates is created by its job, not by a person:
--   created_by becomes nullable beside created_by_job_id (the job's ID, its actor), exactly one of the
--   two is set, a job creates first runs only, and nobody creates a run in another's name (a person in
--   their own, a job in its own). The trigger keeps the creator fixed, as before.
-- - "user".settings: the user's own settings; notification preferences live under "notifications"
--   ({"digest_email": bool, "in_app": bool}, both on unless the user turns one off).
-- - notification (in-app) and digest (the monthly email's record): practice_id, opaque IDs, codes,
--   counts jsonb and totals_cents jsonb, timestamps. No text column that a person or a document fills
--   exists on either table, and the CHECKs refuse any figure that is not a count (a JSON integer) or
--   integer cents (digits as text), keyed by codes or opaque IDs: nothing a patient could be identified
--   by fits. Both are registered tenant tables with the forced tenant policy, like job_run.
-- - practice_notification_recipients(): for a practice job, in its one practice, the people who reach
--   the practice now (its group's customer roles, or a grant in force), with their preferences;
--   operator_active_practice_ids(): for the operator's daily schedule, the active practices' IDs only.
--
-- Runs as tp_owner. Safe with the previous image running: new nullable columns, a column made
-- nullable, new tables and functions; the previous image writes a person's run exactly as before.

-- ---------------------------------------------------------------------------------------------------
-- job_run: the job types the worker runs
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE job_run DROP CONSTRAINT job_run_job_type_check;
ALTER TABLE job_run ADD CONSTRAINT job_run_job_type_check
  CHECK (job_type IN ('intake', 'parse_835', 'monitor', 'price', 'triage', 'audit_report', 'reconcile', 'digest', 'export'));

-- ---------------------------------------------------------------------------------------------------
-- Pricing runs created by the monitoring chain
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE pricing_run
  ALTER COLUMN created_by DROP NOT NULL,
  -- The monitor job that created the run (its pg-boss job ID, the actor of its transactions).
  ADD COLUMN created_by_job_id uuid,
  ADD CONSTRAINT pricing_run_one_creator CHECK ((created_by IS NULL) <> (created_by_job_id IS NULL)),
  ADD CONSTRAINT pricing_run_job_creates_first_runs CHECK (created_by_job_id IS NULL OR rerun_of_id IS NULL);
-- The monitor job's question: is this month already priced up to its newest line?
CREATE INDEX pricing_run_by_period ON pricing_run (practice_id, period_from, period_to);

-- Nobody creates a run in another's name: a person in their own; a job (an actor that is not a
-- person) in its own.
DROP POLICY pricing_run_created_by_actor ON pricing_run;
CREATE POLICY pricing_run_created_by_actor ON pricing_run AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (
    (created_by = app_actor_id() AND created_by_job_id IS NULL)
    OR (created_by IS NULL AND created_by_job_id = app_actor_id() AND NOT (SELECT app_actor_is_person()))
  );
GRANT INSERT (created_by_job_id) ON pricing_run TO tp_app;

-- As before (20261019150000_reruns_and_release_withdrawal.sql), with the job that created a run kept
-- as fixed as the person who did.
CREATE OR REPLACE FUNCTION pricing_run_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  lines bigint;
  original record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a pricing run is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.coverage IS NOT NULL OR NEW.completed_at IS NOT NULL OR NEW.failure_code IS NOT NULL
       OR NEW.accepted_by IS NOT NULL OR NEW.accepted_at IS NOT NULL THEN
      RAISE EXCEPTION 'a pricing run starts queued' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.release_no IS DISTINCT FROM current_rule_release() THEN
      RAISE EXCEPTION 'rule-release mismatch: a pricing run pins the newest published rule release' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.rerun_of_id IS NOT NULL THEN
      -- Under the caller's policies: a run of another practice is not found.
      SELECT r.practice_id, r.status, r.period_from, r.period_to, coalesce(r.lines_loaded_by, r.created_at) AS cut_off
        INTO original FROM pricing_run r WHERE r.id = NEW.rerun_of_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF original.practice_id <> NEW.practice_id OR original.status <> 'complete' THEN
        RAISE EXCEPTION 'a re-run prices a complete run of its own practice again' USING ERRCODE = 'check_violation';
      END IF;
      IF (original.period_from, original.period_to, original.cut_off) IS DISTINCT FROM (NEW.period_from, NEW.period_to, NEW.lines_loaded_by) THEN
        RAISE EXCEPTION 'a re-run prices the period and the lines of the run it prices again' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period_from, NEW.period_to, NEW.release_no, NEW.engine_version, NEW.created_by, NEW.created_by_job_id, NEW.created_at, NEW.rerun_of_id, NEW.lines_loaded_by)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period_from, OLD.period_to, OLD.release_no, OLD.engine_version, OLD.created_by, OLD.created_by_job_id, OLD.created_at, OLD.rerun_of_id, OLD.lines_loaded_by) THEN
    RAISE EXCEPTION 'a pricing run''s practice, period, release, engine, creator and the run it prices again never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status IN ('complete', 'failed') THEN
    -- The one step a complete run takes: a person accepts a re-run, once (J17).
    IF OLD.status = 'complete' AND OLD.rerun_of_id IS NOT NULL AND OLD.accepted_at IS NULL AND NEW.accepted_at IS NOT NULL
       AND (NEW.status, NEW.coverage, NEW.failure_code, NEW.completed_at) IS NOT DISTINCT FROM (OLD.status, OLD.coverage, OLD.failure_code, OLD.completed_at) THEN
      IF NEW.accepted_at IS DISTINCT FROM now() OR NEW.accepted_by IS DISTINCT FROM app_actor_id() THEN
        RAISE EXCEPTION 'a re-run is accepted by the person acting, when they accept it' USING ERRCODE = 'check_violation';
      END IF;
      IF EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = OLD.release_no) THEN
        RAISE EXCEPTION 'a re-run pinned to a withdrawn rule release is never accepted; re-run it under the release in force' USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'a pricing run never changes once it is complete or failed; a new release or mapping means a new run' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.accepted_by, NEW.accepted_at) IS DISTINCT FROM (OLD.accepted_by, OLD.accepted_at) THEN
    RAISE EXCEPTION 'only a complete re-run is accepted' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'running' AND OLD.status = 'queued' OR NEW.status = OLD.status THEN
    IF (NEW.coverage, NEW.completed_at, NEW.failure_code) IS DISTINCT FROM (OLD.coverage, OLD.completed_at, OLD.failure_code) THEN
      RAISE EXCEPTION 'an open pricing run records its coverage when it completes and its failure when it fails' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'complete' THEN
    IF NEW.completed_at IS DISTINCT FROM now() THEN
      RAISE EXCEPTION 'a pricing run''s completion records the time it completed' USING ERRCODE = 'check_violation';
    END IF;
    SELECT count(*) INTO lines FROM priced_line p WHERE p.pricing_run_id = NEW.id;
    IF (NEW.coverage ->> 'lines') IS DISTINCT FROM lines::text THEN
      RAISE EXCEPTION 'a complete pricing run''s coverage counts exactly the lines it priced' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'failed' THEN
    IF EXISTS (SELECT 1 FROM priced_line p WHERE p.pricing_run_id = NEW.id) THEN
      RAISE EXCEPTION 'a failed pricing run holds no priced lines' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    RAISE EXCEPTION 'a pricing run moves queued, running, then complete or failed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- The user's own settings: notification preferences
-- ---------------------------------------------------------------------------------------------------

-- {} or {"notifications": {"digest_email": true|false, "in_app": true|false}} (either key may be left
-- out: on). Nothing else, so no text a person types is kept here.
CREATE FUNCTION user_settings_valid(settings jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT jsonb_typeof(settings) = 'object'
     AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(settings) k WHERE k <> 'notifications')
     AND (NOT settings ? 'notifications' OR (
           jsonb_typeof(settings -> 'notifications') = 'object'
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_each(settings -> 'notifications') e
              WHERE e.key NOT IN ('digest_email', 'in_app') OR jsonb_typeof(e.value) <> 'boolean')))
$$;

ALTER TABLE "user" ADD COLUMN settings jsonb NOT NULL DEFAULT '{}' CONSTRAINT user_settings_valid CHECK (user_settings_valid(settings));
-- A user sets their own (the self update policy); a platform administrator may too.
GRANT UPDATE (settings) ON "user" TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- Counts and totals only
-- ---------------------------------------------------------------------------------------------------

-- A figure: a count is a JSON integer (0 or more); cents are an integer as text (the house rule: no
-- float on an amount, so never a JSON number).
CREATE FUNCTION monitoring_figure_valid(figure jsonb, leaf text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT CASE leaf
    WHEN 'count' THEN jsonb_typeof(figure) = 'number' AND (figure #>> '{}') ~ '^(0|[1-9][0-9]{0,17})$'
    WHEN 'cents' THEN jsonb_typeof(figure) = 'string' AND (figure #>> '{}') ~ '^-?(0|[1-9][0-9]{0,17})$'
    ELSE false
  END
$$;

-- An object of figures keyed by codes (snake_case), whose values are figures or one level of figures
-- keyed by codes or opaque IDs (a payer's, for "by payer"). Nothing else fits: no text, no name.
CREATE FUNCTION monitoring_figures_valid(figures jsonb, leaf text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  item record;
  inner_item record;
BEGIN
  IF figures IS NULL OR jsonb_typeof(figures) <> 'object' THEN
    RETURN false;
  END IF;
  FOR item IN SELECT e.key, e.value FROM jsonb_each(figures) e LOOP
    IF item.key !~ '^[a-z][a-z0-9_]{0,63}$' THEN
      RETURN false;
    END IF;
    IF jsonb_typeof(item.value) = 'object' THEN
      FOR inner_item IN SELECT e.key, e.value FROM jsonb_each(item.value) e LOOP
        IF inner_item.key !~ '^([a-z][a-z0-9_]{0,63}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'
           OR NOT monitoring_figure_valid(inner_item.value, leaf) THEN
          RETURN false;
        END IF;
      END LOOP;
    ELSIF NOT monitoring_figure_valid(item.value, leaf) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE FUNCTION figures_are_counts(figures jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT monitoring_figures_valid(figures, 'count')
$$;

CREATE FUNCTION figures_are_cents(figures jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT monitoring_figures_valid(figures, 'cents')
$$;

-- ---------------------------------------------------------------------------------------------------
-- Who is told: the people who reach a practice now
-- ---------------------------------------------------------------------------------------------------

-- Whether a user reaches a practice right now the way effective_practice_access() would let them: an
-- active user with MFA, not internal, through a current customer membership of the practice's group or
-- a grant in force whose scope holds their role. Support grants never count: support is not told.
-- Answers only for a practice in the caller's scope (false otherwise), so it says nothing elsewhere.
CREATE FUNCTION user_reaches_practice_now(target_user uuid, target_practice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce(target_practice = ANY (current_setting('app.practice_ids', true)::uuid[]), false)
     AND EXISTS (
       SELECT 1 FROM "user" u JOIN practice p ON p.id = target_practice
        WHERE u.id = target_user AND u.status = 'active' AND u.mfa_enrolled AND p.status = 'active' AND NOT user_is_internal(u.id)
          AND (
            EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
                     WHERE m.user_id = u.id AND o.id = p.organization_id AND o.kind = 'group'
                       AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer') AND (m.ends_at IS NULL OR m.ends_at > now()))
            OR EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "grant" g ON g.organization_id = o.id
                        WHERE m.user_id = u.id AND g.practice_id = p.id AND o.kind IN ('group', 'firm')
                          AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at AND g.scope -> 'roles' ? m.role
                          AND (m.ends_at IS NULL OR m.ends_at > now()))
          ))
$$;

-- For a practice job only, in its one practice: who is told, with their preferences (both on unless
-- turned off). A person's request is refused: people do not list each other's addresses.
CREATE FUNCTION practice_notification_recipients() RETURNS TABLE (user_id uuid, email text, digest_email boolean, in_app boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  scope uuid[] := coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]);
BEGIN
  IF cardinality(scope) <> 1 OR app_actor_id() IS NULL OR app_actor_is_person() THEN
    RAISE EXCEPTION 'notification recipients are read by a practice job, in its one practice' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email,
           coalesce((u.settings -> 'notifications' ->> 'digest_email')::boolean, true),
           coalesce((u.settings -> 'notifications' ->> 'in_app')::boolean, true)
      FROM "user" u
     WHERE user_reaches_practice_now(u.id, scope[1])
     ORDER BY lower(u.email), u.id;
END;
$$;

-- The operator's daily schedule: the active practices, IDs only (one monitoring job and one digest job
-- are queued for each, each its own practice's job).
CREATE FUNCTION operator_active_practice_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id FROM practice p WHERE p.status = 'active' ORDER BY p.id
$$;

-- ---------------------------------------------------------------------------------------------------
-- notification: in-app, one per person, kind and subject
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- Who is told.
  user_id uuid NOT NULL REFERENCES "user" (id),
  -- monitoring_run: a run the monitoring chain priced and triaged; digest: the month's digest.
  kind text NOT NULL CHECK (kind IN ('monitoring_run', 'digest')),
  -- What it is about, as an opaque ID: the pricing run or the digest.
  subject_id uuid NOT NULL,
  counts jsonb NOT NULL CONSTRAINT notification_counts_only CHECK (figures_are_counts(counts)),
  totals_cents jsonb NOT NULL CONSTRAINT notification_totals_only CHECK (figures_are_cents(totals_cents)),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_once UNIQUE (user_id, kind, subject_id)
);
CREATE INDEX notification_by_practice ON notification (practice_id, user_id, created_at DESC, id);

-- ---------------------------------------------------------------------------------------------------
-- digest: the month's email digest, one per practice and month
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE digest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- The calendar month (UTC) it reports on.
  period text NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  counts jsonb NOT NULL CONSTRAINT digest_counts_only CHECK (figures_are_counts(counts)),
  totals_cents jsonb NOT NULL CONSTRAINT digest_totals_only CHECK (figures_are_cents(totals_cents)),
  -- When its email went out; its figures were fixed when it was recorded.
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digest_once UNIQUE (practice_id, period)
);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('notification', '20261020090000_monitoring_digests_notifications', 'notification_tenant'),
  ('digest', '20261020090000_monitoring_digests_notifications', 'digest_tenant');

CREATE TRIGGER notification_updated_at BEFORE UPDATE ON notification FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER digest_updated_at BEFORE UPDATE ON digest FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A notification is read once: read_at is set to the time it was read and never changes again; nothing
-- else ever changes, and it is never deleted.
CREATE FUNCTION notification_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a notification is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.user_id, NEW.kind, NEW.subject_id, NEW.counts, NEW.totals_cents, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.user_id, OLD.kind, OLD.subject_id, OLD.counts, OLD.totals_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a notification never changes; only when it was read is recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'a notification is read once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.read_at IS NULL AND NEW.read_at IS NOT NULL AND NEW.read_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a notification records the time it was read' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER notification_rules BEFORE UPDATE OR DELETE ON notification FOR EACH ROW EXECUTE FUNCTION notification_rules();

-- A digest's figures are fixed when it is recorded; it is sent once (sent_at set to the time it went
-- out), and it is never deleted.
CREATE FUNCTION digest_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a digest is never deleted' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'a digest is recorded before it is sent' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.period, NEW.counts, NEW.totals_cents, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.period, OLD.counts, OLD.totals_cents, OLD.created_at) THEN
    RAISE EXCEPTION 'a digest''s figures never change once recorded' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
    RAISE EXCEPTION 'a digest is sent once' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sent_at IS NULL AND NEW.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM now() THEN
    RAISE EXCEPTION 'a digest records the time it was sent' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER digest_rules BEFORE INSERT OR UPDATE OR DELETE ON digest FOR EACH ROW EXECUTE FUNCTION digest_rules();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_tenant ON notification
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- A person reads and marks only their own notifications; a practice job (the actor is not a person)
-- reads its practice's, as its INSERT ... ON CONFLICT DO NOTHING needs to.
CREATE POLICY notification_recipient_reads ON notification AS RESTRICTIVE FOR SELECT TO tp_app
  USING (user_id = app_actor_id() OR NOT (SELECT app_actor_is_person()));
CREATE POLICY notification_recipient_marks ON notification AS RESTRICTIVE FOR UPDATE TO tp_app
  USING (user_id = app_actor_id())
  WITH CHECK (user_id = app_actor_id());
-- A person writes only their own; a job tells only people who reach the practice now.
CREATE POLICY notification_written_for ON notification AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (
    user_id = app_actor_id()
    OR (NOT (SELECT app_actor_is_person()) AND coalesce(user_reaches_practice_now(user_id, practice_id), false))
  );

ALTER TABLE digest ENABLE ROW LEVEL SECURITY;
ALTER TABLE digest FORCE ROW LEVEL SECURITY;
CREATE POLICY digest_tenant ON digest
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

-- ---------------------------------------------------------------------------------------------------
-- Privileges: the digest job records a digest and marks it sent; jobs insert notifications and their
-- recipients mark them read. Nobody updates anything else or deletes either.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON notification, digest FROM PUBLIC;
GRANT SELECT ON notification, digest TO tp_app;
GRANT INSERT (id, practice_id, user_id, kind, subject_id, counts, totals_cents) ON notification TO tp_app;
GRANT UPDATE (read_at) ON notification TO tp_app;
GRANT INSERT (id, practice_id, period, counts, totals_cents) ON digest TO tp_app;
GRANT UPDATE (sent_at) ON digest TO tp_app;

REVOKE ALL ON FUNCTION
  user_settings_valid(jsonb), monitoring_figure_valid(jsonb, text), monitoring_figures_valid(jsonb, text), figures_are_counts(jsonb), figures_are_cents(jsonb),
  user_reaches_practice_now(uuid, uuid), practice_notification_recipients(), operator_active_practice_ids(), notification_rules(), digest_rules()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  user_settings_valid(jsonb), monitoring_figure_valid(jsonb, text), monitoring_figures_valid(jsonb, text), figures_are_counts(jsonb), figures_are_cents(jsonb),
  user_reaches_practice_now(uuid, uuid), practice_notification_recipients()
TO tp_app;
GRANT EXECUTE ON FUNCTION operator_active_practice_ids() TO tp_operator;
