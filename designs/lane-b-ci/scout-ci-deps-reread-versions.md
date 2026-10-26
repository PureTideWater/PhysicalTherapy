# Scout: ci-deps re-read, versions, pins and policies (2026-10-25, claude/build-platform 6ddd587)

Scope: the contract `designs/lane-b-ci.md` §3.2 (lines 507-852), written at 49514e8, re-read against 6ddd587 and the
network on 2026-10-25 between 22:42 and 23:10 UTC. Read-only: no install, build or test ran; nothing was written on
GitHub. Raw evidence is in the scratchpad (`ci-deps-progress/scout-versions.md`, `sv/`), listed in section 10.

## 0. In one screen

1. **Actions: the table is still current.** No action has a newer tag than §3.2.1's (git ls-remote, 2026-10-25).
   ci-speed and ci-mutation added no new action, only more `actions/cache/restore` and `save` uses. Every `with:` key
   used at 6ddd587 is declared in the action's `action.yml` at the new SHA. The table lacks SHAs and dates (section 2).
2. **pnpm: latest-10 is now 10.34.9** (2026-10-25T17:54:00Z). Its one change only matters when pnpm 10 switches to a
   pnpm 11 or 12 target. Keep 10.34.8, as measured. Both fix all 23 advisories of 10.28.0 (each is fixed by 10.34.5).
3. **pnpm 10 re-checks every direct dependency already in the lockfile on any re-resolution.** Measured in
   Dependabot run 40223237798: `pnpm install --lockfile-only --config.minimum-release-age=4320` failed with
   `ERR_PNPM_NO_MATURE_MATCHING_VERSION` on `@stryker-mutator/api` 10.1.1, an unchanged direct dependency. A frozen
   install never checks (pnpm 10.34.8 has no verification pass). That has three consequences for §3.2:
   - Dependabot's 7- and 14-day cooldowns become a 7- or 14-day pnpm gate on minor-only and major groups. Those groups
     then fail silently whenever any locked direct dependency is younger than the gate, which is most weeks (Q1).
   - Dependabot security updates pass `--config.minimum-release-age=0`, which bypasses the repository's gate. So
     §3.2.1's "a security fix … cannot enter the lockfile, by Dependabot or by hand" is false. `check-toolchain` must
     check the lockfile itself (change C6).
   - A young version merged into the lockfile stops every Dependabot npm run, and every human re-resolution, until it
     is three days old. That is what happened to #38.
4. **Dependabot npm updates resume from 2026-10-26T19:18:50Z.** The five Stryker 10.1.1 packages are the only locked
   versions under three days old (all 614 checked). The last, vitest-runner, was published 2026-10-23T19:18:49.904Z.
   The handoff's "about 19:50" is 30 minutes late.
5. **`trustPolicy: no-downgrade` would fail on `semver@6.3.1`** (no provenance, published after 7.5.1, which had it).
   It is reached through `next` > `styled-jsx` > `@babel/core` and through `eslint-plugin-react-hooks`. Bumping next
   re-resolves that subtree, so the gate needs `trustPolicyExclude: ['semver@6.3.1']` (C8).
6. **The qs fix cannot come from a lockfile refresh.** `@stryker-mutator/core` 10.1.1 needs `typed-rest-client ~2.3.0`,
   and typed-rest-client 2.3.1 pins `qs` to exactly `6.15.1`. It needs a pnpm override (C9). fast-uri 3.1.9 refreshes.
7. **Images:** `node:24-trixie-slim` is unchanged at `sha256:43b9ba11…` (Node 24.22.1). `postgres:18` already is
   `18-trixie`, which is `18.6-trixie` at `sha256:edb0c08d…`, so pinning Postgres changes no bits. Both the Hub API and
   the registry answer through the proxy (section 4).
8. **Two in-scope gaps found:** `docker-compose.yml` is not a watched path (`tools/screening-capacity/watched.ts:62-80`),
   and `mutation.yml` pins Node 24.22.0, which the planned no-duplicated-versions test would reject (C11, C12).

## 1. Method and access

- Tags and peeled SHAs: `git ls-remote --tags https://github.com/<owner>/<repo>` (scratchpad `sv/*.tags`).
- Release dates: `gh api repos/<owner>/<repo>/releases/tags/<tag>` is refused for every repository but ours (HTTP 403,
  "GitHub access to this repository is not enabled for this session"). The GitHub connector's `get_release_by_tag`
  is refused too, and so is `github.com/<repo>/releases.atom`. Instead, a depth-1 `git fetch` of each tag gives the
  tag's commit date, and the tagger date for annotated tags. A release is published at or after that time.
- Action inputs: `action.yml` at each SHA from raw.githubusercontent.com (scratchpad `sv/actionyml/`).
- Dependabot's log: `gh api …/actions/jobs/121259144984/logs` redirects to blob storage, which the proxy refuses. The
  GitHub connector's `get_job_logs` returned all 3,443 lines (scratchpad `sv/dep-40223237798-full.log`).
- npm: `npm view <pkg> time --json`, the registry documents, and the bulk advisory endpoint.
- pnpm source: the published `pnpm@10.34.8` tarball's `dist/pnpm.cjs` (codeload.github.com is refused), and the
  changelog at tag v10.34.9 (`aa97047`).
- dependabot-core at main `7c06280` (2026-10-25T16:54Z), github/docs at main (2026-10-25), pnpm.io at main `0aab2ba`.

## 2. Actions (§3.2.1's table)

Read 2026-10-25. Each "commit date" is the tag's commit, in UTC. Uses are counted at 6ddd587 over all seven workflows.

| Action | Latest tag | Peeled commit (the pin) | Commit date | Pin at 6ddd587 | #40 offers | Uses |
|---|---|---|---|---|---|---|
| actions/checkout | v7.0.1 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-17 18:45 | v4.4.0 `11d5960a`, 3× `@v4` | v7.0.1, 3× `@v7` | 18 |
| actions/setup-node | v7.1.0 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | 2026-10-08 02:43 | v4.4.0 `49933ea5`, 3× `@v4` | v7.1.0, 3× `@v7` | 15 |
| pnpm/action-setup | v6.1.0 | `ea17c68df8912ef543352723c149a84f56e3d413` | 2026-09-04 23:42 (tag 09-05 07:26) | v4.3.0 `b906affc`, 2× `@v4` | **v6.0.10** `0977fd99`, 2× `@v6` | 14 |
| actions/setup-python | v7.1.0 | `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | 2026-10-22 02:33 | v5.6.0 `a26af69b` | v7.1.0 | 1 |
| actions/upload-artifact | v7.0.2 | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07 10:00 | v4.6.2 `ea165f8d` | v7.0.2 | 7 |
| actions/download-artifact | v8.0.2 | `9000827ccba6bdab643e8b6fd33ac0654aef8333` | 2026-10-07 10:00 | v4.3.0 `d3f86a10` | v8.0.2 | 6 |
| actions/cache/restore, /save | v6.1.0 | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | 2026-06-23 20:30 | v4.3.0 `0057852b` | v6.1.0 | 7 + 4 |
| docker/setup-buildx-action | v4.4.1 | `f87e5991a6d7451dcb8d9637bfbc97413f497069` | 2026-09-16 07:47 | v3.12.0 `8d2750c6` | v4.4.1 | 3 |
| docker/build-push-action | v7.4.0 | `c3c9e263c25d99ce0380d002d59b67737d91b0dc` | 2026-09-15 07:29 | v6.19.2 `10e90e36` | v7.4.0 | 5 |
| docker/login-action | v4.7.0 | `81c6f93d4bc991e510b342a00b419b3bb4efc5c6` | **2026-10-23 15:11** | v3.7.0 `c94ce9fb` | **v4.6.0** `dbcb8138` | 1 |
| aquasecurity/trivy-action | v0.36.0 | `ed142fd0673e97e23eac54620cfb913e5ce36c25` | 2026-04-22 09:20 (tag 09:29) | v0.36.0 (kept) | not offered | 4 |
| actions/attest-build-provenance | v4.2.2 | `4d101475d8b20a2381f78447822ac1eab6504dd8` | 2026-08-06 19:54 | v4.2.2 (kept) | not offered | 1 |

Tags marked "tag" are annotated, so the pin is the peeled `^{}` commit. All the others are lightweight tags.

- **Where the table is stale.** Only in what it leaves out: the SHAs, the dates, and the new uses. Since 49514e8,
  ci-speed and ci-mutation added uses of the same actions only: cache/restore at `ci.yml:124,187,263,272,425`, cache/save
  at `ci.yml:136,194,309`, and mutation.yml's checkout, setup-node, action-setup, upload and download
  (`mutation.yml:49-181`). Tag-only refs remain in `approval-of-record.yml:30,32`, `large-zip.yml:30-32` and
  `publish-content.yml:25,27,28`. `supply-chain.yml` is gone: ci-speed folded its scans into ci.yml's `images` job
  (`ci.yml:467-517`), which already sets `cache: false` on both Trivy steps (`:493, :516`).
- **No newer major exists**, so nothing newer than [S4] §2's checks applies. I re-checked the breaking changes that
  matter here:
  - checkout v7.0.0 blocks a fork PR checkout under `pull_request_target`/`workflow_run`, and no workflow uses either
    (grep: none). v7.0.1 is fixes (`CHANGELOG.md:3-23` at `3d3c42e5`).
  - setup-python v7 removed `pip-install`, which is unused.
  - build-push v7 dropped `DOCKER_BUILD_NO_SUMMARY` and `DOCKER_BUILD_EXPORT_RETENTION_DAYS`, both unused (grep).
- **Inputs at each SHA.** Every key used at 6ddd587 is declared, and none is deprecated:
  - checkout: `fetch-depth`, `filter`, `persist-credentials`;
  - setup-node: `node-version`, `cache`;
  - upload: `name`, `path`, `if-no-files-found`, `retention-days`, `compression-level`, `overwrite`;
  - download: `name`, `path`, `pattern`, `merge-multiple`;
  - cache: `path`, `key`, `restore-keys`;
  - build-push: `build-args`, `cache-from`, `cache-to`, `context`, `file`, `labels`, `load`, `push`, `tags`;
  - login: `registry`, `username`, `password`;
  - trivy: `cache`, `cache-dir`, `exit-code`, `format`, `ignore-unfixed`, `image-ref`, `output`, `severity`;
  - attest: `subject-path`.

  The defaults §3.2.1's release rule relies on hold at these SHAs:
  - setup-node `package-manager-cache` defaults to `true`;
  - setup-buildx `cache-binary` defaults to `true`;
  - trivy-action `cache` defaults to `true`;
  - pnpm/action-setup `cache` defaults to `false`;
  - download-artifact `digest-mismatch` defaults to `error`.

  New at these SHAs: checkout's `allow-unsafe-pr-checkout` (default `false`), and attest-build-provenance's
  `create-storage-record` (default `true`, a composite).
- **pnpm/action-setup v6.1.0 bootstraps pnpm 11.25.0** with `npm ci` from its committed lock. It then runs
  `pnpm self-update <packageManager>` with `cwd` set to its own directory, not the workspace
  (`src/install-pnpm/run.ts` at `ea17c68d`). So the workspace's `minimumReleaseAge` never applies to the switch.
  #40 offers v6.0.10; why Dependabot skips v6.1.0 could not be read (the release API is refused).
- **login-action v4.7.0 is two days old.** Dependabot's default 3-day cooldown is why #40 offers v4.6.0. v4.7.0 is three
  days old from 2026-10-26T15:11Z by commit date, before the npm work can start (section 7).
- **Nested refs** are unchanged from §3.2.1:547-549. Inside trivy-action v0.36.0, `setup-trivy` is pinned at v0.2.6
  `3fb12ec1` (latest v0.3.1 `81e51434`) and `actions/cache` at v5.0.5 `27d5ce7f` (`action.yaml:129,142`). The action
  installs trivy v0.70.0 (`action.yaml:98`, 2026-04-17); the latest trivy is v0.76.1 (2026-10-21). Section 9 has a
  proposal on this.

## 3. Dependabot #40, #33 and the closed #38, and how ci-deps supersedes each

- **#40** (open, head `e0d5b6f`, `behind`, updated 2026-10-25T18:53Z): 11 updates over 7 workflow files, the refs
  listed in the table's "#40 offers" column. ci-deps supersedes each:
  - checkout, setup-node, setup-python, upload, download, cache, buildx and build-push: the same SHAs as #40;
  - pnpm/action-setup: v6.1.0 (`ea17c68d`) instead of v6.0.10, the one that supports pnpm 12 and bootstraps 11.25.0;
  - login-action: v4.7.0 (`81c6f93d`) instead of v4.6.0;
  - the six tag refs `#40` leaves (`@v7`, `@v6`) in approval-of-record, large-zip and publish-content: SHA pins too,
    publish-content.yml under F4 only.

  After ci-deps merges, every #40 version is at or below base, so Dependabot closes #40 as up to date when it next
  runs. If it does not, the integrator records #40's state (§3.2.5 item 9).
- **#33** (open, head `bc82651`, `behind`): `node:24-slim` → `node:26-slim` in both Dockerfiles' four `FROM` lines.
  On its head, `images` and `capacity` were cancelled and `all green` and `screening-capacity gate` failed. ci-deps
  replaces the lines with `node:24-trixie-slim@sha256:43b9ba11…`, so #33's diff no longer applies. The new config's
  docker ignore for node semver-major then stops its class of PR. Node 26 stays N8's own PR (LTS from 2026-10-28).
  `designs/lane-b-ci.md:662` ("Node 25 (#33)") is stale.
- **#38** (closed 2026-10-25T18:57Z, "no longer updatable"). The refresh's job definition held 10 dependencies:
  `@anthropic-ai/sdk 0.135.0`, `@axe-core/playwright 4.14.0`, `@next/eslint-plugin-next 16.4.2`, `@playwright/test
  1.64.1`, `@vitest/coverage-v8 5.0.5`, `eslint 10.13.0`, `next 16.4.2`, `playwright-core 1.64.1`, `postcss 8.5.31` and
  `vitest 5.0.5`. The run also tried `typescript-eslint 8.72.0`, `aws-cdk 2.1146.1` and `aws-cdk-lib`, and they failed
  the same way.

## 4. Images and their digests

| Reference | Index digest (Hub API and registry agree) | Pushed | Notes |
|---|---|---|---|
| `node:24-trixie-slim` | `sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea` | 2026-10-21T17:39Z | = `24.22.1-trixie-slim`; §3.2.1's digest, unchanged |
| `node:24-slim` (today) | `sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205` | 2026-10-21T17:39Z | = `24-bookworm-slim` (Debian 12) |
| `node:26-slim` (#33) | `sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec` | 2026-10-21T17:39Z | = `26-trixie-slim`; for N8 |
| `postgres:18-trixie` | `sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6` | 2026-10-21T19:08Z | = `postgres:18` = `18.6-trixie` = `18.6` |

- The builder pins `postgres:18-trixie@sha256:edb0c08d…` in `docker-compose.yml:8`. Today's `postgres:18` (compose, the
  four `services:` blocks at `ci.yml:240,324,404` and `large-zip.yml:22`, and `containers.ts:223,344,509`) already
  resolves to that index. So the Postgres pin changes no bits; only the node images change Debian release (N7).
- Other image references: `minio/minio:RELEASE.2025-09-07T16-13-09Z` (`docker-compose.yml:22`, removed by §3.2.1)
  and `measure.test.ts:181`. No other `FROM`, `image:` or `docker run` image exists in the repository (grep).
- `apps/worker/Dockerfile:6` still runs `npm install --global pnpm@10.28.0`, the literal `check-toolchain` will forbid.
- **How to read a digest through this proxy** (both work, checked 2026-10-25T23:00Z):
  - Hub API: `curl -sS https://hub.docker.com/v2/repositories/library/<name>/tags/<tag>`, field `digest`.
  - Registry: get a token from
    `https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/<name>:pull`, then run
    `curl -sSI -H "Authorization: Bearer $tok" -H 'Accept: application/vnd.oci.image.index.v1+json,
    application/vnd.docker.distribution.manifest.list.v2+json'
    https://registry-1.docker.io/v2/library/<name>/manifests/<tag>`, and read `docker-content-digest`.

## 5. npm versions (#38's and the rest), at 6ddd587

From `pnpm -r outdated --format json` and `npm view <pkg> time --json`. "3 days at" is publish time plus 72 hours.
F2 (b) needs a dated exclude only for a version resolved before that instant.

| Package | Locked | Target | Published (UTC) | 3 days at | ≥3 d on 10-26 | ≥3 d on 10-27 | In ci-deps? |
|---|---|---|---|---|---|---|---|
| next | 16.4.1 | 16.4.3 | 10-23 13:40:24 | 10-26 13:40 | from 13:40 | yes | yes (§3.2.1) |
| @next/eslint-plugin-next | 16.4.1 | 16.4.3 | 10-23 13:28:29 | 10-26 13:28 | from 13:28 | yes | yes |
| vitest (catalog) | 5.0.4 | 5.0.5 | 10-15 14:29 | 10-18 | yes | yes | yes |
| @vitest/coverage-v8 | 5.0.4 | 5.0.5 | 10-15 14:27 | 10-18 | yes | yes | yes |
| eslint | 10.12.0 | 10.13.0 | 10-16 14:24 | 10-19 | yes | yes | yes |
| postcss | 8.5.30 | 8.5.31 | 10-18 19:39 | 10-21 | yes | yes | yes |
| typescript-eslint | 8.71.2 | 8.72.0 | 10-19 17:08 | 10-22 | yes | yes | **add** (C10) |
| fast-uri (transitive, ajv) | 3.1.8 | 3.1.9 | 10-19 23:05 | 10-22 | yes | yes | yes, by refresh |
| qs (transitive, typed-rest-client) | 6.15.1 | 6.16.1 | 10-14 22:06 | 10-17 | yes | yes | yes, **by override** (C9) |
| stripe | 23.0.0 | 23.0.1 | 10-22 17:47 | 10-25 17:47 | yes | yes | no: `minor-and-patch` group |
| aws-cdk / aws-cdk-lib | 2.1145.0 / 2.273.0 | 2.1146.1 / 2.274.0 | 10-22 17:45 / 10-20 15:05 | 10-25 / 10-23 | yes | yes | no: `aws-cdk` group |
| @aws-sdk/* (10 packages) | 3.1152.0 | 3.1156.0 | 10-22 18:47-18:54 | 10-25 18:47-18:54 | yes | yes | no: `aws-sdk` group |
| @anthropic-ai/sdk | 0.131.0 | 0.137.0 (or 1.3.0) | 10-20 22:23 | 10-23 | yes | yes | no: own PR (N8) |
| typescript | 6.0.3 | 7.0.2 | 07-08 | - | - | - | no: typescript-eslint 8.72.0 peer `>=4.8.4 <6.1.0` |
| @types/node | 24.19.2 | 26.6.5 | - | - | - | - | no: Node 26 PR (N8) |
| Playwright, axe | 1.56.1, 4.13.0 | 1.64.1, 4.14.0 | - | - | - | - | ci-browser |
| pnpm (`packageManager`) | 10.28.0 | 10.34.8 | 10-23 18:06:37 | 10-26 18:06 | from 18:06 | yes | yes (C2) |
| (already locked) Stryker ×5 | 10.1.1 | - | 10-23 19:17:52-19:18:49 | 10-26 19:18:50 | from 19:18:50 | yes | blocks any re-resolution until then |

- Peer checks for the bumped tools:
  - `@vitest/coverage-v8 5.0.5` needs `vitest 5.0.5` exactly.
  - `@stryker-mutator/vitest-runner 10.1.1` needs `vitest >=2.0.0`.
  - `typescript-eslint 8.72.0` needs `eslint ^8.57 || ^9 || ^10`.
  - `next 16.4.3` needs react `^18.2 || ^19` and `@playwright/test ^1.51.1`.

  `npm view <pkg>@<ver> peerDependencies`.
- **Which need a dated exclude under F2 (b): none**, if the bump commits run after 2026-10-26T19:18:50Z. Before that,
  pnpm 10 refuses the re-resolution anyway, because of the locked Stryker 10.1.1 (section 6). Between 13:40Z and
  19:18Z on 10-26, next 16.4.3 is old enough but Stryker still blocks. On 10-27 everything in the table is old enough.
- Advisories over all 614 locked versions (bulk endpoint): only qs 6.15.1 (3 moderate: GHSA-x5fp-wj9c-mxmx,
  GHSA-4mjr-xmp4-gh2g, GHSA-q8mj-m7cp-5q26, all fixed in 6.16.0) and fast-uri 3.1.8 (2 moderate and 2 low, fixed in
  3.1.9). Both are development-only (`pnpm why`), so `pnpm audit --prod` and `--audit-level=high` pass today.
- `#42` adds `@aws-sdk/client-sesv2 ^3.1152.0` to apps/web and `@aws-sdk/client-sqs ^3.1152.0` to apps/worker, with
  33 lockfile lines and 6 watched-path lines. Both are old versions, so neither blocks a gated re-resolution.

## 6. pnpm: version, advisories, minimumReleaseAge, excludes and trust

- **Version.** dist-tags on 2026-10-25: latest 12.15.0, latest-11 11.28.8, latest-10 **10.34.9**
  (2026-10-25T17:54:00.645Z). 10.34.8 was published 2026-10-23T18:06:37.606Z.
  - 10.34.9's only change is 0bff20d, "let the pnpm switched to record its pin in the lockfile" (#17344, closes
    #17303). It concerns pnpm 10 switching to a pnpm 11 or 12 target (`pnpm/src/switchCliVersion.ts` at v10.34.9).
    It changes nothing for a 10.x `packageManager`.
  - 10.34.8 itself: frozen-install hoisting, bin removal order, and the standalone executable embeds Node 24.22.1
    (`pnpm/CHANGELOG.md` at `aa97047`).
  - Recommendation: **keep 10.34.8**. The licence diff was measured on it, and 10.34.9 is three days old only from
    2026-10-28T17:54Z. An engineering-only choice, pre-approved under Q3.
- **Advisories:**
  - 10.28.0 has 23 (11 high, 12 moderate). The highest fixed-in bound among them is `<10.34.5`: GHSA-vq4v-j7r6-jq4m,
    GHSA-c59q-g84q-2gj5 and GHSA-vx52-2968-3vc6.
  - 10.34.7, 10.34.8 and 10.34.9 have none, and nor do 11.28.8 or 12.15.0 (bulk endpoint, 2026-10-25).
- **Dependabot's pnpm support.** dependabot-core supports pnpm 7 to 12 in code:
  - `pnpm_package_manager.rb` `SUPPORTED_VERSIONS`;
  - "Beta support of PNPM 11", 8ac9b21a, 2026-07-28;
  - "add pnpm 12 support", 493da6c4, 2026-09-15.

  Its updater image ships pnpm 12.10.1 (`npm_and_yarn/Dockerfile:9`; run 40223237798 logs "Installed version of
  pnpm: 12.10.1", then `corepack install pnpm@10.28.0`). GitHub's table still says "v7, v8, v9, v10"
  (github/docs `data/reusables/dependabot/supported-package-managers.md:44`). N10's trigger, GitHub listing a later
  major, has not fired, but N10's wording needs the fact (C3).
- **minimumReleaseAge on a frozen install: not checked.** In pnpm 10.34.8 the age filter is only in resolution:
  - `maximumPublishedBy` (`dist/pnpm.cjs:169491`) feeds `pickPackageFromMeta`'s `filterPkgMetadataByPublishDate`
    (`:66130-66139, :66217-66225`);
  - `pnpm outdated` and `pnpm dlx` use it too;
  - an up-to-date lockfile logs "Lockfile is up to date, resolution step is skipped" (`:175478`);
  - the bundle has no `MINIMUM_RELEASE_AGE_VIOLATION`, `trustLockfile` or `minimumReleaseAgeStrict`.

  Those three arrive in pnpm 11. `trustLockfile` is in 11.3.0 (pnpm.io `docs/settings/dependency-resolution.md`,
  "trustLockfile"). So CI's `pnpm install --frozen-lockfile` installs a young locked version without complaint.
- **minimumReleaseAge on a re-resolution: every direct dependency is re-checked**, not only the one being changed.
  Run 40223237798, `claude/build-platform` at de8f9b5:
  - Dependabot ran `pnpm update <dep>@<ver> --lockfile-only --config.minimum-release-age=4320` for each dependency,
    then `pnpm install --lockfile-only --config.minimum-release-age=4320`.
  - Each failed: `ERR_PNPM_NO_MATURE_MATCHING_VERSION Version 10.1.1 (released 47 hours ago) of @stryker-mutator/api
    does not meet the minimumReleaseAge constraint … while installing a direct dependency`.
  - Every dependency ended `update_not_possible` (log lines 275-936 and the summary table).
- **Where Dependabot's 4320 came from: GitHub's default cooldown.** "Apply a default cooldown period of 3 days to
  version updates, even when `cooldown` is not configured … does not apply to security updates" (github/docs
  `content/code-security/reference/supply-chain-security/dependabot-options-reference.md:191-196, :223`; feature
  `dependabot-cooldown-default-days`, `fpt: '*'`). The job definition carries no `cooldown` key; main's dependabot.yml
  has none. The log still says "Filtered out 1 versions due to cooldown" (line 260).
- **How Dependabot turns a cooldown into a pnpm gate** (dependabot-core `7c06280`):
  - `file_updater.rb:475-514`: the gate in days is the **smallest** selection cooldown over the dependencies in the
    invocation: patch days for a patch, minor days for a minor, major days for a major, capped at `default-days`.
  - `helpers.rb:144-150` (`higher_release_age_gate`): it is passed only when it is **longer** than the repository's
    `minimumReleaseAge`.
  - `pnpm_lockfile_updater.rb:540-556`: **security updates always pass `--config.minimum-release-age=0`**.
  - `pnpm_lockfile_updater.rb:363-398`: the ungated retry matches only pnpm 11's
    `MINIMUM_RELEASE_AGE_VIOLATION … lockfile entries failed verification`, so on pnpm 10 a young locked direct
    dependency fails the whole update.
  - `helpers.rb:216-235` reads `minimumReleaseAge` and `minimumReleaseAgeExclude` from pnpm-workspace.yaml for
    selection, and `:261-270` raises every cooldown field to at least the repository's gate.

  So under §3.2.1's npm cooldown (7 by default, 14 major, 7 minor, 3 patch), a `next`, `pg-boss`, `aws-sdk` or
  `anthropic-sdk` group holding only minor bumps gets a 10,080-minute gate, and a majors-only update gets 20,160. Each
  then fails while any locked direct dependency is younger than 7 or 14 days. After a weekly merge cycle that is the
  usual state. A group with at least one patch bump gets 3 days, equal to the repository's gate, and passes (Q1).
- **minimumReleaseAgeExclude, exact syntax (pnpm 10.34.8):**
  - An entry is a name (all versions; `*` patterns allowed), `name@1.2.3`, or a union `name@1.2.3 || 1.2.4`. A scoped
    entry is `@scope/name@1.2.3`.
  - A range, or a name pattern with a version, throws `INVALID_VERSION_UNION` or `NAME_PATTERN_IN_VERSION_UNION`.
  - Source: `dist/pnpm.cjs:141938-142001` (`createPackageVersionPolicy`, `parseVersionPolicyRule`,
    `parseExactVersionsUnion`).
  - An excluded exact version passes the date filter while the package's other versions are still filtered
    (`:66136`).
  - Docs: pnpm.io `docs/settings/dependency-resolution.md:320-359` (exact versions "Added in: v10.19.0").
  - The CLI flag `--config.minimum-release-age=N` replaces the gate's minutes, while the workspace's exclude list still
    applies. Dependabot relies on this.

  So `check-toolchain` accepts only `name@x.y.z` (one version per entry, so each entry has one expiry) and rejects a
  bare name, a pattern and a union.
- **trustPolicy: no-downgrade (pnpm 10.34.8 `dist/pnpm.cjs:67150-67240`, `trustChecks.js`).** It fails if any
  earlier-published, non-prerelease version had stronger evidence (trusted publisher over provenance over none):
  - I applied the same rule to all 614 locked versions and to the targets (next, eslint, vitest, coverage, postcss,
    typescript-eslint, qs 6.16.1, fast-uri 3.1.9, pnpm 10.34.8 and 10.34.9).
  - One fails: **`semver@6.3.1`**, published 2023-07-10 with no evidence, after `semver@7.5.1` of 2023-05-12, which
    had provenance.
  - `pnpm why`: `next 16.4.1` > `styled-jsx 5.1.6` > `@babel/core 7.29.7` (peer) > `semver 6.3.1`, and
    `eslint-plugin-react-hooks 7.1.1` > `@babel/core`.

  pnpm 10.27.0 also has `trustPolicyIgnoreAfter` (minutes), a blanket waiver for old versions. The narrow exact
  exclude is better (C8).
- **What this means for O3:** it is answered from source and from the log, apart from the builder's live confirmation
  in the PR's first gated resolution (C7).

## 7. When Dependabot's npm updates resume, and how ci-deps avoids a fight

- **Resume:** for any npm run that starts after **2026-10-26T19:18:50Z**. The weekly schedule has no `day`, so it runs
  on Monday at a time GitHub picks (`dependabot-options-reference.md:820, :830`). Earlier dynamic runs came from
  config changes and rebases (2026-10-18 02:41, 10-20 22:24, 10-22 05:53, 10-25 18:51), so they do not show the
  weekly time. A Monday run before 19:18:50Z fails as #38's did and opens nothing. A run after it opens one
  `minor-and-patch` PR under main's config, with next 16.4.3 and the eslint, vitest, postcss, typescript-eslint, aws,
  stripe, SDK, Playwright and axe versions.
- **What ci-deps does so the two do not fight:**
  1. Take exactly the versions Dependabot would select when ci-deps' bump commits are made: the newest version at least
     three days old (section 5). Dependabot's later run then finds nothing newer for those packages.
  2. Put the release-age and trust settings in the commit right after the licence commit, and make the bump commits
     after 2026-10-26T19:18:50Z (C7). Every resolution in the PR then runs under the same gate Dependabot uses. A
     bump that would break Dependabot breaks the builder first.
  3. Make `check-toolchain` refuse any lockfile version under three days old that is not a listed dated exclude (C6).
     No PR, Dependabot's security PRs included, can then leave the lockfile in the state that stopped #38.
  4. Keep Dependabot's npm gate no longer than the repository's (Q1). Otherwise its minor-only and major updates fail
     silently.
  5. Never merge a Dependabot PR as it stands. Under F1 (a), Dependabot reads the new config from the build branch when
     ci-deps merges. Config changes started immediate runs before (the dates above), so the new groups open at once,
     based on ci-deps' versions. A `minor-and-patch` PR opened before that is then refreshed or closed by Dependabot.
     The integrator records any left open (§3.2.5 item 9).
  6. F7 needs branches up to date. If #42 or a Dependabot PR merges first, ci-deps rebases, re-resolves the lockfile
     under the gate (LANES rule 6, never hand-merged) and re-runs all four required checks.

## 8. Changes the design needs (§3.2 unless named)

Each is engineering-only inside the ruled design, pre-approved under the co-founder's Q3, and recorded as such, unless
it points to section 9.

- **C1. §3.2.1:511-528, the table.**
  - Add the peeled SHA and the tag's commit date (section 2), and say it was re-read on 2026-10-25 at 6ddd587 with no
    newer tag.
  - Name the new uses (cache/restore and save in ci.yml, and mutation.yml's five actions), and say Trivy's two steps
    in ci.yml already set `cache: false`.
  - Note that #40 offers action-setup v6.0.10 and login v4.6.0, and that ci-deps takes v6.1.0 and v4.7.0.
- **C2. §3.2.1:624-631, pnpm.**
  - "latest-10 10.34.8" becomes "10.34.9 (2026-10-25T17:54Z); 10.34.8 kept: 10.34.9's only fix (0bff20d) concerns a
    switch to pnpm 11 or 12, and the licence diff was measured on 10.34.8".
  - Each fix is in `<10.34.5`, so the claim about the 23 advisories stands.
- **C3. §3.2.1:627-630 and N10 (`:1449-1451`).** Keep 10. Add that dependabot-core supports pnpm 11 and 12 in code
  (8ac9b21a, 493da6c4) and its image runs 12.10.1, while GitHub's table still lists v7-v10. The trigger stays.
- **C4. §3.2.1:633-640 and §3.2.5:4.**
  - The "3 `libc:` lines" are the three `detect-libc:` dependency lines (`pnpm-lock.yaml:6147,6163,6498`). The
    lockfile has no `libc:` field today.
  - Count with `grep -c '^ *libc: \['`.
  - The package set changed since 49514e8 only by Stryker 10.0.0 → 10.1.1, which has no native entries. So 43 is
    expected, but the builder re-measures it at the PR's base and does not assume it.
- **C5. §3.2.1:649-654, versions.**
  - Add `typescript-eslint 8.72.0` (C10).
  - Replace "a lockfile refresh of qs to at least 6.16.0" with C9.
  - The `:662` line becomes "#33 now proposes node:26-slim (head bc82651); Node 25 is end of life".
- **C6. §3.2.1:671-682, check-toolchain, new rule.**
  - For every `packages:` key the lockfile adds against the merge base (`origin/claude/build-platform` on a PR,
    `HEAD^1` on a push), read the registry's `time[version]`. Fail when it is younger than `minimumReleaseAge` and not
    listed in `minimumReleaseAgeExclude` with a live entry in `release-age-exceptions.json`. The message names the
    version, its publish time and the remedy.
  - Why: pnpm 10's frozen install never checks, and Dependabot security updates pass `minimum-release-age=0`.
  - It fails closed after three tries, as `check-action-pins` does. Tests: a young added version fails; the same
    version with a live exclude passes; a young version already in the base passes.
  - Replace the sentence "So a security fix … cannot enter the lockfile, by Dependabot or by hand, until a person adds
    a dated exclude" with: Dependabot's security PR can resolve it, and `check-toolchain` holds it red until a person
    adds the dated exclude.
- **C7. §3.2.1:683-686, the commit order.**
  - Commit 1: the licence fix. Commit 2: `minimumReleaseAge`, `minimumReleaseAgeExclude: []`, `trustPolicy` and
    `trustPolicyExclude` (C8). Then the bump commits, each made after 2026-10-26T19:18:50Z, so each resolution runs
    under the gates.
  - Fix the time: "Stryker 10.1.1 from 2026-10-26T19:18Z" becomes 19:18:50Z (vitest-runner 19:18:49.904Z). Add
    pnpm 10.34.8 from 2026-10-26T18:06:38Z. The same goes for N5 (`:1439-1442`).
  - O3 (`:1561-1563`) is answered by section 6: a frozen install is not checked; a re-resolution re-checks every direct
    dependency; the CLI flag overrides the workspace's minutes; no strict toggle exists before 11. The builder only
    confirms it live in commit 2's first gated bump.
- **C8. §3.2.1:671-672 and the Files list.**
  - Add `trustPolicyExclude: ['semver@6.3.1']`. Reason: published 2023-07-10 without provenance after 7.5.1 had it;
    reached through @babel/core.
  - `check-toolchain` keeps it in `tools/check-toolchain/trust-exceptions.json` (package, reason, added; no expiry, as
    it is a fixed old version). It must equal the workspace list, and the entry must still resolve in the lockfile.
- **C9. qs.** Add the pnpm override `"typed-rest-client@2>qs": "6.16.1"` to pnpm-workspace.yaml, then refresh fast-uri.
  - Reason: typed-rest-client 2.3.1 pins `qs` to `6.15.1` exactly, and `@stryker-mutator/core` 10.1.1 needs
    `typed-rest-client ~2.3.0`. typed-rest-client 3.1.2 depends on `qs ^6.16.0`.
  - `check-toolchain` keeps each override with its reason and removal trigger: Stryker depending on typed-rest-client
    3, or on qs 6.16.0 or later. An override whose target is no longer in the lockfile fails.
  - It closes the three moderate advisories, which are development-only.
- **C10. typescript-eslint 8.72.0** is lint tooling in lockstep with eslint 10.13.0, mature, and part of #38's refreshed
  group. Taking it keeps ci-deps' lint toolchain whole.
- **C11. §3.2.2, the Files list.** Add `tools/screening-capacity/watched.ts`, and `docker-compose.yml` to its
  `WATCHED_FIXED` (`:62-80`).
  - Once `containers.ts` reads the Postgres image from the compose file, a Dependabot digest bump there changes what
    the gate measures.
  - Today the file is not watched, so the measurement would be skipped.
- **C12. §3.2.3:817-819, `no-duplicated-versions.test.ts`.** Add `tools/stryker/unicode.json` as the source of record
  for `mutation.yml`'s exact `node-version: 24.22.0` (`mutation.yml:17,56,87,177`). `workflows.test.ts:1444` already
  holds the two equal. Without this the new test fails on ci-mutation's pin.
- **C13. §3.2.1:531-537, the `workflows.test.ts` references** are stale (the file grew from 49514e8, +1,036 −163 lines).
  At 6ddd587:
  - `PINNED` is at `:77-93`.
  - The literal refs are `:686` (`'actions/cache@v4'`), `:1271` (`'actions/checkout@v4'`, `'actions/setup-node@v4'`)
    and `:545` (the `# v4.2.2` comment).
  - The pin-form test is at `:1235-1251` (release, capacity and ci only; rule (a) extends it to every workflow) and
    `describe('dependabot')` at `:1486-1511`.
  - §3.2.1:726-727 should cite actionlint at `:1285-1290` and its configuration ban at `:356-358`.
- **C14. §3.2.1:687-701, dependabot.yml.**
  - Put `semver-*-days` only on the npm entry: GitHub Actions, Docker and Docker Compose support `default-days` only
    (`dependabot-options-reference.md:230-288`). `dependabot-config.test.ts` asserts it.
  - Record that GitHub applies a 3-day cooldown when none is set.
  - The npm values depend on Q1.
- **C15. §3.2.5:8.** The four checks are now the F7 ruleset's required checks: "Protect the build branch", applied
  2026-10-25 21:14 UTC, with branches up to date. `release-dry-run` stays advisory and outside the ruleset.
- **C16. §3.2.1:596-598, images.** Add the postgres digest (section 4) and the fact that `postgres:18` already is
  18.6-trixie. Add the two working ways to read a digest.

## 9. Questions that are not engineering-only, and proposals outside ci-deps

- **Q1 (security trade-off: soak time). Dependabot's npm cooldown.**
  - **(a) Recommended:** npm `cooldown: { default-days: 3 }` and no semver-specific days. Actions and images keep
    `default-days: 7`, which has no pnpm gate.
    - Dependabot's gate then equals the repository's `minimumReleaseAge`, so it is never injected.
    - Every npm group, majors included, opens when its versions are three days old: the founder's F2 (b) floor.
    - People still triage every PR (never merged as it stands).
  - (b) Keep 7 by default, 14 major, 7 minor and 3 patch. Minor-only groups (next, pg-boss, aws-sdk, anthropic-sdk)
    and every major update then fail silently while any locked direct dependency is younger than 7 or 14 days, which
    is most weeks (section 6). Only mixed patch groups would arrive.
  - (c) Raise the repository's `minimumReleaseAge` to 7 days to match. That changes the founder's F2 (b), and every
    young security fix then needs an exclude for longer.
- **P1 (outside ci-deps; security trade-off).** Apply the three-day floor to action pins and image digests as well:
  `check-action-pins` fails a tag whose commit is under three days old, and `check-toolchain` does the same for a
  digest's push date.
  - Dependabot's 3-day default already holds its own PRs to it.
  - Today it would only have held back login v4.7.0, by one day.
  - Recommended yes, for the founder or co-founder.
- **P2 (outside ci-deps; scanner accuracy and security).** Set trivy-action's `version:` input to the latest trivy
  (v0.76.1, 2026-10-21), instead of v0.70.0, which v0.36.0 installs by default. It needs a check that the binary
  release is not one of March 2026's hijacked tags (CVE-2026-33634), and a pin rule in `check-action-pins`.
- **P3 (outside ci-deps).** pnpm 11.3 or later verifies every lockfile entry against `minimumReleaseAge` and
  `trustPolicy` on install, frozen included. That would enforce F2 (b) natively. Revisit N10's trigger once GitHub's
  table lists pnpm 11 or 12, which dependabot-core already runs.
- **P4 (handoff text).** `lanes/lane-b.md:43` gives the resume time as "about 19:50 UTC". It is 19:18:50Z.

## 10. Evidence (scratchpad `/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad/`)

- `ci-deps-progress/scout-versions.md`: this scout's running log.
- `sv/*.tags`: ls-remote output. `sv/git/*.git`: depth-1 tag fetches (dates). `sv/actionyml/`: action.yml at each SHA.
- `sv/dep-40223237798-full.log` and `sv/jobdef.json`: the Dependabot run.
- `sv/outdated.json`, `sv/times/*.json` and `sv/lockages.json`: versions, publish times, all 614 locked versions.
- `sv/adv-*.json`: pnpm advisories by version. `sv/pnpm-pkg/`: the pnpm 10.34.8 tarball.
- `sv/pnpm-cl-v10.md`: pnpm's v10 changelog. `sv/dc/`: dependabot-core files.
- `sv/dor.md` and `sv/spm.md`: github/docs. `sv/pnpmio-dependency-resolution.md`: pnpm docs.
- `sv/hub-*.json`: Docker Hub tag documents.
