# C review 2: the migration runner's failure paths, the deploy path, and the tests

Change reviewed: the one commit on `co-001/migrate-lock-timeout` against `origin/claude/build-platform` (7 files).
Scope: failure paths of `migrate()` and `dryRun()`, the deploy path, whether the tests prove what they claim, and the
words logged. PostgreSQL lock semantics and the error classification are another reviewer's and are not repeated here.

Read-only: no repository file was changed. Two temporary mutants of `packages/db/src/migrate.ts` were run and the file
was restored with `git checkout`; `git status --porcelain` is empty at the end.

## Verdict

No blocker. Four "should fix" findings (two test gaps proven by surviving mutants, one failure-path gap reproduced,
one deploy-timeout gap by arithmetic), and five notes. The core loop is sound: I could not make it apply a migration
twice, record one without applying it, leave the advisory lock held, or return a wrong `applied`.

## What was run

| Run | Result |
| --- | --- |
| `migrate-lock-wait.db.test.ts` as committed | 13 of 13 pass, 12.2 s |
| Mutant 1: `set_config('lock_timeout', $1, false)` (session-level, in each try) | 13 of 13 pass: not detected |
| Mutant 2: dry run sets the timeout BEFORE `pg_advisory_xact_lock` | 13 of 13 pass: not detected |
| Probe A: the migrator's backend ended during a pause | raw `Error`, not `MigrationError`; unhandled `'error'` event; process exit code 1 with a stack trace |
| Probe B: the migrator's backend ended while it waited for the lock (so ROLLBACK throws) | raw `Error: Client has encountered a connection error and is not queryable` |
| Probe C: `pause` throws | the pause's own `Error` reaches the caller; no advisory lock left; rerun applies |
| Probe D: last try (`attempts: 1`) | `MigrationError`, "tried once", nothing recorded; rerun applies |

The probes ran against scratch databases with a script kept outside the repository. In every probe, afterwards:
0 advisory locks remained, the probe migration was not in `schema_migrations`, and a second run applied it once.

## Findings

### C2-1 (should fix) A dropped connection during a retry is not a MigrationError, and during a pause it is an unhandled event
`packages/db/src/migrate.ts:264` (no `'error'` listener on the client), `:286` (`ROLLBACK` in the catch), `:293` (the
pause), `:300-301` (the `finally`); `packages/db/src/cli/migrate.ts:38`.

Scenario, reproduced (probes A and B). The runner used to be idle for no measurable time; it now sits idle on an open
connection for up to 15 s, nineteen times, about four minutes of a failing run. If the connection ends in that window
(a database failover or restart, a NAT or proxy idle reset, an administrator's `pg_terminate_backend`), `pg` emits
`'error'` on a client with no listener: Node throws it as an uncaught exception from outside `migrate()`'s promise
chain, so no `catch` or `finally` in the runner or the CLI runs. If it ends during a lock wait, the query rejects, the
catch's `ROLLBACK` throws, and that second error replaces the first; `RESET ROLE` in the `finally` then throws again
and `pg_advisory_unlock` is skipped (harmless: the server released the session's lock when the session ended).

What the deploy sees: exit code 1 either way (verified: the uncaught case exits 1), so cdk still reports "stopped
without migrating (exit code 1, …)" and no service moves. What it does not see is the runbook's line: the log group
ends with a Node stack trace ("terminating connection due to administrator command" or "Client has encountered a
connection error and is not queryable"), with no `db:migrate:` prefix and no migration name. The stack holds no URL,
no password and no data (checked in the output).

Data is safe in both cases: the try's transaction died with the session, nothing was recorded, and the rerun applied
the migration once.

Smallest fix: in `migrate()`, after `connect()`, `client.on('error', () => undefined)` so the loss surfaces at the
next query; wrap the catch's `ROLLBACK` (and the `finally`'s two statements) so a failure there does not replace the
original error; and have the loop turn a connection loss into `MigrationError("<file> failed: the connection to the
database was lost; it changed nothing; run the deploy again")`. Add one db test that ends the migrator's backend from
the `pause` hook and expects a `MigrationError` naming the file.

### C2-2 (should fix) No deploy timeout is shorter than one migration's 280 s, but the stated worst cases exceed the 50-minute custom-resource limit, and nothing stops the task when that limit passes
`infra/lib/constructs/migration-run.ts:22` (`MIGRATION_TIMEOUT = 50 min`, the provider's `totalTimeout`, `:116`),
`:72` (each handler Lambda 1 min, per poll only), `infra/lib/migration-runner.ts:57-78` (`isComplete` only describes
the task; there is no `StopTask` anywhere, and the migration task definition sets no `stopTimeout` or task-level limit).

Found: the only limit on the migration run is the provider's 50 minutes (CloudFormation's own hour behind it,
asserted `< 60` in `infra/test/compute.test.ts:534`). One migration with no lock loop of its own is fine: 280 s.

Two cases the ADR itself describes are not fine:
1. ADR 0009's amendment, "What it does not bound": a migration with its own five-minute `NOWAIT` loop "runs that loop
   again on every try, so its worst case is the tries times its loop". That is 20 x 5 min = 100 min, twice the limit.
   It needs the loop to succeed late and a later statement in the same migration to meet a 2 s wait on a table outside
   the loop's set, each time; unlikely, but it is the documented worst case and it is over the limit after ten tries.
2. Several pending migrations in one deploy each succeeding on a late try: eleven at 280 s pass 50 minutes.

Failing scenario: at 50 minutes the provider reports failure and CloudFormation rolls the stack back, but the ECS task
keeps running and keeps retrying. A migration can then commit after the deploy was reported failed and rolled back
(tolerable only because migrations are add-only), and the next deploy's task waits on the migrators' advisory lock,
which has no limit (amendment item 6), behind the orphan, eating its own 50 minutes.

Smallest fix: give the run one deadline in the runner (stop retrying, with the same MigrationError, once the run has
spent a fixed budget well under `MIGRATION_TIMEOUT`, say 30 minutes), or cap the retries of a try that lasted longer
than a minute; and state the 50 minutes in the amendment and the runbook section. Neither document mentions it today.
An infra test that holds the two numbers apart (as the web test does for 2 s and 3 s) would keep it true.

### C2-3 (should fix) The dry run's ordering (amendment item 5) is untested: mutant 2 survives
`packages/db/src/migrate.ts:240-242`; `packages/db/src/migrate-lock-wait.db.test.ts:170-188`.

Mutant: `setLockTimeout` moved above `pg_advisory_xact_lock`. All 13 tests pass. With that mutant, a dry run started
while a real run holds the migrators' lock for more than two seconds is cancelled while waiting for the advisory lock,
outside the per-migration `try`, and fails with PostgreSQL's raw "canceling statement due to lock timeout" rather than
waiting its turn: the opposite of item 5 ("after it holds the migrators' advisory lock") and item 6 ("still waited
for without limit"). The comment on line 241 is the only thing holding the order.

Smallest fix: one db test: a second session takes `pg_advisory_lock(MIGRATION_LOCK)`, a dry run starts with
`timeoutMs: 250`, the session releases after about 600 ms, and the dry run is expected to resolve.

### C2-4 (should fix) "The timeout is each transaction's own … and gone after it" proves only half: mutant 1 survives
`packages/db/src/migrate-lock-wait.db.test.ts:234-250`; `packages/db/src/migrate.ts:102`.

Mutant: `set_config(..., false)`, a session-level setting made inside each try. All 13 tests pass. The test proves the
setting is made again for each migration (a single `SET` before the loop would be caught: the second migration would
record `0`), which is the property that matters. It does not prove the setting is the transaction's own or that it is
"gone after it", which its title, the function's comment and amendment item 1 all say. Today the difference has no
effect a user could see (the session ends with the run), so this is a claim the suite does not hold rather than a live
defect; it becomes one if anything is ever run on that session between or after migrations.

Smallest fix: the value after COMMIT cannot be read from inside a migration, so check it where it can be seen: a
unit test of the setting on a client of its own (BEGIN, set, COMMIT, then `SHOW lock_timeout` expects the session's
default), or the same read from the test's `pause` hook through an injected client. Or reword the test's title to
what it proves ("is set again for every migration's transaction").

### C2-5 (note) If the fix were removed, three tests hang to the 30 s limit and leave a connection and a scratch database
`packages/db/src/migrate-lock-wait.db.test.ts:125-153`, `:155-168`, `:170-188`; `vitest.config.ts:104`.

By reading, not run. With no `lock_timeout`, the first test fails properly (the reader's own 4 s limit trips, and its
`finally` releases the holder and awaits the run). In the next three, `await migrate(...)` never returns because the
holder is released only from `pause` or from the `finally` behind that await: vitest reports a timeout after 30 s, the
`finally` blocks never run, the holder and the migrator stay connected, and `withScratchDatabase` never drops its
database. The failure is reported, so the tests do their job; the cost is 90 s and three leftover databases on a
developer's local cluster. Smallest fix: in those tests, release the holder from a timer a few seconds out (or give
the holder `idle_in_transaction_session_timeout`), so a broken runner fails an assertion instead of hanging.

### C2-6 (note) Flake risk on a slow runner is low; one assertion depends on wall time
`packages/db/src/migrate-lock-wait.db.test.ts:94-103`.

- The `pg_locks` polling loop has no time assertion and ends when the run settles; the migrator waits in three
  250 ms windows (750 ms of about 1.05 s), polled every 10 ms plus one query. It misses only if the watcher stalls for
  the whole second. `expect(sawWaiting).toBe(true)` then fails cleanly and the `finally` cleans up.
- `expect(Date.now() - started).toBeLessThan(2_000)` is the one wall-clock assertion: the reader waits at most 250 ms,
  so it needs a 1.75 s stall to fail. It adds nothing the `resolves` on the line above does not already prove (the
  reader's 4 s limit is what distinguishes a held queue); it could go, or be loosened to under 4 s.
- `paused` equal to `[1, 2]` and "tried 3 times" are deterministic while the holder holds.
- "Applies on a later try" succeeds only on the third and last try, 250 ms after the holder's rollback: anything else
  holding `rule_release` for 250 ms then (nothing does in a fresh scratch database) would fail it. `attempts: 4` there
  would cost nothing.
- Each test also applies every migration to a new database (about 1.4 s each here; the file took 12 s for 13 tests),
  against a 30 s limit a test: roughly twenty times headroom.

### C2-7 (note) Two statements in the documents are not quite what the code does
- "The pauses are longer than the waits, so what queued behind a try drains before the next" (amendment item 2;
  the comment at `packages/db/src/migrate.ts:68`). The first pause is 1 s against a 2 s wait and the second equals it;
  the unit test says so itself (`migrate.test.ts`, "every pause but the first is at least as long"). The claim that
  matters, that the queue is released at each cancellation, does not depend on the pause length. Reword.
- "About five minutes" (runbook, amendment, the unit test's 280 000 ms) is the length of a failing run in which the
  first lock a try asks for is the held one and the try does no work before it. `lock_timeout` is for each wait, so a
  try that gets several contended locks at under 2 s each, or does work before the held lock, is longer, without
  limit from the runner. The runbook's "a transaction held one of the migration's tables through the whole five
  minutes" is likewise one reading: twenty different short holders at twenty moments give the same message. Suggest
  "at least about five minutes" and "at every one of the twenty tries".

The rest was checked and is true of the code: 2000 ms; twenty tries; pauses 1, 2, 4, 8, then 15 s (19 pauses, 240 s,
plus 40 s of waits); the message text in the runbook and the amendment matches `lockFailure()` and the CLI's
`db:migrate: ` prefix character for character; exit code 1; earlier migrations in the run stay committed; "it changed
nothing" holds for the named migration (probes A to D and the test at line 155); the dry run says "tried once" and
does not pause; a migration's own `RAISE` and `NOWAIT` are not tried again; no service moves until the task exits 0
(`infra/lib/migration-runner.ts:74-78`). I did not find where the task definition names the CLI as its command, so
the claim that the log group "ends with" that line rests on the existing sections of the runbook, which say the same.

### C2-8 (note) A throwing `pause` reaches the caller as its own error
`packages/db/src/migrate.ts:293`. Reproduced (probe C): the caller gets the pause's `Error`, not a `MigrationError`;
the transaction was already rolled back, the role reset and the advisory lock released. The deployed `pause` is a
bare `setTimeout` and cannot throw, so this touches only tests that inject one. No change needed; a `try` around the
pause that rethrows as `failure(migration, error)` would make it uniform.

### C2-9 (note) A `pause` that is not awaited would pass the suite
`packages/db/src/migrate.ts:293`. By reading: the test hooks record the try number synchronously, and "applies on a
later try" would still pass because the holder's rollback lands inside the next 250 ms wait. The floating-promise
lint rule most likely catches it first. A test with fake timers asserting the gap between tries would close it.

## Tried and could not break

- Applying twice: a try is repeated only after an error whose `ROLLBACK` succeeded, so the earlier try's work and its
  `schema_migrations` row are gone. A cancellation during `COMMIT` leaves the transaction aborted, so the repeat is
  safe. A connection lost at `COMMIT` ends the run (C2-1) and is not retried; the next run reads `schema_migrations`.
- Recording without applying: the insert is inside the migration's transaction (`migrate.ts:199`).
- `applied`: pushed only after `COMMIT` returned (`:296`); a failed run returns nothing.
- The last try: `attempt >= attempts` throws before any pause (probe D; the tests' `[1, 2]` for three tries).
- The advisory lock and the role: released and reset on every path where the connection survives (probes C and D, and
  the rerun inside the first test); where it does not survive, the server releases both.
- `attempts` or `timeoutMs` of zero, fractions, or past the integer limit: refused before any connection.
- A timeout during the ownership check or the insert, after the migration's SQL ran: the whole try is rolled back and
  repeated, which is correct.
- Retrying on any 55P03: the two tests under "what is not tried again" would fail (the message and `paused` both).
- No rollback before the next try: `BEGIN` on the aborted transaction fails with a different error, so the tests fail.
- A single session-wide `SET` before the loop: the "each transaction's own" test fails (records `0`).
- Statements outside any timeout in the real run (`bootstrapRoles`, `CREATE TABLE IF NOT EXISTS schema_migrations`,
  the `REVOKE`, the history read): they touch only roles and `schema_migrations`, which no request reads.

## Logging and words

The new message holds the migration's file name, two numbers and an ADR path: no personal data, no document text, no
URL. `checkedLockWait`'s messages hold numbers only. The CLI prints `error.message` for a `MigrationError`; for the raw
errors of C2-1 Node prints a stack with the server's message and SQLSTATE fields, which were checked in the probe
output and hold no connection string and no password. Nothing new is logged elsewhere.
