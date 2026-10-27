import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import Link from 'next/link';
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
import { StatusChip } from '../status';
import { ScreeningCount, ScreeningMoney, differenceWords } from './result-summary';

/**
 * A screening's anomalies by code and payer product, and its top rows (Change Order 001, CO-04; the owner's rulings
 * of 2026-10-18). Each group is the Medicare-priced rows of one code under one payer product, summed by the database.
 * A code in the reduction across a visit's codes has two figures, both the engine's: priced alone ("before the
 * reduction across codes") and priced as a later code of a visit ("fully reduced across codes"); a code outside it
 * has one. A row is an anomaly only when its allowed total is more than $5 a claim line (ADR 0038's threshold)
 * below its lowest figure; a pooled row between its two figures is within the range of the reduction across codes,
 * never an anomaly; a group is an anomaly when one of its rows is. Every standing is the database's
 * (screening_standing()), never this screen's. Every figure is before sequestration. Status shows as a labelled chip,
 * never color alone. Expected, allowed and the difference appear in that order, each in the mono face.
 *
 * The groups come one page at a time (audit #53 part 1: a worst-shape result has 20,507, and all of them at once
 * exhausted the web task's heap): the page's groups in the database's order, the database's counts over every group
 * in the card's description, the database's sums of the groups the page does not show in the table's last row, and
 * links to the other pages. Nothing here counts, adds or orders a group.
 */

/** A count with its noun, its digits grouped as every other count on the result is. */
function many(count: number, one: string, more = `${one}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : more}`;
}

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

// Both figures widen each table past a narrow card: its region scrolls sideways, and is focusable so a keyboard
// reaches it (axe's scrollable-region-focusable; WCAG 2.1.1).
const HEAD = 'py-1 pr-3 font-medium';
const HEAD_LAST = 'py-1 font-medium';
const HEAD_NUMBER = 'py-1 pr-3 text-right font-medium';
const CELL = 'py-1 pr-3';
const CELL_NUMBER = 'py-1 pr-3 text-right';

/** A second figure, or a dash that says why there is none. */
function Reduced({ cents }: { readonly cents: Cents | null }) {
  if (cents === null) {
    return (
      <span className="text-muted-foreground" data-figure="one-figure">
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

/** A standing as a labelled chip: an anomaly in the short tone, the rest neutral. */
function Standing({ standing, children }: { readonly standing: ScreeningStanding; readonly children: string }) {
  return (
    <StatusChip tone={standing === 'anomaly' ? 'short' : 'neutral'} data-anomaly={String(standing === 'anomaly')} data-standing={standing}>
      {children}
    </StatusChip>
  );
}

/** A group's status: how many of its rows are anomalies, or where its totals stand, always in words. */
function GroupStatus({ group }: { readonly group: ScreeningGroup }) {
  if (group.standing === 'anomaly' && group.rows > 1) {
    return <Standing standing="anomaly">{`Anomaly: ${group.anomalyRows.toLocaleString('en-US')} of ${many(group.rows, 'row')} more than $5 a claim line below their lowest figure`}</Standing>;
  }
  return <Standing standing={group.standing}>{standingWords(group.standing, group.inReductionPool, group.differenceCents)}</Standing>;
}

/**
 * What the anomalies card says above its table, from the database's counts over every group (never the page's): how
 * many groups are anomalies, and how many are within the range of the reduction across codes; with more than one
 * page, which groups this page shows.
 */
export function anomaliesDescription(page: Pick<ScreeningGroupPage, 'groups' | 'anomalyGroups' | 'withinReductionGroups' | 'pages' | 'firstGroup' | 'lastGroup' | 'others'>): string {
  if (page.groups === 0) {
    return 'No row was priced under Medicare, so there is nothing to compare.';
  }
  const anomalies = page.anomalyGroups;
  const within = page.withinReductionGroups;
  const all = page.groups.toLocaleString('en-US');
  const first = anomalies === 0 ? `No group of ${all} is an anomaly.` : `${many(anomalies, 'group')} of ${all} ${anomalies === 1 ? 'is an anomaly' : 'are anomalies'}.`;
  const second =
    within === 0
      ? ''
      : ` ${many(within, anomalies === 0 ? 'group' : 'more group')} ${within === 1 ? 'is' : 'are'} within the range of the reduction across codes: between ${within === 1 ? 'its' : 'their'} two figures, which is not an anomaly.`;
  const shown =
    page.pages <= 1
      ? ''
      : ` This page lists groups ${page.firstGroup.toLocaleString('en-US')} to ${page.lastGroup.toLocaleString('en-US')}; the table’s last row sums the other ${page.others.groups.toLocaleString('en-US')}, and the pages below list them.`;
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
        {many(page.groups, 'group')})
      </span>
      {link(page.page + 1, 'Next', page.page < page.pages)}
      {link(page.pages, 'Last', page.page < page.pages)}
    </nav>
  );
}

/**
 * The table's last row, when the page does not show every group: the other groups as the database sums them. Its
 * fully reduced columns sum each row's lowest figure, as the summary's do: the fully reduced figure for a row of a
 * code in the reduction across codes, the one figure otherwise.
 */
function OtherGroups({ others }: { readonly others: ScreeningOtherGroups }) {
  if (others.groups === 0) {
    return null;
  }
  return (
    <tfoot>
      <tr className="border-t align-top font-medium" data-group="others">
        <td className={CELL} colSpan={2}>
          {`The other ${many(others.groups, 'group')}, summed`}
          <span className="block text-xs font-normal text-muted-foreground">Each row at its lowest figure in the fully reduced columns: fully reduced for a code in the reduction across codes, its one figure otherwise.</span>
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningCount value={others.rows} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningCount value={others.claimLines} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningMoney cents={others.expectedCents} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningMoney cents={others.lowestCents} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningMoney cents={others.observedCents} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningMoney cents={others.differenceCents} />
        </td>
        <td className={CELL_NUMBER}>
          <ScreeningMoney cents={others.lowestDifferenceCents} />
        </td>
        <td className="py-1">
          <StatusChip tone={others.anomalyGroups > 0 ? 'short' : 'neutral'} data-anomaly={String(others.anomalyGroups > 0)}>
            {others.anomalyGroups === 0 ? 'No group among them is an anomaly' : `${many(others.anomalyGroups, 'group')} among them ${others.anomalyGroups === 1 ? 'is an anomaly' : 'are anomalies'}`}
          </StatusChip>
        </td>
      </tr>
    </tfoot>
  );
}

/** Each card's title, which also names its table (aria-labelledby) and the table's scroller. */
const ANOMALIES_TITLE = 'Anomalies by code and payer product';
const TOP_ROWS_TITLE = 'Rows with the largest differences';

/**
 * The anomalies by code and payer product: one page of groups (`groups`, in the database's order), the database's
 * counts and sums (`page`), and links to the other pages at `path`, the result's own address.
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
          <ScrollTable label={ANOMALIES_TITLE}>
            <table className="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-anomalies">
              <thead className="text-muted-foreground">
                <tr>
                  <th className={HEAD}>Code</th>
                  <th className={HEAD}>Payer product</th>
                  <th className={HEAD_NUMBER}>Rows</th>
                  <th className={HEAD_NUMBER}>Claim lines</th>
                  <th className={HEAD_NUMBER}>{MEDICARE_FIGURE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{REDUCED_FIGURE_LABEL}</th>
                  <th className={HEAD_NUMBER}>Allowed in your file</th>
                  <th className={HEAD_NUMBER}>{DIFFERENCE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{REDUCED_DIFFERENCE_LABEL}</th>
                  <th className={HEAD_LAST}>Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={`${group.payerProduct}:${group.procedureCode}`} className="border-t align-top" data-group={`${group.procedureCode}:${group.payerProduct}`} data-group-no={String(group.groupNo)}>
                    <td className={`${CELL} font-mono tabular-nums`}>{group.procedureCode}</td>
                    <td className={CELL}>{productLabel(group.payerProduct)}</td>
                    <td className={CELL_NUMBER}>
                      <ScreeningCount value={group.rows} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningCount value={group.claimLines} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={group.expectedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <Reduced cents={group.reducedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={group.observedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={group.differenceCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <Reduced cents={group.reducedDifferenceCents} />
                    </td>
                    <td className="py-1">
                      <GroupStatus group={group} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <OtherGroups others={page.others} />
            </table>
          </ScrollTable>
        )}
        <GroupPages path={path} page={page} />
      </CardContent>
    </Card>
  );
}

/** The rows with the largest differences from their lowest figure (at most 25 shown), each as the file described it, with its standing. */
export function ScreeningTopRows({ rows, shown = 25 }: { readonly rows: readonly ScreeningRow[]; readonly shown?: number }) {
  const listed = rows.slice(0, shown);
  return (
    <Card data-section="top-rows">
      <CardHeader>
        <CardTitle id="screening-top-rows">{TOP_ROWS_TITLE}</CardTitle>
        <CardDescription>
          {listed.length === 0
            ? 'No row was priced under Medicare.'
            : `${listed.length === 1 ? 'The priced row' : `The ${String(listed.length)} priced rows with the largest differences from their lowest figure, the largest first`}, each by its number in your file. A row is below a figure where that difference is above zero. The figure for one claim line is the engine’s before sequestration, rounded once; the row’s figure is it times the claim count. A code in the reduction across codes has a second figure, fully reduced across codes; a code outside it has one. ${ANOMALY_RULE}`}
        </CardDescription>
      </CardHeader>
      {listed.length === 0 ? null : (
        <CardContent>
          <ScrollTable label={TOP_ROWS_TITLE}>
            <table className="w-full min-w-[54rem] text-left text-sm" aria-labelledby="screening-top-rows">
              <thead className="text-muted-foreground">
                <tr>
                  <th className={HEAD_NUMBER}>Row</th>
                  <th className={HEAD}>Code</th>
                  <th className={HEAD}>Modifiers</th>
                  <th className={HEAD_NUMBER}>Units</th>
                  <th className={HEAD}>Place of service</th>
                  <th className={HEAD}>Payer product</th>
                  <th className={HEAD}>Quarter</th>
                  <th className={HEAD_NUMBER}>Claims</th>
                  <th className={HEAD_NUMBER}>{MEDICARE_LINE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{MEDICARE_FIGURE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{REDUCED_LINE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{REDUCED_FIGURE_LABEL}</th>
                  <th className={HEAD_NUMBER}>Allowed in your file</th>
                  <th className={HEAD_NUMBER}>{DIFFERENCE_LABEL}</th>
                  <th className={HEAD_NUMBER}>{REDUCED_DIFFERENCE_LABEL}</th>
                  <th className={HEAD_LAST}>Status</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((row) => (
                  <tr key={row.rowNo} className="border-t align-top" data-row-no={String(row.rowNo)}>
                    <td className={CELL_NUMBER}>
                      <ScreeningCount value={row.rowNo} />
                    </td>
                    <td className={`${CELL} font-mono tabular-nums`}>{row.procedureCode}</td>
                    <td className={`${CELL} font-mono tabular-nums`}>{row.modifiers.length === 0 ? '—' : row.modifiers.join(' ')}</td>
                    <td className={CELL_NUMBER}>
                      <ScreeningCount value={row.units} />
                    </td>
                    <td className={`${CELL} font-mono tabular-nums`}>{row.placeOfService}</td>
                    <td className={CELL}>{productLabel(row.payerProduct)}</td>
                    <td className={`${CELL} font-mono tabular-nums whitespace-nowrap`}>{row.serviceBand}</td>
                    <td className={CELL_NUMBER}>
                      <ScreeningCount value={row.claimCount} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={row.expectedLineCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={row.expectedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <Reduced cents={row.reducedLineCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <Reduced cents={row.reducedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={row.observedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={row.differenceCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <Reduced cents={row.reducedDifferenceCents} />
                    </td>
                    <td className="py-1">
                      <Standing standing={row.standing}>{standingWords(row.standing, row.inReductionPool, row.differenceCents)}</Standing>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollTable>
        </CardContent>
      )}
    </Card>
  );
}
