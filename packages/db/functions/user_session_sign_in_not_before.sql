-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_session_sign_in_not_before()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5d65509944753a58
-- Trigger function of: user_session.user_session_sign_in_not_before
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_session_sign_in_not_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  mark timestamptz;
BEGIN
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.sign_in_began_at > clock_timestamp() OR (mark IS NOT NULL AND NEW.sign_in_began_at <= mark) THEN
    RAISE EXCEPTION 'a session is not opened by a sign-in begun at or before the account''s latest password reset, or ahead of the clock'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_sign_in_not_before';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.user_session_sign_in_not_before() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_session_sign_in_not_before() FROM PUBLIC;
