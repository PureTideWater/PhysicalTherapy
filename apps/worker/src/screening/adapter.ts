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

import { ReleaseReadOutsideFetch, type ReleaseViolation } from '../price/keyed-release';
import { type ScreeningPayerProduct, quarterDays } from './format';

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
 *
 * The release is read by key (audit #53 part 2; docs/adr/0062, "The release read"): the job gives the engine a view
 * that serves only the keys the database fetched for the run (apps/worker/src/price/keyed-release.ts) and the codes it
 * fetched them for. A row whose code is not among them throws ReleaseKeysMismatch before the engine sees it, and every
 * engine call is followed by a check of the view's violation, which throws ReleaseReadOutsideFetch outside the engine
 * (inside it, any throw becomes a row priced ENGINE_ERROR). Either fails the run before its batch is recorded.
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

/** What pricing a run needs: its pinned release and the days its records change, the prospect's ZIP and ZIP+4, the run's approved split and its date. */
export interface ScreeningPricingContext {
  readonly release: IndexedRelease;
  /** Every day on which a record of the release starts, or the day after one ends (releaseChangeDays()). */
  readonly changeDays: readonly IsoDate[];
  /** The prospect's five-digit ZIP. */
  readonly zip: string;
  /**
   * The prospect's ZIP+4, kept only when the ZIP's locality_map record needs it (submit_screening refuses such a ZIP
   * without one, and one its ZIP+4 list does not hold; docs/adr/0064); null otherwise. The engine reads it only then.
   */
  readonly zipPlusFour: string | null;
  readonly placeOfServiceSettings: Readonly<Record<string, PlaceOfServiceSetting>>;
  /** The run's creation date (UTC). */
  readonly asOf: IsoDate;
  /** The keys the release was read by (keyed-release.ts): checked before each row and after every engine call. Tests that index a whole release leave it out. */
  readonly read?: ScreeningReleaseRead;
}

/** How the run's release was read: the codes the database fetched keyed records for, and the view's first lookup outside them. */
export interface ScreeningReleaseRead {
  /** The run's distinct priced codes, as operator_screening_run_keys() returned them. */
  readonly codes: ReadonlySet<string>;
  readonly view: { readonly violation: ReleaseViolation | null };
}

/** A row whose code is not among the codes the run's records were fetched for (RELEASE_READ_OUTSIDE_FETCH). */
export class ReleaseKeysMismatch extends Error {
  override readonly name = 'ReleaseKeysMismatch';
  readonly code = 'RELEASE_READ_OUTSIDE_FETCH';

  constructor() {
    super('a row’s code is not among the codes the run’s release records were read for');
  }
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

/** One of a distinct line's figures before its row's count and total: the engine's line amount before sequestration and its trace's hash. */
export interface ScreeningLineFigure {
  readonly lineCents: Cents;
  readonly lineUnrounded: string;
  readonly traceSha256: string;
}

/**
 * What a distinct line's pricing comes to before any row's count and allowed total (the pricer's compact memo): the
 * disposition, the figures for one line alone and fully reduced, whether the code is in the reduction across codes,
 * the reason, and the traces' SHA-256s, each computed once. No trace is kept.
 */
export type ScreeningLineOutcome =
  | {
      readonly disposition: 'priced';
      readonly expectedLineCents: Cents;
      readonly expectedLineUnrounded: string;
      readonly inReductionPool: boolean;
      readonly traceSha256: string;
      readonly reduced: ScreeningLineFigure | null;
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

/** A priced line's figure before sequestration (beforeSequestration), with its trace's hash. */
function lineFigure(line: PricedLine, hash: string): ScreeningLineFigure {
  const amount = beforeSequestration(line);
  return { lineCents: amount.cents, lineUnrounded: amount.unrounded.toString(), traceSha256: hash };
}

/** One figure of a row: the engine's line before sequestration, times the count, less the allowed total. */
function figureOf(row: Pick<PendingScreeningRow, 'claimCount' | 'observedAllowedCents'>, figure: ScreeningLineFigure): ScreeningFigure {
  const total = cents(figure.lineCents * BigInt(row.claimCount));
  return {
    lineCents: figure.lineCents,
    lineUnrounded: figure.lineUnrounded,
    cents: total,
    differenceCents: subtractCents(total, row.observedAllowedCents),
    traceSha256: figure.traceSha256,
  };
}

/**
 * What a distinct line's pricing comes to before any row's count and total, in its band: `line` is the engine's
 * one-line result, `later` its result for the row as a later procedure of a visit (needed when the code is in the
 * reduction across codes), and `changesInBand` whether the engine priced either differently on a day inside the band
 * where the release's records change. Each trace is hashed once.
 */
export function screeningLineOutcome(serviceBand: string, line: LinePricing, changesInBand = false, later: LinePricing | null = null): ScreeningLineOutcome {
  const hash = traceSha256(line.trace);
  if (changesInBand) {
    return { disposition: 'rates_change_in_band', traceSha256: hash };
  }
  if (line.outcome === 'unpriced') {
    return { disposition: 'unpriced', reason: line.reason, detail: line.detail, traceSha256: hash };
  }
  const pooled = inReductionPool(line.trace);
  if (!coversBand(line.trace, serviceBand) || (pooled && later !== null && !coversBand(later.trace, serviceBand))) {
    return { disposition: 'rates_change_in_band', traceSha256: hash };
  }
  const alone = lineFigure(line, hash);
  let reduced: ScreeningLineFigure | null = null;
  if (pooled) {
    // The engine prices a pooled code as a later procedure whenever it prices it alone: anything else is an error, never a figure.
    if (later?.outcome !== 'priced' || later.lineNo !== LATER_PROCEDURE_LINE_NO || !reducedAsLaterProcedure(later.trace)) {
      throw new Error('the engine did not price the row as a later procedure of a visit');
    }
    reduced = lineFigure(later, traceSha256(later.trace));
    if (reduced.lineCents > alone.lineCents) {
      throw new Error('the engine priced the row higher as a later procedure than alone');
    }
  }
  return {
    disposition: 'priced',
    expectedLineCents: alone.lineCents,
    expectedLineUnrounded: alone.lineUnrounded,
    inReductionPool: pooled,
    traceSha256: hash,
    reduced,
  };
}

/** A row's outcome from its distinct line's: each figure times the row's claim count, less its allowed total, in bigint. */
export function rowOutcome(row: Pick<PendingScreeningRow, 'claimCount' | 'observedAllowedCents'>, line: ScreeningLineOutcome): ScreeningRowOutcome {
  if (line.disposition !== 'priced') {
    return line;
  }
  const alone = figureOf(row, { lineCents: line.expectedLineCents, lineUnrounded: line.expectedLineUnrounded, traceSha256: line.traceSha256 });
  return {
    disposition: 'priced',
    expectedLineCents: alone.lineCents,
    expectedLineUnrounded: alone.lineUnrounded,
    expectedCents: alone.cents,
    differenceCents: alone.differenceCents,
    inReductionPool: line.inReductionPool,
    traceSha256: line.traceSha256,
    reduced: line.reduced === null ? null : figureOf(row, line.reduced),
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
  return rowOutcome(row, screeningLineOutcome(row.serviceBand, line, changesInBand, later));
}

/** The claim dated the day given, every line. */
function dated(claim: ClaimFacts, serviceDate: IsoDate | undefined): ClaimFacts {
  return serviceDate === undefined ? claim : { ...claim, lines: claim.lines.map((line) => ({ ...line, serviceDate })) };
}

/** One engine call; then, outside the engine, a lookup the release read did not fetch stops the run (keyed-release.ts). */
function priceClaim(context: ScreeningPricingContext, claim: ClaimFacts): LinePricing[] {
  const lines = price({
    claim,
    release: context.release,
    settings: { zip: context.zip, zipPlusFour: context.zipPlusFour, defaultRounding: null, placeOfServiceSettings: context.placeOfServiceSettings },
    asOf: context.asOf,
  });
  const violation = context.read?.view.violation ?? null;
  if (violation !== null) {
    throw new ReleaseReadOutsideFetch(violation);
  }
  return lines;
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

/**
 * Prices a run's rows, the engine once per distinct line (code, modifiers, units, place of service and band: both
 * priced products price under the same terms), once more for a code in the reduction across codes (the row as a
 * later procedure of a visit), and again for each day inside the band where the release's records change, each
 * row's outcome from its own count and total. The memo keeps a compact record per distinct line
 * (ScreeningLineOutcome: figures and hashes), never the engine's traces past their line.
 */
export class ScreeningPricer {
  private readonly lines = new Map<string, ScreeningLineOutcome>();
  private readonly seen = new Set<string>();

  constructor(private readonly context: ScreeningPricingContext) {}

  /** How many distinct lines the engine has priced. */
  get priced(): number {
    return this.lines.size;
  }

  /** The codes of every row priced so far. */
  get codes(): ReadonlySet<string> {
    return this.seen;
  }

  outcome(row: PendingScreeningRow): ScreeningRowOutcome {
    if (!pricesAsMedicare(row.payerProduct)) {
      throw new RangeError('only medicare_ffs and ma_noncontracted rows are priced');
    }
    if (this.context.read !== undefined && !this.context.read.codes.has(row.procedureCode)) {
      throw new ReleaseKeysMismatch();
    }
    this.seen.add(row.procedureCode);
    const key = [row.procedureCode, [...row.modifiers].sort().join(' '), String(row.units), row.placeOfService, row.serviceBand].join('\t');
    let priced = this.lines.get(key);
    if (priced === undefined) {
      const line = priceScreeningLine(this.context, row);
      const later = line.outcome === 'priced' && inReductionPool(line.trace) ? priceScreeningLaterProcedure(this.context, row) : null;
      const changesInBand = changeDaysInBand(this.context.changeDays, row.serviceBand).some(
        (day) => !samePricing(line, priceScreeningLine(this.context, row, day)) || (later !== null && !samePricing(later, priceScreeningLaterProcedure(this.context, row, day))),
      );
      priced = screeningLineOutcome(row.serviceBand, line, changesInBand, later);
      this.lines.set(key, priced);
    }
    return rowOutcome(row, priced);
  }
}
