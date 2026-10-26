import type { PricingTrace, TraceAdjustment, UnpricedReason } from '@tp/pricing';

import { ExplainShapeError, type FigureContext, type Part, type Sentence, figure, label, listOf, say } from './figures';
import {
  ADJUSTMENT_TEXT,
  AGREEMENT_FAILURE_TEXT,
  APPLICABILITY_TEXT,
  DETAIL_TEXT,
  ExplainWordsError,
  FLAG_TEXT,
  MEDICARE_ROUNDING_ORIGIN_TEXT,
  MEDICARE_TIMED_UNITS_TEXT,
  METHOD_TEXT,
  OBSERVED_BASIS_TEXT,
  PAYER_OBSERVED_BASIS_TEXT,
  PAYER_ROUNDING_ORIGIN_TEXT,
  ROUNDING_ORIGIN_TEXT,
  ROUNDING_TEXT,
  SECONDARY_STATUS_TEXT,
  SETTING_TEXT,
  STOP_STEP_TEXT,
  TIMED_UNITS_TEXT,
  UNPRICED_MEANING,
  UNPRICED_REMEDY,
  WINDOW_SOURCE_TEXT,
  WINDOW_START_TEXT,
  WINDOW_STATUS_TEXT,
  WINDOW_UNIT_ONE_TEXT,
  WINDOW_UNIT_TEXT,
  wordsOf,
} from './words';

/**
 * One line's calculation in words (combined audit #38; docs/adr/0072): a summary sentence in the audit's form ("2 units
 * x $50.00 = $100.00 under the contract's clause on page 2; rounded once to $100.00; observed allowed $70.00; short
 * $30.00.") and the sentences of each step, from the line's stored trace and the citation beside it. Pure and
 * deterministic: the same trace, citation and audience give the same words, byte for byte.
 *
 * The words compute nothing. Every figure is a value the trace or the citation holds, read at its slot's path
 * (./slots.ts) and written in a display form (./figures.ts); the one derivation is an array's length (a count). Words
 * are chosen by a value's kind or by the string equality of values the engine wrote (`before_cents === after_cents`
 * for "unchanged", `payer_share_cents === "0"` for a payer's share floored at zero, `agreement.outcome ===
 * "MA_NONCONTRACTED"` for Medicare's own rules), never by adding, comparing by size, rounding or negating one.
 *
 * Three audiences (design section 3.3): `internal` (the roles that read PHI: dates shown), `viewer` (no date of any
 * kind; the dispute window's length and start only) and `payer` (the payer's PDF and the review page that shows it: no
 * date, no window, no release, no rule record, no flag that is off, no NCCI or MUE note, no code but PAYER_CODES, the
 * fee schedule pointed to its worksheet). A flag that is off reads only "Not applied (flag off)", never as the
 * contract's position (an omitted flag defaults to false, so the trace cannot tell a contract's "no" from its
 * silence); on a Medicare Advantage non-contracted line Medicare's reductions and rules are never a contract's or a
 * rate record's. The year is worded from the fee schedule's lookup, its label checked against it (finding M4).
 */

/** What the words may cite beside the trace: the contract page (rate_record.evidence.page) or the regulation. */
export type ExplainCitation =
  | { readonly kind: 'contract'; readonly page: number }
  | { readonly kind: 'regulation'; readonly reference: string }
  | null;

export type Audience = 'internal' | 'viewer' | 'payer';
export const AUDIENCES = ['internal', 'viewer', 'payer'] as const satisfies readonly Audience[];

export const STEP_KINDS = [
  'agreement',
  'terms',
  'fee_schedule',
  'units',
  'per_visit',
  'ncci_ptp',
  'mppr',
  'assistant_reduction',
  'sequestration',
  'contract_adjustment',
  'patient_share',
  'rounding',
  'observed',
  'window',
  'release',
  'outcome',
] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface StepWords {
  readonly step: StepKind;
  readonly sentences: readonly Sentence[];
}

export interface LineWords {
  readonly summary: Sentence;
  readonly steps: readonly StepWords[];
  /** The fee-schedule worksheet's grouping key (./worksheet.ts), null when the line has no complete fee schedule. */
  readonly worksheetKey: string | null;
}

export interface ExplainLineOptions {
  /** In a packet: the number of the worksheet the line's fee schedule is in, which the payer's words point to. */
  readonly worksheet?: number;
  /** In a packet: the row of each other line of the same claim that is in the packet, by its line number. */
  readonly rowsOfClaim?: ReadonlyMap<number, number>;
}

interface Words extends FigureContext {
  readonly trace: PricingTrace;
  readonly citation: ExplainCitation;
  readonly audience: Audience;
  readonly options: ExplainLineOptions;
  /** Whether the line is a Medicare Advantage non-contracted line (agreement.outcome, by string equality). */
  readonly medicare: boolean;
}

/** A step not reached before an unpriced line stopped; a step that does not apply is left out. */
const NOT_REACHED = 'not_reached';
type StepResult = readonly Sentence[] | typeof NOT_REACHED | null;

/** The words of one line. Throws ExplainWordsError for a code without words, ExplainShapeError for a trace the words cannot read. */
export function explainLine(trace: PricingTrace, citation: ExplainCitation, audience: Audience, options: ExplainLineOptions = {}): LineWords {
  const medicare = trace.agreement?.outcome === 'MA_NONCONTRACTED';
  if (medicare !== (citation?.kind === 'regulation')) {
    throw new ExplainShapeError('a Medicare Advantage non-contracted line, and only one, cites the regulation');
  }
  if (audience === 'payer' && trace.outcome.result !== 'priced') {
    throw new ExplainShapeError('the payer’s words are of priced lines only');
  }
  checkYearBasis(trace);
  const words: Words = { trace, citation, audience, options, medicare };
  const unpriced = trace.outcome.result === 'unpriced';
  const steps: StepWords[] = [];
  for (const step of stepsFor(audience)) {
    const result = STEP_WORDS[step](words);
    if (result === NOT_REACHED) {
      if (unpriced) {
        steps.push({ step, sentences: [say('Not reached.')] });
      }
    } else if (result !== null && result.length !== 0) {
      steps.push({ step, sentences: result });
    }
  }
  return { summary: summary(words), steps, worksheetKey: worksheetKeyOf(trace, citation) };
}

const PAYER_STEPS: ReadonlySet<StepKind> = new Set(['terms', 'fee_schedule', 'per_visit', 'mppr', 'assistant_reduction', 'sequestration', 'contract_adjustment', 'patient_share', 'rounding', 'observed']);

function stepsFor(audience: Audience): readonly StepKind[] {
  return audience === 'payer' ? STEP_KINDS.filter((step) => PAYER_STEPS.has(step)) : STEP_KINDS;
}

/**
 * The fee schedule's year basis against what the engine did (finding M4): CURRENT reads the records in force on the
 * service date, `LOCKED:<basis_year>` the latest in force during the basis year; any other pair (a malformed LOCKED
 * priced as CURRENT) is refused rather than worded "locked" over a lookup on the service date.
 */
export function checkYearBasis(trace: PricingTrace): void {
  const schedule = trace.steps.fee_schedule;
  if (schedule === null) {
    return;
  }
  const label = trace.terms?.percent_of_medicare?.year_basis;
  const agrees =
    (schedule.year_basis === 'CURRENT' && schedule.lookup === 'in_force_on_service_date') ||
    (schedule.year_basis === `LOCKED:${String(schedule.basis_year)}` && schedule.lookup === 'latest_in_basis_year');
  if (!agrees || label !== schedule.year_basis) {
    throw new ExplainShapeError('the year basis disagrees with the fee schedule’s lookup');
  }
}

/**
 * The worksheet a line's fee schedule is in: the SHA-256s of its RVU, locality (and ZIP+4), GPCI and
 * conversion-factor records, with the setting, the percentage, the lookup and its year, the practice ZIP and ZIP+4 and
 * the citation. Null for a line without a complete fee schedule (fixed, per visit, or stopped in it).
 */
export function worksheetKeyOf(trace: PricingTrace, citation: ExplainCitation): string | null {
  const schedule = trace.steps.fee_schedule;
  if (schedule === null || schedule.unit_cents === null || schedule.rvu === null || schedule.locality === null || schedule.gpci === null || schedule.conversion_factor === null || schedule.setting === null) {
    return null;
  }
  const plusFour = schedule.locality.plus_four;
  const cited = citation === null ? 'none' : citation.kind === 'contract' ? `page ${String(citation.page)}` : `regulation ${citation.reference}`;
  return [
    schedule.rvu.record.sha256,
    schedule.locality.record.sha256,
    plusFour?.record.sha256 ?? '',
    plusFour?.zip_plus_four ?? '',
    schedule.gpci.record.sha256,
    schedule.conversion_factor.record.sha256,
    schedule.setting,
    schedule.percentage,
    schedule.lookup,
    String(schedule.basis_year),
    trace.settings.zip,
    cited,
  ].join('|');
}

// ---------------------------------------------------------------------------------------------------
// Shared parts

const dated = (words: Words) => words.audience === 'internal';

/** Who locks a fee-schedule year: the rate record, or, as the payer reads it, the contract. */
export const lockedBy = (audience: Audience) => (audience === 'payer' ? 'the contract' : 'the rate record');

/** "claim line 2", and "(row 3)" beside it when that line is a row of the packet. */
function claimLine(words: Words, lineNo: number, slotted: Part): Part[] {
  const row = words.options.rowsOfClaim?.get(lineNo);
  return ['claim line ', slotted, row === undefined ? null : [' (row ', label(row, 'row'), ')']];
}

/** Under what the line is priced: the contract's clause on its page, or the regulation. */
function cited(words: Words): Part {
  if (words.citation === null) {
    return null;
  }
  return words.citation.kind === 'contract' ? [' under the contract’s clause on page ', figure(words, 'summary.page', 'verbatim')] : [' under ', figure(words, 'summary.reference', 'verbatim')];
}

function adjustmentIndex(trace: PricingTrace, name: TraceAdjustment['name']): number {
  return trace.steps.adjustments.findIndex((adjustment) => adjustment.name === name);
}

/** "1 unit" or "2 units": chosen by the units text's equality with "1", never by arithmetic. */
const unitsWord = (units: string) => (units === '1' ? ' unit' : ' units');

// ---------------------------------------------------------------------------------------------------
// The summary

function summary(words: Words): Sentence {
  const { trace } = words;
  const { outcome } = trace;
  if (outcome.result === 'unpriced') {
    return outcome.reason === 'SECONDARY_PAYER' ? say('Not priced: ', secondaryStatus(words, 'summary.claim_status'), '.') : say('Not priced: ', quoted(UNPRICED_MEANING[outcome.reason]), '.');
  }
  const { units, per_visit: perVisit, adjustments, variance_cents: variance } = trace.steps;
  if (units === null || variance === null) {
    throw new ExplainShapeError('a priced line has its units and variance');
  }
  const clause = cited(words);
  let base: Part[];
  if (perVisit !== null) {
    base =
      perVisit.carrier_line_no === trace.line.line_no
        ? [figure(words, 'summary.visit_amount', 'dollars'), ' once for the visit', clause]
        : ['The visit’s amount is carried by ', claimLine(words, perVisit.carrier_line_no, figure(words, 'summary.carrier_line', 'verbatim')), '; this line’s base is ', figure(words, 'summary.visit_base', 'exact_dollars'), clause];
  } else if (units.charge_cents !== null) {
    base = ['Lesser of the schedule ', figure(words, 'summary.schedule', 'exact_dollars'), ' and the line charge ', figure(words, 'summary.charge', 'dollars'), ': ', figure(words, 'summary.base', 'exact_dollars'), clause];
  } else {
    base = [figure(words, 'summary.units', 'verbatim'), unitsWord(units.units), ' × ', figure(words, 'summary.unit', 'exact_dollars'), ' = ', figure(words, 'summary.schedule', 'exact_dollars'), clause];
  }
  const after = adjustments.map((adjustment, index) => ['; after ', ADJUSTMENT_TEXT[adjustment.name], ' ', figure(words, 'summary.after', 'exact_dollars', [index])]);
  return say(base, after, '; rounded once to ', figure(words, 'summary.rounded', 'dollars'), '; observed allowed ', figure(words, 'summary.observed', 'dollars'), '; ', varianceWords(words, variance, 'summary.variance'), '.');
}

/** The variance's words: short, none, or overpaid (its text signed as the trace holds it; never negated here). */
function varianceWords(words: Words, variance: string, slot: 'summary.variance' | 'observed.variance'): Part {
  if (variance === '0') {
    return 'no variance';
  }
  if (variance.startsWith('-')) {
    return ['variance ', figure(words, slot, 'dollars'), ' (overpaid: recorded, never pursued)'];
  }
  return ['short ', figure(words, slot, 'dollars')];
}

function quoted(text: string): Part {
  return { quoted: text, from: 'unpriced_reasons' };
}

/** A secondary claim's status in words, from the trace (finding m3): "claim status 20 (processed as secondary and forwarded to another payer)". */
function secondaryStatus(words: Words, slot: 'summary.claim_status' | 'outcome.claim_status'): Part {
  return ['claim status ', figure(words, slot, 'verbatim'), ' (', wordsOf(SECONDARY_STATUS_TEXT, words.trace.claim.claim_status_code, 'claim status'), ')'];
}

// ---------------------------------------------------------------------------------------------------
// The steps

const STEP_WORDS: Readonly<Record<StepKind, (words: Words) => StepResult>> = {
  agreement: agreementStep,
  terms: termsStep,
  fee_schedule: feeScheduleStep,
  units: unitsStep,
  per_visit: perVisitStep,
  ncci_ptp: procedureToProcedureStep,
  mppr: mpprStep,
  assistant_reduction: assistantStep,
  sequestration: sequestrationStep,
  contract_adjustment: contractAdjustmentStep,
  patient_share: patientShareStep,
  rounding: roundingStep,
  observed: observedStep,
  window: windowStep,
  release: releaseStep,
  outcome: outcomeStep,
};

function agreementStep(words: Words): StepResult {
  const { agreement } = words.trace;
  if (agreement === null) {
    return NOT_REACHED;
  }
  switch (agreement.outcome) {
    case 'CONTRACT_RATE':
      return [
        say(
          'The plan’s mapping names a contract; its signed-off version prices this code by one rate record',
          words.citation?.kind === 'contract' ? [', cited on page ', figure(words, 'agreement.page', 'verbatim')] : null,
          '.',
        ),
      ];
    case 'MA_NONCONTRACTED':
      return [say('The plan is mapped as Medicare Advantage with no contract: priced at Original Medicare’s amount under ', figure(words, 'agreement.reference', 'verbatim'), '.')];
    case 'RESOLUTION_FAILED':
      return [say(AGREEMENT_FAILURE_TEXT.RESOLUTION_FAILED)];
    case 'AMBIGUOUS_RATE':
      return [say(quoted(UNPRICED_MEANING.AMBIGUOUS_RATE), '.'), say('Rate records that match: ', figure(words, 'agreement.matching', 'count'), '.')];
    case 'NO_MAPPING':
    case 'NO_AGREEMENT':
    case 'DATE_OUTSIDE_VERSIONS':
    case 'NO_RATE_FOR_CODE':
      return [say(quoted(UNPRICED_MEANING[agreement.outcome satisfies UnpricedReason]), '.')];
  }
}

function termsStep(words: Words): StepResult {
  const { terms } = words.trace;
  if (terms === null) {
    return NOT_REACHED;
  }
  const sentences = [methodSentence(words, terms)];
  if (words.audience === 'payer') {
    return sentences;
  }
  const adjustment = terms.contract_adjustment;
  if (adjustment !== null) {
    sentences.push(
      adjustment.kind === 'PERCENT'
        ? say('The rate record pays ', figure(words, 'terms.adjustment_percent', 'percent'), ' of the amount after the Medicare reductions.')
        : say('The rate record caps the line at ', figure(words, 'terms.adjustment_cap', 'dollars'), '.'),
    );
  }
  const { flags } = terms;
  const named = (['apply_mppr', 'apply_assistant_reduction', 'apply_sequestration', 'apply_ncci'] as const).map((flag) => ({ on: flags[flag], words: FLAG_TEXT[flag] }));
  const on = named.filter((flag) => flag.on).map((flag) => flag.words);
  const off = named.filter((flag) => !flag.on).map((flag) => flag.words);
  if (on.length !== 0) {
    sentences.push(
      words.medicare
        ? say('Medicare’s reductions apply to a non-contracted Medicare Advantage line under ', figure(words, 'terms.reference', 'verbatim'), ': ', listOf(on), '.')
        : say('Applied, as the rate record’s flags are on: ', listOf(on), '.'),
    );
  }
  if (off.length !== 0) {
    sentences.push(say('Not applied (flag off): ', listOf(off), '.'));
  }
  sentences.push(say(wordsOf(words.medicare ? MEDICARE_TIMED_UNITS_TEXT : TIMED_UNITS_TEXT, flags.timed_units_rule, 'timed-units rule')));
  return sentences;
}

function methodSentence(words: Words, terms: NonNullable<PricingTrace['terms']>): Sentence {
  if (words.medicare) {
    return say(METHOD_TEXT.MA_NONCONTRACTED, ': ', percentSchedule(words, terms, 'medicare'), ', with Medicare’s reductions, under ', figure(words, 'terms.reference', 'verbatim'), '.');
  }
  switch (terms.method) {
    case 'FIXED_SCHEDULE':
      return say(METHOD_TEXT.FIXED_SCHEDULE, ': ', figure(words, 'terms.fixed_amount', 'dollars'), ' per unit.');
    case 'PER_VISIT':
      return say(METHOD_TEXT.PER_VISIT, ': ', figure(words, 'terms.fixed_amount', 'dollars'), ' per visit.');
    case 'PERCENT_OF_MEDICARE':
      return say(METHOD_TEXT.PERCENT_OF_MEDICARE, ': ', percentSchedule(words, terms, 'contract'), '.');
    case 'LESSER_OF': {
      const schedule = terms.lesser_of?.schedule_method === 'FIXED_SCHEDULE' ? ['a fixed schedule of ', figure(words, 'terms.fixed_amount', 'dollars'), ' per unit'] : percentSchedule(words, terms, 'contract');
      return say(METHOD_TEXT.LESSER_OF, ' the line charge and ', schedule, '.');
    }
    case 'UNSUPPORTED':
      return say('The rate record’s method is one the engine does not price.');
    default:
      throw new ExplainWordsError('method');
  }
}

/** "110% of the Medicare physician fee schedule, the records in force on the service date, the practice's locality, with the conversion factor ..." */
function percentSchedule(words: Words, terms: NonNullable<PricingTrace['terms']>, of: 'contract' | 'medicare'): Part[] {
  const schedule = terms.percent_of_medicare;
  if (schedule === null) {
    throw new ExplainShapeError('a percent-of-Medicare term has its schedule');
  }
  const lookup = words.trace.steps.fee_schedule?.lookup ?? null;
  const year: Part =
    lookup === null ? null : lookup === 'in_force_on_service_date' ? ', the records in force on the service date' : [', locked to ', figure(words, 'terms.basis_year', 'verbatim'), ', the latest records in force during that year'];
  const head = [figure(words, 'terms.percentage', 'percent'), ' of the Medicare physician fee schedule', year];
  if (of === 'medicare') {
    return [head, ', the practice’s locality'];
  }
  const basis = schedule.locality_basis;
  const locality: Part =
    basis.kind === 'PRACTICE' ? 'the practice’s locality' : ['carrier ', figure(words, 'terms.named_carrier', 'verbatim'), ' locality ', figure(words, 'terms.named_locality', 'verbatim'), ', as the rate record names it'];
  return [head, ', ', locality, ', with the conversion factor ', wordsOf(APPLICABILITY_TEXT, schedule.conversion_factor, 'conversion factor applicability')];
}

function feeScheduleStep(words: Words): StepResult {
  const { trace } = words;
  const schedule = trace.steps.fee_schedule;
  if (schedule === null) {
    return trace.terms?.percent_of_medicare === null || trace.terms === null ? null : NOT_REACHED;
  }
  if (words.audience === 'payer' && words.options.worksheet !== undefined && worksheetKeyOf(trace, words.citation) !== null) {
    return [say('See fee schedule worksheet ', label(words.options.worksheet, 'worksheet'), '.')];
  }
  const year = figure(words, 'fee_schedule.basis_year', 'verbatim');
  const sentences = [
    schedule.lookup === 'latest_in_basis_year'
      ? say('Fee schedule: the latest records in force during ', year, ', the year ', lockedBy(words.audience), ' locks.')
      : say('Fee schedule: the ', year, ' records in force on ', dated(words) ? figure(words, 'fee_schedule.service_date', 'verbatim') : 'the service date', '.'),
  ];
  if (schedule.setting !== null) {
    const setting = SETTING_TEXT[schedule.setting];
    sentences.push(
      say('Code ', figure(words, 'fee_schedule.code', 'verbatim'), ' at the ', setting, ' rate: place of service ', figure(words, 'fee_schedule.place_of_service', 'verbatim'), ' is ', setting, ' in the practice’s settings.'),
    );
  }
  const { locality } = schedule;
  if (locality !== null) {
    const zip = figure(words, 'fee_schedule.zip', 'verbatim');
    if (locality.plus_four !== undefined) {
      sentences.push(
        say(
          'Locality: practice ZIP ',
          zip,
          ' needs its ZIP+4: ',
          figure(words, 'fee_schedule.zip_plus_four', 'verbatim'),
          ' falls in ',
          figure(words, 'fee_schedule.plus_four_from', 'verbatim'),
          ' to ',
          figure(words, 'fee_schedule.plus_four_to', 'verbatim'),
          ', carrier ',
          figure(words, 'fee_schedule.plus_four_carrier', 'verbatim'),
          ', locality ',
          figure(words, 'fee_schedule.plus_four_locality', 'verbatim'),
          '.',
        ),
      );
    } else if (locality.plus_four_required === true) {
      sentences.push(say('Locality: practice ZIP ', zip, ' needs its ZIP+4 to name a Medicare locality.'));
    } else {
      sentences.push(say('Locality: practice ZIP ', zip, ' is Medicare carrier ', figure(words, 'fee_schedule.carrier', 'verbatim'), ', locality ', figure(words, 'fee_schedule.locality', 'verbatim'), '.'));
    }
  }
  return sentences;
}

function unitsStep(words: Words): StepResult {
  const { trace } = words;
  const units = trace.steps.units;
  if (units === null) {
    return NOT_REACHED;
  }
  const sentences = [say(figure(words, 'units.units', 'verbatim'), unitsWord(units.units), ' billed, taken as billed.')];
  const { mue } = units;
  if (!mue.checked) {
    sentences.push(say('MUE not checked (flag off).'));
  } else if (mue.value === null) {
    sentences.push(
      dated(words)
        ? say('No MUE is in force for code ', figure(words, 'units.mue_code', 'verbatim'), ' on ', figure(words, 'units.service_date', 'verbatim'), '.')
        : say('No MUE is in force for the code on the service date.'),
    );
  } else {
    const exceeded = trace.outcome.result === 'unpriced' && trace.outcome.reason === 'MUE_EXCEEDED';
    sentences.push(say('The MUE for code ', figure(words, 'units.mue_code', 'verbatim'), ' is ', figure(words, 'units.mue_value', 'verbatim'), exceeded ? '; the units are above it.' : '; the units are within it.'));
  }
  if (units.schedule_cents === null) {
    sentences.push(say(figure(words, 'units.unit', 'exact_dollars'), ' per visit; units do not multiply it.'));
  } else if (units.charge_cents !== null) {
    sentences.push(say('Lesser of the schedule ', figure(words, 'units.schedule', 'exact_dollars'), ' and the line charge ', figure(words, 'units.charge', 'dollars'), ': ', figure(words, 'units.base', 'exact_dollars'), '.'));
  } else {
    sentences.push(say(figure(words, 'units.units', 'verbatim'), ' × ', figure(words, 'units.unit', 'exact_dollars'), ' = ', figure(words, 'units.schedule', 'exact_dollars'), '.'));
  }
  return sentences;
}

function perVisitStep(words: Words): StepResult {
  const { trace } = words;
  const visit = trace.steps.per_visit;
  if (visit === null) {
    return trace.terms?.method === 'PER_VISIT' ? NOT_REACHED : null;
  }
  const carrier = claimLine(words, visit.carrier_line_no, figure(words, 'per_visit.carrier_line', 'verbatim'));
  if (visit.carrier_line_no === trace.line.line_no) {
    const lines = visit.visit_line_nos.map((lineNo, index) => claimLine(words, lineNo, figure(words, 'per_visit.visit_line', 'verbatim', [index])));
    return [say(figure(words, 'per_visit.amount', 'dollars'), ' once for the visit, carried by this line (', carrier, '); the visit’s lines are ', listOf(lines), '.')];
  }
  return [say('The visit’s ', figure(words, 'per_visit.amount', 'dollars'), ' is carried by ', carrier, '; this line’s base is ', figure(words, 'per_visit.base', 'exact_dollars'), '.')];
}

/** A modifier that bypasses a procedure-to-procedure edit whose indicator allows it: 59, or an X modifier. */
const bypasses = (modifier: string) => modifier === '59' || modifier.startsWith('X');

function procedureToProcedureStep(words: Words): StepResult {
  const { trace } = words;
  if (trace.terms === null) {
    return null;
  }
  if (!trace.terms.flags.apply_ncci) {
    return [say('NCCI edits not checked (flag off).')];
  }
  const ptp = trace.steps.ncci_ptp;
  if (ptp === null) {
    return NOT_REACHED;
  }
  if (ptp.edits.length === 0) {
    return [say('No NCCI edit pairs this code with another line of the claim on its date.')];
  }
  return ptp.edits.map((edit, index) => {
    const column1 = ['Claim line ', figure(words, 'ncci_ptp.column1_line', 'verbatim', [index]), '’s code ', figure(words, 'ncci_ptp.column1_code', 'verbatim', [index]), ' is the first-column code of an NCCI edit with this code'];
    if (!edit.bypassed) {
      return say(column1, ': the edit stands. It is a review flag and does not change the amount.');
    }
    const own = trace.line.modifiers.findIndex(bypasses);
    const other = edit.column1_modifiers.findIndex(bypasses);
    const modifier =
      own !== -1
        ? [figure(words, 'ncci_ptp.line_modifier', 'verbatim', [own]), ' on ', claimLine(words, trace.line.line_no, figure(words, 'ncci_ptp.own_line', 'verbatim'))]
        : other !== -1
          ? [figure(words, 'ncci_ptp.column1_modifier', 'verbatim', [index, other]), ' on ', claimLine(words, edit.column1_line_no, figure(words, 'ncci_ptp.column1_line', 'verbatim', [index]))]
          : null;
    if (modifier === null) {
      throw new ExplainShapeError('a bypassed edit has a bypassing modifier');
    }
    return say(column1, ': bypassed by modifier ', modifier, ', as the edit’s modifier indicator is ', figure(words, 'ncci_ptp.indicator', 'verbatim', [index]), '.');
  });
}

/** An adjustment step: left out when its flag is off, not reached when its flag is on and the line stopped before it. */
function adjustmentStep(words: Words, name: TraceAdjustment['name'], on: (terms: NonNullable<PricingTrace['terms']>) => boolean, sentences: (index: number) => Sentence[]): StepResult {
  const { terms } = words.trace;
  if (terms === null || !on(terms)) {
    return null;
  }
  const index = adjustmentIndex(words.trace, name);
  return index === -1 ? NOT_REACHED : sentences(index);
}

function mpprStep(words: Words): StepResult {
  return adjustmentStep(
    words,
    'mppr',
    (terms) => terms.flags.apply_mppr,
    (index) => {
      const mppr = words.trace.steps.adjustments[index] as Extract<TraceAdjustment, { name: 'mppr' }>;
      const at = [index];
      const before = figure(words, 'mppr.before', 'exact_dollars', at);
      if (!mppr.in_pool) {
        return [say('The multiple procedure payment reduction does not apply to this code (it is not an always-therapy code); ', before, ' is unchanged.')];
      }
      const first = mppr.ranking[0];
      if (first === undefined) {
        throw new ExplainShapeError('a reduction in the pool ranks its units');
      }
      const firstPe = figure(words, 'mppr.first_pe', 'exact_dollars', [index, 0]);
      if (mppr.reductions.length === 0) {
        return [say('This line’s unit holds the highest practice-expense part of the claim’s day (', firstPe, ') and is kept whole; ', before, ' is unchanged.')];
      }
      const day: Part = dated(words) ? [' (', figure(words, 'mppr.service_date', 'verbatim', at), ')'] : null;
      const holder = first.line_no === words.trace.line.line_no ? 'this line’s' : [claimLine(words, first.line_no, figure(words, 'mppr.first_line', 'verbatim', [index, 0])), '’s'];
      const share = mppr.general_record === null ? ' (the code’s own reduction)' : ' (the general practice-expense reduction)';
      const cuts = mppr.reductions.map((_, cut) => [
        'unit ',
        figure(words, 'mppr.cut_unit', 'verbatim', [index, cut]),
        ' (rank ',
        figure(words, 'mppr.cut_rank', 'verbatim', [index, cut]),
        ') loses ',
        figure(words, 'mppr.cut', 'exact_dollars', [index, cut]),
      ]);
      return [
        say('Ranked by practice-expense part on the claim’s day', day, ', the first unit is ', holder, ' (', firstPe, ').'),
        say('Each later unit loses ', figure(words, 'mppr.percent', 'percent', at), ' of its practice-expense part', share, ': ', cuts.flatMap((cut, i) => (i === 0 ? cut : ['; ', ...cut])), '.'),
        say(before, ' becomes ', figure(words, 'mppr.after', 'exact_dollars', at), '.'),
      ];
    },
  );
}

/** A therapy-assistant modifier as its code segment; a modifier the words do not name is refused. */
function assistantModifier(modifier: string): Part {
  if (modifier !== 'CQ' && modifier !== 'CO') {
    throw new ExplainWordsError('assistant modifier');
  }
  return { code: modifier };
}

function assistantStep(words: Words): StepResult {
  return adjustmentStep(
    words,
    'assistant_reduction',
    (terms) => terms.flags.apply_assistant_reduction,
    (index) => {
      const assistant = words.trace.steps.adjustments[index] as Extract<TraceAdjustment, { name: 'assistant_reduction' }>;
      const at = [index];
      const before = figure(words, 'assistant.before', 'exact_dollars', at);
      const [first, second] = assistant.records;
      if (first === undefined) {
        return [say('No modifier for services by a therapy assistant (CQ or CO) is on the line: no reduction; ', before, ' is unchanged.')];
      }
      const percent = figure(words, 'assistant.percent', 'percent', [index, 0]);
      const pays = words.audience === 'payer' ? ['Medicare’s assistant percentage is ', percent, ' of the amount.'] : ['the release pays ', percent, ' of the amount.'];
      const head: Part =
        second === undefined
          ? ['Modifier ', assistantModifier(first.modifier), ' (services by a therapy assistant): ']
          : ['Modifiers ', assistantModifier(first.modifier), ' and ', assistantModifier(second.modifier), ' (services by a therapy assistant): one reduction, as their percentages agree: '];
      return [say(head, pays), say(before, ' becomes ', figure(words, 'assistant.after', 'exact_dollars', at), '.')];
    },
  );
}

function sequestrationStep(words: Words): StepResult {
  return adjustmentStep(
    words,
    'sequestration',
    (terms) => terms.flags.apply_sequestration,
    (index) => {
      const sequestration = words.trace.steps.adjustments[index] as Extract<TraceAdjustment, { name: 'sequestration' }>;
      const at = [index];
      const before = figure(words, 'sequestration.before', 'exact_dollars', at);
      if (sequestration.suspended) {
        const record = words.audience === 'payer' ? 'Medicare’s sequestration record' : 'the release’s record';
        return [say('Sequestration is suspended on the service date in ', record, ': no cut. ', before, ' is unchanged.')];
      }
      const patientShare = figure(words, 'sequestration.patient_share', 'dollars', at);
      if (sequestration.payer_share_cents === '0') {
        return [say('Sequestration: the patient share ', patientShare, ' leaves no payer’s share, so nothing is withheld; ', before, ' is unchanged.')];
      }
      return [
        say(
          'Sequestration: the payer’s share is ',
          before,
          ' less the patient share ',
          patientShare,
          ', which is ',
          figure(words, 'sequestration.payer_share', 'exact_dollars', at),
          '; ',
          figure(words, 'sequestration.percent', 'percent', at),
          ' of it, ',
          figure(words, 'sequestration.cut', 'exact_dollars', at),
          ', is withheld.',
        ),
        say(figure(words, 'sequestration.before', 'exact_dollars', at), ' becomes ', figure(words, 'sequestration.after', 'exact_dollars', at), '.'),
      ];
    },
  );
}

function contractAdjustmentStep(words: Words): StepResult {
  return adjustmentStep(
    words,
    'contract_adjustment',
    (terms) => terms.contract_adjustment !== null,
    (index) => {
      const adjustment = words.trace.steps.adjustments[index] as Extract<TraceAdjustment, { name: 'contract_adjustment' }>;
      const at = [index];
      const who = words.audience === 'payer' ? 'The contract' : 'The rate record';
      const before = figure(words, 'contract_adjustment.before', 'exact_dollars', at);
      const after = figure(words, 'contract_adjustment.after', 'exact_dollars', at);
      if (adjustment.kind === 'PERCENT') {
        return [say(who, ' pays ', figure(words, 'contract_adjustment.percent', 'percent', at), ' of the amount: ', before, ' becomes ', after, '.')];
      }
      const cap = figure(words, 'contract_adjustment.cap', 'dollars', at);
      return adjustment.before_cents === adjustment.after_cents
        ? [say(who, ' caps the line at ', cap, '; ', before, ' is within it and unchanged.')]
        : [say(who, ' caps the line at ', cap, ': ', before, ' becomes ', after, '.')];
    },
  );
}

function patientShareStep(words: Words): StepResult {
  const { trace } = words;
  if (trace.steps.patient_share_cents === null) {
    return NOT_REACHED;
  }
  const adjustments =
    words.audience === 'payer' || trace.line.patient_share_adjustments.length === 0
      ? null
      : [
          ' (',
          listOf(
            trace.line.patient_share_adjustments.map((_, index) => [
              figure(words, 'patient_share.group', 'verbatim', [index]),
              ' ',
              figure(words, 'patient_share.reason', 'verbatim', [index]),
              ' ',
              figure(words, 'patient_share.adjustment', 'dollars', [index]),
            ]),
          ),
          ')',
        ];
  return [say('Patient share ', figure(words, 'patient_share.amount', 'dollars'), adjustments, ', reported beside the expected amount and never subtracted from it.')];
}

function roundingStep(words: Words): StepResult {
  const { rounding } = words.trace.steps;
  if (rounding === null) {
    return NOT_REACHED;
  }
  const origins = words.medicare ? MEDICARE_ROUNDING_ORIGIN_TEXT : words.audience === 'payer' ? PAYER_ROUNDING_ORIGIN_TEXT : ROUNDING_ORIGIN_TEXT;
  return [
    say(
      'Rounded once, ',
      ROUNDING_TEXT[rounding.rule],
      ', under ',
      origins[rounding.origin],
      ': ',
      figure(words, 'rounding.unrounded', 'exact_dollars'),
      ' becomes ',
      figure(words, 'rounding.rounded', 'dollars'),
      '. The unrounded amount is kept beside it.',
    ),
  ];
}

function observedStep(words: Words): StepResult {
  const { trace } = words;
  const basis = wordsOf(words.audience === 'payer' ? PAYER_OBSERVED_BASIS_TEXT : OBSERVED_BASIS_TEXT, trace.line.observed_allowed_basis, 'observed allowed basis');
  const sentences = [say('Observed allowed ', figure(words, 'observed.observed', 'dollars'), ', ', basis, '.')];
  const variance = trace.steps.variance_cents;
  if (trace.outcome.result === 'priced' && variance !== null) {
    sentences.push(say('Expected ', figure(words, 'observed.expected', 'dollars'), ', observed allowed ', figure(words, 'observed.observed', 'dollars'), ': ', varianceWords(words, variance, 'observed.variance'), '.'));
  }
  return sentences;
}

function windowStep(words: Words): StepResult {
  const { window } = words.trace.steps;
  if (window === null) {
    return NOT_REACHED;
  }
  if (window.status === 'NO_WINDOW') {
    return [say('No dispute window applies to this line.')];
  }
  if (window.length === null || window.unit === null || window.measured_from === null || window.source === null) {
    throw new ExplainShapeError('a dispute window has its length, unit, start and source');
  }
  const unit = String(window.length) === '1' ? WINDOW_UNIT_ONE_TEXT[window.unit] : WINDOW_UNIT_TEXT[window.unit];
  const head = ['Dispute window: ', figure(words, 'window.length', 'verbatim'), ' ', unit, ' from the ', WINDOW_START_TEXT[window.measured_from]];
  const source = [', under ', WINDOW_SOURCE_TEXT[window.source]];
  if (!dated(words)) {
    return [say(head, source, '.')];
  }
  return [
    say(
      head,
      ' ',
      figure(words, 'window.from_date', 'verbatim'),
      source,
      '; it ends on ',
      figure(words, 'window.ends_on', 'verbatim'),
      '; on ',
      figure(words, 'window.as_of', 'verbatim'),
      ' it is ',
      WINDOW_STATUS_TEXT[window.status],
      '.',
    ),
  ];
}

function releaseStep(words: Words): StepResult {
  return [say('Priced under rule release ', figure(words, 'release.number', 'verbatim'), ' by engine ', figure(words, 'release.engine', 'verbatim'), '.')];
}

function outcomeStep(words: Words): StepResult {
  const { outcome } = words.trace;
  if (outcome.result === 'priced') {
    const flagged = outcome.review_flags.length !== 0 ? say('An NCCI edit stands: a review flag, which does not change the amount.') : null;
    return [say('Priced: ', figure(words, 'outcome.expected', 'dollars'), ' expected, ', figure(words, 'outcome.unrounded', 'exact_dollars'), ' before the one rounding.'), ...(flagged === null ? [] : [flagged])];
  }
  const sentences = [
    outcome.reason === 'SECONDARY_PAYER'
      ? say('Not priced: ', secondaryStatus(words, 'outcome.claim_status'), ', which this release does not price.')
      : say('Not priced: ', quoted(UNPRICED_MEANING[outcome.reason]), '.'),
  ];
  if (outcome.detail !== null) {
    sentences.push(say(DETAIL_TEXT[outcome.detail], '.'));
  }
  if (outcome.reason !== 'SECONDARY_PAYER') {
    sentences.push(say('The line stopped at ', STOP_STEP_TEXT[outcome.step], '.'));
  }
  sentences.push(say('Remedy: ', quoted(UNPRICED_REMEDY[outcome.reason]), '.'));
  return sentences;
}
