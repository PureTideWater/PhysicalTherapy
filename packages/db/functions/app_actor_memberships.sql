-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- app_actor_memberships()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 236b8f478ee6b790
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.app_actor_memberships()
 RETURNS TABLE(organization_id uuid, organization_kind text, role text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT m.organization_id, o.kind, m.role
    FROM membership m
    JOIN "user" u ON u.id = m.user_id
    JOIN organization o ON o.id = m.organization_id
   WHERE m.user_id = app_actor_id()
     AND u.status = 'active' AND u.mfa_enrolled
     AND (m.ends_at IS NULL OR m.ends_at > now())
$function$;
ALTER FUNCTION public.app_actor_memberships() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.app_actor_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_actor_memberships() TO tp_app;
