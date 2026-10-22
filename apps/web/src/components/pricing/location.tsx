import type { MonthWaitingOnLocation } from '../../lib/pricing/location';
import { Money } from '../remittances/display';

/**
 * The months that wait on the practice's pricing location (audit #33; docs/adr/0064), as Pricing settings and
 * Coverage list them: each month's lines, claims, billed and paid dollars, and the location's status over the month in
 * plain words. Money in the mono face; the status always in words, never a color alone.
 */
export function MonthsWaitingOnLocation({ months, label }: { readonly months: readonly MonthWaitingOnLocation[]; readonly label: string }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm" aria-label={label}>
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Month</th>
            <th className="py-1 pr-3 text-right font-medium">Lines</th>
            <th className="py-1 pr-3 text-right font-medium">Claims</th>
            <th className="py-1 pr-3 text-right font-medium">Billed</th>
            <th className="py-1 pr-3 text-right font-medium">Paid</th>
            <th className="py-1 font-medium">Why it waits</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.periodFrom} className="border-t align-top" data-waiting-month={month.periodFrom.slice(0, 7)} data-kind={month.kind} data-status={month.status}>
              <td className="py-1 pr-3 font-mono tabular-nums">{month.periodFrom.slice(0, 7)}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.lines}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.claims}</td>
              <td className="py-1 pr-3 text-right">
                <Money value={month.totals.chargeCents} />
              </td>
              <td className="py-1 pr-3 text-right">
                <Money value={month.totals.paidCents} />
              </td>
              <td className="py-1">{month.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
