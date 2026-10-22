import { createHash } from 'node:crypto';

import { cents } from '@tp/money';
import { type IndexedRelease, type PlaceOfServiceSetting, type RecordRef, indexRelease } from '@tp/pricing';
import type { RuleRecord } from '@tp/rules';

import type { PendingScreeningRow, ScreeningRowOutcome } from '../adapter';
import type { ScreeningPayerProduct } from '../format';
import { ScreeningPricer, pricesAsMedicare, releaseChangeDays } from './legacy-adapter';

/**
 * THE ORACLE's read path (audit #53 part 2; docs/adr/0062, "The release read"; test matrix SCR-09): how the screening
 * job read and priced a run at commit 3c1b289, frozen, so that the stored rows of a run priced by the new path (the
 * shared types once per release, the keyed records per run, the compact memo) can be compared with what the old path
 * gives for the same run:
 *
 * - the release: that commit's operator_screening_release() SQL, run as the owner (every record of the pinned release,
 *   the locality map limited to the run's ZIP), without its `status = 'pricing'` condition, since the oracle reads a
 *   run that is complete;
 * - indexed by a copy of that commit's indexStoredRelease (apps/worker/src/price/release.ts), its change days from
 *   every record (releaseChangeDays over the whole release);
 * - priced by that commit's ScreeningPricer (legacy-adapter.ts) over the run's rows in row order, the Medicare rows only,
 *   with the run's ZIP, approved split and creation date, as that commit's job did.
 *
 * Imported by tests and by the capacity harness's oracle only. Read as the owner of a scratch database; synthetic
 * data only.
 *
 * PR 6b: the split table's name in legacyOutcomes() (place_of_service_split, renamed by migration 20261105090000) is the
 * only change since 3c1b289; the read path and the adapter are as they were. It proves five-digit runs only: the frozen
 * pricer takes a five-digit ZIP, so a run of a ZIP split across localities is proved against a whole-release oracle
 * (tools/screening-capacity/oracle.ts, wholeReleaseOutcomes; docs/adr/0064).
 */

export interface OwnerClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

interface StoredRecordRow {
  readonly record_type: RuleRecord['record_type'];
  readonly key: Record<string, string>;
  readonly value: Record<string, unknown>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly sha256: string;
}

/** That commit's operator_screening_release(run), as the owner, without the condition that the run is being priced. */
const LEGACY_RELEASE_SQL = `
  SELECT rr.record_type, rr.key, rr.value, rr.effective_from::text, rr.effective_to::text, rr.sha256
    FROM screening_run r
    JOIN screening_upload u ON u.id = r.upload_id
    JOIN screening_prospect p ON p.id = u.prospect_id
    JOIN rule_release rl ON rl.release_no = r.release_no AND rl.manifest_sha256 = r.release_manifest_sha256 AND rl.published_at IS NOT NULL
    JOIN rule_record rr ON rr.release_no = r.release_no
   WHERE r.id = $1
     AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no)
     AND (rr.record_type <> 'locality_map' OR rr.key = jsonb_build_object('zip', p.zip))
   ORDER BY rr.record_type, rr.effective_from, rr.id`;

/** A copy of indexStoredRelease at that commit (apps/worker/src/price/release.ts). */
function legacyIndexStoredRelease(header: { readonly releaseNo: number; readonly manifestSha256: string }, rows: readonly StoredRecordRow[]): IndexedRelease {
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

interface RunRow {
  readonly release_no: number;
  readonly release_manifest_sha256: string;
  readonly zip: string;
  readonly settings: Record<string, PlaceOfServiceSetting>;
  readonly as_of: string;
}

interface ResultRow {
  readonly row_no: number;
  readonly procedure_code: string;
  readonly modifiers: string[];
  readonly units: number;
  readonly place_of_service: string;
  readonly payer_product: ScreeningPayerProduct;
  readonly service_band: string;
  readonly claim_count: number;
  readonly observed_allowed_cents: string;
}

/** What that commit's job gives for each Medicare row of a run, by row number. */
export async function legacyOutcomes(owner: OwnerClient, runId: string): Promise<Map<number, ScreeningRowOutcome>> {
  const run = (
    await owner.query(
      `SELECT r.release_no, r.release_manifest_sha256, p.zip, s.settings, (r.created_at AT TIME ZONE 'UTC')::date::text AS as_of
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
  const records = (await owner.query(LEGACY_RELEASE_SQL, [runId])).rows as StoredRecordRow[];
  if (records.length === 0) {
    throw new Error('the run’s release is not there as pinned');
  }
  const release = legacyIndexStoredRelease({ releaseNo: run.release_no, manifestSha256: run.release_manifest_sha256 }, records);
  const pricer = new ScreeningPricer({ release, changeDays: releaseChangeDays(records), zip: run.zip, placeOfServiceSettings: run.settings, asOf: run.as_of });
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

interface StoredRow {
  readonly row_no: number;
  readonly disposition: string;
  readonly expected_line_cents: string | null;
  readonly expected_line_unrounded: string | null;
  readonly expected_cents: string | null;
  readonly difference_cents: string | null;
  readonly in_reduction_pool: boolean | null;
  readonly reduced_line_cents: string | null;
  readonly reduced_line_unrounded: string | null;
  readonly reduced_cents: string | null;
  readonly reduced_difference_cents: string | null;
  readonly reduced_trace_sha256: string | null;
  readonly unpriced_reason: string | null;
  readonly unpriced_detail: string | null;
  readonly trace_sha256: string | null;
}

const big = (value: string | null): bigint => BigInt(value ?? 'x');
const textOf = (value: string | null): string => {
  if (value === null) {
    throw new Error('a stored figure is missing');
  }
  return value;
};

/** A stored row's outcome, in the adapter's shape (numeric text as the database prints it, which keeps the unrounded value's digits). */
function storedOutcome(row: StoredRow): ScreeningRowOutcome {
  const trace = textOf(row.trace_sha256);
  if (row.disposition === 'priced') {
    return {
      disposition: 'priced',
      expectedLineCents: cents(big(row.expected_line_cents)),
      expectedLineUnrounded: textOf(row.expected_line_unrounded),
      expectedCents: cents(big(row.expected_cents)),
      differenceCents: cents(big(row.difference_cents)),
      inReductionPool: row.in_reduction_pool === true,
      traceSha256: trace,
      reduced:
        row.reduced_line_cents === null
          ? null
          : {
              lineCents: cents(big(row.reduced_line_cents)),
              lineUnrounded: textOf(row.reduced_line_unrounded),
              cents: cents(big(row.reduced_cents)),
              differenceCents: cents(big(row.reduced_difference_cents)),
              traceSha256: textOf(row.reduced_trace_sha256),
            },
    };
  }
  if (row.disposition === 'unpriced') {
    return { disposition: 'unpriced', reason: textOf(row.unpriced_reason) as never, detail: row.unpriced_detail, traceSha256: trace };
  }
  if (row.disposition === 'rates_change_in_band') {
    return { disposition: 'rates_change_in_band', traceSha256: trace };
  }
  throw new Error(`a Medicare row stored as ${row.disposition}`);
}

/** The stored outcome of each Medicare row of a run, by row number. */
export async function storedOutcomes(owner: OwnerClient, runId: string): Promise<Map<number, ScreeningRowOutcome>> {
  const rows = (
    await owner.query(
      `SELECT row_no, disposition, expected_line_cents::text AS expected_line_cents, expected_line_unrounded::text AS expected_line_unrounded,
              expected_cents::text AS expected_cents, difference_cents::text AS difference_cents, in_reduction_pool,
              reduced_line_cents::text AS reduced_line_cents, reduced_line_unrounded::text AS reduced_line_unrounded, reduced_cents::text AS reduced_cents,
              reduced_difference_cents::text AS reduced_difference_cents, reduced_trace_sha256, unpriced_reason, unpriced_detail, trace_sha256
         FROM screening_result WHERE run_id = $1 AND payer_product IN ('medicare_ffs', 'ma_noncontracted') ORDER BY row_no`,
      [runId],
    )
  ).rows as StoredRow[];
  return new Map(rows.map((row) => [row.row_no, storedOutcome(row)]));
}

/** One row's outcome as one canonical line: every field in a fixed order, amounts as decimal text. */
export function canonicalOutcome(rowNo: number, outcome: ScreeningRowOutcome): string {
  const reduced = outcome.disposition === 'priced' ? outcome.reduced : null;
  return JSON.stringify([
    rowNo,
    outcome.disposition,
    outcome.disposition === 'priced' ? [outcome.expectedLineCents.toString(), outcome.expectedLineUnrounded, outcome.expectedCents.toString(), outcome.differenceCents.toString(), outcome.inReductionPool] : null,
    reduced === null ? null : [reduced.lineCents.toString(), reduced.lineUnrounded, reduced.cents.toString(), reduced.differenceCents.toString(), reduced.traceSha256],
    outcome.disposition === 'unpriced' ? [outcome.reason, outcome.detail] : null,
    outcome.traceSha256,
  ]);
}

/** The SHA-256 of a run's outcomes, each a canonical line, in row order. */
export function outcomesSha256(outcomes: ReadonlyMap<number, ScreeningRowOutcome>): string {
  const hash = createHash('sha256');
  for (const rowNo of [...outcomes.keys()].sort((a, b) => a - b)) {
    hash.update(`${canonicalOutcome(rowNo, outcomes.get(rowNo) as ScreeningRowOutcome)}\n`, 'utf8');
  }
  return hash.digest('hex');
}
