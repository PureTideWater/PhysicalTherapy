/**
 * A time budget that a loaded machine cannot flip and a slower reader cannot hide under (docs/adr/0054, amendment of
 * 2026-11-11, `co-001/time-budget-bound`).
 *
 * The letter reader's budget is the product's: a letter of 100,000 characters is redacted and checked within 3 seconds
 * on the reference machine. A test that compares a wall-clock time with that number proves it only on a machine as
 * fast as the reference and as idle: on a shared runner the same code has read 3.2 to 4.6 seconds with nothing changed,
 * because a wall clock also counts the time the runner gave to other work. So:
 *
 * 1. The work is measured in the processor time of its own thread (process.threadCpuUsage, user and system), not by
 *    the wall clock. The reader is one thread and waits for nothing, so on an idle machine the two are the same number;
 *    on a loaded one only the processor time is the reader's own cost. Work that returns a promise is refused: waiting
 *    costs no processor time and would pass any budget.
 * 2. The work's first run is held to the budget itself. Work under the budget passes against the budget, with no
 *    allowance and no calibration: on the reference machine, or any machine as fast, the bound is the stated number.
 * 3. Only work that ran over the budget is asked whether the machine is the slower one. The machine is measured in
 *    the same thread, right before the work is run again, by a fixed workload of the reader's kind (regular
 *    expressions with look-behind and Unicode classes over 100,000 characters) that calls none of the reader's code:
 *    the fastest of CALIBRATION_RUNS runs, against the same figure taken on the reference machine in a process that
 *    had run the reader. A run can only be slowed by what else the machine does, never sped up, so the fastest is the
 *    machine's own speed. Then
 *
 *      allowed = budget x slowdown,  slowdown = calibration now / calibration on the reference machine,
 *                                    counted only above SLOWDOWN_FLOOR_PERCENT, and 1 otherwise
 *
 *    The floor is the calibration's own spread on one machine: a slowdown inside it is not evidence of a slower
 *    machine and allows nothing. The allowance grows only by the machine's measured slowness, never by the reader's,
 *    since the calibration runs none of the reader's code: a reader that became slower is slower against the same
 *    allowance. The work is run again at most RETRIES times, each after its own calibration.
 */

/**
 * The calibration's processor time on the reference machine, in milliseconds: the fastest of CALIBRATION_RUNS runs on
 * Node 24, in a process that had run the reader (docs/adr/0054 records the measurement).
 */
export const REFERENCE_CALIBRATION_MS = 144;

/** The calibration's spread on one machine, in percent: a measured slowdown under it allows nothing. */
export const SLOWDOWN_FLOOR_PERCENT = 5;

const CALIBRATION_RUNS = 5;
const RETRIES = 2;

const CALIBRATION_TEXT = 'Claim 2026-11-01 was paid $150.00 for 97110, 2 units; member ZZ-12345 was seen on 11/01/2026 by Dr. Vantree.\n'.repeat(1_000).slice(0, 100_000);
const CALIBRATION_PATTERNS = [/(?<![\p{L}\p{N}])\p{N}[\p{N}\s./-]*(?![\p{L}\p{N}])/gu, /(?<![\p{L}\p{N}])\p{Lu}[\p{L}'\s.]*?(?=[\p{N},;])/gu, /[^\p{L}\p{N}]+/gu];
/** Long enough that the 4 ms step of a thread's processor time is 2 % of one run. */
const CALIBRATION_PASSES = 150;

/** The processor time this thread has used, user and system, in milliseconds. */
function threadMs(): number {
  const used = process.threadCpuUsage();
  return (used.user + used.system) / 1000;
}

/** The calibration workload over `passes` passes: its processor time in milliseconds. */
export function calibrationWork(passes: number): number {
  const started = threadMs();
  let held = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    for (const pattern of CALIBRATION_PATTERNS) {
      pattern.lastIndex = 0;
      // test() moves lastIndex and allocates nothing, so the collector's state is no part of the measure.
      while (pattern.test(CALIBRATION_TEXT)) {
        held += 1;
      }
    }
  }
  if (held === 0) {
    throw new Error('the calibration workload read nothing');
  }
  return threadMs() - started;
}

/** This machine's calibration as it runs now: the fastest of CALIBRATION_RUNS runs, in milliseconds. */
export function calibrationMs(): number {
  let fastest = Number.POSITIVE_INFINITY;
  for (let run = 0; run < CALIBRATION_RUNS; run += 1) {
    fastest = Math.min(fastest, calibrationWork(CALIBRATION_PASSES));
  }
  return fastest;
}

/** The calibration workload sized to cost `percent` of a budget on any machine: for this file's own tests. */
export function calibratedWork(budgetMs: number, percent: number): () => number {
  const passes = Math.round((budgetMs * percent * CALIBRATION_PASSES) / (100 * REFERENCE_CALIBRATION_MS));
  return () => calibrationWork(passes);
}

export interface Timed<T> {
  readonly value: T;
  /** The processor time of the run that is judged. */
  readonly ms: number;
  /** What the budget allows on this machine as it ran. */
  readonly allowedMs: number;
  /** How much slower than the reference machine this one was measured: 1 unless the work ran over the budget. */
  readonly slowdown: number;
  /** For an assertion's message. */
  readonly said: string;
}

function measured<T>(budgetMs: number, slowdown: number, work: () => T): Timed<T> {
  const started = threadMs();
  const value = work();
  const ms = threadMs() - started;
  if (typeof (value as { then?: unknown } | null | undefined)?.then === 'function') {
    throw new Error('timed: the work returned a promise; waiting costs no processor time, so it cannot be held to a budget here');
  }
  const allowedMs = budgetMs * slowdown;
  const machine = slowdown === 1 ? 'no allowance for the machine' : `this machine ran the calibration ${slowdown.toFixed(2)} times slower than the reference`;
  const said = `${(ms / 1000).toFixed(2)} s of processor time against ${(allowedMs / 1000).toFixed(2)} s allowed (${(budgetMs / 1000).toFixed(2)} s on the reference machine; ${machine})`;
  return { value, ms, allowedMs, slowdown, said };
}

/** Runs `work` against a budget stated for the reference machine: see the note above. */
export function timed<T>(budgetMs: number, work: () => T): Timed<T> {
  let run = measured(budgetMs, 1, work);
  for (let retry = 0; retry < RETRIES && run.ms >= run.allowedMs; retry += 1) {
    const ratio = calibrationMs() / REFERENCE_CALIBRATION_MS;
    const again = measured(budgetMs, ratio * 100 > 100 + SLOWDOWN_FLOOR_PERCENT ? ratio : 1, work);
    if (again.ms / again.allowedMs < run.ms / run.allowedMs) {
      run = again;
    }
  }
  return run;
}
