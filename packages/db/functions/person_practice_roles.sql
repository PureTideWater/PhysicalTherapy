-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- person_practice_roles(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8276436b74bd81b0
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.person_practice_roles(target_user uuid, target_practice uuid)
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(array_agg(DISTINCT r.role), '{}')
    FROM (
      SELECT m.role
        FROM membership m JOIN organization o ON o.id = m.organization_id JOIN practice p ON p.organization_id = o.id
       WHERE m.user_id = target_user AND p.id = target_practice AND o.kind = 'group'
         AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer') AND (m.ends_at IS NULL OR m.ends_at > now())
      UNION ALL
      SELECT m.role
        FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "grant" g ON g.organization_id = o.id
       WHERE m.user_id = target_user AND g.practice_id = target_practice AND o.kind IN ('group', 'firm')
         AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at AND g.scope -> 'roles' ? m.role
         AND (m.ends_at IS NULL OR m.ends_at > now())
    ) r
   WHERE target_practice = ANY (coalesce(nullif(current_setting('app.practice_ids', true), '')::uuid[], '{}'::uuid[]))
     AND EXISTS (SELECT 1 FROM "user" u JOIN practice p ON p.id = target_practice
                  WHERE u.id = target_user AND u.status = 'active' AND u.mfa_enrolled AND p.status = 'active' AND NOT user_is_internal(u.id))
$function$;
ALTER FUNCTION public.person_practice_roles(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.person_practice_roles(uuid,uuid) FROM PUBLIC;
