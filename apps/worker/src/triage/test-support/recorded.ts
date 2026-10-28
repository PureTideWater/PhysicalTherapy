import { randomUUID } from 'node:crypto';

import { type PracticeScope, type ScopeClient, withJobScope } from '@tp/db';
import { createLogger } from '@tp/observability';

import type { TriageJobContext } from '../execute';
import type { TriageWorld } from './triage-world';

/**
 * For the tests (CAS-41, SUITE-CAP-1a; docs/adr/0083): a job's reads and writes recorded, so a job can be compared with
 * the reference it replaces on the same rows. A reference runs in a job-scope transaction that is rolled back, so the
 * job then starts from the same rows; both record the audit events their reads insert (one per row read, by the
 * statement readWithAudit sends), and the rows triage leaves are read back by `snapshot` without their generated IDs
 * and times. Synthetic data only.
 */

/** One audit event a read inserts, as the audit trail stores it (its actor and request aside). */
export interface ReadEvent {
  readonly actor_kind: string;
  readonly action: string;
  readonly object_type: string;
  readonly object_id: string;
  readonly practice_id: string;
  readonly purpose: string;
  readonly grant_id: string | null;
}

const byEvent = (a: ReadEvent, b: ReadEvent) => (a.object_type + a.purpose + a.object_id < b.object_type + b.purpose + b.object_id ? -1 : a.object_type + a.purpose + a.object_id > b.object_type + b.purpose + b.object_id ? 1 : 0);

/** Events in one order, whatever order the reads inserted them in: the set (with repeats) the tests compare. */
export const sortedEvents = (events: readonly ReadEvent[]): ReadEvent[] => [...events].sort(byEvent);

const bound = <T extends object>(target: T, key: string | symbol): unknown => {
  const value: unknown = Reflect.get(target, key, target);
  return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
};

/**
 * The scope with its client's audit inserts recorded into `events`: each row of readWithAudit's statement (actor,
 * kind, action, object type, purpose, request, then the objects, practices and grants as arrays) is one event.
 */
export function recordingScope(scope: PracticeScope<ScopeClient>, events: ReadEvent[]): PracticeScope<ScopeClient> {
  const client = new Proxy(scope.client, {
    get(target, key) {
      if (key !== 'query') {
        return bound(target, key);
      }
      return (...args: unknown[]) => {
        const [text, values] = args;
        if (typeof text === 'string' && text.trimStart().startsWith('INSERT INTO audit_event') && Array.isArray(values) && values.length === 9) {
          const [, actorKind, action, objectType, purpose, , objectIds, practiceIds, grantIds] = values as [unknown, string, string, string, string, unknown, string[], string[], (string | null)[]];
          for (const [index, objectId] of objectIds.entries()) {
            events.push({ actor_kind: actorKind, action, object_type: objectType, object_id: objectId, practice_id: practiceIds[index] as string, purpose, grant_id: grantIds[index] ?? null });
          }
        }
        return (target.query as (...query: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  return new Proxy(scope, { get: (target, key) => (key === 'client' ? client : bound(target, key)) });
}

/** A job's context in the practice's job scope on the worker's login, as the pricing world's, with its reads' audit events recorded. */
export function recordingContext(world: TriageWorld, practiceId: string, events: ReadEvent[]): TriageJobContext & { readonly enqueue: () => Promise<null>; readonly lastAttempt: boolean } {
  const jobId = randomUUID();
  return {
    jobId,
    logger: createLogger({ sink: () => undefined }),
    transaction: (work) => withJobScope(world.pricing.worker, { jobId, practiceId }, (scope) => work(recordingScope(scope, events))),
    enqueue: () => Promise.resolve(null),
    lastAttempt: false,
  };
}

class RolledBack extends Error {
  override readonly name = 'RolledBack';
}

/** Runs `work` in a job-scope transaction of the practice, recording its reads' audit events, and rolls the transaction back. */
export async function rolledBack<T>(world: TriageWorld, practiceId: string, work: (scope: PracticeScope<ScopeClient>, requestId: string) => Promise<T>): Promise<{ readonly result: T; readonly events: ReadEvent[] }> {
  const events: ReadEvent[] = [];
  const context = recordingContext(world, practiceId, events);
  let result: { value: T } | undefined;
  try {
    await context.transaction(async (scope) => {
      result = { value: await work(scope, context.jobId) };
      throw new RolledBack('the reference leaves nothing behind');
    });
  } catch (error) {
    if (!(error instanceof RolledBack)) {
      throw error;
    }
  }
  if (result === undefined) {
    throw new Error('the reference did not run');
  }
  return { result: result.value, events };
}

/** The audit events stored for a request (a job's ID), read as the superuser. */
export async function storedEvents(world: TriageWorld, requestId: string): Promise<ReadEvent[]> {
  const { rows } = await world.owner.query<ReadEvent & object>(
    "SELECT actor_kind, action, object_type, object_id::text, practice_id::text, purpose, grant_id::text FROM audit_event WHERE request_id = $1 AND action = 'read'",
    [requestId],
  );
  return sortedEvents(rows);
}

/** What triage leaves in the practice, without generated IDs or times: its stage events in order, its cases by pattern, their lines and its anomalies. */
export async function snapshot(client: ScopeClient, practiceId: string): Promise<unknown> {
  const rows = async (sql: string) => (await client.query(sql, [practiceId])).rows;
  return {
    stages: await rows('SELECT service_line_id, stage, priced_line_id, reopened_from FROM line_status WHERE practice_id = $1 ORDER BY seq'),
    cases: await rows(
      `SELECT pattern_key, payer_id, plan_id, rate_record_id, state, actionable_cents::text, deadline_on::text, materiality_cents::text, pursuit_cost_cents::text
         FROM "case" WHERE practice_id = $1 ORDER BY pattern_key::text, opened_at`,
    ),
    caseLines: await rows(
      `SELECT c.pattern_key::text AS pattern, cl.service_line_id, cl.priced_line_id, cl.written_off_reason, cl.written_off_by, cl.actionable
         FROM case_line cl JOIN "case" c ON c.id = cl.case_id WHERE cl.practice_id = $1 ORDER BY c.pattern_key::text, cl.service_line_id`,
    ),
    anomalies: await rows('SELECT pricing_run_id, cohort_key, cohort_size, modal_allowed_cents::text, stats, line_ids FROM anomaly WHERE practice_id = $1 ORDER BY pricing_run_id, cohort_key::text'),
  };
}
