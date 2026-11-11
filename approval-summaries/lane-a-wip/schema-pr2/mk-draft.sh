#!/usr/bin/env bash
# Writes the migration's DRAFT beside this script: its comments from here, the two function statements byte for byte
# from the SQL blocks of approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md (the text the founder granted).
# It writes nothing under packages/db/migrations: the draft is placed there only by the new-migration marker route.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd); ASK=$HERE/../../lane-b-suite-cap-3-freeze-exception-ask.md
F=$HERE/migration-draft-20261113090000_ledger_lookups.sql
block() { awk -v want="$1" '/^```sql/{f=1;n++;next} /^```/{f=0} f&&n==want{print}' "$ASK"; }
{
cat <<'SQL'
-- The ledger's two lookups read their row through the index that finds it (SUITE-CAP-3's hand-on to the schema chain;
-- docs/adr/0087, the dated note of 2026-11-11).
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
-- see them), and on a ledger with none each function chose a slow way to find one row. ledger_line_net read every
-- entry of the practice to find one line's entries (through ledger_entry_by_date, the line as a filter), and
-- ledger_entry_rules read every standing match of the practice to find the entry's one match (through
-- ledger_match_standing, the match's id as a filter). Measured on SYNTHETIC practices: docs/adr/0087, "Measured".
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
-- migrated to 20261111090000, where both bodies are still those of migration 20261027090000. A migration that comes
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
-- - Every entry a role other than a superuser can store carries its line's practice: an entry written in scope is of
--   a case of its practice and of a line of that case (ledger_entry_rules), and the tenant policy refuses any entry
--   outside the scope. So the line's practice, read from service_line under the same tenant predicate as the ledger's,
--   drops no entry. A line the scope cannot read, a line that is no row and no line at all give 0, as before.
-- - A reversal or an adjustment still counts as the stage of the entry it finally corrects (its target, or the
--   target's target when the target is itself an adjustment), each read by primary key, at most one row; one whose
--   target is missing still counts as nothing; every other entry counts as its own stage.
-- - A sum of whole cents does not depend on the order its rows are read in.
-- DO NOT SIMPLIFY: the practice condition and the ORDER BY e.seq change no answer. They are there only for the plan:
-- with the line's practice as an equality and an order that ledger_entry_by_line (practice_id, service_line_id, seq)
-- returns for free, the planner reads the line's entries through that index whatever it knows of the ledger. Take
-- either out and every correctness test still passes while each call reads the practice's whole ledger again.
-- apps/worker/src/reconcile/ledger-lookups.db.test.ts plans this body as it is installed and fails then.
SQL
block 1
cat <<'SQL'

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
SQL
block 2
} > "$F"
echo "wrote $F ($(wc -l < "$F") lines)"
