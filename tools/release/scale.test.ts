import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  MANIFEST_FILE,
  QUARTERLY_RECORD_TYPES,
  type RuleRecord,
  contentGaps,
  contentOf,
  findOverlaps,
  insideOneYear,
  isSyntheticReleaseNumber,
  windowQuarter,
  zipFileQuarter,
} from '@tp/rules';
import { readRelease } from '@tp/rules/content';
import { loadRefusals } from '@tp/rules/loader';
import { QUARTERLY_SCALE_RELEASE_NUMBER, SCALE_RELEASE_NUMBER, SMALL_SCALE_RELEASE_SHAPE, scaleRecordCounts } from '@tp/synth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { SCALE_RELEASE_DIR_NAME, SCALE_SHAPES, type ScaleReleaseSummary, scaleReleaseDirName, writeScaleRelease } from './scale';

/**
 * The production-shaped SYNTHETIC release (audit #53 part 1), built at the small shape through the real parsers,
 * record builder and manifest builder: every record synthetic, the manifest valid, release 900100 reserved and used by
 * no committed fixture, and the loader taking it only with its synthetic test option.
 */

let out: string;
let summary: ScaleReleaseSummary;
/** The quarterly scale release (900110; audit #30 and #31, docs/adr/0071) at the small shape's size. */
const QUARTERLY_SMALL = { ...SMALL_SCALE_RELEASE_SHAPE, windows: 'quarter' } as const;
let quarterly: ScaleReleaseSummary;

beforeAll(() => {
  out = mkdtempSync(path.join(tmpdir(), 'tp-scale-release-'));
  summary = writeScaleRelease({ out, shape: SMALL_SCALE_RELEASE_SHAPE });
  quarterly = writeScaleRelease({ out, shape: QUARTERLY_SMALL, releaseNo: QUARTERLY_SCALE_RELEASE_NUMBER });
}, 60_000);

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('the scale release', () => {
  it('is release 900100, a SYNTHETIC number no committed fixture uses', () => {
    expect(summary.releaseNo).toBe(SCALE_RELEASE_NUMBER);
    expect(isSyntheticReleaseNumber(SCALE_RELEASE_NUMBER)).toBe(true);
    const committed = readdirSync(path.join(repositoryRoot, 'fixtures/synthetic/rules')).map(
      (dir) => (JSON.parse(readFileSync(path.join(repositoryRoot, 'fixtures/synthetic/rules', dir, MANIFEST_FILE), 'utf8')) as { release: number }).release,
    );
    expect(committed.length).toBeGreaterThan(0);
    expect(committed).not.toContain(SCALE_RELEASE_NUMBER);
    expect(path.basename(summary.dir)).toBe(SCALE_RELEASE_DIR_NAME);
  });

  it('reads back whole: its manifest matches every file, and every record is valid and SYNTHETIC', () => {
    const release = readRelease(summary.dir);
    expect(release.problems).toEqual([]);
    expect(release.manifest.release).toBe(SCALE_RELEASE_NUMBER);
    expect(release.manifestSha256).toBe(summary.manifestSha256);
    expect(release.records).toHaveLength(summary.records);
    expect(release.records.every(({ record }) => record.source.synthetic && record.source.title.includes('SYNTHETIC') && record.verification.level === 'L1')).toBe(true);
  });

  it('holds the shape’s counts of each parsed type, and the hand-typed records the engine needs from the first year', () => {
    const counts = scaleRecordCounts(SMALL_SCALE_RELEASE_SHAPE);
    for (const [type, count] of Object.entries(counts)) {
      expect(summary.byType[type] ?? 0, type).toBe(type === 'mppr_rate' ? count + 1 : count);
    }
    expect(summary.byType).toMatchObject({ assistant_modifier: 2, sequestration: 1, therapy_threshold: 4, dispute_window: 3, state_prompt_pay: SMALL_SCALE_RELEASE_SHAPE.promptPayStates, denial_category: 1 });
    const release = readRelease(summary.dir);
    const general = release.records.find(({ record }) => record.record_type === 'mppr_rate' && 'component' in record.key);
    expect(general?.record.effective_from).toBe('2025-01-01');
    const sequestration = release.records.find(({ record }) => record.record_type === 'sequestration');
    expect([sequestration?.record.effective_from, sequestration?.record.effective_to]).toEqual(['2025-01-01', null]);
  });

  it('loads only with the loader’s synthetic test option', () => {
    const release = readRelease(summary.dir);
    expect(loadRefusals(SCALE_RELEASE_NUMBER, release.records, { release: SCALE_RELEASE_NUMBER }).length).toBeGreaterThan(0);
    expect(loadRefusals(SCALE_RELEASE_NUMBER, release.records, { release: SCALE_RELEASE_NUMBER, allowSyntheticFixtureForTests: true })).toEqual([]);
  });

  it('is written outside the repository only', () => {
    expect(summary.dir.startsWith(repositoryRoot)).toBe(false);
  });
});

describe('the quarterly scale release (900110)', () => {
  it('is release 900110, a SYNTHETIC number no committed fixture uses, built by --shape quarterly', () => {
    expect(SCALE_SHAPES.quarterly.releaseNo).toBe(QUARTERLY_SCALE_RELEASE_NUMBER);
    expect(SCALE_SHAPES.quarterly.shape.windows).toBe('quarter');
    expect(SCALE_SHAPES.production).toMatchObject({ releaseNo: SCALE_RELEASE_NUMBER });
    expect(SCALE_SHAPES.production.shape.windows).toBeUndefined();
    expect(quarterly.releaseNo).toBe(QUARTERLY_SCALE_RELEASE_NUMBER);
    expect(isSyntheticReleaseNumber(QUARTERLY_SCALE_RELEASE_NUMBER)).toBe(true);
    expect(path.basename(quarterly.dir)).toBe(scaleReleaseDirName(QUARTERLY_SCALE_RELEASE_NUMBER));
    const committed = readdirSync(path.join(repositoryRoot, 'fixtures/synthetic/rules')).map(
      (dir) => (JSON.parse(readFileSync(path.join(repositoryRoot, 'fixtures/synthetic/rules', dir, MANIFEST_FILE), 'utf8')) as { release: number }).release,
    );
    expect(committed).not.toContain(QUARTERLY_SCALE_RELEASE_NUMBER);
    expect(quarterly.dir.startsWith(repositoryRoot)).toBe(false);
  });

  it('parses every quarter’s files (the ZIP parsers hold each line’s YYYYQ to its window) into the shape’s counts, and loads only as a test fixture', () => {
    const release = readRelease(quarterly.dir);
    expect(release.problems).toEqual([]);
    expect(release.manifest.release).toBe(QUARTERLY_SCALE_RELEASE_NUMBER);
    expect(release.records).toHaveLength(quarterly.records);
    const counts = scaleRecordCounts(QUARTERLY_SMALL);
    for (const [type, count] of Object.entries(counts)) {
      expect(quarterly.byType[type] ?? 0, type).toBe(type === 'mppr_rate' ? count + 1 : count);
    }
    expect(findOverlaps(release.records)).toEqual([]);
    expect(contentGaps(release.records.map(({ record }) => record))).toEqual([]);
    expect(loadRefusals(QUARTERLY_SCALE_RELEASE_NUMBER, release.records, { release: QUARTERLY_SCALE_RELEASE_NUMBER, allowSyntheticFixtureForTests: true })).toEqual([]);
  });

  /**
   * The checker exempts synthetic sets from its quarter rules, so they are applied here directly (tools/verify-content
   * check.ts, C1 to C3 and C16): the release is the shape real content takes.
   */
  it('passes the checker’s quarter rules: one CMS quarter a window, ZIP quotes of that quarter, per-code MPPR inside its year, one window a file', () => {
    const records = readRelease(quarterly.dir).records.map(({ record }) => record);
    const quarterlyTypes: readonly string[] = QUARTERLY_RECORD_TYPES;
    const problems: string[] = [];
    const fileWindows = new Map<string, string>();
    const windowOf = (record: RuleRecord) => `${record.effective_from} to ${record.effective_to ?? 'open'}`;
    for (const record of records) {
      const where = `${record.record_type} ${JSON.stringify(record.key)} ${windowOf(record)}`;
      if (quarterlyTypes.includes(record.record_type)) {
        const quarter = windowQuarter(record.effective_from, record.effective_to);
        if (quarter === null) {
          problems.push(`C1 ${where}`);
        } else if (record.record_type === 'locality_map' || record.record_type === 'locality_map_plus_four') {
          const stated = `${String(quarter.year)}${String(quarter.quarter)}`;
          if (!record.quotes.every((quote) => zipFileQuarter(quote) === stated)) {
            problems.push(`C3 ${where}`);
          }
        }
      }
      const content = contentOf(record);
      if (content === 'mppr_code' && !insideOneYear(record.effective_from, record.effective_to)) {
        problems.push(`C2 ${where}`);
      }
      if (quarterlyTypes.includes(record.record_type) || content === 'mppr_code') {
        const file = `${content} ${record.source.sha256}`;
        const window = fileWindows.get(file) ?? windowOf(record);
        fileWindows.set(file, window);
        if (window !== windowOf(record)) {
          problems.push(`C16 ${where}`);
        }
      }
    }
    expect(problems).toEqual([]);
    expect(records.filter((record) => quarterlyTypes.includes(record.record_type)).length).toBeGreaterThan(0);
  });
});
