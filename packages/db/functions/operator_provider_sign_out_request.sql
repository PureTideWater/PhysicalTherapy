-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_out_request(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 427b8da17c5aa6a3
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_out_request(account uuid, request text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  event uuid;
  at timestamptz;
  queued uuid;
BEGIN
  -- Never lost to its trace ID, as above.
  IF request !~ '^[A-Za-z0-9._:-]{1,128}$' THEN
    request := NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = account) THEN
    RAISE EXCEPTION 'no such account' USING ERRCODE = 'no_data_found';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_sign_out p
              WHERE p.user_id = account AND p.reason = 'password_reset_unrecorded' AND p.done_at IS NULL AND p.gave_up_at IS NULL AND p.leased_until IS NULL AND p.attempts = 0) THEN
    RETURN NULL;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'password_reset_unrecorded', 'user', account, 'operator', request)
  RETURNING id, audit_event.at INTO event, at;
  INSERT INTO provider_sign_out (user_id, reason, source_event_id, request_id, queued_at, next_attempt_at)
  VALUES (account, 'password_reset_unrecorded', event, request, at, at)
  RETURNING id INTO queued;
  RETURN queued;
END;
$function$;
ALTER FUNCTION public.operator_provider_sign_out_request(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_out_request(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_out_request(uuid,text) TO tp_operator;
