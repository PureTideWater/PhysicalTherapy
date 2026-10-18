/**
 * The reference tables that pass the fixture guard without the SYNTHSENDER column: other files pin their
 * exact bytes (release manifests, the golden lines, the MOD-01 evaluation baseline, AUDIT-01's worksheet),
 * so a marker column would break what pins them (docs/adr/0059). A table passes only at its repository
 * path and with its exact sha256; a changed byte, or the same bytes elsewhere, falls back to the marker rule.
 */
import { createHash } from 'node:crypto';

import pinnedFile from './pinned-tables.json' with { type: 'json' };

export interface PinnedTable {
  readonly path: string;
  readonly sha256: string;
  readonly reason: string;
}

export const PINNED_TABLES: readonly PinnedTable[] = pinnedFile.tables;

const byPath = new Map(PINNED_TABLES.map((table) => [table.path, table.sha256]));

/** A label as a repository path: forward slashes, no leading "./". */
export function repositoryPath(label: string): string {
  return label.replaceAll('\\', '/').replace(/^(?:\.\/)+/, '');
}

/** True when `label` is a pinned table's repository path and `bytes` are its exact bytes. */
export function isPinnedTable(label: string, bytes: Uint8Array): boolean {
  const sha256 = byPath.get(repositoryPath(label));
  return sha256 !== undefined && createHash('sha256').update(bytes).digest('hex') === sha256;
}
