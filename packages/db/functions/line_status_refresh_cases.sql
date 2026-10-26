-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_status_refresh_cases()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 02c5548a429bb9c2
-- Trigger function of: line_status.line_status_refresh_cases
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.line_status_refresh_cases()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE "case" c SET updated_at = now()
   WHERE c.id IN (SELECT DISTINCT cl.case_id FROM case_line cl JOIN changed ON changed.service_line_id = cl.service_line_id);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.line_status_refresh_cases() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_status_refresh_cases() FROM PUBLIC;
