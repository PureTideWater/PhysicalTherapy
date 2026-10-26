'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { SetupIntentResult, Stripe, StripePaymentElementOptions } from '@stripe/stripe-js';
// The pure entry point: Stripe.js loads from Stripe only once an administrator starts adding a method, not on import.
import { loadStripe } from '@stripe/stripe-js/pure';
import { PAYMENT_METHOD_ORDER } from '@tp/billing/types';
import { Alert, AlertDescription, Button } from '@tp/ui';
import { type FormEvent, useMemo, useState } from 'react';

/**
 * The payment method form in production (PRD 6, Billing: "ACH and card"; docs/adr/0050): Stripe Elements,
 * so no bank account or card number ever reaches the product. The server starts a SetupIntent for ACH
 * (us_bank_account) or a card and returns its client secret; Elements confirms it with Stripe in the
 * browser; Stripe's webhook then puts the method on file. Nothing comes back to this server from the form.
 * The form opens on the bank account (docs/adr/0073): the same order the server allows, from
 * `@tp/billing/types`, with the card a tab away.
 */

/**
 * The Payment Element's options (test matrix BIL-01; docs/adr/0073): the bank account first, then the card, from
 * the order the server allows, as tabs with the first open and selected; Apple Pay and Google Pay off, since they
 * would add card-funded tabs that Stripe's dynamic ordering may put ahead of the bank account, and Link off as
 * well (the server already leaves it out of the allowed methods). A card is still taken through the card tab.
 */
export function paymentElementOptions(): StripePaymentElementOptions {
  return {
    paymentMethodOrder: [...PAYMENT_METHOD_ORDER],
    layout: { type: 'tabs', defaultCollapsed: false },
    wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
  };
}

/** What the form shows once Stripe answers the confirmation. */
export type SetupOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'verification_pending'; readonly verificationUrl: string | null }
  | { readonly kind: 'error'; readonly message: string };

/** Stripe's hosted verification page, only as an https link. */
function httpsUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/**
 * The notice for confirmSetup's answer (BIL-01): saved once Stripe has confirmed the method (or is processing
 * it; its webhook puts it on file); waiting on a small deposit when Financial Connections fell back to
 * micro-deposit verification, with Stripe's own page to enter its code (the method on file stays in use until
 * setup_intent.succeeded arrives); otherwise Stripe's refusal.
 */
export function setupOutcome(result: SetupIntentResult): SetupOutcome {
  if (result.error !== undefined) {
    return { kind: 'error', message: result.error.message ?? 'Stripe could not confirm the payment method.' };
  }
  const intent = result.setupIntent;
  if (intent.status === 'succeeded' || intent.status === 'processing') {
    return { kind: 'saved' };
  }
  const microdeposits = intent.next_action?.verify_with_microdeposits;
  if (intent.status === 'requires_action' && microdeposits !== undefined) {
    return { kind: 'verification_pending', verificationUrl: httpsUrl(microdeposits.hosted_verification_url) };
  }
  return { kind: 'error', message: 'Stripe could not confirm the payment method. Try again, or use another bank account or card.' };
}

/** The notice for a confirmed setup, or for one waiting on Stripe's deposit. */
export function SetupNotice({ outcome }: { readonly outcome: Exclude<SetupOutcome, { kind: 'error' }> }) {
  if (outcome.kind === 'saved') {
    return (
      <Alert data-notice="payment-method-saved">
        <AlertDescription>Stripe confirmed the payment method. It shows here as on file as soon as Stripe reports it; reload the page in a moment.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert data-notice="bank-verification-pending">
      <AlertDescription>
        Stripe sends a small deposit to the bank account within two business days. When it arrives, enter its code on Stripe’s verification page to finish. Until then the payment method on file
        stays in use.
        {outcome.verificationUrl === null ? null : (
          <>
            {' '}
            <a className="underline" href={outcome.verificationUrl} rel="noreferrer noopener" target="_blank">
              Open Stripe’s verification page
            </a>
          </>
        )}
      </AlertDescription>
    </Alert>
  );
}

interface SetupIntentAnswer {
  readonly clientSecret?: string;
  readonly publishableKey?: string | null;
  readonly issues?: readonly { readonly message: string }[];
}

async function startSetup(organizationId: string, csrfToken: string): Promise<{ clientSecret: string; publishableKey: string }> {
  const response = await fetch(`/api/billing/${organizationId}/setup-intent`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestKey: crypto.randomUUID(), csrfToken }),
  });
  const answer = (await response.json()) as SetupIntentAnswer;
  if (!response.ok || answer.clientSecret === undefined || answer.publishableKey === undefined || answer.publishableKey === null) {
    throw new Error(answer.issues?.[0]?.message ?? 'The payment method form could not start. Reload the page and try again.');
  }
  return { clientSecret: answer.clientSecret, publishableKey: answer.publishableKey };
}

function ConfirmForm({ onDone }: { readonly onDone: (outcome: Exclude<SetupOutcome, { kind: 'error' }>) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (stripe === null || elements === null) {
      return;
    }
    setPending(true);
    setError(null);
    const outcome = setupOutcome(await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } }));
    setPending(false);
    if (outcome.kind === 'error') {
      setError(outcome.message);
      return;
    }
    onDone(outcome);
  };
  const options = useMemo(() => paymentElementOptions(), []);
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" aria-label="Payment method">
      <PaymentElement options={options} />
      {error === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pending || stripe === null}>
          {pending ? 'Working…' : 'Save payment method'}
        </Button>
      </div>
    </form>
  );
}

/** The button that starts Stripe's form: it says the method replaces the one on file when there is one (BIL-01). */
function startLabel(methodOnFile: boolean): string {
  return methodOnFile ? 'Replace it with a bank account (ACH) or card' : 'Add a bank account (ACH) or card';
}

export function StripePaymentMethod({ organizationId, csrfToken, methodOnFile }: { readonly organizationId: string; readonly csrfToken: string; readonly methodOnFile: boolean }) {
  const [setup, setSetup] = useState<{ clientSecret: string; stripe: Promise<Stripe | null> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Exclude<SetupOutcome, { kind: 'error' }> | null>(null);
  const options = useMemo(() => (setup === null ? undefined : { clientSecret: setup.clientSecret }), [setup]);
  if (done !== null) {
    return <SetupNotice outcome={done} />;
  }
  if (setup === null || options === undefined) {
    return (
      <div className="flex flex-col gap-2">
        {error === null ? null : (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            type="button"
            onClick={() => {
              setError(null);
              startSetup(organizationId, csrfToken)
                .then((started) => setSetup({ clientSecret: started.clientSecret, stripe: loadStripe(started.publishableKey) }))
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The payment method form could not start.'));
            }}
          >
            {startLabel(methodOnFile)}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Elements stripe={setup.stripe} options={options}>
      <ConfirmForm onDone={setDone} />
    </Elements>
  );
}
