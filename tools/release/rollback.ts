import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type SqlClient, type WithdrawResult, loadRelease, withdrawRelease } from '@tp/rules/loader';

/**
 * `pnpm release:rollback <n> --reason <text>` (PRD 18, Releases: "a content rollback by loading the
 * previous release, with runs pinned to the withdrawn release flagged rather than changed"; docs/adr/
 * 0037): the published release before n (the highest number below n in content/releases) is loaded if
 * this database does not hold it yet, then release n, the one in force, is withdrawn. Runs created from
 * then on pin the previous release; runs pinned to n keep every line and are flagged, and the screens
 * offer to price them again. The caller connects as the owner role. Nothing under content/ is written.
 */

/** The highest published release number below `release` in content/releases, or null. */
export function previousPublishedRelease(root: string, release: number): number | null {
  let names: string[];
  try {
    names = readdirSync(path.join(root, 'content/releases'));
  } catch {
    return null;
  }
  const earlier = names
    .filter((name) => /^[1-9]\d*$/.test(name))
    .map((name) => Number.parseInt(name, 10))
    .filter((number) => number < release);
  return earlier.length === 0 ? null : Math.max(...earlier);
}

export interface RollbackRequest {
  readonly root: string;
  readonly release: number;
  readonly reason: string;
}

export interface RollbackResult extends WithdrawResult {
  /** The previous release, when this rollback loaded it. */
  readonly loaded: number | null;
}

export async function rollbackRelease(client: SqlClient, request: RollbackRequest): Promise<RollbackResult> {
  const previous = previousPublishedRelease(request.root, request.release);
  let loaded: number | null = null;
  if (previous !== null) {
    const dir = path.join(request.root, 'content/releases', String(previous));
    if (existsSync(dir)) {
      const result = await loadRelease(client, dir, { release: previous });
      loaded = result.status === 'loaded' ? previous : null;
    }
  }
  const withdrawn = await withdrawRelease(client, { release: request.release, reason: request.reason });
  return { ...withdrawn, loaded };
}
