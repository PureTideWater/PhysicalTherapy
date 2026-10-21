import { type OperatorPool, asOperator, expireBatch } from './operator';

/**
 * The screening_expiry platform job (Change Order 001, CO-04: "results expire after 30 days (a platform job deletes
 * them)"; docs/adr/0062), nightly at 03:35 UTC: deletes every screening whose 30 days have passed, its prospect,
 * upload, run and rows together, each prospect an audit event, and every kept summary (screening_lead, with its
 * products) whose 12 months have passed, each an audit event, 1,000 of each a transaction until a batch takes fewer
 * of both. The reads refuse a run from its expires_at on whenever this runs, so a late night changes nothing anyone
 * sees. A screening's counts-only outcome stays, unlinked (the founder's ruling of 2026-10-20 amending CO-04), as do a
 * conversion's audit request and its audit event.
 */

export const EXPIRY_BATCH = 1000;

export interface ExpiryDependencies {
  readonly operator: OperatorPool;
  /** The job's ID: the audit events' request_id. */
  readonly jobId: string;
}

export interface ExpiryResult {
  readonly prospects: number;
  readonly runs: number;
  /** Kept summaries deleted past their 12 months. */
  readonly leads: number;
}

export async function expireScreenings(dependencies: ExpiryDependencies): Promise<ExpiryResult> {
  let prospects = 0;
  let runs = 0;
  let leads = 0;
  for (;;) {
    const batch = await asOperator(dependencies.operator, (client) => expireBatch(client, EXPIRY_BATCH, dependencies.jobId));
    prospects += batch.prospects;
    runs += batch.runs;
    leads += batch.leads;
    if (batch.prospects < EXPIRY_BATCH && batch.leads < EXPIRY_BATCH) {
      return { prospects, runs, leads };
    }
  }
}
