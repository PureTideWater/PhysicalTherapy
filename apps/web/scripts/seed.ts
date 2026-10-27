import { createHash, randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { type KeyProvider, LocalKeyProvider, OWNER_ROLE, SeedError, type SeedPerson, type SeedResult, databaseClient, provisionPracticeKey, readDatabaseUrl, seedSyntheticTenancy } from '@tp/db';
import { CORRESPONDENCE_CONTACT_KEY, SYNTHETIC_CORRESPONDENCE_CONTACT } from '@tp/packets';

import { FileDevStore } from '../src/lib/auth/dev-store';
import { hashPassword } from '../src/lib/auth/password';
import { defaultDevAuthDirectory, developmentMasterKey } from '../src/lib/server/config';
import {
  SCRIPT_ORGANIZATIONS,
  SYNTHETIC_CONSOLE_SUSPENSION_FIRM,
  SYNTHETIC_FIRM_CLIENT_GROUP,
  SYNTHETIC_FIRM_CLIENT_PRACTICE,
  SYNTHETIC_PERSONAS,
  SYNTHETIC_SUSPENDED_FIRM,
  SYNTHETIC_SUSPENDED_GROUP,
  type SeedOrganization,
  personaEmail,
  personaPassword,
  personaTotpSecret,
} from './synthetic-personas';

/**
 * `pnpm db:seed`: the synthetic tenancy (packages/db/src/seed.ts), SYNTHETIC SUSPENDED GROUP held suspended by
 * PaidWhole, SYNTHETIC SUSPENDED FIRM held suspended by PaidWhole with its grant to SYNTHETIC FIRM CLIENT PRACTICE,
 * SYNTHETIC CONSOLE SUSPENSION FIRM for the console's journey, the SYNTHETIC correspondence contact of the group's practices, and, for each person, their credentials in the local identity provider's store, so development and the e2e tests can sign in
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

export interface SyntheticSeedResult extends Omit<SeedResult, 'organizations' | 'practices'> {
  readonly organizations: Readonly<Record<SeedOrganization, string>>;
  readonly practices: SeedResult['practices'] & { readonly firm_client: string };
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
    const keys = new LocalKeyProvider(options.masterKey);
    const tenancy = await seedSyntheticTenancy(client, people.filter((person): person is SeedPerson => !SCRIPT_ORGANIZATIONS.includes(person.organization)), keys);
    const held = await seedSuspensions(
      client,
      people.filter((person) => SCRIPT_ORGANIZATIONS.includes(person.organization)),
      keys,
    );
    result = {
      ...tenancy,
      organizations: { ...tenancy.organizations, ...held.organizations },
      practices: { ...tenancy.practices, firm_client: held.firmClientPractice },
      users: { ...tenancy.users, ...held.users },
    };
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

/** A document's synthetic SHA-256, as packages/db's seed writes its agreements'. */
function documentHash(label: string): string {
  return createHash('sha256').update(`synthetic signed document ${label}`).digest('hex');
}

/**
 * The organizations PaidWhole's suspension journeys read, each shared with no other journey so a parallel run never
 * sees one change, written as the owner role as packages/db's seed writes the others (the owner may write a status;
 * organization_status_rules stamps its time):
 * - SYNTHETIC SUSPENDED GROUP (BIL-06): no practice, suspended by PaidWhole at the customer's request from the start
 *   and never reinstated;
 * - SYNTHETIC SUSPENDED FIRM (BIL-09): suspended by PaidWhole for a security hold and never reinstated, with a grant in
 *   force on SYNTHETIC FIRM CLIENT PRACTICE, which its principal reaches only through it;
 * - SYNTHETIC FIRM CLIENT GROUP, that practice's own group, with its BAA, engagement letter and pricing location as
 *   packages/db's seed writes a practice's, whose administrator's staff carry on;
 * - SYNTHETIC CONSOLE SUSPENSION FIRM: active, for the console journey that suspends and reinstates it.
 */
async function seedSuspensions(
  client: ReturnType<typeof databaseClient>,
  people: readonly SyntheticPerson[],
  keys: KeyProvider,
): Promise<{ readonly organizations: Record<'suspended_group' | 'suspended_firm' | 'firm_client_group' | 'console_firm', string>; readonly users: Record<string, string>; readonly firmClientPractice: string }> {
  const organizations = { suspended_group: randomUUID(), suspended_firm: randomUUID(), firm_client_group: randomUUID(), console_firm: randomUUID() };
  const names = { suspended_group: SYNTHETIC_SUSPENDED_GROUP, suspended_firm: SYNTHETIC_SUSPENDED_FIRM, firm_client_group: SYNTHETIC_FIRM_CLIENT_GROUP, console_firm: SYNTHETIC_CONSOLE_SUSPENSION_FIRM };
  const kinds = { suspended_group: 'group', suspended_firm: 'firm', firm_client_group: 'group', console_firm: 'firm' } as const;
  const users: Record<string, string> = {};
  const practiceId = randomUUID();
  const key = await provisionPracticeKey(keys, practiceId);
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', $1, true)", [`{${practiceId}}`]);
    for (const organization of Object.keys(organizations) as (keyof typeof organizations)[]) {
      await client.query('INSERT INTO organization (id, kind, name) VALUES ($1, $2, $3)', [organizations[organization], kinds[organization], names[organization]]);
    }
    for (const person of people) {
      const organizationId = organizations[person.organization as keyof typeof organizations];
      if (organizationId === undefined) {
        throw new SeedError(`no seeded organization ${person.organization} for ${person.key}`);
      }
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
    const administrator = users['firm-client-admin'];
    if (administrator === undefined) {
      throw new SeedError('SYNTHETIC FIRM CLIENT GROUP needs its practice administrator');
    }
    await client.query("INSERT INTO practice (id, organization_id, name, data_key_ref, settings) VALUES ($1, $2, $3, $4, '{}')", [
      practiceId,
      organizations.firm_client_group,
      SYNTHETIC_FIRM_CLIENT_PRACTICE,
      key.dataKeyRef,
    ]);
    await client.query("INSERT INTO practice_site (practice_id, zip) VALUES ($1, '27601')", [practiceId]);
    for (const kind of ['baa', 'engagement'] as const) {
      await client.query(
        `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
         VALUES ($1, $2, $3, '1', now() - interval '30 days', 'SYNTHETIC SIGNER', $4, $5)`,
        [organizations.firm_client_group, practiceId, kind, `esign:synthetic-firm-client-${kind}`, documentHash(`firm client ${kind}`)],
      );
    }
    const agreementId = randomUUID();
    await client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now() - interval '20 days', 'SYNTHETIC SIGNER', 'esign:synthetic-suspended-firm-engagement', $4)`,
      [agreementId, organizations.suspended_firm, practiceId, documentHash('suspended firm engagement')],
    );
    await client.query(
      `INSERT INTO "grant" (organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, '{"roles":["firm_principal","firm_analyst","billing_manager","analyst","viewer"]}', now() + interval '90 days', $3, $4)`,
      [organizations.suspended_firm, practiceId, administrator, agreementId],
    );
    // PaidWhole's suspensions, with their stored reasons; the trigger stamps each one's time.
    await client.query("UPDATE organization SET status = 'suspended', status_reason = 'customer_request' WHERE id = $1", [organizations.suspended_group]);
    await client.query("UPDATE organization SET status = 'suspended', status_reason = 'security_hold' WHERE id = $1", [organizations.suspended_firm]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  return { organizations, users, firmClientPractice: practiceId };
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
