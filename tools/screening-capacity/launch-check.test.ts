import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import * as deployParameters from '../../infra/lib/deploy-parameters';
import { type LaunchInput, RELEASE_TAG, launchCheck, reportSha256 } from './launch-check';
import { MIB } from './limits';
import { type Measurements, report } from './report';
import { ENFORCED, OPEN, applied, expected, measured, scenario, upload, withS1, withoutConsumer } from './test-support/measurements';

/**
 * Decision 13's launch check (docs/adr/0062; the design's §5.4; test matrix SCR-20), on synthetic reports: production's
 * screening opens only for the deployed tag's passing report with time enforced, on both image IDs and the consumer
 * production declares; anything else names its reason and gives no launch value.
 */

const TAG = 'v1.4.0';
const COMMIT = 'f'.repeat(40);
const WEB = `sha256:${'a'.repeat(64)}`;
const WORKER = `sha256:${'b'.repeat(64)}`;

/** A report's bytes as the harness writes them. */
function kept(measurements: Measurements = measured(), rule = ENFORCED): string {
  return `${JSON.stringify(report(measurements, rule), null, 2)}\n`;
}

function input(overrides: Partial<LaunchInput> = {}): LaunchInput {
  return { reportText: kept(), tag: TAG, tagCommit: COMMIT, images: { web: WEB, worker: WORKER }, settings: environmentSettings('production'), ...overrides };
}

function reasons(overrides: Partial<LaunchInput>): readonly string[] {
  const result = launchCheck(input(overrides));
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.reasons;
}

describe('the launch check', () => {
  it('passes the tag’s passing report with time enforced, on both image IDs, and prints the tag and the report’s SHA-256', () => {
    const text = kept();
    const result = launchCheck(input({ reportText: text }));
    expect(result).toEqual({ ok: true, value: `${TAG}:${reportSha256(text)}`, notes: [] });
    // The value the CDK app sets is one the stack and the web accept (infra/lib/deploy-parameters.ts).
    const pattern = (deployParameters as Readonly<Record<string, unknown>>).SCREENING_LAUNCH_PATTERN;
    expect(typeof pattern).toBe('string');
    expect(result.ok && new RegExp(String(pattern)).test(result.value)).toBe(true);
    expect(reportSha256(text)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails a failing report', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    expect(reasons({ reportText: kept(slow) })).toEqual([
      'verdict: fail with time enforced; launch needs a pass with time enforced',
      'verdict read again: fail with time enforced (time: S1-1 48.1 s, fail (allowance: above 48 s on the runner))',
    ]);
  });

  it('fails a report whose time was open, however fast', () => {
    expect(reasons({ reportText: kept(measured(), OPEN) })).toEqual(['verdict: pass with time open, PR 6b; launch needs a pass with time enforced']);
  });

  it('reads the measurements again rather than trust a recorded pass', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 60_100 })])) });
    const edited = JSON.parse(kept(slow)) as { verdict: unknown };
    edited.verdict = { pass: true, time: 'enforced', reasons: [] };
    expect(reasons({ reportText: JSON.stringify(edited) })).toEqual(['verdict read again: fail with time enforced (time: S1-1 60.1 s, fail (promise broken: above 60 s))']);
  });

  it('fails a report of another commit than the tag’s', () => {
    expect(reasons({ tagCommit: 'e'.repeat(40) })).toEqual([`commit: the report measured ${COMMIT}, and ${TAG} is ${'e'.repeat(40)}`]);
    expect(reasons({ tagCommit: 'no tag v1.4.0 in this checkout (git fetch --tags)' })).toEqual(['commit: the tag’s commit no tag v1.4.0 in this checkout (git fetch --tags) is not a full commit hash']);
  });

  it('fails a worker image other than the one measured', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    expect(reasons({ images: { web: WEB, worker: other } })).toEqual([`worker image: the report measured ${WORKER}, and the image being deployed is ${other}`]);
  });

  it('fails a web image other than the one measured (a rebuild, or the image built for another origin)', () => {
    const other = `sha256:${'d'.repeat(64)}`;
    expect(reasons({ images: { web: other, worker: WORKER } })).toEqual([`web image: the report measured ${WEB}, and the image being deployed is ${other}`]);
    expect(reasons({ images: { web: 'not found: web-production:v1.4.0', worker: WORKER } })).toEqual(['web image: the deployed image’s ID not found: web-production:v1.4.0 is not an image ID']);
  });

  it('fails a consumer measured at another size than production declares', () => {
    const smaller = measured({ consumer: { tasks: 1, cpus: 1, memoryMiB: 2048, concurrency: 2 } });
    const result = reasons({ reportText: kept(smaller) });
    expect(result).toContain('consumer: the report measured 1 × 1 vCPU, 2048 MiB, 2 at once, and production declares 1 × 2 vCPU, 4096 MiB, 3 at once');
    expect(reasons({ settings: withoutConsumer() })).toContain('consumer: environments.ts declares no screening consumer for production');
  });

  it('fails a report that measured the web at another size than production declares (a report from before the founder’s ruling of 2026-10-22)', () => {
    const quarter = applied({
      containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, nanoCpus: 250_000_000, memoryBytes: 512 * MIB, memorySwapBytes: 512 * MIB } : item)),
    });
    const older = measured({ expected: { ...expected, web: { cpus: 0.25, memoryMiB: 512 } }, applied: quarter });
    expect(reasons({ reportText: kept(older) })).toEqual(['web: the report measured 0.25 vCPU and 512 MiB, and production declares 0.5 vCPU and 1024 MiB']);
  });

  it('fails a process-runtime report, whose Postgres was not limited', () => {
    expect(reasons({ reportText: kept(measured({ runtime: 'process', images: { web: null, worker: null } })) })).toEqual([
      'runtime: process, not docker (only the Docker runtime measures under production’s limits)',
      `web image: the report measured null, and the image being deployed is ${WEB}`,
      `worker image: the report measured null, and the image being deployed is ${WORKER}`,
    ]);
  });

  it('fails a malformed tag, an older format, and a file that is not a complete report', () => {
    expect(RELEASE_TAG.test(TAG)).toBe(true);
    expect(reasons({ tag: 'latest' })).toEqual(['tag: latest is not a release tag (v followed by letters, digits, dots and hyphens)']);
    const older = { ...(JSON.parse(kept()) as Record<string, unknown>), format: 'tp-screening-capacity/3' };
    expect(reasons({ reportText: JSON.stringify(older) })).toEqual(['report: format tp-screening-capacity/3, not tp-screening-capacity/4']);
    expect(reasons({ reportText: 'not json' })).toEqual(['report: not JSON']);
    expect(reasons({ reportText: JSON.stringify({ format: 'tp-screening-capacity/4' }) })).toEqual(['report: not a complete capacity report']);
  });

  it('passes a worst time above 44 s with a note of the founder’s sizing question, which the merge settles, not the launch', () => {
    const near = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 45_200 })])) });
    const result = launchCheck(input({ reportText: kept(near) }));
    expect(result.ok && result.notes).toEqual(['sizing: the worst time, S1-1’s 45.2 s, is above 44 s (open item O9: the founder’s sizing question)']);
  });
});
