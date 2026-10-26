# PR #48 (co-001/ci-deps), security and supply-chain review, phase 1

Head reviewed: 2d86bb0e6b596f41e63686fd9aa706ef107139c5, against claude/build-platform at 6ddd587. Reviewed 2026-10-26 from 01:47Z.
I worked in a fresh clone (removed afterwards) and installed with `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline`, which passed. I made no commit, push or GitHub comment.

## CI on the head

- ci.yml run 40255481181:
  - **unit is RED** (job 121356293955). `tools/test/workflows.test.ts:1928`, "a simulated Dependabot rewrite", fails with "expected 0 to be greater than 80". The totals are 5,080 passed, 1 failed and 1 skipped. This is not by design. See B1.
  - **static is red only on CQ3**, as designed (job 121356293870). `pnpm toolchain:check` reports the one error "packageManager's pnpm 10.34.8 … old enough from 2026-10-26T18:06:37.606Z". Every other rule is ok.
  - In static, `pnpm actions:check` read every pin, and the nested caches in release.yml are all off.
  - gitleaks scanned 29 commits and found no leaks.
  - lint, build, images, db 1-4, domain model and e2e 1-2 are green. all-green is red because of unit and static.
- release-dry-run run 40255481065: build and push are both green. That covers the v7 upload, the v8 merge-multiple download, the ghcr login on v3.7.0 and the identity check.
- mutation run 40255481109: green.
- screening-capacity run 40255481122: capacity was still in progress when I read it.
- approval-of-record: green.

## Findings

### B1 (blocking): the unit job is red on CI because the rewrite test parses coloured output

- Where: `tools/test/workflows.test.ts:1902-1909` (assertionsOn) and `:1928`.
- Cause: the spawned vitest inherits `process.env`. On a GitHub runner that turns colour on, so the summary line reads `Tests \e[22m \e[1m\e[32m5080 passed`. The pattern `/Tests\s+(\d+) passed/` never matches it, the number falls back to 0, and the test fails. Locally there is no colour and it passes, which is why the build summary reports it green.
- Evidence: job 121356293955, AssertionError at 1928:75. The same job log shows the ANSI-coloured summary lines.
- Fix:
  - In assertionsOn, set `NO_COLOR: '1'` and `FORCE_COLOR: '0'` (deleting `FORCE_COLOR`), or strip ANSI codes before matching.
  - Better: run with `--reporter=json --outputFile=<tmp>` and read `numPassedTests` and `numFailedTests`.
  - Re-run the CI unit job and confirm 5,081 passed and 1 skipped.

### S1 (should_fix): check-toolchain trusts a lockfile key that looks like a registry version, whatever its resolution

- Where: `tools/check-toolchain/check.ts:347-401` (lockfileRule reads only the keys of `packages:`) and `policy.ts:144-146`.
- What I did: a probe called `checkToolchain` with the head tree. Its lockfile added the entry
  `evilpkg@9.9.9: resolution: {integrity: sha512-AAAA, tarball: https://evil.example/evilpkg-9.9.9.tgz}`.
- Result: the lockfile rule reported "ok … adds 1 version(s) … each at least three days old", and every other rule was also ok.
- Why it matters: `pnpm install --frozen-lockfile` fetches the `tarball` URL and checks only the integrity the lockfile itself gives. A hand-edited lockfile hunk can therefore install bytes from anywhere under a key that passes the release-age rule.
- The design claim that "a non-registry lockfile key fails" holds only for keys of the form `name@https://…`. Today the lockfile has no `tarball:` field (`grep -c 'tarball:' pnpm-lock.yaml` returns 0), so adding the rule costs nothing now.
- Fix:
  - In lockfileRule, require every entry's `resolution` to be exactly `{integrity}`, with no `tarball`, `type`, `directory`, `repo` or `commit`. If a tarball is ever needed, require it to be on `https://registry.npmjs.org/`.
  - Refuse a `registry` or `@scope:registry` setting in `.npmrc` or `pnpm-workspace.yaml` that is not registry.npmjs.org.
  - For added versions, compare the lockfile's integrity with the packument's `versions[v].dist.integrity`. check-toolchain already fetches that packument.
  - Add a check.test.ts case for each.

### S2 (should_fix): the trust policy is held only where pnpm resolves, never where a version lands, and the gates rule misses `trustPolicyIgnoreAfter`

- Where: `check.ts:166-177` (gatesRule) and `check.ts:347-420` (no trust rule over added versions). In ADR 0066 Part 2 (`docs/adr/0066-…md:460-499`), the security model describes this for the release age but not for trust.
- What I did: the same probe added `trustPolicyIgnoreAfter: 1` to pnpm-workspace.yaml. gatesRule still reported "ok, minimumReleaseAge 4320 minutes, trustPolicy no-downgrade".
- pnpm 10.34.8 honours that setting:
  - `dist/pnpm.cjs` declares `"trust-policy-ignore-after": Number`.
  - It also has `if (minutesSincePublish > opts.trustPolicyIgnoreAfter)`.
  - So the setting waives the policy for every version older than one minute.
- No backstop exists for trust. A frozen install never applies trustPolicy, and pnpm 10 has no `trustLockfile` (P3). So nothing on CI catches a downgraded version that reaches the lockfile. It can arrive by:
  - a local `--config.trust-policy=off`,
  - a hand-edited hunk,
  - a `.npmrc` setting,
  - a Dependabot run that does not apply the policy.
- check-toolchain already holds the release age where a version lands. It should hold trust the same way.
- Fix:
  - Add a "lockfile trust" rule over the added versions, from the packuments already fetched. Rank evidence as `versions[v]._npmUser.trustedPublisher` above `versions[v].dist.attestations` above none. Fail when an earlier non-prerelease version had stronger evidence, unless `trustPolicyExclude` lists that version. The packument schema must then keep `versions[v]`.
  - In gatesRule, refuse `trustPolicyIgnoreAfter`, and any `trust-policy`, `minimum-release-age` or `trust-policy-ignore-after` key in `.npmrc`.
  - In ADR 0066 Part 2, state that trust is checked where a version lands.

### S3 (should_fix): the overrides rule reads two of pnpm's override sources and misses package.json `resolutions`

- Where: `policy.ts:64-67` (packageJsonSchema reads only `pnpm.overrides`) and `check.ts:445-461`.
- What I did: the probe added `"resolutions": {"lodash": "4.17.21"}` to package.json. The overrides rule reported "ok, 0 override(s)".
- pnpm applies `resolutions` as overrides, so an override can enter without its `overrides.json` entry, reason or `removeWhen`. The release age still holds the version it resolves to.
- Fix: compare `overrides.json` with the lockfile's own top-level `overrides:` map. That map is what pnpm actually applied, whatever its source. Also read `resolutions` when you compare the manifests. Add a test.

### S4 (should_fix): two images in the release build path still run by tag, and CI-13's test cannot see them

Both are exempt from the "every image by digest" rule:

1. `# syntax=docker/dockerfile:1` at `apps/web/Dockerfile:1` and `apps/worker/Dockerfile:1`.
   - This is the BuildKit frontend image. It turns the Dockerfile into the build graph, and it is pulled from Docker Hub by a mutable tag on every build, release.yml's included.
2. `docker/setup-buildx-action`'s default docker-container driver runs `moby/buildkit:buildx-stable-1` by tag.
   - It runs at `release.yml:53`, `release-dry-run.yml:55`, `ci.yml:494` and `screening-capacity.yml:145`.
   - Its digest today is `sha256:cec9f139f45e93c5c69c60f8b07cfad9f43f4ef6b6a6cd917527fea5ff2e3dea`. I read it with a HEAD request to registry-1.docker.io's `moby/buildkit/manifests/buildx-stable-1`.

- Both take part in producing the images the release scans, measures, attests and pushes.
- `tools/test/workflows.test.ts:1777-1791` ("images by digest (CI-13)") reads only `FROM` lines and the compose services.
- Fix:
  - Drop the `# syntax` line, which uses the frontend built into the pinned BuildKit; nothing in either Dockerfile needs a newer frontend. Otherwise pin it as `docker/dockerfile:1.x@sha256:…`.
  - Set `driver-opts: image=moby/buildkit:<version>@sha256:…` on every setup-buildx step. Hold the release and the dry run to the same value.
  - Extend CI-13's test to `# syntax=` lines and setup-buildx's `driver-opts`.
  - Record in dependency-upgrades.md how these move. Dependabot does not track `driver-opts`.

### S5 (should_fix): the stated removal trigger for the qs override is wrong, and following it brings back three qs advisories that audit-level=high does not fail

- Where: `docs/runbooks/dependency-upgrades.md:135-136`, which says the override "goes when Stryker depends on typed-rest-client 3, or on a typed-rest-client whose qs range reaches 6.16.0". ADR 0066 at `:445-448` says the same.
- What the registry says about each typed-rest-client version's qs dependency:
  - 2.3.1 has `qs: 6.15.1`, exact.
  - 3.0.0 has `6.15.1`, exact.
  - 3.1.0 has `6.15.3`, exact.
  - Only 3.1.1 and later have `^6.16.0`.
- The failure path:
  1. Stryker moves to typed-rest-client 3.0.x or 3.1.0.
  2. The `@2`-scoped selector stops applying.
  3. check-toolchain's overrides rule then demands the override's removal, which matches the runbook's first clause.
  4. qs 6.15.x returns with GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx and GHSA-4mjr-xmp4-gh2g, all moderate (from `pnpm audit --json` on the head).
  5. `pnpm audit --audit-level=high` passes it, so static stays green.
- Fix:
  - The trigger is "typed-rest-client 3.1.1 or later (qs ^6.16.0)".
  - In phase 2, write the selector as `typed-rest-client>qs` (any version) rather than `typed-rest-client@2>qs`, so a major move cannot silently drop it.
  - Correct the runbook and ADR text now.

### N1 (nit): installing pnpm with `npm install -g` in the Dockerfiles checks only the integrity the same registry response gives, and the accepted `+sha512` suffix is never checked

- Where: `apps/web/Dockerfile:13-17` and `apps/worker/Dockerfile:9-13`.
- npm checks the tarball against the `dist.integrity` from the packument it just fetched. That is trust on first use from one origin.
- corepack also checks npm's registry signatures with keys it bundles. The rationale given (key staleness, Node 25 dropping corepack) is sound, but the comment "checking the registry's integrity hash" overstates what is gained.
- The Dockerfiles' regex accepts `+sha\d+.<hex>` and then discards it.
- Fix:
  - Put corepack's `+sha512.<hex>` in packageManager.
  - In the Dockerfiles, run `npm pack pnpm@<v>`, compare its sha512 with the suffix, then install the tarball.
  - Have check-toolchain compare the suffix with the registry's `dist.integrity` (the build summary already proposes this).
  - The version itself is safe input: the regex admits only `x.y.z`, so nothing can be injected into the shell.

### N2 (nit): check-action-pins' nested-cache gating does not fail closed at depth and cannot see caches inside JavaScript actions

- Where: `tools/check-action-pins/verify.ts:135` (`depth > 8` returns `[]`). The ADR's wording is at `docs/adr/0066-…md:365` and in the release.yml header at `:24-26`.
- What is sound:
  - The gate parser refuses `||`, `!(` and any form it cannot read, and records it as a problem.
  - Unpinned or unreadable nested actions are reported by nestedProblems.
  - String comparison in Actions expressions ignores case, but `false` cannot equal `'true'`, so that is harmless.
- The gaps:
  - Beyond depth 8 the check silently returns nothing.
  - Only composite `actions/cache*` steps are seen. A JavaScript action's built-in cache cannot be read. That covers setup-node, action-setup, setup-buildx's binary cache, and any default a future build-push-action adds. Only workflows.test.ts's explicit `with:` assertions hold those today.
- Fix:
  - Return a `{problem}` gate when the depth is exceeded.
  - Say "every composite's nested actions/cache" in the ADR and the release.yml comment.
  - Keep the explicit-input test as the guard for JavaScript actions, with a sentence saying so.

### N3 (nit): a release-age exclude's `advisory` is only checked for form

- Where: `tools/check-toolchain/policy.ts:105`.
- Any well-formed GHSA passes. Nothing checks that it exists or concerns that package, so the "security fix only" condition rests on review.
- Fix: check through the npm bulk advisory endpoint that the advisory's id appears for the package's previously locked version. Otherwise state in the runbook that the reviewer checks it.

### N4 (nit): Dependabot ignores and security updates

- `ignore` entries apply to security updates too. So a fix that exists only in the next major of node, postgres, next, typescript or pg-boss produces no security pull request, only an alert.
- Fix: say in dependency-upgrades.md that such an alert is handled by hand as a deliberate upgrade. The weekly triage should also read open alerts, not only pull requests and `event=dynamic` runs.

## Checked and sound (no finding)

**1. Pins.**
- `git ls-remote` shows each of the 13 pins as its tag's peeled commit. The annotated tags are trivy-action v0.36.0 (`a9c7b0f` peeled to `ed142fd`) and action-setup v6.1.0 (`d9184bf` peeled to `ea17c68`). login v4.7.0 is `81c6f93d`, as the phase-2 plan says.
- Each action has one SHA, and no tag ref remains in any workflow.
- Nested actions, read at the pinned SHAs:
  - trivy-action nests setup-trivy `3fb12ec` (v0.2.6) and actions/cache `27d5ce7` (v5.0.5).
  - setup-trivy nests cache/restore and cache/save `9255dc7` (v5.0.1), checkout `8e8c483` (v6.0.1), and trivy's contrib at commit `75c4dc0`.
  - attest-build-provenance nests actions/attest `508db95` (v4.2.1).
  - I checked the tags with ls-remote.
- The `with:` keys:
  - setup-buildx `cache-binary` (default true), action-setup `cache` (default false), setup-node `package-manager-cache` and trivy-action `cache` and `cache-dir` are all declared.
  - setup-trivy's binary cache follows trivy-action's `cache` input.
  - The CI log for release.yml build steps 5 and 6 shows all three nested caches off.

**2. Caches in release.yml.**
- The release restores no cache: no `actions/cache*` step, setup-node with `package-manager-cache: false`, action-setup with `cache: false`, `cache-binary: false`, no `cache-from` or `cache-to`, and Trivy with `cache: false` and its cache directory under `runner.temp`.
- Downloads take no `run-id` or `github-token`, so they read only the same run.
- The capacity report is built and attested only from this run.

**3. release-dry-run.**
- It runs on `pull_request` (not `pull_request_target`) with `contents: read`, and the push job adds only `packages: read`.
- It has no id-token, attestations or packages write, and no push, tag or attest step.
- A fork or Dependabot run gets a read-only GITHUB_TOKEN. The login stores only a read token, and nothing it loads is run.

**4. Permissions and publish-content.**
- `persist-credentials: false` is set on every checkout except publish-content.yml's, which pushes by design.
- No workflow gains a permission over 6ddd587.
- publish-content.yml's diff is three `uses:` lines and `timeout-minutes: 15`. Its frozen copy differs from 49514e8 only by that timeout.
- The frozen-copy normaliser keeps the action's name and strips only `@ref` and a `#` comment, so swapping the action fails.
- A ref changed to a tag passes the normaliser, but actions:check rule (a) refuses it.
- The launch-merge cache path is handled by the switch back before the launch (ADR 0066 `:600-601`).

**5. Release age and exclude rules.**
- The exclude list must hold exact versions only and equal its JSON mirror.
- A new or rewritten entry has its expiry window checked: no later than `added` plus 7 days and no earlier than publish plus 3 days.
- The CQ3 packageManager rule works: CI fails it until 18:06:37.606Z.
- Non-registry keys fail.
- Network reads fail closed after three tries. A 4xx other than 408 or 429 counts as an answer.

**6. Images.**
- node:24-trixie-slim's index digest `sha256:43b9…1bea` matches hub.docker.com's tag API, as do the 24.22.1-trixie-slim and 24.22-trixie-slim tags.
- postgres:18-trixie's `sha256:edb0…ddb6` matches.
- Nothing new runs as root: the global npm install replaces the base's `npm install --global pnpm@10.28.0`.

**7. Dependabot.**
- Cooldowns do not apply to security updates.
- The `security` group (`applies-to: security-updates`, pattern `*`) groups them and does not hide them.
- A young fix is held red by check-toolchain until a person adds the dated exclude, as the runbook describes.

**9. PHI, real files and model names.**
- No PHI and no real file in the diff.
- No model identifier appears in the diff or commit text other than the attribution lines, which end all 32 commits.
- The pinned gitleaks 8.24.3 over 6ddd587..HEAD found no leaks in 29 commits (merges remerged).

## Phase-2 supply-chain notes

- **qs override.** The selector `typed-rest-client@2>qs` is too narrow: see S5. Use `typed-rest-client>qs` with removeWhen "typed-rest-client 3.1.1 or later".
  - qs 6.16.1 was published 2026-10-14. It has no provenance, and neither had any earlier qs, so there is no trust downgrade.
  - Overriding typed-rest-client 2.3.1's exact pin `qs: 6.15.1` up a minor is unsupported by its maintainers. It is development-only (Stryker's dashboard reporter), but a mutation run should prove it.
- **Trust evidence of each phase-2 target** (registry, read 2026-10-26; none is a downgrade):

  | Package | Version | Published | Evidence |
  |---|---|---|---|
  | fast-uri | 3.1.9 | 2026-10-19 | trusted publisher and provenance |
  | typescript-eslint | 8.72.0 | 2026-10-19 | trusted publisher and provenance |
  | vitest and @vitest/coverage-v8 | 5.0.5 | 2026-10-15 | trusted publisher and provenance |
  | postcss | 8.5.31 | 2026-10-18 | trusted publisher and provenance |
  | next | 16.4.3 | 2026-10-23T13:40Z | trusted publisher and provenance |
  | @next/eslint-plugin-next | 16.4.3 | 2026-10-23T13:28Z | trusted publisher and provenance |
  | eslint | 10.13.0 | 2026-10-16 | neither, as for every earlier eslint |

  - next 16.4.3 is three days old at 13:40Z, before 19:18:50Z.
- **New transitive packages from the next and eslint bumps** are checked for trust only by pnpm on the builder's machine at resolution, since S2 is not implemented. Do the resolution in a clean environment with no `.npmrc` override, and diff the lockfile's new keys and `resolution` fields (S1) before committing.
- **The login v4.7.0 move** (after 15:11Z) must change release.yml and release-dry-run.yml together. v4.7.0 runs on node24, while v3.7.0 runs on node20 (from action.yml at each SHA).
- **If S1 and S2 land in phase 2**, re-run toolchain:check against both the merge base and 6ddd587 to confirm no existing entry has a tarball or a trust downgrade beyond semver@6.3.1.

## Checks run

| Command | Result |
|---|---|
| `git clone … && git checkout -q 2d86bb0e…` | ok |
| `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile --prefer-offline` | exit 0 |
| `git ls-remote https://github.com/<repo> refs/tags/<v> refs/tags/<v>^{}` for 13 pins, 3 nested tags and login v4.7.0 | all equal the pins |
| `curl https://raw.githubusercontent.com/<repo>/<sha>/action.y{a,}ml`, for trivy-action, setup-trivy, attest-build-provenance, actions/attest, action-setup, setup-node, setup-buildx and both logins | inputs and nesting as stated above |
| hub.docker.com tag API for node:24-trixie-slim and postgres:18-trixie | digests match. registry-1.docker.io was rate-limited (429) for library images |
| `pnpm exec tsx rss-scripts/probe.mts` (checkToolchain on the head tree plus a tarball-resolved key, `trustPolicyIgnoreAfter: 1` and package.json `resolutions`, with a stub registry) | every rule "ok" (S1, S2, S3) |
| grep of pnpm 10.34.8's `dist/pnpm.cjs` | `trust-policy-ignore-after: Number`, honoured at `minutesSincePublish > opts.trustPolicyIgnoreAfter` |
| `pnpm audit --json` | qs: 3 moderate. fast-uri: 2 moderate and 2 low. All through @stryker-mutator/core |
| registry reads of typed-rest-client's versions and qs's times | as in S5 |
| Python registry script over the phase-2 targets | the trust table above |
| `tools/gitleaks/install.sh` then `gitleaks git … --log-opts "--diff-merges=remerge 6ddd587..HEAD"` | 29 commits, no leaks |
| Model-identifier grep over `git log --format=%B` and the added lines | none beyond the attribution lines (32 of 32 commits carry them) |
| GitHub check runs on PR #48, and job logs 121356293955 (unit) and 121356293870 (static) | as above |
