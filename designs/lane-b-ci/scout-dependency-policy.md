# Scout report: dependency-update policy (audit #112), the Dependabot PRs and the dismissed versions

Scout: dependency-policy. Base: `claude/build-platform` at 49514e8. Date: 2026-10-24.
This was read-only research. I changed no file in either checkout, created no branch and posted nothing on GitHub.
Scratch files are in the scratchpad: the PR bodies (`pr40-body.md`, `pr38-body.md`, `pr33-body.md`) and #38's log
tail (`pr38-check.log`). The temporary clones of dependabot-core, github/docs and the axe-core tarballs were deleted.

## 0. The recommendation in one screen

1. **Where the config takes effect.** Dependabot reads `.github/dependabot.yml` only from the default branch, which is
   `main`. Alerts and security updates read only `main` too, and `main` holds no manifest. **Recommended (founder
   decision Q1):** make `claude/build-platform` the default branch until launch. Then:
   - the build branch's own config is the one in force, and it changes through ordinary CI'd PRs;
   - alerts and security updates cover the real lockfile;
   - the weekly schedules start (mutation, large-zip, screening-capacity; audit #54 depends on this);
   - GitHub offers the PR template;
   - a stray PR no longer defaults into `main` (#7's accident).

   **Fallback:** one PR into `main` on the founder's ruling (the #27 precedent), plus a drift test on the build
   branch.
2. **What to take now.** Take every action major in #40 into the CI PR, pinned by SHA. #40's only failures are the
   exact-version asserts in `workflows.test.ts`; all 51 e2e journeys passed on the v7 actions.
   - Take Playwright 1.64.1 and axe 4.14.0 together (with #19's runner move). axe 4.14 promoted a rule from
     experimental, so its findings are real WCAG 2.5.3 (Label in Name) defects.
   - Take the patch and minor tooling: vitest, eslint, postcss, Next 16.4.3 with its licence fix.
   - Move the Anthropic SDK to its own group and a deliberate PR (1.x is out; 0.134 added OpenTelemetry tracing).
   - Ignore #33 (Node 25 reached end of life on 2026-06-01).
   - Node 26 waits for its own planned PR. It becomes LTS on 2026-10-28.
   - TypeScript 7 waits for typescript-eslint, whose peer range is `<6.1.0`, canary included.
3. **Pin everything by digest or SHA.** That covers every action (`owner/repo@<sha> # vX.Y.Z`), every base image
   (`node:24-trixie-slim@sha256:…`) and every service image. The repository setting that refuses unpinned actions
   comes after the CI PR (founder decision Q3). `publish-content.yml` has `contents: write`, which makes it the most
   valuable workflow to pin. reconciliation-001 freezes that file, so pinning it needs a ruling (Q4).
4. **New findings the policy must cover:**
   - **pnpm itself.** `packageManager` and both Dockerfiles pin **pnpm 10.28.0, which has 23 known advisories, 11 of
     them high**. Dependabot never updates `packageManager`, and `pnpm audit` does not audit pnpm.
   - **Production base images.** **`node:24-slim` is Debian 12 bookworm**: same digest as `24-bookworm-slim`, measured
     on Docker Hub. Bookworm's regular security support ended in 2026.
   - **MinIO.** **The `minio/minio` image no longer exists on Docker Hub**, and the MinIO repository was archived on
     2026-04-25. So `pnpm dev`'s compose stack cannot start on a fresh machine.
   - **pg-boss.** Its **minor** releases also migrate its schema: schema 26 at 12.0.0, schema 46 at 12.38.0. The
     worker migrates at start while the web refuses to start on a version mismatch.

## 1. Where Dependabot's config takes effect

**Facts**
- `main` carries the grouped, limited config with `target-branch: claude/build-platform` on every entry
  (`git show origin/main:.github/dependabot.yml`). The build branch's copy has no `target-branch` lines, and its header
  says main's copy is the one in force (`.github/dependabot.yml:1-6`).
- The repository is public and its default branch is `main`. Security settings, from `gh api
  repos/PureTideWater/PhysicalTherapy --jq .security_and_analysis`:
  - `dependabot_security_updates`: disabled;
  - secret scanning: enabled;
  - push protection: enabled.
- GitHub docs (github/docs `dependabot-options-reference.md`, `target-branch`) say that when `target-branch` is set:
  > "Options defined for this package-ecosystem no longer apply to security updates because security updates always
  > use the default branch."

  ADR 0063 already records the consequence (`docs/adr/0063*.md:84-86, 338-340`): until launch, alerts and security
  updates see nothing, and `pnpm audit --prod` stands in.
- Scheduled workflows fire only from the default branch:
  - `mutation.yml` has a comment saying so;
  - `large-zip.yml` and `screening-capacity.yml` are schedule-driven;
  - audit #54 notes that "the weekly 2 GB intake check has never run".
- No rulesets exist yet (`gh api …/rulesets` returns `[]`), and `main` is unprotected. Runbook step 4B targets `main`
  by "Include default branch (or Include by pattern → main)" (`docs/runbooks/github-governance.md:310`).
- Precedent: PR #27, merged on the founder's ruling of 2026-10-20 (HANDOFF.md:312, 325).

**Options**

| Option | Gives | Gives up |
|---|---|---|
| **(a) Default branch = `claude/build-platform` until launch** (recommended) | Dependabot reads the config CI tests, with no second copy. Alerts and security updates cover the real lockfile, including transitive packages, which version updates never touch for npm. The schedules run (#54, large-zip, capacity). GitHub offers the PR template. New PRs default to the build branch. Config changes need no PR into `main`. | `main` stops being the landing page until launch. ADR 0063, the governance runbook (step 4B: target `main` *by pattern*, not "default branch"; launch step 5: switch the default back to `main`) and the CLAUDE.md line "GitHub offers it only from main" must be amended. Scheduled runs cost minutes if the repository goes private (about 300-400 a month for mutation, capacity and large-zip together; unmeasured). Ignore rules then also apply to security updates, so a fix that exists only in an ignored major is not proposed. The alert still shows. |
| (b) One PR into `main` with the new config, on the founder's ruling | Smallest governance change, and the precedent exists (#27). | Alerts, security updates and schedules stay dark until launch. Every later config change needs another ruling and another PR into `main`. CI never tests `main`'s copy, so the two copies drift. |
| (c) A copy on the build branch plus a test that it matches `main` (minus `target-branch`) | Detects drift. `fetch-depth: 0` already fetches `origin/main` in CI. | Dependabot never reads the copy. The test only forces (b) to happen, so it is a companion to (b), not an alternative. |

**Recommendation:** (a). If the founder declines (a), do (b) plus (c), with the config from section 7 and every
`target-branch` line kept.

## 2. The three open Dependabot PRs

### #40: actions group, 11 updates (head c13c688 on base 49514e8)

CI: run 39978142633, `check` job 120498066630. It failed at step 21 (`pnpm test && …`) with **only
`tools/test/workflows.test.ts` assertions** (check-run annotations):
- :719, the literal `'actions/checkout@v4', 'actions/setup-node@v4'`;
- :698, the `PINNED` set;
- :574, :370 and :319, `PINNED.checkout` and `PINNED.downloadArtifact`;
- :141 three times, from `stepIndex` lookups by exact ref, such as `'actions/upload-artifact@v4'` at :404 and :423.

The e2e step still ran (`if: !cancelled()`): **51 passed** with `actions/upload-artifact@v7` uploading the report. Also
green:
- `images (web)`, `images (worker)` and `licenses` (run 39978142534);
- `capacity` (run 39978142533);
- `approval-of-record`.

actionlint 1.7.7 is clean on #40's eight workflow files (measured in a scratch copy).

The Node 20 deprecation warning ("…target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4,
actions/setup-node@v4, actions/setup-python@v5, actions/upload-artifact@v4, pnpm/action-setup@v4", annotation on #38's
job 119655798280) disappears on #40. GitHub's changelog moved Node 20's removal from the runner to 2026-09-23
(https://github.blog/changelog/2026-09-23-deprecation-of-node-20-on-github-actions-runners/, read through a search
result: github.blog is not resolvable from this session).

I checked each pinned SHA in #40 against `git ls-remote` of its tag (all OK):
- checkout v7.0.1 `3d3c42e5…`;
- setup-buildx v4.4.1 `f87e5991…`;
- build-push v7.4.0 `c3c9e263…`;
- upload-artifact v7.0.2 `cf430e03…`;
- download-artifact v8.0.2 `9000827c…`;
- action-setup v6.0.10 `0977fd99…`;
- setup-node v7.1.0 `949feb24…`;
- cache v6.1.0 `55cc8345…`;
- login v4.6.0 `dbcb8138…`.

| Action | #40 offers | Latest (git ls-remote) | Breaking changes that matter here (source) | Verdict |
|---|---|---|---|---|
| actions/checkout | 4 → 7.0.1 | v7.0.1 | v5: Node 24. v6: credentials go to a separate file under `$RUNNER_TEMP` through `includeIf`; #40's log shows it cleaned up. v7: blocks checking out a fork PR on `pull_request_target`/`workflow_run`; no workflow here uses either (triggers read from every workflow). Source: https://github.com/actions/checkout/blob/main/CHANGELOG.md | **Take in the CI PR**, SHA-pinned. |
| actions/setup-node | 4 → 7.1.0 | v7.1.0 | v5: automatic caching from `packageManager`. v6: limited to npm. v7: ESM, no dummy `NODE_AUTH_TOKEN`. We set `cache: pnpm` and publish nothing. Source: https://github.com/actions/setup-node/releases | **Take.** |
| pnpm/action-setup | 4 → 6.0.10 | **v6.1.0** (`ea17c68d…`, "support pnpm v12") | v6 bootstraps pnpm 11, then self-updates to `packageManager`; #40's CI shows it works with 10.28.0. Source: https://github.com/pnpm/action-setup/releases | **Take v6.1.0.** |
| actions/setup-python | 5 → 6 | **v7.1.0** (`6d4fd22b…`, immutable release, 2026-10-22) | v6: Node 24. v7: removes the `pip-install` input (unused here; `ci.yml` runs `pip install pyx12`). Dependabot offered 6 where #29 had offered 7; a stored ignore is likely. Source: https://github.com/actions/setup-python/releases | **Take v7.1.0.** |
| actions/upload-artifact | 4 → 7.0.2 | v7.0.2 | v6: Node 24. v7: ESM and opt-in direct uploads (`archive: false`); `archive` defaults to true. Release notes are in #40's body. | **Take.** |
| actions/download-artifact | 4.3.0 → 8.0.2 | v8.0.2 | v8: a hash mismatch now errors by default, which is stronger. It skips unzipping non-zip downloads. Used only in `release.yml` (`name:`/`pattern:` plus `merge-multiple`). | **Take, together with upload v7.** Only a tag runs it (risk R1). |
| actions/cache (restore and save) | 4.3.0 → 6.1.0 | v6.1.0 | v5: Node 24. v6: ESM. Source: https://github.com/actions/cache/releases | **Take.** |
| docker/setup-buildx-action | 3 → 4.4.1 | v4.4.1 | v4: Node 24, removes deprecated inputs (none used). | **Take.** |
| docker/build-push-action | 6 → 7.4.0 | v7.4.0 | v7 removes `DOCKER_BUILD_NO_SUMMARY` and `DOCKER_BUILD_EXPORT_RETENTION_DAYS` (grep: unused). | **Take.** |
| docker/login-action | 3.7.0 → 4.6.0 | **v4.7.0** (`81c6f93d…`) | v4: Node 24 and ESM. Source: https://github.com/docker/login-action/releases. `release.yml` only. | **Take v4.7.0.** Tag-only (R1). |
| aquasecurity/trivy-action | not in #40 | v0.36.0 (`ed142fd0…`, already pinned) | It pins trivy v0.70.0 and setup-trivy by SHA (its `action.yaml` at that SHA). The March 2026 tag hijack left only immutable v0.35.0 clean (CVE-2026-33634; https://www.aquasec.com/blog/trivy-supply-chain-attack-what-you-need-to-know). | Keep. |
| actions/attest-build-provenance | not in #40 | v4.2.2 (already pinned) | none | Keep. |

`publish-content.yml` is in #40's diff. reconciliation-001 ("Content pipeline": "`tools/verify-content`,
`.claude/hooks/protect-content.sh` and `.github/workflows/publish-content.yml` are unchanged",
`docs/product/reconciliation-001.md:447`) forbids changing it without the owner. So the CI PR leaves it alone unless
the founder rules (Q4).

### #38: npm minor-and-patch, 10 updates (head 3f6ddc8, **base 510a26d**, two merges behind 49514e8)

CI:
- `check` job 119655798280 (run 39727848494) failed only at `pnpm test:e2e`: **13 failed, 36 passed**.
- `licenses` job 119655799035 failed with "the exception for @img/sharp-libvips-linuxmusl-x64 (LGPL-3.0-or-later)
  matches no production dependency; remove it".
- Images passed.

The e2e failures (log tail in `pr38-check.log`):
- 8 are axe `label-content-name-mismatch` (impact serious).
- The others are retries that failed on state their first attempt left: "remit.835 Held: Duplicate of file …", and a
  key already registered (`toHaveURL /sign-in/register-key/`).
- One is the brand journey's baseline.

**Root cause of the axe findings (measured):** in axe-core 4.13.0 the rule's tags include `'experimental'`; in 4.14.0
they do not (`tags: ['cat.semantics','wcag21a','wcag253',…]`). Measured from both npm tarballs' `axe.js`. The e2e helper
runs `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa'])`, so 4.14 turns on WCAG 2.5.3 (Label in Name, Level A). These
are real defects, as audit #19 said.

| Package | #38 | Latest (npm, 2026-10-24) | Verdict |
|---|---|---|---|
| next and @next/eslint-plugin-next | 16.4.1 → 16.4.2 | **16.4.3** (2026-10-23) | Patch backports ("[lts-active]" turbopack fixes, PR body). **Take 16.4.3 in the CI PR**, both packages in lockstep, with the licence allowlist fix: drop the musl exception once pnpm 10.34.8 writes `libc:` fields (the Playwright scout measured this; sections 3 and 9). |
| @playwright/test, playwright-core (worker and tools) | 1.56.1 → 1.64.1 | 1.64.1 | **Take in the CI PR with #19's runner move**, its own group from now on. The worker Dockerfile hard-codes `npm install --no-save playwright-core@1.56.1` (`apps/worker/Dockerfile:23`), which Dependabot never edits; #38's worker image built with 1.56.1 while package.json said 1.64.1. Regenerate and inspect the seven brand baselines. |
| @axe-core/playwright | 4.13.0 → 4.14.0 | 4.14.0 | **Take with Playwright.** Fix the Label-in-Name findings on the 8 screens; do not exclude the rule. |
| vitest, @vitest/coverage-v8 | 5.0.4 → 5.0.5 | 5.0.5 | **Take.** The Stryker vitest-runner patch (`pnpm-workspace.yaml` `patchedDependencies`) is for 10.0.0 and is unaffected. |
| eslint | 10.12.0 → 10.13.0 | 10.13.0 | **Take.** |
| postcss | 8.5.30 → 8.5.31 | 8.5.31 | **Take.** |
| @anthropic-ai/sdk | 0.131.0 → 0.135.0 | **1.3.0** (1.0.0 on 2026-10-21) | **Own group and its own deliberate PR**, not the CI PR. For a 0.x package each minor is breaking under semver. 0.134.0 "add native support for OpenTelemetry tracing … if your app registers a global tracer provider, the SDK will create spans" and adds trace-context headers (PR body). pg-boss already pulls `@opentelemetry/api@1.9.1` (`node_modules/.pnpm/pg-boss@12.38.0_@opentelemetry+api@1.9.1`), so a future observability PR that registers a provider would switch SDK spans on. The PR must prove the spans carry no prompt or document text, or switch them off, and must pass the model evaluation gate (ADR 0051). The 1.x migration notes are not yet read (open item). |

### #33: base images, node:24-slim → node:25-slim (head 7378d48, base 510a26d)

CI was green: `check` job 119664853142, both images, and `capacity` job 119664851450. That proves little: CI runs Node
24 through setup-node, and only the images use 25.

Node 25 reached end of life on 2026-06-01 (https://raw.githubusercontent.com/nodejs/Release/main/schedule.json;
nodejs.org's previous-releases page lists v25 as EOL at v25.9.0). Docker Hub's `node:25-slim` was last pushed on
2026-05-20 (Hub API), so it gets no more Debian rebuilds.

Dependabot offered 25 because closing #10 and #13 on 2026-10-18 stored an ignore for the tag `26-slim`. Its comment on
#10: "I won't notify you again about this release, but will get in touch when a new version is available". A Docker
major-only tag never gets a new version, so the ignore is effectively permanent.

**Verdict: ignore.** A `semver-major` ignore for `node` in the docker ecosystem (section 7) stops this class of PR.

## 3. The versions dismissed on 2026-10-18 (#8 to #17, closed 2026-10-18 16:29)

| Version | State today | Verdict |
|---|---|---|
| actions/checkout 7 (#8) | Proposed again in #40 at v7.0.1 | **Take in the CI PR** (section 2). |
| pnpm/action-setup 6 (#9) | #40 offers v6.0.10; v6.1.0 is current | **Take v6.1.0.** |
| docker/build-push-action 7 (#11) | #40 offers v7.4.0 | **Take.** |
| docker/login-action 4 (#12) | #40 offers v4.6.0; v4.7.0 is current | **Take v4.7.0.** |
| actions/upload-artifact 7 (#14) | #40 offers v7.0.2 | **Take** (with download-artifact v8). |
| node 26-slim (#10 web, #13 worker) | Node 26 is "Current" at v26.12.1. **Its LTS starts 2026-10-28**, maintenance 2027-10-20, end 2029-04-30. Node 24 entered maintenance on 2026-10-20 and ends 2028-04-30 (schedule.json above; https://nodejs.org/en/about/previous-releases). From Node 27, every major goes LTS on a yearly cycle (same page). `node:26-slim` = `26-trixie-slim` (same digest `sha256:36793bcb…`, Hub API). | **Its own deliberate PR on a plan** (section 8), not the CI PR. No hurry: 24 is supported until April 2028. Every package checked declares Node 26 support: next `>=20.9.0`, @playwright/test `>=20`, vitest `^22.12.0 \|\| ^24.0.0 \|\| >=26.0.0`, pg-boss `>=22.12.0`, @stryker-mutator/core `>=22`, pdfjs-dist `>=22.13.0 \|\| >=24`, eslint `>=24`, aws-cdk-lib `>=20` (`npm view <pkg> engines.node`). |
| typescript 7.0.2 (#16) | Still `latest` (released 2026-07-08); 7.1.0-beta on 2026-10-20 (`npm view typescript time`). typescript-eslint 8.72.0 **and its canary** declare `typescript: ">=4.8.4 <6.1.0"`. Its TS 7 support request #12518 was closed: "There is nothing we can do about this until TS 7 provides an API"; the work is tracked in #10940 (https://github.com/typescript-eslint/typescript-eslint/issues/12518). Lint here is type-aware (`eslint.config.js:115,121`, `recommendedTypeChecked` with `projectService`). | **Ignore majors** until typescript-eslint ships a TS 7 peer range. Then do one deliberate PR, which also checks that `next build`'s TypeScript step works. TS 7.1 restores an API; its GA date is not confirmed. |
| @types/node 26.6.5 (#17) | Still latest, while the runtime is Node 24 | **Ignore majors**: the types track the runtime's major. They move in the Node 26 PR. |

## 4. Action pinning: one policy and its test

Today:
- `release.yml` and `screening-capacity.yml` pin by SHA with `# vX.Y.Z`. `workflows.test.ts:684-699` enforces the form
  for those two files plus an exact-SHA table, `PINNED` (`:46-58`). That table, and the literal `@v4` asserts (`:404`,
  `:423`, `:719`), make every action update red by construction (#40).
- `ci.yml`, `supply-chain.yml`, `mutation.yml`, `large-zip.yml`, `approval-of-record.yml` and `publish-content.yml`
  use moving tags (`@v4`, `@v3`, `@v6`). That includes **supply-chain.yml, the security workflow itself**
  (`supply-chain.yml:25-27,40-45`), and **publish-content.yml, which has `contents: write` and pushes to `main`**.

The evidence:
- The trivy-action tag hijack of 19 March 2026 force-pushed 75 or 76 of the action's tags to a credential stealer; only
  the immutable v0.35.0 was spared (CVE-2026-33634; Aqua's post above;
  https://snyk.io/articles/trivy-github-actions-supply-chain-compromise/).
- GitHub's secure-use guide recommends full-length SHAs (github/docs `content/actions/reference/security/secure-use.md`).
- Dependabot keeps a SHA pin and its comment current: #40 rewrote `@11d5960a… # v4.4.0` to `@3d3c42e5… # v7.0.1`.

**Policy:**
1. Every `uses:` in every workflow, and in any local composite action, is `owner/repo[/path]@<40-hex> # vMAJOR.MINOR.PATCH`,
   or a local `./` path. No `docker://` references.
2. Every workflow uses the same SHA for the same action.
3. Every `services:`/`container:` image, every Dockerfile `FROM` and every compose image is `name:tag@sha256:<64-hex>`,
   or is derived from such a reference (the postgres design in section 6).

**The test**, which replaces `PINNED` and the literal refs in `tools/test/workflows.test.ts`:
- (a) the form check over all workflows, not just two;
- (b) one SHA per action across files, so a partial update fails;
- (c) behaviour asserts match by action name (`uses.startsWith('actions/checkout@')`), never by exact ref;
- (d) the image-digest form for workflows, Dockerfiles and `docker-compose.yml`;
- (e) version agreement where a version is duplicated outside a manifest: the worker Dockerfile's `playwright-core`
  equals `apps/worker/package.json`'s, and pnpm in the Dockerfiles equals `packageManager`. Better still, derive both,
  as section 9 recommends.

Add a small networked CI step, `tools/check-action-pins`. It runs one `git ls-remote` per action (about 12 calls; done
by hand in this session, all OK) and checks that each `# vX.Y.Z` tag resolves to the pinned SHA. A hand edit that
labels a SHA wrongly is then caught; Dependabot writes both together.

**Repository setting (Q3):** Settings → Actions → "Require actions to be pinned to a full-length commit SHA"
(available on github.com: github/docs `data/features/actions-blocklist-sha-pinning.yml` has `fpt: '*'`;
`data/reusables/actions/actions-use-policy-settings.md`). Turn it on after the CI PR merges, or it blocks the unpinned
workflows.

**Considered and not chosen now:** workflow dependency lockfiles (`.github/workflows/actions.lock`, `gh actions-lock`).
GitHub calls them better than SHA pinning because they also cover transitive actions. But they are in **public
preview**, and the how-tos carry `product: GitHub Enterprise Cloud` (github/docs
`content/actions/how-tos/secure-your-work/lock-workflow-dependencies.md`, `…/enforce-workflow-lockfiles.md`), so they
are probably out of reach for a personal account. Revisit at GA. Dependabot regenerates the lockfile entries, so moving
later is cheap.

## 5. Security updates and Dependabot alerts

- **State (measured):**
  - `security_and_analysis.dependabot_security_updates.status = "disabled"`.
  - `gh api repos/…/dependabot/alerts` returns 403 "Dependabot alerts are disabled for this repository".
  - The proxy refuses `…/vulnerability-alerts` and `…/automated-security-fixes`: 403 and "not permitted through this
    proxy".
- **What they would see:** only the default branch's manifests (the `target-branch` doc quoted in section 1). With
  `main` as default, that is nothing until launch.
- **Recommendation (Q2):**
  - Turn on alerts and security updates now. Both are free for public and private repositories.
  - With option (a) they cover the build branch at once, transitive packages included. Version updates never touch
    those for npm: `allow.dependency-type: indirect` is not supported for npm (options reference, `allow`).
  - Group security updates into one PR: a `groups` entry with `applies-to: security-updates`.
  - Cooldown does not delay security updates (options reference, `cooldown`).
- **Today's audit (measured with `pnpm audit --prod` and `pnpm audit --json`):**
  - Production: none.
  - Development: 2 low and 5 moderate, all in @stryker-mutator/core's transitive packages: qs 6.15.1 (fixed in
    ≥6.16.0) and fast-uri 3.1.8 (fixed in ≥3.1.9). A lockfile refresh within the existing ranges fixes them; take that
    in the CI PR.

## 6. postgres:18 and MinIO

**Coverage facts**
- The github-actions ecosystem reads only `uses:`. Its file parser calls `uses_declarations`, skips `docker://`, and
  carries the comment "TODO: Support Docker references" (dependabot-core
  `github_actions/lib/dependabot/github_actions/file_parser.rb`). So `services.postgres.image` in `ci.yml:21` and
  `large-zip.yml:22` is not covered.
- The docker ecosystem reads `Dockerfile`/`Containerfile` names, and YAML only when it has `apiVersion` and `kind`
  (Kubernetes) or is a Helm chart (`docker/lib/dependabot/shared/shared_file_fetcher.rb`). Workflow files do not
  qualify.
- The **docker-compose** ecosystem (`package-ecosystem: docker-compose`, Compose v2 and v3; github/docs
  `data/reusables/dependabot/supported-package-managers.md`) reads files matching
  `/(docker-)?compose(-[\w]+)?(?>\.[\w-]+)?\.ya?ml/i` and parses top-level `services.*.image`, digests included
  (`docker/lib/dependabot/docker_compose/file_fetcher.rb:9`, `file_parser.rb:42-93`). So `docker-compose.yml` is
  covered once an entry exists.
- Other references to `postgres:18`: `tools/screening-capacity/containers.ts:223,344` and `measure.test.ts:181`.
- Production is RDS `PostgresEngineVersion.VER_18` (`infra/lib/constructs/database.ts:127`).
- Docker Hub has `postgres:19rc1` (Hub API), so PostgreSQL 19 GA is close.
- `postgres:18` = `18-trixie` = `sha256:edb0c08d…`, last pushed 2026-10-21. CI ran PostgreSQL 18.6 (#40's log).

**Design (recommended):**
1. **`docker-compose.yml` is the single source.** Pin it as `postgres:18-trixie@sha256:<digest>`, and ignore postgres
   `semver-major` (the major follows RDS).
2. **CI derives the service image from it.** A tiny first job reads `docker-compose.yml` with the repository's `yaml`
   package and outputs the reference; the jobs use `services.postgres.image: ${{ needs.<job>.outputs.postgres }}`.
   GitHub allows `needs` in `jobs.<job_id>.services` (github/docs `content/actions/reference/workflows-and-actions/contexts.md:105`).
   The CI structure scout's design will have a setup or plan job anyway.
3. **The capacity harness reads the same file**, so a Dependabot compose PR changes every place at once and stays
   green.
4. **Not chosen:** an equality test across the five copies. Dependabot would update only the compose file, so every
   such PR would be red by construction.

**MinIO: coverage is moot; the dependency is dead**
- `curl https://hub.docker.com/v2/repositories/minio/minio/` returns `{"message":"object not found"}`, and so does
  `minio/mc`. Control lookups resolve: `bitnami/minio`, `chrislusf/seaweedfs`, `rustfs/rustfs`, `localstack/localstack`
  and `adobe/s3mock`.
- https://github.com/minio/minio says "archived by the owner on Apr 25, 2026", "THIS REPOSITORY IS NO LONGER
  MAINTAINED", and "We will no longer provide pre-compiled binary releases for the community version".
- Effect: `docker-compose.yml:23`'s `minio/minio:RELEASE.2025-09-07T16-13-09Z` cannot be pulled on a fresh machine.
  `docker compose up --wait` then fails as a whole, and `tools/dev.ts:19-22` carries on without either service, so
  local PostgreSQL does not start from compose either.

**Recommendation:** replace MinIO with a maintained S3-compatible server, pinned by digest and covered by the
docker-compose entry. The app uses S3 Object Lock (`ObjectLockMode`/`ObjectLockRetainUntilDate`), presigned URLs and
multipart uploads (grep over `apps/ packages/`), so the replacement must support those. Candidates:
- **RustFS** (Apache-2.0; its S3 matrix lists Object Lock);
- **SeaweedFS** (Apache-2.0; claims retention).

Secondary source for both: https://glukhov.org/data-infrastructure/object-storage/self-hosted-s3-alternatives/.

Pick by a bounded measurement: the storage tests' Object Lock COMPLIANCE write and delete-refusal, a presigned PUT, and
a multipart upload against each (open item O1). This can ride in the CI PR (it owns compose coverage) or a small
dev-environment PR.

## 7. Groups, ignores and cooldown: the proposed config

Written for option (a). Under (b), add `target-branch: claude/build-platform` to every entry. Groups take the first
match, so the specific groups come before `minor-and-patch` (options reference, `groups`).

```yaml
version: 2
multi-ecosystem-groups:
  container-images:               # the base images and the dev and CI services in one weekly PR
    schedule: { interval: weekly, day: monday, time: "04:30", timezone: Etc/UTC }
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday, time: "04:30", timezone: Etc/UTC }
    open-pull-requests-limit: 8   # 7 groups + room for one ungrouped major
    cooldown:                     # GitHub applies 3 days by default; explicit and longer for minors and majors
      default-days: 7
      semver-major-days: 14
      semver-minor-days: 7
      semver-patch-days: 3
    ignore:                       # deliberate upgrade PRs instead (docs/runbooks/dependency-upgrades.md)
      - { dependency-name: "@types/node", update-types: ["version-update:semver-major"] }
      - { dependency-name: typescript, update-types: ["version-update:semver-major"] }
      - { dependency-name: next, update-types: ["version-update:semver-major"] }
      - { dependency-name: "@next/eslint-plugin-next", update-types: ["version-update:semver-major"] }
      - { dependency-name: pg-boss, update-types: ["version-update:semver-major"] }
    groups:
      browser-tests: { patterns: ["@playwright/test", "playwright-core", "@axe-core/playwright"] }
      anthropic-sdk: { patterns: ["@anthropic-ai/sdk"] }
      pg-boss:       { patterns: ["pg-boss"] }   # minors migrate its schema too (section 8)
      next:          { patterns: ["next", "@next/*"], update-types: [minor, patch] }
      aws-sdk:       { patterns: ["@aws-sdk/*"], update-types: [minor, patch] }
      aws-cdk:       { patterns: ["aws-cdk", "aws-cdk-lib", "constructs"], update-types: [minor, patch] }
      minor-and-patch: { update-types: [minor, patch] }
      security:      { applies-to: security-updates, patterns: ["*"] }
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly, day: monday, time: "04:30", timezone: Etc/UTC }
    open-pull-requests-limit: 2
    cooldown: { default-days: 7 }
    groups: { actions: { patterns: ["*"] } }
    # if the founder declines Q4: exclude-paths: [".github/workflows/publish-content.yml"]  (unverified for this ecosystem)
  - package-ecosystem: docker
    directories: [/apps/web, /apps/worker]
    patterns: ["*"]
    multi-ecosystem-group: container-images
    ignore: [{ dependency-name: node, update-types: ["version-update:semver-major"] }]
  - package-ecosystem: docker-compose
    directory: /
    patterns: ["*"]
    multi-ecosystem-group: container-images
    ignore: [{ dependency-name: postgres, update-types: ["version-update:semver-major"] }]
```

Notes:
- Cooldown takes `semver-*-days` for npm only; docker, docker-compose and github-actions take `default-days` only
  (options reference, cooldown table).
- `multi-ecosystem-groups` merge parameters in their own way ("require specific configuration patterns"). Check the
  how-to before merging (risk R3).
- The AWS SDK moved from 3.1152 to 3.1156 in about two weeks (`npm view @aws-sdk/client-bedrock-runtime`). Its own
  group keeps every client on one version.
- A `ci` test should parse `dependabot.yml` and assert:
  - the ignore list;
  - the group order (specific groups before `minor-and-patch`);
  - one entry per ecosystem;
  - a `docker-compose` entry whenever `docker-compose.yml` exists.

## 8. The dependency-upgrade runbook (`docs/runbooks/dependency-upgrades.md`, new)

1. **Triage.** Never merge a Dependabot PR as it stands. Read its diff, its CI and its release notes, then take the
   versions into a deliberate PR. A red Dependabot PR must mean a real incompatibility, so every duplicated version is
   derived, not copied.
2. **Next minors** (group `next`). Read the release notes and upgrade guide, and check the experimental flags in
   `next.config.ts` (the build prints `proxyClientMaxBodySize`, `serverActions`). Run e2e, the brand baselines and the
   response-header tests (ADR 0053/0055 are frozen by reconciliation-001), plus the licence check (sharp's libvips
   moves with Next). `@next/eslint-plugin-next` moves in lockstep. Next 17 (none yet; `npm view next dist-tags`) is a
   deliberate PR.
3. **Node 24 to 26 on a plan.**
   - **Preconditions:** 26 has been Active LTS (from 2026-10-28) for about a month, and the engines checked in section
     3 still hold.
   - **One PR changes:**
     - `.nvmrc` and `engines` (today `>=24`; make it `^24`, then `^26`);
     - every `setup-node`;
     - both Dockerfiles (`node:26-trixie-slim@sha256:…`);
     - `@types/node` 26;
     - the Lambda runtime.
   - **Measurements:** the capacity harness (the screening's 60-second check is sensitive to runtime changes), then a
     staging soak.
   - **Window:** before Gate 1 (2027-07-15).
   - Separately and now: `infra/lib/constructs/migration-run.ts:69` uses `lambda.Runtime.NODEJS_22_X` (Node 22 ends
     2027-04-30). Move it to 24 in the next infra PR. Track the Synthetics canary runtime
     (`uptime.ts:41 SYNTHETICS_NODEJS_PUPPETEER_13_0`) on AWS's deprecation calendar.
4. **pg-boss** (group `pg-boss`, majors ignored). **Its minors also migrate.** `pgboss.schema` is 26 at 12.0.0, 31 at
   12.20.0, 40 at 12.30.0 and 46 at 12.38.0 (`npm view pg-boss@<v> pgboss.schema`). Today:
   - the worker constructs `PgBoss` with `migrate` at its default `true` (`apps/worker/src/main.ts:93,110,129`;
     `attorney.js:414`), so the first new worker migrates mid-deploy;
   - the web runs `migrate: false` (`apps/web/src/lib/uploads/queue.ts:36`), and pg-boss's `check()` throws "pg-boss
     database requires migrations" when the versions differ in either direction (`contractor.js:255-263`);
   - so a web task started on the other side of the migration cannot enqueue, uploads included.

   **Procedure:**
   - The pre-traffic migration task (`dist/migrate.js`, ADR 0049) migrates pg-boss's schema as the queue role. Use
     `pg-boss migrate` (the CLI ships with the package) or a `new PgBoss({ migrate: true, supervise: false, schedule:
     false })` start and stop.
   - Every runtime `PgBoss` passes `migrate: false`, enforced by a test over every non-test `new PgBoss(`.
   - Check that the migration is safe with the previous image running: the old image's `check()` is strict
     equality, so its tasks that restart mid-deploy fail.
   - A rollback needs pg-boss's rollback plans (`pg-boss plans rollback`).
   - Majors also need their migration guide.
   - The code change is not a `packages/db` migration (no domain-model change). It must land before the first staging
     deploy, in the CI PR or infra PR (d) "deploy safety" (open item O2).
5. **Playwright with its baselines** (group `browser-tests`).
   - Upgrade @playwright/test, playwright-core in the worker and tools, the worker Dockerfile's install and the CI
     runner image together.
   - Regenerate and inspect the seven brand baselines, by hand, never blindly.
   - A new axe minor can promote rules (4.14 promoted Label in Name): fix the findings, never exclude the rule.
6. **TypeScript 7 when the linter supports it.** Watch typescript-eslint #10940 and its `peerDependencies.typescript`.
   Then one PR that also proves `next build`'s TypeScript step and `tsc --noEmit` on 7. Until then, TS 7 may run beside
   6 as a non-blocking fast check, as Microsoft's announcement suggests (a speed idea for #109; not required).
7. **The Anthropic SDK** (own group). Run the model evaluation gate (ADR 0051), check that no span or trace header
   carries content (0.134's OpenTelemetry), and read the 1.x migration notes.
8. **The AWS SDK and CDK** (groups). Run `pnpm cdk:diff`, and capacity for anything the screening path imports.
9. **pnpm itself.** Dependabot reads `packageManager` but never updates it (dependabot-core `package_manager.rb:296-319`
   reads it; no updater writes it). Bump it within the supported line when the toolchain check (section 9) flags an
   advisory, or monthly. On pnpm 11 and 12: GitHub's table lists pnpm v7–v10, while dependabot-core's
   `pnpm_package_manager.rb` lists up to V12. Verify before moving off 10.
10. **Base images.** Expect a weekly digest PR in `container-images`; trivy gates it. A Debian move such as trixie to
    the next release is a deliberate PR.
11. **Transitive packages.** npm version updates never touch them. Take security updates (once on), or run a
    `pnpm up -r <pkg>` lockfile refresh when the audit flags one, and do a monthly refresh.
12. **PostgreSQL major:** follows RDS (19 when RDS supports it and the founder plans it).
13. **Stored ignores.** Closing a Dependabot PR stores an ignore for that version (the #10 comment). Use
    `@dependabot show <dep> ignore conditions` and `@dependabot unignore <dep>` (github/docs
    `dependabot-pull-request-comment-commands.md`). Upgrading by hand also clears it.

## 9. pnpm audit, the licence check, supply-chain.yml and the toolchain

- **pnpm 10.28.0 itself (new, high severity).** The npm advisory bulk endpoint (`POST
  registry.npmjs.org/-/npm/v1/security/advisories/bulk {"pnpm":["10.28.0"]}`) returns **23 advisories, 11 high**. They
  are all fixed by 10.34.5, and 10.34.8 (2026-10-23) has none. Examples: "A tarball dependency's manifest `name`
  escapes node_modules → arbitrary file write on install" (<10.34.5) and "Integrity Check Bypass via Missing Lockfile
  Integrity Field" (<10.34.1).
  - The pins are `package.json:5` (`packageManager`), `apps/web/Dockerfile:11` and `apps/worker/Dockerfile:6`, plus
    the README.
  - `pnpm audit` does not cover pnpm, and Dependabot does not update it.
  - **Take pnpm 10.34.8 in the CI PR.** The Playwright scout recommends it too, for the `libc:` fields.
  - Derive the Dockerfiles' pnpm from `packageManager` (`COPY package.json` first, then `npm install -g
    "pnpm@$(node -p …)"`), so there is one pin.
  - Add a per-PR **toolchain check** that queries the bulk endpoint for the `packageManager` pnpm and fails on
    moderate or worse. It is the same network dependency `pnpm audit` already has.
- **pnpm's own supply-chain settings** (`pnpm-workspace.yaml`):
  - `trustPolicy: no-downgrade`, which fails an install when a package's trust level drops, such as a publish without
    the provenance it had before (pnpm 10.21.0, https://github.com/pnpm/pnpm/releases/tag/v10.21.0);
  - `minimumReleaseAge` in minutes (pnpm 10.16.0, https://github.com/pnpm/pnpm/releases/tag/v10.16.0), set no longer
    than Dependabot's shortest cooldown (3 days = 4320). Otherwise Dependabot's own lockfile updates fail.
  - Security fixes younger than that go through `minimumReleaseAgeExclude`, as a runbook step.
- **`pnpm audit --prod`** (`ci.yml:47`, default level low, no ignore mechanism) stays. Add:
  - `pnpm audit --audit-level=high` over every package, development included. It passes today: the highest is moderate.
  - `auditConfig.ignoreGhsas` for an advisory with no fix. Each entry carries a reason and a date, and a test fails
    once an entry is 30 days old, so an unfixable advisory is recorded instead of blocking every PR.
- **Licences.**
  - Remove the stale `@img/sharp-libvips-linuxmusl-x64` exception (`allowlist.json`) with pnpm 10.34.8.
  - `pnpm licenses list --prod` sees only packages installed for the runner's platform. That matches production, which
    is linux x86-64 glibc (`infra/lib/constructs/compute.ts:402`), so nothing more is needed.
- **supply-chain.yml.**
  - Pin its actions (section 4).
  - The images move to `node:24-trixie-slim@sha256:…`. `node:24-slim`'s digest `sha256:55fb5f5a…` equals
    `24-bookworm-slim`'s, not `24-trixie-slim`'s `sha256:43b9ba11…` (Hub API, measured). Debian 12's regular security
    support ended in 2026 and the LTS team carries it to 2028-06-30 with a reduced package set
    (https://www.debian.org/News/2026/20260712.en.html).
  - Playwright supports Debian 13 from 1.55 (search result citing the 1.55 release notes). The images and capacity jobs
    prove the move.
- **Considered and not chosen:** `actions/dependency-review-action`. It duplicates pnpm audit's advisory source, and it
  needs GitHub Advanced Security once the repository is private, which the founder may choose.

## 10. Founder questions (each recommended first)

- **Q1.** Make `claude/build-platform` the default branch until launch? Recommended: yes. Alternative: one PR into
  `main` with the new config (#27's path) plus a drift test. That gives up alerts, security updates and schedules until
  launch, and needs a ruling for every later config change.
- **Q2.** Turn on Dependabot alerts and security updates now? Recommended: yes. They are free and see the real code
  with Q1. Without Q1 they see nothing until launch and cost nothing.
- **Q3.** Turn on "Require actions to be pinned to a full-length commit SHA" after the CI PR merges? Recommended: yes.
  It gives up adding an unpinned action in a hurry.
- **Q4.** May the CI PR change only the `uses:` lines of `publish-content.yml` (SHA pins at current majors), as an
  exception to reconciliation-001's content-pipeline check? Recommended: yes. It is the one workflow with `contents:
  write` on `main`. Declining leaves it on moving `@v4` tags.

## 11. Risks and open items

**Risks**
- **R1.** `release.yml`'s upgraded actions (login v4, download-artifact v8, attest) run only on a tag, which only the
  founder creates, so a PR never exercises them. A `workflow_dispatch` dry run with pushes off would prove them (CI
  structure design).
- **R2.** Under (a), ignore rules also suppress security updates whose only fix is an ignored major. The alert still
  shows.
- **R3.** The merge rules of `multi-ecosystem-groups`, and `exclude-paths` on github-actions, are unverified. Check
  them against the how-to.
- **R4.** pnpm `minimumReleaseAge` against Dependabot security PRs for packages newer than the age. The mitigation is
  the runbook's exclude step.
- **R5.** Moving bookworm to trixie changes glibc and OpenSSL in both production images. The images, capacity and e2e
  jobs must prove it.
- **R6.** Docker Hub rate-limits anonymous pulls: a manifest HEAD returned 429 here. Digests must be resolved by the
  builder and checked in CI.

**Open items**
- **O1.** The MinIO replacement, by a bounded measurement.
- **O2.** Where the pg-boss `migrate: false` and migration-task change lands.
- **O3.** The Anthropic SDK 1.x migration notes.
- **O4.** Why Dependabot offers setup-python 6, not 7. Post `@dependabot show actions/setup-python ignore conditions`
  on a Dependabot PR, which is a comment, not a review.
- **O5.** Whether `next build` type-checks under TS 7.
- **O6.** Exact digests at build time.

## 12. Measurements and commands

| What | Command | Result |
|---|---|---|
| main's config | `git show origin/main:.github/dependabot.yml` | `target-branch` on all 3 entries |
| Security settings | `gh api repos/PureTideWater/PhysicalTherapy --jq .security_and_analysis`; `gh api …/dependabot/alerts` | security updates disabled; alerts disabled (403) |
| Rulesets | `gh api …/rulesets` | `[]` |
| #40/#38/#33 CI | `pull_request_read get_check_runs`; `gh api …/actions/jobs/<id>`; `gh api …/check-runs/<id>/annotations`; `get_job_logs` | as in section 2 |
| Action SHAs | `git ls-remote https://github.com/<action>.git refs/tags/<v>` | 9 of 9 match |
| actionlint | `actionlint .github/workflows/*.yml` (#40's files, scratch copy) | clean |
| npm versions | `npm view <pkg> dist-tags/time/engines/peerDependencies` | as cited |
| Audit | `pnpm audit --prod`; `pnpm audit --json` | prod 0; dev 2 low + 5 moderate |
| pnpm advisories | `curl -X POST …/advisories/bulk -d '{"pnpm":["10.28.0"]}'` | 23 (11 high); 10.34.5 and 10.34.8: 0 |
| axe rule tags | npm tarballs of axe-core 4.13.0 and 4.14.0, `axe.js` rule definition | `experimental` removed in 4.14 |
| Docker Hub | `curl hub.docker.com/v2/repositories/library/node/tags/<t>` (and postgres, minio) | node 24-slim = bookworm; minio missing |
| pg-boss schema | `npm view pg-boss@<v> pgboss.schema` | 26 → 46 across 12.x |

Sources (besides repository paths): https://raw.githubusercontent.com/nodejs/Release/main/schedule.json ·
https://nodejs.org/en/about/previous-releases · https://github.com/actions/checkout/blob/main/CHANGELOG.md ·
https://github.com/actions/setup-node/releases · https://github.com/pnpm/action-setup/releases ·
https://github.com/actions/setup-python/releases · https://github.com/actions/cache/releases ·
https://github.com/docker/login-action/releases · https://github.com/typescript-eslint/typescript-eslint/issues/12518 ·
https://www.aquasec.com/blog/trivy-supply-chain-attack-what-you-need-to-know ·
https://snyk.io/articles/trivy-github-actions-supply-chain-compromise/ · https://github.com/minio/minio ·
https://www.debian.org/News/2026/20260712.en.html · https://github.com/pnpm/pnpm/releases/tag/v10.16.0 ·
https://github.com/pnpm/pnpm/releases/tag/v10.21.0 ·
https://github.blog/changelog/2026-09-23-deprecation-of-node-20-on-github-actions-runners/ (via search) ·
https://glukhov.org/data-infrastructure/object-storage/self-hosted-s3-alternatives/ · github/docs at 02c25d16
(2026-10-23): `dependabot-options-reference.md`, `supported-package-managers.md`,
`dependabot-pull-request-comment-commands.md`, `contexts.md`, `workflow-dependency-lockfiles.md` · dependabot-core at
77f70df2 (2026-10-24): `github_actions/…/file_parser.rb`, `docker/…/shared_file_fetcher.rb`,
`docker/…/docker_compose/file_fetcher.rb`, `npm_and_yarn/…/pnpm_package_manager.rb`.
