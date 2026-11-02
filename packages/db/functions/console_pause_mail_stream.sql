-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- console_pause_mail_stream(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 23619fe754a7ceb1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.console_pause_mail_stream(stream text, reason text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF app_actor_id() IS NULL OR NOT app_actor_is_person() OR NOT coalesce(app_actor_platform_permitted('feature_flag.manage'), false) THEN
    RAISE EXCEPTION 'only a platform administrator pauses a mail stream' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF stream IS DISTINCT FROM 'screening' THEN
    RAISE EXCEPTION 'only the screening stream pauses' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_only_screening_pauses';
  END IF;
  IF reason IS DISTINCT FROM 'operator' THEN
    RAISE EXCEPTION 'a stream paused by hand is paused by the operator' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_paused_reason';
  END IF;
  RETURN mail_stream_pause('operator', app_actor_id(), NULL);
END;
$function$;
ALTER FUNCTION public.console_pause_mail_stream(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.console_pause_mail_stream(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.console_pause_mail_stream(text,text) TO tp_app;
