# Design: PR D, `co-001/test-flakes-2` (two flaky unit tests, tests only)

Written 2026-11-04 by the acting Lane B session S4 (https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu), from the
orchestrator's ruling of 2026-11-02 06:22 UTC (`approval-summaries/lane-b-dependabot-batch-status.md`). Inputs:
`designs/lane-b-dependabot-batch/test-flakes-2-investigation.md` and `-challenge.md` (HOLDS with corrections), both read
whole. Worktree `/home/user/test-flakes-2`, fast-forwarded 88708069 -> **21fa10df** (#91), installed frozen.

Scope: tests only. No product code, no dependency, no harness file (`test-support/browser.ts` and `forms-harness.tsx` stay
untouched), no new test-matrix ID, no ADR, no migration.

## 1. The two flakes

| | FRM-01 S-SEC-2 | CAS-41.3 "holds the rows' bytes…" |
|---|---|---|
| Test | `apps/web/src/components/action-form.browser.test.tsx:366` | `apps/worker/src/report/csv-arena.test.ts:151` |
| Failure | push ci 41386010790, unit job 125086906641: "Test timed out in 30000ms" | push ci 41376674140 attempt 1, unit job 125058323085: timed out at the 5 s default, reported 5,404 ms |
| CI history | 1 timeout in 49 executions; passing 520-1,354 ms | see section 2: passing 1,815-4,350 ms, every run |

## 2. Root causes (inferred vs observed)

### FRM-01: an exact wait on a counter that moves on (most likely; not directly observed)

- `shownCount` (:57-60) waits for `body[data-shown="N"]` exactly. In S-SEC-2 the stale refusal sets `data-shown` to 1; the
  harness router's refresh (20 ms) renders another person and `useClearedForAnotherPerson` inserts the re-keyed cleared
  summary, so the count is 2 within about 32-60 ms. If "1" commits after one Playwright poll and is gone before the next,
  the exact selector is never true again; the wait hangs until vitest's 30 s test timeout.
- **Observed:** only vitest's timeout at the `it` line (:366:3). The log carries no frame from the hanging await.
- **Inferred (the challenge's correction):** that the await that hung is `shownCount(1)` at :373. Every await in the test
  has Playwright's 30 s default, so any of them would print the same log. What keeps this the most likely cause: it is the
  only timing-dependent path in the test; the product sequence (fill sets `touched`, then `setCleared`) is deterministic;
  both forced reproductions miss with the exact wait and never with `>=` (investigation 3/3 per band; challenge "already
  past" 3/3 missed vs 3/3 seen in 3-4 ms); 330 natural local runs give 1 miss; the same tree and image passed minutes later.
- **Trigger vs defect:** scheduling jitter on the runner is the trigger (locally "1" commits within +19 ms of the wait's
  start, so the CI miss needed a delay of tens of ms); the exact wait is the defect. "Not CPU starvation" is unproven.
- **Rate:** about 0.3-2% per unit job (CI 1/49, 95% interval ~0.05-11%; local 1/330).
- The explicit wait timeout below (10 s, under the test's 30 s) makes a repeat name its own selector.

### CAS-41.3: the assertion, not the code under test, takes the time (observed locally; CI share inferred)

Measured, not assumed:

- **CI, 13 passing unit jobs** (2026-11-02 02:31-10:39Z, the last 12 ci runs plus 41376674140 attempt 2; logs in the
  scratchpad, `ci/unit-*.log`): :151 took **1,815-4,350 ms, median 3,345 ms**. The failing attempt: **5,404 ms** (timeout).
  The property test beside it (:103) took 1,279-2,573 ms, and **3,321 ms** on the failing run. The file: 3.1-7.0 s.
  So :151 runs at 36-87% of its 5 s budget on every CI run; #92's merge run was load at the tail, not an outlier event.
- **Locally, 20 runs** of the file (`pnpm exec vitest run --project unit … --reporter=json`, under the lock, 4 CPUs): :151
  **1,088-1,924 ms, median 1,206 ms**; :103 median 884 ms, max 1,136; all 120 test results passed.
- **Profile** (a scratch copy of :151's body, 5 runs): appending 2,000 rows 12-14 ms, auditCsv 7-9 ms, streaming 4 ms, the
  expected buffer 8-12 ms, then `expect(got).toEqual(want)` on the 470,274-byte Buffers **1,038-1,245 ms (~95%)**.
  `got.equals(want)` 0-1 ms; `expect(got.toString('latin1')).toBe(want.toString('latin1'))` 1 ms; the same on a buffer with
  one byte flipped fails in 4 ms with a 118-character message. vitest's `toEqual` walks a Buffer element by element.
- **Observed:** the time on CI; the toEqual share locally. **Inferred:** that the same share holds on CI (CI/local ratio
  1.5-3.6x for the whole test, consistent with one slow comparison scaling with load).

**A timeout is not the right fix.** It would keep 1-4 s of comparison per run and only move the cliff, and a timeout sized
4x the CI max (4,350 -> 20 s) would hide a real regression in the arena for 20 s. The test should change: compare the bytes
in a form that costs milliseconds and still compares every byte. After the change (section 3c, scratch copy, 10 runs):
**:151 30-53 ms, :103 84-153 ms**, the other four 0-4 ms. At CI's worst ratio (3.6x) that is under 200 ms, ~25x headroom
under the 5 s default, so no explicit timeout is added (the repo's sized timeouts, 30_000-600_000, are for tests whose work is
genuinely long: browsers, databases, spawned builds; none for an in-memory unit test).

## 3. The exact changes

### 3a. `apps/web/src/components/action-form.browser.test.tsx`

`shownCount` (:57-60) becomes monotonic, with an explicit timeout:

```ts
/**
 * Waits until the page's forms have shown at least `count` responses. At least, never exactly: the count can move past
 * `count` between two of Playwright's polls (S-SEC-2's stale summary, 1, is replaced by the cleared one, 2, within ~50 ms),
 * and an exact wait would then never end. A test that needs exactly `count` asserts shown() once the page has settled.
 */
async function shownCount(page: Page, count: number): Promise<void> {
  await page.waitForFunction((n) => Number(document.body.dataset.shown ?? '0') >= n, count, { timeout: 10_000 });
}
```

The name stays (no call-site churn); its doc states the new semantics. 10 s sits under the describe's 30 s, so a miss fails
with Playwright's message naming the predicate, not an anonymous "Test timed out".

Every call site, and why `>=` is right there:

| Site | Waits for | Why monotonic is right | Exactness kept |
|---|---|---|---|
| `send` :87-91 (every `send`/`refusedWith`: :96, :218, :239, :256, :310, :417, and all FRM-01..05 refusals) | `before + 1`, `before` read after the previous response settled | "the press's response arrived"; in S-SEC-2 the count may already be `before + 2` when the wait starts | not in the helper (S-SEC-2 legitimately passes through +1 to +2); where it matters, in the test (below) |
| :202 FRM-01 submitters | 1, the page's first response | first response; the test asserts the call's entries | no claim on the count |
| S-SEC-2 :373 (via `refusedWith`) | 1 | the defect's site: 1 is transient by design | **add** `expect(await shown(page)).toBe(2)` after the cleared wait (:374): stale summary plus cleared one, settled |
| S-SEC-2 :386 (via `refusedWith`) | 3 | the invalid refusal's summary | **add** `expect(await shown(page)).toBe(3)` after the 'Not done' title check |
| :488 FRM-01/FRM-03 version form | 3, the model's held answer | "each answer is a new summary": >= 3 proves the new insertion | **add** `expect(await shown(page)).toBe(3)` after the description check (settled: it is the last answer) |
| :537 pending status | 1, a held answer released | first response | no claim on the count |
| :694 FRM-05 header | 1 | first response; asserts focus | no claim on the count |
| :894 re-run button | 1, a held answer released | first response | no claim on the count |
| :933 split form | 1 | first response; asserts the call | no claim on the count |

FRM-04 "inserts the alert twice" (:648-662) counts its own insertions with its own observer, so it loses nothing.

### 3b. `apps/web/src/components/step-timer.browser.test.tsx` (the same helper's copy)

`shownCount` (:126-129) gets the identical body and doc. Call sites :335 and :345 (SGN-02) wait for a page's first
response (1); monotonic is right and no count is claimed. `waitForFunction` is safe under the `page.clock` these tests
install: Playwright 1.64.1 polls it with the injected script's builtin `requestAnimationFrame`, not the page's faked one
(challenge refinement 2). This is the same defect in a sibling, the sweep's only other hit; the ruling names FRM-01, and the
copy is changed with it so the race cannot come back through it (as #76 swept its siblings). It carries no ID change.

### 3c. `apps/worker/src/report/csv-arena.test.ts`

One helper beside `streamed`/`expected` (:46-50):

```ts
/**
 * The bytes equal, byte for byte, compared as latin1 text: one code unit per byte, so the strings are equal exactly when the
 * bytes are. vitest's toEqual walks a Buffer element by element, over a second for :151's 470 KB; this takes a millisecond.
 */
function sameBytes(actual: Buffer, wanted: Buffer): void {
  expect(actual.toString('latin1')).toBe(wanted.toString('latin1'));
}
```

Used at every Buffer comparison in the file, so the property test (CI up to 3.3 s) is fixed too: :103
(`expect(await streamed(arena)).toEqual(Buffer.from(auditCsv([]), 'utf8'))`), :112, :128 (`Buffer.from(text, 'utf8')`),
:147, :164. The array `toEqual` at :138 stays. No timeout is added (section 2).

### 3d. The failing-first test (FRM-01, no new ID)

A new `it` in the FRM-01 group of `action-form.browser.test.tsx`, after S-SEC-2, independent of poll timing (the challenge's
"already past" shape, not the hold-and-release one, which an exact helper can pass on CI's timing):

```ts
it('FRM-01: a count already past the one awaited ends the wait: the stale refusal’s 1 is 2 once the cleared summary replaces it (S-SEC-2)', async () => {
  const page = await harness.open('keep');
  await page.fill('#field-zip', '27514');
  await onRefresh(page, { requestKey: 'synthetic-request-key-2', person: PERSON_B });
  await script(page, { refuse: STALE });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForSelector(`${SUMMARY}[data-state="cleared"]`);
  // Settled past 1: an exact wait for 1 can never end now.
  expect(await shown(page)).toBe(2);
  expect(await page.locator('body[data-shown="1"]').count()).toBe(0);
  await shownCount(page, 1);
  await page.close();
});
```

Deterministic: the page is driven past N before the wait starts. Against the old exact helper it hangs to the 30 s test
timeout every time (challenge probe: 3/3 missed); with the new helper it returns in milliseconds (3/3 in 3-4 ms). It is
committed first and run alone on the old helper to record the failure, then the helper commit makes it pass.

## 4. What is NOT changed, and why

- **Product code** (`action-form.tsx`, `form-issues.tsx`): the stale-then-cleared sequence is correct behaviour.
- **The harness's 20 ms refresh delay** (`forms-harness.tsx:368-377`): it models the server's round trip; the test should not
  depend on it.
- **`test-support/browser.ts`** (a harness-wide `page.setDefaultTimeout`): broader, and packet-day-counts' fix round is
  resolving a conflict in that file; the per-helper timeout is enough here.
- **`step-timer.browser.test.tsx:170`** (`harnessRestarts === 1`): exact, but the value is meant to stay 1 (asserted at :175),
  not transient; no hang path.
- **Other waits in action-form** (`waitForSelector` on summaries and boundaries, `waitForFunction` on keys and `release`):
  they wait on states that persist, not counters that move on.
- **vitest config** (`testTimeout`, `retry`): no global change; no retry, which would hide flakes.
- **CAS-41.3's data size (2,000 lines) and the property's 200 runs:** they are the test's coverage; the cost was the
  comparison.

## 5. Matrix rows

Unchanged. FRM-01 (`docs/product/test-matrix.md:354`) and CAS-41 (:139, CAS-41.3 its arena sub-case) describe behaviour;
no assertion's wording or claim changes (the new FRM-01 case asserts the harness wait, under the row's S-SEC-2 claim, and the
CSV comparisons stay byte for byte). No new ID.

## 6. Risks

- **`>=` can end a wait early** if `before` were read before an earlier response settled. The exact wait had the same exposure
  (it would match the earlier response too), and the exactness assertions in 3a catch an unexpected extra insertion where the
  count is a claim.
- **Exactness assertions added at a settled point could race** if a later insertion were still pending. Each is placed after a
  wait for the final visible state (cleared summary, final title, final description); the invalid refusal and the model's
  answer trigger no refresh.
- **latin1 comparison message** on a failure is a truncated string diff rather than a Buffer diff: fine for a byte check, and
  it fails in 4 ms on a 470 KB mismatch (measured).
- **The FRM-01 cause stays inferred.** If S-SEC-2 times out again after this PR, the 10 s wait timeout names the await; a
  repeat at another await is a new investigation, not a re-run (ci.md:150-151).

## 7. PR plan

1. Commits in `/home/user/test-flakes-2`, one concern each, each message ending with the Co-Authored-By and Claude-Session
   lines:
   1. `FRM-01: a regression case: a count already past the one awaited ends the wait` (3d). Run alone under the lock on the
      old helper; record the 30 s timeout.
   2. `FRM-01: shownCount waits for at least N, with a 10 s timeout; exact counts asserted where settled` (3a).
   3. `SGN-02: the step-timer copy of shownCount waits for at least N` (3b).
   4. `CAS-41.3: compare the CSV's bytes as latin1 text, not by toEqual's element walk` (3c).
2. Local gates (speed rule 1), under `flock /tmp/laneb-heavy.lock`: typecheck, lint, lint:logs; `action-form.browser.test.tsx`
   and `step-timer.browser.test.tsx` 20 times each (all green; S-SEC-2 and the new case's times recorded); `csv-arena.test.ts`
   20 times (record :151 and :103 per run; expect tens of ms); the full local suite once on the final tree.
3. Merge the base once, right before the push (speed rule 2; #94 may have merged). Push with
   `git push -u origin co-001/test-flakes-2` (pre-push hook runs; a refusal is fixed, never forced).
4. Draft PR into `claude/build-platform`, description from `.github/pull_request_template.md`: both flakes, the inferred-vs-
   observed cause, the CAS-41.3 measurements (CI 1,815-4,350 ms and 5,404 ms failed; local 1,088-1,924 ms; after 30-53 ms),
   the failing-first record, "tests only; no matrix ID".
5. Review: one adversarial review of the test infrastructure and the race analysis (speed rule 3, test-only), unless the
   session holds the 06:22 ruling's two; one fix round; verification on CI green on the exact head; the session marks ready
   and merges (first-ready rule). Record in the status file.

## Evidence

Scratchpad `/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/d`:
`cas/run1..20.json` (local runs), `ci/jobs.txt` and `ci/unit-*.log` (14 unit logs), `prof/prof.test.ts` and `prof/out.txt`
(the profile), `prof/after.test.ts` and `prof/after1..10.json` (the changed comparison).
