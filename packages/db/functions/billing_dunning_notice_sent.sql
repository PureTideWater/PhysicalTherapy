-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- billing_dunning_notice_sent(uuid,text,uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 5c7d1fcbfd4f6e0a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.billing_dunning_notice_sent(target_invoice uuid, notice_stage text, recipient uuid, message_id text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  arrived text;
  now_state text;
BEGIN
  SELECT m.state INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id;
  UPDATE dunning_notice_recipient d
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN mail_state_rank(arrived) > mail_state_rank('sent') THEN arrived ELSE 'sent' END
   WHERE d.invoice_id = target_invoice AND d.stage = notice_stage AND d.user_id = recipient AND d.state = 'pending'
  RETURNING d.state INTO now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a dunning notice is recorded as sent to an owner once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'dunning_notice_recipient_sent';
  END IF;
  IF now_state IN ('bounced', 'suppressed', 'rejected') THEN
    RETURN dunning_notice_report_undelivered(target_invoice, notice_stage, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.billing_dunning_notice_sent(uuid,text,uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.billing_dunning_notice_sent(uuid,text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.billing_dunning_notice_sent(uuid,text,uuid,text,text) TO tp_billing;
