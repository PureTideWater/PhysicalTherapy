# Review: PR #48 (co-001/ci-deps), CI and test infrastructure lens

Head reviewed: 2d86bb0e6b596f41e63686fd9aa706ef107139c5, against claude/build-platform 6ddd587. Phase 1. I worked in a fresh
clone (scratchpad/ci-deps/review-ci-infra), installed it with `pnpm install --frozen-lockfile --prefer-offline` (exit 0), and
removed it when I finished. I committed nothing, pushed nothing and posted nothing. My progress log is
scratchpad/ci-deps/progress/review-ci-infra.md, and the logs it names are in scratchpad/ci-deps/progress/.

## Verdict

One blocking defect. On CI, `unit` is red on the head, and the cause is not the CQ3 rule. The simulated Dependabot rewrite
test fails on every CI run. Every other part of the lens holds up: Postgres from compose (proved on the runner),
release.yml's no-cache rules, the dry run, the capacity harness, the pin rules (a) to (d), the pin checker's network
selection and no lost tests. Phase 2 resolves under the gates, and lint, typecheck and the Next build stay green, with
two command-level risks noted below.

## Findings

### B1 (blocking): the rewrite test fails on every CI run, so `unit`, and with it `all green`, is red, and so is every Dependabot pull request
- Evidence: CI run 40255481181, `unit` job 121356293955: `FAIL tools/test/workflows.test.ts > a simulated Dependabot rewrite … AssertionError: expected 0 to be greater than 80` at workflows.test.ts:1928. The run was `1 failed | 5080 passed | 1 skipped (5082)`.
- Cause: `assertionsOn` (workflows.test.ts:1893-1901) spawns vitest with the parent's environment. On GitHub, `CI` is set, so the spawned vitest prints ANSI colours, for example `Tests \x1b[22m \x1b[1m\x1b[32m97 passed`. `/Tests\s+(\d+) passed/` (:1928) then finds nothing. The spawned run itself passed: its status assertion at :1926 held. The builder's local runs had no colour, so they passed.
- Reproduced: `FORCE_COLOR=1 pnpm exec vitest run --project unit tools/test/workflows.test.ts -t 'simulated Dependabot rewrite'` fails with the same "expected 0 to be greater than 80" and exit 1. `NO_COLOR=1` on the same command passes (progress/rv-copies.log).
- Effect: A4 ("green by construction") is false on CI today, because the failure does not depend on the diff. It also falsifies the summary's expected "5,081 passed and 1 skipped" until fixed.
- Fix: in `assertionsOn`, set `NO_COLOR: '1'` and delete `FORCE_COLOR` (and `CI` if wanted) from `env`. Better: run the spawned vitest with `--reporter=json --outputFile=<scratch>/r.json` and assert `numFailedTests === 0` and `numPassedTests === numTotalTests - 1` (the self-skip), instead of parsing coloured text against a literal 80. Then prove it with `FORCE_COLOR=1 CI=true`.

### S1 (should_fix): a push run's tag re-read can time out `static`, although it is meant to only warn
- Evidence: check.ts (push loop, `for (const ref of [...unchanged].sort())`) reads the tags one at a time. Each `tagCommit` is `withRetries` with a `git ls-remote` limited to 30 s per try (network.ts `liveTransport.lsRemote`, `timeout: 30_000`), three tries and 2 s plus 5 s of backoff, so about 97 s per pin. With 13 pins that is about 21 minutes, while `static` has `timeout-minutes: 15`. If github.com hangs instead of refusing, the push run's `static` times out red, which contradicts "never a failure" (ADR 0066 Part 2; ci.md "Action pins").
- Measured: with the proxy refused (fast failures), `BASE=HEAD GITHUB_EVENT_NAME=push pnpm actions:check` gave warnings only and exit 0. A hang was not simulated; the bound above is arithmetic.
- Fix: bound the push re-read with one overall deadline (for example 60 s for the whole loop, the rest reported as one warning), run the reads concurrently with a small limit, or give the warn-only path one try with a 10 s limit.

### S2 (should_fix): a replaced test's assertions did not all survive: the database healthcheck's timing is no longer held
- Evidence: the base's "the Postgres services" test (6ddd587 workflows.test.ts:1606-1620) asserted the whole health option string, `--health-interval 2s --health-timeout 5s --health-retries 30`. Its replacement (head :1767-1775) asserts only `healthcheck.test`, the port and the password. docker-compose.yml:17-21 now has `timeout: 3s` where the services had 5 s, and nothing holds the interval, timeout or retries. A change to `retries: 1` or `interval: 60s` would pass every test. The rest of the replaced tests survives: the job list, the TCP check and the absence of `pg_isready` polling are in the compose rule, the pin form is in (a) with (b), and the Dependabot block is in dependabot-config.test.ts.
- Fix: assert `healthcheck` equal to `{ test: [...], interval: '2s', timeout: '5s', retries: 30 }` (setting the timeout back to the 5 s that CI proved), and assert that interval × retries stays below postgres.sh's `--wait-timeout 120`.

### N1 (nit): ADR 0066 Part 2 (d) describes the rewrite test as running two files; it runs three
- Evidence: ADR 0066 Part 2, item (d): "runs `workflows.test.ts` and `dependabot-config.test.ts`". The code's `TESTS` (workflows.test.ts:1860) also has no-duplicated-versions.test.ts, and the build summary records that as a deviation.
- Fix: name all three files, and with B1's fix say that the spawned run's counts are read from its JSON report.

### N2 (nit): ADR 0066 Part 2's pin table states login v4.7.0, but the head pins v3.7.0
- Evidence: the ADR table row "`docker/login-action` | v4.7.0 | 81c6f93…". release.yml and release-dry-run.yml pin `c94ce9fb… # v3.7.0`. CI shows "Node.js 20 is deprecated … forced to run on Node.js 24: docker/login-action@c94ce9fb" (dry run `push` job 121356783527).
- Fix: none in phase 1 if phase 2's login commit lands before merge. Otherwise mark the row "from 2026-10-26T15:11Z (phase 2)".

### N3 (nit): unit tests do not hold the pnpm overrides to overrides.json offline
- Evidence: on the phase-2 simulation tree, with the qs override added to pnpm-workspace.yaml and overrides.json left empty, `vitest run tools/check-toolchain …` passed (53 tests). Only the networked `toolchain:check` in `static` catches the mismatch.
- Fix: in check.test.ts's "the committed lists", run `overridesRule` and `trustRule` (both offline) on the repository's real tree.

### N4 (nit): the dry run does not exercise release.yml's capacity and report jobs
- Evidence: release-dry-run.yml mirrors only `build` and `push`. These run first on a tag, verified only for inputs by check-action-pins: setup-node with `package-manager-cache: false`, action-setup with `cache: false`, download-artifact by name, and attest-build-provenance. This matches the design's scope, and those inputs were validated live (static job 121356293870: "inputs declared").
- Fix (proposal): add a dry-run `capacity-setup` job with checkout, action-setup `cache: false`, setup-node `package-manager-cache: false` and `pnpm install --frozen-lockfile`, held by the shared-step rule.

### N5 (nit): raw.githubusercontent.com is read unauthenticated from shared runner addresses
- Evidence: network.ts `actionFile`. A Dependabot actions pull request with about 12 new pins, plus their nested actions, makes about 25 to 40 GETs, and a 403 rate limit fails closed after 2 s and 5 s.
- Fix (proposal): a longer final backoff on 403/429 (for example 30 s), or reading through `git fetch --depth 1 <sha>` with the same ls-remote host.

## Checklist

1. A4. I ran the simulated rewrite myself: in the full local unit run it passed, and under colour it failed (B1). I applied a
   realistic Dependabot bump by hand to a copy of the CI files: actions/checkout to a new SHA `# v7.0.2` at every use (8
   files, publish-content.yml included), setup-node to a new SHA `# v7.2.0`, the compose postgres digest and the node
   digest in both Dockerfiles. `CI_TREE=<copy> vitest run --project unit` on the three files gave 99 passed and 1 skipped
   (the self-skip). A broken copy (large-zip's `persist-credentials` removed, compose healthcheck without `-h`) failed
   exactly those two assertions, "large-zip.yml large-zip: expected undefined to be false" and the healthcheck diff, so
   the run reads the copy. I then applied the same bump to the whole clone and ran the full unit project (NO_COLOR): 329
   files, 5,082 passed, and reverted it (git status clean). No assertion names a literal pin, version or digest:
   `git grep` for every pinned SHA, both digests and every version tag finds them only in the workflows, Dockerfiles and
   compose. The literals left are synthetic fixtures (`octo/*`), measure.test.ts's `postgres:18-` major (deliberate,
   since majors are ignored) and mutation's Node, held to unicode.json.
2. Rules (a) to (d) and `usesAction` cover all 8 workflow files, release-dry-run.yml and publish-content.yml included.
   (a) asserts at least 8 files and `parsePin` on every parsed `uses:`. (c) catches `actions/cache@<sha>` anywhere through
   `plainCacheSteps` (capacity, :710), and release.yml refuses `actions/cache*` by prefix (:562). The frozen-copy rule
   normalises the live file's refs only.
3. Compose. postgres.sh runs under `set -euo pipefail`, with the background subshell's three streams redirected, the
   status written to a `.partial` file and then moved, `wait` polling for 130 s (overridable), and the failure paths
   printing the log. The stub-docker test covers healthy, failing and hanging, and the hanging case returns in under 5 s.
   On CI it is proved: domain model job 121356293715 printed "PostgreSQL is healthy (… returned after 0 s here)", and
   db 1-4, e2e 1-2 and domain model all passed. Step order holds: up right after checkout, wait before the first database
   step, quiet right after the wait and after Playwright's install in db and e2e, the log step last with `if: failure()`.
   large-zip also gained `persist-credentials: false` and the same steps. Port 5432, the password `test` and the TCP
   health are asserted. The health timing is not (S2).
4. release.yml restores nothing by any path. There is no `actions/cache*`. setup-node has no `cache` and sets
   `package-manager-cache: false`. action-setup sets `cache: false`. Both trivy steps set `cache: false` with a `cache-dir`
   under runner.temp, and check-action-pins followed setup-trivy's restore and save and trivy's actions/cache to that
   input live ("off (release.yml sets cache: false)", static job 121356293870). Buildx sets `cache-binary: false`, and no
   build sets cache-from or cache-to. All 3 uploads overwrite. The dry run ran green on the pull request (build
   121356293164, push 121356783527: v8 merge-multiple download, identity check, load, ghcr login). The shared-step rule
   and the save/identity script equality are real (:1331-1361).
5. Capacity. `parseComposePostgresImage`/`composePostgresImage` is tested, including a root with another digest.
   `WATCHED_FIXED` and watched-paths.txt contain docker-compose.yml, and `watched.ts --write` gives no diff. The push paths
   and `pushPaths` both include docker-compose.yml. The CI capacity job built both trixie images and was still measuring
   when I last read it (job 121356334583), so that result is open.
6. No test lost. My full unit run at the head (ENGINE_FREEZE_BASE=6ddd587, Chromium) gave 329 files and 5,082 passed. CI's
   total is the same 5,082 (5,080, 1 failed by B1, 1 skipped). The base had 4,997 (4,996 and 1 skipped, job
   121281841727), so the head has 85 more, which matches 88 new less 3 replaced. The replaced tests' assertions survive
   except the health timing (S2).
7. Both checkers. The base is BASE reduced with `git merge-base`. On a pull request it is `origin/<base>` against the merge
   ref. On a push it is `before`, or `HEAD^1` on the zero SHA. Every pin is read when the base has no checker (CI: "every
   pin is read: the base 6ddd587c013e has no tools/check-action-pins"). A pull request that touches no pin reads nothing:
   `BASE=HEAD GITHUB_EVENT_NAME=pull_request` with the proxy refused printed "nothing read from the network" and exit 0.
   On a push, unread tags only warn (exit 0), but see S1. toolchain:check reads the registry on every run (pnpm's
   advisories and publish time, by design), and the lockfile rule reads nothing when the lockfile adds nothing (CI: "the
   lockfile adds no version against the base"). Both steps run in `static` with the `!cancelled() && install && range`
   condition and BASE, and `static` is in `all green`'s needs. CI on the head: actions:check passed, and toolchain:check
   failed only on CQ3, as designed.
8. Timeouts: CI-10's table covers every job, release-dry-run's 20/10 and publish-content's 15 included. Concurrency: the
   dry run's group starts with `${{ github.workflow }}-`. `actionlint` 1.7.7 on all workflows: exit 0, no output.
9. Documents. I spot-read ADR 0066 Part 2 (pins, release, dry run, compose, Dependabot, consequences), ci.md (job table,
   red gates), README, CLAUDE.md and the PR template: they match the workflows, except N1 and N2. required-checks.test.ts
   and the synth registry ("points only at tests that exist") pass in the full run.
10. Phase 2: see the phase-2 findings below.

## Checks run (command → result)

- `git clone … && git checkout 2d86bb0e…`; `flock … pnpm install --frozen-lockfile --prefer-offline` → exit 0, pnpm 10.34.8.
- `flock … ENGINE_FREEZE_BASE=6ddd587 PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers pnpm exec vitest run --project unit --reporter=json` → 329 files, 5,082 passed, 0 failed, 0 skipped (progress/rv-unit-head.json).
- CI read on the head (run 40255481181 and siblings): unit 121356293955 red (B1); static 121356293870 red on CQ3 only; lint, db 1-4, domain model, build, e2e 1-2 and images green; mutation 121358336960 green; approval-of-record green; release-dry-run build 121356293164 and push 121356783527 green; capacity 121356334583 still measuring.
- `CI_TREE=<hand-bumped copy> pnpm exec vitest run --project unit tools/test/{workflows,dependabot-config,no-duplicated-versions}.test.ts` → 99 passed, 1 skipped, exit 0. On the broken copy → exactly 2 failed (large-zip's checkout, compose `-h`).
- `FORCE_COLOR=1 … -t 'simulated Dependabot rewrite'` → 1 failed, exit 1. `NO_COLOR=1` → 1 passed, exit 0.
- Whole-clone hand bump, then `NO_COLOR=1 … vitest run --project unit` → 5,082 passed, exit 0, reverted.
- `BASE=HEAD GITHUB_EVENT_NAME=pull_request` with the proxy refused, `pnpm -s actions:check` → no network read, exit 0. `GITHUB_EVENT_NAME=push` → 13 warnings, exit 0.
- `actionlint .github/workflows/*.yml` (1.7.7) → exit 0. `bash -n tools/ci/postgres.sh` → ok. `git ls-files -s tools/ci/postgres.sh` → 100755.
- `pnpm exec tsx tools/screening-capacity/watched.ts --write` → no diff.
- Registry trust and peer check of every phase-2 target (vitest and @vitest/* 5.0.5, eslint 10.13.0, typescript-eslint and @typescript-eslint/* 8.72.0, postcss 8.5.31, next, @next/env, swc and eslint-plugin 16.4.3, fast-uri 3.1.9, qs 6.16.1) → no trust downgrade, peers satisfied (rv-scripts/trust.py).
- Phase-2 simulation in a scratch worktree (now removed). It applied every planned bump, the catalog moves and the qs override, plus scratch-only excludes for the five Stryker 10.1.1 packages and next/@next/* 16.4.3, standing in for the time that has not yet passed. `pnpm install --lockfile-only` → exit 0, no peer warnings, qs 6.16.1, semver 6.3.1 still resolved, 43 libc fields. `pnpm update fast-uri --lockfile-only` → fast-uri stays 3.1.8. `pnpm update -r fast-uri --lockfile-only` → 3.1.9, but rolldown 1.2.14→1.2.15 too. Then install → eslint 10.13.0, vitest 5.0.5, typescript-eslint 8.72.0, next 16.4.3. `pnpm lint` → 1,508 files, 0 errors, 0 warnings. `pnpm typecheck` → 22 projects pass. `pnpm --filter @tp/web build` → pass. Licence, toolchain and no-dup tests → 53 passed. `pnpm licenses:check` → pass. `pnpm audit` after the refresh → only fast-uri's 4 advisories before `-r`.

## Phase-2 findings

- The fast-uri "refresh" needs `pnpm update -r fast-uri --lockfile-only`. Without `-r` it changes nothing (still 3.1.8, so `pnpm audit` keeps 2 moderate). With `-r` it also moves rolldown 1.2.14→1.2.15, its 16 platform bindings and @oxc-project/types 0.154.0→0.155.0. Acceptance 9 forbids unexplained lockfile changes, so the summary must name these, or the refresh must be held to fast-uri (for example a temporary override `"fast-uri": "3.1.9"`).
- next 16.4.3 depends on `postcss: 8.5.23` exactly, so the lockfile keeps postcss 8.5.23 beside the 8.5.31 the apps/web bump adds. That is harmless today (no postcss advisory), but the 8.5.31 bump does not reach next's copy.
- The qs override must land in the same commit as its overrides.json entry and the check.test.ts expectation. No unit test catches a mismatch, only the networked toolchain:check (N3).
- After B1's fix, CI's unit should read 5,081 passed and 1 skipped. The catalog clause then adds one test (5,082 and 1 skipped). ADR 0066's "No test lost" and the PR body should use the CI numbers, not the local 5,082 with 0 skipped.
- The login v4.7.0 commit (after 2026-10-26T15:11Z) touches release.yml and release-dry-run.yml together. The dry run then exercises v4's login on the pull request, and actions:check reads it as a new pin. ADR 0066's table already says v4.7.0 (N2).
- Consider adding @vitest/coverage-v8 to the catalog beside vitest: its peer is vitest exactly 5.0.5, and only the root names it.
- Under the real gates after 19:18:50Z the bumps resolve. The simulation, with scratch excludes standing in for time, gave no peer conflict and no trust downgrade, and lint, typecheck and the Next 16.4.3 build passed. Vitest 5.0.5's full unit run was not repeated there; only 53 targeted tests were run.
