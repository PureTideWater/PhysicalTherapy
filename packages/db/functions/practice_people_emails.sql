-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_people_emails(uuid,uuid[])
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6c4da6036fd47a24
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_people_emails(target_practice uuid, people uuid[])
 RETURNS TABLE(user_id uuid, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT u.id, u.email
    FROM "user" u
   WHERE coalesce(app_actor_permitted(target_practice, 'practice.open'), false)
     AND u.id = ANY (people)
     AND u.id IN (SELECT m.user_id FROM membership m
                   WHERE m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                      OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))
   ORDER BY u.id
$function$;
ALTER FUNCTION public.practice_people_emails(uuid,uuid[]) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_people_emails(uuid,uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_people_emails(uuid,uuid[]) TO tp_app;
