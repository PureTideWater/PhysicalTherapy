# The red push run on 88708069: FRM-01 S-SEC-2 timed out

Read-only investigation, 2026-11-02 ~04:15-04:45 UTC. Nothing was pushed, commented, reviewed, re-run, cancelled or merged.
All GitHub reads were through `gh api` on PureTideWater/PhysicalTherapy.

## Verdict

- **#90 did not cause it.** The tree that failed is byte-identical to the tree that passed on #90's PR CI.
- **The test races Playwright's polling. Neither the product nor the runner is at fault.**
  - The helper `shownCount` (`action-form.browser.test.tsx:58-60`) waits for an exact value, `body[data-shown="1"]`.
  - In this test, the code under test changes that value from 1 to 2 about 35-50 ms later, on purpose.
  - Playwright 1.64.1 polls `waitForSelector` at about 0, 20, 70, 170 and 270 ms, then every 500 ms.
  - When no poll lands inside that window, the wait can never succeed, and vitest's 30 s timeout ends the test.
- **I reproduced it on the same tree:**
  - deterministically, in fixed delay bands, with a monotonic wait as the control;
  - unforced, once in 180 runs of the test's own path.
  - The CI history shows 1 timeout in 48 executions.
- **Do not re-run.** The rule (`docs/runbooks/ci.md:150-151`) allows a re-run only for an infrastructure failure. This is a test that failed.
- **Fix the test instead.** Make the wait monotonic (">= N") in a small tests-only item.

## 1. Tree identity

| Commit | What it is | Tree |
|---|---|---|
| `88708069eabb` | The merge of #90 into claude/build-platform. Parents 877e662f and cf124313. Committed 03:59:57Z; `merged_at` 2026-11-02T03:59:58Z, not ~03:52Z as the task says. | `c7d2d26a602dfcf6460a6c69b72d196ae89f302a` |
| `cf124313d0e0` | #90's head, itself a merge of claude/build-platform 877e662f into the branch | `c7d2d26a602dfcf6460a6c69b72d196ae89f302a` |
| `6d9fdba2ba1d` | `refs/pull/90/merge`, which #90's PR CI checked out. Parents 877e662f and cf124313, 03:03:09Z. See the unit log 125071379624, lines 103, 228 and 249. | `c7d2d26a602dfcf6460a6c69b72d196ae89f302a` |

The three trees are identical, and the base (877e662f) did not move between the PR run and the merge. So the push run tested exactly the code that passed:

- **#90's PR CI:** ci 41380933504; unit job 125071379624, 03:03:13 to 03:10:19Z. 416 files, 7,013 passed, 1 skipped, 380.14 s.
- **The push run:** ci 41386010790, created 04:00:01Z; unit job 125086906641, 04:00:04 to 04:04:47Z.
  - The failure was printed at 04:01:35Z and summarized at 04:04:44Z: 1 failed, 415 files passed, 7,012 tests passed, 1 skipped, 249.32 s.
  - `all green` (job 125089346823, 04:08:48 to 04:08:51Z) failed with "not every job succeeded: unit failure".
  - Every other job passed.
- **The other workflows on 88708069** are green: mutation 41386010949 and screening-capacity 41386010778.

## 2. The test's history on CI

**Scope.** I read the unit job log of each of the 100 most recent ci runs: push and pull_request, 2026-10-26 10:14Z to 2026-11-02 04:10Z. That is 105 unit jobs, re-run attempts included.

- The test was added by 3b94e23a ("Forms: the review fix round", 2026-10-27 20:52Z).
- It first ran on CI at 2026-10-28 01:31Z (ux-forms PR run 40615556559).
- It has been on claude/build-platform since push run 40624946717 (2026-10-28 03:08Z).
- This window therefore covers every ci execution of the test.

**Results.**
- **48 executions: 47 passed and 1 timed out** (this run). There are no earlier failures of this test, of any test in `action-form.browser.test.tsx`, or of `step-timer.browser.test.tsx`.
- **Passing times** (vitest prints each test's ms): 520 to 1,354 ms, median 834 ms, p90 about 1,000 ms. This run: 30,003 ms.
- **By runner image:**
  - ubuntu-26.04 20261012.163.1: 11 runs, 0 timeouts.
  - 20261025.179.1: 37 runs, 1 timeout.
- **By region:** the failing job ran in centralus. The test passed in centralus many times, including 41376674140 attempt 2, 41375865521 and 41352821139.
- **Other "Test timed out" lines in the 105 logs.** Neither is a browser test:
  - `apps/worker/src/report/csv-arena.test.ts` at 5 s: push run 41376674140 attempt 1, job 125058323085, 02:24:34Z.
  - `tools/test/workflows.test.ts` at 5 s: 40519277562 attempt 1, job 122241596089, 2026-10-27 14:19Z. #76 since fixed it.

Per-run table: `unit-history.tsv` (path at the end).

**Flake records.** I searched these for FRM-01, action-form, S-SEC-2, "timed out" and "flak":

- claude/build-ops at e9ad7bec (04:19:32Z): LANES.md, lanes/ and approval-summaries/.
- `docs/runbooks/ci.md` on 88708069.

None records this test. Related records:
- LANES.md:195: three flaky unit tests, fixed tests-only by #76 (085299b).
- LANES.md:215-222 and lanes/lane-b.md:552-554: the screening e2e flake and its one recorded re-run.
- LANES.md:325: the load.db flake.

## 3. The test and the mechanism

### What the test does

The test is `apps/web/src/components/action-form.browser.test.tsx:366-391`.

1. It opens the `keep` form and types.
2. At :372 it scripts the refresh to render a new key and another person (`onRefresh`, :68-72).
3. At :373 it presses Save and is refused as out of date: `refusedWith(STALE)` calls `send` (:86-91), which calls `shownCount(before + 1)`. That is `waitForSelector('body[data-shown="1"]', { state: 'attached' })` with no timeout of its own (:58-60).
4. At :374 it waits for the cleared summary, then asserts.
5. At :386 it presses again and waits for `data-shown="3"`.

### Why "1" is transient in this test only

1. The stale refusal commits. Its summary is inserted (`RefusalSummary` keyed `response:<seq>`, `form-issues.tsx:549-551`). The harness's MutationObserver counts the insertion and sets `data-shown="1"` (`test-support/forms-harness.tsx:386-398`).
2. `RefreshAfterRefusal`'s effect calls `router.refresh()` (`action-form.tsx:241-254`).
3. The harness router answers 20 ms later: `setTimeout(() => renderKeys(next), 20)` (`forms-harness.tsx:368-377`).
4. The page re-renders for person B. `usePersonChange` (a layout effect, `form-issues.tsx:308-316`) fires `useClearedForAnotherPerson` (`form-issues.tsx:332-361`).
5. The summary is re-keyed `cleared:1`, so a new node is inserted and `data-shown` becomes "2".

So "1" lasts only about 35-50 ms: 36 ms median locally, 32-57 ms across 180 runs.

Only this test has that shape. A test can see `data-shown` change twice like this only when the harness router changes the person and the wait is exact:
- The sibling at :347 refreshes the key only; no new summary is inserted.
- :393 and :434 rerender from the test, and the export case at :444 waits on text, not on a count.

### Why a missed "1" means a 30 s hang

- Playwright 1.64.1 (the pinned `@playwright/test`, `apps/web/package.json:48`) polls `waitForSelector` from the Node side:
  - `retryWithProgressAndBackoff` uses `backoffScale = [20, 50, 100, 100, 500]` (`playwright-core/lib/coreBundle.js:25280`), and `retryWithProgressAndTimeouts` prepends 0 (:25287-25290).
  - So it checks at about 0, 20, 70, 170 and 270 ms, then every 500 ms (`waitForSelector` at :25015-25070).
- If the stale summary commits just after one poll and the cleared summary commits before the next, the selector never matches again. `data-shown` stays "2".
- Two 30 s timeouts then race:
  - Playwright's library default for `waitForSelector`, which the harness does not set.
  - vitest's test timeout: the describe's `{ timeout: 30_000 }` (:133). The unit project sets no `testTimeout` (`vitest.config.ts:76-84`), so the describe's value applies.
- vitest's timeout started earlier, at the test's start, so it fires first. That is why the log names only the `it` line (:366:3) and not the wait.
- Other evidence that the browser and the product were healthy:
  - The 27 tests that followed in the same Chromium passed in normal time.
  - The log shows no failed hook or unhandled error, so the afterAll check `expect(harness.errors()).toEqual([])` passed: no page errors.

### Browser setup

`test-support/browser.ts:48-95`: one Vite server and one `chromium.launch` per file, in `beforeAll` (60 s, :134-136). Each test gets `browser.newPage` (a new context) in that browser (:80).

### Reproduction

I ran these on 88708069's tree, locally, through the real harness (`startHarness`), on Chromium 1248, under the heavy lock. The script is `scripts/repro.ts`. It changes no repository file; the working tree is clean afterwards.

**The test file once:** 37/37 passed; S-SEC-2 took 691 ms.

**The test's own path, unforced** (`refuse: STALE`, then the exact wait), 180 times:
- **1 miss**, at iteration 141 of the 150-run batch. "1" was present for 42 ms; the wait saw 0 and then 2.
- The window measured 32-57 ms.

**The answer held, then released D ms after the wait starts** (`{ hold: STALE }`), 3 tries per delay:

| Delay (ms) | Exact wait (`data-shown="1"`) | Monotonic wait (`>= 1`) |
|---|---|---|
| 0, 10 | seen 3/3 | seen 3/3 |
| 20, 30, 40 | **missed 3/3** | seen 3/3 |
| 50, 60 | seen 3/3 (the ~70 ms poll lands in the window) | seen 3/3 |
| 80, 100, 130 | **missed 3/3** | seen 3/3 |
| 160 | seen 3/3 (the ~170 ms poll) | seen 3/3 |
| 200 | **missed 3/3** | seen 3/3 |

In every run the page ended correctly, at `data-shown="2"` with the cleared summary. The product behaves; only the exact wait fails, in exactly the bands between Playwright's polls.

## 4. The runner

| | Push unit 125086906641 (failed) | PR #90 unit 125071379624 (passed) |
|---|---|---|
| Labels / group | `ubuntu-26.04`, GitHub-hosted, "GitHub Actions 1000007935" | `ubuntu-26.04`, "GitHub Actions 1000007908" |
| Image | ubuntu-26.04 20261025.179.1 (Ubuntu 26.04.1), provisioner 20261021.618 | same |
| Region | Azure centralus | Azure eastus |
| Job wall time | 4 m 43 s | 7 m 06 s |
| vitest duration | 249.32 s | 380.14 s |
| Sum of the 416 per-file times | 456.1 s (ratio 0.67) | 683.3 s |
| `action-form.browser.test.tsx` | 54,765 ms, including the 30,003 ms timeout, so the other 36 tests took 24.8 s | 37,412 ms (S-SEC-2 1,021 ms) |

**The push runner was not slow. It was about 1.5 times faster:**
- 403 of the 416 files ran faster on it.
- Across the 197 slow tests printed in both logs, the median push/PR ratio is 0.67.
- The only test more than 3 times slower is the failing one.

This is not CPU starvation. The race depends on where the commit lands relative to Playwright's polls, and any runner can hit it at any speed.

## 5. The rule

`docs/runbooks/ci.md:150-152` ("Reading a red gate", step 3, Re-running):

> "Re-run failed jobs only for an infrastructure failure (a runner lost, a download refused, a service that did not start), never for a test that failed: a test that passes on a re-run is a flaky test, and is fixed."

The e2e item at :145-146 says the same: "fix it, never re-run it to green".

- **This failure does not qualify.** It is a test that failed: its own wait timed out. The runner was healthy and every service started.
- **Who may re-run:** the runbook says when, not who. For this failure no one may re-run under it: not the session that merged #90, and not the orchestrator.
- **Exceptions:** an exception to ci.md is a ruling, made and recorded by the orchestrator or a person (the founder). LANES.md:222 was one, limited to one named flake: "one re-run of the failed job, and never merges red".
- **A departure to flag:** push run 41376674140 on 4eaf7124 was re-run.
  - Attempt 2 started at 02:31:55Z, triggering actor PureTideWater, after csv-arena's 5 s timeout, which is a test failure.
  - I found no record of it on claude/build-ops.
  - It departs from ci.md:150-151; it is not a precedent to follow.

## 6. Conclusions

**(a) Caused by #90? No.** The evidence:

- The failing tree is identical to the tree #90's PR CI passed (`c7d2d26a…`, §1).
- #90's diff (877e662f..88708069) touches no file under apps/web.
  - Its lockfile change is only `@anthropic-ai/sdk` 0.131.0 to 1.3.0 and `@opentelemetry/api` 1.9.1, both in the model gateway's importer.
  - Nothing under `apps/web/src/components` imports the SDK or the model gateway.
- The race is reproduced on this tree with no reference to #90's code (§3).

**(b) Root cause.** FRM-01 S-SEC-2 (`action-form.browser.test.tsx:366`) waits through `shownCount` (:58-60) for `data-shown` to equal exactly `before + 1`:

1. The stale refusal's summary sets `data-shown` to 1.
2. About 20 ms later, the harness router's refresh (`forms-harness.tsx:368-377`) renders the page for another person.
3. `useClearedForAnotherPerson` then inserts a new, re-keyed "Form cleared" summary, so `data-shown` reaches 2 within about 35-50 ms of reaching 1.
4. Playwright 1.64.1's `waitForSelector` polls at about 0, 20, 70, 170 and 270 ms, then every 500 ms.
5. When the stale summary commits in a gap between polls and the cleared one commits before the next poll, the exact selector is never true again.
6. The wait then hangs until vitest's 30 s test timeout. That happened here, at 04:01:35Z in job 125086906641.

Neither the product nor the runner nor #90 is at fault. The test's wait depends on the phase of Playwright's polls, and it has failed about once in 50 to 180 runs (CI 1/48, local 1/180).

**(c) Recommended action now: do not re-run job 125086906641.**

Why:
- It does not qualify under `docs/runbooks/ci.md:150-151`.
- A green attempt 2 would add no information: the tree already passed on 6d9fdba2, and the cause is reproduced.
- A re-run would make the tip look green while a known flake stays in the suite, which the runbook forbids.
- Nothing is blocked. The ruleset's required checks gate pull requests, and nothing in release.yml, release-dry-run.yml or publish-content.yml reads the push run. The next merge to claude/build-platform starts a new push run; ideally that merge is the fix's own.

Instead:
1. **The orchestrator records the flake** on claude/build-ops (lanes/lane-b.md, with a LANES.md line if it wants): ci 41386010790, job 125086906641, this root cause, and the evidence paths below.
2. **Treat the fix as urgent.** Until it merges, any pull request's `unit` job can fail this test at about 2%.
3. **An interim exception is the orchestrator's call.** If it wants one, it should be a recorded ruling in the LANES.md:222 form: one re-run of a `unit` job that fails only this test, never merging red. The same applies if the orchestrator or the founder wants this tip green before the fix lands: they rule and record it. Then the session that merged #90 makes exactly one re-run of the failed jobs (`unit`, then `all green`), never a second.

**(d) Durable fix (a proposal).** A tests-only Lane B item, like #76 (`co-001/test-flakes`), for example `co-001/test-flake-shown-count`.

It is not part of dependabot-batch. It needs no ADR, no test-matrix ID, no migration and no product change.

1. **Make the wait monotonic.** In `apps/web/src/components/action-form.browser.test.tsx:57-60`, and in its copy at `apps/web/src/components/step-timer.browser.test.tsx:126-129`, replace the exact selector with:
   ```ts
   page.waitForFunction((n) => Number(document.body.dataset.shown ?? '0') >= n, count, { timeout: 10_000 })
   ```
   - This matches the helper's own doc comment ("has shown `count` responses").
   - S-SEC-2 already waits for the cleared summary next (:374). `send` reads `before` after that, so the later `+1` waits are unchanged.
   - Keep the harness's 20 ms refresh delay. It models the server's round trip, and the test should not depend on it.
2. **Give harness waits explicit timeouts under the test's 30 s** (for example 10 s). A future miss would then fail with Playwright's message, naming the selector and what it saw, instead of an anonymous "Test timed out" at the `it` line.
3. **Add one deterministic regression case.** Take the S-SEC-2 path with `{ hold: STALE }`, released about 30 ms after the wait starts.
   - The current helper misses it 3/3; the fixed helper sees it.
   - This keeps the race from coming back through a new helper.
4. **Sweep the siblings, as #76 did.** Find every exact-value `waitForSelector` on a counter or transient attribute in `apps/web/src/**/*.browser.test.tsx` and `apps/web/e2e/**`. Today only `shownCount` (both copies) has this shape. The other `shownCount` calls (:202, :488, :537, :694, :894, :933, and step-timer :335 and :345) have no automatic second insertion yet, but they share the helper.
5. **Gates:** the usual reviews, the full unit suite, and the fixed file run repeatedly (for example 200 runs of S-SEC-2's path). Then merge the fix on green PR checks; its push run is the tip's green record.

## Evidence (all under /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red)

- **Unit logs of the two runs:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/logs/push-unit-125086906641.log
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/logs/pr90-unit-125071379624.log
- **`all green`:** /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/logs/allgreen-125089346823.log
- **History:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/ci-runs.tsv
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/unit-jobs.tsv
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/unit-history.tsv
  - The 105 logs are in /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/logs/hist
- **Timing comparison:** /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/scripts/compare.py
- **Reproduction:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/scripts/repro.ts
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/repro-sweep.json
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/repro-natural.json
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/repro-natural150.json
