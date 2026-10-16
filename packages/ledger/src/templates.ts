import { type Cents, parseAmount } from '@tp/money';

import { parseCsv } from './csv';

/**
 * Export templates (PRD 13, Matching step 2: "CSV from the practice-management system; one template per
 * system, mapped once"; PRD 20, Posting-export templates: "one per practice-management system, mapped at
 * onboarding"). A template names the column that holds each field and how dates are written; a
 * practice keeps its posting template in practice.settings (settings.ts). One built-in template reads
 * packages/synth's synthetic posting export, and one its synthetic bank export; a bank export is read
 * with the built-in layout.
 */

export const POSTING_FIELDS = ['posted_on', 'check_or_trace', 'amount', 'payer', 'claim_reference', 'procedure_code', 'service_date', 'batch'] as const;
export type PostingField = (typeof POSTING_FIELDS)[number];
export const REQUIRED_POSTING_FIELDS: readonly PostingField[] = ['posted_on', 'check_or_trace', 'amount'];

export const EFT_FIELDS = ['deposited_on', 'trace', 'amount', 'description', 'batch_reference'] as const;
export type EftField = (typeof EFT_FIELDS)[number];
export const REQUIRED_EFT_FIELDS: readonly EftField[] = ['deposited_on', 'trace', 'amount'];

export const DATE_FORMATS = ['MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface ExportTemplate<F extends string> {
  /** A built-in template's ID, or "practice" for a practice's own mapping. */
  readonly id: string;
  /** The practice-management system or bank layout it reads. */
  readonly system: string;
  /** The header of the column holding each field. */
  readonly columns: Readonly<Partial<Record<F, string>>>;
  readonly dateFormat: DateFormat;
}

export type PostingTemplate = ExportTemplate<PostingField>;
export type EftTemplate = ExportTemplate<EftField>;

/** packages/synth's posting export (src/formats/csv.ts, "SYNTHETIC PM EXPORT v1"). */
export const SYNTHETIC_PM_EXPORT_V1: PostingTemplate = {
  id: 'synthetic_pm_export_v1',
  system: 'SYNTHETIC PM EXPORT v1',
  columns: {
    posted_on: 'Post Date',
    check_or_trace: 'Check/EFT #',
    payer: 'Payer',
    claim_reference: 'Claim Ref',
    procedure_code: 'CPT',
    service_date: 'DOS',
    amount: 'Paid Amount',
    batch: 'Batch',
  },
  dateFormat: 'MM/DD/YYYY',
};

/** packages/synth's bank export (src/formats/csv.ts). */
export const SYNTHETIC_BANK_EXPORT_V1: EftTemplate = {
  id: 'synthetic_bank_export_v1',
  system: 'SYNTHETIC BANK EXPORT v1',
  columns: { deposited_on: 'Date', description: 'Description', trace: 'Trace Number', amount: 'Amount', batch_reference: 'Batch Reference' },
  dateFormat: 'YYYY-MM-DD',
};

export const BUILT_IN_POSTING_TEMPLATES: readonly PostingTemplate[] = [SYNTHETIC_PM_EXPORT_V1];

/** Why a template is not usable; empty when it is. */
export function templateProblems<F extends string>(template: ExportTemplate<F>, fields: readonly F[], required: readonly F[]): string[] {
  const problems: string[] = [];
  const headers = Object.entries(template.columns) as [string, unknown][];
  for (const [field, header] of headers) {
    if (!(fields as readonly string[]).includes(field)) {
      problems.push(`${field} is not a field of the export`);
    } else if (typeof header !== 'string' || header.trim() === '' || header.length > 100) {
      problems.push(`the column for ${field} is a header of 1 to 100 characters`);
    }
  }
  for (const field of required) {
    if (template.columns[field] === undefined) {
      problems.push(`the template names the column for ${field}`);
    }
  }
  const named = headers.map(([, header]) => (typeof header === 'string' ? header.trim().toLowerCase() : ''));
  if (new Set(named).size !== named.length) {
    problems.push('each column holds one field');
  }
  if (!(DATE_FORMATS as readonly string[]).includes(template.dateFormat)) {
    problems.push(`dates are written ${DATE_FORMATS.join(' or ')}`);
  }
  if (template.system.trim() === '' || template.system.length > 100) {
    problems.push('the template names its system in 1 to 100 characters');
  }
  return problems;
}

/** A calendar date written in the template's format, as YYYY-MM-DD; null when it is not one. */
export function readDate(text: string, format: DateFormat): string | null {
  let iso: string;
  if (format === 'MM/DD/YYYY') {
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (match === null) {
      return null;
    }
    iso = `${match[3] as string}-${(match[1] as string).padStart(2, '0')}-${(match[2] as string).padStart(2, '0')}`;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      return null;
    }
    iso = text;
  }
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

/** A field a row could not be read in: the row is left out and counted, its value never kept. */
export interface RowProblem {
  readonly rowNo: number;
  readonly field: string;
}

export type ExportRead<R> =
  | { readonly kind: 'read'; readonly rows: readonly R[]; readonly problems: readonly RowProblem[] }
  | { readonly kind: 'refused'; readonly reason: 'not_csv' | 'empty' | 'missing_columns'; readonly missing: readonly string[] };

interface Cells {
  readonly rowNo: number;
  get(field: string): string;
}

/** The rows of an export by field, or why the file cannot be read with the template. */
function readCells<F extends string>(text: string, template: ExportTemplate<F>): { readonly kind: 'cells'; readonly rows: Cells[] } | Extract<ExportRead<never>, { kind: 'refused' }> {
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    // parseCsv refuses a quote never closed or text after a closing quote: the file is not read at all.
    return { kind: 'refused', reason: 'not_csv', missing: [] };
  }
  const [header, ...data] = table;
  if (header === undefined) {
    return { kind: 'refused', reason: 'empty', missing: [] };
  }
  const positions = new Map(header.map((name, index) => [name.trim().toLowerCase(), index]));
  const columns = Object.entries(template.columns) as [string, string][];
  const missing = columns.filter(([, name]) => !positions.has(name.trim().toLowerCase())).map(([field]) => field);
  if (missing.length > 0) {
    return { kind: 'refused', reason: 'missing_columns', missing };
  }
  const indexOf = new Map(columns.map(([field, name]) => [field, positions.get(name.trim().toLowerCase()) as number]));
  return {
    kind: 'cells',
    rows: data.map((cells, index) => ({
      rowNo: index + 1,
      get: (field: string) => {
        const position = indexOf.get(field);
        return position === undefined ? '' : (cells[position] ?? '').trim();
      },
    })),
  };
}

/** Each identical row of a document counted from zero, so the same export uploaded twice repeats every row's fingerprint. */
function withOccurrence<R extends { readonly fingerprint: string }>(rows: readonly R[]): R[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const count = seen.get(row.fingerprint) ?? 0;
    seen.set(row.fingerprint, count + 1);
    return { ...row, fingerprint: JSON.stringify([row.fingerprint, count]) };
  });
}

function amountOf(text: string): Cents | null {
  try {
    return parseAmount(text);
  } catch {
    return null;
  }
}

const optional = (text: string): string | null => (text === '' ? null : text);

/** One row of a posting export (Data dictionary, posting_row). */
export interface PostingExportRow {
  /** The row's place among the export's data rows, from 1. */
  readonly rowNo: number;
  readonly postedOn: string;
  readonly checkOrTrace: string;
  /** Signed: a posting export can post a take-back. */
  readonly amountCents: Cents;
  readonly payerName: string | null;
  /** The practice's claim reference (a patient control number): PHI, stored encrypted. */
  readonly claimReference: string | null;
  readonly procedureCode: string | null;
  readonly serviceDate: string | null;
  readonly batch: string | null;
  /** The template's mapped cells by field, the claim reference left out (it is stored encrypted). */
  readonly raw: Readonly<Record<string, string>>;
  /**
   * The row's canonical text with its occurrence in the document: the same row in a later export (or
   * the same export again) has the same fingerprint, so it is stored, and matched, once (test matrix
   * LED-08). The worker stores only its keyed hash.
   */
  readonly fingerprint: string;
}

type Read<V> = { readonly problem: string } | { readonly values: V };

const LONGEST_TRACE = 64;

function postingValues(row: Cells, template: PostingTemplate): Read<Omit<PostingExportRow, 'rowNo' | 'raw' | 'fingerprint'>> {
  const postedOn = readDate(row.get('posted_on'), template.dateFormat);
  if (postedOn === null) {
    return { problem: 'posted_on' };
  }
  const checkOrTrace = row.get('check_or_trace');
  if (checkOrTrace === '' || checkOrTrace.length > LONGEST_TRACE) {
    return { problem: 'check_or_trace' };
  }
  const amountCents = amountOf(row.get('amount'));
  if (amountCents === null) {
    return { problem: 'amount' };
  }
  const serviceText = row.get('service_date');
  const serviceDate = serviceText === '' ? null : readDate(serviceText, template.dateFormat);
  if (serviceText !== '' && serviceDate === null) {
    return { problem: 'service_date' };
  }
  return {
    values: {
      postedOn,
      checkOrTrace,
      amountCents,
      payerName: optional(row.get('payer')),
      claimReference: optional(row.get('claim_reference')),
      procedureCode: optional(row.get('procedure_code')),
      serviceDate,
      batch: optional(row.get('batch')),
    },
  };
}

/** Reads a posting export with the practice's template; a row with an unreadable field is left out and counted. */
export function readPostingExport(text: string, template: PostingTemplate): ExportRead<PostingExportRow> {
  const cells = readCells(text, template);
  if (cells.kind === 'refused') {
    return cells;
  }
  const rows: PostingExportRow[] = [];
  const problems: RowProblem[] = [];
  const mapped = POSTING_FIELDS.filter((field) => field !== 'claim_reference' && template.columns[field] !== undefined);
  for (const row of cells.rows) {
    const read = postingValues(row, template);
    if ('problem' in read) {
      problems.push({ rowNo: row.rowNo, field: read.problem });
      continue;
    }
    const { values } = read;
    rows.push({
      rowNo: row.rowNo,
      ...values,
      raw: Object.fromEntries(mapped.map((field) => [field, row.get(field)])),
      fingerprint: JSON.stringify(['posting', values.postedOn, values.checkOrTrace, values.amountCents.toString(), values.payerName, values.claimReference, values.procedureCode, values.serviceDate, values.batch]),
    });
  }
  return { kind: 'read', rows: withOccurrence(rows), problems };
}

/** One row of an EFT or bank export (Data dictionary, eft_row). */
export interface EftExportRow {
  readonly rowNo: number;
  readonly depositedOn: string;
  readonly trace: string;
  readonly amountCents: Cents;
  /** Set when the bank batched several EFTs into one deposit. */
  readonly batchReference: string | null;
  readonly fingerprint: string;
}

function eftValues(row: Cells, template: EftTemplate): Read<Omit<EftExportRow, 'rowNo' | 'fingerprint'>> {
  const depositedOn = readDate(row.get('deposited_on'), template.dateFormat);
  if (depositedOn === null) {
    return { problem: 'deposited_on' };
  }
  const trace = row.get('trace');
  if (trace === '' || trace.length > LONGEST_TRACE) {
    return { problem: 'trace' };
  }
  const amountCents = amountOf(row.get('amount'));
  if (amountCents === null) {
    return { problem: 'amount' };
  }
  return { values: { depositedOn, trace, amountCents, batchReference: optional(row.get('batch_reference')) } };
}

/** Reads a bank export with the bank layout; a row with an unreadable field is left out and counted. */
export function readEftExport(text: string, template: EftTemplate = SYNTHETIC_BANK_EXPORT_V1): ExportRead<EftExportRow> {
  const cells = readCells(text, template);
  if (cells.kind === 'refused') {
    return cells;
  }
  const rows: EftExportRow[] = [];
  const problems: RowProblem[] = [];
  for (const row of cells.rows) {
    const read = eftValues(row, template);
    if ('problem' in read) {
      problems.push({ rowNo: row.rowNo, field: read.problem });
      continue;
    }
    const { values } = read;
    rows.push({ rowNo: row.rowNo, ...values, fingerprint: JSON.stringify(['eft', values.depositedOn, values.trace, values.amountCents.toString(), values.batchReference]) });
  }
  return { kind: 'read', rows: withOccurrence(rows), problems };
}
