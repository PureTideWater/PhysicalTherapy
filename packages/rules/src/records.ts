import { createHash } from 'node:crypto';

import { type RuleRecord, type SecondPassRecord, TRANSCRIBED_FIELDS } from './schema';

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
