-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_record_support_mail(text,text,text,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2903a95e22531e32
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_record_support_mail(ref text, verdict text, sender text, subject text, message text, request text)
 RETURNS TABLE(outcome text, ticket_number bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  requester uuid;
  ticket support_ticket%ROWTYPE;
  recorded text;
BEGIN
  IF ref IS NULL OR ref !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'a message is named by the SHA-256 of where the inbox holds it' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF verdict IS NULL OR verdict NOT IN ('ticket', 'withheld', 'unverified_sender', 'unreadable') THEN
    RAISE EXCEPTION 'a message is a ticket, withheld, from an unverified sender or unreadable' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  -- Serializes two runs reading the same message.
  PERFORM pg_advisory_xact_lock(hashtextextended('support_mail:' || ref, 0));
  SELECT r.outcome INTO recorded FROM support_mail_receipt r WHERE r.mail_ref = ref;
  IF FOUND THEN
    RETURN QUERY SELECT recorded, t.number FROM support_mail_receipt r LEFT JOIN support_ticket t ON t.id = r.ticket_id WHERE r.mail_ref = ref;
    RETURN;
  END IF;
  IF verdict IN ('unverified_sender', 'unreadable') THEN
    INSERT INTO support_mail_receipt (mail_ref, outcome) VALUES (ref, verdict);
    RETURN QUERY SELECT verdict, NULL::bigint;
    RETURN;
  END IF;
  SELECT u.id INTO requester FROM "user" u WHERE lower(u.email) = lower(btrim(coalesce(sender, ''))) AND u.status <> 'disabled';
  IF requester IS NULL THEN
    INSERT INTO support_mail_receipt (mail_ref, outcome) VALUES (ref, 'unknown_sender');
    RETURN QUERY SELECT 'unknown_sender'::text, NULL::bigint;
    RETURN;
  END IF;
  INSERT INTO support_ticket (requester_id, screen, category, subject, message, source, mail_ref)
  VALUES (requester, 'email', 'other', subject, message, 'mail', ref)
  RETURNING * INTO ticket;
  INSERT INTO support_mail_receipt (mail_ref, outcome, ticket_id) VALUES (ref, CASE verdict WHEN 'ticket' THEN 'opened' ELSE 'withheld' END, ticket.id);
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'support_ticket_opened', 'support_ticket', ticket.id, 'mail', request);
  RETURN QUERY SELECT CASE verdict WHEN 'ticket' THEN 'opened' ELSE 'withheld' END, ticket.number;
END;
$function$;
ALTER FUNCTION public.operator_record_support_mail(text,text,text,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_record_support_mail(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_record_support_mail(text,text,text,text,text,text) TO tp_operator;
