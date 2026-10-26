-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- revoke_user_sessions(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 49398f19386615ff
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(target_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  ended integer;
BEGIN
  IF app_actor_id() IS NULL OR NOT coalesce(
    target_user = app_actor_id()
    OR app_actor_platform_permitted('organization.manage')
    OR EXISTS (
      SELECT 1 FROM membership m
       WHERE m.user_id = target_user AND (m.ends_at IS NULL OR m.ends_at >= now())
         AND m.organization_id = ANY (app_actor_administered_organization_ids())
    ),
    false
  ) THEN
    RAISE EXCEPTION 'only the user or an administrator of the user''s organization revokes the user''s sessions' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE user_session SET ended_at = now(), end_reason = 'revoked' WHERE user_id = target_user AND ended_at IS NULL;
  GET DIAGNOSTICS ended = ROW_COUNT;
  RETURN ended;
END;
$function$;
ALTER FUNCTION public.revoke_user_sessions(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO tp_app;
