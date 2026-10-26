-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- contract_calendar_event_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 9d49e01ff62b1725
-- Trigger function of: contract_calendar_event.contract_calendar_event_rules
CREATE OR REPLACE FUNCTION public.contract_calendar_event_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a calendar event never changes; signing off a new version derives new events' USING ERRCODE = 'check_violation';
  END IF;
  IF practice_in_scope(NEW.practice_id) AND NOT EXISTS (SELECT 1 FROM contract c WHERE c.id = NEW.contract_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a calendar event belongs to a contract of the same practice' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.contract_calendar_event_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.contract_calendar_event_rules() FROM PUBLIC;
