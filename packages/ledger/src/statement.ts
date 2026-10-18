import { type Cents, formatCents, sumCents } from '@tp/money';

import { approvedUnproved, ratioText } from './roi';
import { LedgerError, type LedgerEntry, type ProofLevel } from './stages';

/**
 * A stored ROI statement read back (PRD 13, ROI statement: "every figure links to its entries"; PRD 5,
 * J12; test matrix LED-11): its figures recomputed from the entries it links, and its CSV, the figures
 * with each linked entry beneath its figure. A statement and its entries never change, so the
 * recomputation and the CSV are the same on every read; nothing here reads a database or a clock.
 */

/** A statement as roi_statement stores it. */
export interface StoredStatement {
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly proofLevel: ProofLevel;
  readonly feesCents: Cents;
  readonly recoveredCents: Cents;
  readonly interestCents: Cents;
  readonly approvedUnpostedCents: Cents;
  readonly actionableOpenCents: Cents;
  readonly pursuitHours: string;
  readonly links: {
    readonly recovered: readonly string[];
    readonly interest: readonly string[];
    readonly approvedUnposted: readonly string[];
    readonly actionableOpen: readonly string[];
  };
}

/** One figure, as stored and as its linked entries sum it now. */
export interface FigureCheck {
  readonly storedCents: Cents;
  readonly recomputedCents: Cents;
  /** The linked entries, in the order the statement links them. */
  readonly entries: readonly LedgerEntry[];
  readonly matches: boolean;
}

export interface StatementCheck {
  readonly recovered: FigureCheck;
  readonly interest: FigureCheck;
  readonly approvedUnposted: FigureCheck;
  /** Every entry-backed figure equals what its linked entries give. */
  readonly matches: boolean;
}

function linked(ids: readonly string[], ledger: ReadonlyMap<string, LedgerEntry>): LedgerEntry[] {
  return ids.map((id) => {
    const entry = ledger.get(id);
    if (entry === undefined) {
      throw new LedgerError('a statement links an entry the ledger does not hold');
    }
    return entry;
  });
}

function check(storedCents: Cents, entries: readonly LedgerEntry[], recomputedCents: Cents): FigureCheck {
  return { storedCents, recomputedCents, entries, matches: storedCents === recomputedCents };
}

/**
 * Recomputes a statement's entry-backed figures from the entries it links (`ledger`, the practice's
 * entries by ID, the targets of corrections among them): recovered and interest are the sums of their
 * entries; approved but not posted is, per line, what its approvals exceed its proof by.
 */
export function recomputeStatement(statement: StoredStatement, ledger: ReadonlyMap<string, LedgerEntry>): StatementCheck {
  const recovered = linked(statement.links.recovered, ledger);
  const interest = linked(statement.links.interest, ledger);
  const unposted = linked(statement.links.approvedUnposted, ledger);
  const result = {
    recovered: check(statement.recoveredCents, recovered, sumCents(recovered.map((entry) => entry.amountCents))),
    interest: check(statement.interestCents, interest, sumCents(interest.map((entry) => entry.amountCents))),
    approvedUnposted: check(statement.approvedUnpostedCents, unposted, approvedUnproved(unposted, statement.proofLevel, ledger).cents),
  };
  return { ...result, matches: result.recovered.matches && result.interest.matches && result.approvedUnposted.matches };
}

export const ROI_CSV_COLUMNS = ['figure', 'row', 'value', 'unit', 'entry_id', 'case_id', 'stage', 'effective_on', 'allocated'] as const;

/** A CSV field: quoted where it holds a comma, a quote or a line break, a quote doubled inside. */
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function row(cells: readonly string[]): string {
  return cells.map(csvField).join(',');
}

function total(figure: string, value: string, unit: string): string {
  return row([figure, 'total', value, unit, '', '', '', '', '']);
}

function entryRows(figure: string, entries: readonly LedgerEntry[]): string[] {
  return entries.map((entry) => row([figure, 'entry', formatCents(entry.amountCents), 'usd', entry.id, entry.caseId, entry.stage, entry.effectiveOn, entry.allocated ? 'true' : 'false']));
}

/**
 * The statement as CSV (RFC 4180, CRLF): each figure's total row, and beneath the entry-backed ones
 * their linked entries (amount, entry, case, stage, date, allocated); beneath actionable, its open
 * cases. Opaque IDs, codes, dates and amounts only. Fees are billing's and the ratio is empty without
 * fees.
 */
export function roiStatementCsv(statement: StoredStatement, ledger: ReadonlyMap<string, LedgerEntry>): string {
  const recomputed = recomputeStatement(statement, ledger);
  const ratio = ratioText(statement.recoveredCents, statement.feesCents);
  const lines = [
    row(ROI_CSV_COLUMNS),
    total('period_from', statement.periodFrom, 'date'),
    total('period_to', statement.periodTo, 'date'),
    total('proof_level', statement.proofLevel, 'stage'),
    total('fees_paid', formatCents(statement.feesCents), 'usd'),
    total('recovered', formatCents(statement.recoveredCents), 'usd'),
    ...entryRows('recovered', recomputed.recovered.entries),
    total('interest', formatCents(statement.interestCents), 'usd'),
    ...entryRows('interest', recomputed.interest.entries),
    total('approved_unposted', formatCents(statement.approvedUnpostedCents), 'usd'),
    ...entryRows('approved_unposted', recomputed.approvedUnposted.entries),
    total('actionable_open', formatCents(statement.actionableOpenCents), 'usd'),
    ...statement.links.actionableOpen.map((caseId) => row(['actionable_open', 'case', '', '', '', caseId, '', '', ''])),
    total('pursuit_hours', statement.pursuitHours, 'hours'),
    total('recovered_to_fees', ratio ?? '', 'ratio'),
  ];
  return `${lines.join('\r\n')}\r\n`;
}
