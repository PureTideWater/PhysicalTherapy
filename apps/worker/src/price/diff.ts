import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { canonicalJson } from '@tp/rules';

import { type CauseTrace, type LineCause, type TraceRecordRef, differingRecords, lineCauses } from './causes';

/**
 * The diff of two complete runs of a practice (PRD 7, Pricing runs: "compare two runs; re-run under a
 * new release with a diff"; PRD 9, step 4: "a re-run of any earlier run under the new release produces
 * a diff of changed lines before anyone accepts it"; J17; test matrix PRC-19, MAP-03; docs/adr/0037):
 * exactly the lines whose expected allowed, unpriced reason, adjustments applied, dispute window (its
 * last day, which decides whether the line is actionable; PRD 11 step 8), review flags or terms (the
 * mapping, contract version and rate record that priced it) differ, each with what differs, both sides
 * and the causes read from the two traces (causes.ts), and the lines one run priced and the other did
 * not. Lines are matched by service line. The counts are SQL over the stored lines (the database's
 * pricing_run_changed_lines() counts the same predicate); each listed line's two priced lines are
 * audited reads. Neither run changes.
 */

export const DIFF_KINDS = ['changed', 'only_before', 'only_after'] as const;
export type DiffKind = (typeof DIFF_KINDS)[number];
export type DiffFilter = 'all' | DiffKind;

export const DIFF_LINES_PER_PAGE = 50;

/** What can differ between two runs' results for one line: the predicate of pricing_run_changed_lines(). */
export const DIFF_CHANGES = ['expected_allowed', 'unpriced_reason', 'adjustments', 'window', 'review_flags', 'terms'] as const;
export type DiffChange = (typeof DIFF_CHANGES)[number];

/** The two runs could not be compared: one is not the practice's, or not complete. */
export class RunComparisonError extends Error {
  override readonly name = 'RunComparisonError';

  constructor(
    readonly reason: 'not_found' | 'not_complete',
    message: string,
  ) {
    super(message);
  }
}

export interface DiffRun {
  readonly id: string;
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly releaseNo: number;
  readonly engineVersion: string;
  readonly rerunOfId: string | null;
  readonly acceptedAt: Date | null;
  readonly completedAt: Date;
  /** The place-of-service split the run pinned when it was created (docs/adr/0064); null when none was approved then. */
  readonly placeOfServiceSplitId: string | null;
}

export interface DiffSummary {
  /** Lines both runs priced. */
  readonly compared: number;
  /** Of those, the ones whose expected allowed, reason, adjustments, window, review flags or terms differ. */
  readonly changed: number;
  readonly onlyBefore: number;
  readonly onlyAfter: number;
  /** Changed lines under another mapping, and under another contract version or rate record. */
  readonly mappingChanged: number;
  readonly versionChanged: number;
  /** Changed lines whose dispute window ends on another day (or has none in one run), and whose review flags differ. */
  readonly windowChanged: number;
  readonly reviewFlagsChanged: number;
  /** Expected allowed over the lines both runs priced, before and after: integer cents as text. */
  readonly beforeExpectedCents: string;
  readonly afterExpectedCents: string;
}

/** One side of a listed line: how that run priced it. */
export interface DiffSide {
  readonly pricedLineId: string;
  readonly method: string | null;
  readonly expectedAllowedCents: string | null;
  readonly varianceCents: string | null;
  readonly unpricedReason: string | null;
  readonly adjustments: readonly { readonly name: string; readonly before_cents: string; readonly after_cents: string }[];
  /** The last day a dispute can be filed; null when no window is known (or the line is unpriced). */
  readonly windowEndsOn: string | null;
  /** The review flags the trace reports with the amount; none on an unpriced line. */
  readonly reviewFlags: readonly DiffReviewFlag[];
  readonly mappingId: string | null;
  readonly contractVersionId: string | null;
  readonly rateRecordId: string | null;
}

export interface DiffReviewFlag {
  readonly flag: string;
  readonly column1_line_no: number;
}

export interface DiffLine {
  readonly serviceLineId: string;
  readonly kind: DiffKind;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: string | null;
  readonly before: DiffSide | null;
  readonly after: DiffSide | null;
  /** What differs, in DIFF_CHANGES order, for a changed line; empty for a line one run did not price. */
  readonly changes: readonly DiffChange[];
  /** From the traces, for changed lines; empty for a line one run did not price. */
  readonly causes: readonly LineCause[];
}

export interface RunDiff {
  readonly before: DiffRun;
  readonly after: DiffRun;
  readonly summary: DiffSummary;
  readonly filter: DiffFilter;
  readonly lines: readonly DiffLine[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

export interface CompareRunsInput {
  readonly practiceId: string;
  readonly beforeRunId: string;
  readonly afterRunId: string;
  readonly requestId: string;
  readonly filter?: DiffFilter;
  readonly page?: number;
  readonly perPage?: number;
}

/** The review flags a stored line's trace reports with its amount; none on an unpriced line. */
const FLAGS_OF = (alias: string) => `coalesce(${alias}.trace #> '{outcome,review_flags}', '[]'::jsonb)`;

const WINDOW_DIFFERS = 'a.window_ends_on IS DISTINCT FROM b.window_ends_on';
const FLAGS_DIFFER = `${FLAGS_OF('a')} IS DISTINCT FROM ${FLAGS_OF('b')}`;

/** The lines two runs price differently: the predicate of pricing_run_changed_lines(). */
const DIFFERS = `(a.id IS NULL OR b.id IS NULL
      OR a.expected_allowed_cents IS DISTINCT FROM b.expected_allowed_cents
      OR a.unpriced_reason IS DISTINCT FROM b.unpriced_reason
      OR a.adjustments_applied IS DISTINCT FROM b.adjustments_applied
      OR ${WINDOW_DIFFERS}
      OR ${FLAGS_DIFFER}
      OR a.mapping_id IS DISTINCT FROM b.mapping_id
      OR a.contract_version_id IS DISTINCT FROM b.contract_version_id
      OR a.rate_record_id IS DISTINCT FROM b.rate_record_id)`;

const SIDES = `a AS (SELECT * FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $2),
     b AS (SELECT * FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $3)`;

interface RunRow {
  readonly id: string;
  readonly practice_id: string;
  readonly period_from: string;
  readonly period_to: string;
  readonly release_no: number;
  readonly engine_version: string;
  readonly status: string;
  readonly rerun_of_id: string | null;
  readonly accepted_at: Date | null;
  readonly completed_at: Date | null;
  readonly place_of_service_split_id: string | null;
}

async function runsOf(scope: PracticeScope<ScopeClient>, practiceId: string, ids: readonly string[], requestId: string): Promise<Map<string, RunRow>> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'run_comparison', requestId },
    async (client) =>
      (
        await client.query<RunRow>(
          `SELECT id, practice_id, period_from::text AS period_from, period_to::text AS period_to, release_no, engine_version, status, rerun_of_id, accepted_at, completed_at,
                  place_of_service_split_id
             FROM pricing_run WHERE practice_id = $1 AND id = ANY ($2::uuid[])`,
          [practiceId, ids],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

function diffRun(row: RunRow | undefined): DiffRun {
  if (row === undefined) {
    throw new RunComparisonError('not_found', 'both runs must be runs of the practice');
  }
  if (row.status !== 'complete' || row.completed_at === null) {
    throw new RunComparisonError('not_complete', 'only complete runs are compared; a run being priced has no lines to compare yet');
  }
  return {
    id: row.id,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    releaseNo: row.release_no,
    engineVersion: row.engine_version,
    rerunOfId: row.rerun_of_id,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    placeOfServiceSplitId: row.place_of_service_split_id,
  };
}

interface SummaryRow {
  readonly compared: number;
  readonly changed: number;
  readonly only_before: number;
  readonly only_after: number;
  readonly mapping_changed: number;
  readonly version_changed: number;
  readonly window_changed: number;
  readonly review_flags_changed: number;
  readonly before_expected_cents: string;
  readonly after_expected_cents: string;
}

async function summaryOf(client: ScopeClient, practiceId: string, before: string, after: string): Promise<DiffSummary> {
  const { rows } = await client.query<SummaryRow>(
    `WITH ${SIDES}
     SELECT count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL)::int AS compared,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS})::int AS changed,
            count(*) FILTER (WHERE b.id IS NULL)::int AS only_before,
            count(*) FILTER (WHERE a.id IS NULL)::int AS only_after,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS} AND a.mapping_id IS DISTINCT FROM b.mapping_id)::int AS mapping_changed,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS}
                               AND (a.contract_version_id IS DISTINCT FROM b.contract_version_id OR a.rate_record_id IS DISTINCT FROM b.rate_record_id))::int AS version_changed,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${WINDOW_DIFFERS})::int AS window_changed,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${FLAGS_DIFFER})::int AS review_flags_changed,
            coalesce(sum(a.expected_allowed_cents) FILTER (WHERE b.id IS NOT NULL), 0)::text AS before_expected_cents,
            coalesce(sum(b.expected_allowed_cents) FILTER (WHERE a.id IS NOT NULL), 0)::text AS after_expected_cents
       FROM a FULL JOIN b ON b.service_line_id = a.service_line_id`,
    [practiceId, before, after],
  );
  const row = rows[0] as SummaryRow;
  return {
    compared: row.compared,
    changed: row.changed,
    onlyBefore: row.only_before,
    onlyAfter: row.only_after,
    mappingChanged: row.mapping_changed,
    versionChanged: row.version_changed,
    windowChanged: row.window_changed,
    reviewFlagsChanged: row.review_flags_changed,
    beforeExpectedCents: row.before_expected_cents,
    afterExpectedCents: row.after_expected_cents,
  };
}

interface SideRow {
  readonly position: string;
  readonly kind: DiffKind;
  readonly side: 'before' | 'after';
  readonly id: string;
  readonly practice_id: string;
  readonly service_line_id: string;
  readonly procedure_code: string;
  readonly modifiers: string[] | null;
  readonly units: string | null;
  readonly method: string | null;
  readonly expected_allowed_cents: string | null;
  readonly variance_cents: string | null;
  readonly unpriced_reason: string | null;
  readonly adjustments_applied: DiffSide['adjustments'];
  readonly window_ends_on: string | null;
  readonly review_flags: DiffSide['reviewFlags'];
  readonly mapping_id: string | null;
  readonly contract_version_id: string | null;
  readonly rate_record_id: string | null;
  readonly trace: CauseTrace;
}

function sideOf(row: SideRow | undefined): DiffSide | null {
  return row === undefined
    ? null
    : {
        pricedLineId: row.id,
        method: row.method,
        expectedAllowedCents: row.expected_allowed_cents,
        varianceCents: row.variance_cents,
        unpricedReason: row.unpriced_reason,
        adjustments: row.adjustments_applied,
        windowEndsOn: row.window_ends_on,
        reviewFlags: row.review_flags,
        mappingId: row.mapping_id,
        contractVersionId: row.contract_version_id,
        rateRecordId: row.rate_record_id,
      };
}

/** What differs between two runs' results for a line both priced, in DIFF_CHANGES order (the same tests as DIFFERS). */
export function sideChanges(before: DiffSide, after: DiffSide): DiffChange[] {
  const differs: Readonly<Record<DiffChange, boolean>> = {
    expected_allowed: before.expectedAllowedCents !== after.expectedAllowedCents,
    unpriced_reason: before.unpricedReason !== after.unpricedReason,
    adjustments: canonicalJson(before.adjustments) !== canonicalJson(after.adjustments),
    window: before.windowEndsOn !== after.windowEndsOn,
    review_flags: canonicalJson(before.reviewFlags) !== canonicalJson(after.reviewFlags),
    terms: before.mappingId !== after.mappingId || before.contractVersionId !== after.contractVersionId || before.rateRecordId !== after.rateRecordId,
  };
  return DIFF_CHANGES.filter((change) => differs[change]);
}

/** Whether two stored records of a rule hold the same value and window, from rule_record. */
async function sameRuleLookup(client: ScopeClient, pairs: readonly { readonly before: TraceRecordRef; readonly after: TraceRecordRef; readonly beforeRelease: number; readonly afterRelease: number }[]) {
  const wanted = pairs.flatMap((pair) => [
    { release: pair.beforeRelease, sha256: pair.before.sha256 },
    { release: pair.afterRelease, sha256: pair.after.sha256 },
  ]);
  const stored = new Map<string, string>();
  if (wanted.length > 0) {
    const { rows } = await client.query<{ release_no: number; sha256: string; value: unknown; effective_from: string; effective_to: string | null }>(
      `SELECT r.release_no, r.sha256, r.value, r.effective_from::text AS effective_from, r.effective_to::text AS effective_to
         FROM rule_record r JOIN unnest($1::int[], $2::text[]) AS w (release_no, sha256) ON w.release_no = r.release_no AND w.sha256 = r.sha256`,
      [wanted.map((item) => item.release), wanted.map((item) => item.sha256)],
    );
    for (const row of rows) {
      stored.set(`${String(row.release_no)}:${row.sha256}`, canonicalJson([row.value, row.effective_from, row.effective_to]));
    }
  }
  return (beforeRelease: number, afterRelease: number) =>
    (before: TraceRecordRef, after: TraceRecordRef): boolean => {
      const first = stored.get(`${String(beforeRelease)}:${before.sha256}`);
      return first !== undefined && first === stored.get(`${String(afterRelease)}:${after.sha256}`);
    };
}

export async function compareRuns(scope: PracticeScope<ScopeClient>, input: CompareRunsInput): Promise<RunDiff> {
  const filter = input.filter ?? 'all';
  const perPage = input.perPage ?? DIFF_LINES_PER_PAGE;
  const runs = await runsOf(scope, input.practiceId, [input.beforeRunId, input.afterRunId], input.requestId);
  const before = diffRun(runs.get(input.beforeRunId));
  const after = diffRun(runs.get(input.afterRunId));
  const summary = await summaryOf(scope.client, input.practiceId, before.id, after.id);
  const total = filter === 'all' ? summary.changed + summary.onlyBefore + summary.onlyAfter : filter === 'changed' ? summary.changed : filter === 'only_before' ? summary.onlyBefore : summary.onlyAfter;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, input.page ?? 1), pages);
  const rows = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'run_comparison', requestId: input.requestId },
    async (client) =>
      (
        await client.query<SideRow>(
          `WITH ${SIDES},
           diff AS (
             SELECT coalesce(a.service_line_id, b.service_line_id) AS service_line_id,
                    CASE WHEN a.id IS NULL THEN 'only_after' WHEN b.id IS NULL THEN 'only_before' ELSE 'changed' END AS kind,
                    abs(coalesce(b.expected_allowed_cents, 0) - coalesce(a.expected_allowed_cents, 0)) AS size,
                    a.id AS before_id, b.id AS after_id
               FROM a FULL JOIN b ON b.service_line_id = a.service_line_id
              WHERE ${DIFFERS}
           ),
           page AS (
             SELECT d.*, row_number() OVER (ORDER BY d.kind, d.size DESC, d.service_line_id) AS position
               FROM diff d WHERE $4 = 'all' OR d.kind = $4
              ORDER BY position LIMIT ${String(perPage)} OFFSET ${String((page - 1) * perPage)}
           ),
           sides AS (
             SELECT page.position, page.kind, 'before' AS side, page.before_id AS priced_line_id FROM page WHERE page.before_id IS NOT NULL
             UNION ALL
             SELECT page.position, page.kind, 'after', page.after_id FROM page WHERE page.after_id IS NOT NULL
           )
           SELECT s.position::text AS position, s.kind, s.side, p.id, p.practice_id, p.service_line_id, l.procedure_code, l.modifiers, trim_scale(l.units)::text AS units,
                  p.method, p.expected_allowed_cents::text AS expected_allowed_cents, p.variance_cents::text AS variance_cents, p.unpriced_reason,
                  p.adjustments_applied, p.window_ends_on::text AS window_ends_on, ${FLAGS_OF('p')} AS review_flags,
                  p.mapping_id, p.contract_version_id, p.rate_record_id, p.trace
             FROM sides s JOIN priced_line p ON p.id = s.priced_line_id JOIN service_line l ON l.id = p.service_line_id
            ORDER BY s.position, s.side DESC`,
          [input.practiceId, before.id, after.id, filter],
        )
      ).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
  const byLine = new Map<string, { position: number; kind: DiffKind; before?: SideRow; after?: SideRow }>();
  for (const row of rows) {
    const entry = byLine.get(row.service_line_id) ?? { position: Number.parseInt(row.position, 10), kind: row.kind };
    entry[row.side] = row;
    byLine.set(row.service_line_id, entry);
  }
  const entries = [...byLine.entries()].sort(([, x], [, y]) => x.position - y.position);
  const pairs = entries.flatMap(([, entry]) =>
    entry.before !== undefined && entry.after !== undefined
      ? differingRecords(entry.before.trace, entry.after.trace).map((pair) => ({ ...pair, beforeRelease: before.releaseNo, afterRelease: after.releaseNo }))
      : [],
  );
  const sameRule = (await sameRuleLookup(scope.client, pairs))(before.releaseNo, after.releaseNo);
  const lines = entries.map(([serviceLineId, entry]): DiffLine => {
    const any = (entry.before ?? entry.after) as SideRow;
    const first = sideOf(entry.before);
    const second = sideOf(entry.after);
    return {
      serviceLineId,
      kind: entry.kind,
      procedureCode: any.procedure_code,
      modifiers: (any.modifiers ?? []).filter((modifier) => modifier !== ''),
      units: any.units,
      before: first,
      after: second,
      changes: first !== null && second !== null ? sideChanges(first, second) : [],
      causes: entry.before !== undefined && entry.after !== undefined ? lineCauses(entry.before.trace, entry.after.trace, sameRule) : [],
    };
  });
  return { before, after, summary, filter, lines, page, pages, total };
}
