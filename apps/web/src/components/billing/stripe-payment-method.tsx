'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import type { Appearance, SetupIntentResult, Stripe, StripePaymentElementOptions } from '@stripe/stripe-js';
// The pure entry point: Stripe.js loads from Stripe only once an administrator starts adding a method, not on import.
import { loadStripe } from '@stripe/stripe-js/pure';
import { PAYMENT_METHOD_ORDER } from '@tp/billing/types';
import { Alert, AlertDescription, Button } from '@tp/ui';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { PendingStatus } from '../form-issues';

/**
 * The payment method form in production (PRD 6, Billing: "ACH and card"; docs/adr/0050): Stripe Elements,
 * so no bank account or card number ever reaches the product. The server starts a SetupIntent for ACH
 * (us_bank_account) or a card and returns its client secret; Elements confirms it with Stripe in the
 * browser; Stripe's webhook then puts the method on file. Nothing comes back to this server from the form.
 * The form opens on the bank account (docs/adr/0073): the same order the server allows, from
 * `@tp/billing/types`, with the card a tab away, and wears the brand's live tokens (light or dark).
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

/** The brand's tokens as the page resolves them: a token's color (as rgb()), its length (as px), the body's font. */
export interface BrandTokens {
  readonly color: (token: string) => string;
  readonly length: (token: string) => string;
  readonly fontFamily: string;
  /** Whether the dark tokens apply ([data-theme="dark"] or .dark). */
  readonly dark: boolean;
}

/**
 * The Payment Element's appearance (BIL-01): Stripe's night theme under the dark tokens, else its default, with the
 * brand's primary, text, background and danger colors, its medium radius, its focus color and the body's font, so the
 * form is on brand in both themes. Every value comes from the tokens; none is written here.
 */
export function elementsAppearance(tokens: BrandTokens): Appearance {
  return {
    theme: tokens.dark ? 'night' : 'stripe',
    variables: {
      colorPrimary: tokens.color('--pw-primary'),
      colorText: tokens.color('--pw-fg'),
      colorBackground: tokens.color('--pw-bg'),
      colorDanger: tokens.color('--pw-danger'),
      borderRadius: tokens.length('--pw-radius-md'),
      fontFamily: tokens.fontFamily,
      focusBoxShadow: 'none',
      focusOutline: `2px solid ${tokens.color('--pw-focus')}`,
    },
  };
}

/**
 * The appearance from the live tokens: each is resolved on a hidden probe in the page, so a token written as a
 * var() or in any color syntax arrives as the rgb() the computed style gives, which Stripe accepts.
 */
function brandAppearance(): Appearance {
  const probe = document.createElement('span');
  probe.hidden = true;
  document.body.append(probe);
  try {
    const resolve = (property: 'color' | 'border-top-left-radius', token: string) => {
      probe.style.setProperty(property, `var(${token})`);
      return getComputedStyle(probe).getPropertyValue(property).trim();
    };
    return elementsAppearance({
      color: (token) => resolve('color', token),
      length: (token) => resolve('border-top-left-radius', token),
      fontFamily: getComputedStyle(document.body).fontFamily,
      dark: probe.closest('[data-theme="dark"], .dark') !== null,
    });
  } finally {
    probe.remove();
  }
}

/** How Stripe verifies a bank account by micro-deposit: one deposit carrying a code, or two whose amounts are entered. */
export type MicrodepositType = 'descriptor_code' | 'amounts';

/** What the form shows once Stripe answers the confirmation. */
export type SetupOutcome =
  | { readonly kind: 'saved' }
  | { readonly kind: 'verification_pending'; readonly verificationUrl: string; readonly microdepositType: MicrodepositType }
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
 * it; its webhook puts it on file); waiting on micro-deposits when Financial Connections fell back to them, of
 * Stripe's type (a code, the default, or two amounts), with Stripe's own page to finish on (the method on file
 * stays in use until setup_intent.succeeded arrives); an error when that page is missing or not https, since the
 * notice would send the person to a page it cannot link; otherwise Stripe's refusal.
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
    const verificationUrl = httpsUrl(microdeposits.hosted_verification_url);
    if (verificationUrl === null) {
      return { kind: 'error', message: 'Stripe could not start the bank account’s verification. Add the bank account again, or add a card.' };
    }
    return { kind: 'verification_pending', verificationUrl, microdepositType: microdeposits.microdeposit_type === 'amounts' ? 'amounts' : 'descriptor_code' };
  }
  return { kind: 'error', message: 'Stripe could not confirm the payment method. Try again, or use another bank account or card.' };
}

/** What Stripe sends, by its micro-deposit type, and what the person enters on its page. */
const MICRODEPOSITS: Readonly<Record<MicrodepositType, string>> = {
  descriptor_code:
    'Stripe sends one small deposit to the bank account within two business days. When it arrives, enter the 6-digit code in its description on Stripe’s verification page to finish.',
  amounts: 'Stripe sends two small deposits to the bank account within two business days. When they arrive, enter their amounts on Stripe’s verification page to finish.',
};

/**
 * The notice for a confirmed setup, or for one waiting on Stripe's deposits, which replaces the form: a status, not
 * an alert, and focused when it appears, so the keyboard does not fall back to the top of the page (BIL-01).
 */
export function SetupNotice({ outcome, methodOnFile }: { readonly outcome: Exclude<SetupOutcome, { kind: 'error' }>; readonly methodOnFile: boolean }) {
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notice.current?.focus();
  }, []);
  if (outcome.kind === 'saved') {
    return (
      <Alert ref={notice} role="status" tabIndex={-1} data-notice="payment-method-saved">
        <AlertDescription>Stripe confirmed the payment method. It shows here as on file as soon as Stripe reports it; reload the page in a moment.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert ref={notice} role="status" tabIndex={-1} data-notice="bank-verification-pending">
      <AlertDescription>
        {MICRODEPOSITS[outcome.microdepositType]}{' '}
        {methodOnFile ? 'Until then the payment method on file stays in use.' : 'Until then no payment method is on file, so a plan cannot be chosen yet.'}{' '}
        <a className="underline" href={outcome.verificationUrl} rel="noreferrer noopener" target="_blank">
          Open Stripe’s verification page<span className="sr-only"> (opens in a new tab)</span>
        </a>
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

/**
 * A refusal from Stripe or from the server, focused when it appears (as a form's refusal summary is), so the keyboard
 * and a screen reader meet it at once rather than the top of the page.
 */
function Problem({ message }: { readonly message: string | null }) {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (message !== null) {
      alert.current?.focus();
    }
  }, [message]);
  return message === null ? null : (
    <Alert ref={alert} variant="destructive" tabIndex={-1} data-state="error">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

/**
 * Stripe's confirmation of the method. While it runs, the button keeps its words and its focus (aria-disabled, never
 * disabled, which would drop the focus to the page), a status beside it says "Working…", and a ref refuses a second
 * press, even one in the same frame (docs/adr/0077).
 */
function ConfirmForm({ onDone }: { readonly onDone: (outcome: Exclude<SetupOutcome, { kind: 'error' }>) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (stripe === null || elements === null || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const outcome = setupOutcome(await stripe.confirmSetup({ elements, redirect: 'if_required', confirmParams: { return_url: window.location.href } }));
      if (outcome.kind === 'error') {
        setError(outcome.message);
        return;
      }
      onDone(outcome);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  const options = useMemo(() => paymentElementOptions(), []);
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-4" aria-label="Payment method">
      <PaymentElement options={options} />
      <Problem message={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" aria-disabled={pending || stripe === null || undefined}>
          Save payment method
        </Button>
        <PendingStatus pending={pending} />
      </div>
    </form>
  );
}

/** The button that starts Stripe's form: it says the method replaces the one on file when there is one (BIL-01). */
function startLabel(methodOnFile: boolean): string {
  return methodOnFile ? 'Replace with a bank account (ACH) or card' : 'Add a bank account (ACH) or card';
}

export function StripePaymentMethod({ organizationId, csrfToken, methodOnFile }: { readonly organizationId: string; readonly csrfToken: string; readonly methodOnFile: boolean }) {
  const [setup, setSetup] = useState<{ clientSecret: string; stripe: Promise<Stripe | null>; appearance: Appearance } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Exclude<SetupOutcome, { kind: 'error' }> | null>(null);
  const [starting, setStarting] = useState(false);
  const inFlight = useRef(false);
  const options = useMemo(() => (setup === null ? undefined : { clientSecret: setup.clientSecret, appearance: setup.appearance }), [setup]);
  if (done !== null) {
    return <SetupNotice outcome={done} methodOnFile={methodOnFile} />;
  }
  if (setup === null || options === undefined) {
    return (
      <div className="flex flex-col gap-2">
        <Problem message={error} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            aria-disabled={starting || undefined}
            onClick={() => {
              // One SetupIntent per press: a second press while the first is starting sends nothing.
              if (inFlight.current) {
                return;
              }
              inFlight.current = true;
              setStarting(true);
              setError(null);
              startSetup(organizationId, csrfToken)
                .then((started) => setSetup({ clientSecret: started.clientSecret, stripe: loadStripe(started.publishableKey), appearance: brandAppearance() }))
                .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'The payment method form could not start.'))
                .finally(() => {
                  inFlight.current = false;
                  setStarting(false);
                });
            }}
          >
            {startLabel(methodOnFile)}
          </Button>
          <PendingStatus pending={starting} />
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
