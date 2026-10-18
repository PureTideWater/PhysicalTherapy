import { createHash } from 'node:crypto';

import { MA_NONCONTRACTED_TERMS, type PlanMappingRecord } from '@tp/contracts';
import { type Cents, cents, subtractCents } from '@tp/money';
import { type ClaimFacts, type IndexedRelease, type IsoDate, type LinePricing, type PlaceOfServiceSetting, type PricingTrace, type UnpricedReason, price } from '@tp/pricing';

import { type ScreeningPayerProduct, quarterDays } from './format';

/**
 * The screening's pricing adapter (Change Order 001, CO-04; reconciliation-001 D19 a and D20 a; docs/adr/0062):
 * each priced row becomes a one-line claim the unchanged engine prices (price() from @tp/pricing; nothing under
 * packages/pricing changes), and the engine's rounded line amount is multiplied by the row's claim count here,
 * outside the engine, in bigint.
 *
 * A row of medicare_ffs or ma_noncontracted prices as an MA non-contracted line: the agreement is
 * MA_NONCONTRACTED with @tp/contracts' MA_NONCONTRACTED_TERMS (Original Medicare's: 100% of the current year's fee
 * schedule at the practice's locality, the non-qualifying conversion factor, every adjustment on: the multiple
 * procedure reduction, the assistant reduction for CQ and CO, sequestration, and NCCI with its medically unlikely
 * edit), so Original Medicare's fee schedule prices medicare_ffs rows too. The flag defaults do not change. The
 * line's date is its band's first day; its charge and observed allowed are zero, since the row's allowed total is
 * compared here and the engine's variance is ignored. A one-line claim cannot show the reduction across codes of a
 * visit (D19): the figure is labelled "before the reduction across codes" wherever it appears.
 *
 * MA contracted and commercial rows are never priced (contract_required), and medicaid and other rows are not
 * screened; neither reaches this module. A priced row whose trace names a rule record that does not cover its
 * whole band shows no figure (rates_change_in_band).
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

/** What pricing a run needs: its pinned release, the prospect's ZIP, the run's approved split and its date. */
export interface ScreeningPricingContext {
  readonly release: IndexedRelease;
  /** The prospect's five-digit ZIP. A ZIP whose locality needs its ZIP+4 leaves rows unpriced (ENGINE_ERROR locality_needs_zip_plus_four). */
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

export type ScreeningRowOutcome =
  | {
      readonly disposition: 'priced';
      /** The engine's expected allowed for one line, rounded once by the engine. */
      readonly expectedLineCents: Cents;
      /** Its unrounded value, as decimal text. */
      readonly expectedLineUnrounded: string;
      /** The line amount times the claim count, in bigint. */
      readonly expectedCents: Cents;
      /** The expected amount less the allowed total in the file. */
      readonly differenceCents: Cents;
      readonly traceSha256: string;
    }
  | { readonly disposition: 'unpriced'; readonly reason: UnpricedReason; readonly detail: string | null; readonly traceSha256: string }
  | { readonly disposition: 'rates_change_in_band'; readonly traceSha256: string };

/** The rows that price: medicare_ffs and ma_noncontracted. */
export function pricesAsMedicare(product: ScreeningPayerProduct): boolean {
  return product === 'medicare_ffs' || product === 'ma_noncontracted';
}

/** A row's one-line claim, as the engine reads it. */
export function screeningClaim(row: Pick<PendingScreeningRow, 'procedureCode' | 'modifiers' | 'units' | 'placeOfService' | 'serviceBand'>): ClaimFacts {
  return {
    claimStatusCode: '1',
    reversed: false,
    corrected: false,
    remittanceDate: null,
    payerPlanKey: null,
    lines: [
      {
        lineNo: 1,
        serviceLineId: null,
        procedureCode: row.procedureCode,
        modifiers: [...row.modifiers].sort(),
        units: String(row.units),
        serviceDate: quarterDays(row.serviceBand).first,
        placeOfService: row.placeOfService,
        chargeCents: cents(0n),
        observedAllowedCents: cents(0n),
        observedAllowedBasis: 'paid_plus_pr',
        patientShareAdjustments: [],
        agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
      },
    ],
  };
}

/** The SHA-256 of a trace as JSON. */
export function traceSha256(trace: PricingTrace): string {
  return createHash('sha256').update(JSON.stringify(trace), 'utf8').digest('hex');
}

interface Ref {
  readonly effective_from: string;
  readonly effective_to: string | null;
}

function isRef(value: object): value is Ref & { readonly record_type: string; readonly sha256: string } {
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

/** What a row's one-line pricing comes to, with its claim count and allowed total. */
export function screeningOutcome(row: Pick<PendingScreeningRow, 'serviceBand' | 'claimCount' | 'observedAllowedCents'>, line: LinePricing): ScreeningRowOutcome {
  const hash = traceSha256(line.trace);
  if (line.outcome === 'unpriced') {
    return { disposition: 'unpriced', reason: line.reason, detail: line.detail, traceSha256: hash };
  }
  if (!coversBand(line.trace, row.serviceBand)) {
    return { disposition: 'rates_change_in_band', traceSha256: hash };
  }
  const expectedCents = cents(line.expectedAllowedCents * BigInt(row.claimCount));
  return {
    disposition: 'priced',
    expectedLineCents: line.expectedAllowedCents,
    expectedLineUnrounded: line.expectedUnroundedCents.toString(),
    expectedCents,
    differenceCents: subtractCents(expectedCents, row.observedAllowedCents),
    traceSha256: hash,
  };
}

/** The engine's one line for a row: the claim's only result. */
export function priceScreeningLine(context: ScreeningPricingContext, row: Pick<PendingScreeningRow, 'procedureCode' | 'modifiers' | 'units' | 'placeOfService' | 'serviceBand'>): LinePricing {
  const [line] = price({
    claim: screeningClaim(row),
    release: context.release,
    settings: { zip: context.zip, defaultRounding: null, placeOfServiceSettings: context.placeOfServiceSettings },
    asOf: context.asOf,
  });
  if (line === undefined) {
    throw new Error('the engine priced no line of a one-line claim');
  }
  return line;
}

/**
 * Prices a run's rows, the engine once per distinct line (code, modifiers, units, place of service and band: both
 * priced products price under the same terms), each row's outcome from its own count and total.
 */
export class ScreeningPricer {
  private readonly lines = new Map<string, LinePricing>();

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
    let line = this.lines.get(key);
    if (line === undefined) {
      line = priceScreeningLine(this.context, row);
      this.lines.set(key, line);
    }
    return screeningOutcome(row, line);
  }
}
