import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, type RuleRecordOf, serializeRecords, sha256 } from '@tp/rules';
import { readRelease } from '@tp/rules/content';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFiles, repositoryRoot } from '../content-files';
import { checkContent } from '../verify-content/check';
import { assembleRelease, plusFourGaps } from './assemble';
import { ReleaseToolError, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';
import { type AffectedRun, type PricingRunSource, diffRecords, impactLines, recordChangeLines, releaseContents, releaseDirectory, runImpactLines } from './impact';
import { loadDirectoryRefusal } from './load-directory';
import { previousPublishedRelease } from './rollback';
import {
  DEADLINE_RELEASE_DIR,
  PLUS_FOUR_RELEASE_DIR,
  RERUN_RELEASE_DIR,
  SYNTHETIC_RELEASE_DIR,
  ZIP9_SYNTHETIC_FILE,
  renderDeadlineRelease,
  renderPlusFourRelease,
  renderRerunRelease,
  renderSyntheticRelease,
  renderZip9Synthetic,
} from './synthetic';

let root = '';

/**
 * For a test that runs a child process (bash, or pnpm starting tsx): it waits on the machine's scheduler,
 * and pnpm release:load alone, about 2 s here, passed the 5 s default at a load average of 11 on four cores.
 */
const CHILD_PROCESS_TIMEOUT_MS = 60_000;

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
  }, CHILD_PROCESS_TIMEOUT_MS);

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

/** A ZIP5 and a ZIP9 line of one invented ZIP outside the reserved SYNTHETIC identifiers, as a quarter's two files give them. */
const ZIP5_LINE = `${'YY999129999801 01   1'.padEnd(75, ' ')}20263`;
const ZIP9_LINES = ['0000', '9999'].map((code) => `${`YY999129999801 01   1${code}`.padEnd(75, ' ')}20263`);
const ZIP5_PATH = 'content/sources/locality_map/ZIP5_JUL2026.txt';
const ZIP9_PATH = 'content/sources/locality_map_plus_four/ZIP9_JUL2026.txt';
const QUARTER = { effective_from: '2026-07-01', effective_to: '2026-09-30' } as const;

function parsedSource(file: string, text: string, parser: string): RuleRecord['source'] {
  return { title: 'CMS ZIP code to carrier locality file', url: 'https://example.invalid/zip', path: file, retrieved: '2026-10-15', sha256: sha256(text), method: 'parser', parser, locator: 'line 1', synthetic: false };
}

const REVIEWED: RuleRecord['verification'] = { level: 'L2', by: 'A. Reviewer', on: '2026-10-20', questions: [] };

/** The quarter's ZIP5 record of 99912, which needs its ZIP+4. */
function flaggedZip(overrides: Partial<RuleRecordOf<'locality_map'>> = {}): RuleRecord {
  const fields: Partial<RuleRecordOf<'locality_map'>> = {
    key: { zip: '99912' },
    value: { state: 'YY', carrier: '99998', locality: '01', rural_indicator: '', plus_four_required: true },
    ...QUARTER,
    source: parsedSource(ZIP5_PATH, `${ZIP5_LINE}\n`, 'cms_zip5_locality'),
    verification: REVIEWED,
    quotes: [ZIP5_LINE],
    ...overrides,
  };
  return exampleRecord('locality_map', fields);
}

/** A ZIP9 record of 99912: every code in locality 01. */
function plusFourOf(overrides: Partial<RuleRecordOf<'locality_map_plus_four'>> = {}): RuleRecord {
  const fields: Partial<RuleRecordOf<'locality_map_plus_four'>> = {
    key: { zip: '99912' },
    value: { state: 'YY', ranges: [{ from: '0000', to: '9999', carrier: '99998', locality: '01', rural_indicator: '' }] },
    ...QUARTER,
    source: parsedSource(ZIP9_PATH, `${ZIP9_LINES.join('\n')}\n`, 'cms_zip9_locality'),
    verification: REVIEWED,
    quotes: [...ZIP9_LINES],
    ...overrides,
  };
  return exampleRecord('locality_map_plus_four', fields);
}

describe('release:assemble and the ZIP+4 file (docs/adr/0064)', () => {
  beforeEach(() => {
    write(ZIP5_PATH, `${ZIP5_LINE}\n`);
    write(ZIP9_PATH, `${ZIP9_LINES.join('\n')}\n`);
  });

  const draftFile = (type: string, records: readonly RuleRecord[]) => write(`content/drafts/${type}/2026/${type === 'locality_map' ? 'ZIP5_JUL2026' : 'ZIP9_JUL2026'}.json`, serializeRecords(records));

  it('refuses a release whose ZIP5 file flags a ZIP that no ZIP9 record of the quarter covers, writing nothing', () => {
    draftFile('locality_map', [flaggedZip()]);
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(
      `release 1 not assembled: the ZIP5 file flags ZIPs that its quarter's ZIP9 file does not cover:\n  ZIP 99912 needs its ZIP+4 (its locality_map record from 2026-07-01, ${ZIP5_PATH}), and no locality_map_plus_four record of that ZIP and quarter is in force on 2026-07-01: import the same quarter's ZIP9 file`,
    );
    expect(existsSync(path.join(root, 'content/outgoing/1'))).toBe(false);
    // A ZIP9 draft still at L1 is not in the release, so it covers nothing.
    draftFile('locality_map_plus_four', [plusFourOf({ verification: { level: 'L1', by: 'pnpm rules:import', on: '2026-10-16', questions: [] } })]);
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(/ZIP 99912 needs its ZIP\+4/);
  });

  it('assembles the ZIP5 and ZIP9 records of one quarter, and the content checker accepts the ZIP9 record quoting two lines of its file', () => {
    draftFile('locality_map', [flaggedZip()]);
    draftFile('locality_map_plus_four', [plusFourOf()]);
    const result = assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(result).toMatchObject({ records: 2, excluded: 0 });
    expect(checkContent(root).problems).toEqual([]);
  });

  it('names the first date a flagged window leaves uncovered, and takes the union of the ZIP9 windows', () => {
    const flagged = flaggedZip();
    expect(plusFourGaps([flagged, plusFourOf({ effective_to: '2026-08-31' })])).toEqual([expect.stringContaining('in force on 2026-09-01')]);
    expect(plusFourGaps([flagged, plusFourOf({ effective_from: '2026-07-02' })])).toEqual([expect.stringContaining('in force on 2026-07-01')]);
    expect(plusFourGaps([flagged, plusFourOf({ effective_from: '2026-08-01' }), plusFourOf({ effective_to: '2026-07-31' })])).toEqual([]);
    expect(plusFourGaps([flagged, plusFourOf({ effective_to: '2026-07-31' }), plusFourOf({ effective_from: '2026-08-02' })])).toEqual([expect.stringContaining('in force on 2026-08-01')]);
    expect(plusFourGaps([flagged, plusFourOf({ effective_from: '2026-01-01', effective_to: null })])).toEqual([]);
    expect(plusFourGaps([flagged, plusFourOf({ key: { zip: '99913' } })])).toEqual([expect.stringContaining('ZIP 99912 needs its ZIP+4')]);
    // An open ZIP5 window needs an open ZIP9 window; the walk crosses a year end.
    const open = flaggedZip({ effective_to: null });
    expect(plusFourGaps([open, plusFourOf({ effective_to: '2026-12-31' })])).toEqual([expect.stringContaining('in force on 2027-01-01')]);
    expect(plusFourGaps([open, plusFourOf({ effective_to: '2026-12-31' }), plusFourOf({ effective_from: '2027-01-01', effective_to: null })])).toEqual([]);
    // A ZIP that does not need its ZIP+4 needs no ZIP9 record.
    expect(plusFourGaps([flaggedZip({ value: { state: 'YY', carrier: '99998', locality: '01', rural_indicator: '', plus_four_required: false } })])).toEqual([]);
    expect(plusFourGaps([flaggedZip({ value: { state: 'YY', carrier: '99998', locality: '01', rural_indicator: null, plus_four_required: null } })])).toEqual([]);
  });

  it('takes only a ZIP9 record of the ZIP5 line’s year and quarter and state, read from the lines each quotes', () => {
    const flagged = flaggedZip();
    const ofQuarter = (quarter: string) => ZIP9_LINES.map((line) => `${line.slice(0, 75)}${quarter}`);
    // Last quarter's ZIP9 file under this quarter's window: named, and it covers nothing.
    expect(plusFourGaps([flagged, plusFourOf({ quotes: ofQuarter('20262') })])).toEqual([
      `ZIP 99912 needs its ZIP+4 (its locality_map record from 2026-07-01, ${ZIP5_PATH}), of year and quarter 20263, and its locality_map_plus_four record from 2026-07-01 (${ZIP9_PATH}) is of 20262: import the same quarter's ZIP9 file`,
      `ZIP 99912 needs its ZIP+4 (its locality_map record from 2026-07-01, ${ZIP5_PATH}), and no locality_map_plus_four record of that ZIP and quarter is in force on 2026-07-01: import the same quarter's ZIP9 file`,
    ]);
    // Quotes of two quarters are of no one quarter.
    expect(plusFourGaps([flagged, plusFourOf({ quotes: [...ZIP9_LINES.slice(0, 1), ...ofQuarter('20262').slice(1)] })])[0]).toContain('is of no one year and quarter');
    // Another state's ZIP9 record of the ZIP.
    expect(plusFourGaps([flagged, plusFourOf({ value: { state: 'YX', ranges: [{ from: '0000', to: '9999', carrier: '99998', locality: '01', rural_indicator: '' }] } })])).toEqual([
      `ZIP 99912 needs its ZIP+4 (its locality_map record from 2026-07-01, ${ZIP5_PATH}), in state YY, and its locality_map_plus_four record from 2026-07-01 (${ZIP9_PATH}) is in state YX`,
      expect.stringContaining('no locality_map_plus_four record of that ZIP and quarter is in force on 2026-07-01'),
    ]);
    // A ZIP5 line with no year and quarter cannot be matched to a ZIP9 file.
    expect(plusFourGaps([flaggedZip({ quotes: [ZIP5_LINE.slice(0, 21)] }), plusFourOf()])).toEqual([
      `ZIP 99912 needs its ZIP+4 (its locality_map record from 2026-07-01, ${ZIP5_PATH}), and that record quotes no one year and quarter at positions 76-80, so no ZIP9 file can be matched to its quarter`,
    ]);
    // Another quarter's ZIP9 record whose window does not meet the flagged one is not this quarter's business.
    expect(plusFourGaps([flagged, plusFourOf(), plusFourOf({ effective_from: '2026-04-01', effective_to: '2026-06-30', quotes: ofQuarter('20262') })])).toEqual([]);
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
  }, CHILD_PROCESS_TIMEOUT_MS);
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
  }, CHILD_PROCESS_TIMEOUT_MS);
});

describe('the synthetic release fixtures', () => {
  it('are exactly what tools/release/synthetic.ts builds from fixtures/synthetic/cms', () => {
    for (const [dir, files] of [
      [SYNTHETIC_RELEASE_DIR, renderSyntheticRelease()],
      [RERUN_RELEASE_DIR, renderRerunRelease()],
      [DEADLINE_RELEASE_DIR, renderDeadlineRelease()],
      [PLUS_FOUR_RELEASE_DIR, renderPlusFourRelease()],
    ] as const) {
      for (const [file, text] of files) {
        expect(readFileSync(path.join(repositoryRoot, dir, file), 'utf8'), file).toBe(text);
      }
    }
    expect(readFileSync(path.join(repositoryRoot, ZIP9_SYNTHETIC_FILE), 'utf8')).toBe(renderZip9Synthetic());
  });

  it('give release 900006 a second GPCI locality and the ZIP+4 ranges of 00012, and nothing else changed against 900001 (PRC-21)', () => {
    const first = readRelease(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR)).records.map((located) => located.record);
    const plusFour = readRelease(path.join(repositoryRoot, PLUS_FOUR_RELEASE_DIR));
    expect(plusFour.problems).toEqual([]);
    expect(plusFour.manifest.release).toBe(900_006);
    const records = plusFour.records.map((located) => located.record);
    expect(diffRecords(first, records)).toEqual([
      { recordType: 'locality_map_plus_four', added: 1, removed: 0, changed: 0 },
      { recordType: 'pfs_gpci', added: 1, removed: 0, changed: 0 },
    ]);
    expect(records.filter((record) => record.record_type === 'pfs_gpci').map((record) => [record.key, record.value])).toEqual([
      [{ carrier: '99999', locality: '01' }, { state: 'ZZ', locality_name: 'SYNTHETIC LOCALITY ONE', work_gpci: '1.000', pe_gpci: '0.950', mp_gpci: '0.650' }],
      [{ carrier: '99999', locality: '02' }, { state: 'ZZ', locality_name: 'SYNTHETIC LOCALITY TWO', work_gpci: '1.000', pe_gpci: '1.050', mp_gpci: '0.700' }],
    ]);
    const split = records.find((record) => record.record_type === 'locality_map_plus_four');
    expect(split).toMatchObject({
      key: { zip: '00012' },
      value: {
        state: 'ZZ',
        ranges: [
          { from: '0000', to: '4999', carrier: '99999', locality: '01', rural_indicator: 'R' },
          { from: '5000', to: '8999', carrier: '99999', locality: '02', rural_indicator: 'R' },
        ],
      },
      effective_from: '2026-01-01',
      effective_to: '2026-12-31',
      source: { path: ZIP9_SYNTHETIC_FILE, parser: 'cms_zip9_locality', synthetic: true },
    });
    const lines = renderZip9Synthetic().split('\n');
    expect(lines).toHaveLength(9001);
    expect(split?.quotes).toEqual([lines[0], lines[4999], lines[5000], lines[8999]]);
    // The real-release check holds for 900006; 900001 flags 00012 with no ZIP9 file, on purpose, so the check stays off fixture releases.
    expect(plusFourGaps(records)).toEqual([]);
    expect(plusFourGaps(first)).toEqual([expect.stringContaining('ZIP 00012 needs its ZIP+4')]);
    expect(checkContent(repositoryRoot, [PLUS_FOUR_RELEASE_DIR]).problems).toEqual([]);
    expect(listFiles(repositoryRoot, PLUS_FOUR_RELEASE_DIR).map((file) => path.relative(PLUS_FOUR_RELEASE_DIR, file).split(path.sep).join('/')).sort()).toEqual([...renderPlusFourRelease().keys()].sort());
  });

  it('give release 900005 the three Medicare dispute windows at L2, with their values, source and quotes and an independent second pass, and nothing else (D17 a)', () => {
    const first = readRelease(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR)).records.map((located) => located.record);
    const deadline = readRelease(path.join(repositoryRoot, DEADLINE_RELEASE_DIR));
    expect(deadline.problems).toEqual([]);
    expect(deadline.manifest.release).toBe(900_005);
    const records = deadline.records.map((located) => located.record);
    // The same rules: no record added, removed or of another value.
    expect(diffRecords(first, records)).toEqual([]);
    const windows = records.filter((record) => record.record_type === 'dispute_window');
    expect(windows.map((record) => [record.key, record.verification.level])).toEqual([
      [{ program: 'medicare', window: 'timely_filing' }, 'L2'],
      [{ program: 'medicare', window: 'redetermination' }, 'L2'],
      [{ program: 'medicare', window: 'reconsideration' }, 'L2'],
    ]);
    for (const record of windows) {
      const before = first.find((other) => other.record_type === 'dispute_window' && JSON.stringify(other.key) === JSON.stringify(record.key));
      expect([record.value, record.source, record.quotes]).toEqual([before?.value, before?.source, before?.quotes]);
      expect(record.verification.by).not.toBe(record.source.method === 'hand_typed' ? record.source.transcribed_by : '');
    }
    // Every other record is 900001's, level and all.
    expect(records.filter((record) => record.record_type !== 'dispute_window').map((record) => record.verification.level)).toEqual(first.filter((record) => record.record_type !== 'dispute_window').map((record) => record.verification.level));
    expect(checkContent(repositoryRoot, [DEADLINE_RELEASE_DIR]).problems).toEqual([]);
    expect(listFiles(repositoryRoot, DEADLINE_RELEASE_DIR).map((file) => path.relative(DEADLINE_RELEASE_DIR, file).split(path.sep).join('/')).sort()).toEqual([...renderDeadlineRelease().keys()].sort());
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
