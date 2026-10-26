-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- triage_no_truncate()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: de1aa557d4a1374d
-- Trigger function of: anomaly.anomaly_no_truncate
-- Trigger function of: audit_report.audit_report_no_truncate
-- Trigger function of: audit_report_download.audit_report_download_no_truncate
-- Trigger function of: case.case_no_truncate
-- Trigger function of: case_activity.case_activity_no_truncate
-- Trigger function of: case_line.case_line_no_truncate
-- Trigger function of: line_status.line_status_no_truncate
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.triage_no_truncate()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  RAISE EXCEPTION '% cannot be truncated: triage, cases and reports keep what they recorded', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END;
$function$;
ALTER FUNCTION public.triage_no_truncate() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.triage_no_truncate() FROM PUBLIC;
