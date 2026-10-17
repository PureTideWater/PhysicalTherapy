import { readDocumentPages } from '@tp/contracts/pages';
import { type LedgerEntry, entriesById, reportReconciliation } from '@tp/ledger';
import { cents } from '@tp/money';
import { describe, expect, it } from 'vitest';

import { statementHtml } from '../reconcile/statement-html';
import { brandedDocument, inlineSvg, reportStyles, verifiedBadge, verifiedSeal } from './brand';
import { ChromiumPdfRenderer, chromiumInstalled } from './pdf';
import { amountsNotInMono } from './test-support/figures';

/**
 * The PaidWhole report frame (docs/brand/BRAND.md, section 7; docs/adr/0055): the brand's styles and fonts
 * travel inside the document, the cover leads with the lockup and carries the seal and its definition only
 * when the ledger says the report's recovered total reconciles to cash, and a white label shows the badge
 * in its footer only then. SYNTHETIC ledger entries.
 */

const ENTRIES: LedgerEntry[] = [
  { id: 'entry-deposit', caseId: 'case-1', serviceLineId: 'line-1', stage: 'deposited', amountCents: cents(3000n), evidenceKind: 'eft_row', evidenceId: 'eft-1', allocated: false, effectiveOn: '2026-08-14' },
  { id: 'entry-recoup', caseId: 'case-1', serviceLineId: 'line-1', stage: 'recouped', amountCents: cents(-1800n), evidenceKind: 'provider_adjustment', evidenceId: 'plb-1', allocated: false, effectiveOn: '2026-09-02' },
];
const LEDGER = entriesById(ENTRIES);
const STATEMENT = {
  periodFrom: '2026-04-01',
  periodTo: '2026-09-30',
  proofLevel: 'deposited' as const,
  feesCents: cents(0n),
  recoveredCents: cents(1200n),
  interestCents: cents(0n),
  approvedUnpostedCents: cents(0n),
  actionableOpenCents: cents(0n),
  pursuitHours: '0.00',
  links: { recovered: ENTRIES.map((entry) => entry.id), interest: [], approvedUnposted: [], actionableOpen: [] },
};
const NONE = { storedCents: cents(0n), recomputedCents: cents(0n), matches: true, entries: [] };
const CHECK = { matches: true, recovered: { storedCents: cents(1200n), recomputedCents: cents(1200n), matches: true, entries: ENTRIES }, interest: NONE, approvedUnposted: NONE };

/** The ledger's answer for the statement, stating `stated` as its recovered total. */
function gate(stated: bigint) {
  return reportReconciliation({ report: { kind: 'roi_statement', id: 'statement-1' }, proofLevel: 'deposited', statedRecoveredCents: cents(stated), recoveredEntryIds: STATEMENT.links.recovered, ledger: LEDGER });
}

function statement(stated: bigint): string {
  return statementHtml({ statementId: 'statement-1', practiceName: 'SYNTHETIC PRACTICE', statement: STATEMENT, check: CHECK, generatedBy: null, generatedAt: '2026-10-01 09:00:00', reconciliation: gate(stated) });
}

/** The cover: everything before the inside pages' table. */
function cover(html: string): string {
  return html.slice(html.indexOf('<section class="cover"'), html.indexOf('<table class="pages"'));
}

const DEFINITION = 'Verified: recovered amounts reconcile to posted or deposited remittance; expected amounts trace to signed-off contract versions.';

describe('the report frame', () => {
  it('inlines the tokens and the report stylesheet with every font as a data URL, and names no URL', () => {
    const css = reportStyles();
    expect(css).toContain('--pw-ink:');
    expect(css).toContain('@page :first { margin: 0; }');
    expect(css.match(/url\("data:font\/woff2;base64,/g)).toHaveLength(8);
    expect(css).not.toMatch(/__FONT_DIR__|https?:/);
    // The report stylesheet itself is in tokens: its only colors are variables.
    expect(css.slice(css.indexOf('@font-face'))).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('sizes an outlined SVG from its viewBox and drops its namespace', () => {
    expect(inlineSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="400" height="100" role="img" aria-label="x"><path d="M0 0"/></svg>', 20, null)).toBe(
      '<svg viewBox="0 0 400 100" width="80.00" height="20" aria-hidden="true" focusable="false"><path d="M0 0"/></svg>',
    );
    expect(() => inlineSvg('<svg></svg>', 20, null)).toThrow('viewBox');
  });

  it('leaves the seal and the badge out unless the ledger says the recovered total reconciles to cash', () => {
    expect(verifiedSeal(gate(1300n))).toBe('');
    expect(verifiedBadge(gate(1300n))).toBe('');
    expect(verifiedSeal(gate(1200n))).toContain('data-verified="seal"');
    expect(verifiedSeal(gate(1200n))).toContain(DEFINITION);
    expect(verifiedBadge(gate(1200n))).toContain('aria-label="Verified by PaidWhole"');
  });
});

describe('a statement’s cover', () => {
  it('omits the seal and its definition when the ledger says it does not reconcile', () => {
    const refused = gate(1300n);
    expect(refused).toMatchObject({ reconciledToCash: false, reason: 'total_differs' });
    const html = cover(statement(1300n));
    expect(html).toContain('aria-label="PaidWhole"');
    expect(html).not.toContain('data-verified');
    expect(html).not.toContain('Verified:');
  });

  it('carries the seal bottom right with its definition when the ledger says it reconciles, naming the source', () => {
    const html = statement(1200n);
    const front = cover(html);
    expect(front).toContain('<div class="cover-foot"><figure class="seal" data-verified="seal" data-source="ledger.reportReconciliation(roi_statement statement-1)">');
    expect(front).toContain(DEFINITION);
    // The seal is the cover's alone: the inside pages carry the mark, never the seal.
    expect(html.slice(html.indexOf('<table class="pages"'))).not.toContain('data-verified');
  });

  it('names the recovered figure with its proof level and the fees as PaidWhole’s', () => {
    const html = statement(1200n);
    expect(html).toContain('Recovered principal, net (deposited): <span class="figure-amount">$12.00</span>');
    expect(html).toContain('Fees paid to PaidWhole:');
    expect(html).toContain('<title>ROI statement | PaidWhole</title>');
  });
});

describe('the inside pages’ running header', () => {
  it('is the 16 px mark alone beside the document’s title, hidden from readers, never a lockup built from the mark and the name', () => {
    const html = statement(1200n);
    const header = /<div class="page-header">.*?<\/div>/.exec(html)?.[0] ?? '';
    expect(header).toMatch(/^<div class="page-header"><span class="brand"><svg viewBox="0 0 240 240" width="16.00" height="16" aria-hidden="true" focusable="false">/);
    expect(header).toContain('<span class="title">ROI statement</span>');
    expect(header).not.toContain('PaidWhole');
    expect(header).toContain('<span class="practice">SYNTHETIC PRACTICE</span>');
  });
});

describe('a billing firm’s white label (the slot milestone 12 fills)', () => {
  const frame = { title: 'Audit report', kicker: 'Contract-payment audit', heading: 'Audit report', practiceName: 'SYNTHETIC PRACTICE', meta: [], reference: 'Report report-1', whiteLabel: { firmName: 'SYNTHETIC BILLING FIRM' } };

  it('names the firm, not PaidWhole, in the document’s title (the PDF’s Title) and the running header; PaidWhole is only inside the earned badge', () => {
    for (const reconciliation of [gate(1200n), gate(1300n)]) {
      const html = brandedDocument({ ...frame, reconciliation }, '', '<p>Body</p>');
      expect(html).toContain('<title>Audit report | SYNTHETIC BILLING FIRM</title>');
      expect(html).toContain('<span class="title">SYNTHETIC BILLING FIRM · Audit report</span>');
      // Every PaidWhole the document carries is the badge's label, and the badge is there only when earned.
      const outsideBadge = html.replace(/<span class="badge" data-verified="badge"[^>]*>.*?<\/span>/s, '');
      expect(outsideBadge).not.toMatch(/PaidWhole/i);
      expect(html.includes('PaidWhole')).toBe(reconciliation.reconciledToCash !== false);
    }
  });

  it('leads with the firm, shows no PaidWhole lockup or seal, and puts the badge in the footer only when earned', () => {
    const earned = brandedDocument({ ...frame, reconciliation: gate(1200n) }, '', '<p>Body</p>');
    expect(cover(earned)).toContain('<p class="firm">SYNTHETIC BILLING FIRM</p>');
    expect(cover(earned)).not.toContain('data-verified');
    expect(earned).not.toContain('aria-label="PaidWhole"');
    expect(earned).toContain('<div class="running-footer"><span class="firm">SYNTHETIC BILLING FIRM</span><span class="badge" data-verified="badge"');
    const refused = brandedDocument({ ...frame, reconciliation: gate(1300n) }, '', '<p>Body</p>');
    expect(refused).toContain('<div class="running-footer"><span class="firm">SYNTHETIC BILLING FIRM</span></div>');
    expect(refused).not.toContain('data-verified');
  });
});

describe('dollar figures in a printed statement', () => {
  it.skipIf(!chromiumInstalled())('are every one in IBM Plex Mono, in headings and running text as in tables (skipped where Playwright’s Chromium is not installed)', async () => {
    expect(await amountsNotInMono(statement(1200n))).toEqual([]);
    expect(statement(1200n)).toContain('Its 2 linked entries give <span class="figure-amount">$12.00</span>.');
  }, 60_000);
});

describe('printing a cover with Chromium', () => {
  it.skipIf(!chromiumInstalled())('prints the definition line on the cover only when the ledger says the statement reconciles (skipped where Playwright’s Chromium is not installed)', async () => {
    const renderer = new ChromiumPdfRenderer();
    const text = async (html: string) => {
      const read = await readDocumentPages({ bytes: await renderer.render(html), contentType: 'application/pdf' });
      expect(read.ok).toBe(true);
      return read.ok ? read.pages : [];
    };
    const earned = await text(statement(1200n));
    expect(earned[0]?.replace(/\s+/g, ' ')).toContain('Verified: recovered amounts reconcile to posted or deposited remittance');
    expect(earned[0]).toContain('ROI statement');
    expect(earned.slice(1).join(' ')).not.toContain('Verified:');
    const refused = await text(statement(1300n));
    expect(refused.join(' ')).not.toContain('Verified:');
    expect(refused[0]).toContain('ROI statement');
  }, 60_000);
});
