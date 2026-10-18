import type { UnpricedReason } from '@tp/pricing';
import type { ScreeningPayerProduct } from '@tp/worker/screening-format';

import { unpricedReasonText } from '../contracts/remedies';

/**
 * The words a free screening's screens show (Change Order 001, CO-04 and CO-11; reconciliation-001, D19 and D20).
 * A screening never says owed, underpaid or recovered (the copy lint refuses them in any screening file): a row's
 * Medicare figure is "expected under Medicare", the prospect's own figure is "allowed in your file", and what lies
 * between is the "difference". Plain data, safe to import in the browser.
 */

/**
 * The Medicare figure's label, shown wherever the figure appears (decision D19 a): each row is priced alone by the
 * unchanged engine, so the multiple procedure payment reduction across the codes of one visit is not applied, and
 * the figure overstates what a whole visit would price at.
 */
export const MEDICARE_FIGURE_LABEL = 'Expected under Medicare, before the reduction across codes';

/** Why the label says so, in one sentence, beside the figures. */
export const MEDICARE_FIGURE_NOTE =
  'Each row is priced on its own under the Medicare physician fee schedule at your locality, with the therapy adjustments. The reduction Medicare applies across the codes of one visit cannot be seen in rows of totals, so the figure is before it and is higher than a whole visit would be.';

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
  priced: 'Priced alone by the engine, then multiplied by the claim count.',
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
  locality_needs_zip_plus_four: 'The ZIP needs its ZIP+4 to name a Medicare locality',
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
