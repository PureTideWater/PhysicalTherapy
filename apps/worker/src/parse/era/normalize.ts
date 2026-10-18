import type { EraFormatId } from '@tp/db/runtime';
import { type CodeListProvider, X12_835_CODE_SETS } from '@tp/edi835';
import { parseCsv } from '@tp/ledger';
import { type Cents, ZERO_CENTS, addCents, cents, negateCents, parseAmount, subtractCents, sumCents } from '@tp/money';

import { type LoadPlan, type PersonIdentity, type PlannedAdjustment, type PlannedClaim, type PlannedExportRemittance, type PlannedLine, fitsNumeric93, normalizeKeyPart } from '../plan';
import { type EraExportField, type EraExportFormat, OPTIONAL_ERA_FIELDS, REQUIRED_ERA_FIELDS, findEraExportFormat } from './formats';

/**
 * The ERA export normalizer (Change Order 001, CO-03; reconciliation-001 D12 (a); docs/adr/0060): one vendor ERA
 * export, read with its format from the runtime registry (formats.ts; one data-driven reader for every format,
 * never a loader per vendor), into the typed load model the 835 loader writes (LoadPlan, ../plan.ts), one plan per
 * payment, so the remittance, claims, lines and adjustments are the rows an 835 makes. Pure: no database, network
 * or clock; the parse job decrypts the sealed document, checks it against intake's SHA-256 and passes its bytes.
 *
 * - The file is RFC 4180 CSV in strict UTF-8 (@tp/ledger parseCsv; a byte-order mark ignored, blank lines
 *   skipped). Row 1 is the header; each format column is found by its header, trimmed and in any case; other
 *   columns are ignored. Amounts are plain decimals read to integer cents (@tp/money parseAmount, at most two
 *   places, never a float); dates are the format's date format and real calendar dates.
 * - A payment is its rows with one key: payee, trace (the check or EFT number, TRN02), payment date and signed
 *   payment amount, placed by its first row. A claim is consecutive rows of a payment with the same patient
 *   control number, payer claim number and claim status; claims and lines are numbered in row order.
 * - A line is a HCPCS procedure (qualifier HC, five letters or digits), up to four modifiers, positive units
 *   that numeric(9,3) holds exactly, one service date, its place of service (two digits, as CLP08 gives a
 *   professional line's; a blank cell is none, as for an 835 claim without CLP08, never a guessed code), its
 *   charge, paid, patient responsibility (PR),
 *   contractual (CO) and other (OA or PI) adjustments, balanced (charge = paid + CO + PR + other), and the
 *   export's Allowed figure when it has one. Observed allowed is always paid plus PR (basis paid_plus_pr), the
 *   basis the engine already reads, so pricing does not change.
 * - Its adjustments are one row per group that has codes: the adjustment codes are GROUP-REASON items (CO-45),
 *   the group from @tp/edi835's X12_835_CODE_SETS, each reason a CARC flagged unknown as the 835 path flags it;
 *   a group's reasons are joined with '+' ("1+2+3"), since an export gives a group's total, never a split by
 *   reason, and each row is placed by its group's first code.
 * - Reversals are claims of status 22, and a corrected claim is one that directly follows a reversal with the
 *   same patient control number (the parser's own rule); the loader links them as it links an 835's.
 * - The patient is keyed by the patient control number alone (`pcn|<PCN>`, as an 835 claim without a patient
 *   name is): an export carries no name or member ID to store. The payer is named by its name (`NAME:<payer>`),
 *   each claim's plan by its plan (`PLAN:<plan>`), for the mapping queue.
 *
 * What it cannot read is held with a reason from the closed list ERA_EXPORT_HELD_REASONS, naming the column by
 * the format's header, the data row by its number (the header row is not counted) and the payment by its place
 * in the file; never a cell's value. A document that cannot be read as the format, or whose payment key cannot
 * be read on some row, is held whole; a payment that cannot be loaded is held, and the others load.
 */

export const ERA_EXPORT_HELD_REASONS = [
  // The whole document.
  'export_unreadable',
  'export_empty',
  'export_too_large',
  'export_column_missing',
  'export_column_repeated',
  // A cell (the whole document when the cell is of a payment's key, else its payment).
  'export_value_missing',
  'export_value_unreadable',
  // One payment.
  'export_payment_inconsistent',
  'export_claim_inconsistent',
  'export_line_unbalanced',
  'export_payment_unbalanced',
  'export_adjustment_unattributed',
  // One payment, decided as it loads (loader.ts loadExportPayment): a payment the practice holds has its payee,
  // trace, amount and date but names another payer and shares no claim with it.
  'export_payment_other_payer',
] as const;
export type EraExportHeldReason = (typeof ERA_EXPORT_HELD_REASONS)[number];

/**
 * The largest export the normalizer reads; a larger one is held whole (export_too_large). It reads the whole file
 * at once, and every row, claim and plan with it: at one line per payment, its worst case, an export of this size
 * fits a 128 MiB heap (era-export.large.db.test.ts), where 8 MiB needed more than 160 MiB. The worker runs four parse
 * jobs at once in one 1 GiB task (apps/worker/src/jobs/registry.ts PARSE_CONCURRENCY; infra/lib/environments.ts),
 * so four exports at the bound leave the rest of it to the other jobs. A longer period goes up as several exports,
 * or a zip of them, each its own document.
 */
export const ERA_EXPORT_MAX_BYTES = 4 * 1024 * 1024;

/** One hold: its reason, and where: the column by the format's header, the data row from 1, the payment from 1. */
export interface EraExportHold {
  readonly reason: EraExportHeldReason;
  readonly column: string | null;
  readonly row: number | null;
  readonly payment: number | null;
}

interface PaymentPlace {
  /** The payment's place among the file's payments, from 1, in the order of their first rows. */
  readonly position: number;
  /** Its first data row (from 1) and how many rows it has. */
  readonly firstRow: number;
  readonly rows: number;
}

export interface LoadableEraPayment extends PaymentPlace {
  readonly kind: 'loadable';
  readonly plan: LoadPlan<PlannedExportRemittance>;
}

export interface HeldEraPayment extends PaymentPlace {
  readonly kind: 'held';
  /** Its claims and reversals as its rows group, for the receipt's counts. */
  readonly claims: number;
  readonly reversals: number;
  readonly reasons: readonly EraExportHold[];
}

export type EraExportPayment = LoadableEraPayment | HeldEraPayment;

export type EraExportNormalized =
  | { readonly kind: 'held'; readonly reasons: readonly EraExportHold[] }
  | {
      readonly kind: 'payments';
      readonly payments: readonly EraExportPayment[];
      /** "carc:<code>" for each adjustment reason not in the release's CARC list on its payment date, sorted and unique. */
      readonly unknownCodes: readonly string[];
    };

export interface EraExportInput {
  /** The sealed document's bytes, decrypted and checked against intake's SHA-256. */
  readonly bytes: Uint8Array;
  readonly formatId: EraFormatId;
  /** The same code lists the 835 parse checks against (publishedCodeLists). */
  readonly codeLists: CodeListProvider;
}

const CLAIM_STATUSES: ReadonlySet<string> = new Set(X12_835_CODE_SETS.claim_status);
const ADJUSTMENT_GROUPS: ReadonlySet<string> = new Set(X12_835_CODE_SETS.adjustment_group);
const OTHER_GROUPS: ReadonlySet<string> = new Set([...ADJUSTMENT_GROUPS].filter((group) => group !== 'CO' && group !== 'PR'));
const PROCEDURE = /^[A-Za-z0-9]{5}$/;
const MODIFIER = /^[A-Za-z0-9]{2}$/;
const MAX_MODIFIERS = 4;
const ADJUSTMENT_CODE = /^([A-Za-z]{2})-([A-Za-z0-9]{1,8})$/;
const UNITS = /^(?:\d+(?:\.\d*)?|\.\d+)$/;
/** A place of service as CLP08 carries a professional line's (apps/worker/src/parse/plan.ts placeOfService). */
const PLACE_OF_SERVICE = /^\d{2}$/;
/**
 * The largest amount one cell may hold, in cents: ten billion dollars. Larger is read as unreadable (and held,
 * naming its column), never passed on to fail in the database with the value in its error; with the file's size
 * bound, any sum of a file's amounts then stays far inside bigint.
 */
export const MAX_AMOUNT_CENTS = 10n ** 12n;
const REVERSAL = '22';

/** Thrown inside the reader to hold the whole document. */
class DocumentHeld extends Error {
  constructor(readonly reasons: readonly EraExportHold[]) {
    super('the export is held');
  }
}

const documentHold = (reason: EraExportHeldReason, column: string | null = null, row: number | null = null): EraExportHold => ({ reason, column, row, payment: null });

/** The text of a document in strict UTF-8, or null. */
function decode(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

const headerKey = (header: string): string => header.trim().toLowerCase();

/** A calendar date in the format's date format as YYYY-MM-DD, or null when it is not a real date. */
export function readDate(text: string, format: EraExportFormat['dateFormat']): string | null {
  const match = format === 'YYYY-MM-DD' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(text) : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (match === null) {
    return null;
  }
  const [year, month, day] = (format === 'YYYY-MM-DD' ? [match[1], match[2], match[3]] : [match[3], match[1], match[2]]) as [string, string, string];
  const [y, m, d] = [Number.parseInt(year, 10), Number.parseInt(month, 10), Number.parseInt(day, 10)];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return `${year}-${month}-${day}`;
}

/** An amount as integer cents, or null when it is not a plain decimal with at most two places within MAX_AMOUNT_CENTS. */
function readAmount(text: string): Cents | null {
  let amount: Cents;
  try {
    amount = parseAmount(text);
  } catch {
    return null;
  }
  return amount > MAX_AMOUNT_CENTS || amount < -MAX_AMOUNT_CENTS ? null : amount;
}

/** The items of a list cell (modifiers, adjustment codes), split on the format's separator, blanks dropped. */
function listItems(text: string, separator: string): string[] {
  return text
    .split(separator)
    .map((item) => item.trim())
    .filter((item) => item !== '');
}

/** Where each of the format's fields is in the file, by header. */
type Columns = ReadonlyMap<EraExportField, number>;

function locate(format: EraExportFormat, header: readonly string[]): Columns {
  const reasons: EraExportHold[] = [];
  const found = new Map<EraExportField, number>();
  const keys = header.map(headerKey);
  for (const column of format.columns) {
    const at = keys.flatMap((key, index) => (key === headerKey(column.header) ? [index] : []));
    if (at.length > 1) {
      reasons.push(documentHold('export_column_repeated', column.header));
    } else if (at.length === 1) {
      found.set(column.field, at[0] as number);
    } else if (REQUIRED_ERA_FIELDS.includes(column.field)) {
      reasons.push(documentHold('export_column_missing', column.header));
    }
  }
  if (reasons.length > 0) {
    throw new DocumentHeld(reasons);
  }
  return found;
}

/** One data row as read: its number and its cells by field, trimmed ('' when its column is absent or short). */
class Row {
  constructor(
    readonly number: number,
    private readonly cells: readonly string[],
    private readonly columns: Columns,
  ) {}

  text(field: EraExportField): string {
    const at = this.columns.get(field);
    return at === undefined ? '' : (this.cells[at] ?? '').trim();
  }

  has(field: EraExportField): boolean {
    return this.columns.has(field);
  }
}

interface PaymentKey {
  readonly payee: string;
  readonly trace: string;
  readonly date: string;
  readonly signedCents: Cents;
}

/** Collects one payment's holds, each once. */
class Holds {
  private readonly seen = new Set<string>();
  readonly list: EraExportHold[] = [];

  constructor(
    private readonly format: EraExportFormat,
    private readonly payment: number,
  ) {}

  add(reason: EraExportHeldReason, field: EraExportField | null, row: number | null): void {
    const column = field === null ? null : (this.format.columns.find((item) => item.field === field)?.header ?? null);
    const key = `${reason}|${column ?? ''}|${String(row ?? '')}`;
    if (!this.seen.has(key)) {
      this.seen.add(key);
      this.list.push({ reason, column, row, payment: this.payment });
    }
  }
}

/** The payment key of every row, or the whole document held at the first rows whose key cannot be read. */
function paymentKeys(format: EraExportFormat, rows: readonly Row[]): PaymentKey[] {
  const reasons: EraExportHold[] = [];
  const header = (field: EraExportField) => format.columns.find((column) => column.field === field)?.header ?? null;
  const keys = rows.map((row): PaymentKey | null => {
    const missing = (['payee_id', 'trace', 'payment_date', 'payment_amount'] as const).filter((field) => row.text(field) === '');
    for (const field of missing) {
      reasons.push(documentHold('export_value_missing', header(field), row.number));
    }
    const date = row.text('payment_date') === '' ? null : readDate(row.text('payment_date'), format.dateFormat);
    const amount = row.text('payment_amount') === '' ? null : readAmount(row.text('payment_amount'));
    if (row.text('payment_date') !== '' && date === null) {
      reasons.push(documentHold('export_value_unreadable', header('payment_date'), row.number));
    }
    if (row.text('payment_amount') !== '' && amount === null) {
      reasons.push(documentHold('export_value_unreadable', header('payment_amount'), row.number));
    }
    return missing.length > 0 || date === null || amount === null ? null : { payee: row.text('payee_id'), trace: row.text('trace'), date, signedCents: amount };
  });
  if (reasons.length > 0) {
    throw new DocumentHeld(reasons);
  }
  return keys as PaymentKey[];
}

interface ReadLine {
  readonly row: Row;
  readonly line: PlannedLine;
  readonly plan: string;
}

interface ReadClaim {
  readonly patientControlNumber: string;
  readonly payerClaimControlNumber: string;
  readonly status: string;
  readonly lines: ReadLine[];
}

/** One line's adjustments: a row per group with codes, placed by its first code; or null with its holds. */
function lineAdjustments(
  row: Row,
  amounts: { readonly co: Cents; readonly pr: Cents; readonly other: Cents },
  separator: string,
  holds: Holds,
  unknown: (reason: string) => boolean,
): PlannedAdjustment[] | null {
  const items = listItems(row.text('adjustment_codes'), separator);
  const parsed: { readonly group: string; readonly reason: string; readonly index: number }[] = [];
  let readable = true;
  items.forEach((item, index) => {
    const match = ADJUSTMENT_CODE.exec(item);
    const group = match?.[1]?.toUpperCase();
    if (match === null || group === undefined || !ADJUSTMENT_GROUPS.has(group)) {
      readable = false;
      return;
    }
    parsed.push({ group, reason: (match[2] as string).toUpperCase(), index });
  });
  if (!readable) {
    holds.add('export_value_unreadable', 'adjustment_codes', row.number);
    return null;
  }
  const otherGroups = new Set(parsed.filter((item) => OTHER_GROUPS.has(item.group)).map((item) => item.group));
  const buckets = [
    { field: 'contractual_adjustment' as const, groups: ['CO'], amount: amounts.co },
    { field: 'patient_responsibility' as const, groups: ['PR'], amount: amounts.pr },
    { field: 'other_adjustment' as const, groups: [...otherGroups], amount: amounts.other },
  ];
  let attributed = otherGroups.size <= 1;
  if (!attributed) {
    holds.add('export_adjustment_unattributed', 'adjustment_codes', row.number);
  }
  const rows: { readonly first: number; readonly adjustment: Omit<PlannedAdjustment, 'position'> }[] = [];
  for (const bucket of buckets) {
    const codes = parsed.filter((item) => bucket.groups.includes(item.group));
    if (codes.length === 0) {
      if (bucket.amount !== ZERO_CENTS) {
        holds.add('export_adjustment_unattributed', bucket.field, row.number);
        attributed = false;
      }
      continue;
    }
    const reasons = [...new Set(codes.map((item) => item.reason))];
    // Every reason is checked (and an unknown one listed), not only the first unknown one.
    const unknownReasons = reasons.filter(unknown);
    rows.push({
      first: (codes[0] as { index: number }).index,
      adjustment: { groupCode: (codes[0] as { group: string }).group, reasonCode: reasons.join('+'), unknownCode: unknownReasons.length > 0, amountCents: bucket.amount, quantity: null },
    });
  }
  if (!attributed) {
    return null;
  }
  return rows.sort((a, b) => a.first - b.first).map((item, index) => ({ ...item.adjustment, position: index + 1 }));
}

/** One line, or null with its holds. */
function readLine(row: Row, lineNo: number, holds: Holds, unknown: (reason: string) => boolean, format: EraExportFormat): ReadLine | null {
  let ok = true;
  const required = (field: EraExportField): string | null => {
    const text = row.text(field);
    if (text === '') {
      holds.add('export_value_missing', field, row.number);
      ok = false;
      return null;
    }
    return text;
  };
  const unreadable = (field: EraExportField) => {
    holds.add('export_value_unreadable', field, row.number);
    ok = false;
  };
  const amount = (field: EraExportField): Cents => {
    const text = required(field);
    if (text === null) {
      return ZERO_CENTS;
    }
    const read = readAmount(text);
    if (read === null) {
      unreadable(field);
      return ZERO_CENTS;
    }
    return read;
  };
  const plan = required('plan');
  const serviceText = required('service_date');
  const serviceDate = serviceText === null ? null : readDate(serviceText, format.dateFormat);
  if (serviceText !== null && serviceDate === null) {
    unreadable('service_date');
  }
  const place = row.text('place_of_service');
  if (place !== '' && !PLACE_OF_SERVICE.test(place)) {
    unreadable('place_of_service');
  }
  const procedure = required('procedure_code');
  if (procedure !== null && !PROCEDURE.test(procedure)) {
    unreadable('procedure_code');
  }
  const modifiers = listItems(row.text('modifiers'), format.listSeparator);
  if (modifiers.length > MAX_MODIFIERS || modifiers.some((modifier) => !MODIFIER.test(modifier))) {
    unreadable('modifiers');
  }
  const units = required('units');
  if (units !== null && (!UNITS.test(units) || !fitsNumeric93(units) || /^[0.]*$/.test(units))) {
    unreadable('units');
  }
  const charge = amount('charge');
  const paid = amount('paid');
  const pr = amount('patient_responsibility');
  const co = amount('contractual_adjustment');
  const other = amount('other_adjustment');
  const allowedText = row.text('allowed');
  const allowed = allowedText === '' ? null : readAmount(allowedText);
  if (allowedText !== '' && allowed === null) {
    unreadable('allowed');
  }
  if (!ok) {
    return null;
  }
  const adjustments = lineAdjustments(row, { co, pr, other }, format.listSeparator, holds, unknown);
  if (subtractCents(charge, addCents(addCents(paid, co), addCents(pr, other))) !== ZERO_CENTS) {
    holds.add('export_line_unbalanced', 'charge', row.number);
    return null;
  }
  if (adjustments === null) {
    return null;
  }
  return {
    row,
    plan: plan as string,
    line: {
      lineNo,
      procedureQualifier: 'HC',
      procedureCode: (procedure as string).toUpperCase(),
      modifiers: modifiers.map((modifier) => modifier.toUpperCase()),
      revenueCode: null,
      chargeCents: charge,
      paidCents: paid,
      units,
      originalUnits: null,
      serviceDate,
      serviceDateTo: null,
      placeOfService: place === '' ? null : place,
      lineAllowedCents: allowed,
      // Paid plus the patient's share (PR), the basis the engine already reads; AMT B6 is never claimed for an export.
      observedAllowedCents: addCents(paid, pr),
      observedAllowedBasis: 'paid_plus_pr',
      observedAllowedAllocated: false,
      patientShareCents: pr,
      renderingNpi: null,
      adjustments,
    },
  };
}

/** The value every row of a payment holds in `field` ('' read as null), or a hold at the first row that differs. */
function agreed(rows: readonly Row[], field: EraExportField, holds: Holds): string | null | undefined {
  const first = rows[0] as Row;
  const value = first.text(field);
  const differs = rows.find((row) => row.text(field) !== value);
  if (differs !== undefined) {
    holds.add('export_payment_inconsistent', field, differs.number);
    return undefined;
  }
  return value === '' ? null : value;
}

/** A claim's reversal and correction links, by the parser's rule (packages/edi835/src/transaction.ts). */
function links(claims: readonly ReadClaim[], index: number): Pick<PlannedClaim, 'reversal' | 'correction'> {
  const claim = claims[index] as ReadClaim;
  const earlier = claims.slice(0, index);
  const reversed = claim.status === REVERSAL ? earlier.findIndex((item) => item.status !== REVERSAL && item.payerClaimControlNumber === claim.payerClaimControlNumber) : -1;
  const previous = earlier[index - 1];
  const follows = previous !== undefined && previous.status === REVERSAL && previous.patientControlNumber === claim.patientControlNumber ? previous : null;
  const corrects = claim.status === REVERSAL ? null : (follows?.payerClaimControlNumber ?? null);
  const reversal = corrects === null ? -1 : earlier.findIndex((item) => item.status === REVERSAL && item.payerClaimControlNumber === corrects);
  return {
    reversal: claim.status === REVERSAL ? { reversedClaimNo: reversed < 0 ? null : reversed + 1 } : null,
    correction: corrects === null ? null : { payerClaimControlNumber: corrects, reversalClaimNo: reversal < 0 ? null : reversal + 1 },
  };
}

/** Claims as a payment's rows group: consecutive rows with the same patient control number, payer claim number and status. */
function groupClaims<T>(rows: readonly T[], key: (row: T) => string): T[][] {
  const groups: T[][] = [];
  let last: string | null = null;
  for (const row of rows) {
    const current = key(row);
    if (current !== last || groups.length === 0) {
      groups.push([]);
      last = current;
    }
    (groups[groups.length - 1] as T[]).push(row);
  }
  return groups;
}

const claimKey = (row: Row): string => [row.text('patient_control_number'), row.text('payer_claim_number'), row.text('claim_status')].join('\u0000');

function plannedClaims(claims: readonly ReadClaim[]): PlannedClaim[] {
  return claims.map((claim, index) => {
    const days = claim.lines.map((item) => item.line.serviceDate).filter((day): day is string => day !== null).sort();
    const patient: PersonIdentity = { key: ['pcn', normalizeKeyPart(claim.patientControlNumber)].join('|'), lastName: null, firstName: null, memberId: null, groupNumber: null };
    return {
      claimNo: index + 1,
      patientControlNumber: claim.patientControlNumber,
      payerClaimControlNumber: claim.payerClaimControlNumber,
      statusCode: claim.status,
      chargeCents: sumCents(claim.lines.map((item) => item.line.chargeCents)),
      paidCents: sumCents(claim.lines.map((item) => item.line.paidCents)),
      patientRespCents: null,
      filingIndicator: null,
      facilityType: null,
      frequencyCode: null,
      planKey: `PLAN:${(claim.lines[0] as ReadLine).plan}`,
      patient,
      insured: null,
      serviceFrom: days[0] ?? null,
      serviceTo: days[days.length - 1] ?? null,
      allowedCents: null,
      receivedOn: null,
      interestCents: null,
      adjustments: [],
      lines: claim.lines.map((item) => item.line),
      ...links(claims, index),
    };
  });
}

/** One payment: its plan, or its holds. */
function readPayment(format: EraExportFormat, place: PaymentPlace, key: PaymentKey, rows: readonly Row[], codeLists: CodeListProvider, unknownCodes: Set<string>): EraExportPayment {
  const holds = new Holds(format, place.position);
  const payerName = agreed(rows, 'payer_name', holds);
  if (payerName === null) {
    holds.add('export_value_missing', 'payer_name', (rows[0] as Row).number);
  }
  const senderId = agreed(rows, 'sender_id', holds);
  const method = agreed(rows, 'payment_method', holds);
  const unknown = (reason: string): boolean => {
    const known = codeLists.has('carc', reason, key.date);
    if (!known) {
      unknownCodes.add(`carc:${reason}`);
    }
    return !known;
  };
  const claims: ReadClaim[] = [];
  const groups = groupClaims(rows, claimKey);
  for (const group of groups) {
    const first = group[0] as Row;
    const fields = { patient_control_number: first.text('patient_control_number'), payer_claim_number: first.text('payer_claim_number'), claim_status: first.text('claim_status') };
    for (const [field, value] of Object.entries(fields) as [EraExportField, string][]) {
      if (value === '') {
        holds.add('export_value_missing', field, first.number);
      }
    }
    if (fields.claim_status !== '' && !CLAIM_STATUSES.has(fields.claim_status)) {
      holds.add('export_value_unreadable', 'claim_status', first.number);
    }
    const lines: ReadLine[] = [];
    group.forEach((row, index) => {
      const read = readLine(row, index + 1, holds, unknown, format);
      if (read !== null) {
        lines.push(read);
      }
    });
    const plans = new Set(group.map((row) => row.text('plan')).filter((plan) => plan !== ''));
    if (plans.size > 1) {
      holds.add('export_claim_inconsistent', 'plan', group.find((row) => row.text('plan') !== first.text('plan') && row.text('plan') !== '')?.number ?? first.number);
    }
    claims.push({ patientControlNumber: fields.patient_control_number, payerClaimControlNumber: fields.payer_claim_number, status: fields.claim_status, lines });
  }
  if (holds.list.length === 0) {
    const claimsPaid = sumCents(claims.flatMap((claim) => claim.lines.map((item) => item.line.paidCents)));
    if (claimsPaid !== key.signedCents) {
      holds.add('export_payment_unbalanced', 'payment_amount', place.firstRow);
    }
  }
  if (holds.list.length > 0) {
    return { kind: 'held', ...place, claims: groups.length, reversals: groups.filter((group) => (group[0] as Row).text('claim_status') === REVERSAL).length, reasons: holds.list };
  }
  const negative = key.signedCents < ZERO_CENTS;
  const plan: LoadPlan<PlannedExportRemittance> = {
    remittance: {
      provenance: 'era_export',
      senderId: senderId ?? null,
      method: method ?? null,
      trn02: key.trace,
      bpr02Cents: negative ? negateCents(key.signedCents) : key.signedCents,
      creditDebit: negative ? 'D' : 'C',
      bpr16Date: key.date,
      payerName: payerName as string,
      payeeId: key.payee,
      productionDate: null,
      // Claims paid minus the payment (no PLB in an export): zero, or the payment is held above.
      balanceDiffCents: cents(0n),
      claimCount: claims.length,
      plbTotalCents: cents(0n),
    },
    payer: { payerIdRaw: `NAME:${payerName as string}`, nameRaw: payerName as string },
    claims: plannedClaims(claims),
    providerAdjustments: [],
  };
  return { kind: 'loadable', ...place, plan };
}

/** The export read with its format: each payment's plan or holds, or the whole document held (see the module comment). */
export function normalizeEraExport(input: EraExportInput): EraExportNormalized {
  const format = findEraExportFormat(input.formatId);
  if (format === undefined) {
    // The format_id CHECK holds the registry's IDs; a document of no known format cannot be read as one.
    return { kind: 'held', reasons: [documentHold('export_unreadable')] };
  }
  if (input.bytes.byteLength > ERA_EXPORT_MAX_BYTES) {
    return { kind: 'held', reasons: [documentHold('export_too_large')] };
  }
  const text = decode(input.bytes);
  if (text === null) {
    return { kind: 'held', reasons: [documentHold('export_unreadable')] };
  }
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch {
    return { kind: 'held', reasons: [documentHold('export_unreadable')] };
  }
  const [header, ...data] = table;
  if (header === undefined || data.length === 0) {
    return { kind: 'held', reasons: [documentHold('export_empty')] };
  }
  try {
    const columns = locate(format, header);
    const rows = data.map((cells, index) => new Row(index + 1, cells, columns));
    const keys = paymentKeys(format, rows);
    const byKey = new Map<string, { key: PaymentKey; rows: Row[] }>();
    rows.forEach((row, index) => {
      const key = keys[index] as PaymentKey;
      const text = [key.payee, key.trace, key.date, key.signedCents.toString()].join('\u0000');
      const found = byKey.get(text);
      if (found === undefined) {
        byKey.set(text, { key, rows: [row] });
      } else {
        found.rows.push(row);
      }
    });
    const unknownCodes = new Set<string>();
    const payments = [...byKey.values()].map((payment, index) =>
      readPayment(format, { position: index + 1, firstRow: (payment.rows[0] as Row).number, rows: payment.rows.length }, payment.key, payment.rows, input.codeLists, unknownCodes),
    );
    return { kind: 'payments', payments, unknownCodes: [...unknownCodes].sort() };
  } catch (error) {
    if (error instanceof DocumentHeld) {
      return { kind: 'held', reasons: error.reasons };
    }
    throw error;
  }
}

/** The fields the normalizer reads, required or not (formats.test.ts holds every format to them). */
export const ERA_EXPORT_FIELDS: readonly EraExportField[] = [...REQUIRED_ERA_FIELDS, ...OPTIONAL_ERA_FIELDS];
