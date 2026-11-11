-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_password_notices_stale(integer,text)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 04e09af840e2d487
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_password_notices_stale(at_most integer, request text)
 RETURNS TABLE(notice_id uuid, user_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  stale password_notice%ROWTYPE;
BEGIN
  FOR stale IN
    SELECT p.* FROM password_notice p
     WHERE p.state = 'pending' AND p.changed_at <= now() - interval '24 hours'
     ORDER BY p.changed_at, p.id
     LIMIT greatest(at_most, 0)
       FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE password_notice p SET state = 'failed', error_code = 'NoticeStale' WHERE p.id = stale.id;
    IF password_notice_report_undelivered(stale.id, request) THEN
      notice_id := stale.id;
      user_id := stale.user_id;
      RETURN NEXT;
    END IF;
  END LOOP;
END;
$function$;
ALTER FUNCTION public.operator_password_notices_stale(integer,text) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_password_notices_stale(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_password_notices_stale(integer,text) TO tp_operator;
