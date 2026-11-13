-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_record(bytea,bytea,bytea,timestamp with time zone,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: c75e97056dd15b46
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_record(new_credential bytea, new_public_key bytea, code_sha256 bytea, began timestamp with time zone, request text)
 RETURNS TABLE(key_id uuid, first_after_removal boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  mark timestamptz;
  at timestamptz;
  closed boolean;
  opening uuid;
  latest uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a hardware key is recorded at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account records its own hardware key' USING ERRCODE = 'insufficient_privilege';
  END IF;
  at := clock_timestamp();
  IF began IS NULL OR began > at OR (mark IS NOT NULL AND began <= mark) THEN
    RAISE EXCEPTION 'a hardware key is not recorded by a sign-in begun at or before the account''s mark, or ahead of the clock'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_sign_in_not_before';
  END IF;
  IF EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = actor AND k.removed_at IS NULL) THEN
    RAISE EXCEPTION 'an account holds one hardware key' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_one_live';
  END IF;
  closed := account_key_registration_closed(actor);
  IF closed THEN
    opening := hardware_key_opening_usable(actor, at);
    -- Both sides hashed again before the comparison, so its timing says nothing about the stored digest.
    IF opening IS NULL OR code_sha256 IS NULL THEN
      RAISE EXCEPTION 'registration of a hardware key after a removal needs the code an administrator opened it with'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_registration_closed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
      UPDATE hardware_key_removal r SET registration_code_tries = r.registration_code_tries + 1 WHERE r.id = opening;
      IF NOT EXISTS (SELECT 1 FROM audit_event e
                      WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                        AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN
        INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
        VALUES (at, 'system', 'security_event', 'user', actor, 'key_registration_refused', request);
      END IF;
      RETURN;
    END IF;
  END IF;
  INSERT INTO hardware_key (user_id, credential_sha256, public_key, registered_at, registered_request_id)
  VALUES (actor, new_credential, new_public_key, at, request)
  RETURNING id INTO key_id;
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_registered', 'user', actor, request);
  IF closed THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (at, 'system', 'security_event', 'user', actor, 'key_registered_after_removal', request);
    INSERT INTO hardware_key_notice (user_id, kind, removal_id, event_at, next_attempt_at, expires_at)
    VALUES (actor, 'registered_after_removal', opening, at, at, at + interval '90 days')
    ON CONFLICT ON CONSTRAINT hardware_key_notice_once DO NOTHING;
  END IF;
  first_after_removal := closed;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.hardware_key_record(bytea,bytea,bytea,timestamp with time zone,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_record(bytea,bytea,bytea,timestamp with time zone,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_record(bytea,bytea,bytea,timestamp with time zone,text) TO tp_app;
