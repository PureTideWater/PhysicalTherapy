import { createHash, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { LocalKeyProvider, OWNER_ROLE, SeedError, type SeedPerson, type SeedResult, databaseClient, readDatabaseUrl, seedSyntheticTenancy } from '@tp/db';
import { CORRESPONDENCE_CONTACT_KEY, SYNTHETIC_CORRESPONDENCE_CONTACT } from '@tp/packets';

import { FileDevStore } from '../src/lib/auth/dev-store';
import { hashPassword } from '../src/lib/auth/password';
import { defaultDevAuthDirectory, developmentMasterKey } from '../src/lib/server/config';
import { SYNTHETIC_PERSONAS, SYNTHETIC_SUSPENDED_GROUP, type SeedOrganization, personaEmail, personaPassword, personaTotpSecret } from './synthetic-personas';

/**
 * `pnpm db:seed`: the synthetic tenancy (packages/db/src/seed.ts), SYNTHETIC SUSPENDED GROUP held suspended by
 * PaidWhole, the SYNTHETIC correspondence contact of the group's practices, and, for each person, their credentials in the local identity provider's store, so development and the e2e tests can sign in
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

/** A seeded person, of any seeded organization (the synthetic tenancy's or the suspended group). */
type SyntheticPerson = Omit<SeedPerson, 'organization'> & { readonly organization: SeedOrganization };

export interface SyntheticSeedResult extends Omit<SeedResult, 'organizations'> {
  readonly organizations: Readonly<Record<SeedOrganization, string>>;
}

export async function seed(options: SeedOptions): Promise<SyntheticSeedResult> {
  const people: SyntheticPerson[] = SYNTHETIC_PERSONAS.map((persona) => ({
    key: persona.key,
    email: personaEmail(persona.key),
    sub: randomUUID(),
    organization: persona.organization,
    role: persona.role,
    invited: persona.invited === true,
  }));
  const client = databaseClient(options.databaseUrl);
  await client.connect();
  let result: SyntheticSeedResult;
  try {
    const tenancy = await seedSyntheticTenancy(client, people.filter((person): person is SeedPerson => person.organization !== 'suspended_group'), new LocalKeyProvider(options.masterKey));
    const suspended = await holdSuspendedGroup(client, people.filter((person) => person.organization === 'suspended_group'));
    result = { ...tenancy, organizations: { ...tenancy.organizations, suspended_group: suspended.organizationId }, users: { ...tenancy.users, ...suspended.users } };
    await acceptSyntheticTerms(client, result);
    await setSyntheticCorrespondence(client, result);
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

/**
 * SYNTHETIC SUSPENDED GROUP (BIL-06): a group with no practice, suspended by PaidWhole from the start and never
 * reinstated, and its people, written as the owner role as packages/db's seed writes the other organizations. Its
 * billing journey shares it with no other journey, so a parallel run never sees it change.
 */
async function holdSuspendedGroup(client: ReturnType<typeof databaseClient>, people: readonly SyntheticPerson[]): Promise<{ readonly organizationId: string; readonly users: Record<string, string> }> {
  const organizationId = randomUUID();
  const users: Record<string, string> = {};
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("INSERT INTO organization (id, kind, name, status) VALUES ($1, 'group', $2, 'suspended')", [organizationId, SYNTHETIC_SUSPENDED_GROUP]);
    for (const person of people) {
      const id = randomUUID();
      users[person.key] = id;
      await client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, false, $5)', [
        id,
        person.sub,
        person.email,
        !person.invited,
        person.invited ? 'invited' : 'active',
      ]);
      await client.query('INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, $3)', [organizationId, id, person.role]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return { organizationId, users };
}

/** The synthetic terms of use in force (docs/adr/0053). */
export const SYNTHETIC_TERMS_VERSION = 'synthetic-2026-10';

/**
 * Publishes a synthetic version of the terms of use and records that every seeded person accepted it, so the
 * personas work as they did before the terms gate; a person invited later accepts it at first sign-in.
 */
async function acceptSyntheticTerms(client: ReturnType<typeof databaseClient>, result: SyntheticSeedResult): Promise<void> {
  const publisher = result.users['platform-admin'];
  if (publisher === undefined) {
    throw new SeedError('the synthetic terms need a platform administrator to publish them');
  }
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    const { rows } = await client.query<{ id: string }>("INSERT INTO terms_version (version, document_ref, sha256, published_by) VALUES ($1, 'terms/synthetic-2026-10', $2, $3) RETURNING id", [
      SYNTHETIC_TERMS_VERSION,
      createHash('sha256').update('synthetic terms of use').digest('hex'),
      publisher,
    ]);
    await client.query("INSERT INTO terms_acceptance (user_id, terms_version_id, request_id) SELECT unnest($1::uuid[]), $2, 'seed'", [Object.values(result.users), rows[0]?.id]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * The SYNTHETIC correspondence contact on the group's two practices (audit item #37 part 1, D6), so a packet exports in
 * development as it does once a practice administrator has set one; the other group's practice is left without one.
 */
async function setSyntheticCorrespondence(client: ReturnType<typeof databaseClient>, result: SyntheticSeedResult): Promise<void> {
  const practices = [result.practices.north, result.practices.south];
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${practices.join(',')}}`]);
    await client.query(`UPDATE practice SET settings = jsonb_set(settings, '{${CORRESPONDENCE_CONTACT_KEY}}', $2::jsonb) WHERE id = ANY($1::uuid[])`, [practices, JSON.stringify(SYNTHETIC_CORRESPONDENCE_CONTACT)]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
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
