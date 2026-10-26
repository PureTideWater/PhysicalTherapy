# Scout: tests, fixtures, CI gates and records for release content checks (#7, #30, #31, #59)

At `claude/build-platform` 6ddd587. Read only. Every claim is cited `file:line` at 6ddd587, or in `/home/user/ops`
where the path starts there. Peer scouts in this directory (`scout-engine.md`, `scout-pipeline.md`,
`scout-missing.md`) cover the product code. This one covers what the PR must satisfy and where its tests and records go.

## 0. In one screen

- **Test matrix:** RCC-01 to RCC-08 is a new module. It needs a new `## ... (RCC)` section at the end of
  `docs/product/test-matrix.md`, the same rows word for word in `packages/synth/src/cases/matrix.ts`, a registry entry
  for each, `'RCC'` in `CASE_MODULES`, a `MODULE_NUMBER` entry, and a generated `fixtures/synthetic/RCC-0N/expected.json`
  for each row (§1).
- **Fixture release:** **900007** is free, and so is 900008, on `claude/build-platform` and on every `origin/co-001/*`
  head, #42's included. It must be rendered by `tools/release/synthetic.ts` and held by `tools/release/release.test.ts:439`.
  Any new CSV source needs a pin in `packages/synth/src/guard/pinned-tables.json` (§2).
- **The hidden #42 collision:** `tools/screening-capacity/watched-paths.txt` is a #42 file
  (`pr42-files.txt:143`). It is generated from the import closure of the **whole worker** (`apps/worker/src/main.ts`),
  `tools/release/scale.ts` and the web's screening entry points (`tools/screening-capacity/watched.ts:33-58`).
  `watched.test.ts:18` holds it equal to that closure. So **any new non-test source file** that the closure reaches
  forces a change to that #42 file:
  - under `apps/worker/src`, `packages/rules/src`, `packages/triage/src` or `packages/pricing`;
  - under `tools/release/{assemble,commands,impact,synthetic,scale}.ts`, or anything `tools/verify-content/check.ts`
    imports.

  A ruling is needed, or those parts split (§5.1).
- **Log fields:** the allowlist in `packages/observability/src/fields.ts` is a #42 file. A new job may log only the
  fields already allowed: `release_no`, `error_code`, `job_id`, `job_type`, `practice_id`, `pricing_run_id`,
  `elapsed_ms` and `record_count` (`fields.ts:9-50`). There is no `record_type` and no quarter field (§6).
- **Unpriced remedies are copied word for word**, so #7's sentence "PaidWhole has not loaded the <year> fee schedule"
  cannot replace `NO_PFS_VALUE`'s remedy text. It must be a separate content-gap message (§9).
- **A new workflow** (#59's scheduled issue opener, #31's weekly real-size run) must be added to:
  - the CI-10 timeout table (`tools/test/workflows.test.ts:1514-1534`);
  - the concurrency-name rule (`:1537-1541`);
  - the `ubuntu-24.04` runner rule (`:342-360`);
  - ci-deps' pin rules, once they land. ci-deps rewrites `workflows.test.ts` and every workflow
    (`/home/user/ops/designs/lane-b-ci.md:757-765`), so the two overlap.
- **No engine-freeze exception is needed.** `exception.json` names PR 36 and is stale (`tools/engine-freeze/exception.json:3`).
  This PR must not edit `exception.json`. The differential test still prices the head engine on the head
  `packages/rules`, so rules-loader changes must keep every price identical (§4).
- **Mutation:** no new shard is needed, because rules, tools and triage are not money packages. But a new
  `release-synth-*` directory, or a change to `packages/rules` that pricing imports, makes the PR run the pricing and
  packets mutation shards (`tools/stryker/affected.ts:80-99`) (§7).

## 1. Test matrix and `packages/synth` cases

### 1.1 Row format and how a series is added

- **Row format:** `| ID | Case | Assertion |` (`docs/product/test-matrix.md:9-10`). The registry test reads rows with
  `/^\| ([A-Z]{2,3}-\d{2}) \| (.*) \| (.*) \|$/` (`packages/synth/src/fixtures.test.ts:36`). So:
  - an ID has a two- or three-letter module and **two digits**;
  - a cell must not contain ` | `.
- **"A pull request that adds behavior adds a row here first"** (`test-matrix.md:5`).
- **A series gets its own section with an intro paragraph.** The precedent is CI: `## Continuous integration (CI)` at
  `test-matrix.md:208`, its intro at `:210-212` (which audit items, which ADR, which IDs are reserved for later), then
  the table from `:214`.
- **Rows added inside an existing module get a note paragraph after the table**, saying who added them, under which
  ruling, and which ADR (LED-12/13 at `test-matrix.md:137`; PRC-21..24 at `:93-94`).
- **RCC goes at the end of the file, after CI.** `TEST_MATRIX` must equal the file's rows **in order**
  (`fixtures.test.ts:39-42`), and CI is the last section (`test-matrix.md:208-229`).
- **`matrix.ts` holds every row word for word** (`packages/synth/src/cases/matrix.ts:1-3`). CI's rows are at
  `matrix.ts:280-292`, and RCC follows them.

### 1.2 Registry (`packages/synth/src/cases/registry.ts`)

- Every matrix row needs an `ENTRIES` key (`registry.ts:518-525`; the test is `fixtures.test.ts:40-41`).
- An entry is `{ completesIn, build?, noFile?, assertedBy? }` (`registry.ts:19-25`). The `none(completesIn, reason,
  assertedBy)` helper (`registry.ts:27`) is for a case with no file.
- CI's entries are all `none(0, '<why no file>', [tests])` (`registry.ts:451-465`), each block with a comment naming its
  ADR part.
- `completesIn` must be between 0 and 13 (`fixtures.test.ts:47-48`). A case with `completesIn` ≤ 10
  (`CODE_BUILT_THROUGH_MILESTONE`, `registry.ts:52`) **must name its `assertedBy` tests** (`fixtures.test.ts:71-75`),
  and each must exist (`:57-63`).
- Suggested values:
  - 0 for the content pipeline (PRD 9: global content is "a milestone-0 deliverable", `docs/product/PRD.md:413`);
  - 7 for the pricing refusal and the monitor ("Engine phase two and monthly runs", `reconciliation-001.md:16`).

  Either way, `assertedBy` is required.
- A case that generates files uses `build: (b: CaseBuilder) => void`. LED-12 is the precedent (`registry.ts:234`, its
  builder in `cases/workflow.ts`).

### 1.3 A new module, RCC (the CI precedent, commit 523fa09)

- `packages/synth/src/expected/types.ts:9`: add `'RCC'` to `CASE_MODULES`.
- `packages/synth/src/cases/common.ts:18`: add `MODULE_NUMBER` `RCC: 13`. CI is 12, the highest today.
  - It sets the ISA13 of generated 835s: `moduleNumber * 10_000_000 + n*10_000 + k` (`common.ts:24-29`), unique across
    every fixture.
  - It matters only if an RCC case writes an 835 (for example #7's priced-month cases).
  - **Collision risk:** db-function-diffs adds a new module DBF (its claim, `/home/user/ops/LANES.md:168`). If it also
    takes 13, two fixtures could share an ISA13. Record "RCC = 13" in the claim and tell that session.
- The ID regexes already accept three letters: `packages/synth/src/args.ts:14`, `packages/synth/src/write.ts:371`,
  `fixtures.test.ts:36`.
- `pnpm synth --all` then writes `fixtures/synthetic/RCC-0N/expected.json`. CI fails when the generation changes a
  committed fixture (`.github/workflows/ci.yml:117`), so
  commit them. The shape of a no-file case is `fixtures/synthetic/CI-01/expected.json`.
- **Reserved:** RCC-01 to RCC-08 only (`/home/user/ops/LANES.md:171`). Eight rows is the ceiling. Group assertions so
  #7, #30, #31 and #59's this-PR parts fit, and leave any #42-split part's row unreserved, for its later PR to reserve.

### 1.4 The synth-fixture skill

`.claude/skills/synth-fixture/SKILL.md:6-12`:
- `pnpm synth --case <id>`;
- the SYNTHSENDER marker;
- "Add the expected outcome to fixtures/synthetic/<case>/expected.json and a test that asserts it";
- never derived from a real file.

## 2. Fixture releases

### 2.1 How they are generated

- `tools/release/synthetic.ts` renders 900001 (`:32-33`, from `fixtures/synthetic/cms/*`, `:37-48`), 900004
  (`:108-110`), 900005 (`:157-158`) and 900006 (`:222-226`).
  - Each variant starts from 900001's files and replaces or adds one type, then rebuilds `MANIFEST.json`
    (`:285-288`).
  - Its main block writes them all (`:291-307`).
  - 900002 and 900003 come from `tools/golden-worksheet/synthetic-release.ts`
    (`fixtures/synthetic/rules/release-synth-900002/RELEASE.md:3`, `release-synth-900003/RELEASE.md:3`).
- The committed bytes are held to the renderer by `tools/release/release.test.ts:439-451`, which lists each
  `[DIR, render()]` pair. Add 900007's pair there, and a "nothing else changed against 900001" test in the style of
  `release.test.ts:453-516`, using `diffRecords`.
- The worker tests load variants through `apps/worker/src/price/test-support/pricing-world.ts:72-83,362-370`
  (`DEADLINE_RELEASE`, `PLUS_FOUR_RELEASE`). It is not a #42 file, so a `CONTENT_GAP_RELEASE = 900007` can go there.

### 2.2 The next free number

- **Directories at 6ddd587:** `release-synth-900001` to `900006` (`ls fixtures/synthetic/rules`).
- **Numbers used only in tests' scratch databases:**
  - 900000 (route-test worlds);
  - 900009 (`packages/pricing/src/engine.test.ts`);
  - 900011 to 900014 (`packages/db/src/screening.db.test.ts`);
  - 900021 (`apps/web/src/lib/screening/result-page.large.db.test.ts:74`);
  - 900050 (`apps/worker/src/screening/release-cache.db.test.ts:20`);
  - 900099 (`price.db.test.ts:670`, `packets.db.test.ts:1199`, `tools/golden-worksheet/test_golden_worksheet.py`);
  - 900100, the scale release (`tools/release/scale.ts:12`; `scale.test.ts:33`: "a SYNTHETIC number no committed
    fixture uses").
- **900007, 900008 and 900010 appear nowhere.** I checked with `git grep` at 6ddd587 and on every `origin/co-001/*`
  head after `git fetch origin '+refs/heads/co-001/*:refs/remotes/origin/co-001/*'` (2026-10-26). That covers the open
  ones: `pr-06b-mail-streams` (#42), `pr-05b-plan-type-words` and `main-dependabot-template`.
- The five parallel Lane B branches (15b, db-function-diffs, superseded-rerun, model-eval-gate, ci-deps) are **not on
  the remote yet**. Check again before the build. superseded-rerun reserves PRC-25..28 and may want a fixture release
  (`/home/user/ops/LANES.md:169`; `scout-pipeline.md:153`).
- **Recommendation:** reserve 900007 (and 900008 if a second shape is needed) in the LANES.md claim row now, so a
  parallel session cannot take it.

### 2.3 Frozen releases

- **Reconciliation's text:** 900001 to 900004 unchanged (`reconciliation-001.md:446`).
- **The freeze check:** 900001 to 900005 (`FROZEN_RELEASE`, `tools/engine-freeze/check.ts:58`), plus every release a
  golden claim at the base pins (`check.ts:20-22`, `pinnedReleases`). That includes **900006** (G196 to G199, ADR 0064,
  `docs/adr/0064-…md:40`).
- So 900001 to 900006 are all untouchable. 900007 is a new directory, which the freeze does not refuse.

### 2.4 Fixture-guard pins (`pnpm check:fixtures`)

- Every CSV, TSV, spreadsheet, X12 or zip file, and every text file under `fixtures/` or `packages/synth/`, goes
  through the writer's guard (`tools/fixture-check/index.ts:4-10`). A table without the SYNTHSENDER column passes only
  if it is pinned at its path with its SHA-256 in `packages/synth/src/guard/pinned-tables.json` (`guard/pinned.ts:1-30`).
  The rule is "Add one only with that reason" (`.claude/rules/fixtures.md:29`).
- Precedent: `fixtures/synthetic/cms/GPCI_SYNTHETIC_900006.csv` and `PPRRVU_SYNTHETIC_900004.csv` are pinned. A new
  `MPPR_SYNTHETIC_900007.csv` or `NCCI_MUE_SYNTHETIC_900007.csv` source needs the same.
- **Better: avoid a new CSV.** Re-window 900001's parsed records in the renderer, which passes the source's
  `effectiveTo` to the parser (`synthetic.ts:56`) the way 900005 re-types hand-typed records (`:167-220`). Then no new
  table and no pin are needed.
- `pinned-tables.json` sits in `packages/synth/src/guard/`, which is founder-owned (`.github/CODEOWNERS`:
  `/packages/synth/src/guard/`), and is listed in `codeowners.test.ts:107`.

## 3. Pre-push hook and gitleaks

- The hook (`tools/pre-push/pre-push.ts:1-22`) runs the fixture check over the pushed commits
  (`tools/fixture-check/commits.ts`) and gitleaks with `.gitleaks.toml`.
- `.gitleaks.toml:6-11` uses the default rules, with only the lockfile allowlisted. `.gitleaksignore` has 34
  fingerprints. Lane B rule: never add one (`/home/user/ops/lanes/lane-b.md:244`).
- **Pitfalls on record** (`lane-b.md:246`):
  - a key pasted into a file;
  - a 64-hex document hash in an archived script.

  In design or docs text, shorten hashes to 8 hex and an ellipsis. `MANIFEST.json` hashes in fixture releases have
  never been flagged (900001 to 900006 pushed through the hook).
- The push command (worktree) is `git push origin co-001/release-content-checks`, never `--no-verify`
  (`lane-b.md:244`, LANES rule 11).

## 4. Engine freeze (`tools/engine-freeze`)

- **What it checks** (`check.ts:11-40`):
  - no non-test file under `packages/pricing/src`, and nothing else under `packages/pricing` but tests;
  - every consumer resolves `@tp/pricing` to `packages/pricing/src`;
  - no existing golden file, and no frozen or base-pinned synthetic release, changes;
  - no migration touches `rule_release`, `rule_record` or `rule_release_withdrawal`;
  - the rule tables' catalog is held to `rule-tables.catalog.json` by `rule-tables.db.test.ts`.
- **The exception** applies only in the PR it names, and only when that PR adds or edits `exception.json`
  (`check.ts:34-40`). Today it names PR 36 (`exception.json:3`), so it is stale and ignored. **This PR must not edit
  it:** an applicable exception with an unused entry is itself a problem (`check.ts:39-40`).
- **CI:** the "Engine freeze" step runs on pull requests against the merge base with PR_NUMBER (`ci.yml:98-109`). The
  differential test runs in `unit`, with `ENGINE_FREEZE_BASE` set by `ci.yml:205-222`, and fails rather than skips in
  CI (`tools/engine-freeze/differential.test.ts:55-56`).
- It prices "every golden claim and 20,000 generated claims" with the base engine on the base's own money, rules and
  contracts packages, and with the head engine on the head's (`reconciliation-001.md:445`; PRC-22,
  `test-matrix.md:89`). **Any change to `packages/rules/src` that the engine imports**
  (`packages/pricing/src/{engine,index,release,testing,trace}.ts` import `@tp/rules`) must price identically. #31's
  keyed fetch must keep the `RuleRelease` interface's answers exact.

## 5. Screening capacity: the watched list and the gate

### 5.1 The watched list

- **The entry points** (`tools/screening-capacity/watched.ts:33-58`): `apps/worker/src/main.ts`,
  `apps/worker/src/screening/thread.ts`, `packages/db/src/cli/migrate.ts`, `apps/worker/src/deploy/logins-cli.ts`, the
  web's screening pages, layout and proxy, `tools/screening-capacity/{run,load,oracle}.ts` and
  **`tools/release/scale.ts`**.
- **The list** `tools/screening-capacity/watched-paths.txt` is generated with
  `pnpm exec tsx tools/screening-capacity/watched.ts --write` (`watched-paths.txt:2`). `watched.test.ts:18` holds it
  equal.
- **It lists, file by file:**
  - all of the worker's price, triage, monitor, report, jobs and platform files (`watched-paths.txt:129-237`);
  - every `packages/rules/src` non-test file (`:414-432`);
  - `packages/triage/src/*` (`:483-492`);
  - `tools/content-files.ts`, `tools/release/{assemble,commands,impact,scale,synthetic}.ts` and
    `tools/verify-content/check.ts` (`:508-514`).
- **It is a #42 file** (`/home/user/ops/designs/lane-b-release-content-checks/pr42-files.txt:143`), and not on the
  task's list of rule-6 shared documents.
- **Consequence:** a new non-test file imported from any of those forces a regeneration, and so a #42 file change.
  Examples: `apps/worker/src/price/content-gaps.ts` (scout-missing §9), a new `packages/rules/src/coverage.ts`, a new
  `tools/verify-content/*.ts` that `check.ts` imports. Edits to files already listed do not change the list.
- **Options for the design:**
  - (a) put new logic only in files already listed, or in files the closure never reaches (a CLI under `tools/` that no
    entry point imports);
  - (b) ask the co-founder to extend his Q2 ruling to `watched-paths.txt`. Q2 (2026-10-25 ~21:05 UTC) let the CI
    series touch #42's files under rule 6, with "the lockfile re-resolved and never hand-merged"
    (`/home/user/ops/lanes/lane-b.md:191`). The same would apply here: regenerated by the PR merged second, never
    hand-merged. ci-deps already plans to regenerate it (`/home/user/ops/designs/lane-b-ci.md:778-779`, `:1351`);
  - (c) split those parts until #42 merges.
- **Recommended:** (b). It is a generated file with a deterministic regeneration, and (a) would distort the module
  layout for a merge-order reason.

### 5.2 The gate

- `screening-capacity gate` is a required check (`tools/required-checks.ts:23-24`). Its workflow measures when a
  changed file matches a line of the list at base or head (`watched.ts:21-25`).
- Any edit to a listed file makes this PR run the capacity measurement. That includes
  `tools/verify-content/check.ts`, `packages/rules/src/*`, the worker's price, triage and monitor files, and
  `tools/release/synthetic.ts`. The `capacity` job takes up to 100 minutes (`workflows.test.ts:1532`).
- Time is advisory, by the founder's third ruling of 2026-10-23 (`reconciliation-001.md:605`), so it costs time and
  does not block. Budget for it.

## 6. lint:logs and lint:copy

### 6.1 `pnpm lint:logs`

- Command: `tsx tools/lint-logs/index.ts` (`package.json` scripts). It scans `apps`, `packages`, `tools` and `infra`
  (`tools/lint-logs/scan.ts:30`), but not tests (`:36-38`).
- A log call's field must be on the allowlist (`scan.ts:102-110`, "is not on the allowlist in
  packages/observability/src/fields.ts"). It must hold a single value, never an object (`:111-115`), and nine-digit
  runs are refused (`:18`).
- Allowed today (`fields.ts:9-50`):
  - `request_id`, `trace_id`, `actor_id`, `user_id`, `organization_id`, `practice_id`;
  - `job_id`, `job_type`, `pricing_run_id`, `audit_report_id`, `release_no`, `error_code` and the other record IDs;
  - numeric `elapsed_ms` and `record_count`.
- `fields.ts` is a #42 file (`pr42-files.txt:135`). **#59's daily content job, #7's content refusal and #31's fetch
  must log only these.** For example, `release_no` plus `error_code: 'waiting_on_content'` plus `record_count`, with
  the type and quarter in the stored row, never in a new log field. A new field (`record_type`, `content_quarter`)
  waits until #42 merges.
- It runs in CI's `static` job (`ci.yml:140`: `pnpm lint:logs`).

### 6.2 `pnpm lint:copy` (CO-11)

- Command: `tsx tools/brand-copy/index.ts`. `pnpm test` runs it too (`tools/brand-copy/scan.test.ts`;
  `brand-copy/index.ts:6-7`). There is no separate CI step: no workflow names it.
- **It reads** every string, template and JSX text in `COPY_ROOTS`: `apps/web/src`, the worker's
  `report/digest/mail/packets/screening` directories, and `packages/{ui,triage,packets}/src` (`scan.ts:51-61`). Also
  `COPY_FILES` (`scan.ts:69-77`), which includes `packages/contracts/src/location.ts` (the pricing-location sentences).
- **Rules** (`scan.ts:20-31`):
  - "recovered" must be labelled with posted or deposited;
  - no "AI" or "intelligence";
  - in any path with a `screening` directory: no "owed", "underpaid" or "recovered" at all;
  - no brand token typed out.
- The "waiting on the <quarter> Medicare content" wording, Coverage's "PaidWhole has not loaded the <year> fee
  schedule", and any console "Content due" text fall under it. If the sentences live in a new worker file outside
  `COPY_ROOTS` (for example `apps/worker/src/price/*`), add that file to `COPY_FILES` so the lint reads it (the
  `location.ts` precedent, `scan.ts:66-68`).
- Wording rules come from `.claude/rules/brand.md`. The co-founder's standing ruling (2026-10-25 ~21:34 UTC) is that
  wording is applied without asking and reported afterwards (`/home/user/ops/lanes/lane-b.md:197`).

## 7. Mutation gate (Stryker)

- **Money packages:** `money`, `ledger`, `packets` and `pricing` (`stryker/shards.json`; PRD 18, `PRD.md:753`). A new
  source file in one of them needs a shard entry (`/home/user/ops/lanes/lane-b.md:239`; `tools/stryker/shards.test.ts`).
- **Files in `packages/rules`, `packages/triage`, `tools/`, `apps/*` need no shard.** This PR adds no money-package
  file: the engine is frozen, the ledger untouched, and packets are not in scope.
- **What runs on the PR** (`tools/stryker/affected.ts:1-30`): every package whose closure changes.
  - **pricing:** `fixtures/synthetic/rules/release-synth-*/**` (`affected.ts:88-90`) and `packages/rules` (pricing
    imports `@tp/rules`; for example `packages/pricing/src/engine.ts`).
  - **packets:** the same releases (`affected.ts:96-97`), via `@tp/pricing/testing`.

  So a new 900007, or any `packages/rules` edit in the closure, runs pricing's three shards and packets' two, behind
  the required `mutation` check (`tools/required-checks.ts:21-22`). Scores should not move: no money file or money
  test changes. If one moves, a survivor is killed by a test, or recorded as equivalent by a reviewer other than its
  proposer (`lane-b.md:240`).
- **Branch coverage gate:** 100% on `packages/{money,pricing,ledger,edi835}/src` and `packages/db/src/authz`
  (`vitest.config.ts:16-22`). `packages/rules` and `packages/triage` are not gated.
- **Local commands** (`docs/runbooks/ci.md:319-336`):
  - `pnpm stryker run tools/stryker/canary/stryker.config.mjs`
  - `pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard <s>`
  - `pnpm -s exec tsx tools/stryker/shards.ts <s>`
  - `pnpm -s exec tsx tools/stryker/gate.ts reports/mutation`

  What the branch affects: `pnpm -s exec tsx tools/stryker/affected.ts --base origin/claude/build-platform`.

## 8. CI, required checks and workflow policy

### 8.1 Required checks and ci.yml

- **Required checks** (`tools/required-checks.ts:18-27`): `all green` (ci.yml), `mutation`, `screening-capacity gate`
  and `approval-of-record`.
  - Every marked listing names them, between `<!-- required-checks -->` markers, in the files of
    `REQUIRED_CHECK_LISTINGS` (`:35-43`).
  - Any Markdown paragraph naming **three or more** of them in backticks outside markers fails
    (`required-checks.ts:110-113`; `tools/test/required-checks.test.ts:76`, which reads every tracked `*.md`). The ADR
    and docs must not list them unmarked.
  - This PR adds no required check.
- **ci.yml jobs:** `static`, `lint`, `unit`, `db` (4 shards on the public repository, 6 on a private one), `domain
  model`, `build`, `e2e`, `images`, and `all green`, which needs every one (`ci.yml:31,155,168,229,317,359,392,467,523-526`).
  - `static` runs `pnpm install --frozen-lockfile`, gitleaks over the PR's commits, `pnpm check:fixtures`,
    `pnpm verify-content`, `tools/check-releases-immutable.sh "$BASE"`, the engine freeze, `pnpm synth --all`, the
    fixture-diff check, `pnpm typecheck`, `pnpm lint:logs`, `pnpm test:golden`, `pnpm synth --large`,
    `pnpm test:oracle` and `pnpm licenses:check` (`ci.yml:47-151`; check:fixtures `:90`, fixture diff `:117`, lint:logs `:140`).
  - `unit` installs Chromium and gitleaks, sets `ENGINE_FREEZE_BASE`, then runs `pnpm test` (`ci.yml:168-228`).
- **A new ci.yml job** joins `all green`'s `needs` and the CI-10 table, and installs Chromium before any vitest unit or
  db step (`docs/runbooks/ci.md:172-180`). This PR should add none: a new job would be held by `workflows.test.ts:778`.

### 8.2 A new scheduled workflow (#59's issue opener; #31's weekly real-size run)

What the tests require:
- **The timeouts table** (`tools/test/workflows.test.ts:1514-1534`, CI-10): every job of every workflow file has its
  entry. Add `'<new>.yml': { <job>: N }`.
- **The concurrency group** starts with the workflow's own name, and no two workflows share a name (`:1537-1541`;
  `docs/runbooks/ci.md:180`, `${{ github.workflow }}-`).
- **Runner:** every job on `ubuntu-24.04`, with no `-latest` and no larger label (`:342-360`).
- **Pins:** today only `release.yml`, `screening-capacity.yml` and `ci.yml` must pin full SHAs with a version comment
  (`:1237-1253`). ci-deps extends pinning to every workflow (`lane-b-ci.md:757-765`, `tools/check-action-pins/**`). Pin
  the new workflow by the same rule from the start (40-hex SHA plus `# vX.Y.Z`, the `PINNED` table at
  `workflows.test.ts:77`).
- **Weekly precedents:**
  - `large-zip.yml`: `schedule` plus `workflow_dispatch: null` (`workflows.test.ts:563-566`, timeout 45 at `:1523`);
  - `screening-capacity.yml`: cron `'41 6 * * 1'` (`:607`);
  - `mutation.yml`: cron `'23 5 * * 1'` (`:1322`).

  Pick a distinct off-hour minute.
- **Issue opener with no credentials:** the precedent is screening-capacity's `notify` job (`workflows.test.ts:741-751`):
  - it is its own job;
  - `permissions: { issues: 'write' }` and nothing else, with the workflow default `contents: read` (`:630`);
  - `needs` the measuring job;
  - it never checks out the repository and runs no repository code (no `uses:` steps);
  - `gh issue create --label <label>`;
  - `timeout-minutes: 5`.

  #59's workflow should split the same way: a read-only job that reads the calendar and the content and writes a
  verdict file or artifact, then a write job that only runs `gh`.
- **Documents:** `docs/runbooks/ci.md` "The jobs" (`:21`) describes each workflow; the new one belongs there.
  `actionlint .github/workflows/*.yml` must pass (`docs/runbooks/ci.md:168`).
- **Overlap with ci-deps:** ci-deps rewrites `tools/test/workflows.test.ts`, every workflow,
  `docs/runbooks/ci.md`, `packages/compliance/src/controls.ts` and `watched-paths.txt` (`lane-b-ci.md:757-779`, `:1316-1317`). The PR
  merged second keeps both (LANES rule 6, co-founder Q2).

### 8.3 publish-content.yml

- It runs `pnpm verify-content "${dir%/}"` on each `content/outgoing/*/` before `tools/publish-content.sh`
  (`.github/workflows/publish-content.yml`, steps 5-6).
- The order is held by `workflows.test.ts:591-596`. Its timeout of 360 is pinned in CI-10 (`:1525-1527`) until F4.
- **#30's refusals need no change here.** They live in `tools/verify-content/check.ts`, which the workflow already runs
  per outgoing release, so the "previous release" comparison is read by the checker from `content/releases/` in the
  checkout (`fetch-depth: 0`). Leave `publish-content.yml` entirely to ci-deps under F4. ci-deps adds a frozen-copy test
  (`tools/test/frozen/publish-content.yml`, `lane-b-ci.md:764,808`) that would fail any other edit.

## 9. Content documents and the closed list

- **`docs/product/unpriced-reasons.md`** is held word for word, three ways:
  - against `docs/product/rules-reference.md` and `UNPRICED_REASONS` (`packages/pricing/src/unpriced-reasons.test.ts:26-35`);
  - by the web's `apps/web/src/lib/contracts/remedies.ts`, whose test `remedies.test.ts:27-31` copies the rules
    reference word for word (`NO_PFS_VALUE` remedy "Check the code and year; some codes are carrier-priced",
    `remedies.ts:29`);
  - by the worker report's `apps/worker/src/report/remedies.ts:14` (`report.test.ts:196-198`).

  So #7's Coverage sentence must be **an added content-gap message, shown instead of or beside the remedy when the
  release's span does not cover the year**, never an edit to the remedy text. And "waiting on content" must be a
  run-level refusal or not-actionable code, never a new unpriced reason (`reconciliation-001.md:448`).
- **PRD 9** (`PRD.md:364-414`):
  - the record table with each type's refresh cadence (`:370-383`) is the natural source for #59's content calendar;
  - "The checker refuses a release when any record lacks a source, any effective window overlaps another…, any numeric
    field fails its range, or any quote does not appear" (`:385`). #30's added refusals extend this sentence, so update
    it in the same PR;
  - the release pipeline is at `:403-409`.
- **PRD 18 Releases** (`PRD.md:766-768`): "a content rollback by loading the previous release, with runs pinned to the
  withdrawn release flagged". It is unchanged by this PR. The impact and load path is #8, Lane A's.
- **PRD 19 runbooks table:** it lists a "Content release" runbook (`PRD.md:787`), and none exists in `docs/runbooks/`
  (`ls docs/runbooks`). #8 (Lane A) writes the load runbook. #59's "a runbook states the target time to load" should be
  a section coordinated with it, or a `docs/runbooks/content-calendar.md`. Name the overlap.
- **PRD 19 "The year"** (`PRD.md:800-809`): the publication calendar in prose. #59's calendar should cite it.
- **The content README** #7 and #30 rewrite is `content/sources/README.md` (123 lines). "…remove the previous one's
  draft before importing the next" is at `:85-87` (`scout-missing.md` §7, `scout-pipeline.md` §2). It is outside
  `content/releases`, so `protect-content.sh` does not block it. That hook blocks `content/releases/**`, migrations
  without the marker, and `.claude/hooks/` and `.claude/settings*.json` (`.claude/hooks/protect-content.sh:1-12`), so
  this PR must not touch those.

## 10. ADR and reconciliation-001 records

### 10.1 ADR

- **Format:** `docs/adr/0000-template.md`. Title "NNNN. Title in the imperative"; bullets Status, Date, Deciders, PRD
  sections; sections Context, Decision, Alternatives considered (a table), Consequences, Revisit when.
- **Filename:** a kebab-case slug of the title (for example `docs/adr/0064-resolve-a-split-zips-locality-…md`).
- **No test reads `docs/adr`.**
- **Amendments** are dated sections ("## Amendment (PR …, date): …", ADR 0064 `:193`, `:409`).
- **ADR 0071 is reserved** (`/home/user/ops/LANES.md:171`). On disk at 6ddd587: the highest is 0066 (0065 is #42's).
  0067 to 0070 are claimed by 15b, db-function-diffs, superseded-rerun and model-eval-gate (`LANES.md:167-170`).
- **Related existing decision:** ADR 0064 already records #7's database part, `rule_release_content_span(release)`, for
  the per-code MPPR, the general MPPR and the MUE ("The content a release has loaded (audit #7)",
  `docs/adr/0064-…md:300-308`). ADR 0071 should cite it, not restate it. ADR 0062 (#31's screening cache) is a #42
  file, but ADRs are shared under rule 6 (task text), so an amendment is allowed and the PR merged second resolves it.
- **Tests on the existing span function** are in `packages/db/src/location.db.test.ts:290` and
  `packages/db/src/screening.db.test.ts:2779-2812`. Both are #42 files (`pr42-files.txt:123,134`), so put new span tests
  in a **new** test file.

### 10.2 reconciliation-001

- **Where release-operations sits:** nowhere yet. `docs/product/reconciliation-001.md` has no "release-operations"
  entry (grep). The combined audit places it "before PR 7" (`/home/user/ops/audits/combined/combined-report.md:44,65`).
- **The precedent for a Lane B series inserted in the list** is "**The CI series, after PR 6 and before PR 7**
  (*added 2026-10-25*; …)" (`reconciliation-001.md:141-146`), between items 6 and 7. Add a "**Release content checks,
  before PR 7** (*added <date>*; items #7, #30, #31, #59, adopted 2026-10-20; ADR 0071)" paragraph there, naming #8 as
  Lane A's load path.
- **How an exception is recorded:** as an indented italic ruling bullet under the check it relaxes. The PR 5 trigger is
  the model (`reconciliation-001.md:463`): "*Ruled by the founder, Tyler Williams, on October 22, 2026: accepted as an
  exception to this check* (quote) …", then what exactly it allows, "The exception covers … as it stands", and
  "Recorded in ADR …".
  - Another example: F6 under the milestones check (`:478`).
  - #30's goes under `- \`tools/verify-content\`, \`.claude/hooks/protect-content.sh\` and
    \`.github/workflows/publish-content.yml\` are unchanged.` (`:461`).
  - Its wording should say: granted by the founder's adoption of the combined audit, 2026-10-20 ~15:10 UTC (19 freeze
    exceptions; `/home/user/ops/HANDOFF.md:338`), as "Content checker and importer: added refusals only"
    (`combined-report.md:470`).
  - Name the files: `tools/verify-content/check.ts` and `packages/rules/src/import.ts`, plus `tools/release/assemble.ts`,
    which is not frozen but which #30 names.
  - State that `protect-content.sh` and `publish-content.yml` stay as they are (F4 apart).
- **The rule-table DDL check** (`:462`) stays untouched: no migration.
- **The CI series description** (`:141`) and "What must not change, as checks" (`:440-486`) are what the verifier
  re-proves.

### 10.3 Test-matrix note

In the RCC intro paragraph, say which items each row asserts, ADR 0071, and that RCC-01 to RCC-08 are Lane B's
reservation (the CI intro, `test-matrix.md:210-212`).

## 11. Where each item's tests go (files free of #42 unless marked)

| Item | What | Test file (vitest project) | #42? |
|---|---|---|---|
| #30 | checker refusals: coverage loss against the previous release, gaps inside a type, quarter windows | `tools/verify-content/check.test.ts` (unit; describe "checkContent on releases" `:264`, "this repository" `:365`) | no |
| #30 | importer: the quarter from the file, cross-checked, windowed | `packages/rules/src/import.test.ts` (unit; "applies the effective window options" `:170`) | no |
| #30 | assembler refusals | `tools/release/release.test.ts` (unit; `release:assemble` `:92`) | no |
| #30/#7 | the 900007 fixture is exact and "nothing else changed" | `tools/release/release.test.ts:438-516` | no |
| #7 | span helper (pure) | new `apps/worker/src/price/*.test.ts` (unit). The new source file changes `watched-paths.txt` (§5.1) | list yes |
| #7 | the month refused "waiting on content", fixed fee prices, a covering release prices | `apps/worker/src/price/price.db.test.ts` or a new `*.db.test.ts` (db), with `pricing-world.ts` loading 900007 | no |
| #7 | monitor waits, then plans again | `apps/worker/src/monitor/*` tests (db) | no |
| #7 | triage hold | `packages/triage/src/*.test.ts` (unit), `apps/worker/src/triage/triage.db.test.ts` (db) | no |
| #7 | Coverage wording | `apps/web/src/lib/routes/coverage.ts` tests; a route test runs in the generated route-test files (`apps/web/src/lib/routes/route-tests/*`; CI-02 partition, `registry.ts:453`) | check `routes/index.ts` (#42) if a route is added |
| #31 | keyed fetch, fail-loud reader | `apps/worker/src/price/keyed-release.test.ts` (unit, exists) | no |
| #31 | weekly real-size run | new workflow plus `workflows.test.ts` (CI-10 table); harness built on `tools/release/scale.ts` (900100) | `tools/screening-capacity/{run,report}.ts` are #42 |
| #59 | calendar data and its pure evaluation | new `tools/content-calendar/*` (unit); data under `docs/product/` or `content/` (not `content/releases`) | no |
| #59 | daily platform job, alarms, console "Content due" | `apps/worker/src/jobs/platform.ts`, `platform/wiring.ts`, `infra/lib/constructs/monitoring.ts`, `routes/console.ts` | **yes: later PR** |
| all | registry and matrix | `packages/synth/src/fixtures.test.ts` (unit) | shared (rule 6) |

`assertedBy` paths must exist at commit time (`fixtures.test.ts:57-63`).

## 12. The full local suite (lane-b.md) and what applies here

### 12.1 The rule

The suite runs once, in the fix round, every heavy step under `flock /tmp/laneb-heavy.lock`
(`/home/user/ops/lanes/lane-b.md:212-214`). The exact list, as the Lane B fix rounds ran it
(`/home/user/ops/workflow-scripts/lane-b-ci-speed-fix-wf_074459f2-b14.js:65`, `lane-b-pr15-fix-wf_bc33f972-a3a.js:35`,
`lane-b-ci-mutation-fix-wf_877c195a-66e.js:72`), each prefixed with
`export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH`.

### 12.2 The commands

| # | Command | Applies? |
|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | yes |
| 2 | `pnpm check:fixtures` | yes (900007, `expected.json`, any pin) |
| 3 | `pnpm typecheck` | yes |
| 4 | `pnpm lint` | yes |
| 5 | `pnpm lint:logs` | yes (new log calls; allowlist §6) |
| 6 | `pnpm lint:copy` (also inside `pnpm test`; PR 5's list ran it alone, `workflow-scripts/co-001-pr-05-round-4-review-wf_c851231c-1ca.js:46`) | yes (Coverage, refusal and console wording) |
| 7 | `pnpm verify-content` | yes (must pass; #30 changes the checker) |
| 8 | `tools/check-releases-immutable.sh <merge base>` | yes |
| 9 | `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts <merge base>` | yes (must be clean, with no exception) |
| 10 | `pnpm synth --all && git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"` | yes (RCC `expected.json` files) |
| 11 | `pnpm synth --large` | yes (unchanged) |
| 12 | `CI=true pnpm test` (unit with coverage; the differential test needs `ENGINE_FREEZE_BASE=<merge base>`) | yes |
| 13 | `pnpm test:golden` | yes (`fixtures/golden` unchanged) |
| 14 | `pnpm test:oracle` | yes (unchanged) |
| 15 | `pnpm licenses:check` | yes |
| 16 | `actionlint .github/workflows/*.yml` | yes if a workflow is added; run anyway |
| 17 | `pnpm exec tsx tools/screening-capacity/watched.ts --write`, then `git diff --exit-code` | only under §5.1 (b) |
| 18 | `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm db:migrate`, then `pnpm test:db --shard=k/6` for k=1..6 one after another (`docs/runbooks/ci.md:161-162`; lane-b.md:214) | yes (catalog and cross-tenant must pass; `rule-tables.db.test.ts`) |
| 19 | `pnpm db:domain-model --check --strict --require-approval` on a freshly migrated scratch database | yes (proves no migration and no drift) |
| 20 | `pnpm build`; `pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"`; `E2E_PREBUILT=1 pnpm test:e2e` (51 journeys; database `tp_e2e`, port 3100 from `apps/web/e2e/env.ts:15,22`; admin URL from `DATABASE_URL`, `:41`; `--workers=2` under the lock) | yes (Coverage and pricing pages) |
| 21 | The mutation canary and the affected shards (pricing ×3, packets ×2 if 900007 or `packages/rules` changes), then the gate (§7 commands) | yes, the affected ones |
| 22 | `pnpm screening:capacity` | no, locally. CI's gate measures if a watched path changed (§5.2) |

### 12.3 Counting

Take counts from CI's totals or a full run, never `vitest list` (`lane-b.md:233`). The test:db baseline at 6ddd587 is
9,049 + 1 skipped. Unit is 4,664 + 3 skipped at PR 15's close (`lane-b.md:499-500`).

## 13. How Lane B designs are structured (for the contract)

- **`/home/user/ops/designs/lane-b-ci.md`:** 0 In one screen; 1 Goal and acceptance (measurable); 2 The split; 3 Per
  PR (What changes, Files, Tests, Documents, Required checks, Acceptance); test-matrix rows; 4 Builders and integrators;
  5 Interplay with Lane A; 6 Local verification limits; 7 Founder questions (one batch, recommended first); 8 Migration
  check; 9 Risks and rollback; 10 Departures from scouts; 11 Open items; 12 Evidence index; 13 Review (`lane-b-ci.md:27-1623`).
- **`/home/user/ops/designs/lane-b-pr15-ledger-tests.md`:** 0 In one screen; 1 What exists; 2 The probe; 3 The owner's
  question; 4 Scope; 5-6 per row (fixture, test, oracle); 7 Rows; 8 Documents, and why no ADR; 9 Checks; 10 Boundary
  with the next PR; 11 Conflicts (rule 6); 12 Risks; 13 Alternatives; Appendix A pre-validated code; Appendix B numbers.
- **The PR description** follows `.github/pull_request_template.md`: What changes; Why; What it does not change (engine,
  ledger, schema, content releases, domain model, CI); Checks table; Reviewer agents' findings; Freeze exception;
  Domain model; The founder's approval.
  - For this PR, "Freeze exception: Yes: #30's content-checker and importer refusals, granted 2026-10-20 ~15:10 UTC,
    recorded in reconciliation-001 and ADR 0071".
  - Reviewer agents: payment-engine-reviewer, because #7 touches price planning and triage (`.claude/agents/`).

## 14. Overlaps with parallel sessions

| Session | Shared files with this PR |
|---|---|
| ci-deps | `tools/test/workflows.test.ts`, every `.github/workflows/*.yml` (`publish-content.yml` pins under F4), `docs/runbooks/ci.md`, `tools/screening-capacity/watched-paths.txt`, ADR 0066, `packages/compliance/src/controls.ts`, `test-matrix.md` CI-11..14, `registry.ts` and `matrix.ts`, worker Dockerfile (any #31 heap flag) (`lane-b-ci.md:755-795`) |
| superseded-rerun | `apps/worker/src/price/rerun.ts` and `rerun.db.test.ts` (#7's "a re-run under a still-lapsed release fails"), `pricing-world.ts`, possibly a fixture release number, `test-matrix.md` PRC-25..28, `registry.ts` and `matrix.ts` |
| db-function-diffs | `test-matrix.md` (DBF-01..05, a new module), `CASE_MODULES` and `MODULE_NUMBER` (`types.ts:9`, `common.ts:18`); see notes |
| model-eval-gate | `test-matrix.md` and the registry (MOD rows) |
| pr-15b-ledger-payment-terms | `test-matrix.md` LED-14..18, `registry.ts` and `matrix.ts` only |
| #42 (Lane A) | `test-matrix.md` (SCR-21, SCR-22, SEC-18, SEC-19, JOB-05), `registry.ts` and `matrix.ts`, ADR 0062 and 0065, reconciliation-001 (rule 6); `watched-paths.txt` and `fields.ts` (hard) |

## 15. Risks found

1. A new worker, rules, triage or verify-content source file silently requires `watched-paths.txt` (a #42 file). The
   failure shows only as `watched.test.ts:18` red (§5.1).
2. A new log field fails `lint:logs` without `fields.ts` (#42) (§6).
3. Editing a remedy text breaks three word-for-word tests and the closed-list check (§9).
4. Any `packages/rules` change runs the pricing and packets mutation shards and the screening-capacity measurement:
   longer CI, and possibly score movement (§5.2, §7).
5. The differential test prices head rules against base rules, so a keyed reader that answers differently is caught as
   an engine change (§4).
6. `MODULE_NUMBER` collides with another new module (DBF) if both take 13 (§1.3).
7. 900007 is taken by superseded-rerun before this PR's claim reserves it (§2.2).
