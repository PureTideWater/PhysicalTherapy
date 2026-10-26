-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: efb897223d48b728
-- Trigger function of: membership.membership_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.membership_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  owner_path boolean := pg_has_role(current_user, 'tp_owner', 'USAGE');
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.ends_at IS NOT NULL AND OLD.ends_at <= now()
     AND (NEW.organization_id, NEW.user_id, NEW.role, NEW.ends_at) IS DISTINCT FROM (OLD.organization_id, OLD.user_id, OLD.role, OLD.ends_at) THEN
    RAISE EXCEPTION 'an ended membership never changes; invite the user again' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT owner_path AND NEW.user_id = app_actor_id() AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'nobody grants themselves a membership or changes their own role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.ends_at IS NULL OR NEW.ends_at > now() THEN
    PERFORM assert_membership_fits_user(NEW.organization_id, NEW.user_id);
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.membership_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_rules() FROM PUBLIC;
