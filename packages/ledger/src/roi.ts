import { type Cents, ZERO_CENTS, cents, formatCents, negateCents, sumCents } from '@tp/money';

import { LedgerError, type LedgerEntry, type ProofLevel } from './stages';
import { approvedNotProved, entriesById, ledgerTotals, lineFigures, periodEntries } from './totals';

/**
 * The ROI statement (PRD 13, ROI statement: "quarterly and on demand per practice: fees paid to the
 * product in the period; recovered principal and interest, net; approved but not yet posted;
 * actionable in open cases; pursuit hours logged; the ratio of net recovered to fees. Every figure
 * links to its entries"; PRD 5, J12; test matrix LED-11). Computed from entries only, so a test
 * recomputes it from the ledger.
 */

export interface OpenCase {
  readonly caseId: string;
  readonly actionableCents: Cents;
}

export interface RoiInput {
  /** Calendar dates, both included. */
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly proofLevel: ProofLevel;
  /** Every entry of the practice, in ledger order (the targets of corrections included). */
  readonly entries: readonly LedgerEntry[];
  /** Fees paid to the product in the period (billing's; zero until billing is wired). */
  readonly feesCents: Cents;
  /** Pursuit hours logged in the period, numeric(9,2) text. */
  readonly pursuitHours: string;
  /** The practice's open cases and their actionable totals when the statement is generated. */
  readonly openCases: readonly OpenCase[];
}

export interface RoiStatement {
  readonly periodFrom: string;
  readonly periodTo: string;
  /** The stage recovered is proved by; "posted" says the practice supplies no deposit data. */
  readonly proofLevel: ProofLevel;
  readonly feesCents: Cents;
  /** Recovered principal in the period, net of recoupments and reversals. */
  readonly recoveredCents: Cents;
  /** Interest the payer paid in the period, net: its own category, never in recovered. */
  readonly interestCents: Cents;
  /** Approved by the period's end and not yet at the proof level. */
  readonly approvedUnpostedCents: Cents;
  readonly actionableOpenCents: Cents;
  readonly pursuitHours: string;
  /** Net recovered over fees, two places rounded half up; null when no fees were paid. */
  readonly recoveredToFees: string | null;
  /** The entries (and, for actionable, the cases) each figure sums. */
  readonly links: {
    readonly recovered: readonly string[];
    readonly interest: readonly string[];
    readonly approvedUnposted: readonly string[];
    readonly actionableOpen: readonly string[];
  };
}

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HOURS = /^(0|[1-9]\d{0,6})\.\d{2}$/;

/** The ratio of net recovered to fees as text with two places, rounded half up away from zero; null without fees. */
export function ratioText(recovered: Cents, fees: Cents): string | null {
  if (fees <= ZERO_CENTS) {
    return null;
  }
  const negative = recovered < ZERO_CENTS;
  const magnitude = negative ? negateCents(recovered) : recovered;
  // In hundredths: magnitude * 100 / fees, half up.
  const hundredths = (2n * magnitude * 100n + fees) / (2n * fees);
  return formatCents(cents(negative ? -hundredths : hundredths));
}

/**
 * What is approved and not yet proved, per line (or per case for a case's own approval), net of what
 * recoupments took back (approvedNotProved: max(0, approved + recouped - proved)), and the entries of
 * the lines (or cases) still open: the statement's "approved but not yet posted", and its recomputation
 * from the entries it links.
 */
export function approvedUnproved(entries: readonly LedgerEntry[], proofLevel: ProofLevel, ledger: ReadonlyMap<string, LedgerEntry>): { readonly cents: Cents; readonly links: string[] } {
  const open = [...lineFigures(entries, proofLevel, ledger).values()].filter((line) => approvedNotProved(line) > ZERO_CENTS);
  return { cents: sumCents(open.map(approvedNotProved)), links: open.flatMap((line) => [...line.entryIds]) };
}

export function roiStatement(input: RoiInput): RoiStatement {
  const { periodFrom, periodTo, proofLevel, feesCents, pursuitHours } = input;
  if (!CALENDAR_DATE.test(periodFrom) || !CALENDAR_DATE.test(periodTo) || periodFrom > periodTo) {
    throw new LedgerError('an ROI statement covers a period of calendar dates, its start not after its end');
  }
  if (feesCents < ZERO_CENTS || !HOURS.test(pursuitHours)) {
    throw new LedgerError('fees are zero or more and pursuit hours are hours with two places');
  }
  const ledger = entriesById(input.entries);
  const period = ledgerTotals(periodEntries(input.entries, periodFrom, periodTo), proofLevel, ledger);
  const unproved = approvedUnproved(
    input.entries.filter((entry) => entry.effectiveOn <= periodTo),
    proofLevel,
    ledger,
  );
  return {
    periodFrom,
    periodTo,
    proofLevel,
    feesCents,
    recoveredCents: period.recoveredCents,
    interestCents: period.interestCents,
    approvedUnpostedCents: unproved.cents,
    actionableOpenCents: sumCents(input.openCases.map((item) => item.actionableCents)),
    pursuitHours,
    recoveredToFees: ratioText(period.recoveredCents, feesCents),
    links: {
      recovered: period.entryIds.recovered,
      interest: period.entryIds.interest,
      approvedUnposted: unproved.links,
      actionableOpen: input.openCases.map((item) => item.caseId),
    },
  };
}

/** The calendar quarter a period key names ("2026-Q2" is 2026-04-01 to 2026-06-30). */
export function quarterPeriod(quarter: string): { readonly from: string; readonly to: string } {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (match === null) {
    throw new LedgerError('a quarter is written YYYY-Qn');
  }
  const year = match[1] as string;
  const bounds = { '1': ['01-01', '03-31'], '2': ['04-01', '06-30'], '3': ['07-01', '09-30'], '4': ['10-01', '12-31'] } as const;
  const [from, to] = bounds[match[2] as '1' | '2' | '3' | '4'];
  return { from: `${year}-${from}`, to: `${year}-${to}` };
}

/** The year and quarter (1 to 4) a calendar date falls in. */
function yearAndQuarter(day: string): { readonly year: bigint; readonly quarter: bigint } {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(day);
  if (match === null) {
    throw new LedgerError('a day is written YYYY-MM-DD');
  }
  return { year: BigInt(match[1] as string), quarter: (BigInt(match[2] as string) - 1n) / 3n + 1n };
}

/** The quarter a calendar date falls in ("2026-10-16" is "2026-Q4"): the dashboard's "recovered this quarter". */
export function quarterOf(day: string): string {
  const { year, quarter } = yearAndQuarter(day);
  return `${year.toString()}-Q${quarter.toString()}`;
}

/** The quarter before the one a calendar date falls in: the quarter a statement generated on that date reports. */
export function previousQuarter(day: string): string {
  const { year, quarter } = yearAndQuarter(day);
  return quarter === 1n ? `${(year - 1n).toString()}-Q4` : `${year.toString()}-Q${(quarter - 1n).toString()}`;
}
