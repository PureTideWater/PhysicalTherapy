-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- provider_sign_out_unrecorded_reset(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: fdf2e36bfa59bcd5
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.provider_sign_out_unrecorded_reset(request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  actor uuid := app_actor_id();
BEGIN
  -- Never lost to its trace ID: one the audit row and the outbox would refuse (their CHECK) is stored as none.
  IF request !~ '^[A-Za-z0-9._:-]{1,128}$' THEN
    request := NULL;
  END IF;
  IF actor IS NULL OR NOT EXISTS (SELECT 1 FROM "user" u WHERE u.id = actor) THEN
    RAISE EXCEPTION 'only an account queues its own sign-out after a reset that was not recorded' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (SELECT 1 FROM provider_sign_out p
              WHERE p.user_id = actor AND p.reason = 'password_reset_unrecorded' AND p.done_at IS NULL AND p.gave_up_at IS NULL AND p.leased_until IS NULL AND p.attempts = 0) THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, object_id, request_id)
  VALUES (actor, 'user', 'password_reset_unrecorded', 'user', actor, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.provider_sign_out_unrecorded_reset(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.provider_sign_out_unrecorded_reset(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provider_sign_out_unrecorded_reset(text) TO tp_app;
