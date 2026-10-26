-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_line_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 8390200e0d5563a1
-- Trigger function of: case_line.case_line_rules
CREATE OR REPLACE FUNCTION public.case_line_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  window_end date;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF (NEW.written_off_text, NEW.written_off_by, NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at) IS DISTINCT FROM (NULL::text, NULL::uuid, NULL::text, NULL::uuid, NULL::timestamptz)
       OR NEW.written_off_reason IS DISTINCT FROM 'window_passed' AND NEW.written_off_reason IS NOT NULL THEN
      RAISE EXCEPTION 'a case line joins its case actionable, or struck through because its window passed' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := CASE WHEN NEW.written_off_reason IS NULL THEN NULL ELSE now() END;
    NEW.actionable := NEW.written_off_reason IS NULL;
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.case_id, NEW.service_line_id, NEW.priced_line_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.case_id, OLD.service_line_id, OLD.priced_line_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a case line''s case, service line and priced line never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT p.window_ends_on INTO window_end FROM priced_line p WHERE p.id = NEW.priced_line_id;
  IF OLD.written_off_reason IS NULL AND NEW.written_off_reason IS NOT NULL THEN
    IF NEW.written_off_by IS NULL THEN
      IF NEW.written_off_reason <> 'window_passed' OR app_actor_is_person() OR window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date THEN
        RAISE EXCEPTION 'triage writes off only a line whose window has passed; a person writes off in their own name' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.written_off_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'a line is written off by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF (NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at) IS DISTINCT FROM (OLD.reopen_reason, OLD.reopened_by, OLD.reopened_at) THEN
      RAISE EXCEPTION 'a write-off changes nothing of the line''s last reopen' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := now();
    NEW.actionable := false;
    RETURN NEW;
  END IF;
  IF OLD.written_off_reason IS NOT NULL AND NEW.written_off_reason IS NULL THEN
    IF (NEW.written_off_text, NEW.written_off_by) IS DISTINCT FROM (NULL::text, NULL::uuid) OR NEW.written_off_at IS DISTINCT FROM OLD.written_off_at THEN
      RAISE EXCEPTION 'a reopen clears the whole write-off' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reopened_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'case.work'), false) THEN
      RAISE EXCEPTION 'a written-off line is reopened by a person who works cases, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.reopen_reason IS NULL OR NEW.reopen_reason IS NOT DISTINCT FROM OLD.reopen_reason THEN
      RAISE EXCEPTION 'a reopen says why, in its own words' USING ERRCODE = 'check_violation';
    END IF;
    IF window_end IS NULL OR window_end < (now() AT TIME ZONE 'UTC')::date THEN
      RAISE EXCEPTION 'a line past its window cannot be actionable, so it is not reopened' USING ERRCODE = 'check_violation';
    END IF;
    NEW.written_off_at := NULL;
    NEW.reopened_at := now();
    NEW.actionable := true;
    RETURN NEW;
  END IF;
  IF (NEW.actionable, NEW.written_off_reason, NEW.written_off_text, NEW.written_off_by, NEW.written_off_at, NEW.reopen_reason, NEW.reopened_by, NEW.reopened_at)
     IS DISTINCT FROM (OLD.actionable, OLD.written_off_reason, OLD.written_off_text, OLD.written_off_by, OLD.written_off_at, OLD.reopen_reason, OLD.reopened_by, OLD.reopened_at) THEN
    RAISE EXCEPTION 'a case line changes only by a write-off or a reopen' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.case_line_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_line_rules() FROM PUBLIC;
