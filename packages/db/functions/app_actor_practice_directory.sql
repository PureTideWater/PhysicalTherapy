-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_practice_directory()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 907cf26442af3589
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_practice_directory()
 RETURNS TABLE(practice_id uuid, name text, organization_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.name, p.organization_id
    FROM practice p
   WHERE p.id = ANY (allowed_practice_ids()) AND p.status = 'active'
   ORDER BY p.name, p.id
$function$;
ALTER FUNCTION public.app_actor_practice_directory() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_practice_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_practice_directory() TO tp_app;
