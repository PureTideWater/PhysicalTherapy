import { type ContentWaitMonth, waitingOnText } from '../../lib/pricing/content';
import { Money } from '../remittances/display';
import { ScrollTable } from '../scroll-table';

/**
 * The months that wait on Medicare content PaidWhole has not loaded (audit #7; docs/adr/0071), as Coverage lists them,
 * beside the months waiting on the billing ZIP (location.tsx) and in the same table shape: each month's lines and billed
 * dollars, and what it waits on in words, never a color alone. Money in the mono face. At a phone's width the table
 * scrolls inside a region the keyboard reaches (ScrollTable).
 */
export function MonthsWaitingOnContent({ months, label }: { readonly months: readonly ContentWaitMonth[]; readonly label: string }) {
  return (
    <ScrollTable label={label}>
      <table className="w-full min-w-[32rem] text-left text-sm" aria-label={label}>
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 pr-3 font-medium">Month</th>
            <th className="py-1 pr-3 font-medium">Waiting on</th>
            <th className="py-1 pr-3 text-right font-medium">Lines</th>
            <th className="py-1 text-right font-medium">Billed</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.periodFrom} className="border-t align-top" data-waiting-month={month.periodFrom.slice(0, 7)} data-kind={month.kind} data-code={month.failureCode}>
              <td className="py-1 pr-3 font-mono tabular-nums">{month.periodFrom.slice(0, 7)}</td>
              <td className="py-1 pr-3">{waitingOnText(month)}</td>
              <td className="py-1 pr-3 text-right font-mono tabular-nums">{month.totals.lines}</td>
              <td className="py-1 text-right">
                <Money value={month.totals.chargeCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollTable>
  );
}
