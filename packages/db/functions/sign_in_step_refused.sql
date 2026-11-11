-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_step_refused(uuid,timestamp with time zone,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 30188a01c209611e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_step_refused(target_user uuid, began timestamp with time zone, step text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  mark timestamptz;
BEGIN
  IF step IS NULL OR step NOT IN ('new_password', 'mfa_setup', 'mfa', 'key', 'register_key', 'key_registered') THEN
    RAISE EXCEPTION 'unknown sign-in step' USING ERRCODE = 'check_violation';
  END IF;
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a sign-in step is judged at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = target_user;
  IF NOT FOUND OR began IS NULL OR began > clock_timestamp() THEN
    RETURN true;
  END IF;
  IF mark IS NULL OR began > mark THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'security_event', 'user', target_user,
          CASE WHEN step = 'key_registered' THEN 'key_registered_across_reset' ELSE 'step_before_reset_' || step END, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.sign_in_step_refused(uuid,timestamp with time zone,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_step_refused(uuid,timestamp with time zone,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_step_refused(uuid,timestamp with time zone,text,text) TO tp_app;
