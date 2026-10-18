import type { Cents } from '@tp/money';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';

import { counted } from '../../lib/copy/words';
import { MEDICARE_FIGURE_LABEL, productLabel } from '../../lib/screening/labels';
import { StatusChip } from '../status';
import { ScreeningCount, ScreeningMoney, differenceWords } from './result-summary';

/**
 * A screening's anomalies by code and payer product, and its top rows (Change Order 001, CO-04). Each group is the
 * Medicare-priced rows of one code under one payer product, summed by the database; it is an anomaly when the file's
 * allowed total is below the Medicare figure by at least $5 a claim line (ADR 0038's default threshold), a flag the
 * database sets, never this screen. Status shows as a labelled chip, never color alone. Expected, allowed and the
 * difference appear in that order, each in the mono face.
 */

export interface ScreeningGroup {
  readonly payerProduct: string;
  readonly procedureCode: string;
  readonly rows: number;
  readonly claimLines: number;
  readonly expectedCents: Cents;
  readonly observedCents: Cents;
  readonly differenceCents: Cents;
  readonly anomaly: boolean;
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
}

const HEAD = 'py-1 pr-3 font-medium';
const HEAD_LAST = 'py-1 font-medium';
const HEAD_NUMBER = 'py-1 pr-3 text-right font-medium';
const CELL = 'py-1 pr-3';
const CELL_NUMBER = 'py-1 pr-3 text-right';

/** A group's status: an anomaly, or where its total sits, always in words. */
function GroupStatus({ group }: { readonly group: ScreeningGroup }) {
  if (group.anomaly) {
    return (
      <StatusChip tone="short" data-anomaly="true">
        Anomaly: below the Medicare figure
      </StatusChip>
    );
  }
  return (
    <StatusChip tone="neutral" data-anomaly="false">
      {group.differenceCents > 0n ? 'Below by under $5 a claim line' : `Allowed is ${differenceWords(group.differenceCents)}`}
    </StatusChip>
  );
}

export function ScreeningAnomalies({ groups }: { readonly groups: readonly ScreeningGroup[] }) {
  const anomalies = groups.filter((group) => group.anomaly).length;
  return (
    <Card data-section="anomalies">
      <CardHeader>
        <CardTitle id="screening-anomalies">Anomalies by code and payer product</CardTitle>
        <CardDescription>
          {groups.length === 0
            ? 'No row was priced under Medicare, so there is nothing to compare.'
            : `${counted(anomalies, 'group')} of ${String(groups.length)} ${anomalies === 1 ? 'is an anomaly' : 'are anomalies'}: the allowed total in your file is below the Medicare figure by at least $5 a claim line. Largest difference first.`}
        </CardDescription>
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
                  <th className={HEAD_NUMBER}>Allowed in your file</th>
                  <th className={HEAD_NUMBER}>Difference</th>
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
                      <ScreeningMoney cents={group.observedCents} />
                    </td>
                    <td className={CELL_NUMBER}>
                      <ScreeningMoney cents={group.differenceCents} />
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

/** The rows with the largest differences (at most 25 shown), each as the file described it. */
export function ScreeningTopRows({ rows, shown = 25 }: { readonly rows: readonly ScreeningRow[]; readonly shown?: number }) {
  const listed = rows.slice(0, shown);
  return (
    <Card data-section="top-rows">
      <CardHeader>
        <CardTitle id="screening-top-rows">Rows with the largest differences</CardTitle>
        <CardDescription>
          {listed.length === 0
            ? 'No row was priced under Medicare.'
            : `The ${counted(listed.length, 'priced row')} whose allowed total is furthest below the Medicare figure, by your file’s row number. The figure for one claim line is the engine’s, rounded once; the row’s figure is it times the claim count.`}
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
                  <th className={HEAD_NUMBER}>One claim line</th>
                  <th className={HEAD_NUMBER}>{MEDICARE_FIGURE_LABEL}</th>
                  <th className={HEAD_NUMBER}>Allowed in your file</th>
                  <th className="py-1 text-right font-medium">Difference</th>
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
                      <ScreeningMoney cents={row.observedCents} />
                    </td>
                    <td className="py-1 text-right">
                      <ScreeningMoney cents={row.differenceCents} />
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
