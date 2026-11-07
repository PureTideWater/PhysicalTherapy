-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_password_notice_failed(uuid,text,boolean,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 11734c20b5241fd1
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_password_notice_failed(notice uuid, error_name text, permanent boolean, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE password_notice p
     SET attempts = p.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         error_code = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5
                           THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR p.attempts + 1 >= 5 THEN p.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[p.attempts + 1]) END
   WHERE p.id = notice AND p.state = 'pending'
  RETURNING p.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN password_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.operator_password_notice_failed(uuid,text,boolean,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_password_notice_failed(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_password_notice_failed(uuid,text,boolean,text) TO tp_operator;
