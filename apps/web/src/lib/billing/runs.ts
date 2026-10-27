/**
 * The routes that start new work (PRD 5, J18: a suspended organization's "new runs" stop "while leaving
 * data readable"; PRD 6, Billing acceptance: "a suspended organization can read but not run"; docs/adr/0050):
 * a pricing run or a re-run, triage, an audit report, a coverage report or monthly summary, an ROI
 * statement, a packet export, and an upload (which starts the monitoring chain) or its retry. The route
 * wrapper asks the database before any of these runs, with the route's permission
 * (practice_run_refusal_for; docs/adr/0080): the owner's hold refuses everyone, and a suspended or closed
 * grantee's hold refuses a person the work only its grants let them do. It refuses with the database's
 * reason. The database refuses the same work again where a person records it (the trigger tables); triage,
 * a packet export and an upload's retry only queue the practice's job, so for a grantee's hold the
 * wrapper's refusal is the only one (D18). Every other route, every read among them, is never refused.
 * A test holds each ID to a registered practice route, and the route tests hold every route that queues
 * work a person starts to this list or to CONTINUES_STARTED_WORK.
 */
export const RUN_STARTING_ROUTES: ReadonlySet<string> = new Set([
  'practice.pricing_runs.create',
  'practice.pricing_runs.rerun',
  'practice.cases.triage',
  'practice.reports.generate',
  'practice.reports.documents.generate',
  'practice.reports.roi.generate',
  'practice.cases.packet.export',
  'practice.uploads.request',
  'practice.uploads.retry',
]);

/**
 * The routes that queue the job of work a run-starting route already started, so they are not asked again: an upload's
 * completion queues intake for the files its request route gated (practice.uploads.request). The route tests read it.
 */
export const CONTINUES_STARTED_WORK: ReadonlySet<string> = new Set(['practice.uploads.complete']);

/** The route was refused: the practice's organization may not start new work now. The reason is the database's. */
export class SuspendedError extends Error {
  override readonly name = 'SuspendedError';
}
