-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_report_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 10563903a4f96c71
-- Trigger function of: audit_report.audit_report_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_report_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
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
      IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
        RAISE EXCEPTION 'an audit report is not built on a withdrawn rule release: the report job fails it as release_withdrawn' USING ERRCODE = 'check_violation';
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
    IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
      RAISE EXCEPTION 'an audit report whose rule release was withdrawn since it was generated is not attested; a new report is generated on the release in force' USING ERRCODE = 'check_violation';
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
    IF pricing_run_release_withdrawn(NEW.pricing_run_id) THEN
      RAISE EXCEPTION 'an audit report whose rule release was withdrawn since it was generated is not released; a new report is generated on the release in force' USING ERRCODE = 'check_violation';
    END IF;
    NEW.released_at := now();
  ELSIF NEW.released_at IS DISTINCT FROM OLD.released_at THEN
    RAISE EXCEPTION 'a release''s time is the time it was released' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_report_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_report_rules() FROM PUBLIC;
