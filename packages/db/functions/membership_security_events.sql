-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- membership_security_events()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e3cb30f2adcd0012
-- Trigger function of: membership.membership_security_events
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.membership_security_events()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF (NEW.ends_at IS NULL OR NEW.ends_at > now())
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
     AND (NEW.role IN ('practice_admin', 'firm_principal', 'platform_admin') OR organization_kind_of(NEW.organization_id) = 'internal') THEN
    PERFORM record_security_event('membership', NEW.id, NULL, 'role_escalation');
  END IF;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.membership_security_events() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.membership_security_events() FROM PUBLIC;
