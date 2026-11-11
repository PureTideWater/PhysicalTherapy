# Adversarial review: tests and time — co-001/time-budget-bound (HEAD a4ae40b2)

Machine: 4 cores, Xeon 2.10 GHz, 1 thread per core (the build's container class). Local Node v22.23.4; CI `unit`
runs Node 24 (`pnpm test` = `vitest run --project unit --coverage`). Node v24.22.2 was installed into the scratch
directory to compare. Nothing in the repository was edited; `git status` is clean.

Scripts (all in /home/user/ops/designs/time-budget-bound/scripts/, run with the repo's tsx):
`calib.ts N`, `rows.mts cold <i> | timed <reps> | regress | grain`, `calib-after.mts`, `load.sh N cpu|mem`.
Logs: `idle.log`, `loaded6.log`, `loaded12.log`, `ps.log`.
T = /home/user/PhysicalTherapy/node_modules/.bin/tsx

## Findings

### T-1 BLOCKING — a reader past 3 s passes on the reference machine: the factor is never 1 here (1.2 to 1.4)
Command: `$T rows.mts regress` (the dearest-class row `fill('1 1 11 ')` with a busy loop of added processor time).

| work | ms | allowed | factor | result |
|---|---|---|---|---|
| healthy row | 1779 | 3807 | 1.27 | PASS |
| + 1000 ms | 2784 | 3594 | 1.20 | PASS |
| + 1500 ms | **3152** | 3823 | 1.27 | **PASS** |
| + 2000 ms | **3733** | 3869 | 1.29 | **PASS** |
| + 2500 ms | 4184 | 4144 | 1.38 | FAIL (by 40 ms) |
| 1 s row, 1500 ms spin | 1504 | 1279 | 1.28 | FAIL (a 1.25 s row would pass) |

Why, in numbers:
- `$T calib.ts 200` idle, three times on Node 22: median 47.2, 48.0, 48.0 ms (min 39.9 to 43.8, p90 51 to 53, max 76
  to 84); 96 to 100 % of runs over 40 ms. Node 24: median 44.0. The reference 40 is the floor of this machine, not
  its median, so `max(1, x/40)` is above 1 on nearly every run.
- `$T calib-after.mts` (30 clean calibrations, then 6 x [work, 4 calibrations]): clean median 44.0; the first
  calibration after the work 53.9 to 55.5 (Node 22) and 59.4 to 59.8 (Node 24); the later ones stay at 48 to 52 for
  the rest of the process. The calibration reads 10 to 35 % higher in a process that has run the reader, and highest
  right after it, so `min(before, after)` is still 48 to 52: the reader's own leftover state buys allowance.
- `$T rows.mts timed 10` idle: factor min 1.09, median 1.20, max 1.30 on all three rows.
Effective budget on this machine: 3.3 to 4.1 s, typically 3.6 to 3.9 s.
Cure: take the minimum of five or more calibrations run before the work only, against a reference that is the same
statistic measured in the suite's process on Node 24, apply a factor only past a dead band (for example 1.25), and add
a self-test that `timed(3000, spin 3100 ms)` fails on the reference class.

### T-2 BLOCKING — a healthy tree still fails on a loaded runner: vitest's 5,000 ms wall-clock test timeout
The `unit` project sets no `testTimeout` (only `db` has 30,000), and the four blocks pass none, so every row is still
bounded by a wall clock of 5 s, now with two calibrations and up to three attempts inside it.
Command: `./load.sh 8 cpu; ./load.sh 4 mem; cd packages/model-gateway && pnpm exec vitest run --reporter=verbose
src/functions/denial-letter.test.ts src/redact.leaks.test.ts` (loaded12.log): **6 failed | 1659 passed**, 236 s, all
six `Test timed out in 5000ms`; three are timed rows of the first 3 s block (two "dates written with s...", one "a
digit and a bare l..."), three are property tests the change does not touch. The processor-time assertion itself
failed zero times. With `./load.sh 6 cpu` (loaded6.log): 1665 passed, 124 s, the dearest timed rows 3,712 and 3,876 ms
wall, 78 % of the timeout. Idle (idle.log): 1665 passed, 65.7 s, dearest 1,667 ms.
The failures this change answers read 3.2 to 4.6 s of wall clock on CI; the same runner now adds two calibrations
(about 100 ms of processor time, 98 ms wall per `timed` call idle) and the coverage instrumentation, so 4.6 s becomes
about 4.9 s, and a second attempt can never fit.
Cure: give the four blocks an explicit timeout as a hang guard (for example 60,000 ms as `it.each(...)(name, fn,
60_000)`), stated in the ADR as not the budget.

### T-3 RECORDED — under load the calibration inflates more than the work (adds to T-1)
Command: `./load.sh N kind; $T calib.ts 60; $T rows.mts timed 4; pkill -f tbb-load`.

| load | work cpu ms, median (spaces / slashes / digit+LF) | factor median | ms/allowed max |
|---|---|---|---|
| idle | 1647 / 1513 / 2290 | 1.20 / 1.20 / 1.20 | 0.56 / 0.50 / 0.72 |
| 6 cpu | 1789 / 1638 / 2420 (+6 to +9 %) | 1.39 / 1.30 / 1.34 | 0.56 / 0.44 / 0.62 |
| 12 cpu | 1841 / 1793 / 2501 (+9 to +18 %) | 1.36 / 1.43 / 1.40 | 0.53 / 0.43 / 0.62 |
| 8 mem | 1877 / 1690 / 2621 (+12 to +14 %) | 1.41 / 1.38 / 1.36 | 0.57 / 0.47 / 0.66 |

The factor rises 8 to 19 % over its idle value while the work rises 6 to 18 %; the allowance under load is 3.9 to
4.3 s, and the margin (ms/allowed) is wider loaded than idle. Four repetitions per cell: the direction is steady, the
size is within noise. Cure: as T-1 (minimum of several, before the work, dead band) and a cap on the factor.

### T-4 RECORDED — the grain of process.threadCpuUsage is 4 ms here, a tenth of the calibration
Command: `$T rows.mts grain`: step min 0.01, median 4.00, max 4.06 ms. Calibrations come in multiples of 4 ms (43.9,
47.9, 51.9, 55.4), so the factor moves in steps of 0.10 and one tick is 300 ms of allowance on a 3 s row. The 1 s
rows read 14 to 80 ms against 1,233 to 1,296 allowed: neither flaky nor vacuous (a 1,500 ms spin fails, see T-1), but
their readings under 4 ms are zero or one tick. The 60 `timed` calls of I1-1 and J-5 add about 6 s of calibration to
the suite. Cure: a calibration of 400 ms or more, once per file (beforeAll) for the 1 s rows, or the minimum of
several.

### T-5 RECORDED — the calibration does not track the reader across Node versions; local Node is not CI's
`process.threadCpuUsage` is a function on v22.23.4 (local, though `engines` says >=24 and .nvmrc 24) and on v24.22.2.
Command: `scripts/node24/node_modules/.bin/node <repo>/node_modules/tsx/dist/cli.mjs rows.mts timed 5` against the
same on Node 22: the reader is 12 to 21 % faster on Node 24 (1297 / 1236 / 2009 ms against 1647 / 1513 / 2290) while
the calibration is the same or 8 % faster (clean median 44.0 against 44.0 to 48.0). "A letter may take the processor
time of 75 calibration runs, on any machine" therefore means a different product budget per engine: on CI's Node 24
the rows sit at ms/allowed 0.33 to 0.59, a wider margin than locally. Cure: state the reference with its Node version,
measure it on Node 24, and make the local toolchain match (engine-strict).

### T-6 RECORDED — the first passing of three attempts can hide a first-run cost that is the code's
Command: `$T rows.mts cold 0|1|2` (a fresh process each, processor ms, runs 1 to 4): spaces 1878 / 1632 / 1639 / 1696;
slashes 1699 / 1539 / 1463 / 1523; digit+LF 2605 / 2397 / 2287 / 2331. The first run is 14 to 16 % dearer than the
later ones, and that is the code's (compilation, caches), not the machine's; the helper's note says the opposite.
A row whose first run is over and whose second is under passes; the old assertion had no second try. All three first
runs are under 3,000 ms today. Cure: retry only when the two calibrations around the failed attempt disagree (the
machine moved); otherwise fail on the first attempt.

### T-7 RECORDED — work that waits is invisible
Command: `$T rows.mts regress`: a closure that sleeps 5 s (Atomics.wait) reads ms 3 against 3,815 allowed: PASS.
Today the four closures are synchronous and on one thread (no async, await, Worker or timer in
packages/redact/src/redact.ts), so nothing escapes now; `timed` would accept a promise-returning closure and measure
nothing. Cure: refuse a thenable in `timed`, and assert a loose wall bound beside the processor one.

### T-8 RECORDED — statements in the ADR amendment and the helper's note that the code or this machine contradicts
1. "It reads 40 ms on the reference machine: the median of 200 idle runs": 47.2, 48.0, 48.0 (Node 22), 44.0 (Node 24)
   here; 48 to 60 inside a process that ran the reader. Its own "32 to 48 ms across three such runs" is a reference
   known to 20 % either way.
2. "under a load of six runnable jobs on four cores the rows read what they read idle": +6 to +9 % (T-3).
3. "so a pause in one of them allows nothing" and "it cannot grow with the reader's own slowness, since the
   calibration runs none of its code": the calibration reads 10 to 35 % higher after the reader has run (T-1).
4. "The work's fastest of up to three runs is taken": the code stops at the first attempt under its allowance and
   otherwise keeps the lowest ms/allowed, not the lowest ms.
5. "The four wall-clock assertions ... go through it": true of `performance.now`, but the same rows keep a wall-clock
   bound the amendment does not mention, the 5 s test timeout (T-2).
6. "the bound is the budget itself on the reference machine": in practice 1.2 to 1.3 times it (T-1).
Cure: rewrite after T-1 and T-2 are fixed, from measured numbers on Node 24.

### T-9 RECORDED — one row has thin headroom in a fresh process (observation, cause not found)
`fill('5\n')` ("a digit and a bare line break, repeated", first block) read 2,150 to 2,566 ms of processor time idle
in a fresh tsx process (0.72 to 0.86 of 3,000 before any factor), 2,700 under `load.sh 8 mem` (0.90), 1,933 to 2,132
on Node 24; the same row's whole test read 1,463 ms of wall clock under vitest idle. I did not find why the two differ.
Cure: reproduce in the suite and record the row's processor time in the gate's timing table.

## What I tried that held
- Pool: vitest 5.0.5 with no `pool` set runs these files in forked processes (ps.log: two child `node` processes,
  7 threads each, no worker threads), so `threadCpuUsage` measures the main thread that runs the test.
- Pure processor load does not flip the processor-time assertion: zero such failures under 6 and under 12 busy
  processes (the failures of T-2 are timeouts); ms/allowed never passed 0.72.
- The allowance does not follow added processor time without bound: +2,500 ms and +4,000 ms fail (4184 against 4144;
  5634 against 3866), on all three attempts.
- Garbage-heavy work (300 MB of short strings) got factor 1.29, no more than the other rows of that run.
- Idle processor time and wall clock agree within 3 % (1647 against 1689 ms).
- Nothing else is weaker: 850 and 850 rows of `['...` before and after in denial-letter.test.ts, 86 and 86 in
  redact.leaks.test.ts; `performance.now` 4 to 0 in each; the values asserted are the old ones (`{ held: false,
  mentioned: false }` for the two `toBe(false)`, `refused`, `letter`, `REFUSED`); no row skipped.
- The 1 s rows are not vacuous (a 1,500 ms spin fails) and not flaky (14 to 80 ms against over 1,200).

## Not tested
- CPU frequency throttling and SMT contention: this container has one thread per core and no frequency control. By
  the code, a slowdown is compensated only if it spans a calibration; `min(before, after)` leaves one that touches
  only the work uncompensated, and it would need to be 1.4 times (ms/allowed 0.72) to flip the dearest row.
- The `unit` job with `--coverage` on the CI runner itself.
