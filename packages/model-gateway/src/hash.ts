import { createHash } from 'node:crypto';

import { canonicalJson } from '@tp/packets';

export { canonicalJson };

/** The SHA-256 of text (UTF-8) or bytes, in lower-case hex. */
export function sha256Hex(value: string | Uint8Array): string {
  const hash = createHash('sha256');
  if (typeof value === 'string') {
    hash.update(value, 'utf8');
  } else {
    hash.update(value);
  }
  return hash.digest('hex');
}

/** The SHA-256 of a value's canonical JSON (keys sorted, no whitespace). */
export function jsonSha256(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

const SHA256 = /^[0-9a-f]{64}$/;

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}
