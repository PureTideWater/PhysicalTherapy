# Lane B: three flaky tests and their siblings (design)

Item: urgent, from #120's CI on #75 (`approval-summaries/lane-b-model-eval-gate-status.md`, "Proposals outside this PR"). Branch `co-001/test-flakes` from `claude/build-platform` at e908c21. **Tests only:** no product code, no migration, no ADR, no test-matrix IDs, no screen change. Status: `approval-summaries/lane-b-test-flakes-status.md`.

The rule for every fix (CLAUDE.md; the brief): fix the root, never skip, disable or loosen a test, and keep what each test proves. Each flake was reproduced before its fix and is shown not to fail after it.

## 1. `tools/test/workflows.test.ts`: tests on vitest's five-second default inside the nested run

**What failed.** CI 40519277562, job 122241596089: the simulated Dependabot rewrite (`a simulated Dependabot rewrite`, line 2240) starts a vitest of its own on this file and two others, while the rest of the unit project runs. In that nested run the content-calendar notify test (line 880) timed out at 5 s, so the outer test failed.

**Root cause.** The notify tests run the workflow step's real script against a fake `gh`. One test is about 300 processes: three runs, and per finding `jq` twice, `grep`, and a bash `gh`. Many other tests in the file run step scripts, `git` or a guard wrapper. Their time scales with the runner's load, and the nested run is by design the most loaded place in the suite. The file sets no timeout, so these tests ran on the unit project's 5 s default.

**Measured** (the notify test):
- 0.94 s on an idle 4-CPU container;
- 1.0 to 2.2 s in nine nested runs beside the full unit project;
- 1.79 s in CI's own outer run of that job;
- over 5 s in that job's nested run (the failure).

**Reproduced:** on one CPU shared with eight busy loops (taskset), the notify test took 7.4 s and failed at 5 s. The slowest other test, "checks out the whole history…", took 4.0 s, the next sibling to fail.

**Fix.** Set the file's tests to 30 s (`vi.setConfig({ testTimeout: TEST_TIMEOUT_MS })`), with the measurements in its comment. That is four times the worst measured, and a hang still stops. It is file-wide rather than per test because every test in the file runs again inside the nested run. A per-test list would miss the next test that spawns a process; the sweep found five more spawning ones: the mutation guard's 18 runs (~140 processes), release-capacity notify, and three git-range tests. The Dependabot test keeps its own 300 s. The other two nested files spawn nothing, and their slowest test took under 0.8 s when starved.

**Proof:** the same starved run passes, notify at 7.5 s.

**Rejected:**
- Making the nested run faster (`--maxWorkers=1`, or fewer processes): the processes are the workflow's own script, product code this item does not change. Serialising the nested files does not cut the contention from the outer suite.
- `--testTimeout` passed only to the nested run: it would leave CI's outer run at 2.8× headroom (1.79 s of 5 s).

## 2. `apps/worker/src/price/rerun-rule.property.test.ts`: the coverage check of PRC-25 to PRC-28

**What failed.** Job 122247109398: after 3,000 random sequences, `accept:changed_meanwhile` had been reached 0 times.

**Root cause** (measured, 40 seeds × 3,000 runs): `changed_meanwhile` was reached a median of 4 times per run (0 to 6; zero once in 40), so the check failed about 2% of the time. The `race` step needs two complete re-runs, and in 94% of `race` steps there were fewer than two (4,682 of ~5,000 with none). The arbitrary seldom builds what the §1.6.3 interleaving needs. So the random runs exercised the meanwhile guard, the newest invariant (iii), about 4 times in 3,000.

**Fix (both halves of the brief's option):**
1. **Deterministic coverage.** `EVERY_OUTCOME`, a fixed 32-step sequence, is the property's `examples:` entry and reaches all nine outcomes. In order:
   - two re-runs of a February run raced: accepted, then changed_meanwhile;
   - the original re-run again: not_in_effect;
   - a quarter run re-run while a February first run is queued, then running: newer_run_pending for both the re-run and the acceptance;
   - that re-run accepted once February committed: superseded;
   - a March and an April run begun in order and read in reverse: read, then restarted.

   The example's counts are kept apart from the random ones, by identity (`steps === EVERY_OUTCOME`), and each must reach every outcome, so the check always holds without a seed. Every invariant is checked after every step of the example as of the random runs.
2. **A random arbitrary that reaches the race.** A new `pair` step (weight 2) creates two re-runs of one complete run and prices each, the state a race needs. Measured over 30 seeds × 3,000 runs:

   | Outcome | Before (median, min) | After (median, min) |
   | --- | --- | --- |
   | changed_meanwhile | 4, 0 | 45, 32 |
   | every outcome | — | min ≥ 28 |
   | superseded | 64 | 338 |
   | accepted | 298 | 696 |

   The random-run check stays. Its failure chance is now below 9·e^-28, about 1e-11, so a zero means the steps changed, not chance.

   The third property shares `step`, so it gains the pair too. The second uses `pinnedStep`, unchanged.

**Rejected:**
- A pinned seed alone: it hides the gap.
- Raising the `race` weight: at weights 4 and 8 the median stayed 5 and zeros remained, because the cause is the missing state, not the race's frequency.

## 3. `packages/packets/src/verifier.test.ts`: `fc.pre` against code-shaped numbers

**What failed.** At seed 2019154346, a count of 97140 equal to the pattern's procedure code passed the verifier, which reads every five-digit number as a code (`scan.ts:437`, `mismatches.ts` `case 'code'`). The count was in the input, so it was not flagged.

**Fix.** The precondition leaves out exactly the counts in `facts.codes` as well as `facts.numbers`, the two sets the verifier accepts a bare count against. Day counts and pages are accepted only beside "days" or "page", which the sentence never writes.

**Proof:**
- the seed fails on the base and passes after;
- 200,000 runs with half the counts drawn from the fixture's codes pass.

## 4. The sweep (siblings; a read-only sweep agent, then each candidate checked)

**Fixed here** (each proved by injecting the values the precondition missed: it fails on the base and passes after):
- **`packages/packets/src/verifier.test.ts:428`** ("…written in any other digits"): the same gap as 3, for the six alphabets NFKC reads as ASCII digits. The precondition now also leaves out a code-valued count in a read alphabet. In an unread alphabet the count is `unreadable_figure` whatever its value, so it stays. Rate about 1.4e-5 a run, or 0.1 to 0.2% a CI run.
- **`packages/model-gateway/src/functions/denial-letter.test.ts:65`**: a generated first or last name of "Patient" or "Name" is spelled by its own `[PATIENT_NAME]` placeholder. So the redacted letter still holds it, and the property fails. The product refuses such a letter (`identifier_left`, the test just above). Injection of 22 candidate words (placeholder words, the letter's own words, month names) found exactly these two. Rate about 1.4e-5 a run.
- **The workflows file's other spawning tests:** covered by 1.

**Proposals** (not proven flaky on CI; listed in the status file):
- `tools/stryker/affected.test.ts:601` took 55.9 s of its 120 s on CI (2.1× headroom);
- `apps/worker/src/screening/threads.test.ts:100-112` asserts wall-clock bounds (`took < 3000`, an active count after a 100 ms timer) under load. It sits beside the "Not while #42 is open" screening files, so it is a proposal only;
- process-spawning tests on the 5 s default outside the nested run, each well under it on CI:
  - `tools/engine-freeze/check.test.ts:572`, 557 ms;
  - `tools/golden-worksheet/worksheet.test.ts`, 1.0 s;
  - `tools/check-action-pins/verify.test.ts`;
  - `tools/test/check-releases-immutable.test.ts`, 588 ms max;
  - `tools/test/publish-content.test.ts`;
  - `tools/audit-worksheet`.

  A repository-wide timeout for process-spawning tests (a helper or a project setting) is the general fix.
- Pattern 1's other coverage counters (`packages/pricing/src/properties.test.ts`, `packages/edi835/src/property.test.ts`, `tools/engine-freeze/differential.test.ts`) have margins of e^-20 or better: sound.

## Mutation

`packages/packets` is a money package. Its Stryker shard and the gate run in the fix round: the score must not fall. The change only narrows two preconditions and adds no test removal.
