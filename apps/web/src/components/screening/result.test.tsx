import { tagline } from '@paidwhole/brand/tokens';
import { type Cents, cents } from '@tp/money';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MEDICARE_FIGURE_LABEL } from '../../lib/screening/labels';
import { type ScreeningGroup, type ScreeningRow, ScreeningAnomalies, ScreeningTopRows } from './anomalies';
import { type ScreeningCoverageRow, ScreeningCoverage } from './coverage';
import { type ScreeningSummaryData, ScreeningHeading, ScreeningSummary, differenceWords } from './result-summary';

/**
 * A screening's result as the page shows it (CO-04; decisions D19 and D20): the totals, the Medicare-priced figures
 * under D19's label, the anomalies by code and payer product, the coverage and the dollars that cannot be priced
 * without a contract, each figure in the mono face, and never owed, underpaid or recovered (SCR-05, the screens'
 * side). SYNTHETIC figures, written by hand.
 */

const c = (value: bigint): Cents => cents(value);

const SUMMARY: ScreeningSummaryData = {
  practiceName: 'SYNTHETIC SCREENING CLINIC',
  state: 'ZZ',
  zip: '00011',
  releaseNo: 900001,
  engineVersion: 'engine/1',
  createdAt: '2026-10-18T12:00:00.000Z',
  expiresAt: '2026-11-17T12:00:00.000Z',
  rows: 6,
  claimLines: 140,
  observedCents: c(1_234_500n),
  priced: { rows: 3, claimLines: 80, expectedCents: c(600_000n), observedCents: c(512_000n), differenceCents: c(88_000n) },
  contractRequired: { rows: 2, claimLines: 50, observedCents: c(654_321n) },
  notScreened: { rows: 1, claimLines: 10, observedCents: c(68_179n) },
  couldNotPrice: { rows: 0, claimLines: 0, observedCents: c(0n) },
};

const GROUPS: ScreeningGroup[] = [
  { payerProduct: 'ma_noncontracted', procedureCode: '97110', rows: 2, claimLines: 60, expectedCents: c(450_000n), observedCents: c(360_000n), differenceCents: c(90_000n), anomaly: true },
  { payerProduct: 'medicare_ffs', procedureCode: '97140', rows: 1, claimLines: 20, expectedCents: c(150_000n), observedCents: c(152_000n), differenceCents: c(-2_000n), anomaly: false },
];

const ROWS: ScreeningRow[] = [
  {
    rowNo: 4,
    procedureCode: '97110',
    modifiers: ['GP'],
    units: 2,
    placeOfService: '11',
    payerProduct: 'ma_noncontracted',
    serviceBand: '2026-Q1',
    claimCount: 40,
    expectedLineCents: c(7_500n),
    expectedCents: c(300_000n),
    observedCents: c(240_000n),
    differenceCents: c(60_000n),
  },
];

const COVERAGE: ScreeningCoverageRow[] = [
  { payerProduct: 'ma_noncontracted', disposition: 'priced', unpricedReason: null, unpricedDetail: null, rows: 2, claimLines: 60, observedCents: c(360_000n) },
  { payerProduct: 'commercial', disposition: 'contract_required', unpricedReason: null, unpricedDetail: null, rows: 2, claimLines: 50, observedCents: c(654_321n) },
  { payerProduct: 'medicare_ffs', disposition: 'unpriced', unpricedReason: 'ENGINE_ERROR', unpricedDetail: 'place_of_service_unmapped', rows: 1, claimLines: 1, observedCents: c(100n) },
  { payerProduct: 'medicaid', disposition: 'not_screened', unpricedReason: null, unpricedDetail: null, rows: 1, claimLines: 10, observedCents: c(68_179n) },
];

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;

/** The page's text as a reader sees it: tags dropped, entities read. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

describe('the screening summary', () => {
  const html = renderToStaticMarkup(
    <>
      <ScreeningHeading summary={SUMMARY} />
      <ScreeningSummary summary={SUMMARY} />
    </>,
  );

  it('shows the file’s totals, the Medicare figures under D19’s label, and the contract dollars apart', () => {
    expect(text(html)).toContain(MEDICARE_FIGURE_LABEL);
    expect(html).toContain('$12,345.00');
    expect(html).toMatch(/data-figure="priced-expected"[\s\S]*?\$6,000\.00/);
    expect(html).toMatch(/data-figure="priced-allowed"[\s\S]*?\$5,120\.00/);
    expect(html).toMatch(/data-figure="priced-difference"[\s\S]*?\$880\.00/);
    expect(html).toMatch(/data-section="contract-required"[\s\S]*?Cannot be priced without a contract[\s\S]*?\$6,543\.21/);
    expect(html).toMatch(/data-section="not-screened"[\s\S]*?\$681\.79/);
    expect(text(html)).toContain('below the Medicare figure in total');
    expect(text(html)).toContain('A screening is investigatory');
  });

  it('names the release, the engine and when the link stops opening it', () => {
    expect(text(html)).toContain('rule release 900001');
    expect(text(html)).toContain('engine/1');
    expect(text(html)).toContain('until 2026-11-17');
  });

  it('sets every figure in the mono face with tabular numerals', () => {
    for (const match of html.matchAll(/\$[\d,]+\.\d{2}/g)) {
      const before = html.slice(0, match.index);
      expect(before.slice(before.lastIndexOf('<span')), match[0]).toMatch(/^<span class="font-mono tabular-nums/);
    }
  });

  it('says where the file’s total sits in words', () => {
    expect(differenceWords(c(1n))).toBe('below the Medicare figure');
    expect(differenceWords(c(-1n))).toBe('above the Medicare figure');
    expect(differenceWords(c(0n))).toBe('equal to the Medicare figure');
  });
});

describe('the anomalies by code and payer product', () => {
  const html = renderToStaticMarkup(<ScreeningAnomalies groups={GROUPS} />);

  it('lists each group with expected, allowed and the difference in that order, and its status in words', () => {
    const headers = [...html.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(['Code', 'Payer product', 'Rows', 'Claim lines', MEDICARE_FIGURE_LABEL, 'Allowed in your file', 'Difference', 'Status']);
    expect(html).toMatch(/data-group="97110:ma_noncontracted"[\s\S]*?\$4,500\.00[\s\S]*?\$3,600\.00[\s\S]*?\$900\.00[\s\S]*?data-tone="short"[^>]*>Anomaly: below the Medicare figure/);
    expect(html).toMatch(/data-group="97140:medicare_ffs"[\s\S]*?-\$20\.00[\s\S]*?data-tone="neutral"[^>]*>Allowed is above the Medicare figure/);
    expect(text(html)).toContain('1 group of 2 is an anomaly');
    expect(text(html)).toContain('Medicare Advantage, no contract');
  });

  it('gives every header but the last the padding its cells have', () => {
    const classes = [...html.matchAll(/<th class="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(classes.slice(0, -1).filter((names) => !/\bpr-3\b/.test(names))).toEqual([]);
  });

  it('is an empty state when nothing was priced', () => {
    const empty = renderToStaticMarkup(<ScreeningAnomalies groups={[]} />);
    expect(empty).not.toContain('<table');
    expect(empty).toContain('data-slot="empty-state"');
  });

  it('lists the top rows with their one-line figure and the row’s, under D19’s label', () => {
    const rows = renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />);
    expect(text(rows)).toContain(MEDICARE_FIGURE_LABEL);
    expect(rows).toMatch(/data-row-no="4"[\s\S]*?97110[\s\S]*?GP[\s\S]*?2026-Q1[\s\S]*?\$75\.00[\s\S]*?\$3,000\.00[\s\S]*?\$2,400\.00[\s\S]*?\$600\.00/);
    const many = renderToStaticMarkup(<ScreeningTopRows rows={Array.from({ length: 30 }, (_, index) => ({ ...ROWS[0] as ScreeningRow, rowNo: index + 1 }))} />);
    expect(many.match(/data-row-no=/g)).toHaveLength(25);
    expect(renderToStaticMarkup(<ScreeningTopRows rows={[]} />)).not.toContain('<table');
  });
});

describe('the coverage', () => {
  const html = renderToStaticMarkup(<ScreeningCoverage coverage={COVERAGE} />);

  it('lists every row’s outcome by payer product, with the engine’s reason and a labelled chip', () => {
    expect(html.match(/<tr [^>]*data-coverage=/g)).toHaveLength(4);
    expect(html).toMatch(/data-coverage="commercial:contract_required"[\s\S]*?Cannot be priced without a contract[\s\S]*?\$6,543\.21/);
    expect(html).toMatch(/data-coverage="medicare_ffs:unpriced" data-reason="ENGINE_ERROR"[\s\S]*?The place of service is not in the approved place-of-service split/);
    expect(html).toMatch(/data-coverage="medicaid:not_screened"[\s\S]*?Not screened/);
    expect(text(html)).toContain('33% of the rows (2 of 6) cannot be priced without a contract');
    expect(html).not.toContain('data-tone="whole"');
  });
});

describe('a screening’s words (SCR-05, the screens)', () => {
  it('never say owed, underpaid or recovered, nor the tagline', () => {
    const html = renderToStaticMarkup(
      <>
        <ScreeningHeading summary={SUMMARY} />
        <ScreeningSummary summary={SUMMARY} />
        <ScreeningAnomalies groups={GROUPS} />
        <ScreeningTopRows rows={ROWS} />
        <ScreeningCoverage coverage={COVERAGE} />
      </>,
    );
    expect(text(html)).not.toMatch(FORBIDDEN);
    expect(text(html)).not.toContain(tagline);
    expect(text(html)).not.toContain(tagline.split('.')[0] ?? tagline);
  });
});
