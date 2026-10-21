/**
 * The production-shaped SYNTHETIC rule release's source files (audit #53 part 1; docs/adr/0062, "Capacity under
 * production limits"): invented values in the layouts of the public files the rule parsers read
 * (packages/rules/src/parsers), at the sizes of CMS's current public files, so the screening's capacity test reads,
 * indexes and prices against a release as large as release 1 will be. tools/release/scale.ts runs these files
 * through the same parsers, record builder and manifest builder as the committed synthetic release and writes the
 * release outside the repository; it loads only into a scratch database (release 900100, reserved).
 *
 * Nothing here is CMS data. Every value is invented and patterned; every file says SYNTHETIC on its first line but
 * the ZIP5 file, whose fixed-width layout has no room for a banner. The carriers (99901 up), the localities' names
 * and the states (YA to ZY) are invented; the ZIPs are five-digit values from 00100 up, some of which are real ZIP
 * codes, with invented carriers, localities and values. Codes are five-character values: the twelve therapy codes
 * the practice-shaped upload uses, then 97000 to 97999 and 10000 up; some are real CPT codes, with invented values.
 *
 * Counts are at or above CMS's current public files (open item 9 of the design: #31 checks them against release 1's
 * real sources); each count's basis is on its field of SCALE_RELEASE_SHAPE.
 */

/** The reserved release number of the scale release; no committed fixture uses it. */
export const SCALE_RELEASE_NUMBER = 900_100;

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

/** A shape small enough for unit tests, with every feature of the production one. */
export const SMALL_SCALE_RELEASE_SHAPE: ScaleReleaseShape = {
  years: [2025, 2026],
  rvuCodes: 400,
  correctedEvery: 50,
  correctionDay: '05-16',
  localities: 5,
  zips: 300,
  plusFourEvery: 33,
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
export type ScaleSourceType = 'pfs_rvu' | 'pfs_gpci' | 'locality_map' | 'conversion_factor' | 'mppr_rate' | 'ncci_ptp' | 'ncci_mue' | 'carc' | 'rarc' | 'claim_status_code';

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

function pprrvu(codes: readonly { readonly code: string; readonly index: number }[], year: number, corrected: boolean, what: string): string {
  const lines = [
    `SYNTHETIC physician fee schedule relative value file ${String(year)}${what} for capacity tests - invented values - not CMS data,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,`,
    '"Laid out like the CMS PPRRVU CSV, with stacked column headings; every number is invented (packages/synth/src/release/scale.ts).",,,,,,,,,,,,,,,,,,,,,,,,,,,,,,',
    ...PPRRVU_HEADINGS,
  ];
  for (const { code, index } of codes) {
    const value = rvuValues(index, year, corrected);
    const parts = rvuHundredths(index, year, corrected);
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

function gpci(shape: ScaleReleaseShape, year: number): string {
  const lines = [
    `SYNTHETIC geographic practice cost indices ${String(year)} for capacity tests - invented values - not CMS data,,,,,,`,
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

function zip5(shape: ScaleReleaseShape, year: number): string {
  const localities = scaleLocalities(shape);
  const lines = scaleZips(shape).map(({ zip, localityIndex, plusFour }) => {
    const { carrier, locality } = localities[localityIndex] as ScaleLocality;
    return `ZZ${zip}${carrier}${locality} ${locality}   ${plusFour ? '1' : '0'}${' '.repeat(54)}${String(year)}1`;
  });
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

/**
 * Every source file of the scale release, in a fixed order, generated one at a time (the PTP files are large): for
 * each year its relative value files (the uncorrected codes for the year, the corrected codes before and after their
 * correction), GPCIs, ZIP5, conversion factors, MPPR rates and four quarterly MUE tables; then the PTP table's files
 * and the three code lists.
 */
export function* scaleSourceFiles(shape: ScaleReleaseShape): Generator<ScaleSourceFile> {
  const codes = scaleCodes(shape).map((code, index) => ({ code, index }));
  for (const year of shape.years) {
    const y = String(year);
    const correction = correctionDate(shape, year);
    const dayBefore = `${y}-${shape.correctionDay.slice(0, 2)}-${String(Number.parseInt(shape.correctionDay.slice(3), 10) - 1).padStart(2, '0')}`;
    const corrected = codes.filter(({ index }) => correctedCodeIndex(shape, index));
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: pprrvu(codes.filter(({ index }) => !correctedCodeIndex(shape, index)), year, false, '') };
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE_BEFORE_CORRECTION.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: dayBefore, text: pprrvu(corrected, year, false, ' (codes later corrected)') };
    yield { type: 'pfs_rvu', name: `PPRRVU${y}_SYNTHETIC_SCALE_CORRECTION.csv`, year, effectiveFrom: correction, effectiveTo: `${y}-12-31`, text: pprrvu(corrected, year, true, ' (mid-quarter correction)') };
    yield { type: 'pfs_gpci', name: `GPCI${y}_SYNTHETIC_SCALE.csv`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: gpci(shape, year) };
    yield { type: 'locality_map', name: `ZIP5_${y}_SYNTHETIC_SCALE.txt`, year, effectiveFrom: `${y}-01-01`, effectiveTo: `${y}-12-31`, text: zip5(shape, year) };
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
  return {
    pfs_rvu: shape.years.length * (shape.rvuCodes + corrected),
    pfs_gpci: shape.years.length * shape.localities,
    locality_map: shape.years.length * shape.zips,
    conversion_factor: shape.years.length * 2,
    mppr_rate: shape.years.length * shape.pooledCodes,
    ncci_mue: shape.years.length * 4 * shape.mueCodes,
    ncci_ptp: shape.ptpPairs,
    carc: shape.carcCodes,
    rarc: shape.rarcCodes,
    claim_status_code: shape.claimStatusCodes,
  };
}
