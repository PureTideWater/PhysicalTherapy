import { describe, expect, it } from 'vitest';

import { REFERENCE_CALIBRATION_MS, SLOWDOWN_FLOOR_PERCENT, calibratedWork, calibrationMs, timed } from './time-budget';

/**
 * The time budget's own proof (docs/adr/0054, amendment `co-001/time-budget-bound`). The work here is the calibration
 * workload itself, sized as a share of the budget, so each row holds on a machine of any speed: work over the budget
 * is over it everywhere, by the same share, and work under it is under it everywhere.
 */
describe('a time budget in processor time, scaled only by the machine’s measured slowness', () => {
  const BUDGET_MS = 400;
  const HANG_GUARD_MS = 60_000;

  it('holds work under the budget to the budget itself, with no allowance', { timeout: HANG_GUARD_MS }, () => {
    const run = timed(BUDGET_MS, calibratedWork(BUDGET_MS, 50));
    expect(run.ms, run.said).toBeLessThan(run.allowedMs);
    // On the reference machine or one as fast the first run decides, against the stated number.
    if (run.slowdown === 1) {
      expect(run.allowedMs).toBe(BUDGET_MS);
    }
  });

  it.each([125, 150, 300])('refuses work that costs %d percent of the budget, on any machine, after every retry', { timeout: HANG_GUARD_MS }, (percent) => {
    const run = timed(BUDGET_MS, calibratedWork(BUDGET_MS, percent));
    expect(run.ms, run.said).toBeGreaterThanOrEqual(run.allowedMs);
  });

  it('allows nothing for a slowdown inside the calibration’s own spread, and only the measured slowdown above it', { timeout: HANG_GUARD_MS }, () => {
    const run = timed(BUDGET_MS, calibratedWork(BUDGET_MS, 125));
    expect(run.slowdown === 1 || run.slowdown * 100 > 100 + SLOWDOWN_FLOOR_PERCENT).toBe(true);
    expect(run.allowedMs).toBe(BUDGET_MS * run.slowdown);
    // The allowance is the machine's, never the work's: it is what the calibration reads with no work beside it.
    const machine = calibrationMs() / REFERENCE_CALIBRATION_MS;
    expect(run.slowdown * 100).toBeLessThan(Math.max(1, machine) * 120);
  });

  it('refuses work that waits: a promise costs no processor time', () => {
    expect(() => timed(BUDGET_MS, () => new Promise<void>((resolve) => setTimeout(resolve, 1)))).toThrow(/returned a promise/);
  });

  it('counts the processor’s time, not the clock’s: a wait inside the work adds nothing', { timeout: HANG_GUARD_MS }, () => {
    const waits = () => {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600);
      return calibratedWork(BUDGET_MS, 25)();
    };
    const started = performance.now();
    const run = timed(BUDGET_MS, waits);
    expect(performance.now() - started).toBeGreaterThanOrEqual(600);
    expect(run.ms, run.said).toBeLessThan(run.allowedMs);
  });
});
