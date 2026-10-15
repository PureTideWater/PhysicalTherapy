/**
 * The element layout of every segment the parser reads, by loop, written against the 005010X221A1
 * structure (usage and data type from pyx12's open-source 835 map; nothing copied from the
 * implementation guide). Elements the structure marks not used are null and ignored when present.
 *
 * Kinds: `id` (a code; with `list`, checked against the code lists: a CARC or RARC flagged when
 * unknown, a value outside one of the structure's own sets held as EDI_SYNTAX invalid_code),
 * `text`, `money` (an amount: a decimal with at most two places, parsed to cents), `decimal` (a
 * quantity, rate or count kept exactly as text), `units` (a decimal above zero), `date`
 * (CCYYMMDD), `date6` (YYMMDD), `number` (a whole number: control numbers and counts) and
 * `composite` (components, each `id` or `text`).
 */
import { type CodeListName } from './code-lists';

export type ElementKind = 'id' | 'text' | 'money' | 'decimal' | 'units' | 'date' | 'date6' | 'number' | 'composite';

export interface ComponentSpec {
  readonly required: boolean;
  readonly kind: 'id' | 'text';
  readonly list?: CodeListName;
}

export interface ElementSpec {
  readonly required: boolean;
  readonly kind: ElementKind;
  readonly list?: CodeListName;
  readonly components?: readonly ComponentSpec[];
}

/** Element specs from position 1; null where the structure does not use the element. */
export type SegmentSpec = readonly (ElementSpec | null)[];

type Kind = Exclude<ElementKind, 'composite'>;
const R = (kind: Kind, list?: CodeListName): ElementSpec => (list === undefined ? { required: true, kind } : { required: true, kind, list });
const S = (kind: Kind, list?: CodeListName): ElementSpec => (list === undefined ? { required: false, kind } : { required: false, kind, list });
const _ = null;
const component = (required: boolean, kind: 'id' | 'text', list?: CodeListName): ComponentSpec => (list === undefined ? { required, kind } : { required, kind, list });
const composite = (required: boolean, components: readonly ComponentSpec[]): ElementSpec => ({ required, kind: 'composite', components });
const repeat = (count: number, spec: ElementSpec): ElementSpec[] => Array.from({ length: count }, () => spec);

const procedure = (list: CodeListName): ComponentSpec[] => [component(true, 'id', list), component(true, 'text'), ...Array.from({ length: 5 }, () => component(false, 'text'))];
const adjustmentReason = (required: boolean): ElementSpec => composite(required, [component(true, 'id', 'provider_adjustment_reason'), component(false, 'text')]);
const cas: SegmentSpec = [R('id', 'adjustment_group'), R('id', 'carc'), R('money'), S('decimal'), ...[1, 2, 3, 4, 5].flatMap(() => [S('id', 'carc'), S('money'), S('decimal')])];
const name = (patientLike: boolean, idRequired: boolean, list: CodeListName): SegmentSpec => [
  R('id'),
  R('id', 'entity_type'),
  patientLike ? S('text') : R('text'),
  patientLike ? S('text') : _,
  patientLike ? S('text') : _,
  _,
  patientLike ? S('text') : _,
  idRequired ? R('id', list) : S('id', list),
  idRequired ? R('text') : S('text'),
];
const contact = (numberRequired: boolean): SegmentSpec => [
  R('id', 'contact_function'),
  S('text'),
  numberRequired ? R('id', 'communication_qualifier') : S('id', 'communication_qualifier'),
  numberRequired ? R('text') : S('text'),
  S('id', 'communication_qualifier'),
  S('text'),
  S('id', 'communication_qualifier'),
  S('text'),
];
const address: SegmentSpec = [R('text'), S('text')];
const city: SegmentSpec = [R('text'), S('text'), S('text'), S('text'), _, _, S('text')];
const reference = (list: CodeListName): SegmentSpec => [R('id', list), R('text')];
// DTM02 is required unless DTM05 and DTM06 carry the date (read by the DTM rules in transaction.ts).
const date = (list: CodeListName): SegmentSpec => [R('id', list), S('date'), _, _, S('id'), S('text')];

export const SPECS: Readonly<Record<string, SegmentSpec>> = {
  // Envelopes.
  ISA: [R('id'), R('text'), R('id'), R('text'), R('id'), R('text'), R('id'), R('text'), R('date6'), R('text'), R('text'), R('id'), R('number'), R('id'), R('id'), R('text')],
  TA1: [R('number'), R('date6'), R('text'), R('id'), R('id')],
  IEA: [R('number'), R('number')],
  GS: [R('id'), R('text'), R('text'), R('date'), R('text'), R('number'), R('id'), R('text')],
  GE: [R('number'), R('number')],
  ST: [R('id'), R('text')],
  SE: [R('number'), R('text')],
  // Header.
  'header/BPR': [
    R('id', 'transaction_handling'),
    R('money'),
    R('id'),
    R('id', 'payment_method'),
    S('id', 'payment_format'),
    S('id', 'dfi_qualifier'),
    S('text'),
    S('id', 'account_qualifier'),
    S('text'),
    S('text'),
    S('text'),
    S('id', 'dfi_qualifier'),
    S('text'),
    S('id', 'account_qualifier'),
    S('text'),
    R('date'),
  ],
  'header/TRN': [R('id', 'trace_type'), R('text'), R('text'), S('text')],
  'header/CUR': [R('id', 'currency_entity'), R('text')],
  'header/REF': reference('header_reference'),
  'header/DTM': date('header_date'),
  // 1000A payer and 1000B payee.
  'payer/N1': [R('id'), R('text'), S('id', 'payer_id_qualifier'), S('text')],
  'payer/N3': address,
  'payer/N4': city,
  'payer/REF': reference('payer_reference'),
  'payer/PER': contact(false),
  'payee/N1': [R('id'), R('text'), R('id', 'payee_id_qualifier'), R('text')],
  'payee/N3': address,
  'payee/N4': city,
  'payee/REF': reference('payee_reference'),
  'payee/RDM': [R('id', 'delivery_method'), S('text'), S('text')],
  // 2000 header number.
  'number/LX': [R('number')],
  'number/TS3': [R('text'), R('text'), R('date'), R('decimal'), R('money'), _, _, _, _, _, _, _, S('money'), _, S('money'), _, S('money'), S('money'), _, S('money'), S('money'), S('money'), S('decimal'), S('money')],
  'number/TS2': [...repeat(6, S('money')), S('decimal'), S('money'), S('money'), ...repeat(5, S('decimal')), S('money'), S('decimal'), S('money'), S('money'), S('money')],
  // 2100 claim.
  'claim/CLP': [R('text'), R('id', 'claim_status'), R('money'), R('money'), S('money'), R('id', 'claim_filing_indicator'), R('text'), S('text'), S('text'), _, S('text'), S('decimal'), S('decimal')],
  'claim/CAS': cas,
  'claim/NM1/QC': name(true, false, 'patient_id_qualifier'),
  'claim/NM1/IL': name(true, true, 'subscriber_id_qualifier'),
  'claim/NM1/74': name(true, false, 'corrected_name_id_qualifier'),
  'claim/NM1/82': name(true, true, 'provider_id_qualifier'),
  'claim/NM1/TT': name(false, true, 'payer_entity_id_qualifier'),
  'claim/NM1/PR': name(false, true, 'payer_entity_id_qualifier'),
  'claim/NM1/GB': name(true, false, 'subscriber_id_qualifier'),
  'claim/MIA': [R('decimal'), S('money'), S('decimal'), S('money'), S('id', 'rarc'), ...repeat(9, S('money')), S('decimal'), ...repeat(4, S('money')), ...repeat(4, S('id', 'rarc')), S('money')],
  'claim/MOA': [S('decimal'), S('money'), ...repeat(5, S('id', 'rarc')), S('money'), S('money')],
  'claim/REF': reference('claim_reference'),
  'claim/DTM': date('claim_date'),
  'claim/PER': contact(true),
  'claim/AMT': [R('id', 'claim_amount'), R('money')],
  'claim/QTY': [R('id', 'claim_quantity'), R('decimal')],
  // 2110 service line.
  'line/SVC': [composite(true, procedure('procedure_qualifier')), R('money'), R('money'), S('text'), S('units'), composite(false, procedure('original_procedure_qualifier')), S('units')],
  'line/DTM': date('line_date'),
  'line/CAS': cas,
  'line/REF': reference('line_reference'),
  'line/AMT': [R('id', 'line_amount'), R('money')],
  'line/QTY': [R('id', 'line_quantity'), R('decimal')],
  'line/LQ': [R('id', 'remark_qualifier'), R('text')],
  // Footer.
  'footer/PLB': [R('text'), R('date'), adjustmentReason(true), R('money'), ...[1, 2, 3, 4, 5].flatMap(() => [adjustmentReason(false), S('money')])],
};
