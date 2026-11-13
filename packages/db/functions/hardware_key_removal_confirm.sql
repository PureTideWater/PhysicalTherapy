-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removal_confirm(uuid,uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e2b0a3aabeeb315a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removal_confirm(removal uuid, acting_session uuid, request text)
 RETURNS TABLE(keys_removed integer, sessions_ended integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  account uuid;
  held hardware_key_removal%ROWTYPE;
  at timestamptz;
  event uuid;
  keys integer;
  sessions integer;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is confirmed at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, confirms a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  IF held.state <> 'requested' THEN
    RAISE EXCEPTION 'this key removal is already decided' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_decided';
  END IF;
  at := clock_timestamp();
  IF actor = held.requested_by THEN
    RAISE EXCEPTION 'a key removal is confirmed by a second platform administrator' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_two_people';
  END IF;
  IF actor = held.user_id THEN
    RAISE EXCEPTION 'an administrator does not remove the keys of their own account' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  IF at >= held.expires_at THEN
    RAISE EXCEPTION 'this key removal request has expired' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_in_time';
  END IF;
  IF NOT account_removes_keys(held.requested_by) THEN
    RAISE EXCEPTION 'the administrator who requested this key removal no longer may' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_requester_left';
  END IF;
  UPDATE hardware_key k SET removed_at = at, removal_id = removal WHERE k.user_id = account AND k.removed_at IS NULL;
  GET DIAGNOSTICS keys = ROW_COUNT;
  UPDATE "user" u SET sign_in_not_before = GREATEST(u.sign_in_not_before, at) WHERE u.id = account;
  UPDATE user_session s SET ended_at = at, end_reason = 'revoked' WHERE s.user_id = account AND s.ended_at IS NULL;
  GET DIAGNOSTICS sessions = ROW_COUNT;
  IF EXISTS (
       SELECT 1 FROM audit_event locked
        WHERE locked.object_type = 'user' AND locked.object_id = account AND locked.action = 'security_event'
          AND locked.actor_kind = 'system' AND locked.purpose = 'account_locked_key_across_reset'
          AND NOT EXISTS (
            SELECT 1 FROM audit_event cleared
             WHERE cleared.object_type = 'user' AND cleared.object_id = account AND cleared.action = 'security_event'
               AND cleared.actor_kind = 'system' AND cleared.purpose = 'key_across_reset_cleared' AND cleared.at > locked.at)) THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (clock_timestamp(), 'system', 'security_event', 'user', account, 'key_across_reset_cleared', request);
  END IF;
  UPDATE hardware_key_removal r
     SET state = 'confirmed', decided_by = actor, decided_at = at, decided_request_id = request, keys_removed = keys, sessions_ended = sessions
   WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_confirmed', 'user', account, request)
  RETURNING id INTO event;
  INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
  VALUES (account, 'removed', removal, at, at, at + interval '90 days');
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, 'hardware_keys_removed', event, request, at, at);
  keys_removed := keys;
  sessions_ended := sessions;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.hardware_key_removal_confirm(uuid,uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removal_confirm(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_removal_confirm(uuid,uuid,text) TO tp_app;
