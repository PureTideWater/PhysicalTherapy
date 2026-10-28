-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_entry_within_interest()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: dc69e28293d2fb44
-- Trigger function of: ledger_entry.ledger_entry_within_interest
-- Called by policy: (none)
CREATE OR REPLACE FUNCTION public.ledger_entry_within_interest()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  root ledger_entry;
  moved bigint;
  of_remittance uuid;
  reported_paid bigint;
  reported_taken bigint;
  paid_so_far bigint;
  taken_so_far bigint;
  line_net bigint;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  root := NEW;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO root FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF FOUND AND root.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = root.evidence_id;
    END IF;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
  END IF;
  IF root.stage <> 'interest' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));
  IF NEW.stage = 'interest' THEN
    SELECT -a.amount_cents, a.remittance_id INTO moved, of_remittance FROM provider_adjustment a
     WHERE a.id = NEW.evidence_id AND a.practice_id = NEW.practice_id AND a.category = 'interest' AND NEW.evidence_kind = 'provider_adjustment';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'interest is credited from the PLB L6 that pays or takes it back' USING ERRCODE = 'check_violation';
    END IF;
    SELECT coalesce(sum(c.interest_cents) FILTER (WHERE c.interest_cents > 0), 0), coalesce(-sum(c.interest_cents) FILTER (WHERE c.interest_cents < 0), 0)
      INTO reported_paid, reported_taken FROM claim c WHERE c.remittance_id = of_remittance AND c.practice_id = NEW.practice_id;
    SELECT coalesce(sum(e.amount_cents) FILTER (WHERE e.amount_cents > 0), 0), coalesce(-sum(e.amount_cents) FILTER (WHERE e.amount_cents < 0), 0)
      INTO paid_so_far, taken_so_far FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.evidence_id = NEW.evidence_id AND e.stage = 'interest';
    IF NEW.amount_cents > 0 AND paid_so_far + NEW.amount_cents > greatest(moved, 0) + reported_taken THEN
      RAISE EXCEPTION 'interest a PLB L6 pays never sums past what it paid, plus the interest its remittance reports taken back' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.amount_cents < 0 AND taken_so_far - NEW.amount_cents > greatest(-moved, 0) + reported_paid THEN
      RAISE EXCEPTION 'interest a PLB L6 takes back never sums past what it took back, plus the interest its remittance reports paid' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.amount_cents < 0 AND NEW.service_line_id IS NOT NULL THEN
    SELECT coalesce(sum(x.amount_cents), 0) + NEW.amount_cents INTO line_net FROM (
      SELECT e.amount_cents FROM ledger_entry e WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
      UNION ALL
      SELECT c.amount_cents FROM ledger_entry e JOIN ledger_entry c ON c.practice_id = e.practice_id AND c.evidence_id = e.id AND c.stage IN ('reversed', 'adjusted')
       WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
      UNION ALL
      SELECT u.amount_cents FROM ledger_entry e JOIN ledger_entry a ON a.practice_id = e.practice_id AND a.evidence_id = e.id AND a.stage = 'adjusted'
        JOIN ledger_entry u ON u.practice_id = a.practice_id AND u.evidence_id = a.id AND u.stage = 'reversed'
       WHERE e.practice_id = NEW.practice_id AND e.service_line_id = NEW.service_line_id AND e.stage = 'interest'
    ) x;
    IF line_net < 0 THEN
      RAISE EXCEPTION 'a line''s interest, net of what the payer took back, never goes below zero' USING ERRCODE = 'check_violation', CONSTRAINT = 'ledger_interest_line_floor';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_entry_within_interest() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_entry_within_interest() FROM PUBLIC;
