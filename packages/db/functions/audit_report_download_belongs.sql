-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_report_download_belongs()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1ab1a28f01764be6
-- Trigger function of: audit_report_download.audit_report_download_belongs
CREATE OR REPLACE FUNCTION public.audit_report_download_belongs()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM audit_report r WHERE r.id = NEW.audit_report_id AND r.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a download is of a report of its practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.audit_report_download_belongs() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_report_download_belongs() FROM PUBLIC;
