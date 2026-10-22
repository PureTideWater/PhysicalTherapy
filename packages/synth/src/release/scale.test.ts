import { describe, expect, it } from 'vitest';

import {
  SCALE_RELEASE_NUMBER,
  SCALE_RELEASE_SHAPE,
  SCALE_THERAPY_CODES,
  SCALE_THERAPY_POOLED,
  SMALL_SCALE_RELEASE_SHAPE,
  type ScaleSourceFile,
  correctionDate,
  scaleCodes,
  scaleCorrectedCodes,
  scaleLocalities,
  scaleMueCodes,
  scalePlusFourRanges,
  scalePooledCodes,
  scalePromptPayStates,
  scaleRecordCounts,
  scaleSourceFiles,
  scaleZip9Size,
  scaleZips,
} from './scale';

/**
 * The production-shaped SYNTHETIC release's sources (audit #53 part 1): counts follow the shape, every file says
 * SYNTHETIC (the fixed-width ZIP5 and ZIP9 files aside, which have no room), every value is patterned and the generation
 * is deterministic. tools/release/scale.test.ts runs the small shape through the real parsers and loader.
 */

const SMALL = SMALL_SCALE_RELEASE_SHAPE;
const files = (): ScaleSourceFile[] => [...scaleSourceFiles(SMALL)];
/** The data lines of a delimited file: those after its heading row (the row the parser looks for). */
function dataLines(file: ScaleSourceFile): string[] {
  const lines = file.text.split('\n').filter((line) => line !== '');
  if (file.type === 'locality_map' || file.type === 'locality_map_plus_four') {
    return lines;
  }
  const heading = lines.findIndex((line) => /^(HCPCS|Medicare Administrative|applicability|Column 1|Code,)/.test(line));
  return lines.slice(heading + 1).filter((line) => !line.startsWith('* SYNTHETIC'));
}

describe('the scale release’s shape', () => {
  it('is release 900100, its counts at the design’s figures', () => {
    expect(SCALE_RELEASE_NUMBER).toBe(900_100);
    expect(SCALE_RELEASE_SHAPE).toMatchObject({ years: [2025, 2026], rvuCodes: 19_000, localities: 109, zips: 42_000, pooledCodes: 150, mueCodes: 15_000, ptpPairs: 2_000_000, ptpFileRecords: 100_000 });
    const counts = scaleRecordCounts(SCALE_RELEASE_SHAPE);
    expect(counts).toEqual({
      pfs_rvu: 2 * (19_000 + 380),
      pfs_gpci: 218,
      locality_map: 84_000,
      // One record a year for each of the 1,273 ZIPs split across localities (PR 6b).
      locality_map_plus_four: 2_546,
      conversion_factor: 4,
      mppr_rate: 300,
      ncci_mue: 120_000,
      ncci_ptp: 2_000_000,
      carc: 400,
      rarc: 1_200,
      claim_status_code: 300,
    });
    expect(Object.values(counts).reduce((total, count) => total + count, 0)).toBeGreaterThan(2_240_000);
    // The ZIP9 files' size, reported by the capacity test (open item O8): forty ranges of two codes a split ZIP.
    expect(scaleZip9Size(SCALE_RELEASE_SHAPE)).toEqual({ records: 2_546, rangesPerRecord: 40, linesPerYear: 101_840, bytesPerYear: 8_249_040 });
  });

  it('lists the therapy codes first, then distinct five-character codes, the pooled ones the therapy codes’ eight and the rest from 97000', () => {
    const codes = scaleCodes(SCALE_RELEASE_SHAPE);
    expect(codes).toHaveLength(19_000);
    expect(new Set(codes).size).toBe(19_000);
    expect(codes.slice(0, 12)).toEqual([...SCALE_THERAPY_CODES]);
    expect(codes.every((code) => /^[0-9A-Z]{5}$/.test(code))).toBe(true);
    const pooled = scalePooledCodes(SCALE_RELEASE_SHAPE);
    expect(pooled).toHaveLength(150);
    expect(pooled.slice(0, 8)).toEqual([...SCALE_THERAPY_POOLED]);
    expect(new Set(pooled).size).toBe(150);
    const corrected = scaleCorrectedCodes(SCALE_RELEASE_SHAPE);
    expect(corrected).toHaveLength(380);
    expect(corrected.some((code) => (SCALE_THERAPY_CODES as readonly string[]).includes(code))).toBe(false);
    expect(scaleMueCodes(SCALE_RELEASE_SHAPE)).toHaveLength(15_000);
    expect(correctionDate(SCALE_RELEASE_SHAPE, 2026)).toBe('2026-05-16');
  });

  it('spreads 42,000 ZIPs round 109 localities, 3% of them needing the ZIP+4, none in the reserved 00000 to 00099', () => {
    const zips = scaleZips(SCALE_RELEASE_SHAPE);
    expect(zips).toHaveLength(42_000);
    expect(new Set(zips.map((zip) => zip.zip)).size).toBe(42_000);
    expect(zips.every((zip) => /^\d{5}$/.test(zip.zip) && zip.zip >= '00100')).toBe(true);
    expect(new Set(zips.map((zip) => zip.localityIndex)).size).toBe(109);
    // 3% need the ZIP+4: between 2.9% and 3.2% of them, counted in thousandths.
    const perThousand = (zips.filter((zip) => zip.plusFour).length * 1000) / zips.length;
    expect(perThousand).toBeGreaterThan(29);
    expect(perThousand).toBeLessThan(32);
    const localities = scaleLocalities(SCALE_RELEASE_SHAPE);
    expect(new Set(localities.map((locality) => `${locality.carrier}-${locality.locality}`)).size).toBe(109);
    expect(localities.every((locality) => /^999\d\d$/.test(locality.carrier) && locality.carrier !== '99999')).toBe(true);
    expect(scalePromptPayStates(SCALE_RELEASE_SHAPE)).toHaveLength(51);
    expect(new Set(scalePromptPayStates(SCALE_RELEASE_SHAPE)).size).toBe(51);
    expect(scalePromptPayStates(SCALE_RELEASE_SHAPE).every((state) => /^[YZ][A-Z]$/.test(state))).toBe(true);
  });
});

describe('the scale release’s source files (small shape)', () => {
  it('generates the same bytes every time', () => {
    expect(files().map((file) => file.text)).toEqual(files().map((file) => file.text));
  });

  it('says SYNTHETIC on every file’s first line but the fixed-width ZIP5 and ZIP9 files’, and names each file SYNTHETIC', () => {
    for (const file of files()) {
      expect(file.name, file.name).toContain('SYNTHETIC');
      if (file.type !== 'locality_map' && file.type !== 'locality_map_plus_four') {
        expect(file.text.split('\n')[0], file.name).toMatch(/^"?SYNTHETIC/);
      }
    }
  });

  it('holds as many rows of each type as the shape says, the corrected codes before and after their day', () => {
    const all = files();
    const rows = (type: ScaleSourceFile['type']) => all.filter((file) => file.type === type).reduce((total, file) => total + dataLines(file).length, 0);
    const counts = scaleRecordCounts(SMALL);
    for (const type of ['pfs_rvu', 'pfs_gpci', 'locality_map', 'conversion_factor', 'mppr_rate', 'ncci_mue', 'ncci_ptp', 'carc', 'rarc', 'claim_status_code'] as const) {
      expect(rows(type), type).toBe(counts[type]);
    }
    // The ZIP9 file lists codes, one a line; the parser folds each ZIP's into one record.
    expect(rows('locality_map_plus_four')).toBe(SMALL.years.length * scaleZip9Size(SMALL).linesPerYear);
    expect(counts.locality_map_plus_four).toBe(scaleZip9Size(SMALL).records);
    const corrections = all.filter((file) => file.name.includes('CORRECTION'));
    expect(corrections.map((file) => [file.name, file.effectiveFrom, file.effectiveTo])).toEqual([
      ['PPRRVU2025_SYNTHETIC_SCALE_BEFORE_CORRECTION.csv', '2025-01-01', '2025-05-15'],
      ['PPRRVU2025_SYNTHETIC_SCALE_CORRECTION.csv', '2025-05-16', '2025-12-31'],
      ['PPRRVU2026_SYNTHETIC_SCALE_BEFORE_CORRECTION.csv', '2026-01-01', '2026-05-15'],
      ['PPRRVU2026_SYNTHETIC_SCALE_CORRECTION.csv', '2026-05-16', '2026-12-31'],
    ]);
    expect(all.filter((file) => file.type === 'ncci_mue').map((file) => [file.effectiveFrom, file.effectiveTo])).toEqual([
      ['2025-01-01', '2025-03-31'],
      ['2025-04-01', '2025-06-30'],
      ['2025-07-01', '2025-09-30'],
      ['2025-10-01', '2025-12-31'],
      ['2026-01-01', '2026-03-31'],
      ['2026-04-01', '2026-06-30'],
      ['2026-07-01', '2026-09-30'],
      ['2026-10-01', '2026-12-31'],
    ]);
  });

  it('pairs no code with itself in the PTP table, never twice, at most ptpFileRecords a file, some ended at a quarter’s end', () => {
    const ptp = files().filter((file) => file.type === 'ncci_ptp');
    expect(ptp.length).toBe(Math.ceil(SMALL.ptpPairs / SMALL.ptpFileRecords));
    const pairs = ptp.flatMap((file) => dataLines(file).map((line) => line.split('\t')));
    expect(ptp.every((file) => dataLines(file).length <= SMALL.ptpFileRecords)).toBe(true);
    expect(pairs.every(([column1, column2]) => column1 !== column2)).toBe(true);
    expect(new Set(pairs.map(([column1, column2]) => `${column1 ?? ''}-${column2 ?? ''}`)).size).toBe(SMALL.ptpPairs);
    const deletions = new Set(pairs.map((cells) => cells[4]).filter((deletion) => deletion !== '*'));
    expect([...deletions].every((deletion) => /^20(25|26)(0401|0701|1001)$|^20260101$/.test(deletion ?? ''))).toBe(true);
    expect(deletions.size).toBeGreaterThan(1);
  });

  it('loads the MPPR and MUE content for all eight quarters an upload may name, 2025-Q1 to 2026-Q4, so no capacity row is left out (PR 6b)', () => {
    const all = files();
    /** Whether a type's files, end to end, cover every day of 2025 and 2026. */
    const covers = (type: ScaleSourceFile['type']) => {
      const windows = all
        .filter((file) => file.type === type)
        .map((file) => [file.effectiveFrom, file.effectiveTo ?? '9999-12-31'] as const)
        .sort(([a], [b]) => (a < b ? -1 : 1));
      let through = '2024-12-31';
      for (const [from, to] of windows) {
        const next = new Date(`${through}T00:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        if (from > next.toISOString().slice(0, 10)) {
          return false;
        }
        through = to > through ? to : through;
      }
      return through >= '2026-12-31';
    };
    expect(covers('ncci_mue')).toBe(true);
    expect(covers('mppr_rate')).toBe(true);
    // Every MUE and per-code MPPR file names its codes, the therapy codes the uploads price among them.
    for (const file of all.filter((entry) => entry.type === 'ncci_mue' || entry.type === 'mppr_rate')) {
      const codes = new Set(dataLines(file).map((line) => line.split(',')[0]));
      expect(SCALE_THERAPY_POOLED.every((code) => codes.has(code)), file.name).toBe(true);
    }
  });

  it('writes the ZIP9 file in its fixed-width layout for every flagged ZIP: ranges alternating between its locality and the next, gaps unlisted', () => {
    const zip9 = files().filter((file) => file.type === 'locality_map_plus_four');
    expect(zip9.map((file) => [file.name, file.effectiveFrom, file.effectiveTo])).toEqual([
      ['ZIP9_2025_SYNTHETIC_SCALE.txt', '2025-01-01', '2025-12-31'],
      ['ZIP9_2026_SYNTHETIC_SCALE.txt', '2026-01-01', '2026-12-31'],
    ]);
    const lines = dataLines(zip9[0] as ScaleSourceFile);
    const flagged = scaleZips(SMALL).filter((zip) => zip.plusFour);
    expect(new Set(lines.map((line) => line.slice(2, 7)))).toEqual(new Set(flagged.map((zip) => zip.zip)));
    const first = lines[0] ?? '';
    expect(first).toHaveLength(80);
    expect([first.slice(0, 2), first.slice(2, 7), first.charAt(20), first.slice(21, 25), first.slice(75)]).toEqual(['ZZ', flagged[0]?.zip, '1', '0000', '20251']);
    const localities = scaleLocalities(SMALL);
    const zip = flagged[0] as (typeof flagged)[number];
    const ranges = scalePlusFourRanges(SMALL, zip);
    expect(ranges).toHaveLength(SMALL.plusFourRanges);
    expect(ranges.map((range) => range.localityIndex)).toEqual(ranges.map((_, index) => (index % 2 === 0 ? zip.localityIndex : (zip.localityIndex + 1) % SMALL.localities)));
    // Each range's lines carry its locality's carrier and number; codes between ranges are on no line.
    const ofZip = lines.filter((line) => line.slice(2, 7) === zip.zip);
    expect(ofZip).toHaveLength(SMALL.plusFourRanges * SMALL.plusFourRangeCodes);
    for (const range of ranges) {
      const locality = localities[range.localityIndex];
      const inRange = ofZip.filter((line) => line.slice(21, 25) >= range.from && line.slice(21, 25) <= range.to);
      expect(inRange).toHaveLength(SMALL.plusFourRangeCodes);
      expect(inRange.every((line) => line.slice(7, 12) === locality?.carrier && line.slice(12, 14) === locality.locality)).toBe(true);
    }
    expect(ofZip.some((line) => line.slice(21, 25) === String(Number.parseInt(ranges[0]?.to ?? '', 10) + 1).padStart(4, '0'))).toBe(false);
  });

  it('writes the ZIP5 file in its fixed-width layout: state, ZIP, carrier, locality, and the ZIP+4 flag in position 21', () => {
    const zip5 = files().find((file) => file.type === 'locality_map');
    const first = zip5?.text.split('\n')[0] ?? '';
    expect(first.slice(0, 2)).toBe('ZZ');
    expect(first.slice(2, 7)).toBe('00100');
    expect(first.slice(7, 12)).toBe('99901');
    expect(first.slice(12, 14)).toBe('01');
    expect(first.charAt(20)).toBe('0');
    const flagged = zip5?.text.split('\n').filter((line) => line.charAt(20) === '1') ?? [];
    expect(flagged.length).toBe(scaleZips(SMALL).filter((zip) => zip.plusFour).length);
  });
});
