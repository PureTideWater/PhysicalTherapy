-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: eda27a15443050cf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_record_mail_event(message_id text, stream text, event text, mail_at timestamp with time zone, event_at timestamp with time zone, recipient text, kind text, subject uuid, recipient_user uuid, practice uuid, bounce_kind text, bounce_subtype text, complaint_type text, request text)
 RETURNS TABLE(recorded boolean, state text, notice_undelivered uuid, invoice_undelivered uuid, invitation_undelivered uuid, stream_paused text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  new_state text;
  given_bounce text;
  given_subtype text;
  given_complaint text;
  happened timestamptz := least(coalesce(event_at, now()), now());
  held mail_send%ROWTYPE;
  resolved_user uuid;
  prospect uuid;
  priced screening_run%ROWTYPE;
  touched_notice uuid;
  touched_invoice uuid;
  touched_stage text;
BEGIN
  recorded := false;
  notice_undelivered := NULL;
  invoice_undelivered := NULL;
  invitation_undelivered := NULL;
  stream_paused := NULL;
  IF event IS NULL OR event NOT IN ('send', 'delivery_delay', 'delivery', 'bounce', 'complaint', 'reject', 'rendering_failure') THEN
    RAISE EXCEPTION 'unknown mail event' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_type';
  END IF;
  IF mail_at IS NULL THEN
    RAISE EXCEPTION 'a mail event names when its message was sent' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_event_sent_at';
  END IF;
  IF practice IS NOT NULL OR kind IN ('support_grant_opened', 'support_grant_closed') THEN
    PERFORM operator_assert_scope(practice);
  END IF;
  IF event = 'bounce' THEN
    given_bounce := CASE WHEN bounce_kind IN ('permanent', 'transient', 'undetermined') THEN bounce_kind ELSE 'undetermined' END;
    given_subtype := CASE WHEN bounce_subtype IN ('general', 'no_email', 'suppressed', 'on_account_suppression_list', 'on_configuration_set_suppression_list',
                                                  'mailbox_full', 'message_too_large', 'content_rejected', 'attachment_rejected', 'undetermined', 'other')
                          THEN bounce_subtype ELSE 'other' END;
    -- Suppressed by the account's own list (or a set's override of it, which only changes what goes on that list): SES
    -- accepted the message, sent it to no one and counts it toward neither rate. A bounce from SES's global suppression
    -- list (subtype suppressed: the address bounced recently for some sender) is counted toward the account's bounce rate
    -- as any hard bounce is, so it is a bounce here too: the window, the refusal list and the bounce marks count it.
    new_state := CASE WHEN given_subtype IN ('on_account_suppression_list', 'on_configuration_set_suppression_list') THEN 'suppressed' ELSE 'bounced' END;
  ELSIF event = 'complaint' THEN
    given_complaint := CASE WHEN complaint_type IS NULL THEN 'unspecified'
                            WHEN complaint_type IN ('abuse', 'auth_failure', 'fraud', 'not_spam', 'virus', 'other', 'unspecified') THEN complaint_type
                            ELSE 'other' END;
    new_state := 'complained';
  ELSE
    new_state := CASE event WHEN 'send' THEN 'sent' WHEN 'delivery_delay' THEN 'delayed' WHEN 'delivery' THEN 'delivered' ELSE 'rejected' END;
  END IF;
  IF stream = 'screening' THEN
    IF kind IN ('screening_result', 'screening_failed') THEN
      SELECT r.* INTO priced FROM screening_run r WHERE r.id = subject;
      IF FOUND THEN
        SELECT u.prospect_id INTO prospect FROM screening_upload u WHERE u.id = priced.upload_id;
      END IF;
    END IF;
  ELSIF kind = 'cognito' THEN
    SELECT u.id INTO resolved_user FROM "user" u WHERE lower(u.email) = lower(btrim(recipient));
  ELSIF recipient_user IS NOT NULL THEN
    SELECT u.id INTO resolved_user FROM "user" u WHERE u.id = recipient_user;
  END IF;

  INSERT INTO mail_send (ses_message_id, stream, kind, subject_id, recipient_user_id, screening_prospect_id, state, bounce_kind, bounce_subtype, complaint_type,
                         sent_at, delivered_at, undelivered_at, complained_at)
  VALUES (message_id, stream, kind, subject, resolved_user, prospect, new_state,
          CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_bounce END, CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_subtype END,
          CASE WHEN new_state = 'complained' THEN given_complaint END,
          mail_at, CASE WHEN new_state = 'delivered' THEN happened END, CASE WHEN new_state IN ('bounced', 'suppressed', 'rejected') THEN happened END,
          CASE WHEN new_state = 'complained' THEN happened END)
  ON CONFLICT (ses_message_id) DO NOTHING
  RETURNING * INTO held;
  IF FOUND THEN
    recorded := true;
  ELSE
    SELECT m.* INTO held FROM mail_send m WHERE m.ses_message_id = message_id FOR UPDATE;
    IF mail_state_rank(new_state) > mail_state_rank(held.state) THEN
      UPDATE mail_send m
         SET state = new_state,
             bounce_kind = CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_bounce END,
             bounce_subtype = CASE WHEN new_state IN ('bounced', 'suppressed') THEN given_subtype END,
             complaint_type = CASE WHEN new_state = 'complained' THEN given_complaint END,
             delivered_at = CASE WHEN new_state = 'delivered' THEN happened ELSE m.delivered_at END,
             undelivered_at = CASE WHEN new_state IN ('bounced', 'suppressed', 'rejected') THEN happened ELSE m.undelivered_at END,
             complained_at = CASE WHEN new_state = 'complained' THEN happened ELSE m.complained_at END
       WHERE m.ses_message_id = message_id
      RETURNING * INTO held;
      recorded := true;
    END IF;
  END IF;
  state := held.state;
  IF NOT recorded THEN
    RETURN NEXT;
    RETURN;
  END IF;

  -- A probe proves the event path, and counts toward nothing else.
  IF held.kind = 'probe' THEN
    IF held.state = 'delivered' THEN
      UPDATE mail_stream s SET probe_delivered_at = now() WHERE s.stream = held.stream;
    ELSIF held.state = 'bounced' THEN
      UPDATE mail_stream s SET probe_bounced_at = now() WHERE s.stream = held.stream;
    END IF;
    RETURN NEXT;
    RETURN;
  END IF;

  -- A notice's recipient takes its message's state, by the message's ID alone.
  IF held.stream = 'notices' AND held.state <> 'sent' THEN
    IF held.kind IN ('support_grant_opened', 'support_grant_closed') THEN
      UPDATE support_grant_notice_recipient r SET state = held.state
       WHERE r.ses_message_id = message_id AND mail_state_rank(r.state) < mail_state_rank(held.state)
      RETURNING r.notice_id INTO touched_notice;
      IF touched_notice IS NOT NULL AND held.state IN ('bounced', 'suppressed', 'rejected') AND support_notice_report_undelivered(touched_notice, request) THEN
        SELECT n.support_grant_id INTO notice_undelivered FROM support_grant_notice n WHERE n.id = touched_notice;
      END IF;
    ELSIF held.kind = 'dunning' THEN
      UPDATE dunning_notice_recipient d SET state = held.state
       WHERE d.ses_message_id = message_id AND mail_state_rank(d.state) < mail_state_rank(held.state)
      RETURNING d.invoice_id, d.stage INTO touched_invoice, touched_stage;
      IF touched_invoice IS NOT NULL AND held.state IN ('bounced', 'suppressed', 'rejected') AND dunning_notice_report_undelivered(touched_invoice, touched_stage, request) THEN
        invoice_undelivered := touched_invoice;
      END IF;
    END IF;
  END IF;

  -- An invitation whose Cognito message did not arrive: only one sent at or after the invitation's latest send (less 5
  -- seconds of clock skew), so a late bounce of a message a resend replaced never flags it.
  IF held.stream = 'transactional' AND held.kind = 'cognito' AND held.recipient_user_id IS NOT NULL
     AND held.state IN ('bounced', 'suppressed', 'rejected', 'complained') THEN
    WITH flagged AS (
      UPDATE invitation i SET undelivered_at = held.sent_at, undelivered_reason = held.state
       WHERE i.user_id = held.recipient_user_id AND i.accepted_at IS NULL AND held.sent_at >= i.sent_at - interval '5 seconds'
         AND (i.undelivered_at IS NULL OR i.undelivered_at <= held.sent_at)
      RETURNING i.id, i.sent_at
    )
    SELECT f.id INTO invitation_undelivered FROM flagged f ORDER BY f.sent_at DESC, f.id LIMIT 1;
  END IF;

  -- The screening's own outcomes: the refusal list, the bounce marks and the cut-off.
  IF held.stream = 'screening'
     AND ((held.state = 'bounced' AND held.bounce_kind = 'permanent') OR (held.state = 'complained' AND held.complaint_type <> 'not_spam')) THEN
    IF recipient IS NOT NULL AND btrim(recipient) <> '' THEN
      INSERT INTO screening_mail_refusal (recipient_sha256, reason, recorded_at, expires_at)
      VALUES (mail_recipient_sha256(recipient), CASE WHEN held.state = 'bounced' THEN 'bounced' ELSE 'complained' END, now(), now() + interval '365 days')
      ON CONFLICT (recipient_sha256) DO UPDATE SET reason = EXCLUDED.reason, recorded_at = EXCLUDED.recorded_at, expires_at = EXCLUDED.expires_at;
    END IF;
    IF held.state = 'bounced' AND priced.id IS NOT NULL THEN
      INSERT INTO screening_bounce_mark (subject, subject_kind, ses_message_id, bounced_at, expires_at)
      SELECT v.marked, v.marked_kind, message_id, happened, happened + interval '7 days'
        FROM (VALUES (priced.rate_subject, 'account'), (priced.client_subject, 'client')) AS v (marked, marked_kind)
       WHERE v.marked IS NOT NULL
      ON CONFLICT DO NOTHING;
    END IF;
    stream_paused := mail_stream_cutoff(request);
  END IF;
  RETURN NEXT;
END;
$function$;
ALTER FUNCTION public.operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_record_mail_event(text,text,text,timestamp with time zone,timestamp with time zone,text,text,uuid,uuid,uuid,text,text,text,text) TO tp_operator;
