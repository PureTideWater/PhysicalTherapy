import { randomUUID } from 'node:crypto';

import { OWNER_ROLE, type ScopeClient, type ScopePool, withJobScope } from '@tp/db';
import { type RuleRelease, indexRelease } from '@tp/pricing';
import { completeRuns, memoryReleaseSource, runReleaseImpact } from '@tp/worker/pricing';

import type { AffectedRun, PricingRunSource, RunsImpact } from './impact';

/**
 * The dry run's runs: every complete pricing run in a database, each priced in memory under the release
 * being tried (@tp/worker/pricing's runReleaseImpact, the engine the price job runs), nothing written
 * but the audit events of the reads. The pool's connections act as the owner role (as release:load
 * does): it lists the practices, and each practice is then read in a scope of its own, one practice at
 * a time, under the practice's policies, with every claim read audited (purpose release_impact) in the
 * dry run's name, an opaque ID printed with the result.
 */

export interface DatabaseRunsOptions {
  readonly claimsPerBatch?: number;
  /** The actor of every read: one ID per dry run. */
  readonly dryRunId?: string;
}

/** A pool whose connections all act as the owner role. */
export function ownerPool<C extends ScopeClient>(pool: ScopePool<C>): ScopePool<C> {
  return {
    connect: async () => {
      const client = await pool.connect();
      try {
        await client.query(`SET ROLE ${OWNER_ROLE}`);
      } catch (error) {
        client.release(true);
        throw error;
      }
      return client;
    },
  };
}

export function databaseRuns<C extends ScopeClient>(pool: ScopePool<C>, options: DatabaseRunsOptions = {}): PricingRunSource & { readonly dryRunId: string } {
  const dryRunId = options.dryRunId ?? randomUUID();
  const owner = ownerPool(pool);
  return {
    dryRunId,
    description: `Pricing runs in the database (dry run ${dryRunId})`,
    async affectedRuns(release: RuleRelease): Promise<RunsImpact> {
      // The candidate from files, read through the same keyed contract as a stored release: a missed key is just as loud.
      const candidate = memoryReleaseSource(indexRelease(release));
      const client = await owner.connect();
      let practices: string[];
      try {
        practices = (await client.query<{ id: string }>('SELECT id FROM practice ORDER BY id')).rows.map((row) => row.id);
      } finally {
        client.release();
      }
      const affected: AffectedRun[] = [];
      let runsChecked = 0;
      for (const practiceId of practices) {
        await withJobScope(owner, { jobId: dryRunId, practiceId }, async (scope) => {
          for (const run of await completeRuns(scope, practiceId, dryRunId)) {
            runsChecked += 1;
            const impact = await runReleaseImpact(scope, run, candidate, dryRunId, { claimsPerBatch: options.claimsPerBatch });
            if (impact.changedLines > 0) {
              affected.push({ runId: run.id, practiceId, releaseNo: run.releaseNo, lines: impact.lines, changedLines: impact.changedLines });
            }
          }
        });
      }
      return { runsChecked, affected };
    },
  };
}
