-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_entry_within_evidence()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: d0bb740ca00d3883
-- Trigger function of: ledger_entry.ledger_entry_within_evidence
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.ledger_entry_within_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  root ledger_entry;
  row_id uuid;
  row_amount bigint;
  so_far bigint;
  line_row record;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF NEW.stage IN ('posted', 'deposited') THEN
    row_id := NEW.evidence_id;
  ELSIF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO root FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF FOUND AND root.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = root.evidence_id;
    END IF;
    IF NOT FOUND OR root.stage NOT IN ('posted', 'deposited') THEN
      RETURN NEW;
    END IF;
    row_id := root.evidence_id;
  ELSE
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ledger_evidence:' || row_id::text, 0));
  SELECT coalesce((SELECT p.amount_cents FROM posting_row p WHERE p.id = row_id), (SELECT e.amount_cents FROM eft_row e WHERE e.id = row_id)) INTO row_amount;
  SELECT coalesce(sum(x.amount_cents), 0) INTO so_far FROM (
    SELECT p.amount_cents FROM ledger_entry p WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
    UNION ALL
    SELECT c.amount_cents FROM ledger_entry p JOIN ledger_entry c ON c.evidence_id = p.id AND c.stage IN ('reversed', 'adjusted')
     WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
    UNION ALL
    SELECT u.amount_cents FROM ledger_entry p JOIN ledger_entry a ON a.evidence_id = p.id AND a.stage = 'adjusted' JOIN ledger_entry u ON u.evidence_id = a.id AND u.stage = 'reversed'
     WHERE p.evidence_id = row_id AND p.stage IN ('posted', 'deposited')
  ) x;
  IF row_amount IS NULL OR so_far + NEW.amount_cents > row_amount THEN
    RAISE EXCEPTION 'the posted or deposited entries of a posting or EFT row never sum past the row''s amount' USING ERRCODE = 'check_violation';
  END IF;
  IF so_far + NEW.amount_cents < 0 THEN
    RAISE EXCEPTION 'the posted or deposited entries of a posting or EFT row, their corrections included, never net below zero' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.stage = 'posted' THEN
    SELECT m.level, p.procedure_code, p.service_date INTO line_row FROM ledger_match m JOIN posting_row p ON p.id = m.posting_row_id WHERE m.id = NEW.match_id;
    IF line_row.level = 'claim' AND line_row.procedure_code IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.procedure_code = line_row.procedure_code AND (line_row.service_date IS NULL OR l.service_date = line_row.service_date)) THEN
      RAISE EXCEPTION 'a line-level posting posts only the lines of its row''s code and date of service' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_entry_within_evidence() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_entry_within_evidence() FROM PUBLIC;
