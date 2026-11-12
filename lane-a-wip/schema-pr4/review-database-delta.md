# Schema PR 4: the delta review (database) of 0e38fd73..c07965d6, with W16's dispositions

The delta: the preflight's query (W15's review, S1) and the zip-move refusal (its N1), each with a test that failed
first. The co-founder allowed the marker-route command in W16's session on 2026-11-12 ("Let's allow it").

## Dispositions
- **Should-fix 1 (the new preflight is slow with thousands of practices in scope: 105.7 s against the old form's 47.1 s
  at 2,000 practices, 100,000 responses, 20,000 versions): NOT TAKEN, recorded.** Why: a migration applies once to
  each environment, and this one applies before launch, when no environment holds a real practice; an environment
  made later from a copy already has it. At the size W15's review measured (one practice, 1,000,000 documents) the new
  form is the fast one. The offered loop over practices is a third form of the same read with an unexplained
  20-fold swing in the reviewer's own timing, so another change and another review for a state no environment can be
  in when this runs. The runbook states the figure (9090c4b3) and the PR description names it.
- **Note 2 (no missed pair): no change.** The new form refuses, where the old did not, only a response whose document
  is another practice's or missing, which needs the triggers bypassed; refusing is right there.
- **Note 3 (a move with a scan change is refused in an older message, same code): no change.**
- **Note 4 (tests): TAKEN** (9090c4b3): an entry taken out of its zip, moved to another, and an update naming the same
  zip; the preflight's test refuses a join too.
- **Note 5 ("the two small tables" in the migration's comment is relative): no change;** the runbook says it plainly.

## The reviewer's report, as handed back

# Database review of the delta 0e38fd73..c07965d6 (migration 20261114090000)

Scope: the preflight (section 2) and the new `parent_document_id` refusal in `source_document_rules()`, plus the two new tests. Nothing else in the migration was reviewed.

Method: PostgreSQL 18, scratch database `review_delta_w16` (created, migrated with `pnpm db:migrate`, dropped at the end). Synthetic rows only. Worktree `/home/user/pr4` left unchanged (`git status` clean). The existing database `pr4_w16` and `postgres` were not modified (one `DROP DATABASE` and one `CREATE DATABASE` for the scratch database only).

Verdict: no must-fix. One should-fix (the preflight is not cheap once there are many practices), four notes.

---

## Finding 1 (should-fix): the new preflight is not cheap with many practices; it was slower than the old one at 2,000 practices

Lines: `packages/db/migrations/20261114090000_payer_response_document_rules.sql` 71-74 (the comment's claim) and 80-83 (the query).

The query does stop reading `source_document`. That was not the cost. The cost is the tenant policy on the two tables it still reads: `practice_id = ANY (current_setting('app.practice_ids', true)::uuid[])`. With every practice in scope the planner picks a sequential scan (selectivity is 100%), and as a scan Filter the text-to-`uuid[]` cast is re-evaluated for every row. Time grows as (responses + versions) x practices.

Reproduction (run): 2,000 practices (one deleted), 1,000,000 documents, 100,000 responses, 20,000 versions, no overlap. `payer_response_by_document` dropped inside the transaction, because the preflight runs before section 3 creates it. `SET LOCAL ROLE tp_owner`, scope set by the migration's own `set_config` line (74,001 characters).

| Query | Plan | Execution time |
|---|---|---|
| New (as written) | Seq Scan on `payer_response` and on `contract_version`, policy as Filter, Hash Semi Join | 105.7 s |
| Old | Parallel Index Only Scan on `source_document_by_practice` (policy as Index Cond, evaluated once), parallel Seq Scan on `payer_response`, 2 workers | 47.1 s |
| New, with `enable_seqscan = off` | Bitmap scans on `payer_response_by_submission` and `contract_version_by_contract`, policy as Index Cond | 0.14 s |
| Per-practice loop (below) | Index scans, one practice in scope per iteration | 0.52 s |

So on this data the new query holds ACCESS EXCLUSIVE on `source_document` for about 106 s, longer than the old one. About 0.88 ms per row at 2,000 practices; the cost per row is proportional to the number of practices. Rough scaling: 100 practices and 10,000 rows is under a second; 500 practices and 60,000 rows is on the order of 10-15 s. On a pre-launch database both queries are instant, which is why this is not a must-fix.

Smallest fix: ask the question one practice at a time, so each read is an index scan and the scope holds one id.

```sql
DO $$
DECLARE
  p uuid;
  n bigint;
  both_uses bigint := 0;
BEGIN
  FOR p IN SELECT id FROM practice LOOP
    PERFORM set_config('app.practice_ids', '{' || p::text || '}', true);
    SELECT count(DISTINCT r.document_id) INTO n
      FROM payer_response r
     WHERE r.practice_id = p AND r.document_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = p AND r.document_id = ANY (v.source_document_ids));
    both_uses := both_uses + n;
  END LOOP;
  IF both_uses > 0 THEN RAISE ... END IF;
END;
$$;
SELECT set_config('app.practice_ids', '{}', true);
```

This form was run on the same data: 0.52 s, plan `Index Scan using payer_response_by_submission` + `Index Scan using contract_version_by_contract`. `tp_owner` sees every practice, deleted ones included (policy `practice_resolver`, `USING true`; 2,000 of 2,000 seen). The sum equals the single count except that a document named by responses of two practices, each with its own version naming it, counts twice; only "> 0" matters, and that state needs triggers bypassed. One unexplained measurement: the same loop took 10.7 s when `payer_response_by_document` existed; it does not exist when the preflight runs, but the fix should be timed on the previous head before it is relied on.

The new text test (finding 4) cannot see this: it checks the SQL text, not the plan.

Reachable as tp_app on a migrated database: no. This is deploy-time only (lock duration during the migration).

## Finding 2 (note): old and new differ in two states, both only reachable with triggers or the foreign key bypassed, and both in the safe direction

Lines: migration 80-83; comment 72-74.

By reading: old > 0 implies new > 0 always. Old needs d, r, v with `r.practice_id = d.practice_id = v.practice_id`, `r.document_id = d.id`, `d.id = ANY (v.source_document_ids)`; then r and v satisfy the new predicate. All three tables carry the same single tenant policy, so visibility is identical. So there is no missed pair.

Run (both queries side by side as tp_owner, states written with `session_replication_role = replica`):

| State | Old | New |
|---|---|---|
| r(P), d(P), v(P) | 1 | 1 |
| r(P), d(Q), v(P) | 0 | 1 |
| r(P), d(Q), v(Q) | 0 | 0 |
| r(P), d(P), v(Q) | 0 | 0 |
| all three in a deleted practice | 1 | 1 |
| two responses and two versions on one document | 1 | 1 |
| d(P); r and v in P, and r and v in Q | 1 | 1 |
| r and v name an id with no document row (foreign key bypassed) | 0 | 1 |
| practice not in scope | 0 | 0 |

The two rows where new refuses and old did not need a response whose document is in another practice or does not exist. `payer_response.document_id` has a foreign key to `source_document(id)`; `payer_response_belongs()` at a3a32024 checked `d.practice_id = NEW.practice_id` on insert; `payer_response_rules()` refuses every UPDATE of a response and `packets_never_deleted()` every DELETE. The one remaining route is `tp_owner` changing a document's `practice_id` after the fact, which `source_document_rules()` does not refuse (run: `UPDATE 1`; outside this delta). For r(P), d(Q), v(P) that also requires the pair to have been a violation before the move. In that state the version was already uneditable (the "each a document of the practice" count in `contract_version_documents_ok()` fails), so the refusal is correct, not false.

The two zero/zero cross-practice rows are not traps: item 4 looks for a response of the document's practice, item 3 only fires on insert, and those versions already fail the practice count independently of this migration.

NULL arrays: not possible (`source_document_ids` is NOT NULL, and a CHECK refuses NULL elements).

Smallest fix: none needed. Optionally soften the comment at 72-74 from "is a document of the response's practice" to "was, when the response was inserted".

Reachable as tp_app: no (tp_app has no UPDATE on `source_document.practice_id`, and no UPDATE or DELETE on `payer_response`).

## Finding 3 (note): a move combined with a scan-status change is refused with an older message

Lines: migration 140-162 (the zip block) run before 183-185 (the new refusal); same in `packages/db/functions/source_document_rules.sql` 66-68.

Run as tp_owner:
- `SET parent_document_id = <zip>, scan_status = 'clean', scan_at = now()` on a top-level document: refused, "a zip entry is clean only when its zip's malware scan is".
- `SET parent_document_id = <nonexistent>, scan_status = 'failed', ...`: refused, "a zip entry belongs to a top-level document of the same practice".

Both are still 23514 and nothing is written; only the message differs. The new refusal changes no earlier behaviour: it raises only when the column changes, and every earlier branch either raised already or fell through. Smallest fix: none; or move the new `IF` to the top of the function if one message is wanted.

Reachable as tp_app: no.

## Finding 4 (note): the two new tests are not vacuous, but each is narrower than its title

`packages/db/src/payer-response-db-mirrors.db.test.ts`, "keeps a document under the zip...":
- Asserts the exact code and message for two moves (filed letter under an unfiled document; unfiled letter under a filed one) and that none of the three rows has a parent afterwards. The final count runs on the scratch database's superuser connection, so RLS does not empty it.
- It fails without the fix (by reading): before the delta an UPDATE of `parent_document_id` with `scan_status` unchanged reached no check.
- Not covered: an entry moved out of its zip (parent to NULL), an entry moved to another zip, and that a no-op `SET parent_document_id = parent_document_id` still passes. All three were run by hand and behave correctly (refused, refused, `UPDATE 1`).

`packages/db/src/payer-response-document-rules-migration.db.test.ts`, "asks its preflight of the responses...":
- A text test. Both markers exist, and if either were renamed the `toContain` assertion would fail rather than pass silently.
- `not.toMatch(/FROM\s+source_document/)` would miss `JOIN source_document`, a comma-list reference or a function that reads it. It says nothing about the plan or the time (finding 1).

Both files pass: 31 of 31 tests (run with `DATABASE_URL` pointed at the scratch database).

## Finding 5 (note): "the two small tables" is relative

Line: migration 71. `payer_response` grows with every response and is never deleted from. It is far smaller than `source_document`, but the lock-time argument should rest on the plan (finding 1), not on the tables staying small.

---

## Not broken (what was tried)

Preflight:
- Missed pair (old > 0, new = 0): none exists, by reading and by the nine states above.
- Deleted practices: in scope and counted (1 and 1).
- FORCE ROW LEVEL SECURITY as tp_owner: `tp_owner` is neither superuser nor BYPASSRLS; with the migration's `set_config` it sees all 2,000 practices and all rows of the three tables. Out of scope, both queries see nothing.
- `count(DISTINCT r.document_id)` against the old `count(*)` of documents: equal in every state where the response and document share a practice, including several responses or versions on one document.
- The query takes no new lock and reads no `source_document` row (plans above).

`source_document_rules()`:
- No code path updates `parent_document_id`. Every `UPDATE source_document SET` in apps, packages and tools sets only `status`, `sha256`, `scan_status`, `scan_at`, `page_text_status`, `page_count`, or (tests only) `format_id`, `created_at`, `filed_for_submission_id`. The single statement that sets `parent_document_id` is the new test. No migration backfills it. No function body in the migrated database contains `UPDATE source_document`. The seed and the worker's intake only INSERT entries with their parent.
- Foreign-key actions: `source_document_parent_document_id_fkey` is NO ACTION; deleting a zip that has an entry is refused by the key, nothing is set to NULL (run).
- Grants: tp_app's UPDATE columns on `source_document` are `status, page_text_status, page_count, sha256, scan_status, scan_at`. `parent_document_id` is INSERT-only (migration 20261016090000 line 210). As tp_app, both `SET parent_document_id = NULL` and `SET parent_document_id = parent_document_id` fail with 42501 before the trigger runs.
- No-op statements still pass as tp_owner: `SET parent_document_id = parent_document_id` on a top-level document and on an entry, and the same literal value on an entry: `UPDATE 1` each.
- Real moves are refused as tp_owner with the new message: entry to NULL, entry to another zip, top-level under a zip.
- Other updates are unaffected: status on an entry, a clean verdict on a zip then on its entry: `UPDATE 1` each.
- `packages/db/functions/source_document_rules.sql` matches the migration's body for the added lines.
