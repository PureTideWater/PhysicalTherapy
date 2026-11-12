-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_registration_open(uuid,uuid,bytea,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 94712141eb36d69e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_registration_open(removal uuid, acting_session uuid, code_sha256 bytea, request text)
 RETURNS timestamp with time zone
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
    RAISE EXCEPTION 'a registration is opened at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, opens a registration'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF code_sha256 IS NULL OR octet_length(code_sha256) <> 32 THEN
    RAISE EXCEPTION 'a registration is opened with the SHA-256 of its code' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_opening';
  END IF;
  SELECT r.user_id INTO account FROM hardware_key_removal r WHERE r.id = removal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such key removal' USING ERRCODE = 'no_data_found';
  END IF;
  IF actor = account THEN
    RAISE EXCEPTION 'an account does not open its own registration' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  PERFORM 1 FROM "user" u WHERE u.id = account FOR NO KEY UPDATE;
  SELECT r.* INTO held FROM hardware_key_removal r WHERE r.id = removal FOR UPDATE;
  at := clock_timestamp();
  IF held.state <> 'confirmed' OR NOT account_key_registration_closed(account)
     OR EXISTS (SELECT 1 FROM hardware_key_removal later
                 WHERE later.user_id = account AND later.state = 'confirmed' AND later.id <> held.id
                   AND (later.decided_at, later.id) > (held.decided_at, held.id)) THEN
    RAISE EXCEPTION 'a registration is opened for the latest removal of an account that has registered no key since'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_not_closed';
  END IF;
  IF hardware_key_opening_usable(account, at) IS NOT NULL THEN
    RAISE EXCEPTION 'this registration is already open' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_open_once';
  END IF;
  UPDATE hardware_key_removal r
     SET registration_opened_by = actor, registration_opened_at = at, registration_open_until = at + interval '1 hour',
         registration_code_sha256 = code_sha256, registration_code_tries = 0, registration_opened_request_id = request
   WHERE r.id = removal;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_registration_opened', 'user', account, request);
  INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
  VALUES (account, 'registration_opened', removal, at, at, at + interval '90 days')
  ON CONFLICT ON CONSTRAINT hardware_key_notice_once DO NOTHING;
  RETURN at + interval '1 hour';
END;
$function$;
ALTER FUNCTION public.hardware_key_registration_open(uuid,uuid,bytea,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_registration_open(uuid,uuid,bytea,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_registration_open(uuid,uuid,bytea,text) TO tp_app;
