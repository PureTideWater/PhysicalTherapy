import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { MANIFEST_FILE, isSyntheticReleaseNumber } from '@tp/rules';
import { readRelease } from '@tp/rules/content';
import { loadRefusals } from '@tp/rules/loader';
import { SCALE_RELEASE_NUMBER, SMALL_SCALE_RELEASE_SHAPE, scaleRecordCounts } from '@tp/synth';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import { SCALE_RELEASE_DIR_NAME, type ScaleReleaseSummary, writeScaleRelease } from './scale';

/**
 * The production-shaped SYNTHETIC release (audit #53 part 1), built at the small shape through the real parsers,
 * record builder and manifest builder: every record synthetic, the manifest valid, release 900100 reserved and used by
 * no committed fixture, and the loader taking it only with its synthetic test option.
 */

let out: string;
let summary: ScaleReleaseSummary;

beforeAll(() => {
  out = mkdtempSync(path.join(tmpdir(), 'tp-scale-release-'));
  summary = writeScaleRelease({ out, shape: SMALL_SCALE_RELEASE_SHAPE });
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
