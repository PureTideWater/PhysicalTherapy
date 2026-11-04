import { describe, expect, it } from 'vitest';

import { COLLISION_CLASSES, SCREEN_TWIN_COUNTS, screenCollisionIdentifiers, screenTwinIdentifiers } from './patient-twins';

/**
 * The contract PHI check's SYNTHETIC twin practices (combined audit item 120; docs/adr/0070 Part 3; test matrix MOD-12):
 * every value invented, and none in a shape a real person's identifier is issued in (phi-screen N3). The shape rules
 * below are the oracle, written here apart from the generator.
 */

const digitsAt = (value: string, start: number, end: number) => Number.parseInt(value.slice(start, end), 10);

/** Whether nine digits could be an issued Social Security number: area 001 to 899 but 666, group 01 to 99, serial 0001 to 9999. */
const ssnShaped = (value: string) => {
  const area = digitsAt(value, 0, 3);
  return area >= 1 && area <= 899 && area !== 666 && digitsAt(value, 3, 5) >= 1 && digitsAt(value, 5, 9) >= 1;
};

/** Whether nine digits could be an ITIN (area 9NN, group 50 to 65, 70 to 88, 90 to 92 or 94 to 99) or an ATIN (area 9NN, group 93). */
const itinOrAtinShaped = (value: string) => {
  const group = digitsAt(value, 3, 5);
  return value.startsWith('9') && ((group >= 50 && group <= 65) || (group >= 70 && group <= 88) || (group >= 90 && group <= 99));
};

/** A Medicare Beneficiary Identifier: C A AN N A AN N A A N N, C a digit 1 to 9, its letters never S, L, O, I, B or Z. */
const MBI = /^[1-9][AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y\d]\d[AC-HJKMNP-RT-Y][AC-HJKMNP-RT-Y\d]\d[AC-HJKMNP-RT-Y]{2}\d{2}$/;

describe('the twin practice (phi-screen N3)', () => {
  const twin = screenTwinIdentifiers();
  const nineDigits = twin.memberIds.filter((value) => /^\d{9}$/.test(value));
  const eleven = twin.memberIds.filter((value) => value.length === 11);

  it('holds the counts the measurement pins, every value distinct within its kind', () => {
    expect(twin.memberIds).toHaveLength(SCREEN_TWIN_COUNTS.memberIds);
    expect(new Set(twin.memberIds).size).toBe(SCREEN_TWIN_COUNTS.memberIds);
    expect(twin.patientControlNumbers).toHaveLength(SCREEN_TWIN_COUNTS.longPatientControlNumbers + SCREEN_TWIN_COUNTS.shortPatientControlNumbers);
    expect(new Set(twin.payerClaimNumbers).size).toBe(SCREEN_TWIN_COUNTS.payerClaimNumbers);
    expect(nineDigits).toHaveLength(Math.floor(SCREEN_TWIN_COUNTS.memberIds / 3));
    expect(eleven.length).toBe(SCREEN_TWIN_COUNTS.memberIds - 2 * Math.floor(SCREEN_TWIN_COUNTS.memberIds / 3));
  });

  it('holds no nine-digit member ID an SSN, an ITIN or an ATIN could be: each is in an area 9NN with group 00', () => {
    expect(nineDigits.filter(ssnShaped)).toEqual([]);
    expect(nineDigits.filter(itinOrAtinShaped)).toEqual([]);
    expect(nineDigits.filter((value) => !/^9\d\d00\d{4}$/.test(value))).toEqual([]);
  });

  it('holds no eleven-character member ID a Medicare Beneficiary Identifier could be: each holds a B, L, S or Z', () => {
    expect(eleven.filter((value) => MBI.test(value))).toEqual([]);
    expect(eleven.filter((value) => !/[BLSZ]/.test(value) || !/\d/.test(value))).toEqual([]);
  });

  it('written with separators, holds the same values, each with one separator in turn after its second character', () => {
    const written = screenTwinIdentifiers(['#', '.']);
    expect(written.memberIds).toHaveLength(twin.memberIds.length);
    expect(written.memberIds.slice(0, 2)).toEqual([`${twin.memberIds[0]?.slice(0, 2) ?? ''}#${twin.memberIds[0]?.slice(2) ?? ''}`, `${twin.memberIds[1]?.slice(0, 2) ?? ''}.${twin.memberIds[1]?.slice(2) ?? ''}`]);
    const compact = (values: readonly string[]) => values.map((value) => value.replace(/[#.]/g, ''));
    expect(compact(written.memberIds)).toEqual(twin.memberIds);
    expect(compact(written.patientControlNumbers)).toEqual(twin.patientControlNumbers);
    expect(compact(written.payerClaimNumbers)).toEqual(twin.payerClaimNumbers);
    expect(screenTwinIdentifiers()).toBe(twin);
  });
});

describe('the collision classes (the design review’s M12; phi-screen F1)', () => {
  const page = [
    'This Agreement is effective 1/1/2026 and remains in effect through 12/31/2026 (or 12/31/27).',
    'Amendment dated 2026.03.15, signed 2026-01-01 and 01-15-2026; not a date: 13/45/2026 or 2026/02/30.',
    'Fee 1234.56 per visit; see Section 4.2.1; the rate is 85.5% of 97110.',
    'TIN 00-1234567; remit to Anytown 00123-4567. Reimbursement under this Agreement.',
  ].join('\n');
  const classes = screenCollisionIdentifiers([page]);

  it('names every class it builds', () => {
    expect(Object.keys(classes)).toEqual([...COLLISION_CLASSES]);
  });

  it('reads the dates a page writes with slashes or dots, and the numbers it writes with points, as the tokenizer joins them', () => {
    expect(classes.slashDate.patientControlNumbers).toEqual(['112026', '12312026', '123127', '20260315']);
    expect(classes.dateMemberId.memberIds).toEqual(['01152026', '112026', '12312026', '123127', '20260101', '20260315']);
    expect(classes.decimal.memberIds).toEqual(['123456', '20260315', '421', '855']);
  });

  it('keeps the review’s classes as they were', () => {
    expect(classes.date.patientControlNumbers).toEqual(['01152026', '20260101']);
    expect(classes.tin.memberIds).toEqual(['001234567']);
    expect(classes.zip4.memberIds).toEqual(['001234567']);
    expect(classes.word.patientControlNumbers).toEqual(['AGREEMENT', 'AMENDMENT', 'EFFECTIVE', 'REIMBURSEMENT']);
  });
});
