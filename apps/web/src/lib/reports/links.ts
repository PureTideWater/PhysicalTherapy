/**
 * Where a report's figure links (PRD 6, Reports and exports: "every report total links to a stage";
 * PRD 7, Practice dashboard: every number links to the stage it came from; J12): a stage's line count
 * to Claims and lines filtered to the lines at that stage now (and the month, for a month's figure), a
 * stage's case dollars to Cases, and the ledger's dollars (payer approved, recovered) to Reconciliation.
 * Opaque IDs and codes only. Plain functions: safe to import anywhere.
 */

export type StageCode = 'flagged' | 'validated' | 'actionable' | 'payer_approved' | 'recovered';

/** The lines at a stage now, on Claims and lines; within one month of service when one is named. */
export function stageLinesHref(practiceId: string, stage: StageCode, month?: string): string {
  const query = new URLSearchParams({ stage });
  if (month !== undefined) {
    query.set('from', month);
    query.set('to', month);
  }
  return `/p/${practiceId}/claims?${query.toString()}`;
}

/** A month's lines with no stage (priced, overpaid, unpriced, not priced yet), on Claims and lines. */
export function monthLinesHref(practiceId: string, month: string): string {
  return `/p/${practiceId}/claims?${new URLSearchParams({ from: month, to: month }).toString()}`;
}

/** Where a stage's dollars come from: the cases for actionable, the recovery ledger for payer approved and recovered, the lines otherwise. */
export function stageDollarsHref(practiceId: string, stage: StageCode): string {
  switch (stage) {
    case 'actionable':
      return `/p/${practiceId}/cases`;
    case 'payer_approved':
    case 'recovered':
      return `/p/${practiceId}/reconciliation`;
    case 'flagged':
      return `/p/${practiceId}/anomalies`;
    case 'validated':
      return stageLinesHref(practiceId, 'validated');
  }
}
