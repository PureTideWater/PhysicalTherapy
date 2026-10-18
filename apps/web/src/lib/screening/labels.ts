import type { UnpricedReason } from '@tp/pricing';
import type { ScreeningPayerProduct } from '@tp/worker/screening-format';

import { unpricedReasonText } from '../contracts/remedies';

/**
 * The words a free screening's screens show (Change Order 001, CO-04 and CO-11; reconciliation-001, D19 and D20).
 * A screening never says owed, underpaid or recovered (the copy lint refuses them in any screening file): a row's
 * Medicare figure is "expected under Medicare", the prospect's own figure is "allowed in your file", and what lies
 * between is the "difference". Plain data, safe to import in the browser.
 */

/** What every Medicare figure priced alone, and every figure worked out from one, is qualified by (decision D19 a). */
export const BEFORE_REDUCTION = 'before the reduction across codes';

/**
 * What the second figure of a code in the reduction across codes is qualified by (the owner's ruling of 2026-10-18):
 * the engine's figure for the row priced as a later code of a visit, so that the reduction applies to every unit.
 */
export const FULLY_REDUCED = 'fully reduced across codes';

/**
 * The Medicare figure's label, shown wherever the figure appears (decision D19 a): each row is priced alone by the
 * unchanged engine, so the multiple procedure payment reduction across the codes of one visit is not applied, and
 * the figure can be higher than a visit with several codes would price at.
 */
export const MEDICARE_FIGURE_LABEL = `Expected under Medicare, ${BEFORE_REDUCTION}`;

/** The fully reduced figure's label, for a code in the reduction across codes (the owner's ruling of 2026-10-18). */
export const REDUCED_FIGURE_LABEL = `Expected under Medicare, ${FULLY_REDUCED}`;

/** The engine's figure for one claim line of a row: as much a Medicare figure, and as much before the reduction. */
export const MEDICARE_LINE_LABEL = `One claim line, expected under Medicare, ${BEFORE_REDUCTION}`;

/** The fully reduced figure for one claim line of a row. */
export const REDUCED_LINE_LABEL = `One claim line, expected under Medicare, ${FULLY_REDUCED}`;

/** The difference between the Medicare figure and the allowed amount in the file: worked out from the figure, so qualified as it is. */
export const DIFFERENCE_LABEL = `Difference, ${BEFORE_REDUCTION}`;

/** The difference between the fully reduced figure and the allowed amount in the file. */
export const REDUCED_DIFFERENCE_LABEL = `Difference, ${FULLY_REDUCED}`;

/** What a row of a code in the reduction across codes allowed between its two figures is (the owner's ruling of 2026-10-18): never an anomaly. */
export const WITHIN_REDUCTION_RANGE = 'Within the range of the reduction across codes';

/**
 * Why the labels say so, beside the figures: the reduction across codes, which rows of totals cannot show, so a code
 * in it has two figures; and sequestration, which every figure is before, as payers normally report the allowed
 * amount (the owner's rulings of 2026-10-18; fixtures/golden/QUESTIONS.md, Q21, for the specialist to confirm).
 */
export const MEDICARE_FIGURE_NOTE =
  'Each row is priced under the Medicare physician fee schedule at your locality, with the therapy adjustments. Medicare reduces part of the payment for a code that follows another in the same visit, which rows of totals cannot show, so a row of such a code has two figures: priced on its own, before the reduction across codes, and priced as a later code of a visit, fully reduced across codes. A visit priced with the reduction puts the code between the two, so an allowed amount there is within the range of the reduction across codes, never an anomaly. Every figure is before Medicare’s sequestration, because the allowed amount in a payer’s remittance is normally reported before it.';

/**
 * Where an allowed total stands against its figures, as the database's screening_standing() says (the owner's ruling
 * of 2026-10-18): more than $5 a claim line below the lowest figure; within the range of the reduction across codes;
 * below the lowest figure by $5 a claim line or less; or at or above the figure before the reduction.
 */
export const SCREENING_STANDINGS = ['anomaly', 'within_reduction_range', 'below_by_threshold_or_less', 'at_or_above'] as const;
export type ScreeningStanding = (typeof SCREENING_STANDINGS)[number];

/** What makes a row an anomaly (the owner's ruling of 2026-10-18; ADR 0038's $5 a line, exceeded). */
export const ANOMALY_RULE =
  'A row is an anomaly when the allowed total in your file is more than $5 a claim line below its lowest Medicare figure: the fully reduced figure for a code in the reduction across codes, the one figure otherwise.';

/** That a screening is investigatory, never a contract figure (CO-04). */
export const SCREENING_INVESTIGATORY_NOTE =
  'A screening is investigatory. It compares the allowed amounts in your file with public Medicare rates; it is not a contract figure, and nothing here is a finding about a payer. A PaidWhole audit prices your lines under your signed contracts.';

/** The payer products an upload may declare (decision D20 a: a closed list, SCREENING_PAYER_PRODUCTS). */
type ScreeningProduct = ScreeningPayerProduct;

export const PRODUCT_LABELS: Readonly<Record<ScreeningProduct, string>> = {
  medicare_ffs: 'Original Medicare',
  ma_noncontracted: 'Medicare Advantage, no contract',
  ma_contracted: 'Medicare Advantage, under contract',
  commercial: 'Commercial',
  medicaid: 'Medicaid',
  other: 'Other',
};

/** What each product's rows are in a screening (decision D20 a). */
export const PRODUCT_NOTES: Readonly<Record<ScreeningProduct, string>> = {
  medicare_ffs: 'Priced under the Medicare physician fee schedule.',
  ma_noncontracted: 'Priced under the Medicare Advantage non-contracted rule: the Medicare fee schedule.',
  ma_contracted: 'Cannot be priced without a contract.',
  commercial: 'Cannot be priced without a contract.',
  medicaid: 'Not screened: state Medicaid rates are not in a screening.',
  other: 'Not screened.',
};

export function productLabel(product: string): string {
  return (PRODUCT_LABELS as Readonly<Record<string, string>>)[product] ?? product;
}

/** A screening row's outcome, as the result stores it. */
export const SCREENING_DISPOSITIONS = ['priced', 'rates_change_in_band', 'unpriced', 'contract_required', 'not_screened', 'pending'] as const;
export type ScreeningDisposition = (typeof SCREENING_DISPOSITIONS)[number];

export const DISPOSITION_LABELS: Readonly<Record<ScreeningDisposition, string>> = {
  priced: 'Priced under Medicare',
  rates_change_in_band: 'Rates change within the quarter',
  unpriced: 'Could not be priced',
  contract_required: 'Cannot be priced without a contract',
  not_screened: 'Not screened',
  pending: 'Not yet priced',
};

export function dispositionLabel(disposition: string): string {
  return (DISPOSITION_LABELS as Readonly<Record<string, string>>)[disposition] ?? disposition;
}

/** What a row with each outcome shows in place of a figure. */
export const DISPOSITION_NOTES: Readonly<Record<ScreeningDisposition, string>> = {
  priced: 'Priced by the engine on its own and, for a code in the reduction across codes, again as a later code of a visit; each figure multiplied by the claim count.',
  rates_change_in_band: 'A Medicare rate changes inside the quarter, so a quarter of totals has no one figure.',
  unpriced: 'The engine left the row without a price, for the reason shown.',
  contract_required: 'Its payer product is priced by its contract, which a screening does not have.',
  not_screened: 'A screening does not price this payer product.',
  pending: 'Not yet priced.',
};

/**
 * Why the engine left a screening row without a price: the closed list's meaning (docs/product/unpriced-reasons.md),
 * and, for the details a screening meets, what they mean for a row of totals.
 */
const DETAIL_LABELS: Readonly<Record<string, string>> = {
  place_of_service_unmapped: 'The place of service is not in the approved place-of-service split',
  locality_needs_zip_plus_four: 'The ZIP spans two Medicare localities, which a free screening cannot price yet',
  no_locality: 'The ZIP has no Medicare locality on the quarter’s first day',
  no_gpci: 'No geographic adjustment for the locality in the year',
  no_conversion_factor: 'No conversion factor for the year',
  no_assistant_record: 'No assistant reduction record on the quarter’s first day',
  assistant_percentages_differ: 'CQ and CO on one row with different reductions',
  no_sequestration_record: 'No sequestration record on the quarter’s first day',
  units_not_whole: 'The units are not a whole number',
  units_above_limit: 'More units than one line may carry',
  no_rvu_in_basis_year: 'No relative value for the code in the year',
  practice_expense_not_available: 'No practice-expense value for the code in this setting',
};

export function unpricedReasonLabel(reason: string, detail: string | null): string {
  const meaning = unpricedReasonText(reason as UnpricedReason)?.meaning ?? reason;
  if (detail === null) {
    return meaning;
  }
  return DETAIL_LABELS[detail] ?? meaning;
}
