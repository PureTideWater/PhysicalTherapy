-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_resume_mail_stream(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: aa7deca1804d4ed7
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_resume_mail_stream(stream text, reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator resumes a mail stream' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF reason IS NULL OR reason NOT IN ('cause_fixed', 'false_alarm') THEN
    RAISE EXCEPTION 'a stream is resumed for a cause fixed or a false alarm' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_resume_reason';
  END IF;
  UPDATE mail_stream s
     SET paused_at = NULL, paused_reason = NULL, paused_by = NULL, pause_sends = NULL, pause_bounces = NULL, pause_complaints = NULL,
         window_starts_at = now(), resumed_at = now(), probe_sent_at = NULL, ses_enabled_confirmed_at = NULL
   WHERE s.stream = stream AND s.paused_at IS NOT NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, purpose)
  VALUES (app_actor_id(), 'user', 'mail_stream_resumed', 'mail_stream', reason);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.console_resume_mail_stream(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_resume_mail_stream(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_resume_mail_stream(text,text) TO tp_app;
