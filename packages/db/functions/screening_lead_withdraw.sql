-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- screening_lead_withdraw(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 788ee69fa361503e
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.screening_lead_withdraw(token_sha256 text, request text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target uuid;
BEGIN
  SELECT l.id INTO target FROM screening_lead l WHERE l.withdrawal_token_sha256 = $1 AND $1 ~ '^[0-9a-f]{64}$' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  UPDATE screening_lead l SET expires_at = now() WHERE l.id = target;
  DELETE FROM screening_lead l WHERE l.id = target;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_withdrawn', 'screening_lead', target, 'screening', $2);
END;
$function$;
ALTER FUNCTION public.screening_lead_withdraw(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.screening_lead_withdraw(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.screening_lead_withdraw(text,text) TO tp_app;
