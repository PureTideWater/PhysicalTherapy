# Schema PR 4: a payer's answer and a contract's source are never the same document, in Postgres (design)

Lane A, W15 (https://claude.ai/code/session_019i9if9aX9NMhnMVmJCk4BM), 2026-11-11. Plan: `approval-summaries/lane-a-schema-queue-plan-2026-11-07.md`
section 4. Source: `designs/lane-b-ux-payer-response.md` section 7.2, items 1 to 5 (#85, merged; ADR 0085; CAS-45 to CAS-48).
Status file: `approval-summaries/lane-a-schema-next-status.md`.

## 0. Why this PR is next (the first skip under ruling (a))
- **PR 3 is skipped and keeps its place.** Its gate is slice 4's export render and the identifier fold. The fold is in
  (#141, edab4d4d). Slice 4 is not built: on 91bc6b7c `VERIFIER_FORMAT` is still `tp-packet-verifier/2`
  (`packages/packets/src/format.ts:29`), and the /3 flip stores token templates only slice 4's render prints.
- **PR 4's gate:** the CO-02 line and the founder's approval of the latest commit. No freeze exception (no ledger
  table, no `packages/ledger` file, no amount). No ruling is needed before the build.
- **Out:** F4 (no design exists; it follows as its own PR and re-reads items 3 and 4). D11's REVOKE (the deploy fact is
  not stated).
- **Rides:** ADR 0093's Status line, "proposed" to "accepted" (records only; #142 merged as 3bff4fd6).
- **Queues item 32** (the queue outbox table) is not here: its own schema PR, the plan's new section 11, after PR 5.

## 1. What changes (one migration, `20261114090000_payer_response_document_rules.sql`, after #143's 20261113090000)
No table is created. One nullable column, two partial indexes, one column grant, five functions replaced
(`CREATE OR REPLACE`, same signatures, owners and grants). No amount, stage, policy or job changes.

### Item 1. `case_line_rules()`: a person's "Window passed" only on a window that has ended
In the transition `written_off_reason NULL -> NOT NULL`, the person's branch gains, after the name-and-permission check:
`ELSIF NEW.written_off_reason = 'window_passed' AND (window_end IS NULL OR window_end >= (now() AT TIME ZONE 'UTC')::date)
THEN RAISE ... check_violation`. It is the handler's check (design 2.3) and the date rule the same function already
applies to triage's strike and to a reopen. Rows already written stay (the trigger fires on the transition).
- **Not taken (proposal P1):** the same check on INSERT. Triage's insert (`apps/worker/src/triage/execute.ts:444`)
  carries the engine's own judgement of the window, on the pass's date; a `now()` check there would refuse a pass run
  for an earlier date and couples the engine's date to the database clock. No person's path inserts a case line.

### Item 2. `console_contract_queue()`: response letters are not "documents awaiting", and the index
`documents_awaiting` gains `AND d.filed_for_submission_id IS NULL AND NOT EXISTS (SELECT 1 FROM payer_response r WHERE
r.practice_id = d.practice_id AND r.document_id = d.id)`. Everything else is kept byte for byte: SECURITY DEFINER, the
`search_path`, the permission gate, the local save and restore of `app.practice_ids`, the grants.
`CREATE INDEX payer_response_by_document ON payer_response (practice_id, document_id) WHERE document_id IS NOT NULL`
(declared in the Drizzle table too). The function counts every active practice in one query; the index keeps the new
anti-join an index probe per document.

### Item 3. `payer_response_belongs()`: the letter a response names
When `NEW.document_id IS NOT NULL` the trigger (AFTER INSERT; a response never changes) now:
1. refuses unless the transaction is READ COMMITTED (`feature_not_supported`, the pattern of 20261103090000:754 and
   20261112090000:179), see section 2;
2. takes `pg_advisory_xact_lock(hashtextextended('document_use:' || NEW.document_id::text, 0))`, the handlers' key
   (`apps/web/src/lib/contracts/tagging.ts:48`), **before** the `submission:` lock, so every path locks document then
   submission (the handler already holds the document's lock when the trigger runs; section 2);
3. after the existing checks, refuses unless the document is the practice's, top-level (`parent_document_id IS NULL`),
   `kind IN ('payer_letter', 'other')`, `scan_status = 'clean'`, `status = 'stored'`, and no `contract_version` of the
   practice names it in `source_document_ids`, in any status: `RESPONSE_DOCUMENT` (`lib/packets/submissions.ts:372-374`),
   word for word. One message for every refusal, as the route has one.
A response may still name a letter filed for another submission or named by another response (design 2.6: one letter
answering twice, or two cases).

### Item 4. `contract_version_documents_ok(contract_version)`: never a response's letter
Today: `LANGUAGE sql STABLE`, called twice by `contract_version_rules()` (BEFORE INSERT OR UPDATE; on INSERT, and on a
terms change of a draft or proposed version in scope). It becomes **`LANGUAGE plpgsql VOLATILE`**, same signature,
return type, `search_path`, owner and grant (EXECUTE to tp_app, kept by `CREATE OR REPLACE`):
1. the READ COMMITTED refusal;
2. the `document_use:` lock on each distinct id of `v.source_document_ids`, **in ascending id order** (a `FOR` loop over
   the sorted distinct ids), so two versions naming the same documents never lock in opposite orders;
3. the existing predicate (each id once; each a clean contract, exhibit or payer-letter document of the practice), plus
   for every document: `d.filed_for_submission_id IS NULL` and no `payer_response` of the practice names it.
- **Why VOLATILE, and why it matters.** A STABLE function reads the snapshot of the statement that called it. If it
  stayed STABLE and took the lock itself, it would wait for the other transaction and then check with a snapshot taken
  before the wait: the response committed meanwhile is invisible and both writes pass. In a VOLATILE plpgsql function
  each statement takes a new snapshot at READ COMMITTED, so the check after the lock reads what the lock waited for.
  No policy, index, constraint or generated column calls it ("Called by policy: (none)"); the only callers are the two
  `IF NOT contract_version_documents_ok(NEW)` in `contract_version_rules()`, which is not touched.
- **Every document of the version, every time (the strict invariant), not only the newly named one.** One rule that
  holds for all rows is what the lists, the handlers and the response trigger already assume (design 2.7, "the strict
  rule is one invariant"). The cost: a version that already holds a response's letter could never have a term changed
  or be amended. So the migration proves no such row exists when it applies (the preflight below), after which neither
  trigger lets one be made. Safer for privacy: a patient's letter among a version's sources is shown to roles without
  `phi.read`.

### Item 5. The upload-time link (a security item: design 2.8's residual)
`ALTER TABLE source_document ADD COLUMN filed_for_submission_id uuid REFERENCES submission (id)`; defined in
`packages/db/src/schema/documents.ts` before the regeneration. Written only at insert: `GRANT INSERT
(filed_for_submission_id) ON source_document TO tp_app`, no UPDATE grant (as kind, size, uploader and zip:
20261016090000:205-211). `CREATE INDEX source_document_by_filed_submission ON source_document (practice_id,
filed_for_submission_id) WHERE filed_for_submission_id IS NOT NULL` (the response form will list a submission's own
uploads first). `source_document_rules()` (BEFORE INSERT OR UPDATE) gains, on INSERT, in scope:
- **a top-level document** with the link: `kind = 'payer_letter'` (design 2.5.5: the form files its upload so); the
  actor is a person, is `uploaded_by`, and holds `submission.log` on the practice; the submission is the practice's
  and is its case's latest (`case_latest_submission`), read without the `submission:` lock. Why no lock: the link only
  says why the letter was uploaded; a submission logged a moment later makes it "not the latest" whether or not the
  check waited, and a response may name the letter either way.
- **a zip entry** takes its zip's link: the trigger sets `NEW.filed_for_submission_id` from the zip's row and refuses
  an entry that names a different one. The entries of a zip uploaded in the response form are payer letters too, and
  the worker's insert (`apps/worker/src/intake/intake.ts:327`) needs no change and cannot forget it.
- on UPDATE the column never changes (refused in the trigger too, so the owner role's paths are covered, not only
  tp_app's missing grant).
Readers in this PR: items 2 and 4 (never counted for abstraction, never a contract's source). The web half (the upload
route writes it, the contract lists and `refuseResponseLetter` read it, the form lists a submission's uploads first) is
Lane B's later PR; until then the column is always NULL and nothing a person sees changes.

### Preflight (the migration refuses rather than leave the invariant false)
Before any change, in the migration's transaction: count documents that a `payer_response` names and a
`contract_version` also names. If any, `RAISE EXCEPTION` with the count only (no id, no text). None can exist in an
environment that loaded data after #85; none is in a seeded database (the full suite proves it on the seed). A database
that refuses is fixed by a person before the migration is tried again; recorded in `docs/runbooks/deploy-and-rollback.md`.

## 2. Concurrency: what the lock does, and what it needs
- **The pair.** T1 makes D a version's source; T2 records a response naming D. Both take `document_use:D`, then check,
  then hold the lock to commit. Whichever takes it second waits, then reads with a new snapshot and refuses. The
  response's row is inserted before its AFTER trigger takes the lock; T1 cannot see that uncommitted row, passes, and T2
  then waits for T1 and refuses on T1's version: still exactly one of the two commits.
- **READ COMMITTED is required** (a transaction at REPEATABLE READ keeps its first snapshot through the wait and would
  pass). Both functions refuse elsewhere. Mutating routes are never `oneSnapshot` (`apps/web/src/lib/http/invoke.ts:590`
  refuses it), so nothing served changes; a test proves the refusal.
- **Order.** Handlers: document, then (in the trigger) submission. Trigger alone: document, then submission. Versions:
  documents ascending. A handler's own lock on the tagged document followed by the trigger's ascending locks can still
  cross with another version's (A held, then B; B held, then A): PostgreSQL ends one after `deadlock_timeout`, and the
  route's `lock_timeout` (#137) answers "busy". Recorded, not designed away: the handlers' lock order is Lane B's file.
- **Same transaction, same key twice** (handler, then trigger): harmless; advisory transaction locks nest.

## 3. Deploy, locks, rollback
- Safe with the previous image: every new refusal mirrors a check that image's handlers already make (since #85); the
  column is nullable and unwritten.
- Locks: ACCESS EXCLUSIVE on `source_document` for the column and its foreign key (a scan of a small table; all NULL),
  SHARE ROW EXCLUSIVE on `submission`, SHARE on `payer_response` and `source_document` for the two index builds, each
  under the migration's `lock_timeout` as the chain's migrations set it. No ledger table is locked.
- Rollback: the previous image runs on this schema. The column stays.

## 4. Tests (failing first; `packages/db/src/payer-response-document-rules.db.test.ts`, and the lists the catalog tests pin)
1. Item 1: a person's "Window passed" on an open or unknown window is refused; on an ended window it is recorded;
   triage's strike and a person's other reasons are unchanged.
2. Item 2: a clean stored payer letter counts; named by a response it does not; filed for a submission it does not;
   the caller's scope is restored; a caller without either permission gets no row. The index is used (EXPLAIN, seeded).
3. Item 3: each refusal of the predicate (another practice's, a zip entry, a zip, each wrong kind, not clean, not
   stored, a version's source in each status); the admitted cases (payer letter, other, one letter twice).
4. Item 4: a version naming a response's letter is refused on INSERT and on a terms change; naming a filed letter is
   refused; an unrelated version is unchanged; the function is VOLATILE and its grant list is unchanged.
5. The races, two connections, both orders, each direction: the second waits (observed in `pg_locks`), then is
   refused; and at REPEATABLE READ each function refuses outright.
6. Item 5: the link's rules (kind, person, own name, permission, practice, latest); a job cannot set it; an entry
   takes its zip's; it never changes (tp_app has no UPDATE right; the owner is refused by the trigger); another
   practice's submission is refused (cross-tenant).
7. The preflight: the migration's own check, run against a database holding one conflicting pair, refuses.
8. `pnpm test:db` (catalog and cross-tenant), `db:domain-model --check --strict`, the grants and index catalogs.

## 5. Records
`docs/product/domain-model.md` and `packages/db/functions/*` regenerated; ADR 0085: a dated amendment (the database
half is done here, with section 2's reasoning); ADR 0093: Status "accepted"; test-matrix: CAS-45 and CAS-48 name the
new database test, one new CAS row for item 5 (number from the orchestrator); the plan's "Skips taken".

## 6. Reviews
Two adversarial reviews, each finding checked: (1) database (the migration, locks, snapshots, volatility, the
preflight, the previous image); (2) tenant isolation and authorization (the SECURITY DEFINER count, the link's rules,
what a role without `phi.read` can still reach, cross-practice ids).

## 7. Proposals outside this PR
- P1: the window check on a case line's INSERT (above).
- P2: `source_document_rules()` has no `SET search_path` (not SECURITY DEFINER; unchanged here to keep the diff to the rule).
- P3 (Lane B, the web half of item 5): the upload route, the contract lists' predicate, `refuseResponseLetter`, the form's list.
- P4 (Lane B): the handlers' lock order when a version names several documents (section 2, "Order").
