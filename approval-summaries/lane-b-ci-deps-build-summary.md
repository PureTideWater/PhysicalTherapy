# co-001/ci-deps build summary, phase 1 (CI 2 of 4, combined audit #112 with #19's parts; ADR 0066 Part 2; 2026-10-26)

Branch co-001/ci-deps, on 6ddd587 (claude/build-platform, which had not moved at integration), the session's licence
commit 0e7776c and gates commit 6eae41a first and unchanged, then the three builders' branches and four integration
commits; pushed at 2d86bb0e6b596f41e63686fd9aa706ef107139c5. Draft PR #48
(https://github.com/PureTideWater/PhysicalTherapy/pull/48) into claude/build-platform. No migration;
docs/product/domain-model.md, packages/pricing, packages/ledger, packages/db/migrations, content/, tools/verify-content
and .claude/hooks/protect-content.sh unchanged. Phase 1 resolves nothing: `git diff --numstat 6eae41a..HEAD --
pnpm-lock.yaml pnpm-workspace.yaml` is empty and no dependency entry of any manifest changes. 78 files, +5,117 / -524
against 6ddd587.

## D1, workflows, pins and the release chain (head bbd7071)

Seven commits: 4e4bbd6 (tools/ci/postgres.sh and its stub-docker test), 6736f14 (tools/check-action-pins), 871d4e5
(dependabot.yml under CQ1 (a) and dependabot-config.test.ts), a3588a2 (every workflow pinned and held by name, Postgres
from compose, release.yml cache-free with overwrites, release-dry-run.yml, publish-content's pins and timeout with its
frozen copy, workflows.test.ts's rules, three compliance evidence rows), 8fc4393 (no-duplicated-versions.test.ts without
the phase-2 catalog clause), 43a13e4 (collection.test.ts by directory; the PR template under F1 (a)), bbd7071 (the
push-run re-read count).

Pins re-resolved 2026-10-26 ~00:50 UTC: checkout v7.0.1 3d3c42e5, setup-node v7.1.0 949feb24, action-setup v6.1.0
ea17c68d, setup-python v7.1.0 6d4fd22b, upload-artifact v7.0.2 cf430e03, download-artifact v8.0.2 9000827c,
cache/restore and /save v6.1.0 55cc8345, setup-buildx v4.4.1 f87e5991, build-push v7.4.0 c3c9e263, login v3.7.0
c94ce9fb (kept for phase 2), trivy-action v0.36.0 ed142fd0 and attest-build-provenance v4.2.2 4d101475 (kept).

- difference: release.yml's pnpm/action-setup sets `cache: false` explicitly and the release rule asserts it. Why: the design relies on v6.1.0's default; an explicit input cannot be flipped by a later default.
- difference: release.yml and release-dry-run.yml run under `defaults: run: shell: bash`. Why: GitHub's default `bash -e` has no pipefail, so a failed docker save piped to gzip passed its step.
- difference: every upload of every workflow overwrites, screening-capacity's included, and the artifact test covers all workflows. Why: screening-capacity's per-run artifact had the same re-run name conflict the design fixes elsewhere.
- difference: rule (b) groups by repository (actions/cache/restore and /save share one commit and version). Why: a version tag is per repository; stricter, and Dependabot bumps them together.
- difference: the rewrite test also runs no-duplicated-versions.test.ts and requires more than 80 passed and none failed. Why: digests and versions are what an image PR changes; it proves the spawned run is not filtered empty.
- difference: release-dry-run tags its image dry-run-$GITHUB_RUN_ID; its identity script equals release's with three named substitutions. Why: a PR's ref name (<n>/merge) is not a valid image tag.
- difference: e2e waits for Postgres after the artifact download and untar; each DB job's log step is its last step. Why: more overlap of the pull with setup; still before the first step that reaches the database.
- difference: added tests, images by digest (CI-13) and the compose healthcheck/port/password rule; no-duplicated-versions holds the worker image's playwright-core literal to the lockfile until ci-browser. Why: A5/CI-13 named workflows.test.ts as the measure; leaving the literal unchecked would let it drift.
- difference: collection.test.ts lists the three tool directories' tests by directory. Why: D2's file names were not fixed, and later files stay under the N-6 rule.
- difference: the container-images multi-ecosystem group has no open-pull-requests-limit. Why: one group yields one PR; the config is validated against the strict SchemaStore schema.
- open: CI-only proofs: compose start and wait on a runner, release-dry-run on the PR (v7 upload, v8 download merge-multiple, identity, load, ghcr login), overwrite on a re-run. Still open (the PR's first runs).
- open: 7 tests red on D1's branch alone until D2 and D3 merged. Closed by the integration: all green on the merged tree.

## D2, toolchain, lockfile and images (head 26c6109)

Seven commits: afe339b (both Dockerfiles from node:24-trixie-slim@sha256:43b9…1bea at every stage; pnpm derived from
packageManager), 91d2579 (compose postgres:18-trixie@sha256:edb0…ddb6, healthcheck -h localhost, MinIO removed;
tools/dev.ts), c9833a8 (the capacity harness reads the compose image; WATCHED_FIXED gains docker-compose.yml;
watched-paths.txt regenerated), c0edbdc (the libc rule, CI_TREE-aware, and two licence tests the licence commit left
red), e56dbda (tools/check-toolchain and its four lists), 0458989 (root scripts actions:check and toolchain:check),
26c6109 (a lint fix).

- difference: fixed two check-licenses tests the licence commit 0e7776c left red. Why: inside D2's file; the unit run would otherwise fail.
- difference: the lists are {$comment, entries}; release-age and audit added/expires are UTC instants; the overrides list is overrides.json. Why: self-documenting files; the publish-plus-3-days bound is minute-precise.
- difference: extra rules: the gates guard (minimumReleaseAge >= 4320, trustPolicy no-downgrade), a low pnpm advisory warns, a non-registry lockfile key fails, a future-dated or rewritten exclude is rechecked, a Dockerfile must reference packageManager. Why: they close bypasses of F2 (b) and CQ2 the design did not name.
- difference: the Dockerfiles install pnpm with npm install -g of the packageManager version rather than corepack. Why: corepack's bundled signing keys go stale between Node releases and Node 25+ no longer bundle it (planned Node 26); npm verifies the registry integrity hash.
- open: watched.test's push-path test red on D2's branch alone. Closed by the integration (D1's screening-capacity.yml line).
- open: toolchain:check fails on CQ3 until 2026-10-26T18:06:37.606Z, by design. Still open (time).
- open: Docker builds of the trixie images are proved only on CI. Still open (the PR's `images` job).

## D3, policy documents (head e50b5ef)

Nine commits: a88cf79 (CI-11 to CI-14 in the test matrix, matrix.ts, registry.ts and fixtures/synthetic), 559b227
(MinIO out of every description; README names pnpm by packageManager), 58c0a76 (ADR 0066 Part 2, status header, F7
stale lines, F1 line, carry-ins), 2006acb (ADR 0063: F1 (a), F2 (a), F3, F7 dates, pin policy; CLAUDE.md:54), e8435e6
(ADR 0062 no-cache amendment), 46e6c01 (the governance runbook), 9a39700 (ci.md and screening-capacity.md), 44ba361
(dependency-upgrades.md), e50b5ef (reconciliation-001: F4's standing exception; F1, F2, F3, F7, Q2, Q3, CQ1 to CQ3).

- difference: a browser-tests PR is described as red on the brand journey's baselines, and from ci-browser on the browser.json check. Why: browser.json arrives with ci-browser, so before it the design's wording would be false.
- difference: ADR 0063's F1 (a), F7 and pin policy are a dated "Amendment (2026-10-26)" plus marked in-place edits. Why: the ADR's own amendment style; history stays readable.
- difference: the governance runbook's "Dependabot's settings on main" (#27, done) became "The default branch until launch" with the founder's F1 (a), F2 (a) and F3 clicks. Why: acceptance step 12 needs those steps where the founder reads them.
- difference: step 8 switches the default branch back to main as its own step just before the launch merge, then merges. Why: the design's "immediately before the launch merge", so the merge's push restores no build-branch cache.
- difference: README and CLAUDE.md name actions:check and toolchain:check; step 2's check reads the ruleset back (P6); ci.md's job table, red-gate entries, local commands and Changing CI; ADR 0063's Checks line; screening-capacity.md's measured gate time; ADR 0066 records D2's live O3 nuance. Why: the standing rule, each in a file D3 owned.
- open: packages/synth's "points only at tests that exist" red on D3's branch alone. Closed by the integration.

## Integrator: draft PR #48, head 2d86bb0e6b596f41e63686fd9aa706ef107139c5

`git fetch origin claude/build-platform`: still 6ddd587; nothing merged in. Merged D2 (9dd52fe), D1 (a746813) and D3
(70f5bfc) with `git merge --no-ff`, one at a time: no conflict. Then four integration commits:
- c6a7911 check-toolchain: tree.test.ts made its mkdtemp scratch repository at collection; on the merged tree
  collection.test.ts's N-6 rule failed ("expected [ 'check-toolchain-…' ] to deeply equal []"). It now makes it in
  beforeAll (D1's request to D2, not met on D2's branch).
- 1891af9 docs: ADR 0066 Part 2 records D1's deviations the document did not describe (bash with pipefail in release
  and dry run, action-setup's explicit `cache: false`, every workflow's uploads overwriting, the dry run's
  `dry-run-<run id>` tag); dependency-upgrades.md gains "Audit exceptions" (check-toolchain enforces ignoreGhsas equal to
  audit-exceptions.json and a 30-day bound the runbook did not explain) and the triage step points at it.
- 5666981 docs: D3's and D2's outside proposals taken: ADR 0010's status line and its Dependabot and pin lines amended
  (2026-10-26, ADR 0066 Part 2); docs/policies/change-management.md:65 (the template is offered from the default
  branch under F1 (a)); tools/screening-capacity/launch-check.ts:401's comment names node:24-trixie-slim by digest.
- 2d86bb0 compliance: the dependency and image hygiene control gains the dependency-upgrades.md runbook as evidence (D3's
  proposal; D1 had added the three ci_job rows).

Seams checked and found consistent (no change): screening-capacity.yml's push paths include docker-compose.yml and
workflows.test.ts's pushPaths; ci.yml's "Action pins" and "Toolchain" steps run the root scripts with BASE from the range
step on the designed condition; collection.test.ts collects tools/check-action-pins, tools/check-toolchain and tools/ci
by directory; ci.md's step names ("Action pins", "Toolchain", "Start the database", "Wait for the database", "The
database's log") and both fail-closed texts match the code; ADR 0066 Part 2's release, dry run (triggers, jobs,
permissions, kept a day), postgres.sh (--wait-timeout 120, 130 s, status file) and dependabot paragraphs (days, times,
npm limit 8, group order, ignores, cooldowns) match D1's files; the Dockerfiles' derivation matches ADR 0066; the
exception lists' field names match dependency-upgrades.md; every test file the synth registry names exists. Section
3.2.2's file list checked against the merged tree: every phase-1 file present; tools/package.json and
apps/web/package.json are phase 2's. Not taken: one retry helper for both checkers (D1 and D2 each proposed it): the
two hosts' failure semantics differ (raw.githubusercontent.com's 403 rate limit is retried; npm's 4xx is an answer),
and each policy is tested where it is used.

### Checks
- [pass] `git merge --no-ff co-001/ci-deps-d2`, `-d1`, `-d3`: clean, no conflict.
- [pass] `flock … pnpm install --frozen-lockfile`: already up to date (pnpm 10.34.8).
- [fail, then fixed] `flock … pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity tools/ci packages/compliance packages/synth` on the merged tree: 50 files, 673 passed, 1 failed (collection.test.ts on tree.test.ts's temporary directory). Fixed in c6a7911: collection and tree tests 3 passed.
- [pass] `flock … pnpm typecheck` (at 5666981): exit 0, 22 projects, 56.8 s wall, cold.
- [pass] `flock … pnpm lint` (at 5666981): exit 0, 1,508 files in 3 groups, 0 errors, 0 warnings, 89.7 s.
- [pass] `eslint --max-warnings=0` on controls.ts, tree.test.ts and launch-check.ts; `tsc --noEmit` in packages/compliance and `-p tools` (at 2d86bb0): clean.
- [pass] `actionlint .github/workflows/*.yml` (1.7.7): exit 0, no output.
- [pass] `flock … pnpm test` (unit with the coverage gate, at 2d86bb0): exit 0, 329 files, 5,079 passed and 3 skipped (5,082), 187 s; the 3 skipped are differential.test.ts's without ENGINE_FREEZE_BASE.
- [pass] No test lost: `vitest list --no-staticParse --project unit` (ENGINE_FREEZE_BASE=6ddd587) on a worktree of 6ddd587 installed offline: 4,997 (= CI's 4,996 passed and 1 skipped, run 40229005858); on the head: 5,082. By full name: 91 only on the head (88 new and 3 renamed: the artifact test, CI-10's table, mutation's pin test) and 6 only on the base (the 3 replaced of acceptance 10, `describe('dependabot')`'s test, "the Postgres services" and the form test, and the 3 renamed). Expected CI unit: 4,996 + 88 − 3 = 5,081 passed and 1 skipped. New files: check-action-pins check 8, verify 11, workflows 4; check-toolchain check 19, registry 6, tree 2; tools/ci/postgres 5; dependabot-config 7; no-duplicated-versions 6; new in existing files: workflows.test.ts 16, check-licenses 3, measure.test.ts 1 (names in the PR body). The worktree was removed.
- [pass] `flock … pnpm exec vitest run tools/test tools/check-action-pins tools/check-toolchain tools/check-licenses tools/screening-capacity tools/ci` (at 2d86bb0): exit 0, 35 files, 498 passed.
- [pass] `pnpm exec vitest run packages/compliance`: 18 passed. `pnpm exec vitest run tools/test/required-checks.test.ts`: 15 passed.
- [pass] `flock … pnpm synth --all && git diff --exit-code -- fixtures/synthetic` and no untracked file there: 196 cases, 0 written, 479 unchanged, 0 removed; 16 EMR files unchanged.
- [pass] `pnpm verify-content`: every content set passes. `pnpm lint:copy`: 491 files.
- [pass] `pnpm licenses:check`: 185 production packages allowed, no musl package listed.
- [pass] `pnpm audit --prod`: exit 0, no known vulnerabilities.
- [pass] `pnpm audit --audit-level=high`: exit 0; 7 below high (2 low, 5 moderate, qs 6.15.1 and fast-uri 3.1.8, development-only; phase 2 fixes them).
- [pass] `BASE=origin/claude/build-platform pnpm actions:check` (live, ~01:31 UTC): exit 0; every pin read (base has no checker); 13 tags equal their pins; every `with:` key declared; nested refs SHAs; release.yml's Trivy steps nest 3 caches each, all off by `cache: false`. Log: scratchpad/ci-deps/int-actions-check.log.
- [fail, by design] `BASE=origin/claude/build-platform pnpm toolchain:check` (live, 2026-10-26T01:31Z): exit 1 on CQ3 (a) alone ("packageManager's pnpm 10.34.8 was published 2026-10-23T18:06:37.606Z, under three days ago; it is old enough from 2026-10-26T18:06:37.606Z"); gates, advisories, newer pnpm, Dockerfiles, audit exceptions, release-age excludes, lockfile release age, trust excludes (semver@6.3.1) and overrides all ok. Log: scratchpad/ci-deps/int-toolchain-check.log. `static` is red until 18:06:38Z.
- [pass] Failing first (design 3.2.3; scratchpad/ci-deps/failing-first.txt): `CI_TREE=<git archive 6ddd587> pnpm exec vitest run --project unit tools/test/workflows.test.ts tools/check-licenses/check.test.ts -t '<seven names>'`: 7 failed, 100 skipped (release no-cache; compose rule; compose healthcheck -h; persist-credentials, naming large-zip.yml; CI-10; frozen copy; libc, 16 entries), exit 1; on the head 7 passed, exit 0. (c) with the base's exact-ref predicate in a scratch copy: failed ("expected [] to deeply equal [ Array(1) ]"); as committed: passed. The scratch copy was removed; git status clean.
- [pass] `git grep -n -i minio -- ':!pnpm-lock.yaml' ':!docs/adr/0066-*'`: empty.
- [pass] Scope (acceptance 1): `git diff --stat 6ddd587..HEAD -- packages/pricing packages/ledger packages/db/migrations content tools/verify-content .claude/hooks/protect-content.sh`: empty. publish-content.yml's diff: its three uses: refs with comments and `timeout-minutes: 15`. `diff <(git show 49514e8:.github/workflows/publish-content.yml) tools/test/frozen/publish-content.yml`: only `>     timeout-minutes: 15`; runs-on ubuntu-24.04.
- [pass] `git diff --numstat 6eae41a..HEAD -- pnpm-lock.yaml pnpm-workspace.yaml`: empty.
- [pass] `git diff 6ddd587 --stat -- $(cat pr42-files.txt)`: ADR 0062 (+30/-1), reconciliation-001.md (+16), test-matrix.md (+9/-2), matrix.ts (+4), registry.ts (+5), pnpm-lock.yaml (+43, the licence commit), watched-paths.txt (+1): only the files CONTEXT allows.
- [pass] Licence commit (acceptance 4): `git diff --numstat 0e7776c^ 0e7776c -- pnpm-lock.yaml` is `43 0`; libc counts 0 at 0e7776c^ and 43 at 0e7776c; added lines 27 `libc: [glibc]` and 16 `libc: [musl]`; the commit touches package.json, pnpm-lock.yaml and allowlist.json only. Gates commit: pnpm-workspace.yaml only, +14.
- [pass] O3 live (D2, 2026-10-26T01:00:42Z, scratch, never committed): ERR_PNPM_NO_MATURE_MATCHING_VERSION without the exclude, exit 0 with `@stryker-mutator/util@10.1.1` excluded, `--frozen-lockfile` installs it unchecked.
- [pass] `pnpm db:domain-model --summary-since origin/claude/build-platform`: "No change", document SHA-256 6d7a143d…f712 on both sides, approved by Tyler Williams on 2026-10-23.
- [pass] Model identifiers: none in the diff or commit text beyond the attribution lines, which end all 32 commits (each checked).
- [pass] `git push -u origin co-001/ci-deps`: the pre-push hook checked 32 commits (fixture guard; 89 text files searched for an X12 header; gitleaks found no secret); new branch, no force, no --no-verify.
- [pass] Draft PR #48 opened with the GitHub MCP tool (head co-001/ci-deps, base claude/build-platform, draft) with a one-line body; the full description written with update_pull_request only; `gh api repos/PureTideWater/PhysicalTherapy/pulls/48 --jq .body` diff-identical to scratchpad/ci-deps/pr-body.md (56,166 bytes each; the raw body is the file without its final newline). It ends with the two required lines.

### Choices and deviations recorded in the PR body
- npm cooldown 3 days with no semver-specific days, actions and images 7 (CQ1 (a)); one trust exclude, semver@6.3.1,
  mirrored in `trust-exceptions.json` (CQ2 (a)); `check-toolchain` holds `packageManager`'s pnpm to three days
  (CQ3 (a)); F4's "SHA pins at the current majors now" read as the latest release (reconciliation-001 records it).
- pnpm stays on major 10 (10.34.8, not 10.34.9 or 12.x): GitHub's list of the pnpm versions Dependabot supports still
  ends at v10; 10.34.9's one change concerns a switch to pnpm 11 or 12.
- The Dockerfiles install pnpm with `npm install --global` of the version `packageManager` names, not corepack:
  corepack checks signing keys it bundles (a key rotation breaks builds until the base image catches up) and Node 25
  and later no longer bundle it; npm checks the registry's integrity hash. The derivation accepts a `+sha512.…`
  suffix and fails the build on anything but `pnpm@x.y.z`.
- `release.yml`'s action-setup sets `cache: false` explicitly, and the release rule asserts it: an explicit input
  cannot be flipped by a later default.
- `release.yml` and `release-dry-run.yml` run under `defaults: run: shell: bash`: GitHub's default `bash -e` has no
  pipefail, so a failed `docker save` piped to `gzip` passed its step.
- Every upload of every workflow overwrites, `screening-capacity.yml`'s included, and the artifact test covers every
  workflow: that per-run artifact had the same re-run conflict the design fixes elsewhere.
- Rule (b) groups by action repository (`actions/cache/restore` and `/save` share one commit and version): a version
  tag is per repository, and Dependabot bumps them together.
- The rewrite test (d) also runs `no-duplicated-versions.test.ts` and requires more than 80 passed and none failed:
  digests and versions are what an image pull request changes, and it proves the spawned run is not filtered empty.
- `release-dry-run.yml` names its image `…/web:dry-run-<run id>`, and its identity script equals the release's with
  three named substitutions: a pull request's ref name (`<n>/merge`) is no image tag.
- In `e2e`, the database wait comes after the artifact's download and untar, and each database job's log step is its
  last: more of the pull overlaps setup, still before the first step that reaches the database.
- Added tests: every image by digest (CI-13); the compose healthcheck, port and password; `no-duplicated-versions`
  holds the worker image's playwright-core literal to the lockfile until ci-browser moves it.
- `collection.test.ts` collects the three new tool directories' unit tests by directory, so a later file there is held
  to the temporary-directory rule too.
- The `container-images` multi-ecosystem group has no `open-pull-requests-limit`: one group yields one pull request,
  and the strict SchemaStore schema validates the file.
- `check-toolchain` adds rules the design did not name, each closing a bypass of F2 (b) or CQ2: the gates themselves
  (`minimumReleaseAge` at least 4320, `trustPolicy: no-downgrade`); a low pnpm advisory warns; a non-registry lockfile
  key fails; an exclude dated in the future fails; a rewritten exclude counts as added, so its expiry cannot be
  extended unchecked; a Dockerfile must derive pnpm from `packageManager`.
- The exception lists are `{ "$comment", "entries" }` objects, each documenting itself; release-age and audit `added`
  and `expires` are UTC instants (the publish-plus-three-days bound is to the minute); the overrides list is
  `overrides.json` (`selector`, `version`, `reason`, `removeWhen`, `added`).
- `tools/check-licenses/check.test.ts`: two tests the licence commit left red (they leaned on the removed musl
  exception) are fixed, and a test holds the allowlist to the glibc libvips exception alone.
- Documents: a browser-tests pull request is described as red on the brand journey's baselines, and from ci-browser on
  the `browser.json` check (which arrives with ci-browser); ADR 0063's F1 (a), F7 and pin policy are a dated
  "Amendment (2026-10-26)" plus marked in-place edits, the ADR's own style; the governance runbook's "Dependabot's
  settings on main" (#27, done) became "The default branch until launch", the founder's F1 (a), F2 (a) and F3 steps;
  step 8 switches the default branch back to `main` as its own step immediately before the launch merge, then merges.
- Integration: `tools/check-toolchain/tree.test.ts` makes its scratch repository in `beforeAll` (it made it at
  collection, which `collection.test.ts`'s temporary-directory rule caught on the merged tree); ADR 0066 Part 2 records
  the release's bash with pipefail, the explicit cache input, every overwriting upload and the dry run's image tag;
  `dependency-upgrades.md` gains "Audit exceptions" (the checker enforced a 30-day bound the runbook did not explain);
  ADR 0010, the change-management policy and `launch-check.ts`'s comment follow the pins, Dependabot and F1 (a); the
  compliance control names the upgrades runbook.
- Not taken: one shared retry helper for the two checkers. `check-action-pins` retries every non-200, non-404 answer
  (raw.githubusercontent.com rate-limits with 403), `check-toolchain` treats a 4xx other than 408 and 429 as npm's
  answer; each policy is tested where it is used.

### Phase 2 plan (after 2026-10-26T19:18:50Z, each lockfile or resolution commit dated after it)
- After 2026-10-26T15:11Z, one commit: docker/login-action@81c6f93d4bc991e510b342a00b419b3bb4efc5c6 # v4.7.0 in release.yml's and release-dry-run.yml's push jobs together; then `BASE=<previous commit> pnpm actions:check` reads it as a new pin (registry, username, password declared at that SHA).
- The bumps, each resolved with `pnpm install --lockfile-only` under the gates (never hand-merged): vitest and @vitest/coverage-v8 5.0.5 (catalog), eslint 10.13.0 and typescript-eslint 8.72.0 into the catalog, root's literal copies of catalog packages and tools/package.json:36, 38 as `catalog:`, postcss 8.5.31 and next with @next/eslint-plugin-next 16.4.3 in apps/web/package.json, fast-uri 3.1.9 by refresh.
- The qs override `"typed-rest-client@2>qs": "6.16.1"` in pnpm-workspace.yaml and, in the same commit, its tools/check-toolchain/overrides.json entry (selector, version, reason, removeWhen, added) and check.test.ts's "the committed lists" overrides expectation changed from [] to that entry.
- tools/test/no-duplicated-versions.test.ts gains the catalog clause (D1's text: every catalog package is `catalog:` in every manifest's dependencies and devDependencies; imports execFileSync and yaml's parse).
- After each re-resolution: the libc rule (--fix-lockfile if it names an entry); if semver@6.3.1 leaves the lockfile, remove it from trustPolicyExclude, trust-exceptions.json and the committed-lists test; regenerate watched-paths.txt if #42 or another PR merged in; `pnpm licenses:check`.
- Then `BASE=origin/claude/build-platform pnpm toolchain:check` (passes after 19:18:50Z), `pnpm audit --audit-level=high` (nothing moderate or worse), the full local checks again; the PR body gains acceptance 9's lockfile summary commit by commit; ADR 0066 Part 2's npm table, "No test lost" and live check-toolchain line corrected if the bumps change them; dependency-upgrades.md's overrides section if the selector differs.
- If #42 or another Lane B PR merges first: merge the build branch in (rule 6, keep both sides), re-resolve the lockfile under the gates, `pnpm synth --all`, and pin any new workflow's actions with its CI-10 row.

### Open items
- The two adversarial reviews (CI and test infrastructure; security and supply chain) and the fix round are next.
- `static` is red on this head until 2026-10-26T18:06:38Z (CQ3 (a)), by design; phase 2's commits land after 19:18:50Z.
- CI-only proofs, read from the PR's first runs: the compose start and wait on a runner, the trixie images build and scan, release-dry-run (v7 upload, v8 merge-multiple download, identity, load, ghcr login with login v3.7.0 and then v4.7.0), `overwrite` on a re-run, the unit total (expected 5,081 passed and 1 skipped), the four required checks under F7.
- After merge (acceptance 12; the founder's): the default branch switch (F1 (a)), alerts and security updates (F2 (a)), require SHA-pinned actions (F3); read Dependabot's first runs (event=dynamic) and the first Monday's weekly runs; record #40 and #33's state.
- Proposals outside this PR: check-action-pins could warn on a pinned action whose runtime is deprecated (login v3.7.0 is node20); release-dry-run.yml could also run release.yml's SBOM step; large-zip.yml could take `defaults: run: shell: bash`; ops tools/setup-container.sh pins pnpm 10.28.0 (move to 10.34.8); the design's O3 wording ("any re-resolution re-checks every direct dependency") should read "a re-resolution of the young package itself, or a bare pnpm update"; the Dockerfiles could verify pnpm's tarball against a `+sha512` packageManager suffix; watch the worker image's playwright-core --with-deps on Debian 13 in the images job.
