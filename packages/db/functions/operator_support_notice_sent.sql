-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_support_notice_sent(uuid,uuid,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1478080f10eb672a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_support_notice_sent(notice uuid, recipient uuid, message_id text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
  arrived text;
  now_state text;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  SELECT m.state INTO arrived FROM mail_send m WHERE m.ses_message_id = message_id;
  UPDATE support_grant_notice_recipient r
     SET ses_message_id = message_id, sent_at = now(),
         state = CASE WHEN mail_state_rank(arrived) > mail_state_rank('sent') THEN arrived ELSE 'sent' END
   WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending'
  RETURNING r.state INTO now_state;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'a notice is recorded as sent to an administrator once, while pending' USING ERRCODE = 'check_violation', CONSTRAINT = 'support_grant_notice_recipient_sent';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('support_grant_notice:' || notice::text, 0));
  IF NOT EXISTS (
    SELECT 1 FROM audit_event e
     WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = held.support_grant_id AND e.purpose = held.notice
  ) THEN
    INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, grant_id, purpose, request_id)
    VALUES ('system', 'notice_sent', 'support_grant', held.support_grant_id, held.practice_id, held.support_grant_id, held.notice, request);
  END IF;
  IF now_state IN ('bounced', 'suppressed', 'rejected') THEN
    RETURN support_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.operator_support_notice_sent(uuid,uuid,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_support_notice_sent(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_support_notice_sent(uuid,uuid,text,text) TO tp_operator;
