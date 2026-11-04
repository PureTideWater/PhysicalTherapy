# Verification: PR #116, the dark sign-in frame (co-001/ux-sign-in-dark-frame), fix round

Verifier, 2026-11-04. Head checked: `f5676faea735d0ad969665e7eaf080df125bdaed`. Progress: dark/progress/verify.progress.md.

## 1. Remote refs (git ls-remote)
- Head `refs/heads/co-001/ux-sign-in-dark-frame` = `f5676fae`, as reported.
- Base `refs/heads/claude/build-platform` = `30871f72`, NOT the merged base `17641c88`. The base moved after the merge:
  #115 (model-gateway redaction, `00fd2906`) and #96 (CI mutation trigger, `30871f72`), 37 files, none of them in this PR.
  The PR shows mergeable_state "behind".
- **RE-MERGE NEEDED.**

## 2. CI on the head f5676fae (all 22 runs completed)

| Check run | Conclusion |
| --- | --- |
| all green (required) | success |
| mutation (required) | success |
| screening-capacity gate (required) | success |
| approval-of-record (required), run 41906004595 | success |
| approval-of-record (required), run 41914406212 (re-run 21:15) | success |
| static | success |
| lint | success |
| unit | success |
| build | success |
| images | success |
| domain model | success |
| db (1/4) | success |
| db (2/4) | success |
| db (3/4) | success |
| db (4/4) | success |
| e2e (1/2) | success |
| e2e (2/2) | success |
| changes (CI) | success |
| changes (mutation) | success |
| stryker (matrix) | skipped (no affected shard) |
| capacity | skipped |
| notify | skipped |

All four required checks are success. No failure, nothing pending.

## 3. Fresh clone at the head (dark/verify-clone, from origin)
- Clone HEAD `f5676fae`; `pnpm install --frozen-lockfile` exit 0 (under the lock).
- Brand unit tests (vitest unit project: packages/brand tokens, components/brand, worker report brand, brand-colors,
  brand-copy, brand-fonts lint and scan): 7 files, 113 of 113 passed. Log: dark/logs/verify-brand-unit.log.
- `apps/web/e2e/brand.spec.ts` (Playwright, own build): 5 of 5 passed in 2.8 min, including "the sign-in frame reads in
  dark" and the committed snapshot baselines (header, report cover) unchanged; tree clean after. Log: dark/logs/verify-brand-e2e.log.
- `git diff --stat 17641c88 f5676fae` (merge base = 17641c88): 4 files, +145 -4:
  `apps/web/e2e/a11y.ts`, `apps/web/e2e/brand.spec.ts`, `apps/web/e2e/sign-in-time.spec.ts` (tests) and
  `apps/web/src/app/sign-in/layout.tsx` (one Tailwind class, `bg-paper` -> `bg-paper dark:bg-bg`, and its doc comment).
  Styling, tests and a comment only. No token, palette, BRAND.md, tokens.css, brand.css, migration, content, CI,
  manifest or lockfile change. `dark:` is `[data-theme="dark"]`/`.dark` (tailwind-theme.css:12) and `bg-bg` is `--pw-bg`.

## 4. The description
- Claims checked true: the one-class change and file list; commits 24b5d08c, 4f6d045e, 0764aa74, a3344d93, 55d9aa6e
  exist with the stated subjects; the ratio table recomputed from tokens.css (dark link/focus on Paper 1.93, on --pw-bg
  8.53; muted 1.97 -> 8.39; fg 1.02 -> 16.78; light link 7.30, focus 5.87 on Paper); N2 red (2 failed) and green
  (2 passed) logs exist; the suite table matches dark/suite.md; brand baselines not regenerated (fresh-clone run passes
  against them); head f5676fae, base 17641c88, draft, open.
- The body equals dark/pr-body.md (and readback3). Footer exact: the "Generated with Claude Code" line, a blank line,
  then https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu. No model identifier.
- The body says the base merged is `17641c88`. That is now stale against the remote base `30871f72`.

VERDICT: NOT VERIFIED: RE-MERGE NEEDED. The remote base claude/build-platform moved from the merged 17641c88 to 30871f72 (#115, #96), so the PR is "behind". CI on f5676fae is green (all four required checks success), the fresh-clone brand tests pass and the diff is styling, tests and a comment only. Merge 30871f72 once, rerun the suite and CI, and update the description's base line, then verify again.
