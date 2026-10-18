import { inflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { calendarDate } from '../core/dates';
import { SCAN_COLUMNS, SCAN_HEIGHT, SCAN_WIDTH, scannedPdf, textractRecording } from '../formats/scan';
import { findCase } from '../cases/registry';
import { CONTRACT_SET_SIZE, contractSetFiles, contractSetSpecs, normalizeText, writtenDate } from './contract-set';
import { type ContractSetManifest, type ContractTruth, TRUTH_FIELDS } from './formats';
import { NARRATIVE_SET_SIZE, narrativeSetCases, narrativeSetFiles } from './narrative-set';

/**
 * The evaluation sets' generators (test matrix MOD-01 and MOD-03; docs/adr/0051): deterministic,
 * SYNTHETIC, scans without a text layer, truth that quotes its own pages, and narrative cases whose
 * required facts are the sums of their own lines. The harness tests in packages/model-gateway/eval
 * read the committed files through intake's readers; these check the generators themselves.
 */

const PAGES = [
  ['SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT', 'Exhibit A', '', '97110               GP        11     $43.10 per unit'],
  ['SYNTHETIC page two', 'Amounts are rounded half up to the nearest cent.'],
];

describe('scanned exhibits', () => {
  it('are page images with no text layer, the same bytes every time', () => {
    const pdf = scannedPdf(PAGES, 'SYNTHETIC scan', 'T1');
    expect(Buffer.from(scannedPdf(PAGES, 'SYNTHETIC scan', 'T1')).equals(Buffer.from(pdf))).toBe(true);
    const text = Buffer.from(pdf).toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.match(/\/Subtype \/Image/g)).toHaveLength(2);
    expect(text).not.toMatch(/\bBT\b|\bTj\b|\/Font/);
    expect(text).toContain(`/Width ${String(SCAN_WIDTH)} /Height ${String(SCAN_HEIGHT)}`);
  });

  it('draw ink where the text is and leave the rest white', () => {
    /** The page image's bits: the stream of the first image object. */
    const imageBits = (pdf: Uint8Array) => {
      const text = Buffer.from(pdf).toString('latin1');
      const start = text.indexOf('stream\n', text.indexOf('/Subtype /Image')) + 'stream\n'.length;
      return inflateSync(Buffer.from(text.slice(start, text.indexOf('\nendstream', start)), 'latin1'));
    };
    const blackOf = (bits: Uint8Array) => [...bits].reduce((sum, byte) => sum + (8 - byte.toString(2).replaceAll('0', '').length), 0);
    // A blank page holds only the specks of dust (padding bits at each row's end are white too).
    const blank = blackOf(imageBits(scannedPdf([['']], 'SYNTHETIC blank', 'T2')));
    expect(blank).toBeGreaterThan(0);
    expect(blank).toBeLessThanOrEqual(160);
    expect(blackOf(imageBits(scannedPdf([['SYNTHETIC']], 'SYNTHETIC blank', 'T2')))).toBeGreaterThan(blank + 100);
  });

  it('refuse what a page image cannot hold', () => {
    expect(() => scannedPdf([], 'x', 'T3')).toThrow('at least one page');
    expect(() => scannedPdf([['é']], 'x', 'T3')).toThrow('printable ASCII');
    expect(() => scannedPdf([['x'.repeat(SCAN_COLUMNS + 1)]], 'x', 'T3')).toThrow('at most');
    expect(() => scannedPdf([['x']], 'tïtle', 'T3')).toThrow('printable ASCII');
  });

  it('come with the scan reader’s answer: a line per run of text, columns apart, that reads back as the page', () => {
    const recording = textractRecording(PAGES, 'document.pdf');
    expect(recording).toMatchObject({ synthetic: true, JobStatus: 'SUCCEEDED', DocumentMetadata: { Pages: 2 } });
    const lines = (page: number) => recording.Blocks.filter((block) => block.BlockType === 'LINE' && block.Page === page).map((block) => block.Text ?? '');
    expect(lines(1)).toEqual(['SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT', 'Exhibit A', '97110', 'GP', '11', '$43.10 per unit']);
    expect(normalizeText(lines(1).join('\n'))).toBe(normalizeText(PAGES[0]?.join('\n') ?? ''));
    expect(recording.Blocks.filter((block) => block.BlockType === 'PAGE')).toHaveLength(2);
    expect(JSON.stringify(textractRecording(PAGES, 'document.pdf'))).toBe(JSON.stringify(recording));
  });
});

describe('the contract set', () => {
  const files = contractSetFiles();
  const truths = files.filter((file) => file.path.endsWith('truth.json')).map((file) => JSON.parse(String(file.bytes)) as ContractTruth);

  it('holds 40 cases in three layouts, contracts and exhibits, and four methods', () => {
    expect(truths).toHaveLength(CONTRACT_SET_SIZE);
    const manifest = JSON.parse(String(files[0]?.bytes)) as ContractSetManifest;
    expect(manifest.cases.map((item) => item.id)).toEqual(truths.map((truth) => truth.id));
    expect(manifest.note).toContain('SYNTHETIC');
    expect(truths.filter((truth) => truth.layout === 'scanned').every((truth) => truth.scan === 'textract.json' && truth.drawnAs !== null)).toBe(true);
    expect(truths.filter((truth) => truth.contentType === 'text/csv').every((truth) => truth.kind === 'exhibit' && truth.layout === 'table')).toBe(true);
    expect(new Set(contractSetSpecs().map((spec) => spec.method))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT']));
    expect(truths.some((truth) => truth.records.some((record) => record.label.startsWith('Amendment')))).toBe(true);
  });

  it('states every field with a value, the page it is on and a quote, and only the fields a rate record has', () => {
    for (const truth of truths) {
      for (const record of truth.records) {
        expect(Object.keys(record.fields).every((field) => (TRUTH_FIELDS as readonly string[]).includes(field)), truth.id).toBe(true);
        expect(record.fields.method && record.fields.codes, `${truth.id} ${record.label}`).toBeTruthy();
        expect(Object.values(record.fields).every((value) => value.page >= 1 && value.page <= truth.pages && value.quote.length > 0), truth.id).toBe(true);
      }
    }
  });

  it('writes every file the same way twice', () => {
    const again = contractSetFiles();
    expect(again.map((file) => [file.path, Buffer.from(file.bytes).toString('base64')])).toEqual(files.map((file) => [file.path, Buffer.from(file.bytes).toString('base64')]));
  });

  it('writes dates the ways contracts do', () => {
    const date = calendarDate(2026, 3, 1);
    expect([0, 1, 2, 3, 4].map((style) => writtenDate(date, style))).toEqual(['2026-03-01', '3/1/2026', 'March 1, 2026', '1 March 2026', 'Mar. 1st, 2026']);
    expect(['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-11', '2026-03-22'].map((day) => writtenDate(day as typeof date, 4))).toEqual(['Mar. 2nd, 2026', 'Mar. 3rd, 2026', 'Mar. 4th, 2026', 'Mar. 11th, 2026', 'Mar. 22nd, 2026']);
  });

  it('is the MOD-01 case’s files, beside the case’s recorded proposal', () => {
    const generated = findCase('MOD-01')?.generate();
    expect(generated?.expected.files.filter((file) => file.path.startsWith('contract-set/'))).toHaveLength(files.length);
    expect(generated?.expected.files.map((file) => file.path)).toEqual(expect.arrayContaining(['agreement.pdf', 'agreement.txt', 'proposal.json']));
  });
});

describe('the narrative set', () => {
  const cases = narrativeSetCases();

  it('holds 300 cases over every method, in parts of fifty', () => {
    expect(cases).toHaveLength(NARRATIVE_SET_SIZE);
    expect(new Set(cases.map((item) => item.method))).toEqual(new Set(['FIXED_SCHEDULE', 'PERCENT_OF_MEDICARE', 'LESSER_OF', 'PER_VISIT', 'MA_NONCONTRACTED']));
    const files = narrativeSetFiles();
    expect(files).toHaveLength(6);
    expect(files.flatMap((file) => (JSON.parse(file.text) as { cases: { id: string }[] }).cases.map((item) => item.id))).toEqual(cases.map((item) => item.id));
    expect(narrativeSetFiles().map((file) => file.text)).toEqual(files.map((file) => file.text));
  });

  it('requires the shortfall, what the contract requires, what the remittances show and the count, as the lines sum them', () => {
    for (const item of cases) {
      const sum = (key: 'expectedCents' | 'observedCents' | 'varianceCents') => item.assembly.lines.reduce((total, line) => total + BigInt(line[key]), 0n).toString();
      const required = Object.fromEntries(item.required.map((fact) => [fact.what, fact.value]));
      expect(required, item.id).toMatchObject({ shortfall: sum('varianceCents'), expected: sum('expectedCents'), observed: sum('observedCents'), lines: String(item.assembly.lines.length), citation: '1', line_schedule: '3' });
      expect(BigInt(required.expected ?? '0') - BigInt(required.observed ?? '0'), item.id).toBe(BigInt(required.shortfall ?? '-1'));
      expect(item.assembly.lines.every((line) => BigInt(line.varianceCents) > 0n), item.id).toBe(true);
    }
  });

  it('keeps every identifier out of the inputs and labels everything SYNTHETIC', () => {
    for (const item of cases) {
      const inputs = JSON.stringify(item.assembly);
      for (const identifier of item.identifiers) {
        expect(inputs, item.id).not.toContain(identifier);
      }
      expect(item.assembly.practice.name.startsWith('SYNTHETIC') && item.assembly.payer.name.startsWith('SYNTHETIC'), item.id).toBe(true);
      expect(item.reference.paragraphs.join(' ').match(/\[\d/g)?.length ?? 0, item.id).toBeGreaterThanOrEqual(2);
    }
  });
});
