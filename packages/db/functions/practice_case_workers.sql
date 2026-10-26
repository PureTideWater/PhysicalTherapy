-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_case_workers(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7a62bdc2457b55fb
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_case_workers(target_practice uuid)
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT u.id, u.email
    FROM "user" u
   WHERE coalesce(app_actor_permitted(target_practice, 'practice.open'), false)
     AND u.id IN (SELECT m.user_id FROM membership m
                   WHERE m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                      OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))
     AND roles_permit(person_practice_roles(u.id, target_practice), 'case.work')
   ORDER BY lower(u.email), u.id
$function$;
ALTER FUNCTION public.practice_case_workers(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_case_workers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_case_workers(uuid) TO tp_app;
