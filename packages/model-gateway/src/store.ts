import { randomUUID } from 'node:crypto';

import type { LoggedCitation, ModelCallOutcome } from '@tp/db/runtime';

import { type FlagRow, type GatewayFeatures, resolveFeatures } from './flags';
import type { ProviderKind } from './provider';
import type { ModelPurpose } from './purposes';

/**
 * Where the gateway reads its flags and budgets and writes its model_call rows: the product's own
 * database (./postgres-store.ts; PRD 14: "These rows live in the product's own database, never in a
 * model-observability service"), or memory for tests and development. A store acts for one actor: a
 * person, a practice job, or (with no practice) a synthetic evaluation run.
 */

export type CallActor = { readonly kind: 'user'; readonly userId: string } | { readonly kind: 'job'; readonly jobId: string } | { readonly kind: 'evaluation' };

/** model_call's columns, as the gateway fills them (the reviewer's decision comes later). */
export interface ModelCallRecord {
  readonly practiceId: string | null;
  readonly actorKind: 'user' | 'service' | 'evaluation';
  readonly actorId: string | null;
  readonly purpose: ModelPurpose;
  readonly provider: ProviderKind;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly idempotencyKey: string;
  readonly inputHashes: readonly string[];
  readonly outputSha256: string | null;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly costCents: bigint;
  /** Millionths of a cent: the unrounded cost exactly (numeric(18,6) cents in the table). */
  readonly costMicroCents: bigint;
  readonly citations: readonly LoggedCitation[];
  readonly verifierPassed: boolean | null;
  readonly outcome: ModelCallOutcome;
  readonly errorCode: string | null;
  readonly attempts: 1 | 2;
  readonly latencyMs: number;
}

export interface ModelCallStore {
  readonly actor: CallActor;
  features(practiceId: string | null): Promise<GatewayFeatures>;
  /** What the practice has spent since `since`, in millionths of a cent. */
  spentSince(practiceId: string, since: Date): Promise<bigint>;
  /** The completed call logged under the idempotency key, if one is. */
  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null>;
  /** Writes the row; returns its ID. */
  record(record: ModelCallRecord): Promise<string>;
}

/** model_call's actor columns for a store's actor. */
export function actorColumns(actor: CallActor): Pick<ModelCallRecord, 'actorKind' | 'actorId'> {
  switch (actor.kind) {
    case 'user':
      return { actorKind: 'user', actorId: actor.userId };
    case 'job':
      return { actorKind: 'service', actorId: actor.jobId };
    case 'evaluation':
      return { actorKind: 'evaluation', actorId: null };
  }
}

/** A stored call, as the memory store keeps it. */
export interface StoredCall extends ModelCallRecord {
  readonly id: string;
  readonly createdAt: Date;
}

export interface MemoryStoreOptions {
  readonly actor: CallActor;
  readonly flags?: readonly FlagRow[];
  /** Each practice's organization, for organization-scoped flags. */
  readonly organizations?: Readonly<Record<string, string>>;
  readonly now?: () => Date;
}

/** The store for unit tests and local development: the same rules, in memory. */
export class MemoryModelCallStore implements ModelCallStore {
  readonly actor: CallActor;
  readonly calls: StoredCall[] = [];
  flags: FlagRow[];
  private readonly organizations: Readonly<Record<string, string>>;
  private readonly now: () => Date;

  constructor(options: MemoryStoreOptions) {
    this.actor = options.actor;
    this.flags = [...(options.flags ?? [])];
    this.organizations = options.organizations ?? {};
    this.now = options.now ?? (() => new Date());
  }

  features(practiceId: string | null): Promise<GatewayFeatures> {
    return Promise.resolve(resolveFeatures(this.flags, practiceId, practiceId === null ? null : (this.organizations[practiceId] ?? null)));
  }

  spentSince(practiceId: string, since: Date): Promise<bigint> {
    return Promise.resolve(this.calls.filter((call) => call.practiceId === practiceId && call.createdAt >= since).reduce((sum, call) => sum + call.costMicroCents, 0n));
  }

  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null> {
    return Promise.resolve(this.calls.find((call) => call.practiceId === practiceId && call.idempotencyKey === idempotencyKey && call.outcome === 'completed')?.id ?? null);
  }

  record(record: ModelCallRecord): Promise<string> {
    const id = randomUUID();
    this.calls.push({ ...record, id, createdAt: this.now() });
    return Promise.resolve(id);
  }
}
