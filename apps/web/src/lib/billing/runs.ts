/**
 * The routes that start new work (PRD 5, J18: a suspended organization's "new runs" stop "while leaving
 * data readable"; PRD 6, Billing acceptance: "a suspended organization can read but not run"; docs/adr/0050):
 * a pricing run or a re-run, triage, an audit report, a coverage report or monthly summary, an ROI
 * statement, a packet export, and an upload (which starts the monitoring chain) or its retry. The route
 * wrapper asks the database (practice_run_refusal) before any of these runs and refuses with its reason;
 * the database refuses the same work again where it is recorded, and every other route, every read
 * among them, is never refused. A test holds each ID to a registered practice route.
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

/** The route was refused: the practice's organization may not start new work now. The reason is the database's. */
export class SuspendedError extends Error {
  override readonly name = 'SuspendedError';
}
