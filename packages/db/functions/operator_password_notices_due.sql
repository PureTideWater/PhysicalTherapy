-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_password_notices_due(integer)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d3ca686c261a2915
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_password_notices_due(at_most integer)
 RETURNS TABLE(notice_id uuid, user_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT p.id, p.user_id
    FROM password_notice p
   WHERE p.state = 'pending' AND p.next_attempt_at <= now() AND p.changed_at > now() - interval '24 hours'
   ORDER BY p.next_attempt_at, p.id
   LIMIT greatest(at_most, 0)
$function$;
ALTER FUNCTION public.operator_password_notices_due(integer) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_password_notices_due(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_password_notices_due(integer) TO tp_operator;
