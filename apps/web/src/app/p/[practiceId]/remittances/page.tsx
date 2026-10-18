import { Badge, Button, Card, CardContent, EmptyState, Input, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { remittancesPage } from '../../../../lib/routes/remittances';

export const metadata: Metadata = { title: 'Remittances' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Remittances screen (PRD 7): the loaded remittances with payer, payment date, trace, amount,
 * claims, the balanced flag and the source file; filtered by payer and period in the URL; reversals
 * counted here and linked to their originals on each remittance.
 */
export default async function RemittancesPage(props: Props) {
  const page = await loadPage(remittancesPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="remittances" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, filters, payers, list } = page.data;
  const path = `/p/${practiceId}/remittances`;
  const filtered = filters.payer !== undefined || filters.from !== undefined || filters.to !== undefined;
  return (
    <AppShell shell={page.shell} section="remittances">
      <div className="flex flex-col gap-1">
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Remittances</h1>
        <p className="text-base text-muted-foreground">Every 835 transaction set that balanced and loaded. A held one never loads; its upload’s receipt says why.</p>
      </div>
      <form method="get" action={path} className="flex flex-wrap items-end gap-3" aria-label="Filter remittances">
        <div className="flex flex-col gap-1">
          <Label htmlFor="payer">Payer</Label>
          <select id="payer" name="payer" defaultValue={filters.payer ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">All payers</option>
            {payers.map((payer) => (
              <option key={payer.id} value={payer.id}>
                {payer.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">Paid from (month)</Label>
          <Input id="from" name="from" type="month" defaultValue={filters.from ?? ''} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">Paid to (month)</Label>
          <Input id="to" name="to" type="month" defaultValue={filters.to ?? ''} />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {filtered ? (
          <Link className="text-sm underline" href={path}>
            Clear filters
          </Link>
        ) : null}
      </form>
      {list.total === 0 ? (
        <EmptyState
          mark
          title={filtered ? 'No remittances match these filters' : 'No remittances loaded yet'}
          nextStep={filtered ? 'Widen the period or choose all payers.' : 'Upload your first 835 files on the Uploads screen; each one that balances loads here.'}
        />
      ) : (
        <Card>
          <CardContent>
            <table className="w-full text-left text-sm" aria-label="Remittances">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Payer</th>
                  <th className="py-1 pr-3 font-medium">Payment date</th>
                  <th className="py-1 pr-3 font-medium">Trace</th>
                  <th className="py-1 pr-3 text-right font-medium">Amount</th>
                  <th className="py-1 pr-3 text-right font-medium">Claims</th>
                  <th className="py-1 pr-3 font-medium">Balanced</th>
                  <th className="py-1 font-medium">Source file</th>
                </tr>
              </thead>
              <tbody>
                {list.remittances.map((remittance) => (
                  <tr key={remittance.id} className="border-t align-top" data-remittance={remittance.id}>
                    <td className="py-2 pr-3">
                      <Link className="underline" href={`${path}/${remittance.id}`}>
                        {remittance.payerName}
                      </Link>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {remittance.reversals > 0 ? <Badge variant="secondary">{remittance.reversals === 1 ? '1 reversal' : `${String(remittance.reversals)} reversals`}</Badge> : null}
                        {remittance.reviewReason === null ? null : <Badge variant="destructive">Review: trace reused</Badge>}
                      </div>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{remittance.paymentDate}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{remittance.trace}</td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={remittance.amountCents} />
                      <div className="text-xs text-muted-foreground">{remittance.method}</div>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{remittance.claimCount}</td>
                    <td className="py-2 pr-3">{remittance.balanced ? <Badge>Balanced</Badge> : <Badge variant="destructive">Not balanced</Badge>}</td>
                    <td className="py-2 font-mono text-xs">
                      <Link className="underline" href={`/p/${practiceId}/uploads/${remittance.sourceDocumentId}`}>
                        {remittance.sourceDocumentId.slice(0, 8)}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Pager path={path} query={{ payer: filters.payer, from: filters.from, to: filters.to }} page={list.page} pages={list.pages} total={list.total} noun="remittances" />
    </AppShell>
  );
}
