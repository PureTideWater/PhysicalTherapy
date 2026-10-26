import type { PracticeScope, ScopeClient } from '@tp/db/runtime';

import { type CreatedPricingRun, recordRun } from './create';
import { acceptanceHeldBy } from './diff';
import { ELIGIBLE_RUN, NEWER_RUN_PENDING, OVERLAPPING_FIRST_RUN, RERUN_SUPERSEDED, RUN_IN_EFFECT, SUPERSEDES_RERUN_OF_PERIOD, TOOK_EFFECT_MEANWHILE } from './in-effect';
import { RuleReleaseMismatchError, currentReleaseNo } from './release';

/**
 * Re-runs (PRD 5, J6: "a wrong mapping is corrected by a new mapping ... prior pricing runs stay as
 * they were, and a re-run is offered"; J17: "runs pinned to older releases are unchanged, and a re-run
 * under the new release lists exactly which lines would change before anyone accepts it"; PRD 7,
 * Pricing runs; PRD 9, The release pipeline step 4; test matrix MAP-03, PRC-19, PRC-25 to PRC-28;
 * docs/adr/0037 and its amendment of 2026-10-26, combined audit #10).
 *
 * - Why a complete run would price differently if priced again (rerunReasons): a new mapping of the
 *   practice's plans, a contract version signed off, a newer rule release in force, or the run's own
 *   release withdrawn by a content rollback (the run is flagged, never changed).
 * - A re-run (createRerun) prices again the run in effect for its period: a new run of the same practice
 *   and period, pinned to the release in force and this engine, that prices exactly the lines the
 *   original priced: it keeps the original's cut-off (lines loaded after the original was created are
 *   not the re-run's), so the two compare line for line. The original never changes. A run already
 *   replaced, or a re-run nobody accepted, is not re-run (its diff would not be against the pricing a
 *   person replaces; the run in effect is re-run instead), nor any run while a first run of overlapping
 *   dates is queued or being priced (the re-run would be superseded as soon as that run completes).
 * - A re-run is in effect only once a person accepts it (acceptRun), having seen its diff (diff.ts) against
 *   the run it replaces, which the acceptance names (it replaces no other): once, by the person acting,
 *   never for a run pinned to a withdrawn release, and only while nothing in effect for overlapping service
 *   dates is newer than it (rerunBlock; in-effect.ts): accepting an older re-run over newer pricing would
 *   take a late line's pricing out of effect or put older pricing back on a line. The check runs under the practice's pricing_current lock at READ COMMITTED, so two
 *   acceptances, or an acceptance and a completion, never both pass on what the other has not yet
 *   committed. Accepting changes nothing the run priced.
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

/**
 * Why a re-run or an acceptance is refused. superseded: something in effect for overlapping service dates is
 * newer than the re-run; newer_run_pending: a first run of overlapping dates is being priced (or, for a new
 * re-run, queued); changed_meanwhile: a run of overlapping dates took effect while the acceptance waited, so
 * a new attempt judges it; diff_changed: the pricing the acceptance would replace is no longer what the person's
 * diff was against (another run replaced, or other runs holding its lines); not_in_effect: only the run in effect for its period is re-run.
 */
export const RERUN_REFUSALS = ['not_found', 'not_complete', 'not_rerun', 'release_withdrawn', 'superseded', 'newer_run_pending', 'changed_meanwhile', 'diff_changed', 'not_in_effect'] as const;
export type RerunRefusal = (typeof RERUN_REFUSALS)[number];

/**
 * A re-run or an acceptance the plan does not allow. Messages name the state, never a value, and read after the
 * form's label: an acceptance's after "This re-run: ", a re-run's after "This run: ".
 */
export class RerunRefusedError extends Error {
  override readonly name = 'RerunRefusedError';

  constructor(
    readonly reason: RerunRefusal,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Whether a complete re-run can be accepted now, with the runs a page names (rerunBlock). acceptable: what
 * the acceptance replaces, the run in effect for the re-run's exact period (its original, or a run of that
 * period that took effect after it but is not newer), which the page diffs against. superseded: whether the
 * original is eligible (false for a re-run of a re-run nobody accepted, left from before this rule), the
 * superseding runs of the same period and of other periods (each newest first), and the run in effect for the
 * re-run's exact period, which the page offers to re-run. newer_run_pending: the first runs of overlapping
 * periods being priced, oldest first.
 */
export type RerunBlock =
  | { readonly state: 'acceptable'; readonly replacesId: string }
  | {
      readonly state: 'superseded';
      readonly originalEligible: boolean;
      readonly samePeriodIds: readonly string[];
      readonly otherPeriodIds: readonly string[];
      readonly inEffectId: string | null;
    }
  | { readonly state: 'newer_run_pending'; readonly runningIds: readonly string[] };

/** Which wording a superseded re-run takes (docs/adr/0037, amendment of 2026-10-26): its original never in effect, a newer run of its own period, or a run of other dates. */
export type SupersededKind = 'original_not_in_effect' | 'same_period' | 'other_period';

/** The kind of a superseded block, the one choice the worker's refusal and the pages share. */
export function supersededKind(block: Extract<RerunBlock, { state: 'superseded' }>): SupersededKind {
  if (!block.originalEligible) {
    return 'original_not_in_effect';
  }
  return block.samePeriodIds.length > 0 ? 'same_period' : 'other_period';
}

/** The refusal's text for each kind, after the form's label "This re-run: ". */
const SUPERSEDED_MESSAGES: Readonly<Record<SupersededKind, string>> = {
  same_period: 'can no longer be accepted, because a newer run of these service dates is in effect; the page is updated to name it',
  other_period: 'can no longer be accepted, because a run of some of these service dates holds newer pricing; re-run the run in effect for these service dates',
  original_not_in_effect: 'can no longer be accepted, because the run it prices again was never in effect; re-run the run in effect for these service dates',
};

/** The refusals rerunBlock shares with acceptRun and createRerun, after the form's label. */
const NOT_FOUND = 'is not one of the practice’s runs';
const NOT_RERUN = 'is a first run of its service dates, in effect once it completes; only a re-run is accepted';
const NOT_COMPLETE = 'has not completed yet; a re-run is accepted once it is complete and its changes can be read';
const DIFF_CHANGED = 'was not accepted, because the pricing it would replace has changed since its changes were shown; check the changes again and accept it if it is still offered';

interface BlockRow {
  readonly status: string;
  readonly rerun_of_id: string | null;
  readonly superseded: boolean;
  readonly original_eligible: boolean;
  readonly same_period_ids: string[];
  readonly other_period_ids: string[];
  readonly in_effect_id: string | null;
  readonly running_ids: string[];
}

/**
 * Whether a complete re-run can be accepted now, with the runs to name, read in the caller's scope in one
 * statement (in-effect.ts's fragments, the same RERUN_SUPERSEDED and NEWER_RUN_RUNNING the pages' run columns
 * read). Superseded wins over pending: its remedy is the one that lasts. It does not judge the re-run's own
 * state beyond being complete (acceptRun refuses an accepted or withdrawn one first), nor a run that took effect
 * during the caller's transaction (acceptRun's TOOK_EFFECT_MEANWHILE). A run that is not the practice's, not a
 * re-run or not complete is refused as acceptRun refuses it.
 */
export async function rerunBlock(client: ScopeClient, practiceId: string, rerunId: string): Promise<RerunBlock> {
  const { rows } = await client.query<BlockRow>(
    `SELECT r.status, r.rerun_of_id, ${RERUN_SUPERSEDED('r')} AS superseded,
            coalesce((SELECT ${ELIGIBLE_RUN('o')} FROM pricing_run o WHERE o.id = r.rerun_of_id AND o.practice_id = r.practice_id), false) AS original_eligible,
            ARRAY(SELECT x.id FROM pricing_run x JOIN pricing_run o ON o.id = r.rerun_of_id AND o.practice_id = r.practice_id
                   WHERE x.practice_id = r.practice_id AND ${SUPERSEDES_RERUN_OF_PERIOD('x', 'r', 'o', true)}
                   ORDER BY coalesce(x.accepted_at, x.completed_at) DESC, x.id DESC)::text[] AS same_period_ids,
            ARRAY(SELECT x.id FROM pricing_run x JOIN pricing_run o ON o.id = r.rerun_of_id AND o.practice_id = r.practice_id
                   WHERE x.practice_id = r.practice_id AND ${SUPERSEDES_RERUN_OF_PERIOD('x', 'r', 'o', false)}
                   ORDER BY coalesce(x.accepted_at, x.completed_at) DESC, x.id DESC)::text[] AS other_period_ids,
            (SELECT e.id FROM pricing_run e
              WHERE e.practice_id = r.practice_id AND e.period_from = r.period_from AND e.period_to = r.period_to AND ${RUN_IN_EFFECT('e')}) AS in_effect_id,
            ARRAY(SELECT x.id FROM pricing_run x WHERE ${OVERLAPPING_FIRST_RUN('x', 'r', ['running'])} ORDER BY x.created_at, x.id)::text[] AS running_ids
       FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2`,
    [rerunId, practiceId],
  );
  const run = rows[0];
  if (run === undefined) {
    throw new RerunRefusedError('not_found', NOT_FOUND);
  }
  if (run.rerun_of_id === null) {
    throw new RerunRefusedError('not_rerun', NOT_RERUN);
  }
  if (run.status !== 'complete') {
    throw new RerunRefusedError('not_complete', NOT_COMPLETE);
  }
  if (run.superseded) {
    return {
      state: 'superseded',
      originalEligible: run.original_eligible,
      samePeriodIds: run.same_period_ids,
      otherPeriodIds: run.other_period_ids,
      inEffectId: run.in_effect_id,
    };
  }
  if (run.running_ids.length > 0) {
    return { state: 'newer_run_pending', runningIds: run.running_ids };
  }
  if (run.in_effect_id === null) {
    // Not superseded means the original is eligible, so some run of the period is in effect.
    throw new Error('no run is in effect for the period of a re-run that is not superseded');
  }
  return { state: 'acceptable', replacesId: run.in_effect_id };
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
  readonly in_effect: boolean;
  readonly newer_run_pending: boolean;
}

/**
 * Records a re-run of the run in effect for its period, queued, in the creator's scope (the caller queues
 * its price job). Refused, in this order: a run that is not complete; one that is no longer in effect (a
 * later run or an accepted re-run replaced it) or never was (a re-run nobody accepted), whose re-run's diff
 * would not be against the pricing a person replaces (PRC-28); while a first run of overlapping dates is
 * queued or being priced (PRC-27), since it would supersede the re-run as soon as it completes; and a release
 * that is not the one in force. No lock: a re-run created beside a completion is judged when it is accepted,
 * under the lock. Its lines are the original's, whose plans were all mapped when it was created and stay
 * mapped (a mapping is corrected, never removed); the price job checks MAP-01 again when it executes the
 * re-run, as it does for every run.
 */
export async function createRerun(scope: PracticeScope<ScopeClient>, input: CreateRerunInput): Promise<CreatedRerun> {
  const { rows } = await scope.client.query<OriginalRow>(
    `SELECT r.status, r.period_from::text AS period_from, r.period_to::text AS period_to, ${RUN_IN_EFFECT('r')} AS in_effect, ${NEWER_RUN_PENDING('r')} AS newer_run_pending
       FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2`,
    [input.pricingRunId, input.practiceId],
  );
  const original = rows[0];
  if (original === undefined) {
    throw new RerunRefusedError('not_found', NOT_FOUND);
  }
  if (original.status !== 'complete') {
    throw new RerunRefusedError('not_complete', 'has not completed, and only a complete run is priced again');
  }
  if (!original.in_effect) {
    throw new RerunRefusedError('not_in_effect', 'is not the run in effect for its service dates, so it is not priced again; re-run the run in effect instead');
  }
  if (original.newer_run_pending) {
    throw new RerunRefusedError('newer_run_pending', 'is not priced again yet, because a newer run of these service dates is waiting to be priced or being priced; once it finishes, re-run the run in effect');
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
  /**
   * The run the person's diff was against: the run acceptance replaces as the page showed it (rerunBlock's
   * replacesId when the page was read). Accepting replaces only that run (J17: the diff a person accepts is the
   * change accepting makes); when another run has taken its place since, the acceptance is refused (diff_changed).
   */
  readonly replacesId: string;
  /**
   * The runs of other service dates whose pricing in effect that diff read (compareAcceptance's heldBy, by ID; none
   * when every line's pricing in effect was the replaced run's). Accepting changes exactly what the person saw only
   * while they are the same runs (acceptanceHeldBy); otherwise the acceptance is refused (diff_changed).
   */
  readonly heldByIds: readonly string[];
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

/** The isolation acceptRun needs: each statement after the lock reads what committed before it was granted. */
const READ_COMMITTED = 'read committed';

/**
 * Accepts a complete re-run in the actor's name, so it is in effect from now on (Claims and lines,
 * Coverage and the line trace read it in place of the run it prices again). Accepting it again changes
 * nothing, whatever replacesId and heldByIds say. Refused for a run pinned to a withdrawn release, and while it is
 * superseded (something in effect for overlapping service dates is newer), while a first run of overlapping
 * dates is being priced, when a run of overlapping dates took effect while this transaction waited (its
 * accepted_at would rank before that run; a new attempt judges it), and when the run it would replace is not
 * the one the person's diff was against, or other runs hold its lines than the diff read (replacesId and
 * heldByIds: an acceptance replaces only what the person saw). The checks run under the practice's pricing_current lock, the one every acceptance and completion takes at its
 * UPDATE (the database's pricing_current_change_lock()), taken first in a statement of its own at READ
 * COMMITTED, so each later statement reads every acceptance and completion that committed before it: an
 * earlier snapshot would read past one, so any other isolation is a programming fault, refused before anything
 * is read. Lock order: the advisory lock, then the re-run's row;
 * a completion holds its own run's row, then the lock, and neither needs the other's row, so nothing waits
 * in a cycle. The database checks the withdrawn release, and that the actor may map plans (mapping.edit).
 */
export async function acceptRun(scope: PracticeScope<ScopeClient>, input: AcceptRunInput): Promise<AcceptedRun> {
  const { rows: isolation } = await scope.client.query<{ level: string }>("SELECT current_setting('transaction_isolation') AS level");
  if (isolation[0]?.level !== READ_COMMITTED) {
    throw new Error('a re-run is accepted at READ COMMITTED only: an earlier snapshot would read past a change made since');
  }
  // The canonical text of the practice ID, as the trigger hashes NEW.practice_id::text.
  await scope.client.query("SELECT pg_advisory_xact_lock(hashtextextended('pricing_current:' || $1::uuid::text, 0))", [input.practiceId]);
  const { rows } = await scope.client.query<AcceptRow>(
    `SELECT r.status, r.rerun_of_id, r.accepted_at, r.accepted_by,
            EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = r.release_no) AS withdrawn
       FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2 FOR UPDATE`,
    [input.pricingRunId, input.practiceId],
  );
  const run = rows[0];
  if (run === undefined) {
    throw new RerunRefusedError('not_found', NOT_FOUND);
  }
  if (run.rerun_of_id === null) {
    throw new RerunRefusedError('not_rerun', NOT_RERUN);
  }
  if (run.status !== 'complete') {
    throw new RerunRefusedError('not_complete', NOT_COMPLETE);
  }
  if (run.accepted_at !== null && run.accepted_by !== null) {
    return { pricingRunId: input.pricingRunId, acceptedAt: run.accepted_at, acceptedBy: run.accepted_by, alreadyAccepted: true };
  }
  if (run.withdrawn) {
    throw new RerunRefusedError('release_withdrawn', 'is pinned to a withdrawn rule release, so it is not accepted; re-run the run in effect under the release in force');
  }
  const block = await rerunBlock(scope.client, input.practiceId, input.pricingRunId);
  if (block.state === 'superseded') {
    throw new RerunRefusedError('superseded', SUPERSEDED_MESSAGES[supersededKind(block)]);
  }
  if (block.state === 'newer_run_pending') {
    throw new RerunRefusedError('newer_run_pending', 'cannot be accepted yet, because a newer run of these service dates is being priced; wait until it finishes');
  }
  const { rows: meanwhile } = await scope.client.query<{ changed: boolean }>(`SELECT ${TOOK_EFFECT_MEANWHILE('r')} AS changed FROM pricing_run r WHERE r.id = $1 AND r.practice_id = $2`, [
    input.pricingRunId,
    input.practiceId,
  ]);
  if (meanwhile[0]?.changed === true) {
    throw new RerunRefusedError(
      'changed_meanwhile',
      'was not accepted, because a run of these service dates took effect while it was being accepted; check the page again and accept it if it is still offered',
    );
  }
  const shown = [...new Set(input.heldByIds.map((id) => id.toLowerCase()))].sort();
  const held = block.replacesId === input.replacesId ? await acceptanceHeldBy(scope.client, input.practiceId, input.pricingRunId, block.replacesId) : [];
  if (block.replacesId !== input.replacesId || held.length !== shown.length || held.some((id, index) => id !== shown[index])) {
    throw new RerunRefusedError('diff_changed', DIFF_CHANGED);
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
