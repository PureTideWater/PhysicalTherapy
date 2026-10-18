import { bigint, boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { contractVersion } from './contracts';
import { sourceDocument } from './documents';
import { packetVersion } from './packets';
import { agreement, practice, user } from './tenancy';

/**
 * The model gateway's records (PRD 14; Data dictionary, Model gateway and Operations; docs/adr/0048),
 * mirroring migrations/20261029090000_model_gateway.sql for typed queries. The SQL is the source of
 * truth for who writes what, the one update a call takes (the reviewer's decision), row-level security
 * and grants; a database test checks that these columns match it.
 *
 * - feature_flag: global (no row-level security); the application reads it, a platform administrator
 *   sets it through set_feature_flag().
 * - model_call: one row per call, never text: hashes, counts, cents, codes and references only.
 * - eval_example: synthetic or permitted evaluation data.
 * - model_budget_hold: what calls in flight may still cost, against the practice's daily budget.
 */

/**
 * The flags, a closed list the database checks: the gateway's (PRD 14, Operational limits) and the platform's
 * maintenance flag, global only (milestone 11; docs/adr/0053).
 */
export const FEATURE_FLAG_KEYS = ['model.kill_switch', 'model.read_denial_letter', 'model.daily_budget_cents', 'platform.maintenance'] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export const FEATURE_FLAG_SCOPES = ['global', 'organization', 'practice'] as const;
export type FeatureFlagScope = (typeof FEATURE_FLAG_SCOPES)[number];

export const featureFlag = pgTable(
  'feature_flag',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: text('key', { enum: FEATURE_FLAG_KEYS }).notNull(),
    scope: text('scope', { enum: FEATURE_FLAG_SCOPES }).notNull(),
    /** The organization or practice; null for a global flag. */
    scopeId: uuid('scope_id'),
    /** A boolean, or integer cents as text for the daily budget. */
    value: jsonb('value').$type<boolean | string>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('feature_flag_once').on(table.key, table.scope, table.scopeId).nullsNotDistinct()],
);

/** The four purpose-typed functions (PRD 14). */
export const MODEL_CALL_PURPOSES = ['proposeContractTerms', 'readDenialLetter', 'draftPacketNarrative', 'suggestEvidenceRequests'] as const;
export type ModelCallPurpose = (typeof MODEL_CALL_PURPOSES)[number];
export const MODEL_PROVIDERS = ['bedrock', 'anthropic', 'local'] as const;
export type ModelProviderKind = (typeof MODEL_PROVIDERS)[number];
export const MODEL_CALL_ACTOR_KINDS = ['user', 'service', 'evaluation'] as const;
export type ModelCallActorKind = (typeof MODEL_CALL_ACTOR_KINDS)[number];
export const MODEL_CALL_OUTCOMES = ['completed', 'failed', 'timed_out'] as const;
export type ModelCallOutcome = (typeof MODEL_CALL_OUTCOMES)[number];
export const REVIEWER_DECISIONS = ['accepted', 'accepted_with_changes', 'rejected'] as const;
export type ReviewerDecision = (typeof REVIEWER_DECISIONS)[number];

/** A citation as the log keeps it: a field path, a page or marker, and the quoted text's SHA-256, never the quote. */
export interface LoggedCitation {
  readonly field?: string;
  readonly page?: number;
  readonly marker?: number;
  readonly quote_sha256?: string;
}

export const modelCall = pgTable(
  'model_call',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null only for a synthetic evaluation call. */
    practiceId: uuid('practice_id').references(() => practice.id),
    actorKind: text('actor_kind', { enum: MODEL_CALL_ACTOR_KINDS }).notNull(),
    /** The user or job; null for an evaluation run. */
    actorId: uuid('actor_id'),
    purpose: text('purpose', { enum: MODEL_CALL_PURPOSES }).notNull(),
    provider: text('provider', { enum: MODEL_PROVIDERS }).notNull(),
    modelId: text('model_id').notNull(),
    promptVersion: text('prompt_version').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    inputHashes: text('input_hashes').array().notNull(),
    outputSha256: text('output_sha256'),
    tokensIn: integer('tokens_in').notNull(),
    tokensOut: integer('tokens_out').notNull(),
    costCents: bigint('cost_cents', { mode: 'bigint' }).notNull(),
    /** Cents before the one rounding up, as text. */
    costUnrounded: numeric('cost_unrounded', { precision: 18, scale: 6 }).notNull(),
    citations: jsonb('citations').$type<readonly LoggedCitation[]>().notNull(),
    verifierPassed: boolean('verifier_passed'),
    outcome: text('outcome', { enum: MODEL_CALL_OUTCOMES }).notNull(),
    errorCode: text('error_code'),
    attempts: integer('attempts').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    reviewerDecision: text('reviewer_decision', { enum: REVIEWER_DECISIONS }),
    reviewerChangedFields: text('reviewer_changed_fields').array(),
    reviewedBy: uuid('reviewed_by').references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('model_call_by_practice').on(table.practiceId, table.createdAt),
    uniqueIndex('model_call_completed_once').on(table.idempotencyKey).where(sql`outcome = 'completed'`),
  ],
);

export const EVAL_EXAMPLE_SOURCES = ['synthetic', 'permitted'] as const;
export type EvalExampleSource = (typeof EVAL_EXAMPLE_SOURCES)[number];

export const evalExample = pgTable(
  'eval_example',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source', { enum: EVAL_EXAMPLE_SOURCES }).notNull(),
    purpose: text('purpose', { enum: MODEL_CALL_PURPOSES }).notNull(),
    inputRef: text('input_ref').notNull(),
    expected: jsonb('expected').$type<Readonly<Record<string, unknown>>>().notNull(),
    practiceId: uuid('practice_id').references(() => practice.id),
    /** The signed data-rights agreement a permitted example rests on. */
    permissionRef: uuid('permission_ref').references(() => agreement.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('eval_example_by_practice').on(table.practiceId, table.createdAt)],
);

/** The purposes a person's call on a screen proposes for (the denial-letter reader, v1.5, has no screen yet). */
export const MODEL_PROPOSAL_PURPOSES = ['proposeContractTerms', 'draftPacketNarrative', 'suggestEvidenceRequests'] as const;
export type ModelProposalPurpose = (typeof MODEL_PROPOSAL_PURPOSES)[number];

/**
 * What a person's model call on a screen proposed, and for what (migrations/20261029190000_model_proposals.sql;
 * docs/adr/0052): the contract version and document a proposal of terms read, the packet version a narrative
 * draft became, or a coverage checklist. Written once by the person who made the call; afterwards only when the
 * reviewer's decision was recorded on the call, and the evaluation example a correction became.
 */
export const modelProposal = pgTable(
  'model_proposal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    modelCallId: uuid('model_call_id')
      .notNull()
      .references(() => modelCall.id),
    purpose: text('purpose', { enum: MODEL_PROPOSAL_PURPOSES }).notNull(),
    contractVersionId: uuid('contract_version_id').references(() => contractVersion.id),
    sourceDocumentId: uuid('source_document_id').references(() => sourceDocument.id),
    packetVersionId: uuid('packet_version_id').references(() => packetVersion.id),
    proposal: jsonb('proposal').$type<Readonly<Record<string, unknown>>>().notNull(),
    verifierPassed: boolean('verifier_passed').notNull(),
    proposedBy: uuid('proposed_by')
      .notNull()
      .references(() => user.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    evalExampleId: uuid('eval_example_id').references(() => evalExample.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique('model_proposal_once').on(table.modelCallId), index('model_proposal_by_practice').on(table.practiceId, table.createdAt)],
);

/**
 * What a practice's model calls in flight may still cost, held against its daily budget
 * (migrations/20261031090000_model_budget_holds.sql; docs/adr/0054): placed before a call under the
 * practice's advisory lock, deleted with the call's log row, expired after the longest call.
 */
export const modelBudgetHold = pgTable(
  'model_budget_hold',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    practiceId: uuid('practice_id')
      .notNull()
      .references(() => practice.id),
    /** In cents with six places, as model_call.cost_unrounded. */
    heldUnrounded: numeric('held_unrounded', { precision: 18, scale: 6 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [index('model_budget_hold_by_practice').on(table.practiceId, table.expiresAt)],
);

export type FeatureFlagRow = typeof featureFlag.$inferSelect;
export type ModelProposalRow = typeof modelProposal.$inferSelect;
export type ModelCallRow = typeof modelCall.$inferSelect;
export type EvalExampleRow = typeof evalExample.$inferSelect;
