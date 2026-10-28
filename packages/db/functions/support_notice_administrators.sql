-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_notice_administrators(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 332bb830b68cf65a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_notice_administrators(target_practice uuid)
 RETURNS TABLE(user_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT m.user_id FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = target_practice AND m.role = 'practice_admin' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
$function$;
ALTER FUNCTION public.support_notice_administrators(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_notice_administrators(uuid) FROM PUBLIC;
