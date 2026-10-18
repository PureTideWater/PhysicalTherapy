import { tagline } from '@paidwhole/brand/tokens';
import { type Cents, cents } from '@tp/money';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ANOMALY_RULE,
  BEFORE_REDUCTION,
  BEFORE_REDUCTION_FIGURE,
  DIFFERENCE_LABEL,
  FULLY_REDUCED,
  MEDICARE_FIGURE_LABEL,
  MEDICARE_FIGURE_NOTE,
  MEDICARE_LINE_LABEL,
  ONE_FIGURE,
  REDUCED_DIFFERENCE_LABEL,
  REDUCED_FIGURE,
  REDUCED_FIGURE_LABEL,
  REDUCED_LINE_LABEL,
  WITHIN_REDUCTION_RANGE,
} from '../../lib/screening/labels';
import { type ScreeningGroup, type ScreeningRow, ScreeningAnomalies, ScreeningTopRows, anomaliesDescription } from './anomalies';
import { type ScreeningCoverageRow, ScreeningCoverage } from './coverage';
import { type ScreeningSummaryData, ScreeningHeading, ScreeningReleaseWithdrawn, ScreeningSummary, differenceWords } from './result-summary';

/**
 * A screening's result as the page shows it (CO-04; decisions D19 and D20; the owner's rulings of 2026-10-18): the
 * totals, the Medicare-priced figures under D19's label and, for a code in the reduction across codes, the fully
 * reduced figure under its own; the anomalies by code and payer product with the database's standings (a pooled row
 * between its two figures within the range of the reduction across codes, never an anomaly); the coverage and the
 * dollars that cannot be priced without a contract, each figure in the mono face, and never owed, underpaid or
 * recovered (SCR-05, the screens' side). SYNTHETIC figures, written by hand from G01's codes as SYNTHETIC release
 * 900001 prices them before sequestration (97110 GP x2: $36.84 alone, $31.45 fully reduced; 97140 GP: $24.58 and
 * $18.20; 97161 GP: $59.17, one figure).
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
  releaseWithdrawn: false,
  rows: 6,
  claimLines: 140,
  observedCents: c(1_234_500n),
  priced: {
    rows: 3,
    claimLines: 80,
    expectedCents: c(600_000n),
    observedCents: c(512_000n),
    differenceCents: c(88_000n),
    pooledRows: 2,
    reducedCents: c(520_000n),
    reducedDifferenceCents: c(8_000n),
  },
  contractRequired: { rows: 2, claimLines: 50, observedCents: c(654_321n) },
  notScreened: { rows: 1, claimLines: 10, observedCents: c(68_179n) },
  couldNotPrice: { rows: 0, claimLines: 0, observedCents: c(0n) },
};

const GROUPS: ScreeningGroup[] = [
  {
    payerProduct: 'ma_noncontracted',
    procedureCode: '97161',
    rows: 2,
    claimLines: 60,
    expectedCents: c(450_000n),
    reducedCents: null,
    observedCents: c(360_000n),
    differenceCents: c(90_000n),
    reducedDifferenceCents: null,
    inReductionPool: false,
    anomalyRows: 2,
    anomaly: true,
    standing: 'anomaly',
  },
  {
    payerProduct: 'medicare_ffs',
    procedureCode: '97140',
    rows: 1,
    claimLines: 20,
    expectedCents: c(49_160n),
    reducedCents: c(36_400n),
    observedCents: c(26_000n),
    differenceCents: c(23_160n),
    reducedDifferenceCents: c(10_400n),
    inReductionPool: true,
    anomalyRows: 1,
    anomaly: true,
    standing: 'anomaly',
  },
  {
    // $34.00 a line, between $36.84 and $31.45: within the range of the reduction across codes, $2.84 a line below the figure before it.
    payerProduct: 'medicare_ffs',
    procedureCode: '97110',
    rows: 1,
    claimLines: 10,
    expectedCents: c(36_840n),
    reducedCents: c(31_450n),
    observedCents: c(34_000n),
    differenceCents: c(2_840n),
    reducedDifferenceCents: c(-2_550n),
    inReductionPool: true,
    anomalyRows: 0,
    anomaly: false,
    standing: 'within_reduction_range',
  },
  {
    payerProduct: 'medicare_ffs',
    procedureCode: '97035',
    rows: 1,
    claimLines: 10,
    expectedCents: c(10_000n),
    reducedCents: null,
    observedCents: c(9_800n),
    differenceCents: c(200n),
    reducedDifferenceCents: null,
    inReductionPool: false,
    anomalyRows: 0,
    anomaly: false,
    standing: 'below_by_threshold_or_less',
  },
  {
    payerProduct: 'medicare_ffs',
    procedureCode: '97530',
    rows: 1,
    claimLines: 20,
    expectedCents: c(54_000n),
    reducedCents: c(39_560n),
    observedCents: c(56_000n),
    differenceCents: c(-2_000n),
    reducedDifferenceCents: c(-16_440n),
    inReductionPool: true,
    anomalyRows: 0,
    anomaly: false,
    standing: 'at_or_above',
  },
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
    expectedLineCents: c(3_684n),
    expectedCents: c(147_360n),
    observedCents: c(136_000n),
    differenceCents: c(11_360n),
    inReductionPool: true,
    reducedLineCents: c(3_145n),
    reducedCents: c(125_800n),
    reducedDifferenceCents: c(-10_200n),
    standing: 'within_reduction_range',
  },
  {
    rowNo: 7,
    procedureCode: '97161',
    modifiers: ['GP'],
    units: 1,
    placeOfService: '11',
    payerProduct: 'medicare_ffs',
    serviceBand: '2026-Q1',
    claimCount: 3,
    expectedLineCents: c(5_917n),
    expectedCents: c(17_751n),
    observedCents: c(16_000n),
    differenceCents: c(1_751n),
    inReductionPool: false,
    reducedLineCents: null,
    reducedCents: null,
    reducedDifferenceCents: null,
    standing: 'anomaly',
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
    // Every figure built from the Medicare figure is labelled before the reduction across codes: the total and its difference.
    for (const slot of ['priced-expected', 'priced-difference']) {
      expect(html.match(new RegExp(`data-figure="${slot}"[^>]*><dt[^>]*>([^<]*)</dt>`))?.[1], slot).toContain(BEFORE_REDUCTION);
    }
    expect(html).toMatch(/data-figure="priced-difference"><dt[^>]*>Difference, before the reduction across codes</);
    // The note says what the figures are: two for a code in the reduction across codes, and every one before sequestration.
    expect(MEDICARE_FIGURE_NOTE).toMatch(/before Medicare’s sequestration, because the allowed amount in a payer’s remittance is normally reported before it/);
    expect(MEDICARE_FIGURE_NOTE).not.toMatch(/after Medicare’s sequestration/);
    expect(MEDICARE_FIGURE_NOTE).toContain('within the range of the reduction across codes, never an anomaly');
    expect(text(html)).toContain(MEDICARE_FIGURE_NOTE);
    expect(html).toContain('$12,345.00');
    expect(html).toMatch(/data-figure="priced-expected"[\s\S]*?\$6,000\.00/);
    expect(html).toMatch(/data-figure="priced-allowed"[\s\S]*?\$5,120\.00/);
    expect(html).toMatch(/data-figure="priced-difference"[\s\S]*?\$880\.00/);
    expect(html).toMatch(/data-section="contract-required"[\s\S]*?Cannot be priced without a contract[\s\S]*?\$6,543\.21/);
    expect(html).toMatch(/data-section="not-screened"[\s\S]*?\$681\.79/);
    expect(text(html)).toContain('A screening is investigatory');
  });

  it('says under each difference, in words, which figure the file’s allowed total is below, above or equal to', () => {
    const words = (markup: string, slot: string) => text(new RegExp(`data-figure="${slot}"[^>]*>([\\s\\S]*?)</dd>`).exec(markup)?.[1] ?? '').trim();
    expect(words(html, 'priced-difference')).toBe(`${DIFFERENCE_LABEL} $880.00 Allowed in your file is below the figure before the reduction across codes in total.`);
    expect(words(html, 'priced-reduced-difference')).toBe(`${REDUCED_DIFFERENCE_LABEL} $80.00 Allowed in your file is below the fully reduced figure in total.`);
    expect(text(html)).not.toContain('the Medicare figure in total');
    // SYNTHETIC: G01's codes, 97110 GP x2 and 97140 GP, 10 claims each, allowed between their two figures, where a
    // visit priced with the reduction puts them: $614.20 before the reduction across codes ($368.40 and $245.80),
    // $496.50 fully reduced ($314.50 and $182.00), $560.30 allowed. Below the first figure, above the second.
    const visit = renderToStaticMarkup(
      <ScreeningSummary
        summary={{
          ...SUMMARY,
          priced: {
            rows: 2,
            claimLines: 20,
            expectedCents: c(61_420n),
            observedCents: c(56_030n),
            differenceCents: c(5_390n),
            pooledRows: 2,
            reducedCents: c(49_650n),
            reducedDifferenceCents: c(-6_380n),
          },
        }}
      />,
    );
    expect(words(visit, 'priced-difference')).toBe(`${DIFFERENCE_LABEL} $53.90 Allowed in your file is below the figure before the reduction across codes in total.`);
    expect(words(visit, 'priced-reduced-difference')).toBe(`${REDUCED_DIFFERENCE_LABEL} -$63.80 Allowed in your file is above the fully reduced figure in total.`);
    const even = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, priced: { ...SUMMARY.priced, reducedCents: c(512_000n), reducedDifferenceCents: c(0n) } }} />);
    expect(words(even, 'priced-reduced-difference')).toContain('Allowed in your file is equal to the fully reduced figure in total.');
  });

  it('shows the total with the codes in the reduction across codes fully reduced beside it, labelled, when there are any', () => {
    expect(html).toMatch(new RegExp(`data-figure="priced-reduced"><dt[^>]*>${REDUCED_FIGURE_LABEL}</dt><dd[^>]*><span[^>]*>\\$5,200\\.00</span>`));
    expect(html).toMatch(new RegExp(`data-figure="priced-reduced-difference"><dt[^>]*>${REDUCED_DIFFERENCE_LABEL}</dt><dd[^>]*><span[^>]*>\\$80\\.00</span>`));
    expect(text(html)).toContain('2 rows of a code in the reduction across codes fully reduced; the others at their one figure.');
    const none = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, priced: { ...SUMMARY.priced, pooledRows: 0, reducedCents: c(600_000n), reducedDifferenceCents: c(88_000n) } }} />);
    expect(none).not.toContain('data-figures="fully-reduced"');
    expect(none).not.toContain(REDUCED_FIGURE_LABEL);
  });

  it('names the release, the engine and when the link stops opening it', () => {
    expect(text(html)).toContain('rule release 900001');
    expect(text(html)).toContain('engine/1');
    expect(text(html)).toContain('until 2026-11-17');
  });

  it('says so above the figures when the release they were priced under has since been withdrawn', () => {
    expect(renderToStaticMarkup(<ScreeningReleaseWithdrawn summary={SUMMARY} />)).toBe('');
    const withdrawn = renderToStaticMarkup(<ScreeningReleaseWithdrawn summary={{ ...SUMMARY, releaseWithdrawn: true }} />);
    expect(withdrawn).toContain('data-state="release-withdrawn"');
    expect(text(withdrawn)).toContain('The rule release behind these figures was withdrawn');
    expect(text(withdrawn)).toContain('Rule release 900001 was withdrawn after this screening was priced');
  });

  it('sets every figure in the mono face with tabular numerals', () => {
    for (const match of html.matchAll(/\$[\d,]+\.\d{2}/g)) {
      const before = html.slice(0, match.index);
      expect(before.slice(before.lastIndexOf('<span')), match[0]).toMatch(/^<span class="font-mono tabular-nums/);
    }
  });

  it('says where the file’s total sits in words, against the figure it names', () => {
    expect(BEFORE_REDUCTION_FIGURE).toBe('the figure before the reduction across codes');
    expect(differenceWords(c(1n), BEFORE_REDUCTION_FIGURE)).toBe('below the figure before the reduction across codes');
    expect(differenceWords(c(-1n), REDUCED_FIGURE)).toBe('above the fully reduced figure');
    expect(differenceWords(c(0n), ONE_FIGURE)).toBe('equal to the Medicare figure');
  });
});

describe('the anomalies by code and payer product', () => {
  const html = renderToStaticMarkup(<ScreeningAnomalies groups={GROUPS} />);

  it('lists each group with both figures, allowed and both differences in that order, and its status in words', () => {
    const headers = [...html.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(['Code', 'Payer product', 'Rows', 'Claim lines', MEDICARE_FIGURE_LABEL, REDUCED_FIGURE_LABEL, 'Allowed in your file', DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL, 'Status']);
    expect(html).toMatch(/data-group="97110:medicare_ffs"[\s\S]*?\$368\.40[\s\S]*?\$314\.50[\s\S]*?\$340\.00[\s\S]*?\$28\.40[\s\S]*?-\$25\.50/);
    expect(html).toMatch(/data-group="97530:medicare_ffs"[\s\S]*?-\$20\.00[\s\S]*?data-tone="neutral"[^>]*>Allowed is at or above both Medicare figures</);
    // A code outside the reduction across codes has one figure, and its chip names it.
    const outside = (differenceCents: Cents) =>
      renderToStaticMarkup(<ScreeningAnomalies groups={[{ ...(GROUPS[3] as ScreeningGroup), observedCents: c(10_000n - differenceCents), differenceCents, standing: 'at_or_above' }]} />);
    expect(outside(c(-100n))).toMatch(/data-group="97035:medicare_ffs"[\s\S]*?data-standing="at_or_above">Allowed is above the Medicare figure</);
    expect(outside(c(0n))).toMatch(/data-standing="at_or_above">Allowed is equal to the Medicare figure</);
    expect(text(html)).toContain('2 groups of 5 are anomalies.');
    expect(text(html)).toContain('Medicare Advantage, no contract');
  });

  it('calls a pooled code between its two figures within the range of the reduction across codes, never an anomaly', () => {
    // 97110 is $2.84 a line below its figure before the reduction and above its fully reduced figure.
    expect(html).toMatch(new RegExp(`data-group="97110:medicare_ffs"[\\s\\S]*?data-tone="neutral"[^>]*data-anomaly="false" data-standing="within_reduction_range">${WITHIN_REDUCTION_RANGE}<`));
    expect(html.match(/data-anomaly="true"/g)).toHaveLength(2);
    expect(anomaliesDescription(GROUPS)).toBe(
      `2 groups of 5 are anomalies. ${ANOMALY_RULE} 1 more group is within the range of the reduction across codes: between its two figures, which is not an anomaly. Largest difference from the lowest figure first.`,
    );
    expect(anomaliesDescription(GROUPS.filter((group) => !group.anomaly))).toBe(
      `No group of 3 is an anomaly. ${ANOMALY_RULE} 1 group is within the range of the reduction across codes: between its two figures, which is not an anomaly. Largest difference from the lowest figure first.`,
    );
    expect(anomaliesDescription([])).toBe('No row was priced under Medicare, so there is nothing to compare.');
  });

  it('calls a pooled code more than $5 a claim line below its fully reduced figure an anomaly, and says how many rows of a group are', () => {
    // 97140 is $5.20 a line below its fully reduced figure.
    expect(html).toMatch(/data-group="97140:medicare_ffs"[\s\S]*?\$364\.00[\s\S]*?\$104\.00[\s\S]*?data-tone="short"[^>]*data-anomaly="true" data-standing="anomaly">Anomaly: more than \$5 a claim line below the fully reduced figure</);
    expect(html).toMatch(/data-group="97161:ma_noncontracted"[\s\S]*?data-tone="short"[^>]*data-anomaly="true" data-standing="anomaly">Anomaly: 2 of 2 rows more than \$5 a claim line below their lowest figure</);
    expect(html).toMatch(/data-group="97035:medicare_ffs"[\s\S]*?data-standing="below_by_threshold_or_less">Below by \$5 a claim line or less</);
  });

  it('keeps one figure for a code outside the reduction across codes, and says so where the second would be', () => {
    const outside = /data-group="97161:ma_noncontracted"([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? '';
    expect(outside.match(/data-figure="one-figure"/g)).toHaveLength(2);
    expect(text(outside)).toContain('One figure: the code is outside the reduction across codes');
    const pooled = /data-group="97110:medicare_ffs"([\s\S]*?)<\/tr>/.exec(html)?.[1] ?? '';
    expect(pooled).not.toContain('data-figure="one-figure"');
  });

  it('puts every Medicare figure under a header that says which it is: before the reduction across codes, or fully reduced', () => {
    // Each money figure is found in its table row, and the header of its column named: the figures before the
    // reduction, the line's and the difference say so; the fully reduced ones say that; only the file's own allowed
    // amount says neither.
    const check = (markup: string, row: string, figures: Readonly<Record<string, 'before' | 'fully' | null>>) => {
      const headers = [...markup.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1] ?? '');
      const cellsOf = new RegExp(`<tr[^>]*${row}[^>]*>([\\s\\S]*?)</tr>`).exec(markup)?.[1] ?? '';
      const cells = [...cellsOf.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => text(match[1] ?? ''));
      for (const [figure, qualified] of Object.entries(figures)) {
        const column = cells.findIndex((cell) => cell.trim() === figure);
        expect(column, figure).toBeGreaterThan(-1);
        const header = headers[column] ?? '';
        expect(header.includes(BEFORE_REDUCTION) ? 'before' : header.includes(FULLY_REDUCED) ? 'fully' : null, `${figure} under "${header}"`).toBe(qualified);
      }
    };
    check(html, 'data-group="97110:medicare_ffs"', { '$368.40': 'before', '$314.50': 'fully', '$340.00': null, '$28.40': 'before', '-$25.50': 'fully' });
    check(renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />), 'data-row-no="4"', {
      '$36.84': 'before',
      '$1,473.60': 'before',
      '$31.45': 'fully',
      '$1,258.00': 'fully',
      '$1,360.00': null,
      '$113.60': 'before',
      '-$102.00': 'fully',
    });
  });

  it('gives every header but the last the padding its cells have', () => {
    const classes = [...html.matchAll(/<th class="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(classes.slice(0, -1).filter((names) => !/\bpr-3\b/.test(names))).toEqual([]);
    const rows = renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />);
    const rowClasses = [...rows.matchAll(/<th class="([^"]*)"/g)].map((match) => match[1] ?? '');
    expect(rowClasses.slice(0, -1).filter((names) => !/\bpr-3\b/.test(names))).toEqual([]);
  });

  it('lets a keyboard reach each table’s scrolling region, named by its card’s title', () => {
    expect(html).toContain('<div class="overflow-x-auto" role="region" aria-labelledby="screening-anomalies" tabindex="0" data-scroll="anomalies">');
    expect(renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />)).toContain('<div class="overflow-x-auto" role="region" aria-labelledby="screening-top-rows" tabindex="0" data-scroll="top-rows">');
  });

  it('is an empty state when nothing was priced', () => {
    const empty = renderToStaticMarkup(<ScreeningAnomalies groups={[]} />);
    expect(empty).not.toContain('<table');
    expect(empty).toContain('data-slot="empty-state"');
  });

  it('lists the top rows with their one-line figures and the row’s, both labelled, and each row’s standing', () => {
    const rows = renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />);
    for (const label of [MEDICARE_FIGURE_LABEL, MEDICARE_LINE_LABEL, REDUCED_FIGURE_LABEL, REDUCED_LINE_LABEL, DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL]) {
      expect(text(rows), label).toContain(label);
    }
    expect(rows).toMatch(/data-row-no="4"[\s\S]*?97110[\s\S]*?GP[\s\S]*?2026-Q1[\s\S]*?\$36\.84[\s\S]*?\$1,473\.60[\s\S]*?\$31\.45[\s\S]*?\$1,258\.00[\s\S]*?\$1,360\.00[\s\S]*?\$113\.60[\s\S]*?-\$102\.00/);
    expect(rows).toMatch(new RegExp(`data-row-no="4"[\\s\\S]*?data-standing="within_reduction_range">${WITHIN_REDUCTION_RANGE}<`));
    expect(rows).toMatch(/data-row-no="7"[\s\S]*?\$59\.17[\s\S]*?data-figure="one-figure"[\s\S]*?data-standing="anomaly">Anomaly: more than \$5 a claim line below the Medicare figure</);
    expect(text(rows)).toContain(ANOMALY_RULE);
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
