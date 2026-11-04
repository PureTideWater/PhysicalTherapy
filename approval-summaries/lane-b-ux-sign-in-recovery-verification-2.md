# #108 verification 2 (after the security and UX and brand reviews, second fix round)

Verifier, Lane B S4, 2026-11-04 11:13 to 11:35 UTC. PR #108, `co-001/ux-sign-in-recovery`, draft.
Scratch: sgn7d/vlogs (fresh-clone logs, live body, CI table, capacity job log); script sgn7d/verify.sh.

## 1. Remote refs (git ls-remote)

- Head: `e156d9480bad172f7f5ba35bc6f5974ce48af140`, the pushed fix-round head (0bd5721a plus 9 commits: 5e95a834, ecd6dbaa, c7a6a325, 03e2f1f1, 4e4e5329, aa640327, 2fe8d2fa, aaa8a070, e156d948).
- Base: `claude/build-platform` at `24531dc2e6c46b66f7427ec0752d5c3c9dfabdb8`, the base merged in 0bd5721a. It has not moved, so no re-merge is needed.

## 2. CI on e156d948 (every run, finished)

Every run finished by 11:27:51 UTC.

| Check run | Conclusion | Started | Completed | Job id |
| --- | --- | --- | --- | --- |
| notify | skipped | 2026-11-04T11:27:45Z | 2026-11-04T11:27:45Z | 126543979098 |
| screening-capacity gate | success | 2026-11-04T11:27:47Z | 2026-11-04T11:27:51Z | 126543977379 |
| all green | success | 2026-11-04T11:20:14Z | 2026-11-04T11:20:18Z | 126540715330 |
| approval-of-record | success | 2026-11-04T11:13:02Z | 2026-11-04T11:13:14Z | 126538410390 |
| e2e (1/2) | success | 2026-11-04T11:12:08Z | 2026-11-04T11:20:03Z | 126538059337 |
| e2e (2/2) | success | 2026-11-04T11:12:07Z | 2026-11-04T11:19:29Z | 126538049811 |
| stryker (${{ matrix.shard }}) | skipped | 2026-11-04T11:11:10Z | 2026-11-04T11:11:10Z | 126537683486 |
| mutation | success | 2026-11-04T11:11:12Z | 2026-11-04T11:11:16Z | 126537682157 |
| unit | success | 2026-11-04T11:10:50Z | 2026-11-04T11:18:39Z | 126537536630 |
| capacity | success | 2026-11-04T11:10:38Z | 2026-11-04T11:27:45Z | 126537458881 |
| approval-of-record | success | 2026-11-04T11:10:34Z | 2026-11-04T11:10:44Z | 126537433458 |
| build | success | 2026-11-04T11:10:29Z | 2026-11-04T11:12:05Z | 126537407450 |
| changes | success | 2026-11-04T11:10:29Z | 2026-11-04T11:10:35Z | 126537403004 |
| images | success | 2026-11-04T11:10:28Z | 2026-11-04T11:14:11Z | 126537400811 |
| db (4/4) | success | 2026-11-04T11:10:28Z | 2026-11-04T11:12:50Z | 126537400490 |
| domain model | success | 2026-11-04T11:10:28Z | 2026-11-04T11:10:53Z | 126537400433 |
| db (3/4) | success | 2026-11-04T11:10:28Z | 2026-11-04T11:18:11Z | 126537400226 |
| db (2/4) | success | 2026-11-04T11:10:28Z | 2026-11-04T11:14:47Z | 126537399777 |
| static | success | 2026-11-04T11:10:28Z | 2026-11-04T11:13:03Z | 126537399671 |
| lint | success | 2026-11-04T11:10:28Z | 2026-11-04T11:12:21Z | 126537399409 |
| db (1/4) | success | 2026-11-04T11:10:28Z | 2026-11-04T11:20:12Z | 126537399307 |
| changes | success | 2026-11-04T11:10:28Z | 2026-11-04T11:11:10Z | 126537397851 |

There are 22 runs: 20 success and 2 skipped (`notify`, and `stryker (${{ matrix.shard }})`, the matrix placeholder; `mutation` passed). None failed and none is pending.
The required checks are all success: `all green` (11:20:18), `mutation` (11:11:16), `screening-capacity gate` (11:27:51) and `approval-of-record` (11:10:44 and 11:13:14).

The capacity job's verdict (job 126537458881, 11:27:30):
> verdict: pass (time advisory)
> time warning (advisory): S4#1 S4-1 50.1 s, S4-2 52.1 s, S4-3 51.4 s (each the middle of S4's three runs), fail (allowance: above 48 s on the runner)
> sizing question for the founder (O9): the worst time, S4#1 S4-2's 52.1 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge

The gate job says "the capacity measurement passed every check but time, which is advisory here; a release's capacity run holds it binding". The run on 0bd5721a also had "pass (time advisory)", with an O9 worst time of 53.0 s.

## 3. Fresh clone at the head

I took a new clone from github.com at `co-001/ux-sign-in-recovery`. HEAD and the fetched branch are both `e156d948`. I installed under `/tmp/laneb-heavy.lock` (`pnpm install --frozen-lockfile`, exit 0) and ran the heavy steps under the lock, against the local Postgres.

| Step | Result |
| --- | --- |
| `pnpm typecheck` | exit 0 |
| `pnpm lint:copy` | exit 0 |
| Unit: `app/sign-in` and `routes/schemas.test.ts`, the touched unit files `notice.test.tsx` and `schemas.test.ts` | 2 files, 18 of 18 passed |
| db: `sign-in-routes.db.test.ts` (touched), `console-routes.db.test.ts` (covers touched `console.ts`) | 2 files, 56 of 56 passed |
| `pnpm build`, stamped e156d948 | exit 0 |
| e2e, `E2E_PREBUILT=1`: `sign-in.spec.ts`, `sign-in-time.spec.ts` (touched; the axe spec) | 14 of 14 passed |
| `git status` afterwards | empty |

This agrees with the worktree re-check in sgn7d/recheck.md: 810 of 810 unit, 56 of 56 db, and 22 of 22 e2e.

Spot checks at e156d948:
- schemas.ts has `z.email('enter an email address')`.
- notice.tsx is titled "Password changed, account still locked".
- ADR 0081 has the following:
  - "Not covered": SEC-B1 holds on the app's path only. It names the public client and EMAIL_ONLY recovery, says this was so on base 24531dc2, and points to P-1 (a confidential client with SecretHash, plus a CustomMessage trigger).
  - "Not verified here": Cognito's per-code cap and LimitExceededException, and the smoke check that counts the wrong codes.
  - "Revisit when": P-1 closing.
  - A1: "the form empties every secret field on every refusal".
- The PR's diff from 24531dc2 adds no model identifier.

## 4. Description

- I read the live body back with pull_request_read get. It is identical to sgn7d/pr-body.md (53,251 characters).
- GitHub shows head `e156d948`, base `claude/build-platform` `24531dc2`, still a draft and open. mergeable_state is "blocked", as expected (draft, approval of record).
- The head is stated as `e156d948` in "What changes" and "Merge order". Mentions of `0bd5721a` are historical (the merge, the full suite, the round-2 reviews, the after shots).
- Both reviews' findings are in the round-2 table:
  - Security: S-1, N-1, N-2 and N-3.
  - UX and brand: UXB-S1, UXB-S2 and UXB-N1 to UXB-N4.
  - Each has its resolution and commit.
  - D-5 to D-8 are listed.
  - "The SEC-B1 gate" and "Left to others" are rewritten.
  - P-1, P-2 and P-3 are named for Lane A and do not block the merge.
  - The shots owed on e156d948 are listed under the screenshots and under "Waiting on a person".
- The footer is exact: the body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu.

## Corrections (not blocking the verdict)

- C-1, description: the body does not carry the capacity job's O9 sizing question. The job says "the consumer's size goes to the founder before merge" (worst time 52.1 s, above 44 s; it was 53.0 s on 0bd5721a). Two places should mention it:
  - "Screening capacity": the gate passed with time advisory (S4 50.1 s, 52.1 s and 51.4 s against 48 s), plus the O9 note.
  - "Waiting on a person": the founder's ruling on the consumer's size before merge.
  - I did not edit the body; the verifier does not edit what it verifies.
- Still owed, as the body says: the after shots of D-5 to D-8 and UXB-N1 on e156d948.

VERDICT: VERIFIED
