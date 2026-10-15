/**
 * `pnpm db:migrate`. The forward-only migration runner arrives with milestone 0 part B and
 * milestone 1 (packages/db/migrations, created through /new-migration). Until then there is
 * nothing to apply and this exits 0 so CI's migrate step runs.
 */
process.stdout.write('db:migrate: no migrations yet (the runner and the first migration arrive with milestone 1).\n');
