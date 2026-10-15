import type { ScopeClient } from '@tp/db/runtime';

/**
 * Why a run would price differently if run again (PRD 5, J6: "a wrong mapping is corrected by a new
 * mapping ... prior pricing runs stay as they were, and a re-run is offered"; J17: "runs pinned to
 * older releases are unchanged"; test matrix MAP-03). A run never changes; what changed since it was
 * created is a new mapping of the practice's plans, a newer published rule release, or a contract
 * version signed off, and each is a reason to offer a new run for the same period. Which lines would
 * change (the re-run diff) is the release pipeline's dry run and the comparison of two runs.
 */

export const RERUN_REASONS = ['mapping_changed', 'release_published', 'version_signed_off'] as const;
export type RerunReason = (typeof RERUN_REASONS)[number];

export interface RunSince {
  readonly practiceId: string;
  readonly createdAt: Date;
  readonly releaseNo: number;
}

export async function rerunReasons(client: ScopeClient, run: RunSince): Promise<RerunReason[]> {
  const { rows } = await client.query<Record<RerunReason, boolean>>(
    `SELECT EXISTS (SELECT 1 FROM payer_plan_mapping m WHERE m.practice_id = $1 AND m.created_at > $2) AS mapping_changed,
            EXISTS (SELECT 1 FROM rule_release r WHERE r.published_at IS NOT NULL AND r.release_no > $3) AS release_published,
            EXISTS (SELECT 1 FROM contract_version v WHERE v.practice_id = $1 AND v.signed_off_at > $2) AS version_signed_off`,
    [run.practiceId, run.createdAt, run.releaseNo],
  );
  const found = rows[0];
  return RERUN_REASONS.filter((reason) => found?.[reason] === true);
}
