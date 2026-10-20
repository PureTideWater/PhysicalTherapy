import type { ContractCitation, PacketContent, PacketCitation } from '@tp/packets';

/**
 * The words the payer's copy of a packet prints for its codes, one module for both files the practice sends (the
 * PDF, ./html.ts, and the CSV schedule, ./csv.ts; audit item #37 part 1, D3 and D14; docs/adr/0061): a trace's
 * method, step and rounding codes are never printed as codes, and [2] names what the rule releases supplied.
 */

/** The calculation's methods, steps and rounding rules in words. */
export const METHOD_TEXT: Readonly<Record<string, string>> = {
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
export const ROUNDING_TEXT: Readonly<Record<string, string>> = {
  HALF_UP_CENT: 'half up to the cent',
  HALF_EVEN_CENT: 'half even to the cent',
  TRUNCATE: 'truncated to the cent',
};
/** A release dispute-window record's program, as it reads before "dispute window". */
export const PROGRAM_TEXT: Readonly<Record<string, string>> = { medicare: 'Medicare', commercial_default: 'commercial default' };

/** A code not in its table, in words: lower case, its underscores as spaces. */
export const wordsOf = (table: Readonly<Record<string, string>>, code: string): string => table[code] ?? code.toLowerCase().replace(/_/g, ' ');

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
