# Verification of PR #117 (co-001/test-flakes-5), fix round

Head bb01093d245f4212709903349ae4798da4c6614c. Base claude/build-platform. Verified 2026-11-04, from 21:18 to 21:36 UTC.

## 1. Refs

`git ls-remote` (checked at the start and again at the end):

- co-001/test-flakes-5 is bb01093d245f4212709903349ae4798da4c6614c, as reported.
- claude/build-platform is 30871f7269376d154659fd420eacd38248b6c646, as reported. It has not moved.

No re-merge is needed. The PR is merged with 00fd2906 and reads `behind`, because the instruction was to merge once.

## 2. CI on bb01093d (every run has finished)

| Workflow (run) | Job | Result |
| --- | --- | --- |
| ci (41914482949) | changes | success |
| ci | build | success |
| ci | lint | success |
| ci | static | success |
| ci | domain model | success |
| ci | images | success |
| ci | unit | success |
| ci | db (1/4) | success |
| ci | **db (2/4)** | **failure** |
| ci | db (3/4) | success |
| ci | db (4/4) | success |
| ci | e2e (1/2) | success: 40 passed, 0 flaky (plus a later 4-test step, 4 passed) |
| ci | e2e (2/2) | success: 40 passed, 0 flaky |
| ci | **all green (required)** | **failure**: "not every job succeeded: db failure" |
| mutation (41914482728) | changes | success |
| mutation | stryker: money-ledger, pricing-recompute, pricing-rest, pricing-engine, packets-rest, packets-explain, packets-scan | success (all 7) |
| mutation | mutation (required) | success |
| screening-capacity (41914483152) | changes | success |
| screening-capacity | capacity | success (21:16 to 21:34) |
| screening-capacity | screening-capacity gate (required) | success |
| screening-capacity | notify | skipped |
| approval-of-record (41914482820 and 41914635522, pull_request) | approval-of-record (required) | success, both runs |

The e2e logs mention "flaky" 0 times. The flake this PR targets did not come back.

**Why db (2/4) failed.** One test file failed and 35 passed. Inside the shard, 2,740 tests passed and 32 were skipped.

- The failing file is `apps/web/src/lib/routes/route-tests/route-tests.8.db.test.ts > practice.reports.documents.pdf`.
- The error is `PricingRunInputError: a period that holds at least one service line`. It is thrown at `apps/worker/src/price/create.ts:125`, from `seedMappedNotPriced` (`apps/web/src/lib/routes/test-support/pricing-world.ts:118`) while the route world is being built.

This looks like a flake in the base's db harness, not something this PR caused:

- The PR touches no db test, no route test and no product code.
- ci on the base (00fd2906, run 41898815397) and on the base tip (30871f72, run 41912581996) is green.
- In a fresh clone at bb01093d, on a freshly migrated database under the lock, the same file passed 3 of 3 times (575 tests each).
- The local full suite on bb01093d passed test:db.

Even so, the required check `all green` is red on the head, so step 2 fails. The fix is to re-run the failed ci jobs on bb01093d (`gh run rerun 41914482949 --failed`) or push a new commit. This verifier does neither, because it only reads from GitHub.

## 3. Fresh clone and diff

The fresh clone is at `scratchpad/tf5/verify-clone`, with HEAD at bb01093d. Origin was fetched and matches the SHA.

- `pnpm install --frozen-lockfile` ran under /tmp/laneb-heavy.lock and exited 0.
- The tree is clean after install.

`git diff --stat 00fd2906 HEAD` (the merge base): 7 files, +119/-14.

- apps/web/e2e/a11y-title.spec.ts (new, 60 lines)
- apps/web/e2e/a11y.ts (+44/-4)
- apps/web/e2e/sign-in-time.spec.ts (+19/-4)
- docs/product/test-matrix.md: the CI-19 text amended. There is no new ID.
- fixtures/synthetic/CI-19/expected.json (regenerated)
- packages/synth/src/cases/matrix.ts: CI-19 copied word for word.
- packages/synth/src/cases/registry.ts: CI-19's assertedBy adds a11y-title.spec.ts.

The change is tests only: e2e files, one matrix row and that row's synthetic-case data. It has no product code, no manifest, no lockfile, no workflow and no migration.

- **Commits:** there are 7 (cc835ae6, 6ba1055b, cae8c00d, 9575c2c9, 929d9d2f, d5de98aa and the merge bb01093d). Each has one concern, and each ends with a blank line and then the two exact attribution lines.
- **Text outside the attribution lines:** no model identifier.

## 4. Description

- **Footer:** exact. It is "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu, with nothing after it.
- **Metadata:** head bb01093d, base sha 00fd2906, draft, 7 commits, 7 files, +119/-14. All true.
- **Claims that hold:**
  - The line references are right. `sign-in-time.spec.ts` :280, :635, :636, :664 and :665 pass `titled(...)`. The old :213 is now :222, and the old :271 is now :280.
  - The suite table matches `scratchpad/tf5/logs/suite/status.txt`. Unit rc=1 (the threads.test.ts timeout, as stated), golden, the 6 db shards, the build stamp bb01093d, e2e rc=0, and porcelain 0.
  - The B1, N1, N2 and N3 dispositions match the commits and the logs.
- **D1, a claim that is false:** the sweep counts are stale against the head.
  - The description says "all 176 existing calls", and its table gives packets.spec.ts 20 and triage.spec.ts 3, for a total of 176.
  - At bb01093d, the existing specs (leaving out a11y-title.spec.ts) have **179** `expectAccessible`/`atPhoneWidth` calls: packets.spec.ts has **22** and triage.spec.ts has **4**.
  - The base merge added three calls: packets.spec.ts:560 and :638, and triage.spec.ts:154. `sweep.py` ran before the merge, and its line numbers are 4 behind the head.
  - The code is not affected, because the helper's plain wait covers all three calls. Only the description's count is wrong. The fix is to re-run the sweep at the head and update the table, the "176" in "What changes" and the "**All**" row (179, with the per-column split re-derived) through update_pull_request.

## Problems to fix

1. **The required `all green` check is red on bb01093d.** db (2/4) failed in route-tests.8.db.test.ts (`seedMappedNotPriced`, "a period that holds at least one service line"). This PR does not cause it: the base is green and the file passes 3/3 locally. But the required checks are not all success. Re-run the failed jobs of run 41914482949 and wait for green.
2. **D1: the description's sweep table says 176 calls, but the head has 179** (packets 22, triage 4) after the base merge. Re-run the sweep at the head and correct the counts.

VERDICT: NOT VERIFIED: the required check "all green" failed on head bb01093d (ci run 41914482949: db (2/4) failed in route-tests.8.db.test.ts > practice.reports.documents.pdf, PricingRunInputError in seedMappedNotPriced; the base is green and the file passes 3/3 locally, so it looks like a flake the PR did not cause, but the failed jobs need a re-run that comes back green); and the description's e2e sweep says 176 calls (packets 20, triage 3) where the head has 179 (packets 22, triage 4), which needs correcting.
