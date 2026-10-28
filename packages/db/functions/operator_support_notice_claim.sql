-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_support_notice_claim(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 051d1e85151cd3f6
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_support_notice_claim(notice uuid, recipient uuid)
 RETURNS TABLE(email text, reads bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
DECLARE
  held support_grant_notice%ROWTYPE;
BEGIN
  SELECT n.* INTO held FROM support_grant_notice n WHERE n.id = notice;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown support grant notice' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM operator_assert_scope(held.practice_id);
  PERFORM 1 FROM support_grant_notice_recipient r
    WHERE r.notice_id = notice AND r.user_id = recipient AND r.state = 'pending' AND r.next_attempt_at <= now()
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT u.email, (SELECT count(*) FROM audit_event e WHERE e.grant_id = held.support_grant_id AND e.action = 'read') FROM "user" u WHERE u.id = recipient;
END;
$function$;
ALTER FUNCTION public.operator_support_notice_claim(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_support_notice_claim(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_support_notice_claim(uuid,uuid) TO tp_operator;
