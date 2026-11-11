-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- audit_event_password_notice()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 818750e1d569ebeb
-- Trigger function of: audit_event.audit_event_password_notice
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.audit_event_password_notice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  kept boolean;
BEGIN
  SELECT u.mfa_enrolled INTO kept FROM "user" u WHERE u.id = NEW.actor_id FOR NO KEY UPDATE;
  INSERT INTO password_notice (user_id, audit_event_id, changed_at, expires_at, mfa_enrolled_at_reset)
  VALUES (NEW.actor_id, NEW.id, NEW.at, NEW.at + interval '90 days', kept)
  ON CONFLICT ON CONSTRAINT password_notice_once DO NOTHING;
  RETURN NULL;
END;
$function$;
ALTER FUNCTION public.audit_event_password_notice() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.audit_event_password_notice() FROM PUBLIC;
