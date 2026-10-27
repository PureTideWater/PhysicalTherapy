/**
 * The production-shaped SYNTHETIC rule release's source files (audit #53 part 1; docs/adr/0062, "Capacity under
 * production limits"): invented values in the layouts of the public files the rule parsers read
 * (packages/rules/src/parsers), at the sizes of CMS's current public files, so the screening's capacity test reads,
 * indexes and prices against a release as large as release 1 will be. tools/release/scale.ts runs these files
 * through the same parsers, record builder and manifest builder as the committed synthetic release and writes the
 * release outside the repository; it loads only into a scratch database (release 900100, reserved).
 *
 * Nothing here is CMS data. Every value is invented and patterned; every file says SYNTHETIC on its first line but
 * the ZIP5 and ZIP9 files, whose fixed-width layouts have no room for a banner. Each ZIP the ZIP5 file flags (one in
 * plusFourEvery, split across localities) has its ZIP+4 codes on the year's ZIP9 file (PR 6b, docs/adr/0064): its
 * ranges alternate between the ZIP's own locality and the next one, with codes no range lists between them. The carriers (99901 up), the localities' names
 * and the states (YA to ZY) are invented; the ZIPs are five-digit values from 00100 up, some of which are real ZIP
 * codes, with invented carriers, localities and values. Codes are five-character values: the twelve therapy codes
 * the practice-shaped upload uses, then 97000 to 97999 and 10000 up; some are real CPT codes, with invented values.
 *
 * Counts are at or above CMS's current public files (open item 9 of the design: #31 checks them against release 1's
 * real sources); each count's basis is on its field of SCALE_RELEASE_SHAPE.
 *
 * The quarterly shape (QUARTERLY_SCALE_RELEASE_SHAPE, release 900110; audit #30 and #31, docs/adr/0071) is the same
 * production shape with #30's windows: each year's PPRRVU, GPCI, ZIP5, ZIP9 and MUE files are four, one per CMS quarter
 * and windowed to it, as the importer takes them, kept for the six-year look-back and the current year. The weekly
 * real-size test (tools/release-capacity) prices under it; the shape without `windows` renders as before, byte for byte.
 */

/** The reserved release number of the scale release; no committed fixture uses it. */
export const SCALE_RELEASE_NUMBER = 900_100;

/** The reserved release number of the quarterly scale release; no committed fixture uses it, and it is never committed. */
export const QUARTERLY_SCALE_RELEASE_NUMBER = 900_110;

export interface ScaleReleaseShape {
  /** The fee schedule years the release covers, each priced over its four quarters. */
  readonly years: readonly number[];
  /** Codes on each year's relative value file. */
  readonly rvuCodes: number;
  /** One code in this many has its relative values corrected mid-quarter each year. */
  readonly correctedEvery: number;
  /** The day of each year on which those corrections take effect (MM-DD, inside the second quarter, not the 1st of a month). */
  readonly correctionDay: string;
  /** Payment localities on each year's GPCI file. */
  readonly localities: number;
  /** ZIP codes on each year's ZIP5 file. */
  readonly zips: number;
  /** One ZIP in this many needs its ZIP+4 (split across localities). */
  readonly plusFourEvery: number;
  /** The ranges of ZIP+4 codes each such ZIP has on the ZIP9 file, alternating between two localities. */
  readonly plusFourRanges: number;
  /** The codes each range lists (one ZIP9 line each). */
  readonly plusFourRangeCodes: number;
  /** Codes on each year's therapy MPPR rate file (the twelve therapy codes' eight pooled ones among them). */
  readonly pooledCodes: number;
  /** Codes on each quarter's practitioner MUE table. */
  readonly mueCodes: number;
  /** Practitioner procedure-to-procedure edits in force (open-ended, a share deleted at quarter ends). */
  readonly ptpPairs: number;
  /** The most edits one PTP file holds (CMS splits the table into several files a quarter). */
  readonly ptpFileRecords: number;
  readonly carcCodes: number;
  readonly rarcCodes: number;
  readonly claimStatusCodes: number;
  readonly promptPayStates: number;
  /**
   * How the files with no dates of their own are windowed: `year` (absent: the scale release 900100 as it has always
   * been) gives each year's PPRRVU, GPCI, ZIP5 and ZIP9 file the calendar year; `quarter` gives each year four of each,
   * one per CMS quarter (#30's importer), the corrected codes split inside the correction day's quarter. The MPPR list
   * and the conversion factors stay per calendar year, the MUE tables per quarter, PTP and the code lists unchanged.
   */
  readonly windows?: 'year' | 'quarter';
}

/** The production shape (the design's §3.2 table). */
export const SCALE_RELEASE_SHAPE: ScaleReleaseShape = {
  years: [2025, 2026],
  // The PPRRVU file lists about 16,000 to 19,000 HCPCS rows a year (codes with their modifier rows): 19,000 is at the top.
  rvuCodes: 19_000,
  // 2% of codes corrected inside a quarter, as CMS's quarterly correction files do.
  correctedEvery: 50,
  correctionDay: '05-16',
  // The GPCI file's payment localities since the 2017 consolidation (109).
  localities: 109,
  // The ZIP5 file's ZIP codes (about 42,000 five-digit ZIPs), 3% of them split across localities (ZIP+4 needed).
  zips: 42_000,
  plusFourEvery: 33,
  // CMS's ZIP9 file lists every ZIP+4 of those ZIPs; its layout is open item O1 (docs/adr/0064). Forty ranges a ZIP,
  // two codes each (a range's first and last line, as the record quotes them): a record per ZIP at least as long as a
  // real split ZIP's, about 101,800 lines a year, so the keyed read of one ZIP's record is measured at size (open item
  // O8).
  plusFourRanges: 40,
  plusFourRangeCodes: 2,
  // The therapy MPPR rate file's "always therapy" codes, rounded up to 150.
  pooledCodes: 150,
  // The practitioner services MUE table, about 15,000 codes a quarter.
  mueCodes: 15_000,
  // The full practitioner PTP table in force, about 2,000,000 edits.
  ptpPairs: 2_000_000,
  // At most 100,000 edits a file: the release loader reads each file's records into one push of spread arguments
  // (packages/rules/src/content.ts, readRelease), which overflows the call stack above about 120,000 (audit #31's
  // loader at real size). CMS's own files are larger; the design allowed up to 250,000.
  ptpFileRecords: 100_000,
  // X12's claim adjustment reason codes (about 400 with the deactivated ones), remittance remark codes (about 1,200)
  // and claim status codes (about 300); prompt-pay rules for the fifty states and the District of Columbia.
  carcCodes: 400,
  rarcCodes: 1_200,
  claimStatusCodes: 300,
  promptPayStates: 51,
};

/**
 * The production shape with #30's quarterly windows (release 900110; docs/adr/0071), seven years of them: the six-year
 * look-back's cutoff year (lookBackCutoff('2026-12-31') is 2020-01-01) to the current year. The counts' basis: RVU
 * 19,000 x 28 quarters (532,000) and 380 x 7 corrections (2,660), MUE 15,000 x 28 (420,000), ZIP5 42,000 x 28
 * (1,176,000), ZIP9 1,273 split ZIPs x 28 (35,644 records, each as long as 900100's), GPCI 109 x 28 (3,052), PTP
 * 2,000,000, and per year 150 MPPR codes and two conversion factors: about 4.17 million records against 900100's about
 * 2.25 million.
 */
export const QUARTERLY_SCALE_RELEASE_SHAPE: ScaleReleaseShape = {
  ...SCALE_RELEASE_SHAPE,
  years: [2020, 2021, 2022, 2023, 2024, 2025, 2026],
  windows: 'quarter',
};

/** A shape small enough for unit tests, with every feature of the production one. */
export const SMALL_SCALE_RELEASE_SHAPE: ScaleReleaseShape = {
  years: [2025, 2026],
  rvuCodes: 400,
  correctedEvery: 50,
  correctionDay: '05-16',
  localities: 5,
  zips: 300,
  plusFourEvery: 33,
  plusFourRanges: 4,
  plusFourRangeCodes: 3,
  pooledCodes: 20,
  mueCodes: 300,
  ptpPairs: 3_000,
  ptpFileRecords: 1_000,
  carcCodes: 20,
  rarcCodes: 30,
  claimStatusCodes: 10,
  promptPayStates: 3,
};

/** The twelve therapy codes of the practice-shaped upload (the screening's 50,000-row test file), first in the release. */
export const SCALE_THERAPY_CODES = ['97110', '97112', '97116', '97140', '97530', '97161', '97162', '97163', '97164', '97026', '97035', 'G0283'] as const;
/** The therapy codes in the reduction across codes (on the MPPR file), as in the committed synthetic release. */
export const SCALE_THERAPY_POOLED = ['97110', '97112', '97116', '97140', '97530', '97026', '97035', 'G0283'] as const;

/** The record types the scale release's source files carry (the parsers' importable types). */
export type ScaleSourceType =
  | 'pfs_rvu'
  | 'pfs_gpci'
  | 'locality_map'
  | 'locality_map_plus_four'
  | 'conversion_factor'
  | 'mppr_rate'
  | 'ncci_ptp'
  | 'ncci_mue'
  | 'carc'
  | 'rarc'
  | 'claim_status_code';

/** One generated source file: what parses it, the window it takes, and its text. */
export interface ScaleSourceFile {
  readonly type: ScaleSourceType;
  /** The file's name, as a CMS download would be named (SYNTHETIC in it). */
  readonly name: string;
  /** The year the parser is told (a fee schedule year, or the year the window starts). */
  readonly year: number;
  readonly effectiveFrom: string;
  /** Inclusive; null for no end. */
  readonly effectiveTo: string | null;
  readonly text: string;
}

/** The release's codes, in order: the therapy codes, then 97000 to 97999, then 10000 up. */
export function scaleCodes(shape: ScaleReleaseShape): string[] {
  const codes: string[] = [...SCALE_THERAPY_CODES];
  const taken = new Set<string>(codes);
  const add = (code: string) => {
    if (codes.length < shape.rvuCodes && !taken.has(code)) {
      taken.add(code);
      codes.push(code);
    }
  };
  for (let n = 97_000; n <= 97_999 && codes.length < shape.rvuCodes; n += 1) {
    add(String(n));
  }
  for (let n = 10_000; codes.length < shape.rvuCodes; n += 1) {
    add(String(n));
  }
  return codes;
}

/** The codes on the MPPR file: the eight pooled therapy codes, then the first of 97000 up. */
export function scalePooledCodes(shape: ScaleReleaseShape): string[] {
  const codes = scaleCodes(shape);
  const pooled: string[] = [...SCALE_THERAPY_POOLED];
  for (const code of codes.slice(SCALE_THERAPY_CODES.length)) {
    if (pooled.length >= shape.pooledCodes) {
      break;
    }
    pooled.push(code);
  }
  return pooled;
}

/** Whether a code (by its index in scaleCodes) has its relative values corrected mid-quarter (never a therapy code). */
export function correctedCodeIndex(shape: ScaleReleaseShape, index: number): boolean {
  return index >= SCALE_THERAPY_CODES.length && (index - SCALE_THERAPY_CODES.length) % shape.correctedEvery === 0;
}

/** The codes whose relative values are corrected mid-quarter each year. */
export function scaleCorrectedCodes(shape: ScaleReleaseShape): string[] {
  return scaleCodes(shape).filter((_, index) => correctedCodeIndex(shape, index));
}

/** The first day a corrected record is in force, in a year. */
export function correctionDate(shape: ScaleReleaseShape, year: number): string {
  return `${String(year)}-${shape.correctionDay}`;
}

/** The CMS quarter (1 to 4) the corrections take effect in. */
export function correctionQuarter(shape: ScaleReleaseShape): number {
  return Math.floor((Number.parseInt(shape.correctionDay.slice(0, 2), 10) - 1) / 3) + 1;
}

/** The files each year has of a type with no dates of its own: one under `year` windows, four under `quarter`. */
export function periodsPerYear(shape: ScaleReleaseShape): number {
  return shape.windows === 'quarter' ? 4 : 1;
}

/** One payment locality: its carrier and two-digit number. */
export interface ScaleLocality {
  readonly carrier: string;
  readonly locality: string;
}

/** The localities: ten to a carrier, carriers 99901 up. */
export function scaleLocalities(shape: ScaleReleaseShape): ScaleLocality[] {
  return Array.from({ length: shape.localities }, (_, index) => ({ carrier: String(99_901 + Math.floor(index / 10)), locality: String((index % 10) + 1).padStart(2, '0') }));
}

/** One ZIP of the ZIP5 file: its locality and whether the ZIP+4 decides it. */
export interface ScaleZip {
  readonly zip: string;
  readonly localityIndex: number;
  readonly plusFour: boolean;
}

/** The ZIPs: 00100 up, round the localities, one in plusFourEvery split across localities. */
export function scaleZips(shape: ScaleReleaseShape): ScaleZip[] {
  return Array.from({ length: shape.zips }, (_, index) => ({ zip: String(100 + index).padStart(5, '0'), localityIndex: index % shape.localities, plusFour: index % shape.plusFourEvery === 5 }));
}

/** One range of a split ZIP's ZIP+4 codes on the ZIP9 file: its first and last code and its locality. */
export interface ScalePlusFourRange {
  readonly from: string;
  readonly to: string;
  readonly localityIndex: number;
}

/**
 * A split ZIP's ranges on the ZIP9 file: range r starts at code r x (10000 / plusFourRanges) and lists
 * plusFourRangeCodes consecutive codes; even ranges are in the ZIP's own locality, odd ones in the next locality. The
 * codes between ranges are on no line, so they are in no range.
 */
export function scalePlusFourRanges(shape: ScaleReleaseShape, zip: ScaleZip): ScalePlusFourRange[] {
  const step = Math.floor(10_000 / shape.plusFourRanges);
  return Array.from({ length: shape.plusFourRanges }, (_, range) => ({
    from: String(range * step).padStart(4, '0'),
    to: String(range * step + shape.plusFourRangeCodes - 1).padStart(4, '0'),
    localityIndex: range % 2 === 0 ? zip.localityIndex : (zip.localityIndex + 1) % shape.localities,
  }));
}

/** The ZIP9 line's length: the layout's 75 positions, the year and quarter, and the line feed. */
const ZIP9_LINE_BYTES = 75 + 5 + 1;

/**
 * The ZIP9 files' size (open item O8, reported by the capacity test): a record per split ZIP and year, the ranges each
 * holds, and each year's lines and bytes.
 */
export function scaleZip9Size(shape: ScaleReleaseShape): { readonly records: number; readonly rangesPerRecord: number; readonly linesPerYear: number; readonly bytesPerYear: number } {
  const split = scaleZips(shape).filter((zip) => zip.plusFour).length;
  const periods = periodsPerYear(shape);
  const linesPerYear = periods * split * shape.plusFourRanges * shape.plusFourRangeCodes;
  return { records: shape.years.length * periods * split, rangesPerRecord: shape.plusFourRanges, linesPerYear, bytesPerYear: linesPerYear * ZIP9_LINE_BYTES };
}

/** The codes on each quarter's MUE table: the first mueCodes codes. */
export function scaleMueCodes(shape: ScaleReleaseShape): string[] {
  return scaleCodes(shape).slice(0, shape.mueCodes);
}

/** A code's medically unlikely edit in a quarter (8 to 60 units; one code in a hundred changes each quarter). */
export function mueValue(index: number, quarter: number): number {
  return 8 + ((index + (index % 100 === 3 ? quarter : 0)) % 53);
}

const cents = (hundredths: number): string => `${String(Math.floor(hundredths / 100))}.${String(hundredths % 100).padStart(2, '0')}`;

/** A code's relative values in a year, in hundredths of an RVU (corrected: the values after the mid-quarter correction). */
export function rvuHundredths(index: number, year: number, corrected = false): { readonly work: number; readonly peNonFacility: number; readonly peFacility: number; readonly mp: number } {
  const bump = (year % 2) + (corrected ? 2 : 0);
  return {
    work: 10 + ((index * 7) % 300) + bump,
    peNonFacility: 20 + ((index * 11) % 250) + bump,
    peFacility: 10 + ((index * 13) % 200) + bump,
    mp: 1 + ((index * 3) % 30),
  };
}

/** A code's relative values in a year, as the file writes them. */
export function rvuValues(index: number, year: number, corrected = false): { readonly work: string; readonly peNonFacility: string; readonly peFacility: string; readonly mp: string } {
  const value = rvuHundredths(index, year, corrected);
  return { work: cents(value.work), peNonFacility: cents(value.peNonFacility), peFacility: cents(value.peFacility), mp: cents(value.mp) };
}

const PPRRVU_HEADINGS = [
  ',,,,,,NON-FAC,NON-FAC,FACILITY,FACILITY,,NON-FACILITY,FACILITY,,,,,,,,,,,,,,,,,,',
  'HCPCS,MOD,DESCRIPTION,STATUS CODE,NOT USED FOR MEDICARE PAYMENT,WORK RVU,PE RVU,NA INDICATOR,PE RVU,NA INDICATOR,MP RVU,TOTAL,TOTAL,PCTC IND,GLOB DAYS,PRE OP,INTRA OP,POST OP,MULT PROC,BILAT SURG,ASST SURG,CO-SURG,TEAM SURG,ENDO BASE,CONV FACTOR,PHYSICIAN SUPERVISION OF DIAGNOSTIC PROCEDURES,CALCULATION FLAG,DIAGNOSTIC IMAGING FAMILY INDICATOR,NON-FACILITY PE USED FOR OPPS PAYMENT AMOUNT,FACILITY PE USED FOR OPPS PAYMENT AMOUNT,MP USED FOR OPPS PAYMENT AMOUNT',
];

/** The relative value file; a code marked corrected carries its corrected values whatever `corrected` says (a quarter after the correction's). */
function pprrvu(codes: readonly { readonly code: string; readonly index: number; readonly corrected?: boolean }[], year: number, corrected: boolean, what: string): string {
  const lines = [
    `SYNTHETIC physician fee schedule relative value file ${String(year)}${what} for capacity tests - invented values - not CMS data,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`,
    '"Laid out like the CMS PPRRVU CSV, with stacked column headings; every number is invented (packages/synth/src/release/scale.ts).",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ...PPRRVU_HEADINGS,
  ];
  for (const { code, index, corrected: own = false } of codes) {
    const value = rvuValues(index, year, corrected || own);
    const parts = rvuHundredths(index, year, corrected || own);
    lines.push(
      [
        code,
        '',
        `"SYNTHETIC code ${code}, invented values"`,
        'A',
        '',
        value.work,
        value.peNonFacility,
        '',
        value.peFacility,
        '',
        value.mp,
        cents(parts.work + parts.peNonFacility + parts.mp),
        cents(parts.work + parts.peFacility + parts.mp),
        '0',
        'XXX',
        '0.00',
        '0.00',
        '0.00',
        '5',
        '0',
        '0',
        '0',
        '0',
        '0',
        '20.0000',
        '09',
        '',
        '99',
        '0.00',
        '0.00',
        '0.00',
      ].join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

function gpci(shape: ScaleReleaseShape, year: number, what = ''): string {
  const lines = [
    `SYNTHETIC geographic practice cost indices ${String(year)}${what} for capacity tests - invented values - not CMS data,,,,,,`,
    `Medicare Administrative Contractor (MAC),State,Locality Number,Locality Name,${String(year)} PW GPCI (with 1.0 Floor),${String(year)} PE GPCI,${String(year)} MP GPCI`,
  ];
  for (const [index, { carrier, locality }] of scaleLocalities(shape).entries()) {
    const pe = 800 + ((index * 37 + year) % 500);
    const mp = 300 + ((index * 53) % 900);
    lines.push(`${carrier},ZZ,${locality},SYNTHETIC LOCALITY ${String(index + 1)},1.000,${String(Math.floor(pe / 1000))}.${String(pe % 1000).padStart(3, '0')},${String(Math.floor(mp / 1000))}.${String(mp % 1000).padStart(3, '0')}`);
  }
  lines.push('* SYNTHETIC footnote: every locality above is invented.,,,,,,');
  return `${lines.join('\n')}\n`;
}

function zip5(shape: ScaleReleaseShape, year: number, quarter = 1): string {
  const localities = scaleLocalities(shape);
  const lines = scaleZips(shape).map(({ zip, localityIndex, plusFour }) => {
    const { carrier, locality } = localities[localityIndex] as ScaleLocality;
    return `ZZ${zip}${carrier}${locality} ${locality}   ${plusFour ? '1' : '0'}${' '.repeat(54)}${String(year)}${String(quarter)}`;
  });
  return `${lines.join('\n')}\n`;
}

/**
 * The ZIP9 file: for each flagged ZIP, one fixed-width line per listed ZIP+4 code, as the ZIP9 parser reads it
 * (packages/rules/src/parsers/locality-plus-four.ts): the ZIP5 positions 1-21 with the range's carrier and locality and
 * the plus-four flag 1 at 21, the code at 22-25, padded to 75, then the year and quarter.
 */
function zip9(shape: ScaleReleaseShape, year: number, quarter = 1): string {
  const localities = scaleLocalities(shape);
  const lines: string[] = [];
  for (const zip of scaleZips(shape).filter((entry) => entry.plusFour)) {
    for (const range of scalePlusFourRanges(shape, zip)) {
      const { carrier, locality } = localities[range.localityIndex] as ScaleLocality;
      for (let code = Number.parseInt(range.from, 10); code <= Number.parseInt(range.to, 10); code += 1) {
        lines.push(`${`ZZ${zip.zip}${carrier}${locality} ${locality}   1${String(code).padStart(4, '0')}`.padEnd(75, ' ')}${String(year)}${String(quarter)}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
}

function conversionFactors(year: number): string {
  const factor = year === 2025 ? '19.5000' : '20.0000';
  const qualifying = year === 2025 ? '19.6000' : '20.1000';
  return [
    `SYNTHETIC conversion factors ${String(year)} for capacity tests - invented values - not CMS data`,
    'applicability,conversion_factor,effective_from,effective_to,citation,quote',
    `non_qualifying_apm,${factor},${String(year)}-01-01,${String(year)}-12-31,SYNTHETIC final rule page 1,"SYNTHETIC: the conversion factor for clinicians who are not qualifying APM participants is $${factor}."`,
    `qualifying_apm,${qualifying},${String(year)}-01-01,${String(year)}-12-31,SYNTHETIC final rule page 1,"SYNTHETIC: the conversion factor for qualifying APM participants is $${qualifying}."`,
    '',
  ].join('\n');
}

function mppr(shape: ScaleReleaseShape, year: number): string {
  const lines = [`SYNTHETIC therapy MPPR rate file ${String(year)} for capacity tests - invented values - not CMS data,,,`, 'HCPCS,MOD,LOCALITY,PE REDUCTION PERCENT'];
  for (const code of scalePooledCodes(shape)) {
    // The therapy codes carry their own share; the rest leave it blank, so the general practice-expense rate applies.
    lines.push(`${code},,01,${(SCALE_THERAPY_POOLED as readonly string[]).includes(code) ? '40' : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function mue(shape: ScaleReleaseShape, year: number, quarter: number): string {
  const lines = [
    `SYNTHETIC NCCI practitioner services medically unlikely edits ${String(year)} Q${String(quarter)} for capacity tests - invented values - not CMS data,,,`,
    'HCPCS/CPT Code,Practitioner Services MUE Values,MUE Adjudication Indicator,MUE Rationale',
  ];
  for (const [index, code] of scaleMueCodes(shape).entries()) {
    lines.push(`${code},${String(mueValue(index, quarter))},3 SYNTHETIC date of service edit,SYNTHETIC rationale`);
  }
  return `${lines.join('\n')}\n`;
}

const QUARTER_STARTS = ['0101', '0401', '0701', '1001'] as const;

/**
 * The PTP table, file by file: edit k pairs code k mod N in column 1 with the code `offset` places on (offset 1 + k
 * div N), so every pair is distinct and none pairs a code with itself. Most are open-ended from the first year's 1
 * January (one in ten in existence before 1996); one in twenty is deleted at the start of one of the eight quarters,
 * so its window ends at a quarter's end.
 */
function* ptpFiles(shape: ScaleReleaseShape): Generator<{ readonly part: number; readonly text: string }> {
  const codes = scaleCodes(shape);
  const first = shape.years[0] ?? 2025;
  const years = shape.years;
  const deletions = years.flatMap((year) => QUARTER_STARTS.slice(1).map((day) => `${String(year)}${day}`)).concat(years.slice(1).map((year) => `${String(year)}0101`));
  let part = 0;
  for (let start = 0; start < shape.ptpPairs; start += shape.ptpFileRecords) {
    part += 1;
    const lines = [
      `SYNTHETIC NCCI practitioner procedure-to-procedure edits part ${String(part)} for capacity tests - invented - not CMS data`,
      'Column 1\tColumn 2\t*=in existence prior to 1996\tEffective Date\tDeletion Date *=no data\tModifier 0=not allowed 1=allowed 9=not applicable\tPTP Edit Rationale',
    ];
    const end = Math.min(shape.ptpPairs, start + shape.ptpFileRecords);
    for (let k = start; k < end; k += 1) {
      const at = k % codes.length;
      const column1 = codes[at] as string;
      const column2 = codes[(at + 1 + Math.floor(k / codes.length)) % codes.length] as string;
      const prior = k % 10 === 4 ? '*' : '';
      const effective = prior === '*' ? '19960101' : `${String(first)}0101`;
      const deletion = k % 20 === 9 ? (deletions[k % deletions.length] as string) : '*';
      lines.push(`${column1}\t${column2}\t${prior}\t${effective}\t${deletion}\t${k % 3 === 0 ? '0' : '1'}\tSYNTHETIC rationale`);
    }
    yield { part, text: `${lines.join('\n')}\n` };
  }
}

function codeList(kind: string, codes: readonly string[]): string {
  const lines = [`SYNTHETIC ${kind} for capacity tests - invented codes and descriptions - not X12 data,,,,,`, 'Code,Description,Start Date,Last Modified,Stop Date,Notes'];
  for (const code of codes) {
    lines.push(`${code},SYNTHETIC ${kind} ${code},01/01/2001,,,`);
  }
  return `${lines.join('\n')}\n`;
}

/** The remark codes: N1 up, then M1 up, then MA1 up. */
function remarkCodes(count: number): string[] {
  const codes: string[] = [];
  const n = Math.ceil(count * (2 / 3));
  for (let index = 1; codes.length < Math.min(count, n); index += 1) {
    codes.push(`N${String(index)}`);
  }
  for (let index = 1; codes.length < count - Math.floor(count / 12); index += 1) {
    codes.push(`M${String(index)}`);
  }
  for (let index = 1; codes.length < count; index += 1) {
    codes.push(`MA${String(index)}`);
  }
  return codes;
}

const numbered = (count: number): string[] => Array.from({ length: count }, (_, index) => String(index + 1));

/** A CMS quarter's first and last day in a year. */
function quarterBounds(year: number, quarter: number): { readonly from: string; readonly to: string } {
  const y = String(year);
  return { from: `${y}-${['01-01', '04-01', '07-01', '10-01'][quarter - 1] ?? '01-01'}`, to: `${y}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1] ?? '12-31'}` };
}

/**
 * One year's files under `quarter` windows (#30's importer): for each CMS quarter its relative value files, GPCIs,
 * ZIP5, ZIP9 (their lines stating the quarter's YYYYQ) and MUE table, each windowed to the quarter. The corrected codes
 * are split inside the correction day's quarter (the original file to the day before, the correction from the day, as
 * the importer allows a window inside its quarter), and carry their corrected values in every later quarter's file; the
 * quarters before carry the original values. Then the year's conversion factors and MPPR rates.
 */
function* quarterlyYearFiles(shape: ScaleReleaseShape, year: number, codes: readonly { readonly code: string; readonly index: number }[]): Generator<ScaleSourceFile> {
  const y = String(year);
  const correction = correctionDate(shape, year);
  const dayBefore = `${y}-${shape.correctionDay.slice(0, 2)}-${String(Number.parseInt(shape.correctionDay.slice(3), 10) - 1).padStart(2, '0')}`;
  const corrected = codes.filter(({ index }) => correctedCodeIndex(shape, index));
  const splitQuarter = correctionQuarter(shape);
  for (let quarter = 1; quarter <= 4; quarter += 1) {
    const { from, to } = quarterBounds(year, quarter);
    const q = `Q${String(quarter)}`;
    if (quarter === splitQuarter) {
      yield { type: 'pfs_rvu', name: `PPRRVU${y}${q}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: from, effectiveTo: to, text: pprrvu(codes.filter(({ index }) => !correctedCodeIndex(shape, index)), year, false, ` ${q}`) };
      yield { type: 'pfs_rvu', name: `PPRRVU${y}${q}_SYNTHETIC_SCALE_BEFORE_CORRECTION.csv`, year, effectiveFrom: from, effectiveTo: dayBefore, text: pprrvu(corrected, year, false, ` ${q} (codes later corrected)`) };
      yield { type: 'pfs_rvu', name: `PPRRVU${y}${q}_SYNTHETIC_SCALE_CORRECTION.csv`, year, effectiveFrom: correction, effectiveTo: to, text: pprrvu(corrected, year, true, ` ${q} (mid-quarter correction)`) };
    } else {
      const after = quarter > splitQuarter;
      const entries = codes.map((entry) => ({ ...entry, corrected: after && correctedCodeIndex(shape, entry.index) }));
      yield { type: 'pfs_rvu', name: `PPRRVU${y}${q}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: from, effectiveTo: to, text: pprrvu(entries, year, false, ` ${q}`) };
    }
    yield { type: 'pfs_gpci', name: `GPCI${y}${q}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: from, effectiveTo: to, text: gpci(shape, year, ` ${q}`) };
    yield { type: 'locality_map', name: `ZIP5_${y}${q}_SYNTHETIC_SCALE.txt`, year, effectiveFrom: from, effectiveTo: to, text: zip5(shape, year, quarter) };
    // The same window as the quarter's ZIP5 file's: every flagged ZIP's ZIP+4 codes are in force whenever its flag is.
    yield { type: 'locality_map_plus_four', name: `ZIP9_${y}${q}_SYNTHETIC_SCALE.txt`, year, effectiveFrom: from, effectiveTo: to, text: zip9(shape, year, quarter) };
    yield { type: 'ncci_mue', name: `MUE${y}${q}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: from, effectiveTo: to, text: mue(shape, year, quarter) };
  }
  yield { type: 'conversion_factor', name: `conversion-factor-${y}-SYNTHETIC-SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: conversionFactors(year) };
  yield { type: 'mppr_rate', name: `MPPR${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: mppr(shape, year) };
}

/**
 * Every source file of the scale release, in a fixed order, generated one at a time (the PTP files are large): for
 * each year its relative value files (the uncorrected codes for the year, the corrected codes before and after their
 * correction), GPCIs, ZIP5, ZIP9, conversion factors, MPPR rates and four quarterly MUE tables, or under `quarter`
 * windows the year's files quarter by quarter (quarterlyYearFiles); then the PTP table's files and the three code lists.
 */
export function* scaleSourceFiles(shape: ScaleReleaseShape): Generator<ScaleSourceFile> {
  const codes = scaleCodes(shape).map((code, index) => ({ code, index }));
  for (const year of shape.years) {
    if (shape.windows === 'quarter') {
      yield* quarterlyYearFiles(shape, year, codes);
      continue;
    }
    const y = String(year);
    const correction = correctionDate(shape, year);
    const dayBefore = `${y}-${shape.correctionDay.slice(0, 2)}-${String(Number.parseInt(shape.correctionDay.slice(3), 10) - 1).padStart(2, '0')}`;
    const corrected = codes.filter(({ index }) => correctedCodeIndex(shape, index));
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: pprrvu(codes.filter(({ index }) => !correctedCodeIndex(shape, index)), year, false, '') };
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE_BEFORE_CORRECTION.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: dayBefore, text: pprrvu(corrected, year, false, ' (codes later corrected)') };
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE_CORRECTION.csv`, year, effectiveFrom: correction, effectiveTo: `${y}-12-31`, text: pprrvu(corrected, year, true, ' (mid-quarter correction)') };
    yield { type: 'pfs_gpci', name: `GPCI${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: gpci(shape, year) };
    yield { type: 'locality_map', name: `ZIP5_${y}_SYNTHETIC_SCALE.txt`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: zip5(shape, year) };
    // The same window as the ZIP5 file's: every flagged ZIP's ZIP+4 codes are in force whenever its flag is.
    yield { type: 'locality_map_plus_four', name: `ZIP9_${y}_SYNTHETIC_SCALE.txt`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: zip9(shape, year) };
    yield { type: 'conversion_factor', name: `conversion-factor-${y}-SYNTHETIC-SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: conversionFactors(year) };
    yield { type: 'mppr_rate', name: `MPPR${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: mppr(shape, year) };
    for (let quarter = 1; quarter <= 4; quarter += 1) {
      const from = `${y}-${['01-01', '04-01', '07-01', '10-01'][quarter - 1] ?? '01-01'}`;
      const to = `${y}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1] ?? '12-31'}`;
      yield { type: 'ncci_mue', name: `MUE${y}Q${String(quarter)}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: from, effectiveTo: to, text: mue(shape, year, quarter) };
    }
  }
  const first = shape.years[0] ?? 2025;
  for (const { part, text } of ptpFiles(shape)) {
    yield { type: 'ncci_ptp', name: `PTP_SYNTHETIC_SCALE_PART${String(part)}.txt`, year: first, effectiveFrom: `${String(first)}-01-01`, effectiveTo: null, text };
  }
  yield { type: 'carc', name: 'CARC_SYNTHETIC_SCALE.csv', year: first, effectiveFrom: `${String(first)}-01-01`, effectiveTo: null, text: codeList('claim adjustment reason codes', numbered(shape.carcCodes)) };
  yield { type: 'rarc', name: 'RARC_SYNTHETIC_SCALE.csv', year: first, effectiveFrom: `${String(first)}-01-01`, effectiveTo: null, text: codeList('remittance advice remark codes', remarkCodes(shape.rarcCodes)) };
  yield { type: 'claim_status_code', name: 'CLAIM_STATUS_SYNTHETIC_SCALE.csv', year: first, effectiveFrom: `${String(first)}-01-01`, effectiveTo: null, text: codeList('claim status codes', numbered(shape.claimStatusCodes)) };
}

/** The invented two-letter states of the prompt-pay records: YA to YZ, then ZA up (never a real state's code). */
export function scalePromptPayStates(shape: ScaleReleaseShape): string[] {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: shape.promptPayStates }, (_, index) => `${index < 26 ? 'Y' : 'Z'}${letters.charAt(index % 26)}`);
}

/** How many records each type of the release should hold, from the shape alone (for the release's own tests). */
export function scaleRecordCounts(shape: ScaleReleaseShape): Readonly<Record<ScaleSourceType, number>> {
  const corrected = scaleCorrectedCodes(shape).length;
  // Under quarter windows each year has four of each undated file; the corrected codes are split in one of them.
  const periods = periodsPerYear(shape);
  return {
    pfs_rvu: shape.years.length * (periods * shape.rvuCodes + corrected),
    pfs_gpci: shape.years.length * periods * shape.localities,
    locality_map: shape.years.length * periods * shape.zips,
    locality_map_plus_four: shape.years.length * periods * scaleZips(shape).filter((zip) => zip.plusFour).length,
    conversion_factor: shape.years.length * 2,
    mppr_rate: shape.years.length * shape.pooledCodes,
    ncci_mue: shape.years.length * 4 * shape.mueCodes,
    ncci_ptp: shape.ptpPairs,
    carc: shape.carcCodes,
    rarc: shape.rarcCodes,
    claim_status_code: shape.claimStatusCodes,
  };
}
