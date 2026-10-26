/**
 * Which pricing run is in effect (docs/adr/0037; PRD 5, J17: a re-run lists the lines it would change
 * "before anyone accepts it"): a complete first run of its period is, from when it completes; a re-run
 * only once a person accepts it, from then on. For a period, the run in effect is the eligible run that
 * took effect last. Triage, the audit report, Coverage, and Claims and lines read the run in effect;
 * the database's pricing_run_in_effect() holds the same rule for its own checks (an audit report is of
 * the run in effect). SQL fragments over a pricing_run alias, for the queries that read runs.
 *
 * A re-run is accepted only while nothing in effect for overlapping service dates is newer than it
 * (combined audit #10; docs/adr/0037, amendment of 2026-10-26; test matrix PRC-25 to PRC-28). Newer is
 * judged by when runs were priced and by their pinned rule release, never by when a person clicked
 * Accept: a run priced after the re-run, or pinned to a later release not withdrawn, or (for the
 * re-run's own period) holding lines loaded after its cut-off. Accepting it then could take a late
 * line's pricing out of effect or put older pricing back on a line. Only the run in effect for its
 * period is re-run, so a re-run's diff is against the pricing its acceptance replaces. The fragments
 * below are read by rerun.ts under the practice's pricing_current lock and by the pages that say why
 * a re-run cannot be accepted.
 */

/** A run that can be in effect: complete, and a first run or an accepted re-run. */
export const ELIGIBLE_RUN = (alias: string) => `(${alias}.status = 'complete' AND (${alias}.rerun_of_id IS NULL OR ${alias}.accepted_at IS NOT NULL))`;

/** When an eligible run took effect: an accepted re-run when it was accepted, a first run when it completed. */
export const IN_EFFECT_SINCE = (alias: string) => `coalesce(${alias}.accepted_at, ${alias}.completed_at)`;

/** The run in effect for its period: eligible, and no eligible run of the same period took effect after it. */
export const RUN_IN_EFFECT = (alias: string) => `(${ELIGIBLE_RUN(alias)} AND NOT EXISTS (
    SELECT 1 FROM pricing_run later
     WHERE later.practice_id = ${alias}.practice_id AND later.period_from = ${alias}.period_from AND later.period_to = ${alias}.period_to
       AND ${ELIGIBLE_RUN('later')} AND (${IN_EFFECT_SINCE('later')}, later.id) > (${IN_EFFECT_SINCE(alias)}, ${alias}.id)))`;

/**
 * Each service line's priced line in the run in effect that took effect last: the line's pricing in
 * effect (a re-run's once accepted, never a run it replaced). A query over priced_line `p` and its run
 * `r` for the practice `practice` (a parameter or column), one row per service line `lines` admits (a
 * condition on p.service_line_id), every column of the priced line. Triage, the monthly summary and
 * Claims and lines judge a line from this priced line, whichever run first validated it.
 */
export const PRICED_IN_EFFECT = (practice: string, lines: string) => `
  SELECT DISTINCT ON (p.service_line_id) p.*
    FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
   WHERE p.practice_id = ${practice} AND (${lines}) AND ${RUN_IN_EFFECT('r')}
   ORDER BY p.service_line_id, ${IN_EFFECT_SINCE('r')} DESC, r.id DESC`;

/** Two runs of one practice whose periods share a service date. */
const OVERLAPS = (a: string, b: string) => `(${a}.practice_id = ${b}.practice_id AND ${a}.period_from <= ${b}.period_to AND ${a}.period_to >= ${b}.period_from)`;

/** Two runs of the same period. */
const SAME_PERIOD = (a: string, b: string) => `(${a}.period_from = ${b}.period_from AND ${a}.period_to = ${b}.period_to)`;

/** The run's cut-off: the lines loaded by it are the run's (a re-run keeps its original's, create.ts). */
const CUT_OFF = (a: string) => `coalesce(${a}.lines_loaded_by, ${a}.created_at)`;

/**
 * Run `x` was priced no earlier than complete run `r` (both read their inputs under the practice's execution
 * lock, in the order of their completed_at, which is when each pricing transaction began), or is pinned to a
 * later rule release that is not withdrawn (after a content rollback the reinstated release is the one wanted).
 * A tie counts as newer, to stay on the safe side.
 */
const NEWER_PRICING = (x: string, r: string) => `(${x}.completed_at >= ${r}.completed_at
    OR (${x}.release_no > ${r}.release_no AND NOT EXISTS (SELECT 1 FROM rule_release_withdrawal w WHERE w.release_no = ${x}.release_no)))`;

/**
 * Run `x` makes re-run `rr` (of original `o`) stale: eligible, neither of them, overlapping, in effect after the
 * original (by the order RUN_IN_EFFECT and PRICED_IN_EFFECT read), and either newer in pricing than the re-run
 * or, for the same period, holding lines loaded after its cut-off.
 */
export const SUPERSEDES_RERUN = (x: string, rr: string, o: string) => `(${x}.id <> ${o}.id AND ${x}.id <> ${rr}.id AND ${OVERLAPS(x, rr)} AND ${ELIGIBLE_RUN(x)}
    AND (${IN_EFFECT_SINCE(x)}, ${x}.id) > (${IN_EFFECT_SINCE(o)}, ${o}.id)
    AND (${NEWER_PRICING(x, rr)} OR (${SAME_PERIOD(x, rr)} AND ${CUT_OFF(x)} > ${CUT_OFF(rr)})))`;

/**
 * Re-run `rr` can no longer be accepted: its original is not eligible (a re-run of a re-run nobody accepted,
 * left from before only the run in effect could be re-run), or some run supersedes it (SUPERSEDES_RERUN).
 */
export const RERUN_SUPERSEDED = (rr: string) => `EXISTS (
    SELECT 1 FROM pricing_run o
     WHERE o.id = ${rr}.rerun_of_id AND o.practice_id = ${rr}.practice_id
       AND (NOT ${ELIGIBLE_RUN('o')}
            OR EXISTS (SELECT 1 FROM pricing_run x WHERE x.practice_id = ${rr}.practice_id AND ${SUPERSEDES_RERUN('x', rr, 'o')})))`;

/**
 * Run `x` is a first run of a period overlapping run `r`'s, in one of `statuses`: the runs NEWER_RUN_RUNNING and
 * NEWER_RUN_PENDING look for, which a page or rerunBlock names.
 */
export const OVERLAPPING_FIRST_RUN = (x: string, r: string, statuses: readonly ('queued' | 'running')[]) =>
  `(${x}.practice_id = ${r}.practice_id AND ${x}.id <> ${r}.id AND ${x}.rerun_of_id IS NULL AND ${x}.status IN (${statuses.map((status) => `'${status}'`).join(', ')}) AND ${OVERLAPS(x, r)})`;

/**
 * A first run of a period overlapping run `r`'s is being priced: its pricing may have begun before an
 * acceptance of `r`, and once it completes it is newer. A queued one does not count: its pricing begins
 * after a check that saw it queued, so it ranks after the acceptance and holds every line by its own cut-off.
 */
export const NEWER_RUN_RUNNING = (r: string) => `EXISTS (SELECT 1 FROM pricing_run x WHERE ${OVERLAPPING_FIRST_RUN('x', r, ['running'])})`;

/** A first run of a period overlapping run `r`'s is queued or being priced: a re-run of `r` waits for it. */
export const NEWER_RUN_PENDING = (r: string) => `EXISTS (SELECT 1 FROM pricing_run x WHERE ${OVERLAPPING_FIRST_RUN('x', r, ['queued', 'running'])})`;

/**
 * An eligible run overlapping re-run `rr` took effect at or after this transaction began: it committed while the
 * acceptance waited for the lock, so an accepted_at of this transaction's now() would rank before it. It reads
 * now(), so it means something only inside the accepting transaction; no page shows it.
 */
export const TOOK_EFFECT_MEANWHILE = (rr: string) => `EXISTS (
    SELECT 1 FROM pricing_run x
     WHERE x.practice_id = ${rr}.practice_id AND x.id <> ${rr}.id AND ${ELIGIBLE_RUN('x')} AND ${OVERLAPS('x', rr)} AND ${IN_EFFECT_SINCE('x')} >= now())`;

/**
 * The runs `superseding` re-run `rr` (of original `o`) of its own period (`same: true`) or of another period
 * (`same: false`): for rerun.ts's rerunBlock, which names them; the same predicate as RERUN_SUPERSEDED.
 */
export const SUPERSEDES_RERUN_OF_PERIOD = (x: string, rr: string, o: string, same: boolean) => `(${SUPERSEDES_RERUN(x, rr, o)} AND ${same ? '' : 'NOT '}${SAME_PERIOD(x, rr)})`;
