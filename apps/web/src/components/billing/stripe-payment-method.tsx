'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Stripe } from '@stripe/stripe-js';
// The pure entry point: Stripe.js loads from Stripe only once an administrator starts adding a method, not on import.
import { loadStripe } from '@stripe/stripe-js/pure';
import { Alert, AlertDescription, Button } from '@tp/ui';
import { type FormEvent, useMemo, useState } from 'react';

/**
 * The payment method form in production (PRD 6, Billing: "ACH and card"; docs/adr/0050): Stripe Elements,
 * so no bank account or card number ever reaches the product. The server starts a SetupIntent for ACH
 * (us_bank_account) or a card and returns its client secret; Elements confirms it with Stripe in the
 * browser; Stripe's webhook then puts the method on file. Nothing comes back to this server from the form.
 */

interface SetupIntentAnswer {
  readonly clientSecret?: string;
  readonly publishableKey?: string | null;
  readonly issues?: readonly { readonly message: string }[];
}

async function startSetup(organizationId: string): Promise<{ clientSecret: string; publishableKey: string }> {
  const response = await fetch(`/api/billing/${organizationId}/setup-intent`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestKey: crypto.randomUUID() }),
  });
  const answer = (await response.json()) as SetupIntentAnswer;
  if (!response.ok || answer.clientSecret === undefined || answer.publishableKey === undefined || answer.publishableKey === null) {
    throw new Error(answer.issues?.[0]?.message ?? 'The payment method form could not start. Reload the page and try again.');
  }
  return { clientSecret: answer.clientSecret, publishableKey: answer.publishableKey };
}

function ConfirmForm({ onDone }: { readonly onDone: () => void }) {
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
    const result = await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } });
    setPending(false);
    if (result.error !== undefined) {
      setError(result.error.message ?? 'Stripe could not confirm the payment method.');
      return;
    }
    onDone();
  };
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" aria-label="Payment method">
      <PaymentElement options={{ layout: 'tabs' }} />
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

export function StripePaymentMethod({ organizationId }: { readonly organizationId: string }) {
  const [setup, setSetup] = useState<{ clientSecret: string; stripe: Promise<Stripe | null> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const options = useMemo(() => (setup === null ? undefined : { clientSecret: setup.clientSecret }), [setup]);
  if (done) {
    return (
      <Alert data-notice="payment-method-saved">
        <AlertDescription>Stripe confirmed the payment method. It shows here as on file as soon as Stripe reports it; reload the page in a moment.</AlertDescription>
      </Alert>
    );
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
              startSetup(organizationId)
                .then((started) => setSetup({ clientSecret: started.clientSecret, stripe: loadStripe(started.publishableKey) }))
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The payment method form could not start.'));
            }}
          >
            Add a bank account (ACH) or card
          </Button>
        </div>
      </div>
    );
  }
  return (
    <Elements stripe={setup.stripe} options={options}>
      <ConfirmForm onDone={() => setDone(true)} />
    </Elements>
  );
}
