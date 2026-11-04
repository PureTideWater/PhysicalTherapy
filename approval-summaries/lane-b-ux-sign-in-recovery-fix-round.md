# PR #108 (UX PR 7, sign-in recovery): the fix round, merged with the base and pushed

Branch co-001/ux-sign-in-recovery, worktree /home/user/ux-sign-in-recovery. **Pushed head: 0bd5721a**
(6b25ed60..0bd5721a), which merges claude/build-platform at **24531dc2** (no conflict, lockfile unchanged). The first
push was refused by the remote ("fatal error in commit_refs"); the retry passed the pre-push hook (5 commits, gitleaks
clean) and landed. PR #108 stays a draft; mergeable_state "blocked" (checks and review).

## Dispositions
| Finding | Disposition | Commits |
| --- | --- | --- |
| Checker S-1, S-2 | Fixed before this round | ce2a20fc, 6b25ed60 |
| Checker S-3 (and security S-B) | Fixed by the session's ruling (1): a failed send or audit insert logs "password reset request failed" at error with { request_id, error_code } and answers code_sent at the floor; tests red first; ADR 0081 A2 and design 3.2 row 3, 4.2 and 6 amended (design in /home/user/ops, not committed) | f2aacae4, 27bd7440, 4d58f23c |
| Checker N-1 | Fixed by the session's ruling (2): the test watches timingSafeEqual; red under M23 | 00a7ab21 |
| Checker N-2 to N-6 | Not defects (as recorded) | |
| Checker N-7 | Resolved by ruling (4): the merge waits on the capacity gate's own result, not #102 | PR body |
| Security S-A (Cognito public client) | Proposal P-1 for Lane A (infra file) | /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/proposals.md |
| Security N (confirm does not re-check the gate) | Proposal P-2 for UX PR 65 | /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/proposals.md |
| Security N (over-floor not padded) | Not a defect: in the ADR | |
| Security N (head lacked the base) | Fixed: base merged | 0bd5721a |
| UX and brand review | Not completed; no findings. The fix round took the after shots; the pass over them is owed | |

Word changes: none.

## Suite (on 0bd5721a, all green): /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/suite.md
typecheck, lint (1,760 files), lint:copy, lint:logs, check:fixtures, verify-content: exit 0. Unit 437 files, 7,505
passed, 4 skipped. Golden 381. db 4 shards, 140 files, 9,696 passed, 1 skipped. Build stamped 0bd5721a. e2e 74 of 74
(axe specs 53 of 53). Brand baselines 7/7, 0 differ. synth and watched: no change. actions:check ok. Stryker: no shard.

## Shots
Before: sgn7b/shots-before/INDEX.md (51, df4daff7). After: /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/shots-after/INDEX.md (96, 0bd5721a, 0 skipped).

## PR description
Rewritten with mcp__github__update_pull_request from /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/pr-body.md and read back with pull_request_read: identical,
footer exact, head 0bd5721a, base 24531dc2.
