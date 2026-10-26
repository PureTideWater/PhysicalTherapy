-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_device_revocation_is_final()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6febf97093b3e8de
-- Trigger function of: user_device.user_device_revocation_is_final
CREATE OR REPLACE FUNCTION public.user_device_revocation_is_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'a revoked device stays revoked; sign in again as a new device' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.user_device_revocation_is_final() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_device_revocation_is_final() FROM PUBLIC;
