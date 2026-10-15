/**
 * The X12 tokenizer (PRD section 10, step 3): text in, segments out, incrementally, so a document of
 * any size passes through in chunks. Delimiters come from each interchange's ISA header (the element
 * separator at position 4, the component separator at 105, the segment terminator at 106, the
 * repetition separator in ISA11); nothing assumes `*`, `:` or `~`. A UTF-8 byte-order mark before
 * the first ISA is recorded and skipped; carriage returns, line feeds, tabs and spaces between
 * segments (after a terminator, at the end of the file) are skipped unless they are delimiters.
 */
import { type EdiError, notAn835, syntaxError } from './errors';

export interface Delimiters {
  /** Separates elements; ISA position 4. */
  readonly element: string;
  /** Separates the components of a composite element; ISA16, position 105. */
  readonly component: string;
  /** Separates repetitions of an element; ISA11. */
  readonly repetition: string;
  /** Ends a segment; ISA position 106. */
  readonly segment: string;
}

/**
 * One segment as read: its index in the file (from 1, ISA being 1, across interchanges), its ID and
 * each element's raw text (components and repetitions still joined by their separators), with the
 * delimiters of its interchange to split them.
 */
export interface Segment {
  readonly index: number;
  readonly id: string;
  readonly elements: readonly string[];
  readonly delimiters: Delimiters;
}

/** Where the tokenizer sends what it reads. */
export interface TokenSink {
  segment(segment: Segment): void;
  /** A document-level error: the tokenizer stops reading. */
  error(error: EdiError): void;
}

/** Widths of ISA01 to ISA16: the header is 106 characters with its separators and terminator. */
export const ISA_WIDTHS = [2, 10, 2, 10, 2, 15, 2, 15, 6, 4, 1, 5, 9, 1, 1, 1] as const;
export const ISA_LENGTH = 106;
/**
 * The longest segment the tokenizer holds while it waits for a terminator. The longest 835 segments run
 * to a few hundred characters; the limit keeps a file without terminators from filling memory.
 */
export const MAX_SEGMENT_LENGTH = 65_536;
const SEGMENT_ID = /^[A-Z][A-Z0-9]{1,2}$/;
const WHITESPACE = ['\r', '\n', '\t', ' '];
const BOM = '﻿';

/** The segment ID if the text is shaped like one, else '' (it may be anything, never echoed). */
export function segmentIdOf(text: string): string {
  return SEGMENT_ID.test(text) ? text : '';
}

/**
 * Reads the fixed-width ISA header. Returns its delimiters and sixteen elements, or the EDI_SYNTAX
 * error at the first element that is not where the fixed widths put it.
 */
export function readIsaHeader(header: string, index: number): { delimiters: Delimiters; elements: string[] } | EdiError {
  const element = header.charAt(3);
  const parts = header.slice(0, ISA_LENGTH - 1).split(element);
  for (let position = 1; position <= ISA_WIDTHS.length; position += 1) {
    if (parts[position]?.length !== ISA_WIDTHS[position - 1]) {
      return syntaxError({ segmentIndex: index, segmentId: 'ISA', elementPosition: position }, 'header');
    }
  }
  const delimiters: Delimiters = { element, repetition: parts[11] as string, component: header.charAt(ISA_LENGTH - 2), segment: header.charAt(ISA_LENGTH - 1) };
  const checks: readonly (readonly [string, number])[] = [
    [delimiters.element, 1],
    [delimiters.repetition, 11],
    [delimiters.component, 16],
    [delimiters.segment, 16],
  ];
  for (const [position, [character, elementPosition]] of checks.entries()) {
    const earlier = checks.slice(0, position).some(([other]) => other === character);
    if (/[A-Za-z0-9 ]/.test(character) || earlier) {
      return syntaxError({ segmentIndex: index, segmentId: 'ISA', elementPosition }, 'header');
    }
  }
  return { delimiters, elements: parts.slice(1) };
}

type Mode = 'start' | 'isa' | 'segments' | 'stopped';

export class Tokenizer {
  private buffer = '';
  private mode: Mode = 'start';
  private delimiters: Delimiters | undefined;
  private skip: ReadonlySet<string> = new Set(WHITESPACE);
  private interchanges = 0;
  /** Segments read so far: the index of the last one. */
  segments = 0;
  /** The text began with a UTF-8 byte-order mark. */
  bom = false;
  /** The largest number of characters held at once waiting for a terminator (memory bound). */
  peakBuffered = 0;

  constructor(private readonly sink: TokenSink) {}

  get stopped(): boolean {
    return this.mode === 'stopped';
  }

  write(text: string): void {
    if (this.mode === 'stopped') {
      return;
    }
    this.buffer += text;
    this.peakBuffered = Math.max(this.peakBuffered, this.buffer.length);
    this.drain(false);
  }

  end(): void {
    if (this.mode === 'start') {
      this.mode = 'isa';
    }
    if (this.mode !== 'stopped') {
      this.drain(true);
    }
  }

  private fail(error: EdiError): void {
    this.halt();
    this.sink.error(error);
  }

  /** Stops reading: everything after this is ignored (a document error was found). */
  halt(): void {
    this.mode = 'stopped';
    this.buffer = '';
  }

  private skipWhitespace(from: number): number {
    let position = from;
    while (position < this.buffer.length && this.skip.has(this.buffer.charAt(position))) {
      position += 1;
    }
    return position;
  }

  private drain(final: boolean): void {
    let position = 0;
    if (this.mode === 'start') {
      if (this.buffer.length === 0) {
        return;
      }
      if (this.buffer.startsWith(BOM)) {
        this.bom = true;
        position = 1;
      }
      this.mode = 'isa';
    }
    // readIsa and readSegment return undefined when they need more input or the tokenizer stopped.
    for (let next: number | undefined = position; next !== undefined; next = this.mode === 'isa' ? this.readIsa(position, final) : this.readSegment(position, final)) {
      position = next;
    }
    if (!this.stopped) {
      this.buffer = this.buffer.slice(position);
    }
  }

  /** Reads one ISA header at `from`; undefined when more input is needed (or the input stopped). */
  private readIsa(from: number, final: boolean): number | undefined {
    const first = this.interchanges === 0;
    const position = first ? from : this.skipWhitespace(from);
    const available = this.buffer.length - position;
    const index = this.segments + 1;
    const head = this.buffer.slice(position, position + 3);
    // The first bytes of an 835 are ISA (PRD section 10, step 2); after an IEA only another ISA may follow.
    if ((available >= 3 && head !== 'ISA') || (final && first && available < 3)) {
      const id = /^[A-Z][A-Z0-9]{1,2}/.exec(head)?.[0] ?? '';
      this.fail(first ? notAn835({ segmentIndex: 1, segmentId: '', elementPosition: 0 }, 'ISA', '') : syntaxError({ segmentIndex: index, segmentId: id, elementPosition: 0 }, 'unexpected_segment', { expected: 'ISA' }));
      return undefined;
    }
    if (available < ISA_LENGTH) {
      if (final && available > 0) {
        // Input ended inside an ISA header: the element being read is the count of separators so far.
        const partial = this.buffer.slice(position);
        const separators = available > 3 ? partial.split(partial.charAt(3)).length - 1 : 0;
        this.fail(syntaxError({ segmentIndex: index, segmentId: available >= 3 ? 'ISA' : '', elementPosition: separators }, 'truncated'));
      }
      return undefined;
    }
    const header = readIsaHeader(this.buffer.slice(position, position + ISA_LENGTH), index);
    if ('code' in header) {
      this.fail(header);
      return undefined;
    }
    this.delimiters = header.delimiters;
    const delimiterSet = new Set(Object.values(header.delimiters));
    this.skip = new Set(WHITESPACE.filter((character) => !delimiterSet.has(character)));
    this.interchanges += 1;
    this.segments = index;
    this.mode = 'segments';
    this.sink.segment({ index, id: 'ISA', elements: header.elements, delimiters: header.delimiters });
    return position + ISA_LENGTH;
  }

  /** Reads one segment at `from`; undefined when more input is needed. */
  private readSegment(from: number, final: boolean): number | undefined {
    const delimiters = this.delimiters as Delimiters;
    const position = this.skipWhitespace(from);
    if (position >= this.buffer.length) {
      return undefined;
    }
    const end = this.buffer.indexOf(delimiters.segment, position);
    const limit = position + MAX_SEGMENT_LENGTH;
    if (end < 0 ? this.buffer.length > limit : end > limit) {
      const head = this.buffer.slice(position, position + 4).split(delimiters.element);
      this.fail(syntaxError({ segmentIndex: this.segments + 1, segmentId: segmentIdOf(head[0] as string), elementPosition: 0 }, 'segment_too_long'));
      return undefined;
    }
    if (end < 0) {
      if (final) {
        const parts = this.buffer.slice(position).split(delimiters.element);
        this.fail(syntaxError({ segmentIndex: this.segments + 1, segmentId: segmentIdOf(parts[0] as string), elementPosition: parts.length - 1 }, 'truncated'));
      }
      return undefined;
    }
    let text = this.buffer.slice(position, end);
    if (text.endsWith('\r') && this.skip.has('\r')) {
      text = text.slice(0, -1);
    }
    const elements = text.split(delimiters.element);
    const id = elements.shift() as string;
    this.segments += 1;
    if (id === 'IEA') {
      this.mode = 'isa';
    }
    this.sink.segment({ index: this.segments, id, elements, delimiters });
    return end + 1;
  }
}
