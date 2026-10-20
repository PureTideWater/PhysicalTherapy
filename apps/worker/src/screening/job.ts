import { performance } from 'node:perf_hooks';

import { ENGINE_VERSION, type IndexedRelease, type IsoDate } from '@tp/pricing';
import type { Logger } from '@tp/observability';

import type { MailSender } from '../mail/mail';
import { ReleaseReadOutsideFetch, type RequestedKeys, keyedRelease, screeningRequestedKeys } from '../price/keyed-release';
import { indexStoredRelease } from '../price/release';
import { ReleaseKeysMismatch, ScreeningPricer, pricesAsMedicare, releaseChangeDays } from './adapter';
import { screeningFailedMessage, screeningResultLink, screeningResultMessage, screeningStartLink } from './message';
import { type OperatorPool, type RunKeys, asOperator, claimRun, completeRun, dueRuns, failRun, pendingRows, recordRows, releaseRecords, runKeys, runRecords } from './operator';
import { newScreeningToken, screeningTokenHash } from './token';

/**
 * The screening_price platform job (Change Order 001, CO-04; docs/adr/0062). The web app sends it for a run once the
 * upload is stored; every minute it also runs as a sweep for runs queued longer than half a minute (a send that
 * failed) and for runs whose pricing started over ten minutes ago (a worker that stopped).
 *
 * One run: claim it (queued to pricing, or a stale one again, at most three attempts); fail it when its pinned
 * release is no longer there as pinned (unpublished, its manifest changed, or withdrawn); read the release (audit #53
 * part 2, "The release read"): the record types no row's key selects once per release and manifest, held for the
 * next run (at most two releases), and, in one transaction, the run's key set and the keyed records for it (its
 * distinct priced codes and the prospect's ZIP, from the database, never the caller); price its pending rows 5,000 at
 * a time through the adapter over a view that serves only those keys, the engine once per distinct line; record each
 * batch in one statement; then, in one transaction, complete it with the SHA-256 of a new link token and send the
 * link to the contact. A lookup outside the fetched keys, or a row whose code is not in the key set, fails the run
 * as RELEASE_READ_OUTSIDE_FETCH before its batch is recorded, and so do codes priced unequal to the key set after
 * the last batch: no row is stored on a lookup the run did not make. Each phase logs its milliseconds and record count,
 * numbers only, with the run's ID. A send that fails
 * rolls the completion back and the job fails; the run stays in pricing with every row recorded, and the sweep
 * claims it again once it is stale. After a third attempt the sweep fails the run, commits that, and then tells the
 * contact: a notice the mail service refuses is logged, and the run has failed anyway.
 *
 * The sweep takes each due run on its own: a run that throws (its contact's address refused by the mail service,
 * say) is logged and the sweep goes on to the next, so no one run holds up the others.
 *
 * The token reaches the email alone: never the database (its hash only), a log, a job payload or an audit event.
 * Logs carry the job's ID and the run's ID.
 */

/** Rows priced and recorded per transaction. */
export const SCREENING_BATCH = 5000;
/** A sweep leaves runs this new to their own on-demand job. */
export const SWEEP_MIN_QUEUED_AGE_SECONDS = 30;
/** The most attempts a run is claimed for. */
export const SCREENING_MAX_ATTEMPTS = 3;

export interface ScreeningJobDependencies {
  readonly operator: OperatorPool;
  readonly mail: MailSender;
  /** The application's origin, for the links. */
  readonly appOrigin: string;
  readonly logger: Logger;
  /** The job's ID: the audit events' request_id. */
  readonly jobId: string;
  /** Draws the result link's token (tests give their own). */
  readonly newToken?: () => string;
  /**
   * Tests only: changes the key set the database returned (a code dropped or added) or the keys the view admits (one
   * removed), to prove that a read outside the fetch fails the run. Production never sets it.
   */
  readonly alterReleaseRead?: { readonly keys?: (keys: RunKeys) => RunKeys; readonly requested?: (requested: RequestedKeys) => RequestedKeys };
}

export type ScreeningPriceOutcome = 'complete' | 'already_complete' | 'not_claimed' | 'failed';

/** A release's shared types as screening prices under them: indexed, with the days their records change. */
interface SharedRelease {
  readonly release: IndexedRelease;
  readonly changeDays: readonly IsoDate[];
  readonly recordCount: number;
}

/** The releases' shared types this process holds for screening, by release and manifest. */
const RELEASES = new Map<string, SharedRelease>();
/** At most this many releases are held: the one in force and the one before it (runs pinned before a new release). */
export const RELEASES_KEPT = 2;

function cachedRelease(key: string, load: () => SharedRelease): SharedRelease {
  const found = RELEASES.get(key);
  if (found !== undefined) {
    return found;
  }
  const loaded = load();
  if (RELEASES.size >= RELEASES_KEPT) {
    const oldest = RELEASES.keys().next().value;
    if (oldest !== undefined) {
      RELEASES.delete(oldest);
    }
  }
  RELEASES.set(key, loaded);
  return loaded;
}

/** Forgets the cached releases (tests). */
export function forgetScreeningReleases(): void {
  RELEASES.clear();
}

/** The releases held, by release and manifest (tests). */
export function heldScreeningReleases(): string[] {
  return [...RELEASES.keys()];
}

/** The union of two sorted lists of days, in order, each once. */
function unionDays(a: readonly IsoDate[], b: readonly IsoDate[]): IsoDate[] {
  return [...new Set([...a, ...b])].sort();
}

const elapsed = (since: number): number => Math.round(performance.now() - since);

/**
 * Fails a run, commits that, then tells its contact; false when it had ended already. A notice the mail service
 * refuses is logged by the run's ID alone, and the run stays failed.
 */
export async function failScreeningRun(dependencies: ScreeningJobDependencies, runId: string, failureCode: string): Promise<boolean> {
  const failed = await asOperator(dependencies.operator, (client) => failRun(client, runId, failureCode, dependencies.jobId));
  if (failed === null) {
    return false;
  }
  try {
    await dependencies.mail.send(screeningFailedMessage({ to: failed.contactEmail, startOver: screeningStartLink(dependencies.appOrigin) }));
  } catch {
    dependencies.logger.warn('screening run failed and its notice could not be sent', { job_id: dependencies.jobId, screening_run_id: runId, error_code: 'SCREENING_NOTICE_UNDELIVERABLE' });
  }
  return true;
}

/** Prices one run, if it is there to claim, and sends its link. */
export async function priceScreeningRun(dependencies: ScreeningJobDependencies, runId: string): Promise<ScreeningPriceOutcome> {
  const { operator, logger } = dependencies;
  const claimed = await asOperator(operator, (client) => claimRun(client, runId));
  if (claimed === null) {
    logger.info('screening run not claimed: it is being priced, done or out of attempts', { job_id: dependencies.jobId, screening_run_id: runId });
    return 'not_claimed';
  }
  const key = `${String(claimed.releaseNo)}:${claimed.manifestSha256}`;
  const unavailable = async (): Promise<'failed'> => {
    // The pinned release is not there as pinned (or was withdrawn): nothing can price the run.
    RELEASES.delete(key);
    await failScreeningRun(dependencies, runId, 'RELEASE_UNAVAILABLE');
    logger.error('screening run failed: its rule release is not available as pinned', { job_id: dependencies.jobId, screening_run_id: runId, error_code: 'RELEASE_UNAVAILABLE' });
    return 'failed';
  };
  if (!claimed.releaseAvailable) {
    return unavailable();
  }
  const header = { releaseNo: claimed.releaseNo, manifestSha256: claimed.manifestSha256 };
  let shared = RELEASES.get(key);
  if (shared === undefined) {
    const started = performance.now();
    const records = await asOperator(operator, (client) => releaseRecords(client, runId));
    if (records.length === 0) {
      return unavailable();
    }
    shared = cachedRelease(key, () => ({ release: indexStoredRelease(header, records), changeDays: releaseChangeDays(records), recordCount: records.length }));
    logger.info('screening release shared types read', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: elapsed(started), record_count: shared.recordCount });
  } else {
    logger.info('screening release shared types held from an earlier run', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: 0, record_count: shared.recordCount });
  }
  const keyedStarted = performance.now();
  const read = await asOperator(operator, async (client) => {
    const keys = await runKeys(client, runId);
    return keys === null ? null : { keys, records: await runRecords(client, runId) };
  });
  if (read === null) {
    return unavailable();
  }
  logger.info('screening release keyed records read', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: elapsed(keyedStarted), record_count: read.records.length });
  const keys = dependencies.alterReleaseRead?.keys?.(read.keys) ?? read.keys;
  const requested = screeningRequestedKeys(keys.codes, keys.zip);
  const view = keyedRelease({ shared: shared.release, records: indexStoredRelease(header, read.records), requested: dependencies.alterReleaseRead?.requested?.(requested) ?? requested });
  const codes = new Set(keys.codes);
  const pricer = new ScreeningPricer({
    release: view,
    changeDays: unionDays(shared.changeDays, releaseChangeDays(read.records)),
    zip: claimed.zip,
    placeOfServiceSettings: claimed.placeOfServiceSettings,
    asOf: claimed.asOf,
    read: { codes, view },
  });
  const outsideFetch = async (): Promise<'failed'> => {
    await failScreeningRun(dependencies, runId, 'RELEASE_READ_OUTSIDE_FETCH');
    logger.error('screening run failed: its pricing read the release outside the keys fetched for it', { job_id: dependencies.jobId, screening_run_id: runId, error_code: 'RELEASE_READ_OUTSIDE_FETCH' });
    return 'failed';
  };
  let afterRow = 0;
  let pricingMs = 0;
  let recordingMs = 0;
  let pricedRows = 0;
  let recordedRows = 0;
  for (;;) {
    const readStarted = performance.now();
    const rows = await asOperator(operator, (client) => pendingRows(client, runId, afterRow, SCREENING_BATCH));
    recordingMs += performance.now() - readStarted;
    if (rows.length === 0) {
      break;
    }
    const pricingStarted = performance.now();
    let outcomes;
    try {
      outcomes = rows.filter((row) => pricesAsMedicare(row.payerProduct)).map((row) => ({ rowNo: row.rowNo, outcome: pricer.outcome(row) }));
    } catch (error) {
      if (error instanceof ReleaseReadOutsideFetch || error instanceof ReleaseKeysMismatch) {
        return outsideFetch();
      }
      throw error;
    }
    pricingMs += performance.now() - pricingStarted;
    pricedRows += outcomes.length;
    const recordStarted = performance.now();
    recordedRows += await asOperator(operator, (client) => recordRows(client, runId, outcomes));
    recordingMs += performance.now() - recordStarted;
    afterRow = rows.at(-1)?.rowNo ?? afterRow;
  }
  // The key set is the codes of the run's Medicare rows still to price when it was read (operator_screening_run_keys),
  // which are the rows this attempt priced: the codes priced must be exactly the key set.
  if (pricer.codes.size !== codes.size || [...codes].some((code) => !pricer.codes.has(code))) {
    return outsideFetch();
  }
  logger.info('screening run rows priced', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: Math.round(pricingMs), record_count: pricedRows });
  logger.info('screening run rows recorded', { job_id: dependencies.jobId, screening_run_id: runId, elapsed_ms: Math.round(recordingMs), record_count: recordedRows });
  const token = (dependencies.newToken ?? newScreeningToken)();
  const sent = await asOperator(operator, async (client) => {
    const done = await completeRun(client, runId, screeningTokenHash(token), ENGINE_VERSION, dependencies.jobId);
    if (done === null) {
      return false;
    }
    await dependencies.mail.send(screeningResultMessage({ to: done.contactEmail, link: screeningResultLink(dependencies.appOrigin, token), rows: done.rowCount }));
    return true;
  });
  if (!sent) {
    logger.info('screening run was complete already', { job_id: dependencies.jobId, screening_run_id: runId });
    return 'already_complete';
  }
  logger.info('screening run priced and its link sent', { job_id: dependencies.jobId, screening_run_id: runId });
  return 'complete';
}

export interface SweepOptions {
  /** Runs queued for less than this are left to their own job (0 in tests and the end-to-end journey). */
  readonly minQueuedAgeSeconds: number;
}

export interface SweepResult {
  readonly complete: number;
  readonly failed: number;
  readonly skipped: number;
}

/** One due run of the sweep: failed when out of attempts, else priced. */
async function sweepOne(dependencies: ScreeningJobDependencies, run: { readonly runId: string; readonly status: 'queued' | 'pricing'; readonly attempts: number }): Promise<ScreeningPriceOutcome> {
  if (run.status === 'pricing' && run.attempts >= SCREENING_MAX_ATTEMPTS) {
    if (!(await failScreeningRun(dependencies, run.runId, 'PRICING_ATTEMPTS_EXHAUSTED'))) {
      return 'not_claimed';
    }
    dependencies.logger.warn('screening run failed after its last attempt', { job_id: dependencies.jobId, screening_run_id: run.runId, error_code: 'PRICING_ATTEMPTS_EXHAUSTED' });
    return 'failed';
  }
  return priceScreeningRun(dependencies, run.runId);
}

/**
 * The minute's sweep: prices each due run, and fails each stale one out of attempts. Each run is taken on its own: one
 * that throws is logged (SCREENING_RUN_FAILED, by its ID) and counted as skipped, and the sweep goes on.
 */
export async function sweepScreeningRuns(dependencies: ScreeningJobDependencies, options: SweepOptions): Promise<SweepResult> {
  const due = await asOperator(dependencies.operator, (client) => dueRuns(client, options.minQueuedAgeSeconds, 100));
  let complete = 0;
  let failed = 0;
  let skipped = 0;
  for (const run of due) {
    let outcome: ScreeningPriceOutcome;
    try {
      outcome = await sweepOne(dependencies, run);
    } catch {
      dependencies.logger.error('screening run could not be priced or sent in this sweep; a later claim takes it', {
        job_id: dependencies.jobId,
        screening_run_id: run.runId,
        error_code: 'SCREENING_RUN_FAILED',
      });
      outcome = 'not_claimed';
    }
    if (outcome === 'complete') {
      complete += 1;
    } else if (outcome === 'failed') {
      failed += 1;
    } else {
      skipped += 1;
    }
  }
  return { complete, failed, skipped };
}
