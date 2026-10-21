import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { SCALE_RELEASE_SHAPE, SMALL_SCALE_RELEASE_SHAPE, scaleLocalities, scalePooledCodes, scaleZips } from '../release/scale';
import { SYNTH_SCREENING_PAYER_PRODUCTS, lineKey, practiceShapeRows, smallUploadRows, uploadShapeFacts, uploadZips, worstShapeRows } from './uploads';

/**
 * The capacity test's SYNTHETIC uploads (audit #53 part 1; docs/adr/0062): the practice shape is the large test's rows
 * (apps/web/src/lib/screening/screening.large.db.test.ts asserts its own rows equal practiceShapeRows(); here they are
 * held to their SHA-256 so neither drifts silently), and the worst shape meets every bound the design sets.
 */

const encode = (rows: ReturnType<typeof practiceShapeRows>): string =>
  rows.map((row) => [row.procedureCode, row.modifiers.join(' '), row.units, row.placeOfService, row.payerProduct, row.serviceBand, row.allowedCents, row.claimCount].join(',')).join('\n');

describe('the practice shape', () => {
  it('is the large test’s 50,000 rows: 12 codes, 8 modifier sets, 2 places, units 1 to 6, 8 quarters, all six products; 9,216 distinct priced lines', () => {
    const rows = practiceShapeRows();
    const facts = uploadShapeFacts(rows);
    expect(facts).toMatchObject({ rows: 50_000, distinctPricedLines: 9_216, distinctCodes: 12, minClaims: 11, maxClaims: 50 });
    expect(new Set(rows.map((row) => row.payerProduct))).toEqual(new Set(SYNTH_SCREENING_PAYER_PRODUCTS));
    // The rows' bytes, pinned: the large test's own loops at 8abb787, copied into a script, run once and hashed.
    expect(createHash('sha256').update(encode(rows)).digest('hex')).toBe('d29f6b06172e6cc4c9872a7a3110d47c095e4ca177f1d6770db08a338ccdb2a5');
  });
});

describe('the worst shape', () => {
  it('holds 50,000 distinct priced lines over at least 15,000 codes, every pooled code among them, half the rows pooled and a tenth in a change quarter', () => {
    const rows = worstShapeRows();
    const facts = uploadShapeFacts(rows);
    expect(facts.rows).toBe(50_000);
    expect(facts.pricedRows).toBe(50_000);
    expect(facts.distinctPricedLines).toBe(50_000);
    expect(facts.distinctCodes).toBeGreaterThanOrEqual(15_000);
    expect(facts.pooledRows).toBeGreaterThanOrEqual(25_000);
    expect(facts.changeRows).toBeGreaterThanOrEqual(5_000);
    expect(facts.minClaims).toBeGreaterThanOrEqual(11);
    expect(facts.maxClaims).toBeLessThanOrEqual(60);
    expect(facts.maxLineAllowedCents).toBeLessThanOrEqual(2_500_000n);
    const codes = new Set(rows.map((row) => row.procedureCode));
    expect(scalePooledCodes(SCALE_RELEASE_SHAPE).every((code) => codes.has(code))).toBe(true);
    // The products alternate; units 1 to 8; places 11 and 22; the eight quarters.
    expect(rows.slice(0, 4).map((row) => row.payerProduct)).toEqual(['medicare_ffs', 'ma_noncontracted', 'medicare_ffs', 'ma_noncontracted']);
    expect(new Set(rows.map((row) => row.units))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(new Set(rows.map((row) => row.placeOfService))).toEqual(new Set(['11', '22']));
    expect(new Set(rows.map((row) => row.serviceBand)).size).toBe(8);
    expect(new Set(rows.map(lineKey)).size).toBe(rows.length);
  });

  it('has variants that keep the plan and differ in most of their codes and in every row of them', () => {
    const base = worstShapeRows();
    const codesOf = (rows: readonly { readonly procedureCode: string }[]) => new Set(rows.map((row) => row.procedureCode));
    const pooled = new Set(scalePooledCodes(SCALE_RELEASE_SHAPE));
    for (const variant of [1, 2, 3]) {
      const rows = worstShapeRows(SCALE_RELEASE_SHAPE, undefined, undefined, variant);
      const facts = uploadShapeFacts(rows);
      expect([facts.rows, facts.pricedRows, facts.distinctPricedLines]).toEqual([50_000, 50_000, 50_000]);
      expect(facts.distinctCodes).toBeGreaterThanOrEqual(15_000);
      expect(facts.pooledRows).toBeGreaterThanOrEqual(25_000);
      expect(facts.changeRows).toBeGreaterThanOrEqual(5_000);
      const codes = codesOf(rows);
      expect([...pooled].every((code) => codes.has(code))).toBe(true);
      // Outside the pooled and corrected codes every variant shares, it starts its other codes a quarter further round.
      const baseKeys = new Set(base.map(lineKey));
      expect(rows.filter((row) => !baseKeys.has(lineKey(row))).length).toBeGreaterThan(5_000);
    }
    expect(worstShapeRows(SCALE_RELEASE_SHAPE, undefined, undefined, 0)).toEqual(base);
    expect(() => worstShapeRows(SCALE_RELEASE_SHAPE, undefined, undefined, 4)).toThrow(RangeError);
  });

  it('is the same every time', () => {
    expect(worstShapeRows(SMALL_SCALE_RELEASE_SHAPE, { pooledRows: 500, changeRows: 100, codes: 300 }, 1_000)).toEqual(worstShapeRows(SMALL_SCALE_RELEASE_SHAPE, { pooledRows: 500, changeRows: 100, codes: 300 }, 1_000));
  });
});

describe('the small upload and the ZIPs', () => {
  it('is 25 rows across all six products, each of 11 or more claim lines', () => {
    const rows = smallUploadRows();
    expect(rows).toHaveLength(25);
    expect(new Set(rows.map((row) => row.payerProduct))).toEqual(new Set(SYNTH_SCREENING_PAYER_PRODUCTS));
    expect(rows.every((row) => row.claimCount >= 11)).toBe(true);
    expect(new Set(rows.map(lineKey)).size).toBe(25);
  });

  it('gives each set of uploads ZIPs in distinct localities, none needing a ZIP+4, no ZIP twice', () => {
    const sets = uploadZips(SCALE_RELEASE_SHAPE, 5, 4);
    const zips = scaleZips(SCALE_RELEASE_SHAPE);
    const byZip = new Map(zips.map((zip) => [zip.zip, zip]));
    expect(new Set(sets.flat()).size).toBe(20);
    for (const set of sets) {
      expect(new Set(set.map((zip) => byZip.get(zip)?.localityIndex)).size).toBe(4);
      expect(set.every((zip) => byZip.get(zip)?.plusFour === false)).toBe(true);
    }
    expect(() => uploadZips(SMALL_SCALE_RELEASE_SHAPE, 1, scaleLocalities(SMALL_SCALE_RELEASE_SHAPE).length + 1)).toThrow(RangeError);
  });
});
