-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_reaches_practice_now(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9c88797ed038db3b
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.user_reaches_practice_now(target_user uuid, target_practice uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(target_practice = ANY (current_setting('app.practice_ids', true)::uuid[]), false)
     AND EXISTS (
       SELECT 1 FROM "user" u JOIN practice p ON p.id = target_practice
        WHERE u.id = target_user AND u.status = 'active' AND u.mfa_enrolled AND p.status = 'active' AND NOT user_is_internal(u.id)
          AND (
            EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
                     WHERE m.user_id = u.id AND o.id = p.organization_id AND o.kind = 'group'
                       AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer') AND (m.ends_at IS NULL OR m.ends_at > now()))
            OR EXISTS (SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "grant" g ON g.organization_id = o.id
                        WHERE m.user_id = u.id AND g.practice_id = p.id AND o.kind IN ('group', 'firm')
                          AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at AND g.scope -> 'roles' ? m.role
                          AND (m.ends_at IS NULL OR m.ends_at > now()))
          ))
$function$;
ALTER FUNCTION public.user_reaches_practice_now(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_reaches_practice_now(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_reaches_practice_now(uuid,uuid) TO tp_app;
