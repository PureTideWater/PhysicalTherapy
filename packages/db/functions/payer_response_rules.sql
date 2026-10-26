-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- payer_response_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 3d3936c48b8d9488
-- Trigger function of: payer_response.payer_response_rules
CREATE OR REPLACE FUNCTION public.payer_response_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  sent record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a payer response never changes once recorded' USING ERRCODE = 'check_violation';
  END IF;
  NEW.next_window_ends_on := NULL;
  IF NEW.reopens_case THEN
    SELECT s.case_id, s.dispute_level INTO sent FROM submission s WHERE s.id = NEW.submission_id;
    IF FOUND THEN
      NEW.next_window_ends_on := case_next_dispute_window(sent.case_id, sent.dispute_level, NEW.received_on);
    END IF;
    IF NEW.next_window_ends_on IS NULL THEN
      RAISE EXCEPTION 'no next dispute window is known for this case, so the denial cannot reopen it' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.next_window_ends_on < (now() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'the next dispute window has closed, so the denial cannot reopen the case' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.payer_response_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.payer_response_rules() FROM PUBLIC;
