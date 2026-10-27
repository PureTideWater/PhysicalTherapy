# scout-files progress (2026-10-27)

Read: design 3.3 whole (lane-b-ci.md:1671-2727), phase-1 summary whole.
merge-base(8b38f48, e908c21) = 123b8fa5. Files changed by both sides (12): release-dry-run.yml, release.yml, ADR 0066,
reconciliation-001, test-matrix, ci.md, matrix.ts, registry.ts, containers.ts, watched-paths.txt,
no-duplicated-versions.test.ts, workflows.test.ts. Lists: scratchpad/reread2/{cb-files,base-files}.txt.
ci.yml, large-zip.yml, screening-capacity.yml, Dockerfile, shell.tsx, brand.spec.ts, snapshots, ADR 0058/0062/0063,
screening-capacity.md, dependency-upgrades.md, apps/worker/package.json, restore-drill: unchanged 8b38f48..2ab2b15.

## Item 5 (tests) DONE
unit run (--project unit tools/test tools/ci tools/screening-capacity packages/synth): 45 files, 3 failed | 693 passed |
1 skipped. Log scratchpad/reread2/unit-run.log. Failures: browser-version catalog line (phase 2); workflows runner rule
:428 (content-calendar check/notify, release-capacity capacity/notify on ubuntu-24.04); simulated rewrite :2742 (same rule).

## Item 2 (new workflows) facts
- release-capacity.yml: capacity :36 (24.04, 180 min, buildx v0.34.1 digest, build-push worker Dockerfile load:true
  tag tp-worker:capacity cache-from gha screening-capacity-worker, no provenance/sbom lines, setup-node cache pnpm,
  pnpm install, tsx tools/release/scale.ts, tools/release-capacity/run.ts --worker-image; no CHROMIUM_INSTALL; no .Id
  read (run.ts uses DockerRuntime, processImagesProblems only)); notify :114 (24.04, issues write).
- content-calendar.yml: check :43 (pnpm install, tsx tools/content-calendar/index.ts), notify :68. No docker, no browser.
- ADR 0071:319 ties release-capacity's runner label to screening-capacity's ("move ... with screening-capacity's").
- Recommendation: release-capacity capacity -> RELEASE_CHAIN (9 jobs) on RELEASE_RUNNER.label; the other 3 -> 26.04
  (non-chain count 18 -> 21).

## Item 3 counts (CI run 40401493722, push e908c21, 2026-10-26T21:06Z, all jobs ubuntu-24.04, via GitHub MCP get_job_logs; gh api job logs refused: blob host)
- unit (job 121848211472): 377 files, 6265 passed | 1 skipped (6266).
- db: 1/4 (121848211735) 3151 passed | 1 skipped (32 files, restore-drill.db.test.ts among them); 2/4 (121848211680) 2615 (32 files);
  3/4 (121848211747) 2534 (32); 4/4 (121848211603) 922 (31). Total 9222 passed, 1 skipped, 127 files.
- e2e: 1/2 (121849065662) 27 passed; 2/2 (121849065557) 27 passed => 54.

## Item 1 facts so far
- release.yml:342 / release-dry-run.yml:175 docker/login-action v3.7.0 -> v4.7.0 (81c6f93d); only base changes to both.
- BuildKit v0.34.1@sha256:99368f3e... on 5 setup-buildx steps incl. release-capacity.yml:54.
- apps/web/package.json: next ^16.4.1->^16.4.3 (:39), postcss ^8.5.30->^8.5.31 (:53). root package.json: catalog: for
  @types/node, @vitest/coverage-v8, eslint, fast-check, tsx, typescript, typescript-eslint, vitest. tools/package.json:
  eslint/typescript-eslint catalog:, new export ./content-calendar; playwright-core still "1.56.1" at :34.
- pnpm-workspace.yaml: catalog gains @vitest/coverage-v8 ^5.0.5, eslint ^10.13.0, typescript-eslint ^8.72.0, vitest ^5.0.5;
  overrides typed-rest-client>qs 6.16.1; trustPolicyExclude [semver@6.3.1].
- no-duplicated-versions.test.ts: new test 'names each catalog package as "catalog:" in every workspace manifest' (root incl).
- containers.ts: ServiceName gains 'worker'; SERVICE_COMMANDS.worker (release-capacity). 
- lockfile: axe-core@4.13.0 :2537/:5673/:4239, fsevents@2.3.2 :2924/:6001/:6431, playwright@1.56.1 :6427, next 16.4.3 snapshot peers @playwright/test 1.56.1 (:6297/:6317), next peer ^1.51.1 (:3323).

## Item 3 other
- expectAccessible: 14 specs, 72 calls (was 12/66): +pricing.spec.ts 4, +viewer-phi.spec.ts 1, billing 3->4. contracts.spec imports a11y (atPhoneWidth) only.
- header controls: shell.tsx unchanged by base (:57, :87 ci-browser's); getByLabel only sign-in.spec.ts:18, brand.spec.ts:363-364.
- no new CHROMIUM_INSTALL; install steps ci.yml:236,:348,:547, large-zip:62, release:280, screening-capacity:251.
- restore-drill unchanged; CI db shard 1 has its 1 skip.

## Item 4 (#42, gh api GET 2026-10-27 ~01:55Z)
draft true, open, head 098636e3 (co-001/pr-06b-mail-streams), base claude/build-platform e908c214, mergeable true,
mergeable_state blocked, updated 2026-10-27T01:45:57Z, 188 files, 17 commits. Files list: scratchpad/reread2/pr42-files.json.
Shared with ci-browser's committed changes (7): shell.tsx, ADR 0062, reconciliation-001, test-matrix, matrix.ts, registry.ts,
watched-paths.txt. Phase-2/after-42 shared: apps/web/package.json (-14,6), apps/worker/package.json (-36,6), pnpm-lock (6 hunks
+33), run.ts (9 hunks), report.ts (3), report.test.ts (4), test-support/measurements.ts (2), screening.spec.ts (3 hunks; not
changed by ci-browser). Only textual conflict expected: ADR 0062 EOF (both append after :1381). #42 adds mail-cutoff.spec.ts,
mail-notices.spec.ts (2 expectAccessible each). No workflow, tools/test, Dockerfile, pnpm-workspace or tools/package.json.
npm dist-tags 2026-10-27 01:54Z: latest 1.64.1 / 4.14.0 unchanged.

## DONE: report written to scratchpad/reread2/scout-files.md (items 1-5 and "Changes 3.3 needs", 19 entries).
