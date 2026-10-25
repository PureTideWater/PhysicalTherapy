import { describe, expect, it } from 'vitest';

import { readableText } from './readable';

/**
 * The narrative as the verifier reads it (./readable.ts): figures in compatibility digits read as the
 * digits they show, hidden characters and other scripts' digits found where they stand. Every
 * non-ASCII character here is written as a code point, so this file holds none itself.
 */

const cp = (...points: number[]) => String.fromCodePoint(...points);
const digits = (base: number, text: string) => [...text].map((char) => (/\d/.test(char) ? cp(base + Number.parseInt(char, 10)) : char)).join('');
const at = (text: string, spans: readonly { readonly start: number; readonly end: number }[]) => spans.map((span) => text.slice(span.start, span.end));

describe('readableText', () => {
  it('reads fullwidth, mathematical, superscript and subscript digits as the digits they show', () => {
    expect(readableText(`$${digits(0xff10, '1,234.56')}`).text).toBe('$1,234.56');
    expect(readableText(`${digits(0xff10, '47')} claims`).text).toBe('47 claims');
    expect(readableText(digits(0x1d7ce, '47')).text).toBe('47');
    expect(readableText(digits(0x1d7f6, '90')).text).toBe('90');
    expect(readableText(`${cp(0x2074, 0x2077)} claims`).text).toBe('47 claims');
    expect(readableText(digits(0x2080, '12')).text).toBe('12');
    expect(readableText(`${cp(0xbd)} the rate`).text).toBe(`1${cp(0x2044)}2 the rate`);
    for (const plain of ['97110 at $50.00 [1].', '', 'March 5, 2026']) {
      expect(readableText(plain)).toMatchObject({ text: plain, hidden: [], unreadable: [] });
    }
  });

  it('finds every hidden character where it stands and reads the digits around it as one figure', () => {
    for (const hidden of [0x200b, 0x200c, 0x200d, 0x2060, 0xad, 0xfeff, 0x202e, 0x2066, 0x180e, 0x034f, 0xfe0f, 0xe000, 0x0007, 0x2028, 0x3164]) {
      const text = `1${cp(hidden)}11 claims`;
      const read = readableText(text);
      expect(read.text, hidden.toString(16)).toBe('111 claims');
      expect(read.hidden.length, hidden.toString(16)).toBe(1);
      expect(text.slice(read.hidden[0]?.start, read.hidden[0]?.end).includes(cp(hidden)), hidden.toString(16)).toBe(true);
    }
    // A run of them is one span; tabs and line breaks are text.
    expect(readableText(`a${cp(0x200b, 0x200b)}b`).hidden).toEqual([{ start: 1, end: 3 }]);
    expect(readableText('a\tb\nc\r\nd')).toMatchObject({ text: 'a\tb\nc\r\nd', hidden: [] });
  });

  it('treats a mark on a digit or a symbol as hidden, and a mark on a letter as the letter', () => {
    const underlined = `1${cp(0x0332)}1${cp(0x0332)} claims`;
    expect(readableText(underlined)).toMatchObject({ text: '11 claims', hidden: [{ start: 0, end: 4 }] });
    const keycap = `${cp(0x31, 0xfe0f, 0x20e3)} claim`;
    expect(readableText(keycap)).toMatchObject({ text: '1 claim', hidden: [{ start: 0, end: 3 }] });
    expect(readableText(`Jos${cp(0x65, 0x301)}`)).toMatchObject({ text: `Jos${cp(0xe9)}`, hidden: [] });
    expect(readableText(`x${cp(0x0332)}`)).toMatchObject({ hidden: [] });
  });

  it('finds digits of other scripts, which it does not read', () => {
    const arabic = `${cp(0x664, 0x667)} claims and ${cp(0x967)} more`;
    const read = readableText(arabic);
    expect(at(arabic, read.unreadable)).toEqual([cp(0x664, 0x667), cp(0x967)]);
    expect(read.hidden).toEqual([]);
    expect(readableText(cp(0x3007)).unreadable).toHaveLength(1);
  });

  it('maps a span of what it read back to the text as written', () => {
    const text = `Paid $${digits(0xff10, '50')} on 1${cp(0x200b)}2 lines`;
    const read = readableText(text);
    expect(read.text).toBe('Paid $50 on 12 lines');
    const amount = read.text.indexOf('$50');
    expect(text.slice(read.original(amount, amount + 3).start, read.original(amount, amount + 3).end)).toBe(`$${digits(0xff10, '50')}`);
    const lines = read.text.indexOf('12');
    expect(read.original(lines, lines + 2)).toEqual({ start: text.indexOf('1', 8), end: text.indexOf(' lines') });
    expect(read.original(3, 3)).toEqual({ start: 3, end: 3 });
    expect(read.original(read.text.length, read.text.length)).toEqual({ start: text.length, end: text.length });
    // An empty span inside what one character expands to (a vulgar fraction) is where that character starts.
    const fraction = readableText(`a${cp(0xbd)}`);
    expect(fraction.text).toBe(`a1${cp(0x2044)}2`);
    expect(fraction.original(2, 2)).toEqual({ start: 1, end: 1 });
    expect(fraction.original(1, 3)).toEqual({ start: 1, end: 2 });
  });
});

describe('readableText: the inputs each rule separates', () => {
  it('treats a mark as part of a letter only when the cluster starts with the letter', () => {
    // A parenthesized letter is a parenthesis, a letter and a parenthesis in NFKC: its mark is on the parenthesis.
    expect(readableText(`${cp(0x249c, 0x301)} claims`)).toMatchObject({ text: '(a) claims', hidden: [{ start: 0, end: 2 }] });
  });
});
