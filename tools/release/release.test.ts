import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, serializeRecords, sha256 } from '@tp/rules';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { checkContent } from '../verify-content/check';
import { assembleRelease } from './assemble';
import { ReleaseToolError, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';
import { diffRecords, impactLines, releaseDirectory } from './impact';
import { loadDirectoryRefusal } from './load-directory';
import { SYNTHETIC_RELEASE_DIR, renderSyntheticRelease } from './synthetic';

let root = '';

const SOURCE_TEXT = 'The KX threshold is $1,111 for PT and SLP combined, with review at $1,333.\n';
const SOURCE_PATH = 'content/sources/therapy_threshold/rules.md';
const SOURCE_URL = 'https://example.invalid/rules';

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function draft(level: 'L1' | 'L2' | 'L3', overrides: Partial<RuleRecord> = {}): RuleRecord {
  return exampleRecord('therapy_threshold', {
    source: {
      title: 'Therapy rules page',
      url: SOURCE_URL,
      path: SOURCE_PATH,
      retrieved: '2026-10-15',
      sha256: sha256(SOURCE_TEXT),
      method: 'hand_typed',
      transcribed_by: 'first',
      transcribed_on: '2026-10-15',
      locator: 'line 1',
      synthetic: false,
    },
    verification: { level, by: level === 'L1' ? 'pnpm verify-content' : 'A. Reviewer', on: '2026-10-20', questions: [] },
    quotes: ['$1,111 for PT and SLP combined, with review at $1,333'],
    ...overrides,
  });
}

function writeDrafts(records: readonly RuleRecord[], file = 'therapy_threshold/2026/records'): void {
  write(`content/drafts/${file}.json`, serializeRecords(records));
  write(
    `content/drafts/${file}.second-pass.json`,
    JSON.stringify({
      transcribed_by: 'second',
      transcribed_on: '2026-10-15',
      records: records.map(({ record_type, key, value, effective_from, effective_to, quotes }) => ({ record_type, key, value, effective_from, effective_to, quotes })),
    }),
  );
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'release-tools-'));
  write(SOURCE_PATH, SOURCE_TEXT);
  write('content/drafts/README.md', '# drafts\n');
  write('content/outgoing/README.md', '# outgoing\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('release:assemble', () => {
  it('assembles only the drafts at L2 or higher and lists the rest in RELEASE.md', () => {
    writeDrafts([draft('L2'), draft('L1', { key: { discipline: 'OT' } })]);
    writeDrafts([draft('L1', { effective_from: '2027-01-01', effective_to: '2027-12-31' })], 'therapy_threshold/2027/records');
    const result = assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(result).toMatchObject({
      records: 1,
      excluded: 2,
      files: ['RELEASE.md', 'therapy_threshold/2026/records.json', 'therapy_threshold/2026/records.second-pass.json', 'MANIFEST.json'],
    });
    const dir = path.join(root, result.dir);
    expect(JSON.parse(readFileSync(path.join(dir, 'therapy_threshold/2026/records.json'), 'utf8'))).toEqual([draft('L2')]);
    const second = JSON.parse(readFileSync(path.join(dir, 'therapy_threshold/2026/records.second-pass.json'), 'utf8')) as { transcribed_by: string; records: { key: unknown }[] };
    expect(second).toMatchObject({ transcribed_by: 'second', records: [{ key: { discipline: 'PT_SLP' } }] });
    const notes = readFileSync(path.join(dir, 'RELEASE.md'), 'utf8');
    expect(notes).toContain('## Drafts not in this release');
    expect(notes).toContain('2 draft record(s) stay in content/drafts until they are verified to L2:');
    expect(notes).toContain('- `content/drafts/therapy_threshold/2026/records.json` (`therapy_threshold`): 1 at verification L1');
    expect(notes).toContain('- `content/drafts/therapy_threshold/2027/records.json` (`therapy_threshold`): 1 at verification L1');
    expect(checkContent(root).problems).toEqual([]);
    expect(existsSync(path.join(root, 'content/drafts/therapy_threshold/2027/records.json'))).toBe(true);
  });

  it('refuses when no draft is verified to L2, writing nothing', () => {
    writeDrafts([draft('L1'), draft('L1', { key: { discipline: 'OT' } })]);
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(
      'release 1 not assembled: none of the 2 draft record(s) is verified to L2 or higher; verify them against their sources first',
    );
    expect(existsSync(path.join(root, 'content/outgoing/1'))).toBe(false);
  });

  it('copies verified drafts with their second passes, RELEASE.md and a MANIFEST.json the CI verifier accepts', () => {
    writeDrafts([draft('L2'), draft('L2', { key: { discipline: 'OT' } })]);
    const result = assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(result).toMatchObject({
      dir: 'content/outgoing/1',
      records: 2,
      files: ['RELEASE.md', 'therapy_threshold/2026/records.json', 'therapy_threshold/2026/records.second-pass.json', 'MANIFEST.json'],
    });
    const dir = path.join(root, result.dir);
    expect(readFileSync(path.join(dir, 'therapy_threshold/2026/records.json'), 'utf8')).toBe(readFileSync(path.join(root, 'content/drafts/therapy_threshold/2026/records.json'), 'utf8'));
    const notes = readFileSync(path.join(dir, 'RELEASE.md'), 'utf8');
    expect(notes).toContain('# Content release 1');
    expect(notes).toContain('Prepared 2026-10-21 by `pnpm release:assemble 1` from the drafts in content/drafts verified to L2 or higher.');
    expect(notes).toContain('| `therapy_threshold` | 2 | 2026-01-01 | 2026-12-31 | L2 |');
    expect(notes).toContain(`| Therapy rules page | \`${SOURCE_PATH}\` | ${SOURCE_URL} | 2026-10-15 | \`${sha256(SOURCE_TEXT)}\` |`);
    expect(notes).toContain('Every draft in content/drafts is in this release.');
    expect(notes).toContain('- L2 by A. Reviewer on 2026-10-20: `therapy_threshold`');
    expect(notes).toContain('Release 1 is the first release: every record is new.');
    expect(notes).toContain("No pricing runs exist yet (pricing runs arrive with the engine in milestones 5 and 7), so no run's lines would change.");
    expect(result.manifestSha256).toBe(sha256(readFileSync(path.join(dir, 'MANIFEST.json'))));
    expect(checkContent(root).problems).toEqual([]);
    const verifier = spawnSync('bash', [path.join(repositoryRoot, 'tools/verify-release-manifest.sh'), dir], { encoding: 'utf8' });
    expect(verifier.status, verifier.stderr).toBe(0);
  });

  it('refuses a number already prepared or published', () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    mkdirSync(path.join(root, 'content/releases'));
    renameSync(path.join(root, 'content/outgoing/1'), path.join(root, 'content/releases/1'));
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow('content/releases/1 already exists');
    assembleRelease({ root, release: 2, today: '2026-10-21' });
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-21' })).toThrow('content/outgoing/2 already exists');
  });

  it('refuses drafts that fail the content checker, and an empty draft directory', () => {
    writeDrafts([draft('L2', { quotes: ['not in the source'] })]);
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(/the drafts do not pass pnpm verify-content/);
    rmSync(path.join(root, 'content/drafts/therapy_threshold'), { recursive: true });
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow('there are no drafts in content/drafts to assemble');
  });
});

describe('release:dry-run', () => {
  it('reports the first release and that no pricing runs exist', () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(dryRun(root, 1)).toEqual([
      'release:dry-run 1: 1 records.',
      'Release 1 is the first release: every record is new.',
      '- therapy_threshold: 1 added, 0 removed, 0 changed',
      '',
      "No pricing runs exist yet (pricing runs arrive with the engine in milestones 5 and 7), so no run's lines would change.",
    ]);
  });

  it('lists what changed against the previous release', () => {
    writeDrafts([draft('L2'), draft('L2', { key: { discipline: 'OT' } })]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    writeDrafts([draft('L2', { effective_to: '2026-06-30' })]);
    assembleRelease({ root, release: 2, today: '2026-10-22' });
    expect(dryRun(root, 2).slice(0, 3)).toEqual(['release:dry-run 2: 1 records.', 'Against release 1:', '- therapy_threshold: 0 added, 1 removed, 1 changed']);
    expect(readFileSync(path.join(root, 'content/outgoing/2/RELEASE.md'), 'utf8')).toContain('- therapy_threshold: 0 added, 1 removed, 1 changed');
  });

  it('refuses a release that exists nowhere', () => {
    expect(() => dryRun(root, 7)).toThrow(ReleaseToolError);
    expect(() => releaseDirectory(root, 7)).toThrow('release 7 is neither in content/releases nor in content/outgoing');
  });
});

describe('diffRecords and impactLines', () => {
  const pt = draft('L2');
  const ot = draft('L2', { key: { discipline: 'OT' } });

  it('counts added, removed and changed records by type', () => {
    const changedPt = draft('L2', { value: { kx_threshold_cents: '222200', medical_review_threshold_cents: '133300' } });
    const carc = exampleRecord('carc');
    expect(diffRecords([pt, ot], [changedPt, carc])).toEqual([
      { recordType: 'carc', added: 1, removed: 0, changed: 0 },
      { recordType: 'therapy_threshold', added: 0, removed: 1, changed: 1 },
    ]);
    expect(diffRecords([pt], [draft('L3')])).toEqual([]);
    expect(diffRecords(null, [pt])).toEqual([{ recordType: 'therapy_threshold', added: 1, removed: 0, changed: 0 }]);
  });

  it('compares with the release before, and lists the runs a source reports', () => {
    writeDrafts([pt, ot]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    const runs = {
      description: 'unused',
      affectedRuns: () => [{ runId: 'run-a', practiceId: 'practice-a', releaseNo: 1, changedLines: 3 }],
    };
    expect(impactLines(root, 2, [pt], runs)).toEqual([
      'Against release 1:',
      '- therapy_threshold: 0 added, 1 removed, 0 changed',
      '',
      'Runs whose lines would change:',
      '- run run-a (practice practice-a, release 1): 3 line(s)',
    ]);
    expect(impactLines(root, 2, [pt, ot])).toContain('- no record changes');
  });
});

describe('parseReleaseNumber', () => {
  it.each([
    ['1', 1],
    ['42', 42],
    ['0', undefined],
    ['01', undefined],
    ['-1', undefined],
    ['1.5', undefined],
    ['x', undefined],
    [undefined, undefined],
    ['899999', 899999],
    ['900000', undefined],
    ['900001', undefined],
    ['1000000', undefined],
  ])('reads %j as %j', (text, expected) => {
    expect(parseReleaseNumber(text)).toBe(expected);
  });
});

describe('release:load directories', () => {
  it('refuses fixture releases, and nothing else', () => {
    expect(loadDirectoryRefusal(repositoryRoot, path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR))).toMatch(/is a SYNTHETIC fixture release/);
    expect(loadDirectoryRefusal(repositoryRoot, path.join(repositoryRoot, 'fixtures'))).toMatch(/SYNTHETIC fixture release/);
    expect(loadDirectoryRefusal(repositoryRoot, path.join(repositoryRoot, 'content/releases/1'))).toBeUndefined();
    expect(loadDirectoryRefusal(repositoryRoot, path.join(repositoryRoot, 'fixtures-elsewhere/1'))).toBeUndefined();
  });

  it('stops pnpm release:load before it connects to any database', () => {
    const result = spawnSync('pnpm', ['-s', 'release:load', String(1), '--dir', SYNTHETIC_RELEASE_DIR], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:9/none', INIT_CWD: repositoryRoot },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('is a SYNTHETIC fixture release; fixtures load only into scratch test databases');
  });
});

describe('the synthetic release fixture', () => {
  it('is exactly what tools/release/synthetic.ts builds from fixtures/synthetic/cms', () => {
    for (const [file, text] of renderSyntheticRelease()) {
      expect(readFileSync(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR, file), 'utf8'), file).toBe(text);
    }
  });
});
