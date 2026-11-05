import { formatUsdPlain, parseCents } from '@tp/money';

import { type FigureForm, type FigureSource, type Segment, formatFigure, segmentText } from './explain/figures';
import { type DateSpan, type FactCatalog, type FactEntry, type FactLookup, type FactPath, factCatalog, lookupFact } from './fact-catalog';
import { type FactWords, factWords } from './fact-words';
import type { PacketContent, ScheduleLine } from './format';
import { placeholder } from './placeholders';

/**
 * Rendering a narrative's fact tokens (design lane-b-packet-figure-placeholders, section 5): each `{{fact:<id>}}` of a
 * template becomes its fact's phrase (./fact-words.ts), every value in it printed by code from the version's content
 * (./fact-catalog.ts), with the role's words and the set of lines it covers. The payer reads what each figure is and
 * what it covers from code, never from prose. Pure and browser-safe: a function of the template, the content and the
 * words version alone, with amounts in code (@tp/money formatUsdPlain, no locale data), so the rendered text is the
 * same in every process and at every time; its tables, this file and the catalog are inputs of WORDS_VERSION.
 *
 * - The output is ADR 0072's segments: text, each figure with its source (`from: 'content'`, its path, its form and its
 *   fact id as its slot, and for a value read in each of a set of rows those rows), codes and modifiers as code
 *   segments, schedule rows as row labels. A claim's phrase names it by its first row's identifier placeholder,
 *   which only the export fills (fillPlaceholders), so the rendered text holds no identifier.
 * - Identifier placeholders the template holds stay as they are. Any other `{{` or `}}`, an id the catalog does not
 *   hold and an id that is not canonical render nothing: each is a problem at its span in the template, so a
 *   malformed token is never printed.
 * - The span map pairs every piece of the template with the rendered text it became (a run of text with itself, a
 *   token with its phrase), so a mark on either is placed on the other.
 * - Rendered text holds no fact token (a quote holding a brace is no fact), so rendering it again changes nothing.
 */

/** A piece of the template and the rendered text it became, as [start, end) offsets in each; `fact` is the token's id. */
export interface RenderSpan {
  readonly template: readonly [number, number];
  readonly rendered: readonly [number, number];
  readonly fact: string | null;
}

/** Why a token renders nothing, at its span in the template: `canonical` names the id to use instead. */
export interface RenderProblem {
  readonly code: 'unknown_fact' | 'fact_not_canonical';
  readonly span: readonly [number, number];
  readonly id: string | null;
  readonly canonical: string | null;
}

export type RenderedFacts =
  | {
      readonly ok: true;
      readonly segments: readonly Segment[];
      readonly text: string;
      readonly spans: readonly RenderSpan[];
      /** The facts the template's tokens name, in its order. */
      readonly facts: readonly FactEntry[];
    }
  | { readonly ok: false; readonly problems: readonly RenderProblem[] };


/** A figure: the text code printed for a value of the content, and where the value is (its rows, for a path read in each). */
const printed = (entry: FactEntry, text: string, form: FigureForm, path: FactPath): Segment => {
  const source: FigureSource = { from: 'content', path, form, slot: entry.id, ...(path.includes('#') ? { rows: entry.rows } : {}) };
  return { figure: text, source };
};

/** A figure in a form of ./explain/figures.ts (an amount is printed by formatUsdPlain instead: `<amount>`). */
const figure = (entry: FactEntry, value: string, form: FigureForm, path: FactPath): Segment => printed(entry, formatFigure(value, form), form, path);

/** A count with its noun, singular for one: "1 line", "3 lines". */
const counted = (words: FactWords, entry: FactEntry, count: number, noun: keyof FactWords['nouns'], form: FigureForm, path: FactPath): Segment[] => {
  const [one, many] = words.nouns[noun];
  return [figure(entry, String(count), form, path), { text: ` ${count === 1 ? one : many}` }];
};

/** Items joined as a list: "a", "a and b", "a, b and c". */
function listed(items: readonly Segment[]): Segment[] {
  return items.flatMap((item, index) => (index === 0 ? [item] : [{ text: index === items.length - 1 ? ' and ' : ', ' }, item]));
}

/** The procedure code of a fact's lines, as the content writes it (a code's facts cover its lines alone). */
const codeOf = (content: PacketContent, entry: FactEntry): string => (content.lines.find((line) => line.row === entry.rows[0]) as ScheduleLine).procedure_code;

/** One slot of a fact's phrase, as segments. */
function slot(words: FactWords, content: PacketContent, entry: FactEntry, name: string): Segment[] {
  const value = entry.value;
  const path = entry.paths[0] as FactPath;
  const span = value as DateSpan;
  switch (name) {
    case '<amount>':
      return [printed(entry, formatUsdPlain(parseCents(value as string)), 'dollars', path)];
    case '<units>':
      return [figure(entry, value as string, 'units', path), { text: ` ${value === '1' ? words.nouns.units[0] : words.nouns.units[1]}` }];
    case '<lines>':
    case '<claims>':
    case '<patients>':
      // A count fact's own value; otherwise the count of the rows the fact covers.
      return entry.kind === 'count' ? counted(words, entry, value as number, name.slice(1, -1) as 'lines', 'integer', path) : counted(words, entry, entry.rows.length, 'lines', 'integer', ['lines']);
    case '<days>':
      return counted(words, entry, value as number, 'days', 'integer', path);
    case '<number>':
    case '<percent>':
    case '<text>':
      return [figure(entry, `${value as number | string}`, 'verbatim', path)];
    case '<date>':
      return [figure(entry, typeof value === 'string' ? value : span.from, 'verbatim', path)];
    case '<from>':
      return [figure(entry, span.from, 'verbatim', path)];
    case '<to>':
      return [figure(entry, span.to as string, 'verbatim', entry.paths[1] as FactPath)];
    case '<code>':
      return [{ code: codeOf(content, entry) }];
    case '<modifiers>': {
      const modifiers = value as readonly string[];
      const [one, many] = words.nouns.modifiers;
      return [{ text: `${modifiers.length === 1 ? one : many} ` }, ...listed(modifiers.map((modifier) => ({ code: modifier })))];
    }
    case '<row>':
    case '<rows>':
      return listed(entry.rows.map((row) => ({ label: String(row), of: 'row' as const })));
    case '<claim>':
      return [{ text: placeholder('claim_control_number', entry.rows[0] as number) }];
    default:
      throw new TypeError(`a fact's phrase has no slot ${name}`);
  }
}

/** Segments with adjacent text joined. */
function joined(segments: readonly Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const segment of segments) {
    const last = out.at(-1);
    if (last !== undefined && 'text' in last && 'text' in segment) {
      out[out.length - 1] = { text: last.text + segment.text };
    } else if (!('text' in segment) || segment.text !== '') {
      out.push(segment);
    }
  }
  return out;
}

/** A fact's phrase as segments: its words, and every value in them printed by code from the content. */
export function renderFact(content: PacketContent, entry: FactEntry, words: FactWords = factWords()): Segment[] {
  const phrase: string = words.phrases[entry.phrase];
  // Split at each slot, kept: the words and the slots alternate, a slot at each odd place.
  return joined(phrase.split(/(<[a-z]+>)/).flatMap((piece, index) => (index % 2 === 1 ? slot(words, content, entry, piece) : [{ text: piece }])));
}

/** A template rendered over a version's content (or its catalog), or every token that renders nothing. */
export function renderFacts(template: string, from: PacketContent | FactCatalog): RenderedFacts {
  const catalog = 'byId' in from ? from : factCatalog(from);
  const words = factWords();
  const pieces: { readonly template: readonly [number, number]; readonly segments: readonly Segment[]; readonly fact: string | null }[] = [];
  const problems: RenderProblem[] = [];
  const facts: FactEntry[] = [];
  let at = 0;
  const text = (end: number) => {
    if (end > at) {
      pieces.push({ template: [at, end], segments: [{ text: template.slice(at, end) }], fact: null });
    }
  };
  // Each braced run (no brace inside it), and each lone `{{` or `}}`.
  for (const match of template.matchAll(/\{\{[^{}]*\}\}|\{\{|\}\}/g)) {
    const run = match[0];
    const start = match.index;
    const end = start + run.length;
    // An identifier placeholder stays as it is, for the export to fill.
    if (/\{\{[a-z_]+:\d{1,6}\}\}/.test(run)) {
      continue;
    }
    // Anything else in braces but a fact token is no fact; a token's id is the catalog's to read.
    const fact = run.startsWith('{{fact:');
    const id = run.slice('{{fact:'.length, -2);
    const found: FactLookup = fact ? lookupFact(catalog, id) : { problem: 'unknown_fact' };
    if ('problem' in found) {
      problems.push({ code: found.problem, span: [start, end], id: fact ? id : null, canonical: found.problem === 'fact_not_canonical' ? found.canonical : null });
      continue;
    }
    text(start);
    pieces.push({ template: [start, end], segments: renderFact(catalog.content, found.found, words), fact: id });
    facts.push(found.found);
    at = end;
  }
  if (problems.length > 0) {
    return { ok: false, problems };
  }
  text(template.length);
  const spans: RenderSpan[] = [];
  let offset = 0;
  for (const piece of pieces) {
    const length = piece.segments.map(segmentText).join('').length;
    spans.push({ template: piece.template, rendered: [offset, offset + length], fact: piece.fact });
    offset += length;
  }
  const segments = joined(pieces.flatMap((piece) => piece.segments));
  return { ok: true, segments, text: segments.map(segmentText).join(''), spans, facts };
}
