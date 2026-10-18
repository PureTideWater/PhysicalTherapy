import { type OperatorPool, asOperator, expireBatch } from './operator';

/**
 * The screening_expiry platform job (Change Order 001, CO-04: "results expire after 30 days (a platform job deletes
 * them)"; docs/adr/0062), nightly at 03:35 UTC: deletes every screening whose 30 days have passed, its prospect,
 * upload, run and rows together, each prospect an audit event, 1,000 prospects a transaction until a batch takes
 * fewer. The reads refuse a run from its expires_at on whenever this runs, so a late night changes nothing anyone
 * sees. A conversion's audit request and its audit event stay.
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
}

export async function expireScreenings(dependencies: ExpiryDependencies): Promise<ExpiryResult> {
  let prospects = 0;
  let runs = 0;
  for (;;) {
    const batch = await asOperator(dependencies.operator, (client) => expireBatch(client, EXPIRY_BATCH, dependencies.jobId));
    prospects += batch.prospects;
    runs += batch.runs;
    if (batch.prospects < EXPIRY_BATCH) {
      return { prospects, runs };
    }
  }
}
