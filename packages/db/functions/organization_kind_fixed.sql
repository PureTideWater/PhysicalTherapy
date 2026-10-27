-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- organization_kind_fixed()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d5a3d13bd118aac9
-- Trigger function of: organization.organization_kind_fixed
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.organization_kind_fixed()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.kind <> OLD.kind THEN
    RAISE EXCEPTION 'organization kind is fixed at creation' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.organization_kind_fixed() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.organization_kind_fixed() FROM PUBLIC;
