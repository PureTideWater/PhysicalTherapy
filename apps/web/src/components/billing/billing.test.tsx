import { readFileSync } from 'node:fs';

import type { SetupIntentResult } from '@stripe/stripe-js';
import type { PaymentMethodSummary } from '@tp/billing';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ActionState } from '../../lib/http/next';
import { PAYMENT_METHOD_NAME, PaymentMethodCard } from './payment-method-card';
import { type BrandTokens, SetupNotice, StripePaymentMethod, elementsAppearance, paymentElementOptions, setupOutcome } from './stripe-payment-method';

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
const REPLACES = 'A new payment method replaces the one on file.';
const NEW_TAB = '<span class="sr-only"> (opens in a new tab)</span>';
const BANK: PaymentMethodSummary = { paymentMethodRef: 'pm_synthetic_bank', kind: 'us_bank_account', last4: '6789', label: 'Synthetic Test Bank' };
const CARD: PaymentMethodSummary = { paymentMethodRef: 'pm_synthetic_card', kind: 'card', last4: '4242', label: 'visa' };

/** The card's markup; each call of formKeys makes a request key of its own, as the page's FormKeys does. */
function card(provider: 'stripe' | 'local', paymentMethod: PaymentMethodSummary | null): string {
  let made = 0;
  return renderToStaticMarkup(
    <PaymentMethodCard
      organizationId={ORGANIZATION}
      paymentMethod={paymentMethod}
      provider={provider}
      testRouting="110000000"
      formKeys={() => {
        made += 1;
        return <input type="hidden" name="requestKey" value={`synthetic-request-key-${String(made)}`} />;
      }}
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

  it('wears the brand’s live tokens: each color and the radius as the page resolves them, the body’s font, night under the dark tokens', () => {
    const tokens = (dark: boolean): BrandTokens => ({
      color: (token) => `rgb(resolved ${token})`,
      length: (token) => `px(resolved ${token})`,
      fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
      dark,
    });
    expect(elementsAppearance(tokens(false))).toEqual({
      theme: 'stripe',
      variables: {
        colorPrimary: 'rgb(resolved --pw-primary)',
        colorText: 'rgb(resolved --pw-fg)',
        colorBackground: 'rgb(resolved --pw-bg)',
        colorDanger: 'rgb(resolved --pw-danger)',
        borderRadius: 'px(resolved --pw-radius-md)',
        fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
        focusBoxShadow: 'none',
        focusOutline: '2px solid rgb(resolved --pw-focus)',
      },
    });
    expect(elementsAppearance(tokens(true)).theme).toBe('night');
    // No color is written in the component: every one comes from a token.
    const source = readFileSync(new URL('./stripe-payment-method.tsx', import.meta.url), 'utf8');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|(?:rgba?|hsla?|oklch)\(\s*\d/i);
  });

  it('starts with a button that says whether the method replaces the one on file, and loads nothing from Stripe until it is pressed', () => {
    const none = renderToStaticMarkup(<StripePaymentMethod organizationId={ORGANIZATION} csrfToken={TOKEN} methodOnFile={false} />);
    expect(none).toContain('>Add a bank account (ACH) or card</button>');
    const onFile = renderToStaticMarkup(<StripePaymentMethod organizationId={ORGANIZATION} csrfToken={TOKEN} methodOnFile />);
    expect(onFile).toContain('>Replace with a bank account (ACH) or card</button>');
    expect(loadStripe).not.toHaveBeenCalled();
  });

  it('reads Stripe’s answer: saved, waiting on micro-deposits of Stripe’s type with Stripe’s page, or Stripe’s refusal', () => {
    expect(setupOutcome(confirmed({ status: 'succeeded' }))).toEqual({ kind: 'saved' });
    expect(setupOutcome(confirmed({ status: 'processing' }))).toEqual({ kind: 'saved' });
    const verifyAt = 'https://payments.stripe.com/microdeposit/sacs_synthetic';
    const waiting = (url: string | undefined, type: string | null = 'descriptor_code') =>
      confirmed({ status: 'requires_action', next_action: { type: 'verify_with_microdeposits', verify_with_microdeposits: { arrival_date: 1, hosted_verification_url: url, microdeposit_type: type } } });
    expect(setupOutcome(waiting(verifyAt))).toEqual({ kind: 'verification_pending', verificationUrl: verifyAt, microdepositType: 'descriptor_code' });
    expect(setupOutcome(waiting(verifyAt, 'amounts'))).toEqual({ kind: 'verification_pending', verificationUrl: verifyAt, microdepositType: 'amounts' });
    // A code is Stripe's default when it names no type.
    expect(setupOutcome(waiting(verifyAt, null))).toEqual({ kind: 'verification_pending', verificationUrl: verifyAt, microdepositType: 'descriptor_code' });
    // Only an https page is linked; without one the person could not finish, so it is an error, not a notice.
    const unverifiable = { kind: 'error', message: 'Stripe could not start the bank account’s verification. Add the bank account again, or add a card.' };
    expect(setupOutcome(waiting('javascript:alert(1)'))).toEqual(unverifiable);
    expect(setupOutcome(waiting('http://payments.stripe.com/microdeposit/sacs_synthetic'))).toEqual(unverifiable);
    expect(setupOutcome(waiting('not a url'))).toEqual(unverifiable);
    expect(setupOutcome(waiting(undefined))).toEqual(unverifiable);
    expect(setupOutcome(confirmed({ status: 'requires_action', next_action: { type: 'redirect_to_url' } }))).toMatchObject({ kind: 'error' });
    expect(setupOutcome(confirmed({ status: 'requires_payment_method', next_action: null }))).toMatchObject({ kind: 'error' });
    expect(setupOutcome({ error: { type: 'card_error', message: 'Your card was declined.' } })).toEqual({ kind: 'error', message: 'Your card was declined.' });
    expect(setupOutcome({ error: { type: 'api_error' } })).toEqual({ kind: 'error', message: 'Stripe could not confirm the payment method.' });
  });

  it('shows the saved notice, or the verification notice for Stripe’s type with its page in a new tab, each as a status that takes focus', () => {
    const saved = renderToStaticMarkup(<SetupNotice outcome={{ kind: 'saved' }} methodOnFile={false} />);
    expect(saved).toContain('data-notice="payment-method-saved"');
    const verifyAt = 'https://payments.stripe.com/microdeposit/sacs_synthetic';
    const notice = (microdepositType: 'descriptor_code' | 'amounts', methodOnFile: boolean) =>
      renderToStaticMarkup(<SetupNotice outcome={{ kind: 'verification_pending', verificationUrl: verifyAt, microdepositType }} methodOnFile={methodOnFile} />);
    const code = notice('descriptor_code', true);
    expect(textOf(code, 'data-notice="bank-verification-pending"')).toBe(
      'Stripe sends one small deposit to the bank account within two business days. When it arrives, enter the 6-digit code in its description on Stripe’s verification page to finish. Until then the payment method on file stays in use. Open Stripe’s verification page (opens in a new tab)',
    );
    expect(textOf(notice('amounts', false), 'data-notice="bank-verification-pending"')).toBe(
      'Stripe sends two small deposits to the bank account within two business days. When they arrive, enter their amounts on Stripe’s verification page to finish. Until then no payment method is on file, so a plan cannot be chosen yet. Open Stripe’s verification page (opens in a new tab)',
    );
    expect(code).toContain(`<a class="underline" href="${verifyAt}" rel="noreferrer noopener" target="_blank">Open Stripe’s verification page${NEW_TAB}</a>`);
    // A status, not an alert, which the keyboard lands on when it replaces the form.
    for (const html of [saved, code]) {
      expect(html).toContain('role="status"');
      expect(html).toContain('tabindex="-1"');
      expect(html).not.toContain('role="alert"');
    }
  });
});

describe('the Payment method card (BIL-03)', () => {
  it('with nothing on file, says the bank account is preferred and leads with it, with Stripe and with the simulator', () => {
    for (const provider of ['stripe', 'local'] as const) {
      const html = card(provider, null);
      expect(textOf(html, 'data-notice="ach-preferred"')).toBe(PREFERRED);
      expect(html).not.toContain(REPLACES);
      expect(html).toContain('A bank account (ACH) or a card. The account or card number never reaches this application.');
      expect(html).toContain('<p class="font-medium" data-payment-method="none">No payment method on file.</p>');
    }
  });

  it('with a card on file, says the bank account is preferred and that a new method replaces the card, and names the brand as a person reads it', () => {
    const html = card('stripe', CARD);
    expect(textOf(html, 'data-notice="ach-preferred"')).toBe(PREFERRED);
    expect(textOf(html, 'data-notice="replaces"')).toBe(REPLACES);
    expect(html).toContain('<p class="font-medium" data-payment-method="card">On file: Visa card ending in 4242</p>');
    expect(html).toContain('>Replace with a bank account (ACH) or card</button>');
    const brands: Readonly<Record<string, string>> = {
      mastercard: 'Mastercard card',
      amex: 'American Express card',
      discover: 'Discover card',
      diners: 'Diners Club card',
      jcb: 'JCB card',
      unionpay: 'UnionPay card',
      eftpos_au: 'eftpos Australia card',
      // A code not listed reads as its label; Stripe's 'unknown' names no brand.
      cartes_bancaires: 'Cartes bancaires card',
      unknown: 'card',
    };
    for (const [code, name] of Object.entries(brands)) {
      expect(textOf(card('local', { ...CARD, label: code }), 'data-payment-method="card"')).toBe(`On file: ${name} ending in 4242`);
    }
    expect(textOf(card('local', { ...CARD, label: null }), 'data-payment-method="card"')).toBe('On file: card ending in 4242');
  });

  it('with a bank account on file, says only that a new method replaces it, and shows the bank as Stripe names it', () => {
    const html = card('local', BANK);
    expect(textOf(html, 'data-notice="replaces"')).toBe(REPLACES);
    expect(html).not.toContain(PREFERRED);
    expect(html).not.toContain('data-notice="ach-preferred"');
    expect(textOf(html, 'data-payment-method="us_bank_account"')).toBe('On file: bank account (ACH) ending in 6789, Synthetic Test Bank');
  });

  it('names each kind of method with the one term, shared with the invoices’ Paid column', () => {
    expect(PAYMENT_METHOD_NAME).toEqual({ us_bank_account: 'Bank account (ACH)', card: 'Card' });
    const page = readFileSync(new URL('../../app/settings/billing/[organizationId]/page.tsx', import.meta.url), 'utf8');
    expect(page).toContain('PAYMENT_METHOD_NAME[invoice.paymentMethodKind]');
    expect(page).not.toContain('ACH bank account');
    // The invoice link says it opens a new tab, as the verification link does.
    expect(page).toContain('<span className="sr-only"> (opens in a new tab)</span>');
  });

  it('in test mode, lists the simulator’s bank form before its card form, each carrying a request key of its own', () => {
    const html = card('local', null);
    expect(html).toContain('role="group" aria-label="Test mode"');
    const bank = html.indexOf('Add test bank account (ACH)');
    const cardForm = html.indexOf('Add test card');
    expect(bank).toBeGreaterThan(-1);
    expect(cardForm).toBeGreaterThan(bank);
    expect(html.indexOf('Settle pending test ACH payments')).toBeGreaterThan(cardForm);
    const keys = [...html.matchAll(/name="requestKey" value="([^"]*)"/g)].map((match) => match[1]);
    expect(keys).toHaveLength(3);
    // Pairwise distinct: one element shared by three forms would render once and give all three the same key.
    expect(new Set(keys).size).toBe(3);
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

  it('with nothing on file and no plan, shows the plans’ prices and asks for a method first instead of offering the plan form', () => {
    const page = readFileSync(new URL('../../app/settings/billing/[organizationId]/page.tsx', import.meta.url), 'utf8');
    const waiting = page.indexOf('data-plan="needs-method"');
    expect(waiting).toBeGreaterThan(-1);
    expect(page).toContain('billing.subscription === null && paymentMethod === null ? (');
    expect(page).toContain('<p>Add a payment method above, then choose a plan here.</p>');
    // The prices in the mono face with tabular numerals (Money), before the form that the sentence stands in for.
    expect(page.slice(waiting, page.indexOf('submit="Choose plan"'))).toMatch(/<Money value=\{catalog\.plans\.monthly\.amountCents\} \/>[\s\S]*<Money value=\{catalog\.plans\.annual\.amountCents\} \/>/);
  });

  it('is the first half of the practice onboarding step, which says the bank account is preferred', () => {
    const settings = readFileSync(new URL('../../app/p/[practiceId]/settings/page.tsx', import.meta.url), 'utf8');
    expect(settings).toContain("billing: { title: 'Add a payment method and choose a plan', detail: 'A bank account (ACH) is preferred; a card also works.' },");
  });
});
