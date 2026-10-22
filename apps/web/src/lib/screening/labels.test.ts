import { createHash } from 'node:crypto';

import { ENGINE_ERROR_DETAILS, NO_PFS_VALUE_DETAILS } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import * as labels from './labels';

/**
 * The result page's words under their version (audit #57; the founder's rulings of 2026-10-20): a kept summary names
 * the version its result was shown under (screening_lead.labels_version), so a label changes only under a new
 * version. This pins a SHA-256 of every label to SCREENING_LABELS_VERSION; a changed label fails here until the
 * version moves (here, in labels.ts and in screening_labels_version(), whose database test holds the two equal).
 */

/** Every word the module gives the screens: its strings and lists, and what its functions say of each value they take. */
function wording(): unknown {
  const values = Object.entries(labels)
    .filter(([name, value]) => name !== 'SCREENING_LABELS_VERSION' && typeof value !== 'function')
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return {
    values,
    leftOut: [1, 2, 10].map((rows) => labels.leftOutNote(rows)),
    // From screening-labels/2026-11-05 (PR 6b): the rows not screened for a quarter outside the loaded content, and
    // what each engine detail a screening row can stop on says.
    outsideContent: [1, 2, 12].flatMap((rows) => [labels.outsideContentNote(rows, '2026-Q1'), labels.outsideContentNote(rows, null)]),
    details: [...ENGINE_ERROR_DETAILS, ...NO_PFS_VALUE_DETAILS].map((detail) => labels.unpricedReasonLabel('ENGINE_ERROR', detail)),
    products: Object.keys(labels.PRODUCT_LABELS).map((product) => labels.productLabel(product)),
    dispositions: labels.SCREENING_DISPOSITIONS.map((disposition) => labels.dispositionLabel(disposition)),
  };
}

/** The labels of each version, by the SHA-256 of their JSON. */
const VERSIONS: Readonly<Record<string, string>> = {
  'screening-labels/2026-10-18': 'd495535ac4e7fa0ef6c8f41d2365956ca6d81859be30df5e812cbbb53dff20fb',
  // PR 6b: the ZIP+4's two engine details (locality_needs_zip_plus_four reworded, zip_plus_four_not_in_locality_map
  // added) and the rows not screened for a quarter outside the loaded content (the founder's answers of 2026-10-21 to
  // Q6 (a) and Q12).
  'screening-labels/2026-11-05': 'a64c52579ae99b2b35cc7ad59f19f589196bbd5fc3aea165a646404356a0ab99',
};

describe('the labels of PR 6b (docs/adr/0064)', () => {
  it('labels both ZIP+4 details an engine gives a screening row, and labels no detail the engine does not have', () => {
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'locality_needs_zip_plus_four')).toBe('The ZIP spans two Medicare localities and no ZIP+4 was given');
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'zip_plus_four_not_in_locality_map')).toBe('Medicare’s ZIP+4 list has no locality for this ZIP+4 on the quarter’s first day');
    const meaning = labels.unpricedReasonLabel('ENGINE_ERROR', null);
    for (const detail of ['place_of_service_unmapped', 'no_locality', 'no_gpci', 'no_conversion_factor', 'locality_needs_zip_plus_four', 'zip_plus_four_not_in_locality_map', 'units_above_limit']) {
      expect(labels.unpricedReasonLabel('ENGINE_ERROR', detail), detail).not.toBe(meaning);
    }
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'not_a_detail')).toBe(meaning);
  });

  it('says how many rows were not screened for a quarter outside the loaded content, around their allowed total', () => {
    const many = labels.outsideContentNote(12, '2026-Q1');
    expect(`${many.lead}$41,200.00${many.tail}`).toBe('12 rows ($41,200.00) in quarters before 2026-Q1 were not screened: PaidWhole has not loaded the Medicare content for them.');
    const one = labels.outsideContentNote(1, null);
    expect(`${one.lead}$500.00${one.tail}`).toBe('1 row ($500.00) in a quarter outside the loaded content was not screened: PaidWhole has not loaded the Medicare content for it.');
  });
});

describe('the screening labels version', () => {
  it('names the labels it was set with, and changes only with them', () => {
    expect(labels.SCREENING_LABELS_VERSION).toMatch(/^screening-labels\/20\d{2}-\d{2}-\d{2}$/);
    const hash = createHash('sha256').update(JSON.stringify(wording())).digest('hex');
    expect(VERSIONS[labels.SCREENING_LABELS_VERSION], 'a label changed: give the labels a new SCREENING_LABELS_VERSION (and screening_labels_version())').toBe(hash);
  });
});
