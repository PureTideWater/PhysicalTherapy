import { cents } from '@tp/money';
import { type RuleRecord } from '@tp/rules';
import { describe, expect, it } from 'vitest';

import { type CodeListProvider, X12_835_CODE_SETS, inCodeSet, releaseCodeLists } from './code-lists';
import { type EdiError, controlMismatch, duplicate, notAn835, syntaxError, unbalanced, unknownCode } from './errors';
import { type SegmentSpec } from './spec';
import { releaseDirectoryCodeLists } from './testing';
import { type Delimiters, type Segment } from './tokenizer';
import { type CheckContext, type UnknownCode, checkSegment, isDecimal, isPositiveDecimal, isoDate, isoShortDate } from './values';

const delimiters: Delimiters = { element: '*', component: ':', repetition: '^', segment: '~' };
const segment = (id: string, ...elements: string[]): Segment => ({ index: 7, id, elements, delimiters });

function check(target: Segment, spec: SegmentSpec, codeLists: CodeListProvider = releaseDirectoryCodeLists()) {
  const holds: EdiError[] = [];
  const flags: UnknownCode[] = [];
  const context: CheckContext = { codeLists, codeDate: '2026-04-06', sink: { hold: (error) => holds.push(error), flag: (code) => flags.push(code) } };
  const fields = checkSegment(target, spec, context);
  return { fields, holds: holds.map((error) => [error.reason, error.elementPosition, error.componentPosition]), flags: flags.map((flag) => [flag.list, flag.value, flag.elementPosition, flag.componentPosition]) };
}

describe('element values', () => {
  it('reads CCYYMMDD and YYMMDD dates only when they are calendar dates', () => {
    expect(isoDate('20260315')).toBe('2026-03-15');
    expect(isoDate('20240229')).toBe('2024-02-29');
    expect(isoDate('20000229')).toBe('2000-02-29');
    expect(isoDate('21000229')).toBeNull();
    expect(isoDate('20260229')).toBeNull();
    expect(isoDate('20261301')).toBeNull();
    expect(isoDate('20260000')).toBeNull();
    expect(isoDate('20260431')).toBeNull();
    expect(isoDate('2026031')).toBeNull();
    expect(isoDate('2026-03-15')).toBeNull();
    expect(isoShortDate('260406')).toBe('2026-04-06');
    expect(isoShortDate('261406')).toBeNull();
    expect(isoShortDate('20260406')).toBeNull();
  });

  it('keeps decimals exactly and knows positive units', () => {
    for (const text of ['1', '1.5', '.5', '0.25', '-3', '12.', '0']) {
      expect(isDecimal(text), text).toBe(true);
    }
    for (const text of ['', '.', '-', '1.2.3', '1e3', '+1', '1,5', ' 1']) {
      expect(isDecimal(text), text).toBe(false);
    }
    expect(isPositiveDecimal('0.5')).toBe(true);
    expect(isPositiveDecimal('2')).toBe(true);
    expect(isPositiveDecimal('0')).toBe(false);
    expect(isPositiveDecimal('0.00')).toBe(false);
    expect(isPositiveDecimal('-1')).toBe(false);
    expect(isPositiveDecimal('x')).toBe(false);
  });
});

describe('checking a segment against its spec', () => {
  const spec: SegmentSpec = [
    { required: true, kind: 'id', list: 'claim_status' },
    { required: false, kind: 'id' },
    { required: true, kind: 'money' },
    null,
    { required: false, kind: 'date' },
    { required: false, kind: 'date6' },
    { required: false, kind: 'decimal' },
    { required: false, kind: 'units' },
    { required: false, kind: 'number' },
    { required: false, kind: 'text' },
    {
      required: false,
      kind: 'composite',
      components: [
        { required: true, kind: 'id', list: 'procedure_qualifier' },
        { required: true, kind: 'text' },
        { required: false, kind: 'text' },
      ],
    },
  ];

  it('accepts well-formed elements and gives typed values', () => {
    const result = check(segment('XYZ', '1', 'A', '-12.5', 'ignored', '20260315', '260406', '2.25', '1.5', '0042', 'free text', 'HC:97110:GP'), spec);
    expect(result.holds).toEqual([]);
    expect(result.flags).toEqual([]);
    expect(result.fields.cents(3)).toBe(cents(-1250n));
    expect(result.fields.date(5)).toBe('2026-03-15');
    expect(result.fields.date(6)).toBe('2026-04-06');
    expect(result.fields.text(10)).toBe('free text');
    expect(result.fields.text(2)).toBe('A');
    expect(result.fields.text(12)).toBeNull();
    expect(result.fields.raw(12)).toBe('');
    expect(result.fields.components(11)).toEqual(['HC', '97110', 'GP']);
    expect(result.fields.component(11, 3)).toBe('GP');
    expect(result.fields.component(11, 4)).toBeNull();
    expect(result.fields.cents(9)).toBeNull();
    expect(result.fields.date(3)).toBeNull();
  });

  it('holds a missing required element, a repeated element and every malformed value, and flags unknown codes', () => {
    const result = check(segment('XYZ', '99', '', '12.345', '', '20261301', '269999', '1..2', '0', '4A', '', 'ZZ::GP'), spec);
    expect(result.flags).toEqual([
      ['claim_status', '99', 1, undefined],
      ['procedure_qualifier', 'ZZ', 11, 1],
    ]);
    expect(result.holds).toEqual([
      ['invalid_amount', 3, undefined],
      ['invalid_date', 5, undefined],
      ['invalid_date', 6, undefined],
      ['invalid_decimal', 7, undefined],
      ['units_not_positive', 8, undefined],
      ['invalid_number', 9, undefined],
      ['missing_element', 11, 2],
    ]);
    expect(check(segment('XYZ', '', '', ''), spec).holds).toEqual([
      ['missing_element', 1, undefined],
      ['missing_element', 3, undefined],
    ]);
    expect(check(segment('XYZ', '1^2', '', '1.00', '', '', '', '', 'abc'), spec).holds).toEqual([
      ['element_repeats', 1, undefined],
      ['invalid_decimal', 8, undefined],
    ]);
    // ISA11 is the repetition separator itself.
    expect(check({ ...segment('ISA', '^'), id: 'ISA' }, [{ required: true, kind: 'text' }]).holds).toEqual([]);
  });
});

describe('code lists', () => {
  const record = (type: 'carc' | 'rarc' | 'claim_status_code', code: string, from: string, to: string | null): RuleRecord =>
    ({ record_type: type, key: { code }, effective_from: from, effective_to: to }) as unknown as RuleRecord;

  it('answers CARC and RARC from a release by effective dates, and the structure sets from the structure', () => {
    const lists = releaseCodeLists(7, [record('carc', '45', '2001-01-01', null), record('carc', '9', '2001-01-01', '2020-06-30'), record('carc', '9', '2024-01-01', null), record('rarc', 'N1', '2026-05-01', null), record('claim_status_code', '45', '2001-01-01', null)]);
    expect(lists.release).toBe(7);
    expect(lists.has('carc', '45', '2026-04-06')).toBe(true);
    expect(lists.has('carc', '9', '2019-01-01')).toBe(true);
    expect(lists.has('carc', '9', '2022-01-01')).toBe(false);
    expect(lists.has('carc', '9', '2026-01-01')).toBe(true);
    expect(lists.has('carc', '46', '2026-04-06')).toBe(false);
    expect(lists.has('rarc', 'N1', '2026-04-06')).toBe(false);
    expect(lists.has('rarc', 'N1', '2026-05-01')).toBe(true);
    expect(lists.has('rarc', '45', '2026-05-01')).toBe(false);
    expect(lists.has('claim_status', '22', '')).toBe(true);
    expect(lists.has('claim_status', '901', '')).toBe(false);
    expect(lists.has('adjustment_group', 'PR', '')).toBe(true);
    expect(inCodeSet('adjustment_group', 'CR')).toBe(false);
    expect(Object.keys(X12_835_CODE_SETS)).toContain('provider_adjustment_reason');
  });

  it('loads the SYNTHETIC release 900001, whose CARC 9001 stopped in 2020, and refuses a release that does not verify', () => {
    const lists = releaseDirectoryCodeLists();
    expect(lists.release).toBe(900001);
    expect(['1', '2', '3', '23', '45'].map((code) => lists.has('carc', code, '2026-04-06'))).toEqual([true, true, true, true, true]);
    expect(lists.has('carc', '9001', '2026-04-06')).toBe(false);
    expect(lists.has('carc', '9001', '2019-04-06')).toBe(true);
    expect(['N901', 'N902', 'MA901'].map((code) => lists.has('rarc', code, '2026-04-06'))).toEqual([true, true, true]);
    expect(() => releaseDirectoryCodeLists('/nonexistent/release')).toThrow(/does not verify/);
  });
});

describe('error messages', () => {
  it('carry the position and never an element value', () => {
    const at = { segmentIndex: 12, segmentId: 'CLP', elementPosition: 4 };
    expect(syntaxError(at, 'invalid_amount').message).toBe('EDI_SYNTAX at segment 12 (CLP element 4): the amount is not a decimal with at most two places');
    expect(syntaxError({ segmentIndex: 3, segmentId: '', elementPosition: 0 }, 'missing_segment', { expected: 'TRN', found: 'N1' }).message).toBe('EDI_SYNTAX at segment 3 (segment): a required segment is missing (expected TRN)');
    expect(syntaxError({ ...at, componentPosition: 2 }, 'missing_element').message).toContain('(CLP element 4 component 2)');
    expect(controlMismatch({ segmentIndex: 41, segmentId: 'SE', elementPosition: 1 }, 'the segment count', '39', '38').message).toBe('EDI_CONTROL_MISMATCH at segment 41 (SE element 1): the segment count is 38, expected 39');
    expect(notAn835({ segmentIndex: 3, segmentId: 'ST', elementPosition: 1 }, '835', '277').message).toBe('EDI_NOT_835 at segment 3 (ST element 1): found 277, expected 835');
    expect(notAn835({ segmentIndex: 1, segmentId: '', elementPosition: 0 }, 'ISA', '').message).toBe('EDI_NOT_835 at segment 1 (segment): found no X12 interchange, expected ISA');
    expect(unbalanced({ segmentIndex: 4, segmentId: 'BPR', elementPosition: 2 }, 'claim_lines', cents(-105n)).message).toBe('EDI_UNBALANCED at segment 4 (BPR element 2): the claim lines is off by -1.05');
    expect(unknownCode({ segmentIndex: 25, segmentId: 'CAS', elementPosition: 2 }, 'carc').message).toBe('EDI_UNKNOWN_CODE at segment 25 (CAS element 2): the code is not in the carc list; loaded with this flag');
    expect(duplicate({ segmentIndex: 1, segmentId: 'ISA', elementPosition: 0 }, 'document').message).toContain('the same bytes were received before');
    expect(duplicate({ segmentIndex: 5, segmentId: 'TRN', elementPosition: 2 }, 'remittance').message).toContain('the same remittance was received before');
  });
});
