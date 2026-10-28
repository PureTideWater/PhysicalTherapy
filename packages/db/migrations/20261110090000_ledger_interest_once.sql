-- Interest is credited once, from the PLB L6 that pays or takes it back (the interest fix; docs/adr/0084). After
-- migration 20261109090000.
--
-- Under the ledger freeze exception the founder granted on 2026-10-27 (reconciliation-001, "Ledger semantics";
-- designs/ledger-interest-once.md section 10.1), and nothing beyond it:
-- - ledger_match_evidence: an interest match may carry both the PLB L6 (provider_adjustment_id) and the claim it is
--   for (claim_id). Every stored interest match carries one of the two, so the CHECK validates.
-- - ledger_match.seq, an identity, and the unique index ledger_match_by_seq on (practice_id, seq): the order the
--   ledger made its matches in. Every match of one reconcile shares matched_at (the transaction's time), so readers
--   broke the tie by the match's random id. Stored rows are numbered in their stored order.
-- - ledger_entry_sign: an interest entry is any amount but zero, so a PLB L6 that takes interest back writes a negative
--   one. Every stored interest entry is positive, so the CHECK validates.
-- - ledger_match_rules(), recreated on the body of migration 20261023120000 (no later migration redefines it): seq
--   never changes; the reconcile job's interest match carrying only one of the two records (the image before this
--   change) is skipped; and an interest match is from a PLB L6 of its remittance, for a claim the line has a standing
--   claim or interest match to. The trigger ledger_match_rules is unchanged.
-- - ledger_entry_within_interest(), a new BEFORE INSERT trigger on ledger_entry: a PLB L6's interest entries of each
--   sign never sum past what it moved, netted only against the interest its remittance's claims report the other way;
--   and a line's interest, net of corrections and take-backs, never goes below zero. Row triggers fire in name order,
--   so it runs after ledger_entry_rules (the match and the evidence checked) and ledger_entry_within_evidence, and
--   before ledger_entry_within_line. It takes the practice's ledger: lock, the one every ledger writer already holds
--   (lockLedger, apps/worker/src/reconcile/ledger.ts), so two inserts never both pass a bound and no per-row lock is
--   added.
-- - claim_by_superseded, the correction chain's lookup that the 10.1 clause names "unless SUITE-CAP-1 has made it", is
--   SUITE-CAP-1b's (migration 20261109090000), which satisfies that clause; this migration adds no index on claim.
-- No table, policy or grant changes: ledger_match, ledger_entry and claim keep ENABLE and FORCE ROW LEVEL SECURITY and
-- their tenant policies; tp_app keeps SELECT on ledger_match (table-wide, so it reads seq) and its INSERT column list,
-- which leaves seq to the identity. Both functions are SECURITY INVOKER, set search_path, set no app.practice_ids, and
-- are revoked from PUBLIC; no role is granted the new one (the trigger calls it). Runs as tp_owner.
--
-- Safe with the previous image running, and on rollback (ADR 0009:42-43; docs/adr/0084 D16):
-- - Its reconcile runs whole. Its interest matches carry only the claim (AMT I) or only the PLB L6, so
--   ledger_match_rules skips them (no row, no error); recordInterest then finds no match and writes no interest entry,
--   and everything else it writes (claims, recoupments, postings, deposits, stages, notices, statements) stands. The
--   current image then credits the interest once.
-- - Its inserts name no seq, so the identity numbers them; its reads order by matched_at, id as before.
-- - A person's match or ledger action is unchanged; a person's interest match carrying one record is refused, as
--   no screen of either image offers one.
-- - Its web reads the new rows: a match carrying both records reads as PLB L6 interest, and a negative interest entry
--   shows its amount with a minus.
-- - A rollback of the image keeps this schema, and the previous image behaves as above until the image rolls forward.
--
-- Each deploy-window effect:
-- - Adding seq rewrites ledger_match, and the two CHECKs validate, under ACCESS EXCLUSIVE locks on ledger_match and
--   ledger_entry held to the end of this migration: a reconcile, a person's ledger action or a page reading the ledger
--   during it waits, then proceeds (well under a second at launch size; no customer data exists before launch). A
--   reconcile already running holds its locks, and this migration waits for it to commit.
-- - ledger_match_rules() is replaced in place, under the lock CREATE OR REPLACE takes on the function; the new trigger
--   is created under ledger_entry's lock above.

-- ---------------------------------------------------------------------------------------------------
-- Preflight: the body this migration replaces is the one its design read, and what it relies on exists
-- ---------------------------------------------------------------------------------------------------

DO $$
BEGIN
  IF position($q$'interest is a PLB L6 or a claim''s interest of its remittance'$q$ IN pg_get_functiondef('ledger_match_rules()'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'ledger_match_rules() is not the body of migration 20261023120000 that migration 20261110090000 replaces; rebase this migration on its latest body'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regprocedure('ledger_entry_within_interest()') IS NOT NULL THEN
    RAISE EXCEPTION 'ledger_entry_within_interest() already exists; migration 20261110090000 creates it'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF to_regclass('public.claim_by_superseded') IS NULL THEN
    RAISE EXCEPTION 'claim_by_superseded does not exist; migration 20261110090000 relies on migration 20261109090000''s index for the correction chain''s walk'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 1. An interest match may carry both the PLB L6 that pays (or takes back) the interest and the claim it is for
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE ledger_match DROP CONSTRAINT ledger_match_evidence;
ALTER TABLE ledger_match ADD CONSTRAINT ledger_match_evidence CHECK (
  CASE kind
    WHEN 'claim' THEN claim_id IS NOT NULL AND num_nonnulls(posting_row_id, eft_row_id, provider_adjustment_id, level) = 0 AND service_line_id IS NOT NULL AND outcome IS NOT NULL
    WHEN 'posting' THEN posting_row_id IS NOT NULL AND num_nonnulls(eft_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('claim', 'check')
      AND (claim_id IS NOT NULL) = (level = 'claim')
    WHEN 'deposit' THEN eft_row_id IS NOT NULL AND num_nonnulls(claim_id, posting_row_id, provider_adjustment_id, service_line_id, outcome) = 0 AND level IN ('check', 'batch')
    WHEN 'interest' THEN num_nonnulls(claim_id, provider_adjustment_id) >= 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL
    ELSE num_nonnulls(claim_id, provider_adjustment_id) = 1 AND num_nonnulls(posting_row_id, eft_row_id, outcome, level) = 0 AND service_line_id IS NOT NULL
  END
);

-- ---------------------------------------------------------------------------------------------------
-- 2. The order the ledger made its matches in
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE ledger_match ADD COLUMN seq bigint GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX ledger_match_by_seq ON ledger_match (practice_id, seq);

-- ---------------------------------------------------------------------------------------------------
-- 3. Interest taken back by the payer is a negative interest entry
-- ---------------------------------------------------------------------------------------------------

ALTER TABLE ledger_entry DROP CONSTRAINT ledger_entry_sign;
ALTER TABLE ledger_entry ADD CONSTRAINT ledger_entry_sign CHECK (
  CASE stage
    WHEN 'recouped' THEN amount_cents < 0
    WHEN 'reversed' THEN amount_cents <> 0
    WHEN 'adjusted' THEN amount_cents <> 0
    WHEN 'interest' THEN amount_cents <> 0
    ELSE amount_cents > 0
  END
);

-- ---------------------------------------------------------------------------------------------------
-- 4. ledger_match_rules(): seq never changes; the previous image's one-record interest match is skipped; interest is
--    matched from a PLB L6 of its remittance, for a claim the line has a standing claim or interest match to
-- ---------------------------------------------------------------------------------------------------

-- As before (20261023120000_recovery_ledger.sql:314-374), changed in exactly three places under the ledger freeze
-- exception the founder granted on 2026-10-27 (reconciliation-001, "Ledger semantics"; designs/ledger-interest-once.md
-- section 10.1; docs/adr/0084): seq in both tuples of the immutability check; the ELSIF that skips the job's
-- one-record interest match, after the actor checks so a person's insert of that shape reaches the interest branch and
-- is refused; and the interest branch, which replaces "interest is a PLB L6 or a claim's interest of its remittance".
CREATE OR REPLACE FUNCTION ledger_match_rules() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a match is never deleted; it is reversed' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.id, NEW.practice_id, NEW.seq, NEW.kind, NEW.claim_id, NEW.posting_row_id, NEW.eft_row_id, NEW.provider_adjustment_id, NEW.remittance_id, NEW.service_line_id, NEW.outcome, NEW.level,
        NEW.allocated, NEW.matched_by, NEW.matched_at, NEW.created_at)
       IS DISTINCT FROM (OLD.id, OLD.practice_id, OLD.seq, OLD.kind, OLD.claim_id, OLD.posting_row_id, OLD.eft_row_id, OLD.provider_adjustment_id, OLD.remittance_id, OLD.service_line_id, OLD.outcome, OLD.level,
        OLD.allocated, OLD.matched_by, OLD.matched_at, OLD.created_at) THEN
      RAISE EXCEPTION 'a match never changes; it is reversed' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.reversed_at IS NOT NULL THEN
      RAISE EXCEPTION 'a match is reversed once' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.reversal_reason IS NULL OR NEW.reversed_by IS DISTINCT FROM app_actor_id() OR NOT app_actor_is_person()
       OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a match is reversed by a person who reconciles postings, in their own name, with a reason' USING ERRCODE = 'insufficient_privilege';
    END IF;
    NEW.reversed_at := now();
    RETURN NEW;
  END IF;
  IF (NEW.reversed_by, NEW.reversed_at, NEW.reversal_reason) IS DISTINCT FROM (NULL::uuid, NULL::timestamptz, NULL::text) THEN
    RAISE EXCEPTION 'a match is recorded standing' USING ERRCODE = 'check_violation';
  END IF;
  NEW.matched_at := now();
  IF NOT practice_in_scope(NEW.practice_id) THEN
    RETURN NEW;
  END IF;
  IF app_actor_is_person() THEN
    IF NEW.matched_by IS DISTINCT FROM app_actor_id() OR NOT coalesce(app_actor_permitted(NEW.practice_id, 'posting.reconcile'), false) THEN
      RAISE EXCEPTION 'a person who reconciles postings matches by hand, in their own name' USING ERRCODE = 'insufficient_privilege';
    END IF;
  ELSIF NEW.matched_by IS NOT NULL THEN
    RAISE EXCEPTION 'the reconcile job matches in no one''s name' USING ERRCODE = 'insufficient_privilege';
  ELSIF NEW.kind = 'interest' AND num_nonnulls(NEW.claim_id, NEW.provider_adjustment_id) = 1 THEN
    -- The reconcile job of the image before docs/adr/0084, during a deploy or after a rollback: it credits interest
    -- from AMT I or the PLB L6 alone. Its insert is skipped (no row, no error), so the rest of its reconcile stands and
    -- the current image credits the interest once. The current image writes both records on every interest match.
    RETURN NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM remittance r WHERE r.id = NEW.remittance_id AND r.practice_id = NEW.practice_id AND r.status = 'loaded') THEN
    RAISE EXCEPTION 'a match is to a loaded remittance of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.service_line_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM service_line l WHERE l.id = NEW.service_line_id AND l.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a match is to a service line of its practice' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.kind = 'claim' AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code <> '22') THEN
    RAISE EXCEPTION 'a claim match is of a claim of its remittance, never a reversal' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'posting' AND (NOT EXISTS (SELECT 1 FROM posting_row p WHERE p.id = NEW.posting_row_id AND p.practice_id = NEW.practice_id)
        OR (NEW.claim_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id))) THEN
    RAISE EXCEPTION 'a posting match is of a posting row of its practice, and a line-level one of a claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'deposit' AND NOT EXISTS (SELECT 1 FROM eft_row e WHERE e.id = NEW.eft_row_id AND e.practice_id = NEW.practice_id) THEN
    RAISE EXCEPTION 'a deposit match is of an EFT row of its practice' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'recoupment' AND NOT (
          EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'recoupment')
          OR EXISTS (SELECT 1 FROM claim c WHERE c.id = NEW.claim_id AND c.remittance_id = NEW.remittance_id AND c.claim_status_code = '22')) THEN
    RAISE EXCEPTION 'a recoupment is a PLB WO or a reversing claim of its remittance' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND (NEW.provider_adjustment_id IS NULL OR NEW.claim_id IS NULL
        OR NOT EXISTS (SELECT 1 FROM provider_adjustment a WHERE a.id = NEW.provider_adjustment_id AND a.remittance_id = NEW.remittance_id AND a.category = 'interest')) THEN
    RAISE EXCEPTION 'interest is matched from a PLB L6 of its remittance, for a claim' USING ERRCODE = 'check_violation';
  ELSIF NEW.kind = 'interest' AND NOT EXISTS (
          SELECT 1 FROM ledger_match c WHERE c.practice_id = NEW.practice_id AND c.service_line_id = NEW.service_line_id AND c.claim_id = NEW.claim_id
             AND c.kind IN ('claim', 'interest') AND c.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'interest reaches a line only through a claim the line has a standing match to' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION ledger_match_rules() FROM PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- 5. ledger_entry_within_interest(): interest a PLB L6 pays or takes back never sums past what it moved, netted only
--    against the interest its remittance's claims report the other way; and a line's interest, net of corrections
--    and take-backs, never goes below zero
-- ---------------------------------------------------------------------------------------------------

-- New under the ledger freeze exception the founder granted on 2026-10-27 (reconciliation-001, "Ledger semantics";
-- designs/ledger-interest-once.md section 10.1; docs/adr/0084). A function of its own rather than a branch of
-- ledger_entry_within_evidence() or ledger_entry_within_line(), whose checks stay frozen. It locks the practice's
-- ledger: key, which every ledger writer holds before it writes an entry.
CREATE FUNCTION ledger_entry_within_interest() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$
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
$$;
CREATE TRIGGER ledger_entry_within_interest BEFORE INSERT ON ledger_entry FOR EACH ROW EXECUTE FUNCTION ledger_entry_within_interest();
REVOKE ALL ON FUNCTION ledger_entry_within_interest() FROM PUBLIC;
