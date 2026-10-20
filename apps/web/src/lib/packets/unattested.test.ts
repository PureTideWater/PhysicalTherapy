import { SUBMISSION_UNATTESTED_REASONS, SUBMISSION_UNATTESTED_WORDS } from '@tp/worker/packets';
import { PRICING_CHECK_CAUSES } from '@tp/worker/pricing';
import { describe, expect, it } from 'vitest';

import { PRICING_BLOCKED_TEXT, PRICING_CAUSE_TEXT } from './pricing';
import {
  RECONCILIATION_UNATTESTED,
  SENT_WITHOUT_SIGN_OFF,
  STALE_EXPORT_REVIEW,
  STALE_EXPORT_SUBMISSION,
  sentWithoutSignOffLine,
  staleExportSteps,
  submissionSentText,
  unattestedReasonText,
} from './unattested';

/**
 * The words of a submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061): an export whose
 * pricing went stale after it was made and before its attestation is never attested; the review says why and what to
 * do instead (re-price, a new version, a new export); the submissions page logs it, if it already went, recorded
 * unattested with its reason in the founder's words; reconciliation shows it plainly. No value, identifier, person's
 * text, promise of waiting or pull request number is in any of them.
 */

const EVERY_TEXT = [
  SENT_WITHOUT_SIGN_OFF,
  STALE_EXPORT_REVIEW.title,
  STALE_EXPORT_REVIEW.whatToDo,
  STALE_EXPORT_REVIEW.ifSent,
  STALE_EXPORT_REVIEW.button,
  STALE_EXPORT_REVIEW.sent('2026-10-20'),
  ...PRICING_CHECK_CAUSES.map((cause) => STALE_EXPORT_REVIEW.why(cause)),
  ...PRICING_CHECK_CAUSES.flatMap((cause) => staleExportSteps(cause).map((step) => step.text)),
  STALE_EXPORT_SUBMISSION.title,
  STALE_EXPORT_SUBMISSION.notSent,
  STALE_EXPORT_SUBMISSION.sent,
  STALE_EXPORT_SUBMISSION.confirm,
  STALE_EXPORT_SUBMISSION.submit,
  STALE_EXPORT_SUBMISSION.confirmRequired,
  STALE_EXPORT_SUBMISSION.logged,
  ...PRICING_CHECK_CAUSES.map((cause) => STALE_EXPORT_SUBMISSION.why(cause)),
  ...SUBMISSION_UNATTESTED_REASONS.map((reason) => sentWithoutSignOffLine(reason)),
  RECONCILIATION_UNATTESTED.title,
  RECONCILIATION_UNATTESTED.description,
  RECONCILIATION_UNATTESTED.empty,
  PRICING_BLOCKED_TEXT.attestation,
];

describe('the reason a submission was sent without sign-off', () => {
  it('is the founder’s words, as a sentence starts, for the one reason there is', () => {
    expect(SUBMISSION_UNATTESTED_REASONS).toEqual(['pricing_stale_after_export']);
    expect(SUBMISSION_UNATTESTED_WORDS.pricing_stale_after_export).toBe('sent without sign-off: pricing went stale after export');
    expect(unattestedReasonText('pricing_stale_after_export')).toBe('Sent without sign-off: pricing went stale after export');
    expect(submissionSentText({ kind: 'unattested', reason: 'pricing_stale_after_export' })).toBe('Sent without sign-off: pricing went stale after export');
    expect(submissionSentText({ kind: 'attested' })).toBe('Attested export');
    expect(sentWithoutSignOffLine('pricing_stale_after_export')).toMatch(/^Sent without sign-off: pricing went stale after export\. /);
  });
});

describe('the review’s refusal of a stale export', () => {
  it('says why, by cause, that it is never attested, and that waiting changes nothing', () => {
    for (const cause of PRICING_CHECK_CAUSES) {
      const why = STALE_EXPORT_REVIEW.why(cause);
      expect(why.startsWith(`${PRICING_CAUSE_TEXT[cause]}. `)).toBe(true);
      expect(why).toContain('never attested');
      expect(why).toContain('a stale line never becomes current again');
    }
    expect(STALE_EXPORT_REVIEW.title).toBe('Not attested: this export’s pricing went stale after the export');
    expect(STALE_EXPORT_REVIEW.button).toContain('never attested');
  });

  it('gives the three steps in order: re-price, a new version, a new export, which a reviewer attests', () => {
    for (const cause of PRICING_CHECK_CAUSES) {
      const steps = staleExportSteps(cause);
      expect(steps.map((step) => step.id)).toEqual(['reprice', 'version', 'export']);
      expect(steps[0]?.text).toMatch(/^Re-price: /);
      expect(steps[1]?.text).toMatch(/^A new version: /);
      expect(steps[2]?.text).toMatch(/^A new export: /);
      expect(steps[2]?.text).toContain('attests that export');
      // Nothing refreshes a case yet: the stale lines are written off, and a case whose lines are all stale waits for that.
      expect(steps[1]?.text).toContain('writes the stale lines off on the case page');
      expect(steps[1]?.text).toContain('When every line of the case is stale');
    }
    // An accepted re-run has priced the lines again already; a withdrawal or a correction needs one.
    expect(staleExportSteps('PRICING_NOT_IN_EFFECT')[0]?.text).toMatch(/^Re-price: done already\./);
    for (const cause of PRICING_CHECK_CAUSES.filter((each) => each !== 'PRICING_NOT_IN_EFFECT')) {
      expect(staleExportSteps(cause)[0]?.text).toContain('re-runs the stale lines’ period');
    }
  });

  it('says how an export already sent is logged, and once it is, that it was', () => {
    expect(STALE_EXPORT_REVIEW.ifSent).toContain('sent without sign-off: pricing went stale after export');
    expect(STALE_EXPORT_REVIEW.sent('2026-10-20')).toBe(
      'The practice logged this export’s submission of 2026-10-20 as sent without sign-off: pricing went stale after export. This version is never attested; reconciliation tracks the payer’s answer to it.',
    );
    // The attest route's refusal says the same.
    expect(PRICING_BLOCKED_TEXT.attestation).toContain('never attested');
    expect(PRICING_BLOCKED_TEXT.attestation).toContain('re-priced');
    expect(PRICING_BLOCKED_TEXT.attestation).toContain('sent without sign-off');
  });
});

describe('the submissions page’s log of a stale export', () => {
  it('says it is never attested, not to send it if it has not gone, and how it is recorded if it has', () => {
    expect(STALE_EXPORT_SUBMISSION.title).toBe('This export is never attested: its pricing went stale after the export');
    for (const cause of PRICING_CHECK_CAUSES) {
      expect(STALE_EXPORT_SUBMISSION.why(cause).startsWith(`${PRICING_CAUSE_TEXT[cause]}. `)).toBe(true);
    }
    expect(STALE_EXPORT_SUBMISSION.notSent).toMatch(/^If it has not gone to the payer, do not send it: /);
    expect(STALE_EXPORT_SUBMISSION.sent).toContain('It is recorded as sent without sign-off: pricing went stale after export');
    expect(STALE_EXPORT_SUBMISSION.sent).toContain('reconciliation tracks the payer’s answer');
    expect(STALE_EXPORT_SUBMISSION.submit).toBe('Log the submission sent without sign-off');
    expect(STALE_EXPORT_SUBMISSION.confirm).toContain('without the reimbursement reviewer’s sign-off');
    expect(STALE_EXPORT_SUBMISSION.logged).toMatch(/^The submission is logged as sent without sign-off: pricing went stale after export\. /);
    expect(STALE_EXPORT_SUBMISSION.logged).toContain('never attested');
  });
});

describe('every one of these sentences', () => {
  it('holds no figure, identifier, promise of waiting, pull request number or internal code', () => {
    for (const text of EVERY_TEXT) {
      expect(text.trim()).toBe(text);
      expect(text).not.toMatch(/\bor wait\b|\bwait for\b|\bPR \d|\bpull request\b/i);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(text).not.toMatch(/\$\d|\b\d+\.\d{2}\b/);
      expect(text).not.toMatch(/pricing_stale_after_export|PRICING_NOT_IN_EFFECT|unattested_reason|pricing_check/);
      expect(text).not.toMatch(/ {2}|\s[,.;:]/);
    }
  });
});
