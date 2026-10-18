import { createHash } from 'node:crypto';

import { s3KeyPhiFindings } from '@tp/observability';

/**
 * Write-once object storage for the copies that must outlive anything the application can do: the
 * nightly audit copy now, packets and exports later (PRD 15 Files: "S3 with versioning and Object
 * Lock for packets and audit copies"). Production is S3 with Object Lock in compliance mode
 * (S3ObjectLockStore); development and tests use the file system (LocalObjectStore).
 *
 * An object is written once. Writing the same bytes to the same key again is a no-op ("unchanged"),
 * which makes a job that writes it idempotent; different bytes under an existing key are refused,
 * because a write-once copy that differs from its source is evidence of tampering or of a bug.
 * Keys are opaque: a key that could carry PHI is refused before anything is written.
 */

export interface PutImmutableRequest {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  /** Nothing, not even the account owner, can delete or overwrite the object before this instant. */
  readonly retainUntil: Date;
}

export type PutOutcome = 'written' | 'unchanged';

export interface StoredObject {
  /** SHA-256 of the bytes, hex. */
  readonly sha256: string;
  readonly retainUntil: Date | null;
}

export interface ObjectStore {
  putImmutable(request: PutImmutableRequest): Promise<PutOutcome>;
  head(key: string): Promise<StoredObject | null>;
}

/** An object already exists under the key with different bytes. */
export class ObjectConflictError extends Error {
  override readonly name = 'ObjectConflictError';
}

/** A key was refused before any write: not opaque, or outside the store. */
export class ObjectKeyError extends Error {
  override readonly name = 'ObjectKeyError';
}

export function sha256Hex(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/** Refuses a key that could carry PHI (SEC-08); the error names the rule, never the key. */
export function requireOpaqueKey(key: string): string {
  const findings = s3KeyPhiFindings(key);
  if (key === '' || key.startsWith('/') || findings.length > 0) {
    throw new ObjectKeyError(`object keys are opaque relative paths: ${findings.join('; ') || 'empty or absolute'}`);
  }
  return key;
}

/** Same bytes: nothing to do; different bytes: refused. */
export function compareExisting(existing: StoredObject, sha256: string): PutOutcome {
  if (existing.sha256 !== sha256) {
    throw new ObjectConflictError('a different object already exists under this key; write-once objects are never replaced');
  }
  return 'unchanged';
}
