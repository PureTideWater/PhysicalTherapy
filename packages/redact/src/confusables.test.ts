import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { LOOK_ALIKES } from './confusables';
import { fold } from './redact';

/**
 * The look-alike table the letter reader's fold reads (confusables.ts; docs/adr/0054, the amendment of
 * co-001/redact-ssn-phone-leaks, ruling A'): letters and digits of other scripts, and Latin letters outside ASCII, that
 * read as one ASCII letter or digit. The table is data copied from the Unicode confusables file (UTS #39, version 10.0.0)
 * by a stated rule, never fetched at build time, so it is pinned here whole: its size, the shape of every entry and a hash
 * of its content. An edit of one entry, an entry added or one dropped fails the hash; to move to a later version of the
 * data, regenerate both lists by the rule confusables.ts states and update the count and the hash below with them.
 *
 * Every look-alike in this file is written as an escape, never as the character: a Cyrillic capital A in the source would
 * read as the Latin one to a reviewer, which is the very confusion under test.
 */

const hex = (codePoint: string) => (codePoint.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');

/** Each entry as "HEX=target" (the source's code point in upper-case hexadecimal, four digits or more), sorted as strings. */
const lines = () => [...LOOK_ALIKES].map(([source, target]) => `${hex(source)}=${target}`).sort();

describe('LOOK_ALIKES: the look-alike table', () => {
  it('holds 411 entries: the 395 of the confusables data and the 16 small capitals', () => {
    expect(LOOK_ALIKES.size).toBe(411);
    // No source is listed twice with two readings: as many lines as entries.
    expect(new Set(lines().map((line) => line.split('=')[0])).size).toBe(411);
  });

  it('reads one code point outside ASCII, a letter or a number that NFKC leaves as it is, as one ASCII letter or digit, in every entry', () => {
    for (const [source, target] of LOOK_ALIKES) {
      const where = `U+${hex(source)}`;
      expect([...source], where).toHaveLength(1);
      expect(source.codePointAt(0), where).toBeGreaterThanOrEqual(0x80);
      // NFKC text is what the fold reads: a source NFKC rewrites would never be met.
      expect(source.normalize('NFKC'), where).toBe(source);
      expect(source, where).toMatch(/^[\p{L}\p{N}]$/u);
      expect(target, where).toMatch(/^[A-Za-z0-9]$/u);
    }
  });

  it('is the table its hash pins: SHA-256 of its "HEX=target" lines, sorted as strings and joined by line feeds', () => {
    const digest = createHash('sha256').update(lines().join('\n'), 'utf8').digest('hex');
    expect(digest).toBe('2fffa228cc7bc4d7d6167e3929d62bf82c4441bbb1cb1cbb0dbc27e68a4cad8f');
  });

  it.each([
    ['Cyrillic capital A', '\u0410', 'A'],
    ['Cyrillic small a', '\u0430', 'a'],
    ['Cyrillic capital IE', '\u0415', 'E'],
    ['Cyrillic capital ER', '\u0420', 'P'],
    ['Cyrillic capital EN', '\u041D', 'H'],
    ['Cyrillic capital DZE', '\u0405', 'S'],
    ['Cyrillic capital ZE, which reads as a digit', '\u0417', '3'],
    ['Greek capital alpha', '\u0391', 'A'],
    ['Greek capital epsilon', '\u0395', 'E'],
    ['Greek capital rho', '\u03A1', 'P'],
    ['Greek capital iota', '\u0399', 'I'],
    ['Greek capital zeta', '\u0396', 'Z'],
    ['Greek capital eta', '\u0397', 'H'],
    ['Greek capital upsilon', '\u03A5', 'Y'],
    ['Greek small upsilon, as the data gives it', '\u03C5', 'u'],
    ['the small capital H', '\u029C', 'H'],
    ['the small capital A', '\u1D00', 'A'],
    ['the small capital Q', '\uA7AF', 'Q'],
    ['the dotless i', '\u0131', 'i'],
  ])('reads %s (%j) as %s', (_name, source, target) => {
    expect(LOOK_ALIKES.get(source)).toBe(target);
  });

  it('holds no ASCII character, no letter the data reads as two characters, and no Greek or Cyrillic letter that looks like no Latin one', () => {
    // A, l, 0 and 1; the ligature ae; Greek capital phi and small omega; Cyrillic capital ZHE.
    for (const absent of ['A', 'l', '0', '1', '\u00E6', '\u03A6', '\u03C9', '\u0416']) {
      expect(LOOK_ALIKES.has(absent), `U+${hex(absent)}`).toBe(false);
    }
  });
});

describe('fold: one code point as the letter reader matches it, a look-alike read as the ASCII letter or digit it stands for', () => {
  it('folds both cases of every cased letter of the table to one thing, one ASCII capital letter or digit', () => {
    let cased = 0;
    for (const [source] of LOOK_ALIKES) {
      const small = source.toLowerCase();
      const capital = source.toUpperCase();
      if (small === capital) continue;
      cased += 1;
      const where = `U+${hex(source)}`;
      expect(fold(source), where).toMatch(/^[A-Z0-9]$/u);
      // A name stored in one case is found written in the other, whatever each case looks like.
      expect([...small].map(fold).join(''), where).toBe(fold(source));
      expect([...capital].map(fold).join(''), where).toBe(fold(source));
    }
    // The count of cased sources is a property of the pinned table: 215 of the 411.
    expect(cased).toBe(215);
  });

  it('folds a cased letter to its capital’s look-alike where the two cases look like two letters, and to its own where the capital has none', () => {
    // Greek small upsilon looks like "u" and capital upsilon like "Y": both are Y. Small nu looks like "v", capital nu like "N": both N.
    expect([fold('\u03C5'), fold('\u03A5')]).toEqual(['Y', 'Y']);
    expect([fold('\u03BD'), fold('\u039D')]).toEqual(['N', 'N']);
    // The Latin tone five: its capital reads as the digit, so both do.
    expect([fold('\u01BD'), fold('\u01BC')]).toEqual(['5', '5']);
    // Cyrillic small ghe looks like "r" and its capital like no ASCII letter: both are R.
    expect(LOOK_ALIKES.has('\u0413')).toBe(false);
    expect([fold('\u0433'), fold('\u0413')]).toEqual(['R', 'R']);
    for (const [source, target] of LOOK_ALIKES) {
      // A decimal digit is its value, whatever the table reads it as (below).
      if (/^\p{Nd}$/u.test(source)) continue;
      const other = source === source.toLowerCase() ? source.toUpperCase() : source.toLowerCase();
      const readings = [target, LOOK_ALIKES.get(other)].flatMap((reading) => (reading === undefined ? [] : [reading.toUpperCase()]));
      expect(readings, `U+${hex(source)}`).toContain(fold(source));
      // A letter with one case alone has one reading: the table's own.
      if (other === source) expect(fold(source), `U+${hex(source)}`).toBe(target.toUpperCase());
    }
  });

  it.each([
    ['Cyrillic capital and small A', '\u0410\u0430', 'AA'],
    ['Greek capital and small alpha', '\u0391\u03B1', 'AA'],
    ['the small capital A', '\u1D00', 'A'],
    ['Greek capital epsilon, rho and iota', '\u0395\u03A1\u0399', 'EPI'],
    ['the small capitals H and A', '\u029C\u1D00', 'HA'],
    ['Cyrillic capital ZE, a letter that reads as a digit', '\u0417', '3'],
    ['ZEPHYRA with Cyrillic IE, ER, EN and A', 'Z\u0415\u0420\u041DYR\u0410', 'ZEPHYRA'],
    ['ZEPHYRA with Greek zeta, epsilon, rho, eta, upsilon and alpha', '\u0396\u0395\u03A1\u0397\u03A5R\u0391', 'ZEPHYRA'],
    ['zephyra in small capitals', '\u1D22\u1D07\u1D18\u029C\u028F\u0280\u1D00', 'ZEPHYRA'],
  ])('folds %s (%j), letter by letter, to %s', (_name, written, read) => {
    expect([...written].map(fold).join('')).toBe(read);
  });

  it('keeps a letter with no look-alike its own capital, its marks dropped as before: Greek phi and omega, Cyrillic ZHE, an accented e, the sharp s as SS', () => {
    expect(['\u03C6', '\u03A6', '\u03C9', '\u03A9', '\u0436', '\u0416'].map(fold)).toEqual(['\u03A6', '\u03A6', '\u03A9', '\u03A9', '\u0416', '\u0416']);
    expect(['\u00E9', '\u00C9', '\u00DF', '\u1E9E'].map(fold)).toEqual(['E', 'E', 'SS', 'SS']);
    // A name stored in Greek is found in either case, the look-alikes and the other letters alike: "Zephyra Vantri" in Greek
    // small letters with accents, and in Greek capitals, fold to one thing.
    const folded = (text: string) => [...text.normalize('NFKC')].map(fold).join('');
    const small = '\u0396\u03AD\u03C6\u03C5\u03C1\u03B1 \u0392\u03AC\u03BD\u03C4\u03C1\u03B7';
    const capitals = '\u0396\u0395\u03A6\u03A5\u03A1\u0391 \u0392\u0391\u039D\u03A4\u03A1\u0397';
    expect(folded(small)).toBe(folded(capitals));
    expect(folded(small)).toBe('ZE\u03A6YPA BANTPH');
  });

  it('folds a decimal digit of another script to its value, the thirty the table reads as letters too', () => {
    // The zero of each script's digits: Arabic-Indic, extended Arabic-Indic, NKo, Devanagari, Bengali, Gurmukhi, Gujarati,
    // Oriya, Tamil, Telugu, Kannada, Malayalam, Thai, Lao, Tibetan, Myanmar, Khmer, Mongolian, full width, and the five
    // mathematical alphabets, whose fifty digits lie in one run.
    const zeros = [0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810, 0xff10, 0x1d7ce, 0x1d7d8, 0x1d7e2, 0x1d7ec, 0x1d7f6];
    for (const zero of zeros) {
      const digits = Array.from({ length: 10 }, (_, value) => fold(String.fromCodePoint(zero + value))).join('');
      expect(digits, `U+${zero.toString(16)}`).toBe('0123456789');
    }
    // The data reads some digits as letters by their look (the Arabic-Indic one as "I", five as "o", seven as "V"): a digit
    // is a digit to the reader, so the call's own number written in another script's digits is read as the number.
    expect(['\u0661', '\u0665', '\u0667'].map((digit) => LOOK_ALIKES.get(digit))).toEqual(['I', 'o', 'V']);
    expect(['\u0661', '\u0665', '\u0667'].map(fold)).toEqual(['1', '5', '7']);
    const digitsInTable = [...LOOK_ALIKES.keys()].filter((source) => /^\p{Nd}$/u.test(source));
    expect(digitsInTable).toHaveLength(30);
    // Every decimal digit there is (planes 0 and 1 hold them all) folds to one ASCII digit.
    const unread: string[] = [];
    for (let at = 0x80; at <= 0x1ffff; at += 1) {
      if (at >= 0xd800 && at <= 0xdfff) continue;
      const codePoint = String.fromCodePoint(at);
      if (/^\p{Nd}$/u.test(codePoint) && !/^[0-9]$/u.test(fold(codePoint))) unread.push(`U+${at.toString(16)}`);
    }
    expect(unread).toEqual([]);
  });

  it('leaves ASCII as it was: a small letter folds to its capital, and a capital, a digit and every other character to itself, none read as its look-alike', () => {
    for (let at = 0; at < 0x80; at += 1) {
      const character = String.fromCharCode(at);
      expect(fold(character), `U+${hex(character)}`).toBe(at >= 0x61 && at <= 0x7a ? String.fromCharCode(at - 0x20) : character);
    }
    // The pairs a scan confuses stay apart in the fold: only the digit-for-letter reading of the call's own identifiers reads one for the other.
    expect(['l', 'I', '1', 'O', '0', 'S', '5', 'B', '8'].map(fold)).toEqual(['L', 'I', '1', 'O', '0', 'S', '5', 'B', '8']);
  });
});
