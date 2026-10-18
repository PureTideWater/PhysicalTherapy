import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { draftNarrative } from './draft';
import { IDENTIFIER_KINDS } from './format';
import { IdentifierInsertionError, NOT_ON_RECORD, type RowIdentifiers, fillPlaceholders, insertIdentifiers, isIdentifierKind, lineHoldsOnlyPlaceholders, placeholder } from './placeholders';
import { assemblyInput } from './test-support';

/** Identifiers are placeholders in every draft and are inserted from the canonical record at export only (CAS-11). */

const content = assemblePacket(assemblyInput());
const identifiers = new Map<number, RowIdentifiers>(
  content.lines.map((line) => [line.row, { claim_control_number: `SYNCCN${String(line.row)}`, patient_control_number: `SYNPCN${String(line.row)}`, patient_name: `SYNTHETIC PATIENT ${String(line.row)}`, member_id: null }]),
);

describe('placeholders', () => {
  it('names the identifier and the row', () => {
    expect(placeholder('member_id', 7)).toBe('{{member_id:7}}');
    expect(IDENTIFIER_KINDS.every(isIdentifierKind)).toBe(true);
    expect(isIdentifierKind('date_of_birth')).toBe(false);
  });

  it('keeps every identifier of a draft a placeholder, whatever the lines', () => {
    const json = JSON.stringify({ content, narrative: draftNarrative(content) });
    expect(json).not.toMatch(/SYNCCN|SYNPCN|SYNTHETIC PATIENT/);
    expect(content.lines.every(lineHoldsOnlyPlaceholders)).toBe(true);
  });
});

describe('insertIdentifiers', () => {
  it('fills the schedule and the narrative from each row’s own record at export, and says what is missing', () => {
    const exported = insertIdentifiers(content, 'Claim {{claim_control_number:2}} of {{patient_name:2}} ({{member_id:2}}) [3].', identifiers);
    expect(exported.narrative).toBe(`Claim SYNCCN2 of SYNTHETIC PATIENT 2 (${NOT_ON_RECORD}) [3].`);
    expect(exported.lines.map((line) => [line.row, line.claim_control_number, line.patient_name, line.member_id])).toEqual([
      [1, 'SYNCCN1', 'SYNTHETIC PATIENT 1', NOT_ON_RECORD],
      [2, 'SYNCCN2', 'SYNTHETIC PATIENT 2', NOT_ON_RECORD],
      [3, 'SYNCCN3', 'SYNTHETIC PATIENT 3', NOT_ON_RECORD],
    ]);
    // The version is never changed.
    expect(content.lines[0]?.claim_control_number).toBe('{{claim_control_number:1}}');
  });

  it('refuses a row without its record, a schedule line holding anything but its placeholders, and a placeholder of no row', () => {
    expect(() => insertIdentifiers(content, 'A [3].', new Map([...identifiers].slice(0, 2)))).toThrow(IdentifierInsertionError);
    const tampered = { ...content, lines: content.lines.map((line) => (line.row === 1 ? { ...line, member_id: 'SYNMEMBER9' } : line)) };
    expect(() => insertIdentifiers(tampered, 'A [3].', identifiers)).toThrow(IdentifierInsertionError);
    expect(() => fillPlaceholders('{{patient_name:9}}', identifiers)).toThrow(IdentifierInsertionError);
    expect(() => fillPlaceholders('{{date_of_birth:1}}', identifiers)).toThrow(IdentifierInsertionError);
  });

  it('inserts each row’s identifiers into that row only', () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom(...IDENTIFIER_KINDS), fc.integer({ min: 1, max: 3 })), { maxLength: 10 }), (picks) => {
        const narrative = picks.map(([kind, row]) => placeholder(kind, row)).join(' ');
        const filled = fillPlaceholders(narrative, identifiers);
        expect(filled).toBe(picks.map(([kind, row]) => identifiers.get(row)?.[kind] ?? NOT_ON_RECORD).join(' '));
      }),
    );
  });
});
