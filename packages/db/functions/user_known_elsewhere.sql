-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_known_elsewhere(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 35d6cc736c81cd02
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.user_known_elsewhere(target_user uuid, target_organization uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (SELECT 1 FROM membership m WHERE m.user_id = target_user AND m.organization_id <> target_organization)
$function$;
ALTER FUNCTION public.user_known_elsewhere(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_known_elsewhere(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_known_elsewhere(uuid,uuid) TO tp_app;
