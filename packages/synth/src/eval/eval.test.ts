import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

import { beforeAll, describe, expect, it } from 'vitest';

import { calendarDate } from '../core/dates';
import { helveticaWidth, writePdf, writeRichPdf } from '../formats/pdf';
import { SCAN_COLUMNS, SCAN_HEIGHT, SCAN_WIDTH, runLengthDecode, runLengthEncode, scannedPdf, textractRecording } from '../formats/scan';
import { findCase } from '../cases/registry';
import { CONTRACT_SET_SIZE, contractSetFiles, contractSetSpecs, normalizeText, writtenDate } from './contract-set';
import {
  CONTRACT_SET_V2_SIZE,
  INJECTION_AMOUNT,
  INJECTION_CANARY,
  LARGE_CONTRACT_DIR,
  V2_CODES,
  checkTruthV2,
  contractSetV2Committed,
  contractSetV2Files,
  contractSetV2Large,
  contractSetV2Manifest,
} from './contract-set-v2';
import { type ContractSetV1Manifest, type ContractTruth, TRUTH_FIELDS } from './formats';
import { ensureLargeContractTier, largeContractFacts } from './large-contracts';
import { NARRATIVE_SET_SIZE, narrativeSetCases, narrativeSetFiles } from './narrative-set';

/**
 * The evaluation sets' generators (test matrix MOD-01, MOD-03 and MOD-09; docs/adr/0051 and 0070):
 * deterministic, SYNTHETIC, scans without a text layer unless they carry their own, truth that quotes
 * its own pages (as seen, and as read where the two differ), and narrative cases whose required facts
 * are the sums of their own lines. The harness tests in packages/model-gateway/eval read the committed
 * files through intake's readers; these check the generators themselves.
 */

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
const syntheticRoot = path.resolve(import.meta.dirname, '../../../../fixtures/synthetic');

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
    const manifest = JSON.parse(String(files[0]?.bytes)) as ContractSetV1Manifest;
    expect(manifest.format).toBe('tp-eval-contract-set/1');
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

  it('writes its documents and recordings byte for byte as at format /1: only the truths moved to /2', () => {
    // The SHA-256 of "<path> <sha256>\n" for each of the 40 documents and 13 recordings, in path order, at 6ddd587.
    const lines = files
      .filter((file) => !file.path.endsWith('truth.json') && !file.path.endsWith('set.json'))
      .map((file) => `${file.path} ${sha256(file.bytes)}\n`)
      .sort();
    expect(lines).toHaveLength(53);
    expect(sha256(lines.join(''))).toBe('9829c148656d8e131a3b75f916a6b3c81d6befec67b0eb9aaf4e6859db18206a');
  });

  it('writes truth /2: small, faithful, unpaired and untwinned, each record with its role, the amended rows as conflicts', () => {
    for (const truth of truths) {
      expect(truth, truth.id).toMatchObject({ format: 'tp-eval-contract/2', tier: 'small', pageText: 'faithful', unfaithfulBecause: null, pairOf: null, twinOf: null });
      expect(truth.records.every((record) => (record.role === 'amendment') === record.label.startsWith('Amendment')), truth.id).toBe(true);
      expect(truth.records.every((record) => Object.values(record.fields).every((value) => value.asRead === undefined)), truth.id).toBe(true);
    }
    const amended = truths.filter((truth) => truth.conflicts.length > 0);
    expect(amended.map((truth) => truth.id)).toEqual(['C05', 'C25', 'C33']);
    for (const truth of amended) {
      expect(truth.conflicts, truth.id).toHaveLength(2);
      for (const [original, amendment] of truth.conflicts) {
        const [first, second] = [truth.records[original], truth.records[amendment]];
        expect([first?.role, second?.role], truth.id).toEqual(['term', 'amendment']);
        expect(first?.fields.codes?.value, truth.id).toEqual(second?.fields.codes?.value);
        expect(first?.fields.amount?.value, truth.id).not.toEqual(second?.fields.amount?.value);
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

describe('the contract set v2 (MOD-09)', () => {
  const committed = contractSetV2Committed();
  const large = contractSetV2Large();
  const manifest = contractSetV2Manifest(committed, large);
  const all = [...committed, ...large];
  // The committed files and the large tier's facts, rendered once for the tests that read them whole: the large tier
  // alone is five documents of up to 80 pages, and rendering it in each test outran vitest's 5 s on CI's runner.
  let v2Files: ReturnType<typeof contractSetV2Files>;
  let largeFacts: ReturnType<typeof largeContractFacts>;
  beforeAll(() => {
    v2Files = contractSetV2Files();
    largeFacts = largeContractFacts();
  }, 120_000);
  const truthOf = (id: string) => {
    const found = all.find((item) => item.truth.id === id)?.truth;
    if (found === undefined) {
      throw new Error(`no case ${id}`);
    }
    return found;
  };

  it('holds 63 documents: v1’s 40, 18 committed and 5 large, in their tiers, five of them unfaithful', () => {
    expect(manifest.format).toBe('tp-eval-contract-set/2');
    expect(manifest.cases).toHaveLength(CONTRACT_SET_V2_SIZE);
    expect(manifest.cases.map((item) => item.id)).toEqual([
      ...Array.from({ length: 40 }, (_, index) => `C${String(index + 1).padStart(2, '0')}`),
      ...Array.from({ length: 18 }, (_, index) => `V${String(index + 1).padStart(2, '0')}`),
      'L01', 'L02', 'L03', 'L04', 'L05',
    ]);
    const tiers = (tier: string) => manifest.cases.filter((item) => item.tier === tier).length;
    expect([tiers('small'), tiers('medium'), tiers('large')]).toEqual([53, 5, 5]);
    expect(manifest.cases.filter((item) => item.pageText === 'unfaithful').map((item) => item.id)).toEqual(['V05', 'V07', 'V08', 'V09', 'V13']);
    expect(manifest.cases.filter((item) => item.generated).map((item) => item.path)).toEqual(['L01-table', 'L02-prose', 'L03-scanned', 'L04-prose', 'L05-table'].map((dir) => `${LARGE_CONTRACT_DIR}/${dir}`));
    expect(manifest.cases.find((item) => item.id === 'C01')?.path).toBe('MOD-01/contract-set/C01-table');
    expect(manifest.cases.find((item) => item.id === 'V01')?.path).toBe('MOD-09/contract-set-v2/V01-table');
    expect(Math.max(...all.map((item) => item.truth.pages))).toBe(80);
    expect(Math.max(...all.map((item) => new Set(item.truth.records.flatMap((record) => (record.fields.codes?.value ?? []) as string[])).size))).toBe(60);
    expect(manifest.note).toContain('SYNTHETIC');
  });

  it('gives each new case the pages, codes, layout and kind its row of the design names', () => {
    const shape = (id: string) => {
      const truth = truthOf(id);
      return [truth.tier, truth.layout, truth.drawnAs ?? (truth.contentType === 'text/csv' ? 'csv' : truth.layout), truth.kind, truth.pages, new Set(truth.records.flatMap((record) => (record.role === 'term' ? ((record.fields.codes?.value ?? []) as string[]) : []))).size];
    };
    expect(shape('V01')).toEqual(['medium', 'table', 'table', 'contract', 12, 30]);
    expect(shape('V02')).toEqual(['medium', 'table', 'csv', 'exhibit', 1, 40]);
    expect(shape('V03')).toEqual(['medium', 'prose', 'prose', 'contract', 10, 0]);
    expect(shape('V04')).toEqual(['medium', 'table', 'table', 'exhibit', 3, 25]);
    expect(shape('V05')).toEqual(['medium', 'scanned', 'table', 'contract', 6, 20]);
    expect(shape('V06')).toEqual(['small', 'scanned', 'table', 'contract', 4, 8]);
    expect(shape('V07')).toEqual(['small', 'scanned', 'prose', 'contract', 4, 6]);
    expect(shape('V08')).toEqual(['small', 'table', 'table', 'contract', 3, 8]);
    expect(shape('V09')).toEqual(['small', 'prose', 'prose', 'contract', 3, 4]);
    for (const [id, layout, codes] of [['V10', 'table', 8], ['V11', 'table', 8], ['V12', 'prose', 4], ['V13', 'prose', 4], ['V14', 'scanned', 8], ['V15', 'scanned', 8], ['V16', 'table', 6], ['V17', 'prose', 4], ['V18', 'scanned', 4]] as const) {
      expect(shape(id).slice(0, 2).concat(shape(id).slice(4)), id).toEqual(['small', layout, 3, codes]);
    }
    expect(shape('L01')).toEqual(['large', 'table', 'table', 'contract', 80, 60]);
    expect(shape('L02')).toEqual(['large', 'prose', 'prose', 'contract', 80, 60]);
    expect(shape('L03')).toEqual(['large', 'scanned', 'table', 'contract', 80, 60]);
    expect(shape('L04')).toEqual(['large', 'prose', 'prose', 'contract', 40, 0]);
    expect(shape('L05')).toEqual(['large', 'table', 'table', 'exhibit', 40, 60]);
    // L01's Exhibit A is on pages 71 to 80; L02's rates are spread over pages 20 to 60.
    expect(new Set(truthOf('L01').records.map((record) => record.fields.codes?.page))).toEqual(new Set([71, 72, 73, 74, 75, 76, 77, 78, 79, 80]));
    const l02 = truthOf('L02').records.map((record) => record.fields.codes?.page ?? 0);
    expect([Math.min(...l02), Math.max(...l02), l02.length]).toEqual([20, 59, 30]);
    // V01's two wrapped rows quote both their lines, the amount on the second.
    expect(truthOf('V01').records.filter((record) => record.fields.amount?.quote.includes('areas, each fifteen minutes') === true)).toHaveLength(2);
  });

  it('reads an image-only scan from its recording and a scan with its own text layer from that layer', () => {
    const scans = all.filter((item) => item.truth.layout === 'scanned');
    expect(scans.filter((item) => item.truth.scan === 'textract.json').map((item) => item.truth.id)).toEqual(['V05', 'V14', 'V15', 'V18', 'L03']);
    expect(scans.filter((item) => item.truth.scan === null).map((item) => item.truth.id)).toEqual(['V06', 'V07']);
    const v06 = Buffer.from(committed.find((item) => item.truth.id === 'V06')?.render().find((file) => file.path === 'document.pdf')?.bytes ?? '').toString('latin1');
    expect(v06).toContain('3 Tr');
    expect(v06).toContain('/Filter /RunLengthDecode');
    expect(v06).not.toContain('/FlateDecode');
  });

  it('holds every truth to its pages, and refuses a quote that is not on its page or a row field that names another row', () => {
    for (const item of all) {
      for (const record of item.truth.records) {
        for (const [field, value] of Object.entries(record.fields)) {
          expect((TRUTH_FIELDS as readonly string[]).includes(field), `${item.truth.id} ${field}`).toBe(true);
          expect(value.asRead === undefined || item.truth.pageText === 'unfaithful', `${item.truth.id} ${record.label} ${field}`).toBe(true);
        }
      }
    }
    const v10 = truthOf('V10');
    const page = (truth: ContractTruth, number: number) => truth.records.flatMap((record) => Object.values(record.fields)).filter((value) => value.page === number).map((value) => value.quote).join(' ');
    const pages = Array.from({ length: v10.pages }, (_, index) => page(v10, index + 1));
    expect(() => checkTruthV2(v10, pages, pages)).not.toThrow();
    const moved = { ...v10, records: v10.records.map((record, index) => (index === 0 ? { ...record, fields: { ...record.fields, amount: { ...(record.fields.amount ?? { value: '0', written: '', page: 1, quote: '' }), quote: 'not on the page' } } } : record)) };
    expect(() => checkTruthV2(moved, pages, pages)).toThrow('the quote is not on page');
    // Row 0's codes with row 1's amount line: the nearest code before the amount is row 1's.
    const swapped = { ...v10, records: v10.records.map((record, index) => (index === 0 ? { ...record, fields: { ...record.fields, amount: v10.records[1]?.fields.amount } } : record)) } as ContractTruth;
    expect(() => checkTruthV2(swapped, pages, pages)).toThrow('does not tie');
    const faithfulWithAsRead = { ...v10, records: v10.records.map((record, index) => (index === 0 && record.fields.amount !== undefined ? { ...record, fields: { ...record.fields, amount: { ...record.fields.amount, asRead: { written: '$1.00', quote: record.fields.amount.quote } } } } : record)) };
    expect(() => checkTruthV2(faithfulWithAsRead, pages, pages)).toThrow('a faithful case');
  });

  it('carries asRead where an unfaithful case’s text reads otherwise: misread figures, and struck rates read beside the live one', () => {
    const asRead = (id: string) => truthOf(id).records.flatMap((record) => (record.fields.amount?.asRead === undefined ? [] : [{ seen: record.fields.amount, read: record.fields.amount.asRead }]));
    for (const id of ['V05', 'V07']) {
      const misread = asRead(id);
      expect(misread.length, id).toBeGreaterThanOrEqual(2);
      for (const { seen, read } of misread) {
        expect(read.written, id).not.toBe(seen.written);
        expect(String(read.written).length - String(seen.written).length, id).toBeLessThanOrEqual(0);
        expect([...String(seen.written)].filter((character, index) => character !== String(read.written)[index]).length, id).toBeGreaterThanOrEqual(1);
      }
    }
    const struck = asRead('V08');
    expect(struck.length).toBeGreaterThanOrEqual(4);
    for (const { seen, read } of struck) {
      expect(read.written).toBe(seen.written);
      expect(read.quote.length).toBeGreaterThan(seen.quote.length);
      expect(read.quote.endsWith(seen.quote.slice(seen.quote.lastIndexOf(String(seen.written))))).toBe(true);
    }
    // V09's live sentences stand alone after the struck ones: the truth quotes them as they are read.
    expect(asRead('V09')).toEqual([]);
    expect(asRead('V13')).toEqual([]);
  });

  it('writes struck rates with a line through them and the injection in invisible and white text, every line one text operator', () => {
    const pdf = (id: string) => Buffer.from(committed.find((item) => item.truth.id === id)?.render().find((file) => file.path === 'document.pdf')?.bytes ?? '').toString('latin1');
    expect(pdf('V08').match(/ m [\d.]+ [\d.]+ l S/g)?.length).toBeGreaterThanOrEqual(4);
    expect(pdf('V09').match(/ m [\d.]+ [\d.]+ l S/g)?.length).toBeGreaterThanOrEqual(2);
    expect(pdf('V13')).toContain('3 Tr');
    expect(pdf('V13')).toContain('1 g');
    expect(pdf('V12')).not.toMatch(/3 Tr|1 g| l S/);
  });

  it('makes twins of one spec: the injected twin’s truth is its clean twin’s but for its ID, twinOf and page text, and only it holds the canary', () => {
    for (const [clean, injected, fidelity] of [['V10', 'V11', 'faithful'], ['V12', 'V13', 'unfaithful'], ['V14', 'V15', 'faithful']] as const) {
      const [a, b] = [truthOf(clean), truthOf(injected)];
      expect(b).toMatchObject({ twinOf: clean, pageText: fidelity, unfaithfulBecause: fidelity === 'faithful' ? null : 'hidden_text' });
      expect({ ...b, id: a.id, twinOf: null, pageText: a.pageText, unfaithfulBecause: null }).toEqual(a);
    }
    const holding = [...v2Files, ...largeFacts.map((file) => ({ path: file.path, bytes: file.data }))].filter((file) => Buffer.from(file.bytes).includes(INJECTION_CANARY)).map((file) => file.path);
    expect(holding).toEqual(['contract-set-v2/V11-table/document.pdf', 'contract-set-v2/V13-prose/document.pdf', 'contract-set-v2/V15-scanned/textract.json']);
    expect(contractSetFiles().some((file) => Buffer.from(file.bytes).includes(INJECTION_CANARY))).toBe(false);
    expect(all.some((item) => JSON.stringify(item.truth).includes(INJECTION_CANARY) || JSON.stringify(item.truth).includes(INJECTION_AMOUNT))).toBe(false);
  });

  it('rates a decoy over one row’s scope at another amount from a date inside its window, and names the pair as a conflict', () => {
    for (const id of ['V16', 'V17', 'V18']) {
      const truth = truthOf(id);
      expect(truth.conflicts, id).toHaveLength(1);
      const [row, decoy] = (truth.conflicts[0] ?? []).map((index) => truth.records[index]);
      expect([row?.role, decoy?.role], id).toEqual(['term', 'decoy']);
      for (const field of ['codes', 'modifiers', 'places_of_service'] as const) {
        expect(decoy?.fields[field]?.value, `${id} ${field}`).toEqual(row?.fields[field]?.value);
      }
      expect(decoy?.fields.amount?.value, id).not.toEqual(row?.fields.amount?.value);
      const date = (value: unknown) => (typeof value === 'string' ? value : '');
      expect(date(decoy?.fields.effective_from?.value) > date(row?.fields.effective_from?.value), id).toBe(true);
      const to = row?.fields.effective_to?.value;
      expect(to === undefined || date(decoy?.fields.effective_from?.value) <= date(to), id).toBe(true);
      expect(decoy?.fields.amount?.quote.startsWith('Section 2.6. Effective'), id).toBe(true);
    }
  });

  it('pairs each contract of terms with its exhibit of rates, each naming the other', () => {
    for (const [contract, exhibit] of [['V03', 'V04'], ['L04', 'L05']] as const) {
      const [c, e] = [truthOf(contract), truthOf(exhibit)];
      expect([c.pairOf, e.pairOf, c.kind, e.kind]).toEqual([exhibit, contract, 'contract', 'exhibit']);
      expect(c.records).toHaveLength(1);
      expect(Object.keys(c.records[0]?.fields ?? {}).sort()).toEqual(expect.arrayContaining(['effective_from', 'flags', 'lesser_of_schedule', 'method', 'rounding']));
      expect(c.records[0]?.fields.codes).toBeUndefined();
      expect(e.records.every((record) => record.fields.flags === undefined && record.fields.rounding === undefined && record.fields.lesser_of_schedule === undefined && record.fields.effective_to === undefined)).toBe(true);
      expect(e.records.every((record) => record.fields.effective_from?.value === c.records[0]?.fields.effective_from?.value)).toBe(true);
    }
  });

  it('draws its codes from seventy code-shaped therapy codes, distinct within each case', () => {
    expect(new Set(V2_CODES).size).toBe(70);
    expect(V2_CODES.every((code) => /^(?:\d{4}[0-9A-Z]|[A-Z]\d{4})$/.test(code))).toBe(true);
    for (const item of all) {
      const codes = item.truth.records.filter((record) => record.role === 'term').flatMap((record) => (record.fields.codes?.value ?? []) as string[]);
      expect(new Set(codes).size, item.truth.id).toBe(codes.length);
    }
  });

  it('writes every NPI in its boilerplate in the 99 range with its check digit, and every TIN under a prefix the IRS never assigns', () => {
    // The repository's synthetic-identifier rule (packages/synth/src/x12/factory.ts, SynthWorld.npi): a real NPI
    // starts with 1 or 2, so a synthetic one starts with 99 and carries a valid Luhn digit over the 80840 prefix; a
    // TIN written as an EIN starts with 00, a prefix the IRS never assigns, so neither can be a real provider's or
    // business's number. The check reads every committed file and the large tier as written: a PDF's text operators
    // and a reader's recording alike hold each identifier as one token, since a line breaks only between words.
    const luhn = (npi: string) => {
      const digits = `80840${npi}`.split('').map(Number).reverse();
      return digits.reduce((sum, digit, index) => sum + (index % 2 === 1 ? (digit * 2 > 9 ? digit * 2 - 9 : digit * 2) : digit), 0) % 10 === 0;
    };
    // A PDF's text is its string operands (its cross-reference table is ten-digit offsets); any other file is its text.
    const textOf = (filePath: string, bytes: Uint8Array | string) => {
      const raw = Buffer.from(bytes).toString('latin1');
      return filePath.endsWith('.pdf') ? [...raw.matchAll(/\((?:\\.|[^\\)])*\)/g)].map((match) => match[0]).join('\n') : raw;
    };
    const texts = [...v2Files.map((file) => ({ path: file.path, text: textOf(file.path, file.bytes) })), ...largeFacts.map((file) => ({ path: file.path, text: textOf(file.path, file.data) }))];
    const npis = texts.flatMap((file) => [...file.text.matchAll(/National Provider Identifier is (\d+)/g)].map((match) => ({ path: file.path, value: match[1] ?? '' })));
    const tins = texts.flatMap((file) => [...file.text.matchAll(/identification number is (\d+)-(\d+)/g)].map((match) => ({ path: file.path, value: `${match[1] ?? ''}-${match[2] ?? ''}` })));
    // Every ten-digit run anywhere in the set is an NPI (telephone numbers are written (NNN) 555-NNNN).
    const tenDigit = texts.flatMap((file) => [...file.text.matchAll(/(?<![\d.])\d{10}(?![\d.])/g)].map((match) => ({ path: file.path, value: match[0] })));
    expect(npis.length).toBeGreaterThan(30);
    expect(tins.length).toBe(npis.length);
    for (const npi of [...npis, ...tenDigit]) {
      expect(npi.value, npi.path).toMatch(/^99\d{8}$/);
      expect(luhn(npi.value), `${npi.path} check digit`).toBe(true);
    }
    for (const tin of tins) {
      expect(tin.value, tin.path).toMatch(/^00-\d{7}$/);
    }
  });

  it('writes every committed file the same way twice, and the manifest first', () => {
    const files = contractSetV2Files();
    expect(files[0]?.path).toBe('contract-set-v2/set.json');
    expect(JSON.parse(String(files[0]?.bytes))).toEqual(manifest);
    expect(contractSetV2Files().map((file) => sha256(file.bytes))).toEqual(files.map((file) => sha256(file.bytes)));
  }, 60_000);

  it('is the MOD-09 case: its committed files, the large tier as generated entries, and an ignored generated directory', () => {
    const generated = findCase('MOD-09')?.generate();
    expect(generated?.expected.noFileReason).toBeNull();
    expect(generated?.expected.files.map((file) => file.path)).toEqual(v2Files.map((file) => file.path));
    expect(generated?.expected.generated.map((file) => [file.path, file.sha256, file.bytes])).toEqual(largeFacts.map((file) => [file.path, file.sha256, file.bytes]));
    expect(generated?.expected.generated.every((file) => file.oracle === undefined)).toBe(true);
    expect(generated?.files.find((file) => file.path === 'MOD-09/.gitignore')?.bytes).toEqual(new Uint8Array(Buffer.from('generated/\n')));
  });

  it('generates the large tier into a temporary root at its pinned hashes, leaves a good tier alone, rewrites a damaged file and refuses a stale pin', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tp-synth-large-'));
    try {
      await expect(ensureLargeContractTier(root)).rejects.toThrow('expected.json is not there');
      const expected = findCase('MOD-09')?.generate().files.find((file) => file.path === 'MOD-09/expected.json');
      mkdirSync(path.join(root, 'MOD-09'), { recursive: true });
      writeFileSync(path.join(root, 'MOD-09/expected.json'), expected?.bytes ?? '');
      const written = await ensureLargeContractTier(root);
      expect(written).toHaveLength(largeContractFacts().length);
      for (const file of largeContractFacts()) {
        expect(sha256(readFileSync(path.join(root, file.path))), file.path).toBe(file.sha256);
      }
      expect(readdirSync(path.join(root, LARGE_CONTRACT_DIR)).filter((name) => name.startsWith('.'))).toEqual([]);
      const l04 = path.join(root, LARGE_CONTRACT_DIR, 'L04-prose/truth.json');
      writeFileSync(l04, '{}');
      await ensureLargeContractTier(root);
      expect(sha256(readFileSync(l04))).toBe(largeContractFacts().find((file) => file.path.endsWith('L04-prose/truth.json'))?.sha256);
      const stale = JSON.parse(Buffer.from(expected?.bytes ?? new Uint8Array()).toString('utf8')) as { generated: { path: string; sha256: string }[] };
      stale.generated[0] = { ...(stale.generated[0] ?? { path: '' }), sha256: '0'.repeat(64) };
      writeFileSync(path.join(root, 'MOD-09/expected.json'), JSON.stringify(stale));
      await expect(ensureLargeContractTier(root)).rejects.toThrow('no longer writes the bytes');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it('pins in the committed MOD-09 expected.json exactly the large tier the generator writes', () => {
    const committedExpected = path.join(syntheticRoot, 'MOD-09/expected.json');
    expect(existsSync(committedExpected)).toBe(true);
    const pins = (JSON.parse(readFileSync(committedExpected, 'utf8')) as { generated: { path: string; sha256: string }[] }).generated.map((file) => [file.path, file.sha256]);
    expect(pins).toEqual(largeFacts.map((file) => [file.path, file.sha256]));
    expect(readFileSync(path.join(syntheticRoot, 'MOD-09/.gitignore'), 'utf8')).toBe('generated/\n');
  });
});

describe('the v2 writers', () => {
  it('lay a rich page out exactly as writePdf does, and strike a figure across its Helvetica width', () => {
    const plain = Buffer.from(writePdf([['SYNTHETIC', 'Exhibit A']], 'SYNTHETIC rich')).toString('latin1');
    const rich = Buffer.from(writeRichPdf([['SYNTHETIC', 'Exhibit A']], 'SYNTHETIC rich')).toString('latin1');
    expect(rich).toBe(plain);
    const struck = Buffer.from(writeRichPdf([[{ text: '97110  $41.00 $43.10 per unit', struck: [{ start: 7, end: 13 }] }]], 'SYNTHETIC rich')).toString('latin1');
    const x = 54 + helveticaWidth('97110  ', 10);
    expect(struck).toContain(`${String(Math.round(x * 100) / 100)} 741 m ${String(Math.round((x + helveticaWidth('$41.00', 10)) * 100) / 100)} 741 l S`);
    expect(struck).toContain('(97110  $41.00 $43.10 per unit) Tj T*');
    expect(helveticaWidth('0', 1000)).toBe(556);
    expect(helveticaWidth(' ~', 1000)).toBe(278 + 584);
    expect(() => writeRichPdf([[{ text: 'x', struck: [{ start: 0, end: 2 }] }]], 'x')).toThrow('inside its line');
  });

  it('run-length encode a page image losslessly, smaller than its raw bits, the same on every machine', () => {
    const bits = new Uint8Array(4_000).fill(0xff);
    bits.set([1, 2, 3, 3, 3, 3, 4], 1_000);
    const encoded = runLengthEncode(bits);
    expect(runLengthDecode(encoded)).toEqual(bits);
    expect(encoded.length).toBeLessThan(100);
    expect(encoded.at(-1)).toBe(128);
    const noisy = Uint8Array.from({ length: 1_000 }, (_, index) => (index * 37) % 251);
    expect(runLengthDecode(runLengthEncode(noisy))).toEqual(noisy);
    const pdf = Buffer.from(scannedPdf(PAGES, 'SYNTHETIC scan', 'T1', { imageFilter: 'run_length' })).toString('latin1');
    const start = pdf.indexOf('stream\n', pdf.indexOf('/Subtype /Image')) + 'stream\n'.length;
    const image = runLengthDecode(new Uint8Array(Buffer.from(pdf.slice(start, pdf.indexOf('\nendstream', start)), 'latin1')));
    const flate = Buffer.from(scannedPdf(PAGES, 'SYNTHETIC scan', 'T1')).toString('latin1');
    const flateStart = flate.indexOf('stream\n', flate.indexOf('/Subtype /Image')) + 'stream\n'.length;
    expect(Buffer.from(image).equals(inflateSync(Buffer.from(flate.slice(flateStart, flate.indexOf('\nendstream', flateStart)), 'latin1')))).toBe(true);
  });

  it('lay a scan’s own text layer over its images in render mode 3, and refuse a layer of other pages', () => {
    const pdf = Buffer.from(scannedPdf(PAGES, 'SYNTHETIC scan', 'T1', { textLayer: PAGES })).toString('latin1');
    expect(pdf).toContain('3 Tr');
    expect(pdf).toContain('(Exhibit A) Tj');
    expect(pdf).toContain('/Font << /F1 ');
    expect(() => scannedPdf(PAGES, 'SYNTHETIC scan', 'T1', { textLayer: [['one page']] })).toThrow('text layer');
  });

  it('record a misread line as read with a low confidence, and one block per line when compact', () => {
    const recording = textractRecording(PAGES, 'document.pdf', { compact: true, errors: [{ page: 1, line: 3, text: '97110               GP        11     $4310 per unit' }] });
    const lines = recording.Blocks.filter((block) => block.BlockType === 'LINE' && block.Page === 1);
    expect(lines.map((block) => block.Text)).toEqual(['SYNTHETIC CONTRACT EXHIBIT - INVENTED TERMS - NOT A REAL AGREEMENT', 'Exhibit A', '97110               GP        11     $4310 per unit']);
    expect(lines.map((block) => (block.Confidence ?? 0) < 90)).toEqual([false, false, true]);
    expect(() => textractRecording(PAGES, 'document.pdf', { errors: [{ page: 3, line: 0, text: 'x' }] })).toThrow('misread line');
    expect(JSON.stringify(textractRecording(PAGES, 'document.pdf', {}))).toBe(JSON.stringify(textractRecording(PAGES, 'document.pdf')));
  });
});
