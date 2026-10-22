import { SCALE_RELEASE_SHAPE, scalePlusFourRanges, scaleZips } from '@tp/synth';
import { describe, expect, it } from 'vitest';

import { ORACLE_UPLOADS, oracleKind } from './report';
import { scenarios, splitZip, typedZip } from './uploads';

/**
 * The capacity test's uploads (audit #53 part 1; PR 6b, docs/adr/0064): every upload from its own ZIP, the five-digit
 * ones from ZIPs that need no ZIP+4, and S1-2 from a ZIP the release splits across localities, typed with a ZIP+4 in
 * the next locality's range, so its run is compared with the whole-release oracle.
 */

describe('the capacity uploads', () => {
  it('sends S1-2 from a split ZIP with a ZIP+4 in the other locality’s range, typed as ZIP+4, behind S1-1', () => {
    const split = splitZip();
    const zip = scaleZips(SCALE_RELEASE_SHAPE).find((entry) => entry.zip === split.zip);
    expect(zip?.plusFour).toBe(true);
    const range = zip === undefined ? undefined : scalePlusFourRanges(SCALE_RELEASE_SHAPE, zip).find((entry) => entry.from <= split.zipPlusFour && split.zipPlusFour <= entry.to);
    expect(range?.localityIndex).not.toBe(zip?.localityIndex);
    const [s1] = scenarios();
    expect(s1?.uploads.map((upload) => [upload.id, upload.shape, upload.behind, typedZip(upload)])).toEqual([
      ['S1-1', 'worst', false, s1?.uploads[0]?.zip],
      ['S1-2', 'small', true, `${split.zip}-${split.zipPlusFour}`],
    ]);
  });

  it('keeps every other upload at a five-digit ZIP that needs no ZIP+4, no ZIP twice', () => {
    const uploads = scenarios().flatMap((scenario) => scenario.uploads);
    const flagged = new Set(scaleZips(SCALE_RELEASE_SHAPE).filter((zip) => zip.plusFour).map((zip) => zip.zip));
    expect(uploads.filter((upload) => upload.id !== 'S1-2').every((upload) => upload.zipPlusFour === null && !flagged.has(upload.zip) && typedZip(upload) === upload.zip)).toBe(true);
    expect(new Set(uploads.map((upload) => upload.zip)).size).toBe(uploads.length);
    expect(new Set(uploads.map((upload) => upload.practiceName)).size).toBe(uploads.length);
    // Each upload the oracle compares is one the scenarios send.
    expect(ORACLE_UPLOADS.every((id) => uploads.some((upload) => upload.id === id))).toBe(true);
    expect(uploads.filter((upload) => upload.zipPlusFour !== null).map((upload) => [upload.id, oracleKind(upload.id)])).toEqual([['S1-2', 'whole_release']]);
  });
});
