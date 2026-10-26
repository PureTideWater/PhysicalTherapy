import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OracleResult, collectChecks, disagreements, jsonDifferences } from './compare';

const summary = { format: 'tp-oracle-835/1', bom: false, interchanges: [{ isa13: '000000001', groups: [{ transactions: [{ balance: { differenceCents: '0' } }] }] }] };

function result(overrides: Partial<OracleResult> = {}): OracleResult {
  return { file: 'PAR-01/remit.835', valid: true, rejections: [], errors: [], summary, summarySha256: 'abc', ...overrides };
}

describe('jsonDifferences', () => {
  it('names every differing path, up to a limit', () => {
    expect(jsonDifferences(summary, summary)).toEqual([]);
    expect(jsonDifferences({ a: [1, 2], b: 'x' }, { a: [1, 3], c: 'x' })).toEqual(['/a[1]: expected 2, found 3', '/b: missing from the oracle', '/c: not expected']);
    expect(jsonDifferences([1], [1, 2])).toEqual(['/: expected 1 items, found 2']);
    expect(jsonDifferences('a', 'b')).toEqual(['/: expected "a", found "b"']);
    expect(jsonDifferences(Array.from({ length: 30 }, () => 1), Array.from({ length: 30 }, () => 2), '', 5)).toHaveLength(5);
  });
});

describe('disagreements', () => {
  const check = { spec: 'PAR-01/remit.835', expectation: { valid: true, rejections: [], summary } };

  it('is empty when pyx12 agrees', () => {
    expect(disagreements(check, result())).toEqual([]);
  });

  it('fails a missing result, a validity difference, a missing rejection and a summary difference', () => {
    expect(disagreements(check, undefined)).toEqual(['PAR-01/remit.835: the oracle returned no result']);
    expect(disagreements(check, result({ valid: false, errors: [{ level: 'segment', code: '8', message: 'bad' }] }))).toEqual(['PAR-01/remit.835: expected pyx12 to accept it; it rejected it (segment 8: bad)']);
    const malformed = { spec: 'PAR-25/truncated.835', expectation: { valid: false, rejections: ['missing_segment'], summary: null } };
    expect(disagreements(malformed, result({ valid: false, rejections: ['element'], summary: null }))).toEqual(['PAR-25/truncated.835: expected a missing_segment rejection; pyx12 reported element']);
    expect(disagreements(malformed, result({ valid: true, rejections: [], summary: null }))).toEqual([
      'PAR-25/truncated.835: expected pyx12 to reject it; it accepted it',
      'PAR-25/truncated.835: expected a missing_segment rejection; pyx12 reported none',
    ]);
    expect(disagreements(check, result({ summary: null }))).toEqual(["PAR-01/remit.835: pyx12's reading produced no summary"]);
    const changed = { ...summary, interchanges: [{ ...summary.interchanges[0], isa13: '000000002' }] };
    expect(disagreements(check, result({ summary: changed }))).toEqual(['PAR-01/remit.835: /interchanges[0]/isa13: expected "000000001", found "000000002"']);
  });

  it('compares summary hashes where a fixture records one', () => {
    const hashed = { spec: 'PAR-27/batch.zip!remit-002.835', expectation: { valid: true, rejections: [], summary: null, summarySha256: 'abc' } };
    expect(disagreements(hashed, result())).toEqual([]);
    expect(disagreements(hashed, result({ summarySha256: 'def' }))).toEqual(['PAR-27/batch.zip!remit-002.835: the summary hash differs (expected abc, found def)']);
  });
});

describe('collectChecks', () => {
  let root = '';

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'oracle-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads every X12 file and zip entry the expected.json files declare, skipping cms and rules', () => {
    const write = (file: string, value: unknown) => {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), JSON.stringify(value));
    };
    const oracle = { valid: true, rejections: [], summary: null };
    write('PAR-01/expected.json', { files: [{ path: 'remit.835', kind: 'x12', x12: { oracle } }, { path: 'notes.txt', kind: 'text' }] });
    write('PAR-27/expected.json', { files: [{ path: 'batch.zip', kind: 'zip', zip: { entries: [{ name: 'a.835', kind: 'x12', oracle }, { name: 'b.exe', kind: 'executable' }] } }] });
    write('variants/V01-x/expected.json', { files: [{ path: 'remit.835', kind: 'x12', x12: { oracle } }] });
    write('PAR-29/expected.json', { files: [], generated: [{ path: 'PAR-29/generated/large.835', oracle }] });
    write('MOD-03/expected.json', {});
    write('rules/release/expected.json', { files: [{ path: 'x.835', kind: 'x12', x12: { oracle } }] });
    const { checks, declared } = collectChecks(root);
    expect(checks.map((check) => [check.spec, check.generated === true])).toEqual([
      ['PAR-01/remit.835', false],
      ['PAR-27/batch.zip!a.835', false],
      ['PAR-29/generated/large.835', true],
      ['variants/V01-x/remit.835', false],
    ]);
    expect([...declared]).toEqual(['PAR-01/remit.835', 'variants/V01-x/remit.835']);
  });

  it('leaves out a generated file that declares no oracle (MOD-09\'s large contracts are not 835s)', () => {
    mkdirSync(path.join(root, 'MOD-09'), { recursive: true });
    writeFileSync(path.join(root, 'MOD-09/expected.json'), JSON.stringify({ files: [], generated: [{ path: 'MOD-09/generated/L01-table/document.pdf', sha256: '0'.repeat(64) }] }));
    expect(collectChecks(root).checks).toEqual([]);
  });
});
