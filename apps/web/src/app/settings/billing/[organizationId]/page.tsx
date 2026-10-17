import { formatUsd, parseCents } from '@tp/money';
import { Alert, AlertDescription, AlertTitle, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from '@tp/ui';
import type { Metadata } from 'next';

import { ActionForm } from '../../../../components/action-form';
import { StripePaymentMethod } from '../../../../components/billing/stripe-payment-method';
import { Field, SelectField } from '../../../../components/field';
import { utc, utcDate } from '../../../../components/format';
import { AppShell, Forbidden } from '../../../../components/shell';
import { loadPage } from '../../../../lib/http/next';
import { organizationBillingPage } from '../../../../lib/routes/billing';
import { addSimulatedPaymentMethod, choosePlan, payInvoice, settleSimulatedPayments } from '../actions';
import { FormKeys } from '../../../../components/form-keys';
import { pageCsrfToken } from '../../../../lib/http/csrf-page';

export const metadata: Metadata = { title: 'Organization billing' };

const STANDING: Readonly<Record<string, string>> = { good: 'In good standing', past_due: 'Past due', suspended: 'Suspended for nonpayment' };
const INVOICE_STATUS: Readonly<Record<string, string>> = { open: 'Open', paid: 'Paid', void: 'Void', uncollectible: 'Uncollectible', draft: 'Draft' };
const METHOD: Readonly<Record<string, string>> = { us_bank_account: 'ACH bank account', card: 'Card' };
const KIND: Readonly<Record<string, string>> = { subscription: 'Subscription', audit: 'Audit', other: 'Other' };

/**
 * An organization's billing (PRD 5, J18; PRD 6, Billing; PRD 7, Settings; docs/adr/0050), for its
 * administrator: the standing and any suspension notice, the plan (monthly or annual), the payment method
 * (ACH or card: Stripe Elements in production, the local simulator's test values in development) and the
 * invoices. What is chosen here happens at Stripe and shows once Stripe reports it.
 */
export default async function OrganizationBillingPage(props: { readonly params: Promise<{ organizationId: string }> }) {
  const page = await loadPage(organizationBillingPage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="billing" roles={page.roles} message={page.message} nextStep="Your organization's administrator manages its billing." />;
  }
  const { billing, paymentMethod, catalog, provider, suspension, testRouting } = page.data;
  const organizationId = billing.organizationId;
  const open = billing.invoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'uncollectible');
  return (
    <AppShell shell={page.shell} section="billing">
      <h1 className="text-2xl font-bold tracking-display">Billing: {billing.name}</h1>
      <p className="text-sm text-muted-foreground">
        Standing: <Badge variant={billing.standing === 'good' ? 'outline' : 'destructive'}>{STANDING[billing.standing] ?? billing.standing}</Badge>
        {billing.pastDueSince === null ? null : <span> since {utcDate(billing.pastDueSince)}</span>}
      </p>
      {suspension === null ? null : (
        <Alert variant="destructive" data-notice="suspended" role="alert">
          <AlertTitle>New runs have stopped</AlertTitle>
          <AlertDescription>{suspension}</AlertDescription>
        </Alert>
      )}
      {billing.standing === 'past_due' && billing.pastDueSince !== null ? (
        <Alert data-notice="past-due">
          <AlertTitle>A payment failed</AlertTitle>
          <AlertDescription>
            Update the payment method or pay the open invoice. New runs stop 30 days after the failed payment ({utcDate(new Date(billing.pastDueSince.getTime() + 30 * 86_400_000))}) until it is paid; your data stays readable.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Plan</CardTitle>
          <CardDescription>Monitoring, billed monthly or annually to the payment method on file.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          {billing.subscription === null ? (
            <ActionForm action={choosePlan} submit="Choose plan" className="grid max-w-md gap-4">
              <FormKeys />
              <input type="hidden" name="organizationId" value={organizationId} />
              <SelectField
                label="Plan"
                name="plan"
                id="field-plan"
                options={[
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
          {catalog.confirmed ? null : <p className="text-xs text-muted-foreground">The plan amounts shown are placeholders until PaidWhole confirms its prices.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment method</CardTitle>
          <CardDescription>ACH debit from a bank account, or a card. The account or card number never reaches this application.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p data-payment-method={paymentMethod?.kind ?? 'none'}>
            {paymentMethod === null ? 'No payment method on file.' : `${METHOD[paymentMethod.kind] ?? paymentMethod.kind} ending ${paymentMethod.last4}${paymentMethod.label === null ? '' : ` (${paymentMethod.label})`}`}
          </p>
          {provider === 'stripe' ? (
            <StripePaymentMethod organizationId={organizationId} csrfToken={await pageCsrfToken()} />
          ) : (
            <div className="flex flex-col gap-4" aria-label="Test mode">
              <p className="text-xs text-muted-foreground">
                Test mode: the local billing simulator stands in for Stripe. It accepts only its own test values: routing number {testRouting}, account 000123456789 (settles) or
                000222222227 (fails, insufficient funds); card 4242424242424242 (succeeds) or 4000000000000341 (declined).
              </p>
              <ActionForm action={addSimulatedPaymentMethod} submit="Add test bank account (ACH)" className="grid max-w-md gap-3">
                <FormKeys />
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="method" value="us_bank_account" />
                <Field label="Routing number" name="routingNumber" id="field-routing" inputMode="numeric" defaultValue={testRouting} required />
                <Field label="Account number" name="accountNumber" id="field-account" inputMode="numeric" defaultValue="000123456789" required />
              </ActionForm>
              <ActionForm action={addSimulatedPaymentMethod} submit="Add test card" className="grid max-w-md gap-3">
                <FormKeys />
                <input type="hidden" name="organizationId" value={organizationId} />
                <input type="hidden" name="method" value="card" />
                <Field label="Card number" name="cardNumber" id="field-card" inputMode="numeric" defaultValue="4242424242424242" required />
              </ActionForm>
              <ActionForm action={settleSimulatedPayments} submit="Settle pending test ACH payments" variant="outline">
                <FormKeys />
                <input type="hidden" name="organizationId" value={organizationId} />
              </ActionForm>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices</CardTitle>
          <CardDescription>The newest first. An ACH payment shows as open until the bank settles it, a few days after it starts.</CardDescription>
        </CardHeader>
        <CardContent>
          {billing.invoices.length === 0 ? (
            <EmptyState title="No invoices yet" nextStep={billing.subscription === null ? 'Add a payment method, then choose a plan.' : 'The first invoice appears once Stripe issues it.'} />
          ) : (
            <table className="w-full text-left text-sm" aria-label="Invoices">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Invoice</th>
                  <th className="py-1 font-medium">For</th>
                  <th className="py-1 font-medium">Issued</th>
                  <th className="py-1 font-medium">Amount</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody>
                {billing.invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-t" data-invoice-status={invoice.status}>
                    <td className="py-1">
                      {invoice.hostedInvoiceUrl === null ? (
                        (invoice.number ?? '—')
                      ) : (
                        <a className="underline" href={invoice.hostedInvoiceUrl} rel="noreferrer noopener" target="_blank">
                          {invoice.number ?? 'View'}
                        </a>
                      )}
                    </td>
                    <td className="py-1">{KIND[invoice.kind] ?? invoice.kind}</td>
                    <td className="py-1">{utcDate(invoice.createdAt)}</td>
                    <td className="py-1 font-mono tabular-nums">{formatUsd(parseCents(invoice.amountDueCents))}</td>
                    <td className="py-1">
                      <Badge variant={invoice.status === 'paid' ? 'outline' : invoice.firstFailedAt === null ? 'secondary' : 'destructive'}>{INVOICE_STATUS[invoice.status] ?? invoice.status}</Badge>
                      {invoice.firstFailedAt === null || invoice.status === 'paid' ? null : <span className="ml-2 text-xs">payment failed {utcDate(invoice.firstFailedAt)}</span>}
                    </td>
                    <td className="py-1">{invoice.paidAt === null ? '—' : `${utc(invoice.paidAt)}${invoice.paymentMethodKind === null ? '' : `, ${METHOD[invoice.paymentMethodKind] ?? invoice.paymentMethodKind}`}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {open.length === 0 ? null : (
            <div className="mt-4 flex flex-col gap-2">
              {open.map((invoice) => (
                <ActionForm key={invoice.id} action={payInvoice} submit={`Pay ${invoice.number ?? 'the open invoice'} now (${formatUsd(parseCents(invoice.amountRemainingCents))})`} variant="outline">
                  <FormKeys />
                  <input type="hidden" name="organizationId" value={organizationId} />
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                </ActionForm>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
