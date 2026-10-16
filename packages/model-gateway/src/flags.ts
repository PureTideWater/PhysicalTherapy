import type { FeatureFlagKey, FeatureFlagScope } from '@tp/db';

/**
 * The flags the gateway obeys (PRD 14, Operational limits; Data dictionary, feature_flag), resolved for
 * one practice from the rows set globally, for its organization and for the practice itself:
 *
 * - model.kill_switch turns every model feature off. It is on if any row in reach says so: a practice
 *   or an organization can be switched off alone, and nothing more specific switches a global kill
 *   back on. With it on, the product works on hand-entered records (test matrix MOD-06).
 * - model.read_denial_letter turns the v1.5 denial-letter reader on; off unless a row says otherwise.
 * - model.daily_budget_cents is the practice's daily spend limit in cents; DEFAULT_DAILY_BUDGET_CENTS
 *   unless a row says otherwise.
 *
 * For the last two, the most specific row wins: the practice's, then the organization's, then the
 * global one.
 */

/** A practice's daily model budget when no flag sets one: $5.00 (docs/adr/0048). */
export const DEFAULT_DAILY_BUDGET_CENTS = 500n;

export interface FlagRow {
  readonly key: FeatureFlagKey;
  readonly scope: FeatureFlagScope;
  readonly scopeId: string | null;
  readonly value: unknown;
}

export interface GatewayFeatures {
  readonly killSwitch: boolean;
  readonly readDenialLetter: boolean;
  readonly dailyBudgetCents: bigint;
}

const SPECIFICITY: Readonly<Record<FeatureFlagScope, number>> = { practice: 3, organization: 2, global: 1 };

/** The rows that reach a practice of an organization (only the global ones for a synthetic call, which has neither). */
function inReach(rows: readonly FlagRow[], practiceId: string | null, organizationId: string | null): FlagRow[] {
  return rows.filter(
    (row) => row.scope === 'global' || (row.scope === 'practice' && row.scopeId !== null && row.scopeId === practiceId) || (row.scope === 'organization' && row.scopeId !== null && row.scopeId === organizationId),
  );
}

function mostSpecific(rows: readonly FlagRow[], key: FeatureFlagKey): FlagRow | undefined {
  return rows.filter((row) => row.key === key).sort((a, b) => SPECIFICITY[b.scope] - SPECIFICITY[a.scope])[0];
}

const CENTS = /^(0|[1-9]\d{0,11})$/;

export function resolveFeatures(rows: readonly FlagRow[], practiceId: string | null, organizationId: string | null): GatewayFeatures {
  const reach = inReach(rows, practiceId, organizationId);
  const budget = mostSpecific(reach, 'model.daily_budget_cents')?.value;
  return {
    killSwitch: reach.some((row) => row.key === 'model.kill_switch' && row.value === true),
    readDenialLetter: mostSpecific(reach, 'model.read_denial_letter')?.value === true,
    dailyBudgetCents: typeof budget === 'string' && CENTS.test(budget) ? BigInt(budget) : DEFAULT_DAILY_BUDGET_CENTS,
  };
}
