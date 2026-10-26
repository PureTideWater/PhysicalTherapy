import { readFileSync } from 'node:fs';

import type { SetupIntentResult } from '@stripe/stripe-js';
import type { PaymentMethodSummary } from '@tp/billing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { PaymentMethodCard } from './payment-method-card';
import { SetupNotice, StripePaymentMethod, paymentElementOptions, setupOutcome } from './stripe-payment-method';

/**
 * The payment method on the billing page (test matrix BIL-01 and BIL-03; docs/adr/0073): Stripe's form opens on
 * the bank account, and the page says a bank account (ACH) is preferred for annual plans and audits, with
 * Stripe and with the local simulator. SYNTHETIC values; Stripe.js never loads here.
 */

const loadStripe = vi.hoisted(() => vi.fn());
vi.mock('@stripe/stripe-js/pure', () => ({ loadStripe }));

const action = (state: ActionState): Promise<ActionState> => Promise.resolve(state);
const TOKEN = 'qwertyuiopasdfghjklzxcvbnmqwerty';
const ORGANIZATION = '00000000-0000-4000-8000-0000000000b1';
const PREFERRED = 'A bank account (ACH) is preferred for annual plans and audits.';
const REPLACES = 'Adding one replaces the card on file.';
const BANK: PaymentMethodSummary = { paymentMethodRef: 'pm_synthetic_bank', kind: 'us_bank_account', last4: '6789', label: 'Synthetic Test Bank' };
const CARD: PaymentMethodSummary = { paymentMethodRef: 'pm_synthetic_card', kind: 'card', last4: '4242', label: 'visa' };

function card(provider: 'stripe' | 'local', paymentMethod: PaymentMethodSummary | null): string {
  return renderToStaticMarkup(
    <PaymentMethodCard
      organizationId={ORGANIZATION}
      paymentMethod={paymentMethod}
      provider={provider}
      testRouting="110000000"
      formKeys={<input type="hidden" name="requestKey" value="synthetic-request-key" />}
      csrfToken={TOKEN}
      addSimulatedPaymentMethod={action}
      settleSimulatedPayments={action}
    />,
  );
}

/** The text of the element carrying an attribute, tags dropped. */
function textOf(html: string, attribute: string): string {
  const match = new RegExp(`<(\\w+)[^>]*${attribute}[^>]*>([\\s\\S]*?)</\\1>`).exec(html);
  return (match?.[2] ?? '').replace(/<[^>]+>/g, '');
}

function confirmed(setupIntent: Record<string, unknown>): SetupIntentResult {
  return { setupIntent } as unknown as SetupIntentResult;
}

describe('Stripe’s payment form (BIL-01)', () => {
  it('lists the bank account first and the card second, as tabs with the first open, and turns the wallets and Link off', () => {
    expect(paymentElementOptions()).toEqual({
      paymentMethodOrder: ['us_bank_account', 'card'],
      layout: { type: 'tabs', defaultCollapsed: false },
      wallets: { applePay: 'never', googlePay: 'never', link: 'never' },
    });
    // A fresh array each time, which the Payment Element may keep.
    expect(paymentElementOptions().paymentMethodOrder).not.toBe(paymentElementOptions().paymentMethodOrder);
  });

  it('starts with a button that says whether the method replaces the one on file, and loads nothing from Stripe until it is pressed', () => {
    const none = renderToStaticMarkup(<StripePaymentMethod organizationId={ORGANIZATION} csrfToken={TOKEN} methodOnFile={false} />);
    expect(none).toContain('>Add a bank account (ACH) or card</button>');
    const onFile = renderToStaticMarkup(<StripePaymentMethod organizationId={ORGANIZATION} csrfToken={TOKEN} methodOnFile />);
    expect(onFile).toContain('>Replace it with a bank account (ACH) or card</button>');
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it('reads Stripe’s answer: saved, waiting on a small deposit with Stripe’s page, or Stripe’s refusal', () => {
    expect(setupOutcome(confirmed({ status: 'succeeded' }))).toEqual({ kind: 'saved' });
    expect(setupOutcome(confirmed({ status: 'processing' }))).toEqual({ kind: 'saved' });
    const verifyAt = 'https://payments.stripe.com/microdeposit/sacs_synthetic';
    const waiting = (url: string) => confirmed({ status: 'requires_action', next_action: { type: 'verify_with_microdeposits', verify_with_microdeposits: { arrival_date: 1, hosted_verification_url: url, microdeposit_type: 'descriptor_code' } } });
    expect(setupOutcome(waiting(verifyAt))).toEqual({ kind: 'verification_pending', verificationUrl: verifyAt });
    // Only an https page is linked.
    expect(setupOutcome(waiting('javascript:alert(1)'))).toEqual({ kind: 'verification_pending', verificationUrl: null });
    expect(setupOutcome(waiting('not a url'))).toEqual({ kind: 'verification_pending', verificationUrl: null });
    expect(setupOutcome(confirmed({ status: 'requires_action', next_action: { type: 'redirect_to_url' } }))).toMatchObject({ kind: 'error' });
    expect(setupOutcome(confirmed({ status: 'requires_payment_method', next_action: null }))).toMatchObject({ kind: 'error' });
    expect(setupOutcome({ error: { type: 'card_error', message: 'Your card was declined.' } })).toEqual({ kind: 'error', message: 'Your card was declined.' });
    expect(setupOutcome({ error: { type: 'api_error' } })).toEqual({ kind: 'error', message: 'Stripe could not confirm the payment method.' });
  });

  it('shows the saved notice, or the verification notice with Stripe’s page in a new tab', () => {
    expect(renderToStaticMarkup(<SetupNotice outcome={{ kind: 'saved' }} />)).toContain('data-notice="payment-method-saved"');
    const verifyAt = 'https://payments.stripe.com/microdeposit/sacs_synthetic';
    const pending = renderToStaticMarkup(<SetupNotice outcome={{ kind: 'verification_pending', verificationUrl: verifyAt }} />);
    expect(pending).toContain('data-notice="bank-verification-pending"');
    expect(textOf(pending, 'data-notice="bank-verification-pending"')).toContain(
      'Stripe sends a small deposit to the bank account within two business days. When it arrives, enter its code on Stripe’s verification page to finish. Until then the payment method on file stays in use.',
    );
    expect(pending).toContain(`<a class="underline" href="${verifyAt}" rel="noreferrer noopener" target="_blank">Open Stripe’s verification page</a>`);
    expect(renderToStaticMarkup(<SetupNotice outcome={{ kind: 'verification_pending', verificationUrl: null }} />)).not.toContain('<a ');
  });
});

describe('the Payment method card (BIL-03)', () => {
  it('says the bank account is preferred and leads with it, with Stripe and with the simulator', () => {
    for (const provider of ['stripe', 'local'] as const) {
      const html = card(provider, null);
      expect(textOf(html, 'data-notice="ach-preferred"')).toBe(PREFERRED);
      expect(html).toContain('A bank account (ACH debit) or a card. The account or card number never reaches this application.');
      expect(textOf(html, 'data-payment-method="none"')).toBe('No payment method on file.');
    }
  });

  it('with a card on file, says adding a bank account replaces it, and names the brand as a person reads it', () => {
    const html = card('stripe', CARD);
    expect(textOf(html, 'data-notice="ach-preferred"')).toBe(`${PREFERRED} ${REPLACES}`);
    expect(textOf(html, 'data-payment-method="card"')).toBe('Card ending 4242 (Visa)');
    expect(html).toContain('>Replace it with a bank account (ACH) or card</button>');
    const brands: Readonly<Record<string, string>> = {
      mastercard: 'Mastercard',
      amex: 'American Express',
      discover: 'Discover',
      diners: 'Diners Club',
      jcb: 'JCB',
      unionpay: 'UnionPay',
      cartes_bancaires: 'cartes_bancaires',
    };
    for (const [code, name] of Object.entries(brands)) {
      expect(textOf(card('local', { ...CARD, label: code }), 'data-payment-method="card"')).toBe(`Card ending 4242 (${name})`);
    }
    expect(textOf(card('local', { ...CARD, label: null }), 'data-payment-method="card"')).toBe('Card ending 4242');
  });

  it('with a bank account on file, says only that it is preferred, and shows the bank as Stripe names it', () => {
    const html = card('local', BANK);
    expect(textOf(html, 'data-notice="ach-preferred"')).toBe(PREFERRED);
    expect(html).not.toContain(REPLACES);
    expect(textOf(html, 'data-payment-method="us_bank_account"')).toBe('ACH bank account ending 6789 (Synthetic Test Bank)');
  });

  it('in test mode, lists the simulator’s bank form before its card form, each carrying the page’s form keys', () => {
    const html = card('local', null);
    expect(html).toContain('aria-label="Test mode"');
    const bank = html.indexOf('Add test bank account (ACH)');
    const cardForm = html.indexOf('Add test card');
    expect(bank).toBeGreaterThan(-1);
    expect(cardForm).toBeGreaterThan(bank);
    expect(html.indexOf('Settle pending test ACH payments')).toBeGreaterThan(cardForm);
    expect(html.match(/name="requestKey"/g)).toHaveLength(3);
    expect(html).not.toContain('Add a bank account (ACH) or card');
    // Stripe's form is not offered in test mode, and its button is not offered by the simulator.
    expect(card('stripe', null)).not.toContain('aria-label="Test mode"');
  });

  it('comes before the Plan card on the billing page, since a plan needs a method on file', () => {
    const page = readFileSync(new URL('../../app/settings/billing/[organizationId]/page.tsx', import.meta.url), 'utf8');
    const method = page.indexOf('<PaymentMethodCard');
    expect(method).toBeGreaterThan(-1);
    expect(page.indexOf('<CardTitle>Plan</CardTitle>')).toBeGreaterThan(method);
  });

  it('is the first half of the practice onboarding step, which says the bank account is preferred', () => {
    const settings = readFileSync(new URL('../../app/p/[practiceId]/settings/page.tsx', import.meta.url), 'utf8');
    expect(settings).toContain("billing: { title: 'Add a payment method and choose a plan', detail: 'A bank account (ACH) is preferred; a card also works.' },");
  });
});
