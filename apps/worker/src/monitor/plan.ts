import { LOCATION_NOT_READY_STATUSES, type LocationStatus, PricingRefusedError, isLocationStatus } from '@tp/contracts';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { subtractRanges } from '@tp/rules';

import { PricingLocationWaiting, PricingRunInputError, createPricingRun } from '../price/create';
import {
  CONTENT_FAILURE_CODES,
  type ContentFailureCode,
  type ContentSpans,
  contentsOf,
  coveredDays,
  currentReleaseNo,
  familiesOf,
  releaseContentSpans,
} from '../price/release';

/**
 * The monitoring chain's planning step (PRD 5, J11: "on each new upload batch (or on a schedule), the
 * worker parses, prices under the current versions, triages, updates the ledger"; PRD 6, Monitoring
 * jobs and notifications; docs/adr/0039). In the practice's job scope, one practice at a time (an
 * advisory lock):
 *
 * 1. While documents of an upload batch are still coming in (an 835 upload awaiting its bytes, at
 *    intake, or waiting for its parse, created within the last hour), nothing is planned: the parse of
 *    each of them queues the step again when it is done, so the last one plans for the whole batch.
 * 2. With no rule release in force, nothing can be priced.
 * 3. Otherwise each calendar month of service dates whose newest line no run covers (no queued, running
 *    or complete run of the practice whose period holds the whole month and whose cut-off is at or after
 *    that line's load) gets a run for that month, created the way a person creates one
 *    (createPricingRun: the release in force, the period's plans, MAP-01's refusal of a plan with no
 *    mapping), in the job's own name. A month refused for an unmapped plan waits for its mapping; a month
 *    whose lines are all reversals has nothing to price.
 * 4. A month waits on the practice's pricing location (audit #33 and #7; docs/adr/0064), with no run
 *    created: while the practice has no location at all (createPricingRun refuses, PricingLocationWaiting),
 *    and while the newest run of that exact month failed location_not_ready (a line needed a ZIP+4, or a
 *    ZIP or ZIP+4 Medicare's list does not hold; never a gap in the content such as no_locality_plus_four,
 *    whose run completes with the line ENGINE_ERROR for the operator) under the release in force, covering
 *    the month's newest line, and was created at or after the location was last saved, while the location still
 *    reads as one a line cannot price at (waitingOnLocation). So such a month is not priced
 *    again every day: saving the location (which queues this step by its request) or a new release in force
 *    plans it again. Each waiting month is listed with its location's status.
 * 5. A month waits on Medicare content PaidWhole has not loaded (audit #7; docs/adr/0071), with no run created,
 *    while the newest run of that exact month failed waiting_on_content_mppr, _mue or _mppr_mue (a line read the
 *    MPPR or the MUE on a date its release does not load them for), covering the month's newest line, created at or
 *    after the practice's mappings and contract versions last changed (a remap to terms with the flags off, or a new
 *    version, can price the month without that content), and the release in force is the run's own or covers no
 *    more of the month for the code's families than it did (contentFailure, coversMore). So such a month starts no
 *    daily loop: a release in force that loads more of it, a change of the practice's terms or a newer line plans it
 *    again. Each waiting month is listed with its code and the release its run read.
 *
 * It returns every run the chain created that is still queued, the ones just created included, so the
 * job (re)queues their price jobs: a replay (the same document, or the same day) creates nothing new and
 * at most queues again a price job that the queue's singleton key refuses while it waits (JOB-01).
 */

/** How long a document of a batch may still be on its way before it no longer holds the plan back. */
export const BATCH_WINDOW_MINUTES = 60;

/** How long the chain waits after a document's parse before it plans, so the rest of a batch can land. */
export const MONITOR_DELAY_SECONDS = 120;

export interface PlannedMonth {
  readonly periodFrom: string;
  readonly periodTo: string;
}

export interface CreatedMonthRun extends PlannedMonth {
  readonly pricingRunId: string;
}

/** A month waiting on the practice's location, with the location's status over it (the closed list's). */
export interface WaitingMonth extends PlannedMonth {
  readonly status: LocationStatus;
}

/** A month waiting on Medicare content PaidWhole has not loaded: its last run's code, and the release that run read. */
export interface ContentWaitingMonth extends PlannedMonth {
  readonly failureCode: ContentFailureCode;
  readonly failedReleaseNo: number;
}

export type MonitorPlan =
  | { readonly outcome: 'batch_loading'; readonly pendingDocuments: number }
  | { readonly outcome: 'no_release' }
  | {
      readonly outcome: 'planned';
      readonly releaseNo: number;
      readonly created: readonly CreatedMonthRun[];
      /** Months refused while a plan of their lines has no mapping (MAP-01). */
      readonly waitingOnMapping: readonly PlannedMonth[];
      /** Months waiting on the practice's location: none created while it is missing, or its last run failed location_not_ready. */
      readonly waitingOnLocation: readonly WaitingMonth[];
      /** Months whose last run failed on Medicare content PaidWhole has not loaded, while nothing that could price them changed. */
      readonly waitingOnContent: readonly ContentWaitingMonth[];
      /** The chain's runs still queued (the ones just created among them): their price jobs are queued. */
      readonly queued: readonly string[];
    };

/**
 * Documents of an upload batch still on their way in: awaiting their bytes, at intake, or waiting to be parsed. An
 * ERA export loads remittances as an 835 does (docs/adr/0060), so a batch waits for both.
 */
export async function pendingDocuments(client: ScopeClient, practiceId: string): Promise<number> {
  const { rows } = await client.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM source_document
      WHERE practice_id = $1 AND kind IN ('x12_835', 'era_export') AND status IN ('awaiting_upload', 'received', 'scanned', 'parse_queued')
        AND created_at > now() - make_interval(mins => $2)`,
    [practiceId, BATCH_WINDOW_MINUTES],
  );
  return rows[0]?.n ?? 0;
}

/**
 * The months of service dates (a line's own date, else its claim's first) whose newest line, of any
 * claim (a reversal included: it changes how its original prices), no run of the practice covers.
 */
export async function uncoveredMonths(client: ScopeClient, practiceId: string): Promise<PlannedMonth[]> {
  const { rows } = await client.query<{ period_from: string; period_to: string }>(
    `WITH line_months AS (
       SELECT date_trunc('month', coalesce(l.service_date, c.service_from))::date AS month_start, max(l.created_at) AS newest
         FROM claim c JOIN service_line l ON l.claim_id = c.id
        WHERE c.practice_id = $1 AND coalesce(l.service_date, c.service_from) IS NOT NULL
        GROUP BY 1
     ), months AS (
       SELECT month_start, (month_start + interval '1 month' - interval '1 day')::date AS month_end, newest FROM line_months
     )
     SELECT m.month_start::text AS period_from, m.month_end::text AS period_to
       FROM months m
      WHERE NOT EXISTS (
        SELECT 1 FROM pricing_run r
         WHERE r.practice_id = $1 AND r.status <> 'failed'
           AND r.period_from <= m.month_start AND r.period_to >= m.month_end
           AND coalesce(r.lines_loaded_by, r.created_at) >= m.newest)
      ORDER BY m.month_start`,
    [practiceId],
  );
  return rows.map((row) => ({ periodFrom: row.period_from, periodTo: row.period_to }));
}

/**
 * The CTEs `newest` (the month's newest line, of any claim, as uncoveredMonths() counts them) and `last_run` (the
 * newest run of exactly that month), for $1 the practice, $2 and $3 the month's first and last days.
 */
const LAST_MONTH_RUN = `newest AS (
       SELECT max(l.created_at) AS at
         FROM claim c JOIN service_line l ON l.claim_id = c.id
        WHERE c.practice_id = $1 AND date_trunc('month', coalesce(l.service_date, c.service_from))::date = $2::date
     ), last_run AS (
       SELECT r.status, r.failure_code, r.release_no, r.created_at, coalesce(r.lines_loaded_by, r.created_at) AS cut_off
         FROM pricing_run r
        WHERE r.practice_id = $1 AND r.period_from = $2::date AND r.period_to = $3::date
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT 1
     )`;

/** The statuses at which a month whose run failed location_not_ready still cannot price, so it waits with no new run. */
const STILL_WAITING: readonly LocationStatus[] = ['zip_missing', ...LOCATION_NOT_READY_STATUSES];

/**
 * Whether an uncovered month waits on the practice's location with no new run: the newest run of exactly that month
 * failed location_not_ready, under `releaseNo` (the release in force), its cut-off at or after the month's newest line
 * (the same lines as uncoveredMonths()), and was created at or after the practice's location was last saved; and the
 * location's status over the month, as it reads now, is still one at which a line cannot price. The last condition is
 * what decides: a run created while a save was still open has a created_at later than the save's updated_at (both are
 * their transaction's start) yet read the old location, so the times alone never prove a run saw the saved location. A
 * month whose location is now ready, or waits on content PaidWhole loads (locality_not_loaded), is always planned; that
 * starts no daily loop, since a run at such a status never fails location_not_ready. A save of the location, a new
 * release in force or a newer line plans it again.
 */
export async function waitingOnLocation(client: ScopeClient, practiceId: string, month: PlannedMonth, releaseNo: number): Promise<boolean> {
  const { rows } = await client.query<{ waits: boolean }>(
    `WITH ${LAST_MONTH_RUN}
     SELECT coalesce(r.status = 'failed' AND r.failure_code = 'location_not_ready' AND r.release_no = $4
                     AND r.cut_off >= (SELECT n.at FROM newest n)
                     AND r.created_at >= (SELECT s.updated_at FROM practice_site s WHERE s.practice_id = $1)
                     AND practice_location_status($1, $4, $2::date, $3::date) = ANY ($5::text[]), false) AS waits
       FROM last_run r`,
    [practiceId, month.periodFrom, month.periodTo, releaseNo, STILL_WAITING],
  );
  return rows[0]?.waits ?? false;
}

/** The practice's location status over a month under a release (practice_location_status(), the caller's scope). */
async function locationStatus(client: ScopeClient, practiceId: string, month: PlannedMonth, releaseNo: number): Promise<LocationStatus> {
  const { rows } = await client.query<{ status: string }>('SELECT practice_location_status($1, $2, $3::date, $4::date) AS status', [
    practiceId,
    releaseNo,
    month.periodFrom,
    month.periodTo,
  ]);
  const status = rows[0]?.status;
  if (!isLocationStatus(status)) {
    throw new Error('the location status is not one of the closed list');
  }
  return status;
}

/**
 * Whether a run created at `createdAt` saw the practice's terms as they are now (`practice` its id, both SQL
 * expressions): it was created at or after the last time a plan mapping or a contract version of the practice was
 * created or changed. Both tables keep updated_at by trigger and no code deletes their rows, so a remap of a plan, a
 * new version or a sign-off since the run makes this false. The monitor's wait on content and Coverage's card read it
 * alike (audit #7, review m2).
 */
export function termsUnchangedSince(practice: string, createdAt: string): string {
  return `${createdAt} >= coalesce((SELECT max(greatest(x.created_at, x.updated_at))
                                     FROM (SELECT created_at, updated_at FROM payer_plan_mapping WHERE practice_id = ${practice}
                                           UNION ALL
                                           SELECT created_at, updated_at FROM contract_version WHERE practice_id = ${practice}) x), '-infinity')`;
}

function isContentFailureCode(code: string): code is ContentFailureCode {
  return (CONTENT_FAILURE_CODES as readonly string[]).includes(code);
}

/**
 * The content an uncovered month's last run waited on: the newest run of exactly that month failed with a content code
 * (waiting_on_content_*), its cut-off at or after the month's newest line, and created at or after the practice's terms
 * last changed (termsUnchangedSince). Null otherwise: the month is planned (or waits on something else).
 */
export async function contentFailure(client: ScopeClient, practiceId: string, month: PlannedMonth): Promise<{ failureCode: ContentFailureCode; releaseNo: number } | null> {
  const { rows } = await client.query<{ failure_code: string; release_no: number }>(
    `WITH ${LAST_MONTH_RUN}
     SELECT r.failure_code, r.release_no
       FROM last_run r
      WHERE r.status = 'failed' AND r.failure_code = ANY ($4::text[])
        AND r.cut_off >= (SELECT n.at FROM newest n)
        AND ${termsUnchangedSince('$1', 'r.created_at')}`,
    [practiceId, month.periodFrom, month.periodTo, CONTENT_FAILURE_CODES],
  );
  const row = rows[0];
  return row === undefined || !isContentFailureCode(row.failure_code) ? null : { failureCode: row.failure_code, releaseNo: row.release_no };
}

/**
 * Whether release `now` loads more of the month than release `failure.releaseNo` did, for any content of the families
 * the failure names: some day of the month one of those contents covers under `now` and did not under the failed
 * release. A newer release that loads no more of it would only start a run that fails the same way. `spans` reads a
 * release's spans (planMonitoring reads each release's once a plan).
 */
export async function coversMore(
  client: ScopeClient,
  failure: { readonly failureCode: ContentFailureCode; readonly releaseNo: number },
  now: number,
  month: PlannedMonth,
  spans: (releaseNo: number) => Promise<ContentSpans> = async (releaseNo) => releaseContentSpans(client, releaseNo),
): Promise<boolean> {
  const [spansNow, spansFailed] = await Promise.all([spans(now), spans(failure.releaseNo)]);
  return familiesOf(failure.failureCode)
    .flatMap(contentsOf)
    .some(
      (content) =>
        subtractRanges(coveredDays(spansNow, content, month.periodFrom, month.periodTo), coveredDays(spansFailed, content, month.periodFrom, month.periodTo)).length > 0,
    );
}

/** A release's content spans, read once each for the plan. */
function spansOnce(client: ScopeClient): (releaseNo: number) => Promise<ContentSpans> {
  const read = new Map<number, Promise<ContentSpans>>();
  return async (releaseNo) => {
    let spans = read.get(releaseNo);
    if (spans === undefined) {
      spans = releaseContentSpans(client, releaseNo);
      read.set(releaseNo, spans);
    }
    return spans;
  };
}

/** The chain's runs of the practice still waiting for their price job, oldest month first. */
export async function queuedMonitoringRuns(client: ScopeClient, practiceId: string): Promise<string[]> {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM pricing_run WHERE practice_id = $1 AND created_by_job_id IS NOT NULL AND status = 'queued' ORDER BY period_from, created_at, id",
    [practiceId],
  );
  return rows.map((row) => row.id);
}

export async function planMonitoring(scope: PracticeScope<ScopeClient>, practiceId: string, requestId: string): Promise<MonitorPlan> {
  const { client } = scope;
  // One plan of a practice at a time, whatever the queue does.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('monitor:' || $1::text, 0))", [practiceId]);
  const pending = await pendingDocuments(client, practiceId);
  if (pending > 0) {
    return { outcome: 'batch_loading', pendingDocuments: pending };
  }
  const releaseNo = await currentReleaseNo(client);
  if (releaseNo === null) {
    return { outcome: 'no_release' };
  }
  const created: CreatedMonthRun[] = [];
  const waitingOnMapping: PlannedMonth[] = [];
  const waitingLocation: WaitingMonth[] = [];
  const waitingOnContent: ContentWaitingMonth[] = [];
  const spans = spansOnce(client);
  for (const month of await uncoveredMonths(client, practiceId)) {
    if (await waitingOnLocation(client, practiceId, month, releaseNo)) {
      // Its last run failed location_not_ready and nothing it depends on changed since: no run today.
      waitingLocation.push({ ...month, status: await locationStatus(client, practiceId, month, releaseNo) });
      continue;
    }
    const failure = await contentFailure(client, practiceId, month);
    if (failure !== null && (failure.releaseNo === releaseNo || !(await coversMore(client, failure, releaseNo, month, spans)))) {
      // Its last run read Medicare content not loaded for its dates, and no release in force loads more of it since.
      waitingOnContent.push({ ...month, failureCode: failure.failureCode, failedReleaseNo: failure.releaseNo });
      continue;
    }
    try {
      const run = await createPricingRun(scope, { practiceId, periodFrom: month.periodFrom, periodTo: month.periodTo, releaseNo, requestId });
      created.push({ ...month, pricingRunId: run.pricingRunId });
    } catch (error) {
      if (error instanceof PricingRefusedError) {
        waitingOnMapping.push(month);
      } else if (error instanceof PricingLocationWaiting) {
        waitingLocation.push({ ...month, status: error.status });
      } else if (!(error instanceof PricingRunInputError && error.field === 'period')) {
        throw error;
      }
      // A month whose lines are all reversals or superseded claims holds nothing to price.
    }
  }
  return { outcome: 'planned', releaseNo, created, waitingOnMapping, waitingOnLocation: waitingLocation, waitingOnContent, queued: await queuedMonitoringRuns(client, practiceId) };
}
