import { type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { canonicalJson } from '@tp/rules';

import { type CauseTrace, LOCATION_RECORD_TYPES, type LineCause, type OtherRelease, type RecordVersion, type TraceRecordRef, differingRecords, lineCauses, recordsRead, ruleLabel } from './causes';
import { PRICED_IN_EFFECT } from './in-effect';

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
 *
 * What accepting a re-run changes (compareAcceptance; J17: the re-run "lists exactly which lines would change
 * before anyone accepts it"; combined audit #10, docs/adr/0037, amendment of 2026-10-26) is the same diff with
 * other sides: before, each line's pricing in effect now (PRICED_IN_EFFECT, whichever run of any period holds it);
 * after, the pricing in effect once the re-run is accepted. Where a run of other service dates holds some of its
 * lines, those lines are compared with that run, and the diff names it.
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
  /** When that split was approved (pricing_run_split(), in the run's practice's scope), for the diff to name; null with no split. */
  readonly placeOfServiceSplitApprovedAt: Date | null;
}

export interface DiffSummary {
  /**
   * Lines both sides priced: each has a priced line with no unpriced reason on both sides. A line one side left
   * unpriced is never counted here, nor its NULL expected allowed summed as $0.00 (UX confirm of PR #50, NEW-B).
   */
  readonly compared: number;
  /** Of the lines on both sides, priced or not, the ones whose expected allowed, reason, adjustments, window, review flags or terms differ. */
  readonly changed: number;
  /** Of `changed`: those both sides priced, those priced before and unpriced after, the reverse, and those unpriced on both sides. */
  readonly pricedChanged: number;
  readonly pricedToUnpriced: number;
  readonly unpricedToPriced: number;
  readonly unpricedChanged: number;
  /** The unpriced reasons (closed-list codes, sorted) of the lines priced before and unpriced after, after; and of the reverse, before. */
  readonly pricedToUnpricedReasons: readonly string[];
  readonly unpricedToPricedReasons: readonly string[];
  readonly onlyBefore: number;
  readonly onlyAfter: number;
  /** Changed lines under another mapping, and under another contract version or rate record. */
  readonly mappingChanged: number;
  readonly versionChanged: number;
  /** Lines both sides priced whose dispute window ends on another day (or is known on one side only); changed lines whose review flags differ. */
  readonly windowChanged: number;
  readonly reviewFlagsChanged: number;
  /** Expected allowed over the lines both sides priced (`compared`), before and after: integer cents as text. */
  readonly beforeExpectedCents: string;
  readonly afterExpectedCents: string;
}

/** One side of a listed line: how that run priced it. */
export interface DiffSide {
  readonly pricedLineId: string;
  /** The run that priced it: one of the two compared, or, in what accepting a re-run changes, a run of other service dates that holds the line. */
  readonly pricingRunId: string;
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

/**
 * What accepting a re-run changes (compareAcceptance): the diff, `before` the run its acceptance replaces and `after`
 * the re-run, and the runs of other service dates whose pricing in effect either side reads (each line's side names
 * its run), oldest in effect first; none when every line's pricing in effect is the replaced run's.
 */
export interface AcceptanceDiff extends RunDiff {
  readonly heldBy: readonly DiffRun[];
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

/** Two runs' lines: `a` the first run's ($2), `b` the second's ($3), of the practice $1. */
const SIDES = `a AS (SELECT * FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $2),
     b AS (SELECT * FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $3)`;

/**
 * What accepting re-run $3, which replaces run $2 (the run in effect for its period), changes for the practice $1.
 * The lines are those either run priced: no other line's pricing in effect moves, since the re-run takes effect for
 * its own period only. `a`: each line's pricing in effect now. `b`: the re-run's line where it priced one (accepted
 * last, it holds every line it priced); for a line only the replaced run priced, the pricing in effect of the runs
 * left in effect, those of other periods (the replaced run no longer is).
 */
const ACCEPTANCE_SIDES = `lines AS (SELECT DISTINCT service_line_id FROM priced_line WHERE practice_id = $1 AND pricing_run_id IN ($2, $3)),
     rerun AS (SELECT period_from, period_to FROM pricing_run WHERE practice_id = $1 AND id = $3),
     a AS (${PRICED_IN_EFFECT('$1', 'p.service_line_id IN (SELECT service_line_id FROM lines)')}),
     b AS (SELECT * FROM priced_line WHERE practice_id = $1 AND pricing_run_id = $3
           UNION ALL
           SELECT left_in_effect.* FROM (${PRICED_IN_EFFECT(
             '$1',
             `p.service_line_id IN (SELECT service_line_id FROM lines)
                AND NOT EXISTS (SELECT 1 FROM priced_line own WHERE own.practice_id = $1 AND own.pricing_run_id = $3 AND own.service_line_id = p.service_line_id)
                AND NOT EXISTS (SELECT 1 FROM rerun WHERE rerun.period_from = r.period_from AND rerun.period_to = r.period_to)`,
           )}) left_in_effect)`;

/**
 * The runs other than re-run `rerunId` and the run it replaces whose priced lines what accepting it changes reads,
 * on either side (ACCEPTANCE_SIDES), by ID. With the replaced run, they are everything that diff depends on: priced
 * lines never change, and a run taking effect or leaving it that holds one of these lines changes this set. So
 * acceptRun, under the practice's pricing_current lock, refuses an acceptance whose diff was read against another
 * set (diff_changed), as it does when the replaced run is another.
 */
export async function acceptanceHeldBy(client: ScopeClient, practiceId: string, rerunId: string, replacesId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    `WITH ${ACCEPTANCE_SIDES}
     SELECT DISTINCT s.pricing_run_id::text AS id FROM (SELECT pricing_run_id FROM a UNION SELECT pricing_run_id FROM b) s
      WHERE s.pricing_run_id <> $2 AND s.pricing_run_id <> $3 ORDER BY 1`,
    [practiceId, replacesId, rerunId],
  );
  return rows.map((row) => row.id);
}

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
  readonly place_of_service_split_approved_at: Date | null;
}

async function runsOf(scope: PracticeScope<ScopeClient>, practiceId: string, ids: readonly string[], requestId: string): Promise<Map<string, RunRow>> {
  const rows = await readWithAudit(
    scope,
    { objectType: 'pricing_run', purpose: 'run_comparison', requestId },
    async (client) =>
      (
        await client.query<RunRow>(
          `SELECT r.id, r.practice_id, r.period_from::text AS period_from, r.period_to::text AS period_to, r.release_no, r.engine_version, r.status, r.rerun_of_id, r.accepted_at,
                  r.completed_at, r.place_of_service_split_id, s.approved_at AS place_of_service_split_approved_at
             FROM pricing_run r LEFT JOIN LATERAL pricing_run_split(r.id) s ON true
            WHERE r.practice_id = $1 AND r.id = ANY ($2::uuid[])`,
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
    placeOfServiceSplitApprovedAt: row.place_of_service_split_approved_at,
  };
}

interface SummaryRow {
  readonly compared: number;
  readonly changed: number;
  readonly priced_changed: number;
  readonly priced_to_unpriced: number;
  readonly unpriced_to_priced: number;
  readonly unpriced_changed: number;
  readonly priced_to_unpriced_reasons: string[];
  readonly unpriced_to_priced_reasons: string[];
  readonly only_before: number;
  readonly only_after: number;
  readonly mapping_changed: number;
  readonly version_changed: number;
  readonly window_changed: number;
  readonly review_flags_changed: number;
  readonly before_expected_cents: string;
  readonly after_expected_cents: string;
}

/** A line both sides priced: a priced line on each side, neither unpriced. */
const PRICED_BOTH = 'a.id IS NOT NULL AND b.id IS NOT NULL AND a.unpriced_reason IS NULL AND b.unpriced_reason IS NULL';
const PRICED_TO_UNPRICED = 'a.id IS NOT NULL AND b.id IS NOT NULL AND a.unpriced_reason IS NULL AND b.unpriced_reason IS NOT NULL';
const UNPRICED_TO_PRICED = 'a.id IS NOT NULL AND b.id IS NOT NULL AND a.unpriced_reason IS NOT NULL AND b.unpriced_reason IS NULL';
const UNPRICED_BOTH = 'a.id IS NOT NULL AND b.id IS NOT NULL AND a.unpriced_reason IS NOT NULL AND b.unpriced_reason IS NOT NULL';

async function summaryOf(client: ScopeClient, sides: string, practiceId: string, before: string, after: string): Promise<DiffSummary> {
  const { rows } = await client.query<SummaryRow>(
    `WITH ${sides}
     SELECT count(*) FILTER (WHERE ${PRICED_BOTH})::int AS compared,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS})::int AS changed,
            count(*) FILTER (WHERE ${PRICED_BOTH} AND ${DIFFERS})::int AS priced_changed,
            count(*) FILTER (WHERE ${PRICED_TO_UNPRICED})::int AS priced_to_unpriced,
            count(*) FILTER (WHERE ${UNPRICED_TO_PRICED})::int AS unpriced_to_priced,
            count(*) FILTER (WHERE ${UNPRICED_BOTH} AND ${DIFFERS})::int AS unpriced_changed,
            coalesce(array_agg(DISTINCT b.unpriced_reason ORDER BY b.unpriced_reason) FILTER (WHERE ${PRICED_TO_UNPRICED}), '{}') AS priced_to_unpriced_reasons,
            coalesce(array_agg(DISTINCT a.unpriced_reason ORDER BY a.unpriced_reason) FILTER (WHERE ${UNPRICED_TO_PRICED}), '{}') AS unpriced_to_priced_reasons,
            count(*) FILTER (WHERE b.id IS NULL)::int AS only_before,
            count(*) FILTER (WHERE a.id IS NULL)::int AS only_after,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS} AND a.mapping_id IS DISTINCT FROM b.mapping_id)::int AS mapping_changed,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${DIFFERS}
                               AND (a.contract_version_id IS DISTINCT FROM b.contract_version_id OR a.rate_record_id IS DISTINCT FROM b.rate_record_id))::int AS version_changed,
            count(*) FILTER (WHERE ${PRICED_BOTH} AND ${WINDOW_DIFFERS})::int AS window_changed,
            count(*) FILTER (WHERE a.id IS NOT NULL AND b.id IS NOT NULL AND ${FLAGS_DIFFER})::int AS review_flags_changed,
            coalesce(sum(a.expected_allowed_cents) FILTER (WHERE ${PRICED_BOTH}), 0)::text AS before_expected_cents,
            coalesce(sum(b.expected_allowed_cents) FILTER (WHERE ${PRICED_BOTH}), 0)::text AS after_expected_cents
       FROM a FULL JOIN b ON b.service_line_id = a.service_line_id`,
    [practiceId, before, after],
  );
  const row = rows[0] as SummaryRow;
  return {
    compared: row.compared,
    changed: row.changed,
    pricedChanged: row.priced_changed,
    pricedToUnpriced: row.priced_to_unpriced,
    unpricedToPriced: row.unpriced_to_priced,
    unpricedChanged: row.unpriced_changed,
    pricedToUnpricedReasons: row.priced_to_unpriced_reasons,
    unpricedToPricedReasons: row.unpriced_to_priced_reasons,
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
  readonly pricing_run_id: string;
  /** The release of the run that priced it, for its causes. */
  readonly release_no: number;
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
        pricingRunId: row.pricing_run_id,
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

/**
 * Under two releases, the location's records (LOCATION_RECORD_TYPES) a line read in one run only, as the other run's
 * release holds their rule (OtherRelease): whether it holds a record of the rule with the same value and window, and
 * its version of the rule on the read record's first day. A record the ZIP's change makes a line read is then a
 * release cause too when the new release added or changed it for the new location. Under one release, nothing.
 */
async function otherReleaseLookup(
  client: ScopeClient,
  traces: readonly { readonly before: unknown; readonly after: unknown }[],
  beforeRelease: number,
  afterRelease: number,
): Promise<OtherRelease> {
  if (beforeRelease === afterRelease) {
    return () => undefined;
  }
  const asked = new Map<string, { readonly ref: TraceRecordRef; readonly release: number; readonly other: number }>();
  for (const pair of traces) {
    const first = recordsRead(pair.before);
    const second = recordsRead(pair.after);
    for (const [label, ref] of first) {
      if (!second.has(label) && LOCATION_RECORD_TYPES.has(ref.record_type)) {
        asked.set(`before:${ref.sha256}:${label}`, { ref, release: beforeRelease, other: afterRelease });
      }
    }
    for (const [label, ref] of second) {
      if (!first.has(label) && LOCATION_RECORD_TYPES.has(ref.record_type)) {
        asked.set(`after:${ref.sha256}:${label}`, { ref, release: afterRelease, other: beforeRelease });
      }
    }
  }
  const asks = [...asked.values()];
  if (asks.length === 0) {
    return () => undefined;
  }
  // The records as read, by release and hash, and every record of the same rules in the other release.
  const { rows: read } = await client.query<{ release_no: number; sha256: string; value: unknown; effective_from: string; effective_to: string | null }>(
    `SELECT r.release_no, r.sha256, r.value, r.effective_from::text AS effective_from, r.effective_to::text AS effective_to
       FROM rule_record r JOIN unnest($1::int[], $2::text[]) AS w (release_no, sha256) ON w.release_no = r.release_no AND w.sha256 = r.sha256`,
    [asks.map((ask) => ask.release), asks.map((ask) => ask.ref.sha256)],
  );
  const { rows: held } = await client.query<{ release_no: number; record_type: string; key: Readonly<Record<string, string>>; sha256: string; value: unknown; effective_from: string; effective_to: string | null }>(
    `SELECT DISTINCT r.release_no, r.record_type, r.key, r.sha256, r.value, r.effective_from::text AS effective_from, r.effective_to::text AS effective_to
       FROM rule_record r JOIN unnest($1::int[], $2::text[], $3::jsonb[]) AS w (release_no, record_type, key)
         ON w.release_no = r.release_no AND w.record_type = r.record_type AND w.key = r.key`,
    [asks.map((ask) => ask.other), asks.map((ask) => ask.ref.record_type), asks.map((ask) => JSON.stringify(ask.ref.key))],
  );
  const valueOf = new Map(read.map((row) => [`${String(row.release_no)}:${row.sha256}`, canonicalJson([row.value, row.effective_from, row.effective_to])]));
  return (ref, readIn) => {
    const release = readIn === 'before' ? beforeRelease : afterRelease;
    const other = readIn === 'before' ? afterRelease : beforeRelease;
    const rule = held.filter((row) => row.release_no === other && ruleLabel(row) === ruleLabel(ref));
    const value = valueOf.get(`${String(release)}:${ref.sha256}`);
    const same = value !== undefined && rule.some((row) => canonicalJson([row.value, row.effective_from, row.effective_to]) === value);
    const onFirstDay = rule
      .filter((row) => row.effective_from <= ref.effective_from && (row.effective_to === null || row.effective_to >= ref.effective_from))
      .sort((x, y) => (x.effective_from < y.effective_from ? 1 : x.effective_from > y.effective_from ? -1 : 0))[0];
    const version: RecordVersion | null = onFirstDay === undefined ? null : { sha256: onFirstDay.sha256, effectiveFrom: onFirstDay.effective_from, effectiveTo: onFirstDay.effective_to };
    return { same, other: version };
  };
}

interface DiffBody {
  readonly summary: DiffSummary;
  readonly filter: DiffFilter;
  readonly lines: readonly DiffLine[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/**
 * The diff of two sides (`sides`: CTEs `a` and `b` over priced lines, with $1 the practice and $2 and $3 the two runs):
 * its counts, then a page of its lines, each line's two priced lines an audited read, and each changed line's causes
 * read from its two traces under the releases of the runs that priced them.
 */
async function diffOf(scope: PracticeScope<ScopeClient>, sides: string, input: { readonly practiceId: string; readonly before: string; readonly after: string; readonly requestId: string; readonly filter?: DiffFilter; readonly page?: number; readonly perPage?: number }): Promise<DiffBody> {
  const filter = input.filter ?? 'all';
  const perPage = input.perPage ?? DIFF_LINES_PER_PAGE;
  const summary = await summaryOf(scope.client, sides, input.practiceId, input.before, input.after);
  const total = filter === 'all' ? summary.changed + summary.onlyBefore + summary.onlyAfter : filter === 'changed' ? summary.changed : filter === 'only_before' ? summary.onlyBefore : summary.onlyAfter;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, input.page ?? 1), pages);
  const rows = await readWithAudit(
    scope,
    { objectType: 'priced_line', purpose: 'run_comparison', requestId: input.requestId },
    async (client) =>
      (
        await client.query<SideRow>(
          `WITH ${sides},
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
           SELECT s.position::text AS position, s.kind, s.side, p.id, p.practice_id, p.pricing_run_id, pr.release_no, p.service_line_id, l.procedure_code, l.modifiers,
                  trim_scale(l.units)::text AS units, p.method, p.expected_allowed_cents::text AS expected_allowed_cents, p.variance_cents::text AS variance_cents, p.unpriced_reason,
                  p.adjustments_applied, p.window_ends_on::text AS window_ends_on, ${FLAGS_OF('p')} AS review_flags,
                  p.mapping_id, p.contract_version_id, p.rate_record_id, p.trace
             FROM sides s JOIN priced_line p ON p.id = s.priced_line_id JOIN pricing_run pr ON pr.id = p.pricing_run_id JOIN service_line l ON l.id = p.service_line_id
            ORDER BY s.position, s.side DESC`,
          [input.practiceId, input.before, input.after, filter],
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
  const both = entries.flatMap(([, entry]) => (entry.before !== undefined && entry.after !== undefined ? [{ before: entry.before, after: entry.after }] : []));
  const pairs = both.flatMap((side) => differingRecords(side.before.trace, side.after.trace).map((pair) => ({ ...pair, beforeRelease: side.before.release_no, afterRelease: side.after.release_no })));
  const sameRule = await sameRuleLookup(scope.client, pairs);
  // The releases a changed line's two sides were priced under: the two runs', or, where a run of other dates holds the line, that run's.
  const otherReleases = new Map<string, OtherRelease>();
  const releasePairs = new Map(both.map((side) => [`${String(side.before.release_no)}:${String(side.after.release_no)}`, [side.before.release_no, side.after.release_no] as const]));
  for (const [key, [beforeRelease, afterRelease]] of releasePairs) {
    const traces = both.filter((side) => side.before.release_no === beforeRelease && side.after.release_no === afterRelease).map((side) => ({ before: side.before.trace, after: side.after.trace }));
    otherReleases.set(key, await otherReleaseLookup(scope.client, traces, beforeRelease, afterRelease));
  }
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
      causes:
        entry.before !== undefined && entry.after !== undefined
          ? lineCauses(entry.before.trace, entry.after.trace, sameRule(entry.before.release_no, entry.after.release_no), otherReleases.get(`${String(entry.before.release_no)}:${String(entry.after.release_no)}`))
          : [],
    };
  });
  return { summary, filter, lines, page, pages, total };
}

export async function compareRuns(scope: PracticeScope<ScopeClient>, input: CompareRunsInput): Promise<RunDiff> {
  const runs = await runsOf(scope, input.practiceId, [input.beforeRunId, input.afterRunId], input.requestId);
  const before = diffRun(runs.get(input.beforeRunId));
  const after = diffRun(runs.get(input.afterRunId));
  return { before, after, ...(await diffOf(scope, SIDES, { ...input, before: before.id, after: after.id })) };
}

export interface CompareAcceptanceInput {
  readonly practiceId: string;
  /** The complete re-run nobody has accepted. */
  readonly rerunId: string;
  /** The run its acceptance replaces, the run in effect for its period (rerunBlock's replacesId). */
  readonly replacesId: string;
  readonly requestId: string;
  readonly filter?: DiffFilter;
  readonly page?: number;
  readonly perPage?: number;
}

/**
 * What accepting a re-run changes, exactly (J17): each line either run priced, its pricing in effect now against
 * its pricing in effect once the re-run is accepted (ACCEPTANCE_SIDES), and the runs of other service dates that
 * hold some of those lines (acceptanceHeldBy), which the page names and its Accept form posts. With none, it is the
 * diff of the replaced run and the re-run. It does not judge whether the re-run can be accepted (rerunBlock does);
 * the caller reads it for the run rerunBlock says acceptance replaces.
 */
export async function compareAcceptance(scope: PracticeScope<ScopeClient>, input: CompareAcceptanceInput): Promise<AcceptanceDiff> {
  const heldIds = await acceptanceHeldBy(scope.client, input.practiceId, input.rerunId, input.replacesId);
  const runs = await runsOf(scope, input.practiceId, [input.replacesId, input.rerunId, ...heldIds], input.requestId);
  const before = diffRun(runs.get(input.replacesId));
  const after = diffRun(runs.get(input.rerunId));
  const heldBy = heldIds.map((id) => diffRun(runs.get(id))).sort((x, y) => (x.acceptedAt ?? x.completedAt).getTime() - (y.acceptedAt ?? y.completedAt).getTime() || (x.id < y.id ? -1 : 1));
  return { before, after, heldBy, ...(await diffOf(scope, ACCEPTANCE_SIDES, { ...input, before: before.id, after: after.id })) };
}
