-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- refuse_new_work_while_suspended()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 42cc990d25fe8a4f
-- Trigger function of: audit_report.audit_report_refused_while_suspended
-- Trigger function of: digest.digest_refused_while_suspended
-- Trigger function of: packet_version.packet_version_export_refused_while_suspended
-- Trigger function of: pricing_run.pricing_run_refused_while_suspended
-- Trigger function of: report_document.report_document_refused_while_suspended
-- Trigger function of: roi_statement.roi_statement_refused_while_suspended
-- Trigger function of: source_document.source_document_refused_while_suspended
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.refuse_new_work_while_suspended()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  wanted text;
  reason text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'pricing_run' THEN wanted := 'mapping.edit';
    WHEN 'audit_report', 'report_document' THEN wanted := 'case.work';
    WHEN 'roi_statement' THEN wanted := 'posting.reconcile';
    WHEN 'source_document' THEN wanted := 'file.upload';
    WHEN 'packet_version' THEN wanted := 'phi.export';
    WHEN 'digest' THEN wanted := NULL;  -- only a job writes a digest
    ELSE RAISE EXCEPTION 'refuse_new_work_while_suspended names no permission for %', TG_TABLE_NAME USING ERRCODE = 'internal_error';
  END CASE;
  reason := practice_work_refusal(NEW.practice_id, wanted);
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.refuse_new_work_while_suspended() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.refuse_new_work_while_suspended() FROM PUBLIC;
