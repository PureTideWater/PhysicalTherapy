import { type NarrativeFacts, PLACEHOLDER_KINDS } from '../facts';
import { type TextSpan, readableText } from '../readable';
import { type Figure, type FigureKind, scanText, sentenceSpans } from '../scan';

/**
 * The verifier's check itself (PRD 12: "any figure that is not in the input fails verification, and a
 * failed verification cannot be approved"; PRD 14, draftPacketNarrative; test matrix CAS-08), with no
 * options and nothing but the narrative and its version's facts in: the same code verifyNarrative
 * (./index.ts) runs when a version is written, and the packet builder runs in the browser while a
 * person types, so what the screen shows is what the stored result will say. It holds no hash and reads
 * no Node module, which is all that keeps it out of the browser.
 *
 * The narrative is read as it shows (../readable.ts: each character in its NFKC form, hidden characters
 * left out), and it fails:
 * - every figure (date, code, modifier, unit, amount, percentage, count, number or identifier) whose
 *   value is not among the inputs of its kind (a number may match a count, units or any other number
 *   of the inputs; a five-digit code may also match one);
 * - every hidden character (one that prints as nothing or as something else), and every figure written
 *   in digits other than 0 to 9, which the verifier does not read;
 * - every occurrence of one of the case's own identifiers (a patient's name, a member ID, a claim
 *   number), compared without regard to case: identifiers are placeholders in the narrative, inserted
 *   at export, and a draft never carries one (PRD 12). The server passes the identifiers of the
 *   version's schedule rows, read from the canonical records; the browser never holds them, so there
 *   the stored result alone says so;
 * - every sentence without a citation marker, and every marker naming no source of the version;
 * - every placeholder naming an identifier kind or a schedule row that does not exist;
 * - an empty narrative.
 *
 * Mismatches hold codes and positions only (in the text as given), never the narrative's text or an
 * identifier.
 */

export const MISMATCH_CODES = [
  'figure_not_in_input',
  'sentence_without_citation',
  'unknown_citation',
  'unknown_placeholder',
  'empty_narrative',
  'hidden_character',
  'unreadable_figure',
  'identifier_in_narrative',
] as const;
export type MismatchCode = (typeof MISMATCH_CODES)[number];

export interface Mismatch {
  readonly code: MismatchCode;
  /** The figure's kind for figure_not_in_input; placeholder or citation for those codes; identifier for identifier_in_narrative; null otherwise. */
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

/** Letters and digits: what an identifier is compared on, and what bounds it. */
const WORD_CHARACTER = /[\p{L}\p{N}]/gu;

/**
 * The forms of each identifier the narrative must not hold: the whole value and each of its words (a
 * name's parts), each with at least two letters or digits, in NFKC.
 */
export function identifierForms(identifiers: readonly string[]): string[] {
  const forms = new Set<string>();
  for (const identifier of identifiers) {
    const value = identifier.normalize('NFKC').trim();
    for (const form of [value, ...value.split(/[\s,;/]+/)]) {
      const trimmed = form.trim();
      if ((trimmed.match(WORD_CHARACTER) ?? []).length >= 2) {
        forms.add(trimmed);
      }
    }
  }
  return [...forms].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where the text holds one of the forms as a whole word, without regard to case, outside the spans to skip. */
export function identifierSpans(text: string, identifiers: readonly string[], skip: readonly TextSpan[]): TextSpan[] {
  const found: TextSpan[] = [];
  for (const form of identifierForms(identifiers)) {
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(form).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of text.matchAll(pattern)) {
      const span = { start: match.index, end: match.index + match[0].length };
      const overlaps = (other: TextSpan) => other.start < span.end && span.start < other.end;
      if (!skip.some(overlaps) && !found.some(overlaps)) {
        found.push(span);
      }
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Figures that name a date: a month's name there is the date, never a patient's name. */
const DATED: ReadonlySet<FigureKind> = new Set(['date', 'month', 'month_day']);

/**
 * The check. `identifiers` are the case's own (the version's schedule rows' patient names, member IDs
 * and claim numbers), which the server reads from the canonical records; the browser passes none.
 */
export function findMismatches(narrative: string, facts: NarrativeFacts, identifiers: readonly string[]): NarrativeCheck {
  const readable = readableText(narrative);
  const { text } = readable;
  const scan = scanText(text);
  const sentences = sentenceSpans(text).map((span) => readable.original(span.start, span.end));
  const sentenceOf = (position: number) => sentences.findIndex((span) => position >= span.start && position < span.end);
  const mismatches: Mismatch[] = [];
  const add = (code: MismatchCode, kind: Mismatch['kind'], span: TextSpan) => {
    mismatches.push({ code, kind, sentence: sentenceOf(span.start), start: span.start, end: span.end });
  };
  const at = (span: TextSpan) => readable.original(span.start, span.end);
  const derived = { months: months(facts.dates), monthDays: monthDays(facts.dates) };

  if (sentences.length === 0) {
    mismatches.push({ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: narrative.length });
  }
  for (const span of readable.hidden) {
    add('hidden_character', null, span);
  }
  for (const span of readable.unreadable) {
    add('unreadable_figure', null, span);
  }
  for (const figure of scan.figures) {
    if (!inInputs(figure, facts, derived)) {
      add('figure_not_in_input', figure.kind, at(figure));
    }
  }
  const skip = [...scan.placeholders, ...scan.markers, ...scan.figures.filter((figure) => DATED.has(figure.kind))];
  for (const span of identifierSpans(text, identifiers, skip)) {
    add('identifier_in_narrative', 'identifier', at(span));
  }
  for (const token of scan.placeholders) {
    if (!PLACEHOLDER_KINDS.has(token.kind) || token.row < 1 || token.row > facts.rows) {
      add('unknown_placeholder', 'placeholder', at(token));
    }
  }
  for (const marker of scan.markers) {
    if (marker.sources.some((source) => !facts.markers.has(source))) {
      add('unknown_citation', 'citation', at(marker));
    }
  }
  const markers = scan.markers.map(at);
  sentences.forEach((span, index) => {
    if (!markers.some((marker) => marker.start >= span.start && marker.start < span.end)) {
      mismatches.push({ code: 'sentence_without_citation', kind: null, sentence: index, start: span.start, end: span.end });
    }
  });
  mismatches.sort((a, b) => a.start - b.start || a.end - b.end || a.code.localeCompare(b.code));
  return { passed: mismatches.length === 0, sentences: sentences.length, checked: scan.figures.length + scan.placeholders.length + scan.markers.length, mismatches };
}
