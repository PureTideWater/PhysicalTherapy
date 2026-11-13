-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removal_cancel(uuid,uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e56156a401a47e9f
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removal_cancel(removal uuid, acting_session uuid, request text)
 RETURNS boolean
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
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is cancelled at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, cancels a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  IF actor = account THEN
    RAISE EXCEPTION 'an account does not cancel the removal of its own keys' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  at := clock_timestamp();
  IF held.state <> 'requested' OR at >= held.expires_at THEN
    RETURN false;
  END IF;
  UPDATE hardware_key_removal r SET state = 'cancelled', decided_by = actor, decided_at = at, decided_request_id = request WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_cancelled', 'user', account, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.hardware_key_removal_cancel(uuid,uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removal_cancel(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_removal_cancel(uuid,uuid,text) TO tp_app;
