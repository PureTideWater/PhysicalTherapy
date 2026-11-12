-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removal_request(uuid,uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2724d5b6c71e8dec
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removal_request(target_user uuid, acting_session uuid, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  address text;
  at timestamptz;
  removal uuid := gen_random_uuid();
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a key removal is requested at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  IF actor IS NULL OR NOT account_removes_keys(actor) OR NOT actor_key_session(acting_session) THEN
    RAISE EXCEPTION 'only a platform administrator seven days in the role, just signed in with a registered hardware key, requests a key removal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF target_user = actor THEN
    RAISE EXCEPTION 'an administrator does not remove the keys of their own account' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_not_own_account';
  END IF;
  SELECT lower(u.email) INTO address FROM "user" u WHERE u.id = target_user FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no such account' USING ERRCODE = 'no_data_found';
  END IF;
  at := clock_timestamp();
  WITH lapsed AS (
    UPDATE hardware_key_removal r SET state = 'expired', decided_at = at, decided_request_id = request
     WHERE r.user_id = target_user AND r.state = 'requested' AND r.expires_at <= at
    RETURNING r.user_id
  )
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, request_id)
  SELECT at, 'system', 'hardware_key_removal_expired', 'user', l.user_id, request FROM lapsed l;
  INSERT INTO hardware_key_removal (id, user_id, requested_by, requested_at, expires_at, request_id, address_sha256)
  VALUES (removal, target_user, actor, at, at + interval '24 hours', request, sha256(convert_to(removal::text || ':' || address, 'UTF8')));
  INSERT INTO audit_event (at, actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (at, actor, 'user', 'hardware_key_removal_requested', 'user', target_user, request);
  RETURN removal;
END;
$function$;
ALTER FUNCTION public.hardware_key_removal_request(uuid,uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removal_request(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_removal_request(uuid,uuid,text) TO tp_app;
