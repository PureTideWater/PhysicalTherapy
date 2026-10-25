# Scout report: CI structure and duration (audit #109) and every required-check name

Scout: ci-structure. Base: `claude/build-platform` at 49514e8 (read in `/home/user/PhysicalTherapy`, experiments in a
detached worktree at `scratchpad/ci-structure-wt`, now removed). Date 2026-10-24. Read-only research and bounded
measurement; nothing pushed, posted or committed.

## 1. In one paragraph

CI is one serial job (`ci / check`) of 29 to 41 minutes. Two thirds of it is the database step (15.7 to 23.9 min), and
that step's wall clock is one file, `apps/web/src/lib/routes/route-tests.db.test.ts` (865 to 1,336 s, about 6,900
tests). The audit blamed that file's ~390,000 snapshot queries; measured, the snapshots are only 8% of the file. The
real cost is building 688 synthetic worlds one after another, and about two thirds of each world is three
worker-thread PDF reads of the same deterministic synthetic contract. If the PDF read runs once per distinct document
per file, and each snapshot folds into one statement, the file's work halves (131 s down to 67 s on a 1/12 slice, all
606 tests passing). Split into 12 files, it stops being the long pole. The next floor is
`apps/worker/src/screening/consumer.db.test.ts` (206 to 227 s, nearly all one lease-expiry test). With the database
suite in 4 shards, e2e in 2 shards over one Next build, lint in bounded-memory groups, incremental typecheck and a
single `all green` gate, the estimated wall clock is about 6.5 to 8 minutes on the free 4-vCPU runner, at about the
same runner-minutes as today. A pull request that touches a watched path still waits on the separate
`screening-capacity gate`, which takes 13 to 16 minutes and is outside ci.yml. No ruleset exists on GitHub today
(`gh api repos/PureTideWater/PhysicalTherapy/rulesets` returns `[]`), so renaming `check` now breaks only repository
text and tests (listed in section 8), not a live setting.

## 2. What exists today

- `.github/workflows/ci.yml:12-112`: one job `check`, `ubuntu-24.04`, `timeout-minutes: 60`, a `postgres:18` service.
  Its 27 steps run in this order: checkout (fetch-depth 0), pnpm, node 24 (pnpm cache), python 3.12, quiet Postgres
  logs, install, the domain-model summary, pyx12, `pnpm audit --prod`, gitleaks, `check:fixtures`,
  `pnpm typecheck && pnpm lint && pnpm lint:logs`, `verify-content`, releases-immutable, Engine freeze (which sets
  `ENGINE_FREEZE_BASE`), `synth --all` with its diff, Playwright Chromium, `pnpm test && pnpm test:golden &&
  pnpm test:oracle`, `pnpm db:migrate && pnpm test:db`, `pnpm test:e2e` (`if: !cancelled()`), artifact upload,
  base64 diff print (`if: failure()`), `pnpm build`, `pnpm cdk:diff`.
- The other seven workflows: `supply-chain.yml` (jobs `licenses` and `images (web|worker)`, 15 min timeouts),
  `approval-of-record.yml` (job `approval-of-record`, 5 min), `screening-capacity.yml` (`changes`, `capacity`,
  `screening-capacity gate`, `notify`), `mutation.yml` (`mutation`, 120 min), `large-zip.yml`, `publish-content.yml`
  (no timeout; not on pull requests), `release.yml` (`build`, `capacity`, `push`, `report`).
- `package.json:12-23`. `typecheck` is `tsc --noEmit -p tsconfig.json && pnpm -r --workspace-concurrency=4 typecheck`,
  where pnpm sorts topologically, so the tail runs worker, then tools, then web, one after another. Each of the 20
  workspaces runs `tsc --noEmit`, and only `apps/web/tsconfig.json` sets `incremental`. `lint` is
  `node --max-old-space-size=8192 node_modules/eslint/bin/eslint.js . --max-warnings=0`. `test` is
  `vitest run --project unit --coverage`. `test:db` is `vitest run --project db`.
- `vitest.config.ts:20-61`. Three projects: unit (`*.test.ts(x)` except db and golden), db (`*.db.test.ts`, 30 s test
  and hook timeouts, `--expose-gc`) and golden. Coverage thresholds set 100% branches on four globs. Vitest 5's default
  `maxWorkers` in run mode is `availableParallelism() - 1` (`node_modules/vitest/dist/chunks/index.B8VfM7Mf.js:1622-1625`),
  so 3 files at once on the 4-vCPU runner.
- `eslint.config.js:95-164`. One flat config with `tseslint.configs.recommendedTypeChecked` and
  `parserOptions.projectService: true`: typed lint, one TypeScript program per owning tsconfig.
- `apps/web/playwright.config.ts:58-118`. `fullyParallel: true`, `retries: CI ? 1 : 0`, reporters list and html, one
  chromium project. The `webServer` command is `tsx e2e/prepare.ts && pnpm run build && start-standalone.sh` with a
  300 s timeout, so every e2e run does a full Next build. `e2e/prepare.ts` drops and recreates `tp_e2e`, migrates,
  loads release 900001, seeds and creates pg-boss queues.
- `docs/runbooks/github-governance.md:289-300` names five required checks: `check`, `images (web)`,
  `images (worker)`, `licenses`, `approval-of-record`. `docs/runbooks/screening-capacity.md:308-320` adds
  `screening-capacity gate` (the founder's Q8). None of these is set on GitHub yet, and HANDOFF.md:54 records the
  ruleset question as unanswered.

## 3. Measured on GitHub (item 2)

Source: `gh api repos/PureTideWater/PhysicalTherapy/actions/runs/<run>/jobs` (step timestamps), plus the job logs from
`mcp__github__get_job_logs` (return_content, tail 20000), saved and ANSI-stripped at `scratchpad/ci-design/logs/pr39.txt`
and `pr42.txt`.

| Step (ci / check) | PR #39, run 39971478729, job 120475009638, head 6441c5a, success | PR #42, run 40018476585, job 120636573742, head 13f59b1, failure |
|---|---|---|
| Set up job + Initialize containers | 1 s + 10 s | 2 s + 7 s |
| checkout / pnpm / setup-node / python | 2 / 1 / 8 / 0 s | 2 / 1 / 7 / 0 s |
| quiet psql / pnpm install | 0 / 3 s | 0 / 3 s |
| domain-model summary / pyx12 / audit | 1 / 2 / 0 s | 1 / 4 / 0 s |
| gitleaks / check:fixtures | 2 / 0 s | 1 / 1 s |
| typecheck && lint && lint:logs | **3:08** (typecheck 85 s, lint 100 s, lint:logs 2 s) | **2:18** (62 s, 75 s, 1 s) |
| verify-content / releases-immutable / freeze | 1 / 0 / 1 s | 1 / 0 / 1 s |
| synth --all / its diff | 3 / 0 s | 2 / 0 s |
| playwright install --with-deps chromium | 19 s | 22 s |
| test && test:golden && test:oracle | **4:31** (unit 197 s, golden 14 s, oracle 57 s) | **3:15** (148 s, 9 s, ~37 s) |
| db:migrate && test:db | **23:54** (1,432 s, 105 files) | **15:40** (939 s, 108 files; failed only on the approval case, as expected) |
| test:e2e | **8:26** (90 s server prep, then 51 tests in 6:56 on 2 workers) | **6:42** (60 s prep, 53 tests in 5:41) |
| upload-artifact / diff print | 2 s / skipped | 1 s / 0 s |
| pnpm build / cdk:diff | 14 s / 6 s | 10 s / 4 s |
| **Job total** | **41:20** (14:39:24 to 15:20:44) | **29:09** (20:20:42 to 20:49:51) |

The same code varies with the host: route-tests took 1,336 s on #39 and 865 s on #42. The other jobs on these heads:
`images (web|worker)` 1.7 to 2.1 min, `licenses` 0.3 to 0.5 min, `approval-of-record` 0.1 to 0.2 min, and
`screening-capacity / capacity` 13.1 min on #39 and 16.0 min on #42, of which "Measure under production limits" is
778 s. The job ran on both because both PRs touch watched paths.

Database suite on #39: the file durations sum to 2,381 s. Route-tests is 1,336 s of it (6,870 tests). The rest, 1,045 s,
is led by `consumer.db.test.ts` (206 s; 227 s on #42), `price.large.db.test.ts` (76 s), `contracts.db.test.ts` (59 s)
and `packets.db.test.ts` (38 s). The catalog and cross-tenant tests are small: `cross-tenant.db.test.ts` is 1,128 tests
in 12 s. Unit on #39: 298 files, 280 s summed, led by `tools/engine-freeze/differential.test.ts` (86 s) and
`tools/hooks/pre-push.test.ts` (26 s).

e2e per spec file, summed test time (#39 / #42): monitoring 168 / 138 s (one test), uploads 74 / 46, packets 70 / 59,
onboarding 50 / 39, era-exports 43 / 34, reconciliation 42 / 41, reports 36 / 30. Total 767 / 673 s.

## 4. The slow file (item 3)

`apps/web/src/lib/routes/route-tests.db.test.ts` (815 lines). It generates tests from the route registry
(`ROUTES`, 222 routes: 130 practice, 42 platform, 28 public, 11 self and 11 organization; 107 authenticated
mutations; 9 run-starting routes; 12 origin-checked public POSTs; counted with tsx against `routes/index.ts`).

**Worlds.** `buildWorld()` (lines 258-459) builds one synthetic practice per call: 13 personas with memberships, a
firm grant and support grants, a loaded remittance, contracts in every state (`seedContractWorld`), a pricing run,
triage, packets, monitoring, a ledger, a report document, model proposals, billing, onboarding and terms
acceptance. That comes to 237 tenant rows. Each `describe.each` builds two worlds in its `beforeAll`: 194
authenticated routes give 388 worlds, the internal-role suite's 130 practice routes give 260, and the public routes
build one per test, 28 + 12 = 40. **688 worlds, built strictly one after another** on one owner connection.

**Snapshots.** `snapshot()` (lines 537-557) runs one `md5(string_agg(t::text ORDER BY t::text))` query per tenant
table. `tenantTables()` returns 49 (`packages/db/src/catalog.ts:523`). It then runs 4 more for the people's
membership, user, device and session rows: 53 statements per snapshot. The tests take about 5,860 snapshots: 13
outsider personas × 2 per authenticated route, plus the csrf, terms, maintenance, suspension and public cases. That
is about 310,000 statements in sequence.

**Measured locally** on PG18 (5433) in my worktree, against a copy of the file renamed `scout-slice.db.test.ts`. The
copy ran every 12th route (19 routes, 59 worlds, 606 tests) on its own database `tp_laneb_ci_slice0`, with timers
around `buildWorld` and `snapshot`. The command was
`PROBE_SLICE=0 PROBE_FOLD=<0|1> DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm -s vitest run --project db apps/web/src/lib/routes/scout-slice.db.test.ts`.
The host was shared, with load average 3 to 10.

| Variant | File | Worlds (59) | Snapshots (520) | Tests |
|---|---|---|---|---|
| As committed | 131 s | 102.5 s (1.74 s each, 78%) | 11.1 s (21 ms each, 8%) | 606 pass |
| Snapshot folded into one statement | 118 s | 99.0 s | 3.9 s (7.4 ms each) | 606 pass |
| Folded + one page read per distinct document per file | **67 s** | 46.7 s (0.79 s each) | 4.0 s | 606 pass |

A phase profile of `buildWorld` (marks after each await, ms per world) showed `seedContractWorld` at 1,117 ms, then
`seedPackets` 141, `seedPricingRun` 70, `seedLedger` 61, `seedTriage` 57, personas and grants 49, and the rest under
41. Inside `seedContractWorld` (`routes/test-support/contract-world.ts:79-110`), `storeContractDocument` runs twice
and the `EvidenceResolver` reads once. Each call goes to `readDocumentPages` on the same deterministic
`syntheticPdf(...)` bytes (`packages/contracts/src/testing/synthetic-pdf.ts:28-57`: no clock, no randomness).
`readDocumentPages` starts a fresh bounded `Worker` with resource limits per read
(`packages/contracts/src/evidence/pages.ts:104-108`), so the cost is about 3 worker-thread spin-ups plus pdf.js per
world. A per-file memo keyed by the bytes' SHA-256 (diff at `scratchpad/ci-design/contract-world.probe.diff`) cut
the step to 210 ms. The bounded reader itself stays covered by `packages/contracts/src/evidence/evidence.test.ts` and
`contracts.db.test.ts`, and the first world of every file still runs it for real. `models-routes.db.test.ts` and
`viewer-phi.db.test.ts` use the same seeder and gain too.

**Folding the snapshot without weakening it.** Build the statement once in `beforeAll`, after `tables` is read:
`SELECT concat_ws(E'\n', '<t1>:' || (SELECT md5(coalesce(string_agg(t::text, '|' ORDER BY t::text), '')) FROM "<t1>" t WHERE <col> = $1), ..., 'user_session:' || (... WHERE user_id = ANY ($2::uuid[])))`.
Run it as a named prepared statement (`owner.query({ name: 'route-snapshot', text, values })`). It returns
byte-for-byte the string the current function joins: the same md5 over the same rows in the same order, the same
labels and the same `\n`. A separate probe (`scout-probe.db.test.ts`) asserted `folded(world) === snapshot(world)` for
two worlds, that they differ between worlds, and that after an UPDATE in one table both change identically. All 606
slice tests then passed on the folded version. It is also slightly stronger: all 53 reads share one statement
snapshot, where today they are 53 autocommit reads that could tear. Keep the per-table function in test-support and
add one equivalence case, so the fold is proven on every run.

**Split into 12 files, every route in exactly one.**
- Move the body (the helpers and the three `describe.each` blocks) into
  `apps/web/src/lib/routes/route-tests/define.ts`, exporting `defineRouteTests(file: number)`.
- Add `route-tests/partition.ts`: `ROUTE_TEST_FILES = 12` and a deterministic `routesOf(file)`. Balance by cost:
  worlds per route are 2, plus 2 for a practice route, and a public route's are 1 + originChecked. Assign by
  longest-first greedy over the registry order.
- Add twelve two-line files, `route-tests/route-tests.<k>.db.test.ts`, each `defineRouteTests(<k>)`. Each gets its own
  migrated database through `createMigratedDatabase`, which costs 1.5 s.
- Add a unit test `route-tests/partition.test.ts` (no database). For every route in `ROUTES`, exactly one `k` has it.
  The union equals `ROUTES` by id and has no duplicates. No partition is empty. The directory holds exactly the files
  `route-tests.0..11.db.test.ts`, and each one's source matches `defineRouteTests\((\d+)\)` with its own index. The
  existing check "generates tests for every registered route, and every authenticated route has a sample" moves into
  this test.

At 67 s × 12 per slice locally, and about half the CI numbers, each file should take about 35 to 60 s in CI.

## 5. Sharding the database suite in 4 (item 4)

**Shared state.** Every db file makes its own database: `createScratchDatabase` gives `tp_test_<uuid>`
(`packages/db/src/testing.ts:31-56`), and `createMigratedDatabase` migrates it (`testing.ts:107-123`). The
migration's `pg_advisory_lock` is per database (`migrate.ts:30, 189`). Cluster-wide state is limited to:
- the roles `bootstrapRoles` creates idempotently, retrying the catalog races a concurrent bootstrap raises
  (`packages/db/src/roles.ts:221-277`);
- two tests that create and drop uniquely named logins (`packages/db/src/migrate.db.test.ts:515-535`,
  `apps/worker/src/deploy/logins.db.test.ts:44-48`);
- `restore-drill.db.test.ts:29`, which terminates backends of its own source database only.

No db test runs ALTER SYSTEM. The only cluster setting is CI's own quieting step (`ci.yml:34`), which each shard
repeats. Files already run 3 at a time in one cluster today, so a shard needs nothing new. It does need its own
Postgres, which a separate job gets by its own `services:` block. The catalog test (`packages/db/src/catalog.db.test.ts`)
and the cross-tenant test land in whichever shard their hash puts them in. Rule 4 holds because the gate requires
every shard. A test asserts that the shard matrix is `1/4..4/4` and that the gate needs the `db` job.

**How vitest shards.** `BaseSequencer.shard` sorts files by the sha1 of their root-relative path and takes contiguous
slices by count (`node_modules/vitest/dist/chunks/index.B8VfM7Mf.js:7740-7751`). The split is by file count, not
duration. Simulated on the CI file durations (`scratchpad/ci-design/simulate.py`, `simulate_hash.py`; 3 workers,
longest first), with route-tests split into 12 at the measured 51% of its cost:

| Shards | Longest-first balanced: max shard test time (#39 / #42) | vitest's hash split |
|---|---|---|
| 1 (split only, no sharding) | 575 / 435 s | n/a |
| 2 | 288 / 227 s | n/a |
| 3 | 206 / 227 s | 235 / 227 s |
| 4 | 206 / 227 s | 206 / 227 s |

The floor is `consumer.db.test.ts`. Its SCR-19 case waits out a killed consumer's lease, about 190 s
(`apps/worker/src/screening/consumer.db.test.ts:500-545`). At 3 or 4 shards that floor decides the wall, so vitest's
built-in `--shard` is good enough, with two conditions:
- **Order:** the long file must start first in its shard. In CI vitest falls back to file size, because no results
  cache survives. Restore `node_modules/.vite/vitest` with actions/cache, or give the db project a sequencer that sorts
  by a committed duration hint.
- **Split:** move SCR-19 into its own file, which takes about 36 s off the floor.

Four shards give headroom as routes and tables grow; three would do today.

**Chromium in every vitest job.** `report.db.test.ts:165` and `payer-copy.db.test.ts` skip when Playwright's Chromium
is missing (`apps/worker/src/report/pdf.ts:37`), and so do six unit files. A shard without Chromium would silently
lose them. Install it in unit and every db shard, and add a vitest setup that fails rather than skips when
`CI=true` and `chromiumInstalled()` is false. This is the same stance as the engine-freeze differential test.

**Command.** Keep the literal `pnpm db:migrate && pnpm test:db`, adding ` --shard=${{ matrix.shard }}/4`. The
compliance evidence (`packages/compliance/src/controls.ts:95, 298`) is held by
`controls.test.ts:97-101` with `toContain` on ci.yml's text, and reconciliation-001 names `pnpm test:db`
(`docs/product/reconciliation-001.md:450`).

## 6. e2e in 2 shards over one build (item 5)

- **Playwright's shard.** In 1.56.1, `filterForShard` splits the test groups by count into contiguous ranges
  (`node_modules/.pnpm/playwright@1.56.1/node_modules/playwright/lib/runner/testGroups.js:95-103`). With
  `fullyParallel` every test is its own group, so the split is per test, in file order. There are no duration weights
  in this version. The design's Playwright upgrade should check again; I found no documented weighting option. On
  #39's numbers, shard 1 gets 465 s of test time and shard 2 gets 303 s; on #42 they get 359 and 314 s. With 2 workers
  per shard and the 168 s monitoring test as the pole, shard 1 runs about 3 to 4.3 min of tests.
- **One build.** The build job runs `pnpm build`, the same one CI runs today for web and worker. It then tars
  `apps/web/.next/standalone` and `.next/static`; tar keeps the 154 symlinks the pnpm-traced standalone tree holds and
  their modes. It uploads the tar with `actions/upload-artifact` (`compression-level: 0`, short retention), as
  `release.yml:98-118` does with images. Each e2e shard downloads it within the run. Only our proxy blocks artifact
  downloads, and GitHub-to-GitHub inside one run is fine. Measured locally: `pnpm -s build` took 83 s wall (compile
  37.2 s), standalone is 116 MB, static is 1.8 MB, and the gzip -1 tarball is 37 MB (`scratchpad/ci-design/next-build.log`).
  Only the icons and manifest are prerendered (`next-build.log` lines 40-58); every page is dynamic, so the output does
  not depend on the e2e server's runtime environment. Write the commit SHA beside the build and have the e2e shard
  refuse a build of another commit.
- **Config change.** In `playwright.config.ts`, `webServer.command` skips `pnpm run build` when `E2E_PREBUILT=1` and
  still runs `e2e/prepare.ts`. Each shard prepares its own `tp_e2e` on its own Postgres service, which takes about 15
  to 25 s: migration was 1.5 s locally, and on #42 the whole prep including the build took 60 s.
- **Brand baselines.** These are `apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png` (asserted at
  `workflows.test.ts:441-444`). Sharding does not change them, provided every shard installs the same Playwright
  Chromium and keeps `e2e/fonts.conf` and the text-rendering switches. Their regeneration belongs to the Playwright
  upgrade. No spec uses serial mode (grep for `serial|describe.configure`), and the suite already runs fully parallel.
- **Reports.** Give each shard its own artifact name (`playwright-<k>`; v4 requires unique names), keep the paths
  `workflows.test.ts:410` asserts, keep the `failure()` base64 print per shard, and add the `github` reporter so failures
  and flakes annotate the pull request.

## 7. Lint, typecheck, caches, timeouts, flaky (item 6)

- **Lint memory**, measured with ESLint's API and `process.resourceUsage().maxRSS` on the worktree, under shared
  load:

  | Run | Files | Peak RSS | Time |
  |---|---|---|---|
  | Everything | 1,426 | 5,813 MB | 186 s |
  | `apps/web` | 545 | 4,813 MB | 123 s |
  | `packages` | 450 | 2,622 MB | 45 s |
  | `.` minus web and packages (worker, tools, infra, root) | 431 | 2,605 MB | 45 s |

  The groups cover every file exactly once: 545 + 450 + 431 = 1,426. The web group is the floor, because
  `projectService` builds web's program, which compiles every workspace package's TypeScript source
  (`transpilePackages`). Splitting web further would not lower it. Make the last group the complement (`.` with the
  other groups as ignore patterns), so coverage is total by construction, and assert the complement in a test.
- **Running the groups.** Run them as parallel processes inside one `lint` job, with concurrency from
  `os.totalmem()` (about 6 GB per process) and `os.availableParallelism()`. On the 16 GB public runner they run 3 at
  once in about 10.0 GB. On a 7 GB private runner they run one at a time with a heap of about 5.5 GB. Lint is off the
  critical path either way, so separate lint jobs would only spend concurrency slots. Do not use `eslint --cache`: its
  cache does not track the type information typed rules depend on.
- **Typecheck.** `apps/web` measured cold 47 s (`tsc --noEmit --extendedDiagnostics`: 3,890 files, 1.7 GB, check
  39 s). Warm with its `tsconfig.tsbuildinfo` it took 7.6 s and 0.8 GB. Changes:
  - add `incremental: true` and a `tsBuildInfoFile` under `node_modules/.cache/tsc/` to every workspace tsconfig;
  - cache that directory with actions/cache (key: lockfile plus tsconfigs plus sha, restore by prefix);
  - run `pnpm -r --no-sort --workspace-concurrency=4 typecheck`, so web, tools and worker no longer run one after
    another (43 s of serial tail in #39).

  tsc compares source hashes, so a stale cache cannot pass a broken commit.
- **Caches need a base-branch run.** A pull request's run can restore caches from its own ref and from the base
  branch, but only a run on the base branch writes the latter (GitHub's cache access restrictions,
  https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows). Add
  `push: branches: [claude/build-platform]` to ci.yml, grouped by sha and never cancelled. That seeds the tsbuildinfo,
  vitest-results and Playwright caches, and also re-verifies every merge. The pnpm store is already cached by
  setup-node: install takes 3 s. The Playwright browser cache saves only the download, because `--with-deps` still
  runs apt; the step is 19 to 22 s today.
- **Timeouts.** Every job gets a timeout, about 3 times its expected time: static 15, lint 15, unit 20, db 20,
  domain model 10, build 15, e2e 25, gate 5. `workflows.test.ts:791-808` already holds each pull-request workflow's
  timeouts to a table. Extend it to the new jobs, plus `publish-content.yml`, which has none.
- **Flaky.** Today `retries: CI ? 1 : 0` (`playwright.config.ts:62`) turns a flake green. Playwright 1.56.1 has
  `failOnFlakyTests` (`types/test.d.ts:1195-1212`). Recommended: keep 1 retry, so the trace exists and the report says
  "flaky", and set `failOnFlakyTests: Boolean(process.env.CI)`, so the run fails and names it. This is a founder
  question below.

## 8. The schema-approval check, the gate, and every place that names a check (item 7)

**The approval check.** Today the approval case lives in `packages/db/src/domain-model/domain-model.db.test.ts:61-64`,
so every schema PR's whole database step is red until the founder signs. Make it its own job, `domain model`: a
Postgres service, then `pnpm db:migrate` and
`pnpm db:domain-model --check --strict --require-approval --database-url ...`, the command CLAUDE.md names. The CLI
migrates nothing and reads a freshly migrated database (`packages/db/src/cli/domain-model.ts:22-46`). The
"Changes since the last approved domain model" summary moves from `check` into this job's summary. Move the
approval case out of the db project, either as its own `*.approval.db.test.ts` file excluded from `db` or by dropping
the case in favour of the CLI. The drift case (`domain-model.db.test.ts:51`) stays in the shards. A red
`domain model` then means only that the founder has not signed.

**The gate.** Job `all green`: `needs` every other ci.yml job, `if: ${{ always() }}`, no checkout. It fails unless
every needed job's result is `success`, read from `${{ toJSON(needs) }}` with jq. A skipped or cancelled job fails it,
for the same reason the screening-capacity gate runs `always()` (`screening-capacity.yml:229-236`). A workflow test
asserts that the gate's `needs` equals the set of all other job ids, so a new job cannot escape it.

**Places that name today's job `check`, or the set of required checks.** Each must change with the rename.
- `.github/workflows/ci.yml:13` (job id `check`); comments at 14-18 and 85-86 (the approval case "fails in test:db").
- `tools/test/workflows.test.ts`: lines 401-416, 418-428, 430-445, 466-480, 485-506 and 507-519 read
  `workflow('ci.yml').jobs.check`. Line 749 asserts `Object.keys(workflow('ci.yml').jobs)).toEqual(['check'])`. Lines
  791-808 hold the timeouts (`'ci.yml': { check: 60 }`). Line 784 has the comment "about 35 minutes of CI". Lines
  401-445 assert step order inside one job: Chromium right before `pnpm test && pnpm test:golden && pnpm test:oracle`,
  upload right after `pnpm test:e2e`, artifact name `actions/upload-artifact@v4`.
- `tools/engine-freeze/check.test.ts:729-747` (`ci.jobs.check.steps`; freeze before unit in the same job;
  `ENGINE_FREEZE_BASE` through `GITHUB_ENV`). `tools/engine-freeze/differential.test.ts:371, 411` (CI sets the base).
- `packages/compliance/src/controls.ts:95, 160, 192, 218, 248, 298`: step strings checked verbatim against ci.yml by
  `controls.test.ts:97-101`. These are `pnpm db:migrate && pnpm test:db`, `pnpm cdk:diff`,
  `pnpm typecheck && pnpm lint && pnpm lint:logs`, "Secret scan of the pull request's commits" and
  `pnpm audit --prod`. Line 293 describes "the required checks from GitHub Actions" without names.
- `.github/pull_request_template.md:30-31`: "(check, images (web), images (worker), licenses, approval-of-record)".
- `docs/runbooks/github-governance.md`:
  - 58-67 (cost: "`ci` check 25 to 35");
  - 100-111 (gitleaks in every PR's `check`);
  - 289-300 (the five checks and "ci / check (pull_request)");
  - 336-339, 351 ("five green checks");
  - 424-436 (the founder reads the summary at "Checks → ci → check → Summary"; "the domain model check in `ci`");
  - 533-538 (the same five at launch);
  - 556, 576 ("about 35 minutes");
  - 620-621.
- `docs/adr/0063-...md:61-63` (the ruleset's checks), 133, 221 ("CI's `check` job writes the summary"), 376 (the
  security.txt expiry fails every PR's `check`), and 458-459 (decision 12: "The required checks, the same in every
  document").
- `docs/policies/change-management.md:40-45` (the five checks).
- `README.md:131` (the `check` job writes the summary) and `README.md:551` (security.txt expiry turns `check` red).
- `docs/runbooks/screening-capacity.md:308-320` adds `screening-capacity gate` to the same ruleset. That name does not
  change.
- `.github/workflows/approval-of-record.yml` and `tools/approval-of-record/*` name no CI check, only their own job,
  which `workflows.test.ts:712` holds as "the required check the ruleset names".
- `.github/workflows/release.yml` names no CI check. Its runner label is bound to `RELEASE_RUNNER`
  (`tools/screening-capacity/launch-check.ts`; `workflows.test.ts:315-317`), which is not a check name.
- `docs/adr/0010-supply-chain-gates-beside-ci.md:20` (`licenses`), if supply-chain moves into ci.yml.
- Outside the repository: ops `HANDOFF.md:54`, the unanswered ruleset offer naming "check, mutation, capacity,
  approval-of-record".

## 9. Target job graph and wall clock (item 8)

Free `ubuntu-24.04`: 4 vCPU and 16 GB for a public repository; 2 vCPU and 7 GB for a private one
(https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Per-job setup, measured above: about
15 s without a Postgres service, about 25 s with one, plus 19 to 22 s for Chromium.

```
pull_request / push(claude/build-platform)
 ├─ static ............ audit, gitleaks, check:fixtures, verify-content, releases-immutable, engine freeze, synth+diff,
 │                      typecheck (incremental, no-sort), lint:logs, test:golden, test:oracle      ~2.0-2.5 min
 ├─ lint .............. 3 groups, memory-bounded parallel                                         ~1.5 min
 ├─ unit .............. Chromium, merge base -> ENGINE_FREEZE_BASE, vitest unit --coverage          ~3.2-4.0 min
 ├─ db (1/4)..(4/4) ... postgres, Chromium, db:migrate && test:db --shard=k/4                     ~4.3-5.0 min each
 ├─ domain model ...... postgres, migrate, --check --strict --require-approval, summary             ~0.7-1.0 min
 ├─ build ............. pnpm build (web+worker), tar+upload web standalone, cdk:diff               ~2.0-2.3 min
 │    └─ e2e (1/2), e2e (2/2)  postgres, Chromium, download, prepare, start, --shard=k/2         ~4.2-5.5 / 3.5-4 min
 └─ all green ......... needs all of the above, if: always()                                       ~0.2 min
```

- **Critical path:** build, then e2e shard 1, about 6.2 to 7.8 min. db runs about 4.3 to 5 min and unit 3.2 to 4 min.
  **Total wall about 6.5 to 8 min**, against 29 to 41 today. This assumes no queueing.
- **Runner-minutes per push** come to about 39 for ci.yml, against 29 to 41 today. Setup overhead grows by about 6
  minutes, and the route-test fixes save more than that.
- **Jobs:** 12 in ci.yml. GitHub Free allows 20 concurrent jobs per account and Pro 40
  (https://docs.github.com/en/actions/reference/limits). Two lanes pushing at once, with supply-chain,
  approval-of-record and capacity, can queue briefly on Free. That is a reason not to split lint into more jobs.
- **Not in this budget:** a PR that touches a watched path also waits on `screening-capacity gate`, about 13 to 16 min,
  because the measurement itself is 778 s. That wall is set in another workflow.

**If the repository goes private** (2 vCPU and 7 GB):
- vitest runs 1 file at a time (`cpus - 1`), and Playwright runs 1 worker (50% of the cores);
- lint runs its groups one after another; the web group fits at about 4.8 GB;
- the same graph then takes about 11 to 12 minutes and about 70 to 80 billed runner-minutes per push;
- about 10 minutes still holds with the matrix widened to 6 db shards and 3 to 4 e2e shards, at roughly the same
  minutes.

Larger runners need an organization on Team (issue #41). The capacity harness already refuses a 2-CPU runner
(`screening-capacity.yml:124-131`).

**Required checks afterwards.** Recommended: `all green` (ci), `approval-of-record` and `screening-capacity gate`, with
supply-chain's three jobs moved into ci.yml under the gate. Otherwise the list also carries `images (web)`,
`images (worker)` and `licenses`. The PRD's "one workflow on every pull request" (`docs/product/PRD.md:764`) fits the
merge, and ADR 0010's reason for a separate file, a verbatim plan workflow, no longer holds once ci.yml is restructured.

## 10. Questions for the founder

1. **Flaky e2e policy.** Recommended: keep 1 retry and fail the run on any flaky test (`failOnFlakyTests` in CI). With
   0 retries we lose the "flaky, not broken" signal and the retry's trace. With 1 retry and a warning only, flaky code
   can merge.
2. **The required list.** Recommended: merge supply-chain into ci.yml and require 3 checks (`all green`,
   `approval-of-record`, `screening-capacity gate`). Keeping supply-chain separate means 6 names in the ruleset and in
   every document that repeats it, and an ADR 0010 that stays as is.

## 11. Commands run

- `gh api .../actions/workflows/ci.yml/runs?event=pull_request`
- `gh api .../actions/runs/{39971478729,40018476585}/jobs`
- `gh api .../commits/<sha>`, then `.../actions/runs?head_sha=` and their jobs
- `gh api .../rulesets` (`[]`), `.../rules/branches/claude/build-platform` (`[]`), the repo (public)
- `mcp__github__get_job_logs` for job 120475009638 and job 120636573742
- `git worktree add --detach .../ci-structure-wt origin/claude/build-platform`, then
  `pnpm install --frozen-lockfile --prefer-offline` (3.4 s)
- the PG18 cluster was down (stale lock after a container restart): started with
  `su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start"`
- `tsx scout/count.ts` (route counts)
- the probe and slice vitest runs above, on databases `tp_laneb_ci_routeprobe` and `tp_laneb_ci_slice0`, both dropped
  by their `afterAll` and checked absent afterwards
- ESLint API memory runs (four)
- `tsc --noEmit --extendedDiagnostics` twice in apps/web
- `pnpm -s build` in apps/web (83 s)
- `python3 -I simulate.py / simulate_hash.py` on the CI logs
- `git worktree remove --force` on the worktree
