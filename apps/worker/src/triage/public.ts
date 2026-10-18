/**
 * Triage as the web app's workbench uses it (@tp/worker/triage; PRD 5, J8; PRD 7, Cases): the payer
 * patterns waiting for a case and opening a case on a ready one, in the person's own scope, judged as
 * the triage job judges lines. Triaging a run is the worker's (the triage job).
 */
export { type OpenOnPatternOutcome, type WaitingPattern, type WaitingPatterns, type WaitingStatus, openCaseOnPattern, waitingPatterns } from './patterns';
export { todayUtc } from './execute';
