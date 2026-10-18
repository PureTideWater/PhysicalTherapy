-- Triage, the five-stage status model, cases (report-only in v0) and the audit report (PRD 4, Audit v0;
-- PRD 5, J8 and J12; PRD 6, Anomaly screening, Triage and cases, Reports and exports; PRD 7, Anomalies,
-- Cases and Reports; PRD 8, anomaly, line_status, case, The status machine and Invariants; PRD 12;
-- Data dictionary, Pricing, triage and cases; test matrix CAS-01 to CAS-07, PRC-14, PRC-15;
-- docs/adr/0038).
--
-- Six PHI tables, each with practice_id NOT NULL (indexed), ENABLE and FORCE ROW LEVEL SECURITY, the
-- registered tenant policy and a row in phi_table_registry:
--
-- - anomaly: an investigatory cohort of a pricing run's unpriced lines (its key, size, modal observed
--   allowed per unit, distribution and the lines short of the mode). Written once by triage; a person
--   may mark it reviewed and convert it to a validation request, once each. No case or report total
--   ever reads it: nothing references it.
-- - line_status: the stage events of a service line, append-only. The current stage is the latest
--   event. Stages move forward only; a reopen is an explicit event with the stage it reopens from and a
--   reason (the person's words, encrypted with the practice's key), which keeps or lowers the stage.
--   Payer approved and recovered arrive with the recovery ledger (milestone 9): nothing sets them yet.
-- - case: a payer pattern to pursue (pattern key, payer and plan, rate record, owner, the materiality
--   and pursuit-cost estimate it was opened with). Its state, deadline, actionable total and close
--   time are derived here from its lines, whatever writes them: the state is open, or
--   closed_written_off once every line is written off (submissions arrive with milestone 8). One open
--   case per pattern.
-- - case_line: a priced line in a case. A line is in at most one case. It is written off with a reason
--   from the closed list (window passed, payer correct on review, not worth pursuit, duplicate, other
--   with text), which takes it out of the actionable total and leaves it visible; triage writes off a
--   line whose window has passed (window_passed, by the system); a person with case.work writes off and
--   reopens, a reopen with a reason and never for a line past its window.
-- - audit_report: a generated audit report of a complete pricing run: its numbers (content), its PDF
--   and CSV stored as objects with their SHA-256, the triage date it judged windows on, the reviewer's
--   attestation and the release. Written by the report job once; the numbers and files never change
--   (a report generated before a reopen keeps its numbers, CAS-07). It is released only once a
--   reimbursement reviewer has signed the attestation, and released only by a role that works cases.
-- - audit_report_download: every download of a report's files (the export history; line-level
--   exports are logged here and in the audit log).
--
-- One change to earlier rules (docs/adr/0038): a reimbursement reviewer reaches a practice, read-only,
-- through a support grant, as a support engineer and a contract specialist do (ADR 0028), holding the
-- reviewer role there; support_grant_role() and effective_practice_access() name it.
--
-- Runs as tp_owner. Safe with the previous image running: new tables and functions; the previous
-- image neither reads nor writes them, and a support grant to a reviewer is new.

-- ---------------------------------------------------------------------------------------------------
-- The reviewer's path into a practice: a support grant.
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION support_grant_role(target_user uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT min(m.role)
    FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
   WHERE m.user_id = target_user AND o.kind = 'internal' AND m.role IN ('support', 'contract_specialist', 'reviewer')
     AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active' AND u.mfa_enrolled
$$;

CREATE OR REPLACE FUNCTION support_grant_grantee() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT pg_has_role(current_user, 'tp_owner', 'USAGE') AND NEW.user_id = app_actor_id() THEN
    RAISE EXCEPTION 'nobody grants themselves support access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF support_grant_role(NEW.user_id) IS NULL THEN
    RAISE EXCEPTION 'a support grant goes to a support engineer, a contract specialist or a reimbursement reviewer with a current role' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- As before, except that the support route carries the reviewer role for a reimbursement reviewer.
CREATE OR REPLACE FUNCTION effective_practice_access() RETURNS TABLE (practice_id uuid, via text, grant_id uuid, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT p.id, 'ownership', NULL::uuid, m.role
    FROM app_actor_memberships() m
    JOIN practice p ON p.organization_id = m.organization_id
   WHERE m.organization_kind = 'group' AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer')
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT g.practice_id, 'grant', g.id, m.role
    FROM app_actor_memberships() m
    JOIN "grant" g ON g.organization_id = m.organization_id
   WHERE m.organization_kind IN ('group', 'firm')
     AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at
     AND g.scope -> 'roles' ? m.role
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT s.practice_id, 'support', s.id, m.role
    FROM support_grant s
    JOIN app_actor_memberships() m ON m.organization_kind = 'internal' AND m.role IN ('support', 'contract_specialist', 'reviewer')
   WHERE s.user_id = app_actor_id()
     AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours'
$$;

-- Whether the transaction's actor is a person (a user) rather than a job: jobs act as their job ID.
CREATE FUNCTION app_actor_is_person() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM "user" u WHERE u.id = app_actor_id())
$$;

-- A line stage's place in the order (PRD 8): flagged 1 ... recovered 5.
CREATE FUNCTION line_stage_rank(stage text) RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT array_position(ARRAY['flagged', 'validated', 'actionable', 'payer_approved', 'recovered'], stage)
$$;

-- ---------------------------------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------------------------------

CREATE TABLE anomaly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  pricing_run_id uuid NOT NULL REFERENCES pricing_run (id),
  -- {"payer_id", "plan_id", "procedure_code", "modifiers", "place_of_service", "quarter"}.
  cohort_key jsonb NOT NULL CHECK (jsonb_typeof(cohort_key) = 'object'),
  cohort_size integer NOT NULL CHECK (cohort_size >= 1),
  -- The modal observed allowed per unit.
  modal_allowed_cents bigint NOT NULL CHECK (modal_allowed_cents >= 0),
  -- tp-anomaly-stats/1: the distribution, the threshold, the counts and the investigatory range.
  stats jsonb NOT NULL CHECK (jsonb_typeof(stats) = 'object'),
  -- The service lines short of the mode by more than the threshold.
  line_ids uuid[] NOT NULL CHECK (array_position(line_ids, NULL) IS NULL AND cardinality(line_ids) <= cohort_size),
  reviewed_by uuid REFERENCES "user" (id),
  reviewed_at timestamptz,
  validation_requested_by uuid REFERENCES "user" (id),
  validation_requested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anomaly_once UNIQUE (pricing_run_id, cohort_key),
  CONSTRAINT anomaly_reviewed_together CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT anomaly_validation_together CHECK ((validation_requested_by IS NULL) = (validation_requested_at IS NULL))
);
CREATE INDEX anomaly_by_run ON anomaly (practice_id, pricing_run_id);

CREATE TABLE line_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  service_line_id uuid NOT NULL REFERENCES service_line (id),
  -- The order of a line's events.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  stage text NOT NULL CHECK (stage IN ('flagged', 'validated', 'actionable', 'payer_approved', 'recovered')),
  set_at timestamptz NOT NULL DEFAULT now(),
  -- The person who set it; null for triage (a job).
  set_by uuid REFERENCES "user" (id),
  -- Why a line was reopened: the person's words, encrypted with the practice's key (enc). Null on a forward event.
  reason text CHECK (reason IS NULL OR (btrim(reason) <> '' AND char_length(reason) <= 4000)),
  -- The stage a reopen reopened the line from.
  reopened_from text CHECK (reopened_from IN ('flagged', 'validated', 'actionable', 'payer_approved', 'recovered')),
  -- The priced line triage judged the line from (validated and actionable); null otherwise.
  priced_line_id uuid REFERENCES priced_line (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT line_status_reopen_says_why CHECK ((reopened_from IS NULL) = (reason IS NULL))
);
CREATE INDEX line_status_by_line ON line_status (practice_id, service_line_id, seq DESC);

CREATE TABLE "case" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  -- {"payer_id", "plan_id", "mapping_kind", "contract_version_id", "rate_record_id", "behavior"}.
  pattern_key jsonb NOT NULL CHECK (jsonb_typeof(pattern_key) = 'object'),
  payer_id uuid NOT NULL REFERENCES payer (id),
  plan_id uuid NOT NULL REFERENCES plan (id),
  -- Null for a Medicare Advantage non-contracted pattern (priced from the fee schedule).
  rate_record_id uuid REFERENCES rate_record (id),
  -- Assigned in the workbench (milestone 8).
  owner_user_id uuid REFERENCES "user" (id),
  -- Derived from the lines (and, from milestone 8, the submissions); never set by hand except by writing every line off.
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'submitted', 'awaiting_response', 'partially_resolved', 'resolved', 'closed_written_off')),
  -- Derived: the earliest window among the lines not written off.
  deadline_on date,
  -- The case materiality in force when the case was opened.
  materiality_cents bigint NOT NULL CHECK (materiality_cents >= 0),
  -- The pursuit-cost estimate from the practice's settings; null when they are not set.
  pursuit_cost_cents bigint CHECK (pursuit_cost_cents >= 0),
  -- Derived: the sum of the variance of the lines not written off.
  actionable_cents bigint NOT NULL DEFAULT 0 CHECK (actionable_cents >= 0),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_closed_when_closed CHECK ((state = 'closed_written_off') = (closed_at IS NOT NULL))
);
CREATE INDEX case_by_state ON "case" (practice_id, state, deadline_on);
-- One case per pattern while it is open (CAS-03).
CREATE UNIQUE INDEX case_open_pattern ON "case" (practice_id, pattern_key) WHERE state = 'open';

CREATE TABLE case_line (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  case_id uuid NOT NULL REFERENCES "case" (id),
  service_line_id uuid NOT NULL REFERENCES service_line (id),
  -- The priced line (of the run whose triage attached it) whose variance the case asks for.
  priced_line_id uuid NOT NULL REFERENCES priced_line (id),
  -- Set here: whether the line counts toward the case's actionable total (it is not written off).
  actionable boolean NOT NULL DEFAULT true,
  written_off_reason text CHECK (written_off_reason IN ('window_passed', 'payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other')),
  -- For "other": the person's words, encrypted with the practice's key (enc).
  written_off_text text CHECK (written_off_text IS NULL OR (btrim(written_off_text) <> '' AND char_length(written_off_text) <= 4000)),
  -- The person who wrote it off; null when triage wrote it off because its window passed.
  written_off_by uuid REFERENCES "user" (id),
  written_off_at timestamptz,
  -- The last reopen: who, when, and why (encrypted, enc).
  reopen_reason text CHECK (reopen_reason IS NULL OR (btrim(reopen_reason) <> '' AND char_length(reopen_reason) <= 4000)),
  reopened_by uuid REFERENCES "user" (id),
  reopened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A line is in at most one case.
  CONSTRAINT case_line_once UNIQUE (service_line_id),
  CONSTRAINT case_line_actionable_unless_written_off CHECK (actionable = (written_off_reason IS NULL)),
  CONSTRAINT case_line_written_off_together CHECK (
    (written_off_reason IS NULL) = (written_off_at IS NULL) AND (written_off_reason IS NOT NULL OR (written_off_by IS NULL AND written_off_text IS NULL))
  ),
  CONSTRAINT case_line_other_says_why CHECK ((written_off_reason = 'other') IS NOT DISTINCT FROM (written_off_text IS NOT NULL) OR written_off_reason IS NULL),
  CONSTRAINT case_line_system_writes_off_passed_windows CHECK (written_off_reason IS NULL OR written_off_by IS NOT NULL OR written_off_reason = 'window_passed'),
  CONSTRAINT case_line_reopened_together CHECK ((reopened_at IS NULL) = (reopened_by IS NULL) AND (reopened_at IS NULL) = (reopen_reason IS NULL))
);
CREATE INDEX case_line_by_case ON case_line (practice_id, case_id);

CREATE TABLE audit_report (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  pricing_run_id uuid NOT NULL REFERENCES pricing_run (id),
  requested_by uuid NOT NULL REFERENCES "user" (id),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'ready', 'failed')),
  -- The triage date the report judged windows and deadlines on.
  as_of date,
  -- tp-audit-report/1: every number the report shows, kept as generated.
  content jsonb CHECK (jsonb_typeof(content) = 'object'),
  -- The stored objects (opaque keys: practice, report, object) and the SHA-256 of their plaintext.
  pdf_key text CHECK (pdf_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  pdf_sha256 text CHECK (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  csv_key text CHECK (csv_key ~ '^practices/[0-9a-f-]{36}/reports/[0-9a-f-]{36}/[0-9a-f-]{36}\.csv$'),
  csv_sha256 text CHECK (csv_sha256 ~ '^[0-9a-f]{64}$'),
  generated_at timestamptz,
  failure_code text CHECK (failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  -- The reimbursement reviewer's signed attestation: who, when, the checklist they confirmed and the
  -- SHA-256 of the files they signed over (it names the report's own).
  attested_by uuid REFERENCES "user" (id),
  attested_at timestamptz,
  attestation jsonb CHECK (jsonb_typeof(attestation) = 'object'),
  released_by uuid REFERENCES "user" (id),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT audit_report_ready_with_its_files CHECK (
    (status = 'ready') = (content IS NOT NULL AND as_of IS NOT NULL AND pdf_key IS NOT NULL AND pdf_sha256 IS NOT NULL AND csv_key IS NOT NULL AND csv_sha256 IS NOT NULL AND generated_at IS NOT NULL)
  ),
  CONSTRAINT audit_report_failure_when_failed CHECK ((status = 'failed') = (failure_code IS NOT NULL)),
  CONSTRAINT audit_report_attested_together CHECK ((attested_by IS NULL) = (attested_at IS NULL) AND (attested_at IS NULL) = (attestation IS NULL)),
  CONSTRAINT audit_report_attested_when_ready CHECK (attested_at IS NULL OR status = 'ready'),
  CONSTRAINT audit_report_released_together CHECK ((released_by IS NULL) = (released_at IS NULL)),
  -- The report cannot be released unsigned.
  CONSTRAINT audit_report_released_only_attested CHECK (released_at IS NULL OR attested_at IS NOT NULL)
);
CREATE INDEX audit_report_by_practice ON audit_report (practice_id, created_at DESC, id);

CREATE TABLE audit_report_download (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL REFERENCES practice (id),
  audit_report_id uuid NOT NULL REFERENCES audit_report (id),
  file text NOT NULL CHECK (file IN ('pdf', 'csv')),
  downloaded_by uuid NOT NULL REFERENCES "user" (id),
  downloaded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_report_download_by_report ON audit_report_download (practice_id, audit_report_id, downloaded_at DESC);

INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('anomaly', '20261019160000_triage_cases_and_audit_reports', 'anomaly_tenant'),
  ('line_status', '20261019160000_triage_cases_and_audit_reports', 'line_status_tenant'),
  ('case', '20261019160000_triage_cases_and_audit_reports', 'case_tenant'),
  ('case_line', '20261019160000_triage_cases_and_audit_reports', 'case_line_tenant'),
  ('audit_report', '20261019160000_triage_cases_and_audit_reports', 'audit_report_tenant'),
  ('audit_report_download', '20261019160000_triage_cases_and_audit_reports', 'audit_report_download_tenant');

CREATE TRIGGER anomaly_updated_at BEFORE UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER case_updated_at BEFORE UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER case_line_updated_at BEFORE UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_report_updated_at BEFORE UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------------------------------
-- Rules. Lookups of other rows run under the caller's policies; a row of a practice outside the
-- transaction's scope is left to the tenant policy, which refuses it. They hold for every role.
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION triage_never_deleted() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% rows are never deleted: triage, cases and reports keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;

-- An anomaly is written once by triage for a run of its practice; a person working anomalies marks it
-- reviewed, and converts it to a validation request, once each, in their own name.
CREATE FUNCTION anomaly_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.reviewed_by, NEW.reviewed_at, NEW.validation_requested_by, NEW.validation_requested_at) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::uuid, NULL::timestamptz) THEN
      RAISE EXCEPTION 'an anomaly is recorded unreviewed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pricing_run_id, NEW.cohort_key, NEW.cohort_size, NEW.modal_allowed_cents, NEW.stats, NEW.line_ids, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pricing_run_id, OLD.cohort_key, OLD.cohort_size, OLD.modal_allowed_cents, OLD.stats, OLD.line_ids, OLD.created_at) THEN
    RAISE EXCEPTION 'an anomaly''s cohort and statistics never change' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by THEN
    IF OLD.reviewed_by IS NOT NULL OR NEW.reviewed_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'anomaly.work'), false) THEN
      RAISE EXCEPTION 'an anomaly is marked reviewed once, by a person who works anomalies, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reviewed_at := now();
  ELSIF NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at THEN
    RAISE EXCEPTION 'an anomaly''s review time is the time it was marked reviewed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.validation_requested_by IS DISTINCT FROM OLD.validation_requested_by THEN
    IF OLD.validation_requested_by IS NOT NULL OR NEW.validation_requested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'anomaly.work'), false) THEN
      RAISE EXCEPTION 'an anomaly is converted to a validation request once, by a person who works anomalies, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.validation_requested_at := now();
  ELSIF NEW.validation_requested_at IS DISTINCT FROM OLD.validation_requested_at THEN
    RAISE EXCEPTION 'an anomaly''s validation request time is the time it was requested' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER anomaly_rules BEFORE INSERT OR UPDATE ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_rules();

-- Checks that read other rows run after the row passes its practice's policy (row-level security
-- refuses another practice's row first, and these checks never see it).
CREATE FUNCTION anomaly_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an anomaly is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER anomaly_belongs AFTER INSERT ON anomaly FOR EACH ROW EXECUTE FUNCTION anomaly_belongs();
CREATE TRIGGER anomaly_never_deleted BEFORE DELETE ON anomaly FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();

-- A line's stages move forward only. A reopen names the stage the line is at, keeps or lowers it, says
-- why and is a person's. Payer approved and recovered come from the recovery ledger (milestone 9), so
-- nothing sets them yet. An event is set in its setter's own name (null for triage, a job) and never
-- changes.
CREATE FUNCTION line_status_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  current_stage text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0));
  IF NEW.set_by IS NOT NULL AND NEW.set_by IS DISTINCT FROM app_actor_id() THEN
    RAISE EXCEPTION 'a stage is set in its setter''s own name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.stage IN ('payer_approved', 'recovered') THEN
    RAISE EXCEPTION 'a line is payer approved or recovered only from the recovery ledger (milestone 9)' USING ERRCODE = 'check_violation';
  END IF;
  SELECT s.stage INTO current_stage FROM line_status s WHERE s.service_line_id = NEW.service_line_id ORDER BY s.seq DESC LIMIT 1;
  IF NEW.reopened_from IS NULL THEN
    IF current_stage IS NOT NULL AND line_stage_rank(NEW.stage) <= line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF current_stage IS NULL OR NEW.reopened_from <> current_stage THEN
      RAISE EXCEPTION 'a reopen names the stage the line is at' USING ERRCODE = 'check_violation';
    END IF;
    IF line_stage_rank(NEW.stage) > line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'a reopen keeps the line at its stage or moves it back; moving forward is not a reopen' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.set_by IS NULL THEN
      RAISE EXCEPTION 'a reopen is a person''s explicit action' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.set_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER line_status_rules BEFORE INSERT OR UPDATE ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_rules();

CREATE FUNCTION line_status_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is set on a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.priced_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM priced_line p WHERE p.id = NEW.priced_line_id AND p.service_line_id = NEW.service_line_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a stage is judged from a priced line of its own service line' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER line_status_belongs AFTER INSERT ON line_status FOR EACH ROW EXECUTE FUNCTION line_status_belongs();
CREATE TRIGGER line_status_never_deleted BEFORE DELETE ON line_status FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();

-- A case's derived columns from its lines, whoever writes the case: opened open with nothing in it;
-- then the sum of the variance and the earliest window of its lines not written off, and closed
-- written off (with the time it closed) once every line is written off. Its pattern, payer, plan,
-- rate record, materiality and pursuit estimate never change; its plan is of its payer and practice.
CREATE FUNCTION case_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  totals record;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.state := 'open';
    NEW.actionable_cents := 0;
    NEW.deadline_on := NULL;
    NEW.closed_at := NULL;
    NEW.opened_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pattern_key, NEW.payer_id, NEW.plan_id, NEW.rate_record_id, NEW.materiality_cents, NEW.pursuit_cost_cents, NEW.opened_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pattern_key, OLD.payer_id, OLD.plan_id, OLD.rate_record_id, OLD.materiality_cents, OLD.pursuit_cost_cents, OLD.opened_at, OLD.created_at) THEN
    RAISE EXCEPTION 'a case''s pattern, payer, plan, rate record, materiality and pursuit estimate never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) AS lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL) AS open_lines,
         coalesce(sum(p.variance_cents) FILTER (WHERE c.written_off_reason IS NULL), 0) AS actionable,
         min(p.window_ends_on) FILTER (WHERE c.written_off_reason IS NULL) AS deadline
    INTO totals
    FROM case_line c JOIN priced_line p ON p.id = c.priced_line_id
   WHERE c.case_id = NEW.id;
  NEW.actionable_cents := totals.actionable;
  NEW.deadline_on := totals.deadline;
  IF totals.lines > 0 AND totals.open_lines = 0 THEN
    NEW.state := 'closed_written_off';
    NEW.closed_at := coalesce(OLD.closed_at, now());
  ELSE
    NEW.state := 'open';
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_rules BEFORE INSERT OR UPDATE ON "case" FOR EACH ROW EXECUTE FUNCTION case_rules();

CREATE FUNCTION case_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM plan p WHERE p.id = NEW.plan_id AND p.payer_id = NEW.payer_id AND p.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case is of a plan of its payer and practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.rate_record_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM rate_record r WHERE r.id = NEW.rate_record_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case''s rate record is of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER case_belongs AFTER INSERT ON "case" FOR EACH ROW EXECUTE FUNCTION case_belongs();
CREATE TRIGGER case_never_deleted BEFORE DELETE ON "case" FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();

-- Brings the cases whose lines a statement changed up to date (their derived columns). It runs as the
-- owner, which the application role cannot update the case as, inside the caller's practice scope.
CREATE FUNCTION case_line_refresh_cases() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id IN (SELECT DISTINCT changed.case_id FROM changed);
  RETURN NULL;
END;
$$;

-- A case line prices its own service line in a case of its practice. It joins a case actionable, or
-- written off by triage because its window has passed (the line is shown struck through, J8). A person
-- who works cases writes it off with a reason from the closed list (text for "other"), in their own
-- name; triage, a job, writes off only a line whose window has passed. A person who works cases
-- reopens a written-off line with a reason, never one past its window ("a line past its window cannot
-- be actionable"). Nothing else about a case line changes.
CREATE FUNCTION case_line_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  window_end date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.written_off_text, NEW.written_off_by, NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at) IS DISTINCT FROM (NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::timestamptz)
       OR NEW.written_off_reason IS DISTINCT FROM 'window_passed' AND NEW.written_off_reason IS NOT NULL THEN
      RAISE EXCEPTION 'a case line joins its case actionable, or struck through because its window passed' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := CASE WHEN NEW.written_off_reason IS NULL THEN NULL ELSE now() END;
    NEW.actionable := NEW.written_off_reason IS NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.case_id, NEW.service_line_id, NEW.priced_line_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.case_id, OLD.service_line_id, OLD.priced_line_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a case line''s case, service line and priced line never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.window_ends_on INTO window_end FROM priced_line p WHERE p.id = NEW.priced_line_id;
  IF OLD.written_off_reason IS NULL AND NEW.written_off_reason IS NOT NULL THEN
    IF NEW.written_off_by IS NULL THEN
      IF NEW.written_off_reason <> 'window_passed' OR app_actor_is_person() OR window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION 'triage writes off only a line whose window has passed; a person writes off in their own name' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.written_off_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'a line is written off by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at) IS DISTINCT FROM (OLD.reopen_reason, OLD.reopened_by, OLD.reopened_at) THEN
      RAISE EXCEPTION 'a write-off changes nothing of the line''s last reopen' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := now();
    NEW.actionable := false;
    RETURN NEW;
  END IF;
  IF OLD.written_off_reason IS NOT NULL AND NEW.written_off_reason IS NULL THEN
    IF (NEW.written_off_text, NEW.written_off_by) IS DISTINCT FROM (NULL::text, NULL::uuid) OR NEW.written_off_at IS DISTINCT FROM OLD.written_off_at THEN
      RAISE EXCEPTION 'a reopen clears the whole write-off' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reopened_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'a written-off line is reopened by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.reopen_reason IS NULL OR NEW.reopen_reason IS NOT DISTINCT FROM OLD.reopen_reason THEN
      RAISE EXCEPTION 'a reopen says why, in its own words' USING ERRCODE = 'check_violation';
    END IF;
    IF window_end IS NULL OR window_end < (now() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'a line past its window cannot be actionable, so it is not reopened' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := NULL;
    NEW.reopened_at := now();
    NEW.actionable := true;
    RETURN NEW;
  END IF;
  IF (NEW.actionable, NEW.written_off_reason, NEW.written_off_text, NEW.written_off_by, NEW.written_off_at, NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at)
     IS DISTINCT FROM (OLD.actionable, OLD.written_off_reason, OLD.written_off_text, OLD.written_off_by, OLD.written_off_at, OLD.reopen_reason, OLD.reopened_by, OLD.reopened_at) THEN
    RAISE EXCEPTION 'a case line changes only by a write-off or a reopen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER case_line_rules BEFORE INSERT OR UPDATE ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_rules();

CREATE FUNCTION case_line_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  window_end date;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a case line joins a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.window_ends_on INTO window_end FROM priced_line p WHERE p.id = NEW.priced_line_id AND p.service_line_id = NEW.service_line_id AND p.practice_id = NEW.practice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a case line is a priced line of its own service line and practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.written_off_reason IS NOT NULL AND (app_actor_is_person() OR window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date) THEN
    RAISE EXCEPTION 'a case line joins its case written off only by triage, because its window has passed' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER case_line_belongs AFTER INSERT ON case_line FOR EACH ROW EXECUTE FUNCTION case_line_belongs();
CREATE TRIGGER case_line_never_deleted BEFORE DELETE ON case_line FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();
CREATE TRIGGER case_line_refresh_inserted AFTER INSERT ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases();
CREATE TRIGGER case_line_refresh_updated AFTER UPDATE ON case_line REFERENCING NEW TABLE AS changed FOR EACH STATEMENT EXECUTE FUNCTION case_line_refresh_cases();

-- An audit report is requested queued, in its requester's name. The report job (a job) makes it ready
-- with its numbers, files and hashes, or failed with a code, once; then its numbers and files never
-- change. A reimbursement reviewer (audit_finding.validate on the practice) signs the attestation of
-- the ready report once, in their own name; then a person who works cases releases it, once. Unsigned,
-- it is never released.
CREATE FUNCTION audit_report_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'queued' OR NEW.content IS NOT NULL OR NEW.pdf_key IS NOT NULL OR NEW.csv_key IS NOT NULL OR NEW.attested_by IS NOT NULL OR NEW.released_by IS NOT NULL
       OR NEW.generated_at IS NOT NULL OR NEW.attested_at IS NOT NULL OR NEW.released_at IS NOT NULL OR NEW.failure_code IS NOT NULL THEN
      RAISE EXCEPTION 'an audit report is requested queued' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pricing_run_id, NEW.requested_by, NEW.created_at) IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pricing_run_id, OLD.requested_by, OLD.created_at) THEN
    RAISE EXCEPTION 'an audit report''s practice, run and requester never change' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'queued' AND NEW.status IN ('ready', 'failed') THEN
    IF app_actor_is_person() THEN
      RAISE EXCEPTION 'only the report job generates an audit report' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.attested_by, NEW.attestation, NEW.released_by) IS DISTINCT FROM (NULL::uuid, NULL::jsonb, NULL::uuid) THEN
      RAISE EXCEPTION 'an audit report is generated before it is attested or released' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'ready' THEN
      NEW.generated_at := now();
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     OR (NEW.as_of, NEW.content, NEW.pdf_key, NEW.pdf_sha256, NEW.csv_key, NEW.csv_sha256, NEW.generated_at, NEW.failure_code)
        IS DISTINCT FROM (OLD.as_of, OLD.content, OLD.pdf_key, OLD.pdf_sha256, OLD.csv_key, OLD.csv_sha256, OLD.generated_at, OLD.failure_code) THEN
    RAISE EXCEPTION 'an audit report''s numbers and files never change once generated; a new report is generated instead' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.attested_by, NEW.attestation) IS DISTINCT FROM (OLD.attested_by, OLD.attestation) THEN
    IF OLD.attested_by IS NOT NULL OR OLD.status <> 'ready' THEN
      RAISE EXCEPTION 'a ready audit report is attested once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attested_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'audit_finding.validate'), false) THEN
      RAISE EXCEPTION 'an audit report is attested by a reimbursement reviewer, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.attestation ->> 'pdf_sha256' IS DISTINCT FROM NEW.pdf_sha256 OR NEW.attestation ->> 'csv_sha256' IS DISTINCT FROM NEW.csv_sha256 THEN
      RAISE EXCEPTION 'an attestation names the SHA-256 of the report''s files it was signed over' USING ERRCODE = 'check_violation';
    END IF;
    NEW.attested_at := now();
  ELSIF NEW.attested_at IS DISTINCT FROM OLD.attested_at THEN
    RAISE EXCEPTION 'an attestation''s time is the time it was signed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.released_by IS DISTINCT FROM OLD.released_by THEN
    IF OLD.released_by IS NOT NULL THEN
      RAISE EXCEPTION 'an audit report is released once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.attested_by IS NULL THEN
      RAISE EXCEPTION 'an audit report cannot be released before a reimbursement reviewer signs its attestation' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.released_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'an audit report is released by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.released_at IS DISTINCT FROM OLD.released_at THEN
    RAISE EXCEPTION 'a release''s time is the time it was released' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_report_rules BEFORE INSERT OR UPDATE ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_rules();

CREATE FUNCTION audit_report_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an audit report is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_report_belongs AFTER INSERT ON audit_report FOR EACH ROW EXECUTE FUNCTION audit_report_belongs();
CREATE TRIGGER audit_report_never_deleted BEFORE DELETE ON audit_report FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();

-- A download is recorded once, of a report of its practice (the download routes serve only a ready
-- report's files), and never changes.
CREATE FUNCTION audit_report_download_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a download record never changes' USING ERRCODE = 'check_violation';
  END IF;
  NEW.downloaded_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_report_download_rules BEFORE INSERT OR UPDATE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_rules();

CREATE FUNCTION audit_report_download_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_report r WHERE r.id = NEW.audit_report_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a download is of a report of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER audit_report_download_belongs AFTER INSERT ON audit_report_download FOR EACH ROW EXECUTE FUNCTION audit_report_download_belongs();
CREATE TRIGGER audit_report_download_never_deleted BEFORE DELETE ON audit_report_download FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();

CREATE FUNCTION triage_no_truncate() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: triage, cases and reports keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$$;
CREATE TRIGGER anomaly_no_truncate BEFORE TRUNCATE ON anomaly FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
CREATE TRIGGER line_status_no_truncate BEFORE TRUNCATE ON line_status FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
CREATE TRIGGER case_no_truncate BEFORE TRUNCATE ON "case" FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
CREATE TRIGGER case_line_no_truncate BEFORE TRUNCATE ON case_line FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
CREATE TRIGGER audit_report_no_truncate BEFORE TRUNCATE ON audit_report FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
CREATE TRIGGER audit_report_download_no_truncate BEFORE TRUNCATE ON audit_report_download FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();

-- ---------------------------------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE anomaly ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomaly FORCE ROW LEVEL SECURITY;
CREATE POLICY anomaly_tenant ON anomaly
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE line_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_status FORCE ROW LEVEL SECURITY;
CREATE POLICY line_status_tenant ON line_status
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE "case" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "case" FORCE ROW LEVEL SECURITY;
CREATE POLICY case_tenant ON "case"
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE case_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_line FORCE ROW LEVEL SECURITY;
CREATE POLICY case_line_tenant ON case_line
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));

ALTER TABLE audit_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_report FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_report_tenant ON audit_report
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
-- Nobody requests a report in another person's name.
CREATE POLICY audit_report_requested_by_actor ON audit_report AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (requested_by = app_actor_id());

ALTER TABLE audit_report_download ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_report_download FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_report_download_tenant ON audit_report_download
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE POLICY audit_report_download_by_actor ON audit_report_download AS RESTRICTIVE FOR INSERT TO tp_app
  WITH CHECK (downloaded_by = app_actor_id());

-- ---------------------------------------------------------------------------------------------------
-- Privileges. Triage (the triage job) writes anomalies, stage events, cases and case lines; people
-- review anomalies, write off and reopen case lines, request, attest and release reports; the report
-- job generates them. Nothing is deleted by anyone; a case's derived columns are the database's.
-- ---------------------------------------------------------------------------------------------------

REVOKE ALL ON anomaly, line_status, "case", case_line, audit_report, audit_report_download FROM PUBLIC;
GRANT SELECT ON anomaly, line_status, "case", case_line, audit_report, audit_report_download TO tp_app;
GRANT INSERT (id, practice_id, pricing_run_id, cohort_key, cohort_size, modal_allowed_cents, stats, line_ids) ON anomaly TO tp_app;
GRANT UPDATE (reviewed_by, validation_requested_by) ON anomaly TO tp_app;
GRANT INSERT (id, practice_id, service_line_id, stage, set_by, reason, reopened_from, priced_line_id) ON line_status TO tp_app;
GRANT INSERT (id, practice_id, pattern_key, payer_id, plan_id, rate_record_id, materiality_cents, pursuit_cost_cents) ON "case" TO tp_app;
GRANT INSERT (id, practice_id, case_id, service_line_id, priced_line_id, written_off_reason) ON case_line TO tp_app;
GRANT UPDATE (written_off_reason, written_off_text, written_off_by, reopen_reason, reopened_by) ON case_line TO tp_app;
GRANT INSERT (id, practice_id, pricing_run_id, requested_by) ON audit_report TO tp_app;
GRANT UPDATE (status, as_of, content, pdf_key, pdf_sha256, csv_key, csv_sha256, failure_code, attested_by, attestation, released_by) ON audit_report TO tp_app;
GRANT INSERT (id, practice_id, audit_report_id, file, downloaded_by) ON audit_report_download TO tp_app;

REVOKE ALL ON FUNCTION app_actor_is_person(), line_stage_rank(text), triage_never_deleted(), anomaly_rules(), anomaly_belongs(), line_status_rules(), line_status_belongs(),
  case_rules(), case_belongs(), case_line_refresh_cases(), case_line_rules(), case_line_belongs(), audit_report_rules(), audit_report_belongs(), audit_report_download_rules(),
  audit_report_download_belongs(), triage_no_truncate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_actor_is_person(), line_stage_rank(text) TO tp_app;
