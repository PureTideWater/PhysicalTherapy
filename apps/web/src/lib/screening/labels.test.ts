import { createHash } from 'node:crypto';

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
    products: Object.keys(labels.PRODUCT_LABELS).map((product) => labels.productLabel(product)),
    dispositions: labels.SCREENING_DISPOSITIONS.map((disposition) => labels.dispositionLabel(disposition)),
  };
}

/** The labels of each version, by the SHA-256 of their JSON. */
const VERSIONS: Readonly<Record<string, string>> = {
  'screening-labels/2026-10-18': 'd495535ac4e7fa0ef6c8f41d2365956ca6d81859be30df5e812cbbb53dff20fb',
};

describe('the screening labels version', () => {
  it('names the labels it was set with, and changes only with them', () => {
    expect(labels.SCREENING_LABELS_VERSION).toMatch(/^screening-labels\/20\d{2}-\d{2}-\d{2}$/);
    const hash = createHash('sha256').update(JSON.stringify(wording())).digest('hex');
    expect(VERSIONS[labels.SCREENING_LABELS_VERSION], 'a label changed: give the labels a new SCREENING_LABELS_VERSION (and screening_labels_version())').toBe(hash);
  });
});
