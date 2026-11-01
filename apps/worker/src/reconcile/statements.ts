import { recordAuditEvent, requirePracticePermission } from '@tp/db/runtime';
import { type LedgerEntry, type LedgerTotals, type ProofLevel, type RoiStatement, caseEntries, entriesById, ledgerTotals, periodEntries, roiStatement } from '@tp/ledger';
import { type Cents, ZERO_CENTS, parseCents } from '@tp/money';

import { PAID_INVOICE_FEES } from '../billing/fees';
import { ACTIONABLE_NOW } from '../triage/actionable-now';
import { type Scope, ledgerEntries, practiceLedgerSettings } from './ledger';

/**
 * Ledger totals and the ROI statement from entries (PRD 13, Entries and ROI statement; PRD 5, J12; test
 * matrix LED-11). "Recovered" for a case, a practice, a period or a report is computed from entries here
 * and nowhere else: the proof level's stage plus recoupments, net of reversals; approved, the other
 * proof stage and interest are their own figures, never in it.
 */

/** Fees paid to the product in a period: billing's, from the practice's group's paid invoices (docs/adr/0050). */
export interface FeeSource {
  feesPaid(scope: Scope, practiceId: string, from: string, to: string): Promise<Cents>;
}

/** No fees at all: the statement then says no ratio can be given (tests that leave billing out). */
export const NO_BILLING: FeeSource = { feesPaid: () => Promise.resolve(ZERO_CENTS) };

/** Pursuit hours logged in a period: the cases' time log; none is kept yet, so none are logged. */
export interface PursuitHoursSource {
  hoursLogged(scope: Scope, practiceId: string, from: string, to: string): Promise<string>;
}

export const NO_TIME_LOG: PursuitHoursSource = { hoursLogged: () => Promise.resolve('0.00') };

export interface StatementSources {
  readonly fees: FeeSource;
  readonly pursuitHours: PursuitHoursSource;
}

export const DEFAULT_STATEMENT_SOURCES: StatementSources = { fees: PAID_INVOICE_FEES, pursuitHours: NO_TIME_LOG };

/** The practice's ledger totals, for its cases named (all by default) and the period named (all time by default). */
export async function practiceLedgerTotals(scope: Scope, practiceId: string, filter: { readonly caseIds?: readonly string[]; readonly from?: string; readonly to?: string } = {}): Promise<LedgerTotals> {
  const all = await ledgerEntries(scope, practiceId);
  const { proofLevel } = await practiceLedgerSettings(scope, practiceId);
  const byCase = filter.caseIds === undefined ? all : filter.caseIds.flatMap((caseId) => caseEntries(all, caseId));
  const inPeriod = periodEntries(byCase, filter.from ?? '0001-01-01', filter.to ?? '9999-12-31');
  return ledgerTotals(inPeriod, proofLevel, entriesById(all));
}

/**
 * Recovered over two periods from one ledger: to date and a period (the practice home's tile, "to date"
 * and "this quarter"; docs/adr/0082).
 */
export interface RecoveredPeriods {
  /** Every entry's totals: recovered to date, payer approved, and the rest. */
  readonly toDate: LedgerTotals;
  /** The period's entries' totals, their corrections' targets found in the whole ledger (as practiceLedgerTotals reads a period). */
  readonly period: LedgerTotals;
  /** The earliest date of the entries recovered to date sums (toDate.entryIds.recovered), never an approval's; null when it sums none. */
  readonly firstOn: string | null;
}

/**
 * Recovered to date and over `from` to `to` (calendar dates, both included) from the practice's whole
 * ledger `all` (in ledger order), at `proofLevel`: the same totals practiceLedgerTotals gives for all time
 * and for the period, read from one set of entries. A reversal inside the period of an entry before it
 * finds its target in the whole ledger, so it nets the period as it nets the practice's period total.
 */
export function recoveredPeriods(all: readonly LedgerEntry[], proofLevel: ProofLevel, period: { readonly from: string; readonly to: string }): RecoveredPeriods {
  const ledger = entriesById(all);
  const toDate = ledgerTotals(all, proofLevel, ledger);
  const counted = new Set(toDate.entryIds.recovered);
  // Calendar dates compare as text.
  const firstOn = all.reduce<string | null>((first, entry) => (counted.has(entry.id) && (first === null || entry.effectiveOn < first) ? entry.effectiveOn : first), null);
  return { toDate, period: ledgerTotals(periodEntries(all, period.from, period.to), proofLevel, ledger), firstOn };
}

/** The practice's recovered to date and over the period, from one read of its ledger and its proof level (recoveredPeriods). */
export async function practiceRecoveredPeriods(scope: Scope, practiceId: string, period: { readonly from: string; readonly to: string }): Promise<RecoveredPeriods> {
  const all = await ledgerEntries(scope, practiceId);
  const { proofLevel } = await practiceLedgerSettings(scope, practiceId);
  return recoveredPeriods(all, proofLevel, period);
}

export interface GeneratedStatement {
  readonly statementId: string;
  readonly statement: RoiStatement;
}

interface OpenCaseRow {
  readonly id: string;
  readonly actionable_cents: string;
}

/**
 * The cases still being worked (any not resolved or closed, as the practice home and Cases count them) with
 * each one's live figure (ACTIONABLE_NOW: its lines still actionable on their pricing in effect; docs/adr/
 * 0082), never the case's stored ask. An input to roiStatement(), which sums it as the statement's
 * actionable figure for open cases.
 */
export const OPEN_CASES_ACTIONABLE = `SELECT c.id, ${ACTIONABLE_NOW('c')}::text AS actionable_cents
       FROM "case" c
      WHERE c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id`;

/**
 * Generates an ROI statement for the practice and period from its entries and stores it with the
 * entries each figure sums: on demand by a person who reconciles postings (in their own name, audited),
 * or quarterly by the reconcile job (once per quarter; null when that quarter's statement exists).
 */
export async function generateRoiStatement(
  scope: Scope,
  input: { readonly practiceId: string; readonly periodFrom: string; readonly periodTo: string; readonly requestId: string },
  sources: StatementSources = DEFAULT_STATEMENT_SOURCES,
): Promise<GeneratedStatement | null> {
  const { practiceId, periodFrom, periodTo } = input;
  const person = scope.kind === 'practice';
  if (person) {
    requirePracticePermission(scope, practiceId, 'posting.reconcile');
  }
  const { proofLevel } = await practiceLedgerSettings(scope, practiceId);
  const { rows: open } = await scope.client.query<OpenCaseRow>(OPEN_CASES_ACTIONABLE, [practiceId]);
  const statement = roiStatement({
    periodFrom,
    periodTo,
    proofLevel,
    entries: await ledgerEntries(scope, practiceId),
    feesCents: await sources.fees.feesPaid(scope, practiceId, periodFrom, periodTo),
    pursuitHours: await sources.pursuitHours.hoursLogged(scope, practiceId, periodFrom, periodTo),
    openCases: open.map((row) => ({ caseId: row.id, actionableCents: parseCents(row.actionable_cents) })),
  });
  const links = { recovered: statement.links.recovered, interest: statement.links.interest, approved_unposted: statement.links.approvedUnposted, actionable_open: statement.links.actionableOpen };
  const { rows } = await scope.client.query<{ id: string }>(
    `INSERT INTO roi_statement (practice_id, period_from, period_to, proof_level, fees_cents, recovered_cents, interest_cents, approved_unposted_cents, actionable_open_cents, pursuit_hours, links, generated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (practice_id, period_from, period_to) WHERE generated_by IS NULL DO NOTHING
     RETURNING id`,
    [
      practiceId,
      periodFrom,
      periodTo,
      proofLevel,
      statement.feesCents.toString(),
      statement.recoveredCents.toString(),
      statement.interestCents.toString(),
      statement.approvedUnpostedCents.toString(),
      statement.actionableOpenCents.toString(),
      statement.pursuitHours,
      JSON.stringify(links),
      person ? scope.actorId : null,
    ],
  );
  const statementId = rows[0]?.id;
  if (statementId === undefined) {
    return null;
  }
  if (person) {
    await recordAuditEvent(scope, { action: 'roi_statement_generated', objectType: 'roi_statement', objectId: statementId, practiceId, requestId: input.requestId });
  }
  return { statementId, statement };
}
