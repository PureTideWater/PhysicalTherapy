import { SUBMISSION_UNATTESTED_REASONS, SUBMISSION_UNATTESTED_WORDS } from '@tp/worker/packets';
import { PRICING_CHECK_CAUSES, type PricingCheckCause } from '@tp/worker/pricing';
import { describe, expect, it } from 'vitest';

import { PRICING_BLOCKED_TEXT, PRICING_CAUSE_TEXT } from './pricing';
import {
  CLOSED_CASE_SUBMISSION,
  EARLIER_EXPORT_SUBMISSION,
  NEVER_ATTESTED_LIST,
  RECONCILIATION_UNATTESTED,
  SENT_WITHOUT_SIGN_OFF,
  STALE_EXPORT_REVIEW,
  STALE_EXPORT_SUBMISSION,
  type StalePricing,
  everyLineStale,
  rowsText,
  sentWithoutSignOffLine,
  staleCauses,
  staleExportBuilder,
  staleExportSteps,
  submissionSentText,
  unattestedReasonText,
} from './unattested';

/**
 * The words of a submission sent without sign-off (the founder's ruling of 2026-10-20; docs/adr/0061): an export whose
 * pricing went stale after it was made and before its attestation is never attested; the review says why, by each
 * stale line's own cause, that an export already sent is logged first, and what to do instead (re-price, a new version,
 * a new export); the submissions page logs it, if it already went, recorded unattested with its reason in the founder's
 * words; reconciliation shows it plainly. No value, identifier, person's text, promise of waiting or pull request
 * number is in any of them.
 */

/** A version's pricing now with these stale lines (row, cause), its verdict the most severe of them. */
function stale(lines: readonly (readonly [number, PricingCheckCause])[]): StalePricing {
  const order: readonly string[] = PRICING_CHECK_CAUSES;
  const status = [...lines].sort((a, b) => order.indexOf(a[1]) - order.indexOf(b[1]))[0]?.[1] ?? 'PRICING_NOT_IN_EFFECT';
  return { status, lines: lines.map(([row, check]) => ({ row, check })) };
}
/** Three lines, all stale for one cause (as CAS-08's after an accepted re-run). */
const allOf = (cause: PricingCheckCause) => stale([[1, cause], [2, cause], [3, cause]]);
/** Line 1 priced again, line 2 under a withdrawn release, line 3 still current, of three. */
const MIXED = stale([[1, 'PRICING_NOT_IN_EFFECT'], [2, 'RELEASE_WITHDRAWN']]);

const EVERY_TEXT = [
  SENT_WITHOUT_SIGN_OFF,
  staleExportBuilder(true),
  staleExportBuilder(false),
  STALE_EXPORT_REVIEW.title,
  STALE_EXPORT_REVIEW.whatToDo,
  STALE_EXPORT_REVIEW.ifSent,
  STALE_EXPORT_REVIEW.button,
  STALE_EXPORT_REVIEW.files,
  STALE_EXPORT_REVIEW.approvedAlone,
  STALE_EXPORT_REVIEW.sent('2026-10-20'),
  STALE_EXPORT_REVIEW.why(MIXED),
  ...PRICING_CHECK_CAUSES.map((cause) => STALE_EXPORT_REVIEW.why(allOf(cause))),
  ...PRICING_CHECK_CAUSES.flatMap((cause) => [...staleExportSteps(allOf(cause), 3), ...staleExportSteps(stale([[2, cause]]), 3)].map((step) => step.text)),
  ...staleExportSteps(MIXED, 3).map((step) => step.text),
  STALE_EXPORT_SUBMISSION.title,
  STALE_EXPORT_SUBMISSION.notSent(true),
  STALE_EXPORT_SUBMISSION.notSent(false),
  STALE_EXPORT_SUBMISSION.sent,
  STALE_EXPORT_SUBMISSION.confirm,
  STALE_EXPORT_SUBMISSION.submit,
  STALE_EXPORT_SUBMISSION.confirmRequired,
  STALE_EXPORT_SUBMISSION.logged,
  STALE_EXPORT_SUBMISSION.why(MIXED),
  ...PRICING_CHECK_CAUSES.map((cause) => STALE_EXPORT_SUBMISSION.why(allOf(cause))),
  CLOSED_CASE_SUBMISSION,
  EARLIER_EXPORT_SUBMISSION.title(1, '2026-10-20'),
  EARLIER_EXPORT_SUBMISSION.description('2026-10-20'),
  NEVER_ATTESTED_LIST.title,
  NEVER_ATTESTED_LIST.mark,
  NEVER_ATTESTED_LIST.description,
  NEVER_ATTESTED_LIST.emptyWithNever,
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

describe('each stale line’s own cause', () => {
  it('is grouped by cause in the pricing check’s order, with its rows, and the version’s verdict alone when no line is listed', () => {
    expect(staleCauses(MIXED)).toEqual([
      { cause: 'PRICING_NOT_IN_EFFECT', rows: [1] },
      { cause: 'RELEASE_WITHDRAWN', rows: [2] },
    ]);
    expect(staleCauses(stale([[3, 'MAPPING_NOT_IN_FORCE'], [1, 'RELEASE_WITHDRAWN'], [2, 'MAPPING_NOT_IN_FORCE']]))).toEqual([
      { cause: 'RELEASE_WITHDRAWN', rows: [1] },
      { cause: 'MAPPING_NOT_IN_FORCE', rows: [3, 2] },
    ]);
    expect(staleCauses({ status: 'RELEASE_WITHDRAWN', lines: [] })).toEqual([{ cause: 'RELEASE_WITHDRAWN', rows: [] }]);
    expect(rowsText([2])).toBe('row 2');
    expect(rowsText([3, 1])).toBe('rows 1 and 3');
    expect(rowsText([1, 2, 3])).toBe('rows 1, 2 and 3');
    expect(everyLineStale(allOf('PRICING_NOT_IN_EFFECT'), 3)).toBe(true);
    expect(everyLineStale(MIXED, 3)).toBe(false);
  });
});

describe('the review’s refusal of a stale export', () => {
  it('says why, by each line’s cause, that it is never attested, and that waiting changes nothing', () => {
    for (const cause of PRICING_CHECK_CAUSES) {
      const why = STALE_EXPORT_REVIEW.why(allOf(cause));
      expect(why.startsWith(`${PRICING_CAUSE_TEXT[cause]}. `)).toBe(true);
      expect(why).toContain('never attested');
      expect(why).toContain('a stale line never becomes current again');
    }
    // Two causes: each with its rows, never only the most severe one.
    const why = STALE_EXPORT_REVIEW.why(MIXED);
    expect(why).toContain('Row 1: priced again since it joined the case');
    expect(why).toContain('Row 2: its rule release was withdrawn since it was priced');
    expect(STALE_EXPORT_REVIEW.title).toBe('Not attested: this export’s pricing went stale after the export');
    expect(STALE_EXPORT_REVIEW.button).toContain('never attested');
  });

  it('gives the three steps in order: re-price, a new version, a new export, which a reviewer attests', () => {
    for (const cause of PRICING_CHECK_CAUSES) {
      for (const pricing of [allOf(cause), stale([[2, cause]])]) {
        const steps = staleExportSteps(pricing, 3);
        expect(steps.map((step) => step.id)).toEqual(['reprice', 'version', 'export']);
        expect(steps[0]?.text).toMatch(/^Re-price: /);
        expect(steps[1]?.text).toMatch(/^A new version: /);
        expect(steps[2]?.text).toMatch(/^A new export: /);
        expect(steps[2]?.text).toContain('attests that export');
      }
    }
    // An accepted re-run has priced every stale line again already; a withdrawal or a correction needs one.
    expect(staleExportSteps(allOf('PRICING_NOT_IN_EFFECT'), 3)[0]?.text).toMatch(/^Re-price: done already\./);
    for (const cause of PRICING_CHECK_CAUSES.filter((each) => each !== 'PRICING_NOT_IN_EFFECT')) {
      expect(staleExportSteps(allOf(cause), 3)[0]?.text).toContain('are not priced again yet: a billing manager re-runs their period');
      expect(staleExportSteps(stale([[2, cause]]), 3)[0]?.text).toMatch(/^Re-price: row 2 \([a-z ]+\) is not priced again yet: a billing manager re-runs its period/);
    }
  });

  it('never says re-pricing is done while a line under another cause is not priced again, and names each line', () => {
    const [reprice, version] = staleExportSteps(MIXED, 3);
    expect(reprice?.text).not.toContain('done already');
    expect(reprice?.text).toBe(
      'Re-price: row 2 (rule release withdrawn) is not priced again yet: a billing manager re-runs its period under the release, mapping and contract version in force now and accepts the re-run; Pricing now shows the figures once it is accepted. Row 1 was priced again already.',
    );
    // Partly stale: the stale lines are written off and a new version written on the lines left.
    expect(version?.text).toContain('writes the stale lines (rows 1 and 2) off on the case page');
    expect(version?.text).toContain('on the lines left');
  });

  it('does not tell a version whose every line is stale to write a new version, and says writing them all off closes the case', () => {
    const [, version, exported] = staleExportSteps(allOf('PRICING_NOT_IN_EFFECT'), 3);
    expect(version?.text).toMatch(/^A new version: not yet\. Every line of this version is stale/);
    expect(version?.text).toContain('Writing every line off closes the case, and a closed case takes no submission and no new version.');
    expect(exported?.text).toMatch(/^A new export: once a new version can be written/);
  });

  it('says an export already sent is logged first, before any step changes what can be logged, and once it is, that it was', () => {
    expect(STALE_EXPORT_REVIEW.ifSent).toMatch(/^If the practice already sent this export to the payer, a billing manager logs that submission first, on its submissions page, as it happened, before any step below: /);
    expect(STALE_EXPORT_REVIEW.ifSent).toContain('once every line of the case is written off the case is closed and takes no submission');
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

describe('the packet builder’s line for a stale export', () => {
  it('says it is never attested, that an export already sent is logged first, and what replaces it', () => {
    for (const allStale of [true, false]) {
      const line = staleExportBuilder(allStale);
      expect(line).toMatch(/^Never attested: this export’s pricing went stale after the export\. If it already went to the payer, log it first, on the submissions page, as sent without sign-off, before any line is written off or a new version is written\. If it has not, do not send it: /);
    }
    expect(staleExportBuilder(false)).toContain('a new version is written, approved and exported on the pricing in effect');
    expect(staleExportBuilder(true)).toContain('every line is stale, and no new version can be written');
  });
});

describe('the submissions page’s log of a stale export', () => {
  it('says it is never attested, to log it first if it went, not to send it if it has not, and how it is recorded', () => {
    expect(STALE_EXPORT_SUBMISSION.title).toBe('This export is never attested: its pricing went stale after the export');
    for (const cause of PRICING_CHECK_CAUSES) {
      expect(STALE_EXPORT_SUBMISSION.why(allOf(cause)).startsWith(`${PRICING_CAUSE_TEXT[cause]}. `)).toBe(true);
    }
    expect(STALE_EXPORT_SUBMISSION.sent).toMatch(/^If it already went to the payer, log it here first, as it happened, before any line is written off or a new version is written: once every line is written off the case is closed and takes no submission\. /);
    expect(STALE_EXPORT_SUBMISSION.notSent(false)).toMatch(/^If it has not gone to the payer, do not send it: the stale lines are re-priced, a new version is written/);
    expect(STALE_EXPORT_SUBMISSION.notSent(true)).toMatch(/^If it has not gone to the payer, do not send it: every line is stale, and no new version can be written/);
    expect(STALE_EXPORT_SUBMISSION.sent).toContain('It is recorded as sent without sign-off: pricing went stale after export');
    expect(STALE_EXPORT_SUBMISSION.sent).toContain('reconciliation tracks the payer’s answer');
    expect(STALE_EXPORT_SUBMISSION.submit).toBe('Log the submission sent without sign-off');
    expect(STALE_EXPORT_SUBMISSION.confirm).toContain('without the reimbursement reviewer’s sign-off');
    // The person confirms how it went (without sign-off), never when: an export sent the day it was made, before its
    // pricing went stale, is logged truthfully too (review of 2026-10-21).
    for (const words of [STALE_EXPORT_SUBMISSION.confirm, STALE_EXPORT_SUBMISSION.confirmRequired]) {
      expect(words).not.toMatch(/after its pricing went stale|went to the payer[^.;]*after/);
      expect(words).toContain('has since gone stale');
    }
    expect(STALE_EXPORT_SUBMISSION.logged).toMatch(/^The submission is logged as sent without sign-off: pricing went stale after export\. /);
    expect(STALE_EXPORT_SUBMISSION.logged).toContain('never attested');
    expect(CLOSED_CASE_SUBMISSION).toContain('reopen a line on the case page with the reason, then log the submission here');
  });
});

describe('every one of these sentences', () => {
  it('holds no figure, identifier, promise of waiting, pull request number or internal code', () => {
    for (const text of EVERY_TEXT) {
      expect(text.trim()).toBe(text);
      expect(text).not.toMatch(/\bor wait\b|\bwait for\b|\bPR \d|\bpull request\b/i);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
      expect(text).not.toMatch(/\$\d|\b\d+\.\d{2}\b/);
      expect(text).not.toMatch(/pricing_stale_after_export|PRICING_NOT_IN_EFFECT|RELEASE_WITHDRAWN|unattested_reason|pricing_check/);
      expect(text).not.toMatch(/ {2}|\s[,.;:]/);
    }
  });
});
