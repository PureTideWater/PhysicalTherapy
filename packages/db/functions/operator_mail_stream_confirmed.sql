-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_stream_confirmed(text,boolean)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 58a4b66cc84c84e4
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_stream_confirmed(stream text, enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  confirmed timestamptz;
BEGIN
  IF stream IS NULL OR stream NOT IN ('transactional', 'notices', 'screening') OR enabled IS NULL THEN
    RAISE EXCEPTION 'unknown mail stream' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_name';
  END IF;
  IF enabled THEN
    UPDATE mail_stream s SET ses_enabled_confirmed_at = now() WHERE s.stream = stream AND s.paused_at IS NULL AND s.ses_enabled_confirmed_at IS NULL;
  ELSE
    UPDATE mail_stream s SET ses_enabled_confirmed_at = NULL WHERE s.stream = stream AND s.ses_enabled_confirmed_at IS NOT NULL;
  END IF;
  SELECT s.ses_enabled_confirmed_at INTO confirmed FROM mail_stream s WHERE s.stream = stream;
  RETURN confirmed IS NOT NULL;
END;
$function$;
ALTER FUNCTION public.operator_mail_stream_confirmed(text,boolean) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_stream_confirmed(text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_stream_confirmed(text,boolean) TO tp_operator;
