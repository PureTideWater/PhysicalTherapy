# Fresh-clone verification: #113 (cognito-confidential-client, PR 1 of 2)

- Verified on 2026-11-04, from 16:59Z to 17:20Z.
- Head: `co-001/cognito-confidential-client-pr1` at `ed4318e884569bf66ae3dcbe9e195df2ced8de5f`.
- Base: `claude/build-platform` at `c49412913d571641cf3e74f0d13036ef0174b5ba`.

## 1. Remote refs

- `git ls-remote`: the head is `ed4318e8`, as reported. The base tip is `c4941291`.
- The merge base of the head and the base is `c4941291`, which is the base tip. The base has not moved, so no re-merge is needed.
- `1234a47c..ed4318e8` holds 13 commits, as reported. `c4941291..ed4318e8` holds 20.

## 2. CI on `ed4318e8` (all finished)

| Check run | Conclusion |
| --- | --- |
| all green (required) | success |
| mutation (required) | success |
| screening-capacity gate (required) | success |
| approval-of-record (required; two runs) | success, success |
| capacity | success |
| changes (two runs) | success, success |
| domain model | success |
| lint | success |
| static | success |
| build | success |
| images | success |
| unit | success |
| db (1/4), (2/4), (3/4), (4/4) | success x4 |
| e2e (1/2), (2/2) | success x2 |
| stryker (`${{ matrix.shard }}`) | skipped (no affected shards) |
| notify | skipped |

All 4 required checks are success. Of the 22 runs, none failed and none is still running.

The capacity job's verdict, quoted:

> verdict: pass (time advisory)
> time warning (advisory): time: S4#1 S4-1 50.2 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
> time warning (advisory): time: S4#1 S4-2 52.2 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)
> time warning (advisory): time: S4#1 S4-3 52.9 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner)

The O9 note, quoted:

> sizing question for the founder (O9): the worst time, S4#1 S4-3's 52.9 s (the middle of S4's three runs), is above 44 s: the consumer's size goes to the founder before merge

The gate passed with the message "the capacity measurement passed every check but time, which is advisory here; a release's capacity run holds it binding".

## 3. Fresh clone at `ed4318e8`

The clone was made with `git clone --no-local` under the scratchpad, and has since been removed.

- `pnpm install --frozen-lockfile`, run under the lock: ok.
- `pnpm db:migrate` on a fresh database (`tp_cc113v`, PostgreSQL on 5433): 46 applied, 0 already applied.
- Auth unit tests (`vitest --project unit apps/web/src/lib/auth apps/web/src/lib/http`): 17 files, 357/357 passed.
- Auth db tests (`vitest --project db apps/web/src/lib/auth apps/web/src/lib/routes packages/db/src/seed.db.test.ts`): 45 files, 7,428/7,428 passed.
- `pnpm --filter @tp/infra test`: 27 files, 726/726 passed.
- gitleaks, run as the hook runs it:
  - binary: the pinned 8.24.3 from `~/.cache/paidwhole/gitleaks`;
  - arguments: `git --redact --exit-code 3 --config .gitleaks.toml --gitleaks-ignore-path .gitleaksignore`, with `--log-opts "--no-color --no-ext-diff --no-textconv --diff-merges=remerge c4941291..ed4318e8"`, and the hook's five plain-patch git settings set through `GIT_CONFIG_COUNT`;
  - result: 20 commits scanned, no leaks found, exit 0, and an empty report.
  - All 20 commits add lines, so the scanned count is not below the hook's count.
- `git diff --stat c4941291...ed4318e8`: 43 files, 2,989 insertions and 188 deletions. This matches GitHub's figures.
- `.gitleaksignore` is identical to the base's (`git diff --quiet` passed).
- The diff touches no migration, `content/`, domain model, `approvers.json`, `.github/`, `identity.ts`, pricing or ledger file.
- All 20 commits carry the exact `Claude-Session` trailer.

## 4. The description

- **Footer:** exact. The body ends with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then `https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu`.
- **PR state:** a draft and open. GitHub shows the head as `ed4318e8` and the base as `c4941291`.
- **Commits:** every commit in the slice table (`f2a11509`, `f31dbcca`, `007778ca`, `79f81ae7`, `b7307d76`, `23c3762d`, `1234a47c`) is in the head. Each fix-round SHA in the findings table matches `git log`.
- **Other claims checked and true:**
  - the diff role's literal deny of `DescribeUserPoolClient` and `ListUserPoolClientSecrets`;
  - `generateSecret: false` is unchanged;
  - no migration;
  - the infra count of 726;
  - 46 migrations;
  - the file and line counts.
- **Correction 1 (a false claim).** The "Screening capacity" section says "`console.ts`, `settings.ts` and `packages/db/src/seed.ts` are not in the generated list".
  - `packages/db/src/seed.ts` **is** in `tools/screening-capacity/watched-paths.txt`, at line 338, and has been since the base.
  - This PR changes it, in `f84c9b4e` and `ed4318e8`. So it belongs in "Watched files touched".
  - The claim holds for `console.ts` and `settings.ts`.
- **Correction 2 (minor).** "Watched files touched" lists `tools/screening-capacity/watched-paths.txt`. That file is not itself in the watched list. It is the generated list, changed by two lines: `credential-probe.ts` and `secret-hash.ts`.
- **Note:** `8f29abf7`, the head the checker reviewed, is not an ancestor of this head. It is #112's history, which was rebuilt here, so this is informational only.
- **Note:** the capacity job's O9 sizing question (52.9 s against 44 s) is not mentioned in the body. By its own words it goes to the founder before merge.

VERDICT: NOT VERIFIED: the description's "Screening capacity" section claims packages/db/src/seed.ts is not in the generated watched list, but it is (watched-paths.txt line 338) and this PR changes it (f84c9b4e, ed4318e8); fix the body (move seed.ts into "Watched files touched", drop watched-paths.txt from that list, and record the capacity job's O9 sizing question for the founder). Code, tests, gitleaks, .gitleaksignore and all required CI checks verified green on ed4318e8.
