-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- record_sign_in_with_mfa()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 33357d6149a90f6c
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.record_sign_in_with_mfa()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT EXISTS (
    SELECT 1 FROM user_session s WHERE s.user_id = app_actor_id() AND s.started_at = now() AND s.ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'MFA enrollment is recorded by the sign-in that opened a session' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE "user" u
     SET status = CASE WHEN u.status = 'invited' THEN 'active' ELSE u.status END, mfa_enrolled = true
   WHERE u.id = app_actor_id() AND u.status <> 'disabled' AND (u.status = 'invited' OR NOT u.mfa_enrolled);
  RETURN FOUND;
END;
$function$;
ALTER FUNCTION public.record_sign_in_with_mfa() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.record_sign_in_with_mfa() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_sign_in_with_mfa() TO tp_app;
