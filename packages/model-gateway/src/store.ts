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

/** A hold on the practice's daily budget for a call about to be made (test matrix MOD-05). */
export interface BudgetHoldRequest {
  /** The start of the budget's day. */
  readonly since: Date;
  /** The most the call can cost, in millionths of a cent. */
  readonly amountMicro: bigint;
  /** The practice's daily budget, in millionths of a cent. */
  readonly budgetMicro: bigint;
  /** How long the hold stands if the call never ends (its process died): the longest a call can take. */
  readonly holdMs: number;
}

export interface BudgetHold {
  /** The hold placed, or null when the budget is spent: the call is refused. */
  readonly holdId: string | null;
  /** The day's logged spend with every other call's hold, in millionths of a cent, as the hold saw it. */
  readonly spent: bigint;
}

export interface ModelCallStore {
  readonly actor: CallActor;
  features(practiceId: string | null): Promise<GatewayFeatures>;
  /** What the practice has spent since `since`, in millionths of a cent. */
  spentSince(practiceId: string, since: Date): Promise<bigint>;
  /**
   * Under the practice's lock, reads the day's spend and the other calls' holds together and, when they have not
   * reached the budget, holds the call's most: calls made at once are held to the budget as calls made in turn.
   */
  hold(practiceId: string, request: BudgetHoldRequest): Promise<BudgetHold>;
  /** Releases a hold for a call that ended without a log row. */
  release(practiceId: string, holdId: string): Promise<void>;
  /** The completed call logged under the idempotency key, if one is. */
  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null>;
  /** Writes the row, and releases the call's hold with it; returns its ID. */
  record(record: ModelCallRecord, holdId?: string | null): Promise<string>;
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
  /** The holds standing, by ID. */
  readonly holds = new Map<string, { readonly practiceId: string; readonly amountMicro: bigint; readonly expiresAt: Date }>();
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

  /** One step of the event loop, as one transaction under the practice's lock is. */
  hold(practiceId: string, request: BudgetHoldRequest): Promise<BudgetHold> {
    const now = this.now();
    for (const [id, held] of this.holds) {
      if (held.expiresAt <= now) {
        this.holds.delete(id);
      }
    }
    const held = [...this.holds.values()].filter((entry) => entry.practiceId === practiceId).reduce((sum, entry) => sum + entry.amountMicro, 0n);
    const spent = this.calls.filter((call) => call.practiceId === practiceId && call.createdAt >= request.since).reduce((sum, call) => sum + call.costMicroCents, 0n) + held;
    if (spent >= request.budgetMicro) {
      return Promise.resolve({ holdId: null, spent });
    }
    const holdId = randomUUID();
    this.holds.set(holdId, { practiceId, amountMicro: request.amountMicro, expiresAt: new Date(now.getTime() + request.holdMs) });
    return Promise.resolve({ holdId, spent });
  }

  release(_practiceId: string, holdId: string): Promise<void> {
    this.holds.delete(holdId);
    return Promise.resolve();
  }

  completedCall(practiceId: string | null, idempotencyKey: string): Promise<string | null> {
    return Promise.resolve(this.calls.find((call) => call.practiceId === practiceId && call.idempotencyKey === idempotencyKey && call.outcome === 'completed')?.id ?? null);
  }

  record(record: ModelCallRecord, holdId: string | null = null): Promise<string> {
    const id = randomUUID();
    this.calls.push({ ...record, id, createdAt: this.now() });
    if (holdId !== null) {
      this.holds.delete(holdId);
    }
    return Promise.resolve(id);
  }
}
