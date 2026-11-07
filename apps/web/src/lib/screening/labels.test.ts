import { createHash } from 'node:crypto';

import { ENGINE_ERROR_DETAILS, NO_PFS_VALUE_DETAILS } from '@tp/pricing';
import { describe, expect, it } from 'vitest';

import * as labels from './labels';

/**
 * The result page's words under their version (audit #57; the founder's rulings of 2026-10-20): a kept summary names
 * the version its result was shown under (screening_lead.labels_version), so a released version's labels never
 * change; an unreleased one may be re-pinned under its name (the rule in VERSIONS below). This pins a SHA-256 of every
 * label to SCREENING_LABELS_VERSION; a changed label fails here until the version moves (here, in labels.ts and in
 * screening_labels_version(), whose database test holds the two equal) or, while no release tag contains the
 * version, until its hash is re-pinned.
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
  // PR 6b: the ZIP+4's three engine details (locality_needs_zip_plus_four reworded; no_locality_plus_four, a gap in the
  // content, and zip_plus_four_not_in_locality_map added) and the rows not screened for a quarter outside the loaded
  // content (the founder's answers of 2026-10-21 to Q6 (a) and Q12). Unreleased until PR 6b merges, so the version
  // keeps the name its migration's screening_labels_version() returns. PR 6b-2's review round reworded two of them
  // (a ZIP that spans "more than one" locality, not "two"; the Medicare products priced "for the quarters PaidWhole has
  // loaded"), still unreleased. UX PR 4b re-pinned it, still unreleased (Lane A's ruling of 2026-10-28; design 12.1),
  // for three changed strings: DIFFERENCE_LABEL and REDUCED_DIFFERENCE_LABEL name their subtraction ("Medicare figure
  // less allowed, before the reduction across codes" and "Medicare figure less allowed, fully reduced across codes",
  // UX-042); DETAIL_LABELS.place_of_service_unmapped says in words the lists a screening prices by ("This place of
  // service is in neither the facility nor the non-facility list a screening prices by, so the row has no Medicare
  // figure", UX-132); and DISPOSITION_NOTES, which no screen read, is gone. With them, the UX review's P5: the four
  // figure labels say "Medicare figure, …" for "Expected under Medicare, …" (MEDICARE_FIGURE_LABEL, REDUCED_FIGURE_LABEL,
  // and the lines' MEDICARE_LINE_LABEL and REDUCED_LINE_LABEL, "Medicare figure for one claim line, …"). Lane A's rule:
  // a version may be re-pinned under its name only while no release tag contains it (the founder creates tags; the first tag releases it).
  'screening-labels/2026-11-05': '7e533a5e6ade4ea5b6b5cee6c3a91e389fdc3c122e8f0b34c23462957890c968',
};

describe('the labels of PR 6b (docs/adr/0064)', () => {
  it('labels the three ZIP+4 details an engine gives a screening row and the place of service a screening does not price by, and labels no detail the engine does not have', () => {
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'locality_needs_zip_plus_four')).toBe('The ZIP spans more than one Medicare locality and no ZIP+4 was given');
    // The lists a screening prices by, in words a prospect can read (UX-132), never the split's own name.
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'place_of_service_unmapped')).toBe(
      'This place of service is in neither the facility nor the non-facility list a screening prices by, so the row has no Medicare figure',
    );
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'zip_plus_four_not_in_locality_map')).toBe('Medicare’s ZIP+4 list has no locality for this ZIP+4 on the quarter’s first day');
    // No ZIP+4 list of the ZIP in force is PaidWhole's content to load, never the prospect's ZIP+4 to check.
    expect(labels.unpricedReasonLabel('ENGINE_ERROR', 'no_locality_plus_four')).toBe('PaidWhole has not loaded Medicare’s ZIP+4 list for this ZIP on the quarter’s first day');
    const meaning = labels.unpricedReasonLabel('ENGINE_ERROR', null);
    for (const detail of [
      'place_of_service_unmapped',
      'no_locality',
      'no_gpci',
      'no_conversion_factor',
      'locality_needs_zip_plus_four',
      'no_locality_plus_four',
      'zip_plus_four_not_in_locality_map',
      'units_above_limit',
    ]) {
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

describe('the labels of UX PR 4b', () => {
  it('names every figure the Medicare figure, never expected, which BRAND.md section 6 keeps for a contract amount (P5)', () => {
    expect(labels.MEDICARE_FIGURE_LABEL).toBe('Medicare figure, before the reduction across codes');
    expect(labels.REDUCED_FIGURE_LABEL).toBe('Medicare figure, fully reduced across codes');
    expect(labels.MEDICARE_LINE_LABEL).toBe('Medicare figure for one claim line, before the reduction across codes');
    expect(labels.REDUCED_LINE_LABEL).toBe('Medicare figure for one claim line, fully reduced across codes');
    const words = Object.values(labels).filter((value): value is string => typeof value === 'string');
    expect(words.filter((value) => /\bexpected\b/i.test(value))).toEqual([]);
  });

  it('names each difference by its subtraction (UX-042), and keeps no notes that no screen reads', () => {
    expect(labels.DIFFERENCE_LABEL).toBe('Medicare figure less allowed, before the reduction across codes');
    expect(labels.REDUCED_DIFFERENCE_LABEL).toBe('Medicare figure less allowed, fully reduced across codes');
    expect('DISPOSITION_NOTES' in labels).toBe(false);
  });
});

describe('the screening labels version', () => {
  it('names the labels it was set with, and changes only with them', () => {
    expect(labels.SCREENING_LABELS_VERSION).toMatch(/^screening-labels\/20\d{2}-\d{2}-\d{2}$/);
    const hash = createHash('sha256').update(JSON.stringify(wording())).digest('hex');
    expect(VERSIONS[labels.SCREENING_LABELS_VERSION], 'a label changed: give the labels a new SCREENING_LABELS_VERSION (and screening_labels_version())').toBe(hash);
  });
});
