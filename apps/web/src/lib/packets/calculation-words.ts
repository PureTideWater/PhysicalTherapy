import { ExplainBindingError, type ExplainBindingReason, ExplainShapeError, ExplainWordsError, type PacketContent, type PacketWords, explainPacket } from '@tp/packets';

/**
 * A packet version's calculation in the payer's words on the builder and the review (combined audit #38; design 3.7
 * and 3.9; docs/adr/0072): @tp/packets explainPacket() with the payer audience, the one renderer the payer's PDF
 * prints, so the person who approves and the reviewer who attests read what the payer reads. Nothing here words a
 * figure or falls back to a code: what the renderer cannot word is refused, with what it lacks and the next step, and
 * the version is not approved.
 */

/**
 * A version's calculation in the payer's words: worded from the stored traces its approval names; refused, with what
 * it lacks in words and the next step, when the renderer cannot word it (nothing is printed then, and the version is
 * not approved); or none, for a tp-packet/1 version, which states no calculation.
 */
export type CalculationWords =
  | { readonly state: 'worded'; readonly words: PacketWords }
  | { readonly state: 'refused'; readonly refusal: WordsRefusal }
  | { readonly state: 'none' };

/** Why a calculation cannot be worded, as a reason and the next step (never a value: a list's name, a rule or a row). */
export interface WordsRefusal {
  readonly what: string;
  readonly next: string;
}

/** A binding refusal's reason in words; tp-packet/1 ('format') states no calculation and is never worded. */
const BINDING_TEXT: Readonly<Record<Exclude<ExplainBindingReason, 'format'>, string>> = {
  trace_missing: 'its priced line cannot be read',
  trace_differs: 'its stored trace does not hash to the SHA-256 the version states',
  not_priced: 'its stored trace priced nothing',
  rate_record_differs: 'it was priced by another rate record than the one the citation names',
  not_medicare_advantage: 'it is not a non-contracted Medicare Advantage line, which the regulation cited requires',
};

const ASK_SUPPORT = 'Ask PaidWhole support';

/** What a renderer's refusal says (design 3.7), or undefined for an error that is not one. */
export function wordsRefusalOf(error: unknown): WordsRefusal | undefined {
  if (error instanceof ExplainWordsError) {
    return { what: `${error.list} has no words`, next: ASK_SUPPORT };
  }
  if (error instanceof ExplainShapeError) {
    return { what: `the calculation cannot be put in words (${error.what})`, next: ASK_SUPPORT };
  }
  if (error instanceof ExplainBindingError && error.reason !== 'format') {
    return { what: `row ${String(error.row)}’s calculation cannot be worded: ${BINDING_TEXT[error.reason]}`, next: ASK_SUPPORT };
  }
  return undefined;
}

/** The refusal as the calculation card says it. */
export function wordsRefusalText(refusal: WordsRefusal): string {
  return `The payer’s copy cannot be printed: ${refusal.what}. ${refusal.next}.`;
}

/** The same, as a step's refusal ("Refused: the payer’s copy cannot be printed: ..."; lib/cases/refusals). */
export function wordsRefusalReason(refusal: WordsRefusal): string {
  return `the payer’s copy cannot be printed: ${refusal.what}. ${refusal.next}`;
}

/** A version's calculation in the payer's words, from its stored traces by priced line ID (as read, never parsed here). */
export function calculationWordsOf(content: PacketContent, traces: ReadonlyMap<string, unknown>): CalculationWords {
  if (content.format !== 'tp-packet/2') {
    return { state: 'none' };
  }
  try {
    return { state: 'worded', words: explainPacket(content, traces, 'payer') };
  } catch (error) {
    const refusal = wordsRefusalOf(error);
    if (refusal === undefined) {
      throw error;
    }
    return { state: 'refused', refusal };
  }
}
