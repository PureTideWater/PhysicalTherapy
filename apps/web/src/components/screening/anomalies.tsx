import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { counted } from '../../lib/copy/words';
import {
  ANOMALY_RULE,
  DIFFERENCE_LABEL,
  MEDICARE_FIGURE_LABEL,
  MEDICARE_LINE_LABEL,
  ONE_FIGURE,
  REDUCED_DIFFERENCE_LABEL,
  REDUCED_FIGURE,
  REDUCED_FIGURE_LABEL,
  REDUCED_LINE_LABEL,
  type ScreeningStanding,
  WITHIN_REDUCTION_RANGE,
  productLabel,
} from '../../lib/screening/labels';
import { ScrollTable } from '../scroll-table';
import { type StackedRow, StackedRows } from '../stacked-rows';
import { StatusChip } from '../status';
import { ALLOWED_IN_FILE, CLAIM_LINES, None, ScreeningCount, ScreeningMoney, differenceWords } from './result-summary';
import { ColumnCells, ColumnHeads, type Copy, type ScreeningColumn, fieldColumns, fieldsFrom } from './table-parts';

/**
 * A screening's anomalies by code and payer product, and its top rows (Change Order 001, CO-04; the owner's rulings
 * of 2026-10-18). Each group is the Medicare-priced rows of one code under one payer product, summed by the database.
 * A code in the reduction across a visit's codes has two figures, both the engine's: priced alone ("before the
 * reduction across codes") and priced as a later code of a visit ("fully reduced across codes"); a code outside it
 * has one. A row is an anomaly only when its allowed total is more than $5 a claim line (ADR 0038's threshold)
 * below its lowest figure; a pooled row between its two figures is within the range of the reduction across codes,
 * never an anomaly; a group is an anomaly when one of its rows is. Every standing is the database's
 * (screening_standing()), never this screen's. Every figure is before sequestration. Status shows as a labelled chip,
 * never color alone.
 *
 * Each table pairs with stacked rows for a phone (docs/adr/0078): one list of columns per table, read in order for its
 * headers, each row's cells and the stacked fields, in which the Medicare figures, the allowed amount and the
 * differences stand together and in that order, each in the mono face; a row's cells come from one function that takes
 * the copy, so the table's carry its test hooks and the stacked rows' their own.
 *
 * The groups come one page at a time (audit #53 part 1: a worst-shape result has 20,507, and all of them at once
 * exhausted the web task's heap): the page's groups in the database's order, the database's counts over every group
 * in the card's description, the database's sums of the groups the page does not show in the table's last row and the
 * list's last item, and links to the other pages. Nothing here counts, adds or orders a group.
 */

export interface ScreeningGroup {
  /** Its place in the database's order, from 1. */
  readonly groupNo: number;
  readonly payerProduct: string;
  readonly procedureCode: string;
  readonly rows: number;
  readonly claimLines: number;
  readonly expectedCents: Cents;
  /** With a row in the reduction across codes: the rows' lowest figures summed; null otherwise. */
  readonly reducedCents: Cents | null;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  readonly reducedDifferenceCents: Cents | null;
  readonly inReductionPool: boolean;
  /** How many of its rows are anomalies. */
  readonly anomalyRows: number;
  /** At least one row is an anomaly (the database's flag). */
  readonly anomaly: boolean;
  readonly standing: ScreeningStanding;
}

/** The groups a page does not show, summed by the database (screening_result_group_totals()). */
export interface ScreeningOtherGroups {
  readonly groups: number;
  readonly anomalyGroups: number;
  readonly rows: number;
  readonly claimLines: number;
  readonly expectedCents: Cents;
  /** The lowest figures: a pooled row's fully reduced figure, any other row's one figure. */
  readonly lowestCents: Cents;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  readonly lowestDifferenceCents: Cents;
}

/** Every group of the result as the database counts them, and the page of them shown. */
export interface ScreeningGroupPage {
  readonly groups: number;
  readonly anomalyGroups: number;
  readonly withinReductionGroups: number;
  readonly perPage: number;
  readonly pages: number;
  readonly page: number;
  /** The page's first and last group by number; 0 and 0 when nothing was priced. */
  readonly firstGroup: number;
  readonly lastGroup: number;
  readonly others: ScreeningOtherGroups;
}

export interface ScreeningRow {
  readonly rowNo: number;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly payerProduct: string;
  readonly serviceBand: string;
  readonly claimCount: number;
  readonly expectedLineCents: Cents;
  readonly expectedCents: Cents;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  readonly inReductionPool: boolean;
  /** For a code in the reduction across codes: the fully reduced figures; null otherwise. */
  readonly reducedLineCents: Cents | null;
  readonly reducedCents: Cents | null;
  readonly reducedDifferenceCents: Cents | null;
  readonly standing: ScreeningStanding;
}

/**
 * A second figure, or a dash that says why there is none: the table's dash carries data-figure, the stacked one none
 * (its dd names the figure's role).
 */
function Reduced({ cents, copy }: { readonly cents: Cents | null; readonly copy: Copy }) {
  if (cents === null) {
    return (
      <span className="text-muted-foreground" data-figure={copy === 'table' ? 'one-figure' : undefined}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">One figure: the code is outside the reduction across codes</span>
      </span>
    );
  }
  return <ScreeningMoney cents={cents} />;
}

/**
 * What a standing says, for a row or a group whose anomalies are all its rows. At or above, a pooled row or group is
 * at or above its figure before the reduction (screening_standing()), so above or at its fully reduced one too: both.
 */
function standingWords(standing: ScreeningStanding, pooled: boolean, difference: Cents): string {
  switch (standing) {
    case 'anomaly':
      return `Anomaly: more than $5 a claim line below ${pooled ? REDUCED_FIGURE : ONE_FIGURE}`;
    case 'within_reduction_range':
      return WITHIN_REDUCTION_RANGE;
    case 'below_by_threshold_or_less':
      return pooled ? 'Below the fully reduced figure by $5 a claim line or less' : 'Below by $5 a claim line or less';
    case 'at_or_above':
      return pooled ? 'Allowed is at or above both Medicare figures' : `Allowed is ${differenceWords(difference, ONE_FIGURE)}`;
  }
}

/**
 * A standing as a labelled chip, every standing but an anomaly neutral. In the stacked rows an anomaly takes the
 * unpriced tone, as ADR 0056 shows an investigatory line, never Short (a screening makes no finding about a payer); the
 * table's stays short until UX PR 4b moves it, because #42's result.test.tsx pins it there. The table's chip carries
 * data-anomaly and data-standing, the stacked one data-stacked-standing (docs/adr/0078).
 */
function Standing({ standing, copy, children }: { readonly standing: ScreeningStanding; readonly copy: Copy; readonly children: string }) {
  const anomaly = standing === 'anomaly';
  return copy === 'table' ? (
    <StatusChip tone={anomaly ? 'short' : 'neutral'} data-anomaly={String(anomaly)} data-standing={standing}>
      {children}
    </StatusChip>
  ) : (
    <StatusChip tone={anomaly ? 'unpriced' : 'neutral'} data-stacked-standing={standing}>
      {children}
    </StatusChip>
  );
}

/** A group's status: how many of its rows are anomalies, or where its totals stand, always in words. */
function GroupStatus({ group, copy }: { readonly group: ScreeningGroup; readonly copy: Copy }) {
  if (group.standing === 'anomaly' && group.rows > 1) {
    return (
      <Standing standing="anomaly" copy={copy}>
        {`Anomaly: ${group.anomalyRows.toLocaleString('en-US')} of ${counted(group.rows, 'row')} more than $5 a claim line below their lowest figure`}
      </Standing>
    );
  }
  return (
    <Standing standing={group.standing} copy={copy}>
      {standingWords(group.standing, group.inReductionPool, group.differenceCents)}
    </Standing>
  );
}

/**
 * What the anomalies card says above its table, from the database's counts over every group (never the page's): how
 * many groups are anomalies, and how many are within the range of the reduction across codes; with more than one
 * page, which groups this page shows and what its last row sums, one other group named as one (with 50 groups a page,
 * that is page 1 of a result of 51, and the next page lists it). The words for more other groups are the ones #42's
 * result.test.tsx pins, until UX PR 4b.
 */
export function anomaliesDescription(page: Pick<ScreeningGroupPage, 'groups' | 'anomalyGroups' | 'withinReductionGroups' | 'pages' | 'firstGroup' | 'lastGroup' | 'others'>): string {
  if (page.groups === 0) {
    return 'No row was priced under Medicare, so there is nothing to compare.';
  }
  const anomalies = page.anomalyGroups;
  const within = page.withinReductionGroups;
  const all = page.groups.toLocaleString('en-US');
  const first = anomalies === 0 ? `No group of ${all} is an anomaly.` : `${counted(anomalies, 'group')} of ${all} ${anomalies === 1 ? 'is an anomaly' : 'are anomalies'}.`;
  const second =
    within === 0
      ? ''
      : ` ${counted(within, anomalies === 0 ? 'group' : 'more group')} ${within === 1 ? 'is' : 'are'} within the range of the reduction across codes: between ${within === 1 ? 'its' : 'their'} two figures, which is not an anomaly.`;
  const range = `${page.firstGroup.toLocaleString('en-US')} to ${page.lastGroup.toLocaleString('en-US')}`;
  const rest =
    page.others.groups === 1
      ? 'the table’s last row is the one other group, its rows summed, and the next page lists it'
      : `the table’s last row sums the other ${page.others.groups.toLocaleString('en-US')}, and the pages below list them`;
  const shown = page.pages <= 1 ? '' : ` This page lists groups ${range}; ${rest}.`;
  return `${first} ${ANOMALY_RULE}${second} Largest difference from the lowest figure first.${shown}`;
}

/** The page's own address with another page of groups, back at the anomalies card. */
function pageHref(path: string, page: number): string {
  return `${path}?groups=${String(page)}#screening-anomalies`;
}

/** Links to the first, previous, next and last pages of groups; none with one page. Never prefetched: each is a read of the result. */
function GroupPages({ path, page }: { readonly path: string; readonly page: ScreeningGroupPage }) {
  if (page.pages <= 1) {
    return null;
  }
  const link = (target: number, label: string, shown: boolean) =>
    shown ? (
      <Link className="underline" href={pageHref(path, target)} prefetch={false}>
        {label}
      </Link>
    ) : (
      <span className="text-muted-foreground">{label}</span>
    );
  return (
    <nav aria-label="Pages of groups by code and payer product" className="flex flex-wrap items-center gap-3 text-sm" data-slot="group-pages">
      {link(1, 'First', page.page > 1)}
      {link(page.page - 1, 'Previous', page.page > 1)}
      <span>
        Page <span className="font-mono tabular-nums">{page.page.toLocaleString('en-US')}</span> of <span className="font-mono tabular-nums">{page.pages.toLocaleString('en-US')}</span> (
        {counted(page.groups, 'group')})
      </span>
      {link(page.page + 1, 'Next', page.page < page.pages)}
      {link(page.pages, 'Last', page.page < page.pages)}
    </nav>
  );
}

/** Each card's title, which also names its table (aria-labelledby), the table's scroller and the stacked list. */
const ANOMALIES_TITLE = 'Anomalies by code and payer product';
const TOP_ROWS_TITLE = 'Rows with the largest differences';

/**
 * Which way a difference runs (UX-042), once above each table of differences: true of every difference on the page,
 * each the figure less the allowed amount (lib/screening/routes.ts; the summary's ScreeningPricedTotals).
 */
const DIFFERENCE_SIGN = 'Each difference is its Medicare figure less the allowed amount in your file: positive where the allowed amount is below that figure, negative where it is above it.';

function DifferenceSign() {
  return (
    <p className="text-sm text-muted-foreground" data-copy="difference-sign">
      {DIFFERENCE_SIGN}
    </p>
  );
}

/** The anomalies table's columns, in its order, which is the brand's: both Medicare figures, the allowed amount, both differences. */
export const ANOMALY_COLUMNS = [
  { key: 'code', label: 'Code', naming: true, mono: true },
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'rows', label: 'Rows', mono: true, numeric: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true },
  { key: 'medicare', label: MEDICARE_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'reduced', label: REDUCED_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
  { key: 'difference', label: DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'reducedDifference', label: REDUCED_DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'status', label: 'Status', status: true },
] as const satisfies readonly ScreeningColumn[];

type AnomalyKey = (typeof ANOMALY_COLUMNS)[number]['key'];

/** A group's cells in either copy, keyed by the table's columns. */
function groupCells(group: ScreeningGroup, copy: Copy): Readonly<Record<AnomalyKey, ReactNode>> {
  return {
    code: group.procedureCode,
    product: productLabel(group.payerProduct),
    rows: <ScreeningCount value={group.rows} />,
    claimLines: <ScreeningCount value={group.claimLines} />,
    medicare: <ScreeningMoney cents={group.expectedCents} />,
    reduced: <Reduced cents={group.reducedCents} copy={copy} />,
    allowed: <ScreeningMoney cents={group.observedCents} />,
    difference: <ScreeningMoney cents={group.differenceCents} />,
    reducedDifference: <Reduced cents={group.reducedDifferenceCents} copy={copy} />,
    status: <GroupStatus group={group} copy={copy} />,
  };
}

/** A group as a stacked item: headed by its code and payer product, the table's naming cells. */
function groupItem(group: ScreeningGroup): StackedRow {
  const key = `${group.procedureCode}:${group.payerProduct}`;
  return {
    key,
    hooks: { 'data-stacked-group': key },
    heading: (
      <>
        <span className="font-mono font-medium tabular-nums">{group.procedureCode}</span>
        {`, ${productLabel(group.payerProduct)}`}
      </>
    ),
    fields: fieldsFrom(ANOMALY_COLUMNS, groupCells(group, 'rows')),
  };
}

/** The other groups' columns: the eight beside the naming cell that spans Code and Payer product. */
const OTHER_COLUMNS = fieldColumns(ANOMALY_COLUMNS);

type OtherKey = (typeof OTHER_COLUMNS)[number]['key'];

/** What the other groups' fully reduced figures are, in the table's naming cell and under the stacked item's heading. */
const OTHERS_NOTE = 'The fully reduced figures take each row at its lowest: fully reduced for a code in the reduction across codes, its one figure otherwise.';

/** The other groups' name, one group named as one. */
function othersName(others: ScreeningOtherGroups): string {
  return others.groups === 1 ? 'The one other group, its rows summed' : `The other ${counted(others.groups, 'group')}, summed`;
}

/** How many of the other groups are anomalies, in words. */
function othersStanding(others: ScreeningOtherGroups): string {
  if (others.groups === 1) {
    return others.anomalyGroups > 0 ? 'It is an anomaly' : 'It is not an anomaly';
  }
  return others.anomalyGroups === 0 ? 'No group among them is an anomaly' : `${counted(others.anomalyGroups, 'group')} among them ${others.anomalyGroups === 1 ? 'is an anomaly' : 'are anomalies'}`;
}

/**
 * The other groups' sums in either copy, as the database sums them. Their fully reduced columns sum each row's lowest
 * figure, as the summary's do: the fully reduced figure for a row of a code in the reduction across codes, the one
 * figure otherwise. The chip's tone is Standing's: unpriced in the stacked rows when an anomaly is among them, short in
 * the table until UX PR 4b.
 */
function otherCells(others: ScreeningOtherGroups, copy: Copy): Readonly<Record<OtherKey, ReactNode>> {
  const anomaly = others.anomalyGroups > 0;
  return {
    rows: <ScreeningCount value={others.rows} />,
    claimLines: <ScreeningCount value={others.claimLines} />,
    medicare: <ScreeningMoney cents={others.expectedCents} />,
    reduced: <ScreeningMoney cents={others.lowestCents} />,
    allowed: <ScreeningMoney cents={others.observedCents} />,
    difference: <ScreeningMoney cents={others.differenceCents} />,
    reducedDifference: <ScreeningMoney cents={others.lowestDifferenceCents} />,
    status:
      copy === 'table' ? (
        <StatusChip tone={anomaly ? 'short' : 'neutral'} data-anomaly={String(anomaly)}>
          {othersStanding(others)}
        </StatusChip>
      ) : (
        <StatusChip tone={anomaly ? 'unpriced' : 'neutral'}>{othersStanding(others)}</StatusChip>
      ),
  };
}

/** The table's last row, when the page does not show every group: the other groups as the database sums them. */
function OtherGroups({ others }: { readonly others: ScreeningOtherGroups }) {
  if (others.groups === 0) {
    return null;
  }
  return (
    <tfoot>
      <tr className="border-t align-top font-medium" data-group="others">
        <td className="py-1 pr-3" colSpan={2}>
          {othersName(others)}
          <span className="block text-xs font-normal text-muted-foreground">{OTHERS_NOTE}</span>
        </td>
        <ColumnCells columns={OTHER_COLUMNS} cells={otherCells(others, 'table')} />
      </tr>
    </tfoot>
  );
}

/** The other groups as the list's last item: its note under the heading, where the table has it in the naming cell. */
function othersItem(others: ScreeningOtherGroups): StackedRow {
  return {
    key: 'others',
    hooks: { 'data-stacked-group': 'others' },
    heading: othersName(others),
    description: OTHERS_NOTE,
    fields: fieldsFrom(OTHER_COLUMNS, otherCells(others, 'rows')),
  };
}

/** One page of groups as stacked rows: each group, then the others summed when the page does not show every group. */
export function anomalyItems(groups: readonly ScreeningGroup[], page: Pick<ScreeningGroupPage, 'others'>): StackedRow[] {
  return [...groups.map(groupItem), ...(page.others.groups === 0 ? [] : [othersItem(page.others)])];
}

/**
 * The anomalies by code and payer product: one page of groups (`groups`, in the database's order), the database's
 * counts and sums (`page`), and links to the other pages at `path`, the result's own address. The table shows from its
 * own width, 54rem, up and the stacked rows below it.
 */
export function ScreeningAnomalies({ groups, page, path }: { readonly groups: readonly ScreeningGroup[]; readonly page: ScreeningGroupPage; readonly path: string }) {
  return (
    <Card data-section="anomalies" data-groups={String(page.groups)} data-page={String(page.page)}>
      <CardHeader>
        <CardTitle id="screening-anomalies">{ANOMALIES_TITLE}</CardTitle>
        <CardDescription>{anomaliesDescription(page)}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {page.groups === 0 ? (
          <EmptyState title="Nothing priced under Medicare" nextStep="Rows of Original Medicare and Medicare Advantage without a contract are priced; the coverage below says why none was." />
        ) : (
          <>
            <DifferenceSign />
            <StackedRows
              labelledBy="screening-anomalies"
              stackBelow="54rem"
              table={
                <ScrollTable label={ANOMALIES_TITLE}>
                  <table className="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-anomalies">
                    <thead className="text-muted-foreground">
                      <ColumnHeads columns={ANOMALY_COLUMNS} />
                    </thead>
                    <tbody>
                      {groups.map((group) => (
                        <tr key={`${group.payerProduct}:${group.procedureCode}`} className="border-t align-top" data-group={`${group.procedureCode}:${group.payerProduct}`} data-group-no={String(group.groupNo)}>
                          <ColumnCells columns={ANOMALY_COLUMNS} cells={groupCells(group, 'table')} />
                        </tr>
                      ))}
                    </tbody>
                    <OtherGroups others={page.others} />
                  </table>
                </ScrollTable>
              }
              rows={anomalyItems(groups, page)}
            />
          </>
        )}
        <GroupPages path={path} page={page} />
      </CardContent>
    </Card>
  );
}

/** The top rows table's columns, in its order: the file's description of the row, then its four Medicare figures, the allowed amount and both differences. */
export const TOP_ROW_COLUMNS = [
  { key: 'row', label: 'Row', naming: true, mono: true, numeric: true },
  { key: 'code', label: 'Code', naming: true, mono: true },
  { key: 'modifiers', label: 'Modifiers', mono: true },
  { key: 'units', label: 'Units', mono: true, numeric: true },
  { key: 'placeOfService', label: 'Place of service', mono: true },
  { key: 'product', label: 'Payer product', naming: true },
  { key: 'quarter', label: 'Quarter', mono: true, nowrap: true },
  { key: 'claimLines', label: CLAIM_LINES, mono: true, numeric: true },
  { key: 'medicareLine', label: MEDICARE_LINE_LABEL, figure: 'expected', numeric: true },
  { key: 'medicare', label: MEDICARE_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'reducedLine', label: REDUCED_LINE_LABEL, figure: 'expected', numeric: true },
  { key: 'reduced', label: REDUCED_FIGURE_LABEL, figure: 'expected', numeric: true },
  { key: 'allowed', label: ALLOWED_IN_FILE, figure: 'paid', numeric: true },
  { key: 'difference', label: DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'reducedDifference', label: REDUCED_DIFFERENCE_LABEL, figure: 'short', numeric: true },
  { key: 'status', label: 'Status', status: true },
] as const satisfies readonly ScreeningColumn[];

type TopRowKey = (typeof TOP_ROW_COLUMNS)[number]['key'];

/** A top row's cells in either copy, keyed by the table's columns. */
function rowCells(row: ScreeningRow, copy: Copy): Readonly<Record<TopRowKey, ReactNode>> {
  return {
    row: <ScreeningCount value={row.rowNo} />,
    code: row.procedureCode,
    modifiers: row.modifiers.length === 0 ? <None /> : row.modifiers.join(' '),
    units: <ScreeningCount value={row.units} />,
    placeOfService: row.placeOfService,
    product: productLabel(row.payerProduct),
    quarter: row.serviceBand,
    claimLines: <ScreeningCount value={row.claimCount} />,
    medicareLine: <ScreeningMoney cents={row.expectedLineCents} />,
    medicare: <ScreeningMoney cents={row.expectedCents} />,
    reducedLine: <Reduced cents={row.reducedLineCents} copy={copy} />,
    reduced: <Reduced cents={row.reducedCents} copy={copy} />,
    allowed: <ScreeningMoney cents={row.observedCents} />,
    difference: <ScreeningMoney cents={row.differenceCents} />,
    reducedDifference: <Reduced cents={row.reducedDifferenceCents} copy={copy} />,
    status: (
      <Standing standing={row.standing} copy={copy}>
        {standingWords(row.standing, row.inReductionPool, row.differenceCents)}
      </Standing>
    ),
  };
}

/** A top row as a stacked item: headed by its number in the file, its code and its payer product, the table's naming cells. */
function topRowItem(row: ScreeningRow): StackedRow {
  return {
    key: String(row.rowNo),
    hooks: { 'data-stacked-row-no': String(row.rowNo) },
    heading: (
      <>
        {'Row '}
        <span className="font-mono font-medium tabular-nums">{row.rowNo.toLocaleString('en-US')}</span>
        {': '}
        <span className="font-mono font-medium tabular-nums">{row.procedureCode}</span>
        {`, ${productLabel(row.payerProduct)}`}
      </>
    ),
    fields: fieldsFrom(TOP_ROW_COLUMNS, rowCells(row, 'rows')),
  };
}

/** The top rows as stacked rows, in the order given. */
export function topRowItems(rows: readonly ScreeningRow[]): StackedRow[] {
  return rows.map(topRowItem);
}

/** What PaidWhole prices for a row, and how the row's figure follows from it (UX-132; UX-154's sentence for the top rows). */
const TOP_ROWS_PRICED = `PaidWhole prices one claim line under the Medicare fee schedule, before sequestration, and rounds that price once; the row’s figure is that price times its claim lines. A code in the reduction across codes has a second figure, fully reduced across codes; a code outside it has one. ${ANOMALY_RULE}`;

function topRowsDescription(listed: number): string {
  if (listed === 0) {
    return 'No row was priced under Medicare.';
  }
  const which = listed === 1 ? 'The one priced row, by its number in your file.' : `The ${String(listed)} priced rows with the largest differences from their lowest figure, the largest first, each by its number in your file.`;
  return `${which} ${TOP_ROWS_PRICED}`;
}

/**
 * The rows with the largest differences from their lowest figure (at most 25 shown), each as the file described it,
 * with its standing. The table shows from its own width, 54rem, up and the stacked rows below it; at 1280 px its
 * sixteen columns still scroll in its region, with the cue.
 */
export function ScreeningTopRows({ rows, shown = 25 }: { readonly rows: readonly ScreeningRow[]; readonly shown?: number }) {
  const listed = rows.slice(0, shown);
  return (
    <Card data-section="top-rows">
      <CardHeader>
        <CardTitle id="screening-top-rows">{TOP_ROWS_TITLE}</CardTitle>
        <CardDescription>{topRowsDescription(listed.length)}</CardDescription>
      </CardHeader>
      {listed.length === 0 ? null : (
        <CardContent className="flex flex-col gap-3">
          <DifferenceSign />
          <StackedRows
            labelledBy="screening-top-rows"
            stackBelow="54rem"
            table={
              <ScrollTable label={TOP_ROWS_TITLE}>
                <table className="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-top-rows">
                  <thead className="text-muted-foreground">
                    <ColumnHeads columns={TOP_ROW_COLUMNS} />
                  </thead>
                  <tbody>
                    {listed.map((row) => (
                      <tr key={row.rowNo} className="border-t align-top" data-row-no={String(row.rowNo)}>
                        <ColumnCells columns={TOP_ROW_COLUMNS} cells={rowCells(row, 'table')} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollTable>
            }
            rows={topRowItems(listed)}
          />
        </CardContent>
      )}
    </Card>
  );
}
