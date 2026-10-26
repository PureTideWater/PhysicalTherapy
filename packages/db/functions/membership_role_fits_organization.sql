-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_role_fits_organization()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 114480521bb0ddf4
-- Trigger function of: membership.membership_role_fits_organization
CREATE OR REPLACE FUNCTION public.membership_role_fits_organization()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  kind text := organization_kind_of(NEW.organization_id);
BEGIN
  IF NOT (
    (kind = 'group' AND NEW.role IN ('practice_admin', 'billing_manager', 'analyst', 'viewer'))
    OR (kind = 'firm' AND NEW.role IN ('firm_principal', 'firm_analyst', 'billing_manager', 'analyst', 'viewer'))
    OR (kind = 'internal' AND NEW.role IN ('platform_admin', 'contract_specialist', 'reviewer', 'support'))
  ) THEN
    RAISE EXCEPTION 'role % does not belong in a % organization', NEW.role, coalesce(kind, 'missing') USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.membership_role_fits_organization() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_role_fits_organization() FROM PUBLIC;
