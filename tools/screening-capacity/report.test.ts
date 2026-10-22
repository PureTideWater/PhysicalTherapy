import { describe, expect, it } from 'vitest';

import { environmentSettings } from '../../infra/lib/environments';
import { HARNESS_RUNS_SCREENING_CONSUMER, MIB, RUNNER_TO_FARGATE, TIME_ALLOWANCE_MS, TIME_METRIC_BELOW_MS, TIME_PROMISE_MS } from './limits';
import { type Measurements, ORACLE_UPLOADS, REPORT_FORMAT, SIZING_QUESTION_MS, type TimeRule, limitProblems, markdown, oracleKind, report, timeLabel, timeRule, timeVerdict, verdict, worstTime } from './report';
import { ENFORCED, OPEN, applied, expected, measured, scenario, scenarios, upload, withS1, withUpload, withoutConsumer } from './test-support/measurements';

/**
 * The capacity test's verdict (audit #53 part 1; the founder's rulings of 2026-10-20, decisions 13 to 16, and of
 * 2026-10-21, Q1 (a) and Q7): environments.ts declares the screening consumer (PR 6b-3) and the harness runs it, so time
 * is enforced, at 48 s on the runner until the runner-to-Fargate factor is measured and at 60 s scaled by it after;
 * settings with no consumer still read as "open, PR 6b". Everything the build controls fails the run: the consumer's
 * size, slots, the platform pricing none, the waiting tier, the time metric's bounds and the static origin among them.
 * A worst time above 44 s is a sizing question for the founder, never a pass to rely on. The report carries no link or
 * token.
 */

describe('the time verdict', () => {
  it('is enforced by production’s own settings, which declare the consumer, and open for settings that declare none', () => {
    // PR 6b-3: compute.screening is declared and the harness runs it, so time is enforced; the switch works both ways.
    expect(HARNESS_RUNS_SCREENING_CONSUMER).toBe(true);
    expect(timeRule(environmentSettings('production'), RUNNER_TO_FARGATE)).toEqual(ENFORCED);
    expect(timeRule(withoutConsumer(), RUNNER_TO_FARGATE)).toEqual({ consumerDeclared: false, consumerRun: true, runnerToFargate: null });
    expect(timeVerdict(120_000, timeRule(withoutConsumer(), RUNNER_TO_FARGATE))).toEqual({ status: 'open' });
    expect(RUNNER_TO_FARGATE).toBeNull();
  });

  it('fails a run with the consumer declared while the harness does not run it as production will', () => {
    // The capacity review of PR #31: declaring compute.screening must not switch time on over the wrong topology.
    const rule = timeRule(environmentSettings('production'), RUNNER_TO_FARGATE, false);
    expect(rule).toEqual({ consumerDeclared: true, consumerRun: false, runnerToFargate: null });
    expect(verdict(measured(), rule)).toEqual({
      pass: false,
      time: 'enforced',
      reasons: ['consumer not run: environments.ts declares the screening consumer, and the harness still prices screenings in the platform container one at a time'],
    });
    expect(verdict(measured({ consumer: null }), ENFORCED).reasons).toContain('consumer not measured: environments.ts declares the screening consumer, and the report names none');
  });

  it('reports 120 s as "open, PR 6b" where no consumer is declared, and fails it where one is', () => {
    expect(timeVerdict(120_000, OPEN)).toEqual({ status: 'open' });
    expect(timeLabel(timeVerdict(120_000, OPEN))).toBe('open, PR 6b');
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 120_000 })])) });
    expect(verdict(slow, OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [] });
    expect(verdict(slow, ENFORCED)).toEqual({ pass: false, time: 'enforced', reasons: ['time: S1-1 120.0 s, fail (promise broken: above 60 s)'] });
  });

  it('with the consumer declared: 47.9 s passes, 48.1 s fails as the allowance, 60.1 s fails as the promise', () => {
    expect([TIME_ALLOWANCE_MS, TIME_PROMISE_MS]).toEqual([48_000, 60_000]);
    expect(timeVerdict(47_900, ENFORCED)).toEqual({ status: 'pass' });
    expect(timeVerdict(48_100, ENFORCED)).toEqual({ status: 'fail', reason: 'allowance' });
    expect(timeVerdict(60_100, ENFORCED)).toEqual({ status: 'fail', reason: 'promise' });
    const at = (ms: number) => verdict(measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + ms })])) }), ENFORCED);
    expect(at(47_900)).toEqual({ pass: true, time: 'enforced', reasons: [] });
    expect(at(48_100).reasons).toEqual(['time: S1-1 48.1 s, fail (allowance: above 48 s on the runner)']);
    expect(at(60_100).reasons).toEqual(['time: S1-1 60.1 s, fail (promise broken: above 60 s)']);
  });

  it('judges every upload, the small ones behind the large included', () => {
    const late = scenarios().map((item) =>
      item.id === 'S4'
        ? {
            ...item,
            uploads: item.uploads.map((entry) => {
              const { logged: _logged, ...rest } = entry;
              return entry.behind ? upload({ ...rest, emailedMs: 9_000 + 48_100 }) : entry;
            }),
          }
        : item,
    );
    expect(verdict(measured({ scenarios: late }), ENFORCED).reasons).toEqual(['time: S4-4 48.1 s, fail (allowance: above 48 s on the runner)']);
  });

  it('once the runner-to-Fargate factor is measured, fails above 60 s scaled by it', () => {
    const scaled: TimeRule = { consumerDeclared: true, consumerRun: true, runnerToFargate: 1.5 };
    expect(timeVerdict(40_000, scaled)).toEqual({ status: 'pass' });
    expect(timeVerdict(40_100, scaled)).toEqual({ status: 'fail', reason: 'promise' });
  });
});

describe('a worst time above 44 s', () => {
  it('passes the verdict and is reported as a sizing question for the founder, never as a wider limit (O9)', () => {
    expect(SIZING_QUESTION_MS).toBe(44_000);
    const near = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 45_200 })])) });
    const full = report(near, ENFORCED);
    expect(full.verdict.pass).toBe(true);
    expect(full.sizing).toEqual({ worstUpload: 'S1-1', worstMs: 45_200, question: true });
    expect(markdown(full, ENFORCED)).toContain('Sizing question for the founder (open item O9): the worst time, S1-1’s 45.2 s, is above 44 s');
    expect(report(measured(), ENFORCED).sizing).toEqual({ worstUpload: 'S1-1', worstMs: 30_000, question: false });
    expect(worstTime({ scenarios: [] })).toBeNull();
  });
});

describe('the checks the build controls fail the run', () => {
  it('pass when everything holds, with time enforced', () => {
    expect(verdict(measured(), ENFORCED)).toEqual({ pass: true, time: 'enforced', reasons: [] });
    expect(verdict(measured(), OPEN)).toEqual({ pass: true, time: 'open, PR 6b', reasons: [] });
    expect(limitProblems(applied(), expected)).toEqual([]);
  });

  const failing: readonly [string, Measurements, RegExp][] = [
    ['an OOM kill', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, oomKilled: true }] })) }), /^OOM kill: S1 platform$/],
    ['an oom_kill event', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, events: { max: 3, oomKill: 1 } }] })) }), /^OOM kill: S1 platform$/],
    ['a restart', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[0]!, restarts: 1 }] })) }), /^restart or exit: S1 web$/],
    ['an exit the harness did not cause', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, exitedUnexpectedly: true }] })) }), /^restart or exit: S1 platform$/],
    ['a 91% anonymous memory sample', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[1]!, anonPeakBytes: Math.ceil(512 * MIB * 0.91) }] })) }), /^memory above 90% of the limit: S1 platform/],
    ['the consumer above 90% of its 4 GiB', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, anonPeakBytes: Math.ceil(4096 * MIB * 0.91) }] })) }), /^memory above 90% of the limit: S1 screening-1 \(3727\.4 MiB of 4096 MiB\)$/],
    ['the consumer killed for memory', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, events: { max: 1, oomKill: 1 } }] })) }), /^OOM kill: S1 screening-1$/],
    ['the consumer exiting', measured({ scenarios: withS1(scenario({ containers: [{ ...scenario().containers[2]!, exitedUnexpectedly: true }] })) }), /^restart or exit: S1 screening-1$/],
    [
      'the consumer measured at a size other than the one declared',
      measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, nanoCpus: 1e9, memoryBytes: 2048 * MIB, memorySwapBytes: 2048 * MIB } : item)) }) }),
      /^limit not applied: screening-1: CPU quota 1000000000, not 2000000000$/,
    ],
    ['the consumer on the wrong CPUs', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, cpuset: '3' } : item)) }) }), /^limit not applied: screening-1: cpuset 3, not 2-3$/],
    ['the consumer not started', measured({ applied: applied({ containers: applied().containers.filter((item) => item.name !== 'screening-1') }) }), /^limit not applied: screening-1: no limits read$/],
    [
      'a process whose affinity collapsed to the overlap with the harness’s CPUs (cgroup v1)',
      measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'screening-1' ? { ...item, affinity: '2' } : item)) }) }),
      /^limit not applied: screening-1: CPU affinity 2, not 2-3$/,
    ],
    ['a container the run does not declare', measured({ applied: applied({ containers: [...applied().containers, { ...applied().containers[2]!, name: 'screening-2' }] }) }), /^limit not applied: screening-2: a container the run does not declare$/],
    ['the platform pricing a screening', measured({ scenarios: withS1(scenario({ platformPricedRuns: 1 })) }), /^platform priced a screening: S1 \(1 run\)$/],
    ['an upload in the account-share tier', measured({ scenarios: withUpload('S4-3', { waitReason: 'account_share', queuePriority: -1 }) }), /^waiting tier: S4-3 \(account_share, priority -1\)$/],
    ['an upload in the daily-cap tier', measured({ scenarios: withUpload('S5-1', { waitReason: 'daily_cap', queuePriority: -1 }) }), /^waiting tier: S5-1 \(daily_cap, priority -1\)$/],
    ['an upload the consumer logged as waiting', measured({ scenarios: withUpload('S2-1', { logged: { elapsedMs: 29_800, atMs: 31_010, tier: 'waiting' } }) }), /^waiting tier: S2-1 \(logged as waiting, priority 0\)$/],
    ['no time-to-email line for an emailed upload', measured({ scenarios: withUpload('S2-1', { logged: null }) }), /^time metric not logged: S2-1$/],
    [
      'a logged time above the time from the browser’s POST to its line',
      measured({ scenarios: withUpload('S1-1', { logged: { elapsedMs: 30_011, atMs: 31_010, tier: 'normal' } }) }),
      /^time metric out of bounds: S1-1 logged 30\.011 s against the harness's 30\.000 s \(at most 30\.010 s, at least 28\.000 s\)$/,
    ],
    [
      'a logged time more than 2 s below the harness’s (the web’s share left out)',
      measured({ scenarios: withUpload('S1-1', { logged: { elapsedMs: 30_000 - TIME_METRIC_BELOW_MS - 1, atMs: 31_010, tier: 'normal' } }) }),
      /^time metric out of bounds: S1-1 logged 27\.999 s/,
    ],
    [
      'the consumer’s three slots not priced at once',
      measured({ scenarios: withUpload('S4-3', { jobStartedMs: 31_500 }) }),
      /^slots not used: S4's first 3 large uploads were not priced at once \(3 declared; S4-3 waited\)$/,
    ],
    ['a request that left for the static origin', measured({ staticAssetOrigin: 'https://static.capacity.invalid', scenarios: withS1(scenario({ staticOrigin: { routed: 12, left: 1 } })) }), /^request left for the static origin: S1 \(1\)$/],
    ['a CPU quota not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'platform' ? { ...item, nanoCpus: null } : item)) }) }), /^limit not applied: platform: CPU quota none/],
    ['a memory limit not applied', measured({ applied: applied({ containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, memorySwapBytes: 1024 * MIB } : item)) }) }), /^limit not applied: web: memory/],
    ['io.max not applied', measured({ applied: applied({ ioMax: null }) }), /^limit not applied: postgres: io\.max not set/],
    ['a round trip under 2 ms', measured({ applied: applied({ roundTripMedianMs: 0.4 }) }), /^limit not applied: postgres: median round trip 0\.40 ms, under 2 ms$/],
    ['a runner too small', measured({ runnerProblems: ['the runner has 1 CPU; the test needs 2'] }), /^runner too small: the runner has 1 CPU/],
    ['a wrong row count', measured({ scenarios: withS1(scenario({}, [upload({ storedRows: 49_999 })])) }), /^row count: S1-1 stored 49999 of 50000$/],
    ['an unfinished upload', measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: null, resultStatus: null, lastPageStatus: null, runStatus: 'pricing', pendingRows: 5_000 })])) }), /^not emailed when the scenario's cap ended: S1-1$/],
    ['a result link that does not open', measured({ scenarios: withS1(scenario({}, [upload({ resultStatus: 404, lastPageStatus: null })])) }), /^result link did not open: S1-1 \(HTTP 404\)$/],
    ['a last page of groups that does not open', measured({ scenarios: withS1(scenario({}, [upload({ lastPageStatus: null })])) }), /^result's last page of groups did not open: S1-1 \(HTTP null\)$/],
    ['an ENGINE_ERROR row', measured({ scenarios: withS1(scenario({}, [upload({ engineErrorRows: 1 })])) }), /^ENGINE_ERROR rows: S1-1 \(1\)$/],
    ['a stalled run', measured({ scenarios: withS1(scenario({}, [upload({ stalled: true })])) }), /^stalled: S1-1/],
    ['a hash mismatch', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S1-1' ? { ...item, oracleSha256: 'e'.repeat(64) } : item)) }), /^oracle mismatch: S1-1$/],
    ['an oracle that compared nothing (two empty sets hash alike)', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S2-1' ? { ...item, rows: 0 } : item)) }), /^oracle compared 0 rows of S2-1, not its 50000 Medicare rows$/],
    ['an oracle that compared fewer rows than the upload’s Medicare rows', measured({ oracle: measured().oracle.map((item) => (item.upload === 'S3-1' ? { ...item, rows: 49_000 } : item)) }), /^oracle compared 49000 rows of S3-1/],
    ['an upload left out of the oracle (its run not found)', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S1-1') }), /^oracle not compared: S1-1$/],
    ['the held entry’s run not compared', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S3-1') }), /^oracle not compared: S3-1$/],
    ['the split ZIP’s run not compared', measured({ oracle: measured().oracle.filter((item) => item.upload !== 'S1-2') }), /^oracle not compared: S1-2$/],
    [
      'the split ZIP’s run compared with the frozen oracle, which cannot price it',
      measured({ oracle: measured().oracle.map((item) => (item.upload === 'S1-2' ? { ...item, oracle: 'frozen_3c1b289' as const } : item)) }),
      /^oracle: S1-2 compared with frozen_3c1b289, not whole_release$/,
    ],
    ['a run of only some scenarios', measured({ scenarios: scenarios().filter((item) => item.id === 'S2' || item.id === 'S3'), only: ['S2', 'S3'] }), /^partial run: measured S2, S3; a verdict needs S1, S2, S3, S4, S5 \(asked for S2, S3\)$/],
    ['scenarios the deadline left unstarted', measured({ scenarios: scenarios().slice(0, 3), notStarted: ['S4', 'S5'] }), /^deadline: S4, S5 not started/],
    ['a small upload priced before the large ones it was sent behind', measured({ scenarios: scenarios().map((item) => (item.id === 'S4' ? { ...item, uploads: item.uploads.map((entry) => (entry.behind ? { ...entry, jobStartedMs: 15_000 } : entry)) } : item)) }), /^queue order: S4-4 was not queued and started behind/],
    ['a small upload whose job was not found', measured({ scenarios: scenarios().map((item) => (item.id === 'S4' ? { ...item, uploads: item.uploads.map((entry) => (entry.id === 'S4-2' ? { ...entry, jobStartedMs: null } : entry)) } : item)) }), /^queue order not recorded: S4-4$/],
    ['an email whose submission time was not captured', measured({ scenarios: withS1(scenario({}, [upload({ submittedMs: null })])) }), /^submission time not captured: S1-1$/],
    ['a page cache not dropped before a cold scenario', measured({ scenarios: withS1(scenario({ coldStart: { restarted: true, cacheDropped: false } })) }), /^cold start not applied: S1 \(Postgres restarted: yes, page cache dropped: no\)$/],
    ['a Postgres backend killed for memory', measured({ scenarios: withS1(scenario({ postgres: { oomKills: 1, restarts: 0, running: true } })) }), /^OOM kill: S1 postgres$/],
    ['a Postgres container that restarted', measured({ scenarios: withS1(scenario({ postgres: { oomKills: 0, restarts: 1, running: true } })) }), /^restart or exit: S1 postgres$/],
    ['Postgres’s state not read on Docker', measured({ scenarios: withS1(scenario({ postgres: { oomKills: null, restarts: 0, running: true } })) }), /^postgres's state not read: S1$/],
    ['a step that did not finish', measured({ aborted: 'RELEASE_LOAD_FAILED' }), /^run not finished: RELEASE_LOAD_FAILED$/],
  ];

  it.each(failing)('fail on %s, with its reason', (_, input, reason) => {
    for (const rule of [ENFORCED, OPEN]) {
      const result = verdict(input, rule);
      expect(result.pass).toBe(false);
      expect(result.reasons.some((line) => reason.test(line)), result.reasons.join('\n')).toBe(true);
    }
  });

  it('count no slot unused for a large upload queued only after another had been emailed', () => {
    // A slow web queued S5's third upload after the first was emailed: it waited for no thread.
    const late = withUpload('S4-3', { jobCreatedMs: 31_200, jobStartedMs: 31_400, submittedMs: 30_000, emailedMs: 55_000 });
    expect(verdict(measured({ scenarios: late }), ENFORCED).reasons.filter((reason) => reason.startsWith('slots not used'))).toEqual([]);
  });

  it('read a waiting-tier upload as failing even where its time would pass, since no scenario upload may wait', () => {
    const waiting = verdict(measured({ scenarios: withUpload('S4-3', { waitReason: 'account_share', queuePriority: -1 }) }), ENFORCED);
    expect(waiting.reasons).toEqual(['waiting tier: S4-3 (account_share, priority -1)']);
  });
});

describe('the report', () => {
  it('names its format, carries the verdict, and holds no link or token', () => {
    const full = report(measured(), ENFORCED);
    expect(full.format).toBe('tp-screening-capacity/4');
    expect(REPORT_FORMAT).toBe('tp-screening-capacity/4');
    expect(full.verdict).toEqual({ pass: true, time: 'enforced', reasons: [] });
    const text = `${JSON.stringify(full)}\n${markdown(full, ENFORCED)}`;
    expect(text).not.toMatch(/\/screening\/results\//);
    expect(text).not.toMatch(/(?<![a-z0-9])[a-z]{32}(?![a-z0-9])/);
    expect(markdown(full, ENFORCED)).toContain('| S1-1 | worst | 50000 | 30.0 | 29.8 | normal | 0.9 | 4.0 (150000) | 20.0 | 3.0 | 0.2 | 1.1, 1.2 | pass |');
  });

  it('names the consumer as measured and both image IDs, which the launch check compares (decision 13)', () => {
    const full = report(measured(), ENFORCED);
    expect(full.consumer).toEqual({ tasks: 1, cpus: 2, memoryMiB: 4096, concurrency: 3 });
    expect(full.images).toEqual({ web: `sha256:${'a'.repeat(64)}`, worker: `sha256:${'b'.repeat(64)}` });
    const summary = markdown(full, ENFORCED);
    expect(summary).toContain('## Screening capacity: pass (time enforced)');
    expect(summary).toContain('Screening consumer: 1 task of 2 vCPU and 4096 MiB, 3 screenings at once each.');
    expect(summary).toContain(`Images: web \`sha256:${'a'.repeat(64)}\`, worker \`sha256:${'b'.repeat(64)}\`.`);
    expect(summary).toContain('| S1 | screening-1 | 1150.0 | 4096 | 1300.0 | 0 | 0 | — |');
  });

  it('compares the five-digit uploads with the frozen read path and the split ZIP’s with the whole release (PR 6b)', () => {
    expect(ORACLE_UPLOADS.map((upload) => [upload, oracleKind(upload)])).toEqual([
      ['S1-1', 'frozen_3c1b289'],
      ['S1-2', 'whole_release'],
      ['S2-1', 'frozen_3c1b289'],
      ['S3-1', 'frozen_3c1b289'],
    ]);
  });

  it('reports the ZIP9 file’s size beside the release (open item O8)', () => {
    const zip9 = { records: 2_546, rangesPerRecord: 40, linesPerYear: 101_840, bytesPerYear: 8_249_040 };
    const full = report(measured({ release: { releaseNo: 900_100, manifestSha256: 'c'.repeat(64), records: 2_247_791, zip9 } }), OPEN);
    expect(full.release.zip9).toEqual(zip9);
    expect(markdown(full, OPEN)).toContain('Release 900100 (2247791 records; ZIP9: 2546 records of 40 ranges, 101840 lines and 7.9 MiB a year).');
    expect(markdown(report(measured(), OPEN), OPEN)).toContain('Release 900100 (2245245 records).');
  });
});
