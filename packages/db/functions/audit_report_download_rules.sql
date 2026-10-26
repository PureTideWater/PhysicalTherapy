-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_report_download_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dcc9fa8b0d88cd5c
-- Trigger function of: audit_report_download.audit_report_download_rules
CREATE OR REPLACE FUNCTION public.audit_report_download_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a download record never changes' USING ERRCODE = 'check_violation';
  END IF;
  NEW.downloaded_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.audit_report_download_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_report_download_rules() FROM PUBLIC;
