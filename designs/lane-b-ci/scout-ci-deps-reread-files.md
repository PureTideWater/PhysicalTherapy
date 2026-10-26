# Scout: ci-deps re-read, the files (§3.2 against 6ddd587)

- **Date:** 2026-10-25, about 23:00 UTC. Read-only on the repository and on GitHub (`gh api` GET only).
- **Base and head:** §3.2 was written at `49514e8`. The head of `claude/build-platform` is `6ddd587` (ci-speed #43
  `9c57d2d`, ci-mutation #44 `de8f9b5`, PR 15 #45). Every `file:line` below reads at `6ddd587` unless it says otherwise.
- **Method:** `git diff 49514e8 6ddd587` per file; `gh api` on run jobs and #42's files; `git ls-remote` and
  raw.githubusercontent.com for action inputs; `npm view` for publish times. No install, build or test ran.
- **Progress file:** `/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad/ci-deps-progress/scout-files.md`
  (every finding with its evidence, in the order found).
- **Scope:** the files §3.2.2 lists and every place §3.2.1 changes. Versions (#40's 11 updates, #33, O3) are the other
  scout's. Where this report touches a version, it only confirms a date.

## 0. In one screen

1. **Much of the pin work moved.** ci-speed and ci-mutation SHA-pinned `ci.yml` and `mutation.yml` at the old versions
   (`PINNED`'s SHAs). Tag refs are left only in `approval-of-record.yml:30,32`, `large-zip.yml:30-32` and
   `publish-content.yml:25,27,28`. `approval-of-record` is now a required check (F7), so it is the most urgent of the three.
2. **`supply-chain.yml` is gone.** ci-speed folded it into `ci.yml`: licences in `static` (`:150-151`), both images in
   one `images` job (`:467-519`). Trivy there already sets `cache: false` (`:494-495`, `:517-518`).
3. **`workflows.test.ts` moved and grew** (1,682 lines). `PINNED` is at `:77-92`, with `setupPython` added. It is used
   on 23 lines and in 2 sets. One literal is now vacuous (`:686`). Every §3.2 cite into it moved (§2.2).
4. **The compose plan still wins, with one defect to fix first.** `docker-compose.yml:16` checks health on the Unix
   socket, which ci-speed showed answers before TCP. Measured gain: 8-18 s per Postgres job, 7 jobs a run (§4).
5. **New places the change must reach:** `tools/screening-capacity/watched.ts` (compose becomes watched),
   `tools/package.json:36,38` (eslint), `.github/pull_request_template.md:4-5` (F1 (a)), `tools/test/collection.test.ts`,
   the CI-10 timeout table, and the mutation load (root `package.json` and `mutation.yml` are global inputs).
6. **Carry-ins:** ADR 0066:333 needs no edit now. The runner-minute figure is 38-39 runner, 44-45 billed, and it sits
   in three files, not one. The capacity time is about 12 to 19 minutes.
7. **F7 made 11 passages stale** in `ci.yml`, `docs/runbooks/ci.md`, ADR 0066 and ADR 0063 (§6).
8. **#42 shares 8 files with ci-deps.** Rule 6 resolves each one cleanly: no file needs a hand-merge of content (§7).
9. **Questions that are not engineering-only:** none (§9).

## 1. What changed between 49514e8 and 6ddd587, in ci-deps' paths

`git diff --stat 49514e8 6ddd587 -- .github tools package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc
docker-compose.yml '*Dockerfile*'`: 76 files, +9,789 −607.

| Path | Change | Effect on ci-deps |
|---|---|---|
| `.github/workflows/ci.yml` | +550: 9 jobs behind `all green` | Pins to bump, 3 Postgres jobs, 7 setup-node `cache: pnpm` |
| `.github/workflows/mutation.yml` | +210: `changes`, `stryker` matrix, `mutation` gate | Pins to bump; already has timeouts and node `24.22.0` |
| `.github/workflows/supply-chain.yml` | deleted | Leaves §3.2.2's list |
| `.github/workflows/large-zip.yml` | +11: TCP health options, Chromium step | Still `@v4`; its Postgres moves to compose |
| `.github/workflows/screening-capacity.yml` | one comment line (`:146`) | None |
| `.github/dependabot.yml` | header only (`:3-7`) | Carry-in at `:4` |
| `.github/pull_request_template.md` | required-checks block | `:4-5` turn stale under F1 (a) |
| `package.json` | Stryker `^10.1.1` (`:42-44`); `typecheck`, `lint` run tools scripts | Root manifest is a mutation global input |
| `pnpm-workspace.yaml` | `tools/stryker/canary/lib` (`:6-8`); patch removed | No `minimumReleaseAge` or `trustPolicy` yet |
| `pnpm-lock.yaml` | Stryker 10.0.0 → 10.1.1, patch gone, canary link | Still 3 `libc:` lines |
| `apps/*/Dockerfile` | comment only (web `:24`, worker `:19`) | `FROM node:24-slim` and `pnpm@10.28.0` unchanged |
| new tools | `tools/required-checks.ts`, `tools/test/{ci-gate,ci-chromium,db-shards,required-checks,collection}*`, `tools/lint/*`, `tools/typecheck/run.ts`, `tools/stryker/**` | §3.4 and below |

No new workflow file. No `.npmrc`. `docker-compose.yml` is unchanged.

## 2. Per file of §3.2.2, as it reads now

### 2.1 Workflows

- **`ci.yml` (544 lines).** Jobs: `static` `:31-152` (15 min), `lint` `:155-166` (15), `unit` `:168-226` (20), `db`
  `:229-311` (matrix `[1..4]`, `[1..6]` when private; 20), `domain-model` `:317-357` (10), `build` `:359-388` (15), `e2e`
  `:392-462` (needs build; `[1,2]` or `[1,2,3]`; 25), `images` `:467-519` (20), `all-green` `:523-544` (5, `if: always()`).
  - Pins at old versions: checkout v4.4.0, pnpm v4.3.0, setup-node v4.4.0, setup-python v5.6.0 (`:44`), cache v4.3.0,
    upload v4.6.2, download v4.3.0, buildx v3.12.0, build-push v6.19.2, trivy v0.36.0.
  - Caches: tsc (`:120-139`), Playwright's browsers (unit saves `:184-197`; db `:263`, e2e `:425` restore), db durations
    (`:270-311`). The header (`:3-7`) already says push runs seed what pull requests restore.
  - ci-deps adds no job. `check-action-pins`, `check-toolchain` and the second audit go in `static`, so `all green`'s
    `needs` (`:526`) and `ci-gate.test.ts` do not change.
- **`mutation.yml` (191 lines).** `changes` `:41-64`, `stryker` `:68-107`, `mutation` `:112-191`. Old pins on `:49, 53,
  54, 81, 84, 85, 100, 168, 172, 174, 181`. Its download uses `pattern` and `merge-multiple` (`:181-186`).
  `workflows.test.ts:1453-1460` requires every step's `uses` to be in `PINNED`, and `:1445` finds setup-node by
  `PINNED.setupNode`.
- **`release.yml`.** Unchanged since 49514e8. §3.2.1's cites hold: trivy `:75-91` (no `cache` input, so the default
  `true`), setup-node `cache: pnpm` `:155`, the restore `:159`, the build `:165`.
- **`screening-capacity.yml`.** One comment changed. The push trigger `:29` and the save `:192` hold.
- **`large-zip.yml`.** Tag refs `:30-32`. Its checkout keeps the token (no `persist-credentials: false`), unlike every
  `ci.yml` and `mutation.yml` job. Improvement inside scope: set it with the pin.
- **`approval-of-record.yml`.** Unchanged: `@v4` at `:30, :32`, timeout 5 (`:28`). A required check since F7.
- **`publish-content.yml`.** Unchanged since 2026-10-20, when `7ac60bc6` moved `runs-on` to `ubuntu-24.04`. It has no
  timeout (`workflows.test.ts:1527-1529` still says "until the founder's ruling ... (F4)"). `origin/main` has no copy.
- **`.github/dependabot.yml`.** Body unchanged (npm limit 5, actions 2, docker 2). `:4` carries the carry-in. `:6-7`
  ("main's copy ... is the one in force") turns false at the F1 switch. `origin/main` (`220f2b4`) still has every
  `target-branch` line and "about 35 minutes".

### 2.2 `tools/test/workflows.test.ts`

| §3.2 cite (at 49514e8) | Now | Note |
|---|---|---|
| `PINNED` `:46-58` | `:77-92` | Gained `setupPython` (`:88-89`) |
| literal refs `:404`, `:423` (`upload-artifact@v4`) | gone | Now `PINNED.uploadArtifact` |
| literal ref `:719` | `:1271` | `['actions/checkout@v4', 'actions/setup-node@v4', ...]` |
| `describe('dependabot')` `:766-790` | `:1486-1511` | Its comment (`:1503-1504`) says "about 10 minutes" |
| actionlint `:733-740` | `:1285-1293` | |
| actionlint config forbidden `:168-171` | `:355-359` | |

- `PINNED.*` appears on `:457, 469, 489, 490, 505, 540, 545, 645, 668, 682, 684, 690, 699, 710, 818, 936, 1062, 1213,
  1219, 1373, 1397, 1445, 1457`, and `Object.values(PINNED)` on `:1247` and `:1454`. Rule (c) "behaviour asserts match
  by action name" must reach all 25.
- **A latent hole:** `:686` asserts `steps.some((step) => step.uses === 'actions/cache@v4')` is false. With every action
  SHA-pinned, a pinned `actions/cache@<sha>` passes it, so it checks nothing. Rule (c) fixes it by comparing the action
  name before `@`.
- The pin form test (`:1236-1253`) reads only `release.yml`, `screening-capacity.yml` and `ci.yml`. Rule (a) over every
  workflow file closes `approval-of-record`, `large-zip` and `publish-content`.
- Tests that must change with compose: "the Postgres services" `:1606-1620` (the four jobs and their exact options), and
  `:980`, `:1042`, `:1094` (`services` keys equal `['postgres']`).
- The CI-10 timeout table (`:1513-1535`) must gain `release-dry-run.yml`'s jobs and `publish-content`'s timeout. Its
  comment `:1527-1528` goes.
- Tests that cover the new workflow with no edit: the runner (`:349-360`), concurrency (`:1537-1543`), continue-on-error
  (`:1629-1645`), and the required-check names (`:1661-1680`; the dry run's `build` and `push` collide with none).
- Version prose to move: the test name at `:1164` ("upload-artifact v4 names are unique per run"), and ADR 0066:96.

### 2.3 Toolchain

- **`package.json`.** `packageManager: pnpm@10.28.0` (`:5`). Behind §3.2's targets: next plugin `^16.4.1` (`:41`),
  coverage `^5.0.4` (`:46`), eslint `^10.12.0` (`:47`), vitest `^5.0.4` (`:54`).
- **`tools/package.json` (not in §3.2.2).** `eslint ^10.12.0` (`:36`) and `typescript-eslint ^8.71.2` (`:38`) repeat the
  root's. ci-deps' eslint 10.13.0 must reach it. Improvement inside scope: move both to the catalog
  (`pnpm-workspace.yaml:11-25`), so one line holds each.
- **`pnpm-workspace.yaml`.** No release-age or trust settings. Catalog vitest `^5.0.4` (`:24`).
- **`pnpm-lock.yaml`.** eslint 10.12.0 (`:2767`), fast-uri 3.1.8 (`:2834`), next 16.4.1 (`:3262`), postcss 8.5.30
  (`:3411`, and 8.5.23 at `:3407`), qs 6.15.1 (`:3464`), vitest 5.0.4 (`:3771`). Still 3 `libc:` lines. The entries that
  changed since 49514e8 carry no `os`, `cpu` or `libc`, so the measured 43-line `--fix-lockfile` diff should hold.
  Acceptance 4 re-measures it at the cut.
- **`apps/web/package.json`.** `next ^16.4.1` (`:39`), `postcss ^8.5.30` (`:53`). Unchanged since 49514e8.
- **Dockerfiles.** `node:24-slim` at web `:7, :17` and worker `:5, :12`; `pnpm@10.28.0` at web `:11`, worker `:6`.
- **`tools/check-licenses`.** `allowlist.json:10-12` still holds the `linuxmusl` exception. `check.test.ts` is
  unchanged. `index.ts` only rewrote a comment.
- **`docker-compose.yml`.** Unchanged: `postgres:18` (`:8`), the socket healthcheck (`:15-19`), MinIO (`:21-36`).
- **`tools/dev.ts`.** Unchanged (`:11`, `:22`).
- **`tools/screening-capacity`.** `containers.ts:223, 344, 509` and `measure.test.ts:181` still name `postgres:18`.
  `watched-paths.txt` is unchanged (514 lines). `docker-compose.yml` is **not** watched: once `containers.ts` reads the
  image from compose, `WATCHED_FIXED` (`watched.ts:61-81`) must gain it, and `watched.ts` joins §3.2.2.
- **New tools files reach ci-deps in two places.** `tools/tsconfig.json` (`**/*.ts`) and the lint groups
  (`groups.ts:42`) cover new tools directories with no edit. `tools/test/collection.test.ts` lists the CI series' new
  test files (N-6), so ci-deps' new test files join its `FILES`.

### 2.4 Documents

- **ADR 0066** (520 lines, new since 49514e8). Status `:3-13` and the Part 2 placeholder `:243-245` take Part 2. Stale
  passages are in §5 and §6.
- **ADR 0063.** Changed by ci-speed's amendment (`:484` on). F1 (a) amends `:86-88`, `:140-142`, `:146-151` and
  `:339-347`. `:480-482` ("Dates to record here") lacks the F7 date.
- **ADR 0062.** Unchanged since 49514e8; #42 changes it (§7).
- **`docs/runbooks/ci.md`** (336 lines, new). **`github-governance.md`** (93 lines changed). Both are in §5 and §6.
- **`.github/pull_request_template.md:4-5`** (not in §3.2.2 under F1 (a)). "GitHub offers this template only from main,
  which has none until launch" turns false at the F1 switch: the build branch holds the template. CLAUDE.md:54's
  "(GitHub offers it only from main)" is the template line §3.2.2 names.
- **MinIO.** Every cite holds: `README.md:37`, `CLAUDE.md:31`, `tools/dev.ts:11,22`, `PRD.md:645`,
  `infra/lib/environments.ts:4`, `docs/product/diagrams/architecture.svg:1`. `README.md:11-15` also names pnpm 10.28 and
  "CI's `postgres:18` service".
- **`docs/product/reconciliation-001.md`.** The content-pipeline check that F4 excepts moved from `:444` to `:461`.
- **Test matrix and synth.** `test-matrix.md:210-212` reserves CI-11 to CI-14. The rows go between `:225` (CI-10) and
  `:226` (CI-15); `matrix.ts` between `:289` and `:290`; `registry.ts` between `:461` and `:462`.
- **`packages/compliance/src/controls.ts`.** No change needed. ci-speed moved the supply-chain evidence into ci.yml
  (`:259-261`). It matches by whole substring (`controls.test.ts:221-235`), so pins and the added audit step pass.
  Optional: evidence rows for `check-action-pins` and `check-toolchain` under the same control.
- **§3.2's code cites hold:** `apps/web/src/lib/server/config.ts:242-252`, `apps/worker/src/main.ts:93,110,129`,
  `apps/web/src/lib/uploads/queue.ts:36`, `PRD.md:701`.

## 3. The places §3.2.1 changes: done, moved, and new reach

- **Pins.** Done in part: `ci.yml` and `mutation.yml` are SHA-pinned at the old versions. To do: bump all to §3.2.1's
  table and pin the three tag-only files. `approval-of-record` is required, so a moved `v4` tag could decide a required
  check until ci-deps merges.
- **Action inputs at the new majors** (read at the pinned SHAs). Every usage added since 49514e8 uses an input that
  still exists:
  - download-artifact v8.0.2 (`9000827c`): `name`, `path`, `pattern`, `merge-multiple` kept. New `digest-mismatch`
    defaults to `error`, which is stricter.
  - upload-artifact v7.0.2 (`cf430e03`): `compression-level`, `overwrite`, `retention-days` kept. New `archive`
    defaults to `true`.
  - setup-node v7.1.0 (`949feb24`): `package-manager-cache` defaults to `true`, but turns on only for an npm
    `packageManager`.
  - Their usages: `ci.yml:379-386`, `:430-433`, `:441-452`; `mutation.yml:100-107`, `:181-186`.
- **The release restores no cache.** `release.yml` is unchanged, so §3.2.1 holds as written. `ci.yml`'s `images` job
  already downloads Trivy's database each run. F1 (a) changes nothing for pull requests into the build branch, which
  already restore its caches as their base. It changes tag runs.
- **Timeouts.** Every job has one except `publish-content`. CI-10 must also cover `release-dry-run.yml`'s jobs.
- **F4's frozen copy, simplified and made stricter (inside scope).** F4's "once, its `runs-on`" is ci-browser's move to
  ubuntu-26.04 (design `:1425`); the timeout is ci-deps'. Proposed:
  - the frozen copy is the file at 49514e8 plus ci-deps' `timeout-minutes` line;
  - the test normalises `uses:` refs and comments, and sets aside only `runs-on`;
  - ci-browser changes `runs-on` once, in the workflow and in the frozen copy.

  A second timeout edit then fails. Acceptance: `diff` of the frozen copy against 49514e8 shows only the timeout line.
- **The weekly schedules start at the F1 switch.** `mutation.yml:23-26` (Monday 05:23, every package), `large-zip.yml:10`
  (Monday 06:17, up to 45 minutes) and `screening-capacity.yml:24-25` (Monday 06:41). Their comments ("runs once it
  carries the workflow") stay true. `docs/runbooks/screening-capacity.md:3` can name the date.
- **The mutation load (§3.2.1's load plan).** `tools/stryker/affected.ts:111-120` makes root `package.json`,
  `pnpm-workspace.yaml` and `.github/workflows/mutation.yml` global inputs, and `:108` makes vitest, `@vitest/*`,
  Stryker, fast-check and tsx test tooling. So:
  - ci-deps' own pull request runs every mutation shard (about 13-17 minutes, ADR 0066:497-498);
  - every Dependabot actions PR runs every shard, since it edits `mutation.yml`;
  - every npm PR that edits the root manifest runs every shard: `minor-and-patch` almost always does, and `next` does,
    through `@next/eslint-plugin-next`.

  §3.2.1's "five of the eight groups cost about 60" must count `next` and the actions group at about 100-110.
  Measured `ci.yml` cost: 38.0, 39.1 and 38.1 runner-minutes, billed 44, 45 and 44 (13 jobs; push runs 40201435875,
  40223130551, 40229005858).
- **Stagger (inside scope, engineering-only).** The npm batch at Monday 04:31 shares Monday morning with the three
  weekly runs. Moving npm to Thursday 04:31 spreads the load at no cost to freshness.
- **Release-age hold dates** (`npm view`): Stryker core 10.1.1 2026-10-23T19:18:22Z, so three days old at
  2026-10-26T19:18Z; next 16.4.3 2026-10-23T13:40:24Z. vitest 5.0.5 (10-15), eslint 10.13.0 (10-16) and postcss 8.5.31
  (10-18) are past it. The release-age commit lands after 2026-10-26T19:18Z, or carries a dated exclude, which also
  tests the exclude path (lanes/lane-b.md:125).

## 4. Postgres: replace `services:` with compose? Still yes

**Today.** Four `services:` blocks, each `image: postgres:18` with ci-speed's TCP health options: `ci.yml` db
(`:238-247`), domain-model (`:322-331`), e2e (`:402-411`), and `large-zip.yml:20-28`. That is 7 job instances on a public
`ci.yml` run, 10 on a private one.

**Measured** (`gh api .../runs/<id>/jobs`, three push runs):
- "Initialize containers" took 8 to 18 s in every Postgres job. It runs before checkout, on each job's path.
- After checkout, action-setup (1-2 s), setup-node (4-8 s) and install (2-4 s) take 7 to 14 s.
- In db and e2e, the browser restore (3-5 s) and Playwright's install (12-22 s) follow, before anything needs the
  database, once "Quiet the database's log" (db `:259-260`, e2e `:421-422`) moves after them.

**Gain.** About 10-15 s off each Postgres job, about 1 to 1.5 runner-minutes a run, and 9 to 18 s off the `build` →
`e2e` path, which sets `all green`'s time. The main gain is unchanged: one digest-pinned image that Dependabot's
docker-compose ecosystem updates, which CI and the capacity harness follow by construction.

**Why the alternatives still lose.**
- `services:` cannot read an image from a file.
- Four digest copies in workflows drift: Dependabot's github-actions ecosystem rewrites `uses:` only. An equality test
  goes red on every compose bump ([S4] §6).
- A job output feeding `services:` adds a job to the critical path.
- A tag-only `services:` image fails CI-13.

**What compose costs, and how to meet it.**
1. **Fix the healthcheck first (a defect).** `docker-compose.yml:16` runs `pg_isready -U postgres`, on the Unix socket.
   ci-speed found the socket answers during the image's first-run setup, before the server listens on TCP (`ci.yml:243-244`,
   `workflows.test.ts:1613`). §3.2.1's wait loop reads that health, so it could pass early. Use
   `pg_isready -h 127.0.0.1 -U postgres`. `pnpm dev`'s `docker compose up --wait` gains the same fix.
2. **The service log.** GitHub prints a service's log after the job, which is why the quiet step exists (`ci.yml:257-258`).
   Compose prints nothing. Keep the quiet step, moved after the browser install, and add an `if: failure()` step that
   prints `docker compose logs --no-color --tail=200 postgres`.
3. **One script instead of four copies (inside scope).** For example `tools/ci/postgres.sh up` (background, before
   install) and `tools/ci/postgres.sh wait` (before the first database step), used by the three `ci.yml` jobs and
   `large-zip.yml`. `workflows.test.ts` then asserts the two calls and their order. A local composite action would also
   work, but a script keeps F3's SHA rule and `check-action-pins` simple.
4. **The capacity gate watches compose.** `WATCHED_FIXED` gains `docker-compose.yml`, and `watched-paths.txt` is
   regenerated.

## 5. The carry-in nits, as they read now

| Nit | Reads now | What to write |
|---|---|---|
| ADR 0066:333, "the required `mutation` job" | Unchanged | **Nothing.** F7 makes it true: the ruleset requires `mutation`. The stale line is `:496-497` (§6) |
| ADR 0066:178-180, Part 1 "Measured" | "132 new by full name less 12 renamed (4,644 and 1 skipped on 9144b56" | "146 new less 12 renamed (4,658 and 1 skipped on CI, `b5ff4c7`)" (from the verifier; not re-measured here) |
| `.github/dependabot.yml:4`, "about 45 runner minutes" | Unchanged | "about 38 to 39 runner minutes (44 to 45 billed)". The same figure is at `docs/runbooks/github-governance.md:65` and `docs/runbooks/ci.md:135`: change all three |
| "13 to 16 minutes" for the capacity gate | `docs/runbooks/ci.md:97`, `github-governance.md:66`, ADR 0066:175 | "about 12 to 19 minutes" (measured 11:59, 15:52, 18:28, 18:32, 17:30) |

The carry-in gave 36-38 runner-minutes and 43-44 billed. The three push runs read here give 38.0-39.1 and 44-45. Pull
request runs may differ; the runbook's own commands (`ci.md:80-93`) settle it at the cut.

## 6. What F7 made stale (the ruleset applied 2026-10-25 21:14 UTC)

Present-tense passages to fix in ci-deps:
- `.github/workflows/ci.yml:52-53`: "a force push, which the ruleset of the governance runbook's step 4A blocks once the
  founder applies it".
- `.github/workflows/ci.yml:101-104`: "a direct push is blocked once the founder applies the ruleset ..., and until then
  is checked by the unit job's differential test alone".
- `docs/runbooks/ci.md:44-46`: the same sentence. `:55-56`: "once the founder applies step 4A's ruleset, it blocks those".
- ADR 0066:
  - `:91-93`: "until step 4A's ruleset blocks direct pushes";
  - `:151-153`: "Once the founder applies ...; until then nothing enforces them";
  - `:218-220`: a consequence that is now done;
  - `:496-497`: "one of the required checks once the founder applies the ruleset".
- ADR 0063:480-482: record the F7 date. It was applied on the personal account `PureTideWater`, ahead of runbook
  steps 1 to 3 (ruleset id 25837331).
- `docs/runbooks/github-governance.md`: step 4A (`:279-317`) is an instruction, so add a dated "Applied" line. The step
  table (`:26`) puts step 4 after step 2, and the check (`:350-354`) expects five rulesets, while 4B and 4C do not exist.

Dated history to keep: ADR 0066:46-47 (Context: "No ruleset exists yet") and ADR 0063:17 (Context).

Instructions that are still true, where a date is optional: `docs/runbooks/screening-capacity.md:306-318`,
`reconciliation-001.md:576`, `docs/runbooks/ci.md:18-19`, `.github/workflows/screening-capacity.yml:17`.

No passage says a check is required "only by ADR 0063's merge rule". That wording was in the lane log's carry-in, never
in the repository.

**F1 (a) passages** (ruled, applied when ci-deps merges; §3.2.2 names the files but not the lines):
- `github-governance.md:325, :330`: 4B targets "Include default branch". They must target `main` by pattern only
  (lanes/lane-b.md:167).
- `github-governance.md:394, :556, :562-620`: security updates against `main`; "Leave Default branch at `main`", which
  becomes "switch it back to `main`" at launch; Dependabot and the template read from `main`.
- `.github/dependabot.yml:6-7`; ADR 0066:231-233 (conditional on F1, now ruled).

## 7. Files ci-deps shares with #42 (LANES.md rule 6; the co-founder's Q2)

#42: 143 files (`gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1'` and `page=2`), head
`13f59b1`, base SHA `49514e8`, draft, `mergeable_state: dirty` (already in conflict with 6ddd587, apart from ci-deps).

| File | #42 | ci-deps | Resolution by the PR merged second |
|---|---|---|---|
| `pnpm-lock.yaml` | +33: web's `@aws-sdk/client-sesv2`, `@aws-sdk/client-sqs@3.1152.0`, `@aws-sdk/middleware-sdk-sqs@3.972.44` | licence commit, bumps | Re-resolve on the merged manifests (`pnpm install --lockfile-only`), never hand-merge. Both new packages are older than three days (2026-10-14, 2026-10-09), so `minimumReleaseAge: 4320` passes them. They carry no `libc`, so the licence commit's 43 lines stand |
| `apps/web/package.json` | `:17` adds `client-sesv2` | `next` `:39`, `postcss` `:53` | Separate hunks: keep both |
| `tools/screening-capacity/watched-paths.txt` | +6 closure paths | `docker-compose.yml` through `WATCHED_FIXED` | Regenerate with `pnpm exec tsx tools/screening-capacity/watched.ts --write` |
| ADR 0062 | header `:1-6`, `:863`, appends after `:1351` | appends the no-cache amendment | Keep both amendments in merge order, and merge the header lines |
| `reconciliation-001.md` | appends after `:597` | F1, F2, F4 records (and `:461`'s exception) | Keep both |
| `test-matrix.md` | SEC-18/19, SCR-21/22, JOB-05 | CI-11 to CI-14, `:210-212` | Different sections: keep both |
| `packages/synth/src/cases/matrix.ts`, `registry.ts` | JOB-05 near the JOB rows | CI-11 to CI-14 between CI-10 and CI-15 | Separate hunks: keep both, then `pnpm synth --all` |

Not shared: `apps/worker/package.json` (#42 only), root `package.json`, `containers.ts`, `measure.test.ts`,
`infra/lib/environments.ts` (ci-deps only). #42 changes no workflow, no ADR 0063 or 0066, and neither the CI nor the
governance runbook. Q2's list (lockfile, manifests, watched list, ADR 0062) is right. Rule 6's named documents add
reconciliation-001, the test matrix and the synth registry.

## 8. Improvements

Inside ci-deps (put in the design; engineering-only, pre-approved under Q3 and recorded as such):
1. Compose healthcheck on TCP (§4.1), the failure-time log (§4.2), one Postgres script (§4.3), the quiet step after the
   browser install (§4).
2. `persist-credentials: false` on `large-zip.yml`'s checkout.
3. eslint and typescript-eslint in the catalog, which removes `tools/package.json`'s copies (§2.3).
4. ci-deps' new test files in `tools/test/collection.test.ts`'s `FILES`.
5. The stricter F4 frozen copy (§3).
6. npm Dependabot on Thursday (§3).
7. Rule (c) closes `workflows.test.ts:686`'s vacuous check (§2.2).

Outside ci-deps (proposed):
- **Narrow `affected.ts`'s root-manifest input.** Parse root `package.json`, and count as global only `packageManager`,
  `engines`, `scripts.stryker` and the `TEST_TOOLING` specifiers. Other devDependencies already reach a money closure
  through the lockfile. That saves a full mutation run (about 45-55 runner-minutes) on most npm PRs. It belongs to
  `tools/stryker` (ci-mutation's area), as its own PR.
- **The ruleset survives the organization move?** Runbook step 2 moves the repository. Re-read "Protect the build
  branch" through the rulesets API after it, and put that check in step 2.

## 9. Questions that are not engineering-only

None. Every choice above is inside the ruled design and engineering-only. None trades cost, security, product or
wording.

## 10. Evidence index

- Push-run costs and service start: `gh api repos/PureTideWater/PhysicalTherapy/actions/runs/{40201435875,40223130551,40229005858}/jobs?filter=latest`.
- #42: `gh api repos/PureTideWater/PhysicalTherapy/pulls/42` and its `files` pages 1-2.
- Action inputs: `git ls-remote https://github.com/actions/<repo> refs/tags/<tag>^{}`, then
  `raw.githubusercontent.com/actions/<repo>/<sha>/action.yml`.
- Publish times: `npm view <pkg> 'time[<version>]'`.
- Not read: Dependabot run 40223237798's log. Its blob host refused the download, so the source of its
  `--config.minimum-release-age=4320` was not re-checked.
