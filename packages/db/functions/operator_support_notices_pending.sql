-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_support_notices_pending(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 0c7b06513ec36f98
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_support_notices_pending(at_most integer)
 RETURNS TABLE(notice_id uuid, practice_id uuid, user_id uuid, support_grant_id uuid, notice text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT r.notice_id, r.practice_id, r.user_id, n.support_grant_id, n.notice
    FROM support_grant_notice_recipient r JOIN support_grant_notice n ON n.id = r.notice_id
   WHERE r.state = 'pending' AND r.next_attempt_at <= now()
   ORDER BY n.notice = 'support_grant_closed', r.next_attempt_at, r.notice_id, r.user_id
   LIMIT greatest(at_most, 0)
$function$;
ALTER FUNCTION public.operator_support_notices_pending(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_support_notices_pending(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_support_notices_pending(integer) TO tp_operator;
