import { tmpdir } from 'node:os';
import path from 'node:path';

import { type PlanCatalog, planCatalog, requireConfirmedCatalog } from '@tp/billing';
import { z } from 'zod';

import { ConfigError } from '../server/config';

/**
 * Billing's settings (docs/adr/0050). A production build bills through Stripe only (BILLING_PROVIDER=stripe with
 * STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and STRIPE_PUBLISHABLE_KEY) in the mode the deployment names
 * (BILLING_STRIPE_MODE: live in the production environment, test in dev and staging), with keys of that mode,
 * and in live mode only at plan amounts a person has confirmed in packages/billing/config/plans.json; the
 * local Stripe test-mode simulator is refused there except in the e2e suite (TP_ALLOW_LOCAL_PROVIDERS=e2e),
 * as the other local providers are. Elsewhere the simulator is the default: its state in BILLING_LOCAL_DIR,
 * its events signed with BILLING_LOCAL_WEBHOOK_SECRET (a fixed development value otherwise).
 */

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  TP_ALLOW_LOCAL_PROVIDERS: z.literal('e2e').optional(),
  BILLING_PROVIDER: z.enum(['stripe', 'local']).optional(),
  BILLING_STRIPE_MODE: z.enum(['live', 'test']).optional(),
  STRIPE_SECRET_KEY: z.string().regex(/^(sk|rk)_(live|test)_[A-Za-z0-9]{8,255}$/).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9]{8,255}$/).optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().regex(/^pk_(live|test)_[A-Za-z0-9]{8,255}$/).optional(),
  BILLING_LOCAL_DIR: z.string().min(1).optional(),
  BILLING_LOCAL_WEBHOOK_SECRET: z.string().regex(/^whsec_[A-Za-z0-9_]{8,255}$/).optional(),
});

/** Development and tests only: the simulator's signing secret when none is set. */
export const LOCAL_WEBHOOK_SECRET = 'whsec_local_simulator_development_only';

export type BillingSettings =
  | { readonly kind: 'stripe'; readonly mode: 'live' | 'test'; readonly secretKey: string; readonly webhookSecret: string; readonly publishableKey: string }
  | { readonly kind: 'local'; readonly directory: string; readonly webhookSecret: string };

/** Development only: where the simulator keeps its state, shared by the web app's processes and the e2e suite. */
export function defaultBillingDirectory(): string {
  return path.join(tmpdir(), 'tp-billing-simulator');
}

export function readBillingConfig(env: Readonly<Record<string, string | undefined>> = process.env, catalog: PlanCatalog = planCatalog()): BillingSettings {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new ConfigError(`invalid settings: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  const settings = parsed.data;
  const production = settings.NODE_ENV === 'production';
  const kind = settings.BILLING_PROVIDER ?? (production ? undefined : 'local');
  if (kind === undefined) {
    throw new ConfigError('BILLING_PROVIDER is required in production');
  }
  if (kind === 'local') {
    if (production && settings.TP_ALLOW_LOCAL_PROVIDERS !== 'e2e') {
      throw new ConfigError('BILLING_PROVIDER=local is refused in production (Stripe only, outside the e2e suite)');
    }
    return { kind, directory: settings.BILLING_LOCAL_DIR ?? defaultBillingDirectory(), webhookSecret: settings.BILLING_LOCAL_WEBHOOK_SECRET ?? LOCAL_WEBHOOK_SECRET };
  }
  const needed = (value: string | undefined, name: string): string => {
    if (value === undefined) {
      throw new ConfigError(`${name} is required for Stripe`);
    }
    return value;
  };
  const secretKey = needed(settings.STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY');
  const webhookSecret = needed(settings.STRIPE_WEBHOOK_SECRET, 'STRIPE_WEBHOOK_SECRET');
  const publishableKey = needed(settings.STRIPE_PUBLISHABLE_KEY, 'STRIPE_PUBLISHABLE_KEY');
  const secretMode = secretKey.includes('_live_') ? 'live' : 'test';
  if (!publishableKey.startsWith(`pk_${secretMode}_`)) {
    throw new ConfigError('STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY are from different Stripe modes');
  }
  if (production) {
    const mode = settings.BILLING_STRIPE_MODE;
    if (mode === undefined) {
      throw new ConfigError('BILLING_STRIPE_MODE is required in production');
    }
    if (mode !== secretMode) {
      throw new ConfigError(`BILLING_STRIPE_MODE=${mode} bills with ${mode}-mode Stripe keys only`);
    }
    if (mode === 'live') {
      try {
        requireConfirmedCatalog(catalog);
      } catch (error) {
        throw new ConfigError((error as Error).message);
      }
    }
  }
  return { kind, mode: secretMode, secretKey, webhookSecret, publishableKey };
}
