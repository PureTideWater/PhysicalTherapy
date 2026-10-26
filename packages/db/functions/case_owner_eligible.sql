-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_owner_eligible(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b8dacedadc46c5e7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_owner_eligible(target_user uuid, target_practice uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT roles_permit(person_practice_roles(target_user, target_practice), 'case.work')
$function$;
ALTER FUNCTION public.case_owner_eligible(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_owner_eligible(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.case_owner_eligible(uuid,uuid) TO tp_app;
