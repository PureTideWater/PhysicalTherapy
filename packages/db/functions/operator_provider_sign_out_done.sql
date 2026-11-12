-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_provider_sign_out_done(uuid,smallint,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 370ed0a1534d53a9
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_provider_sign_out_done(sign_out uuid, try smallint, outcome text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  account uuid;
  why text;
BEGIN
  IF outcome IS NULL OR outcome NOT IN ('signed_out', 'no_such_user') THEN
    RAISE EXCEPTION 'unknown provider sign-out outcome' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE provider_sign_out p SET done_at = now(), leased_until = NULL
   WHERE p.id = sign_out AND p.attempts = try AND p.done_at IS NULL
  RETURNING p.user_id, p.reason INTO account, why;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'provider_signed_out', 'user', account, why, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.operator_provider_sign_out_done(uuid,smallint,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_provider_sign_out_done(uuid,smallint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_provider_sign_out_done(uuid,smallint,text,text) TO tp_operator;
