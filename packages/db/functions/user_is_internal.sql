-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_is_internal(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: de0ae9bc719ff3fd
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_is_internal(target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id
     WHERE m.user_id = target_user AND o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now())
  )
$function$;
ALTER FUNCTION public.user_is_internal(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_is_internal(uuid) FROM PUBLIC;
