import type { Logger } from '@tp/observability';

import { type NoticeClient, asOperator } from './support-notices';

/**
 * The provider sign-outs (docs/adr/0095; test matrix JOB-06 to JOB-08): the database queues one row in
 * provider_sign_out for each ended membership, recorded password reset and confirmed key removal, in the cause's own
 * transaction (migration 20261115090000), and this platform job asks the identity provider to sign the account out
 * everywhere. The web calls the provider for none of these. Every minute, as the operator role (tp_operator), which owns
 * nothing and cannot bypass row-level security, every transaction with no practice in scope. One run, in order, each
 * step in its own try, so a failing step never stops the next; the run fails at its end if any step failed:
 *
 * 1. The sign-outs, for as long as the run has spent under 8 seconds on them (PROVIDER_SIGN_OUT_RUN_MS). Each: claim one
 *    row in one short transaction (operator_provider_sign_out_claim(), the only reader of the provider's subject, which
 *    counts the try and takes a two-minute lease); call the provider with no transaction open; record the answer in
 *    another short transaction, naming the try it answers: operator_provider_sign_out_done() for a sign-out or for the
 *    provider's "no such user", operator_provider_sign_out_failed() with the error's name for anything else. A row is
 *    claimed only when it is called at once, so no try is spent on a row the run never reaches.
 * 2. The overdue sweep (operator_provider_sign_outs_overdue()), which alone decides late and given up, from the row.
 *    For each line it returns, the paging line is written and only then acknowledged
 *    (operator_provider_sign_out_reported()): a crash in between writes the line again on the next run. At least once,
 *    never lost.
 * 3. Removal requests past their 24 hours are marked expired (operator_key_removals_expire()).
 * 4. Rows done 90 days ago are deleted (operator_provider_sign_outs_expire()).
 *
 * What is safe to repeat: the provider's global sign-out (a second one ends tokens already ended); done and failed act
 * only on an undone row and only for the latest claim, so a worker whose call outlived its lease changes nothing; the
 * sweep sets each mark once. So "the provider was asked at least once after the cause committed, and the record says
 * so once" holds under any retry or overlap of runs.
 *
 * Logs carry IDs and codes only. The subject lives in memory for the one call: it is in no log line, payload or error,
 * and a provider error is logged by its name alone, never its message.
 */

/** What the provider answered: signed out, or it holds no such user (nothing is left to sign out). */
export type ProviderSignOutOutcome = 'signed_out' | 'no_such_user';

/** The identity provider, for this job alone: sign the subject out everywhere. Throws on any other answer. */
export interface ProviderSignOutAdapter {
  signOut(subject: string): Promise<ProviderSignOutOutcome>;
}

export interface ProviderSignOutOptions {
  /** One operator connection; each step its own transaction as tp_operator. */
  readonly client: NoticeClient;
  readonly provider: ProviderSignOutAdapter;
  /** The job's ID: the audit events' request_id. */
  readonly requestId: string;
  /** Required: the paging line is written before its acknowledgement. */
  readonly logger: Logger;
  /** The clock the run's 8 seconds are read on, in milliseconds (the real one unless a test sets it). */
  readonly now?: () => number;
}

export interface ProviderSignOutResult {
  /** Rows the provider answered and this run recorded done. */
  readonly done: number;
  /** Tries that failed in this run (each tried again later). */
  readonly failed: number;
  /** Paging lines written and acknowledged in this run (LATE and GAVE_UP). */
  readonly reported: number;
  /** Removal requests marked expired. */
  readonly removalsExpired: number;
  /** Old rows deleted. */
  readonly deleted: number;
}

/** How long one run goes on claiming, in milliseconds: each call may take 10 seconds more (the adapter's abort). */
export const PROVIDER_SIGN_OUT_RUN_MS = 8_000;
/** How many removal requests and old rows one run expires at most; the next run takes the rest. */
export const PROVIDER_SIGN_OUT_EXPIRE_RUN = 100;

export const PROVIDER_SIGN_OUT_STEPS = ['sign_outs', 'overdue', 'removals_expire', 'sign_outs_expire'] as const;
export type ProviderSignOutStep = (typeof PROVIDER_SIGN_OUT_STEPS)[number];

/** The paging line's words: the alarm ProviderSignOutNotDelivered counts them (infra/lib/constructs/monitoring.ts). */
export const PROVIDER_SIGN_OUT_NOT_DELIVERED = 'security event: provider sign-out not delivered';
/**
 * The run's own line, once a run, with a count only: the alarm ProviderSignOutsNotRunning is on its absence, so a
 * schedule that stops firing this job is heard (infra/lib/security-events.ts; docs/adr/0095, D16).
 */
export const PROVIDER_SIGN_OUTS_RUN = 'provider sign-outs run';

/** One or more of the run's steps failed; the others ran. Names the steps, never an error's message. */
export class ProviderSignOutRunFailed extends Error {
  override readonly name = 'ProviderSignOutRunFailed';

  constructor(readonly steps: readonly ProviderSignOutStep[]) {
    super(`provider sign-out steps failed: ${steps.join(', ')}`);
  }
}

interface Claimed {
  readonly sign_out_id: string;
  readonly account_id: string;
  readonly subject: string;
  readonly try: number;
}

interface Overdue {
  readonly sign_out_id: string;
  readonly account_id: string;
  readonly cause_request_id: string | null;
  readonly code: 'LATE' | 'GAVE_UP';
}

/** An error's name when it is shaped like a class name, as the database stores it; never its message. */
export function providerErrorName(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  return /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : 'unknown';
}

/** Step 1: claim, call, record, one row at a time. */
async function signOuts(options: ProviderSignOutOptions): Promise<{ done: number; failed: number }> {
  const { client, logger } = options;
  const now = options.now ?? Date.now;
  const began = now();
  let done = 0;
  let failed = 0;
  while (now() - began < PROVIDER_SIGN_OUT_RUN_MS) {
    const claimed = (await asOperator(client, null, async () => (await client.query('SELECT sign_out_id, account_id, subject, try FROM operator_provider_sign_out_claim()')).rows[0])) as Claimed | undefined;
    if (claimed === undefined) {
      break;
    }
    let outcome: ProviderSignOutOutcome | undefined;
    let failure = 'unknown';
    try {
      // No transaction is open while the provider is called.
      outcome = await options.provider.signOut(claimed.subject);
    } catch (error) {
      failure = providerErrorName(error);
    }
    if (outcome === undefined) {
      await asOperator(client, null, () => client.query('SELECT operator_provider_sign_out_failed($1, $2, $3, $4)', [claimed.sign_out_id, claimed.try, failure, options.requestId]));
      failed += 1;
      logger.warn('provider sign-out attempt failed', { sign_out_id: claimed.sign_out_id, user_id: claimed.account_id, error_code: failure });
      continue;
    }
    const answered = outcome;
    const recorded = await asOperator(client, null, async () => {
      const { rows } = await client.query('SELECT operator_provider_sign_out_done($1, $2, $3, $4) AS recorded', [claimed.sign_out_id, claimed.try, answered, options.requestId]);
      return (rows[0] as { recorded: boolean } | undefined)?.recorded === true;
    });
    // Not recorded: another worker claimed the row after this one's lease lapsed, and its own call records it.
    if (recorded) {
      done += 1;
      // The audit row does not say which answer it was; this line does.
      logger.info('provider sign-out done', { sign_out_id: claimed.sign_out_id, user_id: claimed.account_id, outcome_code: answered });
    }
  }
  return { done, failed };
}

/** Step 2: the sweep, then each paging line, then its acknowledgement. */
async function overdue(options: ProviderSignOutOptions): Promise<number> {
  const { client, logger } = options;
  const lines = (await asOperator(client, null, async () => (await client.query('SELECT sign_out_id, account_id, cause_request_id, code FROM operator_provider_sign_outs_overdue($1)', [options.requestId])).rows)) as Overdue[];
  let reported = 0;
  for (const line of lines) {
    // The words are PROVIDER_SIGN_OUT_NOT_DELIVERED's, written out: the log lint reads fixed text only (a test ties the two).
    logger.error('security event: provider sign-out not delivered', { sign_out_id: line.sign_out_id, user_id: line.account_id, request_id: line.cause_request_id, error_code: line.code });
    await asOperator(client, null, () => client.query('SELECT operator_provider_sign_out_reported($1, $2)', [line.sign_out_id, line.code]));
    reported += 1;
  }
  return reported;
}

export async function runProviderSignOuts(options: ProviderSignOutOptions): Promise<ProviderSignOutResult> {
  const { client, logger } = options;
  const failedSteps: ProviderSignOutStep[] = [];
  const step = async <T>(name: ProviderSignOutStep, fallback: T, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      failedSteps.push(name);
      logger.error('provider sign-out step failed', { error_code: `${name}:${providerErrorName(error)}` });
      return fallback;
    }
  };
  const { done, failed } = await step('sign_outs', { done: 0, failed: 0 }, () => signOuts(options));
  const reported = await step('overdue', 0, () => overdue(options));
  const removalsExpired = await step('removals_expire', 0, () =>
    asOperator(client, null, async () => (await client.query('SELECT removal_id, user_id FROM operator_key_removals_expire($1, $2)', [PROVIDER_SIGN_OUT_EXPIRE_RUN, options.requestId])).rows.length),
  );
  const deleted = await step('sign_outs_expire', 0, () =>
    asOperator(client, null, async () => {
      const { rows } = await client.query('SELECT operator_provider_sign_outs_expire($1) AS removed', [PROVIDER_SIGN_OUT_EXPIRE_RUN]);
      return (rows[0] as { removed: number } | undefined)?.removed ?? 0;
    }),
  );
  // Written whether or not a step failed (a failed step has its own line and fails the run): the run happened. The
  // words are PROVIDER_SIGN_OUTS_RUN's, written out: the log lint reads fixed text only (a test ties the two).
  logger.info('provider sign-outs run', { record_count: done + failed });
  if (failedSteps.length > 0) {
    throw new ProviderSignOutRunFailed(failedSteps);
  }
  return { done, failed, reported, removalsExpired, deleted };
}
