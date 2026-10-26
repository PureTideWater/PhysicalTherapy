-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- support_ticket_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 4a090c61fdc7f2e9
-- Trigger function of: support_ticket.support_ticket_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.support_ticket_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'open';
    NEW.status_changed_by := NULL;
    NEW.status_changed_at := NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.number, NEW.requester_id, NEW.screen, NEW.category, NEW.subject, NEW.message, NEW.created_at, NEW.source, NEW.mail_ref)
     IS DISTINCT FROM (OLD.id, OLD.number, OLD.requester_id, OLD.screen, OLD.category, OLD.subject, OLD.message, OLD.created_at, OLD.source, OLD.mail_ref) THEN
    RAISE EXCEPTION 'a ticket keeps what its requester wrote' USING ERRCODE = 'check_violation';
  END IF;
  NEW.status_changed_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.support_ticket_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.support_ticket_rules() FROM PUBLIC;
