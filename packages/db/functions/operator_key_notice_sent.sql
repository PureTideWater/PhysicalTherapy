-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_key_notice_sent(uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 34c5bf16c0fce884
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_key_notice_sent(notice uuid, message_id text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  arrived mail_send%ROWTYPE;
  told uuid;
  told_kind text;
  now_state text;
BEGIN
  IF message_id IS NULL OR message_id !~ '^[A-Za-z0-9-]{20,100}$' THEN
    RAISE EXCEPTION 'a key notice is recorded with the message ID SES gave' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_notice_message_id';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hardware_key_notice:' || message_id, 0));
  SELECT m.* INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id AND m.kind = 'hardware_keys_removed';
  UPDATE hardware_key_notice n
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN arrived.state IN ('bounced', 'suppressed', 'rejected') THEN 'undelivered'
                      WHEN arrived.delivered_at IS NOT NULL THEN 'delivered'
                      ELSE 'sent' END
   WHERE n.id = notice AND n.state = 'pending'
  RETURNING n.user_id, n.kind, n.state INTO told, told_kind, now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a key notice is recorded as sent once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_notice_sent';
  END IF;
  INSERT INTO audit_event (actor_kind, action, object_type, object_id, purpose, request_id)
  VALUES ('system', 'hardware_key_notice_sent', 'user', told, told_kind, request);
  IF now_state = 'undelivered' THEN
    RETURN hardware_key_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.operator_key_notice_sent(uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_key_notice_sent(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_key_notice_sent(uuid,text,text) TO tp_operator;
