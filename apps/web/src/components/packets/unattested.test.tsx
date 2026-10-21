import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { STALE_EXPORT_REVIEW, type StalePricing, staleExportSteps } from '../../lib/packets/unattested';
import { StaleExportReview, UnattestedSubmissions } from './unattested';

/**
 * The review's explanation of a stale export and Reconciliation's list of the submissions sent without sign-off (the
 * founder's ruling of 2026-10-20; docs/adr/0061), rendered as the pages render them. SYNTHETIC IDs, written by hand.
 */

const PRACTICE = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b01';
const CASE = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b02';
const SUBMISSION = '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

/** The markup's text, as a reader meets it. */
const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replaceAll('&#x27;', '’')
    .replace(/\s+/g, ' ')
    .trim();

/** CAS-08's three lines after an accepted re-run, every one priced again. */
const RE_PRICED: StalePricing = { status: 'PRICING_NOT_IN_EFFECT', lines: [1, 2, 3].map((row) => ({ row, check: 'PRICING_NOT_IN_EFFECT' })) };
/** Row 2 under a withdrawn release, of three. */
const WITHDRAWN: StalePricing = { status: 'RELEASE_WITHDRAWN', lines: [{ row: 2, check: 'RELEASE_WITHDRAWN' }] };

describe('the review’s explanation of an export whose pricing went stale after it was made', () => {
  it('says why it is never attested, that an export already sent is logged first, then the three steps in order', () => {
    const markup = renderToStaticMarkup(<StaleExportReview pricing={WITHDRAWN} versionLines={3} unattestedReason="pricing_stale_after_export" sent={null} />);
    expect(markup).toContain('data-stale-export="RELEASE_WITHDRAWN"');
    expect(markup).toContain('data-sent="no"');
    expect(text(markup)).toContain(STALE_EXPORT_REVIEW.title);
    expect(text(markup)).toContain(STALE_EXPORT_REVIEW.why(WITHDRAWN));
    expect([...markup.matchAll(/data-step="([a-z]+)"/g)].map((match) => match[1])).toEqual(['reprice', 'version', 'export']);
    for (const step of staleExportSteps(WITHDRAWN, 3)) {
      expect(text(markup)).toContain(step.text);
    }
    expect(markup).toContain('data-if-sent="without_sign_off"');
    expect(text(markup)).toContain(STALE_EXPORT_REVIEW.ifSent);
    // Log first: said before the steps.
    expect(markup.indexOf('data-if-sent')).toBeLessThan(markup.indexOf('data-step="reprice"'));
  });

  it('says once it was logged sent without sign-off, and offers no log of an export nothing says may be', () => {
    const sent = renderToStaticMarkup(<StaleExportReview pricing={RE_PRICED} versionLines={3} unattestedReason={null} sent={{ submittedOn: '2026-10-20' }} />);
    expect(sent).toContain('data-sent="without_sign_off"');
    expect(sent).toContain('data-sent-without-sign-off="2026-10-20"');
    expect(text(sent)).toContain(STALE_EXPORT_REVIEW.sent('2026-10-20'));
    expect(sent).not.toContain('data-if-sent');
    // An export made before the export's checks were recorded: never attested, and not logged without sign-off either.
    const before = renderToStaticMarkup(<StaleExportReview pricing={RE_PRICED} versionLines={3} unattestedReason={null} sent={null} />);
    expect(before).not.toContain('data-if-sent');
    expect(text(before)).not.toContain(STALE_EXPORT_REVIEW.ifSent);
  });
});

describe('Reconciliation’s list of the submissions sent without sign-off', () => {
  it('shows each plainly with its reason, its cause and the payer’s latest answer, and links its case', () => {
    const markup = renderToStaticMarkup(
      <UnattestedSubmissions
        practiceId={PRACTICE}
        unattested={{
          total: 1,
          items: [
            {
              submissionId: SUBMISSION,
              caseId: CASE,
              versionNo: 1,
              disputeLevel: 1,
              submittedOn: '2026-10-20',
              channel: 'payer_portal',
              reason: 'pricing_stale_after_export',
              pricingCheck: 'PRICING_NOT_IN_EFFECT',
              latestResponse: { kind: 'partial', receivedOn: '2026-10-21' },
            },
          ],
        }}
      />,
    );
    expect(markup).toContain('aria-label="Submissions sent without sign-off"');
    expect(markup).toContain(`data-submission="${SUBMISSION}"`);
    expect(markup).toContain('data-unattested-reason="pricing_stale_after_export"');
    expect(markup).toContain('data-latest-response="partial"');
    expect(markup).toContain(`href="/p/${PRACTICE}/cases/${CASE}/submissions"`);
    expect(markup).toContain(`href="/p/${PRACTICE}/reconciliation?case=${CASE}"`);
    const shown = text(markup);
    expect(shown).toContain('Sent without sign-off 2026-10-20, Payer portal packet version 1, dispute level 1');
    expect(shown).toContain('Sent without sign-off: pricing went stale after export. The cause, when it was logged: Priced again since it joined the case');
    expect(shown).toContain('The payer’s latest answer: Partially accepted, received 2026-10-21.');
  });

  it('shows nothing when there is none, and says when more are kept than listed', () => {
    expect(renderToStaticMarkup(<UnattestedSubmissions practiceId={PRACTICE} unattested={{ total: 0, items: [] }} />)).toBe('');
    const item = { submissionId: SUBMISSION, caseId: CASE, versionNo: 2, disputeLevel: 1, submittedOn: '2026-10-20', channel: 'fax', reason: 'pricing_stale_after_export', pricingCheck: null, latestResponse: null } as const;
    const markup = renderToStaticMarkup(<UnattestedSubmissions practiceId={PRACTICE} unattested={{ total: 51, items: [item] }} />);
    expect(text(markup)).toContain('The payer has not answered it yet.');
    expect(text(markup)).toContain('The newest 1 of 51 are listed');
  });
});
