import type { FactCatalog, FactEntry } from '../fact-catalog';
import type { FactKind } from '../fact-words';
import type { TextSpan } from '../readable';
import type { RenderedFacts } from '../render';
import { type WordRead, readAround } from '../roles';
import { totalCues } from '../roles-reader/cues';
import type { FigureReading, Token } from '../roles-reader/kinds';

/**
 * Pass 2 of verifier format tp-packet-verifier/3 (design lane-b-packet-figure-placeholders, section 4; docs/adr/0089):
 * the rendered template read by ADR 0086's reader (../roles.ts) for contradiction only. Browser-safe.
 *
 * A fact token's role and scope are the catalog's, and its phrase's own words are never read again: the reader is given
 * the rendered text with each phrase replaced by a stand-in figure of its kind (an amount, a percentage, a date or a
 * number), built through the renderer's span map, and decides only whether the sentence around a token contradicts it.
 * A token fails as `fact_contradicted`, at its span in the template, when:
 *
 * - **role cue**: the words around its stand-in name roles (ADR 0086's steps, one cue's roles), and the fact's role is
 *   not one of them, or they name several the figure must be held in every one of, or it stands in a "respectively"
 *   list in neither plain form; a token with no role (a code, modifiers, a quote, a reference) has none to contradict;
 * - **a part named beside an all-lines fact** (the pattern's totals, its counts and its span): in the same sentence, a
 *   word of ADR 0086's closed trigger list in the free text (a part of the lines; a claim or a patient where the pattern
 *   has more than one; a scope phrase of each line beside no figure), a scope phrase of each line or unit right after
 *   the token, or a token that names part of the lines (every `code.*`, `line.*`, `lines.*` and `claim.*` id, and every
 *   identifier placeholder, which names its row), unless those tokens' rows together cover every line, a union code
 *   computes over the rows;
 * - **a total named beside a part fact** (an amount, units or a count of a code, a claim, a line or a set of rows): in
 *   the same sentence, a phrase of the reader's total cues (../roles-reader/cues.ts totalCues) in the free text.
 *
 * A part fact beside a part trigger passes, and an all-lines fact beside a total cue passes. Sentences are the
 * template's (pass 1's), so a mismatch's sentence is the one pass 1 numbers.
 */

/** A template's identifier placeholder, at its span in the template, and the row it names. */
export interface RowToken {
  readonly start: number;
  readonly end: number;
  readonly row: number;
}

export interface ContradictionInput {
  readonly catalog: FactCatalog;
  readonly rendered: Extract<RenderedFacts, { readonly ok: true }>;
  /** The template sentence a template position is in (pass 1's). */
  readonly sentenceOf: (position: number) => number;
  readonly placeholders: readonly RowToken[];
}

/** The subjects whose facts name part of the lines (section 4): every id of them is a part trigger beside an all-lines fact. */
const PART_SUBJECTS: ReadonlySet<string> = new Set(['code', 'claim', 'line', 'lines']);
/** The kinds of a part fact a total cue contradicts: its amounts, units and counts. */
const PART_FACT_KINDS: ReadonlySet<FactKind> = new Set(['amount', 'units', 'count']);

/** The stand-in figure a fact's phrase is read as: of its kind's family, with no word of its own. */
export function standIn(kind: FactKind): string {
  switch (kind) {
    case 'amount':
      return '$1.00';
    case 'percent':
      return '1%';
    case 'date':
    case 'date_span':
      return '2026-01-01';
    case 'count':
    case 'units':
    case 'days':
    case 'page':
    case 'version':
    case 'release':
    case 'level':
    case 'year':
    case 'code':
    case 'modifiers':
    case 'quote':
    case 'reference':
      return '1';
  }
}

/** A fact token in the probe text: its fact, its span in the template and its stand-in's [start, end) in the probe. */
interface ProbeFact {
  readonly entry: FactEntry;
  readonly span: TextSpan;
  readonly probe: readonly [number, number];
}

/**
 * The rendered text with each phrase replaced by its stand-in, a space on each side so it is never read as part of a
 * word or a figure beside it; the template position of each of its characters (a stand-in's and its spaces' are its
 * token's start); and each token's stand-in.
 */
function probeOf(rendered: ContradictionInput['rendered']): { readonly text: string; readonly templateAt: readonly number[]; readonly facts: readonly ProbeFact[] } {
  const chunks: string[] = [];
  const templateAt: number[] = [];
  const facts: ProbeFact[] = [];
  rendered.spans.forEach((span) => {
    const [start, end] = span.template;
    if (span.fact === null) {
      chunks.push(rendered.text.slice(span.rendered[0], span.rendered[1]));
      for (let offset = start; offset < end; offset += 1) {
        templateAt.push(offset);
      }
      return;
    }
    const entry = rendered.facts[facts.length] as FactEntry;
    const figure = standIn(entry.kind);
    const from = templateAt.length + 1;
    facts.push({ entry, span: { start, end }, probe: [from, from + figure.length] });
    chunks.push(` ${figure} `);
    templateAt.push(...Array<number>(figure.length + 2).fill(start));
  });
  return { text: chunks.join(''), templateAt, facts };
}

/** Whether a reading's roles contradict a fact's role. */
function roleContradicted(role: FactEntry['role'], reading: FigureReading | undefined): boolean {
  if (role === null) {
    return false;
  }
  if (reading === undefined || reading.unread) {
    return true;
  }
  if (!Array.isArray(reading.roles)) {
    return false;
  }
  // Held in every one of several roles (`every`, two or more): never one fact's.
  const roles: readonly string[] = reading.roles;
  return reading.every || !roles.includes(role);
}

/** The template spans of every fact token its sentence contradicts (the caller sorts every mismatch). */
export function contradictions(input: ContradictionInput): TextSpan[] {
  const { catalog, rendered, sentenceOf } = input;
  const { pattern } = catalog.content;
  const all = catalog.content.lines.map((line) => line.row);
  const probe = probeOf(rendered);
  const read = readAround(probe.text);
  const tokens = read.tokens;
  const byToken = new Map(read.readings.map((reading) => [reading.token, reading]));
  const cues = totalCues().map((cue) => cue.split(' '));

  interface Sentence {
    partWords: boolean;
    totalCue: boolean;
    partRows: number[][];
    facts: { readonly entry: FactEntry; readonly span: TextSpan; readonly reading: FigureReading | undefined }[];
  }
  const sentences = new Map<number, Sentence>();
  const sentence = (index: number): Sentence => {
    const found = sentences.get(index) ?? { partWords: false, totalCue: false, partRows: [], facts: [] };
    sentences.set(index, found);
    return found;
  };

  // The free text's words, each in its template sentence: ADR 0086's closed triggers and the total cues (a stand-in or
  // an edge is never a trigger's or a cue's word).
  tokens.forEach((token, at) => {
    const into = sentence(sentenceOf(probe.templateAt[token.start] as number));
    const word = read.words[at] as WordRead;
    const part = word.part;
    if (part === 'line' || ((part === 'claim' || part === 'each_claim') && pattern.claims > 1) || ((part === 'patient' || part === 'each_patient') && pattern.patients > 1) || (word.astray !== null && word.astray !== 'total')) {
      into.partWords = true;
    }
    if (cues.some((cue) => cue.every((each, offset) => tokens[at + offset]?.text === each))) {
      into.totalCue = true;
    }
  });

  // Each token: its stand-in's reading (none when the stand-in is not read as one figure of its own), and the rows a
  // part-naming token names.
  for (const { entry, span, probe: [start, end] } of probe.facts) {
    const into = sentence(sentenceOf(span.start));
    // A stand-in read as one figure of its own is a token from its start to its end; one no token starts at ("$ 1", read
    // from the "$") or one that runs past it ("1 %") is another figure, so the stand-in is not read.
    const index = tokens.findIndex((token: Token) => token.start === start);
    // No token at the stand-in: findIndex gives -1, which names no token.
    const own = tokens[index]?.end === end;
    into.facts.push({ entry, span, reading: own ? byToken.get(index) : undefined });
    if (PART_SUBJECTS.has(entry.subject)) {
      into.partRows.push([...entry.rows]);
    }
  }
  for (const token of input.placeholders) {
    sentence(sentenceOf(token.start)).partRows.push([token.row]);
  }

  const contradicted: TextSpan[] = [];
  for (const each of sentences.values()) {
    const named = new Set(each.partRows.flat());
    const covering = all.every((row) => named.has(row));
    const partTokens = each.partRows.length > 0 && !covering;
    for (const { entry, span, reading } of each.facts) {
      const allLines = entry.subject === 'pattern' && entry.scope === 'total';
      const partFact = PART_SUBJECTS.has(entry.subject) && PART_FACT_KINDS.has(entry.kind);
      const scopedPart = reading?.scope === 'line' || reading?.scope === 'unit';
      if (
        roleContradicted(entry.role, reading) ||
        (allLines && (each.partWords || partTokens || scopedPart)) ||
        (partFact && each.totalCue)
      ) {
        contradicted.push(span);
      }
    }
  }
  return contradicted;
}
