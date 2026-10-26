import { formatUnroundedUsd, formatUsd, parseCents } from '@tp/money';

import { SLOTS, type Slot, type SlotPath } from './slots';
import { CODES } from './words';

/**
 * The display forms a figure of the words prints in (docs/adr/0072), and the segments the words are made of. Each form
 * changes how a value the trace (or the citation) holds is written, never the value: no form adds, subtracts,
 * multiplies, divides, compares by size, rounds or negates, and `count` (an array's length, the one derivation the
 * words allow) is the only one that is not a value written out. Pure and browser-safe.
 *
 * - `dollars`: whole cents as integer text, as US dollars ("10000" is "$100.00", "-500" is "-$5.00").
 * - `exact_dollars`: cents as decimal text that may keep a fraction of a cent, as US dollars ("2323.2" is "$23.232"),
 *   the trailing zeros of the fraction of a cent dropped ("2323.20" is "$23.232" too; the value is unchanged); whole
 *   cents read as `dollars` does.
 * - `percent`: the percentage as the trace writes it, and "%" ("110" is "110%").
 * - `per_rvu`: a conversion factor, dollars as the release writes them, per relative value unit ("20.0000" is
 *   "$20.0000 per RVU": the trailing zeros kept).
 * - `verbatim`: the text as the trace holds it ("0.31", "97110", "2026-03-10"), or an integer the trace holds (a line
 *   number, a rank, a page) in its decimal digits.
 * - `integer`: a quantity the trace holds as a whole number (a dispute window's length), its digits grouped by
 *   thousands as the practice's US English reads them ("3650" is "3,650").
 * - `count`: how many items an array of the trace holds, grouped as `integer` is.
 */

export const FIGURE_FORMS = ['dollars', 'exact_dollars', 'percent', 'per_rvu', 'verbatim', 'integer', 'count'] as const;
export type FigureForm = (typeof FIGURE_FORMS)[number];

/** The value a figure prints: where it is (the trace or the citation, and its path there), its slot and its form. */
export interface FigureSource {
  readonly from: 'trace' | 'citation';
  /** The JSON path to the value, e.g. ['steps', 'fee_schedule', 'gpci', 'work_gpci']. */
  readonly path: readonly (string | number)[];
  readonly form: FigureForm;
  /** The slot of the sentence form the figure fills, a key of SLOTS (./slots.ts), which names the path it must print. */
  readonly slot: string;
  /** In a worksheet, the row (the line, on a line's page) whose trace the path is read in; the line's own otherwise. */
  readonly row?: number;
}

/**
 * A run of text; one figure with where it came from; a fixed code from the word tables (AMT B6, CQ), set in mono; a
 * label (a schedule row or worksheet number, which no trace holds); or a meaning or remedy quoted word for word from
 * docs/product/unpriced-reasons.md. Text segments hold no digit (a test holds that), so no number can hide in a
 * template.
 */
export type Segment =
  | { readonly text: string }
  | { readonly figure: string; readonly source: FigureSource }
  | { readonly code: string }
  | { readonly label: string; readonly of: 'row' | 'worksheet' }
  | { readonly quoted: string; readonly from: 'unpriced_reasons' };

export interface Sentence {
  readonly segments: readonly Segment[];
}

/** A value the words cannot print in the form asked: the trace does not have the shape the sentence reads. */
export class ExplainShapeError extends TypeError {
  override readonly name = 'ExplainShapeError';

  /** `what` names the field or rule, never a value. */
  constructor(readonly what: string) {
    super(`the calculation cannot be put in words: ${what}`);
  }
}

/** An integer's decimal digits grouped by thousands ("3650" is "3,650"): a comma before each run of three digits that ends the text. */
const grouped = (digits: string) => digits.replace(/\B(?=(\d{3})+$)/g, ',');

/** A value in a form: the text the figure prints. */
export function formatFigure(value: unknown, form: FigureForm): string {
  if (form === 'count') {
    if (!Array.isArray(value)) {
      throw new ExplainShapeError('a count is of an array');
    }
    return grouped(String(value.length));
  }
  if (form === 'integer') {
    const digits = typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : typeof value === 'string' ? value : null;
    if (digits === null || !/^\d+$/.test(digits)) {
      throw new ExplainShapeError('an integer figure is a whole number');
    }
    return grouped(digits);
  }
  if (typeof value === 'number') {
    if (form !== 'verbatim' || !Number.isSafeInteger(value)) {
      throw new ExplainShapeError('a number prints verbatim, as an integer');
    }
    return String(value);
  }
  if (typeof value !== 'string') {
    throw new ExplainShapeError(`a ${form} figure is text`);
  }
  switch (form) {
    case 'dollars':
      return formatUsd(parseCents(value));
    case 'exact_dollars':
      return formatUnroundedUsd(value);
    case 'percent':
      return `${value}%`;
    case 'per_rvu':
      return `$${value} per RVU`;
    case 'verbatim':
      return value;
  }
}

/** The text of a sentence: its segments joined. */
export function plainText(sentence: Sentence): string {
  return sentence.segments.map(segmentText).join('');
}

/** One segment's text. */
export function segmentText(segment: Segment): string {
  if ('text' in segment) {
    return segment.text;
  }
  if ('figure' in segment) {
    return segment.figure;
  }
  if ('code' in segment) {
    return segment.code;
  }
  if ('label' in segment) {
    return segment.label;
  }
  return segment.quoted;
}

// ---------------------------------------------------------------------------------------------------
// Building sentences (./line.ts, ./worksheet.ts)

/** What a sentence is built from: text (split into text and code segments), a segment, or nothing (left out). */
export type Part = string | Segment | readonly Part[] | null | false;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A code of CODES standing as a word of its own (not inside another word or code; no code begins another, so their order is free). */
const CODE_IN_TEXT = new RegExp(`(?<![A-Za-z0-9+])(${CODES.map(escape).join('|')})(?![A-Za-z0-9+])`, 'g');
const DIGIT = /\d/;

/** Text in its segments: each code of CODES its own code segment, the rest text, which may hold no digit. */
export function textSegments(text: string): Segment[] {
  const codes: readonly string[] = CODES;
  const segments = text
    .split(CODE_IN_TEXT)
    .filter((piece) => piece !== '')
    .map((piece): Segment => (codes.includes(piece) ? { code: piece } : { text: piece }));
  for (const segment of segments) {
    if ('text' in segment && DIGIT.test(segment.text)) {
      throw new ExplainShapeError('a digit in the words outside a figure');
    }
  }
  return segments;
}

function flatten(part: Part, into: Segment[]): void {
  if (part === null || part === false || part === '') {
    return;
  }
  if (typeof part === 'string') {
    into.push(...textSegments(part));
  } else if (Array.isArray(part)) {
    for (const item of part as readonly Part[]) {
      flatten(item, into);
    }
  } else {
    into.push(part as Segment);
  }
}

/** A sentence of its parts, adjacent text joined. */
export function say(...parts: readonly Part[]): Sentence {
  const flat: Segment[] = [];
  flatten(parts, flat);
  const segments: Segment[] = [];
  for (const segment of flat) {
    const last = segments.pop();
    if (last !== undefined && 'text' in last && 'text' in segment) {
      segments.push({ text: last.text + segment.text });
    } else {
      segments.push(...(last === undefined ? [] : [last]), segment);
    }
  }
  return { segments };
}

/** Parts joined as a list: "a", "a and b", "a, b and c". */
export function listOf(items: readonly Part[]): Part[] {
  const head = items.slice(0, -1);
  const last = items.slice(-1);
  return head.length === 0 ? last : [head.flatMap((item, index) => (index === 0 ? [item] : [', ', item])), ' and ', ...last];
}

/** A label segment: a schedule row or a worksheet number, which no trace holds. */
export function label(value: number, of: 'row' | 'worksheet'): Segment {
  return { label: String(value), of };
}

/** Where a figure is read: the trace (as stored and parsed) and the citation beside it. */
export interface FigureContext {
  readonly trace: unknown;
  readonly citation: unknown;
  /** The row a worksheet's figure is read in; left out for a line's own words. */
  readonly row?: number;
}

/** The value at a slot's path, each `#` taken from `indexes` in order. */
export function slotValue(context: FigureContext, slot: Slot, indexes: readonly number[] = []): { readonly value: unknown; readonly path: (string | number)[] } {
  const entry: SlotPath = SLOTS[slot];
  const path: (string | number)[] = [];
  const rest = [...indexes];
  let value: unknown = entry.from === 'trace' ? context.trace : context.citation;
  for (const part of entry.path) {
    const key = part === '#' ? rest.shift() : part;
    if (key === undefined || value === null || typeof value !== 'object' || !Object.hasOwn(value, key)) {
      throw new ExplainShapeError(`no value for the slot ${slot}`);
    }
    path.push(key);
    value = (value as Record<string | number, unknown>)[key];
  }
  if (rest.length !== 0) {
    throw new ExplainShapeError(`the slot ${slot} takes fewer indexes`);
  }
  return { value, path };
}

/** The figure a slot prints, in a form, with where it came from. */
export function figure(context: FigureContext, slot: Slot, form: FigureForm, indexes: readonly number[] = []): Segment {
  const { value, path } = slotValue(context, slot, indexes);
  const source: FigureSource = { from: SLOTS[slot].from, path, form, slot, ...(context.row === undefined ? {} : { row: context.row }) };
  return { figure: formatFigure(value, form), source };
}
