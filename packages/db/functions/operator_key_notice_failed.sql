-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_key_notice_failed(uuid,text,boolean,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 2b6e35d6883fde9a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_key_notice_failed(notice uuid, error_name text, permanent boolean, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  now_state text;
BEGIN
  UPDATE hardware_key_notice n
     SET attempts = n.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         error_code = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5
                           THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR n.attempts + 1 >= 5 THEN n.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[n.attempts + 1]) END
   WHERE n.id = notice AND n.state = 'pending'
  RETURNING n.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN hardware_key_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.operator_key_notice_failed(uuid,text,boolean,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_key_notice_failed(uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_key_notice_failed(uuid,text,boolean,text) TO tp_operator;
