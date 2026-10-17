import { verifiedDefinition } from '@paidwhole/brand';
import { describe, expect, it } from 'vitest';

import { brandedDocument, verifiedBadge, verifiedSeal } from './brand';

/**
 * CO-01's acceptance in print: "VerifiedSeal and VerifiedBadge render nothing when reconciledToCash is false"
 * (docs/adr/0057). The web components prove it in apps/web/src/components/brand/brand.test.tsx; this is the
 * worker's report frame, given the fact as false directly, on a PaidWhole cover and in a white label's footer.
 */

const REFUSED = { reconciledToCash: false, source: 'ledger.reportReconciliation(roi_statement statement-1)' } as const;

describe('the report frame’s Verified marks when reconciledToCash is false', () => {
  it('are empty: no seal, no badge', () => {
    expect(verifiedSeal(REFUSED)).toBe('');
    expect(verifiedBadge(REFUSED)).toBe('');
  });

  it.each([
    ['a PaidWhole cover', null],
    ['a billing firm’s white label', { firmName: 'SYNTHETIC BILLING FIRM' }],
    ['a practice’s own letterhead', { firmName: 'SYNTHETIC PRACTICE' }],
  ])('leave no mark, definition or source anywhere in %s', (_name, whiteLabel) => {
    const html = brandedDocument(
      { title: 'ROI statement', kicker: 'Return on investment', heading: 'ROI statement', practiceName: 'SYNTHETIC PRACTICE', meta: [], reference: 'Statement statement-1', reconciliation: REFUSED, whiteLabel },
      '',
      '<p>Body</p>',
    );
    expect(html).not.toContain('data-verified');
    expect(html).not.toContain(verifiedDefinition);
    expect(html).not.toContain(REFUSED.source);
    expect(html).not.toMatch(/class="(seal|badge)"/);
  });
});
