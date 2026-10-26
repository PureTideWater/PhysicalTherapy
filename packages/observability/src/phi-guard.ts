/**
 * The PHI guard for the places identifiers must never appear: URL paths and query strings, S3 keys,
 * and job payloads (CLAUDE.md "Never"; PRD 7 Information architecture rules; PRD 16 Logging
 * discipline; test matrix SEC-08). Two layers:
 *
 * - Structure. A URL path segment is an opaque UUID or a lowercase route word; an S3 key segment is a
 *   UUID, a lowercase word, a version (v1) or a short number (a year, month or day folder), with an
 *   optional extension on the last one; a job payload is a flat object whose keys end in _id and hold
 *   UUIDs, plus `period` (YYYY-MM) and `day` (YYYY-MM-DD) for the jobs that name a month or a day.
 * - Shapes and known values. Anything left after the UUIDs is scanned for a run of nine or more
 *   digits, an SSN, a calendar date, an email address and a phone number, and, when a test hands it
 *   the synthetic record it used, for any of that record's values.
 *
 * Findings name the position and the rule, never the value, so a finding can be logged or thrown.
 * Later milestones call assertNoPhi() in their tests on every URL, key and payload they produce.
 */

export type PhiCarrier = 'url' | 's3_key' | 'job_payload';

export interface PhiGuardOptions {
  /** Synthetic PHI values (names, dates of birth, member IDs, claim numbers) that must not appear. */
  readonly known?: readonly string[];
}

/** PHI, or something shaped like it, where only opaque IDs belong. The message never carries the value. */
export class PhiLeakError extends Error {
  override readonly name = 'PhiLeakError';

  constructor(
    readonly carrier: PhiCarrier,
    readonly findings: readonly string[],
  ) {
    super(`${carrier} may carry PHI: ${findings.join('; ')}`);
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const UUID_ONLY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SHAPES: readonly { readonly reason: string; readonly pattern: RegExp }[] = [
  { reason: 'a run of nine or more digits (an SSN, member ID or claim number shape)', pattern: /\d{9}/ },
  { reason: 'an SSN shape', pattern: /(^|\D)\d{3}-\d{2}-\d{4}(\D|$)/ },
  { reason: 'a calendar date (a date of birth shape)', pattern: /(^|\D)(1[89]|20)\d{2}[-/.]?(0[1-9]|1[0-2])[-/.]?(0[1-9]|[12]\d|3[01])(\D|$)|(^|\D)\d{1,2}[/.-]\d{1,2}[/.-](\d{2}|\d{4})(\D|$)/ },
  { reason: 'an email address', pattern: /[^@\s/?&=]+@[^@\s/?&=]+\.[a-z]{2,}/i },
  { reason: 'a phone number shape', pattern: /(^|\D)\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(\D|$)/ },
];

function alphanumeric(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** What the shape and known-value layer finds in `text`, at `where`. */
function contentFindings(where: string, text: string, options: PhiGuardOptions): string[] {
  const findings: string[] = [];
  const rest = text.replace(UUID, ' ');
  for (const { reason, pattern } of SHAPES) {
    if (pattern.test(rest)) {
      findings.push(`${where} holds ${reason}`);
    }
  }
  const lower = rest.toLowerCase();
  const compact = alphanumeric(rest);
  for (const value of options.known ?? []) {
    const plain = value.trim().toLowerCase();
    const squeezed = alphanumeric(value);
    if ((plain.length > 0 && lower.includes(plain)) || (squeezed.length >= 4 && compact.includes(squeezed))) {
      findings.push(`${where} holds a value of the synthetic record`);
      break;
    }
  }
  return findings;
}

function decoded(text: string): string {
  try {
    return decodeURIComponent(text.replaceAll('+', ' '));
  } catch {
    return text;
  }
}

const ROUTE_WORD = /^[a-z][a-z0-9-]*$/;

/** Findings for a URL (absolute or a path with an optional query string). */
export function urlPhiFindings(url: string, options: PhiGuardOptions = {}): string[] {
  const parsed = new URL(url, 'https://placeholder.invalid');
  const findings: string[] = [];
  parsed.pathname
    .split('/')
    .filter((segment) => segment !== '')
    .forEach((segment, index) => {
      const text = decoded(segment);
      if (!UUID_ONLY.test(text) && !ROUTE_WORD.test(text)) {
        findings.push(`URL path segment ${String(index + 1)} is neither an opaque ID nor a lowercase route word`);
      }
      findings.push(...contentFindings(`URL path segment ${String(index + 1)}`, text, options));
    });
  for (const [key, value] of parsed.searchParams) {
    if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      findings.push('a URL query parameter name is not a lowercase code');
    }
    findings.push(...contentFindings(`URL query parameter ${key}`, value, options));
  }
  findings.push(...contentFindings('URL fragment', decoded(parsed.hash), options));
  return findings;
}

const KEY_SEGMENT = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z][a-z0-9-]*|v\d{1,3}|\d{1,4})$/;
const EXTENSION = /^[a-z0-9]{1,8}$/;

/** Findings for an S3 object key. */
export function s3KeyPhiFindings(key: string, options: PhiGuardOptions = {}): string[] {
  const findings: string[] = [];
  const segments = key.split('/');
  segments.forEach((segment, index) => {
    const where = `S3 key segment ${String(index + 1)}`;
    const last = index === segments.length - 1;
    const dot = last ? segment.indexOf('.') : -1;
    const stem = dot > 0 ? segment.slice(0, dot) : segment;
    const extension = dot > 0 ? segment.slice(dot + 1) : '';
    if (!KEY_SEGMENT.test(stem) || (dot > 0 && !EXTENSION.test(extension))) {
      findings.push(`${where} is not an opaque ID, a lowercase word, a version or a short number`);
    }
    findings.push(...contentFindings(where, segment, options));
  });
  return findings;
}

const PAYLOAD_FIELDS: Readonly<Record<string, RegExp>> = {
  period: /^\d{4}-(0[1-9]|1[0-2])$/,
  day: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
  /** The renderer a packet export was asked under (@tp/packets WORDS_VERSION; docs/adr/0072): a SHA-256 of code, never of a record. */
  words_version: /^[0-9a-f]{64}$/,
};

/** Findings for a job payload. */
export function jobPayloadPhiFindings(payload: unknown, options: PhiGuardOptions = {}): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return ['a job payload is an object of opaque IDs'];
  }
  const findings: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    const where = `job payload field ${key}`;
    const format = PAYLOAD_FIELDS[key];
    if (format !== undefined) {
      if (typeof value !== 'string' || !format.test(value)) {
        findings.push(`${where} is not in its fixed format`);
      }
      continue;
    }
    if (!/^[a-z][a-z0-9_]*_id$/.test(key)) {
      findings.push(`${where} is not an ID field (only *_id, period and day)`);
    }
    if (typeof value !== 'string' || !UUID_ONLY.test(value)) {
      findings.push(`${where} does not hold an opaque UUID`);
      if (typeof value === 'string') {
        findings.push(...contentFindings(where, value, options));
      }
    }
  }
  findings.push(...contentFindings('job payload', JSON.stringify(payload), { known: options.known ?? [] }).filter((finding) => finding.endsWith('synthetic record')));
  return [...new Set(findings)];
}

/**
 * Findings for free text a person writes where no PHI belongs (a support ticket, a status update, an audit
 * request; docs/adr/0053): the identifier shapes alone (nine or more digits, an SSN, a date, an email address, a
 * phone number), so the text is refused before it is stored. Opaque IDs are not findings.
 */
export function textPhiFindings(text: string, options: PhiGuardOptions = {}): string[] {
  return contentFindings('the text', text, options);
}

const CHECKS: Readonly<Record<PhiCarrier, (value: never, options: PhiGuardOptions) => string[]>> = {
  url: urlPhiFindings,
  s3_key: s3KeyPhiFindings,
  job_payload: jobPayloadPhiFindings,
};

/** Throws a PhiLeakError when `value` may carry PHI; for tests in every milestone that builds a URL, a key or a payload. */
export function assertNoPhi(carrier: 'url' | 's3_key', value: string, options?: PhiGuardOptions): void;
export function assertNoPhi(carrier: 'job_payload', value: unknown, options?: PhiGuardOptions): void;
export function assertNoPhi(carrier: PhiCarrier, value: unknown, options: PhiGuardOptions = {}): void {
  const findings = (CHECKS[carrier] as (value: unknown, options: PhiGuardOptions) => string[])(value, options);
  if (findings.length > 0) {
    throw new PhiLeakError(carrier, findings);
  }
}

const MONTH = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const ORDINAL = '(?:st|nd|rd|th)?';
const YEAR = '(?:19|20)\\d{2}';

/** Words that may follow "patient" or "member" in a support question without naming anyone. */
const NOT_A_NAME = new Set([
  'share', 'responsibility', 'reference', 'references', 'ref', 'refs', 'control', 'account', 'accounts', 'portion', 'balance', 'balances', 'information', 'info', 'data', 'record',
  'records', 'list', 'lists', 'line', 'lines', 'column', 'columns', 'count', 'counts', 'name', 'names', 'id', 'ids', 'number', 'numbers', 'field', 'fields', 'screen', 'page',
  'portal', 'services', 'service', 'statement', 'statements', 'copay', 'coinsurance', 'deductible', 'adjustment', 'adjustments', 'identifier', 'identifiers', 'details',
]);

const WRITTEN: readonly { readonly reason: string; readonly pattern: RegExp }[] = [
  { reason: 'a date written in words (a date of birth shape)', pattern: new RegExp(`\\b${MONTH}\\.?\\s+\\d{1,2}${ORDINAL},?\\s+${YEAR}\\b|\\b\\d{1,2}${ORDINAL}\\s+(?:of\\s+)?${MONTH}\\.?,?\\s+${YEAR}\\b`, 'i') },
  { reason: 'a birth date named', pattern: /\b(?:born|birth\s*date|date\s+of\s+birth|dob|d\.o\.b\.?)\b/i },
  { reason: 'an identifier of letters and digits (a member ID or claim number shape)', pattern: /(?<![A-Za-z0-9-])(?=[A-Za-z0-9]*[A-Za-z])(?=(?:[A-Za-z]*\d){5})[A-Za-z0-9]{6,}(?![A-Za-z0-9-])/ },
  { reason: 'an identifier named by its kind', pattern: /\b(?:member|subscriber|claim|account|acct|mrn|policy|chart)\s*(?:id|no\.?|number|#)?\s*[:#]?\s*\d{5,}\b/i },
];

/** A name after a word that introduces a person ("patient Jane Doe", "Mrs. Doe"), unless it is a product's word. */
const NAMED = /\b(?:[Pp]atient|[Pp]t|[Mm]ember|[Ii]nsured|[Ss]ubscriber|[Bb]eneficiary|M[Rr][Ss]?|Ms|Miss|Mx)\.?\s+([A-Z][a-z'’-]+)/g;

/**
 * Findings for free text that should name no patient at all (a support ticket, the public status page; docs/adr/0053
 * and 0055): the identifier shapes of textPhiFindings, and what a person writes about a patient in words: a date in
 * words or a birth date named, an identifier of letters and digits, an identifier named by its kind, and a name after
 * a word that introduces a person. It cannot know a name written with no such word; the forms say to name opaque IDs only.
 */
export function writtenPhiFindings(text: string, options: PhiGuardOptions = {}): string[] {
  const findings = textPhiFindings(text, options);
  const rest = text.replace(UUID, ' ');
  for (const { reason, pattern } of WRITTEN) {
    if (pattern.test(rest)) {
      findings.push(`the text holds ${reason}`);
    }
  }
  for (const match of rest.matchAll(NAMED)) {
    if (!NOT_A_NAME.has((match[1] ?? '').toLowerCase())) {
      findings.push('the text holds a name after a word that introduces a person');
      break;
    }
  }
  return findings;
}
