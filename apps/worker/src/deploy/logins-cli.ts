import { databaseClient, readDatabaseUrl } from '@tp/db';

import { LoginProvisionError, provisionLogins, readDeployLogins } from './logins';

/**
 * The migration task's second step (dist/logins.js; docs/adr/0049): after the migrations, as the owner
 * login (DATABASE_URL), creates the queue role and schema and the application, worker, operator, queue
 * and billing logins from their secrets (src/deploy/logins.ts). It prints login names only.
 */
let client;
try {
  const logins = readDeployLogins();
  client = databaseClient(readDatabaseUrl());
  await client.connect();
  const { created } = await provisionLogins(client, logins);
  process.stdout.write(`logins: ${created.length === 0 ? 'every login already existed' : `created ${created.join(', ')}`}.\n`);
} catch (error) {
  if (!(error instanceof LoginProvisionError)) {
    throw error;
  }
  process.stderr.write(`logins: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  await client?.end();
}
