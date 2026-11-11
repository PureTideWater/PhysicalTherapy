# C review 1: lock semantics and error classification

Change reviewed: the one commit on `co-001/migrate-lock-timeout` over `origin/claude/build-platform`
(`packages/db/src/migrate.ts` and six other files). Read-only review; nothing in the repository was changed
(`git status --short` empty afterwards). Experiments ran on scratch databases only (`c1_scratch_lockrev*`, created
and dropped with `DROP DATABASE ... WITH (FORCE)`; one scratch role created and dropped), synthetic tables only, on
PostgreSQL 16.15 (port 5432) and 18.4 (port 5433). Every result below was the same on both versions.

## Verdict

The core of the claim holds. I could not make `isLockTimeout` misclassify anything in the retried direction, the
timeout is transaction-local and re-applied on every try, the waiting request leaves the queue at the moment of the
cancellation, and the four existing lock-loop migrations are not harmed. No blocker.

Three things do not hold as written:

- **C1-1 (should fix):** a migration whose SQL ends the runner's transaction (`COMMIT; BEGIN`) silently loses the
  bound and, under one further condition, is re-run after half of it committed while the runner says "it changed
  nothing". Reproduced with the real runner.
- **C1-2 (should fix):** an exception handler that swallows the cancellation makes the runner record a migration as
  applied with a statement that never ran. Reproduced with the real runner. No migration today has such a handler.
- **C1-3 (note):** "the pauses are longer than the waits" is false for the first two pauses; it does no harm
  because the queue does not need the pause to drain.

## Findings

### C1-1: should fix. A migration that ends the transaction escapes the timeout; the retry can re-run a half-committed migration and report "it changed nothing"

File: `packages/db/src/migrate.ts` lines 188-200 (`applyMigration`: nothing checks that the transaction the runner
opened is still the one open after `client.query(migration.sql)`), lines 224-228 (`lockFailure` asserts "it changed
nothing" unconditionally), lines 277-294 (the retry).

What was already possible before this change (not a finding of this change): a migration's SQL is one simple
query, so `COMMIT; BEGIN` inside it commits the first half. In the real run the role check still passes, because the
session-level `SET ROLE` (line 273) survives the commit. That hole predates this commit.

What this change adds to it:

1. The bound disappears silently. After the migration's own `COMMIT`, `lock_timeout` is back at the session's
   value (0), so everything after it waits without limit. Reproduced with the real runner (timeout 300 ms, 3 tries,
   a reader transaction holding the table for 2.5 s):

   ```
   20270101000001_commit_inside.sql:
     INSERT INTO counter VALUES (1); COMMIT; BEGIN; ALTER TABLE busy ADD COLUMN w int;
   -> applied, elapsed 2512 ms, pauses []      (no cancellation, no retry: it waited as long as the holder)
   ```

   The same loss, without a commit, from `RESET ALL`, `RESET lock_timeout`, `SET LOCAL lock_timeout = 0` and a plain
   `SET lock_timeout = '10s'` (which overrides the runner's local value for the rest of that transaction). Observed
   `current_setting('lock_timeout')` after each: `0`, `0`, `0`, `10s`. The ADR allows a migration its own
   `lock_timeout` on purpose; it does not mention `RESET ALL` or `COMMIT`. `RESET ALL` does not reset the role, so
   the existing role check does not notice it.

2. When the connection has any non-zero default `lock_timeout` (connection `options`, `ALTER ROLE ... SET`, or an
   earlier migration in the same run that ran a non-local `SET lock_timeout`, which I confirmed persists in the
   session after its commit), the second half is cancelled, the runner rolls back only the second half, and tries
   the whole file again. Reproduced with the real runner (default `lock_timeout=300` in the URL options, holder
   stays):

   ```
   20270101000002_commit_inside_again.sql:
     INSERT INTO counter VALUES (2); COMMIT; BEGIN; ALTER TABLE busy ADD COLUMN x int;
   -> MigrationError: ... failed: a lock it needs stayed held (tried 3 times, waiting 300 ms for each lock);
      it changed nothing; ...
   SELECT count(*) FROM counter WHERE n = 2   -> 3
   ```

   Three committed copies of the first half, under a message that says nothing changed. Before this change the same
   file would have waited without limit rather than been re-run automatically.

No migration in `packages/db/migrations` contains a top-level `COMMIT`, `RESET` or `SET lock_timeout` today (grep),
so nothing shipped is affected.

Smallest fix, in the runner (no migration file is edited): give each try a transaction-local marker and check it
after the SQL, next to the role check. After `BEGIN`, `SELECT set_config('tp.migration_try', $1, true)` with a
fresh random value; after `client.query(migration.sql)`, `SELECT current_setting('tp.migration_try', true)` must
equal it, otherwise throw the ordinary non-retried failure ("it ended the runner's transaction or reset its
settings; a migration never commits, rolls back or runs RESET ALL"). I confirmed that a transaction-local setting is
gone after `COMMIT; BEGIN` and after `RESET ALL`, and survives `SAVEPOINT`/`ROLLBACK TO` and a migration's own
`SET LOCAL lock_timeout`, so the check keeps what the ADR allows. It also closes the older hole for the role check
and for the dry run (where an embedded `COMMIT` commits the "dry" run; also older than this change). The check runs
after the fact, so it turns a silent escape into a failed deploy; it cannot stop the first half from committing.

### C1-2: should fix. A handler that swallows the cancellation leaves a migration recorded as applied with a statement that never ran

File: `packages/db/src/migrate.ts` lines 280-283 (a try that raises nothing is committed and recorded) with the new
`setLockTimeout` at line 280; the runner has no way to see an error a handler absorbed.

Before this change a lock wait inside a migration never raised: it waited and then succeeded. Now it raises
55P03 inside the migration's own code, where a PL/pgSQL handler can catch it. Reproduced with the real runner
(timeout 300 ms, a reader transaction holding `busy`):

```
20270101000003_swallow.sql:
  DO $$ BEGIN ALTER TABLE busy ADD COLUMN z int; EXCEPTION WHEN OTHERS THEN NULL; END $$;
-> applied ["20270101000003_swallow.sql"], elapsed 323 ms, pauses []
column z exists: 0 ; row in schema_migrations: 1
```

The same shape with `WHEN lock_not_available THEN` followed by anything other than a retry or a raise behaves the
same way. Existing migrations: the only handlers that can catch 55P03 are the four `EXCEPTION WHEN
lock_not_available THEN PERFORM pg_sleep(1)` loops, which wrap `NOWAIT` statements only and raise after 300 tries;
no migration has `WHEN OTHERS`. So nothing shipped is affected; the exposure is the next migration that wraps a
waiting statement in a handler written when waits could not fail.

Smallest fix, outside the migration files: a static refusal for migrations not yet applied, in the check that
already gates new migrations (or in `readMigrations` for pending files only, so applied files and their checksums
are untouched): refuse `WHEN OTHERS` in a migration's top-level `DO` blocks, and state the rule in the ADR's
"What it does not bound" paragraph and the new-migration skill ("a handler in a migration that catches
`lock_not_available` or `OTHERS` re-raises or wraps `NOWAIT` statements only"). A runtime detection in the runner
is not possible: the server reports nothing for an error a handler absorbed.

### C1-3: note. "The pauses are longer than the waits" is false for the first two pauses

File: `packages/db/src/migrate.ts` lines 67-69 (comment on `MIGRATION_LOCK_WAIT`), line 59-61
(`migrationPauseMs`); `docs/adr/0009-...md` amendment, decision 2 ("The pauses are longer than the waits, so what
queued behind a try drains before the next").

The wait is 2 s; the first pause is 1 s and the second is 2 s. The stated reason is also not the mechanism: the
queue drains at the cancellation itself, not during the pause (measured: a reader that arrived 100 ms into a 300 ms
wait was served 200 ms later, at the instant of the cancellation; a new reader after the error and before the
runner's `ROLLBACK` was served in 0-1 ms). What the pauses actually set is how much of the time the table is
stalled: with the deployed values, readers arriving in the first seven seconds are held up during four of them
(2 s wait, 1 s pause, 2 s wait, 2 s pause), each for under 2 s. That is within the web's 3 s limit, so the reader
claim survives. Smallest fix: correct the two sentences (the queue goes at the cancellation; the pauses bound the
share of time a try stalls the table). No code change needed.

### C1-4: note. A cancellation re-raised by a migration's own `RAISE EXCEPTION` is not retried

File: `packages/db/src/migrate.ts` line 97-99.

A handler that re-raises with a bare `RAISE;` keeps `routine = ProcessInterrupts` and is retried (verified). A
handler that re-raises as `RAISE EXCEPTION '%', SQLERRM USING ERRCODE = SQLSTATE` produces 55P03 with
`routine = exec_stmt_raise` and the server's own message text, and is not retried: the run fails at once with
"`<file>` failed: canceling statement due to lock timeout". This is the safe direction (nothing applied, plain
failure) and matches decision 4 ("an error the runner cannot recognize is not retried"). No existing migration does
this. No change asked; worth one line in the ADR so the message is not mistaken for a runner bug.

### C1-5: note. A retry repeats everything a try did under locks it already held

File: `packages/db/src/migrate.ts` lines 277-294. The ADR's "What it does not bound" already says a held lock is
the migration's design and that a lock loop runs again on every try; this adds the measured numbers and one
consequence it does not state.

- The timeout is per lock wait, not per try. A migration that takes table `a` at once and then waits twice, 250 ms
  each, for `b` and `c` under a 300 ms timeout succeeded with no cancellation, and a reader of `a` (never
  contended) waited the whole time (about 470 ms plus the rest of the transaction). With the deployed values each
  further lock a migration waits for can add up to 2 s to the stall on the tables it already holds, which can
  exceed the web's 3 s limit after the second wait.
- When the later wait is cancelled, the locks taken earlier in that try were held for nothing, and are taken again
  on each of the 20 tries, together with any work done under them (a backfill, an index build). Real-runner
  reproduction: a `NOWAIT` loop that takes `counter` and then `ALTER TABLE busy` behind a holder; 3 tries, each
  taking `counter` exclusively for the length of the wait; a reader of `counter` waited 216 ms of a 300 ms timeout.
- I checked the four lock-loop migrations for this shape and did not find it (see below). The rule for the next
  migration is "take every lock the migration needs first, before any work", which the new-migration skill should
  say; the runner needs no change.

## What I tried and could not break

### 1. `isLockTimeout`

`code = 55P03, routine = ProcessInterrupts` on both versions for a cancelled wait in every one of these: a plain
`ALTER TABLE` behind a reader; the same inside a multi-statement simple query; inside a `DO` block; inside a `DO`
block with a handler that re-raises with bare `RAISE`; inside an SQL-language function; a row lock (`UPDATE` behind
an uncommitted `UPDATE`); `SELECT ... FOR UPDATE`; `CREATE INDEX` behind a writer; `ALTER TABLE ... ADD FOREIGN
KEY` behind a writer of the referenced table; the foreign-key row check of an `INSERT` (the RI trigger's own
query) behind a `DELETE` of the parent row; a unique-key wait on `INSERT`; `pg_advisory_xact_lock`; a query run
with `debug_parallel_query = on`; a deferred foreign-key check that waits at `COMMIT` (the commit fails with the
same fields, nothing is committed, the runner's `ROLLBACK` is then a harmless no-op, and the retry is correct).

Not mistaken for it: `LOCK TABLE ... NOWAIT` (`routine = RangeVarGetRelidExtended`), `FOR UPDATE NOWAIT`
(`heap_lock_tuple`), a migration's `RAISE ... USING ERRCODE = 'lock_not_available'` (`exec_stmt_raise`), and a
`RAISE` that copies the server's message text word for word with SQLSTATE 55P03 (`exec_stmt_raise`). SQL cannot set
the `routine` field, so a migration cannot forge it. A lock loop whose handler catches a real cancellation and then
gives up raises its own error and is not retried, as designed.

`statement_timeout` firing at the same instant as `lock_timeout` reports 57014 (statement timeout), which is not
retried; nothing in the repository sets `statement_timeout` for the migrator, so this is unreachable today.

Not verified: a server that is not community PostgreSQL (the `routine` field is an implementation detail of the
server's source; a fork may name it differently). The failure mode would be the safe one: no retry, a plain
failure on the first cancelled wait.

### 2. `set_config('lock_timeout', $1, true)`

- Transaction-local: `current_setting('lock_timeout')` is the runner's value inside the transaction and the
  session's value after `ROLLBACK` and after `COMMIT`.
- Re-applied on every try: by construction (line 280 is inside the loop), and observed across tries.
- Immune to an earlier migration's `SET lock_timeout = '10s'`: after that migration commits the session value is
  `10s`; the next transaction's `set_config(..., true)` shows the runner's value; after that transaction ends the
  session is back at `10s`, which no runner statement outside a try waits under.
- `SAVEPOINT s; SET LOCAL lock_timeout = 0; ROLLBACK TO s` restores the runner's value.
- `SET LOCAL ROLE <other>` does not touch the timeout and is caught by the existing role check (older than this
  change).
- Escapes that exist: the migration's own `SET LOCAL lock_timeout` (allowed by the ADR), a function with a
  `SET lock_timeout = 0` attribute (inside that function only; measured an unbounded 900 ms wait under a 300 ms
  timeout), and `RESET ALL`, `RESET lock_timeout`, non-local `SET`, `COMMIT; BEGIN` (C1-1). The `COMMIT` escape and
  its effect on the role check were possible before this change.

### 3. The four lock-loop migrations

Read: the loop and the statements after it in `20261109090000_line_status_heads.sql` (loop at lines 78-91),
`20261110090000_ledger_interest_once.sql` (90-103), `20261111090000_password_changed_notice.sql` (142-156),
`20261112090000_sign_in_not_before.sql` (118-133).

- `NOWAIT` does not wait, so the 2 s timeout never fires inside a loop; `pg_sleep` is not a lock wait and is not
  cut short (measured: `pg_sleep(0.8)` under a 300 ms timeout ran 801 ms, no error). The loops' five minutes are
  unchanged.
- A loop that gives up raises its own `lock_not_available` (`routine = exec_stmt_raise`): not retried, fails in its
  own words. The commit's tests cover this and `NOWAIT`'s refusal.
- After each loop I looked for a statement that needs a lock the loop did not take, or a stronger one on a table it
  took in a weaker mode (an upgrade would now be cancelled at 2 s and re-run the loop). Found none: 20261109 holds
  `claim` SHARE and `line_status` SHARE ROW EXCLUSIVE and afterwards creates a new table, builds an index on
  `claim` (needs SHARE, held) and replaces functions; 20261110 holds both ledger tables exclusively and alters only
  those; 20261111 holds `"user"` SHARE ROW EXCLUSIVE (what the new table's foreign key to it needs) and
  `audit_event` and `mail_send` exclusively (the trigger, the policy and the constraint changes are on those);
  20261112 holds `"user"`, `user_session`, `password_notice` exclusively and `audit_event` SHARE ROW EXCLUSIVE
  (enough for its `CREATE TRIGGER`). Function replacement and grants take no table lock a request holds.
- So the 2 s limit changes nothing for them in practice. The theoretical worst case (a post-loop wait cancelled,
  then tries times loop) is in the ADR already.

### 4. The reader-queue claim, the advisory lock, the role

- The waiting request is gone from the queue at the cancellation, before the runner sends `ROLLBACK`: at that
  point `pg_locks` shows the migrator's backend with no ungranted row and no relation lock, only its advisory lock;
  a new reader is served at once. The error aborts the transaction in the server, which releases every lock the
  try took as well (a reader of a table the try had locked exclusively was released at the cancellation, 271 ms
  into a 300 ms timeout, although I delayed the `ROLLBACK` a further 400 ms). The comment at line 285 credits the
  rollback; the server does it earlier, which is stronger than claimed.
- A reader queued behind the waiting request waits at most the remainder of that wait (measured 200 ms of 300 ms),
  so under 2 s against the web's 3 s with the deployed values.
- During a pause the session is outside any transaction (no transaction id, no snapshot, no relation lock), so it
  queues nothing and holds back no vacuum.
- The session-level `pg_advisory_lock` survives the cancelled try and its `ROLLBACK` (still held and granted
  afterwards), so a second migrator stays excluded for the whole retry period. It is waited for without limit and
  queues no reader, as the ADR says.
- `SET ROLE` state: after a cancelled try and `ROLLBACK`, `current_user` is still the owner role (the session-level
  `SET ROLE` of line 273); `SET LOCAL ROLE` is re-issued in every try (line 189). Nothing leaks between tries.
- "Nothing else about the runner changed": the only behavioural difference I found outside the tries is that the
  dry run's `pendingMigrations` statements now run under the timeout (line 242 precedes line 244); a cancellation
  there would surface as the driver's raw error rather than a `MigrationError`. I could not construct a wait there
  (the advisory lock excludes other migrators and nothing else locks `schema_migrations`), so it is not a finding.

## Commands

Scratch scripts (outside the repository, in the session scratch directory, not kept): a driver-level script that
opens a holder and a "migrator" connection per case, runs `BEGIN; SELECT set_config('lock_timeout','300ms',true)`
and the case's SQL, and prints `code`, `routine` and the elapsed time; a second that emulates the runner's session
(`pg_advisory_lock`, `SET ROLE`, per-try `BEGIN` / `set_config` / `SET LOCAL ROLE`) and prints
`current_setting('lock_timeout')`, `current_user` and `pg_current_xact_id_if_assigned()` before and after each
escape, and times readers; a third that calls the real `migrate()` from `packages/db/src/migrate.ts` (through
`tsx`) with a temporary migrations directory, `lockWait: { timeoutMs: 300, attempts: 3, pause: record-only }`, on a
scratch database. The SQL of each reproduced case is quoted in the finding it belongs to.
