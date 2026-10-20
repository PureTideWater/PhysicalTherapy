import { DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, type DisputeWindowStart, type DisputeWindowUnit } from '@tp/db/runtime';
import { z } from 'zod';

import { type IsoDate, addDays, isIsoDate } from './dates';

/**
 * The rule a contract's dispute window states (best-option audit #5, PR 5 before merge; docs/adr/0061): the window's
 * length is contract_version.dispute_window_days, in the unit the quote gives it (calendar days, business days or
 * months), counted from the date the quote names (the date of service; the remittance date, the remittance advice's
 * own date: the 835's DTM*405 production date, or the date printed on a paper RA; the payment date, BPR16: the check's
 * issue date or the EFT's effective date, the Remittances screen's Payment date; or the day the practice received the
 * remittance or payment). The contract specialist chooses the unit and the start from these fixed lists as the quote
 * states them; nothing parses the quote and there is no default.
 *
 * The engine computes a contract window one way only (packages/pricing/src/windows.ts): dispute_window_days
 * calendar days after BPR16, the payment date (its trace labels that start 'remittance_date'). A window counted from
 * the remittance advice's own date is not that rule: the advice is usually dated a day or more before the payment, so
 * an end counted from BPR16 would be later than the contract's. A window is verified only when the rule it cites is that rule
 * (verifyDisputeWindow(), and contract_version_rules() and contract_version_window_verified_as_computed in the
 * database, through contract_window_rule_computed()); any other rule stays unverified, so its lines wait rather
 * than carry a date that can be later than the contract's. PR 6c computes the cited rule in the engine and widens
 * COMPUTED_CONTRACT_WINDOW_RULE and contract_window_rule_computed() together.
 */

export { DISPUTE_WINDOW_STARTS, DISPUTE_WINDOW_UNITS, type DisputeWindowStart, type DisputeWindowUnit };

/** The units in words, as a count of them reads ("90 calendar days"). */
export const DISPUTE_WINDOW_UNIT_TEXT: Readonly<Record<DisputeWindowUnit, string>> = {
  calendar_days: 'calendar days',
  business_days: 'business days',
  months: 'months',
};

/** One of each unit ("1 business day"). */
const UNIT_TEXT_ONE: Readonly<Record<DisputeWindowUnit, string>> = {
  calendar_days: 'calendar day',
  business_days: 'business day',
  months: 'month',
};

/** The starts in words, as "after <start>" reads. */
export const DISPUTE_WINDOW_START_TEXT: Readonly<Record<DisputeWindowStart, string>> = {
  date_of_service: 'the date of service',
  remittance_date: 'the remittance date',
  payment_date: 'the payment date',
  receipt_date: 'the day the practice received the remittance or payment',
};

/** What each start is, for the specialist choosing it against the quote: which date of the remittance it counts from. */
export const DISPUTE_WINDOW_START_DEFINITION: Readonly<Record<DisputeWindowStart, string>> = {
  date_of_service: 'the date the service was given',
  remittance_date: 'the remittance advice’s own date: the 835’s production date, or the date printed on a paper remittance',
  payment_date: 'the payment date on the remittance: the check’s issue date or the EFT’s effective date (BPR16, the Remittances screen’s Payment date)',
  receipt_date: 'the day the practice received the remittance or payment',
};

/** What a cited window counts in, and from. */
export interface DisputeWindowRule {
  readonly unit: DisputeWindowUnit;
  readonly measuredFrom: DisputeWindowStart;
}

export const disputeWindowRuleSchema = z.strictObject({
  unit: z.enum(DISPUTE_WINDOW_UNITS, 'must be calendar days, business days or months'),
  measuredFrom: z.enum(DISPUTE_WINDOW_STARTS, 'must be the date of service, the remittance date, the payment date or the day the practice received it'),
});

/**
 * The one contract window rule the engine computes today: its days counted as calendar days after the payment date
 * (BPR16, the check's issue date or the EFT's effective date). @tp/triage holds the same literal
 * (COMPUTED_CONTRACT_WINDOW), and the database's contract_window_rule_computed() the same test; a test holds the three
 * together.
 */
export const COMPUTED_CONTRACT_WINDOW_RULE: DisputeWindowRule = Object.freeze({ unit: 'calendar_days', measuredFrom: 'payment_date' });

/** Whether a cited rule is the rule the engine computes, as contract_window_rule_computed() reads it (null: no rule, never computed). */
export function windowRuleComputed(rule: DisputeWindowRule | null): boolean {
  return rule !== null && rule.unit === COMPUTED_CONTRACT_WINDOW_RULE.unit && rule.measuredFrom === COMPUTED_CONTRACT_WINDOW_RULE.measuredFrom;
}

/** A window's rule in words: "ends 90 calendar days after the payment date". */
export function windowRuleText(length: number, rule: DisputeWindowRule): string {
  const unit = length === 1 ? UNIT_TEXT_ONE[rule.unit] : DISPUTE_WINDOW_UNIT_TEXT[rule.unit];
  return `ends ${String(length)} ${unit} after ${DISPUTE_WINDOW_START_TEXT[rule.measuredFrom]}`;
}

/** Whether two rules are the same rule. */
export function sameWindowRule(a: DisputeWindowRule | null, b: DisputeWindowRule | null): boolean {
  return a !== null && b !== null && a.unit === b.unit && a.measuredFrom === b.measuredFrom;
}

// ---------------------------------------------------------------------------------------------------
// The end a rule gives

/** The dates of one line a window can be counted from; null where the line does not carry it. */
export interface WindowStartDates {
  readonly dateOfService: IsoDate | null;
  readonly remittanceDate: IsoDate | null;
  readonly paymentDate: IsoDate | null;
  readonly receiptDate: IsoDate | null;
}

const START_OF: Readonly<Record<DisputeWindowStart, keyof WindowStartDates>> = {
  date_of_service: 'dateOfService',
  remittance_date: 'remittanceDate',
  payment_date: 'paymentDate',
  receipt_date: 'receiptDate',
};

function dateParts(date: IsoDate): [number, number, number] {
  if (!isIsoDate(date)) {
    throw new RangeError('not a calendar date (YYYY-MM-DD)');
  }
  return [Number.parseInt(date.slice(0, 4), 10), Number.parseInt(date.slice(5, 7), 10), Number.parseInt(date.slice(8, 10), 10)];
}

/** The same day `months` later; a day the target month lacks falls to its last day (January 31 plus one month is February 28 or 29). */
function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  const [year, month, day] = dateParts(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  const last = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

/** The weekday of a date, 0 Sunday to 6 Saturday. */
function weekday(date: IsoDate): number {
  const [year, month, day] = dateParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/**
 * The `days`-th business day after `from` (Monday to Friday; `from` itself is never counted). Public holidays are
 * counted as business days: a contract's own holiday list is not abstracted, so the end shown is never later than
 * the contract's (a holiday the contract skips only moves its end later).
 */
function addBusinessDays(from: IsoDate, days: number): IsoDate {
  let date = from;
  let left = days;
  while (left > 0) {
    date = addDays(date, 1);
    const day = weekday(date);
    if (day !== 0 && day !== 6) {
      left -= 1;
    }
  }
  return date;
}

/**
 * The last day a dispute can be filed under a window of `length` in `rule`, for a line's dates: the start the rule
 * names plus `length` calendar days, business days or months. Null when the line does not carry that start.
 * windowRuleEndsOn(days, COMPUTED_CONTRACT_WINDOW_RULE, dates) is the engine's own end for a contract window.
 */
export function windowRuleEndsOn(length: number, rule: DisputeWindowRule, dates: WindowStartDates): IsoDate | null {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('a window is a whole number of its units, at least one');
  }
  const from = dates[START_OF[rule.measuredFrom]];
  if (from === null) {
    return null;
  }
  switch (rule.unit) {
    case 'calendar_days':
      return addDays(from, length);
    case 'business_days':
      return addBusinessDays(from, length);
    case 'months':
      return addMonthsClamped(from, length);
  }
}
