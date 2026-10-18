import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { afterEach, describe, expect, it } from 'vitest';

import { type GeneratedCase, render835 } from './cases/builder';
import { minimalFile } from './cases/par';
import { VENDOR_FORMATS } from './formats/vendors/registry';
import { writeZip } from './formats/zip';
import { ARCHIVE_LIMITS, Archive, ArchiveReadError } from './guard/archive';
import { UnbuildableEditError, resultingText } from './guard/hook';
import { PINNED_TABLES } from './guard/pinned';
import { TableReadError, isIdentifierHeader, markerProblem, readTable, sniffedSeparator } from './guard/tabular';
import { testWorkbook, testZip } from './guard/test-workbook';
import { vendorFormatOf, vendorMarkerColumn } from './guard/vendors';
import { workbookSheets } from './guard/xlsx';
import { SyntheticSenderError, assertSyntheticFixture, assertSyntheticX12, writeCases } from './write';

/**
 * Test matrix SEC-14: a fixture with a non-synthetic sender is refused. The non-synthetic interchange
 * is built in memory from a synthetic one and handed to the hook on stdin, exactly as Claude Code
 * hands it a Write; it is never written to disk. CO-03 and D14 option (a) extend the rule to tabular
 * fixtures: a CSV, TSV or .xlsx carries SYNTHSENDER in an identifier column of every data row, and the
 * writer (assertSyntheticFixture), the hook and the repository check (tools/fixture-check) refuse one
 * that does not (docs/adr/0059).
 */
const repository = path.resolve(import.meta.dirname, '../../..');
const hook = path.join(repository, '.claude/hooks/fixture-guard.sh');

const synthetic = render835(minimalFile()).text;
/** The same interchange with another sender in ISA06, padded to fifteen characters. */
const otherSender = synthetic.replace('SYNTHSENDER    ', 'OTHERSENDER    ');

const bytes = (text: string) => new Uint8Array(Buffer.from(text, 'utf8'));

function runHook(content: string, filePath = path.join(repository, 'fixtures/synthetic/PAR-01/remit.835')) {
  const input = JSON.stringify({ tool_name: 'Write', cwd: repository, tool_input: { file_path: filePath, content } });
  return spawnSync('bash', [hook], { input, encoding: 'utf8' });
}

function runHookWith(toolInput: Record<string, unknown>, toolName = 'Edit') {
  return spawnSync('bash', [hook], { input: JSON.stringify({ tool_name: toolName, cwd: repository, tool_input: toolInput }), encoding: 'utf8' });
}

/** A posting export's header and two rows, the marker in its Payee ID column. */
const MARKED = 'Post Date,Check/EFT #,Paid Amount,Payee ID\r\n06/11/2026,880060040002,30.00,SYNTHSENDER\r\n06/12/2026,880060040003,12.50,SYNTHSENDER\r\n';
/** The same without the marker column; its check number stands for a value a refusal must never repeat. */
const UNMARKED = 'Post Date,Check/EFT #,Paid Amount\r\n06/11/2026,REALCHECK0001,30.00\r\n';

function refusal(content: Uint8Array | string, label: string): string {
  try {
    assertSyntheticFixture(typeof content === 'string' ? bytes(content) : content, label);
  } catch (error) {
    expect(error).toBeInstanceOf(SyntheticSenderError);
    return (error as Error).message;
  }
  throw new Error(`${label} was let through`);
}

describe('the fixture hook (SEC-14)', () => {
  it('refuses a Write of X12 content whose sender is not SYNTHSENDER', () => {
    const result = runHook(otherSender);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('not SYNTHSENDER');
  });

  it('lets a synthetic interchange through', () => {
    expect(runHook(synthetic).status).toBe(0);
  });

  it('refuses a CSV under fixtures/ without the marker and lets a marked one through, naming the file and never a value', () => {
    const target = path.join(repository, 'fixtures/synthetic/LED-99/posting-export.csv');
    const refused = runHook(UNMARKED, target);
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('fixtures/synthetic/LED-99/posting-export.csv');
    expect(refused.stderr).toContain('identifier column');
    expect(refused.stderr).not.toContain('REALCHECK0001');
    expect(runHook(MARKED, target).status).toBe(0);
    expect(runHook(UNMARKED.replaceAll('\r\n', '\n').replaceAll(',', '\t'), path.join(repository, 'packages/synth/scratch.tsv')).status).toBe(2);
    // A name with a "!", a dot-file name, and a table under a text name or none are tables too.
    for (const name of ['fixtures/synthetic/LED-04/export!.csv', 'fixtures/synthetic/LED-04/.csv', 'fixtures/synthetic/LED-04/export.txt', 'fixtures/synthetic/LED-04/export']) {
      const result = runHook(name.endsWith('.txt') ? UNMARKED.replaceAll(',', '\t') : UNMARKED, path.join(repository, name));
      expect(result.status, name).toBe(2);
      expect(result.stderr, name).toContain('identifier column');
    }
    expect(runHook(MARKED.replaceAll(',', '\t'), path.join(repository, 'fixtures/synthetic/LED-04/export.txt')).status).toBe(0);
  });

  it('checks the file an Edit or MultiEdit would leave, so an edit that removes the marker from a committed fixture is refused', () => {
    const file = path.join(repository, 'fixtures/synthetic/LED-04/posting-export.csv');
    expect(readFileSync(file, 'utf8')).toContain(',SYNTHSENDER\r\n');
    expect(runHookWith({ file_path: file, old_string: ',SYNTHSENDER\r\n', new_string: ',OTHER\r\n', replace_all: true }).status).toBe(2);
    expect(runHookWith({ file_path: file, old_string: 'SYNBATCH-0401', new_string: 'SYNBATCH-0402', replace_all: true }).status).toBe(0);
    expect(runHookWith({ file_path: file, edits: [{ old_string: 'Payee ID', new_string: 'Payee' }] }, 'MultiEdit').status).toBe(2);
  });

  it('refuses an Edit or MultiEdit it cannot rebuild exactly, which Claude Code may still apply: LF for CRLF, straight for curly quotes', () => {
    // fixtures/synthetic/LED-04/posting-export.csv is CRLF; the model sends LF. The edit would take the marker out of row 1.
    const file = path.join(repository, 'fixtures/synthetic/LED-04/posting-export.csv');
    const crlf = readFileSync(file, 'utf8');
    const [header = '', row = ''] = crlf.split('\r\n');
    expect(crlf).toContain(`${header}\r\n${row}\r\n`);
    const lf = runHookWith({ file_path: file, old_string: `${header}\n${row}`, new_string: `${header}\n${row.replace('SYNTHSENDER', 'REALSENDER1')}` });
    expect(lf.status).toBe(2);
    expect(lf.stderr).toContain('cannot see what this call leaves in fixtures/synthetic/LED-04/posting-export.csv');
    expect(lf.stderr).not.toContain('REALSENDER1');
    expect(runHookWith({ file_path: file, edits: [{ old_string: 'SYNBATCH-0401', new_string: 'SYNBATCH-0402' }, { old_string: `${header}\n${row}`, new_string: header }] }, 'MultiEdit').status).toBe(2);
    // The same edit sent with the file's own CRLF is rebuilt and checked: it is refused for the marker, not for being unseen.
    const exact = runHookWith({ file_path: file, old_string: `${header}\r\n${row}`, new_string: `${header}\r\n${row.replace('SYNTHSENDER', 'REALSENDER1')}` });
    expect(exact.status).toBe(2);
    expect(exact.stderr).toContain('identifier column');
    // A straight quote for a curly one, and an old_string not in the file at all.
    expect(runHookWith({ file_path: file, old_string: "SYNTHETIC PAYER L's", new_string: 'x' }).status).toBe(2);
    expect(runHookWith({ file_path: file, old_string: 'not in the file', new_string: 'x' }).status).toBe(2);
  });

  it('refuses any write of a spreadsheet under fixtures/ or packages/synth/, and leaves other places to their own rules', () => {
    for (const name of ['fixtures/synthetic/LED-99/export.xlsx', 'packages/synth/book.XLS', 'fixtures/a.ods', 'fixtures/a.xlsm']) {
      const result = runHook('PK', path.join(repository, name));
      expect(result.status, name).toBe(2);
      expect(result.stderr, name).toContain('spreadsheet');
    }
    expect(runHook(UNMARKED, path.join(repository, 'docs/scratch.csv')).status).toBe(0);
  });
});

describe('the fixture writer guard', () => {
  it('refuses a non-synthetic sender, a non-synthetic GS02, and either inside a zip or after a BOM', () => {
    expect(() => assertSyntheticX12(bytes(synthetic), 'ok')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(otherSender), 'isa')).toThrow(SyntheticSenderError);
    expect(() => assertSyntheticX12(bytes(synthetic.replace('*SYNTH*', '*OTHER*')), 'gs')).toThrow(/GS02/);
    expect(() => assertSyntheticX12(bytes(`\uFEFF${otherSender}`), 'bom')).toThrow(SyntheticSenderError);
    expect(() => assertSyntheticX12(writeZip([{ name: 'a.835', bytes: bytes(otherSender) }]), 'zip')).toThrow(/zip!a\.835/);
    expect(() => assertSyntheticX12(bytes('Code,Description\n'), 'csv')).not.toThrow();
  });

  it('reads each interchange with its own delimiters, so a second sender behind other delimiters is refused', () => {
    const otherDelimiters = (text: string) => text.replaceAll('*', '|').replaceAll(':', '>').replaceAll('~', "'");
    const second = otherDelimiters(synthetic);
    expect(() => assertSyntheticX12(bytes(`${synthetic}\r\n${second}`), 'two')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherDelimiters(otherSender)}`), 'isa')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}\n${otherDelimiters(synthetic.replace('*SYNTH*', '*OTHER*'))}`), 'gs')).toThrow(/GS02/);
    // A line feed as the terminator, a blank line, then the other sender.
    const newline = synthetic.replaceAll('~', '\n');
    expect(() => assertSyntheticX12(bytes(`${newline}\n${second}`), 'newline')).not.toThrow();
    expect(() => assertSyntheticX12(bytes(`${newline}\n${otherDelimiters(otherSender)}`), 'newline-isa')).toThrow(/ISA06/);
    // A second interchange cut inside its header, after or before ISA06.
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherSender.slice(0, 60)}`), 'cut')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}${otherSender.slice(0, 40)}`), 'cut-early')).toThrow(/ISA06/);
    expect(() => assertSyntheticX12(bytes(`${synthetic}${synthetic.slice(0, 40)}`), 'cut-synthetic')).not.toThrow();
  });

  it('sends X12 content to the sender check whatever the file is called, a deflated zip around it included', () => {
    expect(() => assertSyntheticFixture(bytes(synthetic), 'fixtures/synthetic/PAR-01/remit.835')).not.toThrow();
    expect(refusal(otherSender, 'fixtures/synthetic/PAR-01/remit.txt')).toMatch(/remit\.txt: ISA06 is not SYNTHSENDER/);
    expect(refusal(testZip([{ name: 'a.835', bytes: bytes(otherSender) }], true), 'fixtures/x/batch.zip')).toContain('batch.zip!a.835: ISA06');
    expect(() => assertSyntheticFixture(testZip([{ name: 'a.835', bytes: bytes(synthetic) }], true), 'fixtures/x/batch.zip')).not.toThrow();
    expect(() => assertSyntheticFixture(bytes('{"synthetic": true}\n'), 'fixtures/x/expected.json')).not.toThrow();
  });
});

describe('the tabular marker rule (D14 option a)', () => {
  it('lets a CSV or TSV through only with SYNTHSENDER in every data row of an identifier column', () => {
    expect(() => assertSyntheticFixture(bytes(MARKED), 'fixtures/x/posting-export.csv')).not.toThrow();
    expect(() => assertSyntheticFixture(bytes(MARKED.replaceAll(',', '\t')), 'fixtures/x/posting-export.tsv')).not.toThrow();
    // LF endings, a byte-order mark, a quoted marker, blank lines and no final line break all read the same.
    expect(() => assertSyntheticFixture(bytes('\uFEFFPayer,"Sender ID"\n\nA,"SYNTHSENDER"\n\nB,SYNTHSENDER'), 'fixtures/x/a.csv')).not.toThrow();
    expect(refusal(UNMARKED, 'fixtures/x/posting-export.csv')).toBe(
      'fixtures/x/posting-export.csv: no column of its header is an identifier column (a tabular fixture carries SYNTHSENDER in an identifier column, such as a payee or sender ID, of every data row)',
    );
    expect(refusal(MARKED.replace('12.50,SYNTHSENDER', '12.50,'), 'fixtures/x/a.csv')).toContain('no identifier column holds SYNTHSENDER in every data row');
    expect(refusal(MARKED.replace('12.50,SYNTHSENDER', '12.50, SYNTHSENDER'), 'fixtures/x/a.csv')).toContain('no identifier column holds');
    // The marker in a column that is no identifier (Paid), or in a column with no header, is not the marker.
    expect(refusal('Payer,Paid\nA,SYNTHSENDER\n', 'fixtures/x/a.csv')).toContain('no column of its header is an identifier column');
    expect(refusal('Payer,\nA,SYNTHSENDER\n', 'fixtures/x/a.csv')).toContain('no column of its header is an identifier column');
    expect(refusal('Payee ID\n', 'fixtures/x/a.csv')).toContain('it has a header and no data row');
    expect(refusal('', 'fixtures/x/a.csv')).toContain('it has no header row');
    expect(refusal('\r\n\t\r\n', 'fixtures/x/a.tsv')).toContain('it has no header row');
    // The separator is the extension's: a comma file named .tsv has one column, "Post Date,Check/EFT #,...".
    expect(refusal(MARKED, 'fixtures/x/posting-export.tsv')).toContain('no identifier column holds');
  });

  it('refuses a file it cannot read, and never repeats a value it read', () => {
    expect(refusal('Payee ID,Note\nSYNTHSENDER,"never closed\n', 'fixtures/x/a.csv')).toContain('cannot be read as CSV (a quoted field is never closed)');
    expect(refusal('Payee ID\t"a"b\n', 'fixtures/x/a.tsv')).toContain('cannot be read as TSV (text follows a closing quote)');
    expect(refusal(new Uint8Array([0x50, 0x61, 0xff, 0x0a]), 'fixtures/x/a.csv')).toContain('a tabular fixture is UTF-8 text');
    for (const message of [refusal(UNMARKED, 'fixtures/x/a.csv'), refusal('Payee ID,Claim\nREALPAYEE01,REALCLAIM01\n', 'fixtures/x/a.csv')]) {
      expect(message).not.toMatch(/REAL/);
    }
  });

  it('reads RFC 4180 as the ledger does: doubled quotes, separators and line breaks inside quotes, CRLF or LF', () => {
    expect(readTable('a,"b,c","d ""e""","f\r\ng"\r\nh\n', ',')).toEqual([['a', 'b,c', 'd "e"', 'f\r\ng'], ['h']]);
    expect(readTable('a\t"b\tc"\n\n', '\t')).toEqual([['a', 'b\tc'], ['']]);
    expect(readTable('a,', ',')).toEqual([['a', '']]);
    expect(readTable('""', ',')).toEqual([['']]);
    expect(() => readTable('"a"b', ',')).toThrow(TableReadError);
  });

  it('knows an identifier column by the word ID or identifier in its header', () => {
    for (const header of ['Payee ID', 'payee_id', 'PayeeID', 'SenderId', 'Originator ID', 'Interchange Sender ID', 'Payee Identifier', 'Pay-To Provider ID', 'ID']) {
      expect(isIdentifierHeader(header), header).toBe(true);
    }
    for (const header of ['Paid', 'Idaho', 'Payee', 'Check/EFT #', 'Valid', '']) {
      expect(isIdentifierHeader(header), header).toBe(false);
    }
  });

  it('holds a vendor fixture to the marker column its format names', () => {
    expect(vendorFormatOf('fixtures/synthetic/emr/webpt_billing_posting_v0/posting-export.csv')).toBe('webpt_billing_posting_v0');
    expect(vendorFormatOf('emr/spry_era_v0/era-export.zip!inner.csv')).toBe('spry_era_v0');
    expect(vendorFormatOf('fixtures/synthetic/LED-04/posting-export.csv')).toBeUndefined();
    const columns = new Map([['acme_posting_v0', 'Remit Sender ID']]);
    expect(vendorMarkerColumn('fixtures/synthetic/emr/acme_posting_v0/posting.csv', columns)).toBe('Remit Sender ID');
    expect(vendorMarkerColumn('fixtures/synthetic/emr/other_posting_v0/posting.csv', columns)).toBeUndefined();
    expect(vendorMarkerColumn('fixtures/synthetic/LED-04/posting-export.csv', columns)).toBeUndefined();
    const table = readTable('Payee ID,Remit Sender ID\nSYNTHSENDER,X\n', ',');
    expect(markerProblem(table)).toBeNull();
    expect(markerProblem(table, { markerColumn: ' remit sender id ' })).toBe('its " remit sender id " column does not hold SYNTHSENDER in every data row');
    expect(markerProblem(table, { markerColumn: 'Sender' })).toBe('its header has no "Sender" column, the one its vendor format names for the marker');
    expect(markerProblem(readTable('Payee ID,Remit Sender ID\nX,SYNTHSENDER\n', ','), { markerColumn: 'Remit Sender ID' })).toBeNull();
  });

  it('reads each vendor format’s marker column from the registry, so another identifier column does not stand in for it', () => {
    expect(VENDOR_FORMATS).toHaveLength(8);
    for (const format of VENDOR_FORMATS) {
      expect(vendorMarkerColumn(`fixtures/synthetic/emr/${format.id}/export.csv`), format.id).toBe(format.markerColumn);
    }
    const claimOnly = 'Payment Date,Claim ID,Payee ID\n06/11/2026,SYNTHSENDER,SYNPAYEE01\n';
    expect(refusal(claimOnly, 'fixtures/synthetic/emr/webpt_billing_posting_v0/posting-export.csv')).toContain('its "Payee ID" column does not hold SYNTHSENDER in every data row');
    expect(() => assertSyntheticFixture(bytes(claimOnly), 'fixtures/synthetic/LED-99/posting-export.csv')).not.toThrow();
  });

  it('lets a pinned reference table through only at its path with its exact bytes', () => {
    // The twenty CSV reference tables, and the tab-separated NCCI PTP table the guard reads as a table by its lines.
    expect(PINNED_TABLES).toHaveLength(21);
    expect(PINNED_TABLES.filter((table) => !table.path.endsWith('.csv')).map((table) => table.path)).toEqual(['fixtures/synthetic/cms/NCCI_PTP_SYNTHETIC.txt']);
    for (const table of PINNED_TABLES) {
      expect(table.reason.length, table.path).toBeGreaterThan(40);
      const pinned = readFileSync(path.join(repository, table.path));
      expect(() => assertSyntheticFixture(pinned, table.path), table.path).not.toThrow();
      expect(() => assertSyntheticFixture(pinned, `./${table.path}`), table.path).not.toThrow();
    }
    const first = PINNED_TABLES[0];
    if (first === undefined) {
      throw new Error('no pinned table');
    }
    const pinned = readFileSync(path.join(repository, first.path));
    expect(refusal(Buffer.concat([pinned, Buffer.from('\n')]), first.path)).toContain(first.path);
    expect(refusal(pinned, 'fixtures/synthetic/LED-99/copied.csv')).toContain('identifier column');
  });
});

describe('the marker rule for a table under any name', () => {
  it('reads a file named "x!.csv" or ".csv" as the CSV it is', () => {
    for (const label of ['fixtures/synthetic/LED-04/x!.csv', 'fixtures/synthetic/LED-04/.csv', 'fixtures/synthetic/x!.tsv', 'fixtures/golden/review-bang!.csv']) {
      const content = label.endsWith('.tsv') ? UNMARKED.replaceAll(',', '\t') : UNMARKED;
      expect(refusal(content, label), label).toContain(`${label}: no column of its header is an identifier column`);
    }
    expect(() => assertSyntheticFixture(bytes(MARKED), 'fixtures/synthetic/LED-04/x!.csv')).not.toThrow();
  });

  it('reads a .txt, .dat, .tab, .psv or extensionless file whose lines split as a table as one, and leaves prose alone', () => {
    const tab = UNMARKED.replaceAll(',', '\t');
    const pipe = UNMARKED.replaceAll(',', '|');
    for (const [label, content] of [
      ['fixtures/x/posting-export.txt', UNMARKED],
      ['fixtures/x/posting-export', UNMARKED],
      ['fixtures/synthetic/ZZZ-01/x.txt', tab],
      ['fixtures/synthetic/ZZZ-01/x.tab', tab],
      ['fixtures/synthetic/ZZZ-01/x.psv', pipe],
      ['fixtures/synthetic/ZZZ-01/x.dat', pipe],
      ['fixtures/synthetic/ZZZ-01/x.txt', UNMARKED.replaceAll(',', ';')],
    ] as const) {
      expect(refusal(content, label), `${label} ${content.slice(9, 10)}`).toContain('no column of its header is an identifier column');
    }
    expect(() => assertSyntheticFixture(bytes(MARKED.replaceAll(',', '\t')), 'fixtures/x/posting-export.txt')).not.toThrow();
    // A table in another encoding is found, and refused for not being UTF-8.
    expect(refusal(Buffer.from('Post Date\tPaid\tPayer\r\n06/11/2026\t30.00\tPAYER \xe9\r\n', 'latin1'), 'fixtures/x/a.txt')).toContain('a tabular fixture is UTF-8 text');
    // Prose with a comma per line, a fixed-width file and a banner are not tables; nor is a single delimited line.
    expect(() => assertSyntheticFixture(bytes('SYNTHETIC agreement, version 1\nPage 1, of 2\n'), 'fixtures/synthetic/CON-01/version-1.txt')).not.toThrow();
    expect(() => assertSyntheticFixture(bytes('ZZ000119999901 01   0      20261\nZZ000229999901 01   0      20261\n'), 'fixtures/x/ZIP5.txt')).not.toThrow();
    expect(() => assertSyntheticFixture(bytes('a\tb\n'), 'fixtures/x/one.txt')).not.toThrow();
    expect(sniffedSeparator('a,b,c\n\nd,e,f\n')).toBe(',');
    expect(sniffedSeparator('a,b\nc,d\n')).toBeNull();
    expect(sniffedSeparator('\uFEFFa|b\nc|d\n')).toBe('|');
  });

  it('reads a gzip file as the file it holds, within the archive caps', () => {
    expect(refusal(gzipSync(bytes(otherSender)), 'fixtures/x/review-remit.835.gz')).toContain('review-remit.835.gz!review-remit.835: ISA06 is not SYNTHSENDER');
    expect(refusal(gzipSync(bytes(UNMARKED)), 'fixtures/x/export.csv.gz')).toContain('export.csv.gz!export.csv: no column');
    expect(refusal(gzipSync(bytes(UNMARKED)), 'fixtures/x/export.csv')).toContain('export.csv!export.csv: no column');
    expect(() => assertSyntheticFixture(gzipSync(bytes(synthetic)), 'fixtures/x/remit.835.gz')).not.toThrow();
    expect(refusal(new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x01]), 'fixtures/x/broken.gz')).toContain('a gzip file the fixture guard cannot inflate within its limits');
  });
});

describe('the workbook rule', () => {
  const header = ['Payment Date', 'Check Number', 'Amount', 'Payee ID'];
  const marked = [header, ['06/11/2026', '880060040002', '30.00', 'SYNTHSENDER'], ['06/12/2026', '880060040003', '12.50', 'SYNTHSENDER']];

  it('reads every sheet of an .xlsx, stored or deflated, shared or inline strings, and holds each with data to the marker rule', () => {
    for (const options of [{}, { deflate: true }, { inline: true }, { noReferences: true, deflate: true }]) {
      expect(() => assertSyntheticFixture(testWorkbook([marked], options), 'fixtures/x/export.xlsx'), JSON.stringify(options)).not.toThrow();
      expect(() => assertSyntheticFixture(testWorkbook([marked, [], marked], options), 'fixtures/x/export.xlsx'), JSON.stringify(options)).not.toThrow();
    }
    const unmarked = marked.map((row) => row.slice(0, 3));
    expect(refusal(testWorkbook([marked, unmarked], { deflate: true }), 'fixtures/x/export.xlsx')).toBe(
      'fixtures/x/export.xlsx!xl/worksheets/sheet2.xml: no column of its header is an identifier column (every sheet of a workbook fixture that holds data carries SYNTHSENDER in an identifier column, such as a payee or sender ID, of every data row)',
    );
    expect(refusal(testWorkbook([[], []]), 'fixtures/x/export.xlsx')).toContain('no sheet holds data');
  });

  it('keeps each cell at the column its reference names, so an empty cell never shifts the marker', () => {
    const gap = [header, ['06/11/2026', '', '30.00', 'SYNTHSENDER']];
    expect(workbookSheets(new Archive(testWorkbook([gap])))[0]?.rows).toEqual(gap);
    expect(() => assertSyntheticFixture(testWorkbook([gap]), 'fixtures/x/a.xlsx')).not.toThrow();
    // Without references, cells sit in their order: the left-out empty cell moves the marker under Amount.
    expect(refusal(testWorkbook([gap], { noReferences: true }), 'fixtures/x/a.xlsx')).toContain('no identifier column holds');
  });

  it('refuses other spreadsheets, workbooks under other names, and an .xlsx that is not a workbook', () => {
    for (const name of ['a.xls', 'a.xlsm', 'a.xlsb', 'a.ods', 'A.XLS']) {
      expect(refusal(bytes(MARKED), `fixtures/x/${name}`)).toContain('fixtures are refused; write a CSV, TSV or .xlsx');
    }
    const ole2 = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
    expect(refusal(ole2, 'fixtures/x/export.bin')).toContain('legacy binary Office file');
    expect(refusal(testWorkbook([marked]), 'fixtures/x/export.zip')).toContain('a workbook under another name');
    expect(refusal(testZip([{ name: 'a.csv', bytes: bytes(MARKED) }], false), 'fixtures/x/export.xlsx')).toContain('has no workbook part');
    expect(refusal(bytes(MARKED), 'fixtures/x/export.xlsx')).toContain('this is not a zip');
    const ods = testZip([{ name: 'mimetype', bytes: bytes('application/vnd.oasis.opendocument.spreadsheet') }], false);
    expect(refusal(ods, 'fixtures/x/export.zip')).toContain('OpenDocument spreadsheet');
    const byContentType = testZip(
      [{ name: '[Content_Types].xml', bytes: bytes('<Types><Override PartName="/book.xml" ContentType="application/vnd.ms-excel.sheet.macroEnabled.main+xml"/></Types>') }],
      false,
    );
    expect(refusal(byContentType, 'fixtures/x/export.zip')).toContain('a workbook under another name');
  });

  it('checks every entry of a zip as a file of its name, nested zips to three levels', () => {
    const inner = testZip([{ name: 'posting.csv', bytes: bytes(UNMARKED) }], true);
    expect(refusal(testZip([{ name: 'inner.zip', bytes: inner }], false), 'fixtures/x/outer.zip')).toContain('outer.zip!inner.zip!posting.csv: no column');
    expect(() => assertSyntheticFixture(testZip([{ name: 'posting.csv', bytes: bytes(MARKED) }, { name: 'dir/', bytes: new Uint8Array() }], true), 'fixtures/x/a.zip')).not.toThrow();
    let nested: Uint8Array = bytes(MARKED);
    for (let level = 0; level < 5; level += 1) {
      nested = testZip([{ name: `level${String(level)}.zip`, bytes: nested }], false);
    }
    expect(refusal(nested, 'fixtures/x/deep.zip')).toContain('archives nest more than 3 deep');
  });

  it('reads an entry by its own name, so a "!" or a dot-file name is a table like any other, and refuses two entries of one name', () => {
    for (const name of ['x!.csv', 'dir/.csv', '.tsv', 'a!b!c.csv']) {
      const unmarked = name.endsWith('.tsv') ? UNMARKED.replaceAll(',', '\t') : UNMARKED;
      expect(refusal(testZip([{ name, bytes: bytes(unmarked) }], true), 'fixtures/x/a.zip'), name).toContain(`a.zip!${name}: no column`);
    }
    const duplicate = testZip(
      [
        { name: 'a.csv', bytes: bytes(MARKED) },
        { name: 'a.csv', bytes: bytes(UNMARKED) },
      ],
      false,
    );
    expect(refusal(duplicate, 'fixtures/synthetic/ZZZ-01/dup.zip')).toContain('the archive holds two entries of one name');
  });

  it('refuses an archive it cannot read within its limits: it fails closed', () => {
    const zip = testZip([{ name: 'a.csv', bytes: bytes(MARKED) }], true);
    const message = (archive: Uint8Array) => refusal(archive, 'fixtures/x/a.zip');
    const central = (buffer: Buffer) => buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const end = (buffer: Buffer) => buffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const patched = (offset: (buffer: Buffer) => number, write: (buffer: Buffer, at: number) => void, source: Uint8Array = zip) => {
      const buffer = Buffer.from(source);
      write(buffer, offset(buffer));
      return new Uint8Array(buffer);
    };
    expect(message(zip.slice(0, 40))).toContain('the archive has no end of central directory');
    expect(message(zip.slice(0, 10))).toContain('the archive is truncated');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt16LE(0x801, at + 8)))).toContain('an entry is encrypted');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt16LE(12, at + 10)))).toContain('a method other than stored or deflate');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(5, at + 24)))).toContain('does not inflate to its stated size');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(0x7fffffff, at + 24)))).toContain('inflates past the guard’s limit');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(9, at + 42)))).toContain('local header is missing');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(0xfffff, at + 20)))).toContain('an entry is truncated');
    expect(message(patched(central, (buffer, at) => buffer.writeUInt16LE(0xffff, at + 28)))).toContain('central directory is malformed');
    expect(message(patched(end, (buffer, at) => buffer.writeUInt16LE(1, at + 4)))).toContain('spans several disks');
    expect(message(patched(end, (buffer, at) => buffer.writeUInt16LE(0xffff, at + 10)))).toContain('zip64');
    expect(message(patched(end, (buffer, at) => buffer.writeUInt16LE(2, at + 10)))).toContain('central directory is malformed');
    // A stored entry whose stated size is not its length.
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(3, at + 24), testZip([{ name: 'a.csv', bytes: bytes(MARKED) }], false)))).toContain('does not inflate to its stated size');
    // A deflate bomb: a megabyte of zeros stated as one byte stops at the cap, before the megabyte is held.
    const bomb = testZip([{ name: 'a.csv', bytes: new Uint8Array(1024 * 1024) }], true);
    expect(message(patched(central, (buffer, at) => buffer.writeUInt32LE(1, at + 24), bomb))).toContain('does not inflate to its stated size');
    expect(() => new Archive(zip, { ...ARCHIVE_LIMITS, maxEntries: 0 })).toThrow(ArchiveReadError);
    const two = testZip([{ name: 'a.csv', bytes: bytes(MARKED) }, { name: 'b.csv', bytes: bytes(MARKED) }], true);
    const archive = new Archive(two, { ...ARCHIVE_LIMITS, maxTotalBytes: MARKED.length + 1 });
    expect(archive.read('a.csv')).toBeDefined();
    expect(() => archive.read('b.csv')).toThrow(/limit/);
    expect(archive.read('missing.csv')).toBeUndefined();
  });

  it('checks what a workbook holds besides its sheets: only a generated workbook’s parts, no hidden sheet, comment-only marker or unshown string', () => {
    const book = testWorkbook([marked]);
    const parts = new Archive(book);
    const entries = parts.names().map((name) => ({ name, bytes: parts.read(name) as Uint8Array }));
    const withEntry = (name: string, content: Uint8Array, deflate = false) => testZip([...entries, { name, bytes: content }], deflate);
    // An 835 from another sender, an unmarked CSV or a workbook inside the workbook, stored or deflated.
    for (const deflate of [false, true]) {
      expect(refusal(withEntry('xl/embeddings/remit.835', bytes(otherSender), deflate), 'fixtures/synthetic/ZZZ-01/book.xlsx')).toContain('book.xlsx!xl/embeddings/remit.835: a workbook fixture holds only the parts packages/synth writes');
      expect(refusal(withEntry('xl/embeddings/export.csv', bytes(UNMARKED), deflate), 'fixtures/x/book.xlsx')).toContain('book.xlsx!xl/embeddings/export.csv');
      expect(refusal(withEntry('xl/embeddings/inner.xlsx', testWorkbook([[['Paid'], ['1.00']]]), deflate), 'fixtures/x/book.xlsx')).toContain('book.xlsx!xl/embeddings/inner.xlsx');
    }
    // A second sheet under another name, typed by extension or named by the workbook's relationships.
    const sheet2 = bytes('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Paid</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>1.00</t></is></c></row></sheetData></worksheet>');
    expect(refusal(withEntry('xl/data/s2.sht', sheet2), 'fixtures/x/book.xlsx')).toContain('book.xlsx!xl/data/s2.sht');
    expect(refusal(withEntry('xl/s2.xml', sheet2), 'fixtures/x/book.xlsx')).toContain('book.xlsx!xl/s2.xml');
    const typed = entries.map((entry) =>
      entry.name === '[Content_Types].xml' ? { ...entry, bytes: bytes(Buffer.from(entry.bytes).toString('utf8').replace('<Default Extension="xml" ContentType="application/xml"/>', '<Default Extension="xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>')) } : entry,
    );
    expect(refusal(testZip(typed, false), 'fixtures/x/book.xlsx')).toContain('types a worksheet, its shared strings or itself by extension');
    const rels = (target: string, mode = '') =>
      testZip([...entries, { name: 'xl/_rels/workbook.xml.rels', bytes: bytes(`<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${target}"${mode}/></Relationships>`) }], false);
    expect(() => assertSyntheticFixture(rels('worksheets/sheet1.xml'), 'fixtures/x/book.xlsx')).not.toThrow();
    // xl/styles.xml read as the worksheet the relationships say it is: an unmarked table there is refused.
    const styled = testZip([...entries.filter((entry) => entry.name !== 'xl/_rels/workbook.xml.rels'), { name: 'xl/styles.xml', bytes: sheet2 }, { name: 'xl/_rels/workbook.xml.rels', bytes: bytes('<Relationships><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/styles.xml"/></Relationships>') }], false);
    expect(refusal(styled, 'fixtures/x/book.xlsx')).toContain('book.xlsx!xl/styles.xml: no column of its header is an identifier column');
    expect(refusal(rels('worksheets/sheet9.xml'), 'fixtures/x/book.xlsx')).toContain('declares a worksheet it does not hold');
    expect(refusal(rels('https://example.invalid/x.xml', ' TargetMode="External"'), 'fixtures/x/book.xlsx')).toContain('links to a target outside itself');
    // The marker only inside a comment, CDATA or a document type, and a shared string no cell shows.
    const commented = bytes('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Payee ID</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><!--<is><t>SYNTHSENDER</t></is>--><is><t>M000</t></is></c></row></sheetData></worksheet>');
    const withSheet = (sheet: Uint8Array) => testZip([...entries.filter((entry) => !['xl/worksheets/sheet1.xml', 'xl/sharedStrings.xml'].includes(entry.name)), { name: 'xl/worksheets/sheet1.xml', bytes: sheet }], false);
    expect(refusal(withSheet(commented), 'fixtures/x/book.xlsx')).toContain('no identifier column holds SYNTHSENDER in every data row');
    expect(() => assertSyntheticFixture(withSheet(bytes(Buffer.from(commented).toString('utf8').replace('<!--<is><t>SYNTHSENDER</t></is>--><is><t>M000</t></is>', '<is><t>SYNTHSENDER</t></is>'))), 'fixtures/x/book.xlsx')).not.toThrow();
    for (const hidden of ['<![CDATA[SYNTHSENDER]]>', '<!DOCTYPE x>', '<!-- never closed']) {
      expect(refusal(withSheet(bytes(`<worksheet>${hidden}<sheetData/></worksheet>`)), 'fixtures/x/book.xlsx'), hidden).toContain('CDATA, a document type or an unclosed comment');
    }
    const unshown = entries.map((entry) => (entry.name === 'xl/sharedStrings.xml' ? { ...entry, bytes: bytes(Buffer.from(entry.bytes).toString('utf8').replace('</sst>', '<si><t>PATIENT ZZTEST</t></si></sst>')) } : entry));
    const unshownRefusal = refusal(testZip(unshown, false), 'fixtures/x/book.xlsx');
    expect(unshownRefusal).toContain('a shared string no cell shows');
    expect(unshownRefusal).not.toContain('ZZTEST');
  });

  it('refuses a workbook that declares a worksheet it does not hold', () => {
    const declared = testZip(
      [
        { name: '[Content_Types].xml', bytes: bytes('<Types><Override PartName="/xl/worksheets/missing.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
        { name: 'xl/workbook.xml', bytes: bytes('<workbook/>') },
      ],
      false,
    );
    expect(refusal(declared, 'fixtures/x/a.xlsx')).toContain('declares a worksheet it does not hold');
  });
});

describe('a workbook part, read cell by cell', () => {
  const sheet = (data: string, shared?: string) =>
    workbookSheets(
      new Archive(
        testZip(
          [
            { name: 'xl/workbook.xml', bytes: bytes('<workbook/>') },
            { name: 'xl/worksheets/sheet1.xml', bytes: bytes(`<x:worksheet><x:sheetData>${data}</x:sheetData></x:worksheet>`) },
            ...(shared === undefined ? [] : [{ name: 'xl/sharedStrings.xml', bytes: bytes(shared) }]),
          ],
          false,
        ),
      ),
    )[0]?.rows;

  it('reads prefixed elements, entities, rich and phonetic runs, numbers and self-closing cells', () => {
    const shared = '<sst><si><r><t>Payee</t></r><r><t xml:space="preserve"> ID</t></r><rPh><t>X</t></rPh></si><si><t>A&amp;B &#65;&#x42; &lt;&gt;&quot;&apos;</t></si><si/><si><t/></si></sst>';
    const data = "<x:row r='1'><x:c r='A1' t='s'><x:v>0</x:v></x:c><x:c r='C1' t='s'><x:v>1</x:v></x:c><x:c r='D1'/><x:c r='E1'><x:v>12.5</x:v></x:c><x:c r='F1' t='s'><x:v>2</x:v></x:c><x:c t='s'><x:v>3</x:v></x:c><x:c r='$H$1' t='inlineStr'/></x:row><x:row r='3'/><x:row><x:c r='A4'/></x:row>";
    expect(sheet(data, shared)).toEqual([
      ['Payee ID', '', 'A&B AB <>"\'', '', '12.5', '', '', ''],
      [''],
    ]);
  });

  it('refuses rows or cells out of order, a missing shared string and a character reference out of range', () => {
    const refused = (data: string, message: RegExp) => expect(() => sheet(data)).toThrow(message);
    refused('<row r="2"/><row r="1"/>', /rows are out of order/);
    refused('<row r="1048577"/>', /rows are out of order or out of range/);
    refused('<row r="x"/>', /rows are out of order or out of range/);
    refused('<row r="1"><c r="B1"/><c r="A1"/></row>', /cells are out of order/);
    refused('<row r="1"><c r="1A"/></row>', /cells are out of order or out of range/);
    refused('<row r="1"><c r="XFE1"/></row>', /cells are out of order or out of range/);
    refused('<row r="1"><c r="A1" t="s"><v>4</v></c></row>', /shared string the workbook does not have/);
    refused('<row r="1"><c r="A1" t="s"><v>x</v></c></row>', /shared string the workbook does not have/);
    refused('<row r="1"><c r="A1" t="str"><v>&#x110000;</v></c></row>', /character reference out of range/);
    expect(() =>
      workbookSheets(new Archive(testZip([{ name: 'xl/workbook.xml', bytes: bytes('<workbook/>') }, { name: 'xl/worksheets/sheet1.xml', bytes: new Uint8Array([0xff]) }], false))),
    ).toThrow(/not UTF-8/);
  });
});

describe('writing cases', () => {
  let scratch: string | undefined;
  afterEach(() => {
    if (scratch !== undefined) {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  const generated = (dir: string, files: GeneratedCase['files']): GeneratedCase => ({ id: dir, dir, files, expected: {} as GeneratedCase['expected'], documents: new Map() });

  it('checks every file before any is written, so a case with one unmarked CSV writes nothing', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'tp-guard-'));
    const files = [
      { path: 'LED-99/posting-export.csv', bytes: bytes(MARKED) },
      { path: 'LED-99/eft-export.csv', bytes: bytes(UNMARKED) },
    ];
    expect(() => writeCases(scratch as string, [generated('LED-99', files)], 'cases')).toThrow(/^fixtures\/synthetic\/LED-99\/eft-export\.csv: /);
    expect(existsSync(path.join(scratch, 'LED-99'))).toBe(false);
    expect(writeCases(scratch, [generated('LED-99', files.slice(0, 1))], 'cases').written).toEqual(['LED-99/posting-export.csv']);
  });

  it('labels a file with its repository path, so a pinned table generated into a scratch root still passes', () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'tp-guard-'));
    const table = PINNED_TABLES.find((entry) => entry.path.startsWith('fixtures/synthetic/MOD-01/'));
    if (table === undefined) {
      throw new Error('no MOD-01 table is pinned');
    }
    const relative = table.path.slice('fixtures/synthetic/'.length);
    expect(writeCases(scratch, [generated('MOD-01', [{ path: relative, bytes: readFileSync(path.join(repository, table.path)) }])], 'cases').written).toEqual([relative]);
  });
});

describe('the hook’s view of an edit', () => {
  it('rebuilds what a Write, Edit or MultiEdit leaves exactly, and refuses to guess at an edit it cannot rebuild', () => {
    const unbuildable = (input: Parameters<typeof resultingText>[0], current: string | null) => () => resultingText(input, current);
    expect(resultingText({ tool_name: 'Write', tool_input: { content: 'a' } }, 'old')).toBe('a');
    expect(resultingText({ tool_name: 'Write', tool_input: {} }, null)).toBe('');
    expect(resultingText({ tool_name: 'Edit', tool_input: { old_string: 'b', new_string: 'x' } }, 'abc')).toBe('axc');
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: 'b', new_string: 'x' } }, 'abcb')).toThrow(UnbuildableEditError);
    expect(resultingText({ tool_name: 'Edit', tool_input: { old_string: 'b', new_string: 'x', replace_all: true } }, 'abcb')).toBe('axcx');
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: 'z', new_string: 'x' } }, 'abc')).toThrow(/not in the file exactly as written/);
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: 'z', new_string: 'x' } }, null)).toThrow(/does not exist/);
    expect(resultingText({ tool_name: 'Edit', tool_input: { old_string: '', new_string: 'new' } }, null)).toBe('new');
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: '', new_string: 'new' } }, 'full')).toThrow(/empty old_string/);
    // Claude Code applies an old_string with LF to a CRLF file, and straight quotes to curly ones; the guard does not
    // imitate that matching, so neither edit is rebuilt, and the hook refuses both.
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: 'a,b\nc,d', new_string: 'x' } }, 'a,b\r\nc,d\r\n')).toThrow(UnbuildableEditError);
    expect(unbuildable({ tool_name: 'Edit', tool_input: { old_string: "the payer's", new_string: 'x' } }, 'the payer’s')).toThrow(UnbuildableEditError);
    const edits = [
      { old_string: 'a', new_string: 'b' },
      { old_string: 'bc', new_string: 'd' },
    ];
    expect(resultingText({ tool_name: 'MultiEdit', tool_input: { edits } }, 'ac')).toBe('d');
    expect(unbuildable({ tool_name: 'MultiEdit', tool_input: { edits: [...edits, { old_string: 'q' }] } }, 'ac')).toThrow(UnbuildableEditError);
    expect(unbuildable({ tool_name: 'MultiEdit', tool_input: { edits: [null] } }, 'ac')).toThrow(UnbuildableEditError);
    expect(unbuildable({ tool_name: 'MultiEdit', tool_input: { edits: 'a' } }, 'ac')).toThrow(/not a list/);
    // No edit leaves the file as it is.
    expect(resultingText({ tool_name: 'MultiEdit', tool_input: {} }, 'ac')).toBe('ac');
    expect(resultingText({ tool_name: 'MultiEdit', tool_input: { edits: [] } }, null)).toBeNull();
    expect(resultingText({ tool_name: 'Read', tool_input: {} }, 'ac')).toBeNull();
    expect(resultingText({}, 'ac')).toBeNull();
  });
});
