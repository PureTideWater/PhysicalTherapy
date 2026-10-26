/**
 * Every slot a figure fills in the words (finding m5; docs/adr/0072), and the one value it must print: where it is
 * (the trace, or the citation beside it) and its JSON path there, `#` standing for an array index. Written by hand from
 * the design's sentence forms (section 3.4 to 3.6), never generated from ./line.ts: line.ts and worksheet.ts build
 * every figure from this table, and their tests require each figure's path to be its slot's, so a sentence that
 * prints a real trace value in the wrong place (the amount before a reduction where the amount after belongs) fails.
 * The table is part of the words version (../words-version.ts). Pure and browser-safe.
 */

export interface SlotPath {
  readonly from: 'trace' | 'citation';
  /** The path, `#` for an array index the sentence names by position. */
  readonly path: readonly string[];
}

const trace = (...path: string[]): SlotPath => ({ from: 'trace', path });
const citation = (...path: string[]): SlotPath => ({ from: 'citation', path });

const adjustment = (field: string, ...rest: string[]) => trace('steps', 'adjustments', '#', field, ...rest);

export const SLOTS = {
  // The summary sentence.
  'summary.units': trace('steps', 'units', 'units'),
  'summary.unit': trace('steps', 'units', 'unit_cents'),
  'summary.schedule': trace('steps', 'units', 'schedule_cents'),
  'summary.charge': trace('steps', 'units', 'charge_cents'),
  'summary.base': trace('steps', 'units', 'base_cents'),
  'summary.visit_amount': trace('steps', 'per_visit', 'amount_cents'),
  'summary.carrier_line': trace('steps', 'per_visit', 'carrier_line_no'),
  'summary.visit_base': trace('steps', 'per_visit', 'base_cents'),
  'summary.page': citation('page'),
  'summary.reference': citation('reference'),
  'summary.after': adjustment('after_cents'),
  'summary.rounded': trace('steps', 'rounding', 'rounded_cents'),
  'summary.observed': trace('line', 'observed_allowed_cents'),
  'summary.variance': trace('steps', 'variance_cents'),
  'summary.claim_status': trace('claim', 'claim_status_code'),
  // Step 1, the agreement.
  'agreement.page': citation('page'),
  'agreement.reference': citation('reference'),
  'agreement.matching': trace('agreement', 'matching_rate_record_ids'),
  // Step 2, the terms.
  'terms.fixed_amount': trace('terms', 'fixed_amount_cents'),
  'terms.percentage': trace('terms', 'percent_of_medicare', 'percentage'),
  'terms.basis_year': trace('steps', 'fee_schedule', 'basis_year'),
  'terms.named_carrier': trace('terms', 'percent_of_medicare', 'locality_basis', 'carrier'),
  'terms.named_locality': trace('terms', 'percent_of_medicare', 'locality_basis', 'locality'),
  'terms.reference': citation('reference'),
  'terms.adjustment_percent': trace('terms', 'contract_adjustment', 'percent'),
  'terms.adjustment_cap': trace('terms', 'contract_adjustment', 'cap_cents'),
  // Step 2, the fee schedule.
  'fee_schedule.basis_year': trace('steps', 'fee_schedule', 'basis_year'),
  'fee_schedule.service_date': trace('line', 'service_date'),
  'fee_schedule.code': trace('line', 'procedure_code'),
  'fee_schedule.place_of_service': trace('line', 'place_of_service'),
  'fee_schedule.zip': trace('settings', 'zip'),
  'fee_schedule.carrier': trace('steps', 'fee_schedule', 'locality', 'carrier'),
  'fee_schedule.locality': trace('steps', 'fee_schedule', 'locality', 'locality'),
  'fee_schedule.zip_plus_four': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'zip_plus_four'),
  'fee_schedule.plus_four_from': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'from'),
  'fee_schedule.plus_four_to': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'to'),
  'fee_schedule.plus_four_carrier': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'carrier'),
  'fee_schedule.plus_four_locality': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'locality'),
  // Step 3, the units.
  'units.units': trace('steps', 'units', 'units'),
  'units.mue_code': trace('line', 'procedure_code'),
  'units.mue_value': trace('steps', 'units', 'mue', 'value'),
  'units.service_date': trace('line', 'service_date'),
  'units.unit': trace('steps', 'units', 'unit_cents'),
  'units.schedule': trace('steps', 'units', 'schedule_cents'),
  'units.charge': trace('steps', 'units', 'charge_cents'),
  'units.base': trace('steps', 'units', 'base_cents'),
  // Step 3, per visit.
  'per_visit.amount': trace('steps', 'per_visit', 'amount_cents'),
  'per_visit.carrier_line': trace('steps', 'per_visit', 'carrier_line_no'),
  'per_visit.visit_line': trace('steps', 'per_visit', 'visit_line_nos', '#'),
  'per_visit.base': trace('steps', 'per_visit', 'base_cents'),
  // Step 3, the NCCI procedure-to-procedure edits.
  'ncci_ptp.column1_line': trace('steps', 'ncci_ptp', 'edits', '#', 'column1_line_no'),
  'ncci_ptp.column1_code': trace('steps', 'ncci_ptp', 'edits', '#', 'column1_code'),
  'ncci_ptp.indicator': trace('steps', 'ncci_ptp', 'edits', '#', 'modifier_indicator'),
  'ncci_ptp.line_modifier': trace('line', 'modifiers', '#'),
  'ncci_ptp.own_line': trace('line', 'line_no'),
  'ncci_ptp.column1_modifier': trace('steps', 'ncci_ptp', 'edits', '#', 'column1_modifiers', '#'),
  // Step 4a, the multiple procedure payment reduction.
  'mppr.before': adjustment('before_cents'),
  'mppr.after': adjustment('after_cents'),
  'mppr.service_date': adjustment('service_date'),
  'mppr.first_line': adjustment('ranking', '#', 'line_no'),
  'mppr.first_pe': adjustment('ranking', '#', 'pe_cents'),
  'mppr.percent': adjustment('reduction_percent'),
  'mppr.cut_unit': adjustment('reductions', '#', 'unit'),
  'mppr.cut_rank': adjustment('reductions', '#', 'rank'),
  'mppr.cut': adjustment('reductions', '#', 'cut_cents'),
  // Step 4b, the assistant reduction.
  'assistant.percent': adjustment('records', '#', 'payment_percent'),
  'assistant.before': adjustment('before_cents'),
  'assistant.after': adjustment('after_cents'),
  // Step 4c, sequestration.
  'sequestration.before': adjustment('before_cents'),
  'sequestration.patient_share': adjustment('patient_share_cents'),
  'sequestration.payer_share': adjustment('payer_share_cents'),
  'sequestration.percent': adjustment('reduction_percent'),
  'sequestration.cut': adjustment('cut_cents'),
  'sequestration.after': adjustment('after_cents'),
  // Step 4d, the contract's adjustment.
  'contract_adjustment.percent': adjustment('percent'),
  'contract_adjustment.cap': adjustment('cap_cents'),
  'contract_adjustment.before': adjustment('before_cents'),
  'contract_adjustment.after': adjustment('after_cents'),
  // Step 5, the patient share.
  'patient_share.amount': trace('steps', 'patient_share_cents'),
  'patient_share.group': trace('line', 'patient_share_adjustments', '#', 'group_code'),
  'patient_share.reason': trace('line', 'patient_share_adjustments', '#', 'reason_code'),
  'patient_share.adjustment': trace('line', 'patient_share_adjustments', '#', 'amount_cents'),
  // Step 6, the one rounding.
  'rounding.unrounded': trace('steps', 'rounding', 'unrounded_cents'),
  'rounding.rounded': trace('steps', 'rounding', 'rounded_cents'),
  // Step 7, observed and the variance.
  'observed.observed': trace('line', 'observed_allowed_cents'),
  'observed.expected': trace('outcome', 'expected_allowed_cents'),
  'observed.variance': trace('steps', 'variance_cents'),
  // Step 8, the dispute window.
  'window.length': trace('steps', 'window', 'length'),
  'window.from_date': trace('steps', 'window', 'from_date'),
  'window.ends_on': trace('steps', 'window', 'ends_on'),
  'window.as_of': trace('steps', 'window', 'as_of'),
  // The release and the engine.
  'release.number': trace('release', 'number'),
  'release.engine': trace('engine'),
  // The outcome.
  'outcome.claim_status': trace('claim', 'claim_status_code'),
  'outcome.expected': trace('outcome', 'expected_allowed_cents'),
  'outcome.unrounded': trace('outcome', 'expected_unrounded_cents'),
  // The fee-schedule worksheet, each figure read in the trace of a row that uses it.
  'worksheet.code': trace('line', 'procedure_code'),
  'worksheet.basis_year': trace('steps', 'fee_schedule', 'basis_year'),
  'worksheet.carrier': trace('steps', 'fee_schedule', 'locality', 'carrier'),
  'worksheet.locality': trace('steps', 'fee_schedule', 'locality', 'locality'),
  'worksheet.zip': trace('settings', 'zip'),
  'worksheet.zip_plus_four': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'zip_plus_four'),
  'worksheet.plus_four_from': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'from'),
  'worksheet.plus_four_to': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'to'),
  'worksheet.plus_four_carrier': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'carrier'),
  'worksheet.plus_four_locality': trace('steps', 'fee_schedule', 'locality', 'plus_four', 'locality'),
  'worksheet.place_of_service': trace('line', 'place_of_service'),
  'worksheet.factor': trace('steps', 'fee_schedule', 'conversion_factor', 'value'),
  'worksheet.percentage': trace('steps', 'fee_schedule', 'percentage'),
  'worksheet.page': citation('page'),
  'worksheet.reference': citation('reference'),
  'worksheet.work_rvu': trace('steps', 'fee_schedule', 'rvu', 'work_rvu'),
  'worksheet.pe_rvu_facility': trace('steps', 'fee_schedule', 'rvu', 'pe_rvu_facility'),
  'worksheet.pe_rvu_non_facility': trace('steps', 'fee_schedule', 'rvu', 'pe_rvu_non_facility'),
  'worksheet.mp_rvu': trace('steps', 'fee_schedule', 'rvu', 'mp_rvu'),
  'worksheet.work_gpci': trace('steps', 'fee_schedule', 'gpci', 'work_gpci'),
  'worksheet.pe_gpci': trace('steps', 'fee_schedule', 'gpci', 'pe_gpci'),
  'worksheet.mp_gpci': trace('steps', 'fee_schedule', 'gpci', 'mp_gpci'),
  'worksheet.unit_work': trace('steps', 'fee_schedule', 'unit_cents', 'work'),
  'worksheet.unit_pe': trace('steps', 'fee_schedule', 'unit_cents', 'pe'),
  'worksheet.unit_mp': trace('steps', 'fee_schedule', 'unit_cents', 'mp'),
  'worksheet.unit_total': trace('steps', 'fee_schedule', 'unit_cents', 'total'),
} as const satisfies Readonly<Record<string, SlotPath>>;

export type Slot = keyof typeof SLOTS;

/** Whether `path` is the slot's path, each `#` an array index (a non-negative integer) in its place. */
export function pathMatchesSlot(slot: string, from: 'trace' | 'citation', path: readonly (string | number)[]): boolean {
  const entry = Object.hasOwn(SLOTS, slot) ? (SLOTS as Readonly<Record<string, SlotPath>>)[slot] : undefined;
  if (entry === undefined || entry.from !== from || entry.path.length !== path.length) {
    return false;
  }
  return entry.path.every((part, index) => {
    const given = path[index];
    // A non-negative safe integer: its decimal text has no minus sign (comparing it by size is arithmetic the words do not do).
    return part === '#' ? Number.isSafeInteger(given) && !String(given).startsWith('-') : given === part;
  });
}
