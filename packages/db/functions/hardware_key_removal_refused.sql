-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_removal_refused(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: ce687d95e7eb4ee1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_removal_refused(why text, request text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  what text;
BEGIN
  IF why IS NULL OR why NOT IN ('not_permitted', 'two_people', 'not_own_account', 'requester_left',
                                'one_administrator_request', 'asked_again_too_soon', 'target_asks', 'no_third_administrator') THEN
    RAISE EXCEPTION 'unknown key removal refusal' USING ERRCODE = 'check_violation';
  END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = actor) THEN
    RAISE EXCEPTION 'only an account records its own refused act' USING ERRCODE = 'insufficient_privilege';
  END IF;
  what := 'key_removal_refused_' || why;
  IF EXISTS (SELECT 1 FROM audit_event e
              WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                AND e.purpose = what AND e.at > clock_timestamp() - interval '1 hour') THEN
    RETURN;
  END IF;
  INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES (clock_timestamp(), 'system', 'security_event', 'user', actor, what, request);
END;
$function$;
ALTER FUNCTION public.hardware_key_removal_refused(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_removal_refused(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_removal_refused(text,text) TO tp_app;
