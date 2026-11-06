import type { FactCatalog } from '../fact-catalog';
import { PLACEHOLDER_KINDS } from '../facts';
import { type ReadableText, type TextSpan, readableText } from '../readable';
import { type RenderedFacts, renderFacts } from '../render';
import { type StrictScan, scanText, sentenceSpans } from '../scan';
import { contradictions } from './contradiction';
import { DATED, type Mismatch, type MismatchCode, type NarrativeCheck, identifierSpans, sentenceFinder } from './mismatches';

/**
 * The template check of verifier format tp-packet-verifier/3 (design lane-b-packet-figure-placeholders, section 4;
 * docs/adr/0089): a narrative whose figures are fact tokens ({{fact:<id>}}) that code renders from the version's content
 * (../render.ts), read against the facts' catalog (../fact-catalog.ts). Browser-safe like ./mismatches.ts: no hash, no
 * Node module. Nothing reaches it but an explicit request for that format (./index.ts verifyTemplate and
 * verifyAtFormat); format /2 (./mismatches.ts) is unchanged.
 *
 * Pass 1 reads the template as it shows (../readable.ts) and scans it strictly (../scan.ts, "Strict mode": its tokens
 * masked first, so no digit inside an id is read), and fails:
 * - every figure its free text holds: `free_figure` for one written in symbols (digits, a sign, a numeral, a date, a
 *   code, a Roman numeral, an ordinal day of a month), `number_word` for one written in words (a number word of the
 *   scanner's tables, a lone "one" or "zero" too, the strict-only words, a zero amount in prose);
 * - every fact token whose id the catalog does not hold for this content, every run in double braces that neither a
 *   fact token nor an identifier placeholder reads and every lone {{ or }} (`unknown_fact`), and every token written
 *   other than as the text shows it (a brace or letter that normalizes to one), which the renderer would not read;
 * - every well-formed id that names its set of lines by a lower subject than the catalog's (`fact_not_canonical`), its
 *   mismatch carrying the canonical id (the renderer's lookupFact, the one rule the catalog and the picker share);
 * - as format /2 does: hidden characters, figures in other digits, the case's own identifiers, identifier placeholders
 *   naming no kind or row (or written other than as they show), markers naming no source, sentences with no marker,
 *   an empty template.
 * A malformed token is never echoed: a mismatch holds codes, positions and a canonical id only.
 *
 * The ids are read by rendering the template as written, with identifier placeholders left unfilled (renderFacts): each
 * token the renderer refuses fails with the renderer's code, so no template passes that does not render, and the
 * rendered text is the one rendered_sha256 hashes.
 * Pass 2 (./contradiction.ts), the contradiction check over the rendered text (`fact_contradicted`, section 4), reads
 * the rendered text through its span map, each token's role and scope the catalog's, and reports in template offsets.
 */

/** A template read once: the check, and the template rendered (null when a token renders nothing). */
export interface TemplateReading {
  readonly check: NarrativeCheck;
  readonly rendered: Extract<RenderedFacts, { readonly ok: true }> | null;
}

/**
 * The template's sentences, in its own positions: each fact token and stray read as a word (a run of `x`), so a token
 * standing alone is a sentence and the dots inside an id never end one.
 */
function templateSentences(readable: ReadableText, scan: StrictScan): TextSpan[] {
  const chars = readable.text.split('');
  for (const span of [...scan.facts, ...scan.strays]) {
    chars.fill('x', span.start, span.end);
  }
  return sentenceSpans(chars.join('')).map((span) => readable.original(span.start, span.end));
}

/**
 * A template's sentences as the verifier counts them at format /3, at their spans in the template: the rule a drafted
 * sentence is held to (../serialize.ts; one drafted sentence is one verifier sentence).
 */
export function templateSentenceSpans(template: string): TextSpan[] {
  const readable = readableText(template);
  return templateSentences(readable, scanText(readable.text, { strict: true }));
}

/** Reads a template against a version's catalog and the case's own identifiers (none in the browser). */
export function readTemplate(template: string, catalog: FactCatalog, identifiers: readonly string[]): TemplateReading {
  const readable = readableText(template);
  const { text } = readable;
  const scan = scanText(text, { strict: true });
  const sentences = templateSentences(readable, scan);
  const sentenceOf = sentenceFinder(sentences);
  const mismatches: Mismatch[] = [];
  const at = (span: TextSpan) => readable.original(span.start, span.end);
  const add = (code: MismatchCode, kind: Mismatch['kind'], span: TextSpan, canonical?: string) => {
    mismatches.push({ code, kind, sentence: sentenceOf(span.start), start: span.start, end: span.end, ...(canonical === undefined ? {} : { canonical }) });
  };
  // A token whose characters are not the ones it shows: the renderer reads the template as written, so it would not.
  const asWritten = (span: TextSpan, token: string) => {
    const original = at(span);
    return template.slice(original.start, original.end) === token;
  };

  if (sentences.length === 0) {
    mismatches.push({ code: 'empty_narrative', kind: null, sentence: -1, start: 0, end: template.length });
  }
  for (const span of readable.hidden) {
    add('hidden_character', null, span);
  }
  for (const span of readable.unreadable) {
    add('unreadable_figure', null, span);
  }
  for (const figure of scan.figures) {
    add(figure.written === 'words' ? 'number_word' : 'free_figure', figure.kind, at(figure));
  }
  // A token written other than as it shows; every other token's id is the renderer's to read (below).
  for (const token of scan.facts) {
    if (!asWritten(token, text.slice(token.start, token.end))) {
      add('unknown_fact', 'fact', at(token));
    }
  }
  for (const stray of scan.strays) {
    add('unknown_fact', 'fact', at(stray));
  }
  const rows = new Set(catalog.content.lines.map((line) => line.row));
  for (const token of scan.placeholders) {
    if (!PLACEHOLDER_KINDS.has(token.kind) || !rows.has(token.row) || !asWritten(token, text.slice(token.start, token.end))) {
      add('unknown_placeholder', 'placeholder', at(token));
    }
  }
  const skip = [...scan.placeholders, ...scan.markers, ...scan.facts, ...scan.strays, ...scan.figures.filter((figure) => DATED.has(figure.kind))];
  for (const span of identifierSpans(text, identifiers, skip)) {
    add('identifier_in_narrative', 'identifier', at(span));
  }
  const sources = new Set(catalog.content.sources.map((source) => source.marker));
  for (const marker of scan.markers) {
    if (marker.sources.some((source) => !sources.has(source))) {
      add('unknown_citation', 'citation', at(marker));
    }
  }
  const markers = scan.markers.map(at);
  sentences.forEach((span, index) => {
    if (!markers.some((marker) => marker.start >= span.start && marker.start < span.end)) {
      mismatches.push({ code: 'sentence_without_citation', kind: null, sentence: index, start: span.start, end: span.end });
    }
  });

  // The template rendered as written: each token the renderer refuses (an id the catalog does not hold, or one not
  // canonical, with the canonical id; a run in braces no pattern reads) fails at its span, unless a token or a stray
  // read above already marks it.
  const render = renderFacts(template, catalog);
  if (!render.ok) {
    const marked = mismatches.filter((mismatch) => mismatch.kind === 'fact');
    for (const problem of render.problems) {
      const [start, end] = problem.span;
      if (!marked.some((mismatch) => mismatch.start <= start && end <= mismatch.end)) {
        add(problem.code, 'fact', { start, end }, problem.canonical ?? undefined);
      }
    }
  }
  const rendered = render.ok ? render : null;
  // Pass 2: the rendered text read for contradiction only, each finding at its token's span in the template.
  if (rendered !== null) {
    const placeholders = scan.placeholders.map((token) => ({ ...at(token), row: token.row }));
    for (const span of contradictions({ catalog, rendered, sentenceOf, placeholders })) {
      add('fact_contradicted', 'fact', span);
    }
  }

  mismatches.sort((a, b) => a.start - b.start || a.end - b.end || a.code.localeCompare(b.code));
  const checked = scan.figures.length + scan.placeholders.length + scan.markers.length + scan.facts.length + scan.strays.length;
  return { check: { passed: mismatches.length === 0, sentences: sentences.length, checked, mismatches }, rendered };
}
