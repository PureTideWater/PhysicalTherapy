-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- operator_practice_administrator_emails(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e66800658c20c850
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.operator_practice_administrator_emails(target_practice uuid)
 RETURNS TABLE(email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM operator_assert_scope(target_practice);
  RETURN QUERY
  SELECT DISTINCT u.email FROM practice p
    JOIN membership m ON m.organization_id = p.organization_id
    JOIN "user" u ON u.id = m.user_id
   WHERE p.id = target_practice AND m.role = 'practice_admin' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
   ORDER BY u.email;
END;
$function$;
ALTER FUNCTION public.operator_practice_administrator_emails(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.operator_practice_administrator_emails(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.operator_practice_administrator_emails(uuid) TO tp_operator;
