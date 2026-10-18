import type { PracticeScope, ScopeClient } from '@tp/db/runtime';

import { type CreatedPricingRun, recordRun } from './create';
import { RuleReleaseMismatchError, currentReleaseNo } from './release';

/**
 * Re-runs (PRD 5, J6: "a wrong mapping is corrected by a new mapping ... prior pricing runs stay as
 * they were, and a re-run is offered"; J17: "runs pinned to older releases are unchanged, and a re-run
 * under the new release lists exactly which lines would change before anyone accepts it"; PRD 7,
 * Pricing runs; PRD 9, The release pipeline step 4; test matrix MAP-03, PRC-19; docs/adr/0037).
 *
 * - Why a complete run would price differently if priced again (rerunReasons): a new mapping of the
 *   practice's plans, a contract version signed off, a newer rule release in force, or the run's own
 *   release withdrawn by a content rollback (the run is flagged, never changed).
 * - A re-run (createRerun) is a new run of the same practice and period, pinned to the release in force
 *   and this engine, that prices exactly the lines the original priced: it keeps the original's cut-off
 *   (lines loaded after the original was created are not the re-run's), so the two compare line for
 *   line. The original never changes. The database holds the same rules.
 * - A re-run is in effect only once a person accepts it (acceptRun), having seen its diff (diff.ts):
 *   once, by the person acting, never for a run pinned to a withdrawn release. Accepting changes nothing
 *   the run priced.
 */

export const RERUN_REASONS = ['mapping_changed', 'release_published', 'release_withdrawn', 'version_signed_off'] as const;
export type RerunReason = (typeof RERUN_REASONS)[number];

export interface RunSince {
  readonly practiceId: string;
  readonly createdAt: Date;
  readonly releaseNo: number;
}

export async function rerunReasons(client: ScopeClient, run: RunSince): Promise<RerunReason[]> {
  const { rows } = await client.query<Record<RerunReason, boolean>>(
    `SELECT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.practice_id = $1 AND m.created_at > $2) AS mapping_changed,
            coalesce(current_rule_release() > $3, false) AS release_published,
            EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = $3) AS release_withdrawn,
            EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = $1 AND v.signed_off_at > $2) AS version_signed_off`,
    [run.practiceId, run.createdAt, run.releaseNo],
  );
  const found = rows[0];
  return RERUN_REASONS.filter((reason) => found?.[reason] === true);
}

/** A re-run or an acceptance the plan does not allow. Messages name the state, never a value. */
export class RerunRefusedError extends Error {
  override readonly name = 'RerunRefusedError';

  constructor(
    readonly reason: 'not_found' | 'not_complete' | 'not_rerun' | 'release_withdrawn',
    message: string,
  ) {
    super(message);
  }
}

export interface CreateRerunInput {
  readonly practiceId: string;
  /** The complete run to price again. */
  readonly pricingRunId: string;
  /** The release the screen showed as in force; anything else is a rule-release mismatch. */
  readonly releaseNo: number;
  readonly requestId: string;
}

export interface CreatedRerun extends CreatedPricingRun {
  readonly rerunOfId: string;
}

interface OriginalRow {
  readonly status: string;
  readonly period_from: string;
  readonly period_to: string;
}

/**
 * Records a re-run of a complete run, queued, in the creator's scope (the caller queues its price job),
 * refused for a release that is not the one in force. Its lines are the original's, whose plans were
 * all mapped when it was created and stay mapped (a mapping is corrected, never removed); the price
 * job checks MAP-01 again when it executes the re-run, as it does for every run.
 */
export async function createRerun(scope: PracticeScope<ScopeClient>, input: CreateRerunInput): Promise<CreatedRerun> {
  const { rows } = await scope.client.query<OriginalRow>(
    'SELECT status, period_from::text AS period_from, period_to::text AS period_to FROM pricing_run WHERE id = $1 AND practice_id = $2',
    [input.pricingRunId, input.practiceId],
  );
  const original = rows[0];
  if (original === undefined) {
    throw new RerunRefusedError('not_found', 'the run to price again is not one of the practice’s runs');
  }
  if (original.status !== 'complete') {
    throw new RerunRefusedError('not_complete', 'only a complete run is priced again; this one has not completed');
  }
  const current = await currentReleaseNo(scope.client);
  if (current === null || current !== input.releaseNo) {
    throw new RuleReleaseMismatchError(input.releaseNo, current);
  }
  const created = await recordRun(scope, {
    practiceId: input.practiceId,
    periodFrom: original.period_from,
    periodTo: original.period_to,
    releaseNo: input.releaseNo,
    rerunOf: input.pricingRunId,
  });
  return { ...created, rerunOfId: input.pricingRunId };
}

export interface AcceptRunInput {
  readonly practiceId: string;
  readonly pricingRunId: string;
}

export interface AcceptedRun {
  readonly pricingRunId: string;
  readonly acceptedAt: Date;
  readonly acceptedBy: string;
  /** It was accepted before this request: nothing changed. */
  readonly alreadyAccepted: boolean;
}

interface AcceptRow {
  readonly status: string;
  readonly rerun_of_id: string | null;
  readonly accepted_at: Date | null;
  readonly accepted_by: string | null;
  readonly withdrawn: boolean;
}

/**
 * Accepts a complete re-run in the actor's name, so it is in effect from now on (Claims and lines,
 * Coverage and the line trace read it in place of the run it prices again). Accepting it again changes
 * nothing. The database checks the same, and that the actor may map plans (mapping.edit).
 */
export async function acceptRun(scope: PracticeScope<ScopeClient>, input: AcceptRunInput): Promise<AcceptedRun> {
  const { rows } = await scope.client.query<AcceptRow>(
    `SELECT r.status, r.rerun_of_id, r.accepted_at, r.accepted_by,
            EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no) AS withdrawn
       FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2 FOR UPDATE`,
    [input.pricingRunId, input.practiceId],
  );
  const run = rows[0];
  if (run === undefined) {
    throw new RerunRefusedError('not_found', 'the run to accept is not one of the practice’s runs');
  }
  if (run.rerun_of_id === null) {
    throw new RerunRefusedError('not_rerun', 'only a re-run is accepted; a first run of a period is in effect when it completes');
  }
  if (run.status !== 'complete') {
    throw new RerunRefusedError('not_complete', 'a re-run is accepted once it is complete and its diff can be read');
  }
  if (run.accepted_at !== null && run.accepted_by !== null) {
    return { pricingRunId: input.pricingRunId, acceptedAt: run.accepted_at, acceptedBy: run.accepted_by, alreadyAccepted: true };
  }
  if (run.withdrawn) {
    throw new RerunRefusedError('release_withdrawn', 'the re-run is pinned to a withdrawn rule release; price the run again under the release in force');
  }
  const { rows: accepted } = await scope.client.query<{ accepted_at: Date }>(
    'UPDATE pricing_run SET accepted_by = $3, accepted_at = now() WHERE id = $1 AND practice_id = $2 AND accepted_at IS NULL RETURNING accepted_at',
    [input.pricingRunId, input.practiceId, scope.actorId],
  );
  const acceptedAt = accepted[0]?.accepted_at;
  if (acceptedAt === undefined) {
    throw new Error('the re-run was not accepted');
  }
  return { pricingRunId: input.pricingRunId, acceptedAt, acceptedBy: scope.actorId, alreadyAccepted: false };
}
