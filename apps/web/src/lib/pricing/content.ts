import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { type DateRange, cmsQuarterOfDate, cmsQuarterWindow, dayAfter, quarterLabel, subtractRanges } from '@tp/rules';
import {
  CONTENT_FAILURE_CODES,
  type ContentFailureCode,
  type ContentFamily,
  type ContentSpans,
  contentsOf,
  coveredDays,
  coversMore,
  familiesOf,
  termsUnchangedSince,
} from '@tp/worker/pricing';

import type { Totals } from '../contracts/mapping-queries';
import { contentSpansOf, releaseManifest } from '../releases/content-through';
import { releaseInForce } from './location';

/**
 * The months that wait on Medicare content PaidWhole has not loaded (audit #7; docs/adr/0071), as Coverage lists them:
 * each calendar month of service dates whose newest line no queued, running or complete run covers (the monitoring
 * chain's own rule, apps/worker/src/monitor/plan.ts), whose newest run of exactly that month failed
 * waiting_on_content_mppr, _mue or _mppr_mue (a line read the MPPR or the MUE on a date its release does not load them
 * for), its cut-off at or after the month's newest line. With the month's lines, claims, billed and paid totals, the
 * families its code names, and the CMS quarters of the month the failed run's release does not load them for.
 *
 * Why it is listed, in the monitor's own terms (plan.ts, step 5): it waits while the practice's terms are unchanged
 * since the run and the release in force loads no more of the month; it is being priced again once the release in force
 * does (`repricing`), or once the practice's mappings or contract versions changed after the run (`terms_changed`).
 * Every read runs in the request's practice scope, under the practice's policies; the months are aggregates that return
 * no line.
 */

/** Why a month is listed with the content it waits on. */
export type ContentWaitKind = 'waiting' | 'repricing' | 'terms_changed';

export interface ContentWaitMonth {
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly kind: ContentWaitKind;
  /** The failed run's code and the release it read. */
  readonly failureCode: ContentFailureCode;
  readonly failedReleaseNo: number;
  /** The families the code names, MPPR first. */
  readonly families: readonly ContentFamily[];
  /** The quarters ("2027-Q1") of the month's days the failed release does not load the families' contents for. */
  readonly quarters: readonly string[];
  /** The release in force (the one a `repricing` month is priced under); null when none is. */
  readonly releaseInForce: number | null;
  /** The month's lines: the same totals the mapping card shows. */
  readonly totals: Totals;
}

function isContentFailureCode(code: string): code is ContentFailureCode {
  return (CONTENT_FAILURE_CODES as readonly string[]).includes(code);
}

/** The days of [from, to] a content of the families is not loaded for under `spans`, merged. */
function daysNotLoaded(spans: ContentSpans, families: readonly ContentFamily[], from: string, to: string): DateRange[] {
  return families.flatMap(contentsOf).flatMap((content) => subtractRanges([{ from, to }], coveredDays(spans, content, from, to)));
}

/** The CMS quarters a list of inclusive, closed ranges touches, in order. */
function quartersOf(ranges: readonly DateRange[]): string[] {
  const labels = new Set<string>();
  for (const range of ranges) {
    const last = range.to ?? range.from;
    for (let day = range.from; day <= last; day = dayAfter(cmsQuarterWindow(cmsQuarterOfDate(day)).to)) {
      labels.add(quarterLabel(cmsQuarterOfDate(day)));
    }
  }
  return [...labels].sort();
}

/** A family's short name, as Medicare publishes it. */
export const FAMILY_NAME: Readonly<Record<ContentFamily, string>> = { mppr: 'MPPR', mue: 'MUE' };

/**
 * What a month waits on, in words: "the 2027-Q1 Medicare content (MPPR, MUE)", with only the families its run's code
 * names; or, once it is being priced again, why.
 */
export function waitingOnText(month: ContentWaitMonth): string {
  if (month.kind === 'repricing') {
    return `being priced again under release ${String(month.releaseInForce)}`;
  }
  if (month.kind === 'terms_changed') {
    return 'being priced again under the practice’s changed terms';
  }
  const families = month.families.map((family) => FAMILY_NAME[family]).join(', ');
  return month.quarters.length === 0 ? `the Medicare content (${families})` : `the ${month.quarters.join(', ')} Medicare content (${families})`;
}

/** The months waiting on Medicare content, oldest first; none when no month's last run failed so. */
export async function monthsWaitingOnContent(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<ContentWaitMonth[]> {
  const { client } = scope;
  const { rows } = await client.query<{
    period_from: string;
    period_to: string;
    lines: number;
    claims: number;
    charge_cents: string;
    paid_cents: string;
    failure_code: string;
    release_no: number;
    manifest_sha256: string;
    terms_unchanged: boolean;
  }>(
    `WITH line_months AS (
       SELECT date_trunc('month', coalesce(l.service_date, c.service_from))::date AS month_start, max(l.created_at) AS newest,
              count(*)::int AS lines, count(DISTINCT l.claim_id)::int AS claims,
              coalesce(sum(l.charge_cents), 0)::text AS charge_cents, coalesce(sum(l.paid_cents), 0)::text AS paid_cents
         FROM claim c JOIN service_line l ON l.claim_id = c.id
        WHERE c.practice_id = $1 AND coalesce(l.service_date, c.service_from) IS NOT NULL
        GROUP BY 1
     ), months AS (
       SELECT m.*, (m.month_start + interval '1 month' - interval '1 day')::date AS month_end FROM line_months m
     )
     SELECT m.month_start::text AS period_from, m.month_end::text AS period_to, m.lines, m.claims, m.charge_cents, m.paid_cents,
            last_run.failure_code, last_run.release_no, rr.manifest_sha256, last_run.terms_unchanged
       FROM months m
       JOIN LATERAL (
         SELECT r.status, r.failure_code, r.release_no, coalesce(r.lines_loaded_by, r.created_at) AS cut_off,
                (${termsUnchangedSince('$1', 'r.created_at')}) AS terms_unchanged
           FROM pricing_run r
          WHERE r.practice_id = $1 AND r.period_from = m.month_start AND r.period_to = m.month_end
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT 1) last_run ON true
       JOIN rule_release rr ON rr.release_no = last_run.release_no
      WHERE last_run.status = 'failed' AND last_run.failure_code = ANY ($2::text[]) AND last_run.cut_off >= m.newest
        AND NOT EXISTS (
        SELECT 1 FROM pricing_run r
         WHERE r.practice_id = $1 AND r.status <> 'failed'
           AND r.period_from <= m.month_start AND r.period_to >= m.month_end
           AND coalesce(r.lines_loaded_by, r.created_at) >= m.newest)
      ORDER BY m.month_start`,
    [practiceId, CONTENT_FAILURE_CODES],
  );
  if (rows.length === 0) {
    return [];
  }
  const inForce = await releaseInForce(client);
  const inForceManifest = inForce === null ? null : await releaseManifest(client, inForce);
  const spansNow = inForce === null || inForceManifest === null ? null : await contentSpansOf(client, inForce, inForceManifest);
  const months: ContentWaitMonth[] = [];
  for (const row of rows) {
    if (!isContentFailureCode(row.failure_code)) {
      continue;
    }
    const families = familiesOf(row.failure_code);
    const spansFailed = await contentSpansOf(client, row.release_no, row.manifest_sha256);
    // The monitor's own predicate, over the spans this process keeps: the release in force and the failed run's.
    const repricing =
      inForce !== null &&
      spansNow !== null &&
      inForce !== row.release_no &&
      (await coversMore(client, { failureCode: row.failure_code, releaseNo: row.release_no }, inForce, { periodFrom: row.period_from, periodTo: row.period_to }, (releaseNo) =>
        Promise.resolve(releaseNo === inForce ? spansNow : spansFailed),
      ));
    const kind: ContentWaitKind = !row.terms_unchanged ? 'terms_changed' : repricing ? 'repricing' : 'waiting';
    months.push({
      periodFrom: row.period_from,
      periodTo: row.period_to,
      kind,
      failureCode: row.failure_code,
      failedReleaseNo: row.release_no,
      families,
      quarters: quartersOf(daysNotLoaded(spansFailed, families, row.period_from, row.period_to)),
      releaseInForce: inForce,
      totals: { lines: row.lines, claims: row.claims, chargeCents: row.charge_cents, paidCents: row.paid_cents },
    });
  }
  return months;
}

/** The card's headline: the waiting months' lines and billed and paid dollars, never their claims. */
export type ContentHeadline = Omit<Totals, 'claims'>;

/**
 * The waiting months' lines and billed and paid dollars added up, for the card's headline: they add across months (a
 * line is in one month). Claims do not (a claim can span two months), so each month shows its own, as the location
 * card's headline leaves them out (int-surfaces improvement 3).
 */
export function contentHeadline(months: readonly ContentWaitMonth[]): ContentHeadline {
  return {
    lines: months.reduce((sum, month) => sum + month.totals.lines, 0),
    chargeCents: months.reduce((sum, month) => sum + BigInt(month.totals.chargeCents), 0n).toString(),
    paidCents: months.reduce((sum, month) => sum + BigInt(month.totals.paidCents), 0n).toString(),
  };
}
