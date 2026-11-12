-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_registration_judge(bytea,timestamp with time zone,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9a9f2020335cec77
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_registration_judge(code_sha256 bytea, began timestamp with time zone, request text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
  mark timestamptz;
  at timestamptz;
  opening uuid;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'a registration is judged at READ COMMITTED' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT u.sign_in_not_before INTO mark FROM "user" u WHERE u.id = actor FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'only an account asks about its own registration' USING ERRCODE = 'insufficient_privilege';
  END IF;
  at := clock_timestamp();
  IF NOT account_key_registration_closed(actor) THEN
    RETURN 'not_closed';
  END IF;
  -- A step begun at or before the mark, or ahead of the clock, is refused without a try counted: it is no guess.
  IF began IS NOT NULL AND began <= at AND (mark IS NULL OR began > mark) THEN
    opening := hardware_key_opening_usable(actor, at);
    IF opening IS NOT NULL THEN
      IF code_sha256 IS NOT NULL
         AND EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.id = opening AND sha256(r.registration_code_sha256) = sha256(code_sha256)) THEN
        RETURN 'open';
      END IF;
      UPDATE hardware_key_removal r SET registration_code_tries = r.registration_code_tries + 1 WHERE r.id = opening;
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM audit_event e
                  WHERE e.object_type = 'user' AND e.object_id = actor AND e.action = 'security_event' AND e.actor_kind = 'system'
                    AND e.purpose = 'key_registration_refused' AND e.at > at - interval '1 hour') THEN
    INSERT INTO audit_event (at, actor_kind, action, object_type, object_id, purpose, request_id)
    VALUES (at, 'system', 'security_event', 'user', actor, 'key_registration_refused', request);
  END IF;
  RETURN 'refused';
END;
$function$;
ALTER FUNCTION public.hardware_key_registration_judge(bytea,timestamp with time zone,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_registration_judge(bytea,timestamp with time zone,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hardware_key_registration_judge(bytea,timestamp with time zone,text) TO tp_app;
