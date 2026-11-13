-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_session_hardware_key()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 67cd43499cedac80
-- Trigger function of: user_session.user_session_hardware_key
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_session_hardware_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM 1 FROM "user" u WHERE u.id = NEW.user_id FOR NO KEY UPDATE;
  IF NEW.mfa_method = 'webauthn' THEN
    IF NEW.key_credential_sha256 IS NOT NULL THEN
      IF octet_length(NEW.key_credential_sha256) = 32
         AND NOT EXISTS (SELECT 1 FROM hardware_key k
                          WHERE k.user_id = NEW.user_id AND k.credential_sha256 = NEW.key_credential_sha256 AND k.removed_at IS NULL) THEN
        RAISE EXCEPTION 'a key session opens only for a registered hardware key of its account'
          USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_hardware_key_live';
      END IF;
    ELSIF EXISTS (SELECT 1 FROM hardware_key k WHERE k.user_id = NEW.user_id)
          OR EXISTS (SELECT 1 FROM hardware_key_removal r WHERE r.user_id = NEW.user_id AND r.state = 'confirmed') THEN
      RAISE EXCEPTION 'a key session of an account in the key registry names its key'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_hardware_key_live';
    END IF;
  ELSIF account_key_registration_closed(NEW.user_id) THEN
    RAISE EXCEPTION 'an account whose hardware keys were removed opens no session until a new key is registered'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'user_session_key_registration_closed';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.user_session_hardware_key() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_session_hardware_key() FROM PUBLIC;
