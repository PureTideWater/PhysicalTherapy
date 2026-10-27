# PR #77 (ci-browser): the fix round, integrated and pushed

Branch co-001/ci-browser, worktree /home/user/ci-browser. **Pushed head: 64843249** (367a659f..64843249, 20:46:55 UTC 2026-10-27).

- **The pre-push hook** checked 13 commits: 0 files read by the fixture guard, 24 text files searched for an X12 header, and gitleaks found no secret.
- **PR #77** reads mergeable (`mergeable_state: blocked`, waiting on its checks and the review).
- **The reviews** this round answers, all on 367a659f:
  - `lane-b-ci-browser-review-ci-infra.md` (CI-1 to CI-8);
  - `lane-b-ci-browser-review-security-supply.md` (SEC-1 to SEC-7);
  - `lane-b-ci-browser-review-ux-brand.md` (UX-1 to UX-6).
- **Rulings applied:**
  - the founder's F4 and F5;
  - the co-founder's Q2 (shell.tsx and the manifests are #42 files this PR may change);
  - his ruling of 2026-10-26 ~00:20 UTC (the recommended option; for security, the safer one);
  - his ruling on the UX baseline's words ("a fix takes its section 6.1 words").

Work files are in `/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad/fix/` (the scratchpad of session 5b1bc8b7):
- `logs/`: every log, each starting with its command and UTC time;
- `failing-first.md`;
- `progress/{f1,f2,f3,integrate}.progress.md`;
- `pr77-body-fix-round.md`: the PR description redrafted for this round, for the session to apply;
- `scripts/`: the suite drivers.

## Every finding and its disposition

The session's dispositions held: every finding is fixed in this PR, with three exceptions:
- **UX-6** and **UX-094's visible "Current" mark** go to UX PR 67 (`co-001/ux-header-menus`, the same panel, after #42) as recorded proposals.
- **UX-5** is fixed on claude/build-ops.

| Finding | Disposition | Commits |
| --- | --- | --- |
| **CI-1** (blocking): `--image` read the worker image as `node`, which cannot read the mode-0600 deb.deps and rpm.deps | Fixed. Both docker reads run `--rm --pull never --user 0:0 --network none`. `browser.json` is unchanged: the root read is its 287 files, `333985b3…` | aab78544, cd65a1ed |
| **CI-2** (blocking): the baseline step dirtied the tree, so the build stamp refused it | Fixed. The step writes into an empty `E2E_BASELINES_DIR` outside the repository (`playwright.config.ts`'s snapshot path), compares the set with `git ls-files` and each file with `cmp`, and prints from that directory. Proved locally with ci.yml's own script under `E2E_PREBUILT=1` (below) | daea87c0 |
| **CI-3**: no PR ran release.yml's worker `--image` step or the matrix's merged outputs | Fixed. The dry run's build is release.yml's on its `web` and `worker` legs as a matrix. workflows.test.ts holds every step of build, push and capacity to release.yml's, with only the image list, the tag and retention cut. N16 names the tag-only steps. The integrator added the dry run's trigger on the browser check and its record | b36214aa, e922452f; seams 25ed89a4, bd7dbd1d |
| **CI-4**: the stand-ins modelled neither the image's user nor the stamp | Fixed. The stand-in docker accepts only the root, offline, local-tag read and the image-user version run, and refuses anything else. A stand-in `sha256sum` fails on one file. The stand-in pnpm refuses a dirty tree, and the tests hold the tree clean | aab78544, daea87c0, cd65a1ed, db0aa4f5, 8ed6b8e7 |
| **CI-5**: no pipefail hid `sha256sum`'s errors, so unreadable files read as "(removed)" | Fixed. `unreadable` rows (aab78544). Each stage writes a file and reports `error <tool> <status>`; `listed` rows name every file found. A build with faults fails as "could not be hashed whole", naming the tool and the files, its tree "not computed", never "(removed)" | aab78544, db0aa4f5 |
| **CI-6** (nit): the expected image versions; the apt key reads `ImageVersion` | Fixed in ci.md's Caches section and ADR 0066 V3, with run 40534270846's example (Set up job 20261012.163.1, `ImageVersion` 20261023.163.3). The PR description's "20261026.180.1 or later" is redrafted in `pr77-body-fix-round.md` with the observed versions and no "or later": **the session applies it** | 61742c0a; PR description |
| **CI-7** (nit): apt-archives.sh's apt-cache comment | Fixed. As an improvement, the stand-in apt-cache now answers as the real one does (exit 0 with no record; exit 100 for an unknown package) | 80887a4c, 58884ed7 |
| **CI-8** (nit): the 31 reds include 2 node_modules readers | Fixed in the redrafted description ("31 red, 29 of them behaviour reds", the two named): **the session applies it** | PR description |
| **SEC-1** (blocking) | Fixed with CI-1. No file excluded, no chmod, no record change | aab78544 |
| **SEC-2** (blocking): the fix must not relax build-stamp | Fixed with CI-2. `apps/web/scripts/build-stamp.ts` is untouched (`git diff 367a659f HEAD -- apps/web/scripts/` is empty), and the step leaves the tracked tree clean | daea87c0 |
| **SEC-3**: an added unreadable file passed | Fixed with CI-5 | aab78544, db0aa4f5 |
| **SEC-4**: `--version` never gated | Fixed. The check fails unless `--version` exits 0 printing exactly `Google Chrome for Testing <browserVersion>`, in both modes. With `--image` the version run is `docker run --rm --pull never --network none` with no `--user` (the image's own user). It runs only once every file equals the record (deviation below). The doc comment says modes and system libraries are not hashed | 8ed6b8e7, 20f2fa96 (N22) |
| **SEC-5** (nit): pax `size` ignored; unbounded metadata in memory | Fixed. The size comes from a pax record (refused when not decimal). A pax, global-pax or GNU long-name entry over 1 MiB is refused before it is read; 64 MiB kept in all; only JSON documents' bytes kept; a non-JSON manifest or index is an `ImageArchiveError` | 15e39041, 4ddc9aca |
| **SEC-6** (nit): the probe comment's reason | Fixed: "not release.yml's attested run (the runner-image refusal lands after #42; docs/adr/0066, Part 3)" | 139a57c3 |
| **SEC-7** (nit): network and pull policy | Fixed with CI-1 (`--network none --pull never`). The shell also never runs before its bytes are proven | aab78544, cd65a1ed, 8ed6b8e7 |
| **UX-1** (blocking): not UX-094's words | Fixed in section 6.1's words. The switcher reads `{name}<span class="sr-only">, switch practice</span>` inside the name's span. The address span is `sr-only md:not-sr-only md:relative md:max-w-[12rem] md:truncate` with `, account and sign out` hidden. Neither has an `aria-label` or a summary `title`; both carry `data-slot`. brand.spec.ts and sign-in.spec.ts reach them by slot. **"Current" goes to UX PR 67** | 9fbc958b, 556ef507 |
| **UX-2**: Chromium read the practice and address twice | Fixed with UX-1. The journey reads Chromium's own name and description through CDP at 1280 and 390: name `^<shown> ?, <purpose>$`, description empty | 9fbc958b |
| **UX-3** (nit): a one-letter piece matched anywhere | Fixed. The first visible piece is anchored with `^`, the others contained. The selector adds `[role="button"]`, input and select. Visually hidden text is left out of "visible". CI-19's matrix text follows ("starts with its visible text and contains every other piece of it"), with `fixtures/synthetic/CI-19/expected.json` regenerated by `pnpm synth --all` | 91f946f0; cc2987f6 |
| **UX-4** (nit): "antialiasing" | Fixed in ADR 0058: Chrome 156 draws the title 1 px lower (1,611 px in 234 x 27 at 83, 418; shifted 1 px, 0 differ; nothing else moves; re-checked with PIL, `f3-ux4-cover-shift.log`). The PR description's two sentences are redrafted: **the session applies it** | 90b625a8; PR description |
| **UX-5**: the screen tour's account selector breaks after the merge | Fixed on claude/build-ops, **uncommitted in /home/user/ops for the session to commit**: `tools/lane-b-screen-tour/capture/tour.spec.ts` (+11/-1) and `designs/lane-b-ux-review/route-map.json` (5 entries changed, 1 added). ACCOUNT clicks `header [data-slot="account-menu"]` or the old label, then waits for Sign out. A new SWITCHER clicks the switcher, then waits for the Practices list. A new capture is `p.settings` `interaction:practice-switcher`. The integrator checked the selectors against the merged markup: the header is `<header data-slot="app-header">`, Sign out is a submit button, the list is `ul[aria-label="Practices"]` | ops working tree |
| **UX-6**: below 640 px the switcher's open list runs off the left edge (pre-existing) | **Moved to UX PR 67** as the review's proposal: `fixed inset-x-4 top-14 w-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:w-72`, plus a 390 px assertion that the open panel lies within the window, with a new baseline entry. #77 does not touch the panel | none here |

## Commits on 367a659f (31)

**The fix round's two first fixes** (before the fixers):
- aab78544 ci: browser-build.ts `--image` reads the image as root with no network, and names a file it cannot read
- daea87c0 ci: the baseline step regenerates into an empty directory outside the repository

**F1, the browser check** (branch co-001/ci-browser-f1, merged as 744f8c00):
- cd65a1ed `--pull never`
- db0aa4f5 named hash-run faults
- 8ed6b8e7 the `--version` gate
- 20f2fa96 ci.md, ADR 0058, ADR 0066 N22
- d9307c8b a test comment

**F2, the dry run, the archive reader and texts** (merged as e6e73989):
- 139a57c3 SEC-6
- 80887a4c CI-7
- 58884ed7 the apt-cache stand-in
- 61742c0a CI-6
- 15e39041 SEC-5
- 4ddc9aca SEC-5's ADR text
- b36214aa CI-3
- e922452f CI-3's documents

**F3, the header's names** (merged as 245efb76):
- 9fbc958b UX-1 and UX-2
- 90b625a8 UX-4
- 91f946f0 UX-3
- 556ef507 ADR names

**Integrator:**
- 25ed89a4 docs (seam): the dry run's build is counted among the `--image` jobs in ci.md, ADR 0058 and ADR 0066
- c7d5fa3f docs (improvement): ci.md's cache-clearing line goes back to the paragraph on every cache; phase 1 had left it under the apt cache, naming tsc's key
- cc2987f6 test matrix (improvement): CI-19 says "starts with"; CI-19/expected.json comes from `pnpm synth --all`
- bd7dbd1d ci (seam): the dry run also triggers on `tools/ci/browser-build.ts`, `apps/web/e2e/browser.json` and `apps/web/e2e/browser-builds/*`, as `image-id.ts` already did, since its worker leg now runs that check as release.yml does. workflows.test.ts, ADR 0066 Part 2 and N16, and ci.md follow
- 0d5f3bc2 merge of claude/build-platform 085299bd (#76; deviation below)
- 64843249 test (seam): the baseline test's `git` is bounded by #76's 30 s and killed after

**From claude/build-platform by that merge:**
- 0577b73f and b02435c5 (#76's tests)
- 085299bd (#76's merge)

## Checks (all at 64843249, each heavy one under `flock /tmp/laneb-heavy.lock`, Node 24.22.0, pnpm 10.34.8)

| Check | Result | Log |
| --- | --- | --- |
| `pnpm synth --all` | 0 written, 631 unchanged, 0 removed; EMR formats 16 unchanged. The one file this round generated, `fixtures/synthetic/CI-19/expected.json`, was written at cc2987f6 (`i-synth-all.log`: 1 written, 630 unchanged) | i-synth-all-final.log |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | no-op (533 lines, tree clean) | i-watched-write.log |
| `pnpm typecheck` | passed, 22 projects | i-typecheck.log |
| `pnpm lint` | passed, 1,620 files in 3 groups, 0 errors, 0 warnings | i-lint.log |
| `pnpm lint:logs` | 1,057 files, every log call allowlisted | i-lint-logs.log |
| `pnpm verify-content` | every content set passes | i-verify-content.log |
| vitest subset (tools/test, tools/ci, tools/screening-capacity, packages/synth) | **718 passed**, 0 failed, 46 files. 705 at 367a659f; +13: browser-build.test.ts 20 → 29 (+9), image-id.test.ts 6 → 10 (+4). workflows.test.ts 114 → 114 and apt-archives.test.ts 5 → 5 | i-subset-vitest.log, i-subset.json |
| `pnpm test` (unit + coverage) | **6,349 passed, 0 failed, 4 skipped (6,353)**, 382 files. The local skips are the usual 3 engine-freeze cases (no `ENGINE_FREEZE_BASE`) and 1 rules case (root). Against CI's 6,339 + 1 at 367a659f, **CI should show 6,352 passed + 1 skipped**. The +13 are the subset's two files; #76 adds no test (no test declaration added in its six files, and the full total moved by exactly the subset's 13) | i-pnpm-test.log, i-pnpm-test.json |
| `pnpm test:golden` | 376 passed | i-golden.log |
| `pnpm synth --large`, `pnpm test:oracle` | pyx12 4.0.0 agrees with all 687 synthetic 835s (676 valid with identical summaries, 11 rejected as expected); packages/edi835 agrees on every one | i-oracle.log |
| `pnpm test:db`, shards 1/4 to 4/4 one after another, PostgreSQL 18.4 on 5433, after `pnpm db:migrate` | 3,151 + 1 skipped; 2,615; 2,534; 922. **9,222 passed, 1 skipped**, 127 files, each in one shard. The skip is the restore drill's pg_dump run: "pg_dump 16 cannot dump a PostgreSQL 18 server" (no PostgreSQL 18 client tools here). CI's 26.04 runs it: **9,223 and 0**, its shard split the same as run 40534270846's (3,152 / 2,615 / 2,534 / 922) | i-db-shard-{1..4}.log, i-db-{1..4}.json |
| `pnpm build`; `pnpm --filter @tp/web exec tsx scripts/build-stamp.ts --write $(git rev-parse HEAD)` | built; stamped 64843249 | i-build.log, i-build-stamp.log |
| `E2E_PREBUILT=1 pnpm test:e2e --workers=2` (tp_laneb_cib_int_e2e on 5433, E2E_PORT 3173) | **54 passed** (9.3 min) | i-e2e.log |
| ci.yml's baseline step: its own script, extracted with the repository's yaml package (`cd tools && node -e …`) and run as GitHub runs a bash step, with `RUNNER_TEMP` a scratch directory, `E2E_PREBUILT=1` and the same database variables | **exit 0**. The brand journey 4 passed; seven written from nothing, each equal to its committed file (`7ddf673c…`, `04be07d1…`, `4b3a7781…`, `e5e0370e…`, `0517b2a1…`, `3ece4f0b…`, `e982852d…`); tree clean before and after | i-baseline-step.log |
| actionlint 1.7.7 `-shellcheck= -pyflakes= -ignore 'label "ubuntu-26\.04" is unknown'` over every workflow | exit 0 | i-actionlint.log |
| `BASE=origin/claude/build-platform pnpm actions:check` | every action pinned to its release's commit | i-actions-check.log |
| `BASE=origin/claude/build-platform pnpm toolchain:check` (networked) | passed, 0 errors, 0 warnings: 5 added versions, each at least three days old, with registry integrity and no weaker trust evidence; 1 trust exclude, 1 override unchanged | i-toolchain-check.log |
| `node tools/ci/browser-build.ts` (local 1248 from Google's zips) | exit 0. Headless shell: 287 files, `333985b3…`. Chromium: 301 files, `2f991090…`. Both print `Google Chrome for Testing 156.0.8078.4`, each equal to browser.json in every file | i-browser-build.log |
| Mutation: `tools/stryker/affected.ts --event pull_request --base 085299bd` | every shard affected (all four packages through global inputs: `mutation.yml`, `pnpm-workspace.yaml`, `watched.ts`; pricing also through `tools/package.json`). **CI runs all seven**, as it did green on 367a659f | i-mutation-affected.log |
| Mutation, money-ledger shard and the gate (as ci-deps' round ran it) | Canary 5 of 5 on Node 24.22.0. Money 96.58% (226 of 234; the 8 undetected all recorded equivalents). Ledger 98.48% (2,018 of 2,049; the 31 undetected all recorded equivalents). Gate passed (pricing, packets: not affected locally) | i-mutation-*.log |
| Cleanup | tp_laneb_cib_int_e2e dropped (only postgres, template0 and template1 remain). Its `/tmp/tp-e2e-tp_laneb_cib_int_e2e-*` directories and the integrator's scratch trees are removed | i-e2e-drop-database.log |

The fixers' own final checks (in their worktrees, before the merge):
- **F1:** tools vitest 331 of 331, typecheck, lint, browser-build exit 0.
- **F2:** tools subset 525 of 525, actionlint 0, typecheck, lint.
- **F3:** brand and sign-in 10 passed, the 14 `expectAccessible` specs 29 passed on axe 4.14.0, typecheck, lint, lint:copy 514 files. The baselines were regenerated from nothing at 91f946f0: 7 written, byte-equal.

## Failing first

The full table is in `scratchpad/fix/failing-first.md`.

| Finding | Red on the old code | Green on the new |
| --- | --- | --- |
| CI-1/SEC-1 | 367a659f's browser-build.ts copied aside: 5 failed of 21 (`phase2/logs/fix-image-root-red-at-367a659-impl.log`) | 21 of 21; 29 of 29 at the head |
| CI-2/SEC-2, CI-4 (workflows) | CI_TREE=367a659f: 3 failed (the three baseline-step tests; `phase2/logs/fix-baselines-red-at-367a659.log`) | at the head, all three passed by name (`i-subset.json`); the real step exit 0 (`i-baseline-step.log`) |
| CI-1/SEC-7 `--pull never`, CI-4 (docker) | daea87c0's copy: 4 failed (`f1-1-pull-never-red.log`) | 21 of 21 |
| CI-5/SEC-3, CI-4 (`sha256sum`) | cd65a1ed's copy: 1 failed, the file named "(removed)" (`f1-2-hash-run-red.log`) | 22 of 22 |
| SEC-4 | db0aa4f5's copy: 7 failed on assertions (`f1-3-version-red.log`) | 29 of 29 |
| F1 as a whole | daea87c0's copy: 12 failed, 17 passed (`f1-final-all-vs-daea87c0.log`) | 29 of 29 |
| SEC-5 | daea87c0's image-id.ts: 4 failed of 31 (`f2-sec5-red.log`) | 31 of 31 |
| CI-3 | CI_TREE=daea87c0: 7 failed of 114 (`f2-ci3-red.log`); deliberate breaks give 1 and 3 red (`f2-ci3-breaks.log`) | 114 of 114 |
| UX-1/UX-2 | daea87c0's naming, real build: exactly 4 soft failures, Chromium's "…, practice switcher" and "…, account menu" with descriptions repeating the practice or address (`f3-ux1-red.log`) | 10 passed |
| UX-3 | old check vs new on the regression variant, real build: at 390 the old check misses (0 failures), the new one fails ("must start with … "m"", received "Account menu") (`f3-ux3-probe-on-regression.log`) | 11 passed, 0 failures either check |
| Dry-run trigger (integrator) | CI_TREE=cc2987f6: 1 failed (`i-dry-paths-red.log`) | 1 passed |
| SEC-6, CI-6, CI-7, CI-8, UX-4, UX-5, the documents, cc2987f6, 64843249 | no behaviour (comments, documents, wording, ops tooling, a test's child bounded) | n/a |

## Scope (log `i-scope-check.log`, `i-merge-tree-pr42.log`)

- **Protected paths:** `git diff --name-only e908c214 HEAD` over packages/pricing, packages/ledger, packages/db/migrations, content, tools/verify-content, docs/product/domain-model.md and packages/db/domain-model is empty; the same from 367a659f is empty too. No migration is added.
- **#42's files** (read 19:57 UTC, pages 1 to 3, 188 files; #42 draft, open, head 098636e3, base e908c214): this branch changes the same 10 of them against e908c21 as in phase 2, each allowed:
  - `apps/web/package.json`: Q2, rule 6
  - `apps/worker/package.json`: disjoint lines, rule 6
  - `pnpm-lock.yaml`: re-resolved, Q2
  - `apps/web/src/components/shell.tsx`: Q2; this round's hunks are the switcher and the account, and #42's are in the rail
  - `tools/screening-capacity/watched-paths.txt`: generated
  - ADR 0062, `docs/product/reconciliation-001.md`, `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts`: the rule-6 shared documents
- **This round's own changes to #42's files:** shell.tsx, test-matrix.md (CI-19, line 279; #42's hunks are at 176 to 212) and matrix.ts (line 419; #42's at 217 and 325). #76's six files are not #42's.
- **`git merge-tree` with #42's head 098636e3:** only ADR 0062 conflicts, the known sure conflict at the end of the file, where both amendments are kept in merge order. shell.tsx and the rest auto-merge.
- **LANES.md:84-92:** `tools/screening-capacity/{run,report}.ts`, `report.test.ts`, `test-support/measurements.ts` and `apps/web/e2e/screening.spec.ts` are untouched. Of the list, only shell.tsx changes (Q2).

## Deviations (each the recommended option, recorded with its reason)

1. **Merged claude/build-platform (085299bd, #76).** It merged at 19:12 UTC, after this task was computed. It conflicts with this branch in `tools/test/workflows.test.ts` (the actionlint call: #76's 30 s bound against this branch's `-ignore`). A pull request with a conflict runs no `pull_request` workflow, so a push without the merge would have given no CI at all.
   - Merged with a merge commit, keeping both (rule 6).
   - #76's bound now also covers this branch's baseline-test `git` (64843249).
   - The full suite ran on the merged head that CI tests.
2. **F1: the binary runs only once its bytes equal the record** (SEC-7's concern about running unverified code; the safer option). A build that differs no longer prints its own `--version`; its version still comes from browsers.json in the mismatch message. If the two conditions ever drift apart, a test makes the check fail closed.
3. **F3: `relative` and `md:relative` added to the review's classes.** Without them the hidden words widened the page: 431 px at 390, 785 px with a long name, 1,577 px at 1280 with a long email. With them the page stays 390 and the pixels are unchanged.
   - Chromium names the controls "NAME , switch practice", with a space, because the hidden words are an element of their own; the check accepts ` ?,`.
   - UX-3's 390 px proof used a temporary spec, since axe stops the full journey at 1280 on the regression variant.
4. **The integrator added the dry run's trigger on the browser check and its record** (bd7dbd1d), beyond F2's "images covers it". `image-id.ts`, also run by `images` on every PR, already triggers the dry run, and the dry run now runs browser-build.ts on 24.04's classic store with release.yml's ghcr-form tag. The precedent is screening-capacity's paths, which carry the same files.

## Improvements inside the PR's files (named for the PR description)

**F1:**
- `--pull never` on the docker reads;
- the version failure's four endings (another version, an exit status, a signal, could not be started);
- `find`'s and `sort`'s failures as rows of their own;
- stand-in binaries driven by the environment.

**F2:** the stand-in apt-cache answers as the real one does.

**F3:**
- the CDP read of Chromium's own name and description;
- failure messages that quote the visible text.

**Integrator:**
- ci.md's cache-clearing line;
- CI-19's text;
- the dry run's trigger;
- the git bound.

## What CI must show next (run of 64843249, the PR merged with claude/build-platform 085299bd)

- **`all green`**, with these jobs:
  - `images` (26.04, containerd store): the worker check passes with `--image tp-worker:scan`, read as root, offline, local tag only. It prints "Google Chrome for Testing 156.0.8078.4" run as the image's user (`node`). This is the first real proof of the version gate and of `--pull never` on a real daemon, neither of which ran here (no Docker daemon).
  - **e2e (1/2)'s baseline step:** writes the seven from nothing into `$RUNNER_TEMP/baselines` on ubuntu-26.04, with the SHA-256s above, and exits 0. This is ADR 0058's host-independence proof (local Ubuntu 24.04 against CI's 26.04). If any picture differs, the step prints it in chunks; CI's bytes are committed and the difference recorded in ADR 0058.
  - The brand journey's CDP names "<practice> , switch practice" and "<email> , account and sign out", with empty descriptions, on CI's 1248.
- **Counts:**
  - unit **6,352 passed, 1 skipped** (6,353);
  - db **9,223 passed, 0 skipped** in 3,152 / 2,615 / 2,534 / 922;
  - e2e **54** (27 + 27);
  - golden **376**.
- **`screening-capacity gate`:** `capacity` on 24.04 (classic store) passes the worker `--image` check and the version gate. Its paths include browser-build.ts, so it measures on this PR.
- **release-dry-run** (it runs: its workflow, browser-build.ts and image-id.ts changed):
  - `build` on both legs, `web` and `worker`, the worker's `--image` check passing on 24.04's classic store;
  - six outputs merged (`sha256_`, `config_`, `target_` for each leg);
  - `push` and `capacity` check both archives' SHA-256 and load each with `.Id` equal to its config digest.
- **`mutation`:** all seven shards on 26.04, each green, and the gate.
- **`approval-of-record`:** as before.
- **The runner images, recorded as observed:** a 26.04 image for every moved job, 24.04 for the chain, with no "or later". The apt key's `ImageVersion` may differ from "Set up job" (CI-6).
- **After green, recommended (design 3.3.7):** dispatch release-capacity once on the PR head (`gh workflow run release-capacity.yml --ref co-001/ci-browser`), since no PR run covers its job on 26.04 or its `--image` step with the version gate.

## For the session

1. **Apply the PR description** from `scratchpad/fix/pr77-body-fix-round.md` with the MCP `update_pull_request` (lane-b's rule), then read it back. It carries:
   - UX-4's wording;
   - CI-6's observed versions with no "or later";
   - CI-8's 29 + 2;
   - the new names;
   - the reviewer-findings table;
   - the fix round's failing-first and checks;
   - the deviations;
   - the #76 merge.
2. **Commit UX-5 on claude/build-ops:** /home/user/ops holds F3's uncommitted `tools/lane-b-screen-tour/capture/tour.spec.ts` and `designs/lane-b-ux-review/route-map.json`. The tour itself was not run; the selectors match the merged markup and the pre-#77 labels.
3. **Records on claude/build-ops, outside this worktree:**
   - **Design `designs/lane-b-ci.md`, a "(fix round)" edit:**
     - §3.3.1 (:1778-1786) still gives the old words and says getByLabel matches;
     - §3.3.1 still says the check "prints `chrome-headless-shell --version`" (it now gates on it, run only once the bytes are proven);
     - §3.5's CI-19 text now reads "starts with its visible text and contains every other piece of it";
     - the dry run's paths (bd7dbd1d) and its [web, worker] matrix.
   - **The UX baseline `designs/lane-b-ux-review.md`:** mark UX-094 closed by #77 except the "Current" mark, and record UX-6 and "Current" as UX PR 67's proposals.
4. **Decide nothing on N21/N22:** both notices stand in order (N21 is aab78544's fix, N22 this round's), with no clash. F2 rewrote N16 in place, and no other notice number was used.
5. **Leftover temporary directories:** the test runs leave `/tmp/cdk.out*` (20:02 to 20:06), `/tmp/tp-agreements-5fc5dd87…` and `/tmp/tp-compliance-export-9b35326f…` from this run's unit and db tests. The sweep that would remove them was refused, since other agents share /tmp, so they remain; removing them is the session's call.
6. **Notes carried from the fixers:**
   - 15e39041's subject prefix should have been "screening-capacity:"; it is not amended, by the rules.
   - The dry run's build comment still says "About 6 minutes", with the worker leg not yet timed; read it from this CI run.
   - Runner mode's EACCES on an unreadable file still aborts as "could not be checked … <path>". That fails closed and names the file, but it is not a named fault; no portable test is possible.
   - ci.yml's runner-image step comment could also say `ImageVersion` can differ from "Set up job".
7. **The three fixer worktrees are removed** (/home/user/ci-browser-f1, -f2, -f3). Their local branches co-001/ci-browser-f1, -f2 and -f3 are kept.
