-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- effective_practice_access()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 53666b6ed9d54a7f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.effective_practice_access()
 RETURNS TABLE(practice_id uuid, via text, grant_id uuid, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id, 'ownership', NULL::uuid, m.role
    FROM app_actor_memberships() m
    JOIN practice p ON p.organization_id = m.organization_id
   WHERE m.organization_kind = 'group' AND m.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer')
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT g.practice_id, 'grant', g.id, m.role
    FROM app_actor_memberships() m
    JOIN "grant" g ON g.organization_id = m.organization_id
   WHERE m.organization_kind IN ('group', 'firm')
     AND g.revoked_at IS NULL AND g.starts_at <= now() AND now() < g.ends_at
     AND g.scope -> 'roles' ? m.role
     AND NOT user_is_internal(app_actor_id())
  UNION ALL
  SELECT s.practice_id, 'support', s.id, m.role
    FROM support_grant s
    JOIN app_actor_memberships() m ON m.organization_kind = 'internal' AND m.role IN ('support', 'contract_specialist', 'reviewer')
   WHERE s.user_id = app_actor_id()
     AND s.created_at <= now() AND now() < s.expires_at AND now() < s.created_at + interval '4 hours'
$function$;
ALTER FUNCTION public.effective_practice_access() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.effective_practice_access() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_practice_access() TO tp_app;
