# Adversarial review: CI and test infrastructure, draft PR #43 (co-001/ci-speed)

Reviewer: CI and test-infrastructure lens. Head reviewed: `9144b56900d2a80779f55b0e5cf666e08c586247`, against
`claude/build-platform` at `49514e8`. Fresh clone at the head, plus a detached worktree at 49514e8 for the base counts,
both installed with `pnpm install --frozen-lockfile --prefer-offline`. Read-only: no commit, no push, no GitHub
comment. Every heavy command ran under `flock /tmp/laneb-heavy.lock`. Database work ran on a private PostgreSQL 18
cluster (`/opt/pg18`, port 5491, data under `/tmp/laneb-review-ci-infra-pg`, `fsync=off`), so the collection runs'
leaked databases never touched the shared 5433 cluster. The cluster was stopped and removed at the end.

## Verdict

No blocking finding. No test is lost. The shards are complete and disjoint. The gate fails on failure, skip and
cancel. The snapshot fold is exactly the old per-table string. The partition is total and deterministic. A stale or
missing build stamp is refused through Playwright's real config. A warm tsc cache cannot pass a broken tree. The lint
groups lint exactly the one-process file set. The graph meets A1 with 2:34 to spare on the head's run.

Three should-fix findings:
- the gate can still be bypassed from inside a job (`continue-on-error`), and no test stops it;
- the required-checks sweep reads only a fixed eight-file list;
- the build-stamp verdict that CI-06 rests on never reaches the log.

There are also six nits.

## Findings (most severe first)

### SF-1 (should_fix): `continue-on-error` lets a red check pass `all green`, and no test refuses it
- **Where.** `tools/test/workflows.test.ts:712-740` holds the gate's `needs`, its `if` and every job's `if`, but no rule
  looks at `continue-on-error`, at the job or the step level. `ci-gate.test.ts` tests the gate's script only.
- **Evidence.** `tools/escape-probe.sh` (in the scratchpad's `review-ci-infra-tools/`) made two edits, one at a time,
  and reverted each.
  - Edit 1: `continue-on-error: true` on the `lint` job.
  - Edit 2: `continue-on-error: true` on static's `pnpm test:oracle` step.
  - With each edit, `pnpm exec vitest run --project unit tools/test/workflows.test.ts tools/test/ci-gate.test.ts tools/test/required-checks.test.ts tools/engine-freeze/check.test.ts`
    gave `Tests 117 passed (117)`, and `actionlint` was clean.
  - A step with `continue-on-error` that fails leaves its job's conclusion `success`. So `needs.<job>.result` is
    `success`, and the gate passes a failed check.
  - The step-level escape is certain. GitHub documents the job-level flag as preventing "a workflow run from failing
    when a job fails". Whatever `needs` then reports, nothing in the tests stops either edit.
  - The design's claim "a job added later cannot escape it" holds for `needs`, but not for a job's or a step's own
    masking.
- **Fix.** Add a `workflows.test.ts` rule over ci.yml (and every workflow that backs a required check):
  - no `continue-on-error` key on any job or step;
  - no `|| true`, `|| :` or `set +e` in a `run` of a gate step.
  - Make it fail first on a fixture with each of the two edits above.

### SF-2 (should_fix): the required-checks sweep reads eight named files, not "every Markdown file", and cannot see an old-name listing
- **Where.** `tools/test/required-checks.test.ts:35-45`. The comment at `:36-37` says "Every Markdown file of the
  repository's documents, the README and the template". The code at `:39` reads a hard-coded `files` list:
  - README;
  - the PR template;
  - four runbooks and policies;
  - reconciliation-001;
  - the PRD.
- **Two gaps.**
  - `unmarkedListings` (`tools/required-checks.ts:100-105`) flags only paragraphs that name three or more of the new
    names. A stale listing of the old checks is invisible to the test anywhere: `check`, `images (web)`,
    `images (worker)` and `licenses`. Only the manual stale-name grep catches it.
  - Any document outside the eight files escapes even the new-name check. That includes every ADR but 0063 and 0066,
    every other runbook, `CLAUDE.md`, `.claude/**` and the test matrix.
- **Evidence.** The same probe appended two paragraphs to the tracked `docs/runbooks/deploy-and-rollback.md`:
  - `` Require `all green`, `mutation`, `screening-capacity gate` and `approval-of-record` before merging. ``
  - `` The old set: `check`, `images (web)`, `images (worker)`, `licenses` and `approval-of-record`. ``
  - With both in place, `pnpm exec vitest run --project unit tools/test/required-checks.test.ts` gave `Tests 13 passed (13)`.
  - The edit was reverted, and `git status` was clean.
- **Fix.**
  - Enumerate `git ls-files '*.md'` (fixtures and `node_modules` excluded) in place of the fixed list.
  - Add an old-name detector: a paragraph with two or more of `` `check` ``, `` `images (web)` ``,
    `` `images (worker)` `` and `` `licenses` `` outside a dated amendment or history paragraph.
  - Or turn the §3.1.6 stale-name grep into the test itself, with the eight history lines as its allowlist.
  - Make it fail first on the probe's two paragraphs.

### SF-3 (should_fix): the build-stamp verdict that CI-06 rests on is never in the log
- **Where.**
  - `apps/web/scripts/build-stamp.ts:68` writes its pass line (`build-stamp: the build is <sha>'s`) to stdout.
  - `apps/web/playwright.config.ts:103` sets the web server's `stdout: 'ignore'`, so the line is dropped. Only a refusal
    reaches the log, through stderr (`:104`, `pipe`).
- **Evidence.**
  - Job 121087708776 (`e2e (1/2)`, run 40166129200) holds no `build-stamp` line.
  - The only sign that the prebuilt path ran and no rebuild did is timing: Playwright started at 05:38:38, and
    "Running 26 tests" came at 05:39:05.
  - Design §3.1.1 says "Every verdict a gate prints goes to the log". The verifier reads results only with
    `get_job_logs`.
- **Fix.**
  - Write the pass line to stderr in `build-stamp.ts`'s CLI branch. Playwright shows piped web-server stderr as
    `[WebServer]` lines, as the refusals below do.
  - Or add a step before the journeys: `echo "web-build stamp $(cat apps/web/.next/BUILD_COMMIT), checkout $(git rev-parse HEAD)"`.
  - Then hold it in `workflows.test.ts` (CI-06).

### N-1 (nit): e2e shard 1 holds the 3-minute monitoring journey and sets the critical path
- **Evidence.** Run 40166129200:
  - `e2e (1/2)` ran 26 tests in 4.8 min, including `monitoring.spec.ts:54` (3.0 min), which started 20th, and
    `packets.spec.ts:66` (50.6 s).
  - `e2e (2/2)` ran 25 tests in 3.3 min.
  - Shard 1 ended at 05:43:34 and the gate at 05:43:38: it is the critical path.
  - Playwright 1.56 shards by test count in file order. `--list --shard=1/2` at the head puts `monitoring.spec.ts` in
    shard 1.
- **Fix (optional, A1 is met).** Either of:
  - three e2e shards on public runners too (about 17 tests each, roughly a minute off the wall for about 1.5 more
    runner-minutes);
  - splitting `monitoring.spec.ts` so its long journey is not in the heavier half.
  - Also: the `playwright install --with-deps chromium` step costs 18-29 s in each of seven jobs, 24 s of it on the
    critical path. A browser cache keyed by the Playwright version would trim it.

### N-2 (nit): the `domain model` job's Postgres has no readiness wait or health check
- **Where.**
  - `ci.yml:297-325`: the job goes from install straight to `pnpm db:migrate`.
  - `db` (`:240`) and `e2e` (`:388`) loop on `pg_isready`.
  - None of the three `services.postgres` blocks has `options: --health-cmd ...`, so GitHub does not wait for
    readiness.
- **Evidence.** Job 121087436598: the container was ready at 05:36:23 and migrate ran at 05:36:35. Today about 13 s of
  setup hides the race. A faster setup (cache hits) narrows it.
- **Fix.** Add
  `options: --health-cmd "pg_isready -U postgres" --health-interval 2s --health-timeout 5s --health-retries 30` to all
  three services. GitHub then starts the steps only once Postgres is healthy, and the two loops can go.

### N-3 (nit): ci.yml's header says pull requests never write caches; they do, in their own scope
- **Where.** `ci.yml:5-6`: "a pull request may restore its base branch's caches but never writes them".
- **Evidence.** In run 40166129200:
  - `static` logged "Cache saved with key: tsc-v1-Linux-8ab1…-a43b3635…" (the PR's merge commit);
  - each `db (k/4)` logged "Cache saved with key: vitest-db-v1-Linux-4-k-a43b…";
  - the run's tsc restore hit `…-60e6c36…`, the first run's PR-scoped save.
  - `docs/runbooks/ci.md:143-144` states this correctly.
- **Fix.** Reword the comment: a pull request writes caches only to its own scope; push runs seed the base branch's,
  which every pull request can restore.

### N-4 (nit): ADR 0066 says the unit count equals the base's; it is the base's plus this PR's tests
- **Where.** `docs/adr/0066-…md:161-163`: "unit, golden and e2e counts equal 49514e8's (unit 4,524 and 1 skipped".
- **Evidence.** Unit is 4,644 passed + 1 skipped on CI (job 121087436812) against the base's 4,524 + 1. By full name:
  - 132 tests are new and 12 are renamed, for a net +120;
  - design A2 reads "Unit count = base + the new unit tests".
- **Fix.** "Unit: 49514e8's 4,524 + 1 skipped, plus this PR's 132 new tests less 12 renamed (net +120); golden and e2e
  equal."

### N-5 (nit): the stamp proves the commit, not the tree, so a local dirty tree runs a stale build
- **Where.**
  - `build-stamp.ts:38-51` compares the commit only.
  - `docs/runbooks/ci.md:154-155` recommends the local flow `pnpm build; git rev-parse HEAD > apps/web/.next/BUILD_COMMIT; E2E_PREBUILT=1 pnpm test:e2e`.
  - That flow accepts a build that predates later uncommitted edits.
- **Scope.** CI is unaffected, because its checkout is clean.
- **Fix.** Either of:
  - `--write` also records a hash of `git status --porcelain`/`git diff HEAD`, and `--expect` compares it;
  - `--expect` refuses a dirty tree off CI.

### N-6 (nit): two of this PR's new tests leak a temporary directory on every collection run
- **Where.**
  - `tools/test/ci-gate.test.ts:36` and `tools/test/workflows.test.ts:186` call `mkdtempSync` at module load.
  - They remove the directory only in `afterAll`, which `vitest list` never runs.
- **Evidence.**
  - The head's `vitest list --no-staticParse --project unit` left `/tmp/tp-ci-gate-NVVOoh` and `/tmp/tp-workflows-e7GWqn`.
  - The base's list left neither.
  - Commit 741d744 claims the new tests leave nothing behind on collection. That holds for S2's route and screening
    harnesses: the base's db list leaked `tp-route-tests-*`, and the head's does not.
  - The other leaked prefixes are pre-existing, in both trees: `tp-par-test`, `tp-*-routes`, `tp-content-root`,
    `tp-large-zip`, `tp-pre-push-*` and others.
- **Fix.** Create the scratch directory in a `beforeAll`, as `world.ts` and `test-support/consumer.ts` now do.
- **Cleanup note.** The 52 leaked directories my four collection runs created are still in `/tmp`. The shared-`/tmp`
  sweep was refused by the permission classifier. Their mtimes are 06:08:30-06:13:20 and 06:24:30-06:27:30, UTC on
  2026-10-25. The orchestrator may remove them.

## Checklist, with every check run

### (1) A2: no test lost
- **Unit.**
  - `flock … pnpm -s vitest list --no-staticParse --project unit --json=…` was run on both trees. Base: 4,522 listed in
    298 files. Head: 4,642 in 306 files.
  - Compared by file and name (`review-ci-infra-tools/count.mjs`), 12 names exist only in the base:
    - 10 in `workflows.test.ts`;
    - 1 in `check.test.ts`;
    - 1 in `differential.test.ts`.
  - Each has a renamed successor that asserts the same thing on the new graph. For example, "build and scan both
    images on every pull request" became "builds and scans both images in one job…", and "job timeouts > give every
    job of the pull-request workflows a timeout" became "job timeouts (CI-10) > give every job of every workflow…".
  - 132 names exist only in the head, and the moved route-count case is among them, now in `route-tests/partition.test.ts`.
  - CI on the head (job 121087436812): 306 files, 4,644 passed and 1 skipped. That is the base's 4,524 + 1 plus 120.
    The run-versus-list offset of +3 is the same on both trees.
  - The 1 skipped is the actionlint case, as at the base. The first run's 3 extra skips (the gitleaks cases) are gone.
- **Database.**
  - `flock … pnpm -s vitest list --no-staticParse --project db --json=…` was run on both trees, on the private cluster.
    Base: 9,042 tests (9,041 + 1 skipped) in 105 files. Head: 9,041 in 118 files.
  - By full name, with the named moves folded (`count-db.mjs`):
    - only in the base: the route-count case (now unit) and the approval case "carries the founder's approval of
      exactly this text…" (now the `domain model` job);
    - only in the head: the snapshot case.
  - **Route tests.** 6,870 at the base, in `route-tests.db.test.ts`, the route-count case included. The head has
    6,869 across the twelve files (575 / 537 / 568 / 559 / 569 / 598 / 605 / 571 / 568 / 569 / 587 / 563), plus the
    route-count case in `partition.test.ts`, names identical. The brief's "6,293 cases" does not match either tree.
  - **Bodies.** A whitespace- and `worlds.`-normalised diff of the base's `describe.each` blocks against `define.ts`
    gives 188 lines each. The only difference is the internal-roles block, which now iterates the file's own practice
    routes. No body was weakened.
  - **SCR-19.** Moved verbatim apart from `screening.`/`database` qualifiers (base `consumer.db.test.ts:500-554`
    against `consumer-lease.db.test.ts:60-114`). `consumer.db.test.ts` went from 5 tests to 4, and the lease file has 1.
  - **Approval.** `domain-model.db.test.ts` went from 2 tests to 1, the drift case kept.
    `packages/db/src/cli/domain-model.ts:179-188` runs the same `documentApprovalProblems(existing, generated.sha256, { approvers })`.
    The compliance evidence moved to the CI step (`controls.ts:308`).
  - **CI.** The four shards together ran 3,094 + 1 skipped, 2,573, 2,478 and 895, which is 9,040 + 1 = 9,041.
- **Golden.** CI static: 4 files, 38 passed, equal to the base's 38.
- **e2e.** `flock … ./node_modules/.bin/playwright test --list` gave 51 tests in 25 files on both trees, and the
  sorted names diff is empty. CI: 26 + 25 = 51 passed, none flaky or skipped (jobs 121087708776 and 121087708804).

### (2) The db shards
- **The head's run.** The four "Files this shard ran" lists from jobs 121087436740, 121087436786, 121087436749 and
  121087436735 hold 30, 30, 29 and 29 files.
  - My copies reproduce the SHA-256 values the logs printed: e82eeab2…, 3974f15f…, d0fd4612… and 98cb8217….
  - They are disjoint (`uniq -d`: 0).
  - Their union equals `pnpm -s vitest list --project db --filesOnly` at the head (118 files, `diff` empty).
- **N = 4 and 6.** In the focused run below, `tools/test/db-shards.test.ts` passed, including its negative control
  (the dropping sequencer).
  - `db-shards.ts` mirrors vitest's own call path: `pool.executeTests` calls `sequencer.shard(specs)` and then
    `sort()` (`vitest/dist/chunks/index.B8VfM7Mf.js:6056-6060`), and `BaseSequencer.shard` sorts by the SHA-1 of the
    path (`:7740-7751`).
  - `SlowFirstSequencer` overrides `sort()` only.
- **Migrations.** Every shard runs `pnpm db:migrate && pnpm test:db --shard=…` on its own `services.postgres`. That is
  one cluster per job, so no state is shared across shard jobs.
- **Catalog and cross-tenant.** `catalog.db.test.ts` ran in shard 2 and `cross-tenant.db.test.ts` in shard 1.
  `db-shards.test.ts:160` holds both in the project.
- **Balance.** The test steps took 2:53, 2:35, 3:41 and 1:37, with consumer-lease at 198 s in shard 3. This is not on
  the critical path, and A3 holds: the route files took 43-60 s, at most 90 s each, and the slowest db file took
  198 s, under 240 s.

### (3) The snapshot fold
- **Reading.**
  - `world.ts:138-144` builds one `SELECT array_to_string(ARRAY[...]::text[], E'\n')` from `tenantTables()`. Each line
    is `'<table>:' || coalesce((SELECT md5(coalesce(string_agg(t::text,'|' ORDER BY t::text),'')) …), '')`.
  - One statement means one snapshot. The per-table oracle, `perTableSnapshot()` (`world.ts:661-674`), is
    byte-identical in its SQL text and its join to the base's `snapshot()` (`route-tests.db.test.ts:537-557`).
  - `tenantTables()` (`packages/db/src/catalog.ts:523-533`) reads the registry plus every `public` table with a
    `practice_id` column at run time, so a new table joins without a code change.
  - The tenant column is always `practice_id`, or `id` for the practice table: one uuid parameter type.
- **Running.** `flock … pnpm exec vitest run --project db apps/web/src/lib/routes/route-tests/snapshot.db.test.ts apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts`
  on the private cluster gave 2 files and 576 passed in 49.9 s. CI ran `snapshot.db.test.ts` in shard 4.

### (4) The partition
- `partition.test.ts`, 8 tests, passed in the focused run. It covers:
  - every route in exactly one file, and none empty;
  - determinism;
  - the balance bound (at most one route's cost);
  - the directory holding exactly the 12 two-line files.
- `partitionRoutes` (`partition.ts:30-48`) is a stable LPT: cost descending, then registry index, lowest file on a
  tie. CI durations were 43-60 s per file, and the tests per file ran 537-605.

### (5) The gate
- **Script.** `ci-gate.test.ts` runs the workflow's own `run` text under `bash --noprofile --norc -eo pipefail`. It
  covers success, failure, skipped, cancelled, two failures and an empty `needs`. It passed.
- **Needs.** `workflows.test.ts:712-740` pins the job list to `JOBS` and the gate's `needs` to `JOBS` minus the gate,
  and forbids any other job's `if`. A job added later fails the test until the gate needs it.
- **On CI.** The first run, 40165045853, was red on `static` and `unit` with the other ten green, and its gate failed.
  The head's run is green.
- **Gap.** SF-1: masking inside a job.

### (6) E2E_PREBUILT
- **Probe.** `review-ci-infra-tools/prebuilt-probe.sh` ran through the real `playwright.config.ts`: `CI=1 E2E_PREBUILT=1`,
  `smoke.spec.ts`, prepare on the private cluster.
  - No stamp: refused with `[WebServer] build-stamp: no build stamp at …/apps/web/.next/BUILD_COMMIT …`, then
    "Process from config.webServer was not able to start".
  - A stamp of 49514e8: refused with `… was made from 49514e8ed82e…, not 9144b56900d2…: refusing to run a build of another commit`.
  - `apps/web/.next` was removed afterwards.
- **No e2e environment at build time.** The `build` job builds with none: `workflows.test.ts:1019`, and `ci.yml:329-358`
  shows no E2E or TP_ variable. The ADR's three-build diff is the measured basis (`docs/adr/0066-…md:164-172`). I did
  not re-measure it.
- **Baselines.** All brand tests ran in `e2e (1/2)`, including `brand.spec.ts:363` with the seal and cover pictures.
  They passed under the same `playwright install --with-deps chromium` step as the base, and the `playwright-1`
  artifact held 15 files.
- **Gap.** SF-3: the passing stamp is not logged. N-5: commit, not tree.

### (7) Timeouts, caches, concurrency and ranges
- **Timeouts.** The CI-10 table covers every job of every workflow (`workflows.test.ts:1242-1263`). The measured
  durations against those limits:

  | Job | Measured | Limit (min) |
  |---|---|---|
  | `static` | 2:20 | 15 |
  | `lint` | 1:25 | 15 |
  | `unit` | 2:41 | 20 |
  | `db` (slowest shard) | 4:40 | 20 |
  | `domain model` | 0:30 | 10 |
  | `build` | 1:32 | 15 |
  | `e2e` (slowest shard) | 5:48 | 25 |
  | `images` | 3:27 | 20 |
  | `all green` | 0:02 | 5 |

- **Cache keys.**
  - The tsc key `tsc-v1-<os>-<lock>-<sha>` restores by prefix. Save is skipped on an exact hit, so a re-run does not
    collide on the key. The compressed archive is about 0.6 MB (633,517 B on CI), and the raw directory is 6.1 MB
    locally.
  - The durations cache is keyed by width and shard. It only orders files: `BaseSequencer.sort`, with membership fixed
    by `shard()`.
- **What a stale cache can do.** `review-ci-infra-tools/tsc-cache-probe.sh`, under the lock, ran six steps:

  | Run | Exit | Wall | Cache | Checking |
  |---|---|---|---|---|
  | Cold | 0 | 59.4 s | 0 of 21 warm | 145.49 s |
  | Warm | 0 | 22.1 s | 21 of 21 warm | 0.00 s |
  | Broken, warm | 1 | 50.9 s | 21 of 21 warm | 105.87 s |
  | Same broken tree, unchanged | 1 | 23.9 s | 21 of 21 warm | 0.00 s |
  | Fixed | 0 | 48.5 s | 21 of 21 warm | 104.76 s |

  - The "broken" step added a TS2322 to `packages/money/src/index.ts`. That run failed 15 projects, every dependent
    included, each with the same `TS2322`.
  - The unchanged re-run still failed with the same 15 TS2322 errors: the errors are replayed from the cache.
  - The file was reverted by trap, and `git status` was clean. A stale cache can only cost time.
- **Concurrency.**
  - The group is `${{ github.workflow }}-pr-<n>` or `-<sha>`.
  - `cancel-in-progress` is true on pull requests only.
  - Every workflow's group starts with its name (`workflows.test.ts:1266-1291`).
- **Ranges.** The push range is `github.event.before`, with the zero SHA falling back to `HEAD^1` and an absent
  previous head refused. Both scripts are run in a temporary repository by `workflows.test.ts:828-852` and `:884-898`.
  On CI the PR range is `origin/claude/build-platform..HEAD` (static log). No push run exists yet.

### (8) The lint and typecheck runners
- **Lint coverage.** `review-ci-infra-tools/lint-files.mjs` uses ESLint 10.12's own `lintFiles`, with the repository's
  config, `ruleFilter: () => false` and no project service.
  - `.` alone: 1,456 files.
  - The groups: `apps/web` 560, `packages` 450, and `.` with the two roots ignored 446.
  - The union is 1,456: no duplicate, no missing, no extra.
  - CI's lint log agrees: 560 + 450 + 446 = 1,456, with a budget of 13,941 MB on 15,989 MB. Two groups ran at once,
    with peaks of 2,180 to 2,689 MB, in 63.8 s.
- **Typecheck.** The runner checks the root and every pnpm workspace (`run.test.ts`, which compares with `pnpm ls -r`),
  each with its own `tsc --noEmit` plus `--incremental` and `--tsBuildInfoFile`.
  - Locally, cold, the peaks were 1,937 MB (web), 1,572 MB (tools), 1,104 MB (worker) and 876 MB (infra).
  - That fits 2,048 MB per process: 4 at once on 16 GB and 2 on 8 GB (`typecheckConcurrency`, tested).
  - The 8 GB lint plan (each group alone, web capped at 5,837 MB) is tested in `groups.test.ts`.

### (9) Stale names, and the required-checks test
- `git grep -nE 'ci / check|`check` \(the|five (green )?checks|images \(web\)|images \(worker\)|supply-chain\.yml'` at
  the head returns 8 lines, all history or tests: ADR 0010:17 and :71; ADR 0063:486; ADR 0066:32, :181 and :190;
  `required-checks.test.ts:72`; `workflows.test.ts:1107`.
- A wider search for `` `check` `` and "check job" finds only history lines: ADR 0063:226 and ADR 0066:19, :33 and :152.
- Gap: SF-2.

### (10) A1
- Run 40166129200 on the head had every job green.
- **Wall.** 7:26, from the first job's start at 05:36:12 to the gate's end at 05:43:38.
- **Queue.** 0:02 (created 05:36:10).
- **Critical path.** `build` (05:36:12-05:37:44), then `e2e (1/2)` (05:37:46-05:43:34), then the gate.
- **Runner time.** About 36.4 runner-minutes, 43 billed.
- **The first run.** Run 40165045853 on bbcafa0 took 7:43, red as expected.
- **Margin.** 2:34 to the 10:00 target. N-1 says where the next minute is.
- **Still to come.** A1's median over the PR's last three heads and the first five push runs is not yet measurable:
  one green head, and no push run. A1′ was 13:06, set by the capacity gate, as expected.

## Other checks run
- `actionlint .github/workflows/*.yml`: clean (also run inside each escape-probe edit).
- `flock … DATABASE_URL=…5491 pnpm exec vitest run tools/test tools/lint tools/typecheck packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts`
  (design §3.1.7): 37 files, 456 passed, in 26.9 s.
- GitHub: `actions_list list_workflow_jobs` for runs 40166129200 and 40165045853, `get_check_runs` for PR #43, and
  `get_job_logs` for every ci.yml job of 40166129200 (the static, lint, unit, four db, domain model and two e2e logs
  were read).

## Cleanup
- The clone, the base worktree and the private PostgreSQL cluster were removed. My TMPDIR `/tmp/lbrv-e2e` was removed.
- Left behind: the 52 collection-leaked `/tmp/tp-*` directories (N-6 cleanup note). Logs and scripts remain in the
  scratchpad, under `ci-speed/review-ci-infra-logs/` and `ci-speed/review-ci-infra-tools/`.
