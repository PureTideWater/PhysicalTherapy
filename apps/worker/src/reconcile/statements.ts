import type { RoiLinks } from '@tp/db';
import { recordAuditEvent, requirePracticePermission } from '@tp/db/runtime';
import { type LedgerEntry, type LedgerTotals, type ProofLevel, type RoiStatement, caseEntries, entriesById, ledgerTotals, periodEntries, roiStatement } from '@tp/ledger';
import { type Cents, ZERO_CENTS, parseCents } from '@tp/money';

import { PAID_INVOICE_FEES } from '../billing/fees';
import { ACTIONABLE_NOW_WITH_LINES } from '../triage/actionable-now';
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

/** Which entries a total reads: the cases named (all by default) and the period named (all time by default), calendar dates, both included. */
export interface LedgerTotalsFilter {
  readonly caseIds?: readonly string[];
  readonly from?: string;
  readonly to?: string;
}

/**
 * The totals of the practice's whole ledger `all` (in ledger order) at `proofLevel`, over the cases and
 * period `filter` names: the entries of those cases dated in the period, their corrections' targets found
 * in the whole ledger, so a reversal inside the period of an entry before it nets the period. The one
 * composition practiceLedgerTotals and recoveredPeriods both read, so the home's tile and every other
 * figure of a period total the same entries the same way.
 */
export function ledgerTotalsOver(all: readonly LedgerEntry[], proofLevel: ProofLevel, filter: LedgerTotalsFilter = {}): LedgerTotals {
  const byCase = filter.caseIds === undefined ? all : filter.caseIds.flatMap((caseId) => caseEntries(all, caseId));
  const inPeriod = periodEntries(byCase, filter.from ?? '0001-01-01', filter.to ?? '9999-12-31');
  return ledgerTotals(inPeriod, proofLevel, entriesById(all));
}

/** The practice's ledger totals, for its cases named (all by default) and the period named (all time by default): ledgerTotalsOver its ledger. */
export async function practiceLedgerTotals(scope: Scope, practiceId: string, filter: LedgerTotalsFilter = {}): Promise<LedgerTotals> {
  const all = await ledgerEntries(scope, practiceId);
  const { proofLevel } = await practiceLedgerSettings(scope, practiceId);
  return ledgerTotalsOver(all, proofLevel, filter);
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
  /**
   * The earliest date of the entries recovered to date sums (toDate.entryIds.recovered) that still stand:
   * an original entry, never a reversal or an adjustment, and never one reversed since (a wrong match
   * undone). Never an approval's. Null when none stands, so a ledger whose recoveries were all reversed
   * reads nothing recovered yet, not a date.
   */
  readonly firstOn: string | null;
}

/**
 * Recovered to date and over `from` to `to` (calendar dates, both included) from the practice's whole
 * ledger `all` (in ledger order), at `proofLevel`: ledgerTotalsOver for all time and for the period, the
 * totals practiceLedgerTotals gives, read from one set of entries; and the first date a recovery that
 * still stands was made (RecoveredPeriods.firstOn).
 */
export function recoveredPeriods(all: readonly LedgerEntry[], proofLevel: ProofLevel, period: { readonly from: string; readonly to: string }): RecoveredPeriods {
  const toDate = ledgerTotalsOver(all, proofLevel);
  const counted = new Set(toDate.entryIds.recovered);
  const reversedIds = new Set(all.filter((entry) => entry.stage === 'reversed').map((entry) => entry.evidenceId));
  const standing = (entry: LedgerEntry) => counted.has(entry.id) && entry.stage !== 'reversed' && entry.stage !== 'adjusted' && !reversedIds.has(entry.id);
  // Calendar dates compare as text.
  const firstOn = all.filter(standing).reduce<string | null>((first, entry) => (first === null || entry.effectiveOn < first ? entry.effectiveOn : first), null);
  return { toDate, period: ledgerTotalsOver(all, proofLevel, period), firstOn };
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
  /** The priced lines the figure sums, in ID order. */
  readonly line_ids: readonly string[];
}

/**
 * The cases still being worked (any not resolved or closed, as the practice home and Cases count them) with
 * each one's live figure (as ACTIONABLE_NOW: its lines still actionable on their pricing in effect; docs/adr/
 * 0082), never the case's stored ask. An input to roiStatement(), which sums it as the statement's
 * actionable figure for open cases. Beside each figure, the priced lines it sums. Both come from one pass over the
 * case's lines (ACTIONABLE_NOW_WITH_LINES: the same rows and the one predicate, each line read once), in this one
 * statement, so one snapshot; a line that moves on between two queries could otherwise make a correct statement's
 * figure and list disagree and the database refuse it. The tests hold the figure equal to ACTIONABLE_NOW's, a query of
 * its own, for every case (statement-lines.db.test.ts, statement-paths.db.test.ts).
 */
export const OPEN_CASES_ACTIONABLE = `SELECT c.id, a.cents::text AS actionable_cents, a.line_ids
       FROM "case" c
      CROSS JOIN LATERAL ${ACTIONABLE_NOW_WITH_LINES('c')} a
      WHERE c.practice_id = $1 AND c.state NOT IN ('resolved', 'closed_written_off')
      ORDER BY c.opened_at, c.id`;

/**
 * Generates an ROI statement for the practice and period from its entries and stores it with the
 * entries each figure sums and the priced lines its actionable figure counted: on demand by a person who reconciles postings (in their own name, audited),
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
  // The lines the actionable figure counted: those of exactly the cases the statement links, in the cases' order. No
  // figure is computed here; the database checks the statement's figure against these lines (roi_statement_rules()).
  const lineIds = new Map(open.map((row) => [row.id, row.line_ids]));
  const links: RoiLinks = {
    recovered: statement.links.recovered,
    interest: statement.links.interest,
    approved_unposted: statement.links.approvedUnposted,
    actionable_open: statement.links.actionableOpen,
    actionable_open_lines: statement.links.actionableOpen.flatMap((caseId) => lineIds.get(caseId) ?? []),
  };
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
