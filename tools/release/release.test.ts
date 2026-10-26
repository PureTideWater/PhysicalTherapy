import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { type RuleRecord, type RuleRecordOf, type WithdrawnEntry, releaseCoverageSchema, readJsonBlock, serializeRecords, sha256 } from '@tp/rules';
import { readRelease } from '@tp/rules/content';
import { exampleRecord } from '@tp/rules/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listFiles, repositoryRoot } from '../content-files';
import { checkContent } from '../verify-content/check';
import { assembleRelease, plusFourGaps, releaseNotes } from './assemble';
import { ReleaseToolError, parseReleaseNumber } from './commands';
import { dryRun } from './dry-run';
import { type AffectedRun, type PricingRunSource, diffRecords, impactLines, recordChangeLines, releaseContents, releaseDirectory, runImpactLines } from './impact';
import { loadDirectoryRefusal } from './load-directory';
import { previousPublishedRelease } from './rollback';
import {
  CONTENT_GAP_RELEASE_DIR,
  DEADLINE_RELEASE_DIR,
  PLUS_FOUR_RELEASE_DIR,
  RERUN_RELEASE_DIR,
  SYNTHETIC_RELEASE_DIR,
  ZIP9_SYNTHETIC_FILE,
  renderContentGapRelease,
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

const NOTE = 'content/drafts/COVERAGE-WITHDRAWN.md';

/** A signed withdrawal of therapy-threshold coverage through 2026-12-31. */
function withdrawal(overrides: Partial<WithdrawnEntry> = {}): WithdrawnEntry {
  return {
    record_type: 'therapy_threshold',
    key: { discipline: 'OT' },
    from: '2026-01-01',
    to: '2026-12-31',
    reason: 'OT thresholds are no longer priced by this release',
    withdrawn_by: 'First Person',
    confirmed_by: 'Second Person',
    withdrawn_on: '2026-10-21',
    ...overrides,
  };
}

/** content/drafts/COVERAGE-WITHDRAWN.md, written for the release after `previous`. */
function writeNote(previous: number, withdrawn: readonly WithdrawnEntry[]): void {
  write(NOTE, ['# Coverage withdrawn', '', 'Signed by two people.', '', '```json', JSON.stringify({ format: 'tp-coverage-withdrawn/1', previous_release: previous, withdrawn }, null, 2), '```', ''].join('\n'));
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
      files: ['RELEASE.md', 'COVERAGE.md', 'therapy_threshold/2026/records.json', 'therapy_threshold/2026/records.second-pass.json', 'MANIFEST.json'],
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
      files: ['RELEASE.md', 'COVERAGE.md', 'therapy_threshold/2026/records.json', 'therapy_threshold/2026/records.second-pass.json', 'MANIFEST.json'],
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

/** A hand-typed CARC record of the rules page, open from 2001 unless overridden: its window is the code list's own dates. */
function carcRecord(overrides: Partial<RuleRecord> = {}): RuleRecord {
  return exampleRecord('carc', {
    key: { code: '45' },
    value: { description: 'Charge exceeds the fee schedule', start_date: '2001-01-01', last_modified: null, stop_date: null, notes: '' },
    source: draft('L2').source,
    verification: { level: 'L2', by: 'A. Reviewer', on: '2026-10-20', questions: [] },
    quotes: ['$1,111 for PT and SLP combined, with review at $1,333'],
    effective_from: '2001-01-01',
    effective_to: null,
    ...overrides,
  } as Partial<RuleRecord>);
}

/** The release's COVERAGE.md, its prose and its parsed block. */
function coverageOf(release: number): { text: string; coverage: unknown } {
  const text = readFileSync(path.join(root, `content/outgoing/${String(release)}/COVERAGE.md`), 'utf8');
  const block = readJsonBlock(text);
  expect(block.problems).toEqual([]);
  expect(releaseCoverageSchema.safeParse(block.value).success).toBe(true);
  return { text, coverage: block.value };
}

describe('release:assemble and coverage (audit #30 R3 and R4; docs/adr/0071)', () => {
  const OT = { key: { discipline: 'OT' as const } };

  it('writes COVERAGE.md for a first release, sealed by the manifest, exactly', () => {
    writeDrafts([draft('L2'), draft('L2', OT)]);
    const result = assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(result.files).toContain('COVERAGE.md');
    const dir = path.join(root, result.dir);
    expect(readFileSync(path.join(dir, 'COVERAGE.md'), 'utf8')).toBe(
      [
        '# Coverage of release 1',
        '',
        'Prepared 2026-10-21 by `pnpm release:assemble 1`. The content checker recomputes everything in the block below',
        'from this release\'s records; never edit it by hand (content/sources/README.md, "Coverage").',
        '',
        '- 1 contents, each with the dates it is loaded for.',
        '- Release 1 is the first release: nothing to compare.',
        '',
        '```json',
        '{',
        '  "format": "tp-release-coverage/1",',
        '  "release": 1,',
        '  "previous_release": null,',
        '  "prepared_on": "2026-10-21",',
        '  "look_back_years": 6,',
        '  "cutoff": "2020-01-01",',
        '  "contents": [',
        '    {',
        '      "content": "therapy_threshold",',
        '      "records": 2,',
        '      "windows": [',
        '        {',
        '          "from": "2026-01-01",',
        '          "to": "2026-12-31"',
        '        }',
        '      ],',
        '      "newest_from": "2026-01-01",',
        '      "newest_retrieved": "2026-10-15"',
        '    }',
        '  ],',
        '  "before_cutoff": [],',
        '  "closed_by_source": [],',
        '  "withdrawn": []',
        '}',
        '```',
        '',
      ].join('\n'),
    );
    const manifest = JSON.parse(readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8')) as { files: Record<string, string> };
    expect(manifest.files['COVERAGE.md']).toBe(sha256(readFileSync(path.join(dir, 'COVERAGE.md'))));
    const notes = readFileSync(path.join(dir, 'RELEASE.md'), 'utf8');
    expect(notes).toContain('## Coverage\n\nThis is the first release: nothing to compare. Details in COVERAGE.md.\n\n## Impact on existing runs');
    expect(checkContent(root).problems).toEqual([]);
  });

  it('lists one loss of each kind in COVERAGE.md and RELEASE.md, and consumes the drafts note once the release verifies', () => {
    const old = draft('L2', { effective_from: '2019-01-01', effective_to: '2025-12-31' });
    writeDrafts([old, draft('L2'), draft('L2', OT)]);
    writeDrafts([carcRecord()], 'carc/2026/records');
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    // Release 2 drops 2019 (before the look-back), OT (withdrawn) and the CARC's open end (closed by its own stop date).
    writeDrafts([draft('L2', { effective_from: '2020-01-01', effective_to: '2025-12-31' }), draft('L2')]);
    writeDrafts([carcRecord({ effective_to: '2026-06-30' })], 'carc/2026/records');
    const entry = withdrawal();
    writeNote(1, [entry]);
    const result = assembleRelease({ root, release: 2, today: '2026-10-22' });
    expect(existsSync(path.join(root, NOTE))).toBe(false);
    const { text, coverage } = coverageOf(2);
    expect(text.split('\n').slice(0, 9)).toEqual([
      '# Coverage of release 2',
      '',
      'Prepared 2026-10-22 by `pnpm release:assemble 2`. The content checker recomputes everything in the block below',
      'from this release\'s records and release 1\'s; never edit it by hand (content/sources/README.md, "Coverage").',
      '',
      '- 2 contents, each with the dates it is loaded for.',
      "- Against release 1: 1 range(s) before the look-back's cutoff (2020-01-01), 1 closed by the source's own dates,",
      '  1 withdrawn by a signed note.',
      '',
    ]);
    expect(coverage).toMatchObject({
      release: 2,
      previous_release: 1,
      prepared_on: '2026-10-22',
      cutoff: '2020-01-01',
      contents: [
        { content: 'therapy_threshold', records: 2, windows: [{ from: '2020-01-01', to: '2026-12-31' }] },
        { content: 'carc', records: 1, windows: [{ from: '2001-01-01', to: '2026-06-30' }] },
      ],
      before_cutoff: [{ record_type: 'therapy_threshold', key: { discipline: 'PT_SLP' }, from: '2019-01-01', to: '2019-12-31' }],
      closed_by_source: [{ record_type: 'carc', key: { code: '45' }, from: '2026-07-01', to: null }],
      withdrawn: [entry],
    });
    const notes = readFileSync(path.join(root, result.dir, 'RELEASE.md'), 'utf8');
    expect(notes).toContain(
      [
        '## Coverage against release 1',
        '',
        "- 1 range(s) before the look-back's cutoff, 1 closed by the source's own dates, 1 withdrawn by a signed note.",
        '- therapy_threshold {"discipline":"OT"} 2026-01-01 to 2026-12-31: OT thresholds are no longer priced by this release (withdrawn by First Person, confirmed by Second Person, 2026-10-21)',
        '',
        'Details in COVERAGE.md.',
        '',
        '## Impact on existing runs',
      ].join('\n'),
    );
    expect(checkContent(root, [], { today: '2026-10-22' }).problems).toEqual([]);
  });

  it('refuses a release that stops covering what the one before covered, with no note, writing nothing (A6)', () => {
    writeDrafts([draft('L2'), draft('L2', OT)]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    writeDrafts([draft('L2', { effective_to: '2026-06-30' })]);
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-22' })).toThrow(
      [
        'release 2 not assembled: it stops covering what release 1 covered:',
        '  therapy_threshold {"discipline":"OT"} 2026-01-01 to 2026-12-31',
        '  therapy_threshold {"discipline":"PT_SLP"} 2026-07-01 to 2026-12-31',
        'keep those records in content/drafts, or withdraw that coverage on purpose in content/drafts/COVERAGE-WITHDRAWN.md, signed by two people (content/sources/README.md, "Coverage")',
      ].join('\n'),
    );
    expect(existsSync(path.join(root, 'content/outgoing/2'))).toBe(false);
    // A note for one of the two losses still leaves the other.
    writeNote(1, [withdrawal()]);
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-22' })).toThrow(/release 1 covered:\n {2}therapy_threshold \{"discipline":"PT_SLP"\} 2026-07-01 to 2026-12-31\nkeep/);
    expect(existsSync(path.join(root, NOTE))).toBe(true);
  });

  it('refuses a note entry that withdraws nothing the release loses, keeping the note (A7)', () => {
    writeDrafts([draft('L2'), draft('L2', OT)]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    writeNote(1, [withdrawal()]);
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-22' })).toThrow(
      'release 2 not assembled: content/drafts/COVERAGE-WITHDRAWN.md withdraws therapy_threshold {"discipline":"OT"} 2026-01-01 to 2026-12-31, which release 2 does not lose',
    );
    expect(existsSync(path.join(root, 'content/outgoing/2'))).toBe(false);
    expect(existsSync(path.join(root, NOTE))).toBe(true);
  });

  it('refuses a note written for another release (A5)', () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    assembleRelease({ root, release: 3, today: '2026-10-21' });
    // The newest release is 3, so the drafts check takes the note; release 2 comes after 1.
    writeNote(3, [withdrawal()]);
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-22' })).toThrow(
      'release 2 not assembled: content/drafts/COVERAGE-WITHDRAWN.md names release 3, but the release before 2 is 1',
    );
    expect(existsSync(path.join(root, NOTE))).toBe(true);
  });

  it('refuses when the previous release was prepared after today (A9)', () => {
    writeDrafts([draft('L2')]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-20' })).toThrow('release 2 not assembled: release 1 was prepared on 2026-10-21, after today (2026-10-20)');
    expect(existsSync(path.join(root, 'content/outgoing/2'))).toBe(false);
  });

  it('keeps the note when the assembled release does not verify, and removes the release', () => {
    writeDrafts([draft('L2'), draft('L2', OT)]);
    assembleRelease({ root, release: 1, today: '2026-10-21' });
    writeDrafts([draft('L2')]);
    // Signed after the day the release is prepared: the post-assembly check refuses it (C13).
    writeNote(1, [withdrawal({ withdrawn_on: '2026-10-23' })]);
    expect(() => assembleRelease({ root, release: 2, today: '2026-10-22' })).toThrow(
      'the assembled release does not verify:\n  content/outgoing/2: COVERAGE.md withdrawn 0: withdrawn_on 2026-10-23 is after the release was prepared (2026-10-22)',
    );
    expect(existsSync(path.join(root, 'content/outgoing/2'))).toBe(false);
    expect(existsSync(path.join(root, NOTE))).toBe(true);
  });

  it('refuses a gap inside a content among the verified drafts, though the drafts are whole (A4)', () => {
    writeDrafts([draft('L2')]);
    writeDrafts([draft('L1', { effective_from: '2027-01-01', effective_to: '2027-12-31' })], 'therapy_threshold/2027/records');
    writeDrafts([draft('L2', { effective_from: '2028-01-01', effective_to: '2028-12-31' })], 'therapy_threshold/2028/records');
    expect(() => assembleRelease({ root, release: 1, today: '2026-10-21' })).toThrow(
      'release 1 not assembled: a content has dates with no record inside the dates it is loaded for:\n  therapy_threshold: 2027-01-01 to 2027-12-31',
    );
    expect(existsSync(path.join(root, 'content/outgoing/1'))).toBe(false);
  });

  it('renders no coverage section when RELEASE.md is given none, as the fixture releases are', () => {
    const input = { title: 'T', summary: 'S.', records: [draft('L2')], impact: ['none'] };
    const without = releaseNotes(input);
    expect(without).not.toContain('## Coverage');
    expect(releaseNotes({ ...input, coverage: { previous: 4, beforeCutoff: 0, closedBySource: 2, withdrawn: [] } })).toBe(
      without.replace(
        '## Impact on existing runs',
        "## Coverage against release 4\n\n- 0 range(s) before the look-back's cutoff, 2 closed by the source's own dates, 0 withdrawn by a signed note.\n\nDetails in COVERAGE.md.\n\n## Impact on existing runs",
      ),
    );
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
    writeNote(1, [withdrawal({ key: { discipline: 'OT' }, from: '2026-01-01' }), withdrawal({ key: { discipline: 'PT_SLP' }, from: '2026-07-01' })]);
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
      [CONTENT_GAP_RELEASE_DIR, renderContentGapRelease()],
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

  it('give release 900007 the per-code MPPR list and the MUE ending 2026-09-30, and nothing else changed against 900001 (RCC-04)', () => {
    const first = readRelease(path.join(repositoryRoot, SYNTHETIC_RELEASE_DIR)).records.map((located) => located.record);
    const gap = readRelease(path.join(repositoryRoot, CONTENT_GAP_RELEASE_DIR));
    expect(gap.problems).toEqual([]);
    expect(gap.manifest.release).toBe(900_007);
    const records = gap.records.map((located) => located.record);
    expect(diffRecords(first, records)).toEqual([
      { recordType: 'mppr_rate', added: 0, removed: 0, changed: first.filter((record) => record.record_type === 'mppr_rate' && 'hcpcs' in record.key).length },
      { recordType: 'ncci_mue', added: 0, removed: 0, changed: first.filter((record) => record.record_type === 'ncci_mue').length },
    ]);
    // Each record is 900001's, end date aside; only the parsed MPPR and MUE files end early, and the general rate stays open.
    for (const record of records) {
      const before = first.find((other) => other.record_type === record.record_type && JSON.stringify(other.key) === JSON.stringify(record.key));
      const ends = record.source.path === 'fixtures/synthetic/cms/MPPR_SYNTHETIC.csv' || record.source.path === 'fixtures/synthetic/cms/NCCI_MUE_SYNTHETIC.csv';
      expect({ ...record, effective_to: before?.effective_to }).toEqual(before);
      expect(record.effective_to).toBe(ends ? '2026-09-30' : before?.effective_to);
    }
    expect(records.filter((record) => record.record_type === 'mppr_rate' && 'component' in record.key).map((record) => record.effective_to)).toEqual([null]);
    expect(checkContent(repositoryRoot, [CONTENT_GAP_RELEASE_DIR]).problems).toEqual([]);
    expect(listFiles(repositoryRoot, CONTENT_GAP_RELEASE_DIR).map((file) => path.relative(CONTENT_GAP_RELEASE_DIR, file).split(path.sep).join('/')).sort()).toEqual([...renderContentGapRelease().keys()].sort());
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
