-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_probe_sent(text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 1d712c911dfd58cf
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_probe_sent(stream text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  IF stream IS NULL OR stream NOT IN ('transactional', 'notices', 'screening') THEN
    RAISE EXCEPTION 'unknown mail stream' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_stream_name';
  END IF;
  UPDATE mail_stream s SET probe_sent_at = now(), first_probe_sent_at = coalesce(s.first_probe_sent_at, now()) WHERE s.stream = stream;
END;
$function$;
ALTER FUNCTION public.operator_mail_probe_sent(text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_probe_sent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_probe_sent(text) TO tp_operator;
