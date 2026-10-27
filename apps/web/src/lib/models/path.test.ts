import { InputRefusedError, ModelBudgetExceededError, PhiBoundaryError } from '@tp/model-gateway';
import { describe, expect, it } from 'vitest';

import { MODEL_NOTICES, MODEL_PROBLEMS, MODEL_PROBLEM_TEXT, modelNoticeText } from './notices';
import { modelProblem } from './path';

/**
 * What the screens say when the contract screen refuses a document (docs/adr/0070, Part 3; test matrix MOD-12):
 * the gateway's refusal codes map to their own problems before the generic `refused`, each problem gives the next
 * step its case can take today (a misfiled payer letter or EOB has no terms to enter; a failed read is worth a second
 * try; the identifier bound and the screen's limits are not, or not yet), the four name the practice's patient records
 * one way, and none names a patient, an identifier, a kind of identifier or a count.
 */
describe('the contract screen’s problems', () => {
  it('maps names_patient, screen_unavailable and screen_failed to their own problems, before the generic refusal', () => {
    expect(modelProblem(new InputRefusedError('names_patient', 'this document holds an identifier from the practice’s patient records and was not sent'))).toBe('names_patient');
    expect(modelProblem(new InputRefusedError('screen_unavailable', 'this document could not be checked against the practice’s patient records and was not sent'))).toBe('screen_unavailable');
    expect(modelProblem(new InputRefusedError('screen_failed', 'this document could not be checked against the practice’s patient records and was not sent'))).toBe('screen_failed');
    // A check the gateway did not issue is the code's mistake, not the document's: the document was not checked, and
    // a second try meets the same mistake, so the person reads that it could not be checked, never that the input is at fault.
    expect(modelProblem(new InputRefusedError('screen_invalid', 'a contract is sent only with the practice records check the gateway issues'))).toBe('screen_unavailable');
    expect(modelProblem(new InputRefusedError('document_kind', 'refused'))).toBe('refused');
    expect(modelProblem(new PhiBoundaryError())).toBe('refused');
    expect(modelProblem(new ModelBudgetExceededError())).toBe('budget');
    // A code that only looks like an own property of a plain object is no screen problem.
    expect(modelProblem(new InputRefusedError('toString', 'refused'))).toBe('refused');
    expect(modelProblem(new Error('not the model’s'))).toBeNull();
  });

  it('says the document was not sent and gives each case its next step (UX-2, UX-3)', () => {
    expect(MODEL_PROBLEMS).toEqual(expect.arrayContaining(['names_patient', 'screen_unavailable', 'screen_failed', 'screen_limited']));
    expect(MODEL_NOTICES).toEqual(expect.arrayContaining(['names_patient', 'screen_unavailable', 'screen_failed', 'screen_limited']));
    // A misfiled payer letter or EOB first, the case the check exists for: it has no terms, so the way on is the
    // version's contract or the practice's; a contract or an exhibit that holds an identifier is entered by hand.
    expect(modelNoticeText('names_patient')).toBe(
      'This document holds an identifier from the practice’s patient records, so it was not sent to the model. If it is a payer letter or an explanation of benefits (EOB), it has no terms to enter: choose the version’s contract or exhibit as the document to read, or ask the practice for the contract below. If it is a contract or an exhibit, enter its terms by hand below.',
    );
    // The identifier bound (and a check the gateway did not issue): a second try meets the same, so hand entry.
    expect(modelNoticeText('screen_unavailable')).toBe('This document could not be checked against the practice’s patient records, so it was not sent to the model. Enter its terms by hand below.');
    // A failed read: the next click reads again, before any budget or model call, so it is worth a second try.
    expect(modelNoticeText('screen_failed')).toBe(
      'The practice’s patient records could not be read to check this document just now, so it was not sent to the model. Try again in a minute, or enter its terms by hand below.',
    );
    // The screen's own limits: nothing was read; they reset within the hour or the day.
    expect(modelNoticeText('screen_limited')).toBe(
      'Documents have been checked against the practice’s patient records as many times as allowed for now, so this one was not sent to the model. Try again later, or enter its terms by hand below.',
    );
  });

  it('names the records one way, and names no patient, identifier, kind of identifier or count', () => {
    const texts = [MODEL_PROBLEM_TEXT.names_patient, MODEL_PROBLEM_TEXT.screen_unavailable, MODEL_PROBLEM_TEXT.screen_failed, MODEL_PROBLEM_TEXT.screen_limited];
    for (const text of texts) {
      expect(text).toMatch(/[Tt]he practice’s patient records/);
      expect(text).not.toMatch(/patient details|names a patient|member|claim number|control number|\d/i);
    }
  });
});
