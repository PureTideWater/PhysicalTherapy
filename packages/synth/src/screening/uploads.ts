import {
  SCALE_RELEASE_SHAPE,
  SCALE_THERAPY_CODES,
  type ScaleReleaseShape,
  correctionDate,
  scaleCodes,
  scaleCorrectedCodes,
  scaleLocalities,
  scalePooledCodes,
  scaleZips,
} from '../release/scale';

/**
 * The screening capacity test's SYNTHETIC uploads (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits"): rows of totals in the screening's eight columns, invented, for the production-shaped synthetic release
 * (release/scale.ts). No row is a patient's: each is a code's totals over 11 claim lines or more in a quarter.
 *
 * - The practice shape: the 50,000 rows the screening's large test generates (12 codes, 8 modifier sets, 2 places,
 *   units 1 to 6, 8 quarters and all six products; 9,216 distinct priced lines). A test holds the two equal.
 * - The worst shape: 50,000 rows, every one of a priced product (Original Medicare and Medicare Advantage without a
 *   contract alternating), every line distinct (code, modifiers, units, place and quarter); at least 15,000 codes,
 *   every code on the release's MPPR file among them and at least half the rows on those codes (priced twice); at
 *   least a tenth of the rows on a code whose relative values the release corrects inside that row's quarter; 11 to 60
 *   claim lines a row and at most $25,000 a line.
 * - The small upload: 25 rows across all six products, submitted behind three large ones.
 */

export const SYNTH_SCREENING_PAYER_PRODUCTS = ['medicare_ffs', 'ma_noncontracted', 'ma_contracted', 'commercial', 'medicaid', 'other'] as const;
export type SynthScreeningPayerProduct = (typeof SYNTH_SCREENING_PAYER_PRODUCTS)[number];

/** One row of a screening upload, as the screening's ScreeningRow holds it (modifiers sorted). */
export interface SynthScreeningRow {
  readonly procedureCode: string;
  readonly modifiers: readonly string[];
  readonly units: number;
  readonly placeOfService: string;
  readonly payerProduct: SynthScreeningPayerProduct;
  readonly serviceBand: string;
  readonly allowedCents: bigint;
  readonly claimCount: number;
}

/** The most rows an upload may hold. */
export const SYNTH_SCREENING_MAX_ROWS = 50_000;
/** The fewest claim lines a row may sum (the CMS small-cell standard). */
export const SYNTH_SCREENING_MIN_CLAIM_LINES = 11;

/** The eight quarters every shape spans, as the large test orders them. */
export const SCREENING_UPLOAD_BANDS = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4', '2025-Q1', '2025-Q2', '2025-Q3', '2025-Q4'] as const;
/** The eight modifier sets of the practice shape, as the large test orders them. */
export const SCREENING_UPLOAD_MODIFIER_SETS: readonly (readonly string[])[] = [[], ['GP'], ['GO'], ['CQ', 'GP'], ['59', 'GP'], ['GP', 'KX'], ['CO', 'GO'], ['GN']];

function row(
  procedureCode: string,
  payerProduct: SynthScreeningPayerProduct,
  options: { readonly modifiers: readonly string[]; readonly units: number; readonly place: string; readonly band: string; readonly allowedCents: bigint; readonly claims: number },
): SynthScreeningRow {
  return {
    procedureCode,
    modifiers: [...options.modifiers].sort(),
    units: options.units,
    placeOfService: options.place,
    payerProduct,
    serviceBand: options.band,
    allowedCents: options.allowedCents,
    claimCount: options.claims,
  };
}

/**
 * The practice shape: exactly the rows apps/web/src/lib/screening/screening.large.db.test.ts uploads (the same loops in
 * the same order), 50,000 distinct rows of 11 to 50 claim lines.
 */
export function practiceShapeRows(): SynthScreeningRow[] {
  const all: SynthScreeningRow[] = [];
  for (const payerProduct of SYNTH_SCREENING_PAYER_PRODUCTS) {
    for (const band of SCREENING_UPLOAD_BANDS) {
      for (const code of SCALE_THERAPY_CODES) {
        for (const modifiers of SCREENING_UPLOAD_MODIFIER_SETS) {
          for (const place of ['11', '22']) {
            for (let units = 1; units <= 6; units += 1) {
              if (all.length < SYNTH_SCREENING_MAX_ROWS) {
                all.push(row(code, payerProduct, { modifiers, units, place, band, allowedCents: BigInt(1_000 + ((all.length * 37) % 90_000)), claims: SYNTH_SCREENING_MIN_CLAIM_LINES + (all.length % 40) }));
              }
            }
          }
        }
      }
    }
  }
  return all;
}

/** The distinct line a row prices as: code, modifiers, units, place and quarter. */
export function lineKey(item: Pick<SynthScreeningRow, 'procedureCode' | 'modifiers' | 'units' | 'placeOfService' | 'serviceBand'>): string {
  return [item.procedureCode, [...item.modifiers].sort().join(' '), String(item.units), item.placeOfService, item.serviceBand].join('\t');
}

/** The worst shape's parts, by how many rows each takes. */
export interface WorstShapePlan {
  /** Rows on the MPPR file's codes (priced twice): at least half. */
  readonly pooledRows: number;
  /** Rows on a corrected code in the second quarter of a year (a mid-quarter record change in the row's quarter). */
  readonly changeRows: number;
  /** Distinct codes in all, at least. */
  readonly codes: number;
}

export const WORST_SHAPE_PLAN: WorstShapePlan = { pooledRows: 25_000, changeRows: 5_400, codes: 15_000 };

/**
 * The worst shape, deterministic, for the release's shape: the pooled codes' rows first (every combination of the
 * eight modifier sets, units 1 to 8, both places and the eight quarters, round the codes), then the corrected codes'
 * second-quarter rows, then one row for each of as many other codes as the plan needs and, with what is left, more
 * rows round those codes. Every line is distinct; the products alternate. Each loop stops when its combinations run
 * out, so a shape too small for the plan gives fewer rows rather than none (the tests count them).
 */
export function worstShapeRows(shape: ScaleReleaseShape = SCALE_RELEASE_SHAPE, plan: WorstShapePlan = WORST_SHAPE_PLAN, total: number = SYNTH_SCREENING_MAX_ROWS): SynthScreeningRow[] {
  const rows: SynthScreeningRow[] = [];
  const keys = new Set<string>();
  const add = (code: string, combination: number, band: string): boolean => {
    if (rows.length >= total) {
      return false;
    }
    const modifiers = SCREENING_UPLOAD_MODIFIER_SETS[combination % SCREENING_UPLOAD_MODIFIER_SETS.length] ?? [];
    const units = 1 + (Math.floor(combination / SCREENING_UPLOAD_MODIFIER_SETS.length) % 8);
    const place = Math.floor(combination / (SCREENING_UPLOAD_MODIFIER_SETS.length * 8)) % 2 === 0 ? '11' : '22';
    const candidate = row(code, rows.length % 2 === 0 ? 'medicare_ffs' : 'ma_noncontracted', {
      modifiers,
      units,
      place,
      band,
      claims: SYNTH_SCREENING_MIN_CLAIM_LINES + (rows.length % 50),
      allowedCents: 0n,
    });
    const key = lineKey(candidate);
    if (keys.has(key)) {
      return false;
    }
    keys.add(key);
    // At most $250.00 a claim line: far inside the $25,000 a line any row may show.
    rows.push({ ...candidate, allowedCents: BigInt(candidate.claimCount) * BigInt(2_000 + ((rows.length * 37) % 23_000)) });
    return true;
  };
  const bands = SCREENING_UPLOAD_BANDS;
  // Every combination of modifier set, units and place: 8 x 8 x 2.
  const combinations = SCREENING_UPLOAD_MODIFIER_SETS.length * 8 * 2;
  const pooled = scalePooledCodes(shape);
  for (let step = 0; rows.length < plan.pooledRows && step < pooled.length * combinations * bands.length; step += 1) {
    const code = pooled[step % pooled.length] as string;
    const round = Math.floor(step / pooled.length);
    add(code, round % combinations, bands[(round + Math.floor(round / combinations) + step) % bands.length] as string);
  }
  const corrected = scaleCorrectedCodes(shape);
  const changeBands = shape.years.map((year) => `${String(year)}-Q${String(Math.floor((Number.parseInt(correctionDate(shape, year).slice(5, 7), 10) - 1) / 3) + 1)}`);
  const changeTarget = plan.pooledRows + plan.changeRows;
  for (let step = 0; rows.length < changeTarget && step < corrected.length * changeBands.length * combinations; step += 1) {
    const code = corrected[step % corrected.length] as string;
    const round = Math.floor(step / corrected.length);
    add(code, Math.floor(round / changeBands.length) % combinations, changeBands[round % changeBands.length] as string);
  }
  const taken = new Set([...pooled, ...corrected]);
  const others = scaleCodes(shape).filter((code) => !taken.has(code));
  const needed = Math.max(0, plan.codes - new Set(rows.map((item) => item.procedureCode)).size);
  const spread = others.slice(0, Math.max(needed, 1));
  for (let step = 0; rows.length < total && step < spread.length * combinations * bands.length; step += 1) {
    const code = spread[step % spread.length] as string;
    const round = Math.floor(step / spread.length);
    add(code, (step + round) % combinations, bands[(step + round * 3) % bands.length] as string);
  }
  return rows;
}

/** A small upload: 25 distinct rows of the therapy codes across all six products, 2026's quarters, 11 to 35 claim lines each. */
export function smallUploadRows(): SynthScreeningRow[] {
  return Array.from({ length: 25 }, (_, index) => {
    const code = SCALE_THERAPY_CODES[index % SCALE_THERAPY_CODES.length] as string;
    return row(code, SYNTH_SCREENING_PAYER_PRODUCTS[index % SYNTH_SCREENING_PAYER_PRODUCTS.length] as SynthScreeningPayerProduct, {
      modifiers: SCREENING_UPLOAD_MODIFIER_SETS[index % 4] ?? [],
      units: 1 + (index % 5),
      place: index % 2 === 0 ? '11' : '22',
      band: SCREENING_UPLOAD_BANDS[index % 4] as string,
      allowedCents: BigInt(1_500 * (11 + index)),
      claims: 11 + index,
    });
  });
}

/** What a shape's rows come to: the figures the capacity report records beside each upload. */
export interface UploadShapeFacts {
  readonly rows: number;
  readonly distinctPricedLines: number;
  readonly distinctCodes: number;
  readonly pricedRows: number;
  readonly pooledRows: number;
  readonly changeRows: number;
  readonly minClaims: number;
  readonly maxClaims: number;
  readonly maxLineAllowedCents: bigint;
}

/** Counts a shape's rows against the release: pooled rows are on its MPPR file's codes; change rows on a corrected code in its correction quarter. */
export function uploadShapeFacts(rows: readonly SynthScreeningRow[], shape: ScaleReleaseShape = SCALE_RELEASE_SHAPE): UploadShapeFacts {
  const pooled = new Set(scalePooledCodes(shape));
  const corrected = new Set(scaleCorrectedCodes(shape));
  const changeBands = new Set(shape.years.map((year) => `${String(year)}-Q${String(Math.floor((Number.parseInt(correctionDate(shape, year).slice(5, 7), 10) - 1) / 3) + 1)}`));
  const priced = rows.filter((item) => item.payerProduct === 'medicare_ffs' || item.payerProduct === 'ma_noncontracted');
  return {
    rows: rows.length,
    distinctPricedLines: new Set(priced.map(lineKey)).size,
    distinctCodes: new Set(rows.map((item) => item.procedureCode)).size,
    pricedRows: priced.length,
    pooledRows: priced.filter((item) => pooled.has(item.procedureCode)).length,
    changeRows: priced.filter((item) => corrected.has(item.procedureCode) && changeBands.has(item.serviceBand)).length,
    minClaims: Math.min(...rows.map((item) => item.claimCount)),
    maxClaims: Math.max(...rows.map((item) => item.claimCount)),
    maxLineAllowedCents: rows.reduce((most, item) => {
      const line = item.allowedCents / BigInt(item.claimCount);
      return line > most ? line : most;
    }, 0n),
  };
}

/**
 * ZIPs for a run of uploads: each needs no ZIP+4, and each set of `perSet` lies in as many different localities. The
 * sets are distinct, so no upload of one scenario shares a ZIP with another's.
 */
export function uploadZips(shape: ScaleReleaseShape, sets: number, perSet: number): string[][] {
  const localities = scaleLocalities(shape).length;
  if (perSet > localities) {
    throw new RangeError('more ZIPs to a set than the release has localities');
  }
  const free = scaleZips(shape).filter((zip) => !zip.plusFour);
  const result: string[][] = [];
  let at = 0;
  for (let set = 0; set < sets; set += 1) {
    const chosen: string[] = [];
    const used = new Set<number>();
    while (chosen.length < perSet) {
      const zip = free[at];
      if (zip === undefined) {
        throw new RangeError('the release has too few ZIPs for these uploads');
      }
      at += 1;
      if (!used.has(zip.localityIndex)) {
        used.add(zip.localityIndex);
        chosen.push(zip.zip);
      }
    }
    result.push(chosen);
  }
  return result;
}
