import { describe, expect, it } from 'vitest';

import { TRACE_LOCK_BUCKETS } from '../../apps/worker/src/parse/loader';
import {
  ADVISORY_LOCKS_PER_TRANSACTION,
  type CapacityMeasurements,
  FAILING_ERROR_CODES,
  HEAP_LIVE_PERCENT,
  type JobOutcome,
  type JobPhase,
  MEMORY_PEAK_PERCENT,
  PHASE_SAMPLE_GAP_MS,
  SAMPLED_PERIODS,
  type SampledPeriod,
  WINDOWS_COLD_BUDGET_MS,
  advisoriesOutput,
  errorCodes,
  jobHeaps,
  markdown,
  report,
  verdict,
} from './checks';

/**
 * The weekly real-size test's fail conditions (audit #31; docs/adr/0071; docs/adr/0083; test matrix RCC-07 and CAS-42.4),
 * over synthetic measurement inputs: a passing run passes, each condition fails alone, and an input that could not be
 * read fails.
 */

const MIB = 1024 * 1024;
const LIMIT = 1024 * MIB;

let jobs = 0;
const job = (what: string, name: string, phase: JobPhase, state: string | null = 'completed'): JobOutcome => {
  jobs += 1;
  return { what, name, phase, jobId: `00000000-0000-4000-8000-${jobs.toString().padStart(12, '0')}`, state, elapsedMs: 1000, attempts: 1, heap: phase === 'setup' ? null : { peakMib: 100, limitMib: 560 } };
};

const JOBS: readonly JobOutcome[] = [
  job('B price', 'price', 'setup'),
  job('B triage', 'triage', 'setup'),
  job('D price', 'price', 'setup'),
  job('A price', 'price', 'concurrent'),
  job('B audit report', 'audit_report', 'concurrent'),
  job('C parse 1', 'parse_835', 'concurrent'),
  job('C parse 2', 'parse_835', 'concurrent'),
  job('C parse 3', 'parse_835', 'concurrent'),
  job('C parse 4', 'parse_835', 'concurrent'),
  job('A triage', 'triage', 'chain'),
  job('A audit report', 'audit_report', 'chain'),
  job('A reprocessing parse 1', 'parse_835', 'reconcile'),
  job('A reconcile', 'reconcile', 'reconcile'),
  job('A audit report 2', 'audit_report', 'together'),
  job('D triage', 'triage', 'together'),
  job('E price', 'price', 'together'),
  job('C parse 5', 'parse_835', 'together'),
  job('C parse 6', 'parse_835', 'together'),
  job('C parse 7', 'parse_835', 'together'),
  job('C parse 8', 'parse_835', 'together'),
];

const period = (what: string, peakBytes: number | null, samples: number, ms: number | null): SampledPeriod => ({ what, peakBytes, samples, ms });
const PERIODS: readonly SampledPeriod[] = SAMPLED_PERIODS.map((what) => period(what, 690 * MIB, 300, 600_000));
const withPeriod = (what: string, changes: Partial<SampledPeriod>): readonly SampledPeriod[] => PERIODS.map((entry) => (entry.what === what ? { ...entry, ...changes } : entry));
const change = (what: string, changes: Partial<JobOutcome>): readonly JobOutcome[] => JOBS.map((entry) => (entry.what === what ? { ...entry, ...changes } : entry));

const PASSING: CapacityMeasurements = {
  commit: 'synthetic',
  runtime: 'docker',
  small: false,
  runner: { cpus: 4, memoryMiB: 16_000, cpuModel: 'SYNTHETIC CPU', kernel: '6.0' },
  worker: { cpus: 0.5, memoryMiB: 1024, cpuset: '3', command: ['node', '--max-old-space-size=560', '--enable-source-maps', 'dist/main.js'] },
  release: { releaseNo: 900_110, records: 4_174_000, manifestSha256: 'a'.repeat(64) },
  expected: { pricedLines: 100_000, parsedClaims: 8_000, postedEntries: 33_334 },
  jobs: JOBS,
  run: { status: 'complete', failureCode: null },
  pricedLines: 100_000,
  parsedClaims: 8_000,
  postedEntries: 33_334,
  memory: { limitBytes: LIMIT, peakBytes: 700 * MIB, periods: PERIODS, oomKills: 0, oomKilled: false, restarts: 0, running: true },
  advisoryLocks: { peak: 1, samples: 3_600 },
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
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, peakBytes: ceiling, periods: withPeriod('the concurrent phase', { peakBytes: ceiling }) } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, peakBytes: ceiling + 1 } }, /memory peak over the whole run is 921.6 MiB, above 90% of its 1024 MiB \(921.6 MiB\)/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { peakBytes: 950 * MIB }) } }, /memory peak over the concurrent phase is 950 MiB/);
    failsWith({ memory: { ...PASSING.memory, peakBytes: null } }, /memory peak over the whole run could not be read/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { peakBytes: null, samples: 0 }) } }, /memory peak over the concurrent phase could not be read/);
  });

  it(`fails each phase’s and each chain job’s sampled memory above ${String(MEMORY_PEAK_PERCENT)}% of the task, naming it, and one that was not sampled (CAS-42.4)`, () => {
    expect(SAMPLED_PERIODS).toEqual(['the concurrent phase', 'A’s triage', 'A’s audit report', 'A’s reconcile', 'the large jobs together']);
    const ceiling = (LIMIT * MEMORY_PEAK_PERCENT) / 100;
    for (const what of SAMPLED_PERIODS) {
      expect(verdict({ ...PASSING, memory: { ...PASSING.memory, periods: withPeriod(what, { peakBytes: ceiling }) } }).pass, what).toBe(true);
      failsWith({ memory: { ...PASSING.memory, periods: withPeriod(what, { peakBytes: 922 * MIB }) } }, new RegExp(`memory peak over ${what} is 922 MiB, above 90% of its 1024 MiB \\(921.6 MiB\\)`));
      failsWith({ memory: { ...PASSING.memory, periods: PERIODS.filter((entry) => entry.what !== what) } }, new RegExp(`memory peak over ${what} could not be read`));
    }
  });

  it(`fails a period sampled fewer than once each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds, so a peak between samples is not missed unseen (int-surfaces improvement 5)`, () => {
    // 600 s of phase: 300 samples is the floor.
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 300 }) } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 299 }) } }, /the concurrent phase’s memory was sampled 299 times in 600.0 s, fewer than one each 2 seconds \(300\)/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 0 }) } }, /sampled 0 times/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('A’s triage', { samples: 10, ms: 60_000 }) } }, /A’s triage’s memory was sampled 10 times in 60.0 s, fewer than one each 2 seconds \(30\)/);
    // With the period's time unread, one sample is the floor.
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 1, ms: null }) } }).pass).toBe(true);
  });

  it('fails a worker log line with a read outside the fetch or a job’s last failed attempt, and an unreadable log', () => {
    expect(FAILING_ERROR_CODES).toEqual(['RELEASE_READ_OUTSIDE_FETCH', 'JOB_FAILED']);
    failsWith({ errorCodes: { RELEASE_READ_OUTSIDE_FETCH: 1 } }, /logged RELEASE_READ_OUTSIDE_FETCH 1 times/);
    failsWith({ errorCodes: { JOB_FAILED: 2, CONTENT_NOT_LOADED: 3 } }, /logged JOB_FAILED 2 times/);
    failsWith({ errorCodes: null }, /log could not be read/);
  });

  it('fails a measured job that completed only on a later attempt, or whose attempts could not be read; setup’s retries are not measured (CAS-42.4)', () => {
    failsWith({ jobs: change('A triage', { attempts: 2 }) }, /A triage \(triage\) completed on attempt 2, not its first \(the chain\)/);
    failsWith({ jobs: change('D triage', { attempts: 3 }) }, /D triage \(triage\) completed on attempt 3, not its first \(the large jobs together\)/);
    failsWith({ jobs: change('A reconcile', { attempts: null }) }, /A reconcile \(reconcile\) completed, but its attempts could not be read \(A’s reconcile\)/);
    expect(verdict({ ...PASSING, jobs: change('B triage', { attempts: 2 }) }).pass).toBe(true);
  });

  it(`fails a backend above ${String(ADVISORY_LOCKS_PER_TRANSACTION)} advisory locks at any sample (the loader’s bound, imported), and a run whose locks could not be sampled (CAS-42.4)`, () => {
    expect(ADVISORY_LOCKS_PER_TRANSACTION).toBe(TRACE_LOCK_BUCKETS);
    expect(ADVISORY_LOCKS_PER_TRANSACTION).toBe(64);
    expect(verdict({ ...PASSING, advisoryLocks: { peak: 64, samples: 3_600 } }).pass).toBe(true);
    failsWith({ advisoryLocks: { peak: 65, samples: 3_600 } }, /a backend held 65 advisory locks at once, above 64/);
    failsWith({ advisoryLocks: null }, /advisory locks held could not be sampled/);
    failsWith({ advisoryLocks: { peak: 0, samples: 0 } }, /advisory locks held could not be sampled/);
  });

  it(`fails a job’s live heap above ${String(HEAP_LIVE_PERCENT)}% of its limit, and a measured job that logged no job heap line (CAS-42.4)`, () => {
    expect(HEAP_LIVE_PERCENT).toBe(75);
    expect(verdict({ ...PASSING, jobs: change('A audit report', { heap: { peakMib: 420, limitMib: 560 } }) }).pass).toBe(true);
    failsWith({ jobs: change('A audit report', { heap: { peakMib: 421, limitMib: 560 } }) }, /A audit report \(audit_report 00000000-0000-4000-8000-\d{12}\) had a live heap of 421 MiB, above 75% of its 560 MiB limit \(420 MiB\) \(the chain\)/);
    failsWith({ jobs: change('B triage', { heap: { peakMib: 500, limitMib: 560 } }) }, /B triage .* had a live heap of 500 MiB/);
    failsWith({ jobs: change('E price', { heap: null }) }, /E price \(price\) logged no job heap line \(the large jobs together\)/);
    failsWith({ jobs: change('C parse 2', { heap: null }) }, /C parse 2 \(parse_835\) logged no job heap line \(concurrent phase\)/);
    // Setup's jobs are not measured; a job that did not complete fails as that alone.
    expect(verdict({ ...PASSING, jobs: change('D price', { heap: null }) }).pass).toBe(true);
    failsWith({ jobs: change('A reconcile', { state: 'failed', heap: null, attempts: 3 }) }, /A reconcile \(reconcile\) ended failed, not completed \(A’s reconcile\)/);
  });

  it('fails the large jobs together not queued as seven, or any of them not completed (CAS-42.4)', () => {
    failsWith({ jobs: JOBS.filter((entry) => entry.what !== 'C parse 8') }, /the large jobs together queued 6 jobs, not seven/);
    failsWith({ jobs: change('D triage', { state: 'failed' }) }, /D triage \(triage\) ended failed, not completed \(the large jobs together\)/);
    failsWith({ jobs: change('E price', { state: null }) }, /E price \(price\) could not be read \(the large jobs together\)/);
  });

  it('fails A’s reconcile posting other than one entry for each actionable line, or uncounted (CAS-42.4)', () => {
    failsWith({ postedEntries: 33_333 }, /33333 posted entries for A, not 33334 \(one for each actionable line\)/);
    failsWith({ postedEntries: null }, /A’s posted entries could not be counted/);
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
    expect(verdict({ ...PASSING, times: { 'concurrent phase': 10 * 60 * 60_000 }, memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 36_000, ms: 10 * 60 * 60_000 }) } }).pass).toBe(true);
  });

  it('writes the report with its verdict, and a summary naming each failing check', () => {
    const failing = report({ ...PASSING, pricedLines: 3 });
    expect(failing.verdict.pass).toBe(false);
    const summary = markdown(failing);
    expect(summary).toMatch(/^# Release capacity: fail\n/);
    expect(summary).toContain('- 3 priced lines, not 100000');
    expect(summary).toContain('| C parse 4 | concurrent | completed | 1 | 100 of 560 MiB | 1.0 s |');
    expect(summary).toContain('| B price | setup | completed | 1 | none | 1.0 s |');
    expect(summary).toContain('690 MiB over A’s triage (300 samples)');
    expect(summary).toContain('Advisory locks: at most 1 held by one backend (3600 samples), of 64.');
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

describe('the worker log’s job heap lines (D19)', () => {
  it('reads each job’s largest live heap peak over its attempts, with its limit, by job ID, skipping anything else', () => {
    const heaps = jobHeaps([
      '{"level":"info","msg":"job heap","job_id":"j1","job_type":"triage","heap_live_peak_mib":120,"heap_limit_mib":560}',
      '2026-10-28T00:00:00Z {"level":"info","msg":"job heap","job_id":"j1","job_type":"triage","heap_live_peak_mib":300,"heap_limit_mib":560}',
      '{"level":"info","msg":"job heap","job_id":"j1","job_type":"triage","heap_live_peak_mib":200,"heap_limit_mib":560}',
      '{"level":"info","msg":"job heap","job_id":"j2","job_type":"price","heap_live_peak_mib":80,"heap_limit_mib":560}',
      '{"level":"info","msg":"job heap","job_id":"j3","heap_live_peak_mib":"80","heap_limit_mib":560}',
      '{"level":"info","msg":"job heap","job_id":"j4","heap_live_peak_mib":80,"heap_limit_mib":0}',
      '{"level":"info","msg":"not the job heap","job_id":"j5","heap_live_peak_mib":80,"heap_limit_mib":560}',
      '{"broken" "job heap"',
      'job heap',
    ]);
    expect([...heaps]).toEqual([
      ['j1', { peakMib: 300, limitMib: 560 }],
      ['j2', { peakMib: 80, limitMib: 560 }],
    ]);
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
