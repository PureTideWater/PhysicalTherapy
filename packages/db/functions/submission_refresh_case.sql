-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- submission_refresh_case()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 220ce03d1ea0f31f
-- Trigger function of: submission.submission_refresh_case
CREATE OR REPLACE FUNCTION public.submission_refresh_case()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE "case" c SET updated_at = now() WHERE c.id = NEW.case_id;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.submission_refresh_case() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.submission_refresh_case() FROM PUBLIC;
