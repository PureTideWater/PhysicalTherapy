-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- organization_kind_of(uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9ba89ea8163257bc
-- Trigger function of: (none)
CREATE OR REPLACE FUNCTION public.organization_kind_of(target_organization uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT o.kind FROM organization o WHERE o.id = target_organization
$function$;
ALTER FUNCTION public.organization_kind_of(uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.organization_kind_of(uuid) FROM PUBLIC;
