-- Written by `pnpm db:domain-model --out` from a freshly migrated database (docs/adr/0068).
-- Never edited by hand: change the function in a new migration, then regenerate. CI fails when this file differs.

-- ledger_entry_within_line()
-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: 559ce266b8f75722
-- Trigger function of: ledger_entry.ledger_entry_within_line
CREATE OR REPLACE FUNCTION public.ledger_entry_within_line()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
DECLARE
  target ledger_entry;
  root ledger_entry;
  counted text;
  approved bigint;
  posted bigint;
  deposited bigint;
  entry_net bigint;
  bound bigint;
BEGIN
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  counted := NEW.stage;
  IF NEW.stage IN ('reversed', 'adjusted') THEN
    SELECT * INTO target FROM ledger_entry t WHERE t.id = NEW.evidence_id;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    root := target;
    IF target.stage = 'adjusted' THEN
      SELECT * INTO root FROM ledger_entry t WHERE t.id = target.evidence_id;
    END IF;
    counted := root.stage;
  END IF;
  IF NEW.service_line_id IS NOT NULL AND counted IN ('approved', 'posted', 'deposited') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('ledger_line:' || NEW.service_line_id::text, 0));
    approved := ledger_line_net(NEW.service_line_id, 'approved') + CASE WHEN counted = 'approved' THEN NEW.amount_cents ELSE 0 END;
    posted := ledger_line_net(NEW.service_line_id, 'posted') + CASE WHEN counted = 'posted' THEN NEW.amount_cents ELSE 0 END;
    deposited := ledger_line_net(NEW.service_line_id, 'deposited') + CASE WHEN counted = 'deposited' THEN NEW.amount_cents ELSE 0 END;
    IF (counted <> 'approved' OR NEW.amount_cents < 0) AND (posted > approved OR deposited > approved) THEN
      RAISE EXCEPTION 'a line''s posted and deposited never exceed what was approved for it' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF NEW.stage = 'adjusted' THEN
    SELECT target.amount_cents + coalesce(sum(c.amount_cents), 0) + NEW.amount_cents INTO entry_net
      FROM (SELECT c.amount_cents FROM ledger_entry c WHERE c.evidence_id = target.id AND c.stage IN ('reversed', 'adjusted')
            UNION ALL
            SELECT u.amount_cents FROM ledger_entry a JOIN ledger_entry u ON u.evidence_id = a.id AND u.stage = 'reversed' WHERE a.evidence_id = target.id AND a.stage = 'adjusted') c;
    IF target.stage IN ('posted', 'deposited') THEN
      SELECT coalesce((SELECT p.amount_cents FROM posting_row p WHERE p.id = target.evidence_id), (SELECT e.amount_cents FROM eft_row e WHERE e.id = target.evidence_id)) INTO bound;
    ELSE
      bound := target.amount_cents;
    END IF;
    IF bound IS NULL OR entry_net < least(0, bound) OR entry_net > greatest(0, bound) THEN
      RAISE EXCEPTION 'an adjustment keeps its entry between zero and what the entry''s evidence shows' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
ALTER FUNCTION public.ledger_entry_within_line() OWNER TO tp_owner;
REVOKE ALL ON FUNCTION public.ledger_entry_within_line() FROM PUBLIC;
