-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- grant_security_events()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 24f79113967c9b5c
-- Trigger function of: grant.grant_security_events
CREATE OR REPLACE FUNCTION public.grant_security_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' OR (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL) THEN
    PERFORM record_security_event('grant', NEW.id, NEW.practice_id, 'grant_change');
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.grant_security_events() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.grant_security_events() FROM PUBLIC;
