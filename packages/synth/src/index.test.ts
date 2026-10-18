import { describe, expect, it } from 'vitest';

import { SYNTH_GS02, SYNTH_ISA06, SYNTH_SENDER_ID, SynthUsageError, parseSynthArgs } from './index';

describe('synthetic sender identity', () => {
  it('pads ISA06 to fifteen characters', () => {
    expect(SYNTH_SENDER_ID).toBe('SYNTHSENDER');
    expect(SYNTH_ISA06).toBe('SYNTHSENDER    ');
    expect(SYNTH_ISA06).toHaveLength(15);
  });

  it('uses SYNTH as GS02', () => {
    expect(SYNTH_GS02).toBe('SYNTH');
  });
});

describe('parseSynthArgs', () => {
  it('accepts --all', () => {
    expect(parseSynthArgs(['--all'])).toEqual({ kind: 'all' });
  });

  it('accepts --case with a test-matrix ID in either form', () => {
    expect(parseSynthArgs(['--case', 'PAR-08'])).toEqual({ kind: 'case', caseId: 'PAR-08' });
    expect(parseSynthArgs(['--case=LED-06'])).toEqual({ kind: 'case', caseId: 'LED-06' });
    expect(parseSynthArgs(['--case', 'V01'])).toEqual({ kind: 'case', caseId: 'V01' });
    expect(parseSynthArgs(['--large'])).toEqual({ kind: 'large' });
  });

  it.each([
    [[]],
    [['--all', '--case', 'PAR-01']],
    [['--case']],
    [['--case', 'par-1']],
    [['--case', 'PAR-001']],
    [['--everything']],
    [['PAR-01']],
    [['--case', 'V1']],
    [['--large', '--all']],
    [['--case', 'v01']],
  ])('refuses %j', (argv) => {
    expect(() => parseSynthArgs(argv)).toThrow(SynthUsageError);
  });
});
