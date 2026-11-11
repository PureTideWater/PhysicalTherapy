import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { holdsNameOrNumber, nameOrNumberMatches } from './redact';

/**
 * The narrative's reading of a text (docs/adr/0054, amendment of 2026-11-11; test matrix MOD-20): the matches the
 * narrative drafter's check of its facts (holdsNameOrNumber) and the packet verifier (@tp/packets) both read through,
 * so the two read the same forms. The matcher itself is the letter reader's, tested with it in the gateway
 * (packages/model-gateway/src/redact.test.ts and redact.property.test.ts). Every identifier here is invented.
 */

const NAMES = ['ZOË', 'VAN-TREEBY'];
const NUMBERS = ['ZZ1234567', '20260305'];
const IDENTIFIERS = { names: NAMES, numbers: NUMBERS };

/** Each distinct match as the text it covers and its kind, in text order. */
const read = (text: string, identifiers = IDENTIFIERS) => {
  const seen = new Map<string, readonly [string, string]>();
  for (const match of nameOrNumberMatches(text, identifiers).sort((a, b) => a.start - b.start || b.end - a.end)) {
    seen.set(`${String(match.start)}:${String(match.end)}:${match.kind}`, [text.slice(match.start, match.end), match.kind]);
  }
  return [...seen.values()];
};

describe('the narrative’s reading, match by match', () => {
  it('gives each match its range in the text as given, and whether a name or a number matched', () => {
    expect(read('Zoe wrote of ZZ-123-4567.')).toEqual([
      ['Zoe', 'name'],
      ['ZZ-123-4567', 'number'],
    ]);
    // The whole name, and each part of it alone.
    expect(read('Van–Treeby and Treeby.')).toEqual([
      ['Van–Treeby', 'name'],
      ['Van', 'name'],
      ['Treeby', 'name'],
      ['Treeby', 'name'],
    ]);
    expect(read('Nothing of the case is here.')).toEqual([]);
    expect(read('Zoe wrote of ZZ-123-4567.', { names: [], numbers: [] })).toEqual([]);
  });

  it('reads a number as a member ID and as a claim number: its digits written as a date are the number after either label', () => {
    expect(read('Claim 2026-03-05 was paid short.')).toEqual([['2026-03-05', 'number']]);
    expect(read('Member ID 2026-03-05 was paid short.')).toEqual([['2026-03-05', 'number']]);
    expect(read('It was paid on 2026-03-05.')).toEqual([]);
    // The drafter's check is the same reading: it read a number as a member ID only before.
    expect(holdsNameOrNumber('Claim 2026-03-05 was paid short.', IDENTIFIERS)).toBe(true);
    expect(holdsNameOrNumber('Member ID 2026-03-05 was paid short.', IDENTIFIERS)).toBe(true);
    expect(holdsNameOrNumber('It was paid on 2026-03-05.', IDENTIFIERS)).toBe(false);
    // Never an amount's digits past its period, and a member ID's digits after a currency sign are still the number.
    expect(read('The payer allowed $202603.05.')).toEqual([]);
    expect(read('The payer allowed $20260305.')).toEqual([['20260305', 'number']]);
  });

  it('reads a name as a name and a number as a number, as the caller says which is which', () => {
    // A space joins a number's characters anywhere, a name's only between capitalized pieces.
    expect(read('zz 1234 567 was paid.')).toEqual([['zz 1234 567', 'number']]);
    expect(read('It was paid in a lump.', { names: ['INA'], numbers: [] })).toEqual([]);
    expect(read('It was paid in a lump.', { names: [], numbers: ['INA'] })).toEqual([['in a', 'number']]);
    expect(read('Jo Ann was paid.', { names: ['JOANN'], numbers: [] })).toEqual([['Jo Ann', 'name']]);
  });

  it('looks for no date of birth, no initial and no Social Security or phone number by its pattern', () => {
    expect(read('Z. V-T., born 1984-02-29, SSN 900-55-0101, phone 212-555-0199.')).toEqual([]);
  });

  it('masks nothing itself: the drafter’s check masks the gateway’s placeholders first', () => {
    const identifiers = { names: ['PATIENT'], numbers: ['7654321'] };
    expect(read('[PATIENT_NAME] and [CLAIM_1] were paid.', identifiers)).toEqual([['PATIENT', 'name']]);
    expect(holdsNameOrNumber('[PATIENT_NAME] and [CLAIM_1] were paid.', identifiers)).toBe(false);
    expect(holdsNameOrNumber('The patient was paid.', identifiers)).toBe(true);
  });

  it('is what the drafter’s check answers from, on any text without a placeholder of the gateway’s', () => {
    const piece = fc.constantFrom('Zoe', 'ZOË', 'zoë', 'Van', 'Treeby', 'Tree', 'ZZ', '1234567', '123', '4567', '2026', '03', '05', 'Claim', 'Member ID', 'paid', 'in', 'a', '$', '.', ',', '-', '–', '’', '_', '/', ':', '#', ' ', ' ', '\n');
    fc.assert(
      fc.property(fc.array(piece, { maxLength: 24 }), (pieces) => {
        const text = pieces.join('');
        expect(holdsNameOrNumber(text, IDENTIFIERS)).toBe(nameOrNumberMatches(text.normalize('NFKC'), IDENTIFIERS).length > 0);
      }),
      { numRuns: 500 },
    );
  });
});
