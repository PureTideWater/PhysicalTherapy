import { CODES } from '@tp/packets/explain';
import { describe, expect, it } from 'vitest';

import { INITIALISMS, counted, labelOf, listed } from './words';

/** Words built around a number or a code (the screen tour's C1). */

describe('a count with its noun', () => {
  it('is singular for one and plural for any other count, zero included', () => {
    expect(counted(1, 'linked entry', 'linked entries')).toBe('1 linked entry');
    expect(counted(2, 'linked entry', 'linked entries')).toBe('2 linked entries');
    expect(counted(0, 'linked entry', 'linked entries')).toBe('0 linked entries');
    expect(counted(1, 'line')).toBe('1 line');
    expect(counted(32, 'line')).toBe('32 lines');
  });

  it('groups the digits by thousands', () => {
    expect(counted(12_345, 'row')).toBe('12,345 rows');
    expect(counted(1_000, 'claim line')).toBe('1,000 claim lines');
    expect(counted(999, 'line')).toBe('999 lines');
    expect(counted(1_234_567, 'more group', 'more groups')).toBe('1,234,567 more groups');
  });
});

describe('a list in words', () => {
  it('puts "and" before the last item and commas between the others', () => {
    expect(listed([])).toBe('');
    expect(listed(['a digit'])).toBe('a digit');
    expect(listed(['a digit', 'a symbol'])).toBe('a digit and a symbol');
    expect(listed(['an uppercase letter', 'a digit', 'a symbol'])).toBe('an uppercase letter, a digit and a symbol');
  });
});

describe('a code as a label', () => {
  it('is in sentence case with its initialisms in capitals', () => {
    expect(labelOf('ncci_ptp')).toBe('NCCI PTP');
    expect(labelOf('per_visit')).toBe('Per visit');
    expect(labelOf('mue_values')).toBe('MUE values');
    expect(labelOf('apply_mppr')).toBe('Apply MPPR');
    expect(labelOf('eft_export')).toBe('EFT export');
    expect(labelOf('cms_look_up')).toBe('CMS look up');
    expect(labelOf('qualifying_apm')).toBe('Qualifying APM');
    expect(labelOf('patient_share_cents')).toBe('Patient share cents');
    expect(labelOf('extra')).toBe('Extra');
    expect(labelOf('')).toBe('');
  });

  it('keeps in capitals each initialism the calculation’s words name (@tp/packets/explain CODES; the modifiers CQ and CO are codes, not words)', () => {
    for (const code of ['MPPR', 'NCCI', 'MUE', 'RVU', 'GPCI', 'APM', 'CMS'] as const) {
      expect(CODES, code).toContain(code);
      expect(INITIALISMS.has(code.toLowerCase()), code).toBe(true);
    }
  });

  it('keeps every initialism it knows in capitals, wherever it stands', () => {
    for (const word of INITIALISMS) {
      expect(labelOf(word)).toBe(word.toUpperCase());
      expect(labelOf(`the_${word}`)).toBe(`The ${word.toUpperCase()}`);
    }
  });
});
