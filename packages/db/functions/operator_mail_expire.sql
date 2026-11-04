-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_mail_expire(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: faa298581d4c5479
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_mail_expire(at_most integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  removed integer := 0;
  counted integer;
BEGIN
  IF at_most IS NULL OR at_most < 1 THEN
    RAISE EXCEPTION 'expire at least one row a run' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM screening_bounce_mark b
   WHERE (b.subject_kind, b.subject, b.ses_message_id) IN (
     SELECT x.subject_kind, x.subject, x.ses_message_id FROM screening_bounce_mark x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM mail_send m
   WHERE m.ses_message_id IN (SELECT x.ses_message_id FROM mail_send x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  removed := removed + counted;
  DELETE FROM screening_mail_refusal f
   WHERE f.recipient_sha256 IN (SELECT x.recipient_sha256 FROM screening_mail_refusal x WHERE x.expires_at <= now() ORDER BY x.expires_at LIMIT at_most);
  GET DIAGNOSTICS counted = ROW_COUNT;
  RETURN removed + counted;
END;
$function$;
ALTER FUNCTION public.operator_mail_expire(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_mail_expire(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_mail_expire(integer) TO tp_operator;
