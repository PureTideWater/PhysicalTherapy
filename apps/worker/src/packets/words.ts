import type { RoundingRule } from '@tp/money';
import { type CitedMethod, type ContractCitation, type PacketContent, type PacketCitation, interestExclusionText } from '@tp/packets';

/**
 * The words the payer's copy of a packet prints for its codes, one module for both files the practice sends (the
 * PDF, ./html.ts, and the CSV schedule, ./csv.ts; audit item #37 part 1, D3 and D14; docs/adr/0061): a trace's
 * method, step and rounding codes, a release record's program and a prompt-pay rule's exclusions are never printed as
 * codes, and [2] names what the rule releases supplied. A code of a closed list without its words refuses the copy
 * (PayerCopyWordsError); words.test.ts holds every list's codes to their words. The payer and the plan are named in
 * words by @tp/packets (payerAndPlanText(): "payer ID <id>", the plan's name or "plan identifier <id>", never a
 * remittance key's qualifier code; the verification of 2026-10-21), since the verifier's facts quote the plan as the
 * copy prints it.
 */

/** The calculation's methods, steps and rounding rules in words. */
export const METHOD_TEXT: Readonly<Record<CitedMethod, string>> = {
  FIXED_SCHEDULE: 'Fixed schedule',
  PERCENT_OF_MEDICARE: 'Percent of Medicare',
  LESSER_OF: 'Lesser of',
  PER_VISIT: 'Per visit',
  MA_NONCONTRACTED: 'Medicare Advantage, non-contracted',
};
export const STEP_TEXT: Readonly<Record<string, string>> = {
  unit: 'per unit',
  visit: 'per visit',
  schedule: 'schedule',
  charge: 'charge',
  base: 'base',
  mppr: 'MPPR',
  assistant_reduction: 'assistant reduction',
  sequestration: 'sequestration',
  contract_adjustment: 'contract adjustment',
};
export const ROUNDING_TEXT: Readonly<Record<RoundingRule, string>> = {
  HALF_UP_CENT: 'half up to the cent',
  HALF_EVEN_CENT: 'half even to the cent',
  TRUNCATE: 'truncated to the cent',
};
/** A release dispute-window record's program, as it reads before "dispute window". */
export const PROGRAM_TEXT: Readonly<Record<string, string>> = { medicare: 'Medicare', commercial_default: 'commercial default' };

/**
 * A code of a closed list the payer's copy has no words for: a method, step, rounding rule or program added to the
 * engine, the packet format or the rules schema without its words here. The copy is not printed rather than print a
 * code, or a code lower-cased into words no scan can tell from prose; the export job records it as a print failure.
 */
export class PayerCopyWordsError extends TypeError {
  override readonly name = 'PayerCopyWordsError';

  constructor(readonly list: string) {
    super(`the payer’s copy has no words for a ${list} it would print`);
  }
}

/** A code of a closed list in its words (METHOD_TEXT, STEP_TEXT, ROUNDING_TEXT, PROGRAM_TEXT); one without them is refused. */
export function wordsOf(table: Readonly<Record<string, string>>, code: string, list: string): string {
  const words = Object.hasOwn(table, code) ? table[code] : undefined;
  if (words === undefined) {
    throw new PayerCopyWordsError(list);
  }
  return words;
}

/**
 * A prompt-pay rule's exclusion in words, as the review page says it too (@tp/packets INTEREST_EXCLUSION_TEXT). The
 * rules schema holds exclusions as free text, not a closed list, so one not listed reads in lower case with its
 * underscores as spaces rather than refuse the copy.
 */
export const exclusionWords = (code: string): string => interestExclusionText(code);

/** A count and its noun, singular for one (the screen tour's C1, as the web's counted()). */
export const counted = (count: number, one: string, many = `${one}s`): string => `${String(count)} ${count === 1 ? one : many}`;

/**
 * Whether the rule releases supplied a Medicare fee schedule to this version (D14): a regulation's amount is Original
 * Medicare's, a percent-of-Medicare contract's is a percentage of it, and a lesser-of contract's when its schedule is
 * a percentage of Medicare. A fixed-schedule or per-visit release may supply only window or prompt-pay records.
 */
export function suppliedFeeSchedule(citation: PacketCitation): boolean {
  if (citation.kind === 'regulation' || citation.method === 'PERCENT_OF_MEDICARE') {
    return true;
  }
  if (citation.method === 'LESSER_OF') {
    const schedule = (citation.parameters as ContractCitation['parameters'] & { readonly schedule?: { readonly method?: unknown } }).schedule;
    return schedule?.method === 'PERCENT_OF_MEDICARE';
  }
  return false;
}

/** Release numbers in words: "release 900001", "releases 900001 and 900002", "releases 900001, 900002 and 900003". */
export function releaseNumbers(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b).map(String);
  if (sorted.length <= 1) {
    return `release ${sorted[0] ?? ''}`.trim();
  }
  return `releases ${sorted.slice(0, -1).join(', ')} and ${sorted.at(-1) ?? ''}`;
}

/**
 * What [2] says (D14), for the version's releases or one evidence item's: "Payment rules and the Medicare fee
 * schedule in effect for the service dates: release <n>", or "Payment rules in effect for the service dates: ...".
 */
export function releaseText(content: Pick<PacketContent, 'citation'>, numbers: readonly number[]): string {
  const what = suppliedFeeSchedule(content.citation) ? 'Payment rules and the Medicare fee schedule in effect for the service dates' : 'Payment rules in effect for the service dates';
  return numbers.length === 0 ? what : `${what}: ${releaseNumbers(numbers)}`;
}
