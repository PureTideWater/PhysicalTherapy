import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Fact, Money, claimStatusName, period } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { remittancePage } from '../../../../../lib/routes/remittances';

export const metadata: Metadata = { title: 'Remittance' };

const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  recoupment: 'Recoupment (WO)',
  forward_balance: 'Forward balance (FB): recorded, not counted until it resolves',
  interest: 'Interest (L6)',
  authorized_return: 'Authorized return (72)',
  other: 'Other',
};

/**
 * One remittance (PRD 7, Remittances: "open a remittance"; "reversals shown linked to their
 * originals"): its payment and trace, the provider-level adjustments, and its claims, each reversal
 * linked to the claim it reverses and each original to the reversal and the correction that
 * supersedes it. Claim identifiers show only to roles that read PHI.
 */
export default async function RemittancePage(props: { readonly params: Promise<{ practiceId: string; remittanceId: string }> }) {
  const page = await loadPage(remittancePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="remittances" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, canReadPhi } = page.data;
  const { remittance, providerAdjustments, claims } = detail;
  const remittanceHref = (id: string) => `/p/${practiceId}/remittances/${id}`;
  return (
    <AppShell shell={page.shell} section="remittances">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/remittances`}>
          Remittances
        </Link>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">
          {remittance.payerName}, paid {remittance.paymentDate}
        </h1>
      </div>
      {remittance.reviewReason === null || remittance.reviewOfRemittanceId === null ? null : (
        <p role="status" className="rounded-md border border-destructive p-3 text-sm">
          For review: the payer used this trace number for{' '}
          <Link className="underline" href={remittanceHref(remittance.reviewOfRemittanceId)}>
            an earlier remittance
          </Link>
          {remittance.reviewReason === 'trace_reused_another_date' ? ' paid on another day' : ' paid the same day'}. Both loaded; check with the payer that both payments are real.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>The 835 transaction set {remittance.st02} of interchange {remittance.isa13}.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-[max-content_1fr] gap-y-1 text-sm">
            <Fact label="Amount">
              <Money value={remittance.amountCents} /> by {remittance.method}
            </Fact>
            <Fact label="Trace (TRN02)">
              <span className="font-mono text-xs">{remittance.trace}</span>
            </Fact>
            <Fact label="Balanced">{remittance.balanced ? <Badge>Balanced</Badge> : <Badge variant="destructive">Not balanced</Badge>}</Fact>
            <Fact label="Claims">{remittance.claimCount}</Fact>
            <Fact label="Provider adjustments">
              <Money value={remittance.plbTotalCents} />
            </Fact>
            <Fact label="Production date">{remittance.productionDate ?? '—'}</Fact>
            <Fact label="Payee">{remittance.payeeId}</Fact>
            <Fact label="Source file">
              <Link className="font-mono text-xs underline" href={`/p/${practiceId}/uploads/${remittance.sourceDocumentId}`}>
                {remittance.sourceDocumentId}
              </Link>
            </Fact>
          </dl>
          <Link className="mt-4 inline-block text-sm underline" href={`/p/${practiceId}/claims?view=all&remittance=${remittance.id}`}>
            Open its claims and lines
          </Link>
        </CardContent>
      </Card>
      {providerAdjustments.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Provider-level adjustments (PLB)</CardTitle>
            <CardDescription>A positive amount reduced this payment; a negative one added to it.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-left text-sm" aria-label="Provider adjustments">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">Reason</th>
                  <th className="py-1 pr-3 font-medium">Kind</th>
                  <th className="py-1 pr-3 font-medium">Fiscal period</th>
                  {canReadPhi ? <th className="py-1 pr-3 font-medium">Reference</th> : null}
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {providerAdjustments.map((item) => (
                  <tr key={item.position} className="border-t">
                    <td className="py-1 pr-3 font-mono text-xs">{item.reasonCode}</td>
                    <td className="py-1 pr-3">{CATEGORY_NAMES[item.category] ?? item.category}</td>
                    <td className="py-1 pr-3">{item.fiscalPeriodDate}</td>
                    {canReadPhi ? <td className="py-1 pr-3 font-mono text-xs">{item.reference ?? '—'}</td> : null}
                    <td className="py-1 text-right">
                      <Money value={item.amountCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Claims</CardTitle>
          <CardDescription>
            {canReadPhi ? 'In the order the 835 sent them.' : 'In the order the 835 sent them. Patient and claim identifiers are shown only to roles that read PHI.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {claims.length === 0 ? (
            <EmptyState title="No claims in this remittance" nextStep="A remittance of provider-level adjustments alone pays or takes back money without claims." />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Claims">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  {canReadPhi ? <th className="py-1 pr-3 font-medium">Patient</th> : null}
                  {canReadPhi ? <th className="py-1 pr-3 font-medium">Claim control numbers</th> : null}
                  {canReadPhi ? <th className="py-1 pr-3 font-medium">Service dates</th> : null}
                  <th className="py-1 pr-3 font-medium">Status</th>
                  <th className="py-1 pr-3 text-right font-medium">Charge</th>
                  <th className="py-1 pr-3 text-right font-medium">Paid</th>
                  <th className="py-1 pr-3 text-right font-medium">Patient responsibility</th>
                  <th className="py-1 font-medium">Links</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((claim) => (
                  <tr key={claim.id} className="border-t align-top" data-claim={claim.id}>
                    <td className="py-2 pr-3 font-mono tabular-nums">{claim.claimNo}</td>
                    {claim.identifiers === null ? null : <td className="py-2 pr-3">{claim.identifiers.patient}</td>}
                    {claim.identifiers === null ? null : (
                      <td className="py-2 pr-3 font-mono text-xs">
                        <div>Patient: {claim.identifiers.patientControlNumber}</div>
                        <div>Payer: {claim.identifiers.payerClaimControlNumber}</div>
                      </td>
                    )}
                    {claim.identifiers === null ? null : <td className="py-2 pr-3 whitespace-nowrap">{period(claim.identifiers.serviceFrom, claim.identifiers.serviceTo)}</td>}
                    <td className="py-2 pr-3">{claimStatusName(claim.statusCode)}</td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={claim.chargeCents} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={claim.paidCents} />
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <Money value={claim.patientRespCents} />
                    </td>
                    <td className="py-2 text-xs">
                      <div className="flex flex-col gap-1">
                        {claim.reversalOf === null ? null : (
                          <Link className="underline" href={remittanceHref(claim.reversalOf.remittanceId)} data-link="reverses">
                            Reverses a claim of {claim.reversalOf.remittanceId === remittance.id ? 'this remittance' : 'an earlier remittance'}
                          </Link>
                        )}
                        {claim.statusCode === '22' && claim.reversalOf === null ? <span className="text-muted-foreground">Reverses a claim not loaded here</span> : null}
                        {claim.reversedBy === null ? null : (
                          <Link className="underline" href={remittanceHref(claim.reversedBy.remittanceId)} data-link="reversed-by">
                            Reversed in {claim.reversedBy.remittanceId === remittance.id ? 'this remittance' : 'a later remittance'}
                          </Link>
                        )}
                        {claim.supersededBy === null ? null : (
                          <Link className="underline" href={remittanceHref(claim.supersededBy.remittanceId)} data-link="superseded-by">
                            Superseded by a corrected claim
                          </Link>
                        )}
                        <Link className="underline" href={`/p/${practiceId}/claims?view=all&claim=${claim.id}`}>
                          {claim.lines === 1 ? '1 line' : `${String(claim.lines)} lines`}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
