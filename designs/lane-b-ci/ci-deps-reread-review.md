# Review: ci-deps, §3.2 re-read at 6ddd587 (2026-10-26)

- **What was reviewed:** `designs/lane-b-ci.md` §3.2, from "### 3.2" to "### 3.3", §3.2.6 included, with the
  cross-references it names (§3.5 CI-11 to CI-14, §5, §7 F1 to F7, §9).
- **Against:** `claude/build-platform` at 6ddd587 (the main checkout, clean); GitHub through `gh api` GET only; the npm
  registry; raw.githubusercontent.com; `git ls-remote` and depth-1 tag fetches; the pnpm 10.34.8 tarball; dependabot-core
  at main 7c06280 (2026-10-25 16:54 UTC). Read-only: nothing installed, built, tested, committed or posted.
- **Method:** assume each claim wrong until the code or the network proves it. Each finding below was confirmed by
  a command; the progress file is `scratchpad/ci-deps-progress/review.jsonl`.

## Verdict

The section is close, and most of it holds: every action SHA, tag date, image digest, npm date, peer range and runner
minute I re-read matches, and every ruling is honoured in substance. It should not go to builders as written. One
co-founder question (CQ1) rests on a wrong mechanism. Fourteen should-fix findings would each make a builder or the
verifier hit a red test or an unmeetable acceptance step, leave a ruling's letter unrecorded, or leave a both-lane outage
mode unhandled. None needs a migration or touches the engine, the ledger or the content pipeline beyond F4.

## Blocking

### B1. CQ1 (b) misstates the gate Dependabot passes to pnpm, so the co-founder's security trade-off rests on a wrong premise

- **Claim in §3.2.6, CQ1 (b):** under 2026-10-24's values Dependabot "passes a 7- or 14-day gate to pnpm", so minor-only
  and major groups "fail with no PR whenever any locked direct dependency is younger than 7 or 14 days, which after a
  weekly merge cycle is most weeks".
- **Evidence:** dependabot-core main 7c06280, `npm_and_yarn/lib/dependabot/npm_and_yarn/file_updater.rb:500-514`,
  `selection_cooldown_days` ends `[semver_days, cooldown.default_days].min`. Each dependency's gate is capped at
  `default-days`. Under (b) (default 7, major 14, minor 7, patch 3) the gate is 7 days for a minor-only or major group,
  never 14. The versions scout said "capped at `default-days`" and then "a majors-only update gets 20,160", a
  contradiction the design carried in.
- **Why it matters:** with a 7-day cap, last week's Thursday batch is at least 10 days old at the next Thursday run.
  So (b) fails silently only after a hand bump, a lane PR adding a fresh dependency, or a security exclude in the
  past 7 days. That is far from "most weeks", and it changes the comparison Q3 asks the co-founder to make.
- **Fix:** rewrite (b): selection 7/14/7/3 days, pnpm gate `min(semver, default)` = 7 for minor-only and major groups,
  failing while any locked direct dependency is under 7 days old. Keep (a) recommended if the reasons still hold
  (no silent failures, one number equal to F2 (b)), and state (a)'s cost against the corrected (b). Correct it before
  CQ1 goes to the co-founder.

## Should fix

### S1. Making `docker-compose.yml` a watched path breaks a ci-speed test unless the capacity push trigger gains it

- **Evidence:** `tools/screening-capacity/watched.test.ts:82-91` ("is inside what a push to the build branch measures")
  requires every line of `watched-paths.txt` to match a `push.paths` glob of `screening-capacity.yml` (`:31-44`), and
  `workflows.test.ts:607-621` holds that list exactly. Neither includes `docker-compose.yml`. §3.2.2 lists
  `screening-capacity.yml` for "pins" only.
- **Fix:** add `docker-compose.yml` to `screening-capacity.yml`'s push paths and to `workflows.test.ts`'s `pushPaths`, in
  §3.2.2 and §3.2.3. A merged compose bump then measures on push too.

### S2. The dry run's upload contradicts the rule that holds it equal to release.yml

- **Evidence:** §3.2.1 gives the dry run's upload `overwrite: true` and retention 1 day. The rule holds every shared step
  "equal in `uses:` and `with:` keys". release.yml's upload (`release.yml:110-117`) has `name`, `path`,
  `if-no-files-found`, `compression-level`, `retention-days` and no `overwrite`.
- **Fix:** name the allowed differences (`overwrite`, `retention-days`'s value, `name`'s value), or add
  `overwrite: true` to release.yml's uploads too (a re-run of a tag's failed build job otherwise conflicts on an
  existing artifact name, as ADR 0066:96-97 found for ci.yml).

### S3. The offline release rule needs data that only a networked check produces

- **Evidence:** the release rule in `workflows.test.ts` (an offline unit test) must check "every action that
  `check-action-pins` reports as gating a nested cache". That report comes from raw.githubusercontent.com. Nothing
  committed links the two.
- **Fix:** see S4: a committed `tools/check-action-pins/verified.json`, verified live by `check-action-pins` and read
  offline by `workflows.test.ts`.

### S4. `check-action-pins` makes a required check depend on GitHub's network every run, and fails both lanes on a re-tag

- **Evidence:** it runs in `static`, under `all green`, and re-reads each pin's tag (`git ls-remote`) and `action.yml`
  on every run, failing closed after three tries. A moved upstream tag (as in the trivy-action incident) or a rate limit
  then turns every pull request of both lanes red, though a moved tag cannot change what a SHA pin runs. An
  `action.yml` at a SHA never changes.
- **Fix:** commit the verified facts per `action@sha` (tag, declared inputs, nested refs, cache gates). Go to the
  network only for pins the change adds or moves; a moved tag on an unchanged pin is a warning. This also closes S3.

### S5. Acceptance 4 cannot hold after a rule-6 merge

- **Evidence:** §3.2.5 step 4 measures `git diff --numstat <mb> <first>` and counts at `<mb>`. Once the build branch is
  merged into the PR (F7 requires it up to date; #42 or another PR may merge first), the merge base moves past the first
  commit's parent, and the diff includes the other PR's lockfile lines reversed.
- **Fix:** measure the commit's own diff: `git diff --numstat <first>^ <first> -- pnpm-lock.yaml`, and the counts at
  `<first>^` and `<first>`.

### S6. Dependabot never bumps `packageManager`, so "Dependabot moves us to it later" is false

- **Evidence:** dependabot-core 7c06280 parses only `dependencies`, `devDependencies` and `optionalDependencies`
  (`npm_and_yarn/lib/dependabot/npm_and_yarn/file_parser.rb:32`). `packageManager` is read to pick the pnpm to run
  (`package_manager.rb:54`, `:296-320`) and never written.
- **Why it matters:** pnpm bumps are manual. `check-toolchain` fails on a moderate advisory in `packageManager`'s pnpm,
  so the day one is published against 10.34.8, every pull request of both lanes goes red until someone bumps it.
- **Fix:** drop the sentence. Have `check-toolchain` warn (not fail) when a newer 10.x is at least three days old. Put
  the manual bump, its cadence and the outage's remedy (a one-line `packageManager` PR, its licence check and the Docker
  derivation) in `dependency-upgrades.md`.

### S7. An expired release-age exclude blocks both lanes for no security gain

- **Evidence:** §3.2.1: `check-toolchain` "fails when the two lists differ or an entry has expired", in `static`. Once
  the excluded version is three days old, the exclude no longer changes any resolution, yet its expiry fails every open
  pull request.
- **Fix:** when an entry is added, require publish + 3 days ≤ expiry ≤ added + 7 days. Fail an expired entry on push
  runs and on pull requests that touch `pnpm-workspace.yaml` or the lockfile, and warn on the rest.

### S8. Silent Dependabot failures, the design's own main risk, have no detection

- **Evidence:** CQ1, the trust policy and #38 all end in a Dependabot run that opens no PR. Dependabot's runs are
  Actions runs with `event=dynamic` and a conclusion: `gh api 'repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic'`
  shows run 40223237798 (#38's) as `failure`. Neither runbook nor §3.2.5 reads them.
- **Fix:** put that command in `docs/runbooks/ci.md` and `dependency-upgrades.md` for the weekly triage, and make
  §3.2.5 step 10 read the conclusions of the first runs after the switch.

### S9. ci-speed's required-checks test fails on the F7 records ci-deps will write

- **Evidence:** `tools/required-checks.ts:100-113`: any tracked Markdown paragraph that names three or more of the four
  required checks in backticks outside `<!-- required-checks -->` markers fails `required-checks.test.ts`, and the marked
  files are only those at `:35-43` (reconciliation-001 is not one). `STALE_NAMES` (`:127`) also fails `supply-chain.yml`
  and "five checks" in any tracked file. §3.2.2 adds F7 records to ADR 0063 (`:480-482`), governance step 4A,
  reconciliation-001 and ADR 0066 Part 2. The design's own intro names the four checks in backticks.
- **Fix:** say in §3.2.2 that the F7 records name the ruleset ("Protect the build branch", id 25837331) and "the four
  required checks" without listing them, or list them between the markers in a file `REQUIRED_CHECK_LISTINGS` names.
  New text never names `supply-chain.yml`.

### S10. Two F7-stale passages are missing from §3.2.2

- **Evidence:** ADR 0063:494-497 ("the founder sets the ruleset with these names once ADR 0066's pull request has its
  first green push run"); `docs/runbooks/screening-capacity.md:306-318` ("Making it required") gives the steps as still
  to do.
- **Fix:** add both, each with "applied 2026-10-25 21:14 UTC (ruleset 25837331)" (and within S9's constraint).

### S11. F4's runs-on "once" is enforced only by the global runner rule

- **Evidence:** the frozen-copy rule sets `runs-on` aside for good, leaving it to the runner rule
  (`workflows.test.ts:349-360`). F4 allows the runner to change once (ci-browser). Any later global runner move would
  change publish-content.yml without touching the frozen copy or asking.
- **Fix:** keep `runs-on` in the frozen copy. ci-browser then changes it once, in the workflow and in the copy, where a
  reviewer sees an F4 edit.

### S12. F4's letter says "SHA pins at the current majors now"; the design pins the new majors without recording that

- **Evidence:** §7's F4 row, as ruled: "(SHA pins at the current majors now, by ci-deps, and Dependabot's later pin bumps
  with no further ruling)". §3.2 pins publish-content.yml at checkout v7.0.1, action-setup v6.1.0 and setup-node
  v7.1.0, as rule (b) (one version per action) requires.
- **Fix:** record the reading in §3.2.1 and reconciliation-001's F4 entry: only `uses:` refs change, which F4's
  operative clause allows; the first Dependabot bump would bring these majors anyway; the three actions run with the
  same inputs in ci.yml on every pull request. If anyone doubts that reading, it goes to the founder.

### S13. Behaviour fixes lack failing-first evidence

- **Evidence:** §3.2.3 states failing-first only for rules that "made Dependabot red", the release rule and `:686`'s
  fixture. These also fix a behaviour and are not stated failing first: the libc rule (0 fields at 6ddd587), the compose
  healthcheck's `-h` (`docker-compose.yml:16` has none), `large-zip.yml`'s `persist-credentials`, publish-content's
  timeout row and the simulated rewrite (d).
- **Fix:** state each fails on the merge base's tree. The verifier runs the new tests against `<mb>`'s files (name the
  command) and the PR description records the red run.

### S14. The simulated rewrite (A4 a) has no mechanism

- **Evidence:** `workflows.test.ts` reads workflows from disk (`workflow(file)`, `WORKFLOWS`); rule (d) must "re-run the
  workflow assertions" on rewritten text, but no way to do so is named, so A4 (a) is not checkable as written.
- **Fix:** name it, for example: copy `.github/workflows`, both Dockerfiles and the compose file with every pin and digest
  rewritten into a temporary directory, then spawn vitest on `workflows.test.ts` and `dependabot-config.test.ts` with an
  environment variable pointing there (as `collection.test.ts` spawns vitest), excluding the rewrite test itself.

### S15. The new static steps are not held by the static test

- **Evidence:** `workflows.test.ts:817-824` lists each static check that runs once after install. `check-action-pins`,
  `check-toolchain` and `pnpm audit --audit-level=high` are not added, so nothing holds A5's and A6's "on every run".
- **Fix:** add the three runs to that list in §3.2.2 and §3.2.3.

### S16. No "no test lost" count

- **Evidence:** §0's measured target applies to every PR. ci-deps replaces tests (`describe('dependabot')` with
  `dependabot-config.test.ts`, "the Postgres services" with the compose rule, the form test with rule (a)), and §3.2.5
  states no count.
- **Fix:** CI's unit count = 6ddd587's 4,996 and 1 skipped, plus the new tests, less the named replacements; golden 188,
  db 9,049 and 1 skipped, e2e 51 unchanged; read from CI's logs.

### S17. ci-deps waits for no answer to CQ1 or CQ2

- **Evidence:** Q3 sends security trade-offs to the co-founder first. §3.2.6 says the builder "writes (a) until told
  otherwise", and §3.2.5 does not hold the merge for either answer.
- **Fix:** in §3.2.5, the PR merges only after CQ1 and CQ2 are answered, with each answer and its date recorded.

### S18. The commit-date rule holds every later commit, not only resolutions

- **Evidence:** §3.2.5 step 5: "Every later commit is dated after 2026-10-26T19:18:50Z". §3.2.1 says only the bump
  commits wait. Pins, compose, docs and checks resolve nothing, and would wait about 20 hours.
- **Fix:** limit the rule to commits that change `pnpm-lock.yaml` or a resolution setting; the login pin waits until
  2026-10-26T15:11Z.

### S19. Four parallel Lane B PRs were claimed after the revision, and §3.2.2 resolves only #42

- **Evidence:** LANES.md Claims (2026-10-25 23:55 UTC): PR 15b (ADR 0067), #111, #10, and #84/#120 (an evaluation gate
  that may add a CI job). They share rule-6 documents (reconciliation-001, the test matrix, the synth registry).
- **Fix:** one line: §3.2.2's resolutions apply to any Lane B PR merged before ci-deps; a workflow such a PR adds is held
  by rule (a) and needs a CI-10 row.

### S20. Rule (c) proposes a helper that already exists

- **Evidence:** `workflows.test.ts:181` `usesAction(step, action)` matches by name and is used at 14 sites (`:764, :828,
  :855, :857, :991, :997, :1078, :1097, :1126, :1143, :1165, :1176, :1217, :1220`).
- **Fix:** name `usesAction` as rule (c)'s one helper.

## Nits

- **N1.** "25 uses ... `PINNED.*` on 23 lines and `Object.values(PINNED)` at `:1247` and `:1454`" is 24 `PINNED.*` (`:540`
  holds two) plus 2, so 26, and a `typeof PINNED` cast at `:1250`.
- **N2.** `:686` "closes a hole": today `:1247-1250` already fails an `actions/cache@<sha>` in screening-capacity.yml (not
  in `PINNED`). The hole opens only when `PINNED`'s set check goes; say rule (c) keeps the check alive.
- **N3.** #40's unit failure is cited from 10 annotations; GitHub caps them at 10 a step. Job 121259732714's log: 14 failed,
  4,974 passed, 1 skipped; the other four are `:1373` and `:1397` (through `stepIndex` `:174`), `:1447` (from `:1445`'s
  lookup) and `:1456`. All are pin-derived, so the conclusion holds.
- **N4.** publish-content's `timeout-minutes` value is never given (§3.2.2, §3.2.3), so the frozen copy and the CI-10 row
  cannot be checked. Name it and its basis.
- **N5.** `registry.ts`: CI-11 to CI-14 go between `:461` and `:462`, not under `:462`'s "The mutation workflow's" comment
  (the files scout had it right).
- **N6.** CI-12 (§3.5) asserts the `browser.json` check, which is ci-browser's (CI-18), and omits the postgres-major
  ignore ci-deps adds.
- **N7.** §3.2.5 step 7 greps four files; the design also edits `PRD.md:645`, `infra/lib/environments.ts:4` and
  `architecture.svg:1`. Use `git grep -n -i minio -- ':!pnpm-lock.yaml'`, empty.
- **N8.** Step 2 runs `tsx tools/check-action-pins`, a directory. The repository's form is a root script
  (`licenses:check` → `tools/check-licenses/index.ts`): add `actions:check` and `toolchain:check`.
- **N9.** "login v4.7.0 pinned only once three days old" is listed as pre-approved engineering, while P1 calls the same rule
  a security trade-off. The timing satisfies it anyway; drop it from the list.
- **N10.** The nested-ref list omits setup-trivy's `actions/cache/save@9255dc7…` (setup-trivy `action.yaml:100`).
- **N11.** `postgres.sh wait`: while `up` still pulls, `docker compose ps -q postgres` is empty and `docker inspect` errors
  (fatal under `set -e`); a failed `up` waits the full 120 s. Specify `set -euo pipefail`, an empty id read as "not yet",
  `up` writing its exit code for `wait` to fail on at once, and all three standard streams redirected.
- **N12.** `check-toolchain`'s pull-request base `origin/claude/build-platform` differs from ci.yml's range step and is
  wrong for a PR into another base (the launch PR). Reuse the range step's base.
- **N13.** README.md:11-12 rewritten with "pnpm 10.34.8" duplicates `packageManager` (A4 b) and goes stale; name
  `packageManager` instead. Say whether `no-duplicated-versions` scans comments (`mutation.yml:17` repeats 24.22.0).
- **N14.** Under F1 (a), publish-content.yml (`contents: write`, `setup-node … cache: pnpm`, `:28-29`) on `main` could
  restore the build branch's pnpm-store cache at the launch merge, and F4 forbids removing `cache: pnpm`. The governance
  launch step (`:556`) should switch the default back to `main` before the launch PR merges.
- **N15.** `apps/worker/src/platform/restore-drill.db.test.ts:75` says "a CI runner against the postgres:18 service";
  add it to the wording list.
- **N16.** #42's ADR 0062 hunk `@@ -1351,3 +1367,99` appends at the file's end (`:1353`), not "after `:1351`".

## Confirmed (no finding)

- **Actions:** all twelve peeled SHAs equal `git ls-remote` (`refs/tags/vX.Y.Z^{}` for the annotated action-setup and
  trivy-action tags); no newer semver tag exists for any; the tag-commit dates match in UTC (login v4.7.0
  2026-10-23T15:11:41Z, action-setup v6.1.0 2026-09-04T23:42:41Z, tag 09-05 07:26). Uses per action match (18, 15, 14, 1,
  7, 6, 7 + 4, 3, 5, 1, 4, 1). The inputs relied on exist at the new SHAs (`cache-binary` default true,
  `package-manager-cache` npm-only, `digest-mismatch`, `archive`, `overwrite`). trivy-action `action.yaml:102-146` gates
  setup-trivy and `actions/cache` on `cache == 'true'`. action-setup v6.1.0 bootstraps from its lock and self-updates in
  its own directory (`src/install-pnpm/run.ts:70, :113-114`), `cache` default false.
- **Images:** `node:24-trixie-slim` = `24.22.1-trixie-slim` = `sha256:43b9ba11…`; `24-slim` = `24-bookworm-slim` =
  `sha256:55fb5f5a…`; `postgres:18` = `18-trixie` = `18.6-trixie` = `sha256:edb0c08d…` (Hub API, 2026-10-26).
- **npm:** every target's publish time; Stryker's five 10.1.1 packages (19:17:52Z to 19:18:49.904Z) are the only locked
  versions under three days old, over all 614 (my own fetch); qs advisories need ≥ 6.16.0 (bulk endpoint: `<=6.15.3`
  and `<6.16.0`); typed-rest-client 2.3.1 pins qs 6.15.1 and Stryker core 10.1.1 needs `~2.3.0`; the peer ranges; pnpm
  latest-10 10.34.9 at 2026-10-25T17:54:00Z.
- **Trust policy:** replicating pnpm 10.34.8's `failIfTrustDowngraded` (`dist/pnpm.cjs:67168-67240`) over all 614 locked
  versions, the targets and #42's two new packages, only `semver@6.3.1` fails.
- **pnpm source:** "Lockfile is up to date, resolution step is skipped" at `:175478`; the date filter at `:66130-66139`;
  `createPackageVersionPolicy` at `:141938-142001`; no `minimumReleaseAgeStrict`, `trustLockfile` or
  `MINIMUM_RELEASE_AGE_VIOLATION`.
- **Dependabot:** `higher_release_age_gate` (`helpers.rb:144-149`); security updates pass 0 (`pnpm_lockfile_updater.rb:551`);
  `SUPPORTED_VERSIONS` includes 11 and 12; 8ac9b21 (2026-07-28) and 493da6c (2026-09-15); GitHub's table still says
  "v7, v8, v9, v10" (`supported-package-managers.md:44`); the default 3-day cooldown and the semver-days table
  (`dependabot-options-reference.md:191-196, :230-288`); `patterns` required in multi-ecosystem groups.
- **Rulings:** F1 (a), F2 (a) and (b), F3 after the merge and F4's pins, F5 (no runner change; the dry run stays on 24.04,
  §3.3.1:1362) are honoured in substance, apart from S11 and S12. Ruleset 25837331: four checks from app 15368, strict,
  0 approvals, no bypass, created 21:07:53Z, updated 21:14:05Z. `default_branch` is `main`; security updates disabled;
  0 tags.
- **Runs:** ci 38.0, 39.1, 38.1 runner-minutes (44, 45, 44 billed); #40's 48.3 (56); mutation 30.9, 35.9, 35.1; capacity
  15.6; "Initialize containers" 8 to 18 s in all 21 Postgres jobs read.
- **Code cites:** every `file:line` in §3.2.1 to §3.2.5 that I opened holds at 6ddd587, apart from N5 and N16.
- **Scope:** no migration, no change under `packages/pricing`, `packages/ledger` or the content pipeline beyond F4; the
  #42 overlap is resolved under rule 6 for every shared file (143 files, head 13f59b1, base 49514e8, draft, dirty).
- **Audit #112, whole:** majors ignored for the Node image, its types, TypeScript, Next and pg-boss; own groups for
  Playwright and the AWS SDK; security updates (F2 (a)); the runbook with Next minors, Node 24 to 26, pg-boss's
  migration in the pre-traffic task with workers not migrating, Playwright with baselines and TypeScript 7. #19's
  assert loosening, groups and licence fix are in too.
- **Pre-approved choices:** all engineering-only, apart from N9 (moot).

## Proposed improvements outside ci-deps

- **packageManager with its integrity hash** (`pnpm@10.34.8+sha512.…`), so corepack and the Docker derivation verify what
  they fetch, as the ops branch's `setup-container.sh` already does. First confirm that pnpm/action-setup's
  `readTargetVersion` and Dependabot's `package_manager.rb` accept the suffix.
- **ADR 0063:77-78 and the governance step table** say step 5 (one required approval, Code Owners review) is "set as
  soon as step 4's rulesets exist". 4A now exists with 0 approvals. When step 5 is due is the founder's to say.
- **`docs/runbooks/screening-capacity.md:3`** can name the date the weekly runs start (the F1 switch), as the files
  scout noted.
- **trivy-action v0.36.0 pins setup-trivy v0.2.6** while v0.3.1 exists: fold into P2's trivy pin rule.
