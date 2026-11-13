-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- hardware_key_is_final()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e5bb6c78b2c1334a
-- Trigger function of: hardware_key.hardware_key_is_final
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.hardware_key_is_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a hardware key''s record is never deleted' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_is_final';
  END IF;
  IF (NEW.id, NEW.user_id, NEW.credential_sha256, NEW.public_key, NEW.registered_at, NEW.registered_request_id)
       IS DISTINCT FROM (OLD.id, OLD.user_id, OLD.credential_sha256, OLD.public_key, OLD.registered_at, OLD.registered_request_id)
     OR (OLD.removed_at IS NOT NULL AND (NEW.removed_at, NEW.removal_id) IS DISTINCT FROM (OLD.removed_at, OLD.removal_id)) THEN
    RAISE EXCEPTION 'a hardware key''s record changes only by its removal, once' USING ERRCODE = 'check_violation', CONSTRAINT = 'hardware_key_is_final';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.hardware_key_is_final() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.hardware_key_is_final() FROM PUBLIC;
