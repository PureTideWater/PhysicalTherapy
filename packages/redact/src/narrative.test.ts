import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { holdsNameOrNumber, nameOrNumberMatches } from './redact';

/**
 * The narrative's reading of a text (docs/adr/0054, amendment of 2026-11-11; test matrix MOD-20): the packet verifier
 * (@tp/packets) asks where (nameOrNumberMatches), which first leaves out every identifier the text cannot hold, and
 * the drafter's check of its facts (holdsNameOrNumber) asks plainly, of every identifier. The check holds wherever the
 * verifier's matcher finds, and more (Queues item 34, MOD-25, rule (d)): numbers as the records hold them, their
 * pieces, a number of digits glued to a letter, and a name the records hold with a mark, each word of it. The
 * verifier keeps its reading; what the check adds refuses a call before it is made and fails no stored narrative.
 * The matcher itself is the letter reader's, tested with it in the gateway (packages/model-gateway/src/redact.test.ts
 * and redact.property.test.ts). Every identifier here is invented.
 */

const NAMES = ['ZOË', 'VAN-TREEBY'];
const NUMBERS = ['ZZ1234567', '20260305'];
const IDENTIFIERS = { names: NAMES, numbers: NUMBERS };

/** Each distinct match as the text it covers, in text order, a longer one first where two start together. */
const read = (text: string, identifiers = IDENTIFIERS, shortestPart?: number) => {
  const seen = new Map<string, string>();
  for (const match of nameOrNumberMatches(text, identifiers, shortestPart).sort((a, b) => a.start - b.start || b.end - a.end)) {
    seen.set(`${String(match.start)}:${String(match.end)}`, text.slice(match.start, match.end));
  }
  return [...seen.values()];
};

describe('the narrative’s reading, match by match', () => {
  it('gives each match its range in the text as given', () => {
    expect(read('Zoe wrote of ZZ-123-4567.')).toEqual(['Zoe', 'ZZ-123-4567']);
    // The whole name, and each part of it alone.
    expect(read('Van–Treeby and Treeby.')).toEqual(['Van–Treeby', 'Van', 'Treeby', 'Treeby']);
    expect(read('Nothing of the case is here.')).toEqual([]);
    expect(read('Zoe wrote of ZZ-123-4567.', { names: [], numbers: [] })).toEqual([]);
    // Each match is a range of two numbers and nothing else.
    expect(nameOrNumberMatches('Zoe.', IDENTIFIERS)).toEqual([{ start: 0, end: 3 }]);
  });

  it('reads a number as a member ID, and one of digits alone as a claim number too: its digits written as a date are the number after either label', () => {
    expect(read('Claim 2026-03-05 was paid short.')).toEqual(['2026-03-05']);
    expect(read('Member ID 2026-03-05 was paid short.')).toEqual(['2026-03-05']);
    expect(read('It was paid on 2026-03-05.')).toEqual([]);
    // The drafter's check is the same reading: it read a number as a member ID only before.
    expect(holdsNameOrNumber('Claim 2026-03-05 was paid short.', IDENTIFIERS)).toBe(true);
    expect(holdsNameOrNumber('Member ID 2026-03-05 was paid short.', IDENTIFIERS)).toBe(true);
    expect(holdsNameOrNumber('It was paid on 2026-03-05.', IDENTIFIERS)).toBe(false);
    // Never an amount's digits past its period, and a member ID's digits after a currency sign are still the number.
    expect(read('The payer allowed $202603.05.')).toEqual([]);
    expect(read('The payer allowed $20260305.')).toEqual(['20260305']);
    // A number with a letter is read once, as a member ID: its kind decides nothing (one match, not two).
    expect(
      nameOrNumberMatches('ICNZZ1234567 and ZZ 1234567.', IDENTIFIERS)
        .map((match) => [match.start, match.end])
        .sort(([a = 0], [b = 0]) => a - b),
    ).toEqual([
      [3, 12],
      [17, 27],
    ]);
    // A number of digits alone is found once for each kind and for each way a label reads it, always as the same range.
    expect(read('Claim 20260305.')).toEqual(['20260305']);
  });

  it('reads a name as a name and a number as a number, as the caller says which is which', () => {
    // A space joins a number's characters anywhere, a name's only between capitalized pieces.
    expect(read('zz 1234 567 was paid.')).toEqual(['zz 1234 567']);
    expect(read('It was paid in a lump.', { names: ['INA'], numbers: [] })).toEqual([]);
    expect(read('It was paid in a lump.', { names: [], numbers: ['INA'] })).toEqual(['in a']);
    expect(read('Jo Ann was paid.', { names: ['JOANN'], numbers: [] })).toEqual(['Jo Ann']);
    // Beside a letter a number is joined by more than a name is: a slash or an opening parenthesis, never an asterisk.
    expect(read('QQRS/TUVW and QQRS(TUVW and QQRS*TUVW.', { names: [], numbers: ['QQRSTUVW'] })).toEqual(['QQRS/TUVW', 'QQRS(TUVW']);
    expect(read('Quar/rington and Quar(rington.', { names: ['QUARRINGTON'], numbers: [] })).toEqual([]);
  });

  it('looks for no date of birth, no initial and no Social Security or phone number by its pattern', () => {
    expect(read('Z. V-T., born 1984-02-29, SSN 900-55-0101, phone 212-555-0199.')).toEqual([]);
    // Not after a label that says a date is one of birth, and not an initial next to a name it does read.
    expect(read('DOB 1955-07-14, date of birth 07/14/1955.', { names: ['QUILL'], numbers: ['19550714'] })).toEqual([]);
    // A word of one letter is part of the whole name, which counts under the floor asked (four letters, five asked),
    // and is no initial beside another word of it.
    expect(read('Q. Zoe and Zoe Q. were told.', { names: ['ZOË Q'], numbers: [] }, 5)).toEqual(['Zoe', 'Zoe Q', 'Zoe']);
  });

  it('masks nothing itself: the drafter’s check masks the gateway’s placeholders first', () => {
    const identifiers = { names: ['PATIENT'], numbers: ['7654321'] };
    expect(read('[PATIENT_NAME] and [CLAIM_1] were paid.', identifiers)).toEqual(['PATIENT']);
    expect(holdsNameOrNumber('[PATIENT_NAME] and [CLAIM_1] were paid.', identifiers)).toBe(false);
    expect(holdsNameOrNumber('The patient was paid.', identifiers)).toBe(true);
  });
});

describe('what the drafter’s check reads beside the matcher (Queues item 34, MOD-25, rule (d))', () => {
  const numbers = (...held: string[]) => ({ names: [], numbers: held });
  const names = (...held: string[]) => ({ names: held, numbers: [] });
  /** The check holds, and the verifier's matcher keeps its reading: it finds nothing there. */
  const onlyTheCheck = (text: string, identifiers: { names: string[]; numbers: string[] }) => {
    expect(nameOrNumberMatches(text.normalize('NFKC'), identifiers), text).toEqual([]);
    expect(holdsNameOrNumber(text, identifiers), text).toBe(true);
  };

  it('holds a number written as the records hold it, with the mark they hold', () => {
    for (const held of ['ZZ12345/01', 'ZZ12345+01', 'ZZ12345.01', 'ZZ12345,01']) {
      onlyTheCheck(`The payer told ${held} so.`, numbers(held));
    }
    // And with another run of marks where the records hold one (A-5).
    onlyTheCheck('The payer told ZZ12345 / 01 so.', numbers('ZZ12345/01'));
  });

  it('holds a piece of a number that is a number by itself, from five digits', () => {
    onlyTheCheck('The payer told ZZ12345 so.', numbers('ZZ12345 01'));
    onlyTheCheck('The payer told 7654321 so.', numbers('7654321/02'));
    // A piece under the floor is no number: "01" is in every text.
    expect(holdsNameOrNumber('Paid 01 unit.', numbers('ZZ12345 01'))).toBe(false);
    expect(holdsNameOrNumber('Paid 01 unit.', numbers('7654321/01'))).toBe(false);
  });

  it('holds a number of digits glued to a letter, from five digits', () => {
    onlyTheCheck('Fax X76543210 ext 12.', numbers('76543210'));
    onlyTheCheck('Sent as 76543210B.', numbers('76543210'));
    expect(holdsNameOrNumber('Account1234 was paid.', numbers('1234'))).toBe(false);
    // A digit beside the number is another number: the recorded residual stays.
    expect(holdsNameOrNumber('Sent as 976543210.', numbers('76543210'))).toBe(false);
  });

  it('holds each word of a name the records hold with a mark, read as the first reading reads a name', () => {
    for (const held of ['JANE+ZEPHYRA', 'JANE&ZEPHYRA', 'ZEPHYRA(JANE)', 'ZEPHYRA*JANE', 'ZEPHYRA:JANE']) {
      onlyTheCheck('Ms. Zephyra was told.', names(held));
      onlyTheCheck('JANE was told.', names(held));
      onlyTheCheck('Zephyra, Jane was told.', names(held));
      expect(holdsNameOrNumber('Nothing of the case is here.', names(held)), held).toBe(false);
    }
    // The name as held is still read as it was.
    expect(holdsNameOrNumber('Janezephyra was told.', names('JANE+ZEPHYRA'))).toBe(true);
  });

  it('reads no name written apart: item 26’s ruling stands', () => {
    expect(holdsNameOrNumber('It was paid in a lump.', names('INA'))).toBe(false);
    expect(holdsNameOrNumber('It was paid in a lump.', names('INA+VANTREE'))).toBe(false);
    expect(holdsNameOrNumber('The plan paid for Zephy ra and Z e p h y r a.', names('JANE+ZEPHYRA'))).toBe(false);
    expect(holdsNameOrNumber('The plan paid for Zeph\u00B7yra.', names('JANE+ZEPHYRA'))).toBe(false);
  });

  it('pays the recorded cost: a word the records hold beside a name with a mark is that name’s word', () => {
    expect(holdsNameOrNumber('Medicare paid the line short.', names('ZEPHYRA*MEDICARE'))).toBe(true);
  });

  it('still reads an amount and a date as what they are, and nothing under a placeholder of the gateway’s', () => {
    const identifiers = { names: ['JANE+ZEPHYRA'], numbers: ['20260305', '30000', '7654321/02'] };
    expect(holdsNameOrNumber('It was paid on 2026-03-05, $300.00 of it.', identifiers)).toBe(false);
    expect(holdsNameOrNumber('[PATIENT_NAME] and [CLAIM_1] and [MEMBER_ID] were paid.', { names: ['PATIENT+NAME'], numbers: ['CLAIM/1'] })).toBe(false);
    expect(holdsNameOrNumber('The patient was paid.', { names: ['PATIENT+NAME'], numbers: [] })).toBe(true);
  });
});

describe('a part of a name’s word by itself, from the letters the caller asks for', () => {
  const identifiers = { names: ['HYE-IN QUARRINGTON', "O'QUILL", 'JEAN-LUC', 'TO'], numbers: ['AB1'] };

  it('counts every part of two letters or more by default, as the drafter’s check does', () => {
    expect(read('It was paid in full to Hye and Luc.', identifiers)).toEqual(['in', 'to', 'Hye', 'Luc']);
    expect(holdsNameOrNumber('It was paid in full.', identifiers)).toBe(true);
  });

  it('counts a part alone only from four letters when asked, and the whole name, each whole word and each number at any length', () => {
    // "in", "Hye" and "Luc" are parts of a word; "to" is a whole name, "AB1" a number, "Jean" and "Quill" parts of four letters or more.
    expect(read('It was paid in full to Hye and Luc.', identifiers, 4)).toEqual(['to']);
    expect(read('Jean and Quill and AB-1 and Quarrington.', identifiers, 4)).toEqual(['Jean', 'Quill', 'AB-1', 'Quarrington']);
    // The whole word in any form, its short parts within it.
    expect(read('Hye-In, hye in, HYEIN and Jean–Luc.', identifiers, 4)).toEqual(['Hye-In', 'hye in', 'HYEIN', 'Jean–Luc', 'Jean']);
    expect(read('Hye-In Quarrington was paid.', identifiers, 4)).toEqual(['Hye-In Quarrington', 'Hye-In', 'Quarrington']);
    // Exactly at the floor: three letters is no part, four is.
    expect(read('Luc and Jean.', identifiers, 3)).toEqual(['Luc', 'Jean']);
    expect(read('Luc and Jean.', identifiers, 5)).toEqual([]);
    // A whole name under the floor, its words apart or together, and one written without the records' mark.
    expect(read('Li O and Lio were paid.', { names: ['LI O'], numbers: [] }, 4)).toEqual(['Li O', 'Li', 'Lio']);
    expect(read('Zoe was paid.', { names: ['ZOË'], numbers: [] }, 4)).toEqual(['Zoe']);
    // A part that is another name's whole word counts as that name.
    expect(read('It was paid in full.', { names: ['HYE-IN', 'IN'], numbers: [] }, 4)).toEqual(['in']);
  });
});

describe('the reading asked plainly holds wherever the reading asked where finds', () => {
  // Texts of every gap a form reads, and of near misses; cases of identifiers the text holds, almost holds and cannot hold.
  const PIECES = [
    ...['Zoe', 'ZOË', 'zoë', 'Zo', 'Van', 'Treeby', 'Tree', 'by', 'Quar', 'rington', 'Jo', 'Ann', 'in', 'a', 'O', 'Quill', 'ZZ', '1234567', '123', '4567', '2026', '03', '05', 'SYN', 'CCN', '0001', 'STRAUSS', 'Strauß'],
    ...['Claim', 'Member ID', 'ICN', 'paid', '$', '.', ',', '-', '–', '—', '’', "'", '_', '/', ':', '#', '(', ')', '·', '"', ' ', ' ', '\n', '-\n', '­', 'ʼ', '+', '*', 'X'],
  ];
  const CASES = [
    IDENTIFIERS,
    { names: ['ZOË QUARRINGTON', "O'QUILL", 'JOANN', 'INA', 'STRAUß'], numbers: ['SYNCCN0001', '12', 'INA'] },
    { names: ['XAVIERA', 'QZ-WX', 'J.R.', 'A'], numbers: ['99887766', 'Q', '7'] },
    { names: [], numbers: ['2026', '0305', '20260305', 'ZZ'] },
  ];
  // Identifiers the records hold with a mark, which only the check reads in its wider forms.
  const MARKED = [
    { names: ['ZOË+QUARRINGTON', 'TREEBY(JO)'], numbers: ['ZZ1234/567', '1234567'] },
    { names: ['QUILL*ANN'], numbers: ['SYN+CCN+0001', '2026/0305'] },
  ];
  const text = fc.array(fc.constantFrom(...PIECES), { maxLength: 24 }).map((pieces) => pieces.join(''));

  it('holdsNameOrNumber holds wherever nameOrNumberMatches finds, on any text without a placeholder of the gateway’s', () => {
    fc.assert(
      fc.property(text, fc.constantFrom(...CASES, ...MARKED), (written, identifiers) => {
        if (nameOrNumberMatches(written.normalize('NFKC'), identifiers).length > 0) {
          expect(holdsNameOrNumber(written, identifiers), JSON.stringify(written)).toBe(true);
        }
      }),
      { numRuns: 2000 },
    );
  });

  it('answers as the matcher finds where nothing (d) reads can stand: the first reading is asked first, and a wider one only adds', () => {
    // The base's check was the matcher asked plainly. A case with no marked identifier and no number of five digits
    // holds nothing the wider forms read, so there the two still give one answer.
    const plain = [
      { names: ['ZOË QUARRINGTON', "O'QUILL", 'JOANN', 'INA', 'STRAUß'], numbers: ['12', 'INA'] },
      { names: ['XAVIERA', 'QZ-WX', 'J.R.', 'A'], numbers: ['Q', '7'] },
      { names: [], numbers: ['2026', '0305', 'ZZ'] },
    ];
    fc.assert(
      fc.property(text, fc.constantFrom(...plain), (written, identifiers) => {
        expect(holdsNameOrNumber(written, identifiers), JSON.stringify(written)).toBe(nameOrNumberMatches(written.normalize('NFKC'), identifiers).length > 0);
      }),
      { numRuns: 1000 },
    );
  });

  it('finds for a whole case exactly what it finds for each identifier by itself: leaving one out changes no other’s matches', () => {
    fc.assert(
      fc.property(text, fc.constantFrom(...CASES), fc.constantFrom(2, 4), (written, identifiers, shortestPart) => {
        const normal = written.normalize('NFKC');
        const key = (match: { readonly start: number; readonly end: number }) => `${String(match.start)}:${String(match.end)}`;
        const together = new Set(nameOrNumberMatches(normal, identifiers, shortestPart).map(key));
        const apart = new Set([
          ...identifiers.names.flatMap((name) => nameOrNumberMatches(normal, { names: [name], numbers: [] }, shortestPart)),
          ...identifiers.numbers.flatMap((number) => nameOrNumberMatches(normal, { names: [], numbers: [number] }, shortestPart)),
        ].map(key));
        expect([...together].sort(), JSON.stringify(written)).toEqual([...apart].sort());
        // Asked for longer parts it finds no more, and each of an identifier's matches is one the plain check stands behind.
        if (shortestPart === 4) {
          const every = new Set(nameOrNumberMatches(normal, identifiers).map(key));
          expect([...together].every((match) => every.has(match))).toBe(true);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
