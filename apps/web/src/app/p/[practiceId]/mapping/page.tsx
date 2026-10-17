import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { MappingText, TotalsText } from '../../../../components/contracts/display';
import { Money, Pager } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import type { PlanStatus } from '../../../../lib/contracts/mapping-queries';
import { loadPage } from '../../../../lib/http/next';
import { mappingPage } from '../../../../lib/routes/mapping';

export const metadata: Metadata = { title: 'Payer and plan mapping' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

const STATUS: Readonly<Record<PlanStatus, { readonly label: string; readonly variant: 'destructive' | 'secondary' | 'default' }>> = {
  unmapped: { label: 'Unmapped', variant: 'destructive' },
  partly_mapped: { label: 'Partly mapped', variant: 'secondary' },
  mapped: { label: 'Mapped', variant: 'default' },
};

const VIEWS = [
  { value: 'unmapped', label: 'Waiting on mapping' },
  { value: 'mapped', label: 'Mapped' },
  { value: 'all', label: 'All plans' },
] as const;

/**
 * The Payer and plan mapping screen (PRD 7; PRD 5, J6): the dollars waiting on mapping at the top;
 * unmapped payer and plan combinations with their claim counts and dollars; mapped ones with their
 * contract version. Each plan opens to its mappings and the form that maps it. Filters in the URL.
 */
export default async function MappingPage(props: Props) {
  const page = await loadPage(mappingPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="mapping" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, filters, payers, waiting, list, canMap } = page.data;
  const path = `/p/${practiceId}/mapping`;
  return (
    <AppShell shell={page.shell} section="mapping">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-display">Payer and plan mapping</h1>
        <p className="text-sm text-muted-foreground">
          Every payer and plan the 835s name, and the agreement each is paid under. Pricing never runs on a plan with no mapping; lines whose service date no mapping covers
          wait here.
        </p>
      </div>
      <Card role="region" aria-label="Dollars waiting on mapping">
        <CardHeader>
          <CardTitle>
            Dollars waiting on mapping: <Money value={waiting.chargeCents} /> billed
          </CardTitle>
          <CardDescription>
            <TotalsText totals={waiting} />. {waiting.lines === 0 ? 'Every line has a mapping on its service date.' : 'Map each plan below to price these lines.'}
          </CardDescription>
        </CardHeader>
      </Card>
      <form method="get" action={path} className="flex flex-wrap items-end gap-3" aria-label="Filter plans">
        <div className="flex flex-col gap-1">
          <Label htmlFor="view">Show</Label>
          <select id="view" name="view" defaultValue={filters.view} className="h-9 rounded-md border bg-background px-2 text-sm">
            {VIEWS.map((view) => (
              <option key={view.value} value={view.value}>
                {view.label}
              </option>
            ))}
          </select>
        </div>
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
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      {list.total === 0 ? (
        <EmptyState
          title={filters.view === 'unmapped' ? 'Nothing is waiting on mapping' : 'No plans here yet'}
          nextStep={
            filters.view === 'unmapped'
              ? 'Every plan with lines has a mapping on their service dates. Show all plans to review or correct a mapping.'
              : 'Plans appear once their 835s load: upload remittances on the Uploads screen.'
          }
          action={
            filters.view === 'unmapped' ? (
              <Link className="text-sm underline" href={`${path}?view=all`}>
                Show all plans
              </Link>
            ) : (
              <Link className="text-sm underline" href={`/p/${practiceId}/uploads`}>
                Go to Uploads
              </Link>
            )
          }
        />
      ) : (
        <Card>
          <CardContent>
            <table className="w-full text-left text-sm" aria-label="Payers and plans">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Payer</th>
                  <th className="py-1 font-medium">Plan</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 text-right font-medium">Claims</th>
                  <th className="py-1 text-right font-medium">Billed</th>
                  <th className="py-1 text-right font-medium">Waiting</th>
                  <th className="py-1 font-medium">Mapped to</th>
                </tr>
              </thead>
              <tbody>
                {list.plans.map((plan) => (
                  <tr key={plan.id} className="border-t align-top" data-plan={plan.id}>
                    <td className="py-2 pr-3">{plan.payerName}</td>
                    <td className="py-2 pr-3">
                      <Link className="underline" href={`${path}/${plan.id}`}>
                        {plan.planName ?? plan.planKey}
                      </Link>
                      {plan.medicareAdvantage ? <div className="text-xs text-muted-foreground">Medicare Advantage</div> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant={STATUS[plan.status].variant}>{STATUS[plan.status].label}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{plan.totals.claims}</td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={plan.totals.chargeCents} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={plan.waiting.chargeCents} />
                      <div className="text-xs text-muted-foreground">
                        {plan.waiting.lines} of {plan.totals.lines} lines
                      </div>
                    </td>
                    <td className="py-2">
                      {plan.current.length === 0 ? (
                        canMap ? (
                          <Link className="underline" href={`${path}/${plan.id}`}>
                            Map this plan
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not mapped</span>
                        )
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {plan.current.map((mapping) => (
                            <li key={mapping.id}>
                              <MappingText practiceId={practiceId} kind={mapping.kind} mapping={mapping} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Pager path={path} query={{ view: filters.view, payer: filters.payer }} page={list.page} pages={list.pages} total={list.total} noun="plans" />
    </AppShell>
  );
}
