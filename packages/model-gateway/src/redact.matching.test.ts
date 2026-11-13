import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { matchingForTests } from '@tp/redact';
import { mod12Identifiers, screenTwinIdentifiers } from '@tp/synth';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { fuzzLetters } from './test-support/fuzz-letters';
import { SHORT_LETTER, TWIN, checkOnce, nineCharacterNumbers, oneClaim } from './test-support/many-identifiers';
import { REFERENCE_CALIBRATION_MS, SLOWDOWN_FLOOR_PERCENT, timed } from './test-support/time-budget';

/**
 * Queues item 39 (MOD-26; docs/adr/0054, the pinned rows of the cold first check and of G-1): the call's identifiers
 * are matched without a pattern built per identifier per check, and what is redacted does not change. SYNTHETIC only.
 */

/**
 * Every code point the skeleton keeps (K): letters and decimal digits, the three APOSTROPHE_LETTERs not, and no number
 * character that is no decimal digit (\p{Nl}, \p{No}), which a stored number's gap holds since Queues item 40 (S-4).
 */
const KEPT: string[] = [];
for (let code = 0; code <= 0x10ffff; code += 1) {
  if (code >= 0xd800 && code <= 0xdfff) {
    continue;
  }
  const codePoint = String.fromCodePoint(code);
  if (matchingForTests.kept(codePoint)) {
    KEPT.push(codePoint);
  }
}

/** The fastest of `runs` processor-time measures of `work`, in milliseconds. */
function fastest(runs: number, work: () => unknown): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run += 1) {
    const used = process.threadCpuUsage();
    work();
    const after = process.threadCpuUsage(used);
    best = Math.min(best, (after.user + after.system) / 1000);
  }
  return best;
}

describe('MOD-26: the letter check with many identifiers on the call (Queues item 39)', () => {
  it('(a) G-1: a 19-character letter with 6,300 nine-character claim numbers is checked under 3 s, and doubling the numbers less than doubles the time again', () => {
    const half = oneClaim(nineCharacterNumbers(3_150));
    const whole = oneClaim(nineCharacterNumbers(6_300));
    // Warm: the cold first check is row (b)'s.
    expect(checkOnce(SHORT_LETTER, TWIN, half)).toBe('sent');
    const run = timed(3_000, () => checkOnce(SHORT_LETTER, TWIN, whole));
    expect(run.value).toBe('sent');
    expect(run.ms, run.said).toBeLessThan(run.allowedMs);
    // Linear and noise, not the square: 3,150 to 6,300 numbers is about 2x, never 4x.
    const halfMs = fastest(3, () => checkOnce(SHORT_LETTER, TWIN, half));
    const wholeMs = fastest(3, () => checkOnce(SHORT_LETTER, TWIN, whole));
    // Under 2.2 times, in tenths.
    expect(10 * wholeMs, `${halfMs.toFixed(0)} ms for 3,150 numbers, ${wholeMs.toFixed(0)} ms for 6,300`).toBeLessThan(22 * halfMs);
  }, 300_000);

  it('(b) cold: in a fresh process, the first check of a letter with 1,000 nine-character claim numbers is under 1 s', async () => {
    const support = path.join(import.meta.dirname, 'test-support', 'many-identifiers.ts');
    const tsx = path.resolve(import.meta.dirname, '../../../node_modules/.bin/tsx');
    const { stdout } = await promisify(execFile)(tsx, [support, '1000'], { maxBuffer: 1024 * 1024, timeout: 120_000 });
    const cold = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as { outcome: string; ms: number; calibrationMs: number };
    expect(cold.outcome).toBe('sent');
    // As timed(): the budget is the reference machine's, allowed more only by this machine's measured slowness.
    const ratio = cold.calibrationMs / REFERENCE_CALIBRATION_MS;
    const allowedMs = 1_000 * (ratio * 100 > 100 + SLOWDOWN_FLOOR_PERCENT ? ratio : 1);
    expect(cold.ms, `${cold.ms.toFixed(0)} ms of processor time against ${allowedMs.toFixed(0)} ms allowed`).toBeLessThan(allowedMs);
  }, 180_000);

  it('(c) lemma 1(a): no gap a form can hold between two of its characters matches a letter or a digit it keeps', () => {
    // The stored marks' escapes are of characters no compact keeps (numberForm); a sample of every kind is read here.
    const stored = ['/', '.', ',', '+', ':', '#', '(', ')', '&', '*', ' ', ' ', ' ', 'ʼ'].map((mark) => `\\u{${(mark.codePointAt(0) ?? 0).toString(16)}}`);
    const gaps = matchingForTests.gapSources([stored.join(''), ...stored]);
    expect(gaps.length).toBeGreaterThanOrEqual(9);
    // Each kept code point alone and after what a gap reads before a letter: a gap's match that holds one is a failure.
    const contexts = ['', ' ', '-', '.', '/', '­', '-\n', "'", 'ʼ', '/'.repeat(3)];
    const holdsKept = { test: (text: string) => [...text].some((codePoint) => matchingForTests.kept(codePoint)) };
    const failures: string[] = [];
    for (const gap of gaps) {
      const pattern = new RegExp(`(?:${gap})`, 'gu');
      for (const context of contexts) {
        const text = KEPT.map((codePoint) => `${context}${codePoint}`).join('\u0000');
        for (const match of text.matchAll(pattern)) {
          if (holdsKept.test(match[0])) {
            failures.push(`${gap.slice(0, 40)} matched ${JSON.stringify(match[0])}`);
            break;
          }
        }
      }
    }
    expect(KEPT.length).toBeGreaterThan(100_000);
    expect(failures).toEqual([]);
  }, 120_000);

  it('(c) lemma 1 with item 40: a number character is no kept code point, so a stored number with one inside stands', () => {
    for (const codePoint of ['ↀ', '²', '½', '፩', 'Ⅻ', '\u{10107}', '①']) {
      expect(matchingForTests.kept(codePoint)).toBe(false);
    }
    for (const codePoint of ['7', '٣', 'A', 'é', '\u{1D7CE}']) {
      expect(matchingForTests.kept(codePoint)).toBe(true);
    }
    const text = 'Member ID 7654ↀ3210, ref 7654½\uFFFC3210 and 7654²3210.';
    expect(matchingForTests.placesOf(text, ['76543210']).get('76543210')).toEqual([10, 25, 40]);
  });

  describe('(d) the automaton finds every place of every word, as indexOf over the letters and digits does', () => {
    // Letters and digits of one and two code units, cased, and marks no compact keeps between them.
    const keptAlphabet = ['A', 'B', 'a', '1', '0', '٣', 'É', '\u{1D400}', '\u{1D7CE}', '\u{20000}'];
    const marks = [' ', '-', '­', 'ʼ', '.', '\n', '\u{1F600}'];

    /** The reference: the text's kept code points as one string, and for each code unit of it the text index of its code point. */
    function skeleton(text: string): { readonly joined: string; readonly at: number[] } {
      let joined = '';
      const at: number[] = [];
      let index = 0;
      for (const codePoint of text) {
        if (matchingForTests.kept(codePoint)) {
          joined += codePoint;
          for (let unit = 0; unit < codePoint.length; unit += 1) at.push(index);
        }
        index += codePoint.length;
      }
      return { joined, at };
    }

    function byIndexOf(text: string, words: readonly string[]): Map<string, number[]> {
      const { joined, at } = skeleton(text);
      const places = new Map<string, number[]>();
      for (const word of new Set(words)) {
        const starts: number[] = [];
        for (let found = joined.indexOf(word); found !== -1; found = joined.indexOf(word, found + 1)) {
          // indexOf may land inside a pair only for a word that begins with a low surrogate: none is written here.
          starts.push(at[found] ?? -1);
        }
        if (starts.length > 0) places.set(word, starts);
      }
      return places;
    }

    const word = fc.array(fc.constantFrom(...keptAlphabet.slice(0, 4), ...keptAlphabet.slice(7)), { minLength: 1, maxLength: 5 }).map((points) => points.join(''));
    const text = fc.array(fc.oneof({ weight: 4, arbitrary: fc.constantFrom(...keptAlphabet) }, { weight: 1, arbitrary: fc.constantFrom(...marks) }), { maxLength: 80 }).map((points) => points.join(''));

    it('on generated texts and words, overlapping words and a word inside another included', () => {
      fc.assert(
        fc.property(text, fc.array(word, { minLength: 1, maxLength: 12 }), (written, words) => {
          expect(matchingForTests.placesOf(written, words)).toEqual(byIndexOf(written, words));
        }),
        { numRuns: 2_000 },
      );
    });

    it('on words that overlap themselves and each other, written over marks', () => {
      const written = 'AAA-A­AAB ABʼAB 1\u{1D400}1\u{1D400}1';
      const words = ['A', 'AA', 'AAA', 'AB', 'BA', 'ABAB', '1\u{1D400}1', '\u{1D400}'];
      const places = matchingForTests.placesOf(written, words);
      expect(places).toEqual(byIndexOf(written, words));
      expect(places.get('AA')).toEqual([0, 1, 2, 4, 6]);
      expect(places.get('ABAB')).toEqual([7, 10]);
    });
  });

  describe('(e) lemma 4: the source a form keeps is the source V8 gives its pattern', () => {
    it('for writings that need an escape and writings that need none', () => {
      const writings = ['(?<![\\p{L}\\p{N}])Z[/.]*Z(?![\\p{L}\\p{N}])', 'A/B', 'A\\/B', '[/]', '[a/]/', '[\\]/]/', 'A\nB', 'A\rB', 'A B', 'A B', '\\\\/', 'A[\\/]B'];
      for (const writing of writings) {
        expect(matchingForTests.sourceOf(writing), JSON.stringify(writing)).toBe(new RegExp(writing, 'gu').source);
      }
    });

    it('for every form of the synthetic twins, on both folds: no pattern is built, and the kept source is V8’s', () => {
      const twins = screenTwinIdentifiers();
      const marked = screenTwinIdentifiers(['/', '.', ' ', '-', '#', '·']);
      const mod12 = mod12Identifiers();
      const fuzz = fuzzLetters(39, 400);
      const subjects = [
        { names: [...new Set(fuzz.flatMap((letter) => letter.names))], memberIds: [...new Set(fuzz.flatMap((letter) => letter.memberIds))], claims: [[...new Set(fuzz.flatMap((letter) => letter.claimNumbers))]] },
        { names: ['JANE Q ZEPHYRA', 'ÉLODIE O’BRIEN-VANTREE'], memberIds: [...mod12.memberIds], claims: [[...mod12.patientControlNumbers], [...mod12.payerClaimNumbers]] },
      ];
      // The twin practice's values, a slice of each kind as written and with the records' separators.
      for (const set of [twins, marked]) {
        for (let at = 0; at < 4_000; at += 1_000) {
          subjects.push({ names: [], memberIds: set.memberIds.slice(at, at + 1_000), claims: [set.patientControlNumbers.slice(at, at + 1_000), set.payerClaimNumbers.slice(at, at + 1_000)] });
        }
      }
      let forms = 0;
      for (const subject of subjects) {
        for (const fold of ['plain', 'alike'] as const) {
          for (const form of matchingForTests.formsOf(subject, fold)) {
            for (const pattern of [form.pattern, form.labeled]) {
              if (pattern === null) continue;
              forms += 1;
              expect(pattern instanceof RegExp, pattern.source.slice(0, 80)).toBe(false);
              expect(new RegExp(pattern.source, pattern.flags).source).toBe(pattern.source);
            }
          }
        }
      }
      expect(forms).toBeGreaterThan(20_000);
    }, 120_000);
  });
});
