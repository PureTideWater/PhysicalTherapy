-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- resolve_session(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1dc349b28fbd9045
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.resolve_session(token text)
 RETURNS TABLE(outcome text, ended_now boolean, session_id uuid, user_id uuid, device_id uuid, mfa_method text, started_at timestamp with time zone, expires_at timestamp with time zone, last_seen_at timestamp with time zone, user_status text, mfa_enrolled boolean, hardware_key_required boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  s user_session%ROWTYPE;
  u "user"%ROWTYPE;
  device_revoked boolean;
  reason text;
BEGIN
  SELECT * INTO s FROM user_session x WHERE x.token_sha256 = token FOR UPDATE;
  IF NOT FOUND THEN
    outcome := 'unknown';
    ended_now := false;
    RETURN NEXT;
    RETURN;
  END IF;
  SELECT * INTO u FROM "user" x WHERE x.id = s.user_id;
  SELECT d.revoked_at IS NOT NULL INTO device_revoked FROM user_device d WHERE d.id = s.device_id;
  session_id := s.id; user_id := s.user_id; device_id := s.device_id; mfa_method := s.mfa_method;
  started_at := s.started_at; expires_at := s.expires_at; last_seen_at := s.last_seen_at;
  user_status := u.status; mfa_enrolled := u.mfa_enrolled;
  hardware_key_required := u.hardware_key_required OR user_is_internal(u.id);
  ended_now := false;
  IF s.ended_at IS NOT NULL THEN
    outcome := 'ended';
    RETURN NEXT;
    RETURN;
  END IF;
  reason := CASE
    WHEN now() >= s.expires_at THEN 'expired'
    WHEN now() > s.last_seen_at + interval '30 minutes' THEN 'idle'
    WHEN device_revoked THEN 'device_revoked'
    WHEN u.status = 'disabled' THEN 'user_disabled'
  END;
  IF reason IS NOT NULL THEN
    UPDATE user_session x SET ended_at = now(), end_reason = reason WHERE x.id = s.id;
    outcome := reason;
    ended_now := true;
    RETURN NEXT;
    RETURN;
  END IF;
  UPDATE user_session x SET last_seen_at = now() WHERE x.id = s.id;
  UPDATE user_device x SET last_seen_at = now() WHERE x.id = s.device_id;
  outcome := 'active';
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.resolve_session(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.resolve_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_session(text) TO tp_app;
