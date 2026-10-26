import { describe, expect, it } from 'vitest';

import { type CapacityMeasurements, FAILING_ERROR_CODES, type JobOutcome, MEMORY_PEAK_PERCENT, PHASE_SAMPLE_GAP_MS, WINDOWS_COLD_BUDGET_MS, advisoriesOutput, errorCodes, markdown, report, verdict } from './checks';

/**
 * The weekly real-size test's fail conditions (audit #31; docs/adr/0071; test matrix RCC-07), over synthetic
 * measurement inputs: a passing run passes, each condition fails alone, and an input that could not be read fails.
 */

const MIB = 1024 * 1024;
const LIMIT = 1024 * MIB;

const job = (what: string, name: string, concurrent: boolean, state: string | null = 'completed'): JobOutcome => ({ what, name, concurrent, jobId: `00000000-0000-4000-8000-${what.length.toString().padStart(12, '0')}`, state, elapsedMs: 1000 });

const JOBS: readonly JobOutcome[] = [
  job('B price', 'price', false),
  job('B triage', 'triage', false),
  job('A price', 'price', true),
  job('B audit report', 'audit_report', true),
  job('C parse 1', 'parse_835', true),
  job('C parse 2', 'parse_835', true),
  job('C parse 3', 'parse_835', true),
  job('C parse 4', 'parse_835', true),
  job('A triage', 'triage', false),
  job('A audit report', 'audit_report', false),
];

const PASSING: CapacityMeasurements = {
  commit: 'synthetic',
  runtime: 'docker',
  small: false,
  runner: { cpus: 4, memoryMiB: 16_000, cpuModel: 'SYNTHETIC CPU', kernel: '6.0' },
  worker: { cpus: 0.5, memoryMiB: 1024, cpuset: '3', command: ['node', '--max-old-space-size=560', '--enable-source-maps', 'dist/main.js'] },
  release: { releaseNo: 900_110, records: 4_174_000, manifestSha256: 'a'.repeat(64) },
  expected: { pricedLines: 100_000, parsedClaims: 8_000 },
  jobs: JOBS,
  run: { status: 'complete', failureCode: null },
  pricedLines: 100_000,
  parsedClaims: 8_000,
  memory: { limitBytes: LIMIT, peakBytes: 700 * MIB, phasePeakBytes: 690 * MIB, phaseSamples: 300, oomKills: 0, oomKilled: false, restarts: 0, running: true },
  errorCodes: { CONTENT_NOT_LOADED: 0 },
  windows: { coldMs: 1200, warmMs: 300, coldRestarted: true, cacheDropped: true, contents: 14, plan: 'HashAggregate' },
  times: { 'concurrent phase': 600_000 },
  aborted: null,
};

const failsWith = (changes: Partial<CapacityMeasurements>, reason: RegExp) => {
  const result = verdict({ ...PASSING, ...changes });
  expect(result.pass).toBe(false);
  expect(result.reasons).toHaveLength(1);
  expect(result.reasons[0]).toMatch(reason);
};

describe('the release capacity verdict', () => {
  it('passes a run whose every check holds, with nothing advisory', () => {
    expect(verdict(PASSING)).toEqual({ pass: true, reasons: [], advisories: [] });
  });

  it('fails a job that did not complete, or whose state could not be read, the concurrent phase’s included', () => {
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'C parse 3' ? { ...entry, state: 'failed' } : entry)) }, /C parse 3 \(parse_835\) ended failed, not completed \(concurrent phase\)/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'A audit report' ? { ...entry, state: 'active' } : entry)) }, /A audit report .* ended active/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'B triage' ? { ...entry, state: null } : entry)) }, /B triage \(triage\) could not be read/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'A price' ? { ...entry, state: 'not_queued', jobId: null } : entry)) }, /A price .* ended not_queued/);
  });

  it('fails a concurrent phase that did not queue its six jobs', () => {
    failsWith({ jobs: JOBS.filter((entry) => entry.what !== 'C parse 4') }, /queued 5 jobs, not six/);
  });

  it('fails a run that is not complete, or that could not be read', () => {
    failsWith({ run: { status: 'failed', failureCode: 'release_read_outside_fetch' } }, /measured run is failed \(release_read_outside_fetch\), not complete/);
    failsWith({ run: null }, /measured run could not be read/);
  });

  it('fails any priced-line count but the period’s lines, and any parsed-claim count but the 835s’ claims', () => {
    failsWith({ pricedLines: 99_999 }, /99999 priced lines, not 100000/);
    failsWith({ pricedLines: null }, /priced lines could not be counted/);
    failsWith({ parsedClaims: 6_000 }, /6000 parsed claims, not 8000/);
    failsWith({ parsedClaims: null }, /parsed claims could not be counted/);
  });

  it('fails an OOM kill, a restart or an exit of the worker, and fails closed when they cannot be read', () => {
    failsWith({ memory: { ...PASSING.memory, oomKills: 1 } }, /killed for memory \(1 OOM kills/);
    failsWith({ memory: { ...PASSING.memory, oomKilled: true } }, /killed for memory/);
    failsWith({ memory: { ...PASSING.memory, oomKills: null } }, /OOM kills could not be read/);
    failsWith({ memory: { ...PASSING.memory, restarts: 1 } }, /restarted 1 times/);
    failsWith({ memory: { ...PASSING.memory, running: false } }, /had exited/);
    failsWith({ memory: { ...PASSING.memory, restarts: null } }, /restarts could not be read/);
  });

  it(`fails a memory peak above ${String(MEMORY_PEAK_PERCENT)}% of the task (921.6 MiB of 1,024), over the run or the concurrent phase alone`, () => {
    const ceiling = (LIMIT * MEMORY_PEAK_PERCENT) / 100;
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, peakBytes: ceiling, phasePeakBytes: ceiling } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, peakBytes: ceiling + 1 } }, /memory peak over the whole run is 921.6 MiB, above 90% of its 1024 MiB \(921.6 MiB\)/);
    failsWith({ memory: { ...PASSING.memory, phasePeakBytes: 950 * MIB } }, /memory peak over the concurrent phase is 950 MiB/);
    failsWith({ memory: { ...PASSING.memory, peakBytes: null } }, /memory peak over the whole run could not be read/);
    failsWith({ memory: { ...PASSING.memory, phasePeakBytes: null, phaseSamples: 0 } }, /memory peak over the concurrent phase could not be read/);
  });

  it(`fails a concurrent phase sampled fewer than once each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds, so a peak between samples is not missed unseen (int-surfaces improvement 5)`, () => {
    // 600 s of phase: 300 samples is the floor.
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, phaseSamples: 300 } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, phaseSamples: 299 } }, /the concurrent phase’s memory was sampled 299 times in 600.0 s, fewer than one each 2 seconds \(300\)/);
    failsWith({ memory: { ...PASSING.memory, phaseSamples: 0 } }, /sampled 0 times/);
    // With the phase's time unread, one sample is the floor.
    expect(verdict({ ...PASSING, times: {}, memory: { ...PASSING.memory, phaseSamples: 1 } }).pass).toBe(true);
  });

  it('fails a worker log line with a read outside the fetch or a job’s last failed attempt, and an unreadable log', () => {
    expect(FAILING_ERROR_CODES).toEqual(['RELEASE_READ_OUTSIDE_FETCH', 'JOB_FAILED']);
    failsWith({ errorCodes: { RELEASE_READ_OUTSIDE_FETCH: 1 } }, /logged RELEASE_READ_OUTSIDE_FETCH 1 times/);
    failsWith({ errorCodes: { JOB_FAILED: 2, CONTENT_NOT_LOADED: 3 } }, /logged JOB_FAILED 2 times/);
    failsWith({ errorCodes: null }, /log could not be read/);
  });

  it('fails a run that stopped before it was read back', () => {
    failsWith({ aborted: 'WORKER_NOT_READY' }, /stopped before it was read back: WORKER_NOT_READY/);
  });

  it('records times as advisory: a slow windows query, or none, fails nothing', () => {
    const slow = verdict({ ...PASSING, windows: { ...(PASSING.windows as NonNullable<CapacityMeasurements['windows']>), coldMs: WINDOWS_COLD_BUDGET_MS + 1 } });
    expect(slow.pass).toBe(true);
    expect(slow.advisories).toEqual([`the windows query took 5001 ms cold, above its 5000 ms budget (advisory)`]);
    expect(verdict({ ...PASSING, windows: null })).toMatchObject({ pass: true, advisories: ['the windows query was not measured'] });
    // A ten-hour phase, sampled each second as the harness samples it.
    expect(verdict({ ...PASSING, times: { 'concurrent phase': 10 * 60 * 60_000 }, memory: { ...PASSING.memory, phaseSamples: 36_000 } }).pass).toBe(true);
  });

  it('writes the report with its verdict, and a summary naming each failing check', () => {
    const failing = report({ ...PASSING, pricedLines: 3 });
    expect(failing.verdict.pass).toBe(false);
    const summary = markdown(failing);
    expect(summary).toMatch(/^# Release capacity: fail\n/);
    expect(summary).toContain('- 3 priced lines, not 100000');
    expect(summary).toContain('| C parse 4 | concurrent | completed | 1.0 s |');
    expect(markdown(report(PASSING))).toContain('Every check passed.');
  });
});

describe('the worker log’s error codes', () => {
  it('counts JSON lines by error_code, past a prefix, skipping anything else', () => {
    expect(
      errorCodes([
        '{"level":"error","msg":"job failed on its last attempt","error_code":"JOB_FAILED"}',
        '2026-10-26T00:00:00Z {"level":"warn","msg":"x","error_code":"CONTENT_NOT_LOADED"}',
        '{"level":"error","error_code":"JOB_FAILED"}',
        'not a log line',
        '{"broken"',
        '{"level":"info","msg":"worker started"}',
      ]),
    ).toEqual({ JOB_FAILED: 2, CONTENT_NOT_LOADED: 1 });
  });
});

describe('the advisories output (fix round S3)', () => {
  it('is empty with no advisory, and otherwise one line of base64 holding each advisory on a line of its own', () => {
    expect(advisoriesOutput([])).toBe('');
    const advisories = verdict({ ...PASSING, windows: { ...(PASSING.windows as NonNullable<CapacityMeasurements['windows']>), coldMs: 7_000 } }).advisories;
    expect(advisories).toEqual(['the windows query took 7000 ms cold, above its 5000 ms budget (advisory)']);
    const output = advisoriesOutput([...advisories, 'the windows query was not measured']);
    expect(output).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(output, 'base64').toString('utf8')).toBe('the windows query took 7000 ms cold, above its 5000 ms budget (advisory)\nthe windows query was not measured');
  });
});
