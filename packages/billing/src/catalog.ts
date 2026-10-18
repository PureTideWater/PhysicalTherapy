import { type Cents, parseCents } from '@tp/money';
import { z } from 'zod';

import catalogFile from '../config/plans.json' with { type: 'json' };
import type { PlanInterval } from './types';

/**
 * The plan catalog (PRD 4, Monitoring v1: "annual and monthly plans"; PRD 5, J18: "subscriptions and audit
 * invoices"): config/plans.json, the one place amounts live. Each plan and the audit has a Stripe lookup key,
 * so the Stripe implementation finds or creates its product and price by key (once; idempotent), and the
 * local simulator prices from the same file. The amounts the repository ships are synthetic placeholders,
 * unconfirmed: production refuses Stripe until a person confirms the amounts the company sells at, as the
 * model gateway does its prices (docs/adr/0048, 0050).
 */

const centsText = z.string().regex(/^[1-9][0-9]{0,11}$/, 'whole cents, as text');
const lookupKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);
const name = z.string().min(1).max(100);

const CATALOG = z.strictObject({
  format: z.literal('tp-billing-plans/1'),
  currency: z.literal('usd'),
  confirmed: z.boolean(),
  source: z.string().min(1),
  plans: z.strictObject({
    monthly: z.strictObject({ lookup_key: lookupKey, name, interval: z.literal('month'), amount_cents: centsText }),
    annual: z.strictObject({ lookup_key: lookupKey, name, interval: z.literal('year'), amount_cents: centsText }),
  }),
  audit: z.strictObject({ lookup_key: lookupKey, name, amount_cents: centsText }),
});

export interface CatalogPrice {
  readonly lookupKey: string;
  readonly name: string;
  readonly amountCents: Cents;
}

export interface PlanPrice extends CatalogPrice {
  readonly interval: 'month' | 'year';
}

export interface PlanCatalog {
  readonly confirmed: boolean;
  readonly plans: Readonly<Record<PlanInterval, PlanPrice>>;
  readonly audit: CatalogPrice;
}

export class CatalogError extends Error {
  override readonly name = 'CatalogError';
}

/** Reads a catalog file's JSON. */
export function parseCatalog(json: unknown): PlanCatalog {
  const parsed = CATALOG.safeParse(json);
  if (!parsed.success) {
    throw new CatalogError(`the plan catalog is not valid: ${[...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ')}`);
  }
  const { plans, audit } = parsed.data;
  const plan = (entry: { lookup_key: string; name: string; interval: 'month' | 'year'; amount_cents: string }): PlanPrice => ({
    lookupKey: entry.lookup_key,
    name: entry.name,
    interval: entry.interval,
    amountCents: parseCents(entry.amount_cents),
  });
  return {
    confirmed: parsed.data.confirmed,
    plans: { monthly: plan(plans.monthly), annual: plan(plans.annual) },
    audit: { lookupKey: audit.lookup_key, name: audit.name, amountCents: parseCents(audit.amount_cents) },
  };
}

let shipped: PlanCatalog | undefined;

/** The repository's catalog, config/plans.json. */
export function planCatalog(): PlanCatalog {
  shipped ??= parseCatalog(catalogFile);
  return shipped;
}

/** Production bills real customers only at confirmed amounts. */
export function requireConfirmedCatalog(catalog: PlanCatalog): void {
  if (!catalog.confirmed) {
    throw new CatalogError('the plan amounts in packages/billing/config/plans.json are not confirmed; a person confirms them before Stripe bills anyone');
  }
}
