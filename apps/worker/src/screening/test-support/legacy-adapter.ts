/**
 * THE ORACLE (audit #53 part 2; docs/adr/0062, "The release read"; test matrix SCR-09): apps/worker/src/screening/adapter.ts
 * exactly as it was at commit 3c1b289, before the release was read by key and the pricer's memo made compact, frozen
 * here so the new path can be proved equal in output to the old one on the same inputs. Only the import paths differ
 * from that commit; nothing else may change. Imported by tests and by the capacity harness's oracle
 * (tools/screening-capacity/oracle.ts) only, never by the worker (apps/worker/src/screening/oracle-imports.test.ts).
 */

import { createHash } from 'node:crypto';

import { MA_NONCONTRACTED_TERMS, type PlanMappingRecord } from '@tp/contracts';
import { type Cents, type RoundedAmount, cents, decimal, roundOnce, subtractCents, unroundedCents } from '@tp/money';
import {
  type ClaimFacts,
  type IndexedRelease,
  type IsoDate,
  type LineFacts,
  type LinePricing,
  type PlaceOfServiceSetting,
  type PricedLine,
  type PricingTrace,
  type UnpricedReason,
  addDays,
  price,
} from '@tp/pricing';

import { type ScreeningPayerProduct, quarterDays } from '../format';

/**
 * The screening's pricing adapter (Change Order 001, CO-04; reconciliation-001 D19 a and D20 a; the owner's rulings
 * of 2026-10-18; docs/adr/0062): each priced row becomes a one-line claim the unchanged engine prices (price() from
 * @tp/pricing; nothing under packages/pricing changes), and the engine's figure for the line is multiplied by the
 * row's claim count here, outside the engine, in bigint.
 *
 * A row of medicare_ffs or ma_noncontracted prices as an MA non-contracted line: the agreement is
 * MA_NONCONTRACTED with @tp/contracts' MA_NONCONTRACTED_TERMS (Original Medicare's: 100% of the current year's fee
 * schedule at the practice's locality, the non-qualifying conversion factor, every adjustment on: the multiple
 * procedure reduction, the assistant reduction for CQ and CO, sequestration, and NCCI with its medically unlikely
 * edit), so Original Medicare's fee schedule prices medicare_ffs rows too. The flag defaults do not change. The
 * line's date is its band's first day; its charge and observed allowed are zero, since the row's allowed total is
 * compared here and the engine's variance is ignored.
 *
 * The figure is the engine's own amount before sequestration (the owner's ruling 2): a payer's allowed amount is
 * normally reported before sequestration, so the figure compared with it is read from the engine's trace, the
 * sequestration step's amount before it (nothing follows that step under these terms), and rounded once under the
 * rule the trace names, its unrounded value kept beside it. Sequestration is never worked out here; a priced trace
 * without that step stops the run.
 *
 * A one-line claim cannot show the reduction across a visit's codes (D19). For a row whose code the engine's trace
 * ranks in that reduction (the mppr adjustment's in_pool), the engine prices the row a second time, unchanged, as a
 * later procedure of a visit (the owner's ruling 1): a two-line claim whose first line is the row's own line with
 * one unit, so that unit ranks first (the engine breaks a tie in the practice-expense part by the lower line
 * number) and every unit of the row, the second line, is reduced. That line's figure before sequestration is the
 * fully reduced figure; the row's figure priced alone is the figure before the reduction across codes. Both are the
 * engine's, times the count. A row outside the pool keeps one figure.
 *
 * MA contracted and commercial rows are never priced (contract_required), and medicaid and other rows are not
 * screened; neither reaches this module. A row shows no figure (rates_change_in_band) when a trace names a rule
 * record that does not cover its whole band, or when the engine prices either of its lines differently (another
 * outcome, amount or set of records) on any day inside the band where a record of the release starts or the day after
 * one ends: those are engine calls too, one per such day.
 */

/** The fixed mapping every screening line resolves to: MA non-contracted, no contract, open-ended from 2000. */
export const SCREENING_MAPPING: PlanMappingRecord = Object.freeze({
  id: '5c7e0a52-9b1d-4f3e-8a26-0d4b6c1e9f70',
  planId: '7f1d3b2a-6c84-4e09-9d5a-2b8e4f6a1c03',
  kind: 'ma_noncontracted',
  contractVersionId: null,
  effectiveFrom: '2000-01-01',
  effectiveTo: null,
  supersedesId: null,
});

/** What pricing a run needs: its pinned release and the days its records change, the prospect's ZIP, the run's approved split and its date. */
export interface ScreeningPricingContext {
  readonly release: IndexedRelease;
  /** Every day on which a record of the release starts, or the day after one ends (releaseChangeDays()). */
  readonly changeDays: readonly IsoDate[];
  /** The prospect's five-digit ZIP (submit_screening refuses one whose locality needs its ZIP+4, which the engine cannot take). */
  readonly zip: string;
  readonly placeOfServiceSettings: Readonly<Record<string, PlaceOfServiceSetting>>;
  /** The run's creation date (UTC). */
  readonly asOf: IsoDate;
}

/** A row still to price, as operator_screening_rows() gives it. */
export interface PendingScreeningRow {
  readonly rowNo: number;
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly payerProduct: ScreeningPayerProduct;
  readonly serviceBand: string;
  readonly claimCount: number;
  readonly observedAllowedCents: Cents;
}

/** One of a row's figures: the engine's amount for one line before sequestration, rounded once, and it times the count. */
export interface ScreeningFigure {
  /** The engine's amount for one line before sequestration (its trace's), rounded once under the trace's rule. */
  readonly lineCents: Cents;
  /** Its unrounded value, as decimal text. */
  readonly lineUnrounded: string;
  /** The line amount times the claim count, in bigint. */
  readonly cents: Cents;
  /** That less the allowed total in the file. */
  readonly differenceCents: Cents;
  /** The SHA-256 of the engine's trace it was read from. */
  readonly traceSha256: string;
}

export type ScreeningRowOutcome =
  | {
      readonly disposition: 'priced';
      /** The engine's figure for one line priced alone, before sequestration, rounded once: before the reduction across codes. */
      readonly expectedLineCents: Cents;
      /** Its unrounded value, as decimal text. */
      readonly expectedLineUnrounded: string;
      /** The line amount times the claim count, in bigint. */
      readonly expectedCents: Cents;
      /** The expected amount less the allowed total in the file. */
      readonly differenceCents: Cents;
      /** The engine ranked the line's code in the reduction across a visit's codes (its trace's mppr in_pool). */
      readonly inReductionPool: boolean;
      readonly traceSha256: string;
      /** For a code in that reduction, the engine's figure for the row as a later procedure of a visit (fully reduced); null outside it. */
      readonly reduced: ScreeningFigure | null;
    }
  | { readonly disposition: 'unpriced'; readonly reason: UnpricedReason; readonly detail: string | null; readonly traceSha256: string }
  | { readonly disposition: 'rates_change_in_band'; readonly traceSha256: string };

/** The rows that price: medicare_ffs and ma_noncontracted. */
export function pricesAsMedicare(product: ScreeningPayerProduct): boolean {
  return product === 'medicare_ffs' || product === 'ma_noncontracted';
}

type ScreeningLineFacts = Pick<PendingScreeningRow, 'procedureCode' | 'modifiers' | 'units' | 'placeOfService' | 'serviceBand'>;

/** A row's line, as the engine reads it: numbered as given, the row's units unless others are given. */
function screeningLine(row: ScreeningLineFacts, lineNo: number, units: number = row.units): LineFacts {
  return {
    lineNo,
    serviceLineId: null,
    procedureCode: row.procedureCode,
    modifiers: [...row.modifiers].sort(),
    units: String(units),
    serviceDate: quarterDays(row.serviceBand).first,
    placeOfService: row.placeOfService,
    chargeCents: cents(0n),
    observedAllowedCents: cents(0n),
    observedAllowedBasis: 'paid_plus_pr',
    patientShareAdjustments: [],
    agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
  };
}

/** A row's one-line claim, as the engine reads it. */
export function screeningClaim(row: ScreeningLineFacts): ClaimFacts {
  return {
    claimStatusCode: '1',
    reversed: false,
    corrected: false,
    remittanceDate: null,
    payerPlanKey: null,
    lines: [screeningLine(row, 1)],
  };
}

/** The line of the later-procedure claim that is the row (screeningVisitClaim). */
export const LATER_PROCEDURE_LINE_NO = 2;

/**
 * A row as a later procedure of a visit, for a code in the reduction across codes (the owner's ruling 1): line 1 is
 * the row's own line with one unit, line 2 the row. Both units of the same code at the same place of service have
 * the same practice-expense part, so the engine ranks line 1's unit first (a tie goes to the lower line number) and
 * reduces every unit of line 2.
 */
export function screeningVisitClaim(row: ScreeningLineFacts): ClaimFacts {
  return { ...screeningClaim(row), lines: [screeningLine(row, 1, 1), screeningLine(row, LATER_PROCEDURE_LINE_NO)] };
}

/** The SHA-256 of a trace as JSON. */
export function traceSha256(trace: PricingTrace): string {
  return createHash('sha256').update(JSON.stringify(trace), 'utf8').digest('hex');
}

interface Ref {
  readonly record_type: string;
  readonly effective_from: string;
  readonly effective_to: string | null;
  readonly sha256: string;
}

function isRef(value: object): value is Ref {
  return 'record_type' in value && 'sha256' in value && 'effective_from' in value && 'effective_to' in value;
}

/** Every rule record the trace names, wherever it names one. */
export function traceRecords(trace: PricingTrace): Ref[] {
  const found: Ref[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (typeof value === 'object' && value !== null) {
      if (isRef(value)) {
        found.push(value);
        return;
      }
      Object.values(value).forEach(visit);
    }
  };
  visit(trace);
  return found;
}

/** Whether every record the trace names is in force for the band's whole quarter. */
export function coversBand(trace: PricingTrace, band: string): boolean {
  const { first, last } = quarterDays(band);
  return traceRecords(trace).every((ref) => ref.effective_from <= first && (ref.effective_to === null || ref.effective_to >= last));
}

/** Every day on which one of the records starts, or the day after one ends, in order, each once. */
export function releaseChangeDays(records: readonly { readonly effective_from: string; readonly effective_to: string | null }[]): IsoDate[] {
  const days = new Set<IsoDate>();
  for (const record of records) {
    days.add(record.effective_from);
    if (record.effective_to !== null) {
      days.add(addDays(record.effective_to, 1));
    }
  }
  return [...days].sort();
}

/** The days inside a band, after its first, on which a record of the release starts or the day after one ends. */
export function changeDaysInBand(changeDays: readonly IsoDate[], band: string): IsoDate[] {
  const { first, last } = quarterDays(band);
  return changeDays.filter((day) => day > first && day <= last);
}

/** Whether the trace's mppr adjustment ranked the line's code in the reduction across a visit's codes. */
export function inReductionPool(trace: PricingTrace): boolean {
  return trace.steps.adjustments.some((adjustment) => adjustment.name === 'mppr' && adjustment.in_pool);
}

/** Whether every unit of the line was reduced after another unit of its day: the trace's ranking puts another line's unit first and cuts each of the line's. */
export function reducedAsLaterProcedure(trace: PricingTrace): boolean {
  const units = Number.parseInt(trace.line.units, 10);
  return trace.steps.adjustments.some(
    (adjustment) =>
      adjustment.name === 'mppr' && adjustment.in_pool && adjustment.ranking[0] !== undefined && adjustment.ranking[0].line_no !== trace.line.line_no && adjustment.reductions.length === units,
  );
}

/**
 * The engine's amount for a priced line before sequestration (the owner's ruling 2), read from its trace: the
 * sequestration step's amount before it, rounded once under the rule the trace's rounding step names. Nothing is
 * worked out but that rounding: a trace without the step, or with an adjustment after it, is an error, never a
 * figure.
 */
export function beforeSequestration(line: PricedLine): RoundedAmount {
  const { adjustments, rounding } = line.trace.steps;
  const at = adjustments.findIndex((adjustment) => adjustment.name === 'sequestration');
  const step = adjustments[at];
  if (step === undefined || rounding === null) {
    throw new Error('the engine’s trace has no amount before sequestration');
  }
  if (at !== adjustments.length - 1) {
    throw new Error('the engine’s trace adjusts the amount after sequestration');
  }
  return roundOnce(unroundedCents(decimal(step.before_cents)), rounding.rule);
}

/** Whether two of the engine's results for one line on two days are the same: outcome, amount or reason, and the records named. */
export function samePricing(a: LinePricing, b: LinePricing): boolean {
  const records = (line: LinePricing) =>
    traceRecords(line.trace)
      .map((ref) => ref.sha256)
      .sort()
      .join(' ');
  if (a.outcome === 'priced' && b.outcome === 'priced') {
    return a.expectedAllowedCents === b.expectedAllowedCents && a.expectedUnroundedCents.equals(b.expectedUnroundedCents) && records(a) === records(b);
  }
  if (a.outcome === 'unpriced' && b.outcome === 'unpriced') {
    return a.reason === b.reason && a.detail === b.detail && records(a) === records(b);
  }
  return false;
}

/** One figure of a row: the engine's line before sequestration, times the count, less the allowed total. */
function figureOf(row: Pick<PendingScreeningRow, 'claimCount' | 'observedAllowedCents'>, line: PricedLine): ScreeningFigure {
  const amount = beforeSequestration(line);
  const total = cents(amount.cents * BigInt(row.claimCount));
  return {
    lineCents: amount.cents,
    lineUnrounded: amount.unrounded.toString(),
    cents: total,
    differenceCents: subtractCents(total, row.observedAllowedCents),
    traceSha256: traceSha256(line.trace),
  };
}

/**
 * What a row's pricing comes to, with its claim count and allowed total: `line` is the engine's one-line result,
 * `later` its result for the row as a later procedure of a visit (needed when the code is in the reduction across
 * codes), and `changesInBand` whether the engine priced either differently on a day inside the band where the
 * release's records change.
 */
export function screeningOutcome(
  row: Pick<PendingScreeningRow, 'serviceBand' | 'claimCount' | 'observedAllowedCents'>,
  line: LinePricing,
  changesInBand = false,
  later: LinePricing | null = null,
): ScreeningRowOutcome {
  const hash = traceSha256(line.trace);
  if (changesInBand) {
    return { disposition: 'rates_change_in_band', traceSha256: hash };
  }
  if (line.outcome === 'unpriced') {
    return { disposition: 'unpriced', reason: line.reason, detail: line.detail, traceSha256: hash };
  }
  const pooled = inReductionPool(line.trace);
  if (!coversBand(line.trace, row.serviceBand) || (pooled && later !== null && !coversBand(later.trace, row.serviceBand))) {
    return { disposition: 'rates_change_in_band', traceSha256: hash };
  }
  const alone = figureOf(row, line);
  let reduced: ScreeningFigure | null = null;
  if (pooled) {
    // The engine prices a pooled code as a later procedure whenever it prices it alone: anything else is an error, never a figure.
    if (later?.outcome !== 'priced' || later.lineNo !== LATER_PROCEDURE_LINE_NO || !reducedAsLaterProcedure(later.trace)) {
      throw new Error('the engine did not price the row as a later procedure of a visit');
    }
    reduced = figureOf(row, later);
    if (reduced.lineCents > alone.lineCents) {
      throw new Error('the engine priced the row higher as a later procedure than alone');
    }
  }
  return {
    disposition: 'priced',
    expectedLineCents: alone.lineCents,
    expectedLineUnrounded: alone.lineUnrounded,
    expectedCents: alone.cents,
    differenceCents: alone.differenceCents,
    inReductionPool: pooled,
    traceSha256: hash,
    reduced,
  };
}

/** The claim dated the day given, every line. */
function dated(claim: ClaimFacts, serviceDate: IsoDate | undefined): ClaimFacts {
  return serviceDate === undefined ? claim : { ...claim, lines: claim.lines.map((line) => ({ ...line, serviceDate })) };
}

function priceClaim(context: ScreeningPricingContext, claim: ClaimFacts): LinePricing[] {
  return price({
    claim,
    release: context.release,
    settings: { zip: context.zip, defaultRounding: null, placeOfServiceSettings: context.placeOfServiceSettings },
    asOf: context.asOf,
  });
}

/** The engine's one line for a row, dated its band's first day or the day given: the claim's only result. */
export function priceScreeningLine(context: ScreeningPricingContext, row: ScreeningLineFacts, serviceDate?: IsoDate): LinePricing {
  const [line] = priceClaim(context, dated(screeningClaim(row), serviceDate));
  if (line === undefined) {
    throw new Error('the engine priced no line of a one-line claim');
  }
  return line;
}

/** The engine's result for the row as a later procedure of a visit (screeningVisitClaim's second line), dated its band's first day or the day given. */
export function priceScreeningLaterProcedure(context: ScreeningPricingContext, row: ScreeningLineFacts, serviceDate?: IsoDate): LinePricing {
  const line = priceClaim(context, dated(screeningVisitClaim(row), serviceDate)).find((result) => result.lineNo === LATER_PROCEDURE_LINE_NO);
  if (line === undefined) {
    throw new Error('the engine priced no second line of a two-line claim');
  }
  return line;
}

interface PricedLines {
  readonly line: LinePricing;
  readonly later: LinePricing | null;
  readonly changesInBand: boolean;
}

/**
 * Prices a run's rows, the engine once per distinct line (code, modifiers, units, place of service and band: both
 * priced products price under the same terms), once more for a code in the reduction across codes (the row as a
 * later procedure of a visit), and again for each day inside the band where the release's records change, each
 * row's outcome from its own count and total.
 */
export class ScreeningPricer {
  private readonly lines = new Map<string, PricedLines>();

  constructor(private readonly context: ScreeningPricingContext) {}

  /** How many distinct lines the engine has priced. */
  get priced(): number {
    return this.lines.size;
  }

  outcome(row: PendingScreeningRow): ScreeningRowOutcome {
    if (!pricesAsMedicare(row.payerProduct)) {
      throw new RangeError('only medicare_ffs and ma_noncontracted rows are priced');
    }
    const key = [row.procedureCode, [...row.modifiers].sort().join(' '), String(row.units), row.placeOfService, row.serviceBand].join('\t');
    let priced = this.lines.get(key);
    if (priced === undefined) {
      const line = priceScreeningLine(this.context, row);
      const later = line.outcome === 'priced' && inReductionPool(line.trace) ? priceScreeningLaterProcedure(this.context, row) : null;
      const changesInBand = changeDaysInBand(this.context.changeDays, row.serviceBand).some(
        (day) => !samePricing(line, priceScreeningLine(this.context, row, day)) || (later !== null && !samePricing(later, priceScreeningLaterProcedure(this.context, row, day))),
      );
      priced = { line, later, changesInBand };
      this.lines.set(key, priced);
    }
    return screeningOutcome(row, priced.line, priced.changesInBand, priced.later);
  }
}
