# PR #108 (UX PR 7, sign-in recovery): fresh-clone verification of head 0bd5721a

Verifier run 2026-11-04 10:39 to 10:50 UTC. Records: /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/progress/verify.progress.md,
logs in /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/verify-logs/ (script /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/sgn7c/verify.sh).

## 1. Refs (git ls-remote, at the start and again at the end)
- co-001/ux-sign-in-recovery = 0bd5721ac5795bcf478d74c4d84251f04515b225, as reported.
- claude/build-platform = 24531dc2e6c46b66f7427ec0752d5c3c9dfabdb8, the merged base. **The base has not moved**, so no re-merge is
  needed. The head contains the base (merge-base = 24531dc2). refs/pull/108/merge = bad07299, which CI built.
- PR: draft, open, head 0bd5721a, base 24531dc2, 30 commits, 40 files (+2,600 / -134), mergeable_state "clean". No reviews.

## 2. CI on the head (all 22 check runs completed, none pending)
| Check run | Conclusion | Required |
| --- | --- | --- |
| all green | success | yes |
| mutation | success | yes |
| screening-capacity gate | success | yes |
| approval-of-record (run 41813518806) | success | yes |
| approval-of-record (run 41815516256, 10:38Z, after the body edit) | success | yes |
| capacity | success | |
| changes (x2) | success | |
| unit | success | |
| db (1/4), db (2/4), db (3/4), db (4/4) | success | |
| e2e (1/2), e2e (2/2) | success | |
| build, lint, static, images, domain model | success | |
| stryker (matrix) | skipped (no money path; affected shards=[]) | |
| notify | skipped | |

approval-of-record passes with no review on the PR, so APPROVAL_REVIEW_REQUIRED is not yet in force. The founder's
approving review of 0bd5721a is still owed (CLAUDE.md, Merging).

**Capacity (job 126518636206).** Runner line: `runner 4 CPUs, 15982 MiB, load 2.25 1.20 0.47; harness on CPUs 0-1;
runtime docker; time mode advisory`. **Verdict: pass (time advisory).** S4 ran three times: S4#1 53.0/53.1/51.6/39.1 s,
S4#2 52.2/53.0/50.9/38.7 s, S4#3 52.8/52.4/50.3/37.7 s. **Middle run S4#2, worst 53.0 s (S4-2).** Advisory time warnings:
S4#2 S4-1 52.2 s, S4-2 53.0 s and S4-3 50.9 s are each above the 48-s line on the runner. **O9 sizing note:** "the worst time,
S4#2 S4-2's 53.0 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge."

**SGN-05 to SGN-08 in CI's logs.**
- e2e (2/2): sign-in.spec.ts:149 "a forgotten password is reset by emailed code, and the second factor is still asked
  (SGN-05, SGN-06, SGN-07)"; :186 Use a different email (SGN-06, UXR-01); :197 Send a new code (SGN-06, UXR-05);
  sign-in-time.spec.ts:586 axe on the help list, reset notice and both phases (SGN-06, SGN-08); also :213, :301, :370, :490.
  37 passed. e2e (1/2): 37 passed; brand baselines 4 passed, 7 written. So the whole run is 74 of 74.
- unit: 437 files, 7,508 passed, 1 skipped (local was 7,505 passed + 4 skipped: environment-gated tests differ). The tail
  shows step-limits.test.ts. The per-test names for the db shards could not be read: the log download is refused by the
  proxy (403 on the blob host), and the inline tail ends after the summaries. All four shards are success, and the same two
  files pass in the fresh clone (below).

## 3. Fresh clone at 0bd5721a (from GitHub, under /tmp/laneb-heavy.lock)
| Step | Result |
| --- | --- |
| pnpm install --frozen-lockfile | exit 0 |
| vitest --project unit: notice, step-timer, step-timer.browser, cognito-provider, dev-provider, step-limits, http | 7 files, 143 of 143 passed (the browser file ran: 15 tests); N-1's test passes |
| pnpm db:migrate | 45 already applied, nothing to apply |
| vitest --project db: sign-in.db.test.ts, sign-in-routes.db.test.ts | 2 files, 46 of 46 passed, including both S-3 tests (flow and routes) and SGN-05 to SGN-07 |
| pnpm build + stamp | exit 0, stamped 0bd5721a |
| playwright e2e/sign-in.spec.ts + e2e/sign-in-time.spec.ts (E2E_PREBUILT=1) | 14 of 14 passed, none flaky (3.8 min) |
| git status after | clean |

`git diff --stat 24531dc2...0bd5721a`: 40 files, 2,600 insertions, 134 deletions. That is the PR's own 40 paths under
apps/web (e2e, sign-in pages, auth, routes, services, step-timer), the ADR 0081 amendment, test-matrix.md,
support-mail.md, fixtures/synthetic/SGN-05..08/expected.json and packages/synth cases. Nothing under infra/, packages/db,
content/, migrations or workflows changes, and the lockfile is unchanged.

Spot checks against the code: in `requestPasswordReset`, the lookup still rethrows (outside `unlessFailed`); a failed send
does not skip the audit write; `unlessFailed` logs `password reset request failed` at error with `{ request_id, error_code }`
only; the floor stays in the `finally`. The S-3 flow test asserts the exact log keys (level, msg, time, request_id,
error_code) and no address. The N-1 test mocks `node:crypto`'s `timingSafeEqual` and asserts two equal-length calls
answering [false, true]. The red logs agree: s3-red has 2 failed, s3-green 46/46, and n1-red-M23 has 1 failed and 25 passed.
The three long ADR 0081 lines (7, 181, 190) are already on the base, not added here.

## 4. Description claims
True as written: the head and base; 30 commits ("29 commits of its own, then one merge commit"); the 10 watched paths (they
match watched-paths.txt exactly); the 51 before and 96 after shots (17 + 15 states x 3); every local suite count (it
matches suite.md); the red-first counts; the dispositions table; and the footer. **The footer is exact:** the body ends
"🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then
"https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu".

Stale or untrue sentences, with replacements:
1. Fix round, S-3 bullet: "ADR 0081 A2 and design 3.2's third `ForgotPassword` row (and 4.2's floor bullet) say so."
   This is untrue on the linked branch: origin/claude/build-ops's design has no S-3 text. The edits sit uncommitted in
   /home/user/ops, which is 2 commits behind origin. Either commit and push the design edit on claude/build-ops (rebased on
   its tip; preferred), or replace the sentence with: "ADR 0081 A2 says so; design 3.2's third `ForgotPassword` row, 4.2's
   floor bullet and section 6's test bullet are amended to match on `claude/build-ops`." and push that edit before the
   merge. The same applies to the checker S-3 row's "and design 3.2's row and 4.2's floor bullet with it".
2. Screening capacity, last paragraph: after "...on this head (the session's ruling, which settles checker note N-7).", add:
   "**Result on `0bd5721a`: pass (time advisory).** Runner: 4 CPUs, 15982 MiB. S4's middle run (S4#2) worst upload 53.0 s;
   S4#2's three large uploads (52.2, 53.0 and 50.9 s) are above the 48-s line as advisory warnings. O9: 53.0 s is above
   44 s, so the consumer's size goes to the founder before the merge."
3. Waiting on a person, first bullet: replace "**The founder:** the approving review of the latest commit, and the
   `screening-capacity gate` check's result on it." with "**The founder:** the approving review of the latest commit, and
   the O9 sizing question the `screening-capacity gate` raised on it (S4's middle-run worst time 53.0 s, above 44 s); the
   check itself passed."
4. Checks, the sentence "CI's result on the head is read from this page." is accurate, but nothing records it. Optionally add:
   "CI on `0bd5721a`: every required check is green; unit 437 files, 7,508 passed, 1 skipped; e2e 37 + 37 passed; db 4 of
   4 shards green."

Merge blockers outside this verification (each is stated in the body): the UX and brand review of the 96 after shots,
with a skeptic per finding, has not run; the founder's approving review of 0bd5721a; the O9 sizing question; the
co-founder on D-1 to D-4. Corrections 2 to 4 are description edits only (no commit, so CI stands); correction 1 is a
claude/build-ops push, not a change to this branch.

Clone removed after the run.

VERDICT: VERIFIED
