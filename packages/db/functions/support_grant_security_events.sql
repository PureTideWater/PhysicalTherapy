-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_grant_security_events()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: b3584867853ea265
-- Trigger function of: support_grant.support_grant_security_events
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_grant_security_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM record_security_event('support_grant', NEW.id, NEW.practice_id, 'support_grant_opened');
  ELSIF NEW.expires_at < OLD.expires_at THEN
    PERFORM record_security_event('support_grant', NEW.id, NEW.practice_id, 'grant_change');
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.support_grant_security_events() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_grant_security_events() FROM PUBLIC;
