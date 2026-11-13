import { randomBytes, randomUUID } from 'node:crypto';

import { type DatabaseClient, type DatabasePool, withActor } from '@tp/db';

import type { OpenedSession } from '../../auth/sessions';
import { openSessionNow } from './open-session';

/**
 * What the hardware-key registry asks of a test's people (docs/adr/0095; Queues item 37): a registered key, a session
 * opened with it, and a platform administrator seven days in the role. Tests only.
 */

/** The account records a new key, as the sign-in flow does after the provider registered it. Returns the credential's digest. */
export async function recordKey(app: DatabasePool, userId: string): Promise<Buffer> {
  const credential = randomBytes(32);
  await withActor(app, userId, async (scope) => {
    await scope.client.query('SELECT * FROM hardware_key_record($1, $2, NULL, sign_in_step_began(), $3)', [credential, randomBytes(77), `test-${randomUUID()}`]);
  });
  return credential;
}

/** A key session opened just now with the registered key. */
export function keySession(app: DatabasePool, userId: string, credential: Buffer, requestId = 'test'): Promise<OpenedSession> {
  return openSessionNow(app, { userId, method: 'webauthn', deviceToken: undefined, userAgent: null, requestId, keyCredentialSha256: credential });
}

/**
 * A platform_admin membership `days` old. Seeded with every trigger off (session_replication_role), since the role's
 * age is the membership row's and a membership added the ordinary way is new and records a role escalation.
 */
export async function seedPlatformAdmin(owner: DatabaseClient, internalId: string, userId: string, days = 8): Promise<string> {
  const membership = randomUUID();
  await owner.query('BEGIN');
  try {
    await owner.query("SET LOCAL session_replication_role = 'replica'");
    await owner.query(`INSERT INTO membership (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, 'platform_admin', now() - make_interval(days => $4))`, [membership, internalId, userId, days]);
    await owner.query('COMMIT');
  } catch (error) {
    await owner.query('ROLLBACK');
    throw error;
  }
  return membership;
}
