-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- line_status_ledger_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 146f2bd81224539e
-- Trigger function of: line_status.line_status_ledger_rules
CREATE OR REPLACE FUNCTION public.line_status_ledger_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  ledger_stage text;
BEGIN
  IF NOT (NEW.stage IN ('payer_approved', 'recovered') OR coalesce(NEW.reopened_from IN ('payer_approved', 'recovered'), false)) OR NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  ledger_stage := ledger_line_stage(NEW.service_line_id);
  IF NEW.stage IN ('payer_approved', 'recovered') AND (ledger_stage IS NULL OR line_stage_rank(ledger_stage) < line_stage_rank(NEW.stage)) THEN
    RAISE EXCEPTION 'the ledger holds no entries that put the line at %: nothing counts as recovered without a posted or deposited entry', NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.reopened_from IS NOT NULL AND NEW.set_by IS NULL
     AND (NEW.stage IS DISTINCT FROM coalesce(ledger_stage, 'actionable') OR line_stage_rank(coalesce(ledger_stage, 'actionable')) >= line_stage_rank(NEW.reopened_from)) THEN
    RAISE EXCEPTION 'the ledger moves a line back only to the stage its entries leave it at' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.line_status_ledger_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.line_status_ledger_rules() FROM PUBLIC;
