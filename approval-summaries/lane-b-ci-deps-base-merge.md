# ci-deps (#48): base merge and login v4.7.0 (2026-10-26, about 15:22 to 15:50 UTC)

The head is fb0af1d3, pushed with `123b8fa5..fb0af1d3` through the pre-push hook and gitleaks, with no force and no --no-verify. Nothing was posted on GitHub. No pull request was opened or merged. Worktree: /home/user/ci-deps.

## Commits
- dcefde88: merges claude/build-platform at d7259775 with --no-ff (rule 6). Nine pull requests came in: #46, #54, #53, #55, #50, #52, #56, #51 and #49.
- 8daf8f64: brings content-calendar.yml and release-capacity.yml under ci-deps' rules.
- fb0af1d3: pins docker/login-action@81c6f93d4bc991e510b342a00b419b3bb4efc5c6 # v4.7.0 in release.yml and release-dry-run.yml together.

## Conflicts
- docs/product/reconciliation-001.md: kept both entries in merge order. #49's audit #30 exception for the content checker (granted 2026-10-20) comes first, then ci-deps' F4 entry for publish-content.yml (ruled 2026-10-25).
- tools/test/workflows.test.ts had four hunks:
  1. Imports: kept both (check-action-pins/workflows and content-calendar/render).
  2. Header comment: ci-deps' text, with #49's content calendar and weekly real-size test (ADR 0071) added.
  3. The PINNED comment: ci-deps' pinOf comment. There is no PINNED any more.
  4. ci-deps' pin rules, dry-run and checkout blocks replace the base's literal-pin block. Rule (a) now also asserts that release.yml, screening-capacity.yml, ci.yml, content-calendar.yml and release-capacity.yml are each read and each name at least one action. Rules (a) and (b) already hold every file to the SHA plus `# vX.Y.Z` form and to one SHA per action.
- In #49's new tests, PINNED.checkout became pinOf('actions/checkout') and PINNED.buildPush became usesAction(step, 'docker/build-push-action'). Every read goes through WORKFLOWS, under the CI_TREE root.
- The CI-10 table merged automatically: content-calendar is check 15 and notify 5; release-capacity is capacity 180 and notify 5.
- The merge commit's message ends with the two attribution lines and has no "# Conflicts" trailer.

## The new workflows
- content-calendar.yml:
  - Pins moved to checkout v7.0.1, action-setup v6.1.0 and setup-node v7.1.0.
  - It already had persist-credentials: false.
  - setup-node keeps `cache: pnpm`, as ci.yml and screening-capacity set it.
  - It has no Postgres, Docker build or upload.
- release-capacity.yml:
  - Pins moved to checkout v7.0.1, action-setup v6.1.0 and setup-node v7.1.0 (`cache: pnpm`).
  - setup-buildx moved from v3.12.0 to v4.4.1 and now has BuildKit's driver-opts pin.
  - build-push moved from v6.19.2 to v7.4.0.
  - upload-artifact moved from v4.6.2 to v7.0.2 and now has `overwrite: true`.
  - It has no services: block. Its harness takes Postgres from docker-compose.yml through composePostgresImage, so the compose rule holds.
- Release-capacity cache judgement: its read-only `cache-from: type=gha,scope=screening-capacity-worker` stays, and it writes no cache. Reasons:
  - Its report is advisory and never attested.
  - It is not a required check.
  - No launch check, deploy or decision-13 path reads it. Only release.yml's attested capacity report binds (ADR 0062 decision 13 and its ADR 0066 amendment; ADR 0071 calls this a weekly test that opens issues).
  - So a layer built by another run cannot reach a binding measurement.
  - This is recorded in a comment in the workflow and in ADR 0066 Part 2.
- ADR 0066 Part 2 now lists release-capacity among the setup-buildx steps that carry driver-opts.
- workflows.test.ts: the CI-13 list of setup-buildx files gains release-capacity.yml.
- Dependabot already covers the new files, since the github-actions ecosystem uses directory "/".
- #49's CODEOWNERS lines and #55's pull_request_template.md change pass ci-deps' tests.
- watched-paths.txt: running watched.ts --write gave 529 lines and no diff.
- Lockfile: the base changed only `exports` in its manifests, and the frozen install passes.

## Login v4.7.0
- git ls-remote reads refs/tags/v4.7.0 as 81c6f93d (a lightweight tag with no ^{}). The commit is from 2026-10-23T15:11:41Z, so it was three days old at 15:11:41Z today. The commit was made at 15:27Z.
- At that commit, action.yml declares registry, username and password as inputs, and the action runs on node24.
- The node20 warning is gone: actions:check reports 0 warnings.
- ADR 0066 Part 2's login row is now true, and its sentence now says the pin was made and the warning cleared.

## Checks
Run at fb0af1d3 with PostgreSQL 18 on 5433. It was down, with a stale pid file, and was started with the pg_ctl command. Every heavy check ran under flock. Logs are in scratchpad/ci-deps/bm/chk-*.log.

| Check | Result |
| --- | --- |
| pnpm install --frozen-lockfile | pass |
| pnpm typecheck | pass |
| pnpm lint | pass: 1,612 files, 0 errors, 0 warnings |
| actionlint .github/workflows/*.yml | pass |
| pnpm test | pass: 377 files, 6,261 passed and 4 skipped (6,265) |
| tools vitest (tools/test, check-action-pins, check-toolchain, check-licenses, screening-capacity, ci) | pass: 37 files, 536 passed |
| Rewrite test under FORCE_COLOR=1 CI=true, with actionlint on PATH | pass |
| Rewrite test under FORCE_COLOR=1 CI=true, without actionlint (a shadow of /usr/local/bin) | pass |
| pnpm synth --all, then git status | 0 files written; the tree is clean |
| pnpm verify-content | pass |
| BASE=origin/claude/build-platform pnpm actions:check (live) | pass; every pin is its release's commit, login v4.7.0 included; 0 warnings |
| BASE=origin/claude/build-platform pnpm toolchain:check | red on CQ3 alone: pnpm 10.34.8 is young until 2026-10-26T18:06:37.606Z; every other rule passes |
| git diff --numstat origin/claude/build-platform -- pnpm-lock.yaml | `43 0`, the licence commit's libc lines only |

## Left open
- CI has not been read on fb0af1d3. `static` stays red until 18:06:38Z (CQ3).
- The bumps from 2026-10-26T19:18:50Z, the review, the full suite, CI, the fresh-clone verification and the merge: steps 3 to 5 of the status file's handoff.
- The status file at /home/user/ops/approval-summaries/lane-b-ci-deps-status.md has not been updated with this round.
- The local unit count is 6,261 passed and 4 skipped. CI's count is still to be read.
