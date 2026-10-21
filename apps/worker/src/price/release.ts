import type { ScopeClient } from '@tp/db/runtime';
import { type IndexedRelease, type RecordRef, indexRelease } from '@tp/pricing';
import type { RuleRecord } from '@tp/rules';

/**
 * The rule release a pricing run pins (PRD 9, The release pipeline step 4: "runs created after that pin
 * it"; PRD 5, J7: "a run with a rule-release mismatch is refused"). Global content: no practice_id,
 * read-only to the application role, immutable once published.
 */

/** The run asked for a release that is not the one in force (or none is published). */
export class RuleReleaseMismatchError extends Error {
  override readonly name = 'RuleReleaseMismatchError';

  constructor(
    readonly requested: number,
    /** The newest published release; null when none is. */
    readonly current: number | null,
  ) {
    super(
      current === null
        ? `rule-release mismatch: release ${String(requested)} was asked for and no rule release is published`
        : `rule-release mismatch: release ${String(requested)} was asked for and release ${String(current)} is the one loaded`,
    );
  }
}

/**
 * The rule release in force: the newest published release that no content rollback withdrew
 * (current_rule_release(), the same function the database's own check reads), or null when none is
 * published (a development database).
 */
export async function currentReleaseNo(client: ScopeClient): Promise<number | null> {
  const { rows } = await client.query<{ release_no: number | null }>('SELECT current_rule_release() AS release_no');
  return rows[0]?.release_no ?? null;
}

/** A content rollback (PRD 18, Releases): the release withdrawn, the one in force again, why and when. */
export interface ReleaseWithdrawal {
  readonly releaseNo: number;
  readonly reinstatedReleaseNo: number;
  readonly reason: string;
  readonly withdrawnAt: Date;
}

/** Every withdrawal, newest first: runs pinned to a withdrawn release are flagged by it, never changed. */
export async function releaseWithdrawals(client: ScopeClient): Promise<ReleaseWithdrawal[]> {
  const { rows } = await client.query<{ release_no: number; reinstated_release_no: number; reason: string; withdrawn_at: Date }>(
    'SELECT release_no, reinstated_release_no, reason, withdrawn_at FROM rule_release_withdrawal ORDER BY release_no DESC',
  );
  return rows.map((row) => ({ releaseNo: row.release_no, reinstatedReleaseNo: row.reinstated_release_no, reason: row.reason, withdrawnAt: row.withdrawn_at }));
}

/** A published release's number and manifest hash. */
export interface ReleaseHeader {
  readonly releaseNo: number;
  readonly manifestSha256: string;
}

export async function releaseHeader(client: ScopeClient, releaseNo: number): Promise<ReleaseHeader | null> {
  const { rows } = await client.query<{ release_no: number; manifest_sha256: string }>(
    'SELECT release_no, manifest_sha256 FROM rule_release WHERE release_no = $1 AND published_at IS NOT NULL',
    [releaseNo],
  );
  const row = rows[0];
  return row === undefined ? null : { releaseNo: row.release_no, manifestSha256: row.manifest_sha256 };
}

/** A rule record as rule_record stores it: what the engine reads, its window as dates, and the SHA-256 the loader stored. */
export interface StoredRecordRow {
  readonly record_type: RuleRecord['record_type'];
  readonly key: Record<string, string>;
  readonly value: Record<string, unknown>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly sha256: string;
}

/**
 * A release as the engine reads it, from its header and its stored records (pure). The table keeps each record's
 * type, key, value and window (what the engine reads) and the SHA-256 the loader computed from the whole record
 * file entry; the trace names every record by that stored hash, as ADR 0029 says it does (`rule_record.sha256`),
 * not by a hash of the columns read back. The screening adapter indexes the records operator_screening_release()
 * returns through it too.
 */
export function indexStoredRelease(header: ReleaseHeader, rows: readonly StoredRecordRow[]): IndexedRelease {
  const stored = new Map<RuleRecord, string>();
  const records = rows.map((row) => {
    // The fields the engine reads; the source, verification, quotes and notes stay in the release files.
    const record = { record_type: row.record_type, key: row.key, value: row.value, effective_from: row.effective_from, effective_to: row.effective_to } as unknown as RuleRecord;
    stored.set(record, row.sha256);
    return record;
  });
  const indexed = indexRelease({ releaseNo: header.releaseNo, manifestSha256: header.manifestSha256, records });
  return {
    releaseNo: indexed.releaseNo,
    manifestSha256: indexed.manifestSha256,
    inForce: (type, key, date) => indexed.inForce(type, key, date),
    latestInYear: (type, key, year) => indexed.latestInYear(type, key, year),
    ref(record: RuleRecord): RecordRef {
      const sha256 = stored.get(record);
      if (sha256 === undefined) {
        return indexed.ref(record);
      }
      return { record_type: record.record_type, key: { ...(record.key as Record<string, string>) }, effective_from: record.effective_from, effective_to: record.effective_to, sha256 };
    },
  };
}

/** A published release as the engine reads it, from rule_release and rule_record (indexStoredRelease). */
export async function loadRuleRelease(client: ScopeClient, releaseNo: number): Promise<IndexedRelease> {
  const header = await releaseHeader(client, releaseNo);
  if (header === null) {
    throw new RuleReleaseMismatchError(releaseNo, await currentReleaseNo(client));
  }
  const { rows } = await client.query<StoredRecordRow>(
    `SELECT record_type, key, value, effective_from::text AS effective_from, effective_to::text AS effective_to, sha256
       FROM rule_record WHERE release_no = $1 ORDER BY record_type, effective_from, id`,
    [releaseNo],
  );
  return indexStoredRelease(header, rows);
}
