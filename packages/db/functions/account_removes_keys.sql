-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- account_removes_keys(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d5746abb14858be2
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.account_removes_keys(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1
      FROM "user" u
      JOIN membership m ON m.user_id = u.id
      JOIN organization o ON o.id = m.organization_id
     WHERE u.id = target AND u.status = 'active' AND u.mfa_enrolled
       AND o.kind = 'internal' AND m.role = 'platform_admin'
       AND (m.ends_at IS NULL OR m.ends_at > now())
       AND roles_permit(ARRAY[m.role], 'organization.manage')
       AND m.created_at < now() - interval '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM audit_event e
          WHERE e.object_type = 'membership' AND e.object_id = m.id AND e.action = 'security_event' AND e.actor_kind = 'system'
            AND e.purpose = 'role_escalation' AND e.at > now() - interval '7 days'))
$function$;
ALTER FUNCTION public.account_removes_keys(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.account_removes_keys(uuid) FROM PUBLIC;
