import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type ExportReadinessReason, PACKET_EXPORT_FAILURES, PACKET_EXPORT_REFUSALS, type PacketExportFailure, type PacketExportRefusal } from '@tp/worker/packets';

import { PRICING_BLOCKED_TEXT } from './pricing';

/**
 * What became of a packet version's export, as its packet page says it (the best-option audit's item #26, the
 * founder's ruling of 2026-10-18; docs/adr/0061): the export action refuses at once what the export job would
 * refuse (@tp/worker/packets exportReadiness()), listing every reason with its fix; the job records each
 * refusal and each failed try as an audit event of the version with one code and no words or patient data; and
 * the page reads the latest attempt since the latest request (packet_version_export_attempt()): none, in
 * progress, retrying, refused with its fix, failed, or exported. A request still in progress or retrying an hour on
 * is shown as failed (no_result), since the job's tries and their back-off take minutes: a worker of the previous
 * image writes no attempt events, and a job lost with its worker writes none either.
 */

type Scope = PracticeScope<ScopeClient>;

/** Why an export with a deadline that is not verified is not asked for, and what the billing manager does about it (CO-05, D17). */
export const DEADLINE_NOT_EXPORTABLE = 'The export is blocked: this version’s deadline is not verified, so the packet is not exported. Each reason, and who supplies the missing evidence, is under Deadline above.';

/** A /1 version's export: it states no deadline, so it is written again. */
export const OUTDATED_NOT_EXPORTABLE = 'This version was written before packets stated their deadline. Write a new version of the packet and approve it; only that one can be exported.';

/** A version written before a denial reopened the case: it states the earlier level's deadline, so it is written again. */
export const STALE_LEVEL_NOT_EXPORTABLE =
  'This version was written before the payer’s denial reopened the case for its next dispute level, so it states the earlier level’s deadline. Write a new version of the packet at this level and approve it; only that one can be exported.';

/** Why an export is not asked for, or why the job refused it, by code: what holds and what to do about it, in sentences (no value). */
export const EXPORT_REFUSAL_TEXT: Readonly<Record<PacketExportRefusal, string>> = {
  not_approved: 'This version is not approved yet. A second person who approves packets approves it under Approval above; then export it.',
  not_current: 'A later version of this packet was written since, and only the current version is exported. Open the current version and export it once it is approved.',
  outdated: OUTDATED_NOT_EXPORTABLE,
  case_changed:
    'The case changed since this version was written: a line was written off or reopened, or the case was closed written off. Write a new version of the packet and approve it; only that one can be exported, and a case closed written off exports nothing.',
  not_case_level: STALE_LEVEL_NOT_EXPORTABLE,
  window_passed:
    'A line’s dispute window has ended, so the packet is not exported with it. Write the line off on the case page (the daily check writes such a line off too), then write a new version of the packet without it and approve it.',
  next_window_passed:
    'The next dispute level’s window, which the payer’s denial gave when it reopened the case, has ended, so this level’s packet is not exported. Do not write the lines off for it: their first-level windows are not this level’s deadline. Record what the payer decides, or ask support how to proceed with this level.',
  pricing_not_current: PRICING_BLOCKED_TEXT.export,
  deadline_unverified: DEADLINE_NOT_EXPORTABLE,
  inputs_differ:
    'This version no longer states its deadlines and calculations as its records give them now (a window’s evidence, a rule release or a reopening denial changed since it was written), so it is not printed. Write a new version of the packet and approve it.',
  contact_missing:
    'The payer’s copy names who answers for this dispute, and the practice has no correspondence contact the payer’s copy can print, so nothing is printed. The practice’s administrator sets the correspondence contact under Settings, Correspondence; then export it.',
  verifier_failed:
    'The verifier, run again over what the export prints with the identifiers read from the records now, failed it, so nothing was printed. Write a new version of the packet, which the verifier checks as it is written, and approve it.',
};

/** A request with no answer from the job by then is shown as failed: the job answers within minutes, and retries within the hour. */
export const ATTEMPT_NO_RESULT_MS = 60 * 60 * 1000;

/** How often the packet page asks again while the export is in progress. */
export const ATTEMPT_REFRESH_MS = 5_000;

/** The page's own code for a request with no result an hour on. */
export type ExportFailureCode = PacketExportFailure | 'no_result';

/** Why a try failed, by code (no value, no error text). */
export const EXPORT_FAILURE_TEXT: Readonly<Record<ExportFailureCode, string>> = {
  store_mismatch: 'The document store sealed other bytes than the export printed, so nothing was recorded.',
  render_failed: 'The PDF could not be printed: its renderer failed, or PaidWhole was updated after the export was asked for, so the calculation’s words may differ from those on the page it was asked from.',
  store_failed: 'The files could not be stored.',
  database_refused: 'The database refused to record the export: one of its rules no longer holds for this version.',
  unexpected: 'The export stopped on an unexpected error.',
  no_result: 'No result came back within an hour of the request.',
};

export const EXPORT_ATTEMPT_STATES = ['none', 'in_progress', 'retrying', 'refused', 'failed', 'exported'] as const;
export type ExportAttemptState = (typeof EXPORT_ATTEMPT_STATES)[number];

/** The latest attempt at a version's export, as the page shows it. */
export type ExportAttempt =
  | { readonly state: 'none' }
  | { readonly state: 'in_progress'; readonly requestedAt: string }
  | { readonly state: 'retrying'; readonly requestedAt: string; readonly at: string; readonly code: PacketExportFailure }
  | { readonly state: 'refused'; readonly requestedAt: string; readonly at: string; readonly code: PacketExportRefusal }
  | { readonly state: 'failed'; readonly requestedAt: string; readonly at: string | null; readonly code: ExportFailureCode }
  | { readonly state: 'exported'; readonly at: string };

const REFUSALS: ReadonlySet<string> = new Set(PACKET_EXPORT_REFUSALS);
const FAILURES: ReadonlySet<string> = new Set(PACKET_EXPORT_FAILURES);

interface AttemptRow {
  readonly state: string;
  readonly code: string | null;
  readonly requested_at: Date | null;
  readonly at: Date | null;
}

/**
 * The latest attempt at a version's export (packet_version_export_attempt(), which answers for a person who drafts
 * packets or exports PHI in the version's practice, in the caller's scope): 'none' when there is no row. A request
 * with nothing from the job an hour on is shown as failed with no_result; a code the page does not know is shown as
 * unexpected rather than dropped.
 */
export async function exportAttempt(scope: Scope, versionId: string, now: Date): Promise<ExportAttempt> {
  const { rows } = await scope.client.query<AttemptRow>('SELECT state, code, requested_at, at FROM packet_version_export_attempt($1)', [versionId]);
  const row = rows[0];
  if (row === undefined || row.state === 'none') {
    return { state: 'none' };
  }
  if (row.state === 'exported') {
    return { state: 'exported', at: (row.at ?? now).toISOString() };
  }
  const requestedAt = (row.requested_at ?? now).toISOString();
  const at = row.at?.toISOString() ?? null;
  // Still going an hour on: the job has stopped answering (its tries and their back-off take minutes).
  if ((row.state === 'in_progress' || row.state === 'retrying') && now.getTime() - Date.parse(requestedAt) > ATTEMPT_NO_RESULT_MS) {
    return { state: 'failed', requestedAt, at: null, code: 'no_result' };
  }
  if (row.state === 'in_progress') {
    return { state: 'in_progress', requestedAt };
  }
  if (row.state === 'refused' && row.code !== null && REFUSALS.has(row.code) && at !== null) {
    return { state: 'refused', requestedAt, at, code: row.code as PacketExportRefusal };
  }
  const code = row.code !== null && FAILURES.has(row.code) ? (row.code as PacketExportFailure) : 'unexpected';
  if (row.state === 'retrying' && at !== null) {
    return { state: 'retrying', requestedAt, at, code };
  }
  return { state: 'failed', requestedAt, at, code };
}

/** What the page says of an attempt: its title, its sentences, its tone and whether it is still going (a live region that refreshes). */
export interface ExportAttemptWords {
  readonly state: Exclude<ExportAttemptState, 'none' | 'exported'>;
  readonly code: string | null;
  readonly tone: 'info' | 'warning' | 'danger';
  readonly title: string;
  readonly text: string;
  /** In progress or retrying: the page asks again every few seconds. */
  readonly live: boolean;
}

/**
 * The words for an attempt, with times as `time` formats them; null for none and for an exported version (the
 * page shows the export itself). `cleared`: the version is ready to export now, so a refusal for a readiness reason
 * no longer holds and is told as the earlier request's, with no fix to follow (a verifier failure always keeps its
 * fix: the version is written again).
 */
export function exportAttemptWords(attempt: ExportAttempt, time: (iso: string) => string, options: { readonly cleared?: boolean; readonly singleUser?: boolean } = {}): ExportAttemptWords | null {
  switch (attempt.state) {
    case 'none':
    case 'exported':
      return null;
    case 'in_progress':
      return {
        state: 'in_progress',
        code: null,
        tone: 'info',
        title: 'Export in progress',
        text: `Asked at ${time(attempt.requestedAt)}: the worker is checking the version again and printing its PDF and CSV. This updates by itself every few seconds.`,
        live: true,
      };
    case 'retrying':
      return {
        state: 'retrying',
        code: attempt.code,
        tone: 'warning',
        title: 'Export trying again',
        text: `The try at ${time(attempt.at)} failed: ${EXPORT_FAILURE_TEXT[attempt.code]} Nothing was stored. The worker tries again by itself; this updates every few seconds.`,
        live: true,
      };
    case 'refused':
      if (options.cleared === true && attempt.code !== 'verifier_failed') {
        return {
          state: 'refused',
          code: attempt.code,
          tone: 'info',
          title: 'An earlier request was refused',
          text: `The request at ${time(attempt.requestedAt)} was refused: ${REFUSAL_SUMMARY[attempt.code]}. That no longer holds, so this version can be exported: export it again.`,
          live: false,
        };
      }
      return {
        state: 'refused',
        code: attempt.code,
        tone: 'danger',
        title: 'Export refused',
        text: `The export job refused this version at ${time(attempt.at)} and printed nothing. ${exportRefusalText(attempt.code, { singleUser: options.singleUser ?? false })}`,
        live: false,
      };
    case 'failed':
      return {
        state: 'failed',
        code: attempt.code,
        tone: 'danger',
        title: attempt.code === 'no_result' ? 'No result from the export' : 'Export failed',
        text:
          attempt.code === 'no_result'
            ? `${EXPORT_FAILURE_TEXT.no_result} It was asked for at ${time(attempt.requestedAt)}, and nothing was stored. Ask for the export again; if it does not finish, ask support.`
            : `${EXPORT_FAILURE_TEXT[attempt.code]} Every try failed${attempt.at === null ? '' : `, the last at ${time(attempt.at)}`}, and nothing was stored. Ask for the export again; the operator was alerted.`,
        live: false,
      };
  }
}

/** not_approved in a single-user practice: no one else approves packets, so the drafter approves alone after the 24-hour delay. */
export const NOT_APPROVED_ALONE_TEXT =
  'This version is not approved yet. No one else in the practice approves packets, so the person who wrote it approves it alone under Approval above once the 24-hour delay is over (the approval carries the single-user flag); then export it.';

/** A refusal's words for the practice it is in: not_approved names who approves (a second person, or the writer alone in a single-user practice). */
export function exportRefusalText(reason: PacketExportRefusal, options: { readonly singleUser: boolean }): string {
  return reason === 'not_approved' && options.singleUser ? NOT_APPROVED_ALONE_TEXT : EXPORT_REFUSAL_TEXT[reason];
}

/** Every reason an export request is refused for, each with its fix, as the export action and the packet page list them. */
export function refusalList(reasons: readonly ExportReadinessReason[], options: { readonly singleUser: boolean } = { singleUser: false }): readonly { readonly reason: ExportReadinessReason; readonly text: string }[] {
  return reasons.map((reason) => ({ reason, text: exportRefusalText(reason, options) }));
}

/** What an earlier refusal was, in a few words, for a request whose reason no longer holds. */
const REFUSAL_SUMMARY: Readonly<Record<PacketExportRefusal, string>> = {
  not_approved: 'the version was not approved',
  not_current: 'a later version had been written',
  outdated: 'the version stated no deadline',
  case_changed: 'the case had changed',
  not_case_level: 'the version was of an earlier dispute level',
  window_passed: 'a line’s dispute window had ended',
  next_window_passed: 'the next dispute level’s window had ended',
  pricing_not_current: 'a line’s pricing was no longer current',
  deadline_unverified: 'the deadline was not verified',
  inputs_differ: 'the version no longer stated its inputs',
  contact_missing: 'the practice had no correspondence contact the payer’s copy could print',
  verifier_failed: 'the verifier failed what the export printed',
};
