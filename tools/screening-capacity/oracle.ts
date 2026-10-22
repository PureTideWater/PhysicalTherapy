import path from 'node:path';

import { databaseClient } from '@tp/db';
import { cents } from '@tp/money';
import type { PlaceOfServiceSetting } from '@tp/pricing';
import { type StoredRecordRow, indexStoredRelease } from '@tp/worker/pricing';
import { type PendingScreeningRow, type ScreeningRowOutcome, ScreeningPricer, pricesAsMedicare, releaseChangeDays } from '@tp/worker/screening-pricer';
import { type OwnerClient, legacyOutcomes, outcomesSha256, storedOutcomes } from '@tp/worker/screening-oracle';

import type { OracleKind } from './report';

/**
 * The capacity test's equality check at production shape (audit #53 part 1, step 9; docs/adr/0062): for each run
 * named, the SHA-256 of its stored rows' outcomes and of what an oracle gives for the same run, each a canonical line per
 * Medicare row. Two oracles:
 *
 * - frozen_3c1b289: the old read path and adapter (frozen at 3c1b289 in apps/worker/src/screening/test-support), for
 *   the five-digit uploads (S1-1, S2-1, S3-1). It takes a five-digit ZIP alone, so it cannot price a ZIP split across
 *   localities.
 * - whole_release (PR 6b, docs/adr/0064): for the upload from a split ZIP with its ZIP+4 (S1-2), the run's pinned
 *   release read whole (every record, no key), indexed as the job indexes what it reads, and priced by the current
 *   ScreeningPricer with no read view (the context allows it) at the prospect's stored ZIP and ZIP+4. Equality proves
 *   that the run's keyed read held every record its pricing looked up, the ZIP's ZIP9 record among them (a lookup
 *   outside the fetch would have failed the run). The engine's ZIP+4 arithmetic is proved by its unit and golden tests.
 *
 * It runs in a child process, unlimited, after the browsers close, so an oracle's whole-release copy is never held
 * during a measurement. It prints counts and hashes only.
 *
 *   tsx tools/screening-capacity/oracle.ts <owner database URL> <oracle>:<run id>...
 */

export interface OracleResult {
  readonly runId: string;
  readonly oracle: OracleKind;
  readonly rows: number;
  readonly storedSha256: string;
  readonly oracleSha256: string;
}

interface RunRow {
  readonly release_no: number;
  readonly release_manifest_sha256: string;
  readonly zip: string;
  readonly zip_plus_four: string | null;
  readonly settings: Record<string, PlaceOfServiceSetting>;
  readonly as_of: string;
}

interface ResultRow {
  readonly row_no: number;
  readonly procedure_code: string;
  readonly modifiers: string[];
  readonly units: number;
  readonly place_of_service: string;
  readonly payer_product: PendingScreeningRow['payerProduct'];
  readonly service_band: string;
  readonly claim_count: number;
  readonly observed_allowed_cents: string;
}

/** Every record of the run's pinned release, as the owner, while it is published as pinned and not withdrawn. */
const WHOLE_RELEASE_SQL = `
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM screening_run r
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
    JOIN rule_record rr ON rr.release_no = r.release_no
   WHERE r.id = $1
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
   ORDER BY rr.record_type, rr.effective_from, rr.id`;

/** What the current pricer gives each Medicare row of a run over its whole release, by row number. */
export async function wholeReleaseOutcomes(owner: OwnerClient, runId: string): Promise<Map<number, ScreeningRowOutcome>> {
  const run = (
    await owner.query(
      `SELECT r.release_no, r.release_manifest_sha256, p.zip, p.zip_plus_four, s.settings, (r.created_at AT TIME ZONE 'UTC')::date::text AS as_of
         FROM screening_run r
         JOIN screening_upload u ON u.id = r.upload_id
         JOIN screening_prospect p ON p.id = u.prospect_id
         JOIN place_of_service_split s ON s.id = r.place_of_service_split_id
        WHERE r.id = $1`,
      [runId],
    )
  ).rows[0] as RunRow | undefined;
  if (run === undefined) {
    throw new Error('no such screening run');
  }
  const records = (await owner.query(WHOLE_RELEASE_SQL, [runId])).rows as StoredRecordRow[];
  if (records.length === 0) {
    throw new Error('the run’s release is not there as pinned');
  }
  const release = indexStoredRelease({ releaseNo: run.release_no, manifestSha256: run.release_manifest_sha256 }, records);
  const pricer = new ScreeningPricer({ release, changeDays: releaseChangeDays(records), zip: run.zip, zipPlusFour: run.zip_plus_four, placeOfServiceSettings: run.settings, asOf: run.as_of });
  const rows = (
    await owner.query(
      `SELECT row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents::text AS observed_allowed_cents
         FROM screening_result WHERE run_id = $1 ORDER BY row_no`,
      [runId],
    )
  ).rows as ResultRow[];
  const outcomes = new Map<number, ScreeningRowOutcome>();
  for (const row of rows) {
    const pending: PendingScreeningRow = {
      rowNo: row.row_no,
      procedureCode: row.procedure_code,
      modifiers: row.modifiers,
      units: row.units,
      placeOfService: row.place_of_service,
      payerProduct: row.payer_product,
      serviceBand: row.service_band,
      claimCount: row.claim_count,
      observedAllowedCents: cents(BigInt(row.observed_allowed_cents)),
    };
    if (pricesAsMedicare(pending.payerProduct)) {
      outcomes.set(row.row_no, pricer.outcome(pending));
    }
  }
  return outcomes;
}

export async function compareRuns(ownerUrl: string, runs: readonly { readonly runId: string; readonly oracle: OracleKind }[]): Promise<OracleResult[]> {
  const client = databaseClient(ownerUrl);
  await client.connect();
  try {
    const results: OracleResult[] = [];
    for (const { runId, oracle } of runs) {
      const stored = await storedOutcomes(client, runId);
      const expected = oracle === 'whole_release' ? await wholeReleaseOutcomes(client, runId) : await legacyOutcomes(client, runId);
      results.push({ runId, oracle, rows: stored.size, storedSha256: outcomesSha256(stored), oracleSha256: outcomesSha256(expected) });
    }
    return results;
  } finally {
    await client.end();
  }
}

/** A command line's `<oracle>:<run id>`. */
export function parseRunArgument(argument: string): { readonly runId: string; readonly oracle: OracleKind } {
  const match = /^(frozen_3c1b289|whole_release):([0-9a-f-]{36})$/.exec(argument);
  if (match === null) {
    throw new RangeError('each run is named <oracle>:<run id>, the oracle frozen_3c1b289 or whole_release');
  }
  return { oracle: match[1] as OracleKind, runId: match[2] as string };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [url, ...runs] = process.argv.slice(2);
  if (url === undefined || runs.length === 0) {
    process.stderr.write('usage: tsx tools/screening-capacity/oracle.ts <owner database URL> <oracle>:<run id>...\n');
    process.exit(2);
  }
  process.stdout.write(`${JSON.stringify(await compareRuns(url, runs.map(parseRunArgument)))}\n`);
}
