/**
 * What a screen says about a model feature (docs/adr/0052): the reason a call proposed nothing, each
 * with hand entry as the next step, and what a model step made. Plain data, so components can show it
 * without the gateway.
 */

/**
 * Why a model call proposed nothing. One is the contract's length, and nothing was sent:
 * - `too_long`: the document's framed request is longer than a call sends (contractTermsSpec.prepare's cap,
 *   MAX_REQUEST_BYTES; docs/adr/0070, Part 3, P11), several times what the largest contract of the evaluation set
 *   needs, so a second try meets the same cap and the terms are entered by hand. It names no figure: the person cannot
 *   shorten the document, so the cap's would not help.
 * Four are the contract screen's (docs/adr/0070, Part 3), and none sent anything:
 * - `names_patient`: the document holds an identifier from the practice's patient records (a member ID, a patient
 *   control number or a payer claim number they hold). Most often it is a payer letter or an EOB filed as a contract,
 *   which has no terms to enter and cannot be filed again yet (F4), so the way on is the version's contract or the
 *   practice's; a contract or an exhibit that holds one (or matches one by chance) is entered by hand.
 * - `screen_unavailable`: the document could not be checked against those records: the practice holds more
 *   identifiers than the check reads until the lookup hashes land (F3), or the check was not one the gateway issued
 *   (`screen_invalid`, the code's mistake). A second try meets the same, so the terms are entered by hand.
 * - `screen_failed`: the records could not be read for the check just now. The next click reads them again, before
 *   any budget or model call, so it is worth a second try (the PR #75 review's UX-3).
 * - `screen_limited`: the screen's own limits (contract-proposals.ts SCREEN_LIMITS) stopped the check before it read
 *   anything; they reset within the hour or the day.
 * Each names the records one way ("the practice's patient records") and names no patient, no identifier, no kind of
 * identifier and no count: the person can already open the document, so saying it holds an identifier discloses
 * nothing they cannot see (the design review's m14).
 */
export const MODEL_PROBLEMS = [
  'off',
  'not_evaluated',
  'budget',
  'busy',
  'failed',
  'refused',
  'too_long',
  'names_patient',
  'screen_unavailable',
  'screen_failed',
  'screen_limited',
  'invalid_output',
  'misstated',
  'unavailable',
] as const;
export type ModelProblem = (typeof MODEL_PROBLEMS)[number];

export const MODEL_PROBLEM_TEXT: Readonly<Record<ModelProblem, string>> = {
  off: 'Model features are switched off for this practice; enter it by hand.',
  not_evaluated: 'This model feature is off until it has been evaluated for the model configured here; enter it by hand.',
  budget: 'The practice has spent its model budget for today; enter it by hand, or try again tomorrow.',
  busy: 'Other model requests are being answered right now, so nothing was sent; try again in a minute, or enter it by hand.',
  failed: 'The model did not answer (it timed out, was busy or refused); nothing was proposed. Enter it by hand, or try again.',
  refused: 'The input cannot be sent to a model as it is; enter it by hand.',
  too_long: 'This document is too long to send to the model, so nothing was sent. Enter its terms by hand below.',
  names_patient:
    'This document holds an identifier from the practice’s patient records, so it was not sent to the model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the version’s contract or exhibit as the document to read, or ask the practice for the contract below. If it is a contract or an exhibit, enter its terms by hand below.',
  screen_unavailable: 'This document could not be checked against the practice’s patient records, so it was not sent to the model. Enter its terms by hand below.',
  screen_failed: 'The practice’s patient records could not be read to check this document just now, so it was not sent to the model. Try again in a minute, or enter its terms by hand below.',
  screen_limited:
    'Documents have been checked against the practice’s patient records as many times as allowed for now, so this one was not sent to the model. Try again later, or enter its terms by hand below.',
  invalid_output: 'The model’s answer did not follow its schema; nothing was proposed. Enter it by hand.',
  misstated: 'The model’s narrative stated a figure in the wrong place (one amount or count as another); nothing was written. Draft it by hand, or ask again.',
  unavailable: 'No model is configured for this environment; enter it by hand.',
};

/** What the screen says after a step: what it made, or why the model made nothing. */
export const MODEL_NOTICES = ['proposed', 'rejected', 'drafted', 'suggested', 'kept', 'dismissed', 'reviewed_already', 'no_gaps', ...MODEL_PROBLEMS] as const;
export type ModelNotice = (typeof MODEL_NOTICES)[number];

const DONE_TEXT: Readonly<Record<Exclude<ModelNotice, ModelProblem>, string>> = {
  proposed: 'The model’s proposal is recorded. Verify each field against its cited page; nothing prices until you approve every field and the practice signs the version off.',
  rejected: 'The proposal is discarded: its records not yet verified were removed.',
  drafted: 'The model’s narrative is written as a new version, checked by the verifier. Edit it as any version; a second person approves it.',
  suggested: 'The model’s checklist is below. Keep the items that apply.',
  kept: 'The checklist keeps the items you checked.',
  dismissed: 'The checklist is dismissed.',
  reviewed_already: 'That was reviewed already; nothing changed.',
  no_gaps: 'Nothing is missing from coverage now, so there is nothing to ask the model about.',
};

export function isModelProblem(notice: ModelNotice): notice is ModelProblem {
  return (MODEL_PROBLEMS as readonly string[]).includes(notice);
}

/** The words for a notice. */
export function modelNoticeText(notice: ModelNotice): string {
  return isModelProblem(notice) ? MODEL_PROBLEM_TEXT[notice] : DONE_TEXT[notice];
}
