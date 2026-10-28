-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_support_notice_failed(uuid,uuid,text,boolean,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: a4d9a671b6fcc581
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_support_notice_failed(notice uuid, recipient uuid, error_name text, permanent boolean, request text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
  now_state text;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  UPDATE support_grant_notice_recipient r
     SET attempts = r.attempts + 1,
         state = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END,
         failure_code = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5
                             THEN CASE WHEN error_name ~ '^[A-Za-z]{1,64}$' THEN error_name ELSE 'Unrecognized' END END,
         next_attempt_at = CASE WHEN coalesce(permanent, false) OR r.attempts + 1 >= 5 THEN r.next_attempt_at
                                ELSE now() + make_interval(mins => (ARRAY[1, 5, 15, 60])[r.attempts + 1]) END
   WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending'
  RETURNING r.state INTO now_state;
  IF now_state = 'failed' THEN
    RETURN support_notice_report_undelivered(notice, request);
  END IF;
  RETURN false;
END;
$function$;
ALTER FUNCTION public.operator_support_notice_failed(uuid,uuid,text,boolean,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_support_notice_failed(uuid,uuid,text,boolean,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_support_notice_failed(uuid,uuid,text,boolean,text) TO tp_operator;
