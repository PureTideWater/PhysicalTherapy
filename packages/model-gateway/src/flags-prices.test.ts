import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { GatewayConfigError } from './errors';
import { DEFAULT_DAILY_BUDGET_CENTS, type FlagRow, resolveFeatures } from './flags';
import { callCost, microCentsText, parseMicroCents, priceOf } from './prices';

const PRACTICE = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000a2';
const ORGANIZATION = '00000000-0000-4000-8000-0000000000b1';

const flag = (key: FlagRow['key'], scope: FlagRow['scope'], value: unknown, scopeId: string | null = null): FlagRow => ({ key, scope, scopeId, value });

describe('resolveFeatures', () => {
  it('has every feature on but the denial-letter reader, at the default budget, with no flags', () => {
    expect(resolveFeatures([], PRACTICE, ORGANIZATION)).toEqual({ killSwitch: false, readDenialLetter: false, dailyBudgetCents: DEFAULT_DAILY_BUDGET_CENTS });
  });

  it('switches every feature off when any flag in reach says so, and nothing more specific switches it back', () => {
    expect(resolveFeatures([flag('model.kill_switch', 'global', true), flag('model.kill_switch', 'practice', false, PRACTICE)], PRACTICE, ORGANIZATION).killSwitch).toBe(true);
    expect(resolveFeatures([flag('model.kill_switch', 'organization', true, ORGANIZATION)], PRACTICE, ORGANIZATION).killSwitch).toBe(true);
    expect(resolveFeatures([flag('model.kill_switch', 'practice', true, PRACTICE)], PRACTICE, ORGANIZATION).killSwitch).toBe(true);
    // Another practice's or organization's switch does not reach this one.
    expect(resolveFeatures([flag('model.kill_switch', 'practice', true, OTHER), flag('model.kill_switch', 'organization', true, OTHER)], PRACTICE, ORGANIZATION).killSwitch).toBe(false);
  });

  it('takes the most specific flag for the denial-letter reader and the budget', () => {
    const rows = [
      flag('model.read_denial_letter', 'global', true),
      flag('model.read_denial_letter', 'practice', false, PRACTICE),
      flag('model.daily_budget_cents', 'global', '100'),
      flag('model.daily_budget_cents', 'organization', '250', ORGANIZATION),
    ];
    expect(resolveFeatures(rows, PRACTICE, ORGANIZATION)).toEqual({ killSwitch: false, readDenialLetter: false, dailyBudgetCents: 250n });
    expect(resolveFeatures(rows, OTHER, null)).toEqual({ killSwitch: false, readDenialLetter: true, dailyBudgetCents: 100n });
  });

  it('reads only the global flags for a synthetic evaluation call, and ignores a malformed budget', () => {
    expect(resolveFeatures([flag('model.kill_switch', 'practice', true, PRACTICE), flag('model.daily_budget_cents', 'global', 'x')], null, null)).toEqual({
      killSwitch: false,
      readDenialLetter: false,
      dailyBudgetCents: DEFAULT_DAILY_BUDGET_CENTS,
    });
  });
});

describe('call cost', () => {
  const price = { provider: 'bedrock' as const, modelId: 'synthetic', inputCentsPerMillion: 200n, outputCentsPerMillion: 1000n, confirmed: false };

  it('is tokens times cents per million, exactly in millionths of a cent, rounded up once to whole cents', () => {
    expect(callCost(price, 3000, 500)).toEqual({ microCents: 1_100_000n, cents: 2n });
    expect(callCost(price, 1_000_000, 0)).toEqual({ microCents: 200_000_000n, cents: 200n });
    expect(callCost(price, 0, 0)).toEqual({ microCents: 0n, cents: 0n });
    expect(callCost(price, 1, 0)).toEqual({ microCents: 200n, cents: 1n });
  });

  it('rounds up, and never below the exact cost (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2_000_000_000 }), fc.integer({ min: 0, max: 2_000_000_000 }), (input, output) => {
        const cost = callCost(price, input, output);
        return cost.cents * 1_000_000n >= cost.microCents && (cost.cents - 1n) * 1_000_000n < cost.microCents + (cost.microCents === 0n ? 1_000_000n : 0n);
      }),
    );
  });

  it('writes and reads numeric(18,6) cents exactly (property)', () => {
    expect(microCentsText(1_100_000n)).toBe('1.100000');
    expect(microCentsText(5n)).toBe('0.000005');
    expect(parseMicroCents('12')).toBe(12_000_000n);
    expect(parseMicroCents('0.5')).toBe(500_000n);
    expect(() => parseMicroCents('-1')).toThrow(TypeError);
    fc.assert(fc.property(fc.bigInt({ min: 0n, max: 10n ** 17n }), (micro) => parseMicroCents(microCentsText(micro)) === micro));
  });

  it('refuses a model with no price', () => {
    expect(() => priceOf('bedrock', 'not-configured')).toThrow(GatewayConfigError);
    expect(priceOf('local', 'local-deterministic')).toMatchObject({ inputCentsPerMillion: 0n, confirmed: true });
  });
});
