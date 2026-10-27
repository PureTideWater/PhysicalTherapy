# Scout: files and code, ci-browser after the base merge (2ab2b15), 2026-10-27

Read whole: design §3.3 (`/home/user/ops/designs/lane-b-ci.md:1671-2727`) and the phase-1 summary
(`/home/user/ops/approval-summaries/lane-b-ci-browser-build-summary.md`). Every cite is at 2ab2b15 unless marked "@8b38f48".
merge-base(8b38f48, e908c21) is 123b8fa5 (ci-deps' commit that phase 1 was cut from). File lists:
`scratchpad/reread2/{cb-files,base-files}.txt` (ci-browser's 47 files, base's 1,267 since 123b8fa).

## 1. What the base merge changed in ci-browser's files

`git diff --stat 8b38f48 2ab2b15 -- <3.3.2's files + phase 1's>`: 26 files. Twelve are changed on both sides
(`comm` of the two lists): release-dry-run.yml, release.yml, ADR 0066, reconciliation-001, test-matrix, ci.md,
matrix.ts, registry.ts, containers.ts, watched-paths.txt, no-duplicated-versions.test.ts, workflows.test.ts. The merge
was clean in all of them.

**Unchanged by the base (every phase-1 cite holds):** `ci.yml`, `large-zip.yml`, `screening-capacity.yml`, `mutation.yml`,
`publish-content.yml` and its frozen copy, `apps/worker/Dockerfile`, `apps/worker/package.json`, `shell.tsx`,
`brand.spec.ts` and its seven PNGs, `browser.json`, `browser-builds/*`, `tools/ci/*`, `sign-in.spec.ts`, `a11y.ts`,
`playwright.config.ts`, `launch-check.ts`, `run.ts`, `report.ts`, `image-id.ts`, `watched.ts`, `restore-drill.db.test.ts`,
ADR 0058, ADR 0062, ADR 0063, `screening-capacity.md`, `dependency-upgrades.md` (`git diff --stat` empty for each).

**Changed by the base, with what 3.3 depends on:**

| File | What the base changed | Effect on 3.3 / phase 2 |
|---|---|---|
| `release.yml:342`, `release-dry-run.yml:175` | `docker/login-action` v3.7.0 (c94ce9fb) → **v4.7.0** (`81c6f93d…`), identical in both | None: a JS action, not repository code, so the push jobs' no-repository-code rule holds; the dry-run equality rule passes (unit run green on it). Clears `check-action-pins`' node20 warning that phase 1 recorded |
| `release-dry-run.yml` | Nothing else. Its `capacity` job already existed at 8b38f48 (`:219`; timeouts table `workflows.test.ts:2369` `{ build: 20, push: 10, capacity: 15 }`) | 3.3's "7 jobs stay / 25 jobs / 18 move" is stale; phase 1's 8 (`RELEASE_CHAIN`, `workflows.test.ts:210`) is right for 8b38f48 |
| BuildKit pins | Unchanged value `moby/buildkit:v0.34.1@sha256:99368f3e…` on **five** setup-buildx steps now: `ci.yml:665`, `release.yml:79`, `release-dry-run.yml:70`, `screening-capacity.yml:164`, **`release-capacity.yml:54`** (new); test `workflows.test.ts:2550` lists the five files | None for ci-browser |
| `apps/web/package.json` | `next` ^16.4.1 → **^16.4.3** (`:39`), `postcss` ^8.5.30 → **^8.5.31** (`:53`); `:47-48` (axe 4.13.0, @playwright/test 1.56.1) unmoved | next 16.4.3 keeps the optional peer `@playwright/test ^1.51.1` (`pnpm-lock.yaml:3323`), so 1.64.1 holds; the importer snapshot `next@16.4.3(…)(@playwright/test@1.56.1)…` (`:6297`, `:6317`, importer `:190`) re-resolves with the bump |
| `package.json` (root) | `@types/node`, `@vitest/coverage-v8`, `eslint`, `fast-check`, `tsx`, `typescript`, `typescript-eslint`, `vitest` → `catalog:`; `@next/eslint-plugin-next` ^16.4.3 | Root has no Playwright entry; nothing to do |
| `tools/package.json` | eslint, typescript-eslint → `catalog:`; new export `./content-calendar`; **`playwright-core` `"1.56.1"` moves `:33` → `:34`** | 3.3.1/3.3.2 cite `:33`; phase 2 edits `:34` |
| `pnpm-workspace.yaml` | catalog gains `@vitest/coverage-v8 ^5.0.5`, `eslint ^10.13.0`, `typescript-eslint ^8.72.0`, `vitest ^5.0.5`; new `overrides: typed-rest-client>qs: 6.16.1`; `trustPolicyExclude: [semver@6.3.1]`; `minimumReleaseAge: 4320`, `minimumReleaseAgeExclude: []`, `trustPolicy: no-downgrade` | The catalog line `playwright-core: 1.64.1` goes in alphabetical order between `pg` and `react` (catalog keys are sorted). 3.3's "no `trustPolicyExclude` … is added" still true for Playwright/axe; the file now has one exclude of its own (semver) |
| `pnpm-lock.yaml` | ci-deps' phase-2 bumps (vitest 5.0.5, eslint 10.13.0, typescript-eslint 8.72.0, next 16.4.3, postcss 8.5.31), qs override map, rolldown 1.2.15 family; **no Playwright, axe or fsevents entry changed** | Cites moved: `axe-core@4.13.0` `:2490`(@6ddd587)/`:2525`(@8b38f48) → **`:2537`, `:5673`** (importer ref `:4239`); `fsevents@2.3.2` `:2877, :5946, :6376` → **`:2924, :6001, :6431`**; `playwright@1.56.1` `:6427`, `playwright-core@1.56.1` `:3452/:6425`, `@playwright/test@1.56.1` `:2055/:5197`. `@vitest/browser-playwright` appears only as vitest's optional peer (`:3834`, `:3850`), not installed |
| `tools/check-toolchain/*` | effb2956 (real-tree overrides test), 645263cc (qs override + `overrides.json`) | Rules the bump must pass: release age (`check.ts:635` lockfileRule over added packages, 4,320 min), trust no-downgrade (`:705` lockfileTrustRule, `:744`), tarball host registry.npmjs.org over https (`:558`, `:576` lockfileResolutionRule), integrity (`:676`), overrides each with an entry and a live target (`:786`), audit exceptions (`:416`, `audit-exceptions.json` empty), Dockerfile pnpm only through install-pnpm.sh (`:387`; the worker Dockerfile `:13-14` complies). 1.64.1 (2026-10-14) and 4.14.0 (2026-10-15) are past the age; trust and hosts **not verified here** (networked `pnpm toolchain:check`; [SV] scored trust on 2026-10-26) |
| `tools/test/no-duplicated-versions.test.ts` | New test (`:124-139`) "names each catalog package as "catalog:" in every workspace manifest's dependencies and devDependencies", root included, manifests from `pnpm-workspace.yaml`'s `packages` (`:52-62`) | **The catalog rule now lives here.** Once `playwright-core` is a catalog key, every manifest naming it (only `apps/worker/package.json:53` and `tools/package.json:34`, by grep) must say `catalog:`. Phase 1's Playwright header lines move `:15,18` → `:16,19`, its test `:103` → `:118` |
| `tools/test/workflows.test.ts` | +205 lines: a describe for content-calendar and release-capacity (`:1037-1234`), timeouts for both (`:2362`, `:2373`), the pin test reads both (`:1955`), buildx list gains release-capacity (`:2550`) | `RELEASE_CHAIN` `:209`→`:210`, the 18-count `:428`→`:429`; the runner rule now fails (§5). Release-capacity's test uses `toMatchObject({ file, load: true, push: false, tags })` (`:1191`), so adding inputs to that step later keeps it green |
| `tools/screening-capacity/containers.ts` | `ServiceName` gains `'worker'` (`:81`), `SERVICE_COMMANDS.worker` (`:102`) for release-capacity | Phase 1's functions move +4: `proveLoadedImage` doc `:334`→`:338`, `workerPlaywrightVersion` `:657`→`:661`, `processImagesProblems` `:667`→`:671`. `tools/release-capacity/run.ts:20, :359` imports `processImagesProblems` (its local ProcessRuntime path), so the copy wording of 3.3 reaches a second caller |
| `tools/screening-capacity/watched-paths.txt` | +17 lines (patient-share, payment.ts, model-gateway floors, packets explain/*, synth eval) | Regenerated, not hand-edited; phase 1's `tools/ci/*` and `browser-builds/*` lines kept. `watched.test.ts` green on the merged tree |
| `docs/runbooks/ci.md` | New table of content-calendar and release-capacity jobs (`:47-55`), domain-model triage text, private-repo budget for release-capacity (`:213-216`: "until its label changes with screening-capacity's") | `## Caches` `:195`→`:222`, `## Upgrading the browser` `:231`→`:258`; runner paragraph `:36-40` unmoved but now incomplete (below) |
| ADR 0066 | Part 2 text: login v4.7.0 pinned (`:340-342`), release-capacity's read-only `cache-from` (`:399-401`), five setup-buildx steps (`:444`), rolldown/oxc moves (`:501-503`), eight root literals (`:513-515`) | Part 3 `:708`→`:715`; "The other eighteen jobs move" `:746`→`:753` |
| reconciliation-001 | +26 lines above ci-browser's anchors | F5 entry `:626`→`:646`; capacity line `:549`→`:569`; Q2 shell/harness note `:631`→`:651` |
| test-matrix, matrix.ts, registry.ts | PRC-25..28, CAS-30..39, LED-14..18, MOD-07..11, BIL-05/06, DBF-01..05, **RCC-01..08** | CI-18 row `:248`→`:278`, series note `:225`→`:255`; matrix.ts CI-18 `:321`→`:418`; registry CI-18 `:484`→`:615`. RCC-07 (`matrix.ts:432`) is the weekly real-size test's row |

## 2. The base's two new workflows (#49, under ci-deps' rules)

**`content-calendar.yml`** (no Docker, no browser, no image, no measurement):
- `check` (`:42-60`, `ubuntu-24.04` at `:43`, 15 min): checkout (no credentials), pnpm action-setup, setup-node 24 with
  `cache: pnpm`, `pnpm install --frozen-lockfile`, `tsx tools/content-calendar/index.ts` → findings as a job output.
- `notify` (`:65-…`, `ubuntu-24.04` at `:68`, 5 min, `issues: write`): shell + `gh` only, no checkout.

**`release-capacity.yml`** (weekly Tue 03:29 UTC and dispatch; advisory, not a required check, `workflows.test.ts:1231-1233`):
- `capacity` (`:29-106`, `ubuntu-24.04` at `:36`, 180 min): checkout; setup-buildx with the BuildKit digest (`:52-54`);
  **builds the worker image** from `apps/worker/Dockerfile` with `load: true`, `push: false`, tag `tp-worker:capacity`,
  `cache-from: type=gha,scope=screening-capacity-worker`, no `provenance`/`sbom` inputs (`:60-68`); setup-node 24
  `cache: pnpm`; `pnpm install`; builds SYNTHETIC release 900110 outside the repo (`:77-80`); then
  `tools/release-capacity/run.ts --worker-image tp-worker:capacity` under `taskset` on the harness CPUs (`:84-92`),
  which runs the production worker image at the worker task's limits (0.5 vCPU, 1,024 MiB, no swap) against Postgres at
  db.t4g.medium's limits and **fails** on OOM, restart, `memory.peak` above 90%, a count mismatch or a read outside the
  keyed fetch (`:3-13`). The audit report it prints during the run is a PDF from the worker image's headless shell.
  It installs **no Chromium on the runner** (no `CHROMIUM_INSTALL`; install steps are only `ci.yml:236, :348, :547`,
  `large-zip.yml:62`, `release.yml:280`, `screening-capacity.yml:251`); it reads **no `.Id`** and no identity
  (`grep` of `tools/release-capacity/*.ts`: only `DockerRuntime`, `processImagesProblems`); its report is not a launch-check input.
- `notify` (`:111-146`, `ubuntu-24.04` at `:114`, 5 min, `issues: write`): no checkout, shell + `gh`.

**Runners under F5's letter** ("the release's capacity chain stays on ubuntu-24.04 (named jobs) … every other job moves
to ubuntu-26.04"): all four would move, since none is named. F5 was ruled on 2026-10-25, before #49 created these files,
so its list could not name them.

**Recommendation (the 00:20 ruling: recommended option, safer for security):**
- `content-calendar.yml` `check` and `notify`, and `release-capacity.yml` `notify` → **`ubuntu-26.04`**. They read files
  and call `gh`. Nothing about them depends on the host.
- `release-capacity.yml` `capacity` → **stays on `RELEASE_RUNNER.label` (`ubuntu-24.04`)**, named in the exact set:
  `RELEASE_CHAIN` gains `'release-capacity.yml capacity'` (9 jobs), and the count of moved jobs becomes **21**
  (`workflows.test.ts:429` `toHaveLength(18)` → 21; 30 jobs in all by `grep -n runs-on`). Reasons:
  1. F5's reasoning is about the measured host. The 24.04 chain stays put until one advisory 26.04 probe's numbers
     decide the move (ADR 0066 `:753-757`; reconciliation-001 `:646`). The weekly test measures memory and pass/fail
     against task limits with the same harness (`containers.ts` `DockerRuntime`, cpu layout from `limits.ts`) on the same
     4-CPU free runner as `screening-capacity`'s `capacity`. Moving it alone would make it the first containerd-store,
     kernel-7.0, Docker-29 measurement, with nothing to compare it to, ahead of the probe that F5 says decides that move.
  2. The base already treats its runner label as screening-capacity's, though it says so for the private-repository
     move to the 4-core larger runner, not for 24.04 versus 26.04: ADR 0071 `:319` ("move release-capacity's runner
     label with screening-capacity's to the 4-core larger runner") and ci.md `:216` ("until its label changes with
     screening-capacity's"). The weekly test's own comment says it runs on the same runner "as screening-capacity's"
     (`release-capacity.yml:30-31`).
  3. It **fails** on host-sensitive numbers (`memory.peak` > 90%, OOM: `release-capacity.yml:9-11`) and opens the
     "Release capacity test failing" issue (`:133`). A host-induced failure on an unmeasured image would be a
     false alarm. Advisory times are advisory, but the memory checks fail the job.
  4. It costs nothing: same free runner, same timeout, and the chain moves together later (ADR 0066 `:892-893`:
     "`RELEASE_RUNNER`, the release workflows' `runs-on` and `RELEASE_CHAIN` together").
  - The other option, 26.04 under the letter, would give a weekly Docker 29 data point for #41 for free. But it moves a
    failing check onto an unmeasured host. If the founder wants that data point, it belongs behind a dispatch input
    like screening-capacity's, which is a proposal outside ci-browser.
- **apt cache:** neither workflow needs it. Neither runs `playwright install --with-deps` on the runner; the worker image's
  apt runs inside `docker build` against Debian's mirrors (`Dockerfile:34-36`).
- **Browser check:** neither has a `CHROMIUM_INSTALL`, so the "every install is followed by the check" rule does not reach
  them. **Improvement (inside scope, recommended):** `release-capacity`'s `capacity` builds and measures the worker image
  whose headless shell prints the run's PDFs, weekly, with no pull request in between. It can run
  `node tools/ci/browser-build.ts --image tp-worker:capacity` after the build and after setup-node (the job already has
  Node 24). That is a few seconds of hashing about 287 files in the image (3.3.1's `--image` mode), and it catches a
  changed mirror build or a moved CfT download between PRs, which `ci.yml`'s `images` only catches on a PR run. The
  same holds for `screening-capacity.yml`'s worker build (`:190`), which 3.3 and phase 1 leave unchecked. A
  `workflows.test.ts` rule would cover both: "every job that builds `apps/worker/Dockerfile` and then measures or saves
  it runs `--image` on that tag".
- **Identity steps:** not needed. Nothing reads release-capacity's image identity (no `.Id`, no launch check, not attested).
  `provenance: false`/`sbom: false` are only required where an identity is compared (`workflows.test.ts:737-743` lists
  release, dry run, ci, screening-capacity; 6 builds). Adding them to release-capacity's build costs nothing and keeps
  one manifest per image under either store. That is optional and harmless.

## 3. Other base changes on ci-browser's ground

- **Counts on e908c21** (CI run 40401493722, push, 2026-10-26 21:06Z, every job `ubuntu-24.04`; job logs read with the
  GitHub MCP `get_job_logs`; `gh api …/jobs/<id>/logs` was refused, because its redirect goes to the blob host):
  - unit (job 121848211472): 377 files, **6,265 passed, 1 skipped**.
  - db: 1/4 (121848211735) 3,151 passed, 1 skipped (32 files, `restore-drill.db.test.ts` among them); 2/4 (121848211680)
    2,615; 3/4 (121848211747) 2,534; 4/4 (121848211603) 922 → **9,222 passed, 1 skipped**, 127 files. The one skip is
    the restore drill on 24.04 (`restore-drill.db.test.ts:73-76, :103, :194`; file unchanged). On 26.04 ci-browser
    expects **9,223 passed, 0 skipped**, plus whatever lands before it. ci-browser adds no db test.
  - e2e: 1/2 (121849065662) 27 passed, 2/2 (121849065557) 27 passed → **54** (the lanes' 54 at 7b6b10b is confirmed;
    the design's 51 is stale). The computed name check is a step, so it stays 54 unless #42 merges first (it adds
    `mail-cutoff.spec.ts` and `mail-notices.spec.ts`; their test count is not verified from the patch).
  - ci-browser's own unit additions over e908c21: **not verified** (needs a full `pnpm test` on the head).
- **expectAccessible:** now **14 specs, 72 calls** (was 12 and 66): `pricing.spec.ts` 4 (new), `viewer-phi.spec.ts` 1 (new),
  `billing.spec.ts` 3 → 4; then brand 2, era-exports 1, models 3, monitoring 6, onboarding 15, packets 12, reports 8,
  screening 7, security 1, triage 3, unattested 5 (`grep -c "expectAccessible("`). `contracts.spec.ts` imports only
  `atPhoneWidth` from `a11y.ts`. `a11y.ts:12` tags unchanged. So acceptance 4's local spec list gains **pricing** and
  **viewer-phi** (15 specs with sign-in).
- **Header controls:** `shell.tsx` unchanged by the base. Phase 1's labels are at `:57` and `:87`. Only
  `sign-in.spec.ts:18` and `brand.spec.ts:363-364` call `getByLabel('Practice switcher'/'Account menu')`. No new header
  control: the other summaries are the mobile `Menu` (`:328`) and "Help with this screen" (`:341`), both with visible
  text and no `aria-label`.
- **No new `CHROMIUM_INSTALL`** in any workflow (list in §2).
- **Matrix/doc rows:** no new CI-* row and no change to CI-18..20. RCC-07 (`matrix.ts:432`) asserts the weekly real-size
  test. CI-20's text (`test-matrix.md:280`, `matrix.ts:420`, "Every job on ubuntu-26.04 but the release's capacity
  chain") needs the release-capacity clause if §2's recommendation is taken. ADR 0062 is unchanged by the base.

## 4. #42 now (`gh api repos/PureTideWater/PhysicalTherapy/pulls/42`, GET, 2026-10-27 ~01:55 UTC)

- draft **true**, open, head **098636e3** (`co-001/pr-06b-mail-streams`), base `claude/build-platform` at **e908c214** (it
  has merged the same base), `mergeable: true`, `mergeable_state: blocked`, `updated_at` **2026-10-27T01:45:57Z**, 188
  files, 17 commits. File list: `scratchpad/reread2/pr42-files.json`. The head is not in the local object store, so
  **no `git merge-tree` was run**. The verdicts below come from hunk ranges.
- Shared with ci-browser's committed diff (e908c21..2ab2b15), 7 files:

  | File | #42's hunks (vs e908c21) | ci-browser's hunks (vs e908c21) | Verdict |
  |---|---|---|---|
  | `shell.tsx` | `-156,6` (`'console_mail'`), `-259,6` (RailLink "Mail streams", +3) | `-53,7`, `-81,10` | clean either order |
  | ADR 0062 | `-1,6`, `-863,6`, **`-1379,3 +1395,100`** (its amendment at EOF) | `-1049`, `-1093`, `-1163`, `-1322`, **`-1379,3 +1384,54`** (Part 3 amendment at EOF) | **conflict at EOF**; keep both, in merge order (rule 6) |
  | reconciliation-001 | `-638,6 +638,16` (PR 6b-4 entries before "Ruled by the founder … October 25") | `-478`, `-566`, `-594`, `-643,10` (F5 entry, Q2 note) | separated by 641-645; clean (not proved by merge-tree) |
  | test-matrix | `-176,10`, `-203,6`, `-212,6` (SEC-18/19, SCR-21/22, JOB-05) | `-252,7`, `-273,6` | clean |
  | matrix.ts | `-217,6`, `-325,10` | `-415,6` | clean |
  | registry.ts | `-360,6`, `-506,6`, `-516,6` | `-611,6` | clean |
  | watched-paths.txt | `-85`, `-95`, `-134`, `-165` | `-3`, `-20` | regenerate with `watched.ts --write`, never hand-merge |

- Shared with phase 2 / "After #42" (not yet changed by ci-browser): `apps/web/package.json` `-14,6`
  (+`@aws-sdk/client-sesv2`; ci-browser `:47-48`, disjoint); `apps/worker/package.json` `-36,6` (ci-browser `:53`,
  disjoint); `pnpm-lock.yaml` +33 in `-119`, `-246`, `-916`, `-976`, `-4017`, `-4167` (re-resolved, never hand-merged:
  Q2); `apps/web/e2e/screening.spec.ts` `-12`, `-35`, `-689` (ci-browser does not edit it; it runs its 7
  `expectAccessible` calls); `run.ts` 9 hunks (`-46, -58, -288, -813, -853, -903, -912, -926, -948`, same as 3.3.2);
  `report.ts` `-389, -529, -745`; `report.test.ts` `-1, -16, -468, -547`; `test-support/measurements.ts` `-1, -218`.
  `run.ts` and `report.ts` are on the LANES "Not while #42 is open" list (`LANES.md:90`), so phase 1's deferral stands.
- #42 touches **no** workflow, `tools/test/*`, `tools/package.json`, `pnpm-workspace.yaml`, `Dockerfile` or `brand.spec.ts`.
  It adds `mail-cutoff.spec.ts` and `mail-notices.spec.ts` with 2 `expectAccessible` calls each, plus the console mail
  page. That is O6's sweep: whichever merges second runs axe 4.14 over them.
- 3.3.2's #42 table, re-checked: the hunk ranges for shell, run.ts, report*, measurements, apps/* manifests and the
  lockfile hunk positions shifted (e.g. lockfile `-112` → `-119`, `-239` → `-246`, `-904` → `-916`, `-964` → `-976`,
  `-3962` → `-4017`, `-4112` → `-4167`; matrix `-157`/`-265` → `-217`/`-325`; registry `-247/-392/-402` →
  `-360/-506/-516`; test-matrix `-153/-180/-189` → `-176/-203/-212`; reconciliation `-597,3` → `-638,6`; ADR 0062
  `-1351,3` → `-1379,3`). The merge rules and rulings are unchanged. The one row that changes: ADR 0062 is now a sure
  textual conflict at EOF, since both amendments append after `:1381`.

## 5. The unit run, and what phase 2 still has to do

`flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/test tools/ci tools/screening-capacity packages/synth`
(Node 24, node_modules equal to the tracked lockfile by `cmp`): **45 files, 3 failed | 693 passed | 1 skipped**
(log `scratchpad/reread2/unit-run.log`).
1. `browser-version.test.ts` "names playwright-core once, as pnpm-workspace.yaml's catalog line …": `catalog:
   playwright-core: expected undefined to be '1.56.1'`. Phase 2 by design (no catalog line yet).
2. `workflows.test.ts:428` runner rule: content-calendar `check`/`notify` and release-capacity `capacity`/`notify` are on
   `ubuntu-24.04` and not in `RELEASE_CHAIN`.
3. `workflows.test.ts:2742` simulated Dependabot rewrite: it re-runs (2) on the copy (`expected 1 to be +0`). It clears with (2).

**Phase 2 with no local browser:**
- Workflows (§2): content-calendar `check`/`notify` and release-capacity `notify` → `ubuntu-26.04`; `RELEASE_CHAIN` +=
  `'release-capacity.yml capacity'` (9) with its comment (`workflows.test.ts:205-210`) reworded beyond "a release
  workflow"; `:429` 18 → 21. Optionally `browser-build.ts --image tp-worker:capacity` in release-capacity (and
  screening-capacity's worker build) with a rule; optionally `provenance: false`/`sbom: false` there. No apt cache, no
  install check, no identity steps for either.
- The bump: `apps/web/package.json:47-48` → `@axe-core/playwright 4.14.0`, `@playwright/test 1.64.1`;
  `pnpm-workspace.yaml` catalog `playwright-core: 1.64.1` (between `pg` and `react`); `apps/worker/package.json:53` and
  `tools/package.json:34` → `catalog:`.
- Lockfile under the gates: `pnpm install` with pnpm 10.34.8 (age 4,320, no-downgrade, the semver exclude untouched, no
  new exclude), then the diff checked: Playwright/axe version swaps, `fsevents@2.3.2` gone (`:2924, :6001, :6431`), next's
  snapshot peer `@playwright/test@1.64.1`, nothing else; then `--frozen-lockfile`, and `BASE=origin/claude/build-platform
  pnpm toolchain:check` (networked) plus `pnpm actions:check`.
- Catalog line → green: `browser-version.test.ts` and the new no-duplicated catalog test (`:124`).
- `browser.json` stays as is: revision 1248 / 156.0.8078.4 is still 1.64.1's, and 1.64.1 / 4.14.0 are still npm `latest`
  (`npm view … dist-tags`, 2026-10-27 01:54 UTC; `next` is 1.65.0-alpha-2026-10-26). Nothing in the base touches it.
- Docs: ci.md `:36-40` (name `release-dry-run.yml`'s `capacity`, which it omits today, and release-capacity's
  `capacity`); ADR 0066 `:751-753` ("three … The other eighteen jobs move" → the weekly real-size test named, twenty-one);
  ADR 0062 amendment `:1391-1393`, reconciliation-001 `:646`, `screening-capacity.md:312-313`, ADR 0063 `:485-486` (if
  "but the release's capacity chain" is kept, name the weekly test beside it), test-matrix CI-20 `:280` and
  `matrix.ts:420`, all with the release-capacity clause; ADR 0066 Part 3 gains the reason (§2) and the counts below.
- Counts for the PR description: unit = 6,265 + ci-browser's new tests, 1 skipped (actionlint); db 9,223 / 0 skipped;
  e2e 54 (+ #42's if it merges first); golden unchanged (not re-read here).
- `pnpm synth --all` clean diff; `watched.ts --write` no-op; typecheck, lint, the tools vitest, actionlint with `-ignore`.

**Phase 2 needing Chromium 1248 locally** (refused hosts: storage.googleapis.com, cdn.playwright.dev; the person has
been asked to allow storage.googleapis.com):
- the 1248 layout (both zips, SHA-256 to `CFT_BUILDS`), then `node tools/ci/browser-build.ts` green against `browser.json`
  (both `treeSha256` and binaries);
- the seven baselines regenerated with `--update-snapshots=all --retries=0`, then the no-op second run (`git status`
  clean), and their SHA-256s;
- the specs on 1.64.1/axe 4.14: sign-in plus the **14** with `expectAccessible` (billing, brand, era-exports, models,
  monitoring, onboarding, packets, **pricing**, reports, screening, security, triage, unattested, **viewer-phi**), with
  `--workers=2 --retries=0`;
- the computed name check (brand header step) at 1280 and 390 px;
- the A9 inspection images (old blobs vs new, side by side; recorded in the status file or a design note), and the UX
  review's before/after shots at 1280/390 light and 1280 dark.
- CI-only either way: the worker image's `--image` check, containerd `.Id`, Trivy `input:`, the baseline step's bytes
  on 26.04, the apt verify against a real index.

## Changes 3.3 needs

1. **3.3.1 Runners, "At 6ddd587, 23 jobs … 25 jobs" / "7 stay … 18 move"** → "At 2ab2b15, 30 jobs: 9 stay on
   `RELEASE_RUNNER.label` (release.yml's four, release-dry-run.yml's `build`, `push`, **`capacity`**, screening-capacity's
   `capacity`, and **release-capacity.yml's `capacity`**); 21 move, content-calendar's `check`/`notify` and
   release-capacity's `notify` among them." Evidence: `grep -n runs-on .github/workflows/*.yml`; `release-dry-run.yml:219`;
   `workflows.test.ts:210, :429`; §2's reasons (ADR 0071:319; ci.md:213-216; `release-capacity.yml:3-13`).
2. **§1 A8 and §3.5 CI-20 text "the release's capacity chain, seven jobs"** → nine, with the weekly real-size test named.
   Evidence: as 1; `test-matrix.md:280`, `matrix.ts:420`.
3. **3.3.1 "e2e stays 51 tests"; 3.3.4 acceptance 6 "e2e 51"** → 54 (plus #42's two specs if it merges first). Evidence:
   run 40401493722, jobs 121849065662 and 121849065557, 27 + 27.
4. **3.3.1 "twelve specs call `expectAccessible` … 66 calls"; A10; acceptance 4's list of twelve** → 14 specs, 72 calls;
   add `pricing` and `viewer-phi`. Evidence: `grep -c "expectAccessible(" apps/web/e2e/*.spec.ts` at 2ab2b15.
5. **3.3.1 restore drill "db goes from 9,049 passed and 1 skipped to 9,050 and 0"; acceptance 6** → from 9,222 + 1 skipped
   to 9,223 + 0 (as of e908c21). Evidence: the four db jobs above.
6. **3.3.1 Versions table "`tools/package.json:33`"; 3.3.2 "`tools/package.json` (`:33`)"** → `:34`. Evidence:
   `grep -n playwright-core tools/package.json`.
7. **3.3.1 "`pnpm-lock.yaml:2490`" (axe-core) and "`:2877, :5946, :6376`" (fsevents 2.3.2)** → `:2537` (and `:5673`) and
   `:2924, :6001, :6431`. Evidence: `grep -n` at 2ab2b15.
8. **3.3.1 "No `trustPolicyExclude` or `minimumReleaseAgeExclude` entry is added"**: still true for Playwright/axe. Add
   that the file now carries `trustPolicyExclude: [semver@6.3.1]` (CQ2 (a)) and the qs override, both untouched by the
   bump. Evidence: `pnpm-workspace.yaml` at 2ab2b15.
9. **3.3.1 "ci-deps' `no-duplicated-versions.test.ts` requires every catalog package to be `catalog:` in every manifest
   (§3.2.3)"** → cite the test as merged: "names each catalog package as "catalog:" in every workspace manifest's
   dependencies and devDependencies" (`no-duplicated-versions.test.ts:124-139`, root included). Catalog line placed
   between `pg` and `react`.
10. **3.3.1 "next 16.4.3's optional peer `@playwright/test ^1.51.1` holds"**: confirmed on the merged lockfile
    (`pnpm-lock.yaml:3323`); next is `^16.4.3` in `apps/web/package.json:39`.
11. **3.3.1 "Where it runs" (browser check, `--image`)**: add release-capacity's `capacity` (and screening-capacity's
    worker build) for `--image` on the measured worker image, with the `workflows.test.ts` rule, if taken (§2,
    improvement). No `CHROMIUM_INSTALL` was added by the base. Evidence: `grep -n "playwright install" .github/workflows/*.yml`.
12. **3.3.1 V3 "Where:"**: add "content-calendar and release-capacity take none (no runner-side browser install)".
    Evidence: §2.
13. **3.3.1 binding / identity**: add "release-capacity's build is not an identity build (no `.Id`, no launch check, not
    attested; `tools/release-capacity/run.ts:20, :359`); its `cache-from` of screening-capacity's layers stays (ADR 0066
    `:399-401`)". `provenance`/`sbom` there are optional.
14. **3.3.1 `processImagesProblems`' message** → note the second caller, `tools/release-capacity/run.ts:359`, which drops
    the `server.js` problem. The copy wording must read right there too. Evidence: grep.
15. **3.3.2 the #42 table**: head 13f59b1 → **098636e3** (base e908c21, 188 files, draft, `mergeable: true`,
    `blocked`, updated 2026-10-27T01:45:57Z); hunk positions as §4; **ADR 0062 row: a sure EOF conflict** (both
    amendments append after `:1381`), resolved by keeping both in merge order. Evidence: `pulls/42` and
    `pulls/42/files` GET.
16. **3.3.1 Conditional work O6 "#42 is a draft (head 13f59b1, base 49514e8, `mergeable_state: dirty` …)"** → head
    098636e3, base e908c21, `mergeable: true`, `blocked`, updated 2026-10-27T01:45:57Z. Evidence: as 15.
17. **3.3.2 Documents**: add ci.md `:36-40` (which also omits `release-dry-run.yml`'s `capacity` today, a phase-1
    inconsistency with `RELEASE_CHAIN`), ADR 0066 `:751-753` ("eighteen"), ADR 0062 `:1391-1393`, reconciliation-001
    `:646`, `screening-capacity.md:312-313`, test-matrix `:280`/`matrix.ts:420` for the release-capacity clause; ADR 0066
    Part 3 at `:715`; reconciliation F5 at `:646`, Q2 note at `:651`; test-matrix CI-18..20 at `:278-280`, note at
    `:252-255`; registry CI-18 at `:615`. Evidence: §1's grep table.
18. **3.3.5 "Files ci-deps leaves alone keep every cite"** → also list the base's two new workflows as files ci-browser
    now edits (`content-calendar.yml:43, :68`; `release-capacity.yml:114`; `:36` unchanged if recommended).
19. **3.3.4 acceptance 6**: "every moved job's 'Set up job' log names the ubuntu-26.04 image" → content-calendar's jobs
    run only on their paths/schedule/dispatch, and release-capacity's only on schedule/dispatch, so their 26.04 logs show
    after the merge or by dispatch. Record them, but they are not in the PR's runs. Evidence: `content-calendar.yml:13-32`,
    `release-capacity.yml:14-18`.

Notes (proposals outside ci-browser):
- P14: a `runner` dispatch input on `release-capacity.yml`, mirroring screening-capacity's, so the founder can get a
  26.04 weekly-test data point for #41 without moving the job.
- The unit/db/e2e count of ci-browser's own additions needs a full `pnpm test` on the head. That is not run here.
