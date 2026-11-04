import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

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
  /**
   * How long, once the load has committed, it waits for its records to be frozen (FREEZE_WAIT_MS unless given); 0 runs
   * the one pass and waits for nothing.
   */
  readonly freezeWaitMs?: number;
}

export interface LoadResult {
  readonly status: 'loaded' | 'already_loaded';
  readonly releaseNo: number;
  readonly manifestSha256: string;
  readonly records: number;
  /**
   * Every page of rule_record all-visible and all-frozen when the load returned. False only when a transaction older
   * than the load still held the database's visibility horizon back once the wait ran out; the release is loaded and
   * published all the same, and loading it again finishes the freeze.
   */
  readonly frozen: boolean;
}

/** Records per INSERT statement (nine parameters each, well under PostgreSQL's 65,535). */
const BATCH_SIZE = 500;

/** Advisory lock class for loads: two loaders of the same release run one after the other. */
const LOAD_LOCK_CLASS = 0x52554c45;

/**
 * How long a committed load waits for its records to be frozen: three minutes, the budget of the longest single
 * transaction the platform runs (CAS-42's real-size report, 180 s).
 */
export const FREEZE_WAIT_MS = 180_000;

/** The first pause between VACUUMs while the horizon is held back; each pause doubles, up to FREEZE_PAUSE_MAX_MS. */
const FREEZE_PAUSE_MS = 50;
const FREEZE_PAUSE_MAX_MS = 2_000;
/**
 * After a later pass, the pause is also at least this many times as long as that pass took, so a wait over a real-size
 * release spends at most a fifth of its time re-reading the pages not yet frozen.
 */
const FREEZE_PAUSE_PER_PASS = 4;

/** Whether the visibility map holds every page of rule_record all-frozen (so all-visible), as the last VACUUM or ANALYZE counted it. */
async function ruleRecordFrozen(client: SqlClient): Promise<boolean> {
  const { rows } = await client.query("SELECT relallfrozen >= relpages AS frozen FROM pg_class WHERE oid = 'rule_record'::regclass");
  return (rows[0] as { frozen: boolean }).frozen;
}

/**
 * Analyzes rule_record and freezes its records, which never change: the first screenings after a load then neither plan
 * without statistics nor set every page's hint bits (CI's capacity run on 9eb4474: S1-1, the first screening after the
 * load, hash-joined every record of the release and recorded no batch for five minutes), and no anti-wraparound vacuum
 * rewrites them later. Outside any transaction: VACUUM cannot run in one.
 *
 * The first pass takes the statistics and sets every record's hint bits whatever else runs. But PostgreSQL freezes a
 * record, and marks its page all-visible, only once the record's inserting transaction precedes the database's
 * visibility horizon, the oldest xmin or xid among this database's backends (vacuums aside). Any transaction of this
 * database that began before the load committed holds the horizon back, and so does any snapshot of this database
 * taken while a transaction older than the load still runs anywhere in the cluster, since a snapshot's xmin is the
 * oldest transaction running in any database; a transaction in another database alone holds nothing back. autovacuum's
 * ANALYZE of a catalog in a scratch database, beside a long transaction in another, so left every page of the
 * synthetic release unfrozen in test:db (relallvisible 0 of 7). So each pass is checked against the visibility map's
 * counts, which the pass itself has just written to pg_class, and repeated after a pause while they fall short, for up
 * to `waitMs`. A later pass only freezes (VACUUM (FREEZE), reading only the pages not yet all-frozen): the first pass's
 * statistics already count every committed record, whatever the horizon. Returns whether every page ended all-frozen.
 */
async function analyzeAndFreeze(client: SqlClient, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (let backoff = FREEZE_PAUSE_MS, pass = 1; ; backoff = Math.min(backoff * 2, FREEZE_PAUSE_MAX_MS), pass += 1) {
    const started = Date.now();
    await client.query(pass === 1 ? 'VACUUM (FREEZE, ANALYZE) rule_record' : 'VACUUM (FREEZE) rule_record');
    if (await ruleRecordFrozen(client)) {
      return true;
    }
    // The first pass also analyzes and writes every page's hint bits, so it says nothing of what a later pass costs.
    const pause = pass === 1 ? backoff : Math.max(backoff, FREEZE_PAUSE_PER_PASS * (Date.now() - started));
    if (Date.now() + pause > deadline) {
      return false;
    }
    await sleep(pause);
  }
}

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
 * one transaction inserts the release, its records, and marks it published, and then analyzes
 * rule_record and freezes the records (analyzeAndFreeze: VACUUM, which no transaction may hold,
 * waiting up to `freezeWaitMs` for the transactions older than the load). From then on the
 * database refuses any change to either table's rows for that release. Loading the same release
 * again writes nothing and finishes a freeze an earlier load left short; loading a different
 * release under a number already loaded is refused. Nothing is written when any check fails.
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
  const waitMs = options.freezeWaitMs ?? FREEZE_WAIT_MS;

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
        // A load whose wait ran out, or that stopped between its commit and its VACUUM, is finished here. Always by a
        // VACUUM: pg_class holds the counts of the last VACUUM or ANALYZE, which a stopped load never ran, and pages
        // already frozen are skipped.
        return { status: 'already_loaded', ...result, frozen: await analyzeAndFreeze(client, waitMs) };
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
  } finally {
    if (open) {
      await client.query('ROLLBACK');
    }
  }
  // Analyzed and frozen before anything reads it. Without statistics the planner reckons a release a sliver of
  // rule_record, and the first screenings after a load hash-joined every record of the release instead of probing
  // rule_record_identity; pages already frozen are skipped.
  return { status: 'loaded', ...result, frozen: await analyzeAndFreeze(client, waitMs) };
}

export interface WithdrawOptions {
  /** The release in force, to withdraw. */
  readonly release: number;
  /** What the content had wrong, in one printable line of 8 to 500 characters (never PHI). */
  readonly reason: string;
}

export interface WithdrawResult {
  readonly releaseNo: number;
  /** The newest published release below it, in force again. */
  readonly reinstatedReleaseNo: number;
}

const WITHDRAW_LOCK = 0;
const REASON = /^[ -~]{8,500}$/;

/**
 * A content rollback (PRD 18, Releases: "a content rollback by loading the previous release, with runs
 * pinned to the withdrawn release flagged rather than changed"; docs/adr/0037). Records, as the owner
 * role, that the release in force is withdrawn: the newest published release below it is in force
 * again, so runs created from now on pin it, and the runs pinned to the withdrawn release are flagged
 * by the withdrawal row. Nothing else changes: the withdrawn release, its records and every run and
 * priced line stay as they were. Refused, writing nothing, unless the release is the one in force and
 * an earlier published release is loaded (the caller loads it first); the database refuses the same.
 */
export async function withdrawRelease(client: SqlClient, options: WithdrawOptions): Promise<WithdrawResult> {
  if (!REASON.test(options.reason)) {
    throw new ReleaseLoadError('a withdrawal gives its reason in one printable line of 8 to 500 characters');
  }
  await client.query('BEGIN');
  let open = true;
  try {
    // One loader or rollback at a time.
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [LOAD_LOCK_CLASS, WITHDRAW_LOCK]);
    const current = ((await client.query('SELECT current_rule_release() AS release_no')).rows[0] as { release_no: number | null } | undefined)?.release_no ?? null;
    if (current !== options.release) {
      throw new ReleaseLoadError(
        current === null
          ? `release ${String(options.release)} is not in force: no rule release is published`
          : `release ${String(options.release)} is not in force (release ${String(current)} is); only the release in force is withdrawn`,
      );
    }
    const previous = (
      (
        await client.query(
          `SELECT max(r.release_no) AS release_no FROM rule_release r
            WHERE r.release_no < $1 AND r.published_at IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)`,
          [options.release],
        )
      ).rows[0] as { release_no: number | null } | undefined
    )?.release_no ?? null;
    if (previous === null) {
      throw new ReleaseLoadError(`no published release before ${String(options.release)} is loaded; load the previous release, then withdraw this one`);
    }
    await client.query('INSERT INTO rule_release_withdrawal (release_no, reinstated_release_no, reason) VALUES ($1, $2, $3)', [options.release, previous, options.reason]);
    await client.query('COMMIT');
    open = false;
    return { releaseNo: options.release, reinstatedReleaseNo: previous };
  } finally {
    if (open) {
      await client.query('ROLLBACK');
    }
  }
}
