import type { JobType } from '../jobs/registry';

/**
 * Suspension in the job chain (PRD 5, J18: "suspend new runs ... while leaving data readable"; PRD 6,
 * Billing acceptance: "a suspended organization can read but not run"; docs/adr/0050). The jobs that start
 * new work on their own (the monitor that plans pricing runs, the reconcile, the digest) and the packet
 * export ask the database first and, while the practice's organization may not start new work, do nothing:
 * the attempt is recorded as refused with the reason's code, never retried and never alerted. The daily
 * schedule queues the monitor, reconcile and digest again each day, so they pick up where they stopped once
 * the invoice is paid. A job serving work created before the suspension (an upload's intake and parse, a
 * run's pricing and triage, a report or statement's printing) finishes it; the database refuses creating new
 * work while it lasts.
 */
export const RUN_STARTING_JOBS: readonly JobType[] = ['monitor', 'reconcile', 'digest', 'packet_export'];

/** The code a refused job's run records. */
export const SUSPENDED_ERROR_CODE = 'ORGANIZATION_SUSPENDED';

export function startsRun(type: JobType): boolean {
  return RUN_STARTING_JOBS.includes(type);
}

interface RefusalClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Why the practice's organization may not start new work now, or null (the practice must be in the scope). */
export async function practiceRunRefusal(client: RefusalClient, practiceId: string): Promise<string | null> {
  const { rows } = await client.query('SELECT practice_run_refusal($1) AS reason', [practiceId]);
  return (rows[0] as { reason: string | null } | undefined)?.reason ?? null;
}
