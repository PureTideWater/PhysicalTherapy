-- What a run diff compares, and which run an audit report reads (PRD 5, J17: "a re-run under the new
-- release lists exactly which lines would change before anyone accepts it"; PRD 9, The release
-- pipeline step 4; PRD 11 steps 8 and 9: the dispute deadline and the trace; test matrix PRC-19,
-- MAP-03; docs/adr/0037 and 0038).
--
-- - pricing_run_changed_lines(before, after): a line also changes when its dispute window's last day,
--   the review flags its trace reports, or the mapping, contract version or rate record that priced it
--   differ, beside its expected allowed, unpriced reason and adjustments applied (and a line one run
--   priced and the other did not, as before). A re-run that moves windows (which decide whether a line
--   is actionable) or raises or clears an NCCI review flag lists those lines before anyone accepts it.
-- - pricing_run_in_effect(run): the run in effect for its period: complete, a first run or an
--   accepted re-run, and no such run of the same practice and period took effect after it (an
--   accepted re-run when it was accepted, a first run when it completed). Under the caller's policies.
-- - An audit report is requested of the run in effect for its period, and generated (made ready) only
--   while that run is still in effect: never of a re-run nobody has accepted, nor of a run an accepted
--   re-run (or a later first run of the same period) has replaced. A ready report stays as generated.
--
-- Runs as tp_owner. Safe with the previous image running: the functions keep their signatures and
-- grants; the previous image requests reports of complete runs, and a request of a run not in effect
-- is refused where it was accepted before (the screens offered any complete run).

-- ---------------------------------------------------------------------------------------------------
-- The lines two runs price differently
-- ---------------------------------------------------------------------------------------------------

-- As before (20261019150000_reruns_and_release_withdrawal.sql), and the window's last day, the trace's
-- review flags (none on an unpriced line) and the terms that priced the line. Read under the caller's
-- policies.
CREATE OR REPLACE FUNCTION pricing_run_changed_lines(before_run uuid, after_run uuid) RETURNS bigint LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT count(*)
    FROM (SELECT * FROM priced_line WHERE pricing_run_id = before_run) a
    FULL JOIN (SELECT * FROM priced_line WHERE pricing_run_id = after_run) b ON b.service_line_id = a.service_line_id
   WHERE a.id IS NULL OR b.id IS NULL
      OR a.expected_allowed_cents IS DISTINCT FROM b.expected_allowed_cents
      OR a.unpriced_reason IS DISTINCT FROM b.unpriced_reason
      OR a.adjustments_applied IS DISTINCT FROM b.adjustments_applied
      OR a.window_ends_on IS DISTINCT FROM b.window_ends_on
      OR coalesce(a.trace #> '{outcome,review_flags}', '[]'::jsonb) IS DISTINCT FROM coalesce(b.trace #> '{outcome,review_flags}', '[]'::jsonb)
      OR a.mapping_id IS DISTINCT FROM b.mapping_id
      OR a.contract_version_id IS DISTINCT FROM b.contract_version_id
      OR a.rate_record_id IS DISTINCT FROM b.rate_record_id
$$;

-- ---------------------------------------------------------------------------------------------------
-- The run in effect for its period
-- ---------------------------------------------------------------------------------------------------

CREATE FUNCTION pricing_run_in_effect(run uuid) RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp AS $$
  SELECT coalesce((
    SELECT r.status = 'complete' AND (r.rerun_of_id IS NULL OR r.accepted_at IS NOT NULL)
           AND NOT EXISTS (
             SELECT 1 FROM pricing_run later
              WHERE later.practice_id = r.practice_id AND later.period_from = r.period_from AND later.period_to = r.period_to
                AND later.status = 'complete' AND (later.rerun_of_id IS NULL OR later.accepted_at IS NOT NULL)
                AND (coalesce(later.accepted_at, later.completed_at), later.id) > (coalesce(r.accepted_at, r.completed_at), r.id))
      FROM pricing_run r WHERE r.id = run), false)
$$;

REVOKE ALL ON FUNCTION pricing_run_in_effect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pricing_run_in_effect(uuid) TO tp_app;

-- ---------------------------------------------------------------------------------------------------
-- Audit reports of the run in effect
-- ---------------------------------------------------------------------------------------------------

-- As before (20261018120000_triage_cases_and_audit_reports.sql), and: the report is of the run in
-- effect for its period when it is requested. An AFTER trigger, so a row of another practice meets the
-- tenant policy first.
CREATE OR REPLACE FUNCTION audit_report_belongs() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pricing_run r WHERE r.id = NEW.pricing_run_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'an audit report is of a pricing run of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT pricing_run_in_effect(NEW.pricing_run_id) THEN
    RAISE EXCEPTION 'an audit report is of the pricing run in effect for its period: never a re-run nobody has accepted, nor a run since replaced' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

-- As before, and: the report job makes a report ready only while its run is still in effect.
CREATE OR REPLACE FUNCTION audit_report_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
      IF NOT pricing_run_in_effect(NEW.pricing_run_id) THEN
        RAISE EXCEPTION 'an audit report is generated only while its pricing run is the run in effect for its period' USING ERRCODE = 'check_violation';
      END IF;
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
