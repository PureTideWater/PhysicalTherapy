# Challenge: the red push run on 88708069 (FRM-01 S-SEC-2 timed out)

Read-only skeptic pass, 2026-11-02 06:20-06:35 UTC. All GitHub reads went through `gh api` on PureTideWater/PhysicalTherapy.
Nothing was pushed, commented, reviewed, re-run, cancelled or merged. The local probes ran under `/tmp/laneb-heavy.lock`, and
afterwards the working tree was clean (`git status --short` printed nothing).

## Verdict: HOLDS, with corrections

The investigation's four conclusions survive:

- **#90 did not cause it.**
- **The likely cause is the exact-value wait in `shownCount`.**
- **Do not re-run.**
- **Fix the test with a monotonic wait.**

I found no claim that changes the conclusion or the action. I did find one overstatement: the root cause is inferred, not
observed. I also found a few factual errors and some imprecision, listed under "What is wrong or unproven" below.

## What I checked and found true

### Tree identity

- 88708069 has tree `c7d2d26a602dfcf6460a6c69b72d196ae89f302a` and parents 877e662f and cf124313.
- cf124313 has the same tree; its parents are 4e70738d and 877e662f.
- 6d9fdba2 (`refs/pull/90/merge`) has the same tree. Its parents are 877e662f and cf124313, committed 03:03:09Z.
- #90's PR unit log, job 125071379624, fetches `+6d9fdba2…` (line 103), checks out `refs/remotes/pull/90/merge` (line 228)
  and prints `6d9fdba2…` (line 249).
- PR #90: `base.sha` 877e662f, `merged_at` 2026-11-02T03:59:58Z, `merge_commit_sha` 88708069. The task's "~03:52Z" is wrong,
  as the investigation says.

### #90 cannot have touched the failing test

- `git diff --stat 877e662f 88708069` lists 14 files and none under `apps/web`.
- Nothing under `apps/web/src/components` imports `@anthropic-ai/sdk` or the model gateway (grep, no hits).
- #90's new test file, `packages/model-gateway/src/providers/anthropic-client.test.ts`, did not overlap the failure. It
  finished at 04:02:25.76Z after 187 ms. `action-form.browser.test.tsx` had finished 50 s earlier, at 04:01:35.60Z.

### Runs and jobs (`gh api …/runs/{id}` and `…/jobs`)

- **Push run:** ci 41386010790, created 04:00:01Z, run_attempt 1. Its unit job 125086906641 ran 04:00:04-04:04:47Z on
  runner "GitHub Actions 1000007935", Azure centralus, image 20261025.179.1.
- **The failing log**, fetched fresh, is byte-identical to the investigation's copy (`cmp`).
  - Line 1361: "Error: Test timed out in 30000ms."
  - Line 1363: "action-form.browser.test.tsx:366:3".
  - Lines 1374-1377: 1 failed, 415 passed, 7,012 passed, 1 skipped, 249.32 s.
- **`all green`:** job 125089346823 printed "not every job succeeded: unit failure" at 04:08:49Z.
- **Every other job passed:** lint, static, db 1/4 to 4/4, domain model, images, build, and e2e 1/2 and 2/2.
- **The other workflows on 88708069** are green: mutation 41386010949 and screening-capacity 41386010778.
- **PR run:** ci 41380933504, unit job 125071379624, 03:03:13-03:10:19Z, eastus, same image. 416 files passed, 7,013 tests
  passed, 1 skipped, 380.14 s.
- **The `Input/output error` line** on `chrome-headless-shell-linux64/icudtl.dat` (push log line 785) is not an
  infrastructure fault. `tools/ci/browser-build.test.ts` writes a fake `icudtl.dat` (:69, :186), and the same line appears
  in #90's passing PR log and in 61 of the 105 historical logs.

### The runbook rule

- `docs/runbooks/ci.md:150-151`, read verbatim: "Re-run failed jobs only for an infrastructure failure … never for a test
  that failed: a test that passes on a re-run is a flaky test, and is fixed."
- The section ("Reading a red gate", :78) is about any run's `all green` job, not only pull requests.
- :145-146 says the same for e2e.
- LANES.md:222 on claude/build-ops is the one standing exception, and it covers the screening e2e flake only.
- No workflow reads the push run's result. I grepped `.github/workflows/*.yml` and `tools/release` for `workflow_run`,
  `check-runs`, `actions/runs` and `conclusion`.

### Configuration and code

- **vitest:** the unit project sets no `testTimeout` (`vitest.config.ts:76-84`; db sets 30 s at :93), so the describe's
  `{ timeout: 30_000 }` (action-form.browser.test.tsx:133) applies. No `retry` is configured.
- **vitest 5.0.5's `withTimeout`** (`vitest/dist/chunks/run.BPv-BBRv.js`) settles once and ignores a later rejection. The
  abandoned Playwright wait therefore leaves no trace in the log, which is consistent with what the log shows.
- **Playwright 1.64.1:**
  - `retryWithProgressAndBackoff` uses `[20, 50, 100, 100, 500]` (coreBundle.js:25279-25285).
  - `retryWithProgressAndTimeouts` prepends 0 and sleeps between attempts (:25287-25297).
  - `waitForSelector` polls from Node (:25015-25070).
  - The investigation quotes all of these correctly.
- **The harness and product code it cites match the tree:**
  - forms-harness.tsx:368-377 (refresh after 20 ms) and :386-398 (the `data-shown` MutationObserver);
  - form-issues.tsx:307-316 (`usePersonChange`), :332-361 (`useClearedForAnotherPerson`) and :549-551 (the
    `cleared:`/`response:` key);
  - action-form.tsx:241-254 (`RefreshAfterRefusal`).
- **The stale-then-cleared sequence is deterministic in the product:**
  - `touched` is set by the test's `fill`, and the stale state is refused anyway, so `setCleared` always runs on the
    person change.
  - Only the exact wait is timing-dependent.

### History

- I independently listed every ci run created since 2026-10-27T00:00Z (75 runs, `challenge/ci-runs-all.tsv`).
- Since the test first ran (2026-10-28 01:31Z), every run is in the investigation's table except one that was still in
  progress when it was built (next section).
- Only ci.yml's `unit` job runs `pnpm test` (ci.yml:291); no other workflow runs the unit project.
- Over the 105 logs:
  - this run is the only failure of any test in `action-form.browser.test.tsx` or `step-timer.browser.test.tsx`;
  - the only other "Test timed out" lines are csv-arena (job 125058323085) and workflows.test.ts (job 122241596089).
- Passing times recomputed: 520-1,354 ms, median 832.5 ms, p90 994 ms.
- build-ops (now at a42fcab7, 06:20:45Z) has no earlier record of this test failing.

### Runner comparison

`scripts/compare.py` reproduces the numbers:

- the sum of per-file times is 456,096 ms on the push runner against 683,344 ms on the PR runner (ratio 0.67);
- 13 of 416 files were slower on push;
- the median per-test ratio is 0.67;
- the only test more than 3x slower is FRM-01 S-SEC-2.

### Independent reproduction

My own probe (`challenge/probe.ts`, 06:26-06:31Z) uses the real harness, the test's own setup (zip, why, reason), and the
exact selector the helper uses.

**Counter already past N** (cleared summary present, `data-shown="2"`), then wait for "1":

| Wait | Result |
|---|---|
| Exact | missed 3/3 at the 2,000 ms timeout |
| `>= 1` (waitForFunction) | seen 3/3 in 3-4 ms |

This does not depend on poll timing (`challenge/probe-past.json`).

**Stale answer held, released D ms after a page-side mark taken just before the wait**, 5 tries each
(`challenge/probe-hold.json`):

| Delay (ms) | Exact wait missed | `>=` wait missed |
|---|---|---|
| 25 | 4/5 | 0/5 |
| 35 | 5/5 | 0/5 |
| 60 | 1/5 | 0/5 |
| 90 | 5/5 | 0/5 |
| 120 | 5/5 | 0/5 |

Every page ended at `data-shown="2"` with the cleared summary, and `errors()` stayed empty.

**The test's own path, unforced, 150 times** (`challenge/probe-natural.json`):

- 0 misses.
- "1" was committed between -15 and +19 ms of the wait's start (median 0 ms).
- "1" lasted 32-60 ms (median 36 ms).
- Together with the investigation's 1/180, that is **1 local miss in 330 runs.**

## What is wrong or unproven

1. **The root cause is inferred, not observed (overstated in §6(b): "That happened here").**
   - The CI log gives only vitest's timeout at the `it` line (:366:3). It shows no frame from the hanging await.
   - Every await in the test (:367-391) is a Playwright call whose library default is 30 s. vitest's 30 s timer starts
     first, so a hang at any of them gives the identical log.
     - That includes `harness.open`, the fills, the click, `shownCount(1)` at :373, the cleared wait at :374 and
       `shownCount(3)` at :386.
   - The "product healthy" evidence is narrower than stated. `harness.errors()` collects only `pageerror`, meaning uncaught
     exceptions (test-support/browser.ts:81). A render error caught by the harness's error boundary would leave no cleared
     summary, hang at :374, and still pass the afterAll check.
   - What keeps the exact-wait race the most likely cause:
     - it is the only timing-dependent path I can find in the test;
     - the product path is deterministic (`touched`, then `setCleared`);
     - 330 local natural runs and every forced run ended at the cleared summary with no page error;
     - the same image, region and tree passed it minutes later (item 3).
   - Say "most likely; consistent with every artifact; not directly observed". Fix item 2 (explicit wait timeouts) is what
     would make a repeat identify itself.

2. **When the timeout fired.** 04:01:35.60Z is when vitest printed the file, not when the test timed out.
   - The file ran for 54,765 ms, so it started at about 04:00:40.84Z.
   - The 37 test times sum to 54,297 ms, leaving 468 ms of hooks.
   - The 9 tests before S-SEC-2 sum to 7,189 ms.
   - So S-SEC-2 started at about 04:00:48.0-48.5Z, and the timeout fired at about **04:01:18.0-18.5Z**.
   - Also, "the other 36 tests took 24.8 s" includes the 468 ms of hooks; the tests alone took 24.29 s.

3. **The history count is now 49 executions: 48 passed, 1 timed out.**
   - The investigation's 100-run list includes ci 41386954467 (PR #97, Dependabot minor-and-patch, created 04:10:16Z).
     Its unit job had not finished, so it is missing from `unit-history.tsv`.
   - That job, 125089786345, ran 04:10:18-04:17:17Z. Like the failing job, it ran in centralus on image 20261025.179.1.
     S-SEC-2 passed in 918 ms.
   - The image count for 20261025.179.1 becomes 38 runs with 1 timeout.
   - This strengthens "not the runner".

4. **The poll times are later than "0, 20, 70, 170, 270".**
   - The backoff values are sleeps between attempts, and every attempt adds its own round trips. My held-answer runs put
     the third poll about 95-105 ms after the mark, not about 70.
     - At 35 ms delay, "1" was present 48-58 ms to 83-103 ms and was still missed 5/5.
     - At 60 ms delay, "1" was present 75-81 ms to 111-128 ms and was seen 4/5.
   - The mechanism is unchanged. The bands just sit later than the investigation's table labels them.
   - One consequence:
     - The first gap (about 20-30 ms) is shorter than the shortest "1" window measured (32 ms), so a miss needs "1" to
       commit after the second poll.
     - Locally "1" commits within +19 ms of the wait's start, so the CI miss needed the commit delayed by tens of ms
       relative to the wait.
     - The runner's aggregate 0.67 ratio cannot rule out such a momentary scheduling stall, so "This is not CPU
       starvation" is unproven.
     - The accurate framing is that jitter is the trigger and the exact wait is the defect. Neither the conclusion nor the
       fix changes.

5. **"About 2%" overstates the rate.**
   - 1/49 on CI has a 95% interval of roughly 0.05-11%.
   - Local evidence is 1/330, about 0.3%.
   - Say "about 0.3-2% per unit job".

6. **Who re-ran 41376674140 is unknown.**
   - Confirmed:
     - attempt 1 failed only csv-arena's 5 s timeout (job 125058323085, 02:24:34Z);
     - attempt 2 started at 02:31:55Z, with actor and triggering_actor PureTideWater, and succeeded;
     - nothing on build-ops records the re-run.
   - But PureTideWater is also the account the sessions act through (it authored merge 88708069). The API cannot show
     whether a person or a session pressed re-run.
   - "A departure" is right only if a session did it. Either way it is unrecorded and not a precedent.

## Is the recommended action right?

**Yes.**

### Do not re-run job 125086906641

- It is a test failure, and ci.md:150-151 allows a re-run only for an infrastructure failure.
- A green attempt 2 would not show which await hung.
- Nothing reads the push run.

### Recording and the fix item: already adopted

- The orchestrator recorded the flake on claude/build-ops at 1c191a73 (06:18:12Z).
- It ruled the fix as PR D, `co-001/test-flakes-2`, in bfb5bb60 (ruling 06:22Z, written to
  `approval-summaries/lane-b-dependabot-batch-status.md:45`).

### Refinements for PR D's design

1. **Make the regression case independent of poll timing.**
   - The proposed "hold, release about 30 ms after the wait starts" depends on where the polls fall:
     - my runs at 25 ms missed 4/5 and at 60 ms missed 1/5;
     - on CI's timing an exact helper could pass it, so it would not guard reliably.
   - Use the "already past" shape instead:
     1. Drive S-SEC-2 to the cleared summary (`data-shown="2"`).
     2. Then call `shownCount(page, 1)` with a short timeout and expect it to return.
   - An exact helper fails it every time (3/3); a monotonic one passes in milliseconds.

2. **`waitForFunction` is safe under `page.clock`, which the step-timer copy needs.**
   - Playwright 1.64.1 polls it with `injected.utils.builtins.requestAnimationFrame` (coreBundle.js
     `waitForFunctionExpression`, :25672 onward), not the page's faked one.
   - step-timer's tests install the clock.

3. **Keep exactness where it means something, at a settled point.**
   - For example, after :374, `expect(await shown(page)).toBe(2)`.
   - FRM-04's "inserts the alert twice" test (:648-662) counts its own insertions, so `>=` loses no coverage there.

4. **Explicit timeouts.**
   - A per-wait 10 s timeout in the test-file helpers avoids touching `test-support/browser.ts`.
   - packet-day-counts' fix round is already resolving a conflict in that file against 88708069 (build-ops b311b77b).
   - A harness-wide `page.setDefaultTimeout` in `harness.open` (browser.ts:79-87) would be broader, but needs coordinating
     with that round.

5. **The sibling sweep.**
   - Only the two `shownCount` copies use an exact-attribute `waitForSelector`:
     - action-form.browser.test.tsx:59;
     - step-timer.browser.test.tsx:128.
   - `step-timer.browser.test.tsx:170` waits `harnessRestarts === 1`: exact, on a counter, polled in the page by
     requestAnimationFrame. The value is meant to stay 1 (asserted at :175), so it is not transient. An explicit timeout is
     enough there.

## Evidence

All paths are under /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red:

- **This report:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge.md
- **Independent probe:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/probe.ts
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/probe-past.json
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/probe-hold.json
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/probe-natural.json
- **Every ci run since 2026-10-27:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/ci-runs-all.tsv
- **The 49th execution's unit log (job 125089786345):**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/unit-125089786345.log
- **The failing unit log, refetched:**
  - /tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/push-red/challenge/push-unit.log
