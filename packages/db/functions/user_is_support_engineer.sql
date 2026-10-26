-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_is_support_engineer(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: feeb17d9d1c34e9d
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.user_is_support_engineer(target_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
     WHERE m.user_id = target_user AND o.kind = 'internal' AND m.role = 'support'
       AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status = 'active' AND u.mfa_enrolled
  )
$function$;
ALTER FUNCTION public.user_is_support_engineer(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_is_support_engineer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_is_support_engineer(uuid) TO tp_app;
