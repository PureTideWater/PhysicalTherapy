import { type Cents, cents } from '@tp/money';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ANOMALY_RULE, unpricedReasonLabel } from '../../lib/screening/labels';
import { type StackedRow, brandOrderProblems, repeatedIds } from '../stacked-rows';
import {
  ANOMALY_COLUMNS,
  type ScreeningGroup,
  type ScreeningGroupPage,
  type ScreeningOtherGroups,
  type ScreeningRow,
  ScreeningAnomalies,
  ScreeningTopRows,
  TOP_ROW_COLUMNS,
  anomalyItems,
  topRowItems,
} from './anomalies';
import { COVERAGE_COLUMNS, type ScreeningCoverageRow, ScreeningCoverage, coverageItems } from './coverage';
import { type ScreeningSummaryData, ScreeningSummary, groupedCount } from './result-summary';

/**
 * The screening result's three tables, each with its stacked rows for a phone (docs/adr/0078; test matrix TBL-05,
 * TBL-06 and TBL-08; UX-005, UX-042, UX-043, UX-132): one list of columns per table read in order for the table's
 * headers, each row's cells and the stacked fields; the table's hooks in the table copy alone; the status wrapping
 * above its floor in a cell; and the words this change writes. The switch between the copies in a real browser is
 * e2e/screening-phone.spec.ts's. result.test.tsx (#42's) pins the table copy's markup and words as they were.
 * SYNTHETIC figures, written by hand from G01's codes as SYNTHETIC release 900001 prices them before sequestration
 * (97110 GP: $36.84 alone, $31.45 fully reduced; 97140 GP: $24.58 and $18.20; 97161 GP: $59.17, one figure).
 */

const c = (value: bigint): Cents => cents(value);

const GROUPS: ScreeningGroup[] = [
  {
    // Two rows, $10.84 a claim line below its one figure: both anomalies.
    groupNo: 1,
    payerProduct: 'ma_noncontracted',
    procedureCode: '97161',
    rows: 2,
    claimLines: 60,
    expectedCents: c(355_020n),
    reducedCents: null,
    observedCents: c(290_000n),
    differenceCents: c(65_020n),
    reducedDifferenceCents: null,
    inReductionPool: false,
    anomalyRows: 2,
    anomaly: true,
    standing: 'anomaly',
  },
  {
    // $5.20 a claim line below its fully reduced figure.
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
    // $34.00 a claim line, between $36.84 and $31.45.
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
  {
    // $0.20 a claim line below its one figure.
    groupNo: 5,
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
];

const PATH = '/screening/results/abcdefghijklmnopqrstuvwxyzabcdef';

const NO_OTHERS: ScreeningOtherGroups = { groups: 0, anomalyGroups: 0, rows: 0, claimLines: 0, expectedCents: c(0n), lowestCents: c(0n), observedCents: c(0n), differenceCents: c(0n), lowestDifferenceCents: c(0n) };

/** The database's counts for groups that all fit on one page. */
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
    others: NO_OTHERS,
  };
}

/** Page 2 of the worst shape's 20,507 groups: groups 51 to 100 listed, the other 20,457 summed by the database. */
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

/** The five groups numbered as page 2 lists them. */
const LATER_GROUPS = GROUPS.map((group, at) => ({ ...group, groupNo: 51 + at }));

/** A full page of 50 groups, each its own SYNTHETIC code, with the others summed: the shape the large test counts. */
const FULL_PAGE = Array.from({ length: 50 }, (_, at): ScreeningGroup => ({ ...(GROUPS[at % GROUPS.length] as ScreeningGroup), groupNo: 51 + at, procedureCode: String(97_100 + at) }));

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
    // $9.17 a claim line below its one figure.
    rowNo: 7,
    procedureCode: '97161',
    modifiers: ['GP'],
    units: 1,
    placeOfService: '11',
    payerProduct: 'medicare_ffs',
    serviceBand: '2026-Q1',
    claimCount: 12,
    expectedLineCents: c(5_917n),
    expectedCents: c(71_004n),
    observedCents: c(60_000n),
    differenceCents: c(11_004n),
    inReductionPool: false,
    reducedLineCents: null,
    reducedCents: null,
    reducedDifferenceCents: null,
    standing: 'anomaly',
  },
  {
    // No modifiers; $0.67 a claim line below its one figure.
    rowNo: 1_204,
    procedureCode: '97035',
    modifiers: [],
    units: 1,
    placeOfService: '22',
    payerProduct: 'medicare_ffs',
    serviceBand: '2026-Q2',
    claimCount: 15,
    expectedLineCents: c(1_000n),
    expectedCents: c(15_000n),
    observedCents: c(14_000n),
    differenceCents: c(1_000n),
    inReductionPool: false,
    reducedLineCents: null,
    reducedCents: null,
    reducedDifferenceCents: null,
    standing: 'below_by_threshold_or_less',
  },
];

const COVERAGE: ScreeningCoverageRow[] = [
  { payerProduct: 'medicare_ffs', disposition: 'priced', unpricedReason: null, unpricedDetail: null, rows: 4, claimLines: 60, observedCents: c(250_000n) },
  { payerProduct: 'medicare_ffs', disposition: 'unpriced', unpricedReason: 'ENGINE_ERROR', unpricedDetail: 'place_of_service_unmapped', rows: 1, claimLines: 12, observedCents: c(4_800n) },
  // A second reason under the same product and outcome: the item's Reason tells the two apart (P4-DR-08).
  { payerProduct: 'medicare_ffs', disposition: 'unpriced', unpricedReason: 'ENGINE_ERROR', unpricedDetail: 'no_rvu_in_basis_year', rows: 1, claimLines: 11, observedCents: c(3_300n) },
  { payerProduct: 'medicare_ffs', disposition: 'rates_change_in_band', unpricedReason: null, unpricedDetail: null, rows: 1, claimLines: 14, observedCents: c(5_000n) },
  { payerProduct: 'ma_contracted', disposition: 'contract_required', unpricedReason: null, unpricedDetail: null, rows: 1, claimLines: 20, observedCents: c(120_000n) },
  { payerProduct: 'commercial', disposition: 'contract_required', unpricedReason: null, unpricedDetail: null, rows: 2, claimLines: 50, observedCents: c(654_321n) },
  { payerProduct: 'medicaid', disposition: 'not_screened', unpricedReason: null, unpricedDetail: null, rows: 1, claimLines: 10, observedCents: c(68_179n) },
];

/** A result of 12,345 priced rows, so every count on the summary has digits to group. */
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
  rows: 12_400,
  claimLines: 41_000,
  observedCents: c(98_765_400n),
  priced: {
    rows: 12_345,
    claimLines: 40_000,
    expectedCents: c(120_000_000n),
    observedCents: c(98_000_000n),
    differenceCents: c(22_000_000n),
    pooledRows: 1_234,
    reducedCents: c(101_000_000n),
    reducedDifferenceCents: c(3_000_000n),
  },
  contractRequired: { rows: 30, claimLines: 600, observedCents: c(400_000n) },
  notScreened: { rows: 20, claimLines: 300, observedCents: c(300_000n) },
  couldNotPrice: { rows: 5, claimLines: 100, observedCents: c(65_400n) },
  leftOut: { rows: 0, claimLines: 0, observedCents: c(0n) },
  outsideContent: { rows: 0, claimLines: 0, observedCents: c(0n) },
  outsideContentBefore: null,
};

const FORBIDDEN = /\b(?:owed|under-?paid|recovered)\b/i;

/** The sentence above each table of differences (UX-042). */
const SIGN = 'Each difference is its Medicare figure less the allowed amount in your file: positive where the allowed amount is below that figure, negative where it is above it.';

/** The other groups' note, in the table's naming cell and under the stacked item's heading. */
const OTHERS_NOTE = 'The fully reduced figures take each row at its lowest: fully reduced for a code in the reduction across codes, its one figure otherwise.';

/** The status chip's floor in a table cell: a block of 10rem inside which the chip wraps (ADR 0078 Decision 1). */
const FLOOR = '<div class="min-w-40 [&amp;_[data-slot=status-chip]]:whitespace-normal"><span data-slot="status-chip"';

/** The text as a reader hears it: tags dropped, entities read. */
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A card's two copies: everything before its stacked list (the table's), and the list. */
function copies(html: string): { readonly table: string; readonly rows: string } {
  const start = html.indexOf('<ul role="list" data-stacked-copy="rows"');
  expect(start, 'the stacked list').toBeGreaterThan(-1);
  const end = html.indexOf('</ul>', start) + '</ul>'.length;
  return { table: html.slice(0, start), rows: html.slice(start, end) };
}

interface Item {
  readonly key: string;
  /** The item's own hooks, spread before data-stacked-row. */
  readonly hooks: string;
  readonly body: string;
}

function items(rows: string): Item[] {
  return [...rows.matchAll(/<li ([^>]*)data-stacked-row="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map(([, hooks = '', key = '', body = '']) => ({ key, hooks, body }));
}

interface Field {
  readonly term: string;
  /** The dd's attributes. */
  readonly attributes: string;
  readonly value: string;
}

function fields(body: string): Field[] {
  return [...body.matchAll(/<dt[^>]*>([^<]*)<\/dt><dd([^>]*)>([\s\S]*?)<\/dd>/g)].map(([, term = '', attributes = '', value = '']) => ({ term, attributes, value }));
}

function heading(body: string): string {
  return /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(body)?.[1] ?? '';
}

function headers(table: string): string[] {
  return [...table.matchAll(/<th class="[^"]*">([^<]*)<\/th>/g)].map((match) => match[1] ?? '');
}

/** A table row's cells, in order, by the row's hook. */
function cellsOf(table: string, hook: string): string[] {
  const row = new RegExp(`<tr[^>]*${hook}[^>]*>([\\s\\S]*?)</tr>`).exec(table)?.[1] ?? '';
  return [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => match[1] ?? '');
}

/** A chip's words and its standing hook: the table's data-standing, or the stacked copy's data-stacked-standing. */
function chip(markup: string, hook: 'data-standing' | 'data-stacked-standing'): { readonly tone: string; readonly standing: string; readonly words: string } | null {
  const match = new RegExp(`data-tone="([^"]*)"[^>]*${hook}="([^"]*)">([^<]*)<`).exec(markup);
  return match === null ? null : { tone: match[1] ?? '', standing: match[2] ?? '', words: match[3] ?? '' };
}

/** The labels of a table's fields: every column but its naming ones. */
function fieldLabels(columns: readonly { readonly label: string; readonly naming?: true }[]): string[] {
  return columns.filter((column) => column.naming !== true).map((column) => column.label);
}

const anomalies = (groups: readonly ScreeningGroup[], page: ScreeningGroupPage) => renderToStaticMarkup(<ScreeningAnomalies groups={groups} page={page} path={PATH} />);
const LATER = anomalies(LATER_GROUPS, LATER_PAGE);
const TOP = renderToStaticMarkup(<ScreeningTopRows rows={ROWS} />);
const COVERED = renderToStaticMarkup(<ScreeningCoverage coverage={COVERAGE} />);

describe('the screening result’s tables and their stacked rows (docs/adr/0078)', () => {
  it('lists every column under the table’s own header and in its order, in the table and in each item (TBL-05, TBL-06; DR-08)', () => {
    const cards = [
      { html: LATER, columns: ANOMALY_COLUMNS, count: LATER_GROUPS.length + 1 },
      { html: TOP, columns: TOP_ROW_COLUMNS, count: ROWS.length },
      { html: COVERED, columns: COVERAGE_COLUMNS, count: COVERAGE.length },
    ];
    for (const { html, columns, count } of cards) {
      const { table, rows } = copies(html);
      expect(headers(table)).toEqual(columns.map((column) => column.label));
      const listed = items(rows);
      expect(listed).toHaveLength(count);
      for (const item of listed) {
        expect(fields(item.body).map((field) => field.term), item.key).toEqual(fieldLabels(columns));
      }
    }
    // The table's own words, which the stacked terms repeat: today's headers, but Claim lines for the top rows' count (UX-043).
    expect(ANOMALY_COLUMNS.slice(0, 4).map((column) => column.label)).toEqual(['Code', 'Payer product', 'Rows', 'Claim lines']);
    expect(TOP_ROW_COLUMNS.slice(0, 8).map((column) => column.label)).toEqual(['Row', 'Code', 'Modifiers', 'Units', 'Place of service', 'Payer product', 'Quarter', 'Claim lines']);
    expect(COVERAGE_COLUMNS.map((column) => column.label)).toEqual(['Payer product', 'Outcome', 'Reason', 'Rows', 'Claim lines', 'Allowed in your file']);
    // The others' row spans the two naming columns and fills the other eight.
    expect(cellsOf(copies(LATER).table, 'data-group="others"')).toHaveLength(1 + fieldLabels(ANOMALY_COLUMNS).length);
  });

  it('gives the Medicare figures, the allowed amount and the differences together and in the brand’s order (TBL-05)', () => {
    const cases: readonly { readonly rows: readonly StackedRow[]; readonly roles: readonly string[] }[] = [
      { rows: anomalyItems(LATER_GROUPS, LATER_PAGE), roles: ['expected', 'expected', 'paid', 'short', 'short'] },
      { rows: topRowItems(ROWS), roles: ['expected', 'expected', 'expected', 'expected', 'paid', 'short', 'short'] },
      { rows: coverageItems(COVERAGE), roles: ['paid'] },
    ];
    for (const { rows, roles } of cases) {
      for (const row of rows) {
        expect(brandOrderProblems(row.fields), row.key).toEqual([]);
        expect(row.fields.flatMap((field) => (field.figure === undefined ? [] : [field.figure])), row.key).toEqual(roles);
      }
    }
    expect(anomalyItems(LATER_GROUPS, LATER_PAGE).at(-1)?.key).toBe('others');
  });

  it('repeats no id or hook between the two copies (TBL-05)', () => {
    expect(repeatedIds(LATER)).toEqual([]);
    expect(repeatedIds(TOP)).toEqual([]);
    expect(repeatedIds(COVERED)).toEqual([]);
  });

  it('keeps the table’s hooks in the table copy alone, and the counts the large page test reads (TBL-05)', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { rows } = copies(html);
      expect(rows).not.toMatch(/\sdata-(?:group|group-no|coverage|reason|row-no|standing|anomaly|figure)=/);
    }
    // The table copy keeps every hook its tests and specs read.
    expect(copies(LATER).table.match(/data-figure="one-figure"/g)).toHaveLength(4);
    expect(copies(TOP).table.match(/data-figure="one-figure"/g)).toHaveLength(6);
    expect(copies(COVERED).table.match(/<tr [^>]*data-coverage=/g)).toHaveLength(COVERAGE.length);
    // Each item carries its own.
    expect(items(copies(LATER).rows).map((item) => item.hooks.trim())).toEqual([...LATER_GROUPS.map((group) => `data-stacked-group="${group.procedureCode}:${group.payerProduct}"`), 'data-stacked-group="others"']);
    expect(items(copies(TOP).rows).map((item) => item.hooks.trim())).toEqual(['data-stacked-row-no="4"', 'data-stacked-row-no="7"', 'data-stacked-row-no="1204"']);
    expect(items(copies(COVERED).rows).map((item) => item.hooks.trim())).toEqual([
      'data-stacked-coverage="medicare_ffs:priced"',
      'data-stacked-coverage="medicare_ffs:unpriced" data-stacked-reason="ENGINE_ERROR"',
      'data-stacked-coverage="medicare_ffs:unpriced" data-stacked-reason="ENGINE_ERROR"',
      'data-stacked-coverage="medicare_ffs:rates_change_in_band"',
      'data-stacked-coverage="ma_contracted:contract_required"',
      'data-stacked-coverage="commercial:contract_required"',
      'data-stacked-coverage="medicaid:not_screened"',
    ]);
    // render-result.tsx and result-page.large.db.test.ts count the page's groups by these two.
    const full = anomalies(FULL_PAGE, LATER_PAGE);
    expect(full.match(/data-group-no="/g)).toHaveLength(50);
    expect(full.match(/data-group="others"/g)).toHaveLength(1);
  });

  it('switches each card at its own table’s width, the table’s region as it was (TBL-06)', () => {
    const cases = [
      { html: LATER, width: '54rem', label: 'Anomalies by code and payer product', id: 'screening-anomalies' },
      { html: TOP, width: '54rem', label: 'Rows with the largest differences', id: 'screening-top-rows' },
      { html: COVERED, width: '40rem', label: 'Coverage, and the rows missing a contract', id: 'screening-coverage' },
    ];
    for (const { html, width, label, id } of cases) {
      expect(html).toMatch(
        new RegExp(
          `<div data-slot="stacked-rows" class="@container w-full min-w-0"><div data-stacked-copy="table" class="hidden @min-\\[${width}\\]:block"><div data-slot="scroll-table"[^>]*><div class="pw-scroll-frame"><div role="region" aria-label="${label}, scrolls sideways" tabindex="0" data-scroller="" class="[^"]*"><table class="w-full min-w-\\[${width}\\] text-left text-sm" aria-labelledby="${id}">`,
        ),
      );
      expect(html).toContain(`<ul role="list" data-stacked-copy="rows" aria-labelledby="${id}" class="flex flex-col gap-3 @min-[${width}]:hidden">`);
    }
  });

  it('names each list by its card’s title and heads each item one level below it; no list when there are no rows (TBL-06)', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { rows } = copies(html);
      expect(rows.match(/<li /g)?.length).toBe(rows.match(/<h3 class=/g)?.length);
      expect(rows).not.toMatch(/<h[24]/);
    }
    const empty = anomalies([], onePage([]));
    expect(empty).toContain('data-slot="empty-state"');
    expect(empty).not.toContain('data-stacked-copy');
    const none = renderToStaticMarkup(<ScreeningTopRows rows={[]} />);
    expect(none).not.toContain('data-slot="card-content"');
    expect(none).not.toContain('data-stacked-copy');
  });

  it('sets every figure, count and code of an item in the mono face, says a missing figure in words, and gives each item its row’s status (TBL-05; P4-DR-04, P4-DR-07)', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { rows } = copies(html);
      for (const match of rows.matchAll(/\$[\d,]+\.\d{2}/g)) {
        const before = rows.slice(0, match.index);
        expect(before.slice(before.lastIndexOf('<span')), match[0]).toMatch(/^<span class="font-mono tabular-nums/);
      }
      for (const item of items(rows)) {
        for (const field of fields(item.body).filter((each) => ['Rows', 'Claim lines', 'Units'].includes(each.term))) {
          expect(field.attributes, `${item.key} ${field.term}`).toMatch(/class="[^"]*font-mono tabular-nums/);
          expect(field.value, `${item.key} ${field.term}`).toMatch(/^<span class="font-mono tabular-nums">[\d,]+<\/span>$/);
        }
      }
    }
    // The headings: a code and a row number in the mono face at 500, the only weights its face loads; a product and an outcome in words.
    const groups = items(copies(LATER).rows);
    expect(heading(groups[0]?.body ?? '')).toBe('<span class="font-mono font-medium tabular-nums">97161</span>, Medicare Advantage, no contract');
    expect(heading(groups[2]?.body ?? '')).toBe('<span class="font-mono font-medium tabular-nums">97110</span>, Original Medicare');
    const top = items(copies(TOP).rows);
    expect(heading(top[0]?.body ?? '')).toBe('Row <span class="font-mono font-medium tabular-nums">4</span>: <span class="font-mono font-medium tabular-nums">97110</span>, Medicare Advantage, no contract');
    expect(heading(top[2]?.body ?? '')).toBe('Row <span class="font-mono font-medium tabular-nums">1,204</span>: <span class="font-mono font-medium tabular-nums">97035</span>, Original Medicare');
    const covered = items(copies(COVERED).rows);
    expect(heading(covered[1]?.body ?? '')).toMatch(/^Original Medicare: <span data-slot="status-chip" data-tone="unpriced" class="[^"]*">Could not be priced<\/span>$/);
    expect(heading(covered[1]?.body ?? '')).toContain('whitespace-normal');
    expect(heading(covered[1]?.body ?? '')).not.toContain('whitespace-nowrap');
    // A code outside the reduction across codes says so where its second figure would be, in both copies.
    const outside = groups[0]?.body ?? '';
    expect(text(outside).match(/One figure: the code is outside the reduction across codes/g)).toHaveLength(2);
    // Each item's status says what its table row's says, of the same standing.
    for (const group of LATER_GROUPS) {
      const hook = `${group.procedureCode}:${group.payerProduct}`;
      const inTable = chip(cellsOf(copies(LATER).table, `data-group="${hook}"`).join(''), 'data-standing');
      const inItem = chip(groups.find((item) => item.key === hook)?.body ?? '', 'data-stacked-standing');
      expect(inItem?.standing, hook).toBe(inTable?.standing);
      expect(inItem?.words, hook).toBe(inTable?.words);
    }
    for (const row of ROWS) {
      const inTable = chip(cellsOf(copies(TOP).table, `data-row-no="${String(row.rowNo)}"`).join(''), 'data-standing');
      const inItem = chip(top.find((item) => item.key === String(row.rowNo))?.body ?? '', 'data-stacked-standing');
      expect(inItem?.standing, String(row.rowNo)).toBe(row.standing);
      expect(inItem?.words, String(row.rowNo)).toBe(inTable?.words);
    }
  });

  it('heads each coverage item by its product and outcome, its reason the first field, every item its own key (TBL-05; P4-DR-08)', () => {
    const covered = items(copies(COVERED).rows);
    expect(new Set(covered.map((item) => item.key)).size).toBe(COVERAGE.length);
    const reasons = covered.filter((item) => text(heading(item.body)) === 'Original Medicare: Could not be priced').map((item) => text(fields(item.body)[0]?.value ?? ''));
    expect(reasons).toEqual([unpricedReasonLabel('ENGINE_ERROR', 'place_of_service_unmapped'), unpricedReasonLabel('ENGINE_ERROR', 'no_rvu_in_basis_year')]);
  });

  it('lists the other groups, summed, last, their note under the heading and their sums as the table’s last row has them (TBL-05; P4-DR-05, P4-DR-06)', () => {
    const { table, rows } = copies(LATER);
    const others = items(rows).at(-1);
    expect(others?.key).toBe('others');
    expect(heading(others?.body ?? '')).toBe('The other 20,457 groups, summed');
    expect(others?.body).toContain(`</h3><p class="mt-1 text-sm text-muted-foreground">${OTHERS_NOTE}</p><dl`);
    const cells = cellsOf(table, 'data-group="others"').map(text);
    expect(cells[0]).toBe(`The other 20,457 groups, summed ${OTHERS_NOTE}`);
    const values = fields(others?.body ?? '').map((field) => text(field.value));
    expect(values.slice(0, 7)).toEqual(cells.slice(1, 8));
    expect(values[7]).toBe(cells[8]);
    expect(values[7]).toBe('12,300 groups among them are anomalies');
    // One group among the others is named as one, in both copies.
    const one = (anomalyGroups: number) => copies(anomalies(LATER_GROUPS, { ...LATER_PAGE, groups: 56, anomalyGroups: 2 + anomalyGroups, pages: 2, others: { ...LATER_PAGE.others, groups: 1, anomalyGroups } }));
    for (const [anomalyGroups, words] of [
      [1, 'It is an anomaly'],
      [0, 'It is not an anomaly'],
    ] as const) {
      const { table: oneTable, rows: oneRows } = one(anomalyGroups);
      const item = items(oneRows).at(-1)?.body ?? '';
      expect(heading(item)).toBe('The one other group, its rows summed');
      expect(text(cellsOf(oneTable, 'data-group="others"')[0] ?? '')).toBe(`The one other group, its rows summed ${OTHERS_NOTE}`);
      expect(text(fields(item).at(-1)?.value ?? '')).toBe(words);
      expect(text(cellsOf(oneTable, 'data-group="others"').at(-1) ?? '')).toBe(words);
    }
  });

  it('lets a status wrap in its cell above a 10rem floor, and leaves the coverage’s outcome chips as they were (TBL-06; P4-DR-07)', () => {
    const later = copies(LATER).table;
    expect(later.split(FLOOR)).toHaveLength(LATER_GROUPS.length + 1 + 1);
    expect(later.match(/<td class="py-1">/g)).toHaveLength(LATER_GROUPS.length + 1);
    expect(later).not.toMatch(/<td class="py-1">(?!<div class="min-w-40 )/);
    const top = copies(TOP).table;
    expect(top.split(FLOOR)).toHaveLength(ROWS.length + 1);
    expect(top).not.toMatch(/<td class="py-1">(?!<div class="min-w-40 )/);
    const covered = copies(COVERED).table;
    expect(covered).not.toContain('min-w-40');
    expect(covered.match(/<td class="py-1 pr-3"><span data-slot="status-chip"/g)).toHaveLength(COVERAGE.length);
    for (const html of [LATER, TOP, COVERED]) {
      expect(html).not.toMatch(/<t[dh][^>]*wrap-anywhere/);
    }
  });
});

describe('the screening result’s words (TBL-08)', () => {
  it('heads the top rows’ count Claim lines', () => {
    const { table, rows } = copies(TOP);
    expect(headers(table)).toContain('Claim lines');
    expect(headers(table)).not.toContain('Claims');
    expect(text(rows)).not.toMatch(/\bClaims\b/);
  });

  it('says once above each table of differences what a difference subtracts and which way its sign runs, and nowhere else', () => {
    const key = `<p class="text-sm text-muted-foreground" data-copy="difference-sign">${SIGN}</p>`;
    for (const html of [LATER, anomalies(GROUPS, onePage(GROUPS)), TOP]) {
      expect(html.split(key)).toHaveLength(2);
      expect(html.indexOf(key)).toBeLessThan(html.indexOf('data-slot="stacked-rows"'));
    }
    for (const html of [COVERED, anomalies([], onePage([])), renderToStaticMarkup(<ScreeningTopRows rows={[]} />)]) {
      expect(html).not.toContain('data-copy="difference-sign"');
    }
    // True to every difference on the page: the 97110 group, $368.40 less $340.00, and $314.50 less $340.00.
    expect(text(copies(LATER).table)).toMatch(/\$368\.40 \$314\.50 \$340\.00 \$28\.40 -\$25\.50/);
  });

  it('says what PaidWhole prices for the top rows, for one row and for several', () => {
    const description = (html: string) => text(/<p data-slot="card-description"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '');
    const priced = `PaidWhole prices one claim line under the Medicare fee schedule, before sequestration, and rounds that price once; the row’s figure is that price times its claim lines. A code in the reduction across codes has a second figure, fully reduced across codes; a code outside it has one. ${ANOMALY_RULE}`;
    expect(description(renderToStaticMarkup(<ScreeningTopRows rows={ROWS.slice(0, 1)} />))).toBe(`The one priced row, by its number in your file. ${priced}`);
    expect(description(TOP)).toBe(`The 3 priced rows with the largest differences from their lowest figure, the largest first, each by its number in your file. ${priced}`);
    expect(description(renderToStaticMarkup(<ScreeningTopRows rows={[]} />))).toBe('No row was priced under Medicare.');
  });

  it('shows an unpriced reason in words alone, its code kept in the row’s hooks, and never says the engine', () => {
    const { table, rows } = copies(COVERED);
    expect(text(table)).not.toContain('ENGINE_ERROR');
    expect(text(rows)).not.toContain('ENGINE_ERROR');
    expect(table).toContain('<tr class="border-t align-top" data-coverage="medicare_ffs:unpriced" data-reason="ENGINE_ERROR">');
    expect(rows).toContain('data-stacked-coverage="medicare_ffs:unpriced" data-stacked-reason="ENGINE_ERROR"');
    for (const copy of [table, rows]) {
      expect(text(copy)).toContain(unpricedReasonLabel('ENGINE_ERROR', 'place_of_service_unmapped'));
      expect(text(copy)).toContain(unpricedReasonLabel('ENGINE_ERROR', 'no_rvu_in_basis_year'));
    }
    // Every card but the heading, whose version label is UX PR 85's.
    const page = renderToStaticMarkup(
      <>
        <ScreeningSummary summary={SUMMARY} />
        <ScreeningAnomalies groups={LATER_GROUPS} page={LATER_PAGE} path={PATH} />
        <ScreeningTopRows rows={ROWS} />
        <ScreeningCoverage coverage={COVERAGE} />
      </>,
    );
    expect(text(page)).not.toMatch(/\bengine\b/i);
    const couldNot = /data-section="could-not-price"[\s\S]*?<p data-slot="card-description"[^>]*>([^<]*)<\/p>/.exec(page)?.[1];
    expect(couldNot).toBe('Medicare rows PaidWhole could not price, or whose rates change within the quarter. Coverage, below, gives each reason.');
  });

  it('groups the digits of every count, with its noun', () => {
    expect(groupedCount(12_345, 'row')).toBe('12,345 rows');
    expect(groupedCount(1, 'claim line')).toBe('1 claim line');
    expect(groupedCount(2, 'more group', 'more groups')).toBe('2 more groups');
    const summary = text(renderToStaticMarkup(<ScreeningSummary summary={SUMMARY} />));
    expect(summary).toContain('Original Medicare and Medicare Advantage rows without a contract: 12,345 rows, 40,000 claim lines.');
    expect(summary).toContain('1,234 rows of a code in the reduction across codes fully reduced; the others at their one figure.');
  });

  it('says an empty reason and empty modifiers as None to a screen reader, in both copies', () => {
    const none = '<span class="text-muted-foreground"><span aria-hidden="true">—</span><span class="sr-only">None</span></span>';
    const { table: topTable, rows: topRows } = copies(TOP);
    expect(cellsOf(topTable, 'data-row-no="1204"')[2]).toBe(none);
    expect(fields(items(topRows)[2]?.body ?? '').find((field) => field.term === 'Modifiers')?.value).toBe(none);
    const { table: coveredTable, rows: coveredRows } = copies(COVERED);
    expect(cellsOf(coveredTable, 'data-coverage="medicaid:not_screened"')[2]).toBe(none);
    expect(fields(items(coveredRows).at(-1)?.body ?? '').find((field) => field.term === 'Reason')?.value).toBe(none);
  });

  it('never says owed, underpaid or recovered in either copy', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { table, rows } = copies(html);
      expect(text(table)).not.toMatch(FORBIDDEN);
      expect(text(rows)).not.toMatch(FORBIDDEN);
    }
  });

  it('shows an anomaly in the unpriced tone on a phone and never Short or Whole there; the table’s tones as they were until UX PR 4b (P4-DR-03)', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { rows } = copies(html);
      expect(rows).not.toMatch(/data-tone="(?:short|whole)"/);
      for (const match of rows.matchAll(/data-tone="([^"]*)"[^>]*data-stacked-standing="([^"]*)"/g)) {
        expect(match[1], match[2]).toBe(match[2] === 'anomaly' ? 'unpriced' : 'neutral');
      }
    }
    const later = copies(LATER);
    expect(text(items(later.rows).at(-1)?.body ?? '')).toContain('12,300 groups among them are anomalies');
    expect(items(later.rows).at(-1)?.body).toMatch(/data-tone="unpriced"[^>]*>12,300 groups among them are anomalies</);
    const quiet = copies(anomalies(LATER_GROUPS, { ...LATER_PAGE, others: { ...LATER_PAGE.others, anomalyGroups: 0 } }));
    expect(items(quiet.rows).at(-1)?.body).toMatch(/data-tone="neutral"[^>]*>No group among them is an anomaly</);
    // The table copy: an anomaly short and the rest neutral, as #42's result.test.tsx pins it, and never Whole.
    expect(later.table).toMatch(/data-tone="short"[^>]*data-anomaly="true" data-standing="anomaly">/);
    expect(cellsOf(later.table, 'data-group="others"').at(-1)).toContain('data-tone="short"');
    for (const html of [LATER, TOP, COVERED]) {
      expect(html).not.toContain('data-tone="whole"');
    }
  });
});
