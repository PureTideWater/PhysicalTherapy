import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { centsToString, parseCents, sumCents } from '@tp/money';
import { type DigestFigures, parseDigestFigures } from '@tp/worker/digests';

/**
 * The monitoring reads (PRD 5, J11 and J12; PRD 7, Practice dashboard, Reports and Settings; PRD 8,
 * notification and digest; docs/adr/0039): the signed-in person's own in-app notifications (the
 * database admits a person's own only), the practice's monthly digests, and the monthly variance
 * summary. Counts and totals only, as integer cents in text; every read runs in the request's practice
 * scope under the practice's policies. Payer names come from the practice's payer records, which hold
 * no patient's data; no patient, claim or line identifier is read.
 */

type Scope = PracticeScope<ScopeClient>;

export type NotificationKind = 'monitoring_run' | 'digest';

export interface NotificationView {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly subjectId: string;
  readonly counts: Readonly<Record<string, unknown>>;
  readonly totals: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly readAt: string | null;
  /** For a run: its period; for a digest: its month. */
  readonly periodFrom: string | null;
  readonly periodTo: string | null;
  readonly period: string | null;
}

export const NOTIFICATIONS_PER_PAGE = 50;

interface NotificationRow {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly subject_id: string;
  readonly counts: Record<string, unknown>;
  readonly totals_cents: Record<string, unknown>;
  readonly created_at: Date;
  readonly read_at: Date | null;
  readonly period_from: string | null;
  readonly period_to: string | null;
  readonly period: string | null;
}

/** The person's notifications in the practice, newest first (the policy admits their own only). */
export async function listNotifications(scope: Scope, practiceId: string, limit = NOTIFICATIONS_PER_PAGE): Promise<NotificationView[]> {
  const { rows } = await scope.client.query<NotificationRow>(
    `SELECT n.id, n.kind, n.subject_id, n.counts, n.totals_cents, n.created_at, n.read_at,
            r.period_from::text AS period_from, r.period_to::text AS period_to, d.period
       FROM notification n
       LEFT JOIN pricing_run r ON n.kind = 'monitoring_run' AND r.id = n.subject_id
       LEFT JOIN digest d ON n.kind = 'digest' AND d.id = n.subject_id
      WHERE n.practice_id = $1 AND n.user_id = app_actor_id()
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT $2`,
    [practiceId, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    subjectId: row.subject_id,
    counts: row.counts,
    totals: row.totals_cents,
    createdAt: row.created_at.toISOString(),
    readAt: row.read_at === null ? null : row.read_at.toISOString(),
    periodFrom: row.period_from,
    periodTo: row.period_to,
    period: row.period,
  }));
}

export async function unreadNotifications(scope: Scope, practiceId: string): Promise<number> {
  const { rows } = await scope.client.query<{ n: number }>('SELECT count(*)::int AS n FROM notification WHERE practice_id = $1 AND user_id = app_actor_id() AND read_at IS NULL', [practiceId]);
  return rows[0]?.n ?? 0;
}

/** Marks every unread notification of the person's in the practice read; how many it marked. */
export async function markNotificationsRead(scope: Scope, practiceId: string): Promise<number> {
  const { rowCount } = await scope.client.query('UPDATE notification SET read_at = now() WHERE practice_id = $1 AND user_id = app_actor_id() AND read_at IS NULL', [practiceId]);
  return rowCount ?? 0;
}

export interface DigestSummary {
  readonly id: string;
  readonly period: string;
  readonly sentAt: string | null;
}

/** The practice's monthly digests, newest month first. */
export async function listDigests(scope: Scope, practiceId: string, limit = 24): Promise<DigestSummary[]> {
  const { rows } = await scope.client.query<{ id: string; period: string; sent_at: Date | null }>('SELECT id, period, sent_at FROM digest WHERE practice_id = $1 ORDER BY period DESC LIMIT $2', [practiceId, limit]);
  return rows.map((row) => ({ id: row.id, period: row.period, sentAt: row.sent_at === null ? null : row.sent_at.toISOString() }));
}

export interface DigestDetail extends DigestSummary {
  readonly figures: DigestFigures;
  /** The names of the payers its figures are keyed by. */
  readonly payers: Readonly<Record<string, string>>;
}

async function payerNames(scope: Scope, practiceId: string, ids: readonly string[]): Promise<Record<string, string>> {
  if (ids.length === 0) {
    return {};
  }
  const { rows } = await scope.client.query<{ id: string; name: string }>('SELECT id, coalesce(name_raw, payer_id_raw) AS name FROM payer WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [practiceId, ids]);
  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

export async function digestOf(scope: Scope, practiceId: string, digestId: string): Promise<DigestDetail | undefined> {
  const { rows } = await scope.client.query<{ id: string; period: string; sent_at: Date | null; counts: unknown; totals_cents: unknown }>(
    'SELECT id, period, sent_at, counts, totals_cents FROM digest WHERE id = $1 AND practice_id = $2',
    [digestId, practiceId],
  );
  const row = rows[0];
  if (row === undefined) {
    return undefined;
  }
  const figures = parseDigestFigures(row.counts, row.totals_cents);
  return {
    id: row.id,
    period: row.period,
    sentAt: row.sent_at === null ? null : row.sent_at.toISOString(),
    figures,
    payers: await payerNames(scope, practiceId, Object.keys(figures.totals.validated_variance_by_payer)),
  };
}

// ---------------------------------------------------------------------------------------------------
// The monthly variance summary (J12)
// ---------------------------------------------------------------------------------------------------

/**
 * Where a line of the month stands: its stage (the furthest it has reached, from line_status), or,
 * with no stage, how the run in effect left it: priced (no shortfall to pursue, or not yet triaged),
 * overpaid (recorded, never pursued), unpriced (with a reason), or not priced by any run yet.
 */
export const SUMMARY_BUCKETS = ['flagged', 'validated', 'actionable', 'payer_approved', 'recovered', 'priced', 'overpaid', 'unpriced', 'not_priced'] as const;
export type SummaryBucket = (typeof SUMMARY_BUCKETS)[number];

export interface SummaryFigure {
  readonly lines: number;
  /** Billed charges of the lines. */
  readonly billedCents: string;
  /** For a stage that carries dollars: the variance of the priced line its stage names (null otherwise). */
  readonly varianceCents: string | null;
}

export interface SummaryRow {
  readonly payerId: string | null;
  readonly payerName: string | null;
  readonly figures: Readonly<Record<SummaryBucket, SummaryFigure>>;
  /** Actionable lines written off (window passed, payer correct ...): out of the actionable total, shown apart. */
  readonly writtenOff: SummaryFigure;
}

export interface MonthlySummary {
  readonly month: string;
  readonly total: SummaryRow;
  readonly byPayer: readonly SummaryRow[];
}

/** Stages whose figure carries dollars: validated and actionable are variance; payer approved and recovered come from the ledger (milestone 9). */
const DOLLAR_STAGES: ReadonlySet<SummaryBucket> = new Set(['validated', 'actionable']);

interface BucketRow {
  readonly payer_id: string;
  readonly bucket: SummaryBucket;
  readonly written_off: boolean;
  readonly lines: number;
  readonly billed: string;
  readonly variance: string;
}

const SUMMARY = `
  WITH lines AS (
    SELECT l.id, l.charge_cents, pl.payer_id
      FROM service_line l JOIN claim c ON c.id = l.claim_id JOIN plan pl ON pl.id = l.payer_plan_key
     WHERE l.practice_id = $1 AND c.claim_status_code <> '22' AND c.superseded_by_claim_id IS NULL
       AND coalesce(l.service_date, c.service_from) >= $2::date AND coalesce(l.service_date, c.service_from) < ($2::date + interval '1 month')
  ), latest AS (
    SELECT DISTINCT ON (p.service_line_id) p.service_line_id, p.unpriced_reason, p.variance_cents
      FROM priced_line p JOIN pricing_run r ON r.id = p.pricing_run_id
     WHERE p.practice_id = $1 AND p.service_line_id IN (SELECT id FROM lines)
       AND r.status = 'complete' AND (r.rerun_of_id IS NULL OR r.accepted_at IS NOT NULL)
     ORDER BY p.service_line_id, coalesce(r.accepted_at, r.completed_at) DESC, r.id DESC
  ), stage AS (
    SELECT DISTINCT ON (s.service_line_id) s.service_line_id, s.stage, s.priced_line_id
      FROM line_status s
     WHERE s.practice_id = $1 AND s.service_line_id IN (SELECT id FROM lines)
     ORDER BY s.service_line_id, s.seq DESC
  )
  SELECT l.payer_id,
         CASE WHEN st.stage IS NOT NULL THEN st.stage
              WHEN lt.service_line_id IS NULL THEN 'not_priced'
              WHEN lt.unpriced_reason IS NOT NULL THEN 'unpriced'
              WHEN lt.variance_cents < 0 THEN 'overpaid'
              ELSE 'priced' END AS bucket,
         coalesce(cl.written_off_reason IS NOT NULL, false) AS written_off,
         count(*)::int AS lines,
         coalesce(sum(l.charge_cents), 0)::text AS billed,
         coalesce(sum(sp.variance_cents), 0)::text AS variance
    FROM lines l
    LEFT JOIN latest lt ON lt.service_line_id = l.id
    LEFT JOIN stage st ON st.service_line_id = l.id
    LEFT JOIN priced_line sp ON sp.id = st.priced_line_id
    LEFT JOIN case_line cl ON cl.service_line_id = l.id
   GROUP BY 1, 2, 3
   ORDER BY 1, 2, 3`;

const EMPTY: SummaryFigure = { lines: 0, billedCents: '0', varianceCents: null };

function add(a: SummaryFigure, lines: number, billed: string, variance: string | null): SummaryFigure {
  return {
    lines: a.lines + lines,
    billedCents: centsToString(sumCents([parseCents(a.billedCents), parseCents(billed)])),
    varianceCents: variance === null ? a.varianceCents : centsToString(sumCents([parseCents(a.varianceCents ?? '0'), parseCents(variance)])),
  };
}

function emptyRow(payerId: string | null, payerName: string | null): { payerId: string | null; payerName: string | null; figures: Record<SummaryBucket, SummaryFigure>; writtenOff: SummaryFigure } {
  const figures = Object.fromEntries(SUMMARY_BUCKETS.map((bucket) => [bucket, DOLLAR_STAGES.has(bucket) || bucket === 'payer_approved' || bucket === 'recovered' ? { ...EMPTY, varianceCents: '0' } : EMPTY])) as Record<SummaryBucket, SummaryFigure>;
  return { payerId, payerName, figures, writtenOff: { ...EMPTY, varianceCents: '0' } };
}

/**
 * The month's lines (service dates in it; reversals and superseded claims left out, as a run leaves
 * them), each counted once, at the furthest stage it has reached, by payer and in all: counts, billed
 * charges and, for validated and actionable, the variance of the priced line the stage names. Stages
 * are never added together. Payer approved and recovered stay zero until the recovery ledger posts.
 */
export async function monthlySummary(scope: Scope, practiceId: string, month: string): Promise<MonthlySummary> {
  const { rows } = await scope.client.query<BucketRow>(SUMMARY, [practiceId, `${month}-01`]);
  const names = await payerNames(scope, practiceId, [...new Set(rows.map((row) => row.payer_id))]);
  const total = emptyRow(null, null);
  const byPayer = new Map<string, ReturnType<typeof emptyRow>>();
  for (const row of rows) {
    const payer = byPayer.get(row.payer_id) ?? emptyRow(row.payer_id, names[row.payer_id] ?? null);
    byPayer.set(row.payer_id, payer);
    const variance = DOLLAR_STAGES.has(row.bucket) ? row.variance : null;
    for (const target of [total, payer]) {
      if (row.bucket === 'actionable' && row.written_off) {
        target.writtenOff = add(target.writtenOff, row.lines, row.billed, row.variance);
      } else {
        target.figures[row.bucket] = add(target.figures[row.bucket], row.lines, row.billed, variance);
      }
    }
  }
  return { month, total, byPayer: [...byPayer.values()].sort((a, b) => (a.payerName ?? '').localeCompare(b.payerName ?? '') || String(a.payerId).localeCompare(String(b.payerId))) };
}

/** The month before the current one (UTC), the summary's default. */
export function lastMonth(now: Date = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return date.toISOString().slice(0, 7);
}
