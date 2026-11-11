# 0009. Own every table with a no-login owner role, give the application a role that owns nothing, and migrate forward only

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 1 (rule 4), 3 (authorization in code), 8 (rule_release immutable), 15 (database), 16 (tenant isolation, change management); Data dictionary conventions; the new-migration skill

## Context

Milestone 0 needs the first tables (rule_release, rule_record) and the roles every later table relies on: an
owner that owns tables and runs migrations and loads, and an application role that is not a superuser, cannot
bypass row-level security and owns nothing. Migrations are hand-written SQL and forward-only, and an applied
migration is never edited. Roles belong to the whole PostgreSQL cluster, while tests create a database each.

## Decision

- **Roles.** `tp_owner` (NOLOGIN, NOSUPERUSER, NOBYPASSRLS) owns every table, function and the
  `schema_migrations` table; the migrating or loading connection switches to it with `SET ROLE`. `tp_app`
  (NOLOGIN, NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE) owns nothing; logins are its members.
  `tp_app_dev` is a login for it with a fixed local password, created only by `pnpm db:migrate --dev-login`
  (developer machines and tests); deployed environments create their own logins from Secrets Manager. The
  bootstrap is idempotent and retries the catalog conflicts a concurrent bootstrap in another database causes;
  a connecting user that is not a superuser is granted `tp_owner` so it can `SET ROLE`. It runs from a superuser
  and from a login with CREATEROLE that is not one (the RDS master user, the deploy job's login): it reads
  `pg_roles` and alters only the attributes that differ, because PostgreSQL 16 refuses `ALTER ROLE ... NOSUPERUSER`
  (or NOREPLICATION, NOBYPASSRLS) from a non-superuser even when nothing changes. If one of those three is wrong,
  it stops and names the `ALTER ROLE` a superuser must run. A database test migrates a fresh database as such a
  login.
- **Migrations.** `packages/db/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, applied in name order, each in its own
  transaction as `tp_owner`, under an advisory lock. Every file in the directory must be named that way (a
  `.SQL` or a README is refused, never skipped). `schema_migrations` records each file's SHA-256; the runner
  refuses to apply anything when an applied file changed or is missing, or when a new file sorts before one
  already applied. Each migration's transaction starts with `SET LOCAL ROLE tp_owner`; after its SQL the runner
  checks that the role is still `tp_owner`, that every relation, function and type in schema `public` belongs
  to `tp_owner`, and that `tp_app` owns nothing, and rolls the migration back otherwise (a `RESET ROLE` inside a
  migration is caught).
- **Dry run, forward and back.** `pnpm db:migrate --dry-run` runs the role bootstrap and every pending migration,
  with the same checks, in one transaction and rolls it back. Migrations are forward-only, so "back" (PRD section
  18: "migration dry-run forward and back") means two things here: the dry run's rollback leaves the database
  exactly at its previous head, which a database test proves by comparing a catalog snapshot (relations, owners,
  grants, columns, functions, triggers, schemas, applied migrations) before and after a dry run from the previous
  head; and a deploy goes back by redeploying the previous image against the new schema, which the add, backfill
  and remove rule (PRD section 15) keeps safe. A migration that could not run under the previous image is split.
  Migrations that would need a down script are not written. The Drizzle schema in `packages/db/src/schema/` mirrors the SQL for typed queries, and a
  database test checks the two agree; milestone 1 adds its tenancy tables beside `rules.ts`.
- **Global tables.** `rule_release` and `rule_record` follow the data dictionary (plus the `id`, `created_at`,
  `updated_at` conventions). The application role gets SELECT and has INSERT, UPDATE, DELETE and TRUNCATE
  revoked. Triggers make a published release immutable for every role, superusers included: a release is
  inserted unpublished, its records added, and published in the same transaction; after that no record can be
  added, and no row of either table can be updated, deleted or truncated.

## Alternatives considered

| Option | Why not |
| --- | --- |
| A migration tool (drizzle-kit, node-pg-migrate) | The plan has hand-written SQL migrations; a hundred-line runner with a checksum table does what is needed and is read in one sitting |
| Down migrations for "back" | Forward-only is the plan's rule (the new-migration skill); a down script is untested code that runs only in an emergency |
| A login owner role | A second credential to store and rotate; SET ROLE from the deploy job's login gives the same ownership |
| Revoking writes from the application role only | The owner and the loader could still rewrite a published release; triggers make "immutable once published" true for everyone |
| Roles created by infrastructure code only | Tests and local development need them too; the idempotent bootstrap runs everywhere and infrastructure adds the logins |

## Consequences

- Every later migration runs as `tp_owner`, so new tables are owned by it with no extra step; PHI tables add
  `ENABLE` and `FORCE ROW LEVEL SECURITY`, which binds the owner too.
- The worker and the web app connect as members of `tp_app`; loading a rule release needs the owner, so it runs
  as a deploy-time job (`pnpm release:load`) or a worker job with an owner-capable connection.
- A wrong release can never be fixed in place: it is withdrawn by loading a new release number.
- ADR 0004's open question (who owns pg-boss's schema) is settled in milestone 1 within this model.

## Revisit when

Milestone 1 adds the tenancy tables and the catalog test, or RDS's role model requires a different bootstrap.

## Amendment, 2026-11-11: no migration waits for a lock without limit

**Why.** A schema change asks for its table's strongest lock. While that request waits behind a long transaction (a
reconcile pass, a report, any job that has read the table), PostgreSQL queues every later reader and writer of the
table behind the waiting request. The runner set no `lock_timeout`, so one migration queued behind a long job stopped
every practice's requests on that table for as long as the job ran (found by the reviews of ADR 0092's amendment,
whose three-second limit on the web's requests then turns each of those waits into a refusal). The migrations from
ADR 0083 on take their big locks in `NOWAIT` loops of their own; nothing bounded every other statement, or any
migration without such a loop.

**Decision.**
1. Each migration's transaction sets `lock_timeout` as its first statement, as the transaction's own setting
   (`set_config('lock_timeout', $1, true)`), so it is set again for every try and every migration whatever an earlier
   one did to the session's. **Two seconds** for each wait for one lock: under the three seconds a signed-in web
   request waits (`WEB_LOCK_TIMEOUT_MS`; a web test holds the two apart), so a request queued behind a waiting
   migration is let through before it would be answered `busy`.
2. When PostgreSQL cancels a wait at that limit, the runner rolls the migration's transaction back, which gives up
   its place in the queue and every lock the try took, pauses, and tries the whole migration again: **twenty tries**,
   pausing 1, 2, 4 and 8 seconds and then 15 seconds each time, about five minutes in all (the limit ADR 0083's loops
   keep). The pauses are longer than the waits, so what queued behind a try drains before the next.
3. Past the last try the run fails with "`<file>` failed: a lock it needs stayed held (tried 20 times, waiting 2000 ms
   for each lock); it changed nothing; run the deploy again when no long job is running (docs/adr/0009)", exit code
   1. The migrations before it in the same run stay applied (each commits on its own) and no service moves
   (docs/runbooks/deploy-and-rollback.md).
4. Only PostgreSQL's own cancellation of a lock wait is tried again. It is recognized by its SQLSTATE (55P03) together
   with the place in the server that raised it (the error's `routine`, `ProcessInterrupts`), a field no locale
   translates. `NOWAIT`'s refusal and a migration's own `RAISE ... lock_not_available` carry the same SQLSTATE and are
   not retried: such a migration has already tried for as long as it means to and fails at once in its own words. An
   error the runner cannot recognize is not retried either; the run fails.
5. The dry run sets the same limit after it holds the migrators' advisory lock and does not retry: its one
   transaction holds every pending migration, so a cancelled wait fails the dry run, which changes nothing either way.
6. The migrators' advisory lock is still waited for without limit: it queues no reader, and a second migrator's turn
   comes when the first ends.

**What it does not bound.** Once a migration holds a table's lock, readers wait until it commits: how long a
migration may hold a lock is each migration's design (the add, backfill and remove rule; the new-migration skill). A
migration with its own `NOWAIT` loop runs that loop again on every try, so its worst case is the tries times its loop;
in practice a try is repeated only after a cancelled wait. A migration may set a `lock_timeout` of its own after the
runner's; none does today.

| Option | Why not |
| --- | --- |
| A session-wide `SET lock_timeout` once | A migration that changes the session's setting would change it for every migration after it; the transaction's own is set again each time |
| No retry: fail on the first cancelled wait | A deploy would fail on any report that happens to be open; a few spaced tries find the gap between jobs without holding anyone |
| Retry on SQLSTATE 55P03 alone | It would re-run a migration's own five-minute lock loop twenty times after that loop had already given up |
| Recognize the cancellation by its message | The message follows the server's `lc_messages` |
| End the blocking transaction (`pg_terminate_backend`) | A deploy must never end a job's or a person's transaction to make room (the deploy runbook's rule) |

