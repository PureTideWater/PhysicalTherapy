import { LOCATION_SETTLED_STATUSES, type LocationStatus, isLocationStatus, locationStatusText } from '@tp/contracts';
import type { ScopeClient } from '@tp/db/runtime';

import type { Totals } from '../contracts/mapping-queries';

/**
 * The practice's pricing location as the screens read it (audit #33 and #16's minimal record; docs/adr/0064): its
 * billing ZIP and ZIP+4 (practice_site, one per practice), its status in the rule release in force in the closed list
 * of locality_status() with the sentence a customer reads for it (@tp/contracts locationStatusText), whether a
 * person of the practice has confirmed it since it last changed (Getting started's "Confirm your billing ZIP"), and
 * the months that wait on it. Every read runs in the request's practice scope, under the practice's policies; the
 * location holds no PHI (a business address's ZIP), and the waiting months are aggregates that return no line.
 */

/**
 * What the location prices, said where it is changed (the multi-site pull request replaces it with dated locations):
 * one location prices every month, re-runs included.
 */
export const LOCATION_NOTE = 'This location prices every month, earlier months too when they are re-run. If the practice moved, tell us before changing it.';

export interface PracticeLocation {
  readonly zip: string;
  readonly zipPlusFour: string | null;
  /** When it last changed (the setters stamp it), which a confirmation must be at or after. */
  readonly updatedAt: Date;
}

export interface LocationReading {
  readonly status: LocationStatus;
  /** The status's sentence, naming the ZIP and, when ready, the locality and the release. */
  readonly text: string;
  /** The rule release in force, or null when none is. */
  readonly releaseNo: number | null;
  /** Medicare's carrier and locality the release prices the location in, when ready; null otherwise. */
  readonly carrier: string | null;
  readonly locality: string | null;
}

/** The practice's location, or null when it has none (a practice created before PR 6b with no ZIP). */
export async function practiceLocation(client: ScopeClient, practiceId: string): Promise<PracticeLocation | null> {
  const row = (await client.query<{ zip: string; zip_plus_four: string | null; updated_at: Date }>('SELECT zip, zip_plus_four, updated_at FROM practice_site WHERE practice_id = $1', [practiceId])).rows[0];
  return row === undefined ? null : { zip: row.zip, zipPlusFour: row.zip_plus_four, updatedAt: row.updated_at };
}

/** The rule release in force, or null. */
export async function releaseInForce(client: ScopeClient): Promise<number | null> {
  return (await client.query<{ release_no: number | null }>('SELECT current_rule_release() AS release_no')).rows[0]?.release_no ?? null;
}

/**
 * A ZIP and ZIP+4 in a release over the whole release (locality_status(), the closed list; the engine stays the judge
 * of each line). `location` null reads as zip_missing, a release null as no_release.
 */
export async function localityReading(client: ScopeClient, releaseNo: number | null, location: { readonly zip: string; readonly zipPlusFour: string | null } | null): Promise<LocationReading> {
  if (releaseNo === null) {
    return { status: 'no_release', text: locationStatusText('no_release'), releaseNo, carrier: null, locality: null };
  }
  if (location === null) {
    return { status: 'zip_missing', text: locationStatusText('zip_missing'), releaseNo, carrier: null, locality: null };
  }
  const row = (
    await client.query<{ status: string; carrier: string | null; locality: string | null }>('SELECT status, carrier, locality FROM locality_status($1, $2, $3, NULL, NULL)', [
      releaseNo,
      location.zip,
      location.zipPlusFour,
    ])
  ).rows[0];
  const status: LocationStatus = isLocationStatus(row?.status) ? row.status : 'zip_unknown';
  const carrier = row?.carrier ?? null;
  const locality = row?.locality ?? null;
  return { status, text: locationStatusText(status, { zip: location.zip, zipPlusFour: location.zipPlusFour, carrier, locality, releaseNo }), releaseNo, carrier, locality };
}

/** The practice's location in the release in force, over the whole release. */
export async function practiceLocationReading(client: ScopeClient, practiceId: string): Promise<{ readonly location: PracticeLocation | null; readonly reading: LocationReading }> {
  const location = await practiceLocation(client, practiceId);
  return { location, reading: await localityReading(client, await releaseInForce(client), location) };
}

/**
 * Whether a person of the practice has set or confirmed the location since it last changed: the confirmation
 * practice_set_location() and practice_confirm_location() record on the location (by a person outside the platform's
 * staff who holds pricing_settings.set, checked there) is at or after its updated_at, compared in Postgres. A location
 * the platform administrator entered at creation, or changed, therefore waits for the practice's confirmation (the
 * console's change clears it); pricing never waits for it. Read under practice_site's tenant policy, so everyone who
 * opens the practice reads the same answer (review of PR 6b-2, findings 1 and 8). False when the practice has no
 * location.
 */
export async function locationConfirmed(client: ScopeClient, practiceId: string): Promise<boolean> {
  const { rows } = await client.query<{ confirmed: boolean }>(
    'SELECT (s.confirmed_at IS NOT NULL AND s.confirmed_at >= s.updated_at) AS confirmed FROM practice_site s WHERE s.practice_id = $1',
    [practiceId],
  );
  return rows[0]?.confirmed === true;
}

/**
 * Of the complete runs given, the ones priced at another location than `location`: the ZIP and ZIP+4 a line of the
 * run read (every line of a run reads the run's settings, which its trace keeps, a null ZIP+4 left out), never the
 * times, so a save of the same location, or a change and a change back, lists no run as priced elsewhere. A run with
 * no line keeps no trace, and is compared by time: created before the location last changed. One line a run is read,
 * its settings alone.
 */
export async function runsPricedElsewhere(
  client: ScopeClient,
  practiceId: string,
  runs: readonly { readonly id: string; readonly createdAt: string | Date }[],
  location: PracticeLocation,
): Promise<ReadonlySet<string>> {
  if (runs.length === 0) {
    return new Set();
  }
  const { rows } = await client.query<{ id: string; zip: string | null; zip_plus_four: string | null; traced: boolean }>(
    `SELECT r.id::text AS id, s.settings ->> 'zip' AS zip, s.settings ->> 'zip_plus_four' AS zip_plus_four, s.settings IS NOT NULL AS traced
       FROM unnest($2::uuid[]) AS r (id)
       LEFT JOIN LATERAL (SELECT p.trace -> 'settings' AS settings FROM priced_line p WHERE p.practice_id = $1 AND p.pricing_run_id = r.id LIMIT 1) s ON true`,
    [practiceId, runs.map((run) => run.id)],
  );
  const created = new Map(runs.map((run) => [run.id, new Date(run.createdAt)]));
  return new Set(
    rows
      .filter((row) =>
        row.traced ? row.zip !== location.zip || (row.zip_plus_four ?? null) !== location.zipPlusFour : (created.get(row.id)?.getTime() ?? Infinity) < location.updatedAt.getTime(),
      )
      .map((row) => row.id),
  );
}

/**
 * Whether the location leaves the customer nothing to change (ready, or content PaidWhole has to load): only then is it
 * offered for, and taken as, the practice's confirmation.
 */
export function locationSettled(reading: LocationReading): boolean {
  return (LOCATION_SETTLED_STATUSES as readonly LocationStatus[]).includes(reading.status);
}

/** What Getting started's billing ZIP step asks for while the location still asks the customer for something. */
const UNSETTLED_STEP: Readonly<Partial<Record<LocationStatus, string>>> = {
  zip_missing: 'Add your billing ZIP',
  zip_unknown: 'Check your billing ZIP',
  zip_plus_four_needed: 'Add your billing ZIP+4',
  zip_plus_four_unknown: 'Review your billing ZIP+4',
};

/**
 * Getting started's billing ZIP step as the location stands: "Confirm your billing ZIP" (the page's own words) once
 * nothing is left for the customer to change; otherwise the status's own step, with its sentence as the detail, so the
 * step never asks for a confirmation the page cannot take. Null keeps the page's words.
 */
export function billingZipStep(reading: LocationReading): { readonly title: string; readonly detail: string } | null {
  if (locationSettled(reading)) {
    return null;
  }
  return { title: UNSETTLED_STEP[reading.status] ?? 'Confirm your billing ZIP', detail: reading.text };
}

/** Getting started's "Confirm your billing ZIP": confirmed, and nothing the customer can change. */
export function billingZipDone(reading: LocationReading, confirmed: boolean): boolean {
  return confirmed && locationSettled(reading);
}

/**
 * Why a month is listed with the location: no location at all (no run is created); its run stopped a line on it and
 * the location still cannot price; or its run stopped a line on it and the location now prices (or waits only on
 * content PaidWhole loads), so the month is being priced with the new location.
 */
export type LocationWaitKind = 'zip_missing' | 'location_not_ready' | 'repricing';

/** What a month being priced with the new location says, in place of the status's sentence. */
export const REPRICING_TEXT = 'Being priced with the new location.';

export interface MonthWaitingOnLocation {
  readonly periodFrom: string;
  readonly periodTo: string;
  readonly kind: LocationWaitKind;
  /** The location's status over the month, and its sentence. */
  readonly status: LocationStatus;
  readonly text: string;
  /** The month's lines: the same totals the mapping card shows. */
  readonly totals: Totals;
}

/**
 * The months that wait on the pricing location (audit #33; docs/adr/0064, the months that wait): each calendar month
 * of service dates whose newest line no queued, running or complete run covers (the monitoring chain's own rule,
 * apps/worker/src/monitor/plan.ts), when the practice has no location (zip_missing: no run is created), or when the
 * newest run of exactly that month under the release in force failed location_not_ready (a line needed the ZIP+4, or a
 * ZIP or ZIP+4 Medicare's list does not hold). A gap in the content (locality_not_loaded; a line's ENGINE_ERROR
 * no_locality_plus_four) is never such a month: its run completes and the operator is told. With their lines, claims,
 * billed and paid totals, and the location's status over the month. None while no release is in force (nothing is
 * priced).
 */
export async function monthsWaitingOnLocation(client: ScopeClient, practiceId: string): Promise<MonthWaitingOnLocation[]> {
  const releaseNo = await releaseInForce(client);
  if (releaseNo === null) {
    return [];
  }
  const location = await practiceLocation(client, practiceId);
  const { rows } = await client.query<{
    period_from: string;
    period_to: string;
    lines: number;
    claims: number;
    charge_cents: string;
    paid_cents: string;
    status: string;
    newest_failure: string | null;
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
            practice_location_status($1, $2, m.month_start, m.month_end) AS status,
            (SELECT r.failure_code FROM pricing_run r
              WHERE r.practice_id = $1 AND r.period_from = m.month_start AND r.period_to = m.month_end AND r.release_no = $2
              ORDER BY r.created_at DESC, r.id DESC LIMIT 1) AS newest_failure
       FROM months m
      WHERE NOT EXISTS (
        SELECT 1 FROM pricing_run r
         WHERE r.practice_id = $1 AND r.status <> 'failed'
           AND r.period_from <= m.month_start AND r.period_to >= m.month_end
           AND coalesce(r.lines_loaded_by, r.created_at) >= m.newest)
      ORDER BY m.month_start`,
    [practiceId, releaseNo],
  );
  return rows.flatMap((row): MonthWaitingOnLocation[] => {
    const status: LocationStatus = isLocationStatus(row.status) ? row.status : 'zip_missing';
    // A month whose last run stopped on the location, at a location that now prices (a save since), is being priced
    // again by the save's monitoring: it never reads as waiting on a step the customer has already taken.
    const settled = (LOCATION_SETTLED_STATUSES as readonly LocationStatus[]).includes(status);
    const kind: LocationWaitKind | null =
      location === null ? 'zip_missing' : row.newest_failure !== 'location_not_ready' ? null : settled ? 'repricing' : 'location_not_ready';
    if (kind === null) {
      return [];
    }
    return [
      {
        periodFrom: row.period_from,
        periodTo: row.period_to,
        kind,
        status,
        text:
          kind === 'repricing'
            ? REPRICING_TEXT
            : locationStatusText(status, { zip: location?.zip ?? null, zipPlusFour: location?.zipPlusFour ?? null, releaseNo, month: row.period_from.slice(0, 7) }),
        totals: { lines: row.lines, claims: row.claims, chargeCents: row.charge_cents, paidCents: row.paid_cents },
      },
    ];
  });
}

/**
 * The waiting months' lines and billed dollars added up, for a card's headline: both add across months (a line is in
 * one month). Claims do not (a claim can span two months), so each month shows its own.
 */
export function waitingHeadline(months: readonly MonthWaitingOnLocation[]): { readonly lines: number; readonly chargeCents: string } {
  return {
    lines: months.reduce((sum, month) => sum + month.totals.lines, 0),
    chargeCents: months.reduce((sum, month) => sum + BigInt(month.totals.chargeCents), 0n).toString(),
  };
}
