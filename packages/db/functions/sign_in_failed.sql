-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_failed(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a209dae56d884725
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.sign_in_failed(target_user uuid, stage text, request text)
 RETURNS TABLE(failures integer, locked boolean, newly_locked boolean, burst boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  was_locked boolean;
  recent bigint;
BEGIN
  IF stage NOT IN ('password', 'mfa', 'hardware_key') THEN
    RAISE EXCEPTION 'unknown sign-in stage' USING ERRCODE = 'check_violation';
  END IF;
  SELECT u.locked_at IS NOT NULL INTO was_locked FROM "user" u WHERE u.id = target_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE "user" u
     SET failed_sign_ins = u.failed_sign_ins + 1,
         locked_at = CASE WHEN u.locked_at IS NULL AND u.failed_sign_ins + 1 >= 10 THEN now() ELSE u.locked_at END
   WHERE u.id = target_user
  RETURNING u.failed_sign_ins, u.locked_at IS NOT NULL INTO failures, locked;
  newly_locked := locked AND NOT was_locked;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES ('system', 'sign_in_failed', 'user', target_user, stage, request);
  burst := false;
  IF stage IN ('mfa', 'hardware_key') THEN
    SELECT count(*) INTO recent FROM audit_event e
     WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'sign_in_failed'
       AND e.purpose IN ('mfa', 'hardware_key') AND e.at > now() - interval '15 minutes';
    IF recent = 3 THEN
      burst := true;
      INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
        VALUES ('system', 'security_event', 'user', target_user, 'failed_mfa_burst', request);
    END IF;
  END IF;
  IF newly_locked THEN
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
      VALUES ('system', 'security_event', 'user', target_user, 'account_locked', request);
  END IF;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.sign_in_failed(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_failed(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_failed(uuid,text,text) TO tp_app;
