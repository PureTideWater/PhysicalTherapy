import { createHash, randomUUID } from 'node:crypto';

import type { KeyProvider } from './crypto/key-provider';
import { provisionPracticeKey } from './crypto/practice-keys';
import type { MembershipRole } from './schema/tenancy';
import { type OwnerClient, asOwner } from './tenant-world';

/**
 * The synthetic tenancy `pnpm db:seed` writes for development and the e2e tests (synthetic only;
 * never a real organization, practice or person):
 *
 * - SYNTHETIC THERAPY GROUP owning two practices (North and South), each with its BAA and engagement
 *   letter recorded by reference and SHA-256;
 * - SYNTHETIC OTHER GROUP owning a third practice, for cross-tenant checks;
 * - SYNTHETIC BILLING FIRM with an engagement letter and a grant to North approved by North's
 *   practice administrator (all firm roles, 90 days);
 * - the company's internal organization;
 * - the people the caller names, each a member of one of them with one role.
 *
 * Written as the owner role, inside each practice's scope where its rows need one. Refuses to run
 * twice on the same database.
 */

export type SeedOrganization = 'group' | 'other_group' | 'firm' | 'internal';

export interface SeedPerson {
  readonly key: string;
  readonly email: string;
  /** The identity provider's subject for the person. */
  readonly sub: string;
  readonly organization: SeedOrganization;
  readonly role: MembershipRole;
  readonly invited: boolean;
}

export interface SeedResult {
  readonly organizations: Readonly<Record<SeedOrganization, string>>;
  readonly practices: { readonly north: string; readonly south: string; readonly other: string };
  readonly users: Readonly<Record<string, string>>;
  readonly grantId: string;
}

export class SeedError extends Error {
  override readonly name = 'SeedError';
}

const NAMES: Readonly<Record<SeedOrganization, string>> = {
  group: 'SYNTHETIC THERAPY GROUP',
  other_group: 'SYNTHETIC OTHER GROUP',
  firm: 'SYNTHETIC BILLING FIRM',
  internal: 'SYNTHETIC COMPANY (INTERNAL)',
};

const KINDS: Readonly<Record<SeedOrganization, 'group' | 'firm' | 'internal'>> = { group: 'group', other_group: 'group', firm: 'firm', internal: 'internal' };

/** A stand-in for a signed document's hash: the SHA-256 of a synthetic label. */
function documentHash(label: string): string {
  return createHash('sha256').update(`synthetic signed document ${label}`).digest('hex');
}

export async function seedSyntheticTenancy(client: OwnerClient, people: readonly SeedPerson[], keys: KeyProvider): Promise<SeedResult> {
  const existing = (await asOwner(client, [], () => client.query('SELECT 1 FROM organization WHERE name = $1', [NAMES.group]))).rows;
  if (existing.length > 0) {
    throw new SeedError('this database is already seeded; seed a fresh one');
  }
  // Every group needs its active practice administrator before its practices exist (PRD 3: a practice
  // always has an administrator), and the group's approves the firm's grant.
  for (const group of ['group', 'other_group'] as const) {
    if (!people.some((candidate) => candidate.organization === group && candidate.role === 'practice_admin' && !candidate.invited)) {
      throw new SeedError(`the ${group} needs an active practice administrator`);
    }
  }
  const organizations = Object.fromEntries(Object.keys(NAMES).map((key) => [key, randomUUID()])) as Record<SeedOrganization, string>;
  const users: Record<string, string> = {};
  await asOwner(client, [], async () => {
    for (const key of Object.keys(NAMES) as SeedOrganization[]) {
      await client.query('INSERT INTO organization (id, kind, name) VALUES ($1, $2, $3)', [organizations[key], KINDS[key], NAMES[key]]);
    }
    for (const person of people) {
      const id = randomUUID();
      users[person.key] = id;
      await client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, $5, $6)', [
        id,
        person.sub,
        person.email,
        !person.invited,
        person.organization === 'internal',
        person.invited ? 'invited' : 'active',
      ]);
      await client.query('INSERT INTO membership (organization_id, user_id, role) VALUES ($1, $2, $3)', [organizations[person.organization], id, person.role]);
    }
  });
  const administrator = (organization: SeedOrganization): string => {
    const person = people.find((candidate) => candidate.organization === organization && candidate.role === 'practice_admin' && !candidate.invited);
    if (person === undefined) {
      throw new SeedError(`the ${organization} needs an active practice administrator`);
    }
    return users[person.key] ?? '';
  };
  const practices = { north: randomUUID(), south: randomUUID(), other: randomUUID() };
  const owning: Readonly<Record<keyof typeof practices, SeedOrganization>> = { north: 'group', south: 'group', other: 'other_group' };
  const names = { north: 'SYNTHETIC PHYSICAL THERAPY NORTH', south: 'SYNTHETIC PHYSICAL THERAPY SOUTH', other: 'SYNTHETIC OTHER PRACTICE' };
  for (const practice of Object.keys(practices) as (keyof typeof practices)[]) {
    const id = practices[practice];
    const key = await provisionPracticeKey(keys, id);
    await asOwner(client, [id], async () => {
      await client.query("INSERT INTO practice (id, organization_id, name, zip, data_key_ref) VALUES ($1, $2, $3, '27601', $4)", [id, organizations[owning[practice]], names[practice], key.dataKeyRef]);
      for (const kind of ['baa', 'engagement'] as const) {
        await client.query(
          `INSERT INTO agreement (organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
           VALUES ($1, $2, $3, '1', now() - interval '30 days', 'SYNTHETIC SIGNER', $4, $5)`,
          [organizations[owning[practice]], id, kind, `esign:synthetic-${practice}-${kind}`, documentHash(`${practice} ${kind}`)],
        );
      }
    });
  }
  const grantId = randomUUID();
  await asOwner(client, [practices.north], async () => {
    const agreementId = randomUUID();
    await client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'engagement', '1', now() - interval '20 days', 'SYNTHETIC SIGNER', 'esign:synthetic-firm-engagement', $4)`,
      [agreementId, organizations.firm, practices.north, documentHash('firm engagement')],
    );
    await client.query(
      `INSERT INTO "grant" (id, organization_id, practice_id, scope, ends_at, approved_by_user_id, agreement_id)
       VALUES ($1, $2, $3, '{"roles":["firm_principal","firm_analyst","billing_manager","analyst","viewer"]}', now() + interval '90 days', $4, $5)`,
      [grantId, organizations.firm, practices.north, administrator('group'), agreementId],
    );
  });
  return { organizations, practices, users, grantId };
}
