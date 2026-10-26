# PR #48 (co-001/ci-deps) fresh-clone verification

Head 7b6b10be742e2d6cf5992a3a3bda8221b7513a28, base claude/build-platform d72597757ba2 (merge base = base tip). Run 2026-10-26 ~20:55-21:05 UTC.
Clone: scratchpad/ci-deps/verify (removed after). Toolchain: pnpm 10.34.8, node 24. Logs: scratchpad/ci-deps/v-*.log.

**Result: PASS** (no failure).

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Clone and install | `git clone`, `git checkout 7b6b10be`, `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline` | done, frozen lockfile accepted |
| 2a | Scope | `git diff --stat origin/claude/build-platform...HEAD`; `git diff --name-only ... -- packages/pricing packages/ledger packages/db/migrations content tools/verify-content .claude/hooks/protect-content.sh docs/product/domain-model.md` | 86 files (+7,227/-831); none of the forbidden paths |
| 2b | publish-content.yml vs base | `git diff base...HEAD -- .github/workflows/publish-content.yml` | only `+timeout-minutes: 15` and three `uses:` lines (checkout v7.0.1, action-setup v6.1.0, setup-node v7.1.0) to SHA with version comments |
| 2c | Frozen copy | `diff <(git show 49514e8:.github/workflows/publish-content.yml) tools/test/frozen/publish-content.yml` | only `> timeout-minutes: 15`; `runs-on: ubuntu-24.04` |
| 2d | Domain model | `pnpm -s db:domain-model --summary-since origin/claude/build-platform` (no DB needed) | "No change: the two documents have the same text"; SHA-256 6d7a143d... both; no function file changed |
| 3a | Licence commit | `git rev-list --reverse base..HEAD \| head -1`; `git show --stat 0e7776c8` | first commit 0e7776c8 (parent 6ddd587 on base); only package.json (packageManager 10.28.0 -> 10.34.8), tools/check-licenses/allowlist.json (musl entry removed), pnpm-lock.yaml |
| 3b | Lockfile libc | `git diff --numstat 0e7776c8^ 0e7776c8 -- pnpm-lock.yaml`; `grep -c '^ *libc: \['` at ^ and at commit; `grep '^+ ' \| sort \| uniq -c` | `43 0`; 0 and 43; 27 `libc: [glibc]`, 16 `libc: [musl]` |
| 3c | Gates commit | `git show 6eae41a` | only pnpm-workspace.yaml: minimumReleaseAge 4320, minimumReleaseAgeExclude [], trustPolicy no-downgrade, trustPolicyExclude [semver@6.3.1] (+ comments) |
| 3d | Resolution commits after 6eae41a | `git log --format='%h %cI %P' 6eae41a..HEAD ^base -- pnpm-lock.yaml pnpm-workspace.yaml package.json '*/package.json' '**/package.json'` | lockfile/resolution changes: a893c0e 19:24:14Z, f3e5dc4 19:25:19Z, ee693d1 19:25:46Z, f011014 19:26:17Z, 645263c 19:28:10Z, a2f24e6 19:28:43Z, all after 19:18:50Z. Earlier hits change no resolution: 0458989 (two scripts), 438df38 (packageManager sha512 suffix, same 10.34.8). Merges 68c6db1, dcefde8, cdab194 change neither lockfile nor workspace against their first parent (base merges' own commits excepted) |
| 4a | Action pins | `BASE=origin/claude/build-platform pnpm actions:check` | exit 0, "every action is pinned to its release's commit.", no warnings |
| 4b | Toolchain | `BASE=origin/claude/build-platform pnpm toolchain:check` | "passed, 0 error(s), 0 warning(s)"; 614 entries by integrity; 47 added versions, each >= 3 days old, integrity and trust ok; 1 trust exclude; 1 override |
| 4c | Audit | `pnpm audit --prod`; `pnpm audit --audit-level=high` | "No known vulnerabilities found", exit 0 both |
| 4d | MinIO | `git grep -n -i minio -- ':!pnpm-lock.yaml' ':!docs/adr/0066-*'` | empty (exit 1) |
| 5 | CI on 7b6b10b | GitHub check-runs + `get_job_logs` | all green; see below |
| 6a | Attribution | last two non-empty lines of each of the 71 commits in base..HEAD | all 71: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01TztFLKnDUJniegCFmkfMoc` |
| 6b | Model identifiers | `git diff base...HEAD \| grep '^+' \| grep -iE 'claude-(opus\|sonnet\|haiku)\|opus[- ][0-9]\|...\|us\.anthropic'` | none |
| 6c | gitleaks | `gitleaks git --redact --log-opts=d7259775..HEAD .` (8.24.3, repo .gitleaks.toml) | 64 commits scanned, no leaks, exit 0 |
| 6d | pre-push over range | `.githooks/pre-push` with stdin `<ref> 7b6b10b <ref> d7259775` | exit 0: "every commit this push sends is already on the remote; nothing to check" (the push-time run is the record) |

## CI on 7b6b10b (all success)

Required: `all green` 121841762099 (ci run 40397394730); `mutation` 121841703889 (run 40397394695; seven stryker shards green: money-ledger, pricing-engine, pricing-recompute, pricing-rest, packets-explain, packets-scan, packets-rest); `screening-capacity gate` 121840672278 (run 40397394713, capacity 121834031590); `approval-of-record` 121833934808 (run 40397394625) and 121837082652 (run 40398290893).
release-dry-run run 40397394633: build 121833935814, push 121835010849, capacity 121835010757, all success. content-calendar check 121833937111 success.
ci.yml jobs: static 121833937408, lint 121833937585, unit 121833937321, db 1-4, domain model 121833937440, build 121833937451, images 121833936955, e2e 1-2, all success.

| Suite | Head 7b6b10b (job) | Base d7259775 push run 40339580259 (job) | Difference |
|---|---|---|---|
| unit | 6,265 passed, 1 skipped, 377 files (121833937321) | 6,154 passed, 1 skipped, 366 files (121630282369) | +111 tests, +11 files |
| db 1/4 | 3,151 + 1 skipped, 32 files, list f9d61045 (121833937549) | 3,151 + 1 skipped, 32 files, f9d61045 (121630282300) | 0 |
| db 2/4 | 2,615, 32 files, a8aa1eef (121833937441) | 2,615, 32 files, a8aa1eef (121630282228) | 0 |
| db 3/4 | 2,534, 32 files, 5f84496f (121833937305) | 2,534, 32 files, 5f84496f (121630282181) | 0 |
| db 4/4 | 922, 31 files, 22945585 (121833937499) | 922, 31 files, 22945585 (121630282339) | 0 |
| db sum | 9,222 + 1 skipped, 127 files | 9,222 + 1 skipped, 127 files | 0 |
| e2e 1/2, 2/2 | 27 (121834768445), 27 (121834768472) = 54 | 27 (121631082512), 27 (121631082468) = 54 | 0 |
| golden (static) | 376 passed, 5 files (121833937408); oracle 687 agree; licences 185 ok | not compared (not asked) | - |

**The +111 unit tests**, accounted by the PR's own test changes (the declarations `it(`/`test(` in base vs head of each unit test file the PR changes; the sum equals CI's difference exactly):
new files (11, = +11 files): check-action-pins/buildkit 3, check 10, verify 14, workflows 4; check-toolchain/check 28, install-pnpm 3, registry 7, tree 2; ci/postgres 5; test/dependabot-config 7; test/no-duplicated-versions 7 (= 90);
existing files: test/workflows.test.ts 79 -> 96 (+17 net, after removing the three replaced tests: describe('dependabot')'s one, "the Postgres services", the form test); check-licenses/check 5 -> 8 (+3); screening-capacity/measure 14 -> 15 (+1); watched.test.ts and collection.test.ts changed with no count change (= +21).
db and e2e are unchanged: the PR's only db test change is a comment in restore-drill.db.test.ts; the db file lists' SHA-256s are identical shard by shard.

Note: the PR description's "No test lost" paragraph still gives the round-0 sum against 6ddd587 (4,996 + 88 - 3 = 5,081) rather than this head's CI figures against d7259775; the figures above are CI's on the merging head.
