/**
 * Which pricing run is in effect (docs/adr/0037; PRD 5, J17: a re-run lists the lines it would change
 * "before anyone accepts it"): a complete first run of its period is, from when it completes; a re-run
 * only once a person accepts it, from then on. For a period, the run in effect is the eligible run that
 * took effect last. Triage, the audit report, Coverage, and Claims and lines read the run in effect;
 * the database's pricing_run_in_effect() holds the same rule for its own checks (an audit report is of
 * the run in effect). SQL fragments over a pricing_run alias, for the queries that read runs.
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
