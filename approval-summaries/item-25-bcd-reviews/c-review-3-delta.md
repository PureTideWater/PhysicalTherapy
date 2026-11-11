# C review 3: the fix round's delta (6b044959..8214f012)

Scope: `packages/db/src/migrate.ts`, its tests, ADR 0009's amendment, the deploy runbook and the new-migration
skill, as changed by 8214f012. Read-only: no file in the repository was changed (`git status --porcelain` empty at
the end), nothing pushed. Experiments ran on throwaway databases, synthetic tables only, all dropped.

Verdict: no blocker. Three should-fix findings, all on one theme: the "did the migration end my transaction" check
is sound when the migration **commits** the runner's transaction, and has holes when the migration **rolls it back**
and then goes on (and in the dry run, which has no after-the-fact check at all). Five notes.

What ran:
- `pnpm vitest run --project db packages/db/src/migrate-lock-wait.db.test.ts` on PostgreSQL 18.4: 20 passed, 23 s.
- A scenario script that drives the real `migrate()` against scratch databases on PostgreSQL 18.4 (results quoted
  below). On PostgreSQL 16.15 only the SQL-level facts were checked (transaction id under savepoints, the interval
  cast, `pg_xact_status`): the repository's own migrations do not apply on 16 (`20261109090000_line_status_heads.sql`
  fails with a syntax error at "WITH", not part of this delta), so the runner scenarios could not run there.

## Findings

### C3-1 (should fix): a migration that rolls the runner's transaction back, commits work of its own, then has a wait cancelled is retried and reported as "it changed nothing"

`packages/db/src/migrate.ts:342-355` and `committedAnyway`, 267-278.

`committedAnyway` asks one question: did the transaction the runner opened commit. If the migration ended that
transaction with `ROLLBACK`, its status is `aborted`, exactly as after the runner's own rollback, so the answer is
"no" whatever the migration committed afterwards. The lock-timeout path then retries and finally says "it changed
nothing".

Reproduced on 18.4 (holder transaction on `rule_release`, 3 tries, 250 ms):

```
ROLLBACK; BEGIN; CREATE TABLE IF NOT EXISTS c3_half(i int); COMMIT;
BEGIN; SET LOCAL lock_timeout='250ms'; ALTER TABLE rule_release ADD COLUMN lock_wait_probe text;

result: ... failed: a lock it needs stayed held (tried 3 times, waiting 250 ms for each lock); it changed nothing; run the deploy again ...
paused=[1,2]   committed tables=["c3_half"]   recorded=[]
```

This is the exact outcome the round set out to exclude (retried, and "changed nothing" while part is committed),
by the `ROLLBACK;BEGIN` route instead of the `COMMIT` route. It needs a migration that is already wrong, hence not a
blocker; a login default `lock_timeout` on the migrator's role would remove the need for the migration's own `SET`.

Smallest fix: prove the failed transaction was the runner's before believing its status. Open a savepoint right
after `BEGIN` (`SAVEPOINT runner_try`); in the catch, before `ROLLBACK`, run `ROLLBACK TO SAVEPOINT runner_try` and
then compare `pg_current_xact_id()` with `xid`. Checked on 18.4: after an ordinary error in the runner's own
transaction the rollback-to succeeds and the id is the same; after the migration ended the transaction it fails
("savepoint "runner_try" does not exist", or "can only be used in transaction blocks"). Either failure, or a
different id, means the migration ended the transaction: never retry, and use the half-applied wording. Keep
`pg_xact_status` for the committed case. This also closes C3-2.

### C3-2 (should fix): `ROLLBACK;` followed by more statements commits them, and the run reports an ordinary failure

`packages/db/src/migrate.ts:215-217`, 342-351; ADR 0009 amendment item 7 ("and rolls back otherwise"); runbook
lines added at `docs/runbooks/deploy-and-rollback.md:297-300`.

After a `ROLLBACK` inside the file, the remaining statements of the same simple query run in an implicit
transaction that commits when the query ends. The transaction-id check then throws, the runner's `ROLLBACK` finds
nothing to roll back, `committedAnyway` sees `aborted`, and the message is the plain one.

Reproduced on 18.4:

```
CREATE TABLE c3_before(i int); ROLLBACK; CREATE TABLE c3_after(i int);

result: ... failed: it ended the transaction the runner opened; a migration never commits, rolls back or begins a transaction itself
committed tables=["c3_after"]   recorded=[]
```

The file is half applied and unrecorded, but the operator is not told: the runbook says "stop, do not run the deploy
again" only for "failed after committing part of itself". The ADR's "rolls back otherwise" is false for this case.
Not retried (correct), and not worded "changed nothing" (correct), so the stated claim holds to the letter; the
operator's instruction does not.

Smallest fix: whenever the transaction-id check fails (or the savepoint probe of C3-1 fails), use the half-applied
message regardless of `pg_xact_status`: once a migration has ended the runner's transaction, nothing after that
point was under the runner's control. One line in the runbook then covers both.

### C3-3 (should fix): the dry run has no after-the-fact check; a `COMMIT` in a pending migration commits the whole dry run and the message does not say so

`packages/db/src/migrate.ts:294-308` (`dryRun`); file header lines 23-24; ADR item 5 ("changes nothing either way").

The dry run takes the transaction id and passes it to `applyMigration`, so the mismatch is detected, but its
`finally` only rolls back: there is no `committedAnyway`. One transaction holds the role bootstrap and every pending
migration, so a `COMMIT` in the second pending file commits the first one too, with its `schema_migrations` row, and
releases the transaction-level advisory lock.

Reproduced on 18.4 (`dryRun: true`, two pending files, the second `CREATE TABLE c3_dry2; COMMIT; CREATE TABLE c3_dry3;`):

```
result: ... failed: it ended the transaction the runner opened; a migration never commits, rolls back or begins a transaction itself
committed tables=["c3_dry1","c3_dry2","c3_dry3"]   recorded=["29991231235958_first.sql"]
```

The commit itself predates this delta; what the delta adds is a detection whose message hides that a dry run
changed the database. Smallest fix: in `dryRun`, after the `ROLLBACK`, apply the same test as the real run (C3-1's
probe, or at least `committedAnyway(client, migration, xid)`) and fail with wording that says the dry run committed.
No test covers a transaction-ending migration under `dryRun`.

### C3-4 (note): the `lock_timeout` check sees only the value at the end

`packages/db/src/migrate.ts:218-221`; `.claude/skills/new-migration/SKILL.md` ("a `lock_timeout` of zero (the runner
refuses each)").

`SET LOCAL lock_timeout = 0; <statements that wait without limit>; SET LOCAL lock_timeout = '1d';` is applied and
recorded (reproduced on 18.4). So is any huge non-zero value. The ADR's wording ("checks that `lock_timeout` is not
off", after the SQL) is true; the skill's "the runner refuses each" overstates it, as it does for `ROLLBACK` (C3-2).
Related and inherent: after a migration's own `COMMIT` or `ROLLBACK` the runner's `SET LOCAL` is gone, so the rest
of the file waits under the session default (off) before any check runs. A session-level `SET lock_timeout` once
after connecting, beside the per-transaction one, would bound that too at no cost. Otherwise soften the skill's
sentence to "refuses a migration that leaves it off".

### C3-5 (note): a connection lost during the runner's `COMMIT` is reported as a plain failure; ADR item 9 says the server rolls back

`packages/db/src/migrate.ts:337-351`; ADR item 9.

If the connection drops while `COMMIT` is in flight, the outcome is unknown: the `ROLLBACK` rejects, `.catch(() =>
null)` skips the status check, and the message is "`<file>` failed: Connection terminated…". The error is a
`MigrationError` naming the migration (good), but the migration may be committed and recorded. The next run reads
`schema_migrations` and does the right thing, so the harm is a misleading log line only. Smallest fix: one clause in
ADR item 9 and the runbook ("if the loss was at the commit, the migration may be applied; the next run tells").
Not reproduced (needs a fault injected at the commit).

### C3-6 (note): a failed status query is swallowed into "rolled back"

`packages/db/src/migrate.ts:342-345`.

`.catch(() => null)` covers both the `ROLLBACK` and `committedAnyway`. If the rollback succeeds and the status
query then fails for any reason, the path continues to retry or to "it changed nothing" without the proof.
`pg_xact_status` does throw in general ("transaction ID … is in the future", reproduced on 16 and 18 with an
invented id) but I found no way to make it throw for an id this session was just given. Smallest fix: catch only the
`ROLLBACK`; let a failed status query fail the run as `failure(migration, error)`.

### C3-7 (note): budget clock and the "six minutes" sentence

`packages/db/src/migrate.ts:318`, 352; ADR "What it does not bound".

- `started` is taken before the role bootstrap and before the unlimited wait for the migrators' advisory lock. A
  second migrator that waited thirty minutes for the first gets one try per migration and no retry. That matches the
  ADR's words ("once the whole run has lasted thirty minutes") and is the safe direction against the deploy's fifty;
  it is just not said that the wait for the first migrator counts. One clause would do.
- No off-by-one: the budget is tested only after a cancelled wait, so every migration gets a first try; `budgetMs: 0`
  gives exactly one try (tested); the tries count in the message is the number made.
- "The last try … can end some six minutes past that" holds for a migration whose only long part is one five-minute
  `NOWAIT` loop (check passes just under thirty, a pause of up to 15 s, then the loop). A try's length is otherwise
  unbounded (two loops, or a long backfill), which the same paragraph half says. The runner cannot bound it; the
  sentence could say "one loop".
- `Date.now()` is the wall clock; a clock step moves the budget. `performance.now()` is monotonic. Trivial.

### C3-8 (note): tests

- Each new test fails without its fix, by reading: budget (`tried 20 times` and pauses instead of `tried once`),
  `lock_timeout` off (the file would apply), commit-and-begin (plain failure text without the check; applied
  without either), half-applied (the retry would call `pause` and fail on "already exists"). Not mutation-tested,
  to keep the tree untouched.
- The dry-run-beside-a-migrator test can pass vacuously, never fail falsely: if the dry run has not reached the
  advisory lock within 750 ms (slow role bootstrap on a loaded runner), it never waits and still applies. To make it
  prove the wait, poll `pg_locks` for an ungranted advisory lock before sleeping, as the first test does for the
  table lock.
- The half-applied test's `SET lock_timeout = '250ms'` after `COMMIT` runs in the implicit transaction and is undone
  when the cancelled wait aborts it; no leak, no timing race (the holder is in place before the run starts).
- Missing cases: `ROLLBACK` variants (C3-1, C3-2), a transaction-ending file under `dryRun` (C3-3), and a positive
  test that savepoints and a PL/pgSQL exception block do not trip the check (they do not; see below).

## What I could not break

- **Subtransactions.** `pg_current_xact_id()` returns the top-level id inside a savepoint, after writes in it, and
  after `ROLLBACK TO` (same value on 16.15 and 18.4). A migration with `SAVEPOINT`/`RELEASE`/`ROLLBACK TO` and a
  PL/pgSQL `EXCEPTION` block applied and was recorded.
- **Commit routes.** `COMMIT;` at the end, `COMMIT; BEGIN;`, `COMMIT AND CHAIN` and commit-then-cancelled-wait all
  give "failed after committing part of itself", once, with no pause. `ROLLBACK; BEGIN;` then success is caught on
  the success path by the id check and nothing stays. A procedure that commits, `CALL`ed inside the runner's
  transaction, is refused by PostgreSQL itself ("invalid transaction termination"). `PREPARE TRANSACTION` is refused
  while `max_prepared_transactions` is 0 (both servers); were it enabled, the id check still fails the run, but the
  prepared transaction would keep its locks and the message would be the plain one.
- **Cost of asking for an id.** Every try and every dry run already writes (the `schema_migrations` insert, the
  `CREATE TABLE IF NOT EXISTS` and `REVOKE` in `pendingMigrations`), so the id would be assigned anyway; no read-only
  path is turned into a writing one. It would fail on a hot standby, where a migration could not run either.
- **`pg_xact_status`.** Returns `aborted`/`committed` for the runner's own recent id; null (not an error) for ids
  too old to know. See C3-6 for the one way an error is swallowed.
- **The interval cast.** `current_setting('lock_timeout')` prints in `ms`, `s`, `min`, `h`, `d`; all of `0`, `2s`,
  `250ms`, `1min`, `1h`, `1d`, `1500ms`, `90s`, `36h`, `2147483647ms` cast, and only `0` compares equal to zero
  (16 and 18). No false refusal found. A function-level `SET lock_timeout` and a `SET LOCAL` to a non-zero value
  pass, as the ADR says.
- **Guarded cleanup.** A failed `COMMIT` reaches the catch and fails the run (never `break`). The swallowed
  `RESET ROLE` and unlock cannot leave the advisory lock held: the client is not pooled and `client.end()` always
  runs, which ends the session. No path returns a result after a failure. A lost connection during the SQL, or
  during a pause (now that `BEGIN` is inside the `try`), becomes a `MigrationError` naming the migration; a loss
  before any migration starts (bootstrap, `pendingMigrations`) stays a raw error, with no migration to name.
- **Docs against code.** Budget, numbers, items 7 (apart from C3-2), 8, the runbook's "fewer than 20 tries", the
  infra test's 50-minute floor and the unit test's pins all match the code. Exceptions: C3-2, C3-3, C3-4 (skill),
  C3-5 (item 9).
