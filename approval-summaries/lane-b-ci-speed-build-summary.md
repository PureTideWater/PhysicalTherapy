# co-001/ci-speed build summary (CI 1 of 4, combined audit #109; ADR 0066 Part 1; 2026-10-25)

Branch co-001/ci-speed, cut at 49514e8 (claude/build-platform), integrated, pushed at bbcafa08ea29e75707a81369790634679aa30194, then once more at
9144b56900d2a80779f55b0e5cf666e08c586247 with the fixes the pull request's first CI run found. Draft PR #43
(https://github.com/PureTideWater/PhysicalTherapy/pull/43)
into claude/build-platform. No migration; docs/product/domain-model.md, packages/db/domain-model, packages/pricing,
content/releases, fixtures/golden and synthetic releases 900001-900004 unchanged.

## S1, workflows, gate and documents (head 523fa09)

S1 rewrote ci.yml and the documents, in two commits: 40e781e (docs) and 523fa09 (ci).

What was built:
- **ci.yml** (rewritten): triggers `pull_request` and `push: [claude/build-platform]`, no path filter, `contents: read`,
  `defaults.run.shell: bash`; concurrency `${{ github.workflow }}-` plus `pr-<n>` or the commit, cancelling only on pull
  requests. Jobs and timeouts: `static` 15, `lint` 15, `unit` 20, `db (k/N)` 20 (matrix
  `fromJSON(github.event.repository.private && '[1,2,3,4,5,6]' || '[1,2,3,4]')`), `domain model` 10, `build` 15,
  `e2e (k/M)` 25 (needs build; 2 or 3 shards), `images` 20, `all green` 5 (needs every other job, `if: always()`, no
  checkout, every result to log and summary, `jq -e 'length > 0 and all(.[]; .result == "success")'`).
- `static`: fetch-depth 0; "The commits this run checks" (PR: `origin/$BASE_REF`; push: `github.event.before`, zero
  SHA falls back to `HEAD^1`, a missing previous head fails); audit; gitleaks over `$BASE..HEAD`; check:fixtures;
  verify-content; releases immutable; the engine freeze on pull requests only; synth and its diff; tsc cache
  restore, `pnpm typecheck`, tsc cache save; lint:logs; test:golden; test:oracle; licenses:check.
- `unit`: fetch-depth 0, Chromium, the engine freeze's base into `GITHUB_ENV`, `pnpm test`.
- `db (k/N)`: own Postgres, `pg_isready` then the quiet-logs psql, Chromium, durations cache
  (`vitest-db-v1-<os>-<N>-<k>-<sha>`), `pnpm db:migrate && pnpm test:db --shard=... --reporter=default --reporter=json`,
  "Files this shard ran" (sorted list, count, SHA-256, ten slowest), cache save.
- `domain model`: own Postgres, fetch-depth 0, the summary on pull requests (tee to log and summary), migrate,
  `pnpm db:domain-model --check --strict --require-approval`.
- `build`: `pnpm build`, `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`, tar of standalone, static and the stamp
  uploaded as `web-build` (1 day, `overwrite: true`), `pnpm cdk:diff`.
- `e2e (k/M)`: own Postgres, Chromium, download and untar, `E2E_PREBUILT=1 pnpm test:e2e --shard`, `playwright-<k>`
  (`if: always()`, `overwrite: true`), the base64 diff print on failure.
- `images`: buildx, web build and Trivy, worker build and scan on `!cancelled()`.
- supply-chain.yml deleted; large-zip.yml's Chromium step; comments in screening-capacity.yml:146, both Dockerfiles and
  tools/check-licenses/index.ts:11.
- Tests: tools/test/ci-gate.test.ts (new, CI-01, runs the gate's script under bash on every kind of result);
  workflows.test.ts rewritten where it read `jobs.check` or supply-chain.yml (graph, ranges run in a temporary git
  repository, shard list script on a fixture, CI-06, CI-07, CI-09, CI-10, the concurrency and Chromium rules on every
  workflow and on fixtures, pins now covering ci.yml); tools/required-checks.ts and required-checks.test.ts (new);
  check.test.ts's wiring block; codeowners.test.ts:89's comment.
- Compliance: `EvidenceSource.definedIn`; the six route-test entries point at route-tests.0.db.test.ts with
  definedIn define.ts; SUPPLY folded into CI; the evidence rule keeps every file rule and adds the import and title
  rules for definedIn.
- domain-model.db.test.ts: the approval case removed, the drift case kept.
- Synth: module CI (CI-01 to CI-10 as `none(0, ...)` with assertedBy), SEC-02 and SEC-15 point to define.ts, SCR-19
  adds consumer-lease.db.test.ts; fixtures regenerated.
- Documents: ADR 0066 Part 1 (with the measured standalone-tree diff: 3,788 files each, the e2e build differing from a
  plain one in exactly the 261 files two plain builds differ in), ADRs 0010 and 0063 amended, docs/runbooks/ci.md
  (new), the governance and capacity runbooks, the change-management policy, README, reconciliation-001 (the series'
  entry before PR 7, the test:db amended note), the test matrix (CI-01 to CI-10) and the PR template, every listing
  of the required checks between markers.

- difference: ci.yml's actions are pinned to full SHAs now (the PINNED set, plus setup-python v5.6.0 a26af69), and the pin test covers ci.yml. Why: ci.yml is rewritten here and becomes the required gate; the same vetted SHAs already run in the release and capacity workflows, so no tag-pinned action sits in the gate before ci-deps.
- difference: SCR-08's assertedBy is unchanged; SCR-19 adds consumer-lease.db.test.ts and keeps consumer.db.test.ts. Why: only SCR-19's kill-and-recover test moves; SCR-08's describe and SCR-19's heartbeat case stay in consumer.db.test.ts.
- difference: synth args.ts, write.ts, fixtures.test.ts and cases/common.ts changed for a two-letter module, and the registry derives the module from the text before the hyphen. Why: without them CI-xx rows are not read, `--case CI-04` is refused and stale files under CI-xx go unseen.
- difference: logging discipline's evidence is `pnpm typecheck` and `pnpm lint:logs` (no `pnpm lint`); change management gains the domain model command; checklist.test.ts's kinds list follows; a CI step must match a whole command. Why: ESLint has no logging rule; the approval left test:db, so its evidence must follow; a whole-command match stops `pnpm lint` matching inside `pnpm lint:logs`.
- difference: `static` runs each check on `!cancelled()` plus its prerequisite; range steps fail on a previous head the clone lacks; the durations cache key includes the shard count; `strategy.job-total` gives the widths; `defaults.run.shell: bash`; `persist-credentials: false`; a `pg_isready` wait; `LC_ALL=C` sort. Why: every verdict on every run, no silently narrower range, correct per-shard cache, one source of widths, pipefail, least privilege, readiness, a host-independent list hash.
- difference: the timeouts table covers every workflow, release.yml and publish-content.yml (360, frozen until F4) included; the required-checks test also flags unmarked listings and holds each required job to run on every pull request, unskipped and not a matrix; the PR template's listing is a visible sentence. Why: CI-10 says every job of every workflow; a listing must not escape the check; markers cannot sit inside an HTML comment.
- difference: governance:576 kept; ADR 0063:130 and governance:525 name the five of main's 11 files that differ; the capacity runbook's "about 45 minutes" replaced by the measured 13:20 to 16:00; test-matrix.md:93's line citation replaced by the check's name; CI-07 asserted in workflows.test.ts. Why: 576 quotes main's real file; "10 to 11" alone would stay false; measured numbers; the series entry shifts reconciliation's lines; the design named no CI-07 test.
- difference: the standalone-tree proof is measured against the noise between two plain builds. Why: Next draws server-action IDs and preview keys per build, so a byte diff of any two builds is never empty.
- open: `.github/dependabot.yml:3-4` said about 35 minutes of CI (ci-deps owns the file). Closed by the integration (8f1df72): it now says CI's parallel jobs, about 45 runner minutes.
- open: ADR 0064:5-6 cited reconciliation-001 lines 428, 499 and 423-454, shifted by the series entry. Closed by the integration (8f1df72): it cites the headings now.
- open: `tools/engine-freeze/differential.test.ts:371, 411` said CI sets ENGINE_FREEZE_BASE to the merge base. Closed by the integration (8f1df72): the merge base on a pull request, the previous head on a push.
- open: ops HANDOFF.md:54 and lanes/lane-b.md need the new check names; the founder applies the ruleset (F7) after the first green push run. Still open (the ops branch is not this pull request's).
- open: GitHub-only behaviour (needs results, artifacts and overwrite on a re-run, repository.private, event.before, caches, the images job) is verifiable only on the pull request's runs. Still open.

## S2, database and e2e suites (head 741d744)

S2 built the route-test split, the consumer split, the Chromium guard, the shard proof and the e2e build stamp, in
five commits: 6d40272, 4009ace, d76d963, e1a35ff and 741d744.

What was built:
- **Route tests** (`apps/web/src/lib/routes/route-tests/`, the old file deleted): `partition.ts` (`ROUTE_TEST_FILES =
  12`, the cost model, costliest first to the least-loaded file; 222 routes, 688 worlds, files of 57 or 58 worlds);
  `define.ts` (`defineRouteTests(file)`, the old file's three `describe.each` blocks, titles unchanged); `world.ts`
  (the harness, per-file `open()`/`close()`); twelve two-line files; `partition.test.ts` (8 unit tests, absorbing the
  route-count case); `snapshot.db.test.ts` (CI-03: folded equals per-table on two worlds and after an update).
- The fold: one prepared statement built from `tenantTables()` in `open()`, each line
  `'<table>:' || coalesce((SELECT md5(...)), '')`, joined by `array_to_string(ARRAY[...], E'\n')`.
- `test-support/contract-world.ts`: `readPagesOnce(bytes)`, a per-file memo keyed by content type and SHA-256.
- Consumer: SCR-19 moved to `consumer-lease.db.test.ts` (body diffed: only qualifiers differ); `test-support/consumer.ts`
  holds the shared setup and `localMail()`; consumer.db.test.ts keeps its other four tests.
- vitest.config.ts: `globalSetup: ['tools/test/ci-chromium.ts']` on unit and db; `SlowFirstSequencer`;
  `cacheDir: 'node_modules/.vite'` named.
- tools/test: `ci-chromium.ts` and its test (5); `db-shards.ts` (vitest's `createVitest`, `globTestSpecifications()`,
  the configured sequencer's `shard()` and cold `sort()`), its test (7, CI-04) and `db-shards.fixture.ts`.
- apps/web: playwright.config.ts (`failOnFlakyTests: Boolean(process.env.CI)`, the `github` reporter on CI, the
  `E2E_PREBUILT` build step); `scripts/build-stamp.ts` (`--expect`, `--write`) and its test (9).
- Measured: route files 59-64 s locally (575 to 605 tests each), consumer-lease 170-200 s, consumer 39 s; the old route
  file's 6,870 tests equal the twelve files' 6,869 plus the moved route-count case, by full name; E2E_PREBUILT ran the
  stamped build with no second build and refused a stamp of 49514e8 and a missing stamp.

- difference: added route-tests/world.ts (the harness) beside define.ts (only the generated cases). Why: snapshot.db.test.ts needs the worlds and both snapshots without the test definitions, and define.ts stays exactly the module holding the titles (the compliance definedIn).
- difference: added tools/test/db-shards.fixture.ts and kept it as a permanent negative-control case. Why: every run then proves the shard check fails when a sequencer drops a file.
- difference: added SlowFirstSequencer to vitest.config.ts; shard() unchanged. Why: with no cached durations vitest's size fallback sorts the two-line route files and the short consumer-lease file (about 190 s) last in their shards; they now start first, proved for 4 and 6 shards.
- difference: the fold joins its lines with array_to_string(ARRAY[...]) instead of concat_ws, each line in coalesce. Why: PostgreSQL caps a function call at 100 arguments; the fold uses 54 today and 62 after #42, so concat_ws would fail at about 96 tenant tables.
- difference: five more stale comments naming the old file updated (abstraction.ts:71, billing-routes.db.test.ts:41, console-routes.db.test.ts:42, onboarding-routes.db.test.ts:37, registry.test.ts:47). Why: they named a deleted file and no builder owned them.
- difference: test-support/consumer.ts holds the shared database setup, submit, the run and email readers, consumerBoss, timedConsumer and localMail(); consumerProcess stays in consumer-lease.db.test.ts; SCR-08 stays in consumer.db.test.ts. Why: after the move only consumer.db.test.ts uses consumerBoss and timedConsumer; localMail() makes #42's mail-config change one line.
- difference: build-stamp.ts also has --write; E2E_PREBUILT values other than 1, unset, '' or '0' are refused; build-stamp.test.ts also tests playwright.config.ts under stubbed env. Why: one module defines the stamp format, a typo cannot silently rebuild, and CI-06/CI-07's wiring is tested by behaviour.
- difference: the harnesses create their temporary directories in open() and clean up after a failed open(); the registrars are routeWorldsForThisFile and screeningDatabaseForThisFile. Why: the old file leaked its temporary directories on every collection run and its database whenever setup failed; use* names trip the react-hooks lint rule.
- open: durations are local on a shared 4-CPU host; A3's CI targets (each route file at most 90 s, no db file over 240 s) are read from CI's per-file durations. Still open.
- open: shard layout by vitest's path hash: in 4 shards the route files land 3/4/4/1 and shard 3 also holds consumer-lease; in 6 shards 2/1/4/3/2/0. A1 is read with this layout. Still open.
- open: the github reporter's annotations can only be seen on a real pull-request run. The integration's probe test (4a7ee2d) now proves the annotation line Playwright prints on every run; seeing it on the page is still open.

## S3, lint and typecheck runners (head 1f2fb56)

S3 built the two runners in two commits: 89799ef (lint) and 1f2fb56 (typecheck).

What was built:
- `pnpm lint` = `tsx tools/lint/run.ts`: three groups (`apps/web` 6,144 MB, `packages` 4,096 MB, the complement `.` with
  the other roots ignored, 4,096 MB), each its own node running ESLint's CLI with `--max-warnings=0`; heaps capped at
  memory less 2 GiB; largest first, first fit, always one when none runs; per-group files, problems (ESLint's stylish),
  peak RSS and duration; `--fix` passes through, any other argument and bulk suppressions refused.
- `pnpm typecheck` = `tsx tools/typecheck/run.ts`: the root and every workspace pnpm-workspace.yaml names, each
  `tsc --noEmit -p <dir>/tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/tsc/<slug>.tsbuildinfo
  --diagnostics`, slowest first by source size, `min(cores, budget / 2,048 MB)` at once; refuses a workspace whose own
  typecheck is not exactly `tsc --noEmit`; reports every failure and the cache use.
- Measured: lint 89 s instead of 138 s, the same 1,428 files and the same problems as the single process (also with a
  deliberate problem in each group); typecheck 59 s cold and 22 s warm instead of 117 s, and a type error in web, a
  package or tools fails it with the workspace's own error.

- difference: the memory budget uses min(os.totalmem(), process.constrainedMemory()) less 2 GiB. Why: inside a container os.totalmem() reports the host's memory (16,091 MB under a 13,677 MB limit here); on GitHub's VMs the two are equal.
- difference: the root project is incremental too (root.tsbuildinfo). Why: the same check, cached.
- difference: heap floor MIN_HEAP_MB = 1,024 when the budget is at or below zero; first-fit scheduling. Why: the design gives no heap for a host of 2 GiB or less; first fit changes neither of the design's plans and cannot starve a group.
- difference: no new shared file: typecheck/run.ts imports the scheduler from lint/groups.ts and the process runner from lint/run.ts. Why: the files stay exactly those section 3.1.3 lists, with nothing duplicated.
- difference: each ESLint group adds --format json --output-file <tmp>, and the runner prints problems with ESLint's own stylish formatter. Why: the JSON gives the per-group file count; the text and exit codes stay the CLI's, so setup-node's matchers still annotate.
- difference: peak RSS comes from a data: URL preload writing process.resourceUsage().maxRSS to file descriptor 3. Why: Node does not expose a child's rusage; cross-checked against Python's RUSAGE_CHILDREN.
- difference: pnpm lint accepts only --fix and refuses an eslint-suppressions.json; pnpm typecheck takes no arguments. Why: a path or --format passed to three groups would lint twice or break the count; a group would read the others' suppressions as unused.
- difference: tsc runs with --diagnostics, and the runner reports each project's check time and file count. Why: the proof of cache use (check 0.00 s warm).
- difference: the runner refuses (exit 2) a workspace whose typecheck is not exactly tsc --noEmit beside its own tsconfig.json, or whose manifest is not package.json. Why: otherwise the root runner and the workspace's script could disagree in silence.
- difference: typecheck does not stop at the first failure. Why: it lists every failing project (the old pnpm -r never reached web after a ui error).
- difference: slowest first is an estimate from source counts. Why: deterministic, no timings file, adapts to new workspaces.
- difference: both runners append a table to $GITHUB_STEP_SUMMARY when it is set. Why: every verdict goes to the log and the summary.
- open: confirm the GitHub runners' reported memory from the first CI run's plan lines (section 3.1.2's 15.6 and 7.7 GiB are approximate). Still open.
- open: prove the warm typecheck on CI: the first push run on claude/build-platform seeds node_modules/.cache/tsc, then static's log shows "cache: N of 21 warm". Still open.
- open: for the TypeScript 7 PR (N8), revisit how the runner resolves tsc and measures RSS if bin/tsc becomes a native shim. Still open.
- open: the lint heaps. Decided by the integration: keep the reviewed 6,144 / 4,096 / 4,096 MB (about 90 s, off the critical path, web keeps its headroom over the measured 4,813 MB peak) rather than 5,632 MB for web.

## Integrator: draft PR #43, head 9144b56900d2a80779f55b0e5cf666e08c586247

Merged S1 (c969c11), S2 (5318720) and S3 (ac45537) into co-001/ci-speed with `git merge --no-ff`, one at a time. The
three builders' files were disjoint (48, 39 and 6), so no merge conflicted. Then four integration commits:
- 8f1df72 docs: ADR 0017:48 names `route-tests/define.ts` and the twelve files (S2's request); ADR 0064:5-6 cite
  reconciliation-001's engine freeze, ZIP+4 (D20) ruling and checks by heading instead of the line numbers the series
  entry shifted (S1's open item); `differential.test.ts`'s header, its CI test's title and its setup error say the
  merge base on a pull request and the previous head on a push (design 3.1.6 lists the lines; S1's open item);
  `.github/dependabot.yml`'s comment gives CI's parallel jobs, about 45 runner minutes, instead of "about 35 minutes of
  CI" (S1's open item).
- 4a7ee2d e2e: CI-07 proved by behaviour. A new case in `apps/web/scripts/build-stamp.test.ts` writes a probe spec that
  fails its first attempt and passes its retry into a temporary directory and runs Playwright's own CLI on it with the
  configuration's CI `retries`, `failOnFlakyTests` and reporters: the run must exit 1, list it under "1 flaky" and
  print a `::error file=probe.spec.mjs,title=…` annotation; the same probe with `failOnFlakyTests` off must pass as
  flaky. Failing first: with `failOnFlakyTests: false` in playwright.config.ts the case failed ("expected +0 to be
  1"). CI-07's `assertedBy` adds the file (S2's suggestion) and its expected file is regenerated.
- bbcafa0 routes: three of S2's new source comments cited "audit #109", which `tools/brand-colors/scan.test.ts`
  reads as a three-digit hex color outside the tokens; the full `pnpm test` on the merged tree failed on it (no
  builder's narrower run covered that scan). They now say "audit item 109".
- 9144b56 ci (after the first CI run, 40165045853, failed static and unit): `static` runs `pnpm synth --large` before
  `pnpm test:oracle` (the oracle reads the 10,000-claim PAR-29 remittance, which in the serial job `pnpm test` had
  written first); `unit` installs the pinned gitleaks (`tools/gitleaks/install.sh`) before `pnpm test`, and
  `tools/hooks/pre-push.test.ts` gains a case that fails on CI without it (its three real secret-scan cases had
  skipped silently in the first run: in the serial job the secret scan had installed gitleaks earlier in the same
  job); the CI-07 probe strips the runner's `CI`, `GITHUB_` and `RUNNER_` variables (the github reporter named the
  probe's file relative to `GITHUB_WORKSPACE`); workflows.test.ts holds both new steps; ADR 0066 ("Nothing a step of
  the serial job left behind is assumed") and the CI runbook's job table name them. Each failed first locally as CI
  showed.

Seams checked and closed:
- S1's controls.test.ts "names only tests that exist" and synth fixtures.test.ts "points only at tests that exist"
  pass with S2's and S3's files in (focused run, 455 passed).
- S1's CI-07 case reads S2's playwright.config.ts; S1's ci.yml interfaces match S2's and S3's (`pnpm typecheck` and
  `pnpm lint`, `node_modules/.cache/tsc`, `node_modules/.vite/vitest`, the json reporter's `testResults[].name`,
  `startTime`, `endTime`, `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`, the tarball holding `.next/standalone`,
  `.next/static` and `.next/BUILD_COMMIT` unpacked into apps/web).
- S2's vitest.config.ts Chromium setup lands with S1's install steps (ci.yml unit, db and e2e; large-zip.yml); the
  Stryker vitest configs do not extend the root config, so mutation.yml is unaffected.
- After the merges: `pnpm synth --all` wrote only CI-07's file (from the integration's registry change) and is clean
  since; typecheck, lint and actionlint pass on the merged tree.
- Section 3.1.3's file list and 3.1.6's names checked against the merged tree: every listed file is present; the four
  required checks are jobs of their workflows and every marked listing equals `REQUIRED_CHECKS`. Files beyond 3.1.3
  are the builders' recorded deviations, the integration's documents and comments above, and
  tools/hooks/pre-push.test.ts (9144b56).

### Checks
- [pass] `git merge --no-ff co-001/ci-speed-s1`, `-s2`, `-s3`: clean, no conflict.
- [pass] `flock … bash -c 'rm -rf node_modules/.cache/tsc && pnpm typecheck'` (cold, the new runner): exit 0, 21 projects, 4 at once within an 11,629 MB budget, 58.6 s wall, 0 of 21 warm, 146.05 s of checking (68.1 s at 4a7ee2d).
- [pass] `flock … pnpm typecheck` (warm, right after): exit 0, 26.4 s wall, 21 of 21 warm, 0.00 s of checking (27.6 s at 4a7ee2d).
- [pass] `flock … pnpm lint` (the new runner): exit 0, apps/web 560 files 3,426 MB 63.4 s, packages 450 files 2,349 MB 48.3 s, `.` 446 files 2,641 MB 43.7 s; 1,456 files, 0 errors, 0 warnings, 92.0 s wall.
- [pass] `actionlint .github/workflows/*.yml`: exit 0, no output.
- [pass] `flock … pnpm test` (unit with the coverage gate): exit 0, 306 files, 4,640 passed, 3 skipped (4,643), branch thresholds met. The first run at 4a7ee2d failed one test, tools/brand-colors/scan.test.ts (the "#109" comments); fixed in bbcafa0.
- [pass] `flock … env DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run tools/test tools/lint tools/typecheck packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts`: 37 files, 455 passed. Without DATABASE_URL the same command failed only apps/web/scripts/seed.db.test.ts, a db-project file the path filter takes in (ECONNREFUSED to 5432): the design's command needs the database URL.
- [pass] `flock … bash -c 'pnpm synth --all && git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"'`: 187 cases, 0 written, 456 unchanged, 0 removed; 16 EMR files unchanged.
- [pass] `git grep -nE 'ci / check|`check` \(the|five (green )?checks|images \(web\)|images \(worker\)|supply-chain\.yml'`: 8 lines, all history or tests of the old names: ADR 0010:17, :71; ADR 0063:486; ADR 0066:32, :176, :185; required-checks.test.ts:72; workflows.test.ts:1095 (listed in the PR body).
- [pass] `flock … env DATABASE_URL=… pnpm exec vitest run --project db apps/web/src/lib/routes/route-tests/snapshot.db.test.ts apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts` (at 4a7ee2d): 2 files, 576 passed, 54.8 s.
- [pass] `flock … env DATABASE_URL=… pnpm exec vitest run --project db apps/worker/src/screening/consumer-lease.db.test.ts` (at 4a7ee2d): 1 passed, 201.5 s.
- [pass] `flock … env DATABASE_URL=… pnpm exec vitest run --project db packages/db/src/domain-model/domain-model.db.test.ts` (at 4a7ee2d): 1 passed (the drift case).
- [pass] `CREATE DATABASE tp_laneb_cispeed_dm; DATABASE_URL=…/tp_laneb_cispeed_dm pnpm db:migrate && pnpm db:domain-model --check --strict --require-approval; DROP DATABASE tp_laneb_cispeed_dm WITH (FORCE)`: exit 0, matches the schema at 20261106090000_screening_consumer.sql, carries an approval for this text; 90 tables, 1 view, 45 registered, 218 divergence rows, 0 explanation problems; dropped.
- [pass] `pnpm -s db:domain-model --summary-since origin/claude/build-platform`: "No change: the two documents have the same text"; document SHA-256 6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712 on both sides, approved by Tyler Williams on 2026-10-23. It opens the PR body's Domain model section.
- [pass] `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8`: exit 0, "(no non-test file under packages/pricing/src changes)", nothing let through, no problems.
- [pass] `git diff --name-only $(git merge-base origin/claude/build-platform HEAD) -- packages/db/migrations docs/product/domain-model.md packages/db/domain-model packages/pricing` (and content/releases, fixtures/golden, fixtures/synthetic/rules): empty. The whole diff is 97 files, +6,051 / -1,642.
- [pass] `flock … pnpm test:golden`: 4 files, 38 passed. `flock … pnpm test:oracle`: pyx12 4.0.0 agrees with all 630 synthetic 835 fixtures.
- [pass] `pnpm -s check:fixtures`, `pnpm -s lint:logs`, `pnpm -s verify-content`, `tools/check-releases-immutable.sh 49514e8`, `pnpm -s licenses:check`: 234 files guarded; 983 files scanned; every content set passes; 4 prompt versions unchanged; 189 packages allowed.
- [pass] `flock … node --import tsx tools/test/db-shards.ts 4` and `6`: 4 shards of 30/30/29/29 files (route files 3/4/4/1, consumer-lease in shard 3), 6 shards of 20/20/20/20/19/19 (route files 2/1/4/3/2/0, consumer-lease in shard 5); each union is exactly the 118 files of `pnpm -s vitest list --project db --filesOnly`, each once.
- [pass] A2, db (`flock … vitest list --no-staticParse --project db`, the head and an export of 49514e8 installed offline in the scratchpad; the leaked cross-tenant databases each collection made were dropped): base 9,042 (9,041 + 1 skipped) over 105 files, head 9,041 over 118 files; by full name with the moved files folded, only in base the route-count case (now partition.test.ts, unit) and the approval case (now the `domain model` job), only in head the snapshot case.
- [pass] A2, the route tests: 6,870 in route-tests.db.test.ts before; 6,869 in twelve files after (575, 537, 568, 559, 569, 598, 605, 571, 568, 569, 587, 563) plus the route-count case in partition.test.ts; names identical.
- [pass] A2, unit (`flock … vitest list --no-staticParse --project unit` on both trees, and the full run): base 4,522 listed (4,524 + 1 skipped run on CI, HANDOFF 2026-10-23; a run counts 3 more than a list), head 4,640 listed and 4,643 run; net +118: 130 new tests and 12 rewritten under new names (workflows.test.ts 10, check.test.ts 1, differential.test.ts 1), none lost.
- [pass] A2, e2e (`playwright test --list`, base and head; `--shard=1/2`, `2/2`, `1/3`, `2/3`, `3/3` at head): 51 at both, same names; 26 + 25 and 17 + 17 + 17, disjoint, union 51.
- [pass] CI-07 failing first (the new probe case with failOnFlakyTests false in the config, then restored): failed; passes as committed.
- [pass] Model identifiers: none in the diff or any commit message beyond the two attribution lines, which end all 16 commits (each checked, 9144b56 included).
- [pass] `git push -u origin co-001/ci-speed`: the pre-push hook checked 15 commits (fixture guard, 106 text files searched for an X12 header, gitleaks found no secret); new branch pushed, no force, no --no-verify.
- [pass] Draft PR #43 opened with the GitHub MCP tool (owner PureTideWater, head co-001/ci-speed, base claude/build-platform, draft). The create call rewrote the body's last two lines into its own footer, and a `gh api -X PATCH` replaced them with another; a second MCP call (update_pull_request) left the body byte-identical to the local file (`integ/pr-body-final.md`), ending with the two required lines.
- [pass] CI run 40166129200 on 9144b56: `all green` success, all 13 jobs green. First job start 05:36:12 to the gate's end 05:43:38: 7:26 (7.43 min, A1 target 10:00); queue 0:02; 36.4 runner-minutes, 43 billed (docs/runbooks/ci.md's jq). `unit` 4,644 passed and 1 skipped (actionlint's case, as at the base) against the base's 4,524 + 1; `db (3/4)` the longest shard at 4:40; build 1:32, then e2e (1/2) 5:48. `mutation`, `approval-of-record` and `screening-capacity gate` green (the measurement 12:49): all four required checks passed. A1′, from the head's first workflow run (05:36:10) to the last required check (05:49:16): 13:06, set by the capacity gate, as A1′ expects on a watched-path pull request.
- [fail, then fixed] CI run 40165045853 on bbcafa0: `all green` failure, correctly, on two red jobs: `static` (`pnpm test:oracle`: "PAR-29/generated/remit-10000-claims.835: generated at test time and not there") and `unit` (the CI-07 probe's annotation named `../../../../../tmp/…/probe.spec.mjs`, relative to GITHUB_WORKSPACE); the other 10 jobs green; wall 7:43, 37.3 runner-minutes, 44 billed. `db (1/4)`: 30 files, 3,094 passed, 1 skipped, its route files 63-64 s; `db (2/4)`'s 36-37 s. Its unit run also showed 4 skipped where the base had 1: the three real-gitleaks pre-push cases. Fixed in 9144b56.
- [pass] 9144b56 failing first: workflows.test.ts against the old ci.yml (2 failed: the large-remittance and gitleaks assertions); the new pre-push case with CI=true and no gitleaks (failed, "no gitleaks on CI"); the CI-07 probe with GITHUB_WORKSPACE and GITHUB_ACTIONS set (failed, as on CI); `pnpm test:oracle` with the PAR-29 remittance removed (failed, the same message as CI).
- [pass] 9144b56: `flock … env DATABASE_URL=… pnpm exec vitest run tools/test tools/lint tools/typecheck tools/hooks tools/engine-freeze/check.test.ts packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts`: 40 files, 528 passed; the probe with GITHUB_WORKSPACE, GITHUB_ACTIONS, RUNNER_TEMP and CI set: 10 passed; pre-push.test.ts with CI=true: 22 passed, none skipped; `pnpm typecheck`: exit 0 (a first try failed TS2741 on the env object's type, fixed before the commit); eslint on the three changed tests and actionlint: clean; tools/brand-colors, brand-copy, brand-fonts, lint-logs, fixture-check, test-oracle and watched.test.ts: 10 files, 148 passed; `pnpm synth --large`: 1.7 s, the same bytes.
- [pass] 9144b56: the freeze check against 49514e8, the forbidden-path diff (empty; 98 files in all, +6,086 / -1,642), the domain-model summary ("No change") and the stale-name grep (8 lines) run again: unchanged.
- [pass] `git push origin co-001/ci-speed` (9144b56): the pre-push hook checked 1 commit, gitleaks found no secret; a fast-forward, no force. The PR body was updated with the CI rows and is byte-identical to the local file.

### Open items
- The two adversarial reviews (CI and test infrastructure; security, for the supply-chain gates under the gate) and the fix round, which runs the full local suite once (design section 6), are next.
- The integration pushed twice, not once: the second push (9144b56) carries the three fixes the first CI run found, so the reviews start from a green head. Recorded here and in the PR body.
- workflows.test.ts's actionlint case skips on CI because the runner has no actionlint (so at the base too); ci-deps, which pins every tool, could install the pinned actionlint in `static` so the case runs on CI.
- A1, A1′, A2's CI totals, A3's per-file durations (each route file at most 90 s, no db file over 240 s; locally route files 55-64 s, consumer-lease 170-202 s) and the shard union are read from this PR's last three heads and the first five push runs with docs/runbooks/ci.md's commands.
- GitHub-only behaviour to confirm on the PR's runs: `overwrite: true` on the first "Re-run failed jobs", `github.event.before` and the cache seeding on the first push run, the private widths only if the repository goes private, the images job and the github reporter's annotation on the page.
- S3: read the first runs' "lint: 3 groups … memory budget" and "typecheck: … processes at once" lines against section 3.1.2's 15.6 and 7.7 GiB; the warm typecheck on CI needs the first push run to seed node_modules/.cache/tsc ("cache: N of 21 warm" in static's log).
- The founder applies the ruleset (F7) with the four checks after the first green push run; ops HANDOFF.md:54 and lanes/lane-b.md need the new names (`check` becomes `all green`; the approval is the `domain model` job; the database suite runs in 4 shards; a new route or tenant table needs no test-file change). Not changed here: the ops branch is not this pull request's.
- For the later CI pull requests: a three-digit "#NNN" (for example "audit #112") in a comment under apps, packages, tools or infra fails tools/brand-colors' scan; cite it as "audit item 112". ci-mutation (M1): @tp/stryker-canary needs `"typecheck": "tsc --noEmit"` and its own tsconfig.json, or `pnpm typecheck` refuses to start (R32).
- For the TypeScript 7 pull request (N8): revisit how tools/typecheck/run.ts resolves tsc and measures RSS if bin/tsc becomes a native shim.
- Lane A's #42: apply its consumer mail-config change once, in apps/worker/src/screening/test-support/consumer.ts's localMail(); its new routes and tenant tables join the partition and the fold by themselves; after ci-speed merges its unsigned domain model shows as a red `domain model`, not a red database suite.
- Observed, not changed: a collection run (`vitest list --no-staticParse`) still leaves `tp-content-root-*` directories from apps/web/src/lib/routes/test-support/content-root.ts, which creates them at import (base behaviour; the ones these counts left were removed).

