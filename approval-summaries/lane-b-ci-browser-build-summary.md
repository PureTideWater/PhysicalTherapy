# co-001/ci-browser, phase 1 integrated

Worktree /home/user/ci-browser, branch co-001/ci-browser (cut from co-001/ci-deps 123b8fa5), head 8b38f488, pushed to
origin (branch only; no PR: none opens until ci-deps, PR #48, merges).

## Commits on top of ci-deps
- P1 (3236ca36): 0c63d3c4 shell.tsx names + brand journey; 26354b79 worker image copies the lockfile's playwright-core;
  460da900 browser.json + browser-builds/*.sha256 + tools/ci/browser-build.ts; 3236ca36 ADR 0058, ci.md,
  dependency-upgrades.md.
- P2 (79350bb4): ac998e25 image-id.ts; fac8e80a containers.ts proof + measure.test.ts; 72c86d08 apt-archives.sh;
  80891e73 runners per F5, apt cache, browser checks, baseline step, archive and identity steps, frozen publish-content
  runs-on (F4); ab9e1a86 WATCHED_FIXED; b98209f7 launch-check comments; 938568b2 collection; 90edd53a restore-drill
  comment; c83e6eac screening-capacity runbook; 2574d778 ADR 0062; 03ac46a8 ADR 0066 Part 3, 0063 item 15; e61f7edb
  reconciliation-001; 79350bb4 CI-18..CI-20.
- 30a1ac6f merge P1 (--no-ff); bdfae9ea merge P2 (--no-ff). No file overlapped; no conflict.
- 8b38f488 seam: WATCHED_FIXED gains `apps/web/e2e/browser-builds/*` (the browser check refuses a record whose list is
  missing or does not hash to treeSha256, so the lists change what the capacity job checks); watched-paths.txt
  regenerated with watched.ts --write; watched.test.ts holds the pattern and both lists; collection.test.ts FILES gains
  tools/test/browser-version.test.ts; ADR 0066 Part 3 and screening-capacity.md name the lists beside browser.json.
  Failing first: watched.test.ts 1 failed / 5 passed before (WATCHED_FIXED lacked the line), 7 passed after with
  collection.test.ts.

## Seams checked
- ci.yml:32's comment names no Playwright version (P2 already reworded it): no-duplicated-versions and the simulated
  rewrite are green.
- Workflows call `node tools/ci/browser-build.ts` (ci.yml unit/db/e2e, large-zip, release capacity,
  screening-capacity capacity) and `--image <ref>` (ci.yml images, release build): P1's interface; every one of those
  jobs checks out the whole tree, so browser.json and browser-builds/*.sha256 are present. The screening-capacity push
  paths' `apps/web/**` already covers both.
- measure.test.ts: the old Dockerfile-literal assertion is gone (P2 removed it; browser-version.test.ts holds it);
  workerPlaywrightVersion reads the installed package.
- Registry CI-18 assertedBy: browser-version, browser-build, no-duplicated-versions, workflows; CI-19: brand.spec.ts,
  a11y.ts; CI-20: workflows, apt-archives, image-id, measure. fixtures.test 'points only at tests that exist' passes
  on the merged tree.
- Files against 3.3.2: everything of 3.3.2 is present except the phase-2 files (the four manifests' fields,
  pnpm-workspace.yaml's catalog line, pnpm-lock.yaml, the seven PNGs) and the after-#42 split (run.ts, report.ts,
  report.test.ts, launch-check.test.ts, test-support/measurements.ts; launch-check.ts changed in comments only).

## Checks (logs in scratchpad/ci-browser/progress/int-*.log)
- pnpm install --frozen-lockfile: ok.
- pnpm typecheck: passed, 22 projects.
- pnpm lint: passed, 1,521 files, 0 errors, 0 warnings.
- actionlint 1.7.7 -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown' .github/workflows/*.yml: rc 0.
- pnpm test (unit + coverage): 337 files, 1 failed | 336 passed; tests 1 failed | 5188 passed | 3 skipped. The one
  failure is browser-version.test.ts 'names playwright-core once, as pnpm-workspace.yaml's catalog line' (phase 2,
  listed below: catalog has no playwright-core line yet).
- pnpm exec vitest run tools/test tools/ci tools/screening-capacity: without --project it also collects the db
  project's oracle.db.test.ts, which fails to connect to Postgres at 5432 (no compose Postgres here; file untouched).
  With --project unit: 31 files, 495 passed, 1 failed (the same phase-2 test).
- pnpm synth --all: 0 files written, 486 + 16 unchanged; git status clean.
- BASE=origin/claude/build-platform pnpm actions:check: every action pinned to its release's commit (pre-existing
  node20 warning for docker/login-action v3.7.0).
- node tools/ci/browser-build.ts: exit 1, the designed red until phase 2 (141.0.7390.37 rev 1194 vs browser.json
  156.0.8078.4 rev 1248 for both builds, plus 1194's headless_shell symlink named).
- brand.spec.ts + sign-in.spec.ts on 1.56.1/1194, E2E_DATABASE=tp_laneb_cibrowser_e2e on localhost:5433, port 3171,
  --workers=2 --retries=0: 10 passed (2.0 m); database dropped (0 remain), temporary directories removed.
- git diff --stat co-001/ci-deps -- <#42's 143 files>: only shell.tsx, ADR 0062, reconciliation-001.md,
  test-matrix.md, matrix.ts, registry.ts, watched-paths.txt (all allowed). pnpm-lock.yaml and every package.json and
  pnpm-workspace.yaml unchanged.
- git push -u origin co-001/ci-browser: pre-push hook ran, 20 commits checked, gitleaks 8.24.3 found no secret; new
  branch created. No PR opened.

## Deviations (builders' and integrator's)
- P1: accessible name via toHaveAccessibleName, not ariaSnapshot (a <summary> has no role in 1.56.1's aria snapshot);
  file lists committed as browser-builds/<dir>.sha256 (each hashes to treeSha256) so a difference names files;
  browser-build.ts also fails on non-regular entries, runs --version, finds the only directory when the recorded one is
  absent, uses xargs -0r in the image; Dockerfile mkdir /out && cp -RL, /root/.npm no longer removed;
  no-duplicated-versions gains 'Playwright's version in no scanned file'; ADR 0058 and ci.md describe the merged state.
- P2: RELEASE_CHAIN is 8 jobs (release-dry-run capacity included), 18 move; apt key hashes playwright-core's installed
  browsers.json, saved off pull_request only; baseline step compares the written set with git ls-files of the committed
  baselines, own --output, after the failed-pictures step; capacity jobs keep default conditions past the browser
  check; release build and dry-run build prove the saved tag, release push checks all four archives before any push;
  the --image-archive/--expect-image, report format 9 and launch-check refusals deferred (after #42) with
  proveLoadedImage built and tested now; browser.json in WATCHED_FIXED; CI-20 text covers what is asserted now.
- Integrator: browser-builds/* added to WATCHED_FIXED (above). The tools vitest command was recorded both with and
  without --project unit because the bare form also runs a db test that needs compose Postgres.

## Phase 2 plan (after 2026-10-26T19:18:50Z, on this branch)
1. The bump: apps/web/package.json @playwright/test 1.64.1 and @axe-core/playwright 4.14.0; pnpm-workspace.yaml
   catalog `playwright-core: 1.64.1`; apps/worker/package.json and tools/package.json `"playwright-core": "catalog:"`.
2. The lockfile under the gates: `pnpm install` (release-age and trust gates, no exclude); check the lockfile diff
   names only Playwright, axe and their own entries, one playwright-core; then `pnpm install --frozen-lockfile`.
   browser-version 'names playwright-core once' turns green; workflows.test's key-file assertion holds.
3. 1248's layout: `/home/user/ops/tools/setup-container.sh` with /home/user/ci-browser as the worktree argument
   (CFT_BUILDS 1248, pinned SHA-256), or by hand: unzip scratchpad/ci-browser/cft/chrome-linux64.zip into
   $PLAYWRIGHT_BROWSERS_PATH/chromium-1248/ and chrome-headless-shell-linux64.zip into
   $PLAYWRIGHT_BROWSERS_PATH/chromium_headless_shell-1248/, touch INSTALLATION_COMPLETE and DEPENDENCIES_VALIDATED in
   each (zips c3e50596...b8ba20 headless shell, 43fd3176... chromium).
4. browser.json confirmed: `node tools/ci/browser-build.ts` exits 0 (both treeSha256, binary 4fa61f0b...e5f9d6 and
   377a9fc0...5f025, revision 1248, 156.0.8078.4).
5. The seven baselines: `pnpm --filter @tp/web exec playwright test e2e/brand.spec.ts --update-snapshots=all
   --retries=0`, then the same again as the no-op regeneration: git status clean after the second; commit the PNGs
   and record their SHA-256s.
6. The specs of 3.3.4 on 1248 with axe 4.14 (label-content-name-mismatch active), --workers=2 --retries=0, database
   tp_laneb_cibrowser_e2e (dropped after): sign-in plus the twelve with expectAccessible: billing, brand, era-exports,
   models, monitoring, onboarding, packets, reports, screening, security, triage, unattested.
7. Re-run typecheck, lint, pnpm test, tools vitest, synth --all, actionlint, actions:check; push; then on CI record the
   baseline step's duration, V3's install durations, apt kept/discarded counts, the images job's containerd .Id rule
   and the dry run's build outputs into ci.md and ADR 0066 Part 3; ADR 0058 records any local/CI disagreement; the PR
   records the baseline run's seven SHA-256s and the A9 inspection.

## After #42 (follow-up PR; trigger: #42 merges, or GitHub moves ubuntu-24.04's docker-ce past 28 first)
- run.ts: --image-archive <name>=<path> and --expect-image <name>=<config digest>; its .Id read (:825-826) replaced by
  containers.ts proveLoadedImage(tag, {archive, expectedConfig}) through image-id.ts.
- report.ts: REPORT_FORMAT tp-screening-capacity/9; WorkflowRun.imageOS/imageVersion; measurements imageStore and
  imageSource; report.test.ts and test-support/measurements.ts with them.
- launch-check.ts: RELEASE_RUNNER imageOS 'ubuntu24'; refuse a binding report from another imageOS, imageSource save,
  or format 8; launch-check.test.ts.
- release.yml capacity passes --image-archive and --expect-image from needs.build.outputs; screening-capacity.yml
  passes --image-archive; workflows.test.ts holds both.
- Failing first at the merge base; dispatch the 26.04 probe to record imageStore on #41.
- watched-paths.txt regenerated with watched.ts --write after either merge; #42's and ci-browser's matrix, registry,
  test-matrix, reconciliation and ADR 0062 rows kept in merge order; CI-20 gains the report/launch-check clause and
  registry report.test.ts and launch-check.test.ts.
- O6: whichever of #42 and ci-browser merges second runs axe 4.14 over #42's mail pages and journeys (mail-cutoff,
  mail-notices) and fixes any Label-in-Name finding.
- Meanwhile safe: under F5 the release's capacity chain stays on ubuntu-24.04 (classic store, .Id is the config
  digest); ADR 0066 Part 3 'After #42' states this and the trigger.
