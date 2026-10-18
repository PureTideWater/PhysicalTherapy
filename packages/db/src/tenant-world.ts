import { randomBytes, randomUUID } from 'node:crypto';

import { OWNER_ROLE } from './roles';
import type { MembershipRole } from './schema';

/**
 * Synthetic tenants for database tests, written through the owner role. The owner is bound by the
 * same forced row-level security as everyone else: it writes a practice's rows only inside that
 * practice's scope, so every write here sets app.practice_ids first. Synthetic data only.
 */

export interface OwnerClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/** Runs `run` in one transaction as tp_owner with app.practice_ids set to `practiceIds`. */
export async function asOwner<T>(client: OwnerClient, practiceIds: readonly string[], run: () => Promise<T>, actorId = ''): Promise<T> {
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', $1, true), set_config('app.actor_id', $2, true)", [`{${practiceIds.join(',')}}`, actorId]);
    const result = await run();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

export interface TenantWorld {
  readonly label: string;
  /** The practice group that owns the practice. */
  readonly organizationId: string;
  readonly practiceId: string;
  /** An active practice administrator of the practice, with MFA enrolled. */
  readonly adminUserId: string;
  /** The practice's BAA with its group. */
  readonly agreementId: string;
}

/** Rows of a world that foreign keys can point at, by referenced table. */
export function worldRefs(world: TenantWorld): Readonly<Record<string, string>> {
  return { practice: world.practiceId, organization: world.organizationId, user: world.adminUserId, agreement: world.agreementId };
}

export async function createOrganization(client: OwnerClient, kind: 'group' | 'firm' | 'internal', label: string = kind): Promise<string> {
  const id = randomUUID();
  await asOwner(client, [], () => client.query('INSERT INTO organization (id, kind, name) VALUES ($1, $2, $3)', [id, kind, `SYNTHETIC ${label.toUpperCase()} ORGANIZATION`]));
  return id;
}

export interface UserOptions {
  readonly status?: 'invited' | 'active' | 'disabled';
  readonly mfaEnrolled?: boolean;
  readonly hardwareKeyRequired?: boolean;
}

export async function createUser(client: OwnerClient, options: UserOptions = {}): Promise<string> {
  const id = randomUUID();
  await asOwner(client, [], () =>
    client.query('INSERT INTO "user" (id, cognito_sub, email, mfa_enrolled, hardware_key_required, status) VALUES ($1, $2, $3, $4, $5, $6)', [
      id,
      `synthetic-${id}`,
      `${id}@synthetic.test`,
      options.mfaEnrolled ?? true,
      options.hardwareKeyRequired ?? false,
      options.status ?? 'active',
    ]),
  );
  return id;
}

export async function addMembership(client: OwnerClient, organizationId: string, userId: string, role: MembershipRole, endsAt: string | null = null): Promise<string> {
  const id = randomUUID();
  await asOwner(client, [], () =>
    client.query('INSERT INTO membership (id, organization_id, user_id, role, ends_at) VALUES ($1, $2, $3, $4, $5)', [id, organizationId, userId, role, endsAt]),
  );
  return id;
}

/** A synthetic wrapped-key reference in the format practice.data_key_ref accepts (not a real key). */
export function placeholderDataKeyRef(): string {
  return `local:v1:${randomBytes(48).toString('base64')}`;
}

/**
 * A practice group, its practice, an active practice administrator with MFA, and the practice's BAA:
 * the smallest tenant the policies treat as real.
 */
export async function createTenantWorld(client: OwnerClient, label: string): Promise<TenantWorld> {
  const organizationId = await createOrganization(client, 'group', label);
  const adminUserId = await createUser(client);
  await addMembership(client, organizationId, adminUserId, 'practice_admin');
  const practiceId = randomUUID();
  const agreementId = randomUUID();
  await asOwner(client, [practiceId], async () => {
    await client.query('INSERT INTO practice (id, organization_id, name, data_key_ref) VALUES ($1, $2, $3, $4)', [
      practiceId,
      organizationId,
      `SYNTHETIC PRACTICE ${label.toUpperCase()}`,
      placeholderDataKeyRef(),
    ]);
    await client.query(
      `INSERT INTO agreement (id, organization_id, practice_id, kind, version, signed_at, signer, document_ref, sha256)
       VALUES ($1, $2, $3, 'baa', '1', now(), 'SYNTHETIC SIGNER', $4, $5)`,
      [agreementId, organizationId, practiceId, `agreements/${agreementId}`, randomBytes(32).toString('hex')],
    );
  });
  return { label, organizationId, practiceId, adminUserId, agreementId };
}
