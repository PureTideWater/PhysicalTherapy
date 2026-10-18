import type { ScopeClient } from '@tp/db/runtime';

/**
 * Published rule releases as the release notes show them (PRD 9, The release pipeline step 5:
 * "Customers see a release note: what changed, which of their runs would change, and a button to
 * re-run"; PRD 7, Internal console, Rule releases; PRD 18, Releases; docs/adr/0037). Global content:
 * no practice_id, read-only to the application role, never PHI. A release's changes are worked out
 * against the newest published release below it, record by record (a record is its type, key and start
 * date; it changed when its value or end date differs), as `pnpm release:dry-run` counts them.
 */

export interface ReleaseWithdrawalView {
  readonly reinstatedReleaseNo: number;
  readonly withdrawnAt: string;
  readonly reason: string;
}

export interface PublishedRelease {
  readonly releaseNo: number;
  readonly publishedAt: string;
  readonly manifestSha256: string;
  readonly records: number;
  /** The release a run created now pins. */
  readonly inForce: boolean;
  readonly withdrawal: ReleaseWithdrawalView | null;
}

interface ReleaseRow {
  readonly release_no: number;
  readonly published_at: Date;
  readonly manifest_sha256: string;
  readonly records: number;
  readonly in_force: boolean;
  readonly reinstated_release_no: number | null;
  readonly withdrawn_at: Date | null;
  readonly reason: string | null;
}

const RELEASE_COLUMNS = `r.release_no, r.published_at, r.manifest_sha256,
         (SELECT count(*)::int FROM rule_record x WHERE x.release_no = r.release_no) AS records,
         r.release_no = current_rule_release() AS in_force,
         w.reinstated_release_no, w.withdrawn_at, w.reason`;
const RELEASE_FROM = 'rule_release r LEFT JOIN rule_release_withdrawal w ON w.release_no = r.release_no WHERE r.published_at IS NOT NULL';

function releaseOf(row: ReleaseRow): PublishedRelease {
  return {
    releaseNo: row.release_no,
    publishedAt: row.published_at.toISOString(),
    manifestSha256: row.manifest_sha256,
    records: row.records,
    inForce: row.in_force,
    withdrawal:
      row.reinstated_release_no === null || row.withdrawn_at === null ? null : { reinstatedReleaseNo: row.reinstated_release_no, withdrawnAt: row.withdrawn_at.toISOString(), reason: row.reason ?? '' },
  };
}

/** Every published release, newest number first. */
export async function publishedReleases(client: ScopeClient): Promise<PublishedRelease[]> {
  const { rows } = await client.query<ReleaseRow>(`SELECT ${RELEASE_COLUMNS} FROM ${RELEASE_FROM} ORDER BY r.release_no DESC`);
  return rows.map(releaseOf);
}

export interface TypeChange {
  readonly recordType: string;
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
}

/** One field of a changed record, before and after (decimal or code text, as the release wrote it). */
export interface FieldChange {
  readonly field: string;
  readonly before: string | null;
  readonly after: string | null;
}

export interface RecordChange {
  readonly recordType: string;
  readonly key: Readonly<Record<string, string>>;
  readonly effectiveFrom: string;
  readonly kind: 'added' | 'removed' | 'changed';
  /** For a changed record: the fields that differ, the end date included. */
  readonly fields: readonly FieldChange[];
}

export interface ReleaseNote extends PublishedRelease {
  /** RELEASE.md as the release carried it. */
  readonly notes: string;
  /** The release its changes are counted against; null for the first. */
  readonly previous: number | null;
  readonly changes: readonly TypeChange[];
  /** The first RECORD_CHANGES_SHOWN records that differ, by type and key. */
  readonly recordChanges: readonly RecordChange[];
  readonly recordChangesTotal: number;
}

export const RECORD_CHANGES_SHOWN = 50;

const DIFF = `WITH a AS (SELECT record_type, key, effective_from, effective_to, value FROM rule_record WHERE release_no = $1),
       b AS (SELECT record_type, key, effective_from, effective_to, value FROM rule_record WHERE release_no = $2),
       d AS (
         SELECT coalesce(a.record_type, b.record_type) AS record_type, coalesce(a.key, b.key) AS key, coalesce(a.effective_from, b.effective_from) AS effective_from,
                CASE WHEN a.record_type IS NULL THEN 'added' WHEN b.record_type IS NULL THEN 'removed' ELSE 'changed' END AS kind,
                a.value AS before_value, b.value AS after_value, a.effective_to::text AS before_to, b.effective_to::text AS after_to
           FROM a FULL JOIN b ON b.record_type = a.record_type AND b.key = a.key AND b.effective_from = a.effective_from
          WHERE a.record_type IS NULL OR b.record_type IS NULL OR a.value <> b.value OR a.effective_to IS DISTINCT FROM b.effective_to
       )`;

function text(value: unknown): string | null {
  return value === undefined || value === null ? null : typeof value === 'string' ? value : JSON.stringify(value);
}

/** The fields of two values of one record that differ, in field order, and the end date. */
export function fieldChanges(before: Readonly<Record<string, unknown>> | null, after: Readonly<Record<string, unknown>> | null, beforeTo: string | null, afterTo: string | null): FieldChange[] {
  const names = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
  const changes = names
    .map((field) => ({ field, before: text(before?.[field]), after: text(after?.[field]) }))
    .filter((change) => change.before !== change.after);
  return beforeTo === afterTo ? changes : [...changes, { field: 'effective_to', before: beforeTo, after: afterTo }];
}

/** A published release's note: its RELEASE.md and what it changes against the release before it. */
export async function releaseNote(client: ScopeClient, releaseNo: number): Promise<ReleaseNote | undefined> {
  const { rows } = await client.query<ReleaseRow & { notes: string; previous: number | null }>(
    `SELECT ${RELEASE_COLUMNS}, r.notes,
            (SELECT max(p.release_no) FROM rule_release p WHERE p.release_no < r.release_no AND p.published_at IS NOT NULL) AS previous
       FROM ${RELEASE_FROM} AND r.release_no = $1`,
    [releaseNo],
  );
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  // The first release's records are all new: compared with a release that holds none.
  const base = row.previous ?? 0;
  const { rows: counts } = await client.query<{ record_type: string; added: number; removed: number; changed: number }>(
    `${DIFF} SELECT record_type, count(*) FILTER (WHERE kind = 'added')::int AS added, count(*) FILTER (WHERE kind = 'removed')::int AS removed,
                    count(*) FILTER (WHERE kind = 'changed')::int AS changed
               FROM d GROUP BY record_type ORDER BY record_type`,
    [base, releaseNo],
  );
  const { rows: listed } = await client.query<{
    record_type: string;
    key: Record<string, string>;
    effective_from: string;
    kind: RecordChange['kind'];
    before_value: Record<string, unknown> | null;
    after_value: Record<string, unknown> | null;
    before_to: string | null;
    after_to: string | null;
  }>(`${DIFF} SELECT record_type, key, effective_from::text AS effective_from, kind, before_value, after_value, before_to, after_to FROM d ORDER BY record_type, key::text, effective_from LIMIT ${String(RECORD_CHANGES_SHOWN)}`, [
    base,
    releaseNo,
  ]);
  const changes = counts.map((count) => ({ recordType: count.record_type, added: count.added, removed: count.removed, changed: count.changed }));
  return {
    ...releaseOf(row),
    notes: row.notes,
    previous: row.previous,
    changes,
    recordChanges: listed.map((item) => ({
      recordType: item.record_type,
      key: item.key,
      effectiveFrom: item.effective_from,
      kind: item.kind,
      fields: item.kind === 'changed' ? fieldChanges(item.before_value, item.after_value, item.before_to, item.after_to) : [],
    })),
    recordChangesTotal: changes.reduce((sum, change) => sum + change.added + change.removed + change.changed, 0),
  };
}
