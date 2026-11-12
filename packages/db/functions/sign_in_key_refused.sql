-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- sign_in_key_refused(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7107563ee74c4ef1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.sign_in_key_refused(target_user uuid, why text, request text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  what text;
BEGIN
  IF why IS NULL OR why NOT IN ('not_registered', 'removed', 'assertion', 'malformed') THEN
    RAISE EXCEPTION 'unknown key refusal' USING ERRCODE = 'check_violation';
  END IF;
  what := 'key_refused_' || why;
  IF NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = target_user)
     OR EXISTS (SELECT 1 FROM audit_event e
                 WHERE e.object_type = 'user' AND e.object_id = target_user AND e.action = 'security_event' AND e.actor_kind = 'system'
                   AND e.purpose = what AND e.at > clock_timestamp() - interval '1 hour') THEN
    RETURN;
  END IF;
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES (clock_timestamp(), 'system', 'security_event', 'user', target_user, what, request);
END;
$function$;
ALTER FUNCTION public.sign_in_key_refused(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.sign_in_key_refused(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sign_in_key_refused(uuid,text,text) TO tp_app;
