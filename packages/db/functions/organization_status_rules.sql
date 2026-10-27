-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- organization_status_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 915e244b9631ec25
-- Trigger function of: organization.organization_status_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.organization_status_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  owner_path boolean := pg_has_role(current_user, 'tp_owner', 'USAGE');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'active' THEN
      IF NOT owner_path THEN
        RAISE EXCEPTION 'an organization is created active' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_created_active';
      END IF;
      NEW.status_since := coalesce(NEW.status_since, now());
    ELSE
      NEW.status_since := NULL;
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT owner_path AND 'closed' IN (OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'a closed organization stays closed, and only its closure closes one' USING ERRCODE = 'check_violation', CONSTRAINT = 'organization_closed_by_closure_only';
    END IF;
    NEW.status_since := now();
  END IF;
  IF NEW.status IS DISTINCT FROM 'suspended' THEN
    NEW.status_reason := NULL;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.organization_status_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.organization_status_rules() FROM PUBLIC;
