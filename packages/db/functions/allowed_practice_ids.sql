-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- allowed_practice_ids()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: f2ef1aad2276f6cd
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.allowed_practice_ids()
 RETURNS uuid[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT practice_id ORDER BY practice_id), '{}') FROM effective_practice_access()
$function$;
ALTER FUNCTION public.allowed_practice_ids() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.allowed_practice_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allowed_practice_ids() TO tp_app;
