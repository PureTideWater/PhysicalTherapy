import { describe, expect, it } from 'vitest';

import { INITIALISMS, counted, labelOf } from './words';

/** Words built around a number or a code (the screen tour's C1). */

describe('a count with its noun', () => {
  it('is singular for one and plural for any other count, zero included', () => {
    expect(counted(1, 'linked entry', 'linked entries')).toBe('1 linked entry');
    expect(counted(2, 'linked entry', 'linked entries')).toBe('2 linked entries');
    expect(counted(0, 'linked entry', 'linked entries')).toBe('0 linked entries');
    expect(counted(1, 'line')).toBe('1 line');
    expect(counted(32, 'line')).toBe('32 lines');
  });
});

describe('a code as a label', () => {
  it('is in sentence case with its initialisms in capitals', () => {
    expect(labelOf('ncci_ptp')).toBe('NCCI PTP');
    expect(labelOf('per_visit')).toBe('Per visit');
    expect(labelOf('mue_values')).toBe('MUE values');
    expect(labelOf('apply_mppr')).toBe('Apply MPPR');
    expect(labelOf('eft_export')).toBe('EFT export');
    expect(labelOf('patient_share_cents')).toBe('Patient share cents');
    expect(labelOf('extra')).toBe('Extra');
    expect(labelOf('')).toBe('');
  });

  it('keeps every initialism it knows in capitals, wherever it stands', () => {
    for (const word of INITIALISMS) {
      expect(labelOf(word)).toBe(word.toUpperCase());
      expect(labelOf(`the_${word}`)).toBe(`The ${word.toUpperCase()}`);
    }
  });
});
