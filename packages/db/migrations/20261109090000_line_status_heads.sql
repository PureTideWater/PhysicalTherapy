-- A line's stage lock lives in a row, not in the cluster's shared lock table (SUITE-CAP-1b; docs/adr/0083). After
-- migration 20261108090000.
--
-- - line_status_head: one row per service line with any stage event, holding the line's current stage and the order
--   number (seq) of its latest event. line_status_rules() is its only writer (it becomes a definer; the application
--   role may only read the table, within its practices, as it reads line_status), and writing it is the line's lock: one INSERT ... ON CONFLICT DO UPDATE ... RETURNING
--   waits for any other writer of the line, locks the row and returns the stage this event follows. The
--   pg_advisory_xact_lock per line is gone, so a 100,000-line triage or audit report no longer runs the cluster's
--   lock table out (53200 "out of shared memory"), for its own practice or for another. The protection is today's: one
--   writer per line at a time, in the same order, with the same checks and messages.
-- - seq is drawn under that lock (a line's first event keeps the value its row drew; every later one draws nextval
--   while it holds the head row), so a line's events sort in commit order and a duplicate forward event is refused.
-- - The table's key is an id, as every registered table's is (the cross-tenant tests address rows by one column); the
--   unique index line_status_head_once on (practice_id, service_line_id) is the upsert's arbiter and keeps practice_id
--   leading an index. No foreign keys: the stage event the trigger is checking carries the same references, checked in
--   the same statement, and line_status_belongs checks the line's practice.
-- - claim_by_superseded: the correction chain's lookup of the claims a claim supersedes (claimLines,
--   apps/worker/src/reconcile/remittances.ts), the twin of claim_by_reversed.
-- - Under the ledger freeze exception the founder granted on 2026-10-27 (reconciliation-001, "Ledger semantics";
--   designs/suite-cap-1-triage-locks.md section 4.5): ledger_entry_within_evidence() and ledger_entry_within_line() take
--   the practice's ledger: key, the one every ledger writer already holds (lockLedger, apps/worker/src/reconcile/
--   ledger.ts), instead of one key per posting or EFT row and per line. Nothing else in either body changes: no check,
--   refusal, message, amount, stage or entry.
--
-- Safe with the previous image running, and on rollback (ADR 0009:42-43; the previous image is SUITE-CAP-1a's, which
-- reads a month in batches):
-- - Its stage writers (triage, the audit report, opening a case, reconcile, manual ledger work, a person's reopen) run
--   the same statements and get the same refusals and messages; the head row is written inside the trigger. It reads
--   the current stage by seq DESC, unchanged and now right under concurrency. It depends on nothing this migration
--   adds, so a rollback to it on this schema runs as described here.
-- - Its large triage and audit report now complete instead of failing 53200; it does not log the new image's heap line.
-- - Its ledger writers hold the ledger: lock before any entry, so the triggers re-take a lock the transaction holds.
-- - A rollback past SUITE-CAP-1a is not supported on this schema: whole reads on this trigger would take the worker
--   down with a heap out-of-memory on a large month instead of failing 53200 (docs/adr/0083; the runbook's note).
--
-- Each deploy-window effect:
-- - The lock loop: the migration takes claim's SHARE lock and line_status's SHARE ROW EXCLUSIVE lock together with
--   NOWAIT, once a second, up to 300 tries. A refused try holds and queues nothing, so stage writers (a person's reopen
--   among them) and 835 loads go on unqueued while it waits for a moment with neither in flight. If none comes in five
--   minutes it fails with "line_status or claim stayed in use for five minutes; run the deploy again
--   (docs/adr/0083)", before any service moves, and the deploy is run again.
-- - Once held, stage writes wait for the backfill (a few seconds per million events) and the rest of this migration,
--   and 835 loads wait for the index build (seconds at launch size). No customer data exists before launch.
-- - The ledger_entry triggers are replaced in place, under the lock CREATE OR REPLACE takes on each function.

-- ---------------------------------------------------------------------------------------------------
-- 1. Preflight: the bodies this migration replaces are the ones its design read
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF position($q$'line_status:' || NEW.service_line_id$q$ IN pg_get_functiondef('line_status_rules()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'line_status_rules() is not the body of migration 20261023120000 that migration 20261109090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF position($q$'ledger_evidence:' || row_id$q$ IN pg_get_functiondef('ledger_entry_within_evidence()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ledger_entry_within_evidence() is not the body of migration 20261027090000 that migration 20261109090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF position($q$'ledger_line:' || NEW.service_line_id$q$ IN pg_get_functiondef('ledger_entry_within_line()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ledger_entry_within_line() is not the body of migration 20261027090000 that migration 20261109090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regclass('public.claim_by_superseded') IS NOT NULL THEN
    RAISE EXCEPTION 'claim_by_superseded already exists; drop section 4 of migration 20261109090000'
      USING ERRCODE = 'duplicate_object';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. The table locks, without a queue (D22)
-- ---------------------------------------------------------------------------------------------------

-- A plain LOCK TABLE would wait for every in-flight stage writer and 835 load, and queue every later one behind it for
-- as long as the longest triage or audit report holds its transaction. Each try below takes both locks in one
-- subtransaction with NOWAIT: a refused try releases what it took and queues nobody. Held to the end of the migration.
DO $$
BEGIN
  FOR attempt IN 1..300 LOOP
    BEGIN
      LOCK TABLE claim IN SHARE MODE NOWAIT;
      LOCK TABLE line_status IN SHARE ROW EXCLUSIVE MODE NOWAIT;
      RETURN;
    EXCEPTION WHEN lock_not_available THEN
      PERFORM pg_sleep(1);
    END;
  END LOOP;
  RAISE EXCEPTION 'line_status or claim stayed in use for five minutes; run the deploy again (docs/adr/0083)' USING ERRCODE = 'lock_not_available';
END;
$$;

-- ---------------------------------------------------------------------------------------------------
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
-- 4. claim_by_superseded, under the SHARE lock held since section 2
-- ---------------------------------------------------------------------------------------------------

-- claimLines' correction chain (apps/worker/src/reconcile/remittances.ts) looks claims up by the claim they
-- supersede; the twin of claim_by_reversed (docs/adr/0083).
CREATE INDEX claim_by_superseded ON claim (superseded_by_claim_id) WHERE superseded_by_claim_id IS NOT NULL;

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
