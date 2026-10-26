-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- triage_never_deleted()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: df21aee8f11b5734
-- Trigger function of: anomaly.anomaly_never_deleted
-- Trigger function of: audit_report.audit_report_never_deleted
-- Trigger function of: audit_report_download.audit_report_download_never_deleted
-- Trigger function of: case.case_never_deleted
-- Trigger function of: case_line.case_line_never_deleted
-- Trigger function of: line_status.line_status_never_deleted
CREATE OR REPLACE FUNCTION public.triage_never_deleted()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% rows are never deleted: triage, cases and reports keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.triage_never_deleted() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.triage_never_deleted() FROM PUBLIC;
