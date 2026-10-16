import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

import { databaseClient, migrate } from '@tp/db';
import { loadRelease } from '@tp/rules/loader';
import { JOB_TYPES, queueOptions } from '@tp/worker/jobs';
import { PgBoss } from 'pg-boss';

import { developmentMasterKey } from '../src/lib/server/config';
import { seed } from '../scripts/seed';
import { E2E_BILLING_DIR, E2E_DATABASE, E2E_DEV_AUTH_DIR, E2E_DOCUMENTS_DIR, E2E_MAIL_OUTBOX_DIR, E2E_MODEL_OUTPUTS_DIR, e2eAdminUrl, e2eDatabaseUrl } from './env';

/**
 * Before the e2e server starts: a fresh database (migrated, with the application role's dev login,
 * and SYNTHETIC rule release 900001 loaded, the release pricing runs are pinned to) and a fresh local
 * identity provider, seeded with the synthetic personas. Synthetic data only.
 */
const SYNTHETIC_RELEASE = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/rules/release-synth-900001');
const admin = databaseClient(e2eAdminUrl());
await admin.connect();
try {
  await admin.query(`DROP DATABASE IF EXISTS ${E2E_DATABASE} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${E2E_DATABASE}`);
} finally {
  await admin.end();
}
await migrate({ databaseUrl: e2eDatabaseUrl(), devLogin: true });
const owner = databaseClient(e2eDatabaseUrl());
await owner.connect();
try {
  await loadRelease(owner, SYNTHETIC_RELEASE, { release: 900001, allowSyntheticFixtureForTests: true });
} finally {
  await owner.end();
}
rmSync(E2E_DEV_AUTH_DIR, { recursive: true, force: true });
rmSync(E2E_DOCUMENTS_DIR, { recursive: true, force: true });
rmSync(E2E_MAIL_OUTBOX_DIR, { recursive: true, force: true });
rmSync(E2E_BILLING_DIR, { recursive: true, force: true });
// The local model provider's outputs: none until a journey writes one (every other call proposes nothing).
rmSync(E2E_MODEL_OUTPUTS_DIR, { recursive: true, force: true });
mkdirSync(E2E_MODEL_OUTPUTS_DIR, { recursive: true });
await seed({ databaseUrl: e2eDatabaseUrl(), devAuthDirectory: E2E_DEV_AUTH_DIR, masterKey: developmentMasterKey() });
// pg-boss's schema and the worker's queues, as the worker creates them on start: the server queues
// intake jobs on them, and the upload tests run the worker beside it.
const boss = new PgBoss(e2eDatabaseUrl());
boss.on('error', () => undefined);
await boss.start();
for (const type of JOB_TYPES) {
  await boss.createQueue(type, queueOptions(type));
}
await boss.stop({ graceful: false, close: true });
process.stdout.write(`e2e: database ${E2E_DATABASE} migrated and seeded\n`);
