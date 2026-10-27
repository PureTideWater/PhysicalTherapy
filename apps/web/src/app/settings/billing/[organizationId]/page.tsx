import { formatUsd, parseCents } from '@tp/money';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../components/action-form';
import { AccountStandingSummary, NextStepText } from '../../../../components/billing/account-standing';
import { PAYMENT_METHOD_NAME, PaymentMethodCard } from '../../../../components/billing/payment-method-card';
import { SelectField } from '../../../../components/field';
import { utc, utcDate } from '../../../../components/format';
import { Money } from '../../../../components/remittances/display';
import { ScrollTable } from '../../../../components/scroll-table';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { CLOSURE_TICKET, organizationBillingPage } from '../../../../lib/routes/billing';
import { addSimulatedPaymentMethod, choosePlan, payInvoice, settleSimulatedPayments } from '../actions';
import { FormKeys } from '../../../../components/form-keys';
import { pageCsrfToken } from '../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Organization billing' };

const INVOICE_STATUS: Readonly<Record<string, string>> = { open: 'Open', paid: 'Paid', void: 'Void', uncollectible: 'Uncollectible', draft: 'Draft' };
const KIND: Readonly<Record<string, string>> = { subscription: 'Subscription', audit: 'Audit', other: 'Other' };

/**
 * An organization's billing (PRD 5, J18; PRD 6, Billing; PRD 7, Settings; docs/adr/0050), for its
 * administrator: its one standing with what to do next (accountStanding; while PaidWhole's suspension lasts, a note
 * that the forms below do not lift it), the payment method (a bank account by ACH, preferred
 * and shown first, or a card: Stripe Elements in production, the local simulator's test values in development;
 * components/billing/payment-method-card.tsx, docs/adr/0073), then the plan (monthly or annual), which needs a
 * method on file (with none, the plans' prices and a sentence asking for one stand in for the form; for a closed
 * organization, a sentence that it takes none and the ticket for a question about the closure; the note that the
 * amounts are placeholders shows only beside amounts), and the invoices, with a Pay form for each unpaid one and for the
 * invoice holding the standing even when it is older than the newest shown. What is chosen here happens at Stripe
 * and shows once Stripe reports it.
 */
export default async function OrganizationBillingPage(props: { readonly params: Promise<{ organizationId: string }> }) {
  const page = await loadPage(organizationBillingPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="billing" roles={page.roles} message={page.message} nextStep="Your organization's administrator manages its billing." />;
  }
  const { billing, paymentMethod, catalog, provider, standing, testRouting } = page.data;
  const organizationId = billing.organizationId;
  const holding = billing.holdingInvoice;
  const unpaid = billing.invoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'uncollectible');
  const open = holding === null || unpaid.some((invoice) => invoice.id === holding.id) ? unpaid : [...unpaid, holding];
  return (
    <AppShell shell={page.shell} section="billing">
      <h1 className="text-[2rem] font-bold leading-display tracking-display">Billing: {billing.name}</h1>
      <AccountStandingSummary standing={standing} />
      {standing.formsNote === null ? null : (
        <p className="text-sm" data-notice="forms">
          {standing.formsNote}
        </p>
      )}

      <PaymentMethodCard
        organizationId={organizationId}
        paymentMethod={paymentMethod}
        provider={provider}
        testRouting={testRouting}
        formKeys={() => <FormKeys />}
        csrfToken={await pageCsrfToken()}
        addSimulatedPaymentMethod={addSimulatedPaymentMethod}
        settleSimulatedPayments={settleSimulatedPayments}
      />

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>Monitoring, billed monthly or annually to the payment method on file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {billing.subscription === null && standing.planRefusal !== null ? (
            <p data-plan="closed">
              {standing.planRefusal} <NextStepText step={CLOSURE_TICKET} />
            </p>
          ) : billing.subscription === null && paymentMethod === null ? (
            // A plan is refused until a method is on file, so the form waits for one; the prices still show.
            <div className="flex flex-col gap-2" data-plan="needs-method">
              <ul className="flex flex-col gap-1">
                <li>
                  {catalog.plans.monthly.name}: <Money value={catalog.plans.monthly.amountCents} /> a month
                </li>
                <li>
                  {catalog.plans.annual.name}: <Money value={catalog.plans.annual.amountCents} /> a year
                </li>
              </ul>
              <p>Add a payment method above, then choose a plan here.</p>
            </div>
          ) : billing.subscription === null ? (
            <ActionForm action={choosePlan} submit="Choose plan" className="grid max-w-md gap-4">
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <SelectField
                label="Plan"
                name="plan"
                id="field-plan"
                options={[
                  // An <option> holds text only: the one place a price is not set in the mono face (docs/adr/0056).
                  { value: 'monthly', label: `${catalog.plans.monthly.name}: ${formatUsd(parseCents(catalog.plans.monthly.amountCents))} a month` },
                  { value: 'annual', label: `${catalog.plans.annual.name}: ${formatUsd(parseCents(catalog.plans.annual.amountCents))} a year` },
                ]}
              />
            </ActionForm>
          ) : (
            <p data-plan={billing.subscription.plan}>
              {billing.subscription.plan === 'monthly' ? catalog.plans.monthly.name : catalog.plans.annual.name}, <Badge variant="outline">{billing.subscription.status}</Badge>
              {billing.subscription.currentPeriodEnd === null ? null : <> — the current period ends {utcDate(billing.subscription.currentPeriodEnd)}</>}
              {billing.subscription.cancelAtPeriodEnd ? <> (ends then)</> : null}
            </p>
          )}
          {catalog.confirmed || (billing.subscription === null && standing.planRefusal !== null) ? null : <p className="text-xs text-muted-foreground">The plan amounts shown are placeholders until PaidWhole confirms its prices.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>The newest first. An ACH payment shows as open until the bank settles it, a few days after it starts.</CardDescription>
        </CardHeader>
        <CardContent>
          {billing.invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              nextStep={
                standing.planRefusal !== null
                  ? 'Nothing is owed; a closed organization takes no new plan.'
                  : billing.subscription === null
                    ? 'Add a payment method, then choose a plan.'
                    : 'The first invoice appears once Stripe issues it.'
              }
            />
          ) : (
            <ScrollTable label="Invoices">
              <table className="w-full min-w-[40rem] text-left text-sm" aria-label="Invoices">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="py-1 pr-3 font-medium">Invoice</th>
                    <th className="py-1 pr-3 font-medium">For</th>
                    <th className="py-1 pr-3 font-medium">Issued</th>
                    <th className="py-1 pr-3 font-medium">Amount</th>
                    <th className="py-1 pr-3 font-medium">Status</th>
                    <th className="py-1 font-medium">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {billing.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-t" data-invoice-status={invoice.status}>
                      <td className="py-1 pr-3 wrap-anywhere">
                        {invoice.hostedInvoiceUrl === null ? (
                          (invoice.number ?? '—')
                        ) : (
                          <a className="underline" href={invoice.hostedInvoiceUrl} rel="noreferrer noopener" target="_blank">
                            {invoice.number ?? 'View'}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        )}
                      </td>
                      <td className="py-1 pr-3">{KIND[invoice.kind] ?? invoice.kind}</td>
                      <td className="py-1 pr-3">{utcDate(invoice.createdAt)}</td>
                      <td className="py-1 pr-3 font-mono tabular-nums">{formatUsd(parseCents(invoice.amountDueCents))}</td>
                      <td className="py-1 pr-3">
                        <Badge variant={invoice.status === 'paid' ? 'outline' : invoice.firstFailedAt === null ? 'secondary' : 'destructive'}>{INVOICE_STATUS[invoice.status] ?? invoice.status}</Badge>
                        {invoice.firstFailedAt === null || invoice.status === 'paid' ? null : <span className="ml-2 text-xs">payment failed {utcDate(invoice.firstFailedAt)}</span>}
                      </td>
                      <td className="py-1">{invoice.paidAt === null ? '—' : `${utc(invoice.paidAt)}${invoice.paymentMethodKind === null ? '' : `, ${PAYMENT_METHOD_NAME[invoice.paymentMethodKind] ?? invoice.paymentMethodKind}`}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollTable>
          )}
          {open.length === 0 ? null : (
            <div className="mt-4 flex flex-col gap-2">
              {open.map((invoice) => (
                // The standing's next step links here (#pay-<invoice>); the margin keeps the Pay button clear of the sticky header.
                <div key={invoice.id} id={`pay-${invoice.id}`} className="scroll-mt-20">
                  <ActionForm
                    action={payInvoice}
                    submit={
                      <>
                        Pay {invoice.number ?? 'the open invoice'} now (<Money value={invoice.amountRemainingCents} />)
                      </>
                    }
                    variant="outline"
                  >
                    <FormKeys />
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="invoiceId" value={invoice.id} />
                  </ActionForm>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
