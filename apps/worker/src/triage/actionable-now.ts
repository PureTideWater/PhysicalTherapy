/**
 * The one actionable figure of a case (PRD 12: "actionable" is stage three; PRD 8, The status machine;
 * docs/adr/0061 and 0082): the variance of its lines not written off whose latest stage is still
 * actionable and whose pricing is still current. A line priced again since it joined the case, priced
 * under a rule release withdrawn since, or priced under a contract version no longer signed off or no
 * longer covering its service date (the database's priced_line_pricing_check(); audit item #4) drops out
 * at once, though the case keeps it and its stored actionable_cents (the case's ask, case_rules()) until
 * Lane A's PR 11 refreshes the case. A line that moved on to payer approved or recovered drops out too.
 *
 * SQL texts, as COVERAGE_IN_EFFECT and PRICED_IN_EFFECT are, so every live actionable figure of the
 * practice's cases reads this predicate and counts its lines with it: the practice home's tile, its cases
 * by state and its deadlines (apps/web lib/dashboard/queries.ts), the Cases screen's header and rows, the
 * case page and the packet builder (lib/triage/queries.ts), the ROI statement's figure for the cases still
 * being worked (reconcile/statements.ts) and the digest's cases nearing their deadline
 * (digest/figures.ts). Two figures keep their own, named in ADR 0082: the audit report's (a run's lines)
 * and the monthly summary's (a month's).
 *
 * The module imports nothing, so the web app may bundle it (the web's entries test). Each text reads
 * opaque IDs, stages and amounts only.
 */

/** The latest stage event of case line `x`'s service line, one row at most (line_status_by_line leads with the practice). */
const LATEST_STAGE_ROW = (x: string) =>
  `SELECT s.stage FROM line_status s WHERE s.practice_id = ${x}.practice_id AND s.service_line_id = ${x}.service_line_id ORDER BY s.seq DESC LIMIT 1`;

/** The latest stage of case line `x`'s service line, as a value (null before any). */
export const LATEST_STAGE = (x: string) => `(${LATEST_STAGE_ROW(x)})`;

/**
 * Whether case line `x` is in the figure: not written off, its latest stage (`stage`, LATEST_STAGE by
 * default) actionable, and its pricing check current. The check (a plpgsql function of a dozen index
 * probes) runs last, under the CASE, so only for lines not written off and at actionable: never for a
 * resolved case's payer approved or recovered lines.
 */
export const ACTIONABLE_NOW_LINE = (x: string, stage: string = LATEST_STAGE(x)) =>
  `(CASE WHEN ${x}.written_off_reason IS NULL AND ${stage} = 'actionable' THEN coalesce(priced_line_pricing_check(${x}.priced_line_id) = 'current', false) ELSE false END)`;

/** Case `alias`'s figure: the variance of its lines ACTIONABLE_NOW_LINE admits, in integer cents (0 for none). */
export const ACTIONABLE_NOW = (alias: string) => `(SELECT coalesce(sum(p.variance_cents), 0) FROM case_line x JOIN priced_line p ON p.id = x.priced_line_id
    WHERE x.case_id = ${alias}.id AND x.practice_id = ${alias}.practice_id AND ${ACTIONABLE_NOW_LINE('x')})`;

/** How many lines ACTIONABLE_NOW sums: the same predicate, counted. */
export const ACTIONABLE_NOW_LINES = (alias: string) => `(SELECT count(*) FROM case_line x
    WHERE x.case_id = ${alias}.id AND x.practice_id = ${alias}.practice_id AND ${ACTIONABLE_NOW_LINE('x')})`;

/** The columns ACTIONABLE_NOW_OF gives, as text once cast (`cents` a sum of integer cents, the rest counts). */
export interface ActionableNowColumns {
  /** The figure, as ACTIONABLE_NOW. */
  readonly cents: string;
  /** Its lines, as ACTIONABLE_NOW_LINES. */
  readonly lines: string;
  /** The case's lines not written off: lines + moved_on + stale. */
  readonly open_lines: string;
  /** Lines not written off whose latest stage is not actionable (moved on to payer approved or recovered, or never there). */
  readonly moved_on: string;
  /** Lines not written off at actionable whose pricing check is not current (priced again, a release withdrawn, a version no longer in force). */
  readonly stale: string;
}

/**
 * Case `alias`'s figure and its counts in one pass over its lines, for a `CROSS JOIN LATERAL ... a` (one
 * row per case): `cents`, `lines`, `open_lines`, `moved_on` and `stale` (ActionableNowColumns). Each case
 * line is read once: its latest stage and its predicate are columns of a derived table behind an
 * optimization fence (OFFSET 0), so the aggregates' FILTERs read them as values and the pricing check runs
 * at most once per line, never once per FILTER (the planner neither merges common subexpressions across
 * aggregates nor keeps them when it pulls a subquery up). Every line not written off has exactly one of
 * three fates: in the figure, moved on, or stale.
 */
export const ACTIONABLE_NOW_OF = (alias: string) => `(
    SELECT coalesce(sum(y.variance_cents) FILTER (WHERE y.now), 0) AS cents,
           count(*) FILTER (WHERE y.now) AS lines,
           count(*) FILTER (WHERE y.open) AS open_lines,
           count(*) FILTER (WHERE y.open AND y.stage IS DISTINCT FROM 'actionable') AS moved_on,
           count(*) FILTER (WHERE y.open AND y.stage = 'actionable' AND NOT y.now) AS stale
      FROM (SELECT p.variance_cents, x.written_off_reason IS NULL AS open, st.stage, ${ACTIONABLE_NOW_LINE('x', 'st.stage')} AS now
              FROM case_line x
              JOIN priced_line p ON p.id = x.priced_line_id
              LEFT JOIN LATERAL (${LATEST_STAGE_ROW('x')}) st ON true
             WHERE x.case_id = ${alias}.id AND x.practice_id = ${alias}.practice_id
            OFFSET 0) y)`;
