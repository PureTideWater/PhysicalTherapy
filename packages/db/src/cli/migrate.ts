import { parseArgs } from 'node:util';

import { readDatabaseUrl } from '../config';
import { MigrationError, migrate } from '../migrate';
import { RoleBootstrapError } from '../roles';

/**
 * `pnpm db:migrate [--dev-login] [--dry-run]`: creates the roles, then applies the pending
 * migrations in packages/db/migrations as the owner role (src/migrate.ts). --dev-login also creates
 * the dev and test login for the application role (local machines and CI only). --dry-run applies
 * the pending migrations in one transaction and rolls it back, changing nothing.
 */
let devLogin = false;
let dryRun = false;
try {
  ({
    values: { 'dev-login': devLogin = false, 'dry-run': dryRun = false },
  } = parseArgs({ args: process.argv.slice(2), options: { 'dev-login': { type: 'boolean' }, 'dry-run': { type: 'boolean' } }, strict: true }));
} catch {
  process.stderr.write('usage: pnpm db:migrate [--dev-login] [--dry-run]\n');
  process.exit(2);
}

try {
  const result = await migrate({ databaseUrl: readDatabaseUrl(), devLogin, dryRun });
  if (result.dryRun) {
    const would = result.applied.length === 0 ? 'nothing to apply' : `applied and rolled back ${result.applied.join(', ')}`;
    process.stdout.write(`db:migrate --dry-run: ${would} (${String(result.alreadyApplied.length)} already applied); the database is unchanged.\n`);
    process.exit(0);
  }
  const applied = result.applied.length === 0 ? 'nothing to apply' : `applied ${result.applied.join(', ')}`;
  process.stdout.write(`db:migrate: ${applied} (${String(result.alreadyApplied.length)} already applied)${devLogin ? '; dev login ready' : ''}.\n`);
} catch (error) {
  if (error instanceof MigrationError || error instanceof RoleBootstrapError) {
    process.stderr.write(`db:migrate: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
