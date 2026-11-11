# Schema PR 4: the database review (on 654e5169; the migration is 217e96ce's, unchanged), with W16's dispositions

W16 ran it on 2026-11-11 because W15's own run was not recorded. Each finding was checked by W16 before its disposition.
**No change to the migration or to any function, so no delta review.**

## Dispositions
- **F1, should-fix: REAL, NOT A MIGRATION CHANGE.** A handler's one document lock, then the trigger's ascending set, can
  cross with another's (40P01; one request fails with nothing saved, no wrong row). The design already recorded it
  (section 2 "Order", proposal P4, Lane B's file). Checked: the web maps 40P01 nowhere, so the design's and the ADR
  amendment's "ends as busy" was wrong; ADR 0085's amendment now says what happens and names the web's two fixes
  (f8732bda). The migration's comment at 207-208 is true of the triggers, which is what it says; left as it is.
- **F2, note: REAL, the web's.** DOCUMENT_USE_LOCK hashes the id as sent, the triggers hash uuid::text; equal only for a
  lowercase id. The triggers hold the rule either way. Recorded in the amendment for the web half (cast to uuid).
- **F3, note: no change.** 'read uncommitted' is refused though PostgreSQL runs it as READ COMMITTED; safe, nothing uses it.
- **F4, F5, notes: TAKEN in the runbook** (f8732bda): the loop's snapshot, and how long the index build holds the lock.
- **For Lane B's web half (P4, and new P5):** the lock order or 40P01 as busy; the uuid cast in DOCUMENT_USE_LOCK.

## The reviewer's report, as handed back

# Database review: 20261114090000_payer_response_document_rules.sql

Worktree /home/user/pr4, branch co-001/payer-response-db-rules, head 654e5169. Read-only on the repository (git status
clean after the review). Experiments ran on PostgreSQL 18 at localhost:5433 in a scratch database `review_db_w16`,
migrated with `pnpm db:migrate` (all 52 migrations applied, this one included) and dropped at the end. Synthetic rows
only (house row factory and random UUIDs). The experiment script is
(the session scratchpad, not kept) rdb/exp.ts and its output
(the session scratchpad, not kept) rdb/out2.txt.

Verdict: no must-fix. One should-fix (a deadlock between the handlers' single-document lock and the trigger's
ascending locks, reachable through tp_app, detected by Postgres, never a hang and never a broken invariant), and
notes. The two-session races hold in both orders, on INSERT and on the UPDATE path, as the application role.

## Findings

### F1. should-fix (low frequency): handler lock + trigger locks can deadlock (40P01)

Lines: migration 221-223 (contract_version_documents_ok locks every document of the version, ascending) against
apps/web/src/lib/contracts/tagging.ts:48-60 (refuseResponseLetter takes ONE document's lock before the write) and
packages/contracts/src/services.ts:383 (attachDocument's UPDATE, which fires the trigger over the whole array).
The migration comment at 207-208 ("two versions naming the same documents never take them in opposite orders") is
true of the trigger alone; it is not true once a handler already holds one of the locks out of order.

Reproduction (ran, both sessions as tp_app, READ COMMITTED): documents A and B; draft V1 names [A], draft V2 of another
contract names [B]. Session 1: DOCUMENT_USE_LOCK(B). Session 2: DOCUMENT_USE_LOCK(A). Session 1:
`UPDATE contract_version SET source_document_ids = [A,B] WHERE id = V1` (waits for A). Session 2: the same for V2 with
[B,A] (waits for B). Observed: `B cross-tag {"r1":{"code":"40P01","message":"deadlock detected"},"r2":"accepted"}`.
Control without the handler's pre-lock (trigger only, opposite array orders): the second waits, both accepted, no
deadlock (`B2 trigger-only`).

Reachable through tp_app on a migrated database: yes, but only when one document sits in (or is being attached to)
two open (draft or proposed) versions at once, e.g. two people cross-tagging two letters onto two contracts, or one
editing the terms of a draft [A,B] while another tags B onto a second draft that names A. Nothing in
contract_version_documents_ok or attachDocument forbids a document in two versions. Result is one transaction
rolled back after deadlock_timeout with 40P01 (most likely a 500 for that person); no wrong row is written.

Smallest fix (web, not this migration): in the tag and abstraction handlers, take the locks the trigger will take, in
the trigger's order, before the write: read the target version's source_document_ids, add the document, sort
ascending as uuid, lock each, then check and write (the trigger re-takes them re-entrantly). Or, smaller still, map
40P01 on these routes to the existing "busy, try again" answer. Either way correct the comment at 207-208 and the one
at tagging.ts:43-46 to say what order holds.

### F2. note: the lock key is equal only for a canonical (lowercase) UUID

Lines: migration 222 and 265 hash `'document_use:' || <uuid>::text` (always canonical lowercase); tagging.ts:48 hashes
`'document_use:' || $1::text`, the text the client sent.
Reproduction (ran): `select hashtextextended('document_use:'||'ABCDEF00-0000-4000-8000-000000000001'::text,0) =
hashtextextended('document_use:'||'ABCDEF00-0000-4000-8000-000000000001'::uuid::text,0)` returns `f`. For a lowercase
id the two are the same expression and equal.
Reachable through tp_app: only if a route's input schema lets an uppercase UUID through (not checked; the shared
`uuid` Zod schema was outside my budget). The effect is confined to the handler's own pre-check no longer being
serialized; the triggers still take the canonical lock and re-check, so "never both" holds (the loser gets the
trigger's 23514 instead of the handler's words). Smallest fix: `'document_use:' || $1::uuid::text` in
DOCUMENT_USE_LOCK (web).

### F3. note: 'read uncommitted' is refused, though Postgres runs it as READ COMMITTED

Lines 218 and 262. Reproduction (ran, tp_app): `BEGIN ISOLATION LEVEL READ UNCOMMITTED`,
`current_setting('transaction_isolation')` = 'read uncommitted'; a response naming a document and a version naming one
are both refused with 0A000 and the READ COMMITTED message. Safe (it over-refuses), and no code path in apps/web,
apps/worker or packages asks for that level (grep: the only non-default levels are REPEATABLE READ READ ONLY readers).
REPEATABLE READ and SERIALIZABLE are both refused (ran: 0A000 for each, for both functions); a version with no
documents and a response with no document are not touched by the guard at any level (ran). Fix only if wanted:
`NOT IN ('read committed', 'read uncommitted')`, or leave it and say so in the comment at 27-29.

### F4. note: the lock loop's DO statement holds a snapshot for up to five minutes, and NOWAIT never cancels autovacuum

Lines 45-60. Reproduction (ran, as tp_owner): another session holds SHARE UPDATE EXCLUSIVE on contract_version (what
an autovacuum or autoanalyze holds; it is the LAST of the four, so the first three are granted and then given up on
every try); the loop cut to three tries. Sampled every 100 ms while the backend was in PgSleep: relation locks held on
the four tables = none in all 25 samples; a tp_app `SELECT count(*) FROM source_document` during the loop was accepted
at once; the loop ended with 55P03. `pg_stat_activity.backend_xmin` was set throughout: the one DO statement keeps
its snapshot while it sleeps, so for up to five minutes the migration holds back vacuum's horizon (harmless at this
size). A long autovacuum, the nightly REPEATABLE READ audit copy or any long reader of source_document (ACCESS SHARE
conflicts with ACCESS EXCLUSIVE) fails the deploy after five minutes, with nothing changed; the runbook already says
this of the earlier migrations that use the pattern (docs/runbooks/deploy-and-rollback.md around line 351); make sure
this migration's section names the source_document readers too. No fix needed in the SQL.

### F5. note: the non-concurrent index build is the whole of the held time

Lines 95, 99, 103. Measured on a synthetic 2,000,000-row, about 250-bytes-a-row stand-in table (not the real one):
`ADD COLUMN ... uuid REFERENCES` 1.6 ms (no rewrite; the validation finds nothing to check), the partial index
`(practice_id, filed) WHERE filed IS NOT NULL` 2.4 s (one sequential scan). So every read and write of
source_document, and every write of payer_response, contract_version and submission, waits about 1.2 s per million
documents (zip entries included) on this machine, more on the deployed size. Acceptable now; record the figure in the
runbook as the other migrations do, since signed-in requests give up at their three-second lock timeout.

## Not broken (what was tried)

1. Locks.
   - A refused try releases everything (ran, F4): zero relation locks while sleeping; a reader is not queued.
   - A granted try keeps all four to the end (ran): source_document AccessExclusiveLock, submission
     ShareRowExclusiveLock, payer_response ShareLock, contract_version ShareLock. That is exactly what ADD COLUMN with
     a foreign key (ACCESS EXCLUSIVE + SHARE ROW EXCLUSIVE on the referenced table), the two CREATE INDEX (SHARE; covered
     by ACCESS EXCLUSIVE on source_document) and a race-free preflight need. Everything is taken up front, so nothing
     later in the migration can wait or deadlock: the only other relation read is `practice` (ACCESS SHARE).
     SHARE on contract_version does not block rate_record's foreign-key row locks (ROW SHARE).
   - Advisory order (by reading every pg_advisory call in packages/db/functions and the two handlers): response path
     is document_use then submission:case; submission_belongs takes only submission:case; no path takes submission:case
     and then a document_use lock; the response handler takes only the document's lock. The contracts service's
     'contract_version:<contract>' lock is taken after the handler's document lock and before the trigger's (insertVersion);
     attachDocument takes none. The only inversion found is F1.
   - Key equality for canonical ids: same SQL expression on both sides (F2 for the non-canonical case).
2. Snapshots (ran, both sessions as tp_app at READ COMMITTED; the waiter confirmed waiting on an ungranted advisory lock
   in pg_locks before the first commits):
   - A1 response first, then `UPDATE` of an existing draft adding the letter (contract_version_rules line 133 path):
     waits, then 23514 "a version's documents are never a payer response's letter..."; rows: 1 response, 0 versions.
   - A2 that UPDATE first, then the response: waits, then 23514 "a payer response's document is ..."; 0 responses, 1 version.
   - A3 the second transaction had already run a statement before the first wrote, the first used the handler's pre-lock,
     then INSERT of a version: waits, then 23514; 1 response, 0 versions. (The two INSERT orders are the existing tests.)
   - Why it holds, by reading and pg_proc: contract_version_rules is plpgsql VOLATILE (provolatile v) and calls
     contract_version_documents_ok(NEW) as a plpgsql expression, not inside a SQL statement of a STABLE function;
     the callee is VOLATILE, so its `IF EXISTS (...)` after the lock loop is its own statement with a new snapshot.
     payer_response_belongs is a plain AFTER INSERT FOR EACH ROW trigger (not a constraint trigger, not deferrable;
     migration 20261023090000:737), plpgsql VOLATILE; its document check is a separate statement after both locks.
     case_latest_submission is sql STABLE but is evaluated from a VOLATILE plpgsql expression after the lock, unchanged
     by this migration.
3. Volatility and language change. pg_depend has no row referring to contract_version_documents_ok(contract_version)
   (ran): no index, policy, constraint, generated column or view uses it; the only callers are the two lines of
   contract_version_rules. A composite argument and a later column: with one session's plans cached, `ALTER TABLE
   contract_version ADD COLUMN`, then DROP COLUMN, from another session; the cached session's INSERT and UPDATE of
   versions with documents were accepted each time (ran, experiment D).
4. Preflight. As tp_owner with no scope, `practice` is fully readable (policy practice_resolver TO tp_owner USING true);
   the three tenant policies are only `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])` with no
   condition on a practice's status, so deleted practices are read. Ran: after the migration's set_config line, tp_owner
   saw 36/18/6 documents/versions/responses, equal to the superuser's totals; after `'{}'` it saw 0. Zero practices
   gives '{}' through coalesce (by reading). The setting is transaction-local; the runner afterwards only reads
   current_user and the catalogs and inserts into schema_migrations (no RLS), then commits. It is race-free: all three
   tables are locked before the statement that reads them takes its snapshot. Pairs it could miss: none that the new
   rules trap; both old functions already required the document's practice to be the row's, no row has
   filed_for_submission_id yet, and payer_response never changes (payer_response_rules refuses UPDATE) so an old
   response naming a now-unacceptable document is never re-checked. The existing migration test covers the refusal.
5. Previous image and re-runs. The base a3a32024 web already has DOCUMENT_USE_LOCK, RESPONSE_DOCUMENT and the
   "Window passed" contradiction check, so the new refusals mirror it (by reading; I did not compare the write-off date
   basis of the handler with the trigger's UTC date at midnight). Nothing writes a contract version or a response with a
   document above READ COMMITTED (grep). The old image's INSERT column lists still work: the grant only adds a column,
   the trigger's assignment of a zip entry's link needs no privilege, and no query in apps or packages selects `*` from
   source_document or uses a named prepared statement (grep), so the new column cannot hit "cached plan must not change
   result type". A failed run changes nothing (one transaction); a re-run after success is skipped by schema_migrations.
   The worker's response with no document is not touched by the isolation guard (ran at three levels).

Not done: no run against the old image's code itself, no measurement on the deployed instance size, no test with a
deleted practice's rows, and the tenant isolation and authorization review was not repeated.
