import { type FeatureFlagKey, type FeatureFlagScope } from '@tp/db/runtime';
import { DEFAULT_DAILY_BUDGET_CENTS, type FlagRow, resolveFeatures } from '@tp/model-gateway';
import { z } from 'zod';

import { platformRoute } from '../http/invoke';
import { InputError, type MutationResult } from '../http/route';
import { modelPathOf } from '../models/path';

/**
 * The console's model controls (PRD 6, Admin console: "feature flags"; PRD 14, Operational limits: "per-practice
 * daily budgets with alerts; a kill switch (feature flag) that turns every model feature off"; PRD 19, Monitoring:
 * "model-call cost per practice against budget"; test matrix MOD-05, MOD-06; docs/adr/0055).
 *
 * - /console/models: whether a model path is configured, every model flag set (for everyone, an organization or a
 *   practice), and each active practice's model calls and cost today against its daily budget, in counts and
 *   amounts only (console_model_spend; no call, input or output is named).
 * - The one action sets a model flag through set_feature_flag() (feature_flag.manage, checked again there, with its
 *   own audit event): the kill switch on or off, the daily budget in cents, the v1.5 denial-letter reader on or off.
 *   A kill switch in reach of a practice turns its every model feature off; the most specific budget and letter
 *   setting wins (the gateway's flags.ts).
 */

/** The model flags the console sets, and what each is called on the screen. */
export const MODEL_FLAGS: Readonly<Record<Exclude<FeatureFlagKey, 'platform.maintenance'>, string>> = {
  'model.kill_switch': 'Kill switch (every model feature off)',
  'model.daily_budget_cents': 'Daily budget (cents)',
  'model.read_denial_letter': 'Denial-letter reader (v1.5)',
};
type ModelFlagKey = keyof typeof MODEL_FLAGS;
const MODEL_FLAG_KEYS = Object.keys(MODEL_FLAGS) as ModelFlagKey[];

export interface ModelFlagView {
  readonly key: ModelFlagKey;
  readonly scope: FeatureFlagScope;
  readonly scopeId: string | null;
  /** The organization's or practice's name; "Everyone" for a global flag. */
  readonly appliesTo: string;
  /** "On", "Off", or the budget in cents. */
  readonly value: string;
}

export interface PracticeSpendView {
  readonly practiceId: string;
  readonly name: string;
  readonly calls: number;
  /** Today's cost in whole cents, rounded up (the gateway holds the unrounded figure). */
  readonly spentCents: string;
  readonly budgetCents: string;
  /** Spent as a whole percentage of the budget, or null under a zero budget. */
  readonly percent: number | null;
  readonly killSwitch: boolean;
}

export interface TargetOption {
  /** "global", "organization:<id>" or "practice:<id>". */
  readonly value: string;
  readonly label: string;
}

interface FlagDbRow {
  readonly key: ModelFlagKey;
  readonly scope: FeatureFlagScope;
  readonly scope_id: string | null;
  readonly value: unknown;
}

const MICRO = 1_000_000n;

/** Whole cents from millionths of a cent, rounded up: a fraction of a cent spent shows as a cent. */
function centsUp(micro: bigint): bigint {
  return micro <= 0n ? 0n : (micro + MICRO - 1n) / MICRO;
}

/** numeric(18,6) text as millionths of a cent, exactly (never through a float). */
function microOf(text: string): bigint {
  const [whole = '0', fraction = ''] = text.split('.');
  return BigInt(whole) * MICRO + BigInt(fraction.padEnd(6, '0').slice(0, 6));
}

function shown(row: FlagDbRow): string {
  if (row.key === 'model.daily_budget_cents') {
    return typeof row.value === 'string' ? row.value : String(row.value);
  }
  return row.value === true ? 'On' : 'Off';
}

export const consoleModelsPage = platformRoute({
  id: 'console.models',
  kind: 'page',
  path: '/console/models',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({ notice: z.enum(['set']).optional().catch(undefined) }),
  handle: async ({ scope, params, services }) => {
    const flags = (await scope.client.query<FlagDbRow>("SELECT key, scope, scope_id, value FROM feature_flag WHERE key LIKE 'model.%' ORDER BY key, scope, scope_id")).rows;
    const organizations = (await scope.client.query<{ id: string; name: string }>("SELECT id, name FROM organization WHERE kind IN ('group', 'firm') ORDER BY name, id")).rows;
    const practices = (await scope.client.query<{ practice_id: string; organization_id: string | null; name: string; status: string }>('SELECT practice_id, organization_id, name, status FROM console_practices(NULL)')).rows.filter(
      (row) => row.status === 'active',
    );
    const day = services.now().toISOString().slice(0, 10);
    const spend = (await scope.client.query<{ practice_id: string; organization_id: string | null; name: string; calls: number; spent_unrounded: string }>('SELECT * FROM console_model_spend($1::date)', [day])).rows;
    const names = new Map<string, string>([...organizations.map((row) => [row.id, row.name] as const), ...practices.map((row) => [row.practice_id, row.name] as const)]);
    const rows: FlagRow[] = flags.map((row) => ({ key: row.key, scope: row.scope, scopeId: row.scope_id, value: row.value }));
    const path = modelPathOf(services);
    return {
      day,
      notice: params.notice ?? null,
      modelPath: path.kind === 'available' ? { available: true as const, production: path.production } : { available: false as const, reason: path.reason },
      defaultBudgetCents: DEFAULT_DAILY_BUDGET_CENTS.toString(),
      flags: flags.map(
        (row): ModelFlagView => ({ key: row.key, scope: row.scope, scopeId: row.scope_id, appliesTo: row.scope_id === null ? 'Everyone' : (names.get(row.scope_id) ?? row.scope_id), value: shown(row) }),
      ),
      spend: spend.map((row): PracticeSpendView => {
        const features = resolveFeatures(rows, row.practice_id, row.organization_id);
        const spent = microOf(row.spent_unrounded);
        const budget = features.dailyBudgetCents;
        return {
          practiceId: row.practice_id,
          name: row.name,
          calls: row.calls,
          spentCents: centsUp(spent).toString(),
          budgetCents: budget.toString(),
          percent: budget === 0n ? null : Number((spent * 100n) / (budget * MICRO)),
          killSwitch: features.killSwitch,
        };
      }),
      keys: MODEL_FLAG_KEYS.map((key) => ({ value: key, label: MODEL_FLAGS[key] })),
      targets: [
        { value: 'global', label: 'Everyone' },
        ...organizations.map((row): TargetOption => ({ value: `organization:${row.id}`, label: `Organization: ${row.name}` })),
        ...practices.map((row): TargetOption => ({ value: `practice:${row.practice_id}`, label: `Practice: ${row.name}` })),
      ],
    };
  },
  sample: { params: () => ({}) },
});

const TARGET = /^(global|(organization|practice):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const CENTS = /^(0|[1-9]\d{0,11})$/;

export const setModelFlag = platformRoute({
  id: 'console.models.set_flag',
  kind: 'action',
  path: '/console/models',
  phi: false,
  permission: 'feature_flag.manage',
  params: z.object({}),
  input: z.object({
    key: z.enum(MODEL_FLAG_KEYS as [ModelFlagKey, ...ModelFlagKey[]], { message: 'choose a model flag' }),
    target: z.string().regex(TARGET, 'choose everyone, an organization or a practice'),
    value: z.string().trim().min(1, 'a value').max(16),
  }),
  audit: { action: 'model_flag_set', objectType: 'feature_flag' },
  handle: async ({ scope, input }): Promise<MutationResult> => {
    let value: boolean | string;
    if (input.key === 'model.daily_budget_cents') {
      if (!CENTS.test(input.value)) {
        throw new InputError([{ field: 'value', message: 'a budget in whole cents, such as 500 for $5.00' }]);
      }
      value = input.value;
    } else if (input.value === 'on' || input.value === 'off') {
      value = input.value === 'on';
    } else {
      throw new InputError([{ field: 'value', message: 'on or off' }]);
    }
    const [scopeName, scopeId = null] = input.target.split(':') as [FeatureFlagScope, string?];
    const { rows } = await scope.client.query<{ id: string }>('SELECT set_feature_flag($1, $2, $3, $4::jsonb) AS id', [input.key, scopeName, scopeId, JSON.stringify(value)]);
    return { objectId: rows[0]?.id, redirect: '/console/models?notice=set' };
  },
  sample: { params: () => ({}), input: (refs) => ({ key: 'model.daily_budget_cents', target: `practice:${refs.practiceId}`, value: '750' }) },
});

export const CONSOLE_MODEL_ROUTES = [consoleModelsPage, setModelFlag] as const;
