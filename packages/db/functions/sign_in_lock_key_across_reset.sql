-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_lock_key_across_reset(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: abe55cc07eabda9f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_lock_key_across_reset(target_user uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  mark timestamptz;
  was_locked boolean;
BEGIN
  SELECT u.sign_in_not_before, u.locked_at IS NOT NULL INTO mark, was_locked FROM "user" u WHERE u.id = target_user FOR UPDATE;
  IF NOT FOUND OR mark IS NULL OR NOT EXISTS (
       SELECT 1 FROM audit_event e
        WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'security_event'
          AND e.actor_kind = 'system' AND e.purpose = 'key_registered_across_reset' AND e.at >= mark) THEN
    RAISE EXCEPTION 'an account is locked for a key registered across its reset only when that registration is on record'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF was_locked THEN
    RETURN false;
  END IF;
  UPDATE "user" u SET locked_at = now() WHERE u.id = target_user;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'security_event', 'user', target_user, 'account_locked_key_across_reset', request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.sign_in_lock_key_across_reset(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_lock_key_across_reset(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_lock_key_across_reset(uuid,text) TO tp_app;
