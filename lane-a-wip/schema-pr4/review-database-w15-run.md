# Schema PR 4: adversarial database review

Reviewed: `packages/db/migrations/20261114090000_payer_response_document_rules.sql` at a539fa14 (diff from a3a32024),
against the design note `designs/lane-a-schema-pr4-payer-response-db-rules.md`. 2026-11-11. Repository untouched.

Where it ran: PostgreSQL 18.4 on localhost:5433. `rv_db1` was a copy of `pr4_fresh` with synthetic rows built by the
house row factory (two practices, a billing manager, 38 clean stored documents, 25 submissions, 40 contracts).
`rv_pre` was a new database migrated by `migrate()` to 20261113090000 (51 migrations), on which the migration file
was then applied by hand as the runner does (`BEGIN; SET LOCAL ROLE tp_owner; \i <file>`). Both databases are dropped.
Application-role sessions were `SET LOCAL ROLE tp_app` with `app.practice_ids` and `app.actor_id` set.

## Verdict

No blocking finding. The mutual exclusion of items 3 and 4 held in every experiment I could run. Three things should
be fixed before merge (S1 to S3), the rest are notes.

| | Severity | One line |
|---|---|---|
| S1 | should-fix | The preflight compares every document with every version of its practice while ACCESS EXCLUSIVE on `source_document` is held: 13.4 s on 1,000,000 documents and 100 versions; the same answer from `payer_response` takes 0.25 s. |
| S2 | should-fix | The new deadlock between two version writes ends as SQLSTATE 40P01 after 1 s, not as the "busy" answer the design states; the web has no mapping for 40P01. |
| S3 | should-fix | `source_document_rules()` gains authorization checks but still has no `search_path`: a temp table named `submission` is what the trigger reads (shown). |
| N1 | note | The owner role can change `parent_document_id`, leaving an entry whose link differs from its zip's, and an unfiled entry under a filed zip that a version accepts. |
| N2 | note | A superuser insert with nothing in scope skips the zip branch: an entry with a link other than its zip's is written. |
| N3 | note | `contract_version_documents_ok` takes a lock for every id before it checks that any is a document, and before the CHECK of 100: 3,000 locks from one call. |
| N4 | note | Three behaviour changes of the function for inputs that name no response letter (isolation, same-statement rows, locks held on every terms edit). |
| N5 | note | `ADD COLUMN ... REFERENCES` does no validation scan (1.7 ms on 1,000,000 rows); the design note says it scans. |
| N6 | note | The lock loop needs an instant with no lock at all on `source_document`; not tested under load. |

## S1 (should-fix). The preflight is quadratic per practice, under ACCESS EXCLUSIVE

Lines 49 and 76-79. The four table locks are taken first (line 49: `source_document` in ACCESS EXCLUSIVE), then the
preflight reads `FROM source_document d WHERE EXISTS (payer_response) AND EXISTS (contract_version ... d.id = ANY
(v.source_document_ids))`. PostgreSQL joins every document to every version of its practice and tests the array
membership as a join filter. Nothing can read a document while it runs.

Ran on `rv_pre` with one practice holding 1,000,000 documents (567 MB with indexes), 20,000 responses naming documents
and 100 versions, another session holding ROW EXCLUSIVE on `contract_version` for 3.5 s:

```
statement times in ms: lock loop 4005.890 | preflight 13392.926 | ADD COLUMN 1.739 | GRANT 0.447
                       index on source_document 158.784 | index on payer_response 17.836 | five functions < 1 each
```

The plan, as tp_owner with every practice in scope (parallel here, serial inside the DO block's `SELECT ... INTO`):

```
Hash Semi Join  Hash Cond: (d.practice_id = v.practice_id)  Join Filter: (d.id = ANY (v.source_document_ids))
  Rows Removed by Join Filter: 33333333   (x3 processes)
  -> Parallel Index Only Scan using source_document_by_practice on source_document d (rows=333333 loops=3)
Execution Time: 3763.533 ms
```

The same question asked from the small tables, same data, same role: `Time: 254.757 ms`.

The data is synthetic and large for today; the cost is the sum over practices of documents times versions, so it is
milliseconds on a small database. It grows with the one table that grows fastest (every 835 is a document), and the
web's `lock_timeout` is 3 s (`apps/web/src/lib/server/lock-timeout.ts:21`), so past that every document read answers
"busy" for the length of the preflight.

Fix: never scan `source_document` in the preflight.

```sql
SELECT count(DISTINCT r.document_id) INTO both_uses
  FROM payer_response r
 WHERE r.document_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM contract_version v
                WHERE v.practice_id = r.practice_id AND r.document_id = ANY (v.source_document_ids));
```

It counts the same documents, plus any a response of practice P names that is not P's own document (the old trigger
refused those, so none exist; if one did, refusing is the right answer).

## S2 (should-fix). The new deadlock ends as 40P01, and the design says "busy"

Lines 217-219 (the function locks every document of the version, ascending) with the handlers' own lock on the one
document they tag (`apps/web/src/lib/contracts/tagging.ts:60`). Before this migration a handler held one document
lock and the database took none, so two version writes could not deadlock on documents. Now they can, as the design's
section 2 records. What it says about the end is wrong: "PostgreSQL ends one after `deadlock_timeout`, and the route's
`lock_timeout` (#137) answers busy". `deadlock_timeout` is 1 s and the web's `lock_timeout` is 3 s, so the detector
always fires first and the route receives 40P01, not 55P03.

Ran: version V1 names K7, V2 names K8; session A takes the handler's lock on K8 and adds K8 to V1; session B takes it
on K7 and adds K7 to V2; both `SET LOCAL lock_timeout = '3s'`.

```
A: ERROR:  deadlock detected
A: DETAIL: Process 8466 waits for ExclusiveLock on advisory lock [82650,962121083,1060077833,1]; blocked by process 8467.
A: Time: 1004.908 ms          B: Time: 999.630 ms (committed; V2 names 2 documents, V1 still 1)
```

`grep -rnE "40P01|deadlock" apps/web/src/lib/http` finds no mapping (one comment in `request-sends.ts`). I did not
trace what the route answers for an unmapped code.

A second cycle, by reading only (not run): an amendment or correction takes `contract_version:<contract>` first
(`packages/contracts/src/services.ts:269`) and the trigger then locks the prior version's documents; a tag of one of
those documents into the same contract with no open draft holds the document and then waits for
`contract_version:<contract>` (`tagging.ts:77`, then `:98`/`:118`).

Fix: the database cannot remove this alone. Correct the design note and ADR 0085's amendment to say 40P01; give Lane B
proposal P4 two parts: map 40P01 to the busy answer, and have each handler that writes a version take the locks of
every document the version will name, ascending, before `contract_version:`.

## S3 (should-fix). `source_document_rules()` has no `search_path`, and now decides who may file a letter

Lines 118 and 152-164. The function keeps "no search_path of its own" (line 117; the design's P2). It now resolves
`submission`, `app_actor_is_person`, `app_actor_permitted` and `case_latest_submission` through the caller's path.
tp_app holds TEMP on the database, and a temp table is found before `public`.

Ran on `rv_db1`, the insert that test 5a below accepts, with an empty temp table in the way:

```
SELECT has_database_privilege('tp_app', current_database(), 'TEMP');                     -> t
BEGIN; SET LOCAL ROLE tp_owner; (scope, actor)
CREATE TEMP TABLE submission (id uuid, practice_id uuid, case_id uuid) ON COMMIT DROP;
INSERT INTO source_document (..., filed_for_submission_id) VALUES (..., '<the latest submission>');
ERROR:  a letter is filed for the latest submission of a case of its practice
```

The trigger read the temp table. I found no way to turn this into a wrong link: `case_latest_submission()` has its own
path and reads the real table under the caller's policies, and the foreign key checks the real row. It needs SQL as
the application role, which already sets its own scope and actor. It is still the one function of the five that a
session can redirect, in the item the design calls a security item.

Fix: `SET search_path = pg_catalog, public, pg_temp` on this function in this migration, as its four siblings have.
The header's sentence "Four keep their ... search_path" then changes to say so.

## Notes

**N1. The owner role can move a document under or out of a zip.** Lines 168-171 refuse a change of the link; nothing
refuses a change of `parent_document_id`. tp_app cannot (no column grant: `ERROR: permission denied for table
source_document`). As tp_owner on `rv_db1`:

```
UPDATE source_document SET parent_document_id = '<unfiled L21>' WHERE id = '<filed letter F1>';
  -> moved; entry link set=true zip link set=false
UPDATE source_document SET parent_document_id = '<filed zip Z1>' WHERE id = '<unfiled clean letter L22>';
  -> moved; entry link set=false
INSERT INTO contract_version ... naming L22 (as tp_app)   -> accepted
```

Fix: in the UPDATE block, refuse `NEW.parent_document_id IS DISTINCT FROM OLD.parent_document_id` (one line).

**N2. Out of scope, the zip branch does not run** (line 129, `practice_in_scope`). tp_app and tp_owner are then
refused by the tenant policy (FORCE ROW LEVEL SECURITY); a superuser is not. Ran as postgres with nothing in scope: an
entry of the zip filed for SUB20, naming SUB21, was written (`link is the zip's: false`). `session_replication_role =
replica` skips the trigger altogether (superuser only). Unchanged in kind from the uploader and format rules beside it.

**N3. Locks before validation** (lines 213-219). A BEFORE trigger runs before the CHECK `cardinality <= 100`, and the
function locks each id before it knows any is a document. tp_app has EXECUTE on the function. Ran as tp_app:

```
SELECT contract_version_documents_ok(<3000 random ids>);  -> false, Time: 18.186 ms
SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid();  -> 3000
```

`max_locks_per_transaction` 64 x `max_connections` 100 is about 6,400 slots; I did not run past that because the
server is shared. The web caps the list at 100 (`packages/contracts/src/services.ts:236-238`), and any role can call
`pg_advisory_xact_lock` itself, so this gives nobody a new power. Optional: `IF cardinality(v.source_document_ids) >
100 THEN RETURN false; END IF;` before the loop.

**N4. What changed for a version that names no response letter and no filed letter.** Old body (recreated as
`rv_old_ok`, LANGUAGE sql STABLE) against the new, as tp_app at READ COMMITTED:

```
empty: old=true new=true            null array: old=NULL new=NULL       duplicate: old=false new=false
other practice: old=false new=false unknown id: old=false new=false     unused letter: old=true new=true
two-dimensional: old=true new=true  100 documents: old=true new=true    99 + other practice: old=false new=false
```

Three differences, none a defect: (a) above READ COMMITTED a version naming any document is refused (`RR one contract
doc: old=true`, new: `ERROR: a contract version's documents are checked at READ COMMITTED`); I found no application
write above READ COMMITTED (the web refuses `oneSnapshot` on a mutation, `invoke.ts:590`; the worker's REPEATABLE READ
transactions are READ ONLY). (b) A VOLATILE function sees rows the calling statement has already written; the STABLE
one did not. Not run; it only admits a version whose document was inserted by the same statement. (c) Every terms edit
of a draft or proposed version now holds all its documents' locks to commit, so a response naming one of them waits.

`pg_depend` has no row for the function; the only other function whose text names it is `contract_version_rules`; no
view, index or constraint definition names it; no TypeScript outside `packages/db` calls it.

**N5. `ADD COLUMN ... REFERENCES` (line 95).** Locks held at the end of the migration, from `pg_locks`: ACCESS
EXCLUSIVE on `source_document`, SHARE ROW EXCLUSIVE on `submission`, SHARE on `payer_response` and `contract_version`,
as the comment says. The foreign key is not validated by a scan (a new all-NULL column): 1.739 ms on 1,000,000 rows,
`convalidated = true`. The design's section 3 says "a scan of a small table"; the scans under the lock are the
preflight (S1) and the partial index build (159 ms per 1,000,000 rows).

**N6. The lock loop** (lines 45-60) cannot deadlock (every request is NOWAIT, and nothing after it waits for a lock)
and queues nobody. It succeeds only at an instant when no transaction holds any lock on `source_document`, including a
reader's. With one 3.5 s holder it took 4.0 s. I did not test it under steady traffic; a busy intake worker may use up
the five minutes.

## The seven questions

**1. Mutual exclusion: not falsified.** Each row is one run with two sessions as tp_app; the first holds 2.5 s, the
second starts 0.8 s later. "Both" is the count of documents named by a response and a version afterwards.

| Case | Second session | Both |
|---|---|---|
| Response holds, version by `INSERT ... SELECT` | waited 1.72 s, refused (version message) | 0 |
| Version holds, response | waited 1.71 s, refused (response message) | 0 |
| Response holds; one statement inserts two versions, the second naming two documents | waited, refused, neither version written | 0 |
| Response holds; `UPDATE` adds the letter to a draft | waited 1.72 s, refused | 0 |
| `UPDATE` holds; response | waited 1.73 s, refused | 0 |
| Handler's lock taken first on both sides | waited 1.70 s on the lock, refused | 0 |
| One transaction: response, then version | refused | 0 |
| One statement, CTE inserts the response, main inserts the version | refused by the response's trigger | 0 |
| One statement, CTE inserts the version, main inserts the response | refused by the version's function | 0 |
| Version under a savepoint, `ROLLBACK TO`, transaction left open; response | accepted in 16 ms, no version exists | 0 |
| Version under a savepoint, `RELEASE`; response | waited 1.70 s, refused | 0 |
| REPEATABLE READ, SERIALIZABLE, each function | refused, 0A000 | 0 |
| INSERT inside a sql function called per row of one SELECT | waited, refused | 0 |
| INSERT inside a plpgsql function calling the sql one | waited, refused | 0 |
| Cursor declared before the wait, fetched after | refused | 0 |

The snapshot claim holds at both call sites of `contract_version_rules.sql` (INSERT, and the terms change): in every
waiting case the check after the lock saw the row committed during the wait, including inside a larger statement, a
function and a cursor. Not run: a prepared transaction. The server has `max_prepared_transactions = 0`, and a scratch
PostgreSQL 16 would not start (the postgres user cannot enter the scratch directory). From PostgreSQL's lock code,
transaction-level advisory locks pass to the prepared transaction, so I expect it to hold. `UPDATE payer_response SET
document_id` is refused for every role (`a payer response never changes once recorded`).

**2. Volatility: not falsified.** See N4.

**3. Deadlocks: S2.** The response path is unchanged in order (document, `submission:`, then the case row), and no
path takes `submission:` before a document. The only new cycles I found are between version writes.

**4. The migration's locks and preflight: S1, N5, N6; otherwise not falsified.** As tp_owner the preflight saw both
practices, one of them deleted (`ERROR: 2 document(s) are named by a payer response and by a contract version`); with
no scope the same query counts 0, so the `set_config` on line 71 is needed and works (`practice_resolver` lets
tp_owner read every practice). `app.practice_ids` is `{}` afterwards, transaction-local. No pair can be made between
the preflight and the commit: SHARE on both tables is held to the end. A second apply by hand fails at line 95
(`column "filed_for_submission_id" ... already exists`) and changes nothing; the runner refuses it earlier.

**5. Each replaced function: S3, N1, N2; otherwise not falsified.** `pg_proc` before and after differs in one row,
`contract_version_documents_ok` (`sql|s` to `plpgsql|v`); owner, ACL, SECURITY DEFINER, `proconfig`, argument count
and return type are the same for all five. Item 5 as tp_owner or tp_app: a person's letter for the latest submission
accepted; a job refused; another practice's submission refused with both practices in scope; kind `other` refused; the
worker's own entry INSERT as tp_app took its zip's link; an entry naming another submission refused; a version naming
a filed letter refused; a response to another submission naming it accepted; a change of the link refused for
tp_owner. Not run: COPY, `ON CONFLICT`, item 1 (`case_line_rules`) and item 2 (`console_contract_queue`); for those I
read the diff only (one `ELSIF`, two conditions).

**6. The previous image: nothing newly refused found.** By reading 91bc6b7c's call sites, not by running its suites.
The only response with a document comes from the web route, after `responseDocumentChoosable` under the same lock with
the same predicate (`routes/submissions.ts:297`); the worker's job passes `documentId: null`
(`reconcile/responses.ts:132`). Version writes: tag, attach, amend and correct call `refuseResponseLetter` first; the
edit route sends no documents. No message text of a replaced function is matched anywhere in `apps` or `packages`.
The person's "Window passed" rule in the web is the same expression as the trigger's (`triage/queries.ts:631`).
What does change for that image: version writes and responses on the same document now wait for each other, up to the
3 s `lock_timeout`, and S2.

**7. Anything else:** N3. The foreign key is single-column (`REFERENCES submission (id)`), as
`payer_response.submission_id` is; the practice match is the trigger's alone (shown refused above).

## Left behind

Scratch files only, under the session's scratchpad `rv/` directory, including one empty directory (`pg16.*`) owned by
postgres from the failed scratch cluster, which I could not remove.
