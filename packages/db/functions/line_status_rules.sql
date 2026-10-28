-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_status_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d2b97d48b8b792fd
-- Trigger function of: line_status.line_status_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.line_status_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  current_stage text;
  next_seq bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'a line''s stage events never change; a reopen is a new event' USING ERRCODE = 'check_violation';
  END IF;
  -- The line's lock: its head row, written first. A writer of the same line waits here until the other commits;
  -- prior.stage is the stage this event follows (null for the line's first), and seq is drawn under the lock, so a
  -- line's events sort in commit order (docs/adr/0083).
  INSERT INTO line_status_head AS h (practice_id, service_line_id, stage, seq)
  VALUES (NEW.practice_id, NEW.service_line_id, NEW.stage, NEW.seq)
  ON CONFLICT (practice_id, service_line_id)
    DO UPDATE SET stage = EXCLUDED.stage, seq = nextval('line_status_seq_seq'::regclass), updated_at = now()
  RETURNING WITH (OLD AS prior, NEW AS next) prior.stage, next.seq INTO current_stage, next_seq;
  NEW.seq := next_seq;
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
