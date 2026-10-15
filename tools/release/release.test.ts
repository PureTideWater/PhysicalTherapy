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
import { SYNTHETIC_RELEASE_DIR, renderSyntheticRelease } from './synthetic';

let root = '';

const SOURCE_TEXT = 'SYNTHETIC: the KX threshold is $1,111 for PT and SLP combined.\n';
const SOURCE_PATH = 'content/sources/plan/rules.md';

function write(file: string, text: string): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function draft(level: 'L1' | 'L2' | 'L3', overrides: Partial<RuleRecord> = {}): RuleRecord {
  return exampleRecord('therapy_threshold', {
    source: {
      title: 'Plan rules reference',
      url: null,
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
    quotes: ['$1,111 for PT and SLP combined'],
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
  it('refuses L1 drafts and writes nothing', () => {
    writeDrafts([draft('L2'), draft('L1', { key: { discipline: 'OT' } })]);
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(
      /release 1 not assembled: 1 draft record\(s\) are not verified to L2[\s\S]*therapy_threshold\/2026\/records.json record 2: verification L1 \(therapy_threshold\)/,
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
    expect(notes).toContain('Prepared 2026-10-21 by `pnpm release:assemble 1` from content/drafts.');
    expect(notes).toContain('| `therapy_threshold` | 2 | 2026-01-01 | 2026-12-31 | L2 |');
    expect(notes).toContain(`| Plan rules reference | \`${SOURCE_PATH}\` | none | 2026-10-15 | \`${sha256(SOURCE_TEXT)}\` |`);
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
    writeDrafts([draft('L2', { value: { kx_threshold_cents: '111100', medical_review_threshold_cents: '133301' } })]);
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
  ])('reads %j as %j', (text, expected) => {
    expect(parseReleaseNumber(text)).toBe(expected);
  });
});

describe('the synthetic release fixture', () => {
  it('is exactly what tools/release/synthetic.ts builds from fixtures/synthetic/cms', () => {
    for (const [file, text] of renderSyntheticRelease()) {
      expect(readFileSync(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR, file), 'utf8'), file).toBe(text);
    }
  });
});
