import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SCREEN_FLOORS, SCREEN_MIN_RUN, compactIdentifier, holdsIdentifier, identifierRuns, isCompactCalendarDate, screenIdentifier } from './redact';

/**
 * The contract screen's side of redact.ts (combined audit item 120; docs/adr/0070, Part 3): the page tokenizer
 * (identifierRuns), the floors the session ruled (Q2) and the stored-side rules (a digit in every kind; 8-digit
 * calendar dates dropped). SYNTHETIC identifiers only.
 */

const runs = (text: string, maxLength = 80) => identifierRuns(text, { minLength: SCREEN_MIN_RUN, maxLength });

describe('identifierRuns: the page runs the contract screen compares', () => {
  it('finds an identifier after a colon, a hash, an opening parenthesis or a word, and before any punctuation', () => {
    for (const text of ['Member ID:ZZ1234567', 'Claim#ZZ1234567', '(ZZ1234567)', 'ID ZZ1234567.', 'member zz1234567, on file', 'ZZ1234567']) {
      expect(runs(text), text).toContain('ZZ1234567');
    }
  });

  it('joins an identifier printed in 2, 3 and 4 groups by one space, one hyphen or dash, or a spaced dash', () => {
    for (const text of ['ZZ 1234567', 'ZZ-1234567', 'ZZ 123 4567', 'ZZ-123-4567', 'ZZ - 123 - 4567', 'ZZ 12 34 567', 'ZZ–1234567', 'ZZ 1234567', 'Member ID:ZZ 123 4567']) {
      expect(runs(text), text).toContain('ZZ1234567');
    }
  });

  it('reads NFKC forms: full-width letters and digits, a no-break space', () => {
    expect(runs('ＺＺ１２３４５６７')).toContain('ZZ1234567');
    expect(runs('ZZ　123 4567')).toContain('ZZ1234567');
  });

  it('never joins across a newline, a tab, two spaces, two dashes or any other character', () => {
    for (const text of ['ZZ\n1234567', 'ZZ\r\n1234567', 'ZZ\t1234567', 'ZZ  1234567', 'ZZ--1234567', 'ZZ - - 1234567', 'ZZ/1234567', 'ZZ.1234567', 'ZZ,1234567', 'ZZ_1234567']) {
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
  });

  it('agrees with the letter redaction’s identifier pattern on every single-line, single-separator writing (property)', () => {
    const group = fc.string({ unit: fc.constantFrom(...'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789abcz'), minLength: 1, maxLength: 6 });
    const separator = fc.constantFrom('', ' ', '-', ' - ', '–', ' – ', ' ', '- ', ' -');
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
      { numRuns: 500 },
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
