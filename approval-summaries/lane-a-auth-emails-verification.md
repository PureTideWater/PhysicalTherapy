# Verification: PR #125 (`co-001/auth-emails`), head bcdceae6

Verifier session: https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu (Lane A's account), 2026-11-05 06:20 to 06:37 UTC.
The work is in /tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/mail/progress/verify.progress.md and logs/verify/.

## 1. Heads
- `git ls-remote` at the start and again after CI: `co-001/auth-emails` = bcdceae631752039d17e7dc42fc409a1814bc8c2, the same as local HEAD in /home/user/auth-emails. No local commit is unpushed (`origin/co-001/auth-emails..HEAD` is empty).
- Base `claude/build-platform` = f7d609ccf07297220120cbeee0666439f1740f17, the merged base. It is an ancestor of HEAD and is the merge base. No re-merge is needed.
- PR #125: draft, open, head bcdceae6, base sha f7d609cc, mergeable_state `blocked` (waiting on the founder's review).

## 2. CI on bcdceae6 (all finished by 06:36:22 UTC)

| Check run | Conclusion |
| --- | --- |
| **all green** (required) | success |
| **mutation** (required) | success |
| **screening-capacity gate** (required) | success |
| **approval-of-record** (required; two runs) | success, success |
| changes (two runs) | success, success |
| domain model | success |
| lint | success |
| static | success |
| build | success |
| images | success |
| unit | success |
| db (1/4), (2/4), (3/4), (4/4) | success x4 |
| e2e (1/2), (2/2) | success x2 |
| capacity | success |
| stryker (matrix shard) | skipped (the mutation gate found no mutated paths, and its mutation job passed) |
| notify | skipped |

There were 22 runs and no failure.

## 3. Fresh clone at the head
- I cloned to scratchpad/mail/verify-clone, fetched from GitHub and detached at bcdceae6. `pnpm install --frozen-lockfile` ran under the heavy lock and exited 0.
- These ran under the lock: CI=true, ENGINE_FREEZE_BASE=f7d609cc, DB postgres://...@localhost:5433.
  - Touched unit tests: packages/auth-mail, cognito-provider.test, http.test, worker mail template.test, tools/brand-copy scan.test and packages/synth. 20 files, 393 passed.
  - Infra (`pnpm --filter ./infra test`): 29 files, 793 passed. This matches the PR.
  - `pnpm db:migrate`: nothing to apply (47 applied). This PR adds no migration.
  - db tests for mail, catalog, cross-tenant and access: 4 files, 1,273 passed.
- The clone's tree was clean after the tests. The clone has been removed.
- `git diff --stat f7d609cc..HEAD`: 60 files changed, 1,612 insertions, 47 deletions.

## 4. The description
- `gh api .../pulls/125` .body is byte-identical to scratchpad/mail/pr-body.md. It ends exactly with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, and then https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu.
- Claims checked against the code at the head, all true:
  - `keepOriginal: { email: true }` and `writeAttributes: new cognito.ClientAttributes()` (identity.ts).
  - The fallback filter is `FilterPattern.allTerms(COGNITO_MESSAGE_FALLBACK)`.
  - `PasswordResetRequestOverFloor` is set to threshold 3 over 3600 s (security-events.ts). It is also in monitoring.ts, incident-response.md and ADR 0081.
  - The handler is Node 22, arm64, 128 MB.
  - The inline source measures 14,121 bytes, and the test caps it at 16 KiB.
  - The footer, the invitation words and the `utcMinute` password-changed lines match the PR's table.
  - The HTML snapshots have no img, link, src, url( or href. The invitation's plain-text sign-in URL is the only https.
  - SGN-13 to SGN-15 are in the test matrix, and SGN-16 is reserved for ADR 0091. ADR 0091 does not exist yet, as stated.
  - Every commit SHA in the red/green and findings tables is in HEAD, including 0582e4eb and 0e71b8db.
  - All 36 non-merge commits carry both required trailers.
  - The added lines contain no model identifier.
  - "What it does not change" holds. The diff touches nothing under packages/pricing, packages/ledger, content/, migrations, docs/product/domain-model.md, ADR 0088, .github, .gitleaksignore, LANES.md, lanes/ or HANDOFF.md.
- The local results in the Checks table (infra 793) agree with this run. The rest are the fix round's suite log (scratchpad/mail/suite.md). I did not rerun them here; CI covered them on the same head.

VERDICT: VERIFIED
