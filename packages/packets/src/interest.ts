import { type Cents, addUnrounded, decimal, multiplyCents, parseCents, roundOnce, sumCents, unroundedCents } from '@tp/money';

import { addDays, daysFrom } from './dates';
import type { EvidenceGap, EvidenceGapCode, InterestLine, InterestSection } from './format';

/**
 * Prompt-pay interest, computed by code from a state rule record and stated as its own packet line,
 * never inside expected allowed (PRD 2, step 9; Rules reference, State prompt-pay rules; test matrix
 * CAS-15). The record (`state_prompt_pay`, by state) gives the days the payer has to pay a claim, the
 * day basis and the annual rate; the remittance gives when the payer received the claim (DTM 050) and
 * when it paid. For each schedule line:
 *
 * - due on: the received date plus the days to pay (calendar days);
 * - late payment: what the payer paid on the line, for the days its payment came after the due date;
 * - unpaid shortfall: the line's variance, still unpaid, for the days from the due date to the
 *   version's date;
 * - interest: both at the annual rate, simple, over a 365-day year, rounded once per line, half up.
 *
 * It cannot be computed, and the line says so and lists an evidence gap, when the release has no
 * record for the state, the record's rate is null (as the real North Carolina record's is until the
 * statute's rate is transcribed), the record counts business days (holidays are not in the record),
 * the record is not in effect on the received date, or the remittance does not say when the claim was
 * received. Exclusions (self-funded ERISA plans, for North Carolina) are stated on the line: whether
 * the plan is one is the person's to confirm before approval.
 */

export interface PromptPayRecord {
  readonly state: string;
  readonly release_no: number;
  readonly sha256: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly days_to_pay: number;
  readonly day_basis: string;
  readonly annual_rate_percent: string | null;
  readonly exclusions: readonly string[];
  readonly statute: string;
}

export interface InterestLineInput {
  readonly row: number;
  readonly paid_cents: string;
  readonly variance_cents: string;
  readonly paid_on: string;
  readonly received_on: string | null;
}

export interface InterestResult {
  readonly section: InterestSection;
  readonly gaps: readonly EvidenceGap[];
}

/** 100 percent times 365 days. */
const PERCENT_YEAR = decimal(36500n);

function inEffect(record: PromptPayRecord, date: string): boolean {
  return record.effective_from <= date && (record.effective_to === null || date <= record.effective_to);
}

export function promptPayInterest(state: string, releaseNo: number, record: PromptPayRecord | null, lines: readonly InterestLineInput[], asOf: string): InterestResult {
  const reasons = new Set<EvidenceGapCode>();
  const gaps: EvidenceGap[] = [];
  const gap = (code: EvidenceGapCode, row: number | null) => {
    reasons.add(code);
    gaps.push({ code, row });
  };
  if (record === null) {
    gap('prompt_pay_rule_missing', null);
  } else if (record.day_basis !== 'calendar') {
    gap('interest_business_days', null);
  } else if (record.annual_rate_percent === null) {
    gap('interest_rate_unknown', null);
  }
  const usable = record !== null && reasons.size === 0 ? record : null;
  const computed: Cents[] = [];
  const results = lines.map((line): InterestLine => {
    const none = { row: line.row, received_on: line.received_on, paid_on: line.paid_on, due_on: null, days_late: null, days_unpaid: null, interest_cents: null };
    if (usable === null) {
      return none;
    }
    if (line.received_on === null) {
      gap('claim_received_date_unknown', line.row);
      return none;
    }
    if (!inEffect(usable, line.received_on)) {
      gap('prompt_pay_rule_not_in_effect', line.row);
      return none;
    }
    const dueOn = addDays(line.received_on, usable.days_to_pay);
    const daysLate = Math.max(0, daysFrom(dueOn, line.paid_on));
    const daysUnpaid = Math.max(0, daysFrom(dueOn, asOf));
    const annual = decimal(usable.annual_rate_percent ?? '0');
    const late = multiplyCents(parseCents(line.paid_cents), annual.times(decimal(BigInt(daysLate))).dividedBy(PERCENT_YEAR));
    const variance = parseCents(line.variance_cents);
    const unpaid = variance > 0n ? multiplyCents(variance, annual.times(decimal(BigInt(daysUnpaid))).dividedBy(PERCENT_YEAR)) : unroundedCents(decimal(0n));
    const interest = roundOnce(addUnrounded(late, unpaid)).cents;
    computed.push(interest);
    return { row: line.row, received_on: line.received_on, due_on: dueOn, paid_on: line.paid_on, days_late: daysLate, days_unpaid: daysUnpaid, interest_cents: interest.toString() };
  });
  return {
    section: {
      state,
      release_no: releaseNo,
      record_sha256: record?.sha256 ?? null,
      statute: record?.statute ?? null,
      days_to_pay: record?.days_to_pay ?? null,
      day_basis: record?.day_basis ?? null,
      annual_rate_percent: record?.annual_rate_percent ?? null,
      exclusions: record?.exclusions ?? [],
      computed: reasons.size === 0,
      reasons: [...reasons].sort(),
      lines: results,
      total_cents: computed.length === 0 ? null : sumCents(computed).toString(),
    },
    gaps,
  };
}
