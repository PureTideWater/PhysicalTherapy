-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- assert_membership_fits_user(uuid,uuid)
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e9b1e3a862e37508
-- Trigger function of: (none)
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.assert_membership_fits_user(target_organization uuid, target_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  kind text := organization_kind_of(target_organization);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('membership:' || target_user::text));
  IF kind IN ('group', 'firm') AND user_is_internal(target_user) THEN
    RAISE EXCEPTION 'an internal user cannot also belong to a practice group or a firm (internal roles have no standing access to PHI)' USING ERRCODE = 'check_violation';
  END IF;
  IF kind = 'internal' AND user_is_customer(target_user) THEN
    RAISE EXCEPTION 'a member of a practice group or a firm cannot also hold an internal role' USING ERRCODE = 'check_violation';
  END IF;
END;
$function$;
ALTER FUNCTION public.assert_membership_fits_user(uuid,uuid) OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.assert_membership_fits_user(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_membership_fits_user(uuid,uuid) TO tp_app;
