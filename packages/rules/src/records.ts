import { createHash } from 'node:crypto';

import { z } from 'zod';

import { RULE_RECORD_TYPES, type RuleRecord, type RuleRecordType, type SecondPassRecord, RECORD_DATING, TRANSCRIBED_FIELDS, isoDate, recordTypesDated } from './schema';

/**
 * Canonical JSON: object keys sorted at every level, no whitespace. Two records with the same
 * content always produce the same text, so the text's SHA-256 identifies the record.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('canonical JSON has no representation for a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item: unknown) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => compareText(a, b));
    return `{${entries.map(([name, item]) => `${JSON.stringify(name)}:${canonicalJson(item)}`).join(',')}}`;
  }
  throw new TypeError(`canonical JSON has no representation for a ${typeof value}`);
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** The SHA-256 of a record's canonical JSON: `rule_record.sha256`. */
export function recordSha256(record: RuleRecord): string {
  return sha256(canonicalJson(record));
}

/** The fields that identify a rule: its type and key (a draft, a release record or a second pass). */
export interface Identified {
  readonly record_type: string;
  readonly key: unknown;
}

/** Records with the same identity are the same rule; their effective windows must not overlap. */
export function recordIdentity(record: Identified): string {
  return `${record.record_type} ${canonicalJson(record.key)}`;
}

/** A short human label for messages: `pfs_rvu {"hcpcs":"97110","modifier":""} from 2026-01-01`. */
export function recordLabel(record: Identified & { readonly effective_from: string }): string {
  return `${recordIdentity(record)} from ${record.effective_from}`;
}

/** True when two inclusive date windows share a day (a null end is open). */
export function windowsOverlap(
  a: { readonly effective_from: string; readonly effective_to: string | null },
  b: { readonly effective_from: string; readonly effective_to: string | null },
): boolean {
  const aEndsBeforeB = a.effective_to !== null && a.effective_to < b.effective_from;
  const bEndsBeforeA = b.effective_to !== null && b.effective_to < a.effective_from;
  return !aEndsBeforeB && !bEndsBeforeA;
}

export interface Located<T> {
  readonly record: T;
  /** Where the record lives, for messages ("therapy_threshold/2026/records.json record 2"). */
  readonly where: string;
}

export interface Overlap<T> {
  readonly first: Located<T>;
  readonly second: Located<T>;
}

/** Orders text by code unit, which is calendar order for ISO dates and independent of locale. */
export function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** True when window `a` ends after window `b` (a null end is open, so it reaches furthest). */
function endsLater(
  a: { readonly effective_to: string | null },
  b: { readonly effective_to: string | null },
): boolean {
  if (b.effective_to === null) {
    return false;
  }
  return a.effective_to === null || a.effective_to > b.effective_to;
}

/**
 * Records with the same record type and key whose effective windows overlap: each record that
 * overlaps an earlier one is reported once, paired with the earlier record that reaches furthest
 * (if it overlaps any earlier record, it overlaps that one).
 */
export function findOverlaps<T extends RuleRecord>(records: readonly Located<T>[]): Overlap<T>[] {
  const groups = new Map<string, Located<T>[]>();
  for (const located of records) {
    const identity = recordIdentity(located.record);
    const group = groups.get(identity);
    if (group === undefined) {
      groups.set(identity, [located]);
    } else {
      group.push(located);
    }
  }
  const overlaps: Overlap<T>[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => compareText(a.record.effective_from, b.record.effective_from));
    let furthest: Located<T> | undefined;
    for (const current of sorted) {
      if (furthest !== undefined && windowsOverlap(furthest.record, current.record)) {
        overlaps.push({ first: furthest, second: current });
      }
      if (furthest === undefined || endsLater(current.record, furthest.record)) {
        furthest = current;
      }
    }
  }
  return overlaps;
}

/**
 * Writes records as a JSON array with one record per line: valid JSON that diffs one record at a
 * time in review. Hand-typed drafts may be pretty-printed instead; readers accept any JSON array.
 */
export function serializeRecords(records: readonly RuleRecord[]): string {
  if (records.length === 0) {
    return '[]\n';
  }
  return `[\n${records.map((record) => JSON.stringify(record)).join(',\n')}\n]\n`;
}

// ---------------------------------------------------------------------------------------------
// File names in content sets

/** A record file's second transcription sits beside it: records.json and records.second-pass.json. */
export const SECOND_PASS_SUFFIX = '.second-pass.json';
/** The L2 questions for a parsed draft sit beside it: PPRRVU26.json and PPRRVU26.review.md. */
export const REVIEW_SUFFIX = '.review.md';

export function secondPassPathFor(recordFile: string): string {
  return `${recordFile.replace(/\.json$/, '')}${SECOND_PASS_SUFFIX}`;
}

export function isSecondPassFile(file: string): boolean {
  return file.endsWith(SECOND_PASS_SUFFIX);
}

// ---------------------------------------------------------------------------------------------
// Transcribe twice and diff

/** The transcribed fields of a record, for comparison with its second pass. */
export function transcription(record: RuleRecord | SecondPassRecord): Record<(typeof TRANSCRIBED_FIELDS)[number], unknown> {
  return { key: record.key, value: record.value, effective_from: record.effective_from, effective_to: record.effective_to, quotes: record.quotes };
}

/**
 * Compares the hand-typed records of a file with their second transcription and returns one line
 * per difference (empty when the two passes agree exactly). Records pair up by type, key and start
 * date; within a pair every transcribed field must be identical.
 */
export function diffTranscriptions(first: readonly RuleRecord[], second: readonly SecondPassRecord[]): string[] {
  const pairKey = (record: RuleRecord | SecondPassRecord) => recordLabel(record);
  const firstByKey = new Map(first.map((record) => [pairKey(record), record]));
  const secondByKey = new Map<string, SecondPassRecord>();
  const differences: string[] = [];
  for (const record of second) {
    const label = pairKey(record);
    if (secondByKey.has(label)) {
      differences.push(`${label}: transcribed twice in the second pass`);
    }
    secondByKey.set(label, record);
  }
  for (const [label, record] of firstByKey) {
    const other = secondByKey.get(label);
    if (!other) {
      differences.push(`${label}: missing from the second pass`);
      continue;
    }
    const a = transcription(record);
    const b = transcription(other);
    for (const field of TRANSCRIBED_FIELDS) {
      if (canonicalJson(a[field]) !== canonicalJson(b[field])) {
        differences.push(`${label}: ${field} differs: first pass ${canonicalJson(a[field])}, second pass ${canonicalJson(b[field])}`);
      }
    }
  }
  for (const label of secondByKey.keys()) {
    if (!firstByKey.has(label)) {
      differences.push(`${label}: in the second pass but not among the hand-typed records`);
    }
  }
  return differences;
}

// ---------------------------------------------------------------------------------------------
// Source text

/**
 * Decodes a stored source file the same way for the importer and the checker: UTF-8 when the bytes
 * are valid UTF-8, otherwise Windows-1252 (how older CMS text files are encoded). A leading
 * byte-order mark is dropped.
 */
export function decodeSourceText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = decodeWindows1252(bytes);
  }
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

/**
 * Windows-1252 differs from Latin-1 only in 0x80 to 0x9F (curly quotes, dashes, the euro sign).
 * Node's built-in decoder treats that range as Latin-1, so it is mapped here; the five unassigned
 * bytes keep their Latin-1 control characters, as the WHATWG encoding standard does.
 */
const WINDOWS_1252_HIGH = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

function decodeWindows1252(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? (WINDOWS_1252_HIGH[byte - 0x80] ?? byte) : byte);
  }
  return text;
}

/**
 * Answers "does this quote appear verbatim in the source?" quickly for many quotes: a quote that is
 * a whole line (as parsed records quote their row) is found in a set; anything else by search.
 */
export function quoteIndex(sourceText: string): (quote: string) => boolean {
  const lines = new Set(sourceText.split(/\r?\n/));
  return (quote) => lines.has(quote) || sourceText.includes(quote);
}

/**
 * True when `number` (digits, optionally with a point, a "$" or thousands commas) appears in `text`
 * as a number of its own: not inside a longer one, so "3.4" is not found in "$33.4009" and "30" is
 * not found in "130" or "30.5".
 */
export function containsNumber(text: string, number: string): boolean {
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\d.,])${escaped}(?!\\d|[.,]\\d)`).test(text);
}

// ---------------------------------------------------------------------------------------------
// Date ranges and contents (audit #30, docs/adr/0071)

/** A window of days, both ends included; a null end is open. */
export interface DateRange {
  readonly from: string;
  readonly to: string | null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Date.UTC(Number.parseInt(date.slice(0, 4), 10), Number.parseInt(date.slice(5, 7), 10) - 1, Number.parseInt(date.slice(8, 10), 10)) / DAY_MS;
}

function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function dayAfter(date: string): string {
  return dateOfDay(dayNumber(date) + 1);
}

export function dayBefore(date: string): string {
  return dateOfDay(dayNumber(date) - 1);
}

/** Sorted, with overlapping and adjacent ranges (to + 1 day = next from) merged. */
export function mergeRanges(ranges: readonly DateRange[]): DateRange[] {
  const sorted = [...ranges].sort((a, b) => compareText(a.from, b.from));
  const merged: DateRange[] = [];
  let current: { from: string; to: string | null } | undefined;
  for (const range of sorted) {
    if (current !== undefined && (current.to === null || range.from <= dayAfter(current.to))) {
      if (current.to !== null && (range.to === null || range.to > current.to)) {
        current.to = range.to;
      }
      continue;
    }
    if (current !== undefined) {
      merged.push(current);
    }
    current = { from: range.from, to: range.to };
  }
  if (current !== undefined) {
    merged.push(current);
  }
  return merged;
}

/** The days of `a` not in `b`, as merged ranges. */
export function subtractRanges(a: readonly DateRange[], b: readonly DateRange[]): DateRange[] {
  const removed = mergeRanges(b);
  const left: DateRange[] = [];
  // Both lists are sorted and `from` only moves forward, so a range of `removed` that ends before it is never needed again.
  let next = 0;
  for (const range of mergeRanges(a)) {
    let from: string | null = range.from;
    for (let index = next; index < removed.length && from !== null; index += 1) {
      const cut = removed[index] as DateRange;
      if (cut.to !== null && cut.to < from) {
        next = index + 1;
        continue;
      }
      if (range.to !== null && cut.from > range.to) {
        break;
      }
      if (cut.from > from) {
        left.push({ from, to: dayBefore(cut.from) });
      }
      from = cut.to === null || (range.to !== null && cut.to >= range.to) ? null : dayAfter(cut.to);
    }
    if (from !== null) {
      left.push({ from, to: range.to });
    }
  }
  return left;
}

/**
 * A content: a record type, with mppr_rate split exactly as rule_release_content_span() splits it
 * (20261105090000:1031-1033): key ? 'hcpcs' is mppr_code, key ? 'component' is mppr_general; a key with neither
 * throws (the schema's strict keys allow neither, schema.ts:246-256).
 */
export const CONTENT_IDS = [
  'pfs_rvu',
  'pfs_gpci',
  'conversion_factor',
  'mppr_code',
  'mppr_general',
  'therapy_threshold',
  'assistant_modifier',
  'sequestration',
  'ncci_ptp',
  'ncci_mue',
  'carc',
  'rarc',
  'claim_status_code',
  'state_prompt_pay',
  'dispute_window',
  'locality_map',
  'locality_map_plus_four',
  'denial_category',
] as const satisfies readonly (Exclude<RuleRecordType, 'mppr_rate'> | 'mppr_code' | 'mppr_general')[];
export type ContentId = (typeof CONTENT_IDS)[number];

export function contentOf(record: { readonly record_type: RuleRecordType; readonly key: Readonly<Record<string, unknown>> }): ContentId {
  if (record.record_type !== 'mppr_rate') {
    return record.record_type;
  }
  if (Object.hasOwn(record.key, 'hcpcs')) {
    return 'mppr_code';
  }
  if (Object.hasOwn(record.key, 'component')) {
    return 'mppr_general';
  }
  throw new TypeError(`an mppr_rate key names neither hcpcs nor component: ${canonicalJson(record.key)}`);
}

export interface ContentSummary {
  readonly content: ContentId;
  readonly records: number;
  readonly windows: readonly DateRange[];
  readonly newest_from: string;
  readonly newest_retrieved: string;
}

interface SummaryState {
  records: number;
  windows: DateRange[];
  /** How many of `windows` were merged at the last compaction. */
  merged: number;
  newestFrom: string;
  newestRetrieved: string;
}

/** Windows gathered before a content's list is merged again: keeps a builder of millions of records to a few ranges. */
const COMPACT_AFTER = 4096;

/** The same as contentSummaries, built a record at a time and holding no record (the CLI reads the drafts file by file, review m8). */
export class ContentSummaryBuilder {
  readonly #states = new Map<ContentId, SummaryState>();

  add(record: RuleRecord): void {
    const content = contentOf(record);
    const window = { from: record.effective_from, to: record.effective_to };
    const state = this.#states.get(content);
    if (state === undefined) {
      this.#states.set(content, { records: 1, windows: [window], merged: 0, newestFrom: record.effective_from, newestRetrieved: record.source.retrieved });
      return;
    }
    state.records += 1;
    state.windows.push(window);
    if (state.windows.length > state.merged + COMPACT_AFTER) {
      state.windows = mergeRanges(state.windows);
      state.merged = state.windows.length;
    }
    if (record.effective_from > state.newestFrom) {
      state.newestFrom = record.effective_from;
    }
    if (record.source.retrieved > state.newestRetrieved) {
      state.newestRetrieved = record.source.retrieved;
    }
  }

  /** Per content present, in CONTENT_IDS order. */
  summaries(): ContentSummary[] {
    return CONTENT_IDS.flatMap((content) => {
      const state = this.#states.get(content);
      return state === undefined
        ? []
        : [{ content, records: state.records, windows: mergeRanges(state.windows), newest_from: state.newestFrom, newest_retrieved: state.newestRetrieved }];
    });
  }
}

/** Per content present, in CONTENT_IDS order: its record count, merged windows, newest start and newest source.retrieved. */
export function contentSummaries(records: Iterable<RuleRecord>): ContentSummary[] {
  const builder = new ContentSummaryBuilder();
  for (const record of records) {
    builder.add(record);
  }
  return builder.summaries();
}

export interface ContentGap {
  readonly content: ContentId;
  readonly from: string;
  readonly to: string;
}

/**
 * The holes inside each content's merged windows (between its first start and its last end), every content but
 * locality_map_plus_four, which is sparse by design (the assembler's plusFourGaps covers it). In CONTENT_IDS order,
 * then by date.
 */
export function contentGaps(records: Iterable<RuleRecord>): ContentGap[] {
  return contentSummaries(records).flatMap((summary) => {
    if (summary.content === 'locality_map_plus_four') {
      return [];
    }
    const gaps: ContentGap[] = [];
    for (let index = 1; index < summary.windows.length; index += 1) {
      const before = summary.windows[index - 1] as DateRange;
      const after = summary.windows[index] as DateRange;
      // Merged ranges are sorted and apart, so only the last can be open and a gap's ends are real days.
      gaps.push({ content: summary.content, from: dayAfter(before.to as string), to: dayBefore(after.from) });
    }
    return gaps;
  });
}

// ---------------------------------------------------------------------------------------------
// Coverage against the previous release (audit #30 R3 and R5, docs/adr/0071)

/**
 * Per identity (recordIdentity(): record type and canonical key, records.ts:47-49), its coverage, encoded compactly:
 * merged ranges as "from..to" joined by ",", an open end as "from..". For the source-dated types, also the
 * effective_from of its open-ended record, if any, after "@" (at most one, since overlaps are refused).
 */
export type CoverageMap = ReadonlyMap<string, string>;

/** The types whose window comes from the file's own dates (ncci.ts:81-89, x12-code-list.ts:56, conversion-factor.ts:56). */
export const SOURCE_DATED_TYPES = recordTypesDated('source_dated');

function isSourceDated(type: RuleRecordType): boolean {
  return RECORD_DATING[type] === 'source_dated';
}

interface Coverage {
  readonly ranges: DateRange[];
  readonly openFrom: string | null;
}

function encodeCoverage(coverage: Coverage): string {
  const ranges = coverage.ranges.map((range) => `${range.from}..${range.to ?? ''}`).join(',');
  return coverage.openFrom === null ? ranges : `${ranges}@${coverage.openFrom}`;
}

function decodeCoverage(text: string): Coverage {
  const [ranges = '', openFrom] = text.split('@');
  return {
    ranges: ranges.split(',').map((range) => {
      const [from = '', to = ''] = range.split('..');
      return { from, to: to === '' ? null : to };
    }),
    openFrom: openFrom ?? null,
  };
}

/**
 * The same text as one flat string. Text built by concatenation is a tree of its parts in V8, which a map key keeps
 * alive: about 70% more heap per identity (measured on Node 24: 345 MiB against 178 MiB for 2,000,000 PTP keys).
 * normalize() returns a flat copy; text it would change (never a schema key, which is ASCII) is kept as it is.
 */
function flatText(text: string): string {
  const flat = text.normalize();
  return flat === text ? flat : text;
}

/**
 * The coverage of every identity in `records`, holding one string per identity and never a record. Equal coverage
 * strings are interned (one string per distinct value) and keys are flat, so a release's map costs about its keys' text
 * (review m8).
 */
export function coverageMap(records: Iterable<RuleRecord>): CoverageMap {
  const map = new Map<string, string>();
  const interned = new Map<string, string>();
  for (const record of records) {
    const identity = flatText(recordIdentity(record));
    const before = map.get(identity);
    const window = { from: record.effective_from, to: record.effective_to };
    const coverage = before === undefined ? { ranges: [window], openFrom: null } : decodeCoverage(before);
    const ranges = before === undefined ? coverage.ranges : mergeRanges([...coverage.ranges, window]);
    const openFrom = record.effective_to === null && isSourceDated(record.record_type) ? record.effective_from : coverage.openFrom;
    const text = encodeCoverage({ ranges, openFrom });
    const shared = interned.get(text);
    if (shared === undefined) {
      interned.set(text, text);
      map.set(identity, text);
    } else {
      map.set(identity, shared);
    }
  }
  return map;
}

/** A key's values are strings, or null where the schema allows one (denial_category's group_code and rarc). */
export type CoverageKey = Readonly<Record<string, string | null>>;

export interface CoverageLoss {
  readonly record_type: RuleRecordType;
  readonly key: CoverageKey;
  readonly from: string;
  readonly to: string | null;
}

export interface CoverageRegression {
  readonly beforeCutoff: CoverageLoss[];
  readonly closedBySource: CoverageLoss[];
  readonly unexplained: CoverageLoss[];
}

function splitIdentity(identity: string): { readonly record_type: RuleRecordType; readonly key: CoverageKey } {
  const space = identity.indexOf(' ');
  return { record_type: identity.slice(0, space) as RuleRecordType, key: JSON.parse(identity.slice(space + 1)) as CoverageKey };
}

/** Losses in the order COVERAGE.md lists them: by record type, canonical key, then start. */
export function compareLosses(a: CoverageLoss, b: CoverageLoss): number {
  return compareText(a.record_type, b.record_type) || compareText(canonicalJson(a.key), canonicalJson(b.key)) || compareText(a.from, b.from);
}

/** A coverage loss as the assembler and the checker name it: record type, canonical key and dates. */
export function lossText(loss: CoverageLoss): string {
  return `${loss.record_type} ${canonicalJson(loss.key)} ${loss.from} to ${loss.to ?? 'open'}`;
}

/** What makes two losses (or a loss and a withdrawn entry) the same: record type, key and dates, never the signatures. */
export function lossIdentity(loss: CoverageLoss): string {
  return canonicalJson({ record_type: loss.record_type, key: loss.key, from: loss.from, to: loss.to });
}

/**
 * What `next` stops covering that `previous` covered, per identity: the part before `cutoff` (older than the
 * look-back), an open end a source-dated record's own end date closed (its successor in `nextRecords` keeps the start
 * and ends the day before the loss), and the rest, which is unexplained. Each list sorted by record type, canonical
 * key, then start.
 */
export function coverageRegression(previous: CoverageMap, next: CoverageMap, nextRecords: Iterable<RuleRecord>, cutoff: string): CoverageRegression {
  const beforeCutoff: CoverageLoss[] = [];
  const candidates: { readonly loss: CoverageLoss; readonly closing: string }[] = [];
  const unexplained: CoverageLoss[] = [];
  for (const [identity, text] of previous) {
    const had = decodeCoverage(text);
    const kept = next.get(identity);
    const lost = subtractRanges(had.ranges, kept === undefined ? [] : decodeCoverage(kept).ranges);
    if (lost.length === 0) {
      continue;
    }
    const { record_type, key } = splitIdentity(identity);
    for (const range of lost) {
      if (range.from < cutoff) {
        if (range.to !== null && range.to < cutoff) {
          beforeCutoff.push({ record_type, key, from: range.from, to: range.to });
          continue;
        }
        beforeCutoff.push({ record_type, key, from: range.from, to: dayBefore(cutoff) });
      }
      const loss = { record_type, key, from: range.from < cutoff ? cutoff : range.from, to: range.to };
      if (loss.to === null && had.openFrom !== null && isSourceDated(record_type)) {
        // Closed by source only when the open-ended record itself ends the day before: `identity|start|end`.
        candidates.push({ loss, closing: `${identity}|${had.openFrom}|${dayBefore(loss.from)}` });
      } else {
        unexplained.push(loss);
      }
    }
  }
  const closedBySource: CoverageLoss[] = [];
  if (candidates.length > 0) {
    const wanted = new Set(candidates.map((candidate) => candidate.closing));
    const found = new Set<string>();
    for (const record of nextRecords) {
      if (record.effective_to !== null && isSourceDated(record.record_type)) {
        const closing = `${recordIdentity(record)}|${record.effective_from}|${record.effective_to}`;
        if (wanted.has(closing)) {
          found.add(closing);
        }
      }
    }
    for (const candidate of candidates) {
      (found.has(candidate.closing) ? closedBySource : unexplained).push(candidate.loss);
    }
  }
  return { beforeCutoff: beforeCutoff.sort(compareLosses), closedBySource: closedBySource.sort(compareLosses), unexplained: unexplained.sort(compareLosses) };
}

/** The look-back of a release's coverage check: line data's retention, contract term plus six years (PRD.md:813). */
export const LOOK_BACK_YEARS = 6;

/** January 1 of the prepared date's year minus LOOK_BACK_YEARS. */
export function lookBackCutoff(preparedOn: string): string {
  return `${String(Number.parseInt(preparedOn.slice(0, 4), 10) - LOOK_BACK_YEARS).padStart(4, '0')}-01-01`;
}

// ---------------------------------------------------------------------------------------------
// COVERAGE.md and the drafts' withdrawal note

/** A named person: printable, trimmed. */
const signer = z
  .string()
  .regex(/^[\x20-\x7E]{2,80}$/, 'must be a name of 2 to 80 printable characters')
  .refine((name) => name.trim() === name, 'must not start or end with a space');
/** One printable line (loader.ts:182-183's rule). */
const reason = z.string().regex(/^[\x20-\x7E]{8,500}$/, 'must be one line of 8 to 500 printable characters');
const loss = z.strictObject({
  record_type: z.enum(RULE_RECORD_TYPES),
  key: z.record(z.string(), z.string().nullable()),
  from: isoDate,
  to: isoDate.nullable(),
});
const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();
// A slip check only: the second signature of record is the founder's code-owner review of the note's pull request (ADR 0071).
const withdrawn = loss
  .extend({ reason, withdrawn_by: signer, confirmed_by: signer, withdrawn_on: isoDate })
  .refine((entry) => !sameName(entry.withdrawn_by, entry.confirmed_by), { message: 'confirmed_by must be a person other than withdrawn_by', path: ['confirmed_by'] });

export const releaseCoverageSchema = z.strictObject({
  format: z.literal('tp-release-coverage/1'),
  release: z.number().int().positive(),
  previous_release: z.number().int().positive().nullable(),
  prepared_on: isoDate,
  look_back_years: z.literal(LOOK_BACK_YEARS),
  cutoff: isoDate,
  contents: z.array(
    z.strictObject({
      content: z.enum(CONTENT_IDS),
      records: z.number().int().positive(),
      windows: z.array(z.strictObject({ from: isoDate, to: isoDate.nullable() })).min(1),
      newest_from: isoDate,
      newest_retrieved: isoDate,
    }),
  ),
  before_cutoff: z.array(loss),
  closed_by_source: z.array(loss),
  withdrawn: z.array(withdrawn),
});
export type ReleaseCoverage = z.infer<typeof releaseCoverageSchema>;
export type WithdrawnEntry = ReleaseCoverage['withdrawn'][number];

export const coverageWithdrawnNoteSchema = z.strictObject({
  format: z.literal('tp-coverage-withdrawn/1'),
  previous_release: z.number().int().positive(),
  // A loss withdrawn twice would pass the assembler's set and fail the assembled release's check far from its cause.
  withdrawn: z
    .array(withdrawn)
    .min(1)
    .superRefine((entries, context) => {
      const seen = new Set<string>();
      entries.forEach((entry, index) => {
        const identity = lossIdentity(entry);
        if (seen.has(identity)) {
          context.addIssue({ code: 'custom', message: `withdraws ${lossText(entry)} a second time: list each loss once`, path: [index] });
        }
        seen.add(identity);
      });
    }),
});
export type CoverageWithdrawnNote = z.infer<typeof coverageWithdrawnNoteSchema>;

export const COVERAGE_FILE = 'COVERAGE.md';
export const COVERAGE_WITHDRAWN_FILE = 'COVERAGE-WITHDRAWN.md';

/** A key with its names sorted, as canonical JSON orders them. */
function sortedKey(key: CoverageKey): CoverageKey {
  return Object.fromEntries(Object.entries(key).sort(([a], [b]) => compareText(a, b)));
}

function lossInOrder(entry: CoverageLoss): CoverageLoss {
  return { record_type: entry.record_type, key: sortedKey(entry.key), from: entry.from, to: entry.to };
}

/** The file's text: a heading, a short prose summary, then exactly one ```json block (two-space JSON, keys in schema order). */
export function renderCoverageFile(coverage: ReleaseCoverage): string {
  const n = String(coverage.release);
  const m = coverage.previous_release === null ? null : String(coverage.previous_release);
  const inOrder: ReleaseCoverage = {
    format: coverage.format,
    release: coverage.release,
    previous_release: coverage.previous_release,
    prepared_on: coverage.prepared_on,
    look_back_years: coverage.look_back_years,
    cutoff: coverage.cutoff,
    contents: coverage.contents.map((entry) => ({
      content: entry.content,
      records: entry.records,
      windows: entry.windows.map((window) => ({ from: window.from, to: window.to })),
      newest_from: entry.newest_from,
      newest_retrieved: entry.newest_retrieved,
    })),
    before_cutoff: coverage.before_cutoff.map(lossInOrder),
    closed_by_source: coverage.closed_by_source.map(lossInOrder),
    withdrawn: coverage.withdrawn.map((entry) => ({
      ...lossInOrder(entry),
      reason: entry.reason,
      withdrawn_by: entry.withdrawn_by,
      confirmed_by: entry.confirmed_by,
      withdrawn_on: entry.withdrawn_on,
    })),
  };
  const against =
    m === null
      ? [`- Release ${n} is the first release: nothing to compare.`]
      : [
          `- Against release ${m}: ${String(coverage.before_cutoff.length)} range(s) before the look-back's cutoff (${coverage.cutoff}), ${String(coverage.closed_by_source.length)} closed by the source's own dates,`,
          `  ${String(coverage.withdrawn.length)} withdrawn by a signed note.`,
        ];
  return [
    `# Coverage of release ${n}`,
    '',
    `Prepared ${coverage.prepared_on} by \`pnpm release:assemble ${n}\`. The content checker recomputes everything in the block below`,
    `from this release's records${m === null ? '' : ` and release ${m}'s`}; never edit it by hand (content/sources/README.md, "Coverage").`,
    '',
    `- ${String(coverage.contents.length)} contents, each with the dates it is loaded for.`,
    ...against,
    '',
    '```json',
    JSON.stringify(inOrder, null, 2),
    '```',
    '',
  ].join('\n');
}

/** The one ```json block of a .md file, parsed; problems as strings (none, or more than one block, is a problem). */
export function readJsonBlock(text: string): { value?: unknown; problems: string[] } {
  const blocks: string[] = [];
  let open: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (open === null) {
      if (line === '```json') {
        open = [];
      }
    } else if (line === '```') {
      blocks.push(open.join('\n'));
      open = null;
    } else {
      open.push(line);
    }
  }
  if (open !== null) {
    return { problems: ['its ```json block is never closed by a ``` line'] };
  }
  if (blocks.length !== 1) {
    return { problems: [`holds ${String(blocks.length)} \`\`\`json blocks: it must hold exactly one`] };
  }
  let value: unknown;
  try {
    value = JSON.parse(blocks[0] as string) as unknown;
  } catch {
    return { problems: ['its ```json block is not valid JSON'] };
  }
  const repeated = repeatedKey(blocks[0] as string);
  if (repeated !== null) {
    return { problems: [`its \`\`\`json block names ${JSON.stringify(repeated)} twice in one object: JSON keeps only the last, so a reader and the checker would read different values`] };
  }
  return { value, problems: [] };
}

/**
 * The first key named twice in one object of `json`, which JSON.parse has already accepted, or null. JSON.parse keeps
 * the last of repeated keys, so a block whose first "withdrawn" is empty and whose second is not reads as the second.
 */
function repeatedKey(json: string): string | null {
  /** Per open container: the keys of an object, or null for an array. */
  const open: (Set<string> | null)[] = [];
  for (let at = 0; at < json.length; at += 1) {
    const char = json[at];
    if (char === '{') {
      open.push(new Set<string>());
    } else if (char === '[') {
      open.push(null);
    } else if (char === '}' || char === ']') {
      open.pop();
    } else if (char === '"') {
      let end = at + 1;
      while (json[end] !== '"') {
        end += json[end] === '\\' ? 2 : 1;
      }
      let next = end + 1;
      while (/\s/.test(json[next] ?? '')) {
        next += 1;
      }
      const keys = open.at(-1);
      if (keys !== null && keys !== undefined && json[next] === ':') {
        const key = JSON.parse(json.slice(at, end + 1)) as string;
        if (keys.has(key)) {
          return key;
        }
        keys.add(key);
      }
      at = end;
    }
  }
  return null;
}
