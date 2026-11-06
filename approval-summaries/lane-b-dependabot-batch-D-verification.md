# Lane B, Dependabot batch, PR D (#105): fresh-clone verification

Verifier: Lane B session S4, 2026-11-04 06:07-06:25 UTC. Draft PR #105, branch `co-001/test-flakes-2`.

## 1. Refs (git ls-remote, 06:06 and again 06:24 UTC)

- `co-001/test-flakes-2`: dc54ca5823897729501749639eea632b0102f691, as reported.
- `claude/build-platform`: 7bf7b252da3a75f09b23a3e3a0c2cffdaf65a612 (#107). Nothing moved.
- The PR API agrees: head dc54ca58, base 7bf7b252, draft, 9 commits, 3 files, +54/-10.

## 2. CI on dc54ca58: all 25 check runs finished

| Check run | Result | Started-finished (UTC) |
| --- | --- | --- |
| all green (required) | success | 06:20:49-06:20:53 |
| mutation (required) | success | 06:08:30-06:08:34 |
| screening-capacity gate (required) | success | 06:06:37-06:06:41 |
| approval-of-record (required; run 41783297070) | success | 06:08:36-06:08:46 |
| approval-of-record (run 41783121070) | success | 06:04:26-06:04:35 |
| unit | success | 06:04:47-06:18:42 |
| images | success | 06:04:53-06:09:55 |
| build | success | 06:06:42-06:08:39 |
| static | success | 06:04:36-06:07:08 |
| lint | success | 06:07:10-06:10:06 |
| domain model | success | 06:04:26-06:05:12 |
| db (1/6) | success | 06:05:13-06:11:34 |
| db (2/6) | success | 06:04:26-06:11:43 |
| db (3/6) | success | 06:05:18-06:10:40 |
| db (4/6) | success | 06:05:07-06:11:13 |
| db (5/6) | success | 06:06:10-06:15:22 |
| db (6/6) | success | 06:07:12-06:11:14 |
| e2e (1/3) | success | 06:08:53-06:15:53 |
| e2e (2/3) | success | 06:08:47-06:20:47 |
| e2e (3/3) | success | 06:08:50-06:17:26 |
| changes (run 41783120991) | success | 06:04:36-06:05:16 |
| changes (run 41783120992) | success | 06:04:26-06:04:34 |
| stryker (matrix shard) | skipped (no affected shard) | 06:05:17 |
| capacity | skipped | 06:04:35 |
| notify | skipped | 06:04:35 |

22 success, 3 skipped by design, 0 failed. All four required checks are success.

**images** (job 126419027858): "Install Trivy" inside trivy-action was skipped (`skip-setup-trivy: true`). Both scans used the pinned binary `/home/runner/work/_temp/trivy-bin/trivy` (v0.70 docs links) and finished with outcome=success:
- `web.tar` (debian 13.7): 0 vulnerabilities in the OS layer and every node-pkg target. Report at 06:07:38. Run Trivy took 20,565 ms.
- `worker.tar` (debian 13.7): 0 vulnerabilities in the OS layer, playwright-core and yarn. Report at 06:08:59. Run Trivy took 11,428 ms.

**unit** (job 126419027596): 432/432 files passed. Tests: 7,312 passed and 1 skipped (7,313).
- `action-form.browser.test.tsx`: 38 tests, 27,394 ms, done 06:06:40.
  - FRM-01 S-SEC-2 "a page out of date whose refresh shows another person clears the form…" passed in 667 ms.
  - The new regression case "a count already past the one awaited ends the wait…" passed in 583 ms.
- `step-timer.browser.test.tsx`: 14 tests, 26,154 ms, done 06:12:11.
  - SGN-02 "with ActionForm, a refusal's summary and focus stay its own…" passed in 3,636 ms.
- `csv-arena.test.ts` (CAS-41.3): 6 tests, 199 ms for the whole file, done 06:14:43. The log does not print per-test times for this file.

## 3. Fresh clone at the head

- Cloned at `co-001/test-flakes-2`. HEAD dc54ca58. The merge base with origin/claude/build-platform is 7bf7b252.
- `pnpm install --frozen-lockfile`, run under /tmp/laneb-heavy.lock, exited 0.
- The three changed test files were run once with vitest under the lock and exited 0: 3 files, 58/58 passed (action-form 38, step-timer 14, csv-arena 6), in 31.66 s.
- `git diff --stat 7bf7b252 HEAD` shows only the three test files, with 54 insertions and 10 deletions:
  - apps/web/src/components/action-form.browser.test.tsx
  - apps/web/src/components/step-timer.browser.test.tsx
  - apps/worker/src/report/csv-arena.test.ts
- The clone has been removed.

## 4. Description claims

- The live body matches `d2/pr-body-prep.md` exactly.
- All eight template sections are present, the footer is exact, and the PR is still a draft.
- The commit list (7 commits and 2 merges) matches `git log`.
- The base delta 4846f043..7bf7b252 is 15 files and contains no app code, which confirms the reported scope.

These sentences are stale or imprecise. Each has an exact replacement:

1. Commit list, dc54ca58 line.
   - Old: "It brings only CI, Trivy, action-pin tooling and runbook files; no conflict, and the lockfile is unchanged."
   - New: "It brings only CI files (the ci, release and release-dry-run workflows, the pinned Trivy install and release file, action-pin tooling and its tests, the gitleaks install script, the workflow tests), the CI runbook and one ADR; no app code, no conflict, and the lockfile is unchanged."
2. Checks.
   - Old: "The base delta since 7c97f9c0 is CI-only (workflows, the Trivy install, action-pin tooling, runbooks), so this head had a targeted re-check under the shared heavy lock, and CI is the suite of record:"
   - New: "The base delta since 7c97f9c0 has no app code (workflows, the Trivy and gitleaks installs, action-pin tooling and its tests, the workflow tests, the CI runbook and one ADR), so this head had a targeted re-check under the shared heavy lock, and CI is the suite of record:"
3. Reviewer table, N3 row.
   - Old: "Fixed: all three 30-run loops ran on the head and passed (table above)."
   - New: "Fixed: all three 30-run loops ran and passed (step-timer on 693f0500; action-form and csv-arena on 7c97f9c0; tables above)."
4. Checks, CI paragraph.
   - Old: "so `images` and `all green` are expected green on it. This head does not merge until `all green` is green on it."
   - New: "and CI on dc54ca58 (ci 41783120996) is green: every job passed, `images` scanned both images clean, and `all green`, `mutation`, `screening-capacity gate` and `approval-of-record` are success."
5. Reviewer table, S1 row.
   - Old: "CI runs again on that head. No merge and no ready on a red run."
   - New: "CI on that head (ci 41783120996) is green, `images` included."
6. The founder's approval.
   - Old: "**What waits:** a green CI run on dc54ca58 (the base, with #107's Trivy fix, is merged in)."
   - New: "**What waits:** nothing on CI: dc54ca58 is green (ci 41783120996). Next come ready, the approval-of-record re-run, and the merge with `expectedHeadSha` dc54ca58."

None of these changes a result, and none blocks verification. Items 4-6 were true when written and became stale only once CI finished.

VERDICT: VERIFIED
