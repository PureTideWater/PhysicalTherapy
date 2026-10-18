import { type FeatureFlagKey, type FeatureFlagScope, OPERATOR_ROLE, type PracticeScope, REVIEWER_DECISIONS, type ReviewerDecision, type ScopeClient, type ScopePool, recordAuditEvent, withActor, withJobScope, withPracticeScope } from '@tp/db/runtime';

import { GatewayError } from './errors';
import { type FlagRow, type GatewayFeatures, resolveFeatures } from './flags';
import { microCentsText, parseMicroCents } from './prices';
import { MODEL_PURPOSES, type ModelPurpose } from './purposes';
import { type BudgetHold, type BudgetHoldRequest, type CallActor, type ModelCallRecord, type ModelCallStore, actorColumns } from './store';

/**
 * The gateway's records in the product's own database (migration 20261029090000_model_gateway.sql).
 * A practice's calls are read and written in that practice's scope, as the person (withPracticeScope)
 * or the job (withJobScope) the store acts for, so the tenant policy and the table's rules apply: a
 * call is logged in its actor's name, never changes, and is reviewed once by a person who may. A
 * synthetic evaluation run's calls name no practice and are written as the operator role
 * (OperatorEvaluationStore), whose policy admits those rows alone.
 */

const INSERT = `INSERT INTO model_call (practice_id, actor_kind, actor_id, purpose, provider, model_id, prompt_version, idempotency_key, input_hashes, output_sha256,
  tokens_in, tokens_out, cost_cents, cost_unrounded, citations, verifier_passed, outcome, error_code, attempts, latency_ms)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`;

function insertValues(record: ModelCallRecord): unknown[] {
  return [
    record.practiceId,
    record.actorKind,
    record.actorId,
    record.purpose,
    record.provider,
    record.modelId,
    record.promptVersion,
    record.idempotencyKey,
    [...record.inputHashes],
    record.outputSha256,
    record.tokensIn,
    record.tokensOut,
    record.costCents.toString(),
    microCentsText(record.costMicroCents),
    JSON.stringify(record.citations),
    record.verifierPassed,
    record.outcome,
    record.errorCode,
    record.attempts,
    record.latencyMs,
  ];
}

const FLAGS = `SELECT key, scope, scope_id, value FROM feature_flag
  WHERE key LIKE 'model.%' AND (scope = 'global' OR (scope = 'practice' AND scope_id = $1) OR (scope = 'organization' AND scope_id = $2))`;

async function flagRows(client: ScopeClient, practiceId: string | null, organizationId: string | null): Promise<FlagRow[]> {
  const { rows } = await client.query<{ key: FeatureFlagKey; scope: FeatureFlagScope; scope_id: string | null; value: unknown }>(FLAGS, [practiceId, organizationId]);
  return rows.map((row) => ({ key: row.key, scope: row.scope, scopeId: row.scope_id, value: row.value }));
}

export type PracticeActor = Extract<CallActor, { readonly kind: 'user' | 'job' }>;

/** Runs `run` in the practice's scope as the person or the job; refused when the actor does not reach the practice now. */
function inPracticeScope<T>(pool: ScopePool<ScopeClient>, actor: PracticeActor, practiceId: string | null, run: (client: ScopeClient) => Promise<T>): Promise<T> {
  if (practiceId === null) {
    return Promise.reject(new GatewayError('context_invalid', 'a person’s or a job’s call reads one practice’s material'));
  }
  const inScope = (scope: PracticeScope<ScopeClient>) => {
    if (!scope.practiceIds.includes(practiceId)) {
      throw new GatewayError('practice_out_of_scope', 'the actor does not reach the practice now');
    }
    return run(scope.client);
  };
  return actor.kind === 'user' ? withPracticeScope(pool, { actorId: actor.userId, practiceIds: [practiceId] }, inScope) : withJobScope(pool, { jobId: actor.jobId, practiceId }, inScope);
}

/** A person's or a practice job's model calls, in the practice's scope. */
export class PostgresModelCallStore implements ModelCallStore {
  constructor(
    private readonly pool: ScopePool<ScopeClient>,
    readonly actor: PracticeActor,
  ) {}

  private scoped<T>(practiceId: string | null, run: (client: ScopeClient) => Promise<T>): Promise<T> {
    return inPracticeScope(this.pool, this.actor, practiceId, run);
  }

  features(practiceId: string | null): Promise<GatewayFeatures> {
    return this.scoped(practiceId, async (client) => {
      const { rows } = await client.query<{ organization_id: string | null }>('SELECT organization_id FROM practice WHERE id = $1', [practiceId]);
      const organizationId = rows[0]?.organization_id ?? null;
      return resolveFeatures(await flagRows(client, practiceId, organizationId), practiceId, organizationId);
    });
  }

  spentSince(practiceId: string, since: Date): Promise<bigint> {
    return this.scoped(practiceId, async (client) => {
      const { rows } = await client.query<{ spent: string }>('SELECT coalesce(sum(cost_unrounded), 0)::numeric(18, 6)::text AS spent FROM model_call WHERE practice_id = $1 AND created_at >= $2', [
        practiceId,
        since.toISOString(),
      ]);
      return parseMicroCents(rows[0]?.spent ?? '0');
    });
  }

  hold(practiceId: string, request: BudgetHoldRequest): Promise<BudgetHold> {
    return this.scoped(practiceId, async (client) => {
      // Holds and spend are read and the hold placed under the practice's lock, released at commit.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`model_budget:${practiceId}`]);
      await client.query('DELETE FROM model_budget_hold WHERE practice_id = $1 AND expires_at <= now()', [practiceId]);
      // One statement, so the spend and the holds come from one snapshot: a call logged meanwhile is counted once.
      const { rows } = await client.query<{ spent: string }>(
        `SELECT ((SELECT coalesce(sum(cost_unrounded), 0) FROM model_call WHERE practice_id = $1 AND created_at >= $2)
               + (SELECT coalesce(sum(held_unrounded), 0) FROM model_budget_hold WHERE practice_id = $1))::numeric(18, 6)::text AS spent`,
        [practiceId, request.since.toISOString()],
      );
      const spent = parseMicroCents(rows[0]?.spent ?? '0');
      if (spent >= request.budgetMicro) {
        return { holdId: null, spent };
      }
      const held = await client.query<{ id: string }>("INSERT INTO model_budget_hold (practice_id, held_unrounded, expires_at) VALUES ($1, $2, now() + $3 * interval '1 millisecond') RETURNING id", [
        practiceId,
        microCentsText(request.amountMicro),
        Math.max(1, Math.ceil(request.holdMs)),
      ]);
      return { holdId: (held.rows[0] as { id: string }).id, spent };
    });
  }

  release(practiceId: string, holdId: string): Promise<void> {
    return this.scoped(practiceId, async (client) => {
      await client.query('DELETE FROM model_budget_hold WHERE id = $1 AND practice_id = $2', [holdId, practiceId]);
    });
  }

  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null> {
    return this.scoped(practiceId, async (client) => {
      const { rows } = await client.query<{ id: string }>("SELECT id FROM model_call WHERE practice_id = $1 AND idempotency_key = $2 AND outcome = 'completed'", [practiceId, idempotencyKey]);
      return rows[0]?.id ?? null;
    });
  }

  /** The call's row and the release of its hold, in one transaction: a concurrent hold sees one or the other, never neither. */
  record(record: ModelCallRecord, holdId: string | null = null): Promise<string> {
    return this.scoped(record.practiceId, async (client) => {
      const { rows } = await client.query<{ id: string }>(INSERT, insertValues({ ...record, ...actorColumns(this.actor) }));
      if (holdId !== null) {
        await client.query('DELETE FROM model_budget_hold WHERE id = $1 AND practice_id = $2', [holdId, record.practiceId]);
      }
      return (rows[0] as { id: string }).id;
    });
  }
}

/** A synthetic evaluation run's calls: no practice, written and read as the operator role. */
export class OperatorEvaluationStore implements ModelCallStore {
  readonly actor: CallActor = { kind: 'evaluation' };

  /** `pool` connects as a login that can SET ROLE tp_operator (OPERATOR_DATABASE_URL). */
  constructor(private readonly pool: ScopePool<ScopeClient>) {}

  /** Runs `run` as tp_operator with no practice in scope; refused for a call that names a practice. */
  private async operator<T>(practiceId: string | null, run: (client: ScopeClient) => Promise<T>): Promise<T> {
    if (practiceId !== null) {
      throw new GatewayError('context_invalid', 'an evaluation run reads synthetic material and names no practice');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL ROLE ${OPERATOR_ROLE}`);
      await client.query("SELECT set_config('app.practice_ids', '{}', true)");
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  features(practiceId: string | null): Promise<GatewayFeatures> {
    return this.operator(practiceId, async (client) => resolveFeatures(await flagRows(client, null, null), null, null));
  }

  spentSince(): Promise<bigint> {
    return Promise.resolve(0n);
  }

  /** A synthetic evaluation run names no practice, so it holds no practice's budget. */
  hold(): Promise<BudgetHold> {
    return Promise.reject(new GatewayError('context_invalid', 'an evaluation run reads synthetic material and holds no practice’s budget'));
  }

  release(): Promise<void> {
    return Promise.resolve();
  }

  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null> {
    return this.operator(practiceId, async (client) => {
      const { rows } = await client.query<{ id: string }>("SELECT id FROM model_call WHERE practice_id IS NULL AND idempotency_key = $1 AND outcome = 'completed'", [idempotencyKey]);
      return rows[0]?.id ?? null;
    });
  }

  record(record: ModelCallRecord): Promise<string> {
    return this.operator(record.practiceId, async (client) => {
      const { rows } = await client.query<{ id: string }>(INSERT, insertValues({ ...record, ...actorColumns(this.actor) }));
      return (rows[0] as { id: string }).id;
    });
  }
}

// ---------------------------------------------------------------------------------------------------
// The reviewer's decision, flags and evaluation examples

export interface ReviewerDecisionInput {
  readonly userId: string;
  readonly practiceId: string;
  readonly modelCallId: string;
  readonly decision: ReviewerDecision;
  /** Field paths the reviewer changed (candidates[0].parameters); none unless accepted with changes. */
  readonly changedFields: readonly string[];
  readonly requestId: string;
}

const FIELD_PATH = /^[a-z][a-z0-9_.[\]]{0,127}$/;

/**
 * Records, once, what the reviewer did with a call's proposal (PRD 14: "later the reviewer's decision
 * and the fields the reviewer changed"), with an audit event. The database checks the reviewer may
 * review the call's purpose in its practice and that nothing else of the row changes.
 */
export async function recordReviewerDecision(pool: ScopePool<ScopeClient>, input: ReviewerDecisionInput): Promise<void> {
  const { userId, ...decision } = input;
  await withPracticeScope(pool, { actorId: userId, practiceIds: [input.practiceId] }, (scope) => recordReviewerDecisionIn(scope, decision));
}

/**
 * The same, in a transaction the caller holds (a server action's own scope, as the person acting), so
 * the decision commits or rolls back with what the person did: a version approved, a packet sent for
 * approval, a checklist kept.
 */
export async function recordReviewerDecisionIn(scope: PracticeScope<ScopeClient>, input: Omit<ReviewerDecisionInput, 'userId'>): Promise<void> {
  if (!REVIEWER_DECISIONS.includes(input.decision) || !input.changedFields.every((path) => FIELD_PATH.test(path)) || (input.decision === 'accepted_with_changes') !== input.changedFields.length > 0) {
    throw new GatewayError('decision_invalid', 'a decision is accepted, rejected, or accepted with the changed fields named');
  }
  const { rows } = await scope.client.query<{ id: string }>('UPDATE model_call SET reviewer_decision = $3, reviewer_changed_fields = $4 WHERE id = $1 AND practice_id = $2 RETURNING id', [
    input.modelCallId,
    input.practiceId,
    input.decision,
    [...input.changedFields],
  ]);
  if (rows.length === 0) {
    throw new GatewayError('not_found', 'no such model call in the practice');
  }
  await recordAuditEvent(scope, { action: 'model_call_reviewed', objectType: 'model_call', objectId: input.modelCallId, practiceId: input.practiceId, requestId: input.requestId });
}

/** What the gateway's flags allow for a practice, read in a transaction the caller holds (a page's own scope). */
export async function featuresIn(client: ScopeClient, practiceId: string): Promise<GatewayFeatures> {
  const { rows } = await client.query<{ organization_id: string | null }>('SELECT organization_id FROM practice WHERE id = $1', [practiceId]);
  const organizationId = rows[0]?.organization_id ?? null;
  return resolveFeatures(await flagRows(client, practiceId, organizationId), practiceId, organizationId);
}

export interface FeatureFlagInput {
  readonly key: FeatureFlagKey;
  readonly scope: FeatureFlagScope;
  readonly scopeId: string | null;
  readonly value: boolean | string;
}

/** A platform administrator sets a flag (set_feature_flag checks feature_flag.manage and records the audit event). */
export function setFeatureFlag(pool: ScopePool<ScopeClient>, actorId: string, flag: FeatureFlagInput): Promise<string> {
  return withActor(pool, actorId, async (scope) => {
    const { rows } = await scope.client.query<{ id: string }>('SELECT set_feature_flag($1, $2, $3, $4::jsonb) AS id', [flag.key, flag.scope, flag.scopeId, JSON.stringify(flag.value)]);
    return (rows[0] as { id: string }).id;
  });
}

export interface PermittedExampleInput {
  readonly practiceId: string;
  readonly purpose: Exclude<ModelPurpose, 'readDenialLetter'>;
  /** An opaque reference to the input (the model call or document it came from). */
  readonly inputRef: string;
  readonly expected: Readonly<Record<string, unknown>>;
  /** The practice's signed data-rights agreement. */
  readonly permissionRef: string;
}

const INPUT_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/;

/** A reviewer's correction kept as an evaluation example, under the practice's data-rights agreement (PRD 14). */
export function recordPermittedExample(pool: ScopePool<ScopeClient>, actor: PracticeActor, example: PermittedExampleInput): Promise<string> {
  if (!validExample(example)) {
    return Promise.reject(exampleInvalid());
  }
  return inPracticeScope(pool, actor, example.practiceId, (client) => insertExample(client, example));
}

/** The same, in a transaction the caller holds. */
export async function recordPermittedExampleIn(scope: PracticeScope<ScopeClient>, example: PermittedExampleInput): Promise<string> {
  if (!validExample(example)) {
    throw exampleInvalid();
  }
  return insertExample(scope.client, example);
}

function validExample(example: PermittedExampleInput): boolean {
  return (MODEL_PURPOSES as readonly string[]).includes(example.purpose) && example.purpose !== ('readDenialLetter' as string) && INPUT_REF.test(example.inputRef);
}

const exampleInvalid = () => new GatewayError('example_invalid', 'an example names its purpose (a denial letter’s are synthetic only) and an opaque reference to its input');

async function insertExample(client: ScopeClient, example: PermittedExampleInput): Promise<string> {
  const { rows } = await client.query<{ id: string }>("INSERT INTO eval_example (source, purpose, input_ref, expected, practice_id, permission_ref) VALUES ('permitted', $1, $2, $3, $4, $5) RETURNING id", [
    example.purpose,
    example.inputRef,
    JSON.stringify(example.expected),
    example.practiceId,
    example.permissionRef,
  ]);
  return (rows[0] as { id: string }).id;
}
