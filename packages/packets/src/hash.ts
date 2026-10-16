import { createHash } from 'node:crypto';

import type { PacketContent } from './format';
import { narrativeSha256 } from './verifier';

/**
 * A packet version's hash (PRD 12, Approval: "Approval records the user, time and the packet version
 * hash"): SHA-256 over the canonical JSON (keys sorted, no whitespace) of the version's content, its
 * number and its narrative's SHA-256. The approver names this hash; the database refuses an approval
 * that names another, so an approval always attests exactly the version it is on.
 */

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') {
      throw new TypeError('amounts are written as integer text before hashing');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function versionSha256(input: { readonly packetId: string; readonly versionNo: number; readonly content: PacketContent; readonly narrative: string }): string {
  return createHash('sha256')
    .update(canonicalJson({ packet_id: input.packetId, version_no: input.versionNo, content: input.content, narrative_sha256: narrativeSha256(input.narrative) }), 'utf8')
    .digest('hex');
}
