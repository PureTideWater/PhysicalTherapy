-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- compliance_workforce()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 7cc132ead4ab0ff3
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.compliance_workforce()
 RETURNS TABLE(user_id uuid, email text, roles text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT coalesce(app_actor_platform_permitted('compliance.manage'), false) THEN
    RAISE EXCEPTION 'the workforce list is the platform administrators''' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN QUERY
    SELECT u.id, u.email, array_agg(DISTINCT m.role ORDER BY m.role)
      FROM membership m JOIN organization o ON o.id = m.organization_id JOIN "user" u ON u.id = m.user_id
     WHERE o.kind = 'internal' AND (m.ends_at IS NULL OR m.ends_at > now()) AND u.status <> 'disabled'
     GROUP BY u.id, u.email
     ORDER BY lower(u.email), u.id;
END;
$function$;
ALTER FUNCTION public.compliance_workforce() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.compliance_workforce() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compliance_workforce() TO tp_app;
