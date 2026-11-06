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

# Round 2: the reviews of 0bd5721a, fixed and pushed

**Pushed head: e156d948** (0bd5721a..e156d948, 9 commits; the pre-push hook checked 9 commits, 19 text files, gitleaks
clean). Base claude/build-platform still at **24531dc2**: fetched, not moved, no merge. PR #108 stays a draft;
mergeable_state "blocked" (checks and review). Both reviews re-ran on 0bd5721a with a skeptic per finding: 10 findings,
all confirmed, none refuted (records: -review-security.md, -review-ux-brand.md).

## Dispositions
| Finding | Disposition | Commits |
| --- | --- | --- |
| Security S-1 (public client past SEC-B1; on the base) | Text only, does not block: ADR 0081 A2 qualified, Not covered bullet (the takeover chain, on base 24531dc2, Lane A's P-1), Revisit when; PR body ("The SEC-B1 gate", "Left to others"). P-1 rewritten for Lane A: (c) confidential client preferred, (a) corrected to a CustomMessage trigger (AdminGetUser grant; UserLambdaValidationException caveat), Pre-authentication dropped | 2fe8d2fa, e156d948; /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7d/../sgn7c/proposals.md |
| Security N-1 (confirm does not re-check the gate) | P-2 kept for UX PR 65, with the timing note; in the ADR | 2fe8d2fa |
| Security N-2 (Cognito's per-code cap unverified) | ADR Not verified here; the smoke check counts it; proposal P-3 | 2fe8d2fa |
| Security N-3 (tail over the floor) | Accepted; Revisit when on the timed p99; P-3 | 2fe8d2fa |
| UXB-S1 (no support contact on the reset page) | Fixed: fifth "No email?" item with the support mailto; supportEmail in the confirm phase only | ecd6dbaa, aa640327 |
| UXB-S2 ("Email: an email address") | Fixed: "enter an email address" (schemas.ts, console.ts); schemas.test.ts red first | 5e95a834, aa640327 |
| UXB-N1 (Back to sign in look, dark) | Fixed: .pw-link-button from the link tokens; e2e compares colours | 4e4e5329 |
| UXB-N2 (list order) | Fixed | c7a6a325 |
| UXB-N3 (password-only refusal empties the code) | Left as ruled; ADR 0081 A1 says why | aaa8a070 |
| UXB-N4 ("is locked") | Fixed: "is still locked", title "Password changed, account still locked" | 03e2f1f1 |

Word changes (co-founder, under the delegation): D-5 (support item), D-6 (order), D-7 (malformed email), D-8 (locked
reset notice), listed in the PR body.

## Re-check (on e156d948, all green): /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7d/recheck.md
typecheck, lint, lint:copy, lint:logs, check:fixtures, verify-content: exit 0. Unit (sign-in, components, schemas,
registry) 47 files, 810 passed. db (sign-in-routes, console-routes) 2 files, 56 passed. Build stamped e156d948. e2e
(sign-in, sign-in-time with axe, hardware-key, brand, copy) 22 of 22. synth and watched: no change, git status empty.

## Owed
After shots of the changed words on e156d948 (forgot-password code-sent, error-malformed, error-wrong-code, warning,
closed; sign-in reason-password-reset-locked); the founder's review; the co-founder on D-1 to D-8; Lane A P-1 and P-3.

## PR description
Updated with mcp__github__update_pull_request from /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7d/pr-body.md and read back with pull_request_read: identical
(53,251 characters), footer exact, head e156d948, base 24531dc2.
