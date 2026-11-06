# PR #116 (the dark sign-in frame): the fix round, merged with the base and pushed

Branch co-001/ux-sign-in-dark-frame, worktree /home/user/ux-dark-frame.
- **Pushed head: f5676fae** (a3344d93..f5676fae). The pre-push hook checked 2 commits and gitleaks was clean.
- The head merges claude/build-platform at **17641c88** (#85, #114) once, with no conflict and no change to the manifests or lockfile.
- The base has since moved to 30871f72, so GitHub reports the PR as "behind". It was not merged again, because this round allows one merge.
- PR #116 is still a draft.

## Dispositions
| Finding | Disposition | Commit |
| --- | --- | --- |
| UXD116-N1 | No code change, as the review asked. This is the brand owner's ruling under ADR 0056:134, and the "For the brand owner" paragraph stays in the PR body | none |
| UXD116-N2 | Fixed. expectAccessibleInDark now runs on new-password (open), enrolment (warning) and key registration (warning). Red: the dark ground was reverted in the working tree only, never committed, and 2 tests failed on color-contrast (.font-display, h1, .block). Green: 2 of 2 | 55d9aa6e |

These are test changes only, so no screen changed and no shot was retaken.

## Suite on f5676fae, once, under the lock: /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dark/suite.md
- typecheck (22 projects), lint (1,786 files), lint:copy, lint:logs, check:fixtures and verify-content: all passed.
- Unit: 449 files, 7,653 passed, 4 skipped. 1 failed: the known 5 s timeout in apps/worker/src/screening/threads.test.ts, a file this PR does not touch. Rerun alone under the lock, it passed 3 of 3 times (9 of 9 each).
- Golden: 381 of 381.
- Migrate: 46 migrations applied.
- test:db, 6 of 6 shards: 143 files, 9,802 passed, 1 skipped.
- Build: stamped f5676fae.
- e2e (E2E_PREBUILT=1): 78 of 78 passed.
- synth --all and watched.ts --write: no change, and the tree was clean afterwards.
- actions:check: passed.

## PR description
- Updated with update_pull_request from /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/dark/pr-body.md: the findings with their dispositions, the suite counts and the head.
- Read back with pull_request_read: identical to the draft, footer exact, head f5676fae, base 17641c88.
