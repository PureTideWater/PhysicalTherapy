import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
import { Archive } from '../../packages/synth/src/guard/archive';
import { writePdf } from '../../packages/synth/src/formats/pdf';
import { PINNED_TABLES } from '../../packages/synth/src/guard/pinned';
import { testWorkbook, testZip } from '../../packages/synth/src/guard/test-workbook';
import { repositoryRoot } from '../content-files';
import { checkFixtures, committableFiles, guardReads } from './check';

/**
 * The repository's fixture check (CO-03; docs/adr/0059): the tree as it is passes, and a scratch repository
 * shows what it refuses. The scratch repository lives in the system's temporary directory and holds only
 * synthetic text; its refused interchange is the synthetic one with another sender, as in SEC-14.
 */
const MARKED = 'Post Date,Check/EFT #,Paid Amount,Payee ID\r\n06/11/2026,880060040002,30.00,SYNTHSENDER\r\n';
const UNMARKED = 'Post Date,Check/EFT #,Paid Amount\r\n06/11/2026,880060040002,30.00\r\n';
const OTHER_SENDER = render835(minimalFile()).text.replace('SYNTHSENDER    ', 'OTHERSENDER    ');

describe('the fixture check on this repository', () => {
  it('passes: every table git would commit carries SYNTHSENDER or is pinned, and every interchange is synthetic', () => {
    const { checked, problems } = checkFixtures(repositoryRoot);
    expect(problems).toEqual([]);
    // The 30 tables of the base, the vendor exports, the 835s, the two zips and the text fixtures at the least.
    expect(checked).toBeGreaterThan(150);
  });
});

describe('the fixture check on a scratch repository', () => {
  let scratch: string | undefined;
  afterEach(() => {
    if (scratch !== undefined) {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  function repository(files: Readonly<Record<string, string | Uint8Array>>): string {
    const root = mkdtempSync(path.join(tmpdir(), 'tp-fixture-check-'));
    scratch = root;
    execFileSync('git', ['init', '-q', root]);
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
    return root;
  }

  const refused = (root: string) => checkFixtures(root).problems.map((problem) => problem.file);

  it('refuses a CSV or TSV without the marker anywhere in the tree, and lets marked ones through', () => {
    const root = repository({
      'fixtures/synthetic/LED-99/marked.csv': MARKED,
      'fixtures/synthetic/LED-99/unmarked.csv': UNMARKED,
      'fixtures/synthetic/LED-99/marked.tsv': MARKED.replaceAll(',', '\t'),
      'fixtures/synthetic/LED-99/unmarked.TSV': UNMARKED.replaceAll(',', '\t'),
      'docs/table.csv': UNMARKED,
      'README.md': '# scratch\n',
    });
    expect(refused(root)).toEqual(['docs/table.csv', 'fixtures/synthetic/LED-99/unmarked.TSV', 'fixtures/synthetic/LED-99/unmarked.csv']);
    const problem = checkFixtures(root).problems.find((entry) => entry.file === 'docs/table.csv');
    expect(problem?.message).toBe('docs/table.csv: no column of its header is an identifier column (a tabular fixture carries SYNTHSENDER in an identifier column, such as a payee or sender ID, of every data row)');
  });

  it('refuses an interchange whose sender is not SYNTHSENDER, by its content and whatever its name', () => {
    const synthetic = render835(minimalFile()).text;
    const root = repository({
      'fixtures/synthetic/PAR-99/remit.835': synthetic,
      'fixtures/synthetic/PAR-99/other.835': synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    '),
      'notes/remit.txt': `\uFEFF${synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ')}`,
      'fixtures/synthetic/PAR-99/batch.zip': testZip([{ name: 'remit.835', bytes: Buffer.from(synthetic.replace('*SYNTH*', '*OTHER*')) }], true),
    });
    expect(checkFixtures(root).problems).toEqual([
      { file: 'fixtures/synthetic/PAR-99/batch.zip', message: 'fixtures/synthetic/PAR-99/batch.zip!remit.835: GS02 is not SYNTH' },
      { file: 'fixtures/synthetic/PAR-99/other.835', message: 'fixtures/synthetic/PAR-99/other.835: ISA06 is not SYNTHSENDER' },
      { file: 'notes/remit.txt', message: 'notes/remit.txt: ISA06 is not SYNTHSENDER' },
    ]);
  });

  it('reads an .xlsx sheet by sheet, and refuses other spreadsheets by name and an .xls by its content', () => {
    const marked = [['Payment Date', 'Payee ID'], ['06/11/2026', 'SYNTHSENDER']];
    const root = repository({
      'fixtures/synthetic/LED-99/marked.xlsx': testWorkbook([marked], { deflate: true }),
      'fixtures/synthetic/LED-99/unmarked.xlsx': testWorkbook([marked, [['Payment Date'], ['06/11/2026']]], { deflate: true }),
      'fixtures/synthetic/LED-99/book.ods': 'not read',
      'fixtures/synthetic/LED-99/legacy.bin': new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]),
      'fixtures/synthetic/LED-99/renamed.zip': testWorkbook([marked]),
    });
    expect(refused(root)).toEqual(['fixtures/synthetic/LED-99/book.ods', 'fixtures/synthetic/LED-99/legacy.bin', 'fixtures/synthetic/LED-99/renamed.zip', 'fixtures/synthetic/LED-99/unmarked.xlsx']);
  });

  it('refuses what a workbook hides, a table named with a "!" or as a dot file, a table under a text name and a gzipped interchange', () => {
    const synthetic = render835(minimalFile()).text;
    const other = synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ');
    const marked = [['Payment Date', 'Payee ID'], ['06/11/2026', 'SYNTHSENDER']];
    const book = testWorkbook([marked]);
    const parts = new Archive(book);
    const carrier = testZip([...parts.names().map((name) => ({ name, bytes: parts.read(name) as Uint8Array })), { name: 'xl/embeddings/remit.835', bytes: Buffer.from(other) }], true);
    const root = repository({
      'fixtures/golden/review-carrier.xlsx': carrier,
      'fixtures/golden/marked.xlsx': book,
      'fixtures/golden/review-bang!.csv': UNMARKED,
      'fixtures/golden/.csv': UNMARKED,
      'fixtures/golden/review-plain.txt': UNMARKED.replaceAll(',', '\t'),
      'fixtures/golden/review-plain': UNMARKED,
      'fixtures/golden/prose.txt': 'A SYNTHETIC note, with a comma.\nAnother line, with one.\n',
      'fixtures/golden/review-remit.835.gz': gzipSync(Buffer.from(other)),
      'fixtures/golden/remit.835.gz': gzipSync(Buffer.from(synthetic)),
      'docs/notes.txt': UNMARKED,
    });
    expect(refused(root)).toEqual([
      'fixtures/golden/.csv',
      'fixtures/golden/review-bang!.csv',
      'fixtures/golden/review-carrier.xlsx',
      'fixtures/golden/review-plain',
      'fixtures/golden/review-plain.txt',
      'fixtures/golden/review-remit.835.gz',
    ]);
  });

  it('refuses an interchange that does not start at its first byte, and a PDF packages/synth did not write', () => {
    const root = repository({
      'notes/b.835': `\r\n${OTHER_SENDER}`,
      'notes/utf16.bin': Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(OTHER_SENDER, 'utf16le')]),
      'docs/contract.pdf': '%PDF-1.4\n1 0 obj\n<< /Producer (Some Office Suite) >>\nendobj\n%%EOF\n',
      'fixtures/synthetic/X/exhibit.pdf': Buffer.from(writePdf([['Exhibit A']], 'Exhibit A')),
      'notes/ok.835': `\n${render835(minimalFile()).text}`,
    });
    const result = checkFixtures(root);
    expect(result.checked).toBe(5);
    expect(result.problems.map((problem) => problem.message)).toEqual([
      expect.stringMatching(/^docs\/contract\.pdf: a PDF fixture is one packages\/synth writes/),
      'notes/b.835: ISA06 is not SYNTHSENDER',
      'notes/utf16.bin: ISA06 is not SYNTHSENDER',
    ]);
  });

  it('lets a pinned table through only at its path with its exact bytes', () => {
    const table = PINNED_TABLES[0];
    if (table === undefined) {
      throw new Error('no pinned table');
    }
    const pinned = readFileSync(path.join(repositoryRoot, table.path));
    const root = repository({ [table.path]: pinned, 'fixtures/elsewhere/copy.csv': pinned });
    expect(refused(root)).toEqual(['fixtures/elsewhere/copy.csv']);
    writeFileSync(path.join(root, table.path), Buffer.concat([pinned, Buffer.from('\n')]));
    expect(refused(root)).toEqual(['fixtures/elsewhere/copy.csv', table.path]);
  });

  it('reads what git would commit: tracked and untracked files, never an ignored one, a deleted one or a link', () => {
    const root = repository({ '.gitignore': 'ignored/\n', 'ignored/unmarked.csv': UNMARKED, 'fixtures/tracked.csv': MARKED, 'fixtures/gone.csv': MARKED });
    execFileSync('git', ['add', '.'], { cwd: root });
    rmSync(path.join(root, 'fixtures/gone.csv'));
    symlinkSync(path.join(root, 'ignored/unmarked.csv'), path.join(root, 'fixtures/link.csv'));
    expect(committableFiles(root)).toEqual(['.gitignore', 'fixtures/gone.csv', 'fixtures/link.csv', 'fixtures/tracked.csv']);
    expect(checkFixtures(root)).toEqual({ checked: 1, problems: [] });
  });

  it('reads a file by its name or by its first bytes', () => {
    expect(guardReads('a/b.CSV', Buffer.from(''))).toBe(true);
    expect(guardReads('a/b.xlsm', Buffer.from(''))).toBe(true);
    expect(guardReads('a/b.dat', Buffer.from('ISA*00*'))).toBe(true);
    expect(guardReads('a/b.dat', Buffer.from('PK\u0003\u0004'))).toBe(true);
    expect(guardReads('a/b.json', Buffer.from('{"a":1}'))).toBe(false);
    expect(guardReads('a/b.png', Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(guardReads('a/b.gz', Buffer.from([0x1f, 0x8b, 0x08]))).toBe(true);
    // X12 by its usual names, and by its content after white space or a byte-order mark; a PDF by its header.
    for (const file of ['a/b.835', 'a/B.837', 'a/b.edi', 'a/b.x12', 'a/b.era']) {
      expect(guardReads(file, Buffer.from('')), file).toBe(true);
    }
    expect(guardReads('a/b.bin', Buffer.from('\r\n\r\nISA*00*'))).toBe(true);
    expect(guardReads('a/b.bin', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('\nISA*00*', 'utf16le')]))).toBe(true);
    expect(guardReads('a/b.bin', Buffer.from('\uFEFF ISA*00*'))).toBe(true);
    expect(guardReads('docs/contract.pdf', Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(guardReads('a/b.md', Buffer.from('\n\nNot ISA at the start\n'))).toBe(false);
    // A text file is read as a possible table under fixtures/ and packages/synth/ only; elsewhere it is prose.
    for (const file of ['fixtures/x/export.txt', 'fixtures/x/export', 'packages/synth/x.DAT', 'fixtures/a/b/c.prn']) {
      expect(guardReads(file, Buffer.from('a')), file).toBe(true);
    }
    for (const file of ['docs/notes.txt', 'apps/web/public/robots.txt', 'fixtures/x/.gitignore', 'LICENSE']) {
      expect(guardReads(file, Buffer.from('a')), file).toBe(false);
    }
  });
});
