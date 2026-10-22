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

/**
 * One transaction as the operator role, committed when `run` returns and rolled back when it throws. With `snapshot`,
 * a read-only transaction at REPEATABLE READ: every statement in it reads one snapshot, so two reads that check the
 * same thing (the release's key set and its keyed records) cannot see a change made between them.
 */
export async function asOperator<T>(pool: OperatorPool, run: (client: OperatorClient) => Promise<T>, options: { readonly snapshot?: boolean } = {}): Promise<T> {
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query(options.snapshot === true ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
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
  /** The pinned release is still there as pinned: published, its manifest unchanged, and not withdrawn. */
  readonly releaseAvailable: boolean;
  readonly zip: string;
  /** The prospect's ZIP+4, kept only when the ZIP's locality_map record needs it; null otherwise. */
  readonly zipPlusFour: string | null;
  readonly placeOfServiceSettings: Readonly<Record<string, PlaceOfServiceSetting>>;
  /** The run's creation date in UTC, YYYY-MM-DD. */
  readonly asOf: string;
  readonly rowCount: number;
  readonly attempt: number;
}

/** Claims a run for pricing; null when it is not there to claim (already being priced, done, or out of attempts). */
export async function claimRun(client: OperatorClient, runId: string): Promise<ClaimedRun | null> {
  const { rows } = await client.query(
    'SELECT release_no, release_manifest_sha256, release_available, zip, zip_plus_four, settings, as_of::text AS as_of, row_count, attempt FROM operator_screening_claim($1)',
    [runId],
  );
  const row = rows[0] as
    | {
        release_no: number;
        release_manifest_sha256: string;
        release_available: boolean;
        zip: string;
        zip_plus_four: string | null;
        settings: Record<string, PlaceOfServiceSetting>;
        as_of: string;
        row_count: number;
        attempt: number;
      }
    | undefined;
  return row === undefined
    ? null
    : {
        releaseNo: row.release_no,
        manifestSha256: row.release_manifest_sha256,
        releaseAvailable: row.release_available,
        zip: row.zip,
        zipPlusFour: row.zip_plus_four,
        placeOfServiceSettings: row.settings,
        asOf: row.as_of,
        rowCount: row.row_count,
        attempt: row.attempt,
      };
}

/**
 * The pinned release's records of the shared types, as the engine reads them: every type but those a line looks up
 * by its own key (KEYED_RECORD_TYPES in apps/worker/src/price/keyed-release.ts), the same for every run under the
 * release and manifest. Nothing for a run not being priced, or whose release is not there as pinned.
 */
export async function releaseRecords(client: OperatorClient, runId: string): Promise<StoredRecordRow[]> {
  const { rows } = await client.query('SELECT record_type, key, value, effective_from, effective_to, sha256 FROM operator_screening_release($1)', [runId]);
  return rows as StoredRecordRow[];
}

/** The key set a run's keyed records are read by: the distinct codes of its rows still to price (the database's, from its own rows) and the prospect's ZIP. */
export interface RunKeys {
  /** The distinct procedure codes of the run's medicare_ffs and ma_noncontracted rows still to price, sorted. */
  readonly codes: readonly string[];
  readonly zip: string;
}

/** The run's key set, or null for a run not being priced, or whose release is not there as pinned. */
export async function runKeys(client: OperatorClient, runId: string): Promise<RunKeys | null> {
  const { rows } = await client.query('SELECT codes, zip FROM operator_screening_run_keys($1)', [runId]);
  const row = rows[0] as { codes: string[]; zip: string } | undefined;
  return row === undefined ? null : { codes: [...row.codes].sort(), zip: row.zip };
}

/**
 * The pinned release's records of the keyed types for the run's key set (operator_screening_run_keys): for each code,
 * its relative values and MPPR rate with no modifier, its medically unlikely edit and its same-code pair; the general
 * practice-expense MPPR rate; and the prospect's ZIP's locality, in the ZIP file and the ZIP+4 file. Never a code the
 * caller names.
 */
export async function runRecords(client: OperatorClient, runId: string): Promise<StoredRecordRow[]> {
  const { rows } = await client.query('SELECT record_type, key, value, effective_from, effective_to, sha256 FROM operator_screening_run_records($1)', [runId]);
  return rows as StoredRecordRow[];
}

/** The run's rows still to price after a row number, at most 5,000; none for an attempt the run has moved past. */
export async function pendingRows(client: OperatorClient, runId: string, afterRow: number, atMost: number, attempt: number): Promise<PendingScreeningRow[]> {
  const { rows } = await client.query(
    `SELECT row_no, procedure_code, modifiers, units, place_of_service, payer_product, service_band, claim_count, observed_allowed_cents::text AS observed_allowed_cents
       FROM operator_screening_rows($1, $2, $3, $4)`,
    [runId, afterRow, atMost, attempt],
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

/**
 * Records what pricing found for up to 5,000 rows, in one statement, by the attempt that claimed the run. Returns how
 * many it recorded; an attempt the run has moved past is refused (attemptSuperseded()).
 */
export async function recordRows(client: OperatorClient, runId: string, outcomes: readonly { readonly rowNo: number; readonly outcome: ScreeningRowOutcome }[], attempt: number): Promise<number> {
  const priced = (item: (typeof outcomes)[number]) => (item.outcome.disposition === 'priced' ? item.outcome : undefined);
  const reduced = (item: (typeof outcomes)[number]) => priced(item)?.reduced ?? undefined;
  const unpriced = (item: (typeof outcomes)[number]) => (item.outcome.disposition === 'unpriced' ? item.outcome : undefined);
  const { rows } = await client.query('SELECT operator_screening_record($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) AS recorded', [
    runId,
    outcomes.map((item) => item.rowNo),
    outcomes.map((item) => item.outcome.disposition),
    outcomes.map((item) => text(priced(item)?.expectedLineCents)),
    outcomes.map((item) => priced(item)?.expectedLineUnrounded ?? null),
    outcomes.map((item) => text(priced(item)?.expectedCents)),
    outcomes.map((item) => text(priced(item)?.differenceCents)),
    outcomes.map((item) => priced(item)?.inReductionPool ?? null),
    outcomes.map((item) => text(reduced(item)?.lineCents)),
    outcomes.map((item) => reduced(item)?.lineUnrounded ?? null),
    outcomes.map((item) => text(reduced(item)?.cents)),
    outcomes.map((item) => text(reduced(item)?.differenceCents)),
    outcomes.map((item) => reduced(item)?.traceSha256 ?? null),
    outcomes.map((item) => unpriced(item)?.reason ?? null),
    outcomes.map((item) => unpriced(item)?.detail ?? null),
    outcomes.map((item) => item.outcome.traceSha256),
    attempt,
  ]);
  return (rows[0] as { recorded: number } | undefined)?.recorded ?? 0;
}

/**
 * Completes a run with its token's hash, by the attempt that claimed it; where its email goes, its row count and what
 * its summary is kept with, or null when it was complete already. An attempt the run has moved past is refused, and a
 * run a later screening replaced is gone (attemptSuperseded() names both); a run whose screening expired while it was
 * priced is refused too (screeningExpired()). The database writes the run's counts-only outcome and replaces the
 * practice's earlier kept summaries in the same transaction, and keeps this run's summary when a request of the same
 * practice is carried over (kept_with 'earlier_request') or the prospect consented ('consent'). A consent summary needs
 * the SHA-256 of its withdrawal link's token, which PR 6e's consent capture makes; until then no prospect consents and
 * none is passed.
 */
export async function completeRun(
  client: OperatorClient,
  runId: string,
  tokenSha256: string,
  engine: string,
  requestId: string,
  attempt: number,
  withdrawalTokenSha256: string | null = null,
): Promise<{ readonly contactEmail: string; readonly rowCount: number; readonly keptWith: CompletedKeptWith } | null> {
  const { rows } = await client.query('SELECT contact_email, row_count, kept_with FROM operator_screening_complete($1, $2, $3, $4, $5, $6)', [runId, tokenSha256, withdrawalTokenSha256, engine, requestId, attempt]);
  const row = rows[0] as { contact_email: string; row_count: number; kept_with: string } | undefined;
  if (row === undefined) {
    return null;
  }
  if (!(COMPLETED_KEPT_WITH as readonly string[]).includes(row.kept_with)) {
    throw new Error('the database gave a kept summary basis the worker does not know');
  }
  return { contactEmail: row.contact_email, rowCount: row.row_count, keptWith: row.kept_with as CompletedKeptWith };
}

/** What a completed run's summary can be kept with (operator_screening_complete's kept_with). */
export const COMPLETED_KEPT_WITH = ['none', 'earlier_request', 'consent'] as const;
export type CompletedKeptWith = (typeof COMPLETED_KEPT_WITH)[number];

/**
 * Fails a queued or pricing run with a code; where its notice goes, or null when it had ended already or (an attempt
 * named) the run has moved past that attempt. The sweep, failing a run out of attempts, names none.
 */
export async function failRun(client: OperatorClient, runId: string, failureCode: string, requestId: string, attempt: number | null): Promise<{ readonly contactEmail: string } | null> {
  const { rows } = await client.query('SELECT contact_email FROM operator_screening_fail($1, $2, $3, $4)', [runId, failureCode, requestId, attempt]);
  const row = rows[0] as { contact_email: string } | undefined;
  return row === undefined ? null : { contactEmail: row.contact_email };
}

/** Deletes up to `atMost` expired screenings, and up to `atMost` kept summaries past their 12 months; their outcomes stay. */
export async function expireBatch(client: OperatorClient, atMost: number, requestId: string): Promise<{ readonly prospects: number; readonly runs: number; readonly leads: number }> {
  const { rows } = await client.query('SELECT prospects, runs, leads FROM operator_screening_expire($1, $2)', [atMost, requestId]);
  const row = rows[0] as { prospects: number; runs: number; leads: number } | undefined;
  return { prospects: row?.prospects ?? 0, runs: row?.runs ?? 0, leads: row?.leads ?? 0 };
}

/**
 * Whether a call failed because this attempt no longer prices the run: a stale claim overtook it (the run has moved past
 * its attempt, screening_run_attempt) or a later screening of the practice replaced the run (no such run).
 */
/** Whether a completion was refused because the run's screening expired while it was priced (screening_run_expired). */
export function screeningExpired(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === '23514' && 'constraint' in error && (error as { constraint?: unknown }).constraint === 'screening_run_expired';
}

export function attemptSuperseded(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  const { code } = error as { readonly code?: unknown };
  const constraint = 'constraint' in error ? (error as { readonly constraint?: unknown }).constraint : undefined;
  return (code === '23514' && constraint === 'screening_run_attempt') || code === 'P0002';
}
