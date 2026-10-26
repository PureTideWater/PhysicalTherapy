-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_entry_rules()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: abbcba68f46fd135
-- Trigger function of: ledger_entry.ledger_entry_rules
CREATE OR REPLACE FUNCTION public.ledger_entry_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target ledger_entry;
  matched ledger_match;
  dated date;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a ledger entry is never changed or deleted; a correction is a new entry' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.stage = 'adjusted' THEN
      IF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'ledger.adjust'), false) THEN
        RAISE EXCEPTION 'a specialist corrects an amount after review, in their own name, with the ledger adjustment permission' USING ERRCODE = 'insufficient_privilege';
      END IF;
    ELSIF NEW.created_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person writes a ledger entry in their own name, with the reconciliation permission' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.created_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job writes ledger entries in no one''s name' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "case" c WHERE c.id = NEW.case_id AND c.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a ledger entry is of a case of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM case_line c WHERE c.case_id = NEW.case_id AND c.service_line_id = NEW.service_line_id) THEN
    RAISE EXCEPTION 'a ledger entry of a line is of a line of its case' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO target FROM ledger_entry t WHERE t.id = NEW.evidence_id AND t.practice_id = NEW.practice_id;
    IF NOT FOUND OR target.stage = 'reversed' OR (target.stage = 'adjusted' AND NEW.stage <> 'reversed') THEN
      RAISE EXCEPTION 'a correction names an entry of a counted stage, or a reversal an adjustment' USING ERRCODE = 'check_violation';
    END IF;
    IF (target.case_id, target.service_line_id, target.match_id) IS DISTINCT FROM (NEW.case_id, NEW.service_line_id, NEW.match_id) THEN
      RAISE EXCEPTION 'a correction is of its entry''s case, line and match' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.match_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = NEW.match_id AND m.reversed_at IS NULL) THEN
      RAISE EXCEPTION 'a correction is of an entry whose match stands; a reversed match''s entries are never corrected again' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stage = 'reversed' AND NEW.amount_cents <> -target.amount_cents THEN
      RAISE EXCEPTION 'a reversal offsets its entry exactly' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.created_by IS NULL THEN
      RAISE EXCEPTION 'a person reverses or adjusts an entry, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.allocated THEN
      RAISE EXCEPTION 'a correction is never allocated' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := target.effective_on;
    RETURN NEW;
  END IF;
  IF NEW.evidence_kind = 'payer_response' THEN
    -- An amount a payer response accepts (the submissions' table, 20261023090000), for its case.
    IF NEW.match_id IS NOT NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a recorded response, with no match' USING ERRCODE = 'check_violation';
    END IF;
    SELECT r.received_on INTO dated FROM payer_response r JOIN submission s ON s.id = r.submission_id
     WHERE r.id = NEW.evidence_id AND r.practice_id = NEW.practice_id AND s.case_id = NEW.case_id AND r.kind IN ('accepted', 'partial');
    IF dated IS NULL THEN
      RAISE EXCEPTION 'an approval from a payer response is of a response accepting an amount for its case' USING ERRCODE = 'check_violation';
    END IF;
    NEW.effective_on := dated;
    RETURN NEW;
  END IF;
  SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id AND m.practice_id = NEW.practice_id AND m.reversed_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'an entry comes from a standing match' USING ERRCODE = 'check_violation';
  END IF;
  IF matched.evidence_id IS DISTINCT FROM NEW.evidence_id OR (matched.service_line_id IS NOT NULL AND matched.service_line_id IS DISTINCT FROM NEW.service_line_id)
     OR (matched.kind IN ('posting', 'deposit') AND NEW.service_line_id IS NULL) THEN
    RAISE EXCEPTION 'an entry carries its match''s evidence, for its match''s line' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT (CASE NEW.stage
       WHEN 'approved' THEN matched.kind = 'claim' AND matched.outcome = 'approved'
       WHEN 'recouped' THEN (matched.kind = 'claim' AND matched.outcome = 'decreased') OR matched.kind = 'recoupment'
       WHEN 'interest' THEN matched.kind = 'interest'
       WHEN 'posted' THEN matched.kind = 'posting'
       ELSE matched.kind = 'deposit'
     END) THEN
    RAISE EXCEPTION 'a % entry comes from a match of its kind', NEW.stage USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.allocated IS DISTINCT FROM matched.allocated THEN
    RAISE EXCEPTION 'an entry is allocated when its match is' USING ERRCODE = 'check_violation';
  END IF;
  SELECT CASE matched.kind
           WHEN 'posting' THEN (SELECT p.posted_on FROM posting_row p WHERE p.id = matched.posting_row_id)
           WHEN 'deposit' THEN (SELECT e.deposited_on FROM eft_row e WHERE e.id = matched.eft_row_id)
           ELSE (SELECT r.bpr16_date FROM remittance r WHERE r.id = matched.remittance_id)
         END INTO dated;
  NEW.effective_on := dated;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_entry_rules() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_entry_rules() FROM PUBLIC;
