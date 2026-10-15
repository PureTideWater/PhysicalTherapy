import { readFileSync } from 'node:fs';
import path from 'node:path';

import { readRelease } from './content';
import { FIRST_SYNTHETIC_RELEASE, RELEASE_NOTES_FILE, isSyntheticReleaseNumber } from './manifest';
import { type Located, findOverlaps, recordLabel, recordSha256 } from './records';
import type { RuleRecord } from './schema';

/**
 * Loads a release directory into the global tables, rule_release and rule_record (PRD section 9,
 * step 4). The caller connects as the owner role (packages/db): the application role cannot write
 * these tables. This package takes any client with a `query` method so it never depends on the
 * database package.
 */
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

export class ReleaseLoadError extends Error {
  override readonly name = 'ReleaseLoadError';
}

export interface LoadOptions {
  /**
   * The release number the caller asked for. The manifest must name it, or nothing is written: a
   * release row is permanent once committed, so the number is checked before the transaction opens.
   */
  readonly release: number;
  /**
   * Test only. Lets a SYNTHETIC fixture release (invented values, verification L1, numbered from
   * 900000) load into a scratch test database. Only the database tests built on
   * withScratchDatabase pass it; the release commands never do.
   */
  readonly allowSyntheticFixtureForTests?: boolean;
}

export interface LoadResult {
  readonly status: 'loaded' | 'already_loaded';
  readonly releaseNo: number;
  readonly manifestSha256: string;
  readonly records: number;
}

/** Records per INSERT statement (nine parameters each, well under PostgreSQL's 65,535). */
const BATCH_SIZE = 500;

/** Advisory lock class for loads: two loaders of the same release run one after the other. */
const LOAD_LOCK_CLASS = 0x52554c45;

/** The `source` column: where the record came from, the text it quotes, and its notes. */
export function sourceColumn(record: RuleRecord): Record<string, unknown> {
  return { ...record.source, quotes: record.quotes, notes: record.notes };
}

function insertStatement(count: number): string {
  const rows = Array.from({ length: count }, (_, row) => {
    const at = row * 9;
    const p = (offset: number) => `$${String(at + offset)}`;
    return `(${p(1)}, ${p(2)}, ${p(3)}::jsonb, ${p(4)}::jsonb, ${p(5)}::date, ${p(6)}::date, ${p(7)}::jsonb, ${p(8)}, ${p(9)})`;
  });
  return `INSERT INTO rule_record (release_no, record_type, key, value, effective_from, effective_to, source, verification, sha256) VALUES ${rows.join(', ')}`;
}

function insertValues(releaseNo: number, records: readonly RuleRecord[]): unknown[] {
  return records.flatMap((record) => [
    releaseNo,
    record.record_type,
    JSON.stringify(record.key),
    JSON.stringify(record.value),
    record.effective_from,
    record.effective_to,
    JSON.stringify(sourceColumn(record)),
    record.verification.level,
    recordSha256(record),
  ]);
}

function releaseNotes(dir: string): string {
  try {
    return readFileSync(path.join(dir, RELEASE_NOTES_FILE), 'utf8');
  } catch {
    return '';
  }
}

/** Why a release may not load under these options; empty when it may. */
export function loadRefusals(releaseNo: number, records: readonly Located<RuleRecord>[], options: LoadOptions): string[] {
  const problems: string[] = [];
  if (releaseNo !== options.release) {
    problems.push(`MANIFEST.json names release ${String(releaseNo)}, not ${String(options.release)}`);
  }
  const synthetic = records.filter(({ record }) => record.source.synthetic);
  const unverified = records.filter(({ record }) => record.verification.level === 'L1');
  if (options.allowSyntheticFixtureForTests === true) {
    if (!isSyntheticReleaseNumber(releaseNo)) {
      problems.push(`a SYNTHETIC fixture release is numbered from ${String(FIRST_SYNTHETIC_RELEASE)}; release ${String(releaseNo)} is a real release number`);
    }
    const real = records.filter(({ record }) => !record.source.synthetic);
    problems.push(...real.slice(0, 5).map(({ record, where }) => `${where}: ${recordLabel(record)} is not synthetic; a fixture release holds only SYNTHETIC records`));
    return problems;
  }
  if (isSyntheticReleaseNumber(releaseNo)) {
    problems.push(`release numbers from ${String(FIRST_SYNTHETIC_RELEASE)} are reserved for SYNTHETIC fixture releases, which load only into scratch test databases`);
  }
  problems.push(
    ...synthetic.slice(0, 5).map(({ record, where }) => `${where}: ${recordLabel(record)} is SYNTHETIC; invented values never load as rule content`),
    ...unverified.slice(0, 5).map(({ record, where }) => `${where}: ${recordLabel(record)} is at verification L1; a release loads only records verified to L2 or L3`),
  );
  if (synthetic.length > 5 || unverified.length > 5) {
    problems.push(`(${String(synthetic.length)} synthetic and ${String(unverified.length)} L1 record(s) in all)`);
  }
  return problems;
}

/**
 * Verifies the release (manifest, every record against the schema, no overlapping windows, the
 * release number asked for, and every record verified to L2 or higher and not synthetic), then in
 * one transaction inserts the release, its records, and marks it published. From then on the
 * database refuses any change to either table's rows for that release. Loading the same release
 * again is a no-op; loading a different release under a number already loaded is refused. Nothing
 * is written when any check fails.
 */
export async function loadRelease(client: SqlClient, dir: string, options: LoadOptions): Promise<LoadResult> {
  const release = readRelease(dir);
  const problems = [
    ...release.problems,
    ...findOverlaps(release.records).map(({ first, second }) => `${second.where}: ${recordLabel(second.record)} overlaps ${first.where}`),
  ];
  if (release.problems.length === 0) {
    problems.push(...loadRefusals(release.manifest.release, release.records, options));
  }
  if (problems.length > 0) {
    throw new ReleaseLoadError([`the release in ${dir} is not loadable:`, ...problems.slice(0, 20).map((line) => `  ${line}`)].join('\n'));
  }
  const releaseNo = release.manifest.release;
  const records = release.records.map((located) => located.record);
  const result = { releaseNo, manifestSha256: release.manifestSha256, records: records.length };

  await client.query('BEGIN');
  let open = true;
  try {
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LOAD_LOCK_CLASS, releaseNo]);
    const existing = await client.query('SELECT manifest_sha256 FROM rule_release WHERE release_no = $1', [releaseNo]);
    const loaded = existing.rows[0] as { manifest_sha256: string } | undefined;
    if (loaded !== undefined) {
      await client.query('ROLLBACK');
      open = false;
      if (loaded.manifest_sha256 === release.manifestSha256) {
        return { status: 'already_loaded', ...result };
      }
      throw new ReleaseLoadError(
        `release ${String(releaseNo)} is already loaded from a different manifest; a published release never changes, so the new content needs a new number`,
      );
    }
    await client.query('INSERT INTO rule_release (release_no, manifest_sha256, notes) VALUES ($1, $2, $3)', [releaseNo, release.manifestSha256, releaseNotes(dir)]);
    for (let start = 0; start < records.length; start += BATCH_SIZE) {
      const batch = records.slice(start, start + BATCH_SIZE);
      await client.query(insertStatement(batch.length), insertValues(releaseNo, batch));
    }
    await client.query('UPDATE rule_release SET published_at = now(), updated_at = now() WHERE release_no = $1', [releaseNo]);
    await client.query('COMMIT');
    open = false;
    return { status: 'loaded', ...result };
  } finally {
    if (open) {
      await client.query('ROLLBACK');
    }
  }
}
