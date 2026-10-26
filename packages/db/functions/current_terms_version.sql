-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- current_terms_version()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1f6b0bde64fc4a4b
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.current_terms_version()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT t.id FROM terms_version t WHERE t.published_at <= now() ORDER BY t.published_at DESC, t.id DESC LIMIT 1
$function$;
ALTER FUNCTION public.current_terms_version() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.current_terms_version() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_terms_version() TO tp_app;
