import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SCREEN_MAX_IDENTIFIERS } from './patient-records';
import {
  type RunOptions,
  SCREEN_FLOORS,
  SCREEN_MAX_RUN,
  SCREEN_MIN_RUN,
  compactIdentifier,
  holdsIdentifier,
  identifierRuns,
  isCompactCalendarDate,
  runIndex,
  screenIdentifier,
  someIdentifierRun,
  storedSeparators,
} from './redact';

/**
 * The contract screen's side of redact.ts (combined audit item 120; docs/adr/0070, Part 3): the page tokenizer
 * (someIdentifierRun, identifierRuns), the practice's own separators (storedSeparators), the index of kept values
 * (runIndex), the floors the session ruled (Q2) and the stored-side rules (a digit in every kind; 8-digit calendar
 * dates dropped). SYNTHETIC identifiers only.
 */

const runs = (text: string, maxLength = 80, joins?: ReadonlySet<string>) => identifierRuns(text, { minLength: SCREEN_MIN_RUN, maxLength, ...(joins === undefined ? {} : { joins }) });

/** Whether the page names the stored value, as the screen asks it: its compact form looked up through the index, with the value's own separators. */
function screens(page: string, stored: readonly string[]): boolean {
  const values = new Set(stored.map(compactIdentifier));
  const lengths = [...values].map((value) => value.length);
  const options: RunOptions = { minLength: Math.min(SCREEN_MIN_RUN, ...lengths), maxLength: Math.min(SCREEN_MAX_RUN, Math.max(...lengths)), joins: new Set(stored.flatMap(storedSeparators)), index: runIndex(values) };
  return someIdentifierRun(page, options, (run) => values.has(run));
}

/** The tokenizer as it shipped at 9b7eadfe, verbatim: what the new one must find too (every run it found). */
function shippedIdentifierRuns(text: string, options: { readonly minLength: number; readonly maxLength: number }): string[] {
  const JOIN = /^(?:[ \u00A0]|[ \u00A0]?[-\u2010-\u2015][ \u00A0]?)?$/u;
  const TOKEN = /[\p{L}\p{N}]+/gu;
  const NOT_IDENTIFIER = /[^\p{L}\p{N}]/gu;
  const normal = text.normalize('NFKC');
  const tokens = [...normal.matchAll(TOKEN)].map((match) => ({ text: match[0].toUpperCase().replace(NOT_IDENTIFIER, ''), start: match.index, end: match.index + match[0].length }));
  const found = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    let joined = '';
    for (let j = i; j < tokens.length; j += 1) {
      const token = tokens[j];
      const before = tokens[j - 1];
      if (token === undefined || (j > i && (before === undefined || !JOIN.test(normal.slice(before.end, token.start))))) {
        break;
      }
      joined += token.text;
      if (joined.length > options.maxLength) {
        break;
      }
      if (joined.length >= options.minLength) {
        found.add(joined);
      }
    }
  }
  return [...found];
}

describe('identifierRuns: the page runs the contract screen compares', () => {
  it('finds an identifier after a colon, a hash, an opening parenthesis or a word, and before any punctuation', () => {
    for (const text of ['Member ID:ZZ1234567', 'Claim#ZZ1234567', '(ZZ1234567)', 'ID ZZ1234567.', 'member zz1234567, on file', 'ZZ1234567']) {
      expect(runs(text), text).toContain('ZZ1234567');
    }
  });

  it('joins an identifier printed in 2, 3 and 4 groups by one space, one hyphen or dash, or a spaced dash', () => {
    for (const text of ['ZZ 1234567', 'ZZ-1234567', 'ZZ 123 4567', 'ZZ-123-4567', 'ZZ - 123 - 4567', 'ZZ 12 34 567', 'ZZ–1234567', 'ZZ 1234567', 'Member ID:ZZ 123 4567']) {
      expect(runs(text), text).toContain('ZZ1234567');
    }
  });

  it('reads NFKC forms: full-width letters and digits, a no-break space', () => {
    expect(runs('ＺＺ１２３４５６７')).toContain('ZZ1234567');
    expect(runs('ZZ　123 4567')).toContain('ZZ1234567');
  });

  it('joins groups over one dot, slash, underscore or asterisk with no space beside it, as a stored value is written (phi-screen F1)', () => {
    const written: readonly (readonly [string, string])[] = [
      ['Patient Acct: SYNPCN.12001', 'SYNPCN12001'],
      ['Patient Acct: 20261234/01', '2026123401'],
      ['Account SYN_PCN_44551', 'SYNPCN44551'],
      ['Claim E7712000.345 onward', 'E7712000345'],
      ['Member ID ZZ712.0034', 'ZZ7120034'],
      ['Member ID ZZ*7120034', 'ZZ7120034'],
      // Groups split by dots or a slash where the stored form has none (the review's F8 table).
      ['from claim 7712.000.000345 onward', '7712000000345'],
      ['from claim 7712/000000345 onward', '7712000000345'],
    ];
    for (const [text, compact] of written) {
      expect(runs(text), text).toContain(compact);
    }
  });

  it('takes invisible format characters out of a gap and reads a minus sign as a dash, keeping each a token boundary (phi-screen F2)', () => {
    for (const invisible of ['\u00AD', '\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF', '\u034F', '\u00AD\u200B']) {
      expect(runs(`Member ID: ZZ${invisible}7120034`), JSON.stringify(invisible)).toContain('ZZ7120034');
      expect(runs(`Member ID: ZZ 712${invisible}-0034`), JSON.stringify(invisible)).toContain('ZZ7120034');
    }
    expect(runs('Claim number: 77\u22121200\u22120000345')).toContain('7712000000345');
    expect(runs('Claim number: 77 \u2212 1200 \u2212 0000345')).toContain('7712000000345');
    // Still a boundary: what follows an invisible character is a whole token of its own, as before.
    expect(runs('Member ID\u200BZZ7120034')).toContain('ZZ7120034');
    expect(runs('ZZ7120034\u200BJANE')).toContain('ZZ7120034');
    // What is left once they are out is judged as any gap: two spaces, a tab or a line break still end the run.
    for (const text of ['ZZ \u200B 7120034', 'ZZ\u200B\t7120034', 'ZZ\u00AD\n7120034', 'ZZ\u200B--7120034']) {
      expect(runs(text), JSON.stringify(text)).not.toContain('ZZ7120034');
    }
  });

  it('never joins across a newline, a tab, two spaces, two dashes, a dot or slash beside a space, two separators, or any other character', () => {
    for (const text of [
      'ZZ\n1234567',
      'ZZ\r\n1234567',
      'ZZ\t1234567',
      'ZZ  1234567',
      'ZZ--1234567',
      'ZZ - - 1234567',
      'ZZ,1234567',
      'ZZ:1234567',
      'ZZ#1234567',
      'ZZ+1234567',
      'ZZ. 1234567',
      'ZZ .1234567',
      'ZZ / 1234567',
      'ZZ..1234567',
      'ZZ./1234567',
      'ZZ_ 1234567',
      'ZZ\u20281234567',
    ]) {
      expect(runs(text), JSON.stringify(text)).not.toContain('ZZ1234567');
    }
  });

  it('never finds an identifier inside a longer token: the match is whole tokens only', () => {
    expect(runs('AZZ12345678')).not.toContain('ZZ1234567');
    expect(runs('ZZ12345678')).not.toContain('ZZ1234567');
    expect(runs('XZZ1234567')).not.toContain('ZZ1234567');
  });

  it('keeps runs from the minimum to the maximum length only', () => {
    expect(identifierRuns('AB 1234 56789', { minLength: 6, maxLength: 6 })).toEqual(['AB1234']);
    expect(identifierRuns('97110 97112', { minLength: 6, maxLength: 80 })).toEqual(['9711097112']);
    expect(identifierRuns('97110', { minLength: 6, maxLength: 80 })).toEqual([]);
    expect(identifierRuns('ABCDEF', { minLength: 6, maxLength: 5 })).toEqual([]);
  });

  it('agrees with the letter redaction’s identifier pattern on every single-line, single-separator writing (property)', () => {
    const group = fc.string({ unit: fc.constantFrom(...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789abcz'), minLength: 1, maxLength: 6 });
    const separator = fc.constantFrom('', ' ', '-', ' - ', '–', ' – ', ' ', '- ', ' -', '.', '/', '_', '*', '\u2212', ' \u2212 ', '\u00AD', '\u200B', '\uFEFF', '-\u200B');
    const before = fc.constantFrom('', 'Member ID:', 'Claim#', '(', 'ID ', 'see the claim ', 'X\n', '\t');
    const after = fc.constantFrom('', ')', '.', ',', ' on file', '\n', '  next', ';');
    fc.assert(
      fc.property(fc.array(fc.tuple(group, separator), { minLength: 1, maxLength: 4 }), before, after, (groups, prefix, suffix) => {
        const written = groups.map(([text, sep], index) => (index === 0 ? text : `${sep}${text}`)).join('');
        const compact = compactIdentifier(written);
        fc.pre(compact.length >= 6 && compact.length <= 30);
        const text = `${prefix}${written}${suffix}`;
        const tokenizer = runs(text).includes(compact);
        const pattern = holdsIdentifier(text, { pseudonym: 'synthetic', names: [], datesOfBirth: [], memberIds: [written] }, []);
        return tokenizer && pattern;
      }),
      { numRuns: 1000 },
    );
  });

  it('never finds a single-token identifier with a letter or digit joined to it (property)', () => {
    const token = fc.string({ unit: fc.constantFrom(...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789'), minLength: 6, maxLength: 20 });
    const extra = fc.constantFrom(...'AZ09');
    fc.assert(
      fc.property(token, extra, fc.boolean(), (value, character, onTheLeft) => {
        const text = onTheLeft ? `${character}${value}` : `${value}${character}`;
        return !runs(text).includes(value);
      }),
    );
  });

  it('finds every run the shipped tokenizer found, and no other run on a text without the separators it now joins (property)', () => {
    const unit = fc.constantFrom(...'AZaz0919', ' ', ' ', ' ', ' ', '\t', '\n', '\r', '-', '–', '—', 'Ｚ', '１', 'ﬁ', 'é', 'e\u0301', ',', ':', '#', '(', ')', '.', '/', '_', '*', '\u2212', '\u00AD', '\u200B', '\uFEFF', '\u2028');
    const NEW_JOINS = /[./_*\u2212\p{Cf}\p{Default_Ignorable_Code_Point}\p{Pd}]/u;
    fc.assert(
      fc.property(fc.string({ unit, maxLength: 120 }), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 0, max: 20 }), (text, minLength, extra) => {
        const options = { minLength, maxLength: minLength + extra };
        const shipped = new Set(shippedIdentifierRuns(text, options));
        const found = new Set(identifierRuns(text, options));
        const plainDashes = !NEW_JOINS.test(text.replace(/[-\u2010-\u2015]/gu, ''));
        return [...shipped].every((run) => found.has(run)) && (!plainDashes || found.size === shipped.size);
      }),
      { numRuns: 3000 },
    );
  });
});

describe('storedSeparators: the practice’s own separators join its pages (phi-screen F1)', () => {
  it('returns each separator inside a stored value that the tokenizer does not already join, as it reads a gap', () => {
    expect(storedSeparators('ZZ#7120077')).toEqual(['#']);
    expect(storedSeparators('A12:34+5')).toEqual([':', '+']);
    expect(storedSeparators('AB--12-#34')).toEqual(['--', '-#']);
    expect(storedSeparators('AB # 12')).toEqual([' # ']);
    expect(storedSeparators('AB\u200B#\u00AD12')).toEqual(['#']);
    expect(storedSeparators('ＡＢ＃１２')).toEqual(['#']);
    // Only what lies between two letters or digits: punctuation around the value is not inside it.
    expect(storedSeparators('(ZZ#12)')).toEqual(['#']);
  });

  it('adds none the tokenizer joins already, and none holding a line break, a tab or two spaces, which never join', () => {
    for (const value of ['SYNPCN.12001', '20261234/01', 'SYN_PCN_44551', 'ZZ 712-0034', 'ZZ \u2212 712', 'ZZ1234567', 'ZZ\u200B712', 'AB  12', 'AB\t12', 'AB\n12', 'AB #\t12', '#AB12#']) {
      expect(storedSeparators(value), JSON.stringify(value)).toEqual([]);
    }
  });

  it('joins a page’s tokens over a practice’s separator only when the screen is given it', () => {
    expect(runs('Member ZZ#7120077 on file')).not.toContain('ZZ7120077');
    expect(runs('Member ZZ#7120077 on file', 80, new Set(['#']))).toContain('ZZ7120077');
    expect(runs('Member ZZ#7120077 on file', 80, new Set([':']))).not.toContain('ZZ7120077');
  });

  it('finds a stored value written on a page exactly as stored, whatever its separators (the review’s four writings, through the index)', () => {
    for (const stored of ['SYNPCN.12001', '20261234/01', 'E7712000.345', 'ACCT_000123456', 'SYN*PCN*44551', 'ZZ#7120077', 'A12345:01', '12345,01', 'SYN+PCN+12001', 'ZZ (712) 0034']) {
      expect(screens(`Patient Acct: ${stored} on file`, [stored]), stored).toBe(true);
      expect(screens(`Patient Acct:\n${stored}\n`, [stored]), stored).toBe(true);
    }
    // Written with a separator neither the tokenizer nor the practice's values join: a recorded gap.
    expect(screens('Patient Acct: SYNPCN#12001', ['SYNPCN.12001'])).toBe(false);
    expect(screens('Patient Acct: SYNPCN 12001', ['SYNPCN.12001'])).toBe(true);
  });

  it('finds every kept stored value written on a page exactly as stored, whatever separators it holds (property)', () => {
    const group = fc.string({ unit: fc.constantFrom(...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789abcz', 'Ｚ', '１', 'ﬁ', 'é'), minLength: 1, maxLength: 6 });
    const separator = fc.constantFrom('', ' ', '-', ' - ', '.', '/', '_', '*', '#', ':', '+', ',', ', ', '(', ')', ') (', "'", '&', '=', ' # ', '--', '..', '/-', '\u2212', '\u00AD', '\u200B', '\u00AD#', ' ', '　');
    const before = fc.constantFrom('', 'Member ID:', 'Claim#', '(', 'Patient Acct: ', 'see the claim ', 'X\n', '\t', 'Ref.', '- ');
    const after = fc.constantFrom('', ')', '.', ',', ' on file', '\n', '  next', ';', '#', '/');
    fc.assert(
      fc.property(fc.array(fc.tuple(group, separator), { minLength: 1, maxLength: 5 }), before, after, (groups, prefix, suffix) => {
        const stored = groups.map(([text, sep], index) => (index === 0 ? text : `${sep}${text}`)).join('');
        const compact = compactIdentifier(stored);
        fc.pre(compact.length >= 6 && compact.length <= SCREEN_MAX_RUN);
        return screens(`${prefix}${stored}${suffix}`, [stored, 'ZZ0000001', 'SYNMBR12000002']);
      }),
      { numRuns: 3000 },
    );
  });
});

describe('someIdentifierRun: streamed, linear and stopping at the first match (phi-screen F5)', () => {
  it('stops at the first run accept takes', () => {
    const seen: string[] = [];
    const found = someIdentifierRun('Member ZZ7120034, then ZZ7120035 and ZZ7120036', { minLength: 9, maxLength: 9 }, (run) => {
      seen.push(run);
      return run === 'ZZ7120034';
    });
    expect(found).toBe(true);
    expect(seen).toEqual(['ZZ7120034']);
  });

  it('answers exactly as the unindexed runs do: the index only skips runs no kept value has the length, first character and hash of (property)', () => {
    const unit = fc.constantFrom(...'AZ09az', ' ', ' ', '-', '.', '/', '#', '\n', '\t', 'Ｚ', 'é', '\u200B');
    const value = fc.string({ unit: fc.constantFrom(...'AZ09', 'é', 'Ｚ', '-'), minLength: 1, maxLength: 14 });
    fc.assert(
      fc.property(fc.string({ unit, maxLength: 160 }), fc.array(value, { minLength: 1, maxLength: 6 }), (text, stored) => {
        const values = new Set(stored.map(compactIdentifier).filter((kept) => kept.length >= 1));
        fc.pre(values.size > 0);
        // Half the time, a kept value is written into the text, so matches are common.
        const page = stored.length % 2 === 0 ? `${text} ${stored[0] ?? ''} ${text}` : text;
        const options = { minLength: 1, maxLength: Math.max(...[...values].map((kept) => kept.length)) };
        const plain = identifierRuns(page, options).some((run) => values.has(run));
        const indexed = someIdentifierRun(page, { ...options, index: runIndex(values) }, (run) => values.has(run));
        return plain === indexed;
      }),
      { numRuns: 3000 },
    );
  });

  it('builds a run for accept only on an index hit: a worst-case page of one-character tokens builds none that no kept value could be', () => {
    // 20,000 one-character tokens, each joined to the next by one space: every position starts a run of every length.
    const text = Array.from({ length: 20_000 }, (_, at) => 'ABCDEFGHJK'[at % 10] ?? 'A').join(' ');
    const values = new Set(['ZZ1000001', '910000007', 'A000000001Z', '10000001', '7700000000001']);
    let built = 0;
    expect(
      someIdentifierRun(text, { minLength: 6, maxLength: 13, index: runIndex(values) }, (run) => {
        built += 1;
        return values.has(run);
      }),
    ).toBe(false);
    // Without the index the same page builds a run per token per length (every one of the 13 - 6 + 1 lengths).
    expect(built).toBe(0);
    let unindexed = 0;
    someIdentifierRun(text, { minLength: 6, maxLength: 13 }, () => {
      unindexed += 1;
      return false;
    });
    expect(unindexed).toBe(Array.from({ length: 8 }, (_, at) => 20_000 - (at + 6) + 1).reduce((sum, count) => sum + count, 0));
  });

  it('indexes kept values by length, first character and hash, never a whole value', () => {
    const index = runIndex(['ZZ7120034', 'SYNPCN12001', 'ÉZ12345', '']);
    expect(index.lengths).toEqual([7, 9, 11]);
    expect(Object.isFrozen(index)).toBe(true);
    expect(index.keys.length).toBeGreaterThanOrEqual(2 * 3);
    expect(index.keys.filter((key) => key !== 0)).toHaveLength(3);
    expect(index.otherFirsts[7]).toBe(1);
  });

  it(
    'screens the largest page text intake accepts in a bounded heap and time, through pagesName (prose read whole, and the worst case: one-character tokens on one line)',
    { timeout: 120_000 },
    async () => {
      const support = path.join(import.meta.dirname, 'test-support', 'screen-bound.ts');
      const tsx = path.resolve(import.meta.dirname, '../../../node_modules/.bin/tsx');
      const run = async (shape: string, hit: string) => {
        const { stdout } = await promisify(execFile)(tsx, [support, shape, hit], {
          // A 96 MiB old space (the web task's heap is 560 MiB): the text itself is 16 MiB, its framed copy 16 more.
          env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=96 --max-semi-space-size=8 --expose-gc' },
          maxBuffer: 1024 * 1024,
          timeout: 100_000,
        });
        return JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as { characters: number; identifiers: number; found: boolean; ms: number; heapBeforeMiB: number; heapAfterMiB: number };
      };
      for (const [shape, hit, found] of [
        ['prose', 'last', true],
        ['dense', 'none', false],
      ] as const) {
        const measured = await run(shape, hit);
        expect(measured.characters, shape).toBeGreaterThan(16 * 1024 * 1024);
        expect(measured.identifiers, shape).toBe(SCREEN_MAX_IDENTIFIERS);
        expect(measured.found, shape).toBe(found);
        // Linear in the text: about 1 to 2 s on a 4-CPU runner; the ceiling only catches a return to building every run.
        expect(measured.ms, shape).toBeLessThan(30_000);
        process.stdout.write(`contract screen over ${String(measured.characters)} characters (${shape}): ${String(measured.ms)} ms, heap ${String(measured.heapBeforeMiB)} to ${String(measured.heapAfterMiB)} MiB\n`);
      }
    },
  );
});

describe('the stored side: floors and rules (the session’s Q2 ruling)', () => {
  it('holds the ruled floors: member ID and payer claim number 6, patient control number 8, each with a digit', () => {
    expect(SCREEN_FLOORS).toEqual({ memberId: { minLength: 6, digit: true }, payerClaimNumber: { minLength: 6, digit: true }, patientControlNumber: { minLength: 8, digit: true } });
    expect(SCREEN_MIN_RUN).toBe(6);
  });

  it('keeps a value at its floor, compacted, and drops one below it', () => {
    expect(screenIdentifier('memberId', 'zz-1234')).toBe('ZZ1234');
    expect(screenIdentifier('memberId', 'ZZ123')).toBeNull();
    expect(screenIdentifier('payerClaimNumber', '77 1234')).toBe('771234');
    expect(screenIdentifier('payerClaimNumber', '77123')).toBeNull();
    expect(screenIdentifier('patientControlNumber', '1234567')).toBeNull();
    expect(screenIdentifier('patientControlNumber', '1234-5678')).toBe('12345678');
    expect(screenIdentifier('patientControlNumber', '97110')).toBeNull();
  });

  it('drops a value with no digit, of any kind: a letter-only value can be an ordinary contract word', () => {
    expect(screenIdentifier('patientControlNumber', 'REIMBURSEMENT')).toBeNull();
    expect(screenIdentifier('memberId', 'AGREEMENT')).toBeNull();
    expect(screenIdentifier('payerClaimNumber', 'SCHEDULE')).toBeNull();
    expect(screenIdentifier('patientControlNumber', 'AGREEMENT1')).toBe('AGREEMENT1');
  });

  it('drops eight digits that are a calendar date as YYYYMMDD or MMDDYYYY (what the tokenizer makes of a hyphenated date)', () => {
    for (const date of ['20260101', '01012026', '12312026', '20281229', '02292028', '19700101']) {
      expect(isCompactCalendarDate(date), date).toBe(true);
      expect(screenIdentifier('patientControlNumber', date), date).toBeNull();
    }
    for (const other of ['10000001', '20261301', '02302026', '18991231', '13012026', '99999999', '1234567', '123456789']) {
      expect(isCompactCalendarDate(other), other).toBe(false);
    }
    expect(screenIdentifier('patientControlNumber', '10000001')).toBe('10000001');
    expect(screenIdentifier('patientControlNumber', '20260101', SCREEN_FLOORS, { dropDates: false })).toBe('20260101');
  });

  it('applies only the floors and rules it is given (the measurement’s alternatives)', () => {
    const loose = { memberId: { minLength: 6, digit: false }, payerClaimNumber: { minLength: 6, digit: false }, patientControlNumber: { minLength: 6, digit: false } };
    expect(screenIdentifier('patientControlNumber', 'AGREEMENT', loose)).toBe('AGREEMENT');
    expect(screenIdentifier('patientControlNumber', '123456', loose)).toBe('123456');
  });
});
