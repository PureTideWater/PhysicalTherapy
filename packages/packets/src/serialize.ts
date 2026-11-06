import { factPlaceholder } from './placeholders';

/**
 * A drafted narrative's sentences as segments, serialized to a template (design lane-b-packet-figure-placeholders,
 * section 2.3; docs/adr/0089). A model's draft (from slice 6 of that design) and the code draft through the local
 * provider are both written this way, so both reach the verifier's format /3 by one path: a sentence is text segments
 * and fact segments, and the markers of the sources it rests on, which code writes (a model writes none). Pure and
 * browser-safe; the shapes are plain types with no schema library, so the gateway's bounded schema (a later slice) is
 * checked against them, not the other way round.
 *
 * - A sentence is its segments joined as they stand, a fact segment written `{{fact:<id>}}`.
 * - Then ` [n]` per source, in the order given: before the sentence's final `.`, `!` or `?` when its last segment is
 *   text ending in one ("... show {{fact:pattern.allowed}} [3]."), and followed by `.` otherwise (a sentence that ends
 *   in a fact segment, or in text with no final mark), so every sentence ends in one and each is one verifier sentence.
 * - Sentences are joined by one space, paragraphs by a blank line.
 *
 * It checks nothing: the verifier reads what it writes (an id it does not hold, a figure in a text segment, a marker
 * naming no source), so one rule holds for every writer.
 */

/** A piece of a drafted sentence: words, or a fact the renderer prints by its id. */
export type DraftSegment = { readonly text: string } | { readonly fact: string };

export interface DraftSentence {
  readonly segments: readonly DraftSegment[];
  /** The markers of the sources the sentence rests on, in order. */
  readonly sources: readonly number[];
}

export interface DraftParagraph {
  readonly sentences: readonly DraftSentence[];
}

export interface DraftOutput {
  readonly paragraphs: readonly DraftParagraph[];
}

/** One sentence: its segments, then its markers before its final mark (or a period after them). */
export function serializeSentence(sentence: DraftSentence): string {
  const body = sentence.segments.map((segment) => ('fact' in segment ? factPlaceholder(segment.fact) : segment.text)).join('');
  const markers = sentence.sources.map((source) => ` [${String(source)}]`).join('');
  // A fact segment ends in "}}", so a final mark is always its last text segment's.
  const final = /[.!?]$/.exec(body)?.[0];
  return final === undefined ? `${body}${markers}.` : `${body.slice(0, -1)}${markers}${final}`;
}

/** A drafted narrative as the template it stores: sentences joined by one space, paragraphs by a blank line. */
export function serializeDraft(output: DraftOutput): string {
  return output.paragraphs.map((paragraph) => paragraph.sentences.map(serializeSentence).join(' ')).join('\n\n');
}
