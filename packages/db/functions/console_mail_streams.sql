-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_mail_streams()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8ca35dce4f520314
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_mail_streams()
 RETURNS TABLE(stream text, paused_at timestamp with time zone, paused_reason text, paused_by uuid, pause_sends integer, pause_bounces integer, pause_complaints integer, window_starts_at timestamp with time zone, window_sends integer, window_bounces integer, window_complaints integer, resumed_at timestamp with time zone, confirmed_at timestamp with time zone, sending boolean, ready boolean, probe_sent_at timestamp with time zone, probe_delivered_at timestamp with time zone, probe_bounced_at timestamp with time zone, client_marks integer, account_marks integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator reads the mail streams' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT s.stream, s.paused_at, s.paused_reason, s.paused_by, s.pause_sends, s.pause_bounces, s.pause_complaints, s.window_starts_at,
           w.sends, w.bounces, w.complaints, s.resumed_at, s.ses_enabled_confirmed_at,
           s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL,
           s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NOT NULL
             AND coalesce(s.probe_delivered_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity')), false)
             AND coalesce(s.probe_bounced_at >= greatest(now() - interval '48 hours', coalesce(s.resumed_at, '-infinity')), false),
           s.probe_sent_at, s.probe_delivered_at, s.probe_bounced_at, k.client_marks, k.account_marks
      FROM mail_stream s
      CROSS JOIN LATERAL mail_window_counts(s.stream) w
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE b.subject_kind = 'client')::integer AS client_marks, count(*) FILTER (WHERE b.subject_kind = 'account')::integer AS account_marks
          FROM screening_bounce_mark b WHERE s.stream = 'screening' AND b.expires_at > now()
      ) k
     ORDER BY s.stream;
END;
$function$;
ALTER FUNCTION public.console_mail_streams() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_mail_streams() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_mail_streams() TO tp_app;
