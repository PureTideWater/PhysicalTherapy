/**
 * The narrative as the verifier reads it (PRD 12: "any figure that is not in the input fails
 * verification"; test matrix CAS-08). A figure is read from what the text shows, never from how its
 * characters are coded, so before anything is scanned each character (each grapheme cluster, a base
 * and its marks) is put in its NFKC compatibility form: fullwidth, superscript, subscript, circled and
 * mathematical digits become the digits they show, a vulgar fraction becomes digits around a fraction
 * slash, a ligature its letters. Two things are never read and always fail the narrative, each where it
 * stands in the text as written:
 *
 * - a hidden character: one that prints as nothing or as something else (format characters such as the
 *   zero-width space and joiners, the soft hyphen, the word joiner and the direction controls; control
 *   characters other than tab and line breaks; private-use, surrogate and unassigned code points;
 *   variation selectors, the combining grapheme joiner and the Hangul fillers; the line and paragraph
 *   separators; and a combining mark on anything but a letter). It is left out of the text that is
 *   scanned, so the digits around it are read as the one figure they show ("1", a zero-width space, "1"
 *   is the figure 11);
 * - a figure in other digits: any number character that is not 0 to 9 once normalized (Arabic-Indic,
 *   Devanagari and every other script's digits, ideographic and other numerals), which the verifier does
 *   not read and so cannot check.
 *
 * writePacketVersion stores the narrative in NFKC, so the stored text, the verifier's positions and the
 * exported text are the same characters. In the browser, where the person's text may not be normalized
 * yet, the positions still name what the person typed.
 */

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

export interface ReadableText {
  /** The text the scanner reads: every cluster in NFKC, hidden characters left out. */
  readonly text: string;
  /** Hidden characters, at their positions in the original text. */
  readonly hidden: readonly TextSpan[];
  /** Number characters other than 0 to 9, at their positions in the original text. */
  readonly unreadable: readonly TextSpan[];
  /** The original position a span [start, end) of `text` came from. */
  original(start: number, end: number): TextSpan;
}

/**
 * Characters that print as nothing or as something else: controls, format characters, private-use,
 * surrogate and unassigned code points, the line and paragraph separators, and every default-ignorable
 * code point (the soft hyphen, the combining grapheme joiner, the Hangul fillers, the variation
 * selectors and the tags among them).
 */
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\p{Cn}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/gu;
/** Tab and the line breaks are control characters that are text. */
const TEXT_CONTROLS = new Set(['\t', '\n', '\r']);
/** The text without its hidden characters. */
const withoutHidden = (text: string) => text.replace(HIDDEN, (char) => (TEXT_CONTROLS.has(char) ? char : ''));
const MARK = /\p{M}/u;
const MARKS = /\p{M}/gu;
const LETTER = /^\p{L}/u;
/** A number character that is not an ASCII digit. */
const OTHER_NUMBER = /(?![0-9])\p{N}/u;

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function readableText(narrative: string): ReadableText {
  let text = '';
  // For each code unit of `text`, the original span of the cluster it came from.
  const starts: number[] = [];
  const ends: number[] = [];
  const hidden: TextSpan[] = [];
  const unreadable: TextSpan[] = [];
  // Adjacent clusters of one kind are one span.
  const mark = (spans: TextSpan[], span: TextSpan) => {
    const last = spans.at(-1);
    if (last?.end === span.start) {
      spans[spans.length - 1] = { start: last.start, end: span.end };
    } else {
      spans.push(span);
    }
  };
  for (const { segment, index } of segmenter.segment(narrative)) {
    const span = { start: index, end: index + segment.length };
    const normalized = segment.normalize('NFKC');
    let shown = withoutHidden(normalized);
    let isHidden = shown !== normalized || withoutHidden(segment) !== segment;
    if (MARK.test(shown) && !LETTER.test(shown)) {
      isHidden = true;
      shown = shown.replace(MARKS, '');
    }
    if (isHidden) {
      mark(hidden, span);
    }
    if (OTHER_NUMBER.test(shown)) {
      mark(unreadable, span);
    }
    for (let unit = 0; unit < shown.length; unit += 1) {
      starts.push(span.start);
      ends.push(span.end);
    }
    text += shown;
  }
  const original = (start: number, end: number): TextSpan => {
    if (end <= start) {
      const at = start < starts.length ? (starts[start] ?? narrative.length) : narrative.length;
      return { start: at, end: at };
    }
    return { start: starts[start] ?? narrative.length, end: ends[end - 1] ?? narrative.length };
  };
  return { text, hidden, unreadable, original };
}
