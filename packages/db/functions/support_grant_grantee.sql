-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_grant_grantee()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: decdf5063e0c761f
-- Trigger function of: support_grant.support_grant_grantee
CREATE OR REPLACE FUNCTION public.support_grant_grantee()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT pg_has_role(current_user, 'tp_owner', 'USAGE') AND NEW.user_id = app_actor_id() THEN
    RAISE EXCEPTION 'nobody grants themselves support access' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF support_grant_role(NEW.user_id) IS NULL THEN
    RAISE EXCEPTION 'a support grant goes to a support engineer, a contract specialist or a reimbursement reviewer with a current role' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.support_grant_grantee() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_grant_grantee() FROM PUBLIC;
