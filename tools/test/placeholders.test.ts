import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { isX12Interchange, listFiles, repositoryRoot } from '../content-files';
import { RELEASE_COMMANDS, isReleaseCommand } from '../release/commands';
import { GOLDEN_REPORT_PATH, goldenInvocation } from '../test-golden';
import { collectChecks } from '../test-oracle/compare';
import { findOracleFixtures } from '../test-oracle/fixtures';

let root = '';

function write(file: string, text: string | Buffer): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'tools-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('listFiles', () => {
  it('lists files below a directory, skipping READMEs, and tolerates a missing directory', () => {
    write('content/drafts/README.md', '# drafts\n');
    write('content/drafts/pfs_rvu/2026/records.json', '[]');
    expect(listFiles(root, 'content/drafts')).toEqual([path.join('content', 'drafts', 'pfs_rvu', '2026', 'records.json')]);
    expect(listFiles(root, 'content/missing')).toEqual([]);
  });

  it('finds the repository root', () => {
    expect(listFiles(repositoryRoot, 'docs/product')).toContain(path.join('docs', 'product', 'PRD.md'));
  });
});

describe('test:oracle fixtures', () => {
  it('recognizes X12 interchanges, with or without a byte-order mark', () => {
    write('fixtures/synthetic/PAR-01/file.835', 'ISA*00*          *00*          *ZZ*SYNTHSENDER    *');
    write('fixtures/synthetic/PAR-05/file.835', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ISA*00*')]));
    write('fixtures/synthetic/PAR-01/expected.json', '{}');
    write('fixtures/synthetic/README.md', 'ISA in a readme does not count');
    expect(isX12Interchange(path.join(root, 'fixtures/synthetic/PAR-01/expected.json'))).toBe(false);
    expect(findOracleFixtures(root)).toEqual([
      path.join('fixtures', 'synthetic', 'PAR-01', 'file.835'),
      path.join('fixtures', 'synthetic', 'PAR-05', 'file.835'),
    ]);
  });

  it('finds this repository\'s fixtures, each declared by an expected.json the oracle reads', () => {
    const fixtures = findOracleFixtures(repositoryRoot);
    const { declared } = collectChecks(path.join(repositoryRoot, 'fixtures', 'synthetic'));
    expect(fixtures.length).toBeGreaterThanOrEqual(50);
    expect(fixtures.map((file) => path.relative(path.join('fixtures', 'synthetic'), file).split(path.sep).join('/')).filter((file) => !declared.has(file))).toEqual([]);
  });
});

describe('test:golden wrapper', () => {
  it('runs the golden project and passes when there are no golden tests yet', () => {
    expect(goldenInvocation([])).toEqual({ vitestArgs: ['run', '--project', 'golden', '--passWithNoTests'], env: {} });
  });

  it('turns --report into the report path for the golden tests', () => {
    const invocation = goldenInvocation(['--report', '--reporter=dot']);
    expect(invocation.vitestArgs).toEqual(['run', '--project', 'golden', '--passWithNoTests', '--reporter=dot']);
    expect(invocation.env).toEqual({ TP_GOLDEN_REPORT: path.join(repositoryRoot, GOLDEN_REPORT_PATH) });
    expect(GOLDEN_REPORT_PATH).toBe(path.join('fixtures', 'golden', '.report'));
  });
});

describe('release commands', () => {
  it('names the three release scripts', () => {
    expect(RELEASE_COMMANDS).toEqual(['assemble', 'dry-run', 'load']);
    expect(isReleaseCommand('dry-run')).toBe(true);
    expect(isReleaseCommand('publish')).toBe(false);
    expect(isReleaseCommand(undefined)).toBe(false);
  });
});
