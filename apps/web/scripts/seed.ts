import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LocalKeyProvider, SeedError, type SeedPerson, type SeedResult, databaseClient, readDatabaseUrl, seedSyntheticTenancy } from '@tp/db';

import { FileDevStore } from '../src/lib/auth/dev-store';
import { hashPassword } from '../src/lib/auth/password';
import { defaultDevAuthDirectory, developmentMasterKey } from '../src/lib/server/config';
import { SYNTHETIC_PERSONAS, personaEmail, personaPassword, personaTotpSecret } from './synthetic-personas';

/**
 * `pnpm db:seed`: the synthetic tenancy (packages/db/src/seed.ts) and, for each person, their
 * credentials in the local identity provider's store, so development and the e2e tests can sign in
 * as every persona. DATABASE_URL names a login that can SET ROLE to the owner (the docker-compose
 * superuser locally); TP_DEV_AUTH_DIR the provider's directory (the web server's default when unset);
 * TP_LOCAL_MASTER_KEY the local key provider's master key (the development key when unset).
 * Synthetic data only; refuses a database it has seeded before.
 */

export interface SeedOptions {
  readonly databaseUrl: string;
  readonly devAuthDirectory: string;
  readonly masterKey: Buffer;
  /** The scrypt cost (tests lower it). */
  readonly scryptCost?: { readonly n: number; readonly r: number; readonly p: number };
}

export async function seed(options: SeedOptions): Promise<SeedResult> {
  const people: SeedPerson[] = SYNTHETIC_PERSONAS.map((persona) => ({
    key: persona.key,
    email: personaEmail(persona.key),
    sub: randomUUID(),
    organization: persona.organization,
    role: persona.role,
    invited: persona.invited === true,
  }));
  const client = databaseClient(options.databaseUrl);
  await client.connect();
  let result: SeedResult;
  try {
    result = await seedSyntheticTenancy(client, people, new LocalKeyProvider(options.masterKey));
  } finally {
    await client.end();
  }
  // A fresh store: subjects from an earlier seed name nobody in this database.
  const file = path.join(options.devAuthDirectory, 'store.json');
  rmSync(file, { force: true });
  const store = new FileDevStore(file);
  for (const person of people) {
    await store.put({
      sub: person.sub,
      email: person.email,
      passwordHash: await hashPassword(personaPassword(person.key), options.scryptCost),
      temporary: person.invited,
      totpSecret: person.invited ? null : personaTotpSecret(person.key),
      totpLastStep: -1,
      credentials: [],
    });
  }
  return result;
}

async function main(): Promise<void> {
  const masterKey = process.env.TP_LOCAL_MASTER_KEY;
  try {
    await seed({
      databaseUrl: readDatabaseUrl(),
      devAuthDirectory: process.env.TP_DEV_AUTH_DIR ?? defaultDevAuthDirectory(),
      masterKey: masterKey === undefined ? developmentMasterKey() : Buffer.from(masterKey, 'base64'),
    });
  } catch (error) {
    if (error instanceof SeedError) {
      process.stderr.write(`db:seed: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
  process.stdout.write(
    `db:seed: seeded ${String(SYNTHETIC_PERSONAS.length)} synthetic people (${SYNTHETIC_PERSONAS.map((persona) => personaEmail(persona.key)).join(', ')}).\n` +
      'Sign in as one with the password Synthetic-<key>-Pass-2026! and the TOTP code from apps/web/scripts/synthetic-personas.ts (personaTotpCode).\n',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
