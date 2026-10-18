import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type CodeListProvider, inCodeSet } from '@tp/edi835';

/**
 * The code lists a parse checks against (PRD 10, step 6: "code sets valid against the loaded code
 * lists"): CARC and RARC from the rule release in force's carc and rarc records, each active
 * between its effective dates, and the structure's own sets from @tp/edi835. Global rule content has
 * no practice_id and the application role reads it; nothing here is the practice's.
 *
 * Where no release has been published (a development database: release 1 cannot be loaded where
 * this repository is built), every CARC and RARC is unknown: each loads with its flag and the receipt
 * lists it, and the report records that no release checked them.
 */

interface Window {
  readonly from: string;
  readonly to: string | null;
}

/** A provider over CARC and RARC windows keyed "list:code", and the structure's own sets. */
export function codeListsOf(release: number | null, windows: ReadonlyMap<string, readonly Window[]>): CodeListProvider {
  return {
    release,
    has(list, code, on) {
      if (list === 'carc' || list === 'rarc') {
        return (windows.get(`${list}:${code}`) ?? []).some((window) => window.from <= on && (window.to === null || on <= window.to));
      }
      return inCodeSet(list, code);
    },
  };
}

/**
 * The code lists of the rule release in force (the newest published one that no content rollback
 * withdrew: current_rule_release()), read inside the job's scope.
 */
export async function publishedCodeLists(scope: PracticeScope<ScopeClient>): Promise<CodeListProvider> {
  const latest = await scope.client.query<{ release_no: number | null }>('SELECT current_rule_release() AS release_no');
  const release = latest.rows[0]?.release_no ?? null;
  const windows = new Map<string, Window[]>();
  if (release !== null) {
    const { rows } = await scope.client.query<{ record_type: string; code: string; effective_from: string; effective_to: string | null }>(
      `SELECT record_type, key ->> 'code' AS code, effective_from::text AS effective_from, effective_to::text AS effective_to
         FROM rule_record WHERE release_no = $1 AND record_type IN ('carc', 'rarc') AND key ? 'code'`,
      [release],
    );
    for (const row of rows) {
      const key = `${row.record_type}:${row.code}`;
      windows.set(key, [...(windows.get(key) ?? []), { from: row.effective_from, to: row.effective_to }]);
    }
  }
  return codeListsOf(release, windows);
}
