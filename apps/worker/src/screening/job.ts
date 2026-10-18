import { ENGINE_VERSION, type IndexedRelease } from '@tp/pricing';
import type { Logger } from '@tp/observability';

import type { MailSender } from '../mail/mail';
import { indexStoredRelease } from '../price/release';
import { ScreeningPricer, pricesAsMedicare } from './adapter';
import { screeningFailedMessage, screeningResultLink, screeningResultMessage, screeningStartLink } from './message';
import { type OperatorPool, asOperator, claimRun, completeRun, dueRuns, failRun, pendingRows, recordRows, releaseRecords } from './operator';
import { newScreeningToken, screeningTokenHash } from './token';

/**
 * The screening_price platform job (Change Order 001, CO-04; docs/adr/0062). The web app sends it for a run once the
 * upload is stored; every minute it also runs as a sweep for runs queued longer than half a minute (a send that
 * failed) and for runs whose pricing started over ten minutes ago (a worker that stopped).
 *
 * One run: claim it (queued to pricing, or a stale one again, at most three attempts); read its pinned release
 * through the operator function (cached per process by release, manifest and ZIP); price its pending rows 5,000 at
 * a time through the adapter, the engine once per distinct line; record each batch in one statement; then, in one
 * transaction, complete it with the SHA-256 of a new link token and send the link to the contact. A send that fails
 * rolls the completion back and the job fails; the run stays in pricing with every row recorded, and the sweep
 * claims it again once it is stale. After a third attempt the sweep fails the run and tells the contact.
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
}

export type ScreeningPriceOutcome = 'complete' | 'already_complete' | 'not_claimed' | 'failed';

/** The releases this process has read for screening, by release, manifest and ZIP. */
const RELEASES = new Map<string, IndexedRelease>();
const RELEASES_KEPT = 16;

function cachedRelease(key: string, load: () => IndexedRelease): IndexedRelease {
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

/** Fails a run and tells its contact; false when it had ended already. */
export async function failScreeningRun(dependencies: ScreeningJobDependencies, runId: string, failureCode: string): Promise<boolean> {
  return asOperator(dependencies.operator, async (client) => {
    const failed = await failRun(client, runId, failureCode, dependencies.jobId);
    if (failed === null) {
      return false;
    }
    await dependencies.mail.send(screeningFailedMessage({ to: failed.contactEmail, startOver: screeningStartLink(dependencies.appOrigin) }));
    return true;
  });
}

/** Prices one run, if it is there to claim, and sends its link. */
export async function priceScreeningRun(dependencies: ScreeningJobDependencies, runId: string): Promise<ScreeningPriceOutcome> {
  const { operator, logger } = dependencies;
  const claimed = await asOperator(operator, (client) => claimRun(client, runId));
  if (claimed === null) {
    logger.info('screening run not claimed: it is being priced, done or out of attempts', { job_id: dependencies.jobId, screening_run_id: runId });
    return 'not_claimed';
  }
  const key = `${String(claimed.releaseNo)}:${claimed.manifestSha256}:${claimed.zip}`;
  let release = RELEASES.get(key);
  if (release === undefined) {
    const records = await asOperator(operator, (client) => releaseRecords(client, runId));
    if (records.length === 0) {
      // The pinned release is not there as pinned: nothing can price the run.
      await failScreeningRun(dependencies, runId, 'RELEASE_UNAVAILABLE');
      logger.error('screening run failed: its rule release is not available as pinned', { job_id: dependencies.jobId, screening_run_id: runId, error_code: 'RELEASE_UNAVAILABLE' });
      return 'failed';
    }
    release = cachedRelease(key, () => indexStoredRelease({ releaseNo: claimed.releaseNo, manifestSha256: claimed.manifestSha256 }, records));
  }
  const pricer = new ScreeningPricer({ release, zip: claimed.zip, placeOfServiceSettings: claimed.placeOfServiceSettings, asOf: claimed.asOf });
  let afterRow = 0;
  for (;;) {
    const rows = await asOperator(operator, (client) => pendingRows(client, runId, afterRow, SCREENING_BATCH));
    if (rows.length === 0) {
      break;
    }
    const outcomes = rows.filter((row) => pricesAsMedicare(row.payerProduct)).map((row) => ({ rowNo: row.rowNo, outcome: pricer.outcome(row) }));
    await asOperator(operator, (client) => recordRows(client, runId, outcomes));
    afterRow = rows.at(-1)?.rowNo ?? afterRow;
  }
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

/** The minute's sweep: prices each due run, and fails each stale one out of attempts. */
export async function sweepScreeningRuns(dependencies: ScreeningJobDependencies, options: SweepOptions): Promise<SweepResult> {
  const due = await asOperator(dependencies.operator, (client) => dueRuns(client, options.minQueuedAgeSeconds, 100));
  let complete = 0;
  let failed = 0;
  let skipped = 0;
  for (const run of due) {
    if (run.status === 'pricing' && run.attempts >= SCREENING_MAX_ATTEMPTS) {
      if (await failScreeningRun(dependencies, run.runId, 'PRICING_ATTEMPTS_EXHAUSTED')) {
        dependencies.logger.warn('screening run failed after its last attempt', { job_id: dependencies.jobId, screening_run_id: run.runId, error_code: 'PRICING_ATTEMPTS_EXHAUSTED' });
        failed += 1;
      } else {
        skipped += 1;
      }
      continue;
    }
    const outcome = await priceScreeningRun(dependencies, run.runId);
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
