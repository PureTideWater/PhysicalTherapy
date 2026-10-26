-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- practice_grants(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0dfe26d16ca76ef3
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.practice_grants(target_practice uuid)
 RETURNS TABLE(grant_id uuid, grantee_name text, grantee_kind text, roles jsonb, starts_at timestamp with time zone, ends_at timestamp with time zone, revoked_at timestamp with time zone, agreement_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT (practice_in_scope(target_practice) AND coalesce(app_actor_permitted(target_practice, 'grant.revoke'), false)) THEN
    RAISE EXCEPTION 'the practice''s grants are its administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY SELECT g.id, o.name, o.kind, coalesce(g.scope -> 'roles', '[]'::jsonb), g.starts_at, g.ends_at, g.revoked_at, g.agreement_id
    FROM "grant" g JOIN organization o ON o.id = g.organization_id
   WHERE g.practice_id = target_practice
   ORDER BY g.revoked_at IS NOT NULL, g.ends_at DESC, g.id;
END;
$function$;
ALTER FUNCTION public.practice_grants(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.practice_grants(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.practice_grants(uuid) TO tp_app;
