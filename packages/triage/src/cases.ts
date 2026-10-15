import { type Cents, cents, decimal, roundToCents, sumCents, unroundedCents } from '@tp/money';
import { z } from 'zod';

import { type PursuitSettings } from './settings';

/**
 * A case's totals, deadline and pursuit cost (PRD 12, Deadlines and pursuit cost; Write-offs and
 * reopening; PRD 6, Triage and cases: "a case total equals the sum of its actionable lines"; test
 * matrix CAS-06). The case table derives the same total and deadline in SQL from its lines.
 */

export interface CaseLineState {
  readonly serviceLineId: string;
  readonly varianceCents: Cents;
  readonly windowEndsOn: string | null;
  readonly writtenOff: boolean;
}

export interface CaseTotals {
  /** The sum of the variance of the lines not written off: what the case asks for. */
  readonly actionableCents: Cents;
  readonly actionableLines: number;
  /** Written-off lines stay in the case, visible and struck through, out of the total. */
  readonly writtenOffLines: number;
  readonly writtenOffCents: Cents;
  /** The earliest window among the lines not written off; null when none is left. */
  readonly deadlineOn: string | null;
}

export function caseTotals(lines: readonly CaseLineState[]): CaseTotals {
  const open = lines.filter((line) => !line.writtenOff);
  const struck = lines.filter((line) => line.writtenOff);
  const windows = open.map((line) => line.windowEndsOn).filter((value): value is string => value !== null).sort();
  return {
    actionableCents: sumCents(open.map((line) => line.varianceCents)),
    actionableLines: open.length,
    writtenOffLines: struck.length,
    writtenOffCents: sumCents(struck.map((line) => line.varianceCents)),
    deadlineOn: windows[0] ?? null,
  };
}

/**
 * The lines whose windows have closed by `asOf` and that are not written off yet: triage writes them
 * off (window passed), so they leave the actionable total and stay visible.
 */
export function windowsClosed(lines: readonly CaseLineState[], asOf: string): string[] {
  return lines
    .filter((line) => !line.writtenOff && line.windowEndsOn !== null && line.windowEndsOn < asOf)
    .map((line) => line.serviceLineId)
    .sort();
}

/** How a deadline reads on the Cases screen (PRD 7: deadline colors): passed, within 14 days, later. */
export type DeadlineState = 'passed' | 'soon' | 'later' | 'none';

/** Days from one date to another (YYYY-MM-DD), whole days in UTC. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function deadlineState(deadlineOn: string | null, asOf: string): DeadlineState {
  if (deadlineOn === null) {
    return 'none';
  }
  const days = daysBetween(asOf, deadlineOn);
  return days < 0 ? 'passed' : days <= 14 ? 'soon' : 'later';
}

const MINUTES_PER_HOUR = decimal(60n);

/**
 * The estimated cost of pursuing one case (PRD 12: "estimated from the practice's settings (staff
 * rate, minutes per packet, minutes per follow-up) so the report can show net expected value"): the
 * staff rate for one packet and one follow-up (the 45-day follow-up a submission gets), rounded half
 * up to the cent. Null when the practice has not set its staff rate and times. The workbench
 * (milestone 8) replaces the estimate with logged time.
 */
export function pursuitCost(settings: PursuitSettings | null): Cents | null {
  if (settings === null) {
    return null;
  }
  const minutes = decimal(BigInt(settings.minutesPerPacket + settings.minutesPerFollowUp));
  return roundToCents(unroundedCents(decimal(settings.staffRateCentsPerHour).times(minutes).dividedBy(MINUTES_PER_HOUR)), 'HALF_UP_CENT');
}

/** What pursuing a case is expected to net: its actionable total less its pursuit cost; null without an estimate. */
export function netExpectedValue(actionableCents: Cents, pursuitCostCents: Cents | null): Cents | null {
  return pursuitCostCents === null ? null : cents(actionableCents - pursuitCostCents);
}

/** The closed list of write-off reasons (PRD 12, Write-offs and reopening). */
export const WRITE_OFF_REASONS = ['window_passed', 'payer_correct_on_review', 'not_worth_pursuit', 'duplicate', 'other'] as const;
export type WriteOffReason = (typeof WRITE_OFF_REASONS)[number];

export const WRITE_OFF_TEXT: Readonly<Record<WriteOffReason, string>> = {
  window_passed: 'Window passed',
  payer_correct_on_review: 'Payer correct on review',
  not_worth_pursuit: 'Not worth pursuit',
  duplicate: 'Duplicate',
  other: 'Other',
};

/** A write-off: a reason from the list, with text only for "other" (and then required). */
export const writeOffSchema = z
  .object({
    reason: z.enum(WRITE_OFF_REASONS),
    text: z.string().trim().max(500).optional(),
  })
  .transform((value) => ({ reason: value.reason, text: value.text === undefined || value.text === '' ? null : value.text }))
  .refine((value) => (value.reason === 'other') === (value.text !== null), { message: 'say why for "other", and only for "other"', path: ['text'] });
export type WriteOff = z.output<typeof writeOffSchema>;
