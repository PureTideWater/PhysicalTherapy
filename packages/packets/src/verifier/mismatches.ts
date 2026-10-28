import { type NarrativeFacts, PLACEHOLDER_KINDS, heldRoles } from '../facts';
import { type ReadableText, type TextSpan, readableText } from '../readable';
import { FIGURE_ROLES, type FigureReading, type FigureRole, functionWords, quotedHolds, readFigures } from '../roles';
import { type FigureKind, scanText, sentenceSpans } from '../scan';

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
 * - every figure (date, code, modifier, unit, amount, percentage, count, number or identifier) the inputs
 *   do not hold in the role its own words give it (../roles.ts; docs/adr/0086): "3650 days" is the window's
 *   days, "page 2" a page, "3 claims" the claim count, "the payer allowed $70.00" the allowed amount, and a
 *   value the inputs hold in another role fails ("10000 visits" when 10000 is the window's days). A figure
 *   whose words name no role passes in any role of its kind (an amount, a percentage, a date), or, for a
 *   number, in none: only as a quoted text holds it, with the words around it ("Section 4");
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

/** A figure as the check read it: its kind, the roles its words give it, and whether the inputs hold it so. */
export interface CheckedFigure {
  /** The figure's kind as read (a year, or a five-digit figure read as a number, is a number). */
  readonly kind: FigureKind;
  /** The roles its words give it (any of them), or null when they name none. */
  readonly roles: readonly FigureRole[] | null;
  readonly passed: boolean;
  /** For a figure that failed, the roles the inputs hold its value in (a figure stated in the wrong role). */
  readonly heldAs: readonly FigureRole[];
  /** The sentence it is in, from 0. */
  readonly sentence: number;
  /** Its position in the narrative, [start, end). */
  readonly start: number;
  readonly end: number;
}

/**
 * Whether the inputs hold a figure as it is read (../roles.ts): a code, modifier or identifier among the inputs of its
 * kind; any other figure in a role its words give it, or, when they give it none, in any role of its kind (a number
 * with no role in none); or repeated with the words around it from a quoted text (quotedHolds()).
 */
function inInputs(reading: FigureReading, facts: NarrativeFacts, tokens: readonly string[], words: ReadonlySet<string>): boolean {
  const quoted = (inRole: boolean) => facts.quotes.some((quote) => quotedHolds(tokens, reading.token, quote, inRole, words));
  switch (reading.kind) {
    case 'code':
      return facts.codes.has(reading.value) || quoted(false);
    case 'modifier':
      return facts.modifiers.has(reading.value);
    case 'identifier':
      return facts.identifiers.has(reading.value);
    case 'amount':
    case 'percent':
    case 'date':
    case 'month':
    case 'month_day':
    case 'number':
    case 'year': {
      if (reading.prose || facts.codes.has(reading.code)) {
        return true;
      }
      const held = heldRoles(facts, reading.kind, reading.value);
      const { roles } = reading;
      if (roles === 'any') {
        return held.size > 0 || quoted(false);
      }
      if (roles === 'none') {
        return quoted(false);
      }
      // Business or working days are only the days to pay of a rule that counts business days.
      const inRole = roles.some((role) => held.has(role) && (!reading.business || (role === 'days_to_pay' && facts.businessDays)));
      return inRole || quoted(true);
    }
  }
}

/** Every figure of a narrative, read in its role and checked against the facts (`sentenceOf` a narrative position's sentence). */
function checkFigures(readable: ReadableText, facts: NarrativeFacts, sentenceOf: (position: number) => number): CheckedFigure[] {
  const read = readFigures(readable.text);
  const words = functionWords();
  return read.readings.map((reading) => {
    const passed = inInputs(reading, facts, read.tokens, words);
    const span = readable.original(reading.figure.start, reading.figure.end);
    // A five-digit figure that may be a code or a count is reported as the code it is written as.
    const kind: FigureKind = reading.code !== '' ? 'code' : reading.kind === 'year' ? 'number' : reading.kind;
    const held = heldRoles(facts, reading.kind, reading.value);
    return {
      kind,
      roles: Array.isArray(reading.roles) ? reading.roles : null,
      passed,
      heldAs: passed ? [] : FIGURE_ROLES.filter((role) => held.has(role)),
      sentence: sentenceOf(span.start),
      start: span.start,
      end: span.end,
    };
  });
}

/**
 * Every figure of a narrative as the check reads it, in text order: what the gateway's notice of a figure in the wrong
 * role (model-gateway functions/narrative-roles.ts) and the editor's words for a failing figure are read from.
 */
export function checkedFigures(narrative: string, facts: NarrativeFacts): CheckedFigure[] {
  const readable = readableText(narrative);
  return checkFigures(readable, facts, sentenceFinder(originalSentences(readable)));
}

/** The narrative's sentences, in the original narrative's positions. */
function originalSentences(readable: ReadableText): TextSpan[] {
  return sentenceSpans(readable.text).map((span) => readable.original(span.start, span.end));
}

/** The index of the sentence a position falls in, or -1 for none. */
function sentenceFinder(sentences: readonly TextSpan[]): (position: number) => number {
  return (position) => sentences.findIndex((span) => position >= span.start && position < span.end);
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
  const sentences = originalSentences(readable);
  const sentenceOf = sentenceFinder(sentences);
  const mismatches: Mismatch[] = [];
  const add = (code: MismatchCode, kind: Mismatch['kind'], span: TextSpan) => {
    mismatches.push({ code, kind, sentence: sentenceOf(span.start), start: span.start, end: span.end });
  };
  const at = (span: TextSpan) => readable.original(span.start, span.end);

  if (sentences.length === 0) {
    mismatches.push({ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: narrative.length });
  }
  for (const span of readable.hidden) {
    add('hidden_character', null, span);
  }
  for (const span of readable.unreadable) {
    add('unreadable_figure', null, span);
  }
  for (const figure of checkFigures(readable, facts, sentenceOf)) {
    if (!figure.passed) {
      mismatches.push({ code: 'figure_not_in_input', kind: figure.kind, sentence: figure.sentence, start: figure.start, end: figure.end });
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
