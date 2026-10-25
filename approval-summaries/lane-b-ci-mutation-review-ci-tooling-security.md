# Review: draft PR #44 (co-001/ci-mutation), the mutation tooling, its workflow and its security

- Reviewer: adversarial reviewer, CI tooling and security lens
- Head reviewed: 9099fac075f9072b9a30aaa0e050fe032f8a8a7d against claude/build-platform 49514e8
- Where: a fresh clone at `scratchpad/ci-mutation/review-ci-tooling-security`, `pnpm install --frozen-lockfile --prefer-offline` (exit 0), plus a trial merge with `origin/co-001/ci-speed` (b5ff4c7) in a scratch worktree. I made no commit, push or GitHub comment. Both the clone and the worktree are removed. My scripts and logs are in `scratchpad/ci-mutation/rsec-tools/`.
- Result: 1 blocking, 6 should-fix and 7 nit findings. The gate's core arithmetic, the canary, the workflow's job graph and the documents' numbers all hold under test. The blocking hole is in `affected.ts`: a pull request that deletes or renames a money test skips mutation, and the required `mutation` check passes it as "No money path changed".

## Findings

### B1 (blocking). Deleting or renaming a money test skips mutation, and the required check passes it

- **Where:** `tools/stryker/affected.ts:238-240` (`closureOf` seeds from the files at HEAD) and `:379-388` (`affected` asks only whether a changed path is in a closure built from HEAD).
- **The problem:** a deleted file is not in HEAD's tracked files, so it is in no closure. `changeSince` lists it (`git diff --name-only --no-renames`), but nothing it is matched against contains it. The same happens to a test renamed into `EXCLUDED` (for example `x.test.ts` renamed to `x.db.test.ts`). Both are among the most direct ways to weaken kills.
- **Evidence:** `rsec-tools/affected-attacks.mts` runs `affected()` on the repository's own closures, with HEAD's file list minus the deleted file, exactly as CI would build them on a branch that deleted it:
  - delete `packages/money/src/cents.test.ts` gives NONE;
  - delete `packages/pricing/src/engine.test.ts` gives NONE;
  - delete `tools/golden-worksheet/engine.golden.test.ts` (the pricing oracle) gives NONE;
  - delete `packages/packets/src/scan.test.ts` gives NONE;
  - rename `packages/ledger/src/allocation.test.ts` to `allocation.db.test.ts` gives NONE;
  - the control, modifying `engine.test.ts`, gives pricing.

  `affected.test.ts` has no deletion or rename case (`grep -n -i 'delet\|renam' tools/stryker/affected.test.ts` finds only the lockfile helper). With nothing affected, `stryker` is skipped and `mutation` passes with "No money path changed" (mutation.yml:128-136).
- **Documents this makes false:**
  - CI-17 says "runs exactly the packages whose closure ... it changes" (`docs/product/test-matrix.md:214`);
  - ADR 0064's amendment says "a forgotten label can no longer leave one unmeasured" (`:419`).
- **Fix:**
  1. In `affected()`, also count a changed path that matches any package's `MUTATE[pkg]` or `TEST_SETS[pkg]` glob, whether or not the file still exists. This catches deletions, and renames out of the set or into `EXCLUDED`.
  2. Build each closure on the merge-base tree as well (for example `git worktree add --detach <mergeBase>`, or `git show <mergeBase>:<path>` inside `importClosure`), and use the union of the two closures. This catches a deleted helper that only a deleted test imported.
  3. Add failing-first cases to `affected.test.ts`: "a deleted test affects its package", "a test renamed to *.db.test.ts affects its package", and "a deleted helper only a deleted test imported affects its package".

### SF1 (should_fix). The gate cannot tell when a shard skipped a file

- **Where:** `tools/stryker/gate.ts:227-246`.
- **The problem:** "fully run" is judged per shard, never per file. A shard's report that leaves out some of the shard's files still passes, so the "partly-run package fails" property stops at shard level.
- **Evidence:** `rsec-tools/attacks.mts` takes the integrator's real final reports (`int/run-final`, `run-final2`) and calls `judge()` on edited copies:
  - the baseline passes;
  - the `pricing-rest` report without `trace.ts` (151 mutants) passes, with pricing at 98.46%;
  - the ledger report without `pairing.ts` passes;
  - `pricing-rest` with every file but `release.ts` passes;
  - `packets-rest` without `dates.ts`, `placeholders.ts` and `windows.ts` passes.

  Stryker's JSON leaves out files with no mutants. In the final reports these are money, ledger and pricing `index.ts`, and pricing `types.ts`. So an exact equality check is wrong, but "nothing checked" is the current state. The ADR's "A shard runs all its files" (`docs/adr/0066-...md:82`) is asserted by no code.
- **Fix:** have the gate fail when a file of `shard.mutate[pkg]` is absent from that shard's report, unless the file is in a committed `noMutants` list in `stryker/shards.json` (today those four files). Add a unit test that holds each listed file to type, export and re-export declarations only, plus a gate test that a report missing a held file fails.

### SF2 (should_fix). The gate passes when the `changes` job wrote no output

- **Where:** `.github/workflows/mutation.yml:122-136`.
- **The problem:** `if [ "$ANY" != true ]` treats an empty or garbled `any` as "nothing affected". If `changes` succeeds but writes no `any` output, `stryker` is skipped (its `if` is `== 'true'`), the guard sees STRYKER=skipped, and `mutation` passes with "No money path changed".
  - `affected.ts:467` writes outputs only when `--github-output` is non-empty. Today the workflow always passes it, so this is a fail-open path left for the next refactor.
  - `workflows.test.ts` checks the guard only by `toContain` strings, so it would not catch such a refactor.
- **Fix:** make the guard closed:
  - `case "$ANY" in true|false) ;; *) echo "::error::changes gave no verdict (any=$ANY)"; exit 1;; esac`;
  - when ANY is true, also require `SHARDS` to be a non-empty JSON array.

  Assert both in workflows.test.ts.

### SF3 (should_fix). Equivalents that rest on Unicode data are not tied to the Node version CI runs

- **Where:** `tools/stryker/equivalent/packets.json`, `readable.ts`'s three NFKC records; `docs/runbooks/ci.md:89-90`; `mutation.yml:53,84,151`.
- **The problem:**
  - Those three records' reasons say "on Node 24's Unicode 17.0 data".
  - The runbook says "the reviewer checks it over every code point on the Node version CI runs".
  - The workflow pins `node-version: 24`, which floats. Run 40195705539 (job 121175950324, setup-node: "Found in cache @ /opt/hostedtoolcache/node/24.21.0") ran Node 24.21.0. The integrator's code-point checks ran on 24.22.0 (`node -p process.versions.unicode` gives 17.0, ICU 78.3).
  - If a later runner image's Node ships other Unicode data, a record can silently stop being an equivalent. The gate still matches it by key and passes.
- **Fix:**
  - Give each such entry a machine-readable Unicode version: a `unicode` field, or a list in gate.ts.
  - Have the gate fail when `process.versions.unicode` differs, naming the entries to check again with the integrator's scripts.
  - And/or pin an exact Node version in mutation.yml (`node-version-file` with an exact `.nvmrc`).

### SF4 (should_fix). The data-file completeness scan misses common path forms

- **Where:** `tools/stryker/affected.ts:186-197` (`dataLiterals`).
- **Evidence:** run through `affected-attacks.mts`, `dataLiterals` returns `[]` for each of these forms:
  - `` `${REPO}/fixtures/synthetic/CAS-01/expected.json` ``;
  - `new URL('../../../fixtures', import.meta.url)`;
  - `path.join(repositoryRoot(), 'fixtures', 'golden')` (nested parentheses);
  - `const DIR = 'fixtures'; readdirSync(path.join(root, DIR))`.

  A test that reads a fixture in one of these ways passes the guard, and a later change to that fixture affects no package. Today's readers are all caught (closure grep in `rsec-tools`), so the gap is latent. But this scan is the mechanism the design relies on (§3.4.1, "a test that ... fails on one the list does not cover").
- **Fix:**
  - Match a data root after `/`, `}` or a quote, inside template literals and `new URL(...)`.
  - Allow nested calls in `join` and `resolve`.
  - Add a backstop: any closure file that calls an fs read API (`readFileSync`, `readdirSync`, `readFile`, `createReadStream`, `statSync`, `existsSync`, `opendir`) must be named in `DIRECTORY_READS` or by a `DATA_FILES` entry's reader, or the changes job fails.
  - Add each form above as a test case.

### SF5 (should_fix). The rule-6 recipe for ADR 0066 loses Part 4's provenance

- **Where:** build summary, "Rule-6 merge with ci-speed": "keep ci-speed's header and Parts 1 to 3; replace its Part 4 placeholder ...; drop this branch's header".
- **The problem:** this branch's header holds facts the Part 4 body does not:
  - the founder's F6 ruling of 2026-10-25, relayed by the co-founder, in Deciders;
  - "Part 4 amends 0064 and 0047";
  - PRD 17 (milestone 6's check);
  - test matrix CI-15 to CI-17;
  - ADR 0047.

  ci-speed's header (b5ff4c7) names only Part 1, 0010, 0063 and CI-01 to CI-10. Dropping this header loses the ruling's record from the ADR.
- **What a trial merge showed:** `git merge-tree --write-tree origin/co-001/ci-speed 9099fac` conflicts in six files. Resolving them by the recipe in a scratch worktree, then running `vitest run --project unit tools/test tools/stryker tools/screening-capacity tools/typecheck tools/engine-freeze/check.test.ts packages/synth tools/brand-colors tools/brand-copy`, gave 51 files and 722 passed. `actionlint` was clean, and `pnpm synth --all` wrote 0 of 459. So the code merge is mechanical and only the header is lossy.
- **Fix:** fold the header facts into ci-speed's header lines (Status, Deciders, PRD sections, test matrix, ADRs) rather than dropping them, and note this in the build summary's hand-over.

### SF6 (should_fix). The closure's import resolver does not resolve every workspace package

- **Where:** `tools/screening-capacity/watched.ts:94` and `:106-107`, which `affected.ts` relies on.
- **The problem:**
  - `importClosure` knows only `apps/*` and `packages/*`, and only string or `{import, default}` exports. It handles no `node` condition, no arrays and no `./*` patterns.
  - `vitest.mutation.config.ts` aliases every `pnpm-workspace.yaml` package (`infra`, `tools` as `@tp/tools` with `./workspace`, `tools/stryker/canary/lib`), with conditions and `*` patterns (`@paidwhole/brand/assets/*`).
  - So a money test or source that imports `@tp/tools/workspace` or `@paidwhole/brand/assets/x` would resolve to nothing in the closure, and changes there would affect no package. There is no instance today (closure scan in `rsec-tools/closures.mts`).
- **Fix:**
  - Resolve with the same `workspaceDirectories` and `importTarget` as the aliases: share one module, while the watched list test keeps its list unchanged.
  - Make the changes job fail on any workspace-scoped specifier in a closure that resolves to no file.

### Nits

- **N1. The gate accepts a self-review and a future date.** It takes `reviewedBy === proposedBy` and a `reviewedOn` in the future (attacks.mts: "reviewedBy equals proposedBy" PASS, "2099-12-31" PASS; `gate.ts:166-173`). ADR 0066 Part 4 says "only an independent reviewer fills them". Fix: refuse equal names and dates after the run's UTC date.
- **N2. The ledger's data glob is too broad.** `DATA_FILES.ledger` is `fixtures/synthetic/**` (`affected.ts:57`), so every synthetic fixture change runs the money-ledger shard. The PR's own changes log, job 121175950324, shows "ledger: affected by ... fixtures/synthetic/CI-15/expected.json (data its run reads)". templates.test.ts reads five named files (`fixture('LED-04/posting-export.csv')` and so on). Fix: name them through `DIRECTORY_READS`.
- **N3. The tooling's own third-party packages are not tracked.** `tsx` (which runs gate, affected, shards and verdict) and `yaml` (affected.ts's lockfile parser) are outside `TEST_TOOLING` (`affected.ts:65`), and the global entry points' bare imports are not tracked. A bump of either runs nothing on the pull request. Fix: add the global entry points' third-party imports, and `tsx`, to the tooling set.
- **N4. ADR 0047's amendment gives only the old score.** It states only the pre-PR packets score, 85.40% (`docs/adr/0047-...md:108`). §3.4.2 asks for "today's score": 95.87% (2,299 of 2,398), as ADR 0066's table gives it.
- **N5. The rule-6 notes list the lockfile and miss two stale lines.**
  - The build summary lists "the lockfile" as shared with ci-speed, but `git diff --name-only 49514e8 origin/co-001/ci-speed` has no `pnpm-lock.yaml`.
  - After the merge, ci-speed's ADR Part 1 line 193 still says mutation's triggers include "labels".
  - Its test-matrix intro still says "CI-11 to CI-20 are reserved for the series' later pull requests" (ci-speed `test-matrix.md:207`).
  - Fix: update both lines in the merge.
- **N6. The gate silently ignores two kinds of stray report.** `readShardResults` (`gate.ts:378-396`) ignores files at the top level of `reports/mutation`, and a package report in a shard that does not hold that package (attacks.mts: money.json placed in packets-scan, PASS). Fix: report both as stray.
- **N7. A heading-level mismatch after the merge.** ci-speed's Part 1 uses `##` headings (`## Context`, `## Decision (Part 1 ...)`), while this Part 4 nests `###` under `## Part 4`. Consider one level per Part when merging.

## Checks done (command and result)

| Check | Command | Result |
|---|---|---|
| Clone and install | `git clone ...; git checkout 9099fac; pnpm install --frozen-lockfile --prefer-offline` | exit 0 |
| Gate baseline on the real final reports | `pnpm -s exec tsx tools/stryker/gate.ts <copy of int/run-final + run-final2> --expected '<six>'` | money 97.00% (227/234), pricing 98.57% (1932/1960), ledger 98.13% (1633/1664), packets 95.87% (2299/2398); "mutation gate: passed" |
| Gate attacks | `pnpm -s exec tsx rsec-tools/attacks.mts` | a file missing from a shard report PASSES (SF1); self-review and future date PASS (N1); stray package report PASSES (N6); Survived turned load-failure RuntimeError FAILS through the equivalent check |
| Negative proof (acceptance step 4) | delete `cents.test.ts:224`; `TP_MUTATION_SHARD=money-ledger pnpm stryker run stryker/money.config.mjs` (32 s, under flock); gate | exit 1, "money: unexplained Survived packages/money/src/cents.ts:83:26 StringLiteral ... #1", money 96.58%; row restored |
| Canary on the head | `pnpm stryker run tools/stryker/canary/stryker.config.mjs; verdict.ts --shard money-ledger` | 5 of 5 |
| Canary without aliases | `vitest.mutation.config.ts` alias set to `[]` | case 3 NOT as expected (two NoCoverage), 4 of 5 (ADR's claim holds) |
| Canary without seed | `setupFiles: []` | case 4 NOT as expected (Survived), 4 of 5 (ADR's claim holds) |
| affected on concrete diffs | `pnpm -s exec tsx rsec-tools/affected-attacks.mts` | deletions and renames give NONE (B1); a tools/package.json edit gives pricing; a golden fixture deletion gives pricing; the dataLiterals misses (SF4) |
| Closure scan | `rsec-tools/closures.mts` | uncovered 0 for every package; no unresolved workspace import today |
| CI run 40195705539 on 9099fac | GitHub MCP list_workflow_jobs / get_job_logs | 8 jobs success; canary steps 5-10 s; shards 3:36-6:12; gate "mutation gate: passed"; GITHUB_TOKEN Contents read; Node v24.21.0 |
| Workflow contract | read mutation.yml; workflows.test.ts mutation block | triggers exact (push build branch, pull_request default types, weekly cron, dispatch; no pull_request_target); concurrency `${{ github.workflow }}-` and cancel only for pull requests; timeouts 5/30/10; `if: always()` gate; `stryker` `if` on any; `fail-fast: false`; canary right after install; upload with `overwrite: true`, `if-no-files-found: error`; `permissions: contents: read`; pinned SHAs equal the release workflows' |
| Trial rule-6 merge | `git merge-tree --write-tree origin/co-001/ci-speed 9099fac` | 6 conflicts (ADR 0066, test matrix, runbook, matrix.ts, registry.ts, workflows.test.ts); 11 other shared files auto-merge |
| Merged tree, recipe applied | `flock ... vitest run --project unit tools/test tools/stryker tools/screening-capacity tools/typecheck tools/engine-freeze/check.test.ts packages/synth tools/brand-colors tools/brand-copy` | 51 files, 722 passed |
| Merged tree | `actionlint .github/workflows/*.yml` | clean |
| Merged tree | `flock ... pnpm -s synth --all` | 190 cases, 0 written, 459 unchanged |

## Cache and artifact poisoning (lens 4)

- Pull request runs restore the base branch's pnpm store and save only to their own `refs/pull/N/merge` scope. Job 121175950324 shows "Cache mode: write", which writes to that scope only. Push runs on claude/build-platform cannot restore it.
- Artifacts are per run, and the gate downloads only `mutation-*` from its own run.
- There is no `pull_request_target`, and no secret is used.
- Nothing a pull request writes reaches a push run. The residual risk is inherent to `pull_request`: the PR's own `affected.ts` and gate decide its PR run, so a PR that edits them must be caught in review. The push run after merge measures every package regardless.

## The rule-6 merge with ci-speed, file by file (lens 7)

| Shared file | Trial merge | Mechanical? |
|---|---|---|
| README.md | auto-merges | yes |
| ADR 0064 | auto-merges | yes |
| ADR 0066 | add/add conflict | text yes; header recipe lossy (SF5); fix the "labels" line (N5) |
| reconciliation-001 | auto-merges | yes |
| test-matrix.md | conflict | yes (rows after CI-10, drop heading); update the "reserved" sentence (N5) |
| docs/runbooks/ci.md | add/add conflict | yes (append the mutation section) |
| package.json | auto-merges | yes |
| synth args.ts, common.ts, expected/types.ts, fixtures.test.ts, write.ts | identical hunks | yes |
| synth matrix.ts, registry.ts | conflict | yes (keep both blocks in ID order) |
| tools/test/workflows.test.ts | 2 conflicts | yes (this mutation block; table line `{ changes: 5, stryker: 30, mutation: 10 }`); all 722 tests pass |
| vitest.config.ts | auto-merges | yes |
| pnpm-lock.yaml | not changed by ci-speed b5ff4c7 | n/a (N5) |
