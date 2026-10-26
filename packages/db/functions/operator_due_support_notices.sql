-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_due_support_notices(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 26a8da73c49fe312
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.operator_due_support_notices(at_most integer)
 RETURNS TABLE(support_grant_id uuid, practice_id uuid, notice text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  (SELECT s.id, s.practice_id, 'support_grant_opened'
     FROM support_grant s
    WHERE NOT EXISTS (
      SELECT 1 FROM audit_event e
       WHERE e.action = 'notice_sent' AND e.actor_kind = 'system' AND e.object_type = 'support_grant' AND e.object_id = s.id AND e.purpose = 'support_grant_opened'
    )
    ORDER BY s.created_at, s.id LIMIT at_most)
  UNION ALL
  (SELECT s.id, s.practice_id, 'support_grant_closed'
     FROM support_grant s
    WHERE s.notified_at IS NULL AND (now() >= s.expires_at OR now() >= s.created_at + interval '4 hours')
    ORDER BY s.expires_at, s.id LIMIT at_most)
$function$;
ALTER FUNCTION public.operator_due_support_notices(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_due_support_notices(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_due_support_notices(integer) TO tp_operator;
