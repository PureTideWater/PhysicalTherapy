-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_grant_role(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 23e71bc2ce447f8c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_grant_role(target_user uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT min(m.role)
    FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
   WHERE m.user_id = target_user AND o.kind = 'internal' AND m.role IN ('support', 'contract_specialist', 'reviewer')
     AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active' AND u.mfa_enrolled
$function$;
ALTER FUNCTION public.support_grant_role(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_grant_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.support_grant_role(uuid) TO tp_app;
