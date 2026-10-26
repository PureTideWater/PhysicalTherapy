import { copyFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ImportRequest, importRuleFile } from './import';
import { statedQuarter } from './parsers';
import { type ImportableType, RuleImportError } from './parsers';
import { sha256 } from './records';
import { parseRuleRecord } from './schema';

const CMS = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/cms');

let root = '';
let downloads = '';

/**
 * A synthetic file copied as if downloaded: renamed, without its SYNTHETIC banner line, and with the
 * reserved SYNTHETIC carrier and state (99999, ZZ) swapped for other invented ones, since the
 * importer refuses all three. The copy lives in a temporary directory and never reaches content/.
 */
function download(fixture: string, name = fixture): string {
  const file = path.join(downloads, name);
  const text = readFileSync(path.join(CMS, fixture), 'utf8');
  const unbannered = text.startsWith('SYNTHETIC') ? text.slice(text.indexOf('\n') + 1) : text;
  writeFileSync(file, unbannered.replaceAll('99999', '99998').replaceAll(',ZZ,', ',YY,'));
  return file;
}

/** The window of 2026-Q1, the quarter PPRRVU26_JAN.csv, the synthetic ZIP files (20261) and Q1_GPCI_URL state. */
const Q1 = { effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31' } as const;
/** A download address whose last segment states 2026-Q1, as the RVU zip a GPCI file is taken out of does. */
const Q1_GPCI_URL = 'https://example.invalid/files/zip/rvu26a.zip';

function request(overrides: Partial<ImportRequest>): ImportRequest {
  const file = overrides.file ?? download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_JAN.csv');
  return { root, type: 'pfs_rvu', year: 2026, url: 'https://example.invalid/download', retrieved: '2026-10-15', today: '2026-10-16', ...Q1, ...overrides, file };
}

/** The record type each synthetic CMS- and X12-format fixture is laid out for. */
const FIXTURE_TYPES: Readonly<Record<string, ImportableType>> = {
  'PPRRVU_SYNTHETIC.csv': 'pfs_rvu',
  'PPRRVU_SYNTHETIC_900004.csv': 'pfs_rvu',
  'GPCI_SYNTHETIC.csv': 'pfs_gpci',
  'GPCI_SYNTHETIC_900006.csv': 'pfs_gpci',
  'ZIP5_SYNTHETIC.txt': 'locality_map',
  'ZIP9_SYNTHETIC.txt': 'locality_map_plus_four',
  'conversion-factor-SYNTHETIC-pass-1.csv': 'conversion_factor',
  'conversion-factor-SYNTHETIC-pass-2.csv': 'conversion_factor',
  'MPPR_SYNTHETIC.csv': 'mppr_rate',
  'NCCI_PTP_SYNTHETIC.txt': 'ncci_ptp',
  'NCCI_MUE_SYNTHETIC.csv': 'ncci_mue',
  'CARC_SYNTHETIC.csv': 'carc',
  'RARC_SYNTHETIC.csv': 'rarc',
  'CLAIM_STATUS_SYNTHETIC.csv': 'claim_status_code',
};

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(path.join(root, relative), 'utf8')) as unknown;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'rules-import-root-'));
  downloads = mkdtempSync(path.join(tmpdir(), 'rules-import-downloads-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(downloads, { recursive: true, force: true });
});

describe('importRuleFile', () => {
  it('stores the source with its SHA-256 and drafts L1 records that quote it', () => {
    const file = download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_JAN.csv');
    const result = importRuleFile(request({ file, url: 'https://www.cms.gov/example' }));
    const bytes = readFileSync(file);
    expect(result).toMatchObject({
      source: 'content/sources/pfs_rvu/PPRRVU26_JAN.csv',
      sha256: sha256(bytes),
      secondPassSource: null,
      draft: 'content/drafts/pfs_rvu/2026/PPRRVU26_JAN.json',
      review: 'content/drafts/pfs_rvu/2026/PPRRVU26_JAN.review.md',
      records: 12,
    });
    expect(readFileSync(path.join(root, result.source))).toEqual(bytes);
    expect(readFileSync(path.join(root, `${result.source}.sha256`), 'utf8')).toBe(`${sha256(bytes)}  PPRRVU26_JAN.csv\n`);
    const records = readJson(result.draft) as unknown[];
    expect(records).toHaveLength(12);
    for (const record of records) {
      expect(parseRuleRecord(record).ok).toBe(true);
    }
    expect(records[0]).toMatchObject({
      record_type: 'pfs_rvu',
      key: { hcpcs: '97110', modifier: '' },
      source: {
        title: 'CMS physician fee schedule relative value file (PPRRVU)',
        url: 'https://www.cms.gov/example',
        path: 'content/sources/pfs_rvu/PPRRVU26_JAN.csv',
        retrieved: '2026-10-15',
        sha256: sha256(bytes),
        method: 'parser',
        parser: 'cms_pprrvu',
          locator: 'line 4',
        synthetic: false,
      },
      verification: { level: 'L1', by: 'pnpm rules:import', on: '2026-10-16', questions: [] },
    });
    const review = readFileSync(path.join(root, result.review), 'utf8');
    expect(review).toContain('# Review: CMS physician fee schedule relative value file (PPRRVU)');
    expect(review).toContain('1. Do the columns the parser checked');
    expect(result.questions).toHaveLength(3);
  });

  it('drafts one ZIP+4 record per ZIP that quotes the first and last line of each range, all in the stored source', () => {
    // Invented identifiers outside the reserved SYNTHETIC ones (the importer refuses those), written to a temporary download.
    const line = (code: string, locality: string) => `${`YY9991299998${locality} ${locality}   1${code}`.padEnd(75, ' ')}20263`;
    const lines = ['0000', '0001', '0002'].map((code) => line(code, '01')).concat([line('0003', '02')]);
    const file = path.join(downloads, 'ZIP9_JUL2026.txt');
    writeFileSync(file, `${lines.join('\n')}\n`);
    // A July file, imported under the window of the quarter it is (the parser refuses another quarter's window).
    const result = importRuleFile(request({ type: 'locality_map_plus_four', file, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' }));
    expect(result).toMatchObject({
      draft: 'content/drafts/locality_map_plus_four/2026/ZIP9_JUL2026.json',
      records: 1,
      notes: ['4 lines folded into 2 ranges of 1 ZIP codes', 'year and quarter 20263 (positions 76-80), the quarter the window starts in'],
    });
    expect(() => importRuleFile(request({ type: 'locality_map_plus_four', file }))).toThrow(
      'locality_map_plus_four is a quarterly file for 2026-Q3, so its window lies inside 2026-07-01 to 2026-09-30 (the whole quarter, or a correction\'s part of it); the window given is 2026-01-01 to 2026-03-31',
    );
    const [record] = readJson(result.draft) as Record<string, unknown>[];
    expect(record).toMatchObject({
      record_type: 'locality_map_plus_four',
      key: { zip: '99912' },
      value: {
        state: 'YY',
        ranges: [
          { from: '0000', to: '0002', carrier: '99998', locality: '01', rural_indicator: '' },
          { from: '0003', to: '0003', carrier: '99998', locality: '02', rural_indicator: '' },
        ],
      },
      source: { parser: 'cms_zip9_locality', locator: 'lines 1-4' },
      quotes: [lines[0], lines[2], lines[3]],
    });
    expect(parseRuleRecord(record).ok).toBe(true);
    const stored = readFileSync(path.join(root, result.source), 'utf8').split('\n');
    expect((record?.quotes as string[]).every((quote) => stored.includes(quote))).toBe(true);
  });

  it('writes import notes into the review file', () => {
    const result = importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv'), url: Q1_GPCI_URL }));
    expect(result.notes).toEqual([
      'work GPCI read from the column headed "2026 PW GPCI (with 1.0 Floor)"',
      'notes after the table (from line 3) were not read as localities',
    ]);
    expect(readFileSync(path.join(root, result.review), 'utf8')).toContain('- notes after the table (from line 3) were not read as localities');
  });

  it('passes the GPCI floor choice to the parser', () => {
    const file = path.join(downloads, 'GPCI2026.csv');
    writeFileSync(
      file,
      [
        'Medicare Administrative Contractor (MAC),State,Locality Number,Locality Name,2026 PW GPCI (without 1.0 Floor),2026 PW GPCI (with 1.0 Floor),2026 PE GPCI,2026 MP GPCI',
        '99998,YY,01,TEST,0.900,1.000,0.950,0.650',
        '',
      ].join('\n'),
    );
    expect(() => importRuleFile(request({ type: 'pfs_gpci', file, url: Q1_GPCI_URL }))).toThrow(/say which applies with --gpci-floor with or --gpci-floor without/);
    const result = importRuleFile(request({ type: 'pfs_gpci', file, url: Q1_GPCI_URL, parseOptions: { gpciWorkFloor: 'without' } }));
    expect((readJson(result.draft) as { value: { work_gpci: string } }[])[0]?.value.work_gpci).toBe('0.900');
  });

  it('requires the http(s) address the file came from', () => {
    expect(() => importRuleFile(request({ url: 'downloads folder' }))).toThrow(/--url must be the http\(s\) address/);
  });

  it('applies the effective window options', () => {
    // An undated file's window is never open (I1), so the window is the quarter the file states.
    const result = importRuleFile(request({ type: 'ncci_mue', file: download('NCCI_MUE_SYNTHETIC.csv', 'MUE_2026Q4.csv'), effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31' }));
    expect((readJson(result.draft) as { effective_from: string; effective_to: string }[])[0]).toMatchObject({ effective_from: '2026-10-01', effective_to: '2026-12-31' });
  });

  it('imports again over its own draft, and reuses an identical stored source', () => {
    const first = importRuleFile(request({}));
    const second = importRuleFile(request({ today: '2026-10-17' }));
    expect(second.draft).toBe(first.draft);
    expect((readJson(second.draft) as { verification: { on: string } }[])[0]?.verification.on).toBe('2026-10-17');
  });

  it('never replaces a different stored file of the same name', () => {
    importRuleFile(request({}));
    const changed = path.join(downloads, 'PPRRVU26_JAN.csv');
    writeFileSync(changed, readFileSync(changed, 'utf8').replace('0.31', '0.32'));
    expect(() => importRuleFile(request({ file: changed }))).toThrow(/already holds a different file/);
  });

  it('writes nothing when a row is invalid', () => {
    const broken = download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_JAN.csv');
    writeFileSync(broken, readFileSync(broken, 'utf8').replace(',0.31,', ',10000.5,'));
    expect(() => importRuleFile(request({ file: broken }))).toThrow(/1 row\(s\) do not make valid pfs_rvu records:\n {2}line 4: value.work_rvu: is out of range/);
    expect(existsSync(path.join(root, 'content'))).toBe(false);
  });

  it('refuses a synthetic fixture', () => {
    const file = path.join(downloads, 'GPCI2026.csv');
    copyFileSync(path.join(CMS, 'GPCI_SYNTHETIC.csv'), file);
    expect(() => importRuleFile(request({ type: 'pfs_gpci', file }))).toThrow(/says SYNTHETIC on its first line/);
    expect(existsSync(path.join(root, 'content'))).toBe(false);
  });

  it('refuses every file in fixtures/synthetic/cms, renamed as if downloaded', () => {
    cpSync(CMS, path.join(root, 'fixtures/synthetic/cms'), { recursive: true });
    const files = readdirSync(CMS).filter((name) => !name.endsWith('.md'));
    expect([...files].sort()).toEqual(Object.keys(FIXTURE_TYPES).sort());
    for (const name of files) {
      const type = FIXTURE_TYPES[name] ?? 'pfs_rvu';
      const file = path.join(downloads, `DOWNLOAD_${String(files.indexOf(name))}${path.extname(name)}`);
      copyFileSync(path.join(CMS, name), file);
      const secondPass = type === 'conversion_factor' ? { secondPass: file } : {};
      expect(() => importRuleFile(request({ type, file, ...secondPass })), name).toThrow(/synthetic fixtures are never imported as content/);
    }
    expect(existsSync(path.join(root, 'content'))).toBe(false);
  });

  it('refuses a fixture with no banner by its bytes, and an edited copy by its reserved identifiers', () => {
    cpSync(CMS, path.join(root, 'fixtures/synthetic/cms'), { recursive: true });
    const file = path.join(downloads, 'ZIP5_OCT2026.txt');
    copyFileSync(path.join(CMS, 'ZIP5_SYNTHETIC.txt'), file);
    expect(() => importRuleFile(request({ type: 'locality_map', file }))).toThrow(/has the same bytes as fixtures\/synthetic\/cms\/ZIP5_SYNTHETIC.txt/);
    writeFileSync(file, `${readFileSync(file, 'utf8')}\n`);
    expect(() => importRuleFile(request({ type: 'locality_map', file }))).toThrow(/is a reserved SYNTHETIC ZIP code/);
    expect(existsSync(path.join(root, 'content'))).toBe(false);
  });

  it('refuses file names that cannot be repository paths', () => {
    expect(() => importRuleFile(request({ file: download('PPRRVU_SYNTHETIC.csv', 'my file.csv') }))).toThrow(/rename "my file.csv"/);
  });

  it.each([
    [{ year: 26 }, /--year must be a four-digit year/],
    [{ retrieved: 'yesterday' }, /"yesterday" is not a date/],
    [{ effectiveFrom: '2026-07-01', effectiveTo: '2026-06-30' }, /--effective-to is before --effective-from/],
  ])('refuses %j', (overrides, message) => {
    expect(() => importRuleFile(request(overrides))).toThrow(message);
  });

  describe('quarterly and undated files (audit #30, docs/adr/0071)', () => {
    /** An invented ZIP5 or ZIP9 line (outside the reserved SYNTHETIC identifiers) with its year and quarter at 76-80. */
    const zip5Line = (zip: string, quarter: string) => `${`YY${zip}9999801 01   0`.padEnd(75, ' ')}${quarter}`;
    const zip9Line = (code: string, quarter: string) => `${`YY999129999801 01   1${code}`.padEnd(75, ' ')}${quarter}`;
    const textFile = (name: string, lines: readonly string[]): string => {
      const file = path.join(downloads, name);
      writeFileSync(file, `${lines.join('\n')}\n`);
      return file;
    };
    /** The synthetic PPRRVU file under another name, with a title line before its own. */
    const titled = (name: string, title: string): string => {
      const file = download('PPRRVU_SYNTHETIC.csv', name);
      writeFileSync(file, `${title},,,,,,,,,,,,,,,,,,,,,,,,,,,,,,\n${readFileSync(file, 'utf8')}`);
      return file;
    };
    const windowOf = (relative: string) => (readJson(relative) as { effective_from: string; effective_to: string | null }[]).map((record) => [record.effective_from, record.effective_to]);
    const Q4 = { effectiveFrom: '2026-10-01', effectiveTo: '2026-12-31' } as const;

    it.each<[string, () => Partial<ImportRequest>]>([
      ['pfs_rvu', () => ({ type: 'pfs_rvu', file: download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_OCT.csv') })],
      ['pfs_gpci', () => ({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv'), url: 'https://example.invalid/files/zip/rvu26d.zip' })],
      ['ncci_mue', () => ({ type: 'ncci_mue', file: download('NCCI_MUE_SYNTHETIC.csv', 'MUE_2026Q4.csv') })],
      ['locality_map', () => ({ type: 'locality_map', file: textFile('ZIP5_OCT2026.txt', [zip5Line('99912', '20264'), zip5Line('99913', '20264')]) })],
      ['locality_map_plus_four', () => ({ type: 'locality_map_plus_four', file: textFile('ZIP9_OCT2026.txt', [zip9Line('0000', '20264'), zip9Line('0001', '20264')]) })],
    ])('imports a %s file for exactly the quarter it states', (_type, overrides) => {
      const result = importRuleFile(request({ ...overrides(), ...Q4 }));
      expect(result.records).toBeGreaterThan(0);
      expect(new Set(windowOf(result.draft).map((window) => window.join(' to ')))).toEqual(new Set(['2026-10-01 to 2026-12-31']));
    });

    it('imports a correction inside a quarter as two windows, the corrected file from the day it states', () => {
      const original = importRuleFile(request({ file: download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_APR.csv'), effectiveFrom: '2026-04-01', effectiveTo: '2026-05-15' }));
      const corrected = titled('PPRRVU26_APR_CORRECTED.csv', 'Corrected file, Effective 05/16/2026');
      expect(() => importRuleFile(request({ file: corrected, effectiveFrom: '2026-05-01', effectiveTo: '2026-06-30' }))).toThrow(
        new RuleImportError('PPRRVU26_APR_CORRECTED.csv takes effect on 2026-05-16, so its window starts that day: --effective-from 2026-05-16 (the window given starts 2026-05-01)'),
      );
      const correction = importRuleFile(request({ file: corrected, effectiveFrom: '2026-05-16', effectiveTo: '2026-06-30' }));
      expect(windowOf(original.draft)[0]).toEqual(['2026-04-01', '2026-05-15']);
      expect(windowOf(correction.draft)[0]).toEqual(['2026-05-16', '2026-06-30']);
    });

    it("reads a GPCI file's quarter from the RVU zip it was taken out of", () => {
      const file = download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv');
      const url = 'https://example.invalid/files/zip/rvu26d.zip';
      expect(() => importRuleFile(request({ type: 'pfs_gpci', file, url, effectiveFrom: '2026-07-01', effectiveTo: '2026-09-30' }))).toThrow(
        new RuleImportError(
          "pfs_gpci is a quarterly file for 2026-Q4, so its window lies inside 2026-10-01 to 2026-12-31 (the whole quarter, or a correction's part of it); the window given is 2026-07-01 to 2026-09-30",
        ),
      );
      expect(existsSync(path.join(root, 'content'))).toBe(false);
      const result = importRuleFile(request({ type: 'pfs_gpci', file, url, ...Q4 }));
      expect((readJson(result.draft) as { source: { url: string } }[])[0]?.source.url).toBe(url);
    });

    it.each<[string, Partial<ImportRequest> | (() => Partial<ImportRequest>), string]>([
      [
        'I1 undated_open (quarterly)',
        () => ({ type: 'ncci_mue', file: download('NCCI_MUE_SYNTHETIC.csv', 'MUE_2026Q4.csv'), effectiveFrom: '2026-10-01', effectiveTo: null }),
        'ncci_mue files carry no dates of their own, so their window needs an end: give --effective-to (an open window would hide the day the content runs out)',
      ],
      [
        'I1 undated_open (MPPR)',
        () => ({ type: 'mppr_rate', file: download('MPPR_SYNTHETIC.csv', 'MPPR2026.csv'), effectiveFrom: '2026-01-01', effectiveTo: null }),
        'mppr_rate files carry no dates of their own, so their window needs an end: give --effective-to (an open window would hide the day the content runs out)',
      ],
      [
        'I2 quarter_unstated',
        () => ({ file: download('PPRRVU_SYNTHETIC.csv', 'PPRRVU.csv') }),
        "pfs_rvu is a quarterly file, and PPRRVU.csv states no quarter that can be read: keep CMS's quarter token in the file name (such as RVU26D, PPRRVU26_OCT, 2026Q4 or OCT2026), or, if the file states its quarter another way, fix the parser in a pull request (content/sources/README.md)",
      ],
      [
        'I2 quarter_unstated (a ZIP5 line with no year and quarter)',
        () => ({ type: 'locality_map', file: textFile('ZIP5_2026Q1.txt', ['YY999129999801 01   0']) }),
        "locality_map is a quarterly file, and ZIP5_2026Q1.txt states no quarter that can be read: keep CMS's quarter token in the file name (such as RVU26D, PPRRVU26_OCT, 2026Q4 or OCT2026), or, if the file states its quarter another way, fix the parser in a pull request (content/sources/README.md)",
      ],
      [
        'I3 quarter_two_stated (the file name and the download address)',
        { url: 'https://example.invalid/files/zip/rvu26d.zip' },
        "PPRRVU26_JAN.csv states two quarters (2026-Q1 and 2026-Q4); import each quarter's file on its own",
      ],
      [
        'I3 quarter_two_stated (two effective days)',
        () => ({ file: titled('PPRRVU26_JAN.csv', 'Eff 01-01-2026 and Effective 02/01/2026') }),
        "PPRRVU26_JAN.csv states two quarters (effective 2026-01-01 and effective 2026-02-01); import each quarter's file on its own",
      ],
      [
        'I3 quarter_two_stated (an effective day that is no date)',
        () => ({ file: titled('PPRRVU26_JAN.csv', 'Effective 02/30/2026') }),
        `PPRRVU26_JAN.csv states two quarters ("Effective 02/30/2026", which is no date, and 2026-Q1); import each quarter's file on its own`,
      ],
      [
        'I4 quarter_window_missing',
        { effectiveFrom: undefined },
        'pfs_rvu is a quarterly file for 2026-Q1: give its window inside that quarter, usually the whole quarter, --effective-from 2026-01-01 --effective-to 2026-03-31',
      ],
      [
        'I5 quarter_window_outside',
        { effectiveTo: '2026-04-30' },
        "pfs_rvu is a quarterly file for 2026-Q1, so its window lies inside 2026-01-01 to 2026-03-31 (the whole quarter, or a correction's part of it); the window given is 2026-01-01 to 2026-04-30",
      ],
      [
        'I3 quarter_two_stated (an effective day that is no date, and no other quarter)',
        () => ({ file: titled('PPRRVU.csv', 'Effective 02/30/2026') }),
        'PPRRVU.csv states an effective date that is no date ("Effective 02/30/2026"): import the file CMS published, or fix the parser in a pull request if CMS writes its dates another way (content/sources/README.md)',
      ],
      ['I6 quarter_year_mismatch', { year: 2025 }, '--year 2025 is not the year of the quarter PPRRVU26_JAN.csv states (2026-Q1)'],
      [
        'I7 quarter_effective_mismatch',
        () => ({ file: titled('PPRRVU26_JAN.csv', 'Eff 01-01-2026'), effectiveFrom: '2026-02-01' }),
        'PPRRVU26_JAN.csv takes effect on 2026-01-01, so its window starts that day: --effective-from 2026-01-01 (the window given starts 2026-02-01)',
      ],
      [
        'I8 mppr_window_year',
        () => ({ type: 'mppr_rate', file: download('MPPR_SYNTHETIC.csv', 'MPPR2026.csv'), effectiveFrom: '2026-07-01', effectiveTo: '2027-06-30' }),
        "the MPPR list is a calendar year's file, so its window ends inside 2026: the window given is 2026-07-01 to 2027-06-30",
      ],
    ])('refuses %s before anything is written', (_name, overrides, message) => {
      expect(() => importRuleFile(request(typeof overrides === 'function' ? overrides() : overrides))).toThrow(new RuleImportError(message));
      expect(existsSync(path.join(root, 'content'))).toBe(false);
    });

    it("never replaces another quarter's draft of a file whose name states no quarter, and keeps that draft byte for byte (INT-PIPE-1)", () => {
      const q4Url = 'https://example.invalid/files/zip/rvu26d.zip';
      const q1 = importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv'), url: Q1_GPCI_URL }));
      const held = readFileSync(path.join(root, q1.draft));
      const review = readFileSync(path.join(root, q1.review));
      expect(() => importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv'), url: q4Url, ...Q4 }))).toThrow(
        new RuleImportError(
          'content/drafts/pfs_gpci/2026/GPCI2026.json already holds the records of 2026-01-01 to 2026-03-31, imported from a file of the same name: give the file for 2026-10-01 to 2026-12-31 its own name, such as GPCI2026_Q4.csv, so every quarter is kept (content/sources/README.md)',
        ),
      );
      expect(readFileSync(path.join(root, q1.draft)).equals(held)).toBe(true);
      expect(readFileSync(path.join(root, q1.review)).equals(review)).toBe(true);
      // The same window is imported again over its own draft; renamed for its quarter, Q4 keeps a draft of its own.
      expect(importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv'), url: Q1_GPCI_URL })).draft).toBe(q1.draft);
      const q4 = importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026_Q4.csv'), url: q4Url, ...Q4 }));
      expect(q4.sha256).toBe(q1.sha256);
      expect(windowOf(q4.draft)[0]).toEqual(['2026-10-01', '2026-12-31']);
      expect(windowOf(q1.draft)[0]).toEqual(['2026-01-01', '2026-03-31']);
    });

    it('takes the calendar year for the MPPR list when no window is given', () => {
      const result = importRuleFile(request({ type: 'mppr_rate', file: download('MPPR_SYNTHETIC.csv', 'MPPR2026.csv'), effectiveFrom: undefined, effectiveTo: undefined }));
      expect(new Set(windowOf(result.draft).map((window) => window.join(' to ')))).toEqual(new Set(['2026-01-01 to 2026-12-31']));
    });
  });

  describe('statedQuarter', () => {
    const q4 = { quarter: { year: 2026, quarter: 4 }, effective: null };
    const url = 'https://example.invalid/download';

    it.each([
      ['RVU26D.csv', q4],
      // A token ends at anything but a letter or a digit, an underscore included (INT-PIPE-5).
      ['rvu26d_pprrvu.csv', q4],
      ['PPRRVU26_OCT.csv', q4],
      ['GPCI26_oct.csv', q4],
      ['MUE_2026Q4.csv', q4],
      ['MUE-2026-Q4.csv', q4],
      ['MUE-OCT2026.csv', q4],
      ['MUE.csv', null],
    ])('reads %s', (fileName, expected) => {
      expect(statedQuarter('pfs_rvu', { fileName, url, text: 'HCPCS,MOD\n' })).toEqual(expected);
    });

    it.each([
      ['rvu26d_updated.zip', q4],
      ['rvu26ar.zip', { quarter: { year: 2026, quarter: 1 }, effective: null }],
      ['RVU26D-2.zip', q4],
      ['XRVU26D.zip', null],
      ['RVU26DX.zip', null],
      ['RVU26DRX.zip', null],
      ['RVU26E.zip', null],
    ])('reads the download address %s, a token ending at anything but a letter or a digit (INT-PIPE-5)', (zip, expected) => {
      expect(statedQuarter('pfs_gpci', { fileName: 'GPCI2026.csv', url: `https://example.invalid/files/${zip}`, text: '' })).toEqual(expected);
    });

    it.each([
      ['MUE_PRACTITIONER_2026Q4_v2.csv', q4],
      ['MCR_MUE_PractitionerServices_Eff_10-01-2026.csv', { ...q4, effective: '2026-10-01' }],
      ['MUE_Eff.10-01-2026.csv', { ...q4, effective: '2026-10-01' }],
      ['MUE_OCT2026_v2.csv', q4],
      ['MUE_2026Q4X.csv', null],
      ['MUE_XOCT2026.csv', null],
      ['MUE_Effort_10-01-2026.csv', null],
    ])('reads the file name %s, a token touching an underscore or a dot (INT-PIPE-5)', (fileName, expected) => {
      expect(statedQuarter('ncci_mue', { fileName, url, text: '' })).toEqual(expected);
    });

    it('still refuses a name that states two quarters once both tokens read (INT-PIPE-5)', () => {
      expect(() => statedQuarter('pfs_rvu', { fileName: 'RVU26D_2026Q3.csv', url, text: '' })).toThrow(
        new RuleImportError("RVU26D_2026Q3.csv states two quarters (2026-Q4 and 2026-Q3); import each quarter's file on its own"),
      );
      expect(() => statedQuarter('ncci_mue', { fileName: 'MUE_2026Q4_Eff_07-01-2026.csv', url, text: '' })).toThrow(
        new RuleImportError("MUE_2026Q4_Eff_07-01-2026.csv states two quarters (2026-Q4 and 2026-Q3); import each quarter's file on its own"),
      );
    });

    it('reads the title lines, an effective day included, but never past the fifth line', () => {
      expect(statedQuarter('ncci_mue', { fileName: 'MUE.csv', url, text: 'Practitioner Services MUE Table, Eff 10-01-2026\nHCPCS\n' })).toEqual({ ...q4, effective: '2026-10-01' });
      expect(statedQuarter('ncci_mue', { fileName: 'MUE.csv', url, text: 'Practitioner Services MUE Table\nEffective 10/01/2026\n' })).toEqual({ ...q4, effective: '2026-10-01' });
      expect(statedQuarter('pfs_rvu', { fileName: 'PPRRVU.csv', url, text: 'Relative value file, October 2026 release\n' })).toEqual(q4);
      expect(statedQuarter('pfs_rvu', { fileName: 'PPRRVU.csv', url, text: `${'\n'.repeat(5)}October 2026\n` })).toBeNull();
      // A month's name states a quarter only in the title lines, never in a name.
      expect(statedQuarter('pfs_rvu', { fileName: 'October_2026.csv', url, text: '' })).toBeNull();
    });

    it('reads the last path segment of the download address, decoded, without its query or fragment', () => {
      expect(statedQuarter('pfs_gpci', { fileName: 'GPCI2026.csv', url: 'https://example.invalid/files/zip/rvu26d.zip?from=RVU26A#RVU26B', text: '' })).toEqual(q4);
      expect(statedQuarter('pfs_gpci', { fileName: 'GPCI2026.csv', url: 'https://example.invalid/files/MUE%202026%20Q4.zip', text: '' })).toEqual(q4);
      expect(statedQuarter('pfs_gpci', { fileName: 'GPCI2026.csv', url: 'https://example.invalid/RVU26D/files.zip', text: '' })).toBeNull();
    });

    it('agrees when every statement names the same quarter', () => {
      expect(statedQuarter('pfs_rvu', { fileName: 'PPRRVU26_OCT.csv', url: 'https://example.invalid/rvu26d.zip', text: 'PPRRVU 2026Q4, Eff 10-01-2026\n' })).toEqual({ ...q4, effective: '2026-10-01' });
    });

    it("reads a ZIP file's year and quarter from its first line that is not blank", () => {
      const line = (quarter: string) => `${'YY999129999801 01   0'.padEnd(75, ' ')}${quarter}`;
      expect(statedQuarter('locality_map', { fileName: 'ZIP5_JAN2026.txt', url, text: `\n${line('20264')}\n${line('20261')}\n` })).toEqual(q4);
      expect(statedQuarter('locality_map_plus_four', { fileName: 'ZIP9_2026Q4.txt', url, text: `${line('2026X')}\n` })).toBeNull();
    });
  });

  describe('conversion factors, prepared twice', () => {
    const passOne = () => download('conversion-factor-SYNTHETIC-pass-1.csv', 'cf-2026-a.csv');
    const passTwo = () => download('conversion-factor-SYNTHETIC-pass-2.csv', 'cf-2026-b.csv');

    it('imports when the two preparations agree, storing both', () => {
      const result = importRuleFile(request({ type: 'conversion_factor', file: passOne(), secondPass: passTwo() }));
      expect(result).toMatchObject({ records: 2, source: 'content/sources/conversion_factor/cf-2026-a.csv', secondPassSource: 'content/sources/conversion_factor/cf-2026-b.csv' });
      expect((readJson(result.draft) as { notes: string }[])[0]?.notes).toContain('Final rule (SYNTHETIC final rule page 1)');
    });

    it('requires the second preparation', () => {
      expect(() => importRuleFile(request({ type: 'conversion_factor', file: passOne() }))).toThrow(/prepare the CSV twice and pass the second with --second-pass/);
    });

    it('refuses when the preparations differ, writing nothing', () => {
      const second = passTwo();
      writeFileSync(second, readFileSync(second, 'utf8').replace('20.1000,2026', '20.1001,2026').replace('is $20.1000', 'is $20.1001'));
      expect(() => importRuleFile(request({ type: 'conversion_factor', file: passOne(), secondPass: second }))).toThrow(
        /the two preparations differ[\s\S]*only in the second pass: qualifying_apm 20.1001/,
      );
      expect(existsSync(path.join(root, 'content'))).toBe(false);
    });

    it('refuses a second pass for a type loaded from the published file', () => {
      expect(() => importRuleFile(request({ secondPass: passTwo() }))).toThrow(RuleImportError);
    });
  });
});
