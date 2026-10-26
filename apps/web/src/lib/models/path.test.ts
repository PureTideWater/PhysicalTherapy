import { InputRefusedError, ModelBudgetExceededError, PhiBoundaryError } from '@tp/model-gateway';
import { describe, expect, it } from 'vitest';

import { MODEL_NOTICES, MODEL_PROBLEMS, MODEL_PROBLEM_TEXT, modelNoticeText } from './notices';
import { modelProblem } from './path';

/**
 * What the screens say when the contract screen refuses a document (docs/adr/0070, Part 3; test matrix MOD-12):
 * the gateway's refusal codes map to their own problems before the generic `refused`, and the words name no
 * patient, identifier, kind of identifier or count.
 */
describe('the contract screen’s problems', () => {
  it('maps names_patient, and screen_unavailable and screen_failed alike, before the generic refusal', () => {
    expect(modelProblem(new InputRefusedError('names_patient', 'this document names a patient of the practice and was not sent'))).toBe('names_patient');
    expect(modelProblem(new InputRefusedError('screen_unavailable', 'this document could not be checked for patient details and was not sent'))).toBe('screen_unavailable');
    expect(modelProblem(new InputRefusedError('screen_failed', 'this document could not be checked for patient details and was not sent'))).toBe('screen_unavailable');
    // A check the gateway did not issue is the code's mistake, not the document's: the generic refusal.
    expect(modelProblem(new InputRefusedError('screen_invalid', 'a contract is sent only with the practice records check the gateway issues'))).toBe('refused');
    expect(modelProblem(new InputRefusedError('document_kind', 'refused'))).toBe('refused');
    expect(modelProblem(new PhiBoundaryError())).toBe('refused');
    expect(modelProblem(new ModelBudgetExceededError())).toBe('budget');
    // A code that only looks like an own property of a plain object is no screen problem.
    expect(modelProblem(new InputRefusedError('toString', 'refused'))).toBe('refused');
    expect(modelProblem(new Error('not the model’s'))).toBeNull();
  });

  it('says the document was not sent and offers hand entry, naming nothing of the match', () => {
    expect(MODEL_PROBLEMS).toEqual(expect.arrayContaining(['names_patient', 'screen_unavailable']));
    expect(MODEL_NOTICES).toEqual(expect.arrayContaining(['names_patient', 'screen_unavailable']));
    expect(modelNoticeText('names_patient')).toBe(
      'This document names a patient of the practice, so it was not sent to the model. Enter its terms by hand. If it is a payer letter or an EOB, it was filed as the wrong kind.',
    );
    expect(modelNoticeText('screen_unavailable')).toBe('This document could not be checked for patient details, so it was not sent to the model. Enter its terms by hand.');
    for (const text of [MODEL_PROBLEM_TEXT.names_patient, MODEL_PROBLEM_TEXT.screen_unavailable]) {
      expect(text).not.toMatch(/member|claim number|control number|\d/i);
    }
  });
});
