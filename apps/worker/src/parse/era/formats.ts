import type { EraFormatId } from '@tp/db/runtime';

/**
 * The vendor ERA export formats the worker reads (Change Order 001, CO-03; docs/adr/0059 and 0060): the
 * `era_export` entries of packages/synth's format registry (packages/synth/src/formats/vendors/registry.ts), as
 * the runtime data the normalizer reads an export with. packages/synth is the fixture generator and is not
 * shipped with the worker, so the entries are held here, and a test holds each equal to its fixture's manifest
 * (fixtures/synthetic/emr/<id>/manifest.json, which the registry writes): its columns, layout, status and
 * confirmation. The IDs are source_document.format_id's CHECK (ERA_FORMAT_IDS in @tp/db).
 *
 * Every format is FORMAT_UNCONFIRMED: no format description of any of the four vendors has been received, so
 * each layout is a placeholder in the vendor's plausible vocabulary. Confirming one, once its description
 * agrees with the columns, is data: its `status` becomes FORMAT_CONFIRMED and `confirmation` names the date the
 * description was received and its reference, here and in the registry, and the Coverage flag clears. A
 * description that disagrees becomes a `_v1` entry beside `_v0`, which needs a migration (the format_id CHECK).
 */

export type EraExportField =
  | 'sender_id'
  | 'payer_name'
  | 'payee_id'
  | 'trace'
  | 'payment_date'
  | 'payment_amount'
  | 'payment_method'
  | 'patient_control_number'
  | 'payer_claim_number'
  | 'claim_status'
  | 'plan'
  | 'service_date'
  | 'place_of_service'
  | 'procedure_code'
  | 'modifiers'
  | 'units'
  | 'charge'
  | 'allowed'
  | 'paid'
  | 'patient_responsibility'
  | 'contractual_adjustment'
  | 'other_adjustment'
  | 'adjustment_codes';

/**
 * The columns a line needs, so an export without one is held whole (export_column_missing): the payment's key
 * (payee, trace, date and signed amount) and its payer, the claim (patient control number, payer claim number,
 * status, plan), the line (date, place of service, procedure, units, charge, paid) and its adjustments (patient
 * responsibility, contractual, other and their codes), from which pricing's paid-plus-PR observed allowed comes.
 * The place of service is what a percent-of-Medicare term prices by (the engine stops a line without one as
 * place_of_service_unmapped), so its column is required; a blank cell is a line with none, as an 835 claim
 * without CLP08 is.
 */
export const REQUIRED_ERA_FIELDS: readonly EraExportField[] = [
  'trace',
  'payment_date',
  'payment_amount',
  'payee_id',
  'payer_name',
  'patient_control_number',
  'payer_claim_number',
  'claim_status',
  'plan',
  'service_date',
  'place_of_service',
  'procedure_code',
  'units',
  'charge',
  'paid',
  'patient_responsibility',
  'contractual_adjustment',
  'other_adjustment',
  'adjustment_codes',
];

/** Columns read when the export has them: the interchange sender and payment method (kept on the remittance), modifiers, and the line's allowed figure. */
export const OPTIONAL_ERA_FIELDS: readonly EraExportField[] = ['sender_id', 'payment_method', 'modifiers', 'allowed'];

export const FORMAT_UNCONFIRMED = 'FORMAT_UNCONFIRMED';
export const FORMAT_CONFIRMED = 'FORMAT_CONFIRMED';
export type EraFormatStatus = typeof FORMAT_UNCONFIRMED | typeof FORMAT_CONFIRMED;

export type EraDateFormat = 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface EraExportColumn {
  /** The header as the vendor writes it; read trimmed and in any case. */
  readonly header: string;
  readonly field: EraExportField;
}

export interface EraExportFormat {
  readonly id: EraFormatId;
  readonly vendor: 'webpt_billing' | 'prompt' | 'spry' | 'raintree';
  readonly vendorName: string;
  readonly version: number;
  readonly status: EraFormatStatus;
  /** Null while FORMAT_UNCONFIRMED: the date its format description was received and its reference, once confirmed. */
  readonly confirmation: { readonly receivedOn: string; readonly reference: string } | null;
  readonly note: string;
  /** In file order. */
  readonly columns: readonly EraExportColumn[];
  readonly dateFormat: EraDateFormat;
  /** How a list (modifiers, adjustment codes) is written in one cell. */
  readonly listSeparator: string;
  readonly bom: boolean;
  readonly lineEnding: 'CRLF' | 'LF';
}

const note = (vendorName: string): string =>
  `FORMAT_UNCONFIRMED: no format description of the ${vendorName} ERA export has been received. ` +
  `These columns are a placeholder in ${vendorName}'s plausible vocabulary, not taken from any file, screen or document of ${vendorName}. ` +
  'The design-partner firm supplies the real format as a description and redacted headers only, never a file.';

function unconfirmed(
  id: EraFormatId,
  vendor: EraExportFormat['vendor'],
  vendorName: string,
  layout: Pick<EraExportFormat, 'dateFormat' | 'listSeparator' | 'bom' | 'lineEnding'>,
  columns: readonly (readonly [string, EraExportField])[],
): EraExportFormat {
  return {
    id,
    vendor,
    vendorName,
    version: 0,
    status: FORMAT_UNCONFIRMED,
    confirmation: null,
    note: note(vendorName),
    columns: columns.map(([header, field]) => ({ header, field })),
    ...layout,
  };
}

export const ERA_EXPORT_FORMATS: readonly EraExportFormat[] = [
  unconfirmed('webpt_billing_era_v0', 'webpt_billing', 'WebPT Billing', { dateFormat: 'MM/DD/YYYY', listSeparator: ',', bom: false, lineEnding: 'CRLF' }, [
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
  ]),
  unconfirmed('prompt_era_v0', 'prompt', 'Prompt', { dateFormat: 'YYYY-MM-DD', listSeparator: ' ', bom: false, lineEnding: 'LF' }, [
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
  ]),
  unconfirmed('spry_era_v0', 'spry', 'SPRY', { dateFormat: 'MM/DD/YYYY', listSeparator: ':', bom: false, lineEnding: 'CRLF' }, [
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
  ]),
  unconfirmed('raintree_era_v0', 'raintree', 'Raintree', { dateFormat: 'YYYY-MM-DD', listSeparator: ';', bom: false, lineEnding: 'LF' }, [
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
  ]),
];

/** The format of an ID, or undefined when it names none. */
export function findEraExportFormat(id: string): EraExportFormat | undefined {
  return ERA_EXPORT_FORMATS.find((format) => format.id === id);
}

/** Whether lines read with the format rest on a placeholder layout (the Coverage screen flags them). */
export function isUnconfirmed(format: Pick<EraExportFormat, 'status'>): boolean {
  return format.status === FORMAT_UNCONFIRMED;
}

/** How the format is named to a person: "<vendor> ERA export". */
export function eraFormatName(format: Pick<EraExportFormat, 'vendorName'>): string {
  return `${format.vendorName} ERA export`;
}

/** The IDs of the formats that are not yet confirmed, for the Coverage flag's query. */
export function unconfirmedEraFormatIds(): EraFormatId[] {
  return ERA_EXPORT_FORMATS.filter(isUnconfirmed).map((format) => format.id);
}
