-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_screening_reminder_sent(uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b251d387b919a3db
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_screening_reminder_sent(lead uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE screening_lead l SET reminder_sent_at = now() WHERE l.id = $1 AND l.consent_sha256 IS NOT NULL AND l.reminder_sent_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'screening_lead_reminded', 'screening_lead', $1, 'screening', $2);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.operator_screening_reminder_sent(uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_screening_reminder_sent(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_screening_reminder_sent(uuid,text) TO tp_operator;
