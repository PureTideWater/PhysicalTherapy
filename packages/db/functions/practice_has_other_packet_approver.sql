-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_has_other_packet_approver(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d1920a7b04d32ef7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_has_other_packet_approver(target_practice uuid, excluded uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM (SELECT DISTINCT m.user_id
              FROM membership m
             WHERE m.user_id IS DISTINCT FROM excluded
               AND (m.organization_id = (SELECT p.organization_id FROM practice p WHERE p.id = target_practice)
                    OR m.organization_id IN (SELECT g.organization_id FROM "grant" g WHERE g.practice_id = target_practice))) people
     WHERE roles_permit(person_practice_roles(people.user_id, target_practice), 'packet.approve'))
$function$;
ALTER FUNCTION public.practice_has_other_packet_approver(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_has_other_packet_approver(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_has_other_packet_approver(uuid,uuid) TO tp_app;
