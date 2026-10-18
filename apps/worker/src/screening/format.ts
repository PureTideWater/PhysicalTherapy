import { type Cents, MoneyError, cents, parseAmount, parseCents } from '@tp/money';

/**
 * The free screening's upload format (Change Order 001, CO-04; reconciliation-001 D18 a and D20 a;
 * docs/adr/0062), shared by the browser, which reads the file and sends nothing but the rows' totals, and the
 * server, which checks the header names and every typed row again. Browser-safe: it imports @tp/money alone,
 * and no node module and no database code.
 *
 * An upload is a header and one row per procedure code, modifier set, units, place of service, payer product and
 * service quarter, with the allowed total and the claim count. Any column outside the eight is refused, and a
 * column shaped like patient information (names, dates of birth, member IDs, dates of service, claim numbers) is
 * refused by its kind, naming its position. A refusal's reasons carry codes, column positions, row numbers,
 * fields and kinds only, never a header's text or a cell's value (screening_rejections_valid() in the migration
 * admits nothing else).
 */

/** The eight columns, each required once, in the canonical rows' order. */
export const SCREENING_COLUMNS = ['procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count'] as const;
export type ScreeningColumn = (typeof SCREENING_COLUMNS)[number];

/** The payer products an upload may declare (D20 a), as the screening_result CHECK lists them. */
export const SCREENING_PAYER_PRODUCTS = ['medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other'] as const;
export type ScreeningPayerProduct = (typeof SCREENING_PAYER_PRODUCTS)[number];
/** Priced under Original Medicare's fee schedule (the MA non-contracted terms). */
export const SCREENING_PRICED_PRODUCTS = ['medicare_ffs', 'ma_noncontracted'] as const satisfies readonly ScreeningPayerProduct[];
/** Never priced as non-contracted: their dollars cannot be priced without a contract. */
export const SCREENING_CONTRACT_PRODUCTS = ['ma_contracted', 'commercial'] as const satisfies readonly ScreeningPayerProduct[];
/** Not screened at all. */
export const SCREENING_UNSCREENED_PRODUCTS = ['medicaid', 'other'] as const satisfies readonly ScreeningPayerProduct[];

/** The 50 states, DC, and the territories USPS serves, as the screening_prospect CHECK lists them. */
export const SCREENING_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC', 'PR', 'VI', 'GU', 'AS', 'MP',
] as const;
export type ScreeningState = (typeof SCREENING_STATES)[number];

/** The kinds of patient information a column may hold, checked in this order. */
export const SCREENING_PHI_KINDS = ['claim_number', 'member_id', 'date_of_birth', 'date_of_service', 'name'] as const;
export type ScreeningPhiKind = (typeof SCREENING_PHI_KINDS)[number];

/** Each kind as a sentence names it. */
export const PHI_KIND_LABELS: Readonly<Record<ScreeningPhiKind, string>> = {
  name: 'names',
  date_of_birth: 'dates of birth',
  member_id: 'member IDs',
  date_of_service: 'dates of service',
  claim_number: 'claim numbers',
};

/** Why an upload is refused, as screening_upload.rejection_reasons stores it. */
export const SCREENING_REJECTION_CODES = [
  'phi_column',
  'unknown_column',
  'duplicate_column',
  'missing_column',
  'row_shape',
  'invalid_value',
  'band_holds_date',
  'band_in_future',
  'duplicate_row',
  'no_rows',
  'too_many_rows',
  'row_count_mismatch',
] as const;
export type ScreeningRejectionCode = (typeof SCREENING_REJECTION_CODES)[number];

/** A refusal's reason: a code and positions, never a header's text or a cell's value. */
export interface ScreeningRejection {
  readonly code: ScreeningRejectionCode;
  /** The column's position, from 1 (at most 64; a later column is named without it). */
  readonly column?: number;
  /** The row's number under the header, from 1. */
  readonly row?: number;
  /** For a duplicate row: the earlier row it repeats. */
  readonly first_row?: number;
  readonly field?: ScreeningColumn;
  readonly phi?: ScreeningPhiKind;
}

/** The most data rows an upload may have. */
export const SCREENING_MAX_ROWS = 50_000;
/** The most a file may be. */
export const SCREENING_MAX_FILE_BYTES = 25 * 1024 * 1024;
/** The most header cells the server takes, and the longest. */
export const SCREENING_MAX_HEADER_CELLS = 64;
export const SCREENING_MAX_HEADER_LENGTH = 200;
/** The longest canonical rows text the server takes (50,000 rows of at most 70 characters fit). */
export const SCREENING_MAX_ROWS_TEXT = 4_800_000;
/** The most reasons a refusal keeps. */
export const SCREENING_MAX_REASONS = 20;
/** The largest allowed total: $999,999,999.99. */
export const SCREENING_MAX_ALLOWED_CENTS: Cents = cents(99_999_999_999n);
export const SCREENING_MAX_UNITS = 999;
export const SCREENING_MAX_CLAIMS = 1_000_000;

// ---------------------------------------------------------------------------------------------------
// Headers

/**
 * A header as compared: the byte-order mark dropped, NFKC, trimmed and lower-cased; '#' read as the word
 * number; every run of anything but a to z and 0 to 9 one underscore; no underscore at either end.
 */
export function normalizeHeader(text: string): string {
  return text
    .replace(/^\uFEFF/, '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** A header with its underscores removed too, so "Claim-No", "claim no" and "CLAIMNO" are one spelling. */
function compact(normalized: string): string {
  return normalized.replace(/_/g, '');
}

const COLUMN_SPELLINGS: Readonly<Record<ScreeningColumn, readonly string[]>> = {
  procedure_code: ['procedure_code', 'code', 'cpt', 'cpt_code', 'hcpcs', 'hcpcs_code', 'cpt_hcpcs', 'procedure'],
  modifiers: ['modifiers', 'modifier', 'modifier_set', 'mods'],
  units: ['units', 'unit', 'units_per_line'],
  place_of_service: ['place_of_service', 'pos'],
  payer_product: ['payer_product', 'product'],
  service_band: ['service_band', 'service_date_band', 'band', 'quarter', 'service_quarter'],
  allowed_total: ['allowed_total', 'allowed_amount_total', 'allowed_amount', 'allowed'],
  claim_count: ['claim_count', 'claims', 'count'],
};

const PHI_SPELLINGS: Readonly<Record<ScreeningPhiKind, readonly string[]>> = {
  claim_number: [
    'claim number',
    'claim #',
    'claim no',
    'claim num',
    'claim id',
    'claimid',
    'clm no',
    'icn',
    'pcn',
    'tcn',
    'dcn',
    'ccn',
    'patient control number',
    'claim control number',
    'payer claim control number',
    'clp01',
    'clp07',
    'reference number',
    'ref #',
  ],
  member_id: [
    'member id',
    'member #',
    'memberid',
    'mbr id',
    'member number',
    'subscriber id',
    'insured id',
    'beneficiary id',
    'mbi',
    'hicn',
    'hic',
    'medicare id',
    'medicaid id',
    'policy number',
    'policy id',
    'insurance id',
    'patient id',
    'pt id',
    'patient account',
    'account number',
    'acct #',
    'mrn',
    'medical record number',
    'chart number',
    'ssn',
    'social security number',
  ],
  date_of_birth: ['dob', 'd.o.b.', 'date of birth', 'birth date', 'birthdate', 'birthday', 'patient dob', 'pt dob', 'born', 'age'],
  date_of_service: [
    'dos',
    'date of service',
    'service date',
    'svc date',
    'from date',
    'to date',
    'dos from',
    'dos to',
    'thru date',
    'visit date',
    'appointment date',
    'encounter date',
    'admit date',
    'discharge date',
    'date',
  ],
  name: [
    'name',
    'patient',
    'patient name',
    'pt name',
    'first name',
    'last name',
    'middle name',
    'full name',
    'firstname',
    'lastname',
    'fname',
    'lname',
    'given name',
    'surname',
    'family name',
    'member name',
    'subscriber name',
    'insured name',
    'beneficiary name',
    'guarantor',
    'responsible party',
  ],
};

const COLUMN_BY_SPELLING: ReadonlyMap<string, ScreeningColumn> = new Map(
  SCREENING_COLUMNS.flatMap((column) => COLUMN_SPELLINGS[column].map((spelling) => [compact(normalizeHeader(spelling)), column] as const)),
);
const PHI_BY_KIND: readonly (readonly [ScreeningPhiKind, ReadonlySet<string>])[] = SCREENING_PHI_KINDS.map(
  (kind) => [kind, new Set(PHI_SPELLINGS[kind].map((spelling) => compact(normalizeHeader(spelling))))] as const,
);

/** Whether a header reads as a date: any word holding "date", or a "dt" word (paid date, check dt, svcdt). A birth date is caught first. */
function looksLikeDate(normalized: string): boolean {
  return normalized.includes('date') || normalized.split('_').some((word) => word === 'dt' || /^dt[a-z]/.test(word) || /[a-z]dt$/.test(word));
}

export type HeaderClass = { readonly kind: 'column'; readonly column: ScreeningColumn } | { readonly kind: 'phi'; readonly phi: ScreeningPhiKind } | { readonly kind: 'unknown' };

/**
 * What a header is: one of the eight columns (by any of its accepted spellings), a kind of patient information
 * (checked in SCREENING_PHI_KINDS' order, a date-shaped header among the dates of service), or neither. Payer
 * name, provider name, practice name, NPI, charge, paid and patient responsibility are neither: refused as
 * unknown, not as patient information.
 */
export function classifyHeader(text: string): HeaderClass {
  const normalized = normalizeHeader(text);
  const key = compact(normalized);
  const column = COLUMN_BY_SPELLING.get(key);
  if (column !== undefined) {
    return { kind: 'column', column };
  }
  for (const [phi, spellings] of PHI_BY_KIND) {
    if (spellings.has(key) || (phi === 'date_of_birth' && (key.includes('birth') || normalized.split('_').includes('dob'))) || (phi === 'date_of_service' && looksLikeDate(normalized))) {
      return { kind: 'phi', phi };
    }
  }
  return { kind: 'unknown' };
}

export type HeaderCheck =
  | { readonly ok: true; readonly positions: Readonly<Record<ScreeningColumn, number>> }
  | { readonly ok: false; readonly reasons: readonly ScreeningRejection[] };

/** A reason's column, or none past the 64th (the stored reasons name positions 1 to 64). */
function at(index: number): { readonly column?: number } {
  return index < SCREENING_MAX_HEADER_CELLS ? { column: index + 1 } : {};
}

/**
 * The header's cells checked: each one of the eight columns exactly once, in any order, and nothing else. On a
 * pass, each column's cell position (from 0); otherwise every reason, in column order, then the columns missing.
 */
export function checkHeaders(cells: readonly string[]): HeaderCheck {
  const reasons: ScreeningRejection[] = [];
  const positions = new Map<ScreeningColumn, number>();
  cells.forEach((cell, index) => {
    const found = classifyHeader(cell);
    if (found.kind === 'phi') {
      reasons.push({ code: 'phi_column', ...at(index), phi: found.phi });
    } else if (found.kind === 'unknown') {
      reasons.push({ code: 'unknown_column', ...at(index) });
    } else if (positions.has(found.column)) {
      reasons.push({ code: 'duplicate_column', ...at(index), field: found.column });
    } else {
      positions.set(found.column, index);
    }
  });
  for (const column of SCREENING_COLUMNS) {
    if (!positions.has(column)) {
      reasons.push({ code: 'missing_column', field: column });
    }
  }
  if (reasons.length > 0) {
    return { ok: false, reasons: reasons.slice(0, SCREENING_MAX_REASONS) };
  }
  return { ok: true, positions: Object.fromEntries(positions) as Record<ScreeningColumn, number> };
}

// ---------------------------------------------------------------------------------------------------
// Rows

/** One row of totals, typed. */
export interface ScreeningRow {
  readonly procedureCode: string;
  /** Distinct, sorted, at most four. */
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly payerProduct: ScreeningPayerProduct;
  /** A calendar quarter, YYYY-Qn. */
  readonly serviceBand: string;
  readonly allowedCents: Cents;
  readonly claimCount: number;
}

/** The current calendar quarter in UTC, YYYY-Qn: no band may come after it. */
export function currentQuarter(now: Date): string {
  return `${String(now.getUTCFullYear())}-Q${String(Math.floor(now.getUTCMonth() / 3) + 1)}`;
}

/** The first and last day of a band's quarter. */
export function quarterDays(band: string): { readonly first: string; readonly last: string } {
  const match = /^(\d{4})-Q([1-4])$/.exec(band);
  if (match === null) {
    throw new RangeError('a service band is a calendar quarter, YYYY-Qn');
  }
  const year = match[1] as string;
  const quarter = Number(match[2]);
  const first = ['01-01', '04-01', '07-01', '10-01'][quarter - 1] as string;
  const last = ['03-31', '06-30', '09-30', '12-31'][quarter - 1] as string;
  return { first: `${year}-${first}`, last: `${year}-${last}` };
}

const PROCEDURE_CODE = /^[0-9A-Z]{5}$/;
const MODIFIER = /^[0-9A-Z]{2}$/;
const MODIFIER_SEPARATORS = /[\s,;:+|/]+/;
const WHOLE = /^0*([1-9][0-9]*)$/;
const PLACE = /^[0-9]{1,2}$/;
const MONEY = /^\$?(?:(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$/;
const COUNT = /^(?:[0-9]{1,3}(?:,[0-9]{3})+|[0-9]+)$/;

/** Bands a person may type, as year and quarter: YYYY-Qn, YYYY Qn, YYYYQn, Qn YYYY and Qn-YYYY. */
const BAND_FORMS: readonly RegExp[] = [/^(\d{4})[- ]?q([1-4])$/i, /^q([1-4])[- ]?(\d{4})$/i];
/** A cell shaped like a day: a date with a day of the month, or a timestamp. */
const DAY_SHAPES: readonly RegExp[] = [
  /\d{1,4}\s*[-/.]\s*\d{1,2}\s*[-/.]\s*\d{1,4}/,
  /^\d{8}$/,
  /\d{4}-\d{2}-\d{2}t/i,
  /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b,?\s*\d{2,4}/i,
  /\b\d{1,2}(st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{2,4}/i,
];

/** A product as typed: lower-cased, its spaces and hyphens underscores. */
function productOf(cell: string): ScreeningPayerProduct | null {
  const typed = cell.trim().toLowerCase().replace(/[ -]+/g, '_');
  return (SCREENING_PAYER_PRODUCTS as readonly string[]).includes(typed) ? (typed as ScreeningPayerProduct) : null;
}

function wholeIn(cell: string, pattern: RegExp, max: number): number | null {
  const match = pattern.exec(cell.trim());
  if (match === null) {
    return null;
  }
  const digits = (match[1] ?? match[0]).replace(/,/g, '').replace(/^0+(?=\d)/, '');
  if (digits.length > String(max).length) {
    return null;
  }
  const value = Number(digits);
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null;
}

type BandCell = { readonly band: string } | { readonly problem: 'date' | 'invalid' };

function bandOf(cell: string): BandCell {
  const text = cell.trim();
  for (const [index, form] of BAND_FORMS.entries()) {
    const match = form.exec(text);
    if (match !== null) {
      const year = index === 0 ? (match[1] as string) : (match[2] as string);
      const quarter = index === 0 ? (match[2] as string) : (match[1] as string);
      return /^20\d{2}$/.test(year) ? { band: `${year}-Q${quarter}` } : { problem: 'invalid' };
    }
  }
  return DAY_SHAPES.some((shape) => shape.test(text)) ? { problem: 'date' } : { problem: 'invalid' };
}

/** A cell's modifiers in their canonical form, or null. */
function modifiersOf(cell: string): string[] | null {
  const text = cell.trim().toUpperCase();
  if (text === '') {
    return [];
  }
  const parts = text.split(MODIFIER_SEPARATORS).filter((part) => part !== '');
  if (parts.length > 4 || !parts.every((part) => MODIFIER.test(part)) || new Set(parts).size !== parts.length) {
    return null;
  }
  return [...parts].sort();
}

function moneyOf(cell: string): Cents | null {
  const text = cell.trim();
  if (!MONEY.test(text)) {
    return null;
  }
  try {
    const amount = parseAmount(text.replace(/^\$/, '').replace(/,/g, ''));
    return amount >= 0n && amount <= SCREENING_MAX_ALLOWED_CENTS ? amount : null;
  } catch (error) {
    if (error instanceof MoneyError) {
      return null;
    }
    throw error;
  }
}

export type RowParse = { readonly ok: true; readonly row: ScreeningRow } | { readonly ok: false; readonly reasons: readonly ScreeningRejection[] };

/**
 * One data row's cells typed under the header's positions. `rowNo` is its number under the header, from 1; `now`
 * dates the current quarter. A band holding a day is reported as a date-of-service column.
 */
export function parseRow(cells: readonly string[], positions: Readonly<Record<ScreeningColumn, number>>, rowNo: number, now: Date): RowParse {
  const reasons: ScreeningRejection[] = [];
  const cell = (column: ScreeningColumn) => cells[positions[column]] ?? '';
  const invalid = (field: ScreeningColumn) => reasons.push({ code: 'invalid_value', row: rowNo, field });

  const procedureCode = cell('procedure_code').trim().toUpperCase();
  if (!PROCEDURE_CODE.test(procedureCode)) {
    invalid('procedure_code');
  }
  const modifiers = modifiersOf(cell('modifiers'));
  if (modifiers === null) {
    invalid('modifiers');
  }
  const units = wholeIn(cell('units'), WHOLE, SCREENING_MAX_UNITS);
  if (units === null) {
    invalid('units');
  }
  const place = cell('place_of_service').trim();
  const placeOfService = PLACE.test(place) ? place.padStart(2, '0') : null;
  if (placeOfService === null || placeOfService === '00') {
    invalid('place_of_service');
  }
  const payerProduct = productOf(cell('payer_product'));
  if (payerProduct === null) {
    invalid('payer_product');
  }
  const band = bandOf(cell('service_band'));
  if ('problem' in band) {
    if (band.problem === 'date') {
      reasons.push({ code: 'band_holds_date', ...at(positions.service_band), row: rowNo, phi: 'date_of_service' });
    } else {
      invalid('service_band');
    }
  } else if (band.band > currentQuarter(now)) {
    reasons.push({ code: 'band_in_future', row: rowNo, field: 'service_band' });
  }
  const allowedCents = moneyOf(cell('allowed_total'));
  if (allowedCents === null) {
    invalid('allowed_total');
  }
  const claimCount = wholeIn(cell('claim_count'), COUNT, SCREENING_MAX_CLAIMS);
  if (claimCount === null) {
    invalid('claim_count');
  }
  if (reasons.length > 0 || modifiers === null || units === null || placeOfService === null || payerProduct === null || 'problem' in band || allowedCents === null || claimCount === null) {
    return { ok: false, reasons };
  }
  return { ok: true, row: { procedureCode, modifiers, units, placeOfService, payerProduct, serviceBand: band.band, allowedCents, claimCount } };
}

/** The key two rows may not share: code, modifiers, units, place of service, payer product and band. */
export function rowKey(row: Pick<ScreeningRow, 'procedureCode' | 'modifiers' | 'units' | 'placeOfService' | 'payerProduct' | 'serviceBand'>): string {
  return [row.procedureCode, row.modifiers.join(' '), String(row.units), row.placeOfService, row.payerProduct, row.serviceBand].join('\t');
}

/** What the browser has once it has read a table: the reasons it is refused, or what the form sends. */
export type ScreenedTable =
  | { readonly ok: true; readonly headers: readonly string[]; readonly rowCount: number; readonly rows: string }
  | { readonly ok: false; readonly headers: readonly string[]; readonly reasons: readonly ScreeningRejection[] };

/**
 * A table of cells (its first row the header) screened as the server will: the header, then every row's shape,
 * values, band and key, keeping at most 20 reasons. On a pass, the rows in their canonical form.
 */
export function screenTable(table: readonly (readonly string[])[], now: Date): ScreenedTable {
  const [header, ...data] = table;
  if (header === undefined) {
    return { ok: false, headers: [], reasons: [{ code: 'no_rows' }] };
  }
  const headers = header.slice(0, SCREENING_MAX_HEADER_CELLS).map((cell) => cell.slice(0, SCREENING_MAX_HEADER_LENGTH));
  const checked = checkHeaders(header);
  if (!checked.ok) {
    return { ok: false, headers, reasons: checked.reasons };
  }
  if (data.length === 0) {
    return { ok: false, headers, reasons: [{ code: 'no_rows' }] };
  }
  if (data.length > SCREENING_MAX_ROWS) {
    return { ok: false, headers, reasons: [{ code: 'too_many_rows' }] };
  }
  const reasons: ScreeningRejection[] = [];
  const rows: ScreeningRow[] = [];
  const seen = new Map<string, number>();
  for (const [index, cells] of data.entries()) {
    const rowNo = index + 1;
    if (cells.length !== header.length) {
      reasons.push({ code: 'row_shape', row: rowNo });
    } else {
      const parsed = parseRow(cells, checked.positions, rowNo, now);
      if (!parsed.ok) {
        reasons.push(...parsed.reasons);
      } else {
        const key = rowKey(parsed.row);
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, rowNo);
          rows.push(parsed.row);
        } else {
          reasons.push({ code: 'duplicate_row', row: rowNo, first_row: first });
        }
      }
    }
    if (reasons.length >= SCREENING_MAX_REASONS) {
      break;
    }
  }
  if (reasons.length > 0) {
    return { ok: false, headers, reasons: reasons.slice(0, SCREENING_MAX_REASONS) };
  }
  return { ok: true, headers, rowCount: rows.length, rows: encodeScreeningRows(rows) };
}

// ---------------------------------------------------------------------------------------------------
// The canonical rows the form sends

/**
 * The rows as the form sends them: one line per row, joined by a line feed, no header; each line's fields
 * tab-joined in SCREENING_COLUMNS' order, every one canonical (modifiers sorted and space-joined, the allowed
 * total as integer cents).
 */
export function encodeScreeningRows(rows: readonly ScreeningRow[]): string {
  return rows
    .map((row) =>
      [row.procedureCode, row.modifiers.join(' '), String(row.units), row.placeOfService, row.payerProduct, row.serviceBand, row.allowedCents.toString(), String(row.claimCount)].join('\t'),
    )
    .join('\n');
}

const CANONICAL = {
  modifiers: /^(?:[0-9A-Z]{2}(?: [0-9A-Z]{2}){0,3})?$/,
  units: /^[1-9][0-9]{0,2}$/,
  place: /^(?:0[1-9]|[1-9][0-9])$/,
  band: /^20[0-9]{2}-Q[1-4]$/,
  cents: /^(?:0|[1-9][0-9]{0,10})$/,
  claims: /^[1-9][0-9]{0,6}$/,
} as const;

export type RowsDecode = { readonly ok: true; readonly rows: readonly ScreeningRow[] } | { readonly ok: false; readonly reasons: readonly ScreeningRejection[] };

/**
 * The form's rows read back, strictly: every field already canonical, at most 50,000 rows, no key twice, no band
 * after the current quarter. The server's check of what the browser sent; at most 20 reasons.
 */
export function decodeScreeningRows(text: string, now: Date): RowsDecode {
  if (text === '') {
    return { ok: false, reasons: [{ code: 'no_rows' }] };
  }
  const lines = text.split('\n');
  if (lines.length > SCREENING_MAX_ROWS) {
    return { ok: false, reasons: [{ code: 'too_many_rows' }] };
  }
  const quarter = currentQuarter(now);
  const reasons: ScreeningRejection[] = [];
  const rows: ScreeningRow[] = [];
  const seen = new Map<string, number>();
  for (const [index, line] of lines.entries()) {
    const rowNo = index + 1;
    const fields = line.split('\t');
    if (fields.length !== SCREENING_COLUMNS.length) {
      reasons.push({ code: 'row_shape', row: rowNo });
    } else {
      const [code, modifiers, units, place, product, band, allowed, claims] = fields as [string, string, string, string, string, string, string, string];
      const before = reasons.length;
      const mods = modifiers === '' ? [] : modifiers.split(' ');
      const checks: readonly (readonly [ScreeningColumn, boolean])[] = [
        ['procedure_code', PROCEDURE_CODE.test(code)],
        ['modifiers', CANONICAL.modifiers.test(modifiers) && mods.every((mod, i) => i === 0 || (mods[i - 1] as string) < mod)],
        ['units', CANONICAL.units.test(units)],
        ['place_of_service', CANONICAL.place.test(place)],
        ['payer_product', (SCREENING_PAYER_PRODUCTS as readonly string[]).includes(product)],
        ['service_band', CANONICAL.band.test(band)],
        ['allowed_total', CANONICAL.cents.test(allowed) && parseCents(allowed) <= SCREENING_MAX_ALLOWED_CENTS],
        ['claim_count', CANONICAL.claims.test(claims) && Number(claims) <= SCREENING_MAX_CLAIMS],
      ];
      for (const [field, passes] of checks) {
        if (!passes) {
          reasons.push({ code: 'invalid_value', row: rowNo, field });
        }
      }
      if (CANONICAL.band.test(band) && band > quarter) {
        reasons.push({ code: 'band_in_future', row: rowNo, field: 'service_band' });
      }
      if (reasons.length === before) {
        const row: ScreeningRow = {
          procedureCode: code,
          modifiers: mods,
          units: Number(units),
          placeOfService: place,
          payerProduct: product as ScreeningPayerProduct,
          serviceBand: band,
          allowedCents: parseCents(allowed),
          claimCount: Number(claims),
        };
        const key = rowKey(row);
        const first = seen.get(key);
        if (first === undefined) {
          seen.set(key, rowNo);
          rows.push(row);
        } else {
          reasons.push({ code: 'duplicate_row', row: rowNo, first_row: first });
        }
      }
    }
    if (reasons.length >= SCREENING_MAX_REASONS) {
      break;
    }
  }
  if (reasons.length > 0) {
    return { ok: false, reasons: reasons.slice(0, SCREENING_MAX_REASONS) };
  }
  return { ok: true, rows };
}
