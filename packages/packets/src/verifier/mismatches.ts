import { type NarrativeFacts, PLACEHOLDER_KINDS } from '../facts';
import { type Figure, type FigureKind, scanText, sentenceSpans } from '../scan';

/**
 * The verifier's check itself (PRD 12: "any figure that is not in the input fails verification, and a
 * failed verification cannot be approved"; PRD 14, draftPacketNarrative; test matrix CAS-08), with no
 * options and nothing but the narrative and its version's facts in: the same code verifyNarrative
 * (./index.ts) runs when a version is written, and the packet builder runs in the browser while a
 * person types, so what the screen shows is what the stored result will say. It holds no hash and reads
 * no Node module, which is all that keeps it out of the browser.
 *
 * It fails:
 * - every figure (date, code, modifier, unit, amount, percentage, count, number or identifier) whose
 *   value is not among the inputs of its kind (a number may match a count, units or any other number
 *   of the inputs; a five-digit code may also match one);
 * - every sentence without a citation marker, and every marker naming no source of the version;
 * - every placeholder naming an identifier kind or a schedule row that does not exist;
 * - an empty narrative.
 *
 * Mismatches hold codes and positions only, never the narrative's text.
 */

export const MISMATCH_CODES = ['figure_not_in_input', 'sentence_without_citation', 'unknown_citation', 'unknown_placeholder', 'empty_narrative'] as const;
export type MismatchCode = (typeof MISMATCH_CODES)[number];

export interface Mismatch {
  readonly code: MismatchCode;
  /** The figure's kind for figure_not_in_input; placeholder or citation for those codes; null otherwise. */
  readonly kind: FigureKind | 'placeholder' | 'citation' | null;
  /** The sentence it is in, from 0 (-1 for an empty narrative). */
  readonly sentence: number;
  /** Its position in the narrative, [start, end). */
  readonly start: number;
  readonly end: number;
}

/** What the check found: how many sentences and figures it read, and every mismatch in text order. */
export interface NarrativeCheck {
  readonly passed: boolean;
  readonly sentences: number;
  /** How many figures, placeholders and markers were checked. */
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
}

function months(dates: ReadonlySet<string>): Set<string> {
  return new Set([...dates].map((date) => date.slice(0, 7)));
}

function monthDays(dates: ReadonlySet<string>): Set<string> {
  return new Set([...dates].map((date) => date.slice(5)));
}

/** Whether a figure's value is among the inputs of its kind. */
function inInputs(figure: Figure, facts: NarrativeFacts, derived: { readonly months: ReadonlySet<string>; readonly monthDays: ReadonlySet<string> }): boolean {
  switch (figure.kind) {
    case 'amount':
      return facts.amounts.has(figure.value);
    case 'percent':
      return facts.percents.has(figure.value);
    case 'date':
      return facts.dates.has(figure.value);
    case 'month':
      return derived.months.has(figure.value) || facts.identifiers.has(`month:${figure.value}`);
    case 'month_day':
      return derived.monthDays.has(figure.value) || facts.identifiers.has(`month_day:${figure.value}`);
    case 'code':
      return facts.codes.has(figure.value) || (/^\d{5}$/.test(figure.value) && facts.numbers.has(String(Number.parseInt(figure.value, 10))));
    case 'modifier':
      return facts.modifiers.has(figure.value);
    case 'number':
      return facts.numbers.has(figure.value);
    case 'identifier':
      return facts.identifiers.has(figure.value);
  }
}

export function findMismatches(narrative: string, facts: NarrativeFacts): NarrativeCheck {
  const sentences = sentenceSpans(narrative);
  const scan = scanText(narrative);
  const sentenceOf = (position: number) => sentences.findIndex((span) => position >= span.start && position < span.end);
  const mismatches: Mismatch[] = [];
  const derived = { months: months(facts.dates), monthDays: monthDays(facts.dates) };

  if (sentences.length === 0) {
    mismatches.push({ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: narrative.length });
  }
  for (const figure of scan.figures) {
    if (!inInputs(figure, facts, derived)) {
      mismatches.push({ code: 'figure_not_in_input', kind: figure.kind, sentence: sentenceOf(figure.start), start: figure.start, end: figure.end });
    }
  }
  for (const token of scan.placeholders) {
    if (!PLACEHOLDER_KINDS.has(token.kind) || token.row < 1 || token.row > facts.rows) {
      mismatches.push({ code: 'unknown_placeholder', kind: 'placeholder', sentence: sentenceOf(token.start), start: token.start, end: token.end });
    }
  }
  for (const marker of scan.markers) {
    if (marker.sources.some((source) => !facts.markers.has(source))) {
      mismatches.push({ code: 'unknown_citation', kind: 'citation', sentence: sentenceOf(marker.start), start: marker.start, end: marker.end });
    }
  }
  sentences.forEach((span, index) => {
    if (!scan.markers.some((marker) => marker.start >= span.start && marker.start < span.end)) {
      mismatches.push({ code: 'sentence_without_citation', kind: null, sentence: index, start: span.start, end: span.end });
    }
  });
  mismatches.sort((a, b) => a.start - b.start || a.end - b.end || a.code.localeCompare(b.code));
  return { passed: mismatches.length === 0, sentences: sentences.length, checked: scan.figures.length + scan.placeholders.length + scan.markers.length, mismatches };
}
