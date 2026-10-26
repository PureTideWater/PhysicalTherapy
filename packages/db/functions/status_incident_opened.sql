-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- status_incident_opened()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 92eec267bf1252eb
-- Trigger function of: status_incident.status_incident_opened
CREATE OR REPLACE FUNCTION public.status_incident_opened()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.status := 'investigating';
  NEW.started_at := now();
  NEW.resolved_at := NULL;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.status_incident_opened() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.status_incident_opened() FROM PUBLIC;
