import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { type Cents, cents } from '@tp/money';
import { buttonVariants } from '@tp/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { ANOMALY_RULE, DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL, unpricedReasonLabel } from '../../lib/screening/labels';
import type { ScreeningResultData } from '../../lib/screening/routes';
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
  anomaliesDescription,
  anomalyItems,
  topRowItems,
} from './anomalies';
import { COVERAGE_COLUMNS, type ScreeningCoverageRow, ScreeningCoverage, coverageItems } from './coverage';
import { type ScreeningSummaryData, ScreeningSummary } from './result-summary';
import { ScreeningResultView } from './result-view';

/**
 * The screening result's three tables, each with its stacked rows for a phone (docs/adr/0078; test matrix TBL-05,
 * TBL-06 and TBL-08; UX-005, UX-042, UX-043, UX-132): one list of columns per table read in order for the table's
 * headers, each row's cells and the stacked fields; the table's hooks in the table copy alone; the status wrapping
 * above its floor in a cell; the words this change writes; and, since the stacked rows make a phone's page long, the
 * link under the heading to the audit request (UX-134). The switch between the copies in a real browser is
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

/** Page 1 of a result of 51 groups, the one shape with a single other group: groups 1 to 50 listed, the 51st summed. */
const FIRST_PAGE = FULL_PAGE.map((group, at): ScreeningGroup => ({ ...group, groupNo: 1 + at }));

/** The database's counts and sums for FIRST_PAGE, its one other group an anomaly (GROUPS[1]'s figures) or not (GROUPS[3]'s). */
function oneOther(anomalyGroups: 0 | 1): ScreeningGroupPage {
  const other = GROUPS[anomalyGroups === 1 ? 1 : 3] as ScreeningGroup;
  return {
    groups: 51,
    anomalyGroups: FIRST_PAGE.filter((group) => group.anomaly).length + anomalyGroups,
    withinReductionGroups: FIRST_PAGE.filter((group) => group.standing === 'within_reduction_range').length,
    perPage: 50,
    pages: 2,
    page: 1,
    firstGroup: 1,
    lastGroup: 50,
    others: {
      groups: 1,
      anomalyGroups,
      rows: other.rows,
      claimLines: other.claimLines,
      expectedCents: other.expectedCents,
      lowestCents: other.reducedCents ?? other.expectedCents,
      observedCents: other.observedCents,
      differenceCents: other.differenceCents,
      lowestDifferenceCents: other.reducedDifferenceCents ?? other.differenceCents,
    },
  };
}

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

/** A table's body and footer rows, in order: each row's attributes and its cells. */
function tableRows(table: string): { readonly attributes: string; readonly cells: string }[] {
  return [...table.matchAll(/<tr( [^>]*)>([\s\S]*?)<\/tr>/g)].map(([, attributes = '', cells = '']) => ({ attributes, cells })).filter((row) => row.cells.startsWith('<td'));
}

/** A row's cells by the header of the column each stands in; a cell that spans naming columns under the first of them. */
function cellsByHeader(table: string, cells: string): ReadonlyMap<string, string> {
  const heads = headers(table);
  const byHeader = new Map<string, string>();
  let column = 0;
  for (const [, attributes = '', cell = ''] of cells.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)) {
    byHeader.set(heads[column] ?? `column ${String(column)}`, cell);
    column += Number(/colspan="(\d+)"/i.exec(attributes)?.[1] ?? '1');
  }
  return byHeader;
}

/** A hook's value among a tag's attributes, or null. */
function hookOf(attributes: string, hook: string): string | null {
  return new RegExp(`\\s${hook}="([^"]*)"`).exec(` ${attributes}`)?.[1] ?? null;
}

/**
 * A chip's whole words and its standing hook: the table's data-standing, or the stacked copy's data-stacked-standing.
 * The words are all the chip holds, a figure's span included: a table chip ends its status cell's block, a stacked one
 * its dd.
 */
function chip(markup: string, hook: 'data-standing' | 'data-stacked-standing'): { readonly tone: string; readonly standing: string; readonly words: string } | null {
  const match = new RegExp(`data-tone="([^"]*)"[^>]*${hook}="([^"]*)">([\\s\\S]*?)</span></(?:div|dd)>`).exec(markup);
  return match === null ? null : { tone: match[1] ?? '', standing: match[2] ?? '', words: text(match[3] ?? '') };
}

/** Every status chip of some markup: its tone, its attributes and all it holds (a chip ends a table cell's block or a dd). */
function chips(markup: string): { readonly tone: string; readonly attributes: string; readonly inner: string }[] {
  return [...markup.matchAll(/<span data-slot="status-chip" data-tone="([^"]*)"([^>]*)>([\s\S]*?)<\/span><\/(?:div|dd)>/g)].map(([, tone = '', attributes = '', inner = '']) => ({ tone, attributes, inner }));
}

/** The labels of a table's fields: every column but its naming ones. */
function fieldLabels(columns: readonly { readonly label: string; readonly naming?: true }[]): string[] {
  return columns.filter((column) => column.naming !== true).map((column) => column.label);
}

/** The conversion's action, which these renders never call. */
const convert = (state: ActionState): Promise<ActionState> => Promise.resolve(state);

/** The whole result as its route gives it: page 2 of the worst shape's groups, the coverage and the top rows. */
const DATA: ScreeningResultData = {
  resultId: PATH.slice(PATH.lastIndexOf('/') + 1),
  requested: false,
  converted: false,
  summary: { ...SUMMARY, createdAt: new Date(SUMMARY.createdAt), expiresAt: new Date(SUMMARY.expiresAt) },
  groups: LATER_GROUPS,
  groupPage: LATER_PAGE,
  coverage: COVERAGE,
  rows: ROWS,
  arrangements: [{ value: 'in_house', label: 'In-house billing' }],
};

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
        // A coverage row with no reason has no Reason field: its heading's outcome says what happened (UXR-03).
        const reasonless = columns === COVERAGE_COLUMNS && !item.hooks.includes('data-stacked-reason=');
        const expected = fieldLabels(columns).filter((label) => !(reasonless && label === 'Reason'));
        expect(fields(item.body).map((field) => field.term), item.key).toEqual(expected);
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

  it('gives each stacked value as its table row’s cell under the same header has it, item by item in every card (TBL-05; P4-RC-06)', () => {
    const cards = [
      { name: 'anomalies', html: LATER, pairs: [['data-stacked-group', 'data-group']] },
      { name: 'one other group', html: anomalies(FIRST_PAGE, oneOther(1)), pairs: [['data-stacked-group', 'data-group']] },
      { name: 'top rows', html: TOP, pairs: [['data-stacked-row-no', 'data-row-no']] },
      {
        name: 'coverage',
        html: COVERED,
        pairs: [
          ['data-stacked-coverage', 'data-coverage'],
          ['data-stacked-reason', 'data-reason'],
        ],
      },
    ] as const;
    for (const { name, html, pairs } of cards) {
      const { table, rows } = copies(html);
      const listed = items(rows);
      const tabled = tableRows(table);
      // Both copies come from one row array: the same rows, in the same order, each item's hooks naming its table row's.
      expect(listed.length, name).toBe(tabled.length);
      for (const [index, item] of listed.entries()) {
        const row = tabled[index] ?? { attributes: '', cells: '' };
        for (const [stacked, tabledHook] of pairs) {
          expect(hookOf(item.hooks, stacked), `${name} ${item.key}: ${stacked}`).toBe(hookOf(row.attributes, tabledHook));
        }
        const cells = cellsByHeader(table, row.cells);
        const listedFields = fields(item.body);
        expect(listedFields.length, `${name} ${item.key}: its fields`).toBeGreaterThan(0);
        for (const field of listedFields) {
          expect(cells.has(field.term), `${name} ${item.key}: a column headed ${field.term}`).toBe(true);
          expect(text(field.value), `${name} ${item.key}: ${field.term}`).toBe(text(cells.get(field.term) ?? ''));
        }
      }
    }
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
      expect(inTable?.words, hook).not.toBe('');
      expect(inItem?.words, hook).toBe(inTable?.words);
    }
    for (const row of ROWS) {
      const inTable = chip(cellsOf(copies(TOP).table, `data-row-no="${String(row.rowNo)}"`).join(''), 'data-standing');
      const inItem = chip(top.find((item) => item.key === String(row.rowNo))?.body ?? '', 'data-stacked-standing');
      expect(inItem?.standing, String(row.rowNo)).toBe(row.standing);
      expect(inTable?.words, String(row.rowNo)).not.toBe('');
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
    // One group among the others is named as one, in both copies, on the one page that has it: page 1 of 51 groups (P4-RC-06).
    const one = (anomalyGroups: 0 | 1) => copies(anomalies(FIRST_PAGE, oneOther(anomalyGroups)));
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
      expect(items(oneRows).map((each) => each.key)).toHaveLength(51);
    }
  });

  it('says of one other group that the last entry is that group, summed, and that the next page lists it, and of more that the last entry sums them (TBL-08; P4-RC-01, UXR-08)', () => {
    const counts = '21 of 51 groups are anomalies.';
    const within = '10 more groups are within the range of the reduction across codes: between their two figures, which is not an anomaly.';
    expect(anomaliesDescription(oneOther(1))).toBe(
      `${counts} ${within} ${ANOMALY_RULE} Largest difference from the lowest figure first. This page lists groups 1 to 50; the last entry is the one other group, its rows summed, and the next page lists it.`,
    );
    expect(anomaliesDescription(oneOther(0))).toMatch(/^20 of 51 groups are anomalies\. [\s\S]* This page lists groups 1 to 50; the last entry is the one other group, its rows summed, and the next page lists it\.$/);
    // On the card, above the list whose last item is headed by the same name, and the table whose last row is.
    const card = anomalies(FIRST_PAGE, oneOther(1));
    expect(text(/<p data-slot="card-description"[^>]*>([\s\S]*?)<\/p>/.exec(card)?.[1] ?? '')).toContain('the last entry is the one other group, its rows summed, and the next page lists it.');
    expect(heading(items(copies(card).rows).at(-1)?.body ?? '')).toBe('The one other group, its rows summed');
    expect(text(cellsOf(copies(card).table, 'data-group="others"')[0] ?? '')).toBe(`The one other group, its rows summed ${OTHERS_NOTE}`);
    expect(text(card)).not.toMatch(/the other 1\b/);
    expect(text(card)).not.toContain('table’s last row');
    // Two or more other groups: the last entry sums them, in the table and in the list.
    expect(anomaliesDescription(LATER_PAGE)).toMatch(/This page lists groups 51 to 100; the last entry sums the other 20,457, and the pages below list them\.$/);
    expect(anomaliesDescription({ ...oneOther(1), groups: 52, others: { ...oneOther(1).others, groups: 2 } })).toMatch(/; the last entry sums the other 2, and the pages below list them\.$/);
    expect(text(LATER)).not.toContain('table’s last row');
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

  it('names each difference by its subtraction, in both copies and the summary (TBL-08; UX-042)', () => {
    const differences = ['Medicare figure less allowed, before the reduction across codes', 'Medicare figure less allowed, fully reduced across codes'];
    expect([DIFFERENCE_LABEL, REDUCED_DIFFERENCE_LABEL]).toEqual(differences);
    for (const html of [LATER, TOP]) {
      const { table, rows } = copies(html);
      expect(headers(table)).toEqual(expect.arrayContaining(differences));
      for (const item of items(rows)) {
        expect(fields(item.body).map((field) => field.term), item.key).toEqual(expect.arrayContaining(differences));
      }
    }
    const summary = renderToStaticMarkup(<ScreeningSummary summary={SUMMARY} />);
    expect(/data-figure="priced-difference"><dt[^>]*>([^<]*)<\/dt>/.exec(summary)?.[1]).toBe(differences[0]);
    expect(/data-figure="priced-reduced-difference"><dt[^>]*>([^<]*)<\/dt>/.exec(summary)?.[1]).toBe(differences[1]);
    expect(text(summary)).not.toMatch(/\bDifference, /);
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
    // Coverage gives every row's outcome, and a reason only for a row PaidWhole could not price (P4-RC-04, UXR-03).
    expect(couldNot).toBe('Medicare rows PaidWhole could not price, or whose rates change within the quarter. Coverage, below, gives each outcome, and the reason for a row PaidWhole could not price.');
  });

  it('groups the digits of every count, with its noun (the app’s one counted(), lib/copy/words.ts)', () => {
    const pages = /<nav[^>]*data-slot="group-pages"[^>]*>([\s\S]*?)<\/nav>/.exec(LATER)?.[1] ?? '';
    expect(text(pages)).toContain('Page 2 of 411 (20,507 groups)');
    const summary = text(renderToStaticMarkup(<ScreeningSummary summary={SUMMARY} />));
    expect(summary).toContain('Original Medicare and Medicare Advantage rows without a contract: 12,345 rows, 40,000 claim lines.');
    expect(summary).toContain('1,234 rows of a code in the reduction across codes fully reduced; the others at their one figure.');
  });

  it('says empty modifiers as None to a screen reader in both copies, and an empty reason as None in the table, where its item has no Reason (UXR-03)', () => {
    const none = '<span class="text-muted-foreground"><span aria-hidden="true">—</span><span class="sr-only">None</span></span>';
    const { table: topTable, rows: topRows } = copies(TOP);
    expect(cellsOf(topTable, 'data-row-no="1204"')[2]).toBe(none);
    expect(fields(items(topRows)[2]?.body ?? '').find((field) => field.term === 'Modifiers')?.value).toBe(none);
    const { table: coveredTable, rows: coveredRows } = copies(COVERED);
    expect(cellsOf(coveredTable, 'data-coverage="medicaid:not_screened"')[2]).toBe(none);
    expect(cellsOf(coveredTable, 'data-coverage="medicare_ffs:rates_change_in_band"')[2]).toBe(none);
    // Each item whose row has no reason: its outcome in the heading, then Rows; a reason only where there is one.
    for (const item of items(coveredRows)) {
      const terms = fields(item.body).map((field) => field.term);
      expect(terms.includes('Reason'), item.key).toBe(item.hooks.includes('data-stacked-reason='));
      expect(terms[0], item.key).toBe(item.hooks.includes('data-stacked-reason=') ? 'Reason' : 'Rows');
    }
    expect(text(coveredRows)).not.toMatch(/Reason —|Reason None/);
  });

  it('never says owed, underpaid or recovered in either copy', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { table, rows } = copies(html);
      expect(text(table)).not.toMatch(FORBIDDEN);
      expect(text(rows)).not.toMatch(FORBIDDEN);
    }
  });

  it('shows an anomaly in the unpriced tone in both copies and every other standing neutral, and no screening component uses the short or the whole tone (TBL-08; UX-040, UXR-07)', () => {
    for (const html of [LATER, TOP, COVERED]) {
      const { table, rows } = copies(html);
      for (const [copy, hook] of [
        [table, 'data-standing'],
        [rows, 'data-stacked-standing'],
      ] as const) {
        expect(copy).not.toMatch(/data-tone="(?:short|whole)"/);
        for (const match of copy.matchAll(new RegExp(`data-tone="([^"]*)"[^>]*${hook}="([^"]*)"`, 'g'))) {
          expect(match[1], `${hook} ${match[2] ?? ''}`).toBe(match[2] === 'anomaly' ? 'unpriced' : 'neutral');
        }
      }
    }
    // Each stacked chip in its table chip's tone, row by row, the others' included.
    for (const [html, pairs] of [
      [LATER, [...LATER_GROUPS.map((group) => [`data-group="${group.procedureCode}:${group.payerProduct}"`, `${group.procedureCode}:${group.payerProduct}`] as const), ['data-group="others"', 'others'] as const]],
      [TOP, ROWS.map((row) => [`data-row-no="${String(row.rowNo)}"`, String(row.rowNo)] as const)],
    ] as const) {
      const { table, rows } = copies(html);
      for (const [hook, key] of pairs) {
        const inTable = chips(cellsOf(table, hook).join(''));
        const inItem = chips(items(rows).find((item) => item.key === key)?.body ?? '');
        expect(inTable, key).toHaveLength(1);
        expect(inItem.map((each) => each.tone), key).toEqual(inTable.map((each) => each.tone));
      }
    }
    const later = copies(LATER);
    expect(text(items(later.rows).at(-1)?.body ?? '')).toContain('12,300 groups among them are anomalies');
    expect(items(later.rows).at(-1)?.body).toMatch(/data-tone="unpriced"[^>]*>12,300 groups among them are anomalies</);
    const quiet = copies(anomalies(LATER_GROUPS, { ...LATER_PAGE, others: { ...LATER_PAGE.others, anomalyGroups: 0 } }));
    expect(items(quiet.rows).at(-1)?.body).toMatch(/data-tone="neutral"[^>]*>No group among them is an anomaly</);
    expect(cellsOf(quiet.table, 'data-group="others"').at(-1)).toMatch(/data-tone="neutral"[^>]*>No group among them is an anomaly</);
    // The table copy: an anomaly unpriced, as the stacked rows have had it (P4-DR-03), and the others' chip with it.
    expect(later.table).toMatch(/data-tone="unpriced"[^>]*data-anomaly="true" data-standing="anomaly">/);
    expect(cellsOf(later.table, 'data-group="others"').at(-1)).toContain('data-tone="unpriced"');
    // The whole result, the withdrawn release's notice included: no chip and no class in the short or the whole tone.
    const page = renderToStaticMarkup(<ScreeningResultView data={{ ...DATA, summary: { ...DATA.summary, releaseWithdrawn: true } }} convert={convert} />);
    expect(page).toContain('data-state="release-withdrawn"');
    expect(page).not.toMatch(/data-tone="(?:short|whole)"/);
    expect(page).not.toMatch(/\b(?:bg|text|border)-status-(?:short|whole)\b/);
    // And no screening component names either tone: a column's figure role (expected, paid, short) is the brand's order, not a tone.
    const roots = [import.meta.dirname, path.resolve(import.meta.dirname, '../../app/screening')];
    const sources = roots.flatMap((root) =>
      readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name))
        .map((entry) => path.join(entry.parentPath, entry.name)),
    );
    expect(sources.map((file) => path.basename(file))).toEqual(expect.arrayContaining(['anomalies.tsx', 'coverage.tsx', 'result-summary.tsx', 'page.tsx']));
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/(?<!figure:\s*)['"](?:short|whole)['"]/);
    }
  });

  it('puts the count on its noun, both counts before the rule, for every row of the closed set (TBL-08; UX-206)', () => {
    const order = `${ANOMALY_RULE} Largest difference from the lowest figure first.`;
    const its = 'within the range of the reduction across codes: between its two figures, which is not an anomaly.';
    const their = 'within the range of the reduction across codes: between their two figures, which is not an anomaly.';
    // [groups, anomalies, within the range, what the card says]: design 3.4's closed set, and its digits grouped.
    const cases: readonly (readonly [number, number, number, string])[] = [
      [1, 1, 0, `The only group is an anomaly. ${order}`],
      [1, 0, 1, `The only group is ${its} ${order}`],
      [1, 0, 0, `The only group is not an anomaly. ${order}`],
      [2, 0, 0, `Neither group is an anomaly. ${order}`],
      [2, 0, 2, `Neither group is an anomaly. 2 groups are ${their} ${order}`],
      [2, 2, 0, `Both groups are anomalies. ${order}`],
      [2, 1, 0, `1 of 2 groups is an anomaly. ${order}`],
      [2, 1, 1, `1 of 2 groups is an anomaly. 1 more group is ${its} ${order}`],
      [3, 0, 0, `None of the 3 groups is an anomaly. ${order}`],
      [4, 0, 1, `None of the 4 groups is an anomaly. 1 group is ${its} ${order}`],
      [4, 1, 1, `1 of 4 groups is an anomaly. 1 more group is ${its} ${order}`],
      [5, 2, 1, `2 of 5 groups are anomalies. 1 more group is ${its} ${order}`],
      [5, 2, 2, `2 of 5 groups are anomalies. 2 more groups are ${their} ${order}`],
      [4, 4, 0, `All 4 groups are anomalies. ${order}`],
      [1_234, 0, 0, `None of the 1,234 groups is an anomaly. ${order}`],
      [1_234, 1_234, 0, `All 1,234 groups are anomalies. ${order}`],
    ];
    for (const [groups, anomalyGroups, withinReductionGroups, words] of cases) {
      const page: ScreeningGroupPage = { ...onePage(GROUPS), groups, anomalyGroups, withinReductionGroups, lastGroup: Math.min(groups, 50) };
      expect(anomaliesDescription(page), `${String(groups)} groups, ${String(anomalyGroups)} anomalies, ${String(withinReductionGroups)} within`).toBe(words);
    }
    // The worst shape's page 2, and on the card as the function says it.
    const later = `12,345 of 20,507 groups are anomalies. 1,204 more groups are ${their} ${order} This page lists groups 51 to 100; the last entry sums the other 20,457, and the pages below list them.`;
    expect(anomaliesDescription(LATER_PAGE)).toBe(later);
    expect(text(/<p data-slot="card-description"[^>]*>([\s\S]*?)<\/p>/.exec(LATER)?.[1] ?? '')).toBe(later);
    // Nothing priced: one sentence, nothing after it.
    expect(anomaliesDescription(onePage([]))).toBe('No row was priced under Medicare, so there is nothing to compare.');
    expect(text(LATER)).not.toMatch(/\bgroups? of [\d,]+ (?:is|are)\b/);
  });

  it('names the one figure a status is below, and says its for one anomalous row of a group and their for more, in both copies (TBL-08)', () => {
    /** A status's words in each copy, by its table row's hook and its item's key. */
    const both = (html: string, hook: string, key: string) => {
      const { table, rows } = copies(html);
      return [chip(cellsOf(table, hook).join(''), 'data-standing')?.words, chip(items(rows).find((item) => item.key === key)?.body ?? '', 'data-stacked-standing')?.words];
    };
    const below = 'Below the Medicare figure by $5 a claim line or less';
    // The 97035 group and row 1,204: one figure each, $0.20 and $0.67 a claim line below it.
    expect(both(LATER, 'data-group="97035:medicare_ffs"', '97035:medicare_ffs')).toEqual([below, below]);
    expect(both(TOP, 'data-row-no="1204"', '1204')).toEqual([below, below]);
    // Its pooled twin names its own figure, as it did: 97110 at $31.00 a claim line, $0.45 below its fully reduced $31.45.
    const pooled: ScreeningGroup = { ...(GROUPS[2] as ScreeningGroup), observedCents: c(31_000n), differenceCents: c(5_840n), reducedDifferenceCents: c(450n), standing: 'below_by_threshold_or_less' };
    const twin = 'Below the fully reduced figure by $5 a claim line or less';
    expect(both(anomalies([pooled], onePage([pooled])), 'data-group="97110:medicare_ffs"', '97110:medicare_ffs')).toEqual([twin, twin]);
    // A group of two rows: one of them an anomaly is its lowest figure's; both, their lowest figures'.
    const one: ScreeningGroup = { ...(GROUPS[0] as ScreeningGroup), anomalyRows: 1 };
    expect(both(anomalies([one], onePage([one])), 'data-group="97161:ma_noncontracted"', '97161:ma_noncontracted')).toEqual([
      'Anomaly: 1 of 2 rows more than $5 a claim line below its lowest figure',
      'Anomaly: 1 of 2 rows more than $5 a claim line below its lowest figure',
    ]);
    const two = GROUPS[0] as ScreeningGroup;
    expect(both(anomalies([two], onePage([two])), 'data-group="97161:ma_noncontracted"', '97161:ma_noncontracted')).toEqual([
      'Anomaly: 2 of 2 rows more than $5 a claim line below their lowest figure',
      'Anomaly: 2 of 2 rows more than $5 a claim line below their lowest figure',
    ]);
  });

  it('sets the $5 of every status and of the anomaly rule in the mono face with tabular numerals, each chip’s words one run (#121 P1)', () => {
    // Every money figure on the result, the $5 of a status or of the rule included, directly inside a mono span.
    const page = renderToStaticMarkup(<ScreeningResultView data={DATA} convert={convert} />);
    for (const html of [LATER, TOP, page]) {
      for (const match of html.matchAll(/\$\d/g)) {
        const before = html.slice(0, match.index);
        expect(before.slice(before.lastIndexOf('<')), html.slice(match.index, match.index + 16)).toMatch(/^<span class="font-mono tabular-nums[^"]*">-?$/);
      }
    }
    // Each chip that holds a figure holds one span, its words in one run with their spaces, the figure's span inside it:
    // a status chip is an inline flex box, so loose words beside the figure would lose the spaces around it.
    const anomaly = 'Anomaly: more than $5 a claim line below';
    for (const [html, words] of [
      [LATER, ['Anomaly: 2 of 2 rows more than $5 a claim line below their lowest figure', `${anomaly} the fully reduced figure`, 'Below the Medicare figure by $5 a claim line or less']],
      [TOP, [`${anomaly} the Medicare figure`, 'Below the Medicare figure by $5 a claim line or less']],
    ] as const) {
      const all = chips(html);
      expect(all).toHaveLength(html.split('data-slot="status-chip"').length - 1);
      const figured = all.filter((each) => each.inner.includes('$'));
      expect(figured.map((each) => text(each.inner))).toEqual([...words, ...words]);
      for (const { inner } of figured) {
        expect(inner.replace(/<span class="font-mono tabular-nums">(\$\d[\d,]*(?:\.\d{2})?)<\/span>/g, '$1')).toBe(`<span>${text(inner)}</span>`);
        expect(inner).toContain(' <span class="font-mono tabular-nums">$5</span> ');
      }
    }
    // The rule's $5 in each card's description, in the same face.
    const description = (html: string) => /<p data-slot="card-description"[^>]*>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '';
    for (const html of [LATER, TOP]) {
      expect(description(html)).toContain('more than <span class="font-mono tabular-nums">$5</span> a claim line below its lowest Medicare figure');
      expect(text(description(html))).toContain(ANOMALY_RULE);
    }
  });
});

describe('the result’s one action, at its top (UX-134)', () => {
  const view = (state: Partial<Pick<ScreeningResultData, 'requested' | 'converted'>> = {}) => renderToStaticMarkup(<ScreeningResultView data={{ ...DATA, ...state }} convert={convert} />);

  it('links from directly under the heading to the audit request’s title, in the title’s words and the primary button’s style; the kept paragraph stays where it was', () => {
    const html = view();
    const link = /<a class="([^"]*)" href="#screening-convert" data-link="convert">([^<]*)<\/a>/.exec(html);
    expect(link?.[2]).toBe('Ask for a PaidWhole audit');
    expect(link?.[1]).toBe(buttonVariants({ className: 'self-start' }));
    expect(html.match(/data-link="convert"/g)).toHaveLength(1);
    // The title it lands on: the same words, the one element of its id, focusable out of the tab order so the link moves the focus there.
    expect(html.match(/id="screening-convert"/g)).toHaveLength(1);
    expect(html).toMatch(/<h2 [^>]*id="screening-convert" tabindex="-1">Ask for a PaidWhole audit<\/h2>/);
    // The heading's block, the kept paragraph last in it, then the link, then everything else.
    const kept = html.indexOf('data-legal-surface="screening-kept-result"');
    expect(kept).toBeGreaterThan(html.indexOf('<h1'));
    expect(html.slice(html.indexOf('</p>', kept))).toMatch(/^<\/p><\/div><a [^>]*data-link="convert"/);
    expect(html.indexOf('data-slot="card"')).toBeGreaterThan(html.indexOf('data-link="convert"'));
    expect(html.indexOf('data-legal-surface="screening-kept-convert"')).toBeGreaterThan(html.indexOf('id="screening-convert"'));
  });

  it('puts the withdrawn release’s notice before the link, so the warning that the figures may be wrong comes first, and the link still before every card', () => {
    const html = renderToStaticMarkup(<ScreeningResultView data={{ ...DATA, summary: { ...DATA.summary, releaseWithdrawn: true } }} convert={convert} />);
    const notice = html.indexOf('data-state="release-withdrawn"');
    expect(notice).toBeGreaterThan(html.indexOf('data-legal-surface="screening-kept-result"'));
    expect(html.indexOf('data-link="convert"')).toBeGreaterThan(notice);
    expect(html.indexOf('data-slot="card"')).toBeGreaterThan(html.indexOf('data-link="convert"'));
  });

  it('shows no link once an audit is requested, since the form it goes to is gone', () => {
    for (const state of [{ requested: true, converted: true }, { converted: true }]) {
      const html = view(state);
      expect(html).not.toContain('data-link="convert"');
      expect(html).not.toContain('#screening-convert');
      expect(html).not.toContain('id="screening-convert"');
    }
  });
});
