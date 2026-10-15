import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type ImportRequest, importRuleFile } from './import';
import { RuleImportError } from './parsers';
import { sha256 } from './records';
import { parseRuleRecord } from './schema';

const CMS = path.resolve(import.meta.dirname, '../../../fixtures/synthetic/cms');

let root = '';
let downloads = '';

/**
 * A synthetic file copied as if downloaded: renamed, and without its SYNTHETIC banner line, which
 * the importer refuses. The copy lives in a temporary directory and never reaches content/.
 */
function download(fixture: string, name = fixture): string {
  const file = path.join(downloads, name);
  const text = readFileSync(path.join(CMS, fixture), 'utf8');
  writeFileSync(file, text.startsWith('SYNTHETIC') ? text.slice(text.indexOf('\n') + 1) : text);
  return file;
}

function request(overrides: Partial<ImportRequest>): ImportRequest {
  const file = overrides.file ?? download('PPRRVU_SYNTHETIC.csv', 'PPRRVU26_JAN.csv');
  return { root, type: 'pfs_rvu', year: 2026, retrieved: '2026-10-15', today: '2026-10-16', ...overrides, file };
}

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

  it('writes import notes into the review file', () => {
    const result = importRuleFile(request({ type: 'pfs_gpci', file: download('GPCI_SYNTHETIC.csv', 'GPCI2026.csv') }));
    expect(result.notes).toEqual(['notes after the table (from line 3) were not read as localities']);
    expect(readFileSync(path.join(root, result.review), 'utf8')).toContain('- notes after the table (from line 3) were not read as localities');
  });

  it('applies the effective window options', () => {
    const result = importRuleFile(request({ type: 'ncci_mue', file: download('NCCI_MUE_SYNTHETIC.csv', 'MUE_2026Q4.csv'), effectiveFrom: '2026-10-01', effectiveTo: null }));
    expect((readJson(result.draft) as { effective_from: string; effective_to: null }[])[0]).toMatchObject({ effective_from: '2026-10-01', effective_to: null });
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
