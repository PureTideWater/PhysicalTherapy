import type { ScopeClient } from '@tp/db/runtime';
import { type ContentQuarterRun, type ContentSpan, contentQuartersOf, currentQuarter } from '@tp/worker/screening-format';

/**
 * The quarters a rule release's silently read Medicare content is loaded for (audit #7, the screening's part; the
 * founder's answer of 2026-10-21 to PR 6b's Q6 (a); docs/adr/0064): rule_release_content_span() gives each content's
 * loaded days (per-code MPPR, the general MPPR rate and the MUEs, as text multiranges), and the quarters wholly inside
 * all three are the ones a Medicare screening row may be priced in (@tp/worker/screening-format contentQuartersOf). The
 * browser leaves a Medicare row of any other quarter out and counts it; the server refuses one sent anyway, and so
 * does submit_screening().
 *
 * The spans are read once per release and kept here by its number and manifest SHA-256: a published release never
 * changes, so a cached span is never stale, and a release republished under another manifest is read again. The
 * quarters are worked out from them on each call, against the current quarter.
 */

/** Anything that runs a query: a request's or a job's client, or a test's owner connection. */
type Queryable = Pick<ScopeClient, 'query'>;

/** How many releases' spans are kept (the release in force and the few a result page names). */
const KEPT_RELEASES = 8;

const spans = new Map<string, readonly ContentSpan[]>();

/** A release's content spans, read once per release number and manifest; null when no such release is published. */
export async function releaseContentSpans(client: Queryable, releaseNo: number): Promise<readonly ContentSpan[] | null> {
  const manifest = (await client.query<{ manifest_sha256: string }>('SELECT manifest_sha256 FROM rule_release WHERE release_no = $1', [releaseNo])).rows[0]?.manifest_sha256;
  if (manifest === undefined) {
    return null;
  }
  const key = `${String(releaseNo)}:${manifest}`;
  const kept = spans.get(key);
  if (kept !== undefined) {
    return kept;
  }
  const { rows } = await client.query<{ content: string; loaded: string }>('SELECT content, loaded::text AS loaded FROM rule_release_content_span($1)', [releaseNo]);
  const read = rows.map((row) => ({ content: row.content, loaded: row.loaded }));
  if (spans.size >= KEPT_RELEASES) {
    const oldest = spans.keys().next().value;
    if (oldest !== undefined) {
      spans.delete(oldest);
    }
  }
  spans.set(key, read);
  return read;
}

/**
 * Where a screening's Medicare rows left out for their quarter lay, as its result says it: before the first quarter of
 * the loaded content when that content (`quarters`, as of the screening) is one run reaching the screening's own quarter,
 * since no row may lie after the current quarter; null otherwise, when the result says only "outside the loaded content".
 */
export function quarterRowsLayBefore(quarters: readonly ContentQuarterRun[], createdAt: Date): string | null {
  const [only] = quarters;
  return quarters.length === 1 && only !== undefined && only.to === currentQuarter(createdAt) ? only.from : null;
}

/** The quarters of a release's loaded content up to the current quarter, as sorted runs; none for a release not published. */
export async function contentQuarters(client: Queryable, releaseNo: number, now: Date): Promise<ContentQuarterRun[]> {
  const read = await releaseContentSpans(client, releaseNo);
  return read === null ? [] : contentQuartersOf(read, now);
}
