# C review 4: delta `8214f012..213954c0` (the try's savepoint, the budget's clock)

Scope: `packages/db/src/migrate.ts`, `packages/db/src/migrate-lock-wait.db.test.ts`, ADR 0009 amendment items 7, 9,
10, the runbook and the new-migration skill, as changed in this delta. Read-only review. Nothing in the repository
was changed and no suite was run. Experiments ran on PostgreSQL 18.4 (`localhost:5433`,
`max_prepared_transactions = 0`) in a scratch database created and dropped by the script, synthetic tables only,
with a harness that repeats the runner's statements in order (BEGIN, `set_config('lock_timeout', …, true)`,
`SAVEPOINT tp_migration_runner_try`, `pg_current_xact_id()`, the file as one simple query, the id check, COMMIT;
on failure the probe exactly as `endedByMigration`, then ROLLBACK). The runner itself was not executed.

Result: one should-fix (C4-1, a regression against `8214f012`), four notes. No blocker. The mechanism holds for
every failure inside the migration's SQL; it is wrong only for a failure of the runner's own COMMIT.

## Findings

### C4-1 (should fix): a failure at the runner's COMMIT is reported as "may be partly applied", and a lock wait cancelled at COMMIT is no longer tried again

`packages/db/src/migrate.ts:357` (COMMIT inside the `try`), `:362` (the probe in the `catch`), `:273-283`.

When COMMIT itself fails, PostgreSQL has already rolled the transaction back and the session is outside any
transaction block. The `catch` then probes with `ROLLBACK TO SAVEPOINT`, which PostgreSQL refuses with SQLSTATE
`25P01` ("ROLLBACK TO SAVEPOINT can only be used in transaction blocks"). A refusal with an SQLSTATE is read as
"the migration ended the runner's transaction", so the run fails with "failed and may be partly applied … compare
the database with the file before anything runs again", and the runbook then says to stop and not deploy again.
The migration did nothing wrong and nothing of it is in the database.

Reproduced (PostgreSQL 18.4):

| File | Error at COMMIT | Probe | Reported |
| --- | --- | --- | --- |
| `INSERT INTO child VALUES (1, 99)` (FK `DEFERRABLE INITIALLY DEFERRED`) | `23503` | `25P01` | ended = true |
| a deferred constraint trigger that raises | `P0001` | `25P01` | ended = true |
| deferred FK check waits on a parent row another session is deleting | `55P03`, routine `ProcessInterrupts` | `25P01` | ended = true, no retry |

After each, the scratch database held no row and no table from the file.

This is reachable with the repository's own schema: the migrations define deferred constraint triggers
(`20261015140000_tenancy.sql:447,463,478`, `20261015180000_tenancy_hardening.sql:247`,
`20261016160000_contracts_and_mapping.sql:446`, `20261105090000_pricing_location_and_zip_plus_four.sql:160`). A
later data migration that updates `membership`, `practice`, `"user"` or `contract_version` runs those checks at
COMMIT, where they can raise or wait for a row lock.

Regression: at `8214f012` the catch ran ROLLBACK and then `pg_xact_status`, which answered `aborted`; the first two
rows gave the plain "failed: …" and the third was tried again. The third row is the case the whole amendment exists
for (a cancelled wait is retried), now turned into a stop-the-deploy message.

Smallest fix: the id check at `:215` has already proved, before COMMIT, that the transaction is the runner's own, so
a COMMIT failure cannot be the migration ending it. Skip the probe for that statement, for example
`xid = undefined;` on the line before `await client.query('COMMIT')` (the probe returns false for `undefined`), or a
`committing` flag read in the `catch`. Then a COMMIT error is the plain failure, and a cancelled wait at COMMIT is
tried again. Add one test: a file whose deferred constraint fails at COMMIT expects "failed:" and not "may be partly
applied". The dry run is not affected (it never commits).

### C4-2 (note): a file that creates an enum type, adds a value to it and uses that value now fails

`packages/db/src/migrate.ts:354` (and `:308` for the dry run).

PostgreSQL allows a new enum value to be used in the transaction that also created the type, but only when the type
was created at the top level, not inside a subtransaction. With the try's savepoint every migration runs in a
subtransaction. Reproduced:

`CREATE TYPE m2 AS ENUM ('a'); ALTER TYPE m2 ADD VALUE 'b'; CREATE TABLE e2 (m m2 DEFAULT 'b');`

- without the savepoint: applies
- with the savepoint: `55P04 unsafe use of new value "b" of enum type m2`

No migration in the repository uses `ADD VALUE` (grep at `213954c0`), so nothing breaks today. It fails loudly and
changes nothing; the probe reports it correctly as an ordinary failure. Side effect in the dry run: before, one file
creating a type and a later pending file adding and using a value passed the dry run and failed the real run (two
transactions); now both fail, so the dry run is the more faithful. Smallest fix: one sentence in the skill ("a
migration never uses an enum value it added itself; create the type with every value, or use the value in a later
migration"). No code change.

### C4-3 (note): a file that releases the runner's savepoint and then fails is reported as having ended the transaction

`packages/db/src/migrate.ts:278-281`.

`RELEASE SAVEPOINT tp_migration_runner_try; SELECT 1/0` gives probe error `3B001` (savepoint does not exist), so
ended = true, although the transaction is still the runner's and its ROLLBACK undoes everything. Reproduced. It
needs a file that names the runner's savepoint, so it is contrived, and the error is on the careful side. The same
file without the failure applies normally (reproduced). Smallest fix, if any: on `3B001`, compare the transaction id
instead of returning true (after a plain `ROLLBACK`, which is harmless there). I would leave it and not document the
name.

### C4-4 (note): the budget's clock no longer covers the wait for another migrator, which the deploy's fifty minutes do

`packages/db/src/migrate.ts:343-344`; comment at `:73-76`; `docs/runbooks/deploy-and-rollback.md:297`;
`infra/lib/constructs/migration-run.ts:22`.

Placement and scope are correct as code: `started` is declared in the block that holds the retry loop and is read
at `:370` inside it; the dry run never reads it. ADR item 10 states exactly what the code does.

What moved: the comment at `:73-76` argues that thirty minutes keep the runner "well before" the deploy's fifty.
That held when the clock started at connect. Now a run that waits N minutes for another migrator's advisory lock can
still be trying at N + 30 (+ about six for one last lock loop), past fifty once N exceeds roughly fourteen. It needs
two migrators on one database at once, which the deploy does not normally produce, and the deploy "does not stop it
at that limit". The runbook's "once the whole run has lasted thirty minutes (the deploy waits fifty for the task)"
is now loose in the same way. Smallest fix: either add "counted from its own turn" to the runbook sentence and to
the comment at `:73-76`, or return to the earlier placement and keep C3-7's one clause in the ADR. The earlier
placement is the one that keeps the stated margin against the deploy.

### C4-5 (note): stale and missing words

- `packages/db/src/migrate.ts:198`: "which names it after it has ended (pg_xact_status)". `pg_xact_status` is no
  longer used anywhere in the runner.
- `docs/runbooks/deploy-and-rollback.md:298-300`: "that migration ended the runner's transaction itself" is untrue
  in the C4-1 cases until C4-1 is fixed; true after.
- ADR item 7, "which PostgreSQL allows in the runner's transaction alone": a file can recreate a savepoint of that
  name in a transaction of its own, and then PostgreSQL allows the rollback there too. The code covers it with the
  id comparison (see below), and the sentence's conclusion ("whatever it began afterwards, is never tried again") is
  true. "By that savepoint and the transaction's number" would be exact.
- Tests: no case for a failure at COMMIT (C4-1) and none where the file recreates the savepoint in its own
  transaction (the id-comparison branch at `:279` is not exercised by a failing try; the three new cases reach the
  SQLSTATE branch or the success-path id check).

## Answers to the six questions

1. **Does `ROLLBACK TO SAVEPOINT` always succeed in the runner's own transaction?** Yes, for every failure inside
   the SQL: a cancelled lock wait (`55P03`, `ProcessInterrupts`), an ordinary error, an error raised in a DO block,
   the file's own `SAVEPOINT`/`RELEASE`/`ROLLBACK TO`, a savepoint of the same name created (and released) by the
   file, a deferred constraint forced with `SET CONSTRAINTS ALL IMMEDIATE`, and an administrator's
   `pg_cancel_backend` (`57014`). Each gave ended = false with the same id. False reports: C4-1 (COMMIT) and C4-3.
2. **Can a file that ended the transaction pass as not ended?** Not found. `ROLLBACK; BEGIN; SAVEPOINT
   tp_migration_runner_try; …; SELECT 1/0`: the probe's rollback succeeds and the id differs, ended = true.
   `COMMIT; BEGIN; SAVEPOINT …` then success: the id check at `:215` throws, the probe sees a different id.
   `COMMIT AND CHAIN` then error: `3B001`. `ROLLBACK;` then error outside a transaction: `25P01`. An `xid8` never
   repeats, so the comparison is sufficient.
3. **Does the savepoint change what a migration can do?** Two differences in sixteen statements tried with and
   without it: C4-2, and `pg_export_snapshot()` ("cannot export a snapshot from a subtransaction"), which no
   migration needs. Unchanged: `SET TRANSACTION ISOLATION LEVEL` (already refused, a query has run),
   `SET TRANSACTION READ WRITE`, `ALTER TYPE … ADD VALUE` and use on an existing type (already refused), REINDEX,
   CLUSTER, LOCK and TRUNCATE, a `WITH HOLD` cursor, a temporary table `ON COMMIT DROP`, `SET CONSTRAINTS`,
   `REFRESH MATERIALIZED VIEW CONCURRENTLY`, a parallel index build, `CREATE INDEX CONCURRENTLY` and VACUUM (both
   still refused). Cost: one subtransaction id per try. A plain backfill, however large, stays in that one
   subtransaction, so there is no overflow; only a file that itself opens more than 63 writing exception blocks or
   savepoints reaches PostgreSQL's 64-entry cache one earlier than before (70 such blocks applied in both modes).
4. **The dry run.** No wrong report found. The id is read after the savepoint; the probe's rollback also undoes
   earlier pending migrations, which the `finally` ROLLBACK does anyway. COMMIT never runs, so C4-1 cannot occur.
   A file that commits makes the bootstrap and `schema_migrations` real and frees the transaction-level advisory
   lock; "The dry run may have changed the database" says so. (Before and after this delta, the dry run does not
   run deferred checks, so a file that would fail at COMMIT passes it; outside this delta.)
5. **The budget's clock.** In scope and placed where item 10 says; see C4-4 for what the placement gives up.
6. **Docs against code.** Items 7, 9 and 10, the runbook's new sentence and the skill's "what it can see of these,
   not every form" match the code, with the exceptions in C4-1 and C4-5.

## What I could not break

- A lost connection: `pg_terminate_backend` during the SQL gave `57P01` for the try and "Connection terminated
  unexpectedly" with no SQLSTATE for the probe, so ended = false and the plain failure names the migration.
- `PREPARE TRANSACTION`: refused while `max_prepared_transactions` is 0; the transaction is then aborted and ended
  at the end of the simple query, the probe says ended = true, which is true (the file ended it) and nothing stays.
- A failure before the savepoint (`BEGIN`, `set_config`, `SAVEPOINT`): `xid` is still undefined, no probe, plain
  failure.
- `SET LOCAL ROLE` now sits after the savepoint, so the probe's rollback undoes it; the ROLLBACK that follows would
  have anyway, and the session role is the owner in the real run.
- Nothing from any refused file stayed in the scratch database except what its own COMMIT had made real, and the
  message said "may be partly applied" in each of those cases.

## Not done

- The runner and its suite were not executed (a full suite was running); the harness mirrors the statement order by
  reading the code. Serialization failure at COMMIT was not reproduced (the runner uses the default isolation
  level); it would take the same path as C4-1.
- PostgreSQL 16 was not re-tested for this delta; the enum behaviour in C4-2 is specific to recent major versions.
