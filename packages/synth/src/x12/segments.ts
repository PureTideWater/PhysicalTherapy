/**
 * The segment-level model every X12 file in packages/synth is built from and rendered from, and the
 * input of the twin generator: interchanges of segments, each segment an ID and its elements, each
 * element its components (a simple element has one). The 835 never repeats an element, so the
 * repetition separator appears only in ISA11.
 */

export interface Delimiters {
  /** Separates elements; ISA position 4. */
  readonly element: string;
  /** Separates the components of a composite element; ISA16 (position 105). */
  readonly component: string;
  /** Separates repetitions; ISA11. */
  readonly repetition: string;
  /** Ends a segment; ISA position 106. */
  readonly segment: string;
}

export const DEFAULT_DELIMITERS: Delimiters = { element: '*', component: ':', repetition: '^', segment: '~' };

/** One element as its components. A simple element is a one-component list. */
export type X12Element = readonly string[];

export interface X12Segment {
  readonly id: string;
  readonly elements: readonly X12Element[];
}

/** One ISA..IEA interchange: its delimiters and every segment from ISA to IEA. */
export interface X12Interchange {
  readonly delimiters: Delimiters;
  readonly segments: readonly X12Segment[];
}

/** A whole file: one or more interchanges, in order. */
export interface X12Document {
  readonly interchanges: readonly X12Interchange[];
}

export class X12BuildError extends Error {
  override readonly name = 'X12BuildError';
}

/** An element written as text, a composite (components) or absent. */
export type ElementInput = string | readonly string[] | undefined | null;

/** Builds a segment, turning absent elements into empty ones. */
export function seg(id: string, ...elements: ElementInput[]): X12Segment {
  return {
    id,
    elements: elements.map((element) => {
      if (element === undefined || element === null) {
        return [''];
      }
      return typeof element === 'string' ? [element] : [...element];
    }),
  };
}

/** Checks four distinct single-character delimiters that are not letters, digits or spaces. */
export function checkDelimiters(delimiters: Delimiters): void {
  const all = [delimiters.element, delimiters.component, delimiters.repetition, delimiters.segment];
  for (const delimiter of all) {
    if (delimiter.length !== 1 || /[A-Za-z0-9 ]/.test(delimiter)) {
      throw new X12BuildError('each delimiter is one character that is not a letter, digit or space');
    }
  }
  if (new Set(all).size !== all.length) {
    throw new X12BuildError('the four delimiters must differ');
  }
}

function trimTrailing(values: readonly string[]): string[] {
  const copy = [...values];
  while (copy.length > 1 && copy[copy.length - 1] === '') {
    copy.pop();
  }
  return copy;
}

/** The text of one segment, without its terminator. Trailing empty elements and components are dropped. */
export function segmentText(segment: X12Segment, delimiters: Delimiters): string {
  const forbidden = [delimiters.element, delimiters.component, delimiters.repetition, delimiters.segment];
  const rendered = segment.elements.map((element, index) => {
    // ISA11 and ISA16 are the repetition and component separators themselves.
    if (segment.id === 'ISA' && (index === 10 || index === 15)) {
      const expected = index === 10 ? delimiters.repetition : delimiters.component;
      if (element.join('') !== expected) {
        throw new X12BuildError(`ISA${String(index + 1)} must be the ${index === 10 ? 'repetition' : 'component'} separator`);
      }
      return expected;
    }
    for (const component of element) {
      if (forbidden.some((delimiter) => component.includes(delimiter))) {
        throw new X12BuildError(`a value in ${segment.id} contains a delimiter`);
      }
    }
    return trimTrailing(element).join(delimiters.component);
  });
  // ISA keeps every element: it is fixed width.
  const elements = [...rendered];
  while (segment.id !== 'ISA' && elements.length > 0 && elements[elements.length - 1] === '') {
    elements.pop();
  }
  return [segment.id, ...elements].join(delimiters.element);
}

export interface RenderOptions {
  /** Written after every segment terminator: '' (none), '\n' or '\r\n'. */
  readonly lineEnding?: '' | '\n' | '\r\n';
  /** A UTF-8 byte-order mark before the first ISA. */
  readonly bom?: boolean;
}

/** Renders a document to text, segment by segment, with each interchange's own delimiters. */
export function renderDocument(document: X12Document, options: RenderOptions = {}): string {
  const lineEnding = options.lineEnding ?? '';
  let text = options.bom === true ? '\uFEFF' : '';
  for (const interchange of document.interchanges) {
    checkDelimiters(interchange.delimiters);
    for (const segment of interchange.segments) {
      text += segmentText(segment, interchange.delimiters) + interchange.delimiters.segment + lineEnding;
    }
  }
  return text;
}

/** Every segment of a document in file order, with its interchange's delimiters. */
export function* documentSegments(document: X12Document): Generator<{ segment: X12Segment; delimiters: Delimiters }> {
  for (const interchange of document.interchanges) {
    for (const segment of interchange.segments) {
      yield { segment, delimiters: interchange.delimiters };
    }
  }
}

/** One element's text (components joined by ':'), or '' when absent. Positions count from 1. */
export function elementValue(segment: X12Segment, position: number, component = 1): string {
  return segment.elements[position - 1]?.[component - 1] ?? '';
}
