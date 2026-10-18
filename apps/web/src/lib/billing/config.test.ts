import { parseCatalog, planCatalog } from '@tp/billing';
import { LocalBillingProvider } from '@tp/billing/local';
import { StripeBillingProvider } from '@tp/billing/stripe';
import { describe, expect, it } from 'vitest';

import { ConfigError } from '../server/config';
import { LOCAL_WEBHOOK_SECRET, defaultBillingDirectory, readBillingConfig } from './config';
import { billingProvider } from './provider';
import { RUN_STARTING_ROUTES } from './runs';
import { ROUTES } from '../routes';

const pool = { connect: () => Promise.reject(new Error('no database in this test')) };
const confirmed = parseCatalog({
  format: 'tp-billing-plans/1',
  currency: 'usd',
  confirmed: true,
  source: 'test',
  plans: { monthly: { lookup_key: 'a', name: 'A', interval: 'month', amount_cents: '100' }, annual: { lookup_key: 'b', name: 'B', interval: 'year', amount_cents: '1000' } },
  audit: { lookup_key: 'c', name: 'C', amount_cents: '500' },
});
const live = { STRIPE_SECRET_KEY: 'sk_live_synthetic0000000000', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic0000000000', STRIPE_PUBLISHABLE_KEY: 'pk_live_synthetic0000000000' };
const test = { STRIPE_SECRET_KEY: 'sk_test_synthetic0000000000', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic0000000000', STRIPE_PUBLISHABLE_KEY: 'pk_test_synthetic0000000000' };

describe('readBillingConfig', () => {
  it('defaults to the local simulator outside production', () => {
    expect(readBillingConfig({})).toEqual({ kind: 'local', directory: defaultBillingDirectory(), webhookSecret: LOCAL_WEBHOOK_SECRET });
    expect(readBillingConfig({ BILLING_LOCAL_DIR: '/tmp/x', BILLING_LOCAL_WEBHOOK_SECRET: 'whsec_e2e_secret_1' })).toEqual({ kind: 'local', directory: '/tmp/x', webhookSecret: 'whsec_e2e_secret_1' });
    expect(readBillingConfig({ BILLING_PROVIDER: 'stripe', ...test })).toEqual({ kind: 'stripe', mode: 'test', secretKey: test.STRIPE_SECRET_KEY, webhookSecret: test.STRIPE_WEBHOOK_SECRET, publishableKey: test.STRIPE_PUBLISHABLE_KEY });
    expect(() => readBillingConfig({ BILLING_PROVIDER: 'stripe', ...test, STRIPE_PUBLISHABLE_KEY: live.STRIPE_PUBLISHABLE_KEY })).toThrow(/different Stripe modes/);
  });

  it('requires Stripe in production, its three keys, the mode the deployment names, and confirmed plan amounts to bill live', () => {
    const LIVE = { NODE_ENV: 'production', BILLING_PROVIDER: 'stripe', BILLING_STRIPE_MODE: 'live' } as const;
    const TEST = { NODE_ENV: 'production', BILLING_PROVIDER: 'stripe', BILLING_STRIPE_MODE: 'test' } as const;
    expect(() => readBillingConfig({ NODE_ENV: 'production' })).toThrow(new ConfigError('BILLING_PROVIDER is required in production'));
    expect(() => readBillingConfig({ NODE_ENV: 'production', BILLING_PROVIDER: 'local' })).toThrow(/refused in production/);
    expect(readBillingConfig({ NODE_ENV: 'production', BILLING_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' })).toMatchObject({ kind: 'local' });
    expect(() => readBillingConfig({ ...LIVE, ...live, STRIPE_WEBHOOK_SECRET: undefined }, confirmed)).toThrow('STRIPE_WEBHOOK_SECRET is required for Stripe');
    expect(() => readBillingConfig({ NODE_ENV: 'production', BILLING_PROVIDER: 'stripe', ...live }, confirmed)).toThrow('BILLING_STRIPE_MODE is required in production');
    // As the repository ships, the amounts are synthetic placeholders: production refuses to bill live at them.
    expect(planCatalog().confirmed).toBe(false);
    expect(() => readBillingConfig({ ...LIVE, ...live })).toThrow(/not confirmed/);
    expect(readBillingConfig({ ...LIVE, ...live }, confirmed)).toMatchObject({ kind: 'stripe', mode: 'live' });
    // The production environment never runs on test keys, and staging never on live ones.
    expect(() => readBillingConfig({ ...LIVE, ...test }, confirmed)).toThrow('BILLING_STRIPE_MODE=live bills with live-mode Stripe keys only');
    expect(() => readBillingConfig({ ...TEST, ...live }, confirmed)).toThrow('BILLING_STRIPE_MODE=test bills with test-mode Stripe keys only');
    // Staging bills in Stripe's test mode at the placeholder amounts.
    expect(readBillingConfig({ ...TEST, ...test })).toMatchObject({ kind: 'stripe', mode: 'test' });
  });

  it('refuses malformed keys without echoing them', () => {
    expect(() => readBillingConfig({ STRIPE_SECRET_KEY: 'not-a-key' })).toThrow(new ConfigError('invalid settings: STRIPE_SECRET_KEY'));
  });

  it('builds the provider the settings name', () => {
    expect(billingProvider({ kind: 'stripe', mode: 'test', secretKey: test.STRIPE_SECRET_KEY, webhookSecret: test.STRIPE_WEBHOOK_SECRET, publishableKey: test.STRIPE_PUBLISHABLE_KEY }, pool)).toBeInstanceOf(StripeBillingProvider);
    expect(billingProvider({ kind: 'local', directory: '/tmp/tp-billing-config-test', webhookSecret: LOCAL_WEBHOOK_SECRET }, pool)).toBeInstanceOf(LocalBillingProvider);
  });
});

describe('the routes that start new work', () => {
  it('are registered practice routes that change records', () => {
    for (const id of RUN_STARTING_ROUTES) {
      const route = ROUTES.find((candidate) => candidate.id === id);
      expect(route, id).toBeDefined();
      expect(route?.access.kind, id).toBe('practice');
      expect(route?.mutation, id).toBe(true);
    }
  });
});
