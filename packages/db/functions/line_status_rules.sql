-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_status_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 6d34625159838cf3
-- Trigger function of: line_status.line_status_rules
CREATE OR REPLACE FUNCTION public.line_status_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  current_stage text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('line_status:' || NEW.service_line_id::text, 0));
  SELECT s.stage INTO current_stage FROM line_status s WHERE s.service_line_id = NEW.service_line_id ORDER BY s.seq DESC LIMIT 1;
  IF NEW.reopened_from IS NULL THEN
    IF current_stage IS NOT NULL AND line_stage_rank(NEW.stage) <= line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason' USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    IF current_stage IS NULL OR NEW.reopened_from <> current_stage THEN
      RAISE EXCEPTION 'a reopen names the stage the line is at' USING ERRCODE = 'check_violation';
    END IF;
    IF line_stage_rank(NEW.stage) > line_stage_rank(current_stage) THEN
      RAISE EXCEPTION 'a reopen keeps the line at its stage or moves it back; moving forward is not a reopen' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.set_by IS NULL AND NEW.reopened_from NOT IN ('payer_approved', 'recovered') THEN
      RAISE EXCEPTION 'a reopen is a person''s explicit action' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.set_at := now();
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.line_status_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_status_rules() FROM PUBLIC;
