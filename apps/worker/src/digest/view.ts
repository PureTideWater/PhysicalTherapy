import { type Cents, centsToString, formatUsd, parseCents, sumCents } from '@tp/money';
import { z } from 'zod';

/**
 * The monthly digest's figures and how they read (PRD 5, J11: "a digest email with counts and dollar
 * totals only (no PHI): new validated variance by payer, cases nearing deadline, recoveries posted,
 * coverage changes, contracts expiring"; PRD 6 acceptance: "a digest contains counts and totals only";
 * test matrix JOB-03; docs/adr/0039). Pure: the digest job stores the figures in digest.counts and
 * digest.totals_cents, the email is these sentences and a link, and the digest's page in the
 * application shows the same sentences with the payers named (names live only in the application).
 *
 * Counts are integers; totals are integer cents as text; "by payer" is keyed by the payer's opaque ID.
 * The previous digest's coverage is carried in each digest, so a coverage change reads from one row.
 */

/** "Cases nearing deadline": open cases whose deadline falls within this many days of the digest's day (PRD 7: "deadlines in 14 days"). */
export const DEADLINE_DAYS = 14;
/** "Contracts expiring": signed-off versions that end within this many days with no signed-off successor. */
export const CONTRACT_EXPIRY_DAYS = 90;

const count = z.number().int().nonnegative();
const cents = z.string().regex(/^-?(?:0|[1-9]\d{0,17})$/);
const byPayer = <T extends z.ZodType>(value: T) => z.record(z.uuid(), value);

export const digestCountsSchema = z.strictObject({
  validated_lines: count,
  validated_payers: count,
  validated_lines_by_payer: byPayer(count),
  cases_nearing_deadline: count,
  recoveries_posted: count,
  coverage_lines: count,
  coverage_priced_lines: count,
  previous_coverage_lines: count.optional(),
  previous_coverage_priced_lines: count.optional(),
  contracts_expiring: count,
});

export const digestTotalsSchema = z.strictObject({
  validated_variance: cents,
  validated_variance_by_payer: byPayer(cents),
  cases_nearing_deadline_actionable: cents,
  recovered: cents,
  coverage_billed: cents,
  coverage_priced_billed: cents,
  previous_coverage_billed: cents.optional(),
  previous_coverage_priced_billed: cents.optional(),
});

export type DigestCounts = z.infer<typeof digestCountsSchema>;
export type DigestTotals = z.infer<typeof digestTotalsSchema>;

export interface DigestFigures {
  readonly counts: DigestCounts;
  readonly totals: DigestTotals;
}

/** Reads stored figures; throws a ZodError naming the field that fails. */
export function parseDigestFigures(counts: unknown, totals: unknown): DigestFigures {
  return { counts: digestCountsSchema.parse(counts), totals: digestTotalsSchema.parse(totals) };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** "October 2026" for "2026-10". */
export function monthName(period: string): string {
  const [year, month] = period.split('-');
  return `${MONTHS[Number.parseInt(month ?? '1', 10) - 1] ?? ''} ${year ?? ''}`;
}

/** The calendar month after `period` began on or before `day`: the month has ended. */
export function periodEnded(period: string, day: string): boolean {
  return `${period}-01` < `${day.slice(0, 7)}-01`;
}

/** The month before the one `day` falls in ("2026-10" for any day of November 2026). */
export function previousMonth(day: string): string {
  const year = Number.parseInt(day.slice(0, 4), 10);
  const month = Number.parseInt(day.slice(5, 7), 10);
  return month === 1 ? `${String(year - 1)}-12` : `${String(year)}-${String(month - 1).padStart(2, '0')}`;
}

/** A share in tenths of a percent, rounded half up, from integers (never a float): "82.4%", or "none" of nothing. */
export function share(part: bigint, whole: bigint): string {
  if (whole <= 0n) {
    return 'none';
  }
  const tenths = (part * 2000n + whole) / (2n * whole);
  return `${(tenths / 10n).toString()}.${(tenths % 10n).toString()}%`;
}

function usd(text: string): string {
  return formatUsd(parseCents(text));
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

/** The validated variance of each payer, largest first (then by ID), as the email and the page list it. */
export function validatedByPayer(figures: DigestFigures): { readonly payerId: string; readonly lines: number; readonly cents: string }[] {
  return Object.entries(figures.totals.validated_variance_by_payer)
    .map(([payerId, total]) => ({ payerId, lines: figures.counts.validated_lines_by_payer[payerId] ?? 0, cents: total }))
    .sort((a, b) => {
      const difference = parseCents(b.cents) - parseCents(a.cents);
      return difference > 0n ? 1 : difference < 0n ? -1 : a.payerId.localeCompare(b.payerId);
    });
}

/** The total of the per-payer totals (what validated_variance must equal). */
export function sumByPayer(totals: Readonly<Record<string, string>>): Cents {
  return sumCents(Object.values(totals).map(parseCents));
}

/** The coverage sentence: now, and against the previous digest when there is one. */
export function coverageSentence(figures: DigestFigures): string {
  const { counts, totals } = figures;
  const lines = share(BigInt(counts.coverage_priced_lines), BigInt(counts.coverage_lines));
  const dollars = share(parseCents(totals.coverage_priced_billed), parseCents(totals.coverage_billed));
  const now = `Coverage: ${String(counts.coverage_priced_lines)} of ${plural(counts.coverage_lines, 'line', 'lines')} priced (${lines}); ${usd(totals.coverage_priced_billed)} of ${usd(totals.coverage_billed)} billed (${dollars}).`;
  if (counts.previous_coverage_lines === undefined || counts.previous_coverage_priced_lines === undefined || totals.previous_coverage_billed === undefined || totals.previous_coverage_priced_billed === undefined) {
    return `${now} There is no earlier digest to compare it with.`;
  }
  const before = share(BigInt(counts.previous_coverage_priced_lines), BigInt(counts.previous_coverage_lines));
  const beforeDollars = share(parseCents(totals.previous_coverage_priced_billed), parseCents(totals.previous_coverage_billed));
  return `${now} At the previous digest: ${before} of lines and ${beforeDollars} of billed dollars.`;
}

/**
 * The digest's sentences, in order. Counts and dollar totals only, each with its stage's label where it
 * has one (validated, actionable, recovered); a payer is named only where `payerName` names it (the
 * application's page), and the email passes none, so it lists each payer's figures by rank.
 */
export function digestSentences(period: string, figures: DigestFigures, payerName?: (payerId: string) => string | undefined): string[] {
  const { counts, totals } = figures;
  const sentences = [
    `Monitoring digest for ${monthName(period)}: counts and dollar totals only.`,
    `New validated variance: ${usd(totals.validated_variance)} on ${plural(counts.validated_lines, 'line', 'lines')} across ${plural(counts.validated_payers, 'payer', 'payers')}.`,
  ];
  validatedByPayer(figures).forEach((entry, index) => {
    const name = payerName?.(entry.payerId) ?? `Payer ${String(index + 1)}`;
    sentences.push(`${name}: ${usd(entry.cents)} validated on ${plural(entry.lines, 'line', 'lines')}.`);
  });
  sentences.push(
    `Cases nearing their deadline (within ${String(DEADLINE_DAYS)} days): ${String(counts.cases_nearing_deadline)}, actionable ${usd(totals.cases_nearing_deadline_actionable)}.`,
    `Recoveries posted: ${String(counts.recoveries_posted)}, recovered ${usd(totals.recovered)}.`,
    coverageSentence(figures),
    `Contracts expiring within ${String(CONTRACT_EXPIRY_DAYS)} days: ${String(counts.contracts_expiring)}.`,
  );
  return sentences;
}

/** The totals the figures are built from, checked: the per-payer totals add up to the total. */
export function consistent(figures: DigestFigures): boolean {
  const lines = Object.values(figures.counts.validated_lines_by_payer).reduce((sum, n) => sum + n, 0);
  return (
    centsToString(sumByPayer(figures.totals.validated_variance_by_payer)) === figures.totals.validated_variance &&
    lines === figures.counts.validated_lines &&
    Object.keys(figures.counts.validated_lines_by_payer).length === figures.counts.validated_payers
  );
}
