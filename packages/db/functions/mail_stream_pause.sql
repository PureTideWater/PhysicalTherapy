-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- mail_stream_pause(text,uuid,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0e5bcfa22d6f3411
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.mail_stream_pause(reason text, actor uuid, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  counted record;
BEGIN
  SELECT w.sends, w.bounces, w.complaints INTO counted FROM mail_window_counts('screening') w;
  UPDATE mail_stream s
     SET paused_at = now(), paused_reason = reason, paused_by = actor, pause_sends = counted.sends, pause_bounces = counted.bounces,
         pause_complaints = counted.complaints, ses_enabled_confirmed_at = NULL
   WHERE s.stream = 'screening' AND s.paused_at IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  INSERT INTO audit_event (actor_id, actor_kind, action, object_type, purpose, request_id)
  VALUES (actor, CASE WHEN actor IS NULL THEN 'system' ELSE 'user' END, 'mail_stream_paused', 'mail_stream', reason, request);
  RETURN true;
END;
$function$;
ALTER FUNCTION public.mail_stream_pause(text,uuid,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.mail_stream_pause(text,uuid,text) FROM PUBLIC;
