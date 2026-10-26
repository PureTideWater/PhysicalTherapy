-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_guarded_columns()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9dc981bc2908f316
-- Trigger function of: user.user_guarded_columns
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_guarded_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_has_role(current_user, 'tp_owner', 'USAGE') OR app_actor_is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.hardware_key_required IS DISTINCT FROM OLD.hardware_key_required
     OR (NEW.status IS DISTINCT FROM OLD.status AND NOT (OLD.status = 'invited' AND NEW.status = 'active')) THEN
    RAISE EXCEPTION 'only a platform administrator changes a user''s status or hardware-key rule' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.user_guarded_columns() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_guarded_columns() FROM PUBLIC;
