import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';

import { counted } from '../../lib/copy/words';
import {
  ANOMALY_RULE,
  DIFFERENCE_LABEL,
  MEDICARE_FIGURE_LABEL,
  MEDICARE_LINE_LABEL,
  REDUCED_DIFFERENCE_LABEL,
  REDUCED_FIGURE_LABEL,
  REDUCED_LINE_LABEL,
  type ScreeningStanding,
  WITHIN_REDUCTION_RANGE,
  productLabel,
} from '../../lib/screening/labels';
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
 */

export interface ScreeningGroup {
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

/** What a standing says, for a row or a group whose anomalies are all its rows. */
function standingWords(standing: ScreeningStanding, pooled: boolean, difference: Cents): string {
  switch (standing) {
    case 'anomaly':
      return `Anomaly: more than $5 a claim line below ${pooled ? 'the fully reduced figure' : 'the Medicare figure'}`;
    case 'within_reduction_range':
      return WITHIN_REDUCTION_RANGE;
    case 'below_by_threshold_or_less':
      return pooled ? 'Below the fully reduced figure by $5 a claim line or less' : 'Below by $5 a claim line or less';
    case 'at_or_above':
      return `Allowed is ${differenceWords(difference)}`;
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
    return <Standing standing="anomaly">{`Anomaly: ${String(group.anomalyRows)} of ${counted(group.rows, 'row')} more than $5 a claim line below their lowest figure`}</Standing>;
  }
  return <Standing standing={group.standing}>{standingWords(group.standing, group.inReductionPool, group.differenceCents)}</Standing>;
}

/** What the anomalies card says above its table: how many groups are anomalies, and how many are within the range of the reduction across codes. */
export function anomaliesDescription(groups: readonly ScreeningGroup[]): string {
  if (groups.length === 0) {
    return 'No row was priced under Medicare, so there is nothing to compare.';
  }
  const anomalies = groups.filter((group) => group.anomaly).length;
  const within = groups.filter((group) => group.standing === 'within_reduction_range').length;
  const first =
    anomalies === 0
      ? `No group of ${String(groups.length)} is an anomaly.`
      : `${counted(anomalies, 'group')} of ${String(groups.length)} ${anomalies === 1 ? 'is an anomaly' : 'are anomalies'}.`;
  const second =
    within === 0
      ? ''
      : ` ${counted(within, anomalies === 0 ? 'group' : 'more group')} ${within === 1 ? 'is' : 'are'} within the range of the reduction across codes: between ${within === 1 ? 'its' : 'their'} two figures, which is not an anomaly.`;
  return `${first} ${ANOMALY_RULE}${second} Largest difference from the lowest figure first.`;
}

export function ScreeningAnomalies({ groups }: { readonly groups: readonly ScreeningGroup[] }) {
  return (
    <Card data-section="anomalies">
      <CardHeader>
        <CardTitle id="screening-anomalies">Anomalies by code and payer product</CardTitle>
        <CardDescription>{anomaliesDescription(groups)}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <EmptyState title="Nothing priced under Medicare" nextStep="Rows of Original Medicare and Medicare Advantage without a contract are priced; the coverage below says why none was." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="screening-anomalies">
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
                  <tr key={`${group.payerProduct}:${group.procedureCode}`} className="border-t align-top" data-group={`${group.procedureCode}:${group.payerProduct}`}>
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
            </table>
          </div>
        )}
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
        <CardTitle id="screening-top-rows">Rows with the largest differences</CardTitle>
        <CardDescription>
          {listed.length === 0
            ? 'No row was priced under Medicare.'
            : `${listed.length === 1 ? 'The priced row' : `The ${String(listed.length)} priced rows with the largest differences from their lowest figure, the largest first`}, each by its number in your file. A row is below a figure where that difference is above zero. The figure for one claim line is the engine’s before sequestration, rounded once; the row’s figure is it times the claim count. A code in the reduction across codes has a second figure, fully reduced across codes; a code outside it has one. ${ANOMALY_RULE}`}
        </CardDescription>
      </CardHeader>
      {listed.length === 0 ? null : (
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="screening-top-rows">
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
          </div>
        </CardContent>
      )}
    </Card>
  );
}
