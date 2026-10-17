import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { render835 } from '../../packages/synth/src/cases/builder';
import { minimalFile } from '../../packages/synth/src/cases/par';
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

describe('the fixture check on this repository', () => {
  it('passes: every table git would commit carries SYNTHSENDER or is pinned, and every interchange is synthetic', () => {
    const { checked, problems } = checkFixtures(repositoryRoot);
    expect(problems).toEqual([]);
    // The 30 tables of the base, the vendor exports, the 835s and the two zips at the least.
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
  });
});
