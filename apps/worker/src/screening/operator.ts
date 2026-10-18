import { OPERATOR_ROLE } from '@tp/db';
import { type Cents, cents } from '@tp/money';
import type { PlaceOfServiceSetting } from '@tp/pricing';

import type { PendingScreeningRow, ScreeningRowOutcome } from './adapter';
import type { ScreeningPayerProduct } from './format';
import type { StoredRecordRow } from '../price/release';

/**
 * The screening jobs' database calls (docs/adr/0062): every one a SECURITY DEFINER function granted to tp_operator
 * alone (migration 20261104090000), each in a transaction as the operator role (which owns nothing, reads no table of
 * the screening's and cannot bypass row-level security) with no practice in scope. Nothing here reads a prospect's
 * name; the contact address comes back only from complete and fail, for the one email each sends.
 */

export interface OperatorClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface OperatorConnection extends OperatorClient {
  release(destroy?: boolean): void;
}

/** Operator connections to the platform database (a login that can SET ROLE to tp_operator). */
export interface OperatorPool {
  connect(): Promise<OperatorConnection>;
}

/** One transaction as the operator role, committed when `run` returns and rolled back when it throws. */
export async function asOperator<T>(pool: OperatorPool, run: (client: OperatorClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query('BEGIN');
    try {
      await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
      await client.query("SELECT set_config('app.practice_ids', '{}', true)");
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    broken = true;
    throw error;
  } finally {
    client.release(broken);
  }
}

export interface DueRun {
  readonly runId: string;
  readonly status: 'queued' | 'pricing';
  readonly attempts: number;
}

export async function dueRuns(client: OperatorClient, minQueuedAgeSeconds: number, atMost: number): Promise<DueRun[]> {
  const { rows } = await client.query('SELECT run_id, status, attempts FROM operator_screening_due($1, $2)', [minQueuedAgeSeconds, atMost]);
  return (rows as { run_id: string; status: 'queued' | 'pricing'; attempts: number }[]).map((row) => ({ runId: row.run_id, status: row.status, attempts: row.attempts }));
}

export interface ClaimedRun {
  readonly releaseNo: number;
  readonly manifestSha256: string;
  readonly zip: string;
  readonly placeOfServiceSettings: Readonly<Record<string, PlaceOfServiceSetting>>;
  /** The run's creation date in UTC, YYYY-MM-DD. */
  readonly asOf: string;
  readonly rowCount: number;
  readonly attempt: number;
}

/** Claims a run for pricing; null when it is not there to claim (already being priced, done, or out of attempts). */
export async function claimRun(client: OperatorClient, runId: string): Promise<ClaimedRun | null> {
  const { rows } = await client.query(
    'SELECT release_no, release_manifest_sha256, zip, settings, as_of::text AS as_of, row_count, attempt FROM operator_screening_claim($1)',
    [runId],
  );
  const row = rows[0] as
    | { release_no: number; release_manifest_sha256: string; zip: string; settings: Record<string, PlaceOfServiceSetting>; as_of: string; row_count: number; attempt: number }
    | undefined;
  return row === undefined
    ? null
    : {
        releaseNo: row.release_no,
        manifestSha256: row.release_manifest_sha256,
        zip: row.zip,
        placeOfServiceSettings: row.settings,
        asOf: row.as_of,
        rowCount: row.row_count,
        attempt: row.attempt,
      };
}

/** The pinned release's records as the engine reads them (the locality map limited to the run's ZIP). */
export async function releaseRecords(client: OperatorClient, runId: string): Promise<StoredRecordRow[]> {
  const { rows } = await client.query('SELECT record_type, key, value, effective_from, effective_to, sha256 FROM operator_screening_release($1)', [runId]);
  return rows as StoredRecordRow[];
}

/** The run's rows still to price after a row number, at most 5,000. */
export async function pendingRows(client: OperatorClient, runId: string, afterRow: number, atMost: number): Promise<PendingScreeningRow[]> {
  const { rows } = await client.query(
    `SELECT row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents::text AS observed_allowed_cents
       FROM operator_screening_rows($1, $2, $3)`,
    [runId, afterRow, atMost],
  );
  return (
    rows as {
      row_no: number;
      procedure_code: string;
      modifiers: string[];
      units: number;
      place_of_service: string;
      payer_product: ScreeningPayerProduct;
      service_band: string;
      claim_count: number;
      observed_allowed_cents: string;
    }[]
  ).map((row) => ({
    rowNo: row.row_no,
    procedureCode: row.procedure_code,
    modifiers: row.modifiers,
    units: row.units,
    placeOfService: row.place_of_service,
    payerProduct: row.payer_product,
    serviceBand: row.service_band,
    claimCount: row.claim_count,
    observedAllowedCents: cents(BigInt(row.observed_allowed_cents)),
  }));
}

const text = (amount: Cents | undefined): string | null => (amount === undefined ? null : amount.toString());

/** Records what pricing found for up to 5,000 rows, in one statement. Returns how many it recorded. */
export async function recordRows(client: OperatorClient, runId: string, outcomes: readonly { readonly rowNo: number; readonly outcome: ScreeningRowOutcome }[]): Promise<number> {
  const priced = (item: (typeof outcomes)[number]) => (item.outcome.disposition === 'priced' ? item.outcome : undefined);
  const unpriced = (item: (typeof outcomes)[number]) => (item.outcome.disposition === 'unpriced' ? item.outcome : undefined);
  const { rows } = await client.query('SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) AS recorded', [
    runId,
    outcomes.map((item) => item.rowNo),
    outcomes.map((item) => item.outcome.disposition),
    outcomes.map((item) => text(priced(item)?.expectedLineCents)),
    outcomes.map((item) => priced(item)?.expectedLineUnrounded ?? null),
    outcomes.map((item) => text(priced(item)?.expectedCents)),
    outcomes.map((item) => text(priced(item)?.differenceCents)),
    outcomes.map((item) => unpriced(item)?.reason ?? null),
    outcomes.map((item) => unpriced(item)?.detail ?? null),
    outcomes.map((item) => item.outcome.traceSha256),
  ]);
  return (rows[0] as { recorded: number } | undefined)?.recorded ?? 0;
}

/** Completes a run with its token's hash; where its email goes, or null when it was complete already. */
export async function completeRun(client: OperatorClient, runId: string, tokenSha256: string, engine: string, requestId: string): Promise<{ readonly contactEmail: string; readonly rowCount: number } | null> {
  const { rows } = await client.query('SELECT contact_email, row_count FROM operator_screening_complete($1, $2, $3, $4)', [runId, tokenSha256, engine, requestId]);
  const row = rows[0] as { contact_email: string; row_count: number } | undefined;
  return row === undefined ? null : { contactEmail: row.contact_email, rowCount: row.row_count };
}

/** Fails a queued or pricing run with a code; where its notice goes, or null when it had ended already. */
export async function failRun(client: OperatorClient, runId: string, failureCode: string, requestId: string): Promise<{ readonly contactEmail: string } | null> {
  const { rows } = await client.query('SELECT contact_email FROM operator_screening_fail($1, $2, $3)', [runId, failureCode, requestId]);
  const row = rows[0] as { contact_email: string } | undefined;
  return row === undefined ? null : { contactEmail: row.contact_email };
}

/** Deletes up to `atMost` expired screenings. */
export async function expireBatch(client: OperatorClient, atMost: number, requestId: string): Promise<{ readonly prospects: number; readonly runs: number }> {
  const { rows } = await client.query('SELECT prospects, runs FROM operator_screening_expire($1, $2)', [atMost, requestId]);
  const row = rows[0] as { prospects: number; runs: number } | undefined;
  return { prospects: row?.prospects ?? 0, runs: row?.runs ?? 0 };
}
