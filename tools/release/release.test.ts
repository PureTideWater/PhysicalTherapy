import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, serializeRecords, sha256 } from '@tp/rules';
import { readRelease } from '@tp/rules/content';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFiles, repositoryRoot } from '../content-files';
import { checkContent } from '../verify-content/check';
import { assembleRelease } from './assemble';
import { ReleaseToolError, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';
import { type AffectedRun, type PricingRunSource, diffRecords, impactLines, recordChangeLines, releaseContents, releaseDirectory, runImpactLines } from './impact';
import { loadDirectoryRefusal } from './load-directory';
import { previousPublishedRelease } from './rollback';
import { RERUN_RELEASE_DIR, SYNTHETIC_RELEASE_DIR, renderRerunRelease, renderSyntheticRelease } from './synthetic';

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
    expect(notes).toContain('The pricing runs whose lines would change are listed by `pnpm release:dry-run 1` against the staging snapshot, in the pull request (the load-release skill).');
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

/** A run source that reports what it is given, for the lines the dry run prints. */
function reportingRuns(affected: AffectedRun[] = [], runsChecked = affected.length): PricingRunSource & { readonly asked: number[] } {
  const asked: number[] = [];
  return {
    asked,
    description: 'Pricing runs in the test',
    affectedRuns: (release) => {
      asked.push(release.releaseNo);
      return Promise.resolve({ runsChecked, affected });
    },
  };
}

describe('release:dry-run', () => {
  it('reports the first release, and that no run would change', async () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    const runs = reportingRuns([], 3);
    expect(await dryRun({ root, release: 1, runs })).toEqual([
      'release:dry-run 1: 1 records.',
      'Release 1 is the first release: every record is new.',
      '- therapy_threshold: 1 added, 0 removed, 0 changed',
      '',
      "Pricing runs in the test: 3 complete run(s) priced in memory, and no run's lines would change.",
    ]);
    expect(runs.asked).toEqual([1]);
  });

  it('lists what changed against the previous release, and the runs whose lines would change with how many', async () => {
    writeDrafts([draft('L2'), draft('L2', { key: { discipline: 'OT' } })]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    writeDrafts([draft('L2', { effective_to: '2026-06-30' })]);
    assembleRelease({ root, release: 2, today: '2026-10-22' });
    const runs = reportingRuns([{ runId: 'run-a', practiceId: 'practice-a', releaseNo: 1, lines: 4, changedLines: 2 }], 5);
    expect(await dryRun({ root, release: 2, runs })).toEqual([
      'release:dry-run 2: 1 records.',
      'Against release 1:',
      '- therapy_threshold: 0 added, 1 removed, 1 changed',
      '',
      'Pricing runs in the test: 5 complete run(s) priced in memory. Runs whose lines would change:',
      '- run run-a (practice practice-a, release 1): 2 of 4 line(s)',
    ]);
    const notes = readFileSync(path.join(root, 'content/outgoing/2/RELEASE.md'), 'utf8');
    expect(notes).toContain('- therapy_threshold: 0 added, 1 removed, 1 changed');
    expect(notes).toContain('The pricing runs whose lines would change are listed by `pnpm release:dry-run 2` against the staging snapshot, in the pull request (the load-release skill).');
  });

  it('reads a release from the directory it is given', async () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    renameSync(path.join(root, 'content/outgoing/1'), path.join(root, 'elsewhere'));
    expect((await dryRun({ root, release: 1, runs: reportingRuns(), dir: path.join(root, 'elsewhere') }))[0]).toBe('release:dry-run 1: 1 records.');
  });

  it('refuses a release that exists nowhere, or does not verify', async () => {
    await expect(dryRun({ root, release: 7, runs: reportingRuns() })).rejects.toThrow(ReleaseToolError);
    expect(() => releaseDirectory(root, 7)).toThrow('release 7 is neither in content/releases nor in content/outgoing');
    mkdirSync(path.join(root, 'content/outgoing/8'), { recursive: true });
    expect(() => releaseContents(path.join(root, 'content/outgoing/8'), 8)).toThrow(/does not verify:\n {2}MANIFEST.json is missing/);
  });
});

describe('diffRecords and the impact lines', () => {
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

  it('compares with the release before, and says where the affected runs are listed', () => {
    writeDrafts([pt, ot]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(impactLines(root, 2, [pt])).toEqual([
      'Against release 1:',
      '- therapy_threshold: 0 added, 1 removed, 0 changed',
      '',
      'The pricing runs whose lines would change are listed by `pnpm release:dry-run 2` against the staging snapshot, in the pull request (the load-release skill).',
    ]);
    expect(recordChangeLines(root, 2, [pt, ot])).toEqual(['Against release 1:', '- no record changes']);
  });

  it('lists each affected run with its changed and priced lines', () => {
    const runs = reportingRuns();
    expect(runImpactLines(runs, { runsChecked: 0, affected: [] })).toEqual(["Pricing runs in the test: 0 complete run(s) priced in memory, and no run's lines would change."]);
    expect(
      runImpactLines(runs, {
        runsChecked: 2,
        affected: [
          { runId: 'a', practiceId: 'p', releaseNo: 1, lines: 10, changedLines: 1 },
          { runId: 'b', practiceId: 'q', releaseNo: 2, lines: 3, changedLines: 3 },
        ],
      }),
    ).toEqual(['Pricing runs in the test: 2 complete run(s) priced in memory. Runs whose lines would change:', '- run a (practice p, release 1): 1 of 10 line(s)', '- run b (practice q, release 2): 3 of 3 line(s)']);
  });
});

describe('release:rollback', () => {
  it('finds the published release before the one withdrawn', () => {
    expect(previousPublishedRelease(root, 3)).toBeNull();
    for (const name of ['1', '2', '5', 'README.md', '02']) {
      mkdirSync(path.join(root, 'content/releases', name), { recursive: true });
    }
    expect(previousPublishedRelease(root, 3)).toBe(2);
    expect(previousPublishedRelease(root, 6)).toBe(5);
    expect(previousPublishedRelease(root, 1)).toBeNull();
  });

  it('needs a reason, and only rollback takes one', () => {
    const run = (args: string[]) => spawnSync('pnpm', ['-s', ...args], { cwd: repositoryRoot, encoding: 'utf8', env: { ...process.env, DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:9/none' } });
    for (const args of [['release:rollback', '2'], ['release:dry-run', '2', '--reason', 'a wrong value'], ['release:rollback', '900001', '--reason', 'a wrong value']]) {
      const result = run(args);
      expect(result.status, args.join(' ')).toBe(2);
      expect(result.stderr).toContain('release:rollback needs --reason <text>');
    }
  }, 60_000);
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

describe('the synthetic release fixtures', () => {
  it('are exactly what tools/release/synthetic.ts builds from fixtures/synthetic/cms', () => {
    for (const [dir, files] of [
      [SYNTHETIC_RELEASE_DIR, renderSyntheticRelease()],
      [RERUN_RELEASE_DIR, renderRerunRelease()],
    ] as const) {
      for (const [file, text] of files) {
        expect(readFileSync(path.join(repositoryRoot, dir, file), 'utf8'), file).toBe(text);
      }
    }
  });

  it('give release 900004 one changed record against 900001, the 97110 relative value, and it passes the content checker', () => {
    const first = readRelease(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR)).records.map((located) => located.record);
    const second = readRelease(path.join(repositoryRoot, RERUN_RELEASE_DIR)).records.map((located) => located.record);
    expect(diffRecords(first, second)).toEqual([{ recordType: 'pfs_rvu', added: 0, removed: 0, changed: 1 }]);
    const changed = second.filter((record) => {
      const before = first.find((other) => other.record_type === record.record_type && JSON.stringify(other.key) === JSON.stringify(record.key));
      return JSON.stringify(before?.value) !== JSON.stringify(record.value);
    });
    expect(changed.map((record) => [record.key, (record.value as { work_rvu: string }).work_rvu])).toEqual([[{ hcpcs: '97110', modifier: '' }, '0.41']]);
    expect(checkContent(repositoryRoot, [RERUN_RELEASE_DIR]).problems).toEqual([]);
    // Every file of 900004 is built, so none may be left over beside them.
    expect(listFiles(repositoryRoot, RERUN_RELEASE_DIR).map((file) => path.relative(RERUN_RELEASE_DIR, file).split(path.sep).join('/')).sort()).toEqual([...renderRerunRelease().keys()].sort());
  });
});
