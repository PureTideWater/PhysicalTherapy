-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- organization_administrator_count(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 45fcaf44bc28ae33
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.organization_administrator_count(target_organization uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT count(*)
    FROM membership m
    JOIN "user" u ON u.id = m.user_id
   WHERE m.organization_id = target_organization AND m.role = 'practice_admin' AND m.ends_at IS NULL AND u.status <> 'disabled'
$function$;
ALTER FUNCTION public.organization_administrator_count(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.organization_administrator_count(uuid) FROM PUBLIC;
