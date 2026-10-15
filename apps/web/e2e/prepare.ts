import { rmSync } from 'node:fs';

import { databaseClient, migrate } from '@tp/db';

import { developmentMasterKey } from '../src/lib/server/config';
import { seed } from '../scripts/seed';
import { E2E_DATABASE, E2E_DEV_AUTH_DIR, e2eAdminUrl, e2eDatabaseUrl } from './env';

/**
 * Before the e2e server starts: a fresh database (migrated, with the application role's dev login)
 * and a fresh local identity provider, seeded with the synthetic personas. Synthetic data only.
 */
const admin = databaseClient(e2eAdminUrl());
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DATABASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${E2E_DATABASE}`);
} finally {
  await admin.end();
}
await migrate({ databaseUrl: e2eDatabaseUrl(), devLogin: true });
rmSync(E2E_DEV_AUTH_DIR, { recursive: true, force: true });
await seed({ databaseUrl: e2eDatabaseUrl(), devAuthDirectory: E2E_DEV_AUTH_DIR, masterKey: developmentMasterKey() });
process.stdout.write(`e2e: database ${E2E_DATABASE} migrated and seeded\n`);
