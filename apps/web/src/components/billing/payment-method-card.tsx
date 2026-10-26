import type { PaymentMethodSummary } from '@tp/billing';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import type { ReactNode } from 'react';

import { labelOf } from '../../lib/copy/words';
import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';
import { Field } from '../field';
import { StripePaymentMethod } from './stripe-payment-method';

/**
 * The organization's payment method (PRD 6, Billing: "ACH and card"; docs/adr/0050, 0073), as its billing page
 * shows it before the plan, since a plan needs a method on file: what is on file, the line that says a bank
 * account (ACH) is preferred for annual plans and audits (unless one is on file), that a new method replaces the
 * one on file (since a confirmed method becomes the customer's default), and the form that adds one: Stripe
 * Elements in production, opening on the bank account, or the local simulator's test values in development, its
 * bank form first. A plain component: the page passes a factory of its FormKeys, called once per form so each
 * form has its own request key, and the CSRF token rendered on the server.
 */

/** A payment method's kind, as a person reads it: the one term for each, here and in the invoices' Paid column. */
export const PAYMENT_METHOD_NAME: Readonly<Record<string, string>> = { us_bank_account: 'Bank account (ACH)', card: 'Card' };

const PREFERRED = 'A bank account (ACH) is preferred for annual plans and audits.';

/** Stripe's card brand codes, as a person reads them; a code not listed reads as its label (words.ts), and 'unknown' shows no brand. */
const CARD_BRAND: Readonly<Record<string, string>> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  diners: 'Diners Club',
  jcb: 'JCB',
  unionpay: 'UnionPay',
  eftpos_au: 'eftpos Australia',
};

/** "On file: Visa card ending in 4242", or "On file: bank account (ACH) ending in 6789 (its bank's name)". */
function onFile(method: PaymentMethodSummary): string {
  const name = PAYMENT_METHOD_NAME[method.kind] ?? method.kind;
  const lower = `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  if (method.kind === 'card') {
    const brand = method.label === null || method.label === 'unknown' ? null : (CARD_BRAND[method.label] ?? labelOf(method.label));
    return `On file: ${brand === null ? lower : `${brand} ${lower}`} ending in ${method.last4}`;
  }
  return `On file: ${lower} ending in ${method.last4}${method.label === null ? '' : ` (${method.label})`}`;
}

export function PaymentMethodCard({
  organizationId,
  paymentMethod,
  provider,
  testRouting,
  formKeys,
  csrfToken,
  addSimulatedPaymentMethod,
  settleSimulatedPayments,
}: {
  readonly organizationId: string;
  /** The customer's default payment method at the provider, or null. */
  readonly paymentMethod: PaymentMethodSummary | null;
  readonly provider: 'stripe' | 'local';
  /** The simulator's test routing number (shown in development only). */
  readonly testRouting: string;
  /**
   * Makes the page's FormKeys (the request key and the CSRF token), rendered on the server: called once for each
   * simulator form, so each carries its own request key (docs/adr/0017), never one element shared by three.
   */
  readonly formKeys: () => ReactNode;
  /** The session's CSRF token, which Stripe's form sends when it starts a SetupIntent. */
  readonly csrfToken: string;
  readonly addSimulatedPaymentMethod: (state: ActionState, form: FormData) => Promise<ActionState>;
  readonly settleSimulatedPayments: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment method</CardTitle>
        <CardDescription>A bank account (ACH) or a card. The account or card number never reaches this application.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="font-medium" data-payment-method={paymentMethod?.kind ?? 'none'}>
          {paymentMethod === null ? 'No payment method on file.' : onFile(paymentMethod)}
        </p>
        <div className="flex flex-col gap-1">
          {paymentMethod?.kind === 'us_bank_account' ? null : <p data-notice="ach-preferred">{PREFERRED}</p>}
          {paymentMethod === null ? null : <p data-notice="replaces">A new payment method replaces the one on file.</p>}
        </div>
        {provider === 'stripe' ? (
          <StripePaymentMethod organizationId={organizationId} csrfToken={csrfToken} methodOnFile={paymentMethod !== null} />
        ) : (
          <div className="flex flex-col gap-4" role="group" aria-label="Test mode">
            <p className="text-xs text-muted-foreground">
              Test mode: the local billing simulator stands in for Stripe. It accepts only its own test values: routing number {testRouting}, account 000123456789 (settles) or
              000222222227 (fails, insufficient funds); card 4242424242424242 (succeeds) or 4000000000000341 (declined).
            </p>
            <ActionForm action={addSimulatedPaymentMethod} submit="Add test bank account (ACH)" className="grid max-w-md gap-3">
              {formKeys()}
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="method" value="us_bank_account" />
              <Field label="Routing number" name="routingNumber" id="field-routing" inputMode="numeric" defaultValue={testRouting} required />
              <Field label="Account number" name="accountNumber" id="field-account" inputMode="numeric" defaultValue="000123456789" required />
            </ActionForm>
            <ActionForm action={addSimulatedPaymentMethod} submit="Add test card" className="grid max-w-md gap-3">
              {formKeys()}
              <input type="hidden" name="organizationId" value={organizationId} />
              <input type="hidden" name="method" value="card" />
              <Field label="Card number" name="cardNumber" id="field-card" inputMode="numeric" defaultValue="4242424242424242" required />
            </ActionForm>
            <ActionForm action={settleSimulatedPayments} submit="Settle pending test ACH payments" variant="outline">
              {formKeys()}
              <input type="hidden" name="organizationId" value={organizationId} />
            </ActionForm>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
