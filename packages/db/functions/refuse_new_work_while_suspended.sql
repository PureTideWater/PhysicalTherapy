-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- refuse_new_work_while_suspended()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0a92559e621ef0f0
-- Trigger function of: audit_report.audit_report_refused_while_suspended
-- Trigger function of: digest.digest_refused_while_suspended
-- Trigger function of: packet_version.packet_version_export_refused_while_suspended
-- Trigger function of: pricing_run.pricing_run_refused_while_suspended
-- Trigger function of: report_document.report_document_refused_while_suspended
-- Trigger function of: roi_statement.roi_statement_refused_while_suspended
-- Trigger function of: source_document.source_document_refused_while_suspended
CREATE OR REPLACE FUNCTION public.refuse_new_work_while_suspended()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  reason text;
BEGIN
  SELECT organization_run_refusal(p.organization_id) INTO reason FROM practice p WHERE p.id = NEW.practice_id AND p.organization_id IS NOT NULL;
  IF reason IS NOT NULL THEN
    RAISE EXCEPTION '%', reason USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.refuse_new_work_while_suspended() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.refuse_new_work_while_suspended() FROM PUBLIC;
