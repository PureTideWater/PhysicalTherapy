-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_is_practice_admin(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 358c3cd0bbf46335
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_is_practice_admin(target_practice uuid, target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM practice p
      JOIN membership m ON m.organization_id = p.organization_id
      JOIN "user" u ON u.id = m.user_id
     WHERE p.id = target_practice AND m.user_id = target_user AND m.role = 'practice_admin'
       AND (m.ends_at IS NULL OR m.ends_at > now())
       AND u.status = 'active' AND u.mfa_enrolled
  )
$function$;
ALTER FUNCTION public.user_is_practice_admin(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_is_practice_admin(uuid,uuid) FROM PUBLIC;
