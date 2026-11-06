# Verification: brand-settle, PR #121 (`co-001/brand-settle`)

Verifier: S4 (Lane A's account), https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu, 2026-11-05 ~02:10 UTC.
Progress: /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/brand/progress/verify.progress.md

## State found at start
- The fix round did not finish. Its two commits are local only in /home/user/brand-settle. They are c22f9912 (the ADR 0056 amendment's N2, N3 and N4) and f6337de1 (ADR 0058 D9's forward pointer, N1). The remote branch is still 062db660.
- The fix round's full local suite (scratchpad/brand/scripts/suite.sh at f6337de1) is not running. It stopped during `test:golden`, with no result line written. The log ends at 02:03:56Z with "ELIFECYCLE Command failed". These steps passed: typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content, test. These never ran: db:migrate, db 1-4/4, synth, watched, tree clean, actions:check, build, e2e.

## 1. git ls-remote
- PR head: `refs/heads/co-001/brand-settle` = `refs/pull/121/head` = 062db660dda93146a848b2f853646ba91b3a7bfd. This is the build's reported head; the fix round never pushed.
- Base tip: `claude/build-platform` is now **54d061fd** (Merge pull request #118, PRC-32). The merged base was 370b8973, which is an ancestor of 54d061fd. GitHub reports the PR as `mergeable_state: behind`.
- **RE-MERGE NEEDED: new base 54d061fd.**

## 2. CI on 062db660 (finished; 22 runs)

| Check | Conclusion | Required |
| --- | --- | --- |
| all green | **failure** | yes |
| mutation | success | yes |
| screening-capacity gate | success | yes |
| approval-of-record (run 41950601992) | success | yes |
| approval-of-record (run 41950688019) | success | yes |
| db (1/4) | **failure** | via all green |
| db (2/4) | success | via all green |
| db (3/4) | success | via all green |
| db (4/4) | success | via all green |
| unit | success | via all green |
| lint | success | via all green |
| static | success | via all green |
| build | success | via all green |
| images | success | via all green |
| domain model | success | via all green |
| e2e (1/2) | success | via all green |
| e2e (2/2) | success | via all green |
| capacity | success | |
| changes (run 41950602055) | success | |
| changes (run 41950601969) | success | |
| stryker (matrix shard) | skipped | |
| notify | skipped | |

db (1/4) had 1 failure out of 3293 tests: `tools/release/load.db.test.ts`, the test "leaves the release analyzed and frozen once loaded". It expected relallvisible 7 and got 0 (line 145). This matches the known flake recorded in ops/approval-summaries/lane-a-wip/flaky-load/record.md, which is caused by snapshot or xid horizons from concurrent work. The PR touches no file near it. The failure is not caused by this change, but it leaves the required `all green` check red.

## 3. Fresh clone at 062db660
- Cloned into scratchpad/brand/verify-clone. Install with `--frozen-lockfile` under the lock: ok. Log: scratchpad/brand/logs/verify-clone.log.
- `vitest run packages/brand`: 14 of 14 passed.
- `vitest run status brand contrast`: 8 files, 138 of 138 passed.
- `git diff --stat 370b8973..062db660` (the merge base is 370b8973) shows 10 files, +201/-51:
  - tokens: tokens.css, tokens.ts
  - CSS: apps/worker/src/report/brand.css
  - tests: tokens.test.ts, e2e/a11y.ts
  - the moved formula: contrast.ts, plus its `./contrast` export in packages/brand/package.json
  - docs: ADR 0056, BRAND.md
  - apps/web/src/components/status.tsx: the unpriced class string and its comment. This is the status chip component the scope names.
  - No brand baseline changed, which agrees with the description.
  - Nothing outside display scope: no schema, migration, content, pricing or ledger file.
- The clone has been removed.

## 4. The description at 062db660
- True:
  - #646E7C replaces #7A8594 in tokens.css and in the tokens.ts mirror. The dark value is unchanged.
  - The chip text is `text-status-unpriced`, and the report `.unpriced` uses `--pw-unpriced`.
  - contrast.ts is not in the package index.
  - tokens.test.ts has no hex literal.
  - The web CSS has no `prefers-color-scheme` rule.
  - The ADR 0056 amendment is present and dated 2026-11-04.
  - The ratios recompute to 4.608 on the tint, 5.168 on White, 3.338 for the old value and 6.177 dark. The HSL is 215 / 10.7% / 43.9%, against the old 52.9% lightness.
- Footer: exact. The body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then the session URL.
- Stale or incomplete:
  - The "Reviewer agents' findings" row says the UX and brand review is "Not run yet ... Pending". The review has run, with findings N1 to N5.
  - The description says ADR 0058's D9 text is out of scope and left as it is. Unpushed commit f6337de1 changes that text, so the claim becomes false once it is pushed.
  - The Checks table does not report the db (1/4) failure.

## What remains
1. Push c22f9912 and f6337de1.
2. Re-merge base 54d061fd.
3. Run the full local suite to completion. It stopped at test:golden.
4. Update the description: the review findings and their resolutions, the D9 line, and the checks.
5. Get green CI on the new head. Re-run db (1/4) if the load.db flake recurs.

VERDICT: NOT VERIFIED: the base moved to 54d061fd (RE-MERGE NEEDED); the required check `all green` failed on 062db660 (db (1/4), the known tools/release/load.db.test.ts relallvisible flake); the fix round's commits c22f9912 and f6337de1 are not pushed and its full suite stopped at test:golden; the description's reviewer row and its D9 line are stale.
