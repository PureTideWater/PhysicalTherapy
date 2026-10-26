-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_response_refresh_case()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b3c23aa01144ad5c
-- Trigger function of: payer_response.payer_response_refresh_case
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.payer_response_refresh_case()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id = (SELECT s.case_id FROM submission s WHERE s.id = NEW.submission_id);
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.payer_response_refresh_case() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_response_refresh_case() FROM PUBLIC;
