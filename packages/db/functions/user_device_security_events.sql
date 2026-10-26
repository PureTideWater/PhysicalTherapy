-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- user_device_security_events()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 17e866106b038a58
-- Trigger function of: user_device.user_device_security_events
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.user_device_security_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF EXISTS (SELECT 1 FROM user_device d WHERE d.user_id = NEW.user_id AND d.id <> NEW.id) THEN
    PERFORM record_security_event('user_device', NEW.id, NULL, 'new_device_sign_in');
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.user_device_security_events() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.user_device_security_events() FROM PUBLIC;
