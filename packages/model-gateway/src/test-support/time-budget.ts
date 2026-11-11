/**
 * A time budget that a loaded machine cannot flip (docs/adr/0054, amendment of 2026-11-11, `co-001/redact-item-26`).
 *
 * The letter reader's budget is the product's: a letter of 100,000 characters is redacted and checked within 3 seconds
 * on the reference machine. A test that compares a wall-clock time with that number proves it only on a machine as
 * fast as the reference and as idle: on a shared runner the same code has read 3.2 to 4.6 seconds with nothing changed,
 * because a wall clock also counts the time the runner gave to other work. Two measures take that out:
 *
 * 1. The work is measured in the processor time of its own thread (process.threadCpuUsage, user and system), not by
 *    the wall clock. The reader is one thread and waits for nothing, so on an idle machine the two are the same number;
 *    on a loaded one only the processor time is the reader's own cost.
 * 2. A machine whose processor is itself slower than the reference's (another class of runner, a neighbour on the same
 *    core) is measured in the same thread, right before and right after the work, by a fixed workload of the reader's
 *    kind (regular expressions with look-behind and Unicode classes over 100,000 characters) that calls none of the
 *    reader's code, and the budget is multiplied by how much slower than the reference it ran:
 *
 *      allowed = budget x max(1, calibration now / calibration on the reference machine)
 *
 *    The faster of the two calibrations counts, so a pause in one of them (a collection of the work's own garbage)
 *    allows nothing. The factor is never under 1: on the reference machine or a faster one the bound is the budget
 *    itself. It grows only by the machine's measured slowness, never by the reader's, since the calibration runs none
 *    of the reader's code: a reader that became slower is slower against the same allowance.
 *
 * The work is measured up to three times and its fastest run taken: the computation is the same each time, so whatever
 * a run takes over the fastest is the machine's.
 */

/** The calibration workload's processor time on the reference machine, in milliseconds (the median of 200 runs). */
export const REFERENCE_CALIBRATION_MS = 40;

const CALIBRATION_TEXT = 'Claim 2026-11-01 was paid $150.00 for 97110, 2 units; member ZZ-12345 was seen on 11/01/2026 by Dr. Vantree.\n'.repeat(1_000).slice(0, 100_000);
const CALIBRATION_PATTERNS = [/(?<![\p{L}\p{N}])\p{N}[\p{N}\s./-]*(?![\p{L}\p{N}])/gu, /(?<![\p{L}\p{N}])\p{Lu}[\p{L}'\s.]*?(?=[\p{N},;])/gu, /[^\p{L}\p{N}]+/gu];
const CALIBRATION_PASSES = 30;

/** The processor time this thread has used, user and system, in milliseconds. */
function threadMs(): number {
  const used = process.threadCpuUsage();
  return (used.user + used.system) / 1000;
}

/** One run of the calibration workload: its processor time in milliseconds. */
export function calibrationMs(): number {
  const started = threadMs();
  let held = 0;
  for (let pass = 0; pass < CALIBRATION_PASSES; pass += 1) {
    for (const pattern of CALIBRATION_PATTERNS) {
      pattern.lastIndex = 0;
      for (let match = pattern.exec(CALIBRATION_TEXT); match !== null; match = pattern.exec(CALIBRATION_TEXT)) {
        held += match[0].length;
      }
    }
  }
  if (held === 0) {
    throw new Error('the calibration workload read nothing');
  }
  return threadMs() - started;
}

// Compiled before the first measurement: a first, cold run would read as a slow machine.
calibrationMs();
calibrationMs();

export interface Timed<T> {
  readonly value: T;
  /** The work's processor time, its fastest run. */
  readonly ms: number;
  /** What the budget allows on this machine as it ran. */
  readonly allowedMs: number;
  /** How much slower than the reference machine the calibration ran beside that run: never under 1. */
  readonly slowdown: number;
  /** For an assertion's message. */
  readonly said: string;
}

/** Runs `work` against a budget stated for the reference machine: see the note above. */
export function timed<T>(budgetMs: number, work: () => T, attempts = 3): Timed<T> {
  let best: Timed<T> | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const before = calibrationMs();
    const started = threadMs();
    const value = work();
    const ms = threadMs() - started;
    const slowdown = Math.max(1, Math.min(before, calibrationMs()) / REFERENCE_CALIBRATION_MS);
    const allowedMs = budgetMs * slowdown;
    const said = `${(ms / 1000).toFixed(2)} s of processor time against ${(allowedMs / 1000).toFixed(2)} s allowed (${(budgetMs / 1000).toFixed(2)} s on the reference machine; this machine ran the calibration ${slowdown.toFixed(2)} times slower)`;
    if (best === null || ms / allowedMs < best.ms / best.allowedMs) {
      best = { value, ms, allowedMs, slowdown, said };
    }
    if (ms < allowedMs) {
      break;
    }
  }
  if (best === null) {
    throw new Error('timed: no attempt ran');
  }
  return best;
}
