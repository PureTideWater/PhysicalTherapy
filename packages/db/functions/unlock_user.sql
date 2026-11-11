-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- unlock_user(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 95a8acf6d4021da5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.unlock_user(target_user uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF NOT app_actor_platform_permitted('organization.manage') THEN
    RAISE EXCEPTION 'only a platform administrator unlocks an account' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
       SELECT 1 FROM audit_event held
        WHERE held.object_type = 'user' AND held.object_id = target_user AND held.action = 'security_event'
          AND held.actor_kind = 'system' AND held.purpose = 'account_locked_key_across_reset'
          AND NOT EXISTS (
            SELECT 1 FROM audit_event cleared
             WHERE cleared.object_type = 'user' AND cleared.object_id = target_user AND cleared.action = 'security_event'
               AND cleared.actor_kind = 'system' AND cleared.purpose = 'key_across_reset_cleared' AND cleared.at > held.at)) THEN
    RAISE EXCEPTION 'an account locked for a hardware key registered across its password reset is unlocked only after the key is cleared'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_key_across_reset_hold';
  END IF;
  UPDATE "user" SET failed_sign_ins = 0, locked_at = NULL WHERE id = target_user AND locked_at IS NOT NULL;
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.unlock_user(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.unlock_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unlock_user(uuid) TO tp_app;
