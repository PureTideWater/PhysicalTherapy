import { type Cents, ZERO_CENTS } from '@tp/money';

import { type LedgerEntry, type ProofLevel, countedStage, isCorrecting } from './stages';
import { ledgerTotals } from './totals';

/**
 * Whether a report's recovered total reconciles to cash (docs/adr/0057; docs/brand/BRAND.md, section 6):
 * the one fact the "Verified by PaidWhole" seal and badge render from. It is derived from the ledger,
 * never typed:
 *
 * - the report must state a recovered total above zero (a report with none, or with nothing recovered,
 *   does not earn the mark: flagged, validated, actionable and payer approved amounts never do);
 * - every entry the total links must be in the practice's ledger, linked once, and count toward the proof
 *   level's stage (posted or deposited, the practice's setting the report was made under) or a recoupment of it;
 * - no linked entry may have been corrected since the report was made: a reversal or adjustment in the
 *   ledger whose target is a linked entry must be linked too (a correction takes the effective date of the
 *   entry it corrects, so one made at the time is in the report's period and in its links; one that is not
 *   linked was made later, and the cash the links give is no longer what the ledger holds for that line);
 * - those entries, net of their reversals and adjustments, must sum to exactly the total the report states;
 * - every line in the total (by service line, or by case for an entry of the case as a whole) must have a
 *   posted or deposited amount standing, net of its recoupments and reversals: a line whose entries net to
 *   zero adds nothing and is not in the total; a line whose recoupments exceed its proof, or with no proof
 *   at all among the linked entries, refuses the mark.
 *
 * The result names its source, so the page or PDF that shows the mark says where the fact came from.
 */

declare const ledgerFact: unique symbol;

/**
 * `true`, as only reportReconciliation returns it. The Verified seal and badge take `false | ReconciledToCash`,
 * so a literal `true` does not typecheck: the mark renders only from the ledger's answer.
 */
export type ReconciledToCash = true & { readonly [ledgerFact]: 'ledger' };

export const RECONCILIATION_REASONS = [
  'reconciled',
  'no_recovered_total',
  'entry_not_in_ledger',
  'duplicate_entry',
  'entry_not_cash',
  'entry_corrected_since',
  'total_differs',
  'line_not_proved',
  'figures_differ',
] as const;
export type ReconciliationReason = (typeof RECONCILIATION_REASONS)[number];

export interface ReportReconciliation {
  readonly reconciledToCash: false | ReconciledToCash;
  /** Where the fact came from, for the audit trail: "ledger.reportReconciliation(<report kind> <report ID>)". */
  readonly source: string;
  readonly reason: ReconciliationReason;
  readonly proofLevel: ProofLevel;
  /** What the linked entries give, net (zero when an entry is missing or is not cash). */
  readonly recoveredCents: Cents;
  /** The lines (or cases, for an entry of a case as a whole) whose entries add to the total. */
  readonly lines: number;
}

export interface ReportReconciliationInput {
  /** The report the mark would sit on: its kind and opaque ID (never a patient or claim identifier). */
  readonly report: { readonly kind: string; readonly id: string };
  /** The proof level the report's recovered total is stated under. */
  readonly proofLevel: ProofLevel;
  /** The recovered total the report states; null when it states none (a coverage report, a packet). */
  readonly statedRecoveredCents: Cents | null;
  /** The ledger entries the recovered total sums (the report's links), in ledger order. */
  readonly recoveredEntryIds: readonly string[];
  /** The practice's ledger by ID, the targets of corrections included. */
  readonly ledger: ReadonlyMap<string, LedgerEntry>;
  /**
   * Whether the report's other entry-backed figures still recompute from their entries (an ROI statement's
   * interest and approved-but-not-posted, recomputeStatement's `matches`). A report whose figures do not
   * match its entries is not printed and never carries the mark. Defaults to true for a report with none.
   */
  readonly figuresMatch?: boolean;
}

/** The source a reconciliation names for a report. */
export function reconciliationSource(report: ReportReconciliationInput['report']): string {
  return `ledger.reportReconciliation(${report.kind} ${report.id})`;
}

export function reportReconciliation(input: ReportReconciliationInput): ReportReconciliation {
  const { proofLevel, ledger } = input;
  const source = reconciliationSource(input.report);
  const refused = (reason: Exclude<ReconciliationReason, 'reconciled'>, recovered: Cents = ZERO_CENTS, lines = 0): ReportReconciliation => ({
    reconciledToCash: false,
    source,
    reason,
    proofLevel,
    recoveredCents: recovered,
    lines,
  });

  const entries: LedgerEntry[] = [];
  for (const id of input.recoveredEntryIds) {
    const entry = ledger.get(id);
    if (entry === undefined) {
      return refused('entry_not_in_ledger');
    }
    entries.push(entry);
  }
  // An entry linked twice would be counted twice.
  const linked = new Set(input.recoveredEntryIds);
  if (linked.size !== input.recoveredEntryIds.length) {
    return refused('duplicate_entry');
  }
  // Each entry's stage as the totals count it: a reversal or adjustment counts toward the entry it corrects.
  const stages = entries.map((entry) => countedStage(entry, ledger));
  if (stages.some((stage) => stage !== proofLevel && stage !== 'recouped')) {
    return refused('entry_not_cash');
  }

  const groups = new Map<string, { proved: bigint; recouped: bigint }>();
  entries.forEach((entry, index) => {
    const key = entry.serviceLineId ?? `case:${entry.caseId}`;
    const group = groups.get(key) ?? { proved: 0n, recouped: 0n };
    if (stages[index] === 'recouped') {
      group.recouped += entry.amountCents;
    } else {
      group.proved += entry.amountCents;
    }
    groups.set(key, group);
  });
  const inTotal = [...groups.values()].filter((group) => group.proved + group.recouped !== 0n);
  const recovered = ledgerTotals(entries, proofLevel, ledger).recoveredCents;

  const stated = input.statedRecoveredCents;
  if (stated === null || stated <= ZERO_CENTS) {
    return refused('no_recovered_total', recovered, inTotal.length);
  }
  // A reversal or adjustment of a linked entry that the report does not link: the ledger changed after the
  // report was made (a reversal of an adjustment names the adjustment, which is then itself such a correction
  // or linked, so the entry a correction names directly is the one to look at).
  for (const entry of ledger.values()) {
    if (isCorrecting(entry.stage) && linked.has(entry.evidenceId) && !linked.has(entry.id)) {
      return refused('entry_corrected_since', recovered, inTotal.length);
    }
  }
  if (recovered !== stated) {
    return refused('total_differs', recovered, inTotal.length);
  }
  if (inTotal.some((group) => group.proved <= 0n || group.proved + group.recouped < 0n)) {
    return refused('line_not_proved', recovered, inTotal.length);
  }
  if (input.figuresMatch === false) {
    return refused('figures_differ', recovered, inTotal.length);
  }
  return { reconciledToCash: true as ReconciledToCash, source, reason: 'reconciled', proofLevel, recoveredCents: recovered, lines: inTotal.length };
}
