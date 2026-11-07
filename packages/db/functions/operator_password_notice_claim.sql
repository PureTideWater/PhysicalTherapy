-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_password_notice_claim(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 71c91bc39c2d902a
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_password_notice_claim(notice uuid)
 RETURNS TABLE(user_id uuid, email text, changed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
#variable_conflict use_variable
BEGIN
  PERFORM 1 FROM password_notice p
    WHERE p.id = notice AND p.state = 'pending' AND p.next_attempt_at <= now() AND p.changed_at > now() - interval '24 hours'
      FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.user_id, u.email, p.changed_at FROM password_notice p JOIN "user" u ON u.id = p.user_id WHERE p.id = notice;
END;
$function$;
ALTER FUNCTION public.operator_password_notice_claim(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_password_notice_claim(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_password_notice_claim(uuid) TO tp_operator;
