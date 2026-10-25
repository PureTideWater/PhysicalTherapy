# co-001/ci-speed fix round: suite (draft PR #43)

Head **b5ff4c7401a3ce4a877a7fc158ef92c319901a4d**, pushed (9144b56..b5ff4c7, eight commits: the fixer's seven and the
suite's one). PR #43's body updated and read back identical, footer included. CI run 40196871490 on b5ff4c7 is green, and
all four required checks passed.

## 1. Adversarial re-read of 9144b56..cf70ea0

Two defects, fixed in **b5ff4c7** (`ci: both image scans keep Trivy's vulnerability database in the runner's temporary
directory ...`). Both failed first.

1. **Trivy's database was in the worker image's build context.** The single `images` job builds the web image, scans it,
   then builds the worker image from `context: .`, and the worker Dockerfile's build stage runs `COPY . .`. trivy-action
   keeps its database in `cache-dir`, which defaults to `${{ github.workspace }}/.cache/trivy` whatever `cache` says.
   `.dockerignore` does not exclude `.cache`. Run 40166129200's log shows `TRIVY_CACHE_DIR` in the workspace and
   "transferring context: 1.63GB 9.7s" for the worker build, against the checkout's roughly 16 MB.
   - Fix: both scans set `cache-dir: ${{ runner.temp }}/trivy`.
   - workflows.test.ts's images case now asserts both builds' `context: .` and both scans' `cache-dir`. It failed on
     cf70ea0's ci.yml.
   - The CI runbook and ADR 0066 Consequences say where the database goes.
   - release.yml builds each image before its own scan, so it is unaffected.
   - On CI run 40196871490: `TRIVY_CACHE_DIR: /home/runner/work/_temp/trivy`, and the worker build received 119.77 kB of
     context.
2. **The new picture-step case could skip on CI.** It ran its pictures only where `base64 -w` works, so on a runner
   without GNU base64 it would pass with half the case unrun. That contradicts the repository's "fails on CI rather than
   skip" rule (ci-chromium, gitleaks). On CI it now runs them in every case. Proved with a fake `base64` that refuses
   `-w`:
   - with `CI=true`, cf70ea0's version passed and b5ff4c7's fails;
   - without `CI`, both pass.

Checked and sound:
- Every new assertion against the real files.
- The browsers' cache key glob against the installed playwright-core 1.56.1, a real directory under pnpm's store.
- The save step's implicit `success()`.
- trivy-action's `cache` input at ed142fd (the security review read its action.yaml).
- The Postgres health check on TCP against the CI container log, where the first-run server serves only its Unix socket.
- Every write the e2e job makes before the web server's `--expect`: `node_modules/` and `.next/` (both ignored), plus
  `prepare.ts`'s directories, which are all under `os.tmpdir()`. So the dirty-tree refusal cannot fire on CI.
- The build job stamps with `git rev-parse HEAD >`, not `--write`.
- `SWALLOWS` and `reportedName` against GitHub's matrix and expression naming.
- The `OLD_NAMES_HISTORY` entries against the stale-name grep.
- The documents against the code.
- No model identifier in the diff or commit messages except the attribution lines.
- Nothing under the forbidden paths.
- No test weakened, skipped or deleted. The one removed `it(` is SF-2's sweep, renamed when it was widened.

## 2. Full local suite on b5ff4c7

Every step ran under `flock /tmp/laneb-heavy.lock`. Logs are in
/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/suite/logs/ and the
results in /tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/suite/results.tsv.
The runner script is /tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/suite/run-suite.sh.
Wall times in results.tsv include waits for the lock, which the other workflow's mutation shards held.

| # | Command | Result |
| --- | --- | --- |
| 01 | `pnpm install --frozen-lockfile` | exit 0, lockfile up to date |
| 02 | `pnpm check:fixtures` | exit 0: 234 files guarded, 2,752 searched |
| 03 | `pnpm typecheck` | exit 0: 21 projects, 21 of 21 warm, 25.9 s |
| 04 | `pnpm lint` | exit 0: 1,457 files, 0 errors, 0 warnings, 108.7 s |
| 05 | `pnpm lint:logs` | exit 0: 983 files |
| 06 | `pnpm verify-content` | exit 0 |
| 07 | `tools/check-releases-immutable.sh 49514e8` | exit 0: no published releases; 4 prompt versions unchanged |
| 08 | `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8` | exit 0: nothing under pricing/src; no problems |
| 09 | `pnpm synth --all && git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"` | exit 0: 187 cases, 0 written, 456 unchanged |
| 10 | `pnpm synth --large` | exit 0 |
| 11 | `ENGINE_FREEZE_BASE=49514e8 pnpm test` (coverage) | exit 0: 307 files, 4,659 passed, 0 skipped; thresholds met |
| 12 | `pnpm test:golden` | exit 0: 38 passed |
| 13 | `pnpm test:oracle` | exit 0: 630 fixtures agree |
| 14 | `pnpm licenses:check` | exit 0: 189 packages |
| 15 | `actionlint .github/workflows/*.yml` | exit 0, no output |
| 16 | `DATABASE_URL=...5433/postgres pnpm db:migrate && pnpm test:db` (unsharded) | exit 0: 118 files, 9,040 passed, 1 skipped (9,041), 974 s |
| 17 | `db:migrate` and `db:domain-model --check --strict --require-approval` on scratch `tp_laneb_cispeed_fix` (dropped) | exit 0: matches, approved, 0 problems |
| 18 | `pnpm test:e2e` (E2E_DATABASE=tp_e2e_laneb_fix, E2E_PORT=3197, PG18; the web server builds) | exit 0: 51 passed, none flaky, 9.6 min; brand journey 4 of 4 with its pixel baselines |
| 19 | `pnpm build`, `build-stamp.ts --write "$(git rev-parse HEAD)"`, `E2E_PREBUILT=1 pnpm test:e2e` | exit 0: tree clean after the build; `[WebServer] build-stamp: the build is b5ff4c7...'s`; 51 passed, 8.2 min |
| 20 | Stale-name `git grep -nE` (design 3.1.6) | 20 lines: 7 history lines, each matched by an `OLD_NAMES_HISTORY` entry, and 13 in tools/required-checks.ts and its test (the names held as data) |

Count notes:
- **Unit:** 4,659 = 9144b56's 4,645 plus 14 new cases (workflows 6, required checks 2, collection 1, build stamp 4,
  partition 1). CI on b5ff4c7: 4,658 passed and 1 skipped (actionlint's case).
- **db:** the same as CI's shard totals on 9144b56: 30 + 30 + 29 + 29 = 118 files, and 3,094 + 2,573 + 2,478 + 895 =
  9,040 passed, with 1 skipped. On b5ff4c7, CI's shards are identical, and their file lists hash identically.
- **The one db skip** is the restore drill on both machines: pg_dump 16 cannot dump PostgreSQL 18, and /opt/pg18 has no
  client tools.
- **e2e:** 51 = CI's 26 + 25.
- **Reported line numbers:** Playwright reports transformed line numbers (for example `brand.spec.ts:245` for a test
  declared at 205). CI's 9144b56 log shows the same, so it has nothing to do with this branch.

## 3. Push

`git push origin co-001/ci-speed` printed: "pre-push: 8 commits checked: 0 file(s) read by the fixture guard, 26 text
file(s) searched for an X12 header, and gitleaks found no secret." The branch moved 9144b56..b5ff4c7. No force, no
--no-verify.

CI run 40196871490 (head b5ff4c7; pull-request merge commit cc7e8dc):
- `all green` passed. First job start to the gate's end took 6:17; 37.6 runner-minutes.
- **Health checks:** every Postgres service reported healthy about 2 s after creation.
- **Browsers' cache:**
  - It missed in `unit` and `db`, which start together. `unit` saved it as `playwright-v1-Linux-a5c0e067...`.
  - Both e2e shards restored it. Their restore plus install took 20 s and 26 s, against 24 s and 25 s on 9144b56: apt
    varies by more than the download saves.
- **Stamp line:** each e2e shard logged `[WebServer] build-stamp: the build is cc7e8dcc881e...'s`.
- **Trivy:** the database stayed outside the workspace.
- **Required checks:** `mutation`, `approval-of-record` and `screening-capacity gate` passed (capacity measurement 16:35).
  A1′ is 16:52, set by the capacity gate.

## 4. PR #43 body

Updated with `mcp__github__update_pull_request` and read back through the REST API: identical to
/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/suite/pr/body-after.md
(39,790 characters), footer included. The generator is
/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-speed/suite/pr/edit_body.py
and the previous body is body-before.md beside it.

Only these places changed:
- **The commits paragraph.** It gains the fix round's 8752ae9, 77b8080, 6540beb, 7ef0f80, 64aa841, 7897eab and cf70ea0,
  and b5ff4c7. Its totals now read "99 files, +6,715 / -1,650 (at b5ff4c7)", so that sentence is not left false.
- **The Checks section.** It gains "### Fix round, head b5ff4c7", with 26 rows: the re-read, every suite command, the
  push and CI run 40196871490.
- **The findings table.** It has one row per finding (15), under the brief's two reviewer names. The section's stale
  "run next" sentence became the count.

## Open items

- **Stale statements left in the body.** Parts of the body outside the three edited places still describe the pre-fix
  state. I left them, as the brief limits the edit; the fix-round rows record the current state. They are:
  - the departures list's "a `pg_isready` wait before the quiet-logs step" (now the services' health checks, N-2);
  - "The harnesses create their temporary directories when a file opens" (now beforeAll, N-6);
  - the "stale-name grep, lines kept" section's line numbers (ADR 0066 :32/:188/:198 and workflows.test.ts:1199 now).
- **Browsers' cache.** On its first hits it saved 4 s on one e2e shard and none on the other. Read it again on the build
  branch's first push run, which seeds the cache for every pull request.
- **Capacity measurement.** It took 16:35 on this run, against 12:49 on 9144b56, and it sets A1′. Shortening it is the
  founder's to rule (ADR 0066).
- **Pre-existing collection leaks** outside this series (`tp-compliance-*`, `tp-pre-push-*`) and the review's leaked
  /tmp/tp-* directories remain for the orchestrator.
- **Local build left in the worktree.** /home/user/ci-speed/apps/web/.next holds the stamped build of b5ff4c7 (ignored).
