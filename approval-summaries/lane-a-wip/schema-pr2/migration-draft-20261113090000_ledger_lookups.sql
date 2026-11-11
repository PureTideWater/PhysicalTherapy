-- The ledger's two lookups, written so that a first reconcile pass reads each row through the index that finds it
-- (SUITE-CAP-3's hand-on to the schema chain; docs/adr/0087, the dated note of 2026-11-11).
--
-- Under the ledger freeze exception the founder granted on 2026-11-06 at about 22:40 UTC (reconciliation-001, "Ledger
-- semantics"), and nothing beyond it: new bodies for two ledger functions, each written below exactly as the founder
-- read it, down to the byte.
-- - ledger_line_net(uuid, text): the sum of a line's entries counted at one stage, which ledger_entry_within_line()
--   reads three times for each new approved, posted or deposited entry.
-- - ledger_entry_rules(): the checks on each new entry. Two statements change, the two that read the entry's match;
--   the rest of the function is unchanged word for word.
-- Each function gives the same answer for every line and stage, and refuses the same entries with the same message
-- and SQLSTATE, as its body of migration 20261027090000 does. No table, column, index, trigger, policy, grant, amount,
-- stage, rule or refusal changes. CREATE OR REPLACE keeps each function's identity, owner and grants (ledger_line_net
-- stays granted to tp_app and to no one else; ledger_entry_rules to no one, as a trigger function), and the trigger
-- ledger_entry_rules on ledger_entry is untouched. Both stay SECURITY INVOKER with the same search_path; neither sets
-- app.practice_ids or app.actor_id. Runs as tp_owner.
--
-- Why: inside a reconcile pass the planner has no statistics for the ledger rows the pass is writing (ANALYZE cannot
-- see them), and each function is planned on the ledger as the pass found it. On a new deployment's ledger (empty,
-- never analyzed) each chose a slow way to find one row and kept it for the pass: ledger_line_net read every entry
-- of the practice to find one line's entries (through ledger_entry_by_date, the line as a filter), and
-- ledger_entry_rules read every standing match of the practice to find the entry's one match (through
-- ledger_match_standing, the match's id as a filter). Measured on SYNTHETIC practices, with the states the new
-- ledger_line_net does not help in: docs/adr/0087, the dated note of 2026-11-11.
--
-- Safe with the previous image running, and on rollback: no image reads either function's text, and each answers
-- and refuses as before, so an image before or after this migration writes the same ledger. It holds no lock a
-- reader or a writer of the ledger waits for: CREATE OR REPLACE FUNCTION replaces the function's own catalog row, and
-- checking ledger_line_net's new body takes ACCESS SHARE on ledger_entry and service_line, the lock every SELECT
-- takes. So a reconcile, a person's ledger action and a page reading the ledger go on beside it, and each
-- transaction calls the new body from its next call after this migration commits. Nothing is backfilled and no
-- stored row is read or written.

-- ---------------------------------------------------------------------------------------------------
-- 1. Preflight: the bodies this migration replaces are the ones the founder's exception was granted on
-- ---------------------------------------------------------------------------------------------------

-- Each replaced function's stored body (pg_proc.prosrc, the text between its dollar quotes) is compared whole, by
-- SHA-256; packages/db/functions prints the first 16 digits of the same hash. The two values are those of a database
-- migrated to 20261112090000, where both bodies are still those of migration 20261027090000. A migration that comes
-- to sort before this one and changes either body makes this one refuse: the exception covers these two bodies in
-- place of those two, so a different starting body needs the founder's ruling again, never a silent rebase.
DO $$
BEGIN
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('ledger_line_net(uuid, text)'))
     IS DISTINCT FROM 'f151e27ea09f28c1da80430ad29190e0f4f1988c219db232ed6e0bdb5b6e5a64' THEN
    RAISE EXCEPTION 'ledger_line_net(uuid, text) is not the body of migration 20261027090000 that migration 20261113090000 replaces; the ledger freeze exception of 2026-11-06 covers no other'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF (SELECT encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') FROM pg_proc p WHERE p.oid = to_regprocedure('ledger_entry_rules()'))
     IS DISTINCT FROM 'abbcba68f46fd135f269175642bf0e68fe7ccd9ed34587ae080f94275d7a2572' THEN
    RAISE EXCEPTION 'ledger_entry_rules() is not the body of migration 20261027090000 that migration 20261113090000 replaces; the ledger freeze exception of 2026-11-06 covers no other'
      USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------------------------------
-- 2. ledger_line_net: a line's entries by the line's practice and the line
-- ---------------------------------------------------------------------------------------------------

-- The same sum as before (20261027090000_packet_and_ledger_review.sql:203-210):
-- - Every entry the application or a migration can store carries its line's practice: an entry written in scope is
--   of a case of its practice and of a line of that case (ledger_entry_rules; case_line_belongs;
--   priced_line_rows_belong), and the tenant policy refuses any entry outside the scope. A service line never changes
--   practice: the application role holds no UPDATE on service_line, and no migration or function updates its
--   practice_id. (The owner role or a superuser could, by hand; that would part the line from its own claim, priced
--   lines and case, and this function would then count none of the line's entries where it counted them before.) So
--   the line's practice, read from service_line under the same tenant predicate as the ledger's, drops no entry. A
--   line the scope cannot read, a line that is no row and no line at all give 0, as before.
-- - A reversal or an adjustment still counts as the stage of the entry it finally corrects (its target, or the
--   target's target when the target is itself an adjustment), each read by primary key, at most one row; one whose
--   target is missing still counts as nothing; every other entry counts as its own stage.
-- - A sum of whole cents does not depend on the order its rows are read in.
-- DO NOT SIMPLIFY: the practice condition and the ORDER BY e.seq change no answer. They are there only for the plan:
-- on a ledger that is empty or holds its first rows and was never analyzed, the line's practice as an equality and an
-- order that ledger_entry_by_line (practice_id, service_line_id, seq) returns for free make the planner read the
-- line's entries through that index. Take either out and every correctness test still passes while each call of a
-- first pass reads the practice's whole ledger again. apps/worker/src/reconcile/ledger-lookups.db.test.ts plans this
-- body as it is installed and fails then.
-- Known limit (measured on PostgreSQL 18.4; docs/adr/0087, the dated note): on a never-analyzed ledger that already
-- holds a few hundred to some tens of thousands of entries the planner still takes ledger_entry_by_date for this
-- read. Automatic analysis ends that state, and with statistics the line index is taken.
CREATE OR REPLACE FUNCTION public.ledger_line_net(line uuid, counted text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
  SELECT coalesce(sum(x.amount_cents), 0)::bigint
    FROM (SELECT e.amount_cents, e.stage, e.evidence_id
            FROM ledger_entry e
           WHERE e.practice_id = (SELECT l.practice_id FROM service_line l WHERE l.id = line)
             AND e.service_line_id = line
           ORDER BY e.seq) x
   WHERE CASE WHEN x.stage IN ('reversed', 'adjusted')
              THEN (SELECT CASE WHEN t.stage = 'adjusted' THEN (SELECT r.stage FROM ledger_entry r WHERE r.id = t.evidence_id) ELSE t.stage END
                      FROM ledger_entry t WHERE t.id = x.evidence_id)
              ELSE x.stage END = counted
$function$;

-- ---------------------------------------------------------------------------------------------------
-- 3. ledger_entry_rules: an entry's match by the match's primary key alone
-- ---------------------------------------------------------------------------------------------------

-- As before (20261027090000_packet_and_ledger_review.sql:50-143), with two statements changed:
-- - a correction's match: NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.id = NEW.match_id AND m.reversed_at IS
--   NULL) becomes (SELECT m.reversed_at IS NULL FROM ledger_match m WHERE m.id = NEW.match_id) IS NOT TRUE. No row
--   gives NULL and a reversed match gives false, and neither IS TRUE: both are refused, as before.
-- - an entry's match: the practice and the standing conditions move out of the query's WHERE and into the IF that
--   follows it. No row, a match of another practice and a reversed match are each refused, as before, with the same
--   message; a match that passes is the row the old query read.
-- A match's id is its primary key, so each query reads at most one row.
-- DO NOT SIMPLIFY: reversed_at IS NULL stays out of both queries' WHERE, only for the plan. With it there, a planner
-- that knows nothing of ledger_match may take the partial index ledger_match_standing (the standing matches) with the
-- id as a filter, and read every standing match for each entry; without it only ledger_match_pkey fits.
-- apps/worker/src/reconcile/ledger-lookups.db.test.ts plans both queries as they are installed and fails then.
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
    IF NEW.match_id IS NOT NULL AND (SELECT m.reversed_at IS NULL FROM ledger_match m WHERE m.id = NEW.match_id) IS NOT TRUE THEN
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
  SELECT * INTO matched FROM ledger_match m WHERE m.id = NEW.match_id;
  IF NOT FOUND OR matched.practice_id IS DISTINCT FROM NEW.practice_id OR matched.reversed_at IS NOT NULL THEN
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
