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
  a connecting user that is not a superuser is granted `tp_owner` so it can `SET ROLE`.
- **Migrations.** `packages/db/migrations/<YYYYMMDDHHMMSS>_<name>.sql`, applied in name order, each in its own
  transaction as `tp_owner`, under an advisory lock. `schema_migrations` records each file's SHA-256; the runner
  refuses to apply anything when an applied file changed or is missing, or when a new file sorts before one
  already applied. The Drizzle schema in `packages/db/src/schema/` mirrors the SQL for typed queries, and a
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
