import { parseArgs } from 'node:util';

import { readDatabaseUrl } from '../config';
import { MigrationError, migrate } from '../migrate';

/**
 * `pnpm db:migrate [--dev-login]`: creates the roles, then applies the pending migrations in
 * packages/db/migrations as the owner role (src/migrate.ts). --dev-login also creates the dev and
 * test login for the application role (local machines and CI only).
 */
let devLogin = false;
try {
  ({ values: { 'dev-login': devLogin = false } } = parseArgs({ args: process.argv.slice(2), options: { 'dev-login': { type: 'boolean' } }, strict: true }));
} catch {
  process.stderr.write('usage: pnpm db:migrate [--dev-login]\n');
  process.exit(2);
}

try {
  const result = await migrate({ databaseUrl: readDatabaseUrl(), devLogin });
  const applied = result.applied.length === 0 ? 'nothing to apply' : `applied ${result.applied.join(', ')}`;
  process.stdout.write(`db:migrate: ${applied} (${String(result.alreadyApplied.length)} already applied)${devLogin ? '; dev login ready' : ''}.\n`);
} catch (error) {
  if (error instanceof MigrationError) {
    process.stderr.write(`db:migrate: ${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
