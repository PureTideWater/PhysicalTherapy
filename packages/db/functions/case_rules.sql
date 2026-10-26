-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- case_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: e0292837d38e4bad
-- Trigger function of: case.case_rules
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.case_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  totals record;
  latest uuid;
  answer_kind text;
  answer_reopens boolean;
  answer_window date;
  derived text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.state := 'open';
    NEW.actionable_cents := 0;
    NEW.deadline_on := NULL;
    NEW.closed_at := NULL;
    NEW.opened_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.practice_id, NEW.pattern_key, NEW.payer_id, NEW.plan_id, NEW.rate_record_id, NEW.materiality_cents, NEW.pursuit_cost_cents, NEW.opened_at, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.pattern_key, OLD.payer_id, OLD.plan_id, OLD.rate_record_id, OLD.materiality_cents, OLD.pursuit_cost_cents, OLD.opened_at, OLD.created_at) THEN
    RAISE EXCEPTION 'a case''s pattern, payer, plan, rate record, materiality and pursuit estimate never change' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) AS lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL) AS open_lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL AND (
           SELECT s.stage FROM line_status s WHERE s.service_line_id = c.service_line_id ORDER BY s.seq DESC LIMIT 1
         ) IN ('payer_approved', 'recovered')) AS resolved_lines,
         count(*) FILTER (WHERE c.written_off_reason IS NULL AND EXISTS (
           SELECT 1 FROM (SELECT s.stage, s.reopened_from FROM line_status s WHERE s.service_line_id = c.service_line_id ORDER BY s.seq DESC LIMIT 1) latest
            WHERE latest.reopened_from IN ('payer_approved', 'recovered') AND latest.stage NOT IN ('payer_approved', 'recovered')
         )) AS reopened_lines,
         coalesce(sum(p.variance_cents) FILTER (WHERE c.written_off_reason IS NULL), 0) AS actionable,
         min(p.window_ends_on) FILTER (WHERE c.written_off_reason IS NULL) AS deadline
    INTO totals
    FROM case_line c JOIN priced_line p ON p.id = c.priced_line_id
   WHERE c.case_id = NEW.id;
  NEW.actionable_cents := totals.actionable;
  NEW.deadline_on := totals.deadline;
  latest := case_latest_submission(NEW.id);
  IF latest IS NOT NULL THEN
    SELECT r.kind, r.reopens_case, r.next_window_ends_on INTO answer_kind, answer_reopens, answer_window FROM payer_response r WHERE r.id = submission_latest_response(latest);
  END IF;
  IF totals.lines > 0 AND totals.open_lines = 0 THEN
    derived := 'closed_written_off';
  ELSIF totals.open_lines > 0 AND totals.resolved_lines = totals.open_lines THEN
    derived := 'resolved';
  ELSIF totals.resolved_lines > 0 THEN
    derived := 'partially_resolved';
  ELSIF totals.reopened_lines > 0 THEN
    derived := 'awaiting_response';
  ELSIF latest IS NULL THEN
    derived := 'open';
  ELSIF answer_kind IS NULL THEN
    derived := 'submitted';
  ELSIF answer_kind = 'info_requested' OR (answer_kind = 'denied' AND answer_reopens) THEN
    derived := 'awaiting_response';
  ELSIF answer_kind = 'partial' THEN
    derived := 'partially_resolved';
  ELSE
    derived := 'resolved';
  END IF;
  IF derived = 'awaiting_response' AND answer_reopens THEN
    NEW.deadline_on := answer_window;
  END IF;
  NEW.state := derived;
  NEW.closed_at := CASE WHEN derived = 'closed_written_off' THEN coalesce(OLD.closed_at, now()) END;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.case_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.case_rules() FROM PUBLIC;
