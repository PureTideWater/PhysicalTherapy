import type { ScopeClient } from '@tp/db/runtime';
import { type IndexedRelease, type LinePricing, type PricingTrace, type RecordRef, indexRelease } from '@tp/pricing';
import { type ContentId, type DateRange, type RuleRecord, type RuleRecordOf, type RuleRecordType, dayBefore, mergeRanges } from '@tp/rules';

import { parseDateMultirange } from '../screening/format';
import { KEYED_RECORD_TYPES, type KeyedReleaseView, type KeyedRecordType, type RequestedKeys, keyedRelease, requestedKeys, unionKeys } from './keyed-release';

/**
 * The rule release a pricing run pins (PRD 9, The release pipeline step 4: "runs created after that pin
 * it"; PRD 5, J7: "a run with a rule-release mismatch is refused"). Global content: no practice_id,
 * read-only to the application role, immutable once published.
 */

/** The run asked for a release that is not the one in force (or none is published). */
export class RuleReleaseMismatchError extends Error {
  override readonly name = 'RuleReleaseMismatchError';

  constructor(
    readonly requested: number,
    /** The newest published release; null when none is. */
    readonly current: number | null,
  ) {
    super(
      current === null
        ? `rule-release mismatch: release ${String(requested)} was asked for and no rule release is published`
        : `rule-release mismatch: release ${String(requested)} was asked for and release ${String(current)} is the one loaded`,
    );
  }
}

/**
 * The rule release in force: the newest published release that no content rollback withdrew
 * (current_rule_release(), the same function the database's own check reads), or null when none is
 * published (a development database).
 */
export async function currentReleaseNo(client: ScopeClient): Promise<number | null> {
  const { rows } = await client.query<{ release_no: number | null }>('SELECT current_rule_release() AS release_no');
  return rows[0]?.release_no ?? null;
}

/** A content rollback (PRD 18, Releases): the release withdrawn, the one in force again, why and when. */
export interface ReleaseWithdrawal {
  readonly releaseNo: number;
  readonly reinstatedReleaseNo: number;
  readonly reason: string;
  readonly withdrawnAt: Date;
}

/** Every withdrawal, newest first: runs pinned to a withdrawn release are flagged by it, never changed. */
export async function releaseWithdrawals(client: ScopeClient): Promise<ReleaseWithdrawal[]> {
  const { rows } = await client.query<{ release_no: number; reinstated_release_no: number; reason: string; withdrawn_at: Date }>(
    'SELECT release_no, reinstated_release_no, reason, withdrawn_at FROM rule_release_withdrawal ORDER BY release_no DESC',
  );
  return rows.map((row) => ({ releaseNo: row.release_no, reinstatedReleaseNo: row.reinstated_release_no, reason: row.reason, withdrawnAt: row.withdrawn_at }));
}

/** A published release's number and manifest hash. */
export interface ReleaseHeader {
  readonly releaseNo: number;
  readonly manifestSha256: string;
}

export async function releaseHeader(client: ScopeClient, releaseNo: number): Promise<ReleaseHeader | null> {
  const { rows } = await client.query<{ release_no: number; manifest_sha256: string }>(
    'SELECT release_no, manifest_sha256 FROM rule_release WHERE release_no = $1 AND published_at IS NOT NULL',
    [releaseNo],
  );
  const row = rows[0];
  return row === undefined ? null : { releaseNo: row.release_no, manifestSha256: row.manifest_sha256 };
}

/** A rule record as rule_record stores it: what the engine reads, its window as dates, and the SHA-256 the loader stored. */
export interface StoredRecordRow {
  readonly record_type: RuleRecord['record_type'];
  readonly key: Record<string, string>;
  readonly value: Record<string, unknown>;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly sha256: string;
}

/**
 * A release as the engine reads it, from its header and its stored records (pure). The table keeps each record's
 * type, key, value and window (what the engine reads) and the SHA-256 the loader computed from the whole record
 * file entry; the trace names every record by that stored hash, as ADR 0029 says it does (`rule_record.sha256`),
 * not by a hash of the columns read back. The screening adapter indexes the records operator_screening_release()
 * returns through it too.
 */
export function indexStoredRelease(header: ReleaseHeader, rows: readonly StoredRecordRow[]): IndexedRelease {
  const stored = new Map<RuleRecord, string>();
  const records = rows.map((row) => {
    // The fields the engine reads; the source, verification, quotes and notes stay in the release files.
    const record = { record_type: row.record_type, key: row.key, value: row.value, effective_from: row.effective_from, effective_to: row.effective_to } as unknown as RuleRecord;
    stored.set(record, row.sha256);
    return record;
  });
  const indexed = indexRelease({ releaseNo: header.releaseNo, manifestSha256: header.manifestSha256, records });
  return {
    releaseNo: indexed.releaseNo,
    manifestSha256: indexed.manifestSha256,
    inForce: (type, key, date) => indexed.inForce(type, key, date),
    latestInYear: (type, key, year) => indexed.latestInYear(type, key, year),
    ref(record: RuleRecord): RecordRef {
      const sha256 = stored.get(record);
      if (sha256 === undefined) {
        return indexed.ref(record);
      }
      return { record_type: record.record_type, key: { ...(record.key as Record<string, string>) }, effective_from: record.effective_from, effective_to: record.effective_to, sha256 };
    },
  };
}

/** A published release as the engine reads it, from rule_release and rule_record (indexStoredRelease). */
export async function loadRuleRelease(client: ScopeClient, releaseNo: number): Promise<IndexedRelease> {
  const header = await releaseHeader(client, releaseNo);
  if (header === null) {
    throw new RuleReleaseMismatchError(releaseNo, await currentReleaseNo(client));
  }
  const { rows } = await client.query<StoredRecordRow>(
    `SELECT record_type, key, value, effective_from::text AS effective_from, effective_to::text AS effective_to, sha256
       FROM rule_record WHERE release_no = $1 ORDER BY record_type, effective_from, id`,
    [releaseNo],
  );
  return indexStoredRelease(header, rows);
}

// ---------------------------------------------------------------------------------------------------
// The content a release has loaded, and what a line read of it (audit #7; docs/adr/0071)

/**
 * The contents the engine reads without saying so in its outcome: the per-code MPPR list, the general MPPR rate and
 * the MUE. A line priced with the reduction or the coding edits on, on a date one of them is not loaded for, would be
 * priced without that limit and look right; so a run whose lines read one outside its span is refused (execute.ts),
 * and triage holds a line priced so. They are rule_release_content_span()'s rows, which MPPR's split follows.
 */
export const SPAN_CONTENTS = ['mppr_code', 'mppr_general', 'ncci_mue'] as const;
export type SpanContent = (typeof SPAN_CONTENTS)[number];

/** A range of days as parseDateMultirange gives it: [from, until), a null bound unbounded. */
export type HalfOpenRange = { readonly from: string | null; readonly until: string | null };
export type ContentSpans = Readonly<Record<SpanContent, readonly HalfOpenRange[]>>;

function isSpanContent(content: string): content is SpanContent {
  return (SPAN_CONTENTS as readonly string[]).includes(content);
}

/** The dates each span content is loaded for in a release (rule_release_content_span()); a content with no row is [] (nothing loaded). */
export async function releaseContentSpans(client: ScopeClient, releaseNo: number): Promise<ContentSpans> {
  const { rows } = await client.query<{ content: string; loaded: string }>('SELECT content, loaded::text AS loaded FROM rule_release_content_span($1)', [releaseNo]);
  const spans: Record<SpanContent, readonly HalfOpenRange[]> = { mppr_code: [], mppr_general: [], ncci_mue: [] };
  for (const row of rows) {
    if (isSpanContent(row.content)) {
      spans[row.content] = parseDateMultirange(row.loaded);
    }
  }
  return spans;
}

/** Whether a day is in one of the ranges. */
export function rangesCover(ranges: readonly HalfOpenRange[], date: string): boolean {
  return ranges.some((range) => (range.from === null || range.from <= date) && (range.until === null || date < range.until));
}

/** The families a run waiting on content names: the MPPR (its two contents) and the MUE. */
export type ContentFamily = 'mppr' | 'mue';

/** The run failure codes of a month whose lines read MPPR or MUE content not loaded for their dates: the families exactly. */
export const CONTENT_FAILURE_CODES = ['waiting_on_content_mppr', 'waiting_on_content_mue', 'waiting_on_content_mppr_mue'] as const;
export type ContentFailureCode = (typeof CONTENT_FAILURE_CODES)[number];

/** The code naming exactly these families; throws on an empty set (a run with no gap is not refused for content). */
export function contentFailureCode(families: ReadonlySet<ContentFamily>): ContentFailureCode {
  const mppr = families.has('mppr');
  const mue = families.has('mue');
  if (mppr && mue) {
    return 'waiting_on_content_mppr_mue';
  }
  if (mppr) {
    return 'waiting_on_content_mppr';
  }
  if (mue) {
    return 'waiting_on_content_mue';
  }
  throw new RangeError('a content failure names at least one family');
}

export function familiesOf(code: ContentFailureCode): readonly ContentFamily[] {
  switch (code) {
    case 'waiting_on_content_mppr':
      return ['mppr'];
    case 'waiting_on_content_mue':
      return ['mue'];
    case 'waiting_on_content_mppr_mue':
      return ['mppr', 'mue'];
  }
}

export function familyOf(content: SpanContent): ContentFamily {
  return content === 'ncci_mue' ? 'mue' : 'mppr';
}

export function contentsOf(family: ContentFamily): readonly SpanContent[] {
  return family === 'mue' ? ['ncci_mue'] : ['mppr_code', 'mppr_general'];
}

/** A span content a line read, and the day it read it for. */
export interface ContentRead {
  readonly content: SpanContent;
  readonly date: string;
}

/**
 * What the engine read of the three span contents, from the trace's steps, never from the flags alone (a flag on does
 * not mean the step ran): the MUE when the units step checked it (apply_ncci on); the per-code list, and the general
 * rate when it was used, on each MPPR entry's day; both on a no_mppr_rate stop, where the code's record had no share,
 * the general rate was looked up and missed, and no entry was written. A day whose reduction threw has its entries
 * cleared and reads nothing here (it is already an ENGINE_ERROR for the operator), and so does a fixed fee stopped at
 * mppr_needs_fee_schedule, before the reduction.
 */
export function contentReads(trace: PricingTrace): ContentRead[] {
  const date = trace.line.service_date;
  const reads: ContentRead[] = [];
  if (trace.steps.units?.mue.checked === true) {
    reads.push({ content: 'ncci_mue', date });
  }
  for (const adjustment of trace.steps.adjustments) {
    if (adjustment.name === 'mppr') {
      reads.push({ content: 'mppr_code', date: adjustment.service_date });
      if (adjustment.general_record !== null) {
        reads.push({ content: 'mppr_general', date: adjustment.service_date });
      }
    }
  }
  if (trace.outcome.result === 'unpriced' && trace.outcome.reason === 'ENGINE_ERROR' && trace.outcome.detail === 'no_mppr_rate') {
    reads.push({ content: 'mppr_code', date }, { content: 'mppr_general', date });
  }
  return reads;
}

/** The reads on dates outside the content's span. */
export function contentGapsOf(trace: PricingTrace, spans: ContentSpans): ContentRead[] {
  return contentReads(trace).filter((read) => !rangesCover(spans[read.content], read.date));
}

/** The days of [from, to] the content's span covers, as merged inclusive ranges. */
export function coveredDays(spans: ContentSpans, content: SpanContent, from: string, to: string): DateRange[] {
  const days: DateRange[] = [];
  for (const range of spans[content]) {
    const first = range.from === null || range.from < from ? from : range.from;
    const last = range.until === null || dayBefore(range.until) > to ? to : dayBefore(range.until);
    if (first <= last) {
      days.push({ from: first, to: last });
    }
  }
  return mergeRanges(days);
}

/** A content's records in a release: how many, the days they are loaded for, the newest start and the newest source retrieval. */
export interface ContentWindow {
  readonly content: ContentId;
  readonly records: number;
  readonly loaded: readonly HalfOpenRange[];
  readonly newestFrom: string;
  readonly newestRetrieved: string | null;
}

export type ContentWindows = ReadonlyMap<ContentId, ContentWindow>;

/**
 * The per-content windows of a release, from rule_record as the application role reads it (one aggregate over
 * rule_record_by_type), with MPPR split as rule_release_content_span() splits it; `recordTypes` limits the types read
 * (all when omitted). A content with no record has no entry.
 */
export async function releaseContentWindows(client: ScopeClient, releaseNo: number, recordTypes?: readonly RuleRecordType[]): Promise<ContentWindows> {
  const { rows } = await client.query<{ content: ContentId; records: number; loaded: string; newest_from: string; newest_retrieved: string | null }>(
    `SELECT CASE WHEN record_type = 'mppr_rate' AND key ? 'hcpcs' THEN 'mppr_code'
                 WHEN record_type = 'mppr_rate' AND key ? 'component' THEN 'mppr_general'
                 ELSE record_type END AS content,
            count(*)::int AS records,
            range_agg(daterange(effective_from, effective_to, '[]'))::text AS loaded,
            max(effective_from)::text AS newest_from,
            max(source ->> 'retrieved') AS newest_retrieved
       FROM rule_record
      WHERE release_no = $1 AND ($2::text[] IS NULL OR record_type = ANY ($2::text[]))
      GROUP BY 1 ORDER BY 1`,
    [releaseNo, recordTypes === undefined ? null : [...recordTypes]],
  );
  return new Map(
    rows.map((row) => [row.content, { content: row.content, records: row.records, loaded: parseDateMultirange(row.loaded), newestFrom: row.newest_from, newestRetrieved: row.newest_retrieved }]),
  );
}

/** The record types the loud content gaps are judged against (one SELECT per run). */
export const LOUD_CONTENT_TYPES = ['pfs_rvu', 'pfs_gpci', 'conversion_factor', 'sequestration', 'assistant_modifier', 'locality_map', 'locality_map_plus_four'] as const satisfies readonly RuleRecordType[];

/** The ENGINE_ERROR details a line stops with when a content has no record for it, and that content. */
const LOUD_DETAILS: ReadonlyMap<string, (typeof LOUD_CONTENT_TYPES)[number]> = new Map([
  ['no_gpci', 'pfs_gpci'],
  ['no_conversion_factor', 'conversion_factor'],
  ['no_sequestration_record', 'sequestration'],
  ['no_assistant_record', 'assistant_modifier'],
  ['no_locality', 'locality_map'],
  ['no_locality_plus_four', 'locality_map_plus_four'],
]);

/**
 * A line stopped by content PaidWhole has not loaded for its date (never one of the three span contents, which refuse
 * the run): a fee schedule not loaded as the engine looked for it (NO_PFS_VALUE no_rvu_in_basis_year, with the service
 * date outside every pfs_rvu window for terms priced on it, or no pfs_rvu window in the locked basis year), or a stop
 * on a missing GPCI, conversion factor, sequestration or assistant record or locality whose content is not loaded on
 * the service date. A loaded date whose code simply has no relative value is not one: that is the code's reason.
 */
export function isLoudContentGap(result: LinePricing, windows: ContentWindows): boolean {
  if (result.outcome !== 'unpriced') {
    return false;
  }
  const { trace } = result;
  const date = trace.line.service_date;
  if (result.reason === 'NO_PFS_VALUE' && result.detail === 'no_rvu_in_basis_year') {
    const schedule = trace.steps.fee_schedule;
    const loaded = windows.get('pfs_rvu')?.loaded ?? [];
    if (schedule === null) {
      return false;
    }
    if (schedule.lookup === 'in_force_on_service_date') {
      return !rangesCover(loaded, date);
    }
    const year = String(schedule.basis_year).padStart(4, '0');
    return !loaded.some((range) => (range.from === null || range.from <= `${year}-12-31`) && (range.until === null || range.until > `${year}-01-01`));
  }
  const content = result.reason === 'ENGINE_ERROR' && result.detail !== null ? LOUD_DETAILS.get(result.detail) : undefined;
  return content !== undefined && !rangesCover(windows.get(content)?.loaded ?? [], date);
}

// ---------------------------------------------------------------------------------------------------
// Reading a release by key (audit #31; docs/adr/0071)

/** Where a pricing caller reads a release from, one batch's keys at a time (audit #31; docs/adr/0071). */
export interface ReleaseSource {
  readonly releaseNo: number;
  readonly manifestSha256: string;
  /**
   * The engine's view for a batch: serves every key the caller has asked this source for so far, the shared types
   * whole; any other keyed lookup sets `violation` and throws (keyedRelease()). The caller checks `violation` after
   * every price() call and before it stores anything.
   */
  view(keys: RequestedKeys): Promise<KeyedReleaseView>;
}

const RECORD_COLUMNS = 'record_type, key, value, effective_from::text AS effective_from, effective_to::text AS effective_to, sha256';

/** The record types of a release, by a loose scan of rule_record_by_type (one probe per type, never the release's rows). */
const RELEASE_TYPES = `WITH RECURSIVE types AS (
  (SELECT record_type FROM rule_record WHERE release_no = $1 ORDER BY record_type LIMIT 1)
  UNION ALL
  SELECT (SELECT r.record_type FROM rule_record r WHERE r.release_no = $1 AND r.record_type > t.record_type ORDER BY r.record_type LIMIT 1)
    FROM types t WHERE t.record_type IS NOT NULL)
SELECT record_type FROM types WHERE record_type IS NOT NULL`;

/**
 * The keyed records of exactly the keys asked, one probe of rule_record_identity per key: OFFSET 0 fences each key's
 * subquery, so the planner never turns the set into a scan or a join of the release, whatever its statistics say
 * (docs/adr/0062). A key with no record returns nothing.
 */
export const KEYED_RECORDS = `SELECT x.record_type, x.key, x.value, x.effective_from::text AS effective_from, x.effective_to::text AS effective_to, x.sha256
  FROM unnest($2::text[], $3::jsonb[]) AS w (record_type, key)
 CROSS JOIN LATERAL (
   SELECT r.record_type, r.key, r.value, r.effective_from, r.effective_to, r.sha256, r.id
     FROM rule_record r
    WHERE r.release_no = $1 AND r.record_type = w.record_type AND r.key = w.key
   OFFSET 0) x
 ORDER BY x.record_type, x.effective_from, x.id`;

/** Keys per keyed-records statement. */
const KEYS_PER_STATEMENT = 5_000;

/** The shared types this process holds, by release and manifest: the one in force and the one before it (runs pinned before a new release). */
const SHARED_RELEASES = new Map<string, IndexedRelease>();
export const SHARED_RELEASES_KEPT = 2;

/** Forgets the shared types held (tests). */
export function forgetSharedReleases(): void {
  SHARED_RELEASES.clear();
}

/** The release's types that are not keyed, read whole and indexed; a type added later is read too, never left out. */
async function sharedTypes(client: ScopeClient, header: ReleaseHeader): Promise<IndexedRelease> {
  const cacheKey = `${String(header.releaseNo)}:${header.manifestSha256}`;
  const found = SHARED_RELEASES.get(cacheKey);
  if (found !== undefined) {
    return found;
  }
  const { rows: types } = await client.query<{ record_type: string }>(RELEASE_TYPES, [header.releaseNo]);
  const keyed = new Set<string>(KEYED_RECORD_TYPES);
  const wanted = types.map((row) => row.record_type).filter((type) => !keyed.has(type));
  const { rows } =
    wanted.length === 0
      ? { rows: [] }
      : await client.query<StoredRecordRow>(`SELECT ${RECORD_COLUMNS} FROM rule_record WHERE release_no = $1 AND record_type = ANY ($2::text[]) ORDER BY record_type, effective_from, id`, [
          header.releaseNo,
          wanted,
        ]);
  const shared = indexStoredRelease(header, rows);
  if (SHARED_RELEASES.size >= SHARED_RELEASES_KEPT) {
    const oldest = SHARED_RELEASES.keys().next().value;
    if (oldest !== undefined) {
      SHARED_RELEASES.delete(oldest);
    }
  }
  SHARED_RELEASES.set(cacheKey, shared);
  return shared;
}

/** The header of a published release; a release that is not published is a mismatch, as loadRuleRelease() says. */
async function publishedHeader(client: ScopeClient, releaseNo: number): Promise<ReleaseHeader> {
  const header = await releaseHeader(client, releaseNo);
  if (header === null) {
    throw new RuleReleaseMismatchError(releaseNo, await currentReleaseNo(client));
  }
  return header;
}

/**
 * A published release in the database: its shared types once per process (two releases at most), its keyed records
 * fetched once per source, a batch's new keys at a time, on the caller's client and transaction (the release is
 * immutable). The source holds the keys it fetched and their records, never the release.
 */
export async function storedReleaseSource(client: ScopeClient, releaseNo: number): Promise<ReleaseSource> {
  const header = await publishedHeader(client, releaseNo);
  const shared = await sharedTypes(client, header);
  const fetched: Record<KeyedRecordType, Set<string>> = Object.fromEntries(KEYED_RECORD_TYPES.map((type) => [type, new Set<string>()])) as Record<KeyedRecordType, Set<string>>;
  const rows: StoredRecordRow[] = [];
  let records = indexStoredRelease(header, rows);
  return {
    releaseNo: header.releaseNo,
    manifestSha256: header.manifestSha256,
    async view(keys: RequestedKeys): Promise<KeyedReleaseView> {
      const types: KeyedRecordType[] = [];
      const identities: string[] = [];
      for (const type of KEYED_RECORD_TYPES) {
        for (const identity of keys[type]) {
          if (!fetched[type].has(identity)) {
            types.push(type);
            identities.push(identity);
          }
        }
      }
      const before = rows.length;
      for (let start = 0; start < identities.length; start += KEYS_PER_STATEMENT) {
        const end = start + KEYS_PER_STATEMENT;
        const { rows: found } = await client.query<StoredRecordRow>(KEYED_RECORDS, [header.releaseNo, types.slice(start, end), identities.slice(start, end)]);
        rows.push(...found);
      }
      // Marked fetched only once read: a key with no record is fetched too, and answers "not found" honestly.
      identities.forEach((identity, index) => fetched[types[index] as KeyedRecordType].add(identity));
      if (rows.length > before) {
        records = indexStoredRelease(header, rows);
      }
      return keyedRelease({ shared, records, requested: fetched });
    },
  };
}

/** A release already in memory (the dry run's candidate from files): the same contract, so a missed key is just as loud. */
export function memoryReleaseSource(release: IndexedRelease): ReleaseSource {
  let fetched: RequestedKeys = requestedKeys({});
  return {
    releaseNo: release.releaseNo,
    manifestSha256: release.manifestSha256,
    view(keys: RequestedKeys): Promise<KeyedReleaseView> {
      fetched = unionKeys(fetched, keys);
      return Promise.resolve(keyedRelease({ shared: release, records: release, requested: fetched }));
    },
  };
}

/** A lookup of a record type a typed release did not read (typedRelease()). */
export class ReleaseTypeNotRead extends Error {
  override readonly name = 'ReleaseTypeNotRead';

  constructor(readonly recordType: RuleRecordType) {
    super(`a ${recordType} lookup in a release read for other record types only`);
  }
}

/**
 * Only the named record types of a published release, for triage and reports (which read the MPPR rates and the
 * conversion factors and nothing else): a lookup of any other type throws ReleaseTypeNotRead, never a quiet "not
 * found".
 */
export async function typedRelease(client: ScopeClient, releaseNo: number, types: readonly RuleRecordType[]): Promise<IndexedRelease> {
  const header = await publishedHeader(client, releaseNo);
  const { rows } = await client.query<StoredRecordRow>(`SELECT ${RECORD_COLUMNS} FROM rule_record WHERE release_no = $1 AND record_type = ANY ($2::text[]) ORDER BY record_type, effective_from, id`, [
    releaseNo,
    [...types],
  ]);
  const read = new Set<RuleRecordType>(types);
  const indexed = indexStoredRelease(header, rows);
  const admit = (type: RuleRecordType): void => {
    if (!read.has(type)) {
      throw new ReleaseTypeNotRead(type);
    }
  };
  return {
    releaseNo: indexed.releaseNo,
    manifestSha256: indexed.manifestSha256,
    inForce<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, date: string): RuleRecordOf<T> | null {
      admit(type);
      return indexed.inForce(type, key, date);
    },
    latestInYear<T extends RuleRecordType>(type: T, key: Readonly<Record<string, string>>, year: number): RuleRecordOf<T> | null {
      admit(type);
      return indexed.latestInYear(type, key, year);
    },
    ref: (record) => indexed.ref(record),
  };
}
