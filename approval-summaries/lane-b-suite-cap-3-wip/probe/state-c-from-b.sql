-- 3. line_status_head, and its backfill
-- ---------------------------------------------------------------------------------------------------

-- One row per service line with any stage event: the line's current stage and the order number (seq) of its latest
-- event. line_status_rules() is its only writer, and writing it is the line's lock (docs/adr/0083). Identifiers, a
-- stage and a number; registered, as every practice-scoped table is.
CREATE TABLE line_status_head (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  practice_id uuid NOT NULL,
  service_line_id uuid NOT NULL,
  stage text NOT NULL CHECK (stage IN ('flagged', 'validated', 'actionable', 'payer_approved', 'recovered')),
  seq bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- The upsert's arbiter, one head row per line.
CREATE UNIQUE INDEX line_status_head_once ON line_status_head (practice_id, service_line_id);
INSERT INTO phi_table_registry (table_name, registered_by, policy_name) VALUES
  ('line_status_head', '20261109090000_line_status_heads', 'line_status_head_tenant');
ALTER TABLE line_status_head ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_status_head FORCE ROW LEVEL SECURITY;
CREATE POLICY line_status_head_tenant ON line_status_head
  USING (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]))
  WITH CHECK (practice_id = ANY (current_setting('app.practice_ids', true)::uuid[]));
CREATE TRIGGER line_status_head_never_deleted BEFORE DELETE ON line_status_head FOR EACH ROW EXECUTE FUNCTION triage_never_deleted();
CREATE TRIGGER line_status_head_no_truncate BEFORE TRUNCATE ON line_status_head FOR EACH STATEMENT EXECUTE FUNCTION triage_no_truncate();
REVOKE ALL ON line_status_head FROM PUBLIC;
-- Read only, as line_status is, within the reader's practices: the generated cross-tenant and access tests read every
-- tenant table as the application role. No INSERT, UPDATE or DELETE for any login role: the trigger writes it.
GRANT SELECT ON line_status_head TO tp_app;

-- Every line's latest event, under the lock above, so no event lands between this read and the new trigger. Every
-- practice is in scope for the read and the insert (deleted ones included), as migration 20261101090000's backfill.
SELECT set_config('app.practice_ids', coalesce((SELECT array_agg(id)::text FROM practice), '{}'), true);
INSERT INTO line_status_head (practice_id, service_line_id, stage, seq)
SELECT DISTINCT ON (s.service_line_id) s.practice_id, s.service_line_id, s.stage, s.seq
  FROM line_status s
 ORDER BY s.service_line_id, s.seq DESC;
SELECT set_config('app.practice_ids', '{}', true);

-- ---------------------------------------------------------------------------------------------------
-- 5. line_status_rules(): the line's lock is its head row
-- ---------------------------------------------------------------------------------------------------

-- As before (20261023120000_recovery_ledger.sql:550-577), with the line's lock taken by writing its head row instead
-- of a per-line advisory lock, and seq drawn under it. A definer, so that the trigger is the head table's only writer
-- and nextval needs no sequence grant; row-level security still applies to its owner (FORCE) and reads the writer's
-- app.practice_ids, so a head row is written only in the writer's own practice.
CREATE OR REPLACE FUNCTION line_status_rules() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
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
$$;
REVOKE ALL ON FUNCTION line_status_rules() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- 6. The ledger triggers' lock key (the ledger freeze exception of 2026-10-27; docs/adr/0083)
-- ---------------------------------------------------------------------------------------------------

-- As before (20261027090000_packet_and_ledger_review.sql:147-198), with one line changed under the ledger freeze
-- exception the founder granted on 2026-10-27 (docs/adr/0083): the lock is the practice's ledger: key, which every
-- ledger writer holds before it writes an entry, instead of one key per posting or EFT row.
CREATE OR REPLACE FUNCTION ledger_entry_within_evidence() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
  PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));
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
$$;

-- As before (20261027090000_packet_and_ledger_review.sql:219-270), with one line changed under the same exception
-- (docs/adr/0083): the practice's ledger: key instead of one key per line.
CREATE OR REPLACE FUNCTION ledger_entry_within_line() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
    PERFORM pg_advisory_xact_lock(hashtextextended('ledger:' || NEW.practice_id::text, 0));
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
$$;
