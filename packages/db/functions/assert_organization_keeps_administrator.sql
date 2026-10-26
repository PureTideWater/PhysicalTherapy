-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- assert_organization_keeps_administrator(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 16bb83822a4c4c15
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.assert_organization_keeps_administrator(target_organization uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM practice p WHERE p.organization_id = target_organization AND p.status <> 'deleted')
     AND organization_administrator_count(target_organization) = 0 THEN
    RAISE EXCEPTION 'a practice must always keep at least one practice administrator' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;
ALTER FUNCTION public.assert_organization_keeps_administrator(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.assert_organization_keeps_administrator(uuid) FROM PUBLIC;
