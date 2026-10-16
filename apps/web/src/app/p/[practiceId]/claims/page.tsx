import { Badge, Button, Card, CardContent, EmptyState, Input, Label } from '@tp/ui';
import { STAGE_LABELS } from '@tp/triage';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../components/action-form';
import { Field } from '../../../../components/field';
import { roleNames } from '../../../../components/format';
import { LineStatusChip, Money, Pager, basisName, period } from '../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { LINE_STAGE_FILTERS } from '../../../../lib/remittances/queries';
import { claimsPage } from '../../../../lib/routes/remittances';
import { findClaimAction } from './actions';
import { FormKeys } from '../../../../components/form-keys';

export const metadata: Metadata = { title: 'Claims and lines' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The Claims and lines screen (PRD 7): a server-side paginated, filterable table of every service
 * line, with patient reference, claim control numbers, service date, code and modifiers, units,
 * charge, paid, patient share, observed allowed, expected allowed and the status chips, both from the
 * latest complete pricing run that priced the line (unpriced with its reason, validated when the line is
 * short of its expected amount, priced without a shortfall, or not priced yet). The net view shows each adjudicated claim once, so a reversal followed by a correction
 * shows the corrected claim alone (PRD 6); the full view shows every claim as sent. PHI columns show
 * only to roles that read PHI; filters ride in the URL as opaque IDs, codes and months; a claim
 * control number is searched for by a form post.
 */
export default async function ClaimsPage(props: Props) {
  const page = await loadPage(claimsPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="claims" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, filters, payers, list, canReadPhi, roles } = page.data;
  const path = `/p/${practiceId}/claims`;
  const narrowed = [filters.payer, filters.remittance, filters.claim, filters.patient, filters.code, filters.from, filters.to, filters.stage].some((value) => value !== undefined);
  const query = { ...filters };
  return (
    <AppShell shell={page.shell} section="claims">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Claims and lines</h1>
        <p className="text-sm text-muted-foreground">
          {filters.view === 'net'
            ? 'Net view: each adjudicated claim once. A reversed claim and the claims a correction replaced are left out.'
            : 'Every claim as the 835s sent it, reversals and superseded claims included.'}
        </p>
      </div>
      <form method="get" action={path} className="flex flex-wrap items-end gap-3" aria-label="Filter claims and lines">
        {filters.remittance === undefined ? null : <input type="hidden" name="remittance" value={filters.remittance} />}
        {filters.claim === undefined ? null : <input type="hidden" name="claim" value={filters.claim} />}
        {filters.patient === undefined ? null : <input type="hidden" name="patient" value={filters.patient} />}
        <div className="flex flex-col gap-1">
          <Label htmlFor="view">View</Label>
          <select id="view" name="view" defaultValue={filters.view} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="net">Net (adjudicated claims)</option>
            <option value="all">Every claim as sent</option>
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
        <div className="flex flex-col gap-1">
          <Label htmlFor="code">Code</Label>
          <Input id="code" name="code" defaultValue={filters.code ?? ''} placeholder="97110" className="w-28" />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="from">Service from (month)</Label>
          <Input id="from" name="from" type="month" defaultValue={filters.from ?? ''} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="to">Service to (month)</Label>
          <Input id="to" name="to" type="month" defaultValue={filters.to ?? ''} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="stage">Stage now</Label>
          <select id="stage" name="stage" defaultValue={filters.stage ?? ''} className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Any stage, or none</option>
            {LINE_STAGE_FILTERS.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {narrowed ? (
          <Link className="text-sm underline" href={`${path}?view=${filters.view}`}>
            Clear filters
          </Link>
        ) : null}
      </form>
      {canReadPhi ? (
        <ActionForm action={findClaimAction} submit="Find the claim" className="flex flex-wrap items-end gap-3">
          <FormKeys />
          <input type="hidden" name="practiceId" value={practiceId} />
          <Field label="Payer claim control number" name="payerClaimControlNumber" autoComplete="off" />
        </ActionForm>
      ) : (
        <p className="text-sm text-muted-foreground" data-phi="hidden">
          Patient references, claim control numbers and service dates are hidden for your role ({roleNames(roles)}). The billing manager, the analysts and the firm’s staff see them.
        </p>
      )}
      {filters.claim !== undefined || filters.patient !== undefined || filters.remittance !== undefined ? (
        <p className="text-sm">
          {filters.claim !== undefined ? 'Showing one claim. ' : filters.patient !== undefined ? 'Showing one patient’s claims. ' : 'Showing one remittance’s claims. '}
          <Link className="underline" href={`${path}?view=${filters.view}`}>
            Show all
          </Link>
        </p>
      ) : null}
      {list.total === 0 ? (
        <EmptyState
          title={narrowed ? 'No lines match these filters' : 'No claims loaded yet'}
          nextStep={narrowed ? 'Widen the period, clear the code, or choose every claim as sent.' : 'Upload 835 files on the Uploads screen; each claim that loads appears here with its lines.'}
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label="Claims and lines">
              <thead className="text-muted-foreground">
                <tr>
                  {canReadPhi ? <th className="py-1 font-medium">Patient reference</th> : null}
                  {canReadPhi ? <th className="py-1 font-medium">Claim control numbers</th> : null}
                  {canReadPhi ? <th className="py-1 font-medium">Service date</th> : null}
                  <th className="py-1 font-medium">Code and modifiers</th>
                  <th className="py-1 text-right font-medium">Units</th>
                  <th className="py-1 text-right font-medium">Charge</th>
                  <th className="py-1 text-right font-medium">Paid</th>
                  <th className="py-1 text-right font-medium">Patient share</th>
                  <th className="py-1 text-right font-medium">Observed allowed</th>
                  <th className="py-1 text-right font-medium">Expected allowed</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.rows.map((row) => (
                  <tr key={`${row.claimId}:${row.lineId ?? 'claim'}`} className="border-t align-top" data-claim={row.claimId} data-line={row.lineId ?? ''}>
                    {row.identifiers === null ? null : (
                      <td className="py-2 pr-3">
                        <Link className="underline" href={`${path}?view=${filters.view}&patient=${row.patientRefId}`}>
                          {row.identifiers.patient}
                        </Link>
                      </td>
                    )}
                    {row.identifiers === null ? null : (
                      <td className="py-2 pr-3 font-mono text-xs">
                        <div>{row.identifiers.patientControlNumber}</div>
                        <div>{row.identifiers.payerClaimControlNumber}</div>
                      </td>
                    )}
                    {row.identifiers === null ? null : (
                      <td className="py-2 pr-3 whitespace-nowrap">{row.lineId === null ? period(row.identifiers.serviceFrom, row.identifiers.serviceTo) : period(row.identifiers.serviceDate, row.identifiers.serviceDateTo)}</td>
                    )}
                    <td className="py-2 pr-3">
                      {row.procedureCode === null ? (
                        <span className="text-muted-foreground">Claim without lines</span>
                      ) : (
                        <span className="font-mono text-xs">
                          {row.procedureCode}
                          {row.modifiers.filter((modifier) => modifier !== '').length === 0 ? '' : ` ${row.modifiers.filter((modifier) => modifier !== '').join(' ')}`}
                        </span>
                      )}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {row.reversal ? <Badge variant="secondary">Reversal</Badge> : null}
                        {row.reversed ? <Badge variant="outline">Reversed</Badge> : null}
                        {row.superseded ? <Badge variant="outline">Superseded</Badge> : null}
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{row.units ?? '—'}</td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={row.chargeCents} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={row.paidCents} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={row.patientShareCents} />
                    </td>
                    <td className="py-2 pr-3 text-right" title={basisName(row.observedAllowedBasis, row.observedAllowedAllocated)}>
                      <Money value={row.observedAllowedCents} />
                      {row.observedAllowedAllocated ? <div className="text-xs text-muted-foreground">allocated</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={row.expectedAllowedCents} />
                    </td>
                    <td className="py-2 pr-3">
                      <LineStatusChip status={row.status} priced={row.pricing !== null} shortfall={row.pricing !== null && BigInt(row.pricing.varianceCents ?? '0') > 0n} />
                      {row.pricing?.unpricedReason === null || row.pricing === null ? null : <div className="pt-1 font-mono text-xs text-muted-foreground">{row.pricing.unpricedReason}</div>}
                    </td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      {row.lineId === null ? (
                        <Link className="underline" href={`/p/${practiceId}/remittances/${row.remittanceId}`}>
                          Remittance
                        </Link>
                      ) : (
                        <Link className="underline" href={`/p/${practiceId}/lines/${row.lineId}`}>
                          Line trace
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Pager path={path} query={query} page={list.page} pages={list.pages} total={list.total} noun="rows" />
    </AppShell>
  );
}
