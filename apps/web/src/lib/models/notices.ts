/**
 * What a screen says about a model feature (docs/adr/0052): the reason a call proposed nothing, each
 * with hand entry as the next step, and what a model step made. Plain data, so components can show it
 * without the gateway.
 */

/** Why a model call proposed nothing. */
export const MODEL_PROBLEMS = ['off', 'budget', 'failed', 'refused', 'invalid_output', 'misstated', 'unavailable'] as const;
export type ModelProblem = (typeof MODEL_PROBLEMS)[number];

export const MODEL_PROBLEM_TEXT: Readonly<Record<ModelProblem, string>> = {
  off: 'Model features are switched off for this practice; enter it by hand.',
  budget: 'The practice has spent its model budget for today; enter it by hand, or try again tomorrow.',
  failed: 'The model did not answer (it timed out, was busy or refused); nothing was proposed. Enter it by hand, or try again.',
  refused: 'The input cannot be sent to a model as it is; enter it by hand.',
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
