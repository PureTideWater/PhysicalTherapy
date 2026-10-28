import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { PATIENT_BALANCE_UNSEEN, type PatientBalanceLine, casePatientBalance, foldPatientBalance, patientBalanceOf } from './patient-share';

/**
 * The audit report folds casePatientBalance over a case's lines a batch at a time (SUITE-CAP-1a D18; docs/adr/0083):
 * folding every line from PATIENT_BALANCE_UNSEEN, in any order and cut into any parts, says what casePatientBalance says
 * of all of them at once, the rule the case and Reconciliation screens read.
 */

const line: fc.Arbitrary<PatientBalanceLine> = fc.record({
  correction: fc.constantFrom(null, 'patient_balance' as const, 'other_reductions' as const),
  writtenOff: fc.boolean(),
  stage: fc.constantFrom(null, 'validated', 'actionable', 'payer_approved', 'recovered'),
});

/** The lines cut into consecutive parts at the given points, each part folded on from the last. */
function foldedInParts(lines: readonly PatientBalanceLine[], cuts: readonly number[]): boolean {
  const points = [...new Set(cuts.map((cut) => cut % (lines.length + 1)))].sort((a, b) => a - b);
  let fold = PATIENT_BALANCE_UNSEEN;
  let from = 0;
  for (const to of [...points, lines.length]) {
    fold = lines.slice(from, to).reduce(foldPatientBalance, fold);
    from = Math.max(from, to);
  }
  return patientBalanceOf(fold);
}

describe('casePatientBalance folded a part at a time', () => {
  it('says what casePatientBalance says of all the lines, in any order and any parts', () => {
    fc.assert(
      fc.property(fc.array(line, { maxLength: 12 }), fc.array(fc.nat(), { maxLength: 4 }), (lines, cuts) => {
        const whole = casePatientBalance(lines);
        expect(foldedInParts(lines, cuts)).toBe(whole);
        expect(foldedInParts([...lines].reverse(), cuts)).toBe(whole);
      }),
      { numRuns: 2000 },
    );
  });

  it('is false for a case with no line, or with every line written off', () => {
    expect(patientBalanceOf(PATIENT_BALANCE_UNSEEN)).toBe(casePatientBalance([]));
    const writtenOff: PatientBalanceLine = { correction: 'patient_balance', writtenOff: true, stage: null };
    expect(patientBalanceOf(foldPatientBalance(PATIENT_BALANCE_UNSEEN, writtenOff))).toBe(false);
    expect(casePatientBalance([writtenOff])).toBe(false);
  });
});
