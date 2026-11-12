-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_removal_target_holds()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 70d097c1183e8a4f
-- Trigger function of: membership.membership_removal_target_holds
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.membership_removal_target_holds()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF app_actor_id() IS NOT NULL
     AND (organization_kind_of(OLD.organization_id) = 'internal' OR organization_kind_of(NEW.organization_id) = 'internal')
     AND EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = app_actor_id() AND r.state = 'requested') THEN
    RAISE EXCEPTION 'an account whose key removal is requested changes no internal membership until the request is decided'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_removal_target_acts';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.membership_removal_target_holds() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_removal_target_holds() FROM PUBLIC;
