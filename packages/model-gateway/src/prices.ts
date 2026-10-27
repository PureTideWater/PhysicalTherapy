import { z } from 'zod';

import pricesFile from '../config/models.json' with { type: 'json' };
import { GatewayConfigError } from './errors';
import { PROVIDER_KINDS, type ProviderKind } from './provider';

/**
 * What a call costs (PRD 14: "cents per document and per narrative ... measured per practice rather
 * than assumed"; PRD 19: model-call cost per practice against budget). Prices are configuration
 * (config/models.json): whole cents per million input and output tokens for each provider's model
 * identifier, and whether a person has confirmed them against the provider's price list. Production
 * serves no model feature whose model's price is not confirmed (./evaluated.ts, `price_unconfirmed`),
 * so a budget is never enforced on a guess.
 *
 * Integer arithmetic only: tokens times cents per million is millionths of a cent, exactly; the cost is
 * rounded up once to whole cents, and the exact value is kept beside it (numeric(18,6) cents, which
 * holds millionths exactly).
 */

export const PRICES_FORMAT = 'tp-model-prices/1';

const centsText = z.string().regex(/^(0|[1-9]\d{0,9})$/);

const pricesSchema = z.strictObject({
  format: z.literal(PRICES_FORMAT),
  models: z.array(
    z.strictObject({
      provider: z.enum(PROVIDER_KINDS),
      model_id: z.string().min(1),
      input_cents_per_million_tokens: centsText,
      output_cents_per_million_tokens: centsText,
      confirmed: z.boolean(),
      source: z.string().min(1),
    }),
  ),
});

export interface ModelPrice {
  readonly provider: ProviderKind;
  readonly modelId: string;
  readonly inputCentsPerMillion: bigint;
  readonly outputCentsPerMillion: bigint;
  readonly confirmed: boolean;
}

export const PRICES: readonly ModelPrice[] = pricesSchema.parse(pricesFile).models.map((entry) => ({
  provider: entry.provider,
  modelId: entry.model_id,
  inputCentsPerMillion: BigInt(entry.input_cents_per_million_tokens),
  outputCentsPerMillion: BigInt(entry.output_cents_per_million_tokens),
  confirmed: entry.confirmed,
}));

export function priceOf(provider: ProviderKind, modelId: string, prices: readonly ModelPrice[] = PRICES): ModelPrice {
  const price = prices.find((entry) => entry.provider === provider && entry.modelId === modelId);
  if (price === undefined) {
    throw new GatewayConfigError('a pinned model has no price in config/models.json');
  }
  return price;
}

export interface CallCost {
  /** Rounded up once to whole cents. */
  readonly cents: bigint;
  /** Exactly, in millionths of a cent. */
  readonly microCents: bigint;
}

const MILLION = 1_000_000n;

export function callCost(price: ModelPrice, tokensIn: number, tokensOut: number): CallCost {
  const microCents = BigInt(tokensIn) * price.inputCentsPerMillion + BigInt(tokensOut) * price.outputCentsPerMillion;
  return { cents: (microCents + MILLION - 1n) / MILLION, microCents };
}

/** Millionths of a cent as numeric(18,6) cents text ("12.000340"). */
export function microCentsText(microCents: bigint): string {
  return `${String(microCents / MILLION)}.${String(microCents % MILLION).padStart(6, '0')}`;
}

/** numeric(18,6) cents text as millionths of a cent. */
export function parseMicroCents(text: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/.exec(text);
  if (match?.[1] === undefined) {
    throw new TypeError('not a non-negative numeric(18,6) amount');
  }
  return BigInt(match[1]) * MILLION + BigInt((match[2] ?? '').padEnd(6, '0'));
}
