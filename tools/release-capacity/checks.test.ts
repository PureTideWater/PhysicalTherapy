import { describe, expect, it } from 'vitest';

import { TRACE_LOCK_BUCKETS } from '../../apps/worker/src/parse/loader';
import { JOB_ATTEMPT_FAILED_MESSAGE } from '../../apps/worker/src/worker';
import {
  ADVISORY_LOCKS_PER_TRANSACTION,
  type CapacityMeasurements,
  FAILING_ERROR_CODES,
  HEAP_LIVE_PERCENT,
  type JobOutcome,
  type JobPhase,
  KNOWN_GAP,
  MEMORY_PEAK_PERCENT,
  type MemoryKinds,
  type MemorySample,
  PHASE_SAMPLE_GAP_MS,
  SAMPLED_PERIODS,
  type SampledPeriod,
  THE_WHOLE_RUN,
  WINDOWS_COLD_BUDGET_MS,
  WORKING_SET,
  advisoriesOutput,
  attemptFailures,
  errorCodes,
  jobHeaps,
  markdown,
  memoryKinds,
  memorySample,
  oomEvents,
  report,
  unsampled,
  verdict,
  withSample,
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
  job('F price', 'price', 'setup'),
  job('F triage', 'triage', 'setup'),
  job('A price', 'price', 'concurrent'),
  job('B audit report', 'audit_report', 'concurrent'),
  job('C parse 1', 'parse_835', 'concurrent'),
  job('C parse 2', 'parse_835', 'concurrent'),
  job('C parse 3', 'parse_835', 'concurrent'),
  job('C parse 4', 'parse_835', 'concurrent'),
  job('A triage', 'triage', 'chain'),
  job('A audit report', 'audit_report', 'chain'),
  job('F reprocessing parse 1', 'parse_835', 'reconcile'),
  job('F reconcile', 'reconcile', 'reconcile'),
  job('A audit report 2', 'audit_report', 'together'),
  job('D triage', 'triage', 'together'),
  job('E price', 'price', 'together'),
  job('C parse 5', 'parse_835', 'together'),
  job('C parse 6', 'parse_835', 'together'),
  job('C parse 7', 'parse_835', 'together'),
  job('C parse 8', 'parse_835', 'together'),
];

/** memory.stat's kinds, in MiB: anonymous, page cache and its inactive part, shared memory and kernel. */
const kinds = (anon: number, file: number, inactive: number, shmem = 2, kernel: number | null = 20): MemoryKinds => ({
  anonBytes: anon * MIB,
  fileBytes: file * MIB,
  inactiveFileBytes: inactive * MIB,
  shmemBytes: shmem * MIB,
  kernelBytes: kernel === null ? null : kernel * MIB,
});
/** A sample: memory.current (MiB) beside memory.stat's kinds; its working set is memory.current less inactive_file. */
const at = (currentMib: number, of: MemoryKinds): MemorySample => ({ currentBytes: currentMib * MIB, workingSetBytes: currentMib * MIB - of.inactiveFileBytes, kinds: of });
/**
 * A period sampled `count` times over `ms`, its highest working set and its highest memory.current at `peak`; memory.peak
 * read at its end. Built here, not by the harness's own accumulator (tested below), so the fixture is the same whatever
 * checks.ts reads.
 */
const period = (what: string, peak: MemorySample | null, count: number, ms: number | null, memoryPeakBytes: number | null = 700 * MIB): SampledPeriod => {
  const read = peak !== null && count > 0;
  return { what, workingSetPeakBytes: read ? peak.workingSetBytes : null, atPeak: read ? peak : null, peakBytes: read ? peak.currentBytes : null, memoryPeakBytes, samples: read ? count : 0, ms };
};
// 690 MiB of memory.current, 60 MiB of it inactive page cache: a working set of 630 MiB.
const SAMPLE = at(690, kinds(500, 170, 60));
const PERIODS: readonly SampledPeriod[] = SAMPLED_PERIODS.map((what) => period(what, SAMPLE, 300, 600_000));
const RUN: SampledPeriod = period(THE_WHOLE_RUN, SAMPLE, 1_800, 3_600_000);
const withPeriod = (what: string, changes: Partial<SampledPeriod>): readonly SampledPeriod[] => PERIODS.map((entry) => (entry.what === what ? { ...entry, ...changes } : entry));
const change = (what: string, changes: Partial<JobOutcome>): readonly JobOutcome[] => JOBS.map((entry) => (entry.what === what ? { ...entry, ...changes } : entry));

const PASSING: CapacityMeasurements = {
  commit: 'synthetic',
  runtime: 'docker',
  small: false,
  runner: { cpus: 4, memoryMiB: 16_000, cpuModel: 'SYNTHETIC CPU', kernel: '6.0' },
  worker: { cpus: 0.5, memoryMiB: 1024, cpuset: '3', command: ['node', '--max-old-space-size=560', '--enable-source-maps', 'dist/main.js'] },
  release: { releaseNo: 900_110, records: 4_174_000, manifestSha256: 'a'.repeat(64) },
  expected: { pricedLines: 100_000, parsedClaims: 8_000, postedLines: 2_000, reconcileLines: 2_000 },
  jobs: JOBS,
  run: { status: 'complete', failureCode: null },
  pricedLines: 100_000,
  parsedClaims: 8_000,
  posted: { lines: 2_000, inFull: 2_000 },
  aActionable: { lines: 30_795, expected: 30_795, matched: 30_795 },
  memory: { limitBytes: LIMIT, peakBytes: 700 * MIB, run: RUN, periods: PERIODS, oomKills: 0, oomKilled: false, oomEvents: { start: { oom: 0, oomKill: 0 }, end: { oom: 0, oomKill: 0 } }, restarts: 0, running: true },
  advisoryLocks: { peak: 1, samples: 3_600, peakDuring: 'the concurrent phase' },
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
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'C parse 3' ? { ...entry, state: 'failed' } : entry)) }, /C parse 3 \(parse_835 [0-9a-f-]{36}\) ended failed, not completed, in the concurrent phase/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'A audit report' ? { ...entry, state: 'active' } : entry)) }, /A audit report .* ended active/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'B triage' ? { ...entry, state: null } : entry)) }, /^B triage \(triage [0-9a-f-]{36}\) could not be read$/);
    failsWith({ jobs: JOBS.map((entry) => (entry.what === 'A price' ? { ...entry, state: 'not_queued', jobId: null } : entry)) }, /^A price \(price\) ended not_queued, not completed, in the concurrent phase$/);
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

  const events = (start: { oom: number | null; oomKill: number } | null, end: { oom: number | null; oomKill: number } | null) => ({ ...PASSING.memory, oomEvents: { start, end } });

  it('fails an oom_kill memory.events counts between the worker’s start and the end, in one line with the kill (Lane A’s orchestrator, 2026-11-04)', () => {
    failsWith(
      { memory: { ...events({ oom: 0, oomKill: 0 }, { oom: 1, oomKill: 1 }), oomKills: 1 } },
      /^the worker was killed for memory \(1 OOM kills in its cgroup\); memory\.events counted 1 oom and 1 oom_kill between the worker’s start and the end$/,
    );
    // cgroup v1 counts no oom; its oom_kill still counts.
    failsWith({ memory: events({ oom: null, oomKill: 0 }, { oom: null, oomKill: 1 }) }, /^the worker’s cgroup reached its memory limit: memory\.events counted 0 oom and 1 oom_kill/);
  });

  it('fails an oom event with no process killed, which the kill check alone would pass, counted from the worker’s start only', () => {
    failsWith({ memory: events({ oom: 0, oomKill: 0 }, { oom: 2, oomKill: 0 }) }, /^the worker’s cgroup reached its memory limit: memory\.events counted 2 oom and 0 oom_kill between the worker’s start and the end$/);
    // What the cgroup counted before the worker started is not this run's.
    expect(verdict({ ...PASSING, memory: events({ oom: 3, oomKill: 0 }, { oom: 3, oomKill: 0 }) }).pass).toBe(true);
    expect(verdict({ ...PASSING, memory: events({ oom: null, oomKill: 0 }, { oom: null, oomKill: 0 }) }).pass).toBe(true);
  });

  it('fails closed when memory.events cannot be read, at the worker’s start or at the end', () => {
    failsWith({ memory: events(null, { oom: 0, oomKill: 0 }) }, /^the worker’s memory\.events could not be read at its start, so an OOM event could pass unseen$/);
    failsWith({ memory: events({ oom: 0, oomKill: 0 }, null) }, /^the worker’s memory\.events could not be read at the end, so an OOM event could pass unseen$/);
    failsWith({ memory: events(null, null) }, /could not be read at its start or at the end/);
  });

  it(`fails a sample set whose working set, memory.current less inactive_file, is above ${String(MEMORY_PEAK_PERCENT)}% of the task (921.6 MiB of 1,024), naming the working set and how it is computed (Lane A’s orchestrator, 2026-11-04)`, () => {
    // 960 MiB of memory.current, 20 MiB of it inactive page cache: a working set of 940 MiB.
    const high = period('the large jobs together', at(960, kinds(780, 160, 20)), 300, 600_000, 962 * MIB);
    const over = verdict({ ...PASSING, memory: { ...PASSING.memory, peakBytes: 962 * MIB, run: { ...high, what: THE_WHOLE_RUN }, periods: PERIODS.map((entry) => (entry.what === high.what ? high : entry)) } });
    expect(over.pass).toBe(false);
    expect(over.reasons).toEqual([
      'the worker’s working set (memory.current less inactive_file, sampled each second) over the whole run is 940 MiB, above 90% of its 1024 MiB (921.6 MiB)',
      'the worker’s working set (memory.current less inactive_file, sampled each second) over the large jobs together is 940 MiB, above 90% of its 1024 MiB (921.6 MiB)',
    ]);
    expect(WORKING_SET).toBe('working set (memory.current less inactive_file, sampled each second)');
  });

  it('passes a run where only inactive page cache pushes memory.current and memory.peak past 921.6 MiB while the working set stays under it (run 41848025627’s large jobs together)', () => {
    // 955.3 MiB of memory.current and memory.peak 958.6 MiB, 143.3 MiB of it inactive page cache: a working set of 812 MiB.
    const cache = period('the large jobs together', at(955.3, kinds(598.2, 335, 143.3, 2.5, 21.6)), 300, 600_000, 958.6 * MIB);
    expect(cache.workingSetPeakBytes).toBeCloseTo(812 * MIB, -3);
    const memory = { ...PASSING.memory, peakBytes: 958.6 * MIB, run: { ...cache, what: THE_WHOLE_RUN }, periods: PERIODS.map((entry) => (entry.what === cache.what ? cache : entry)) };
    expect(verdict({ ...PASSING, memory })).toEqual({ pass: true, reasons: [], advisories: [] });
  });

  it('holds the working set to the line exactly, reports memory.peak without judging it, and fails closed on a working set unread', () => {
    const ceiling = (LIMIT * MEMORY_PEAK_PERCENT) / 100;
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, run: period(THE_WHOLE_RUN, { ...SAMPLE, workingSetBytes: ceiling }, 1_800, 3_600_000) } }).pass).toBe(true);
    failsWith(
      { memory: { ...PASSING.memory, run: period(THE_WHOLE_RUN, { ...SAMPLE, workingSetBytes: ceiling + 1 }, 1_800, 3_600_000) } },
      /^the worker’s working set \(memory\.current less inactive_file, sampled each second\) over the whole run is 921\.6 MiB, above 90% of its 1024 MiB \(921\.6 MiB\)$/,
    );
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, peakBytes: null } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, run: period(THE_WHOLE_RUN, null, 0, 3_600_000) } }, /^the worker’s working set \(memory\.current less inactive_file, sampled each second\) over the whole run could not be read$/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { workingSetPeakBytes: null, atPeak: null, samples: 0 }) } }, /working set .* over the concurrent phase could not be read/);
  });

  it(`fails each phase’s and each chain job’s working set above ${String(MEMORY_PEAK_PERCENT)}% of the task, naming it, and one that was not sampled (CAS-42.4)`, () => {
    expect(SAMPLED_PERIODS).toEqual(['the concurrent phase', 'A’s triage', 'A’s audit report', 'F’s reconcile', 'the large jobs together']);
    const ceiling = (LIMIT * MEMORY_PEAK_PERCENT) / 100;
    for (const what of SAMPLED_PERIODS) {
      expect(verdict({ ...PASSING, memory: { ...PASSING.memory, periods: withPeriod(what, { workingSetPeakBytes: ceiling }) } }).pass, what).toBe(true);
      failsWith({ memory: { ...PASSING.memory, periods: withPeriod(what, { workingSetPeakBytes: 922 * MIB }) } }, new RegExp(`working set \\(memory\\.current less inactive_file, sampled each second\\) over ${what} is 922 MiB, above 90% of its 1024 MiB \\(921.6 MiB\\)`));
      failsWith({ memory: { ...PASSING.memory, periods: PERIODS.filter((entry) => entry.what !== what) } }, new RegExp(`working set .* over ${what} could not be read`));
    }
  });

  it(`fails a period sampled fewer than once each ${String(PHASE_SAMPLE_GAP_MS / 1000)} seconds, so a peak between samples is not missed unseen (int-surfaces improvement 5)`, () => {
    // 600 s of phase: 300 samples is the floor.
    expect(verdict({ ...PASSING, memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 300 }) } }).pass).toBe(true);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 299 }) } }, /memory over the concurrent phase was sampled 299 times in 600.0 s, fewer than one each 2 seconds \(300\)/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('the concurrent phase', { samples: 0 }) } }, /sampled 0 times/);
    failsWith({ memory: { ...PASSING.memory, periods: withPeriod('A’s triage', { samples: 10, ms: 60_000 }) } }, /memory over A’s triage was sampled 10 times in 60.0 s, fewer than one each 2 seconds \(30\)/);
    failsWith({ memory: { ...PASSING.memory, run: { ...RUN, samples: 1_000 } } }, /memory over the whole run was sampled 1000 times in 3600.0 s, fewer than one each 2 seconds \(1800\)/);
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
    failsWith({ jobs: change('A triage', { attempts: 2 }) }, /A triage \(triage [0-9a-f-]{36}\) completed on attempt 2, not its first, in the chain/);
    failsWith({ jobs: change('D triage', { attempts: 3 }) }, /D triage \(triage [0-9a-f-]{36}\) completed on attempt 3, not its first, in the large jobs together/);
    failsWith({ jobs: change('F reconcile', { attempts: null }) }, /F reconcile \(reconcile [0-9a-f-]{36}\) completed, but its attempts could not be read, in F’s reconcile/);
    // The codes its failed attempts logged, read from the worker's log (CAS-42.5 on 3ac856d5 had none to read).
    failsWith(
      { jobs: change('A price', { attempts: 2, failedAttempts: ['DB_POOL_TIMEOUT'] }) },
      /A price \(price [0-9a-f-]{36}\) completed on attempt 2, not its first, in the concurrent phase \(its failed attempts logged DB_POOL_TIMEOUT\)$/,
    );
    failsWith({ jobs: change('A price', { attempts: 3, failedAttempts: [] }) }, /A price .* completed on attempt 3, not its first, in the concurrent phase \(its failed attempts logged no `job attempt failed` line\)$/);
    expect(verdict({ ...PASSING, jobs: change('B triage', { attempts: 2 }) }).pass).toBe(true);
  });

  it(`fails a backend above ${String(ADVISORY_LOCKS_PER_TRANSACTION)} advisory locks at any sample (the loader’s bound, imported), and a run whose locks could not be sampled (CAS-42.4)`, () => {
    expect(ADVISORY_LOCKS_PER_TRANSACTION).toBe(TRACE_LOCK_BUCKETS);
    expect(ADVISORY_LOCKS_PER_TRANSACTION).toBe(64);
    expect(verdict({ ...PASSING, advisoryLocks: { peak: 64, samples: 3_600, peakDuring: 'A’s triage' } }).pass).toBe(true);
    // The line names the sampled period that was open when the peak was first seen, so the reader knows which jobs to read.
    failsWith({ advisoryLocks: { peak: 65, samples: 3_600, peakDuring: 'A’s triage' } }, /^a backend held 65 advisory locks at once during A’s triage, above 64 \(a lock per line or per row is back\)$/);
    failsWith({ advisoryLocks: { peak: 70, samples: 3_600, peakDuring: 'setup or between phases' } }, /held 70 advisory locks at once during setup or between phases, above 64/);
    failsWith({ advisoryLocks: null }, /advisory locks held could not be sampled/);
    failsWith({ advisoryLocks: { peak: 0, samples: 0, peakDuring: null } }, /advisory locks held could not be sampled/);
  });

  it(`fails a job’s live heap above ${String(HEAP_LIVE_PERCENT)}% of its limit, and a measured job that logged no job heap line (CAS-42.4)`, () => {
    expect(HEAP_LIVE_PERCENT).toBe(75);
    expect(verdict({ ...PASSING, jobs: change('A audit report', { heap: { peakMib: 420, limitMib: 560 } }) }).pass).toBe(true);
    failsWith({ jobs: change('A audit report', { heap: { peakMib: 421, limitMib: 560 } }) }, /A audit report \(audit_report 00000000-0000-4000-8000-\d{12}\) had a live heap of 421 MiB, above 75% of its 560 MiB limit \(420 MiB\), in the chain$/);
    failsWith({ jobs: change('B triage', { heap: { peakMib: 500, limitMib: 560 } }) }, /B triage .* had a live heap of 500 MiB/);
    // V8's heap_size_limit adds the young generation to the flag (752 MiB under 560): the line is the flag's, as the alarm's is.
    expect(verdict({ ...PASSING, jobs: change('A audit report', { heap: { peakMib: 420, limitMib: 752 } }) }).pass).toBe(true);
    failsWith({ jobs: change('A audit report', { heap: { peakMib: 421, limitMib: 752 } }) }, /A audit report .* had a live heap of 421 MiB, above 75% of its 560 MiB limit \(420 MiB\), in the chain$/);
    // With no flag in the worker's command, the limit the job logged.
    const unflagged = { ...PASSING.worker, command: ['node', 'dist/main.js'] };
    expect(verdict({ ...PASSING, worker: unflagged, jobs: change('A audit report', { heap: { peakMib: 564, limitMib: 752 } }) }).pass).toBe(true);
    failsWith({ worker: unflagged, jobs: change('A audit report', { heap: { peakMib: 565, limitMib: 752 } }) }, /A audit report .* had a live heap of 565 MiB, above 75% of its 752 MiB limit \(564 MiB\)/);
    failsWith({ jobs: change('E price', { heap: null }) }, /E price \(price [0-9a-f-]{36}\) logged no `job heap` line, in the large jobs together/);
    failsWith({ jobs: change('C parse 2', { heap: null }) }, /C parse 2 \(parse_835 [0-9a-f-]{36}\) logged no `job heap` line, in the concurrent phase/);
    // Setup's jobs are not measured; a job that did not complete fails as that alone.
    expect(verdict({ ...PASSING, jobs: change('D price', { heap: null }) }).pass).toBe(true);
    failsWith({ jobs: change('F reconcile', { state: 'failed', heap: null, attempts: 3 }) }, /F reconcile \(reconcile [0-9a-f-]{36}\) ended failed, not completed, in F’s reconcile/);
    // Step 7b's jobs keep the measured jobs' checks: the first attempt and the live heap.
    failsWith({ jobs: change('F reconcile', { attempts: 2 }) }, /F reconcile .* completed on attempt 2, not its first, in F’s reconcile/);
    failsWith({ jobs: change('F reprocessing parse 1', { heap: { peakMib: 421, limitMib: 752 } }) }, /F reprocessing parse 1 .* had a live heap of 421 MiB, above 75% of its 560 MiB limit \(420 MiB\), in F’s reconcile$/);
  });

  it('fails the large jobs together not queued as seven, or any of them not completed (CAS-42.4)', () => {
    failsWith({ jobs: JOBS.filter((entry) => entry.what !== 'C parse 8') }, /the large jobs together queued 6 jobs, not seven \(A’s second audit report, D’s triage, E’s price job and C’s second four parses\)/);
    failsWith({ jobs: change('D triage', { state: 'failed' }) }, /D triage \(triage [0-9a-f-]{36}\) ended failed, not completed, in the large jobs together/);
    failsWith({ jobs: change('E price', { state: null }) }, /E price \(price [0-9a-f-]{36}\) could not be read, in the large jobs together/);
  });

  it('fails F’s reconcile (step 7b) posting other than each actionable line, a line posted short of its approval, or uncounted (CAS-42.4)', () => {
    failsWith({ posted: { lines: 1_999, inFull: 1_999 } }, /^1999 of F’s lines posted, not 2000 \(each actionable line\)$/);
    failsWith({ posted: { lines: 2_001, inFull: 2_001 } }, /^2001 of F’s lines posted, not 2000 \(each actionable line\)$/);
    failsWith({ posted: { lines: 2_000, inFull: 1_998 } }, /^2 of F’s posted lines not posted in full \(their posted entries do not sum to their approved ones\)$/);
    failsWith({ posted: null }, /^F’s posted lines could not be counted$/);
  });

  it('fails F’s reconcile of no actionable line, which posts 0 of 0 and measures nothing', () => {
    failsWith({ expected: { ...PASSING.expected, postedLines: 0 }, posted: { lines: 0, inFull: 0 } }, /^F’s reconcile had no actionable line to post: F’s triage made none actionable, so the reconcile measured nothing$/);
    // Uncounted as well: both are said.
    const uncounted = verdict({ ...PASSING, expected: { ...PASSING.expected, postedLines: 0 }, posted: null });
    expect(uncounted.pass).toBe(false);
    expect(uncounted.reasons).toEqual(['F’s reconcile had no actionable line to post: F’s triage made none actionable, so the reconcile measured nothing', 'F’s posted lines could not be counted']);
  });

  it('fails F’s triage making other than each of its seeded lines actionable, so step 7b reconciles the size it was seeded at (Lane A’s orchestrator, 2026-11-04)', () => {
    failsWith(
      { expected: { ...PASSING.expected, postedLines: 1_400 }, posted: { lines: 1_400, inFull: 1_400 } },
      /^F’s triage made 1400 of its 2000 lines actionable, not each of them, so step 7b reconciled other than the lines it was seeded with$/,
    );
  });

  it('fails A’s triage making other than the lines the scenario makes actionable, none, or uncounted, since A keeps its full month for triage and reports (Lane A’s orchestrator, 2026-11-04)', () => {
    const scenario = 'the scenario expects \\(each of its contract lines priced at least the line materiality short, none of its Medicare Advantage lines\\)';
    failsWith({ aActionable: null }, /^A’s actionable lines after its triage could not be counted$/);
    // None: the chain's triage and A's reports would measure no open case (the guard step 7b on A held until it moved to F).
    failsWith({ aActionable: { lines: 0, expected: 30_795, matched: 0 } }, new RegExp(`^A’s triage made none of its lines actionable, of the 30795 ${scenario}, so the chain’s triage and A’s reports measured no open case$`));
    failsWith({ aActionable: { lines: 0, expected: 0, matched: 0 } }, new RegExp(`^A’s triage made none of its lines actionable, of the 0 ${scenario}`));
    // Fewer or more than expected: a lighter or another month than the one A was seeded with.
    failsWith({ aActionable: { lines: 15_000, expected: 30_795, matched: 15_000 } }, new RegExp(`^A’s triage made 15000 of its lines actionable, 15000 of them among the 30795 ${scenario}, so the chain measured another month than the one A was seeded with$`));
    failsWith({ aActionable: { lines: 30_796, expected: 30_795, matched: 30_795 } }, /^A’s triage made 30796 of its lines actionable, 30795 of them among the 30795 /);
    // As many as expected, one of them not an expected line (a Medicare Advantage line actionable while a contract line was not).
    failsWith({ aActionable: { lines: 30_795, expected: 30_795, matched: 30_794 } }, /^A’s triage made 30795 of its lines actionable, 30794 of them among the 30795 /);
    // Read with the rest: a run that stopped before A's triage says both.
    expect(verdict({ ...PASSING, aborted: 'WORKER_NOT_READY', aActionable: null }).reasons).toEqual(['the run stopped before it was read back: WORKER_NOT_READY', 'A’s actionable lines after its triage could not be counted']);
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
    expect(summary).toContain('| C parse 4 | the concurrent phase | completed | 1 | 100 of 560 MiB | 1.0 s |');
    expect(summary).toContain('| F reprocessing parse 1 | F’s reconcile | completed | 1 | 100 of 560 MiB | 1.0 s |');
    expect(summary).toContain('| F triage | setup | completed | 1 | none | 1.0 s |');
    expect(summary).toContain('| B price | setup | completed | 1 | none | 1.0 s |');
    expect(summary).toContain('Advisory locks: at most 1 held by one backend (first during the concurrent phase; 3600 samples), of 64.');
    // The live heap beside the limit the check holds it to (75% of the flag), never V8's larger heap_size_limit.
    expect(markdown(report({ ...PASSING, jobs: change('A triage', { heap: { peakMib: 430, limitMib: 752 } }) }))).toContain('| A triage | the chain | completed | 1 | 430 of 560 MiB | 1.0 s |');
    expect(markdown(report(PASSING))).toContain('Every check passed.');
    expect(markdown(report(PASSING))).toContain('F’s lines posted 2000 (2000 in full) of 2000 actionable, of its 2000 lines.');
    // A's actionable lines beside the scenario's expectation, in the Run line on every run.
    expect(markdown(report(PASSING))).toContain('priced lines 100000 of 100000; A’s lines actionable after its triage 30795 (30795 of them expected) of 30795 expected, of its 100000 lines; parsed claims 8000 of 8000;');
    expect(markdown(report({ ...PASSING, aActionable: null }))).toContain('; A’s lines actionable after its triage unread, of its 100000 lines; ');
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

describe('the worker’s memory: the working set judged, memory.peak and the memory by kind beside it (CAS-42.5; Lane A’s orchestrator, 2026-11-04)', () => {
  it('reads v2 memory.stat’s anon, file, inactive_file, shmem and kernel, v1’s total_ lines (or the cgroup’s own) with no kernel figure, and nothing from a text without them', () => {
    const v2 = ['anon 734003200', 'file 230686720', 'kernel 31457280', 'kernel_stack 1048576', 'sock 4194304', 'shmem 1048576', 'file_mapped 146800640', 'active_file 167772160', 'inactive_file 62914560'].join('\n');
    expect(memoryKinds(v2, 2)).toEqual({ anonBytes: 700 * MIB, fileBytes: 220 * MIB, inactiveFileBytes: 60 * MIB, shmemBytes: MIB, kernelBytes: 30 * MIB });
    expect(memoryKinds('anon 1048576\nfile 0\ninactive_file 0\n', 2)).toEqual({ anonBytes: MIB, fileBytes: 0, inactiveFileBytes: 0, shmemBytes: 0, kernelBytes: null });
    const v1 = ['cache 10485760', 'rss 524288000', 'shmem 1048576', 'inactive_file 4194304', 'mapped_file 1048576', 'total_cache 12582912', 'total_rss 545259520', 'total_shmem 2097152', 'total_inactive_file 6291456'].join('\n');
    expect(memoryKinds(v1, 1)).toEqual({ anonBytes: 520 * MIB, fileBytes: 12 * MIB, inactiveFileBytes: 6 * MIB, shmemBytes: 2 * MIB, kernelBytes: null });
    expect(memoryKinds('cache 10485760\nrss 524288000\ninactive_file 1048576\n', 1)).toEqual({ anonBytes: 500 * MIB, fileBytes: 10 * MIB, inactiveFileBytes: MIB, shmemBytes: 0, kernelBytes: null });
    // No inactive_file, no working set: the sample is none.
    expect(memoryKinds('anon 1048576\nfile 0\n', 2)).toBeNull();
    expect(memoryKinds('file 0\n', 2)).toBeNull();
    expect(memoryKinds('', 1)).toBeNull();
  });

  it('takes a sample’s working set as memory.current less inactive_file, and no sample when either file is unread', () => {
    const stat = 'anon 629145600\nfile 314572800\ninactive_file 104857600\nshmem 0\nkernel 20971520\n';
    expect(memorySample('964689920\n', stat, 2)).toEqual({ currentBytes: 920 * MIB, workingSetBytes: 820 * MIB, kinds: { anonBytes: 600 * MIB, fileBytes: 300 * MIB, inactiveFileBytes: 100 * MIB, shmemBytes: 0, kernelBytes: 20 * MIB } });
    expect(memorySample('52428800', stat, 2)?.workingSetBytes).toBe(0);
    expect(memorySample(null, stat, 2)).toBeNull();
    expect(memorySample('max', stat, 2)).toBeNull();
    expect(memorySample('964689920', null, 2)).toBeNull();
    // A period keeps its highest working set's sample and counts only the samples it could read.
    const low = memorySample('734003200', stat, 2);
    const high = memorySample('964689920', stat, 2);
    const sampled = [low, null, high, low].reduce(withSample, unsampled('A’s triage'));
    expect(sampled).toEqual({ what: 'A’s triage', workingSetPeakBytes: 820 * MIB, atPeak: high, peakBytes: 920 * MIB, memoryPeakBytes: null, samples: 3, ms: null });
  });

  it('reads memory.events’ oom and oom_kill (v2) and memory.oom_control’s oom_kill (v1, which counts no oom), and none from a text without them', () => {
    expect(oomEvents('low 0\nhigh 0\nmax 12\noom 1\noom_kill 1\noom_group_kill 0\n', 2)).toEqual({ oom: 1, oomKill: 1 });
    expect(oomEvents('low 0\nhigh 0\nmax 0\noom 0\noom_kill 0\n', 2)).toEqual({ oom: 0, oomKill: 0 });
    expect(oomEvents('low 0\nhigh 0\nmax 3\noom_kill 0\n', 2)).toBeNull();
    expect(oomEvents('oom 2\noom_group_kill 0\n', 2)).toBeNull();
    expect(oomEvents('oom_kill_disable 0\nunder_oom 0\noom_kill 2\n', 1)).toEqual({ oom: null, oomKill: 2 });
    expect(oomEvents('oom_kill_disable 0\nunder_oom 0\n', 1)).toBeNull();
    expect(oomEvents(null, 2)).toBeNull();
  });

  it('prints the line and what it judges, memory.peak, the memory.events counts, and each period’s memory by kind at its working set’s peak', () => {
    const cache = period('the large jobs together', at(955.3, kinds(598.2, 335, 143.3, 2.5, 21.6)), 300, 600_000, 958.6 * MIB);
    const full = report({ ...PASSING, memory: { ...PASSING.memory, peakBytes: 958.6 * MIB, run: { ...cache, what: THE_WHOLE_RUN, samples: 1_800, ms: 3_600_000 }, periods: PERIODS.map((entry) => (entry.what === cache.what ? cache : entry)) } });
    expect(full.verdict.pass).toBe(true);
    const summary = markdown(full);
    expect(summary).toContain(
      'Memory: the 90% line (921.6 MiB of 1024 MiB) judges the worker’s working set (memory.current less inactive_file, sampled each second), the measure the kubelet and cAdvisor evict on: at most 812 MiB over the whole run (1800 samples); memory.peak 958.6 MiB over the run, page cache included (reported, not judged); OOM kills 0; memory.events oom +0, oom_kill +0 between the worker’s start and the end; restarts 0.',
    );
    expect(summary).toContain('Memory by kind at each period’s working-set peak (memory.stat; reported beside the working set, which the line judges)');
    expect(summary).toContain('| Period | Working set | memory.current | Anonymous | Page cache | Inactive page cache | Shared memory | Kernel | memory.peak at its end | Samples |');
    expect(summary).toContain('| the whole run | 812 MiB | 955.3 MiB | 598.2 MiB | 335 MiB | 143.3 MiB | 2.5 MiB | 21.6 MiB | 958.6 MiB | 1800 |');
    expect(summary).toContain('| the large jobs together | 812 MiB | 955.3 MiB | 598.2 MiB | 335 MiB | 143.3 MiB | 2.5 MiB | 21.6 MiB | 958.6 MiB | 300 |');
    expect(summary).toContain('| A’s triage | 630 MiB | 690 MiB | 500 MiB | 170 MiB | 60 MiB | 2 MiB | 20 MiB | 700 MiB | 300 |');
    // v1 (no kernel line, no oom count) and a period never read print what they have.
    const v1 = markdown(
      report({
        ...PASSING,
        memory: { ...PASSING.memory, oomEvents: { start: { oom: null, oomKill: 0 }, end: { oom: null, oomKill: 0 } }, periods: PERIODS.map((entry) => (entry.what === 'A’s triage' ? { ...period('A’s triage', at(690, kinds(500, 170, 60, 2, null)), 300, 600_000), memoryPeakBytes: null } : entry)) },
      }),
    );
    expect(v1).toContain('| A’s triage | 630 MiB | 690 MiB | 500 MiB | 170 MiB | 60 MiB | 2 MiB | — | — | 300 |');
    expect(v1).toContain('memory.events oom not counted (cgroup v1), oom_kill +0 between the worker’s start and the end');
    const unread = markdown(report({ ...PASSING, memory: { ...PASSING.memory, peakBytes: null, oomEvents: { start: null, end: null }, periods: withPeriod('the concurrent phase', { workingSetPeakBytes: null, atPeak: null, memoryPeakBytes: null, samples: 0 }) } }));
    expect(unread).toContain('| the concurrent phase | — | — | — | — | — | — | — | — | 0 |');
    expect(unread).toContain('memory.peak unread over the run');
    expect(unread).toContain('; memory.events unread;');
  });
});

describe('the Known gap line (Lane A’s orchestrator, 2026-11-04: step 7b on a practice of its own until SUITE-CAP-3)', () => {
  const GAP =
    'Known gap: reconcile at full size is SUITE-CAP-3’s tracked item. Step 7b reconciles F, a practice of its own at CAS-42.3’s 2,000 lines (fewer at the smoke size), while A keeps its full month for triage and reports: the reconcile pass’s last measured figure at size is 10,000 lines in 3,412 s, far past a job’s 15-minute attempt. Revisit when SUITE-CAP-3 lands: moving step 7b back to A’s full month is its acceptance step (docs/adr/0083).';

  it('names SUITE-CAP-3, its last measured figure and the revisit condition, word for word', () => {
    expect(KNOWN_GAP).toBe(GAP);
  });

  it('prints on every run: a pass, a fail, a smoke run and a run that stopped before it was read back', () => {
    for (const changes of [{}, { pricedLines: 3 }, { small: true }, { aborted: 'WORKER_NOT_READY' }] as Partial<CapacityMeasurements>[]) {
      const full = report({ ...PASSING, ...changes });
      expect(full.verdict.pass).toBe(Object.keys(changes).length === 0 || 'small' in changes);
      expect(markdown(full).split('\n')).toContain(GAP);
    }
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

describe('attemptFailures', () => {
  it('reads each failed attempt’s code by its job’s ID from the worker’s `job attempt failed` lines, in order, and nothing else', () => {
    const id = '4227f755-8ec2-4d8f-8bb2-0fb7356a4541';
    const line = (fields: Record<string, unknown>) => `worker-1  | ${JSON.stringify({ worker_id: 'w', time: '2026-11-04T20:13:12.000Z', level: 'warn', msg: JOB_ATTEMPT_FAILED_MESSAGE, ...fields })}`;
    const failures = attemptFailures([
      line({ job_id: id, job_type: 'price', error_code: 'DB_POOL_TIMEOUT' }),
      '[harness] worker started for run',
      JSON.stringify({ level: 'info', msg: 'job heap', job_id: id, heap_live_peak_mib: 200, heap_limit_mib: 560 }),
      line({ job_id: id, job_type: 'price', error_code: 'DB_40P01' }),
      line({ job_id: 'fa81bd58-8481-4296-9332-b85f78530826', job_type: 'parse_835', error_code: 'not a code' }),
      line({ msg: 'job failed on its last attempt', job_id: id, error_code: 'JOB_FAILED' }),
      '{ not json "job attempt failed"',
    ]);
    expect(Object.fromEntries(failures)).toEqual({ [id]: ['DB_POOL_TIMEOUT', 'DB_40P01'], 'fa81bd58-8481-4296-9332-b85f78530826': ['UNREADABLE'] });
  });
});
