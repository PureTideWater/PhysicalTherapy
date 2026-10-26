-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_line_refresh_cases()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: bcffaf3b76e2a516
-- Trigger function of: case_line.case_line_refresh_inserted
-- Trigger function of: case_line.case_line_refresh_updated
CREATE OR REPLACE FUNCTION public.case_line_refresh_cases()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id IN (SELECT DISTINCT changed.case_id FROM changed);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.case_line_refresh_cases() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_line_refresh_cases() FROM PUBLIC;
