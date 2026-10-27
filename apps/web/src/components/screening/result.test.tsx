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
  leftOutNote,
} from '../../lib/screening/labels';
import { type ScreeningGroup, type ScreeningGroupPage, type ScreeningRow, ScreeningAnomalies, ScreeningTopRows, anomaliesDescription } from './anomalies';
import { type ScreeningCoverageRow, ScreeningCoverage } from './coverage';
import { KEPT_COUNTS, KEPT_SUMMARY } from '../../lib/screening/retention';
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
  zipPlusFour: null,
  releaseNo: 900001,
  engineVersion: 'engine/1',
  createdAt: '2026-10-18T12:00:00.000Z',
  expiresAt: '2026-11-17T12:00:00.000Z',
  releaseWithdrawn: false,
  keptWith: 'none',
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
  // Two rows of fewer than 11 claim lines the browser left out before sending (SCR-07): in no other figure.
  leftOut: { rows: 2, claimLines: 13, observedCents: c(54_321n) },
  // Twelve Medicare rows in quarters before the release's loaded content, left out by the browser (SCR-16, Q6 (a)).
  outsideContent: { rows: 12, claimLines: 380, observedCents: c(4_120_000n) },
  outsideContentBefore: '2026-Q1',
};

const GROUPS: ScreeningGroup[] = [
  {
    groupNo: 1,
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
    groupNo: 2,
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
    groupNo: 3,
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
    groupNo: 4,
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
    groupNo: 5,
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

const PATH = '/screening/results/abcdefghijklmnopqrstuvwxyzabcdef';

/** The database's counts for groups that all fit on one page (screening_result_group_totals(), page 1 of 1). */
function onePage(groups: readonly ScreeningGroup[]): ScreeningGroupPage {
  return {
    groups: groups.length,
    anomalyGroups: groups.filter((group) => group.anomaly).length,
    withinReductionGroups: groups.filter((group) => group.standing === 'within_reduction_range').length,
    perPage: 50,
    pages: 1,
    page: 1,
    firstGroup: groups.length === 0 ? 0 : 1,
    lastGroup: groups.length,
    others: { groups: 0, anomalyGroups: 0, rows: 0, claimLines: 0, expectedCents: c(0n), lowestCents: c(0n), observedCents: c(0n), differenceCents: c(0n), lowestDifferenceCents: c(0n) },
  };
}

/** One page of 50 of the worst shape's 20,507 groups, page 2: groups 51 to 100, the other 20,457 summed by the database. */
const LATER_PAGE: ScreeningGroupPage = {
  groups: 20_507,
  anomalyGroups: 12_345,
  withinReductionGroups: 1_204,
  perPage: 50,
  pages: 411,
  page: 2,
  firstGroup: 51,
  lastGroup: 100,
  others: {
    groups: 20_457,
    anomalyGroups: 12_300,
    rows: 49_870,
    claimLines: 1_745_450,
    expectedCents: c(9_876_543_210n),
    lowestCents: c(8_765_432_100n),
    observedCents: c(7_654_321_000n),
    differenceCents: c(2_222_222_210n),
    lowestDifferenceCents: c(1_111_111_100n),
  },
};

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

  it('says how many rows, claim lines and dollars the browser left out before sending, apart from every figure, and nothing when none (SCR-07)', () => {
    expect(html).toMatch(/data-section="left-out"[\s\S]*?Left out before sending/);
    // Worded for the rows the card counts, and the risk the floor answers, never a promise that no row describes one patient.
    expect(leftOutNote(2)).toBe(
      'Rows of fewer than 11 claim lines were left out by your browser before anything was sent, because a row that small can describe one patient’s care. No figure on this page includes these rows; this is what your browser counted of them.',
    );
    expect(leftOutNote(1)).toBe(
      'A row of fewer than 11 claim lines was left out by your browser before anything was sent, because a row that small can describe one patient’s care. No figure on this page includes it; this is what your browser counted of it.',
    );
    expect(text(html)).toContain(leftOutNote(2));
    const single = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, leftOut: { rows: 1, claimLines: 1, observedCents: c(4_517n) } }} />);
    expect(text(single)).toContain(leftOutNote(1));
    const stat = (slot: string) => text(new RegExp(`data-figure="${slot}"[^>]*>([\\s\\S]*?)</dd>`).exec(html)?.[1] ?? '').trim();
    expect(stat('left-out-rows')).toBe('Rows 2');
    expect(stat('left-out-claim-lines')).toBe('Claim lines 13');
    expect(stat('left-out-allowed')).toBe('Allowed in your file $543.21');
    // The file's own totals are the rows sent.
    expect(stat('file-claim-lines')).toBe('Claim lines 140');
    const none = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, leftOut: { rows: 0, claimLines: 0, observedCents: c(0n) } }} />);
    expect(none).not.toContain('data-section="left-out"');
    expect(none).not.toContain('Left out before sending');
  });

  it('says how many Medicare rows were not screened for a quarter outside the loaded content, apart from every figure, and nothing when none (SCR-16)', () => {
    expect(html).toMatch(/data-section="outside-content"[\s\S]*?Not screened: quarters outside the loaded content/);
    // The sentence as read: the figure's own span closes up to its parentheses.
    const read = (markup: string) => text(markup).replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
    expect(read(html)).toContain('12 rows ($41,200.00) in quarters before 2026-Q1 were not screened: PaidWhole has not loaded the Medicare content for them.');
    // The allowed total in the sentence is in the mono face, as every figure.
    expect(html).toMatch(/data-copy="outside-content"[^>]*>12 rows \(<span class="font-mono tabular-nums">\$41,200\.00<\/span>\)/);
    const stat = (slot: string) => text(new RegExp(`data-figure="${slot}"[^>]*>([\\s\\S]*?)</dd>`).exec(html)?.[1] ?? '').trim();
    expect(stat('outside-content-claim-lines')).toBe('Claim lines 380');
    const between = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, outsideContent: { rows: 1, claimLines: 12, observedCents: c(50_000n) }, outsideContentBefore: null }} />);
    expect(read(between)).toContain('1 row ($500.00) in a quarter outside the loaded content was not screened: PaidWhole has not loaded the Medicare content for it.');
    const none = renderToStaticMarkup(<ScreeningSummary summary={{ ...SUMMARY, outsideContent: { rows: 0, claimLines: 0, observedCents: c(0n) } }} />);
    expect(none).not.toContain('data-section="outside-content"');
  });

  it('names the release, the engine and when the link stops opening it', () => {
    expect(text(html)).toContain('rule release 900001');
    expect(text(html)).toContain('engine/1');
    expect(text(html)).toContain('until 2026-11-17');
    expect(text(html)).toContain('or until a later screening for the same practice or from the same email address replaces it');
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
  const html = renderToStaticMarkup(<ScreeningAnomalies groups={GROUPS} page={onePage(GROUPS)} path={PATH} />);

  it('lists each group with both figures, allowed and both differences in that order, and its status in words', () => {
    const headers = [...html.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1]);
    expect(headers).toEqual(['Code', 'Payer product', 'Rows', 'Claim lines', MEDICARE_FIGURE_LABEL, REDUCED_FIGURE_LABEL, 'Allowed in your file', DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL, 'Status']);
    expect(html).toMatch(/data-group="97110:medicare_ffs"[\s\S]*?\$368\.40[\s\S]*?\$314\.50[\s\S]*?\$340\.00[\s\S]*?\$28\.40[\s\S]*?-\$25\.50/);
    expect(html).toMatch(/data-group="97530:medicare_ffs"[\s\S]*?-\$20\.00[\s\S]*?data-tone="neutral"[^>]*>Allowed is at or above both Medicare figures</);
    // A code outside the reduction across codes has one figure, and its chip names it.
    const outside = (differenceCents: Cents) => {
      const group: ScreeningGroup = { ...(GROUPS[3] as ScreeningGroup), observedCents: c(10_000n - differenceCents), differenceCents, standing: 'at_or_above' };
      return renderToStaticMarkup(<ScreeningAnomalies groups={[group]} page={onePage([group])} path={PATH} />);
    };
    expect(outside(c(-100n))).toMatch(/data-group="97035:medicare_ffs"[\s\S]*?data-standing="at_or_above">Allowed is above the Medicare figure</);
    expect(outside(c(0n))).toMatch(/data-standing="at_or_above">Allowed is equal to the Medicare figure</);
    expect(text(html)).toContain('2 groups of 5 are anomalies.');
    expect(text(html)).toContain('Medicare Advantage, no contract');
  });

  it('calls a pooled code between its two figures within the range of the reduction across codes, never an anomaly', () => {
    // 97110 is $2.84 a line below its figure before the reduction and above its fully reduced figure.
    expect(html).toMatch(new RegExp(`data-group="97110:medicare_ffs"[\\s\\S]*?data-tone="neutral"[^>]*data-anomaly="false" data-standing="within_reduction_range">${WITHIN_REDUCTION_RANGE}<`));
    expect(html.match(/data-anomaly="true"/g)).toHaveLength(2);
    expect(anomaliesDescription(onePage(GROUPS))).toBe(
      `2 groups of 5 are anomalies. ${ANOMALY_RULE} 1 more group is within the range of the reduction across codes: between its two figures, which is not an anomaly. Largest difference from the lowest figure first.`,
    );
    expect(anomaliesDescription(onePage(GROUPS.filter((group) => !group.anomaly)))).toBe(
      `No group of 3 is an anomaly. ${ANOMALY_RULE} 1 group is within the range of the reduction across codes: between its two figures, which is not an anomaly. Largest difference from the lowest figure first.`,
    );
    expect(anomaliesDescription(onePage([]))).toBe('No row was priced under Medicare, so there is nothing to compare.');
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

  it('lets a keyboard reach each table’s scrolling region, named by its card’s title, the table its direct child (docs/adr/0078)', () => {
    expect(html).toMatch(
      /<div role="region" aria-label="Anomalies by code and payer product, scrolls sideways" tabindex="0" data-scroller="" class="[^"]*"><table class="w-full min-w-\[54rem\] text-left text-sm" aria-labelledby="screening-anomalies">/,
    );
    expect(renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />)).toMatch(
      /<div role="region" aria-label="Rows with the largest differences, scrolls sideways" tabindex="0" data-scroller="" class="[^"]*"><table class="w-full min-w-\[54rem\] text-left text-sm" aria-labelledby="screening-top-rows">/,
    );
  });

  it('is an empty state when nothing was priced', () => {
    const empty = renderToStaticMarkup(<ScreeningAnomalies groups={[]} page={onePage([])} path={PATH} />);
    expect(empty).not.toContain('<table');
    expect(empty).toContain('data-slot="empty-state"');
    expect(empty).not.toContain('data-slot="group-pages"');
  });

  it('shows one page of groups with the database’s counts over all of them, sums the others in the last row, and links the other pages (audit #53 part 1)', () => {
    const page = GROUPS.map((group, at) => ({ ...group, groupNo: 51 + at }));
    const later = renderToStaticMarkup(<ScreeningAnomalies groups={page} page={LATER_PAGE} path={PATH} />);
    // Every group of the page, numbered as the database numbers it, and no other.
    expect([...later.matchAll(/data-group-no="(\d+)"/g)].map((match) => match[1])).toEqual(['51', '52', '53', '54', '55']);
    // The counts are the database's over all 20,507 groups, never the page's five.
    expect(anomaliesDescription(LATER_PAGE)).toBe(
      `12,345 groups of 20,507 are anomalies. ${ANOMALY_RULE} 1,204 more groups are within the range of the reduction across codes: between their two figures, which is not an anomaly. Largest difference from the lowest figure first. This page lists groups 51 to 100; the table’s last row sums the other 20,457, and the pages below list them.`,
    );
    expect(text(later)).toContain('12,345 groups of 20,507 are anomalies.');
    // The other groups: the database's sums, in the table's columns, and how many of them are anomalies.
    const others = /<tr[^>]*data-group="others"[^>]*>([\s\S]*?)<\/tr>/.exec(later)?.[1] ?? '';
    expect(text(others)).toContain('The other 20,457 groups, summed');
    const cells = [...others.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => text(match[1] ?? '').trim());
    expect(cells.slice(1, 8)).toEqual(['49,870', '1,745,450', '$98,765,432.10', '$87,654,321.00', '$76,543,210.00', '$22,222,222.10', '$11,111,111.00']);
    expect(cells[8]).toBe('12,300 groups among them are anomalies');
    expect(others).toContain('data-tone="short"');
    // The pages: first, previous, next and last, back at this card; the page and the count in words.
    const pages = /<nav[^>]*data-slot="group-pages"[^>]*>([\s\S]*?)<\/nav>/.exec(later)?.[0] ?? '';
    expect([...pages.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map((match) => [match[2], match[1]])).toEqual([
      ['First', `${PATH}?groups=1#screening-anomalies`],
      ['Previous', `${PATH}?groups=1#screening-anomalies`],
      ['Next', `${PATH}?groups=3#screening-anomalies`],
      ['Last', `${PATH}?groups=411#screening-anomalies`],
    ]);
    expect(text(pages)).toContain('Page 2 of 411 (20,507 groups)');
    // The last page links back only; one page has no links and no last row.
    const last = renderToStaticMarkup(<ScreeningAnomalies groups={page} page={{ ...LATER_PAGE, page: 411, firstGroup: 20_501, lastGroup: 20_507 }} path={PATH} />);
    expect([...last.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((match) => match[1])).toEqual(['First', 'Previous']);
    expect(html).not.toContain('data-slot="group-pages"');
    expect(html).not.toContain('data-group="others"');
    const quiet = renderToStaticMarkup(<ScreeningAnomalies groups={page} page={{ ...LATER_PAGE, others: { ...LATER_PAGE.others, anomalyGroups: 0 } }} path={PATH} />);
    expect(/<tr[^>]*data-group="others"[^>]*>([\s\S]*?)<\/tr>/.exec(quiet)?.[1]).toMatch(/data-tone="neutral"[^>]*>No group among them is an anomaly</);
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

  it('lets a keyboard reach its table’s scrolling region, named by the card’s title, the table its direct child (docs/adr/0078)', () => {
    expect(html).toMatch(
      /<div role="region" aria-label="Coverage, and the rows missing a contract, scrolls sideways" tabindex="0" data-scroller="" class="[^"]*"><table class="w-full min-w-\[40rem\] text-left text-sm" aria-labelledby="screening-coverage">/,
    );
  });
});

describe('the screening’s heading', () => {
  /** The location the heading names, in its mono span before "Screened". */
  const location = (summary: ScreeningSummaryData) => /, ZZ <span class="font-mono tabular-nums">([^<]*)<\/span>\. Screened/.exec(renderToStaticMarkup(<ScreeningHeading summary={summary} />))?.[1];

  it('names the ZIP+4 that chose the locality, and the five digits alone when none was kept (review of PR 6b-2, finding 21)', () => {
    expect(location({ ...SUMMARY, zip: '00012', zipPlusFour: '5001' })).toBe('00012-5001');
    expect(location(SUMMARY)).toBe('00011');
  });
});

describe('a screening’s words (SCR-05, the screens)', () => {
  it('never say owed, underpaid or recovered, nor the tagline', () => {
    const html = renderToStaticMarkup(
      <>
        <ScreeningHeading summary={SUMMARY} />
        <ScreeningSummary summary={SUMMARY} />
        <ScreeningAnomalies groups={GROUPS} page={LATER_PAGE} path={PATH} />
        <ScreeningTopRows rows={ROWS} />
        <ScreeningCoverage coverage={COVERAGE} />
      </>,
    );
    expect(text(html)).not.toMatch(FORBIDDEN);
    expect(text(html)).not.toContain(tagline);
    expect(text(html)).not.toContain(tagline.split('.')[0] ?? tagline);
  });
});

describe('what the result says is kept (audit #57; decisions 7, 17 and 18)', () => {
  const kept = (summary: ScreeningSummaryData, converted = false) => {
    const html = renderToStaticMarkup(<ScreeningHeading summary={summary} converted={converted} />);
    return /data-legal-surface="screening-kept-result"[^>]*>([^<]*)</.exec(html)?.[1]?.replaceAll('&#x27;', '’').replaceAll('&amp;', '&') ?? '';
  };

  it('says nothing but the record of counts is kept unless an audit is requested, and lists both records in full', () => {
    const text = kept(SUMMARY);
    expect(text).toContain('Then we delete the result: its rows and figures, and the practice name, ZIP code and email address you gave.');
    expect(text).toContain(`If you request an audit from it, we keep ${KEPT_SUMMARY} with your request for 12 months from the screening.`);
    expect(text).toContain(KEPT_COUNTS);
  });

  it('tells a prospect whose screening took over an earlier request that their details are kept with it, never that they are deleted', () => {
    const text = kept({ ...SUMMARY, keptWith: 'earlier_request' });
    expect(text).toContain('An audit was requested for this practice from an earlier screening with the same practice name and ZIP code');
    expect(text).toContain(`we keep ${KEPT_SUMMARY} with that request, in place of the earlier screening’s, for 12 months from this screening`);
    expect(text).not.toContain('and the practice name, ZIP code and email address you gave');
    expect(kept({ ...SUMMARY, keptWith: 'earlier_request' }, true)).toContain('your own request is kept beside it');
  });

  it('says a converted screening’s summary is kept with its request, and that its record of counts can be matched to it', () => {
    const text = kept({ ...SUMMARY, keptWith: 'own_request' }, true);
    expect(text).toContain(`Because you requested an audit, we keep ${KEPT_SUMMARY} with your request for 12 months from the screening.`);
    expect(text).toContain('while we keep your request, yours can be matched to it');
  });
});
