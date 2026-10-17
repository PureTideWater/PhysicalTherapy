import { verifiedDefinition } from '@paidwhole/brand/tokens';
import { entriesById, reportReconciliation } from '@tp/ledger';
import { cents } from '@tp/money';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PaidWholeLockup, PaidWholeMark, VerifiedBadge, VerifiedSeal } from './index';

/**
 * The brand's React pieces (docs/brand/BRAND.md; docs/adr/0055): the Verified marks render nothing unless
 * the ledger says the report's recovered total reconciles to cash, and nothing here writes a style
 * attribute, which the pages' Content-Security-Policy refuses.
 */

const POSTED = {
  id: 'entry-1',
  caseId: 'case-1',
  serviceLineId: 'line-1',
  stage: 'posted' as const,
  amountCents: cents(3000n),
  evidenceKind: 'posting_row' as const,
  evidenceId: 'posting-row-1',
  allocated: false,
  effectiveOn: '2026-08-14',
};

function reconciliation(stated: bigint | null) {
  return reportReconciliation({ report: { kind: 'roi_statement', id: 'statement-1' }, proofLevel: 'posted', statedRecoveredCents: stated === null ? null : cents(stated), recoveredEntryIds: stated === null ? [] : [POSTED.id], ledger: entriesById([POSTED]) });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VerifiedSeal and VerifiedBadge', () => {
  it('render nothing when reconciledToCash is false, and say why outside production', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(renderToStaticMarkup(<VerifiedSeal reconciledToCash={false} source="ledger.reportReconciliation(roi_statement statement-1)" />)).toBe('');
    expect(renderToStaticMarkup(<VerifiedBadge reconciledToCash={false} source="ledger.reportReconciliation(roi_statement statement-1)" />)).toBe('');
    expect(warn.mock.calls).toEqual([
      ['Verified mark not rendered: reconciledToCash is false', { error_code: 'VERIFIED_SEAL_NOT_EARNED' }],
      ['Verified mark not rendered: reconciledToCash is false', { error_code: 'VERIFIED_BADGE_NOT_EARNED' }],
    ]);
  });

  it('render nothing for the ledger’s refusals: no recovered total, or a total its entries do not give', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const refused of [reconciliation(null), reconciliation(3100n)]) {
      expect(refused.reconciledToCash).toBe(false);
      expect(renderToStaticMarkup(<VerifiedSeal {...refused} />)).toBe('');
      expect(renderToStaticMarkup(<VerifiedBadge {...refused} />)).toBe('');
    }
  });

  it('render the seal with its definition line, and the badge, when the ledger says it reconciles, naming the source', () => {
    const earned = reconciliation(3000n);
    expect(earned.reconciledToCash).toBe(true);
    const seal = renderToStaticMarkup(<VerifiedSeal {...earned} />);
    expect(seal).toContain('src="/brand/paidwhole-seal.svg"');
    expect(seal).toContain(verifiedDefinition);
    expect(seal).toContain('data-source="ledger.reportReconciliation(roi_statement statement-1)"');
    expect(renderToStaticMarkup(<VerifiedSeal {...earned} withDefinition={false} />)).not.toContain(verifiedDefinition);
    const badge = renderToStaticMarkup(<VerifiedBadge {...earned} size="sm" />);
    expect(badge).toContain('Verified by PaidWhole');
    expect(badge).toContain(`title="${verifiedDefinition}"`);
  });

  it('cannot be handed a literal true', () => {
    // @ts-expect-error reconciledToCash is the ledger's answer, never a literal
    const literal = <VerifiedSeal reconciledToCash={true} source="anything" />;
    expect(literal).toBeDefined();
  });
});

describe('PaidWholeMark and PaidWholeLockup', () => {
  it('draw the mark from the brand’s paths, the small cut at 32 px and below, labelled when alone and hidden beside the name', () => {
    expect(renderToStaticMarkup(<PaidWholeMark size={24} />)).toMatch(/^<svg viewBox="0 0 240 240" width="24" height="24" role="img" aria-label="PaidWhole" focusable="false" data-cut="small">/);
    expect(renderToStaticMarkup(<PaidWholeMark size={40} decorative />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<PaidWholeMark size={40} />)).toContain('data-cut="standard"');
    expect(() => renderToStaticMarkup(<PaidWholeMark size={12} />)).toThrow('minimum size is 16 px');
  });

  it('set the wordmark as one word in the display face, and write no style attribute (the CSP refuses them)', () => {
    const header = renderToStaticMarkup(<PaidWholeLockup size={20} />);
    expect(header).toContain('>PaidWhole</span>');
    expect(header).toContain('font-display font-bold');
    expect(header).toContain('tracking-wordmark');
    expect(header).toContain('width="17"');
    const stacked = renderToStaticMarkup(<PaidWholeLockup size={28} stacked tagline />);
    expect(stacked).toContain('flex-col');
    expect(stacked).toContain('Know what you&#x27;re owed. Verify what you&#x27;re paid.');
    for (const html of [header, stacked, renderToStaticMarkup(<VerifiedBadge {...reconciliation(3000n)} />), renderToStaticMarkup(<VerifiedSeal {...reconciliation(3000n)} />)]) {
      expect(html).not.toContain('style=');
    }
  });
});
