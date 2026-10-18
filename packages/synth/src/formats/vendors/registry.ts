/**
 * The EMR export formats (Change Order 001, CO-03; docs/adr/0059): the ERA export and the payment-posting
 * export of WebPT Billing, Prompt, SPRY and Raintree, as data. Every entry is FORMAT_UNCONFIRMED: no
 * format description has been received, so each layout is a placeholder written in the vendor's
 * plausible column vocabulary, not taken from any file, screen or document of the vendor. Real samples
 * come from the design-partner firm as format descriptions and redacted headers only, never as files.
 *
 * Each entry says, for one export:
 * - `columns`, in file order: the header, the field it holds and the field's type;
 * - `markerColumn`: the identifier column that holds SYNTHSENDER on every synthetic row (D14 option a:
 *   the payee ID of a posting export, the interchange sender of an ERA export);
 * - how it writes dates (one of the ledger's two date formats), money (plain decimals: "-12.34", never
 *   "$", a thousands comma or parentheses, which the ledger's amount reader refuses), line endings and
 *   a byte-order mark;
 * - `status` and `confirmation`, so a format is confirmed by data alone.
 *
 * Confirming a format, once its description arrives: when the description agrees with the columns
 * here, set `status` to FORMAT_CONFIRMED and `confirmation` to the date it was received and the
 * reference of the redacted description (never a file of the vendor's), and flip the matching
 * built-in posting template in packages/ledger to `status: 'confirmed'`. When it disagrees, add a new
 * entry `<vendor>_<kind>_v1` with the confirmed columns and keep `_v0`, so a posting row already read
 * under the placeholder keeps a template that exists. Then run `pnpm synth --all`.
 */
import { SYNTH_SENDER_ID } from '../../identity';

export const VENDORS = ['webpt_billing', 'prompt', 'spry', 'raintree'] as const;
export type Vendor = (typeof VENDORS)[number];

export const VENDOR_NAMES: Readonly<Record<Vendor, string>> = {
  webpt_billing: 'WebPT Billing',
  prompt: 'Prompt',
  spry: 'SPRY',
  raintree: 'Raintree',
};

/** What an export is: a payment-posting export (read by the ledger now) or an ERA export (intake, PR 4). */
export const FORMAT_KINDS = ['posting_export', 'era_export'] as const;
export type FormatKind = (typeof FORMAT_KINDS)[number];

/** FORMAT_UNCONFIRMED until a format description from the design-partner firm confirms the columns. */
export const FORMAT_STATUSES = ['FORMAT_UNCONFIRMED', 'FORMAT_CONFIRMED'] as const;
export type FormatStatus = (typeof FORMAT_STATUSES)[number];

/** The date formats the ledger's templates read (packages/ledger DATE_FORMATS). */
export const VENDOR_DATE_FORMATS = ['MM/DD/YYYY', 'YYYY-MM-DD'] as const;
export type VendorDateFormat = (typeof VENDOR_DATE_FORMATS)[number];

/** Money as a plain decimal with two places, a leading minus for a negative amount. */
export const MONEY_FORMAT = 'plain_decimal';

export type ColumnType = 'date' | 'money' | 'text' | 'code' | 'quantity' | 'identifier';

/** A posting export's fields: the ledger's posting fields (posting_row), and the payee ID that carries the marker. */
export const VENDOR_POSTING_FIELDS = ['posted_on', 'check_or_trace', 'amount', 'payer', 'claim_reference', 'procedure_code', 'service_date', 'batch', 'payee_id'] as const;
export type VendorPostingField = (typeof VENDOR_POSTING_FIELDS)[number];

/** An ERA export's fields: one row per service line, with its claim's and its payment's fields repeated. */
export const VENDOR_ERA_FIELDS = [
  'sender_id',
  'payer_name',
  'payee_id',
  'trace',
  'payment_date',
  'payment_amount',
  'payment_method',
  'patient_control_number',
  'payer_claim_number',
  'claim_status',
  'plan',
  'service_date',
  'place_of_service',
  'procedure_code',
  'modifiers',
  'units',
  'charge',
  'allowed',
  'paid',
  'patient_responsibility',
  'contractual_adjustment',
  'other_adjustment',
  'adjustment_codes',
] as const;
export type VendorEraField = (typeof VENDOR_ERA_FIELDS)[number];

/** The type each field is written as: a date in the format's date format, money as a plain decimal, the rest as text. */
export const FIELD_TYPES: Readonly<Record<VendorPostingField | VendorEraField, ColumnType>> = {
  posted_on: 'date',
  check_or_trace: 'identifier',
  amount: 'money',
  payer: 'text',
  claim_reference: 'identifier',
  procedure_code: 'code',
  service_date: 'date',
  batch: 'identifier',
  payee_id: 'identifier',
  sender_id: 'identifier',
  payer_name: 'text',
  trace: 'identifier',
  payment_date: 'date',
  payment_amount: 'money',
  payment_method: 'code',
  patient_control_number: 'identifier',
  payer_claim_number: 'identifier',
  claim_status: 'code',
  plan: 'identifier',
  place_of_service: 'code',
  modifiers: 'code',
  units: 'quantity',
  charge: 'money',
  allowed: 'money',
  paid: 'money',
  patient_responsibility: 'money',
  contractual_adjustment: 'money',
  other_adjustment: 'money',
  adjustment_codes: 'code',
};

/**
 * The fields every export of a kind must hold: what the ledger requires of a posting row; and what one ERA
 * line needs, with the payee and the payer its remittance must name (remittance.payee_npi and payer_name are
 * NOT NULL) and the export's duplicate key needs (D12: payee, trace, amount and payment date).
 */
export const REQUIRED_FIELDS: Readonly<{ posting_export: readonly VendorPostingField[]; era_export: readonly VendorEraField[] }> = {
  posting_export: ['posted_on', 'check_or_trace', 'amount', 'payee_id'],
  era_export: ['sender_id', 'payer_name', 'payee_id', 'trace', 'payment_date', 'payment_amount', 'patient_control_number', 'claim_status', 'service_date', 'procedure_code', 'charge', 'paid', 'patient_responsibility'],
};

/** The field whose column holds SYNTHSENDER (D14): a posting export's payee ID, an ERA export's interchange sender. */
export const MARKER_FIELDS = { posting_export: 'payee_id', era_export: 'sender_id' } as const;

export interface FormatColumn<F extends string> {
  readonly header: string;
  readonly field: F;
  readonly type: ColumnType;
}

/** Where a confirmed format's columns came from: a redacted format description, never a vendor file. */
export interface FormatConfirmation {
  readonly receivedOn: string;
  readonly reference: string;
}

interface FormatBase<K extends FormatKind, F extends string> {
  /** `<vendor>_<posting|era>_v<version>`; a built-in posting template has the same ID (posting_row.template). */
  readonly id: string;
  readonly vendor: Vendor;
  readonly kind: K;
  readonly version: number;
  readonly status: FormatStatus;
  /** Null while FORMAT_UNCONFIRMED. */
  readonly confirmation: FormatConfirmation | null;
  readonly columns: readonly FormatColumn<F>[];
  /** The header of the identifier column that holds SYNTHSENDER on every synthetic row. */
  readonly markerColumn: string;
  readonly dateFormat: VendorDateFormat;
  readonly money: typeof MONEY_FORMAT;
  readonly lineEnding: 'CRLF' | 'LF';
  readonly bom: boolean;
  /** How a list (modifiers, adjustment codes) is written in one cell. */
  readonly listSeparator: string;
  readonly note: string;
}

export type PostingFormat = FormatBase<'posting_export', VendorPostingField>;
export type EraFormat = FormatBase<'era_export', VendorEraField>;
export type VendorFormat = PostingFormat | EraFormat;

const UNCONFIRMED_NOTE = (vendor: Vendor, kind: FormatKind): string =>
  `FORMAT_UNCONFIRMED: no format description of the ${VENDOR_NAMES[vendor]} ${kind === 'posting_export' ? 'payment-posting' : 'ERA'} export has been received. ` +
  `These columns are a placeholder in ${VENDOR_NAMES[vendor]}'s plausible vocabulary, not taken from any file, screen or document of ${VENDOR_NAMES[vendor]}. ` +
  'The design-partner firm supplies the real format as a description and redacted headers only, never a file.';

type Layout<F extends string> = Pick<FormatBase<FormatKind, F>, 'dateFormat' | 'lineEnding' | 'bom' | 'listSeparator'> & {
  /** Header and field, in file order. */
  readonly columns: readonly (readonly [string, F])[];
};

function unconfirmed<K extends FormatKind, F extends VendorPostingField | VendorEraField>(vendor: Vendor, kind: K, layout: Layout<F>): FormatBase<K, F> {
  const cols = layout.columns.map(([header, field]) => ({ header, field, type: FIELD_TYPES[field] }));
  return {
    id: `${vendor}_${kind === 'posting_export' ? 'posting' : 'era'}_v0`,
    vendor,
    kind,
    version: 0,
    status: 'FORMAT_UNCONFIRMED',
    confirmation: null,
    columns: cols,
    markerColumn: cols.find((column) => (column.field as string) === MARKER_FIELDS[kind])?.header ?? '',
    dateFormat: layout.dateFormat,
    money: MONEY_FORMAT,
    lineEnding: layout.lineEnding,
    bom: layout.bom,
    listSeparator: layout.listSeparator,
    note: UNCONFIRMED_NOTE(vendor, kind),
  };
}

const posting = (vendor: Vendor, layout: Layout<VendorPostingField>): PostingFormat => unconfirmed(vendor, 'posting_export', layout);
const era = (vendor: Vendor, layout: Layout<VendorEraField>): EraFormat => unconfirmed(vendor, 'era_export', layout);

export const WEBPT_BILLING_POSTING_V0 = posting('webpt_billing', {
  dateFormat: 'MM/DD/YYYY',
  lineEnding: 'CRLF',
  bom: false,
  listSeparator: ',',
  columns: [
    ['Payment Date', 'posted_on'],
    ['Check/EFT Number', 'check_or_trace'],
    ['Insurance Name', 'payer'],
    ['Claim ID', 'claim_reference'],
    ['CPT Code', 'procedure_code'],
    ['Date of Service', 'service_date'],
    ['Payment Amount', 'amount'],
    ['Deposit Batch', 'batch'],
    ['Payee ID', 'payee_id'],
  ],
});

export const PROMPT_POSTING_V0 = posting('prompt', {
  dateFormat: 'YYYY-MM-DD',
  lineEnding: 'LF',
  bom: false,
  listSeparator: ',',
  columns: [
    ['Payee Identifier', 'payee_id'],
    ['Posted Date', 'posted_on'],
    ['Payment Reference', 'check_or_trace'],
    ['Amount', 'amount'],
    ['Payer', 'payer'],
    ['Claim Number', 'claim_reference'],
    ['Procedure Code', 'procedure_code'],
    ['Service Date', 'service_date'],
    ['Batch Number', 'batch'],
  ],
});

export const SPRY_POSTING_V0 = posting('spry', {
  dateFormat: 'MM/DD/YYYY',
  lineEnding: 'CRLF',
  bom: true,
  listSeparator: ',',
  columns: [
    ['Posting Date', 'posted_on'],
    ['Batch', 'batch'],
    ['Insurance', 'payer'],
    ['Check No', 'check_or_trace'],
    ['Claim #', 'claim_reference'],
    ['DOS', 'service_date'],
    ['CPT', 'procedure_code'],
    ['Paid', 'amount'],
    ['Billing Provider ID', 'payee_id'],
  ],
});

export const RAINTREE_POSTING_V0 = posting('raintree', {
  dateFormat: 'YYYY-MM-DD',
  lineEnding: 'LF',
  bom: false,
  listSeparator: ',',
  columns: [
    ['Transaction Date', 'posted_on'],
    ['Pay-To Provider ID', 'payee_id'],
    ['Payer Name', 'payer'],
    ['Check Number', 'check_or_trace'],
    ['Payment', 'amount'],
    ['Account Claim No', 'claim_reference'],
    ['Service Code', 'procedure_code'],
    ['From Date', 'service_date'],
    ['Batch ID', 'batch'],
  ],
});

export const WEBPT_BILLING_ERA_V0 = era('webpt_billing', {
  dateFormat: 'MM/DD/YYYY',
  lineEnding: 'CRLF',
  bom: false,
  listSeparator: ',',
  columns: [
    ['Check/EFT Number', 'trace'],
    ['Check Date', 'payment_date'],
    ['Check Amount', 'payment_amount'],
    ['Payment Method', 'payment_method'],
    ['Payer Name', 'payer_name'],
    ['ERA Sender ID', 'sender_id'],
    ['Payee ID', 'payee_id'],
    ['Patient Account Number', 'patient_control_number'],
    ['Payer Claim Number', 'payer_claim_number'],
    ['Claim Status', 'claim_status'],
    ['Plan', 'plan'],
    ['Date of Service', 'service_date'],
    ['Place of Service', 'place_of_service'],
    ['CPT Code', 'procedure_code'],
    ['Modifiers', 'modifiers'],
    ['Units', 'units'],
    ['Billed Amount', 'charge'],
    ['Allowed Amount', 'allowed'],
    ['Paid Amount', 'paid'],
    ['Patient Responsibility', 'patient_responsibility'],
    ['Contractual Adjustment', 'contractual_adjustment'],
    ['Other Adjustment', 'other_adjustment'],
    ['Adjustment Codes', 'adjustment_codes'],
  ],
});

export const PROMPT_ERA_V0 = era('prompt', {
  dateFormat: 'YYYY-MM-DD',
  lineEnding: 'LF',
  bom: false,
  listSeparator: ' ',
  columns: [
    ['Interchange Sender ID', 'sender_id'],
    ['Payment Number', 'trace'],
    ['Payment Date', 'payment_date'],
    ['Payment Total', 'payment_amount'],
    ['Payment Type', 'payment_method'],
    ['Payer', 'payer_name'],
    ['Payee NPI', 'payee_id'],
    ['Account Number', 'patient_control_number'],
    ['ICN', 'payer_claim_number'],
    ['Claim Status Code', 'claim_status'],
    ['Insurance Plan', 'plan'],
    ['Service Date', 'service_date'],
    ['POS', 'place_of_service'],
    ['Procedure', 'procedure_code'],
    ['Modifier', 'modifiers'],
    ['Units', 'units'],
    ['Charge', 'charge'],
    ['Allowed', 'allowed'],
    ['Payment', 'paid'],
    ['Patient Portion', 'patient_responsibility'],
    ['Write Off', 'contractual_adjustment'],
    ['Other Adjustments', 'other_adjustment'],
    ['Reason Codes', 'adjustment_codes'],
  ],
});

export const SPRY_ERA_V0 = era('spry', {
  dateFormat: 'MM/DD/YYYY',
  lineEnding: 'CRLF',
  bom: false,
  listSeparator: ':',
  columns: [
    ['Check #', 'trace'],
    ['Check Date', 'payment_date'],
    ['Check Total', 'payment_amount'],
    ['Method', 'payment_method'],
    ['Insurance', 'payer_name'],
    ['Provider ID', 'payee_id'],
    ['Claim #', 'patient_control_number'],
    ['Payer Claim #', 'payer_claim_number'],
    ['Status', 'claim_status'],
    ['Plan', 'plan'],
    ['DOS', 'service_date'],
    ['POS', 'place_of_service'],
    ['CPT', 'procedure_code'],
    ['Mods', 'modifiers'],
    ['Units', 'units'],
    ['Billed', 'charge'],
    ['Allowed', 'allowed'],
    ['Paid', 'paid'],
    ['Pt Resp', 'patient_responsibility'],
    ['CO Adj', 'contractual_adjustment'],
    ['Other Adj', 'other_adjustment'],
    ['CARC', 'adjustment_codes'],
    ['Sender ID', 'sender_id'],
  ],
});

export const RAINTREE_ERA_V0 = era('raintree', {
  dateFormat: 'YYYY-MM-DD',
  lineEnding: 'LF',
  bom: false,
  listSeparator: ';',
  columns: [
    ['Remit Trace Number', 'trace'],
    ['Remit Date', 'payment_date'],
    ['Remit Amount', 'payment_amount'],
    ['Payment Method Code', 'payment_method'],
    ['Remit Sender ID', 'sender_id'],
    ['Payer Name', 'payer_name'],
    ['Payee Identifier', 'payee_id'],
    ['Patient Control Number', 'patient_control_number'],
    ['Payer Control Number', 'payer_claim_number'],
    ['Claim Status', 'claim_status'],
    ['Benefit Plan', 'plan'],
    ['From Date', 'service_date'],
    ['Place of Service Code', 'place_of_service'],
    ['Service Code', 'procedure_code'],
    ['Modifiers', 'modifiers'],
    ['Quantity', 'units'],
    ['Charge Amount', 'charge'],
    ['Allowed Amount', 'allowed'],
    ['Paid Amount', 'paid'],
    ['Patient Responsibility', 'patient_responsibility'],
    ['Contractual Adjustment', 'contractual_adjustment'],
    ['Other Adjustment', 'other_adjustment'],
    ['Adjustment Reasons', 'adjustment_codes'],
  ],
});

export const POSTING_FORMATS: readonly PostingFormat[] = [WEBPT_BILLING_POSTING_V0, PROMPT_POSTING_V0, SPRY_POSTING_V0, RAINTREE_POSTING_V0];
export const ERA_FORMATS: readonly EraFormat[] = [WEBPT_BILLING_ERA_V0, PROMPT_ERA_V0, SPRY_ERA_V0, RAINTREE_ERA_V0];

/** Every vendor format, each vendor's posting export then its ERA export. */
export const VENDOR_FORMATS: readonly VendorFormat[] = VENDORS.flatMap((vendor) => [...POSTING_FORMATS, ...ERA_FORMATS].filter((format) => format.vendor === vendor));

export function findVendorFormat(id: string): VendorFormat | undefined {
  return VENDOR_FORMATS.find((format) => format.id === id);
}

/** The value of the marker column on every synthetic row. */
export const FORMAT_MARKER = SYNTH_SENDER_ID;

/** posting_row.template's CHECK: the ID of the template a row was read with. */
const FORMAT_ID = /^[a-z][a-z0-9_]{0,63}$/;
const LONGEST_HEADER = 100;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why a format entry is not usable; empty when it is. Plain checks on the data, run by the tests. */
export function formatProblems(format: VendorFormat): string[] {
  const problems: string[] = [];
  const short = format.kind === 'posting_export' ? 'posting' : 'era';
  if (!FORMAT_ID.test(format.id) || format.id !== `${format.vendor}_${short}_v${String(format.version)}`) {
    problems.push(`the ID is <vendor>_${short}_v<version> and a template name`);
  }
  const fields: readonly string[] = format.kind === 'posting_export' ? VENDOR_POSTING_FIELDS : VENDOR_ERA_FIELDS;
  const headers = format.columns.map((column) => column.header.trim().toLowerCase());
  if (format.columns.some((column) => column.header.trim() === '' || column.header.length > LONGEST_HEADER || column.header !== column.header.trim() || /["\r\n]/.test(column.header))) {
    problems.push(`each header is 1 to ${String(LONGEST_HEADER)} characters with no quote, line break or edge space`);
  }
  if (new Set(headers).size !== headers.length) {
    problems.push('each header names one column');
  }
  const named = format.columns.map((column) => column.field as string);
  if (named.some((field) => !fields.includes(field))) {
    problems.push(`each column holds a field of a ${format.kind}`);
  }
  if (new Set(named).size !== named.length) {
    problems.push('each field is in one column');
  }
  const required: readonly string[] = REQUIRED_FIELDS[format.kind];
  for (const field of required.filter((item) => !named.includes(item))) {
    problems.push(`the ${field} column is missing`);
  }
  const marker = format.columns.find((column) => column.header === format.markerColumn);
  if (marker === undefined || marker.field !== MARKER_FIELDS[format.kind] || !/\b(?:id|identifier)\b/i.test(marker.header)) {
    problems.push(`the marker column is the ${MARKER_FIELDS[format.kind]} column, and its header says ID or identifier`);
  }
  if (!(VENDOR_DATE_FORMATS as readonly string[]).includes(format.dateFormat)) {
    problems.push(`dates are written ${VENDOR_DATE_FORMATS.join(' or ')}`);
  }
  if (format.listSeparator.length !== 1 || /[\r\n"]/.test(format.listSeparator)) {
    problems.push('a list is separated by one character other than a quote or a line break');
  }
  const confirmed = format.status === 'FORMAT_CONFIRMED';
  if (confirmed !== (format.confirmation !== null)) {
    problems.push('a confirmed format names its format description, and an unconfirmed one none');
  }
  if (format.confirmation !== null && (!ISO_DATE.test(format.confirmation.receivedOn) || format.confirmation.reference.trim() === '')) {
    problems.push('a confirmation has the date it was received and the description’s reference');
  }
  if (!confirmed && !format.note.startsWith('FORMAT_UNCONFIRMED')) {
    problems.push('an unconfirmed format says so in its note');
  }
  return problems;
}
