import { describe, expect, it } from 'vitest';

import { SUBMISSION_UNATTESTED_WORDS } from '../packets/submission-kinds';
import { auditHtml, caseStateText, unattestedSubmissionsText } from './html';
import { CONTENT } from './test-support/audit-content';

/**
 * The audit report says plainly how many of a case's submissions were sent without sign-off (the founder's ruling of
 * 2026-10-20; docs/adr/0061): an export whose pricing went stale after it was made was never attested, and its
 * submission was logged unattested with its reason. The count is stored per case only when there is one, so a report
 * without any reads exactly as before. SYNTHETIC figures, written by hand.
 */

describe('a case’s submissions sent without sign-off in the report', () => {
  it('reads in the founder’s words, counted, beside the case’s state', () => {
    expect(SUBMISSION_UNATTESTED_WORDS.pricing_stale_after_export).toBe('sent without sign-off: pricing went stale after export');
    expect(unattestedSubmissionsText(1)).toBe('1 submission sent without sign-off: pricing went stale after export');
    expect(unattestedSubmissionsText(2)).toBe('2 submissions sent without sign-off: pricing went stale after export');
    expect(caseStateText({ state: 'awaiting_response', unattested_submissions: 1 })).toBe('awaiting response; 1 submission sent without sign-off: pricing went stale after export');
    expect(caseStateText({ state: 'awaiting_response' })).toBe('awaiting response');
    expect(caseStateText({ state: 'submitted', unattested_submissions: 0 })).toBe('submitted');
  });

  it('prints it in the payer approved and recovered section, with what it means, and nothing when there is none', () => {
    const first = CONTENT.cases[0];
    if (first === undefined) {
      throw new Error('the content has no case');
    }
    const plain = auditHtml(CONTENT);
    expect(plain).not.toContain('sent without sign-off');
    expect(plain).not.toContain('data-unattested-submissions');

    const html = auditHtml({ ...CONTENT, cases: [{ ...first, state: 'awaiting_response', unattested_submissions: 1 }, ...CONTENT.cases.slice(1)] });
    expect(html).toContain('awaiting response; 1 submission sent without sign-off: pricing went stale after export');
    expect(html).toContain('data-unattested-submissions="1"');
    expect(html).toContain('no reimbursement reviewer attested it; the payer&#39;s answer to it counts here as any other&#39;s.');
  });
});
