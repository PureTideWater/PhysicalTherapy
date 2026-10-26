-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- status_incident_update_moves()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9596e1baaa844ddb
-- Trigger function of: status_incident_update.status_incident_update_moves
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.status_incident_update_moves()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.posted_at := now();
  IF EXISTS (SELECT 1 FROM status_incident i WHERE i.id = NEW.incident_id AND i.status = 'resolved') THEN
    RAISE EXCEPTION 'a resolved incident takes no more updates; open a new one' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE status_incident i SET status = NEW.status, resolved_at = CASE WHEN NEW.status = 'resolved' THEN now() END WHERE i.id = NEW.incident_id;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.status_incident_update_moves() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.status_incident_update_moves() FROM PUBLIC;
