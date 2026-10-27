-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_account_signal(text,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2684abb0a6c123b1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_account_signal(signal text, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF signal IN ('bounce_rate_alarm', 'complaint_rate_alarm') THEN
    RETURN mail_stream_pause('account_rate', NULL, request);
  ELSIF signal = 'enforcement_not_healthy' THEN
    RETURN mail_stream_pause('account_review', NULL, request);
  END IF;
  RAISE EXCEPTION 'unknown mail account signal' USING ERRCODE = 'check_violation', CONSTRAINT = 'mail_account_signal';
END;
$function$;
ALTER FUNCTION public.operator_mail_account_signal(text,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_account_signal(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_account_signal(text,text) TO tp_operator;
