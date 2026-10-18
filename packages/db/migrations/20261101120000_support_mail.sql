-- Mail to the support address opens a ticket (PRD 19, Support: "a support address that creates a ticket";
-- docs/adr/0055).
--
-- - support_ticket.source: 'form' (the in-app form, as before) or 'mail'; a mailed ticket carries mail_ref, the
--   SHA-256 of where the inbox holds the message (never the message, its sender or its subject), unique, so a
--   message opens one ticket however often the job reads it.
-- - support_mail_receipt: every message the support_mail platform job has read, by mail_ref, with what came of it
--   (a ticket, an unknown or unverified sender, an unreadable message), so the job reads each message once. It
--   holds no address, subject or text. No role but the owner reads or writes it, except through the function below.
-- - operator_record_support_mail(): the job's one write, as tp_operator. A message whose sender the inbox verified
--   and whose address belongs to an account that is not disabled opens a ticket in that person's name, on screen
--   'email', category 'other', with the text the job screened (or, when it looked like it held patient
--   information, the fixed withheld notice the job passes instead); the job is never told who the sender is.
--
-- Runs as tp_owner. Safe with the previous image running: new nullable and defaulted columns, a new table and a
-- new function, read by this image alone; the form's insert names neither new column.

ALTER TABLE support_ticket
  ADD COLUMN source text NOT NULL DEFAULT 'form' CHECK (source IN ('form', 'mail')),
  ADD COLUMN mail_ref text UNIQUE CHECK (mail_ref ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT support_ticket_mail_ref CHECK ((source = 'mail') = (mail_ref IS NOT NULL));

-- What the requester wrote, and where it came from, never change.
CREATE OR REPLACE FUNCTION support_ticket_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    NEW.status_changed_by := NULL;
    NEW.status_changed_at := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.number, NEW.requester_id, NEW.screen, NEW.category, NEW.subject, NEW.message, NEW.created_at, NEW.source, NEW.mail_ref)
     IS DISTINCT FROM (OLD.id, OLD.number, OLD.requester_id, OLD.screen, OLD.category, OLD.subject, OLD.message, OLD.created_at, OLD.source, OLD.mail_ref) THEN
    RAISE EXCEPTION 'a ticket keeps what its requester wrote' USING ERRCODE = 'check_violation';
  END IF;
  NEW.status_changed_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE support_mail_receipt (
  mail_ref text PRIMARY KEY CHECK (mail_ref ~ '^[0-9a-f]{64}$'),
  outcome text NOT NULL CHECK (outcome IN ('opened', 'withheld', 'unknown_sender', 'unverified_sender', 'unreadable')),
  ticket_id uuid REFERENCES support_ticket (id),
  read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_mail_receipt_ticket CHECK ((outcome IN ('opened', 'withheld')) = (ticket_id IS NOT NULL))
);
CREATE INDEX support_mail_receipt_by_read_at ON support_mail_receipt (read_at);
CREATE TRIGGER support_mail_receipt_append_only BEFORE UPDATE OR DELETE ON support_mail_receipt FOR EACH ROW EXECUTE FUNCTION reject_change();
ALTER TABLE support_mail_receipt ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_mail_receipt FORCE ROW LEVEL SECURITY;
CREATE POLICY support_mail_receipt_owner ON support_mail_receipt FOR ALL TO tp_owner USING (true) WITH CHECK (true);
REVOKE ALL ON support_mail_receipt FROM PUBLIC;

-- Which of these messages the job has read already (refs only, at most 1000 per call).
CREATE FUNCTION operator_support_mail_read(refs text[]) RETURNS TABLE (mail_ref text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF coalesce(cardinality(refs), 0) > 1000 THEN
    RAISE EXCEPTION 'at most 1000 messages at a time' USING ERRCODE = 'program_limit_exceeded';
  END IF;
  RETURN QUERY SELECT r.mail_ref FROM support_mail_receipt r WHERE r.mail_ref = ANY (refs);
END;
$$;

-- Records one message the job read. verdict is the job's: 'ticket' (verified sender, screened text), 'withheld'
-- (verified sender, text that looked like patient information: the job passes the withheld notice as the text),
-- 'unverified_sender' or 'unreadable' (no ticket; sender, subject and text are null). Returns the outcome and, when
-- a ticket opened, its number; a message read before returns its first outcome.
CREATE FUNCTION operator_record_support_mail(ref text, verdict text, sender text, subject text, message text, request text)
RETURNS TABLE (outcome text, ticket_number bigint)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
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
$$;

REVOKE ALL ON FUNCTION operator_support_mail_read(text[]), operator_record_support_mail(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operator_support_mail_read(text[]), operator_record_support_mail(text, text, text, text, text, text) TO tp_operator;
