import type { PracticeScope, ScopeClient } from '../authz/scope';
import { OWNER_ROLE } from '../roles';
import { PracticeCipher } from './cipher';
import { DataKeyError, type KeyProvider, requirePractice } from './key-provider';

/**
 * Per-practice data keys referenced by practice.data_key_ref: provisioning when a practice is
 * created, opening a practice's cipher inside its scope, and destroying the key at the end of the
 * deletion workflow (PRD 5 J14; PRD 16 Encryption: "data keys destroyed on deletion"). The wrapped
 * key exists only in practice.data_key_ref (and, until they age out, in database backups); once it
 * is gone, no ciphertext of the practice can be decrypted by anyone, the platform included.
 */

/** The practice's data key has been destroyed (or was never provisioned): its ciphertexts are unreadable. */
export class DataKeyDestroyedError extends DataKeyError {
  override readonly name = 'DataKeyDestroyedError';
}

export interface ProvisionedKey {
  /** Store this as practice.data_key_ref when the practice row is inserted. */
  readonly dataKeyRef: string;
  readonly cipher: PracticeCipher;
}

/** A new data key for a practice about to be created. */
export async function provisionPracticeKey(provider: KeyProvider, practiceId: string): Promise<ProvisionedKey> {
  const key = await provider.generateDataKey(requirePractice(practiceId));
  return { dataKeyRef: key.wrapped, cipher: new PracticeCipher(practiceId, key.plaintext) };
}

/** The practice's cipher from its stored reference; a destroyed (null) reference opens nothing. */
export async function openPracticeCipher(provider: KeyProvider, practiceId: string, dataKeyRef: string | null): Promise<PracticeCipher> {
  if (dataKeyRef === null) {
    throw new DataKeyDestroyedError('the practice’s data key has been destroyed; its encrypted values cannot be read');
  }
  return new PracticeCipher(practiceId, await provider.decryptDataKey(requirePractice(practiceId), dataKeyRef));
}

/** Reads practice.data_key_ref under the scope's policies and opens the practice's cipher. */
export async function loadPracticeCipher<C extends ScopeClient>(scope: PracticeScope<C>, provider: KeyProvider, practiceId: string): Promise<PracticeCipher> {
  const { rows } = await scope.client.query<{ data_key_ref: string | null }>('SELECT data_key_ref FROM practice WHERE id = $1', [requirePractice(practiceId)]);
  const [row] = rows;
  if (row === undefined) {
    throw new DataKeyError('the practice is not in this scope');
  }
  return openPracticeCipher(provider, practiceId, row.data_key_ref);
}

interface OwnerConnection {
  query(text: string, values?: unknown[]): Promise<{ rowCount: number | null }>;
}

/**
 * Destroys a practice's data key: data_key_ref becomes null and the practice is marked deleted, in
 * one transaction as the owner role inside the practice's scope, with a system audit event. Returns
 * false when the key was already destroyed. The deletion workflow (milestone 12) calls this last,
 * after its legal-hold check and export. `client` must be able to SET ROLE to the owner.
 */
export async function destroyPracticeDataKey(client: OwnerConnection, practiceId: string, requestId: string): Promise<boolean> {
  const practice = requirePractice(practiceId);
  await client.query('BEGIN');
  try {
    await client.query(`SET LOCAL ROLE ${OWNER_ROLE}`);
    await client.query("SELECT set_config('app.practice_ids', ARRAY[$1::uuid]::text, true)", [practice]);
    const destroyed = await client.query("UPDATE practice SET data_key_ref = NULL, status = 'deleted' WHERE id = $1 AND data_key_ref IS NOT NULL", [practice]);
    if (destroyed.rowCount === 1) {
      await client.query(
        "INSERT INTO audit_event (actor_kind, action, object_type, object_id, practice_id, purpose, request_id) VALUES ('system', 'data_key_destroyed', 'practice', $1, $1, 'deletion', $2)",
        [practice, requestId],
      );
    }
    await client.query('COMMIT');
    return destroyed.rowCount === 1;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
