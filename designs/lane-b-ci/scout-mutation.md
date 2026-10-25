# Scout report: mutation testing on the money code (audit #54) and the coverage gate

Lane B, the CI PR's design (wf_8628914e-6b9). Read-only research and bounded measurement on `claude/build-platform`
at 49514e8, in two detached scratch worktrees (`mutation-wt`: the repository as it is, Stryker 10.0.0 with the
patch; `mutation-wt2`: Stryker 10.1.1 with the patch dropped). Synthetic data only. Nothing in
`/home/user/PhysicalTherapy`'s working tree or `/home/user/ops` was changed; no branch, commit, push or GitHub write.
Machine: 4 CPUs shared with three other agents; load average 2 to 14 during the runs, so local times are upper
bounds. All logs and JSON reports: `scratchpad/ci-design/mut-*.log` and `scratchpad/ci-design/mutation-reports/`.

## 1. The answer in brief

- **The audit's "0%" is fixed, but the patched runner is still not faithful.** The patch (ADR 0064) makes the
  vitest runner select tests by Vitest 5's names: the canary scores 100%, and CI's one real run after it scored the
  money paths at 89.50% (run 39722600158, job 119639259201). It still reports **Survived for any mutant that makes a
  test file fail to load** (a module-level call throws): 7 of the money package's 243 mutants (2.9 points of its
  score), 21 of pricing's (20 in trace.ts, whose CI score of 76.16% is really 90.08%) and 2 of the verifier's. One
  applied by hand fails the money suite ("Test Files 4 failed (4)").
- **Stryker 10.1.0/10.1.1 (2026-10-23) fixes both upstream**: "support vitest v5" (#6214) and "report mutant
  collection failures instead of surviving mutants" (#6269). With 10.1.1 and no patch, the vitest runner agrees with
  the command runner mutant for mutant on 878 compared mutants across all four packages; the only differences are
  benign labels (Killed vs Timeout, NoCoverage vs Survived), the 7 load-failure mutants (RuntimeError, left out of
  the score, rather than Killed) and one kill that depends on fast-check's random seed (no test seeds it).
- **A second faithfulness gap, in both runners:** Stryker's sandbox links each `node_modules`, so a test that
  imports a package by name (`@tp/pricing`) reaches the original, unmutated files. The golden engine tests
  (`tools/golden-worksheet`) therefore cannot kill an engine mutant today, and are not in the mutation set at all.
  Aliasing every workspace export to the sandbox's files (generated from each `package.json` `exports`) fixes it;
  proven equal to `inPlace` on the same mutants.
- **Best runner: the vitest runner of Stryker 10.1.1 with perTest coverage**, not the command runner the audit
  proposed (it was right about 10.0.0). Equal faithfulness on the evidence, 2.5 to 6 times faster, and it names the
  test that killed or covered each mutant, which is what killing survivors needs.
- **Scores today (10.1.1, aliases, per package):** money 93.22%, ledger 92.19%, packets widened to interest,
  calculation, dates and assembly 85.40%, pricing with its golden engine tests 91.70%. Every package is above 85%,
  packets by 0.4 points.
- **Coverage:** money is not in the branch gate; its branch coverage is 98.28% (57 of 58), the one miss an
  unreachable `?? '0'` (cents.ts:85) that is also its one no-coverage mutant.
- **85% as milestone 6's and Gate 1's exit** changes PRD 17's milestone 6 check, which reconciliation-001's check
  (line 459) holds unchanged except for two named exceptions. The founder's adoption of the whole audit on
  2026-10-20 covers the substance (it is #54's own text), but the check names its exceptions, so the PR must add
  this one to the list citing that ruling; one confirming founder question is recommended (section 9).

## 2. What exists today

| Piece | What it does | Evidence |
|---|---|---|
| `stryker.config.mjs` | vitest runner, perTest, mutates `packages/pricing/src/**` (testing.ts included), `packages/ledger/src/**`, the verifier and its reader (`verifier/**`, readable, scan, facts, payer, index, placeholders); `break: 85` on the total | stryker.config.mjs:10-40 |
| `vitest.stryker.config.ts` | tests = `packages/{pricing,ledger,packets}/src/**/*.test.ts` minus db tests: includes the 100,000-line timing test and the source-reading purity test, excludes the golden engine tests in `tools/golden-worksheet` | vitest.stryker.config.ts:4-8 |
| `stryker.verifier.config.mjs` | command runner over the packets suite for the verifier alone (ADR 0047's 86.17% of 2026-10-16) | stryker.verifier.config.mjs:1-37; ADR 0047:91-102 |
| `patches/@stryker-mutator__vitest-runner@10.0.0.patch` | names a test by `fullTestName` in `test-helpers.js` and `stryker-setup.js` | patch; pnpm-workspace.yaml patchedDependencies |
| `tools/stryker/canary` | 8 runtime mutants of `lineCents`, break 100 | canary/stryker.config.mjs; mut-canary.log |
| `tools/stryker/runner.test.ts` | asserts the patched source (`fullTestName`) | runner.test.ts:36-48 |
| `.github/workflows/mutation.yml` | pull_request incl. labeled/unlabeled; runs only with the `money` label, fails an engine change without it; weekly cron that never fires (default branch `main` carries no workflows); one job, 120 min | mutation.yml:11-65; workflows.test.ts:744-762 |
| Branch gate | `BRANCH_GATED` = pricing, ledger, edi835, authz; money absent | vitest.config.ts:13-18 |
| The plan | PRD 18: "Mutation score above 85% before Monitoring v1"; CI "mutation testing on the money packages (nightly if it exceeds ten minutes)" | PRD.md:753, 764 |

**CI history (gh api, mutation.yml, 31 runs):** only 3 runs measured anything, all on PR 6b-1's engine branch with
the label: run 39712377655 (33.5 min job), run 39718069000 (89.49%, Stryker 25 min 54 s), run 39722600158 (89.50%,
Stryker 45 min 49 s, same 5,612 mutants: a 1.8x spread in time on the same code). The other 28 runs skipped in
about 10 s for want of the label. No push or scheduled run has ever happened. The money-path sources and tests are
unchanged from that run's head 65fc80e to 49514e8 (`git diff --stat 65fc80e 49514e8 -- packages/{pricing,ledger,packets,money}/src`
is empty), so its per-file scores are current for the existing set:

| Package (CI, 10.0.0 + patch, 65fc80e) | Score | Killed | Timeout | Survived | No coverage |
|---|---|---|---|---|---|
| pricing (testing.ts included) | 90.07% | 1,904 | 0 | 210 | 0 |
| ledger | 92.07% | 1,527 | 5 | 132 | 0 |
| packets, the verifier set | 86.53% | 1,583 | 4 | 204 | 43 |
| all | 89.50% | 5,014 | 9 | 546 | 43 |

Pricing by file: engine 95.20, dates 95.63, windows 89.80, recompute 86.12, trace 76.16, release 73.13, reasons
50.00, testing 94.37 (job 119639259201 log tail).

## 3. Measurements

### 3.1 The canary

| Runner | Score | Time | Command |
|---|---|---|---|
| 10.0.0 + patch | 100% (8 killed) | 9 s | `pnpm stryker run tools/stryker/canary/stryker.config.mjs` in mutation-wt (mut-canary.log) |
| 10.1.1, no patch | 100% (8 killed) | 5 s | same, in mutation-wt2 (mut-canary-10.1.1.log) |

The canary proves name selection only. It has no module-level code, no cross-package import and no property test,
so it passes while the three gaps below are open.

### 3.2 The money package: the runners compared (243 mutants)

Scratch configs mutate `packages/money/src/**/*.ts` (not tests) with the money unit tests, concurrency 4.

| Runner | Score | Killed | Survived | No cov | Errors | Time |
|---|---|---|---|---|---|---|
| vitest 10.0.0 + patch, perTest | 90.53% | 220 | 22 | 1 | 0 | 26 s |
| command (`vitest run --config <money> --bail 1`) | 93.42% | 227 | 16 | 0 | 0 | 1 min 57 s |
| vitest 10.1.1, perTest | 93.22% | 220 | 15 | 1 | 7 | 34 s |

Mutant-by-mutant diff (`node tools/diff-reports.mjs a.json b.json`, keyed by file, start, end, mutator and
replacement): 10.0.0 reports **Survived** for 7 mutants the command runner kills (cents.ts:17 x3, decimal.ts:179 x4:
the brand checks of `cents()` and `decimal()`, which module-level constants such as `ZERO_CENTS = cents(0n)` call at
import). Applied by hand (`if (true)` at cents.ts:17), the money suite fails: "Test Files 4 failed (4), Tests no
tests", exit 1. The runner collects no test from a file that failed to load and reports the run as passed
(vitest-test-runner.js mutantRun: tests = [] and the file's error is not in errorsSet). 10.1.1 reads the file
errors and returns an error status (its vitest-test-runner.js:241-252, the #6269 fix), so the mutant becomes
RuntimeError, excluded from the score. The packets run shows the same 2 mutants in readable.ts:59 (Survived on CI,
RuntimeError on 10.1.1).

### 3.3 Tests that import a package by name reach the original files

`mutate: packages/money/src/rounding.ts` with only the pricing tests (which import `@tp/money` by name):
- sandbox, as configured today: "Vitest failed to find test files related to mutated files ... No tests were
  executed" (mut-rounding-xpkg-plain.log). Stryker links `packages/pricing/node_modules` into the sandbox
  (core sandbox.js:74-99, file-utils.js:80-100), and its `@tp/money -> ../../../money` link resolves to the original.
- with `resolve.alias` mapping `@tp/money` to the sandbox's `packages/money/src/index.ts`: 10 killed, 2 survived,
  11 no coverage (mut-rounding-xpkg-alias.log);
- `inPlace: true`, no alias: the same 23 statuses exactly (diff: 0 differing; mut-rounding-xpkg-inplace.log).

So the golden engine tests (`tools/golden-worksheet/engine.golden.test.ts`, the pricing oracle) and the packets
tests that go through `@tp/pricing` can kill nothing they reach by name, under either runner, unless the run
aliases or mutates in place.

### 3.4 Runner parity on the other three packages (10.1.1, `inPlace`, concurrency 4)

| Sample (mutants) | vitest perTest | command `--bail 1` | Differences (diff-reports) |
|---|---|---|---|
| pricing engine.ts:537-720, unit + golden tests, timing and purity tests out (172) | 98.26%, 1 min 35 s | 98.26%, 3 min 56 s | 2 Killed vs Timeout |
| ledger allocation.ts + totals.ts (285) | 89.47%, 38 s | 89.12%, 2 min 59 s | 1: allocation.ts:50 `[...remainders]`, killed by a fast-check property ("Property failed after 29 tests", seed -625365784) in one run and not in the other |
| packets interest.ts + calculation.ts (178) | 83.71%, 29 s | 83.71%, 2 min 55 s | 2 NoCoverage vs Survived |

Two test-set findings: `packages/pricing/src/purity.test.ts` reads the engine's source text and fails on
instrumented code (the command runner's dry run stops: "engine.ts uses \bprocess\.", mut-pricing-sample-command.log),
and `performance.test.ts` (100,000 lines, 4 s, asserts only counts and time) covers every engine mutant, so each
pricing mutant pays for it under perTest. Neither pins arithmetic; both leave the mutation set. The fast-check
properties (18 test files on the money paths, none seeded) make a kill depend on the run; the mutation runs fix the
seed (unit CI keeps random seeds).

### 3.5 Full per-package runs (10.1.1, no patch, sandbox with generated workspace aliases, concurrency 4)

| Package and test set | Mutants | Score | Killed | Timeout | Survived | No cov | Errors | Wall time | Static mutants |
|---|---|---|---|---|---|---|---|---|---|
| money, own tests | 243 | 93.22% | 220 | 0 | 15 | 1 | 7 | 34 s | 135 |
| money, every money-path test | 243 | 93.22% | 220 | 0 | 15 | 1 | 7 | 3 min 51 s | 135 |
| ledger, own tests | 1,664 | 92.19% | 1,529 | 5 | 130 | 0 | 0 | 2 min 28 s | 153 |
| packets: verifier set + interest, calculation, dates, assemble | 2,365 | 85.40% | 2,014 | 4 | 299 | 46 | 2 | 14 min 5 s | 1,129 |
| pricing, unit + golden engine tests, testing.ts out | 1,972 | 91.70% | 1,779 | 10 | 162 | 0 | 21 | 27 min 27 s (load 8 to 11) | 1,834 |

Packets by file: scan 85.46 (903/2/115/39), facts 83.33, mismatches as CI, payer 98.26, placeholders 88.10,
readable 92.39, interest 90.08, dates 83.33, assemble 79.50, calculation 70.18. The verifier set alone is unchanged
from CI except readable.ts's 2 load-failure mutants. Ledger by file matches CI within 2 mutants.

Pricing by file (10.1.1 with the golden tests, against CI's 10.0.0 without them): engine 95.44 (95.20), recompute
87.31 (86.12), dates 96.72 (95.63), windows 100.00 (89.80: the golden lines kill its 5 survivors), trace 90.08
(76.16: 20 of its mutants break a zod schema built at import, "Invalid discriminated union option", which 10.0.0
counted as survivors), release 73.13, reasons 50.00. Its 21 errors are all such load failures (20 in trace.ts, 1 in
recompute.ts:88, "decimal text must be plain digits"), each reason naming the test file that failed to load.

"Static" mutants are reached at import or in a `describe` body, so Stryker runs every related test for each. They
dominate time: packets' 1,129 static mutants (scan.ts 495, assemble.ts 243, facts.ts 191) take 83% of its run, and
pricing's golden test prices every golden claim in its `describe` body (`const runs = runEngineOnGolden()`,
engine.golden.test.ts:55), which makes 93% of the engine's mutants static. Moving that call into the tests (a test
change only) would let Stryker run only the covering tests.

## 4. Mutant counts and duration on a free runner

Counts from Stryker 10's own instrumenter (`node tools/count-mutants.mjs <root> <files>`, checked against the
canary's 8; mutant-counts.json):

| Package | Files and mutants | Total |
|---|---|---|
| money | cents 147, decimal 73, rounding 23, index 0 | 243 |
| pricing | engine 855, recompute 663, dates 183, trace 151, release 67, windows 49, reasons 4, index/types 0 (testing.ts 142 left out) | 1,972 |
| ledger | templates 468, stages 178, totals 173, matching 169, csv 116, roi 116, allocation 112, reconciliation 103, settings 92, statement 83, pairing 54 | 1,664 |
| packets, today's set | scan 1,059, mismatches 260, facts 258, payer 115, readable 94, placeholders 42, verifier/index 6 | 1,834 |
| packets, added | assemble 317, interest 121, calculation 57, dates 36 (windows 35 optional) | 531 |
| **all, recommended set** | | **6,244** |

Duration of a full run on a free GitHub-hosted runner (public repository: 4 vCPU, 16 GB; private: 2 vCPU, 8 GB,
[GitHub runner reference](https://docs.github.com/ru/actions/reference/github-hosted-runners-reference)). Local wall
times under load 3 to 14 on 4 shared CPUs are upper bounds for a 4-vCPU runner; double them for 2 vCPU. Add about
1.5 min per job for checkout, a cached `pnpm install` and Stryker's start and dry run.

| Shard | Vitest runner 10.1.1 (measured locally) | Command runner (estimated from the samples' per-mutant cost) |
|---|---|---|
| money | 0.6 min | about 2 min (measured 1 min 57 s) |
| ledger | 2.5 min | about 17 min |
| packets A: scan.ts (939 of 1,936 summed s) | about 7 min | about 17 min |
| packets B: the rest | about 7 min | about 21 min |
| pricing (one job) | 27.5 min (measured, load 8 to 11) | about 45 min |
| pricing split engine / recompute / the rest (summed mutant time 1,232 / 952 / 804 s) | about 11 / 9 / 7 min | about 20 / 15 / 10 min |

Today's single job runs 26 to 46 min on CI for 5,612 mutants. Sharded by package (and pricing and packets by
file), every shard ends within about 11 minutes even on this loaded machine, and a full run costs about 45 to 55
runner-minutes (upper bound; CI's single job took 26 to 46 min for fewer mutants and no golden tests).

## 5. The runner, by evidence

Faithfulness first: a mutant's reported status must be what the suite would do with that mutant applied.

| Option | Faithfulness (measured) | Time | Gives up |
|---|---|---|---|
| **A. Stryker 10.1.1 vitest runner, perTest, generated aliases, fixed fast-check seed (recommended)** | Equal to the command runner on 878 compared mutants; load failures reported as errors, not survivors | Full set in about 45 to 55 runner-minutes (measured, loaded machine); every shard under about 11 min | Load-failure mutants are excluded from the score (Stryker scores errors as invalid) rather than counted as kills: 7 money mutants move money from 93.42% to 93.22% |
| B. Command runner per package (audit #54's proposal) | Equal on status; any non-zero exit is a kill (a crash or a flaky timing test reads as a kill); no `killedBy`, no coverage, so NoCoverage reads as Survived; incremental mode cannot see test changes | 2.5 to 6 times slower: about 105 to 130 runner-minutes; pricing about 45 min in one job | Speed, and the per-mutant test names that make survivors actionable |
| C. 10.0.0 + the patch (today) | Unfaithful: load-failure mutants reported Survived (2.9 points on money) | As A | Correctness; and the patch blocks Dependabot's Stryker bump (pnpm's patch is keyed to 10.0.0) |
| D. `inPlace: true` instead of aliases | Equal to aliases (3.3) | As A | Mutates the checkout itself: safe on an ephemeral runner, not in a shared local worktree if a run is killed |

The audit's choice was right for the runner it saw (10.0.0). Stryker 10.1.0 shipped the two fixes on 2026-10-23
([vitest-runner CHANGELOG](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/packages/vitest-runner/CHANGELOG.md):
#6214 "support vitest v5", #6269 "report mutant collection failures instead of surviving mutants", #6246 "do not
select tests whose name only starts with a filtered name", #6188 "report test locations"). `npm view
@stryker-mutator/vitest-runner time`: 10.0.0 2026-08-14, 10.1.1 2026-10-23T19:18Z; peer `@stryker-mutator/core`
10.1.1, `vitest >=2.0.0`. 10.1.1's runner names tests with Vitest's own " > " separator, so the patch, its
pnpm-workspace entry and `tools/stryker/runner.test.ts` go.

The canary grows so the job proves each property it relies on before it reports a score, each with an expected
status per mutant (`tools/stryker/canary/expected.json`) rather than only "100%":
1. a runtime mutant selected by its test's name (today's case);
2. a mutant reached at import that makes the test file fail to load: RuntimeError or Killed, never Survived;
3. a mutant in a tiny canary package that only a test outside it, importing it by package name, kills (the aliases);
4. a mutant only a seeded fast-check property kills (the seed);
5. two tests whose names share a prefix, only one covering the mutant (#6246).

## 6. Triggers, sharding and the gate

Recommended (`.github/workflows/mutation.yml` rewritten; or the same jobs inside ci.yml if the CI-structure scout's
single "all green" gate is adopted, since no label event is needed any more):

- **Push to `claude/build-platform`:** every shard in full, no path filter (it is the backstop for whatever a pull
  request's path test missed), failing when any package is at or below 85% (PRD 18 says "above").
- **Pull requests (opened, synchronize, reopened):** a `changes` job reads the diff from the merge base. A package
  is affected when anything under its directory changed (source or test), or a package it imports from the money
  set (money affects all four; pricing affects packets), or a shared input: the Stryker and mutation vitest configs,
  `tools/stryker/**`, `tools/golden-worksheet/**` and `fixtures/golden/**` (pricing), the fixtures the tests read,
  `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, the workflow. **Affected packages run in full**, not
  only the changed files: measured full shards are a few minutes each, and a source change can make another file's
  mutants survive, which a changed-files run cannot see. (The audit's "mutate the changed files, in full when a test
  file changes" is the fallback if pricing's time ever exceeds the budget; incremental mode is not used: it cannot
  see changes to static mutants' tests, to helpers such as `testing.ts` and `test-support.ts`, to fixtures or to
  dependencies ([incremental docs](https://raw.githubusercontent.com/stryker-mutator/stryker-js/master/docs/incremental.md)).)
  The `money` label and its engine-change step go: path triggering cannot be forgotten.
- **Schedules:** a weekly cron stays in the file (inert until the default branch carries the workflows, the
  founder's choice of default branch, which also revives large-zip.yml's weekly 2 GB check); `workflow_dispatch` is
  likewise usable only from the default branch.
- **Jobs:** `changes` -> `canary` -> shards (matrix: money, ledger, packets-scan, packets-rest, pricing-engine,
  pricing-recompute, pricing-rest), each `timeout-minutes` about 30, concurrency from `os.availableParallelism()`,
  `break: null`, uploading its JSON and HTML report -> `mutation` gate job (`if: always()`, the one required
  check): merges the reports per package, scores (killed + timeout) / (valid mutants), fails at or below 85 in any
  package, fails any RuntimeError whose reason is not a test-file load failure ("An error occurred outside of a test
  run: <file>: ..."), and writes per-package and per-file scores and the survivors (file:line, mutator, replacement,
  covering tests) to the job summary. It succeeds with "no money path changed" when no shard ran.
- **Configs:** `stryker/<package>.config.mjs` over one base (vitest runner, perTest, reporters json/html/clear-text,
  `tempDirName`), `vitest.mutation.config.ts` with the generated workspace aliases, a setup file seeding fast-check
  (`fc.configureGlobal({ seed })`), and an explicit exclusion list with reasons (timing test, purity test,
  `tools/engine-freeze/differential.test.ts`, which compares the head engine with the base and would kill every
  engine mutant by construction, db tests). Test sets: each package's own unit tests; pricing adds the golden engine
  tests. Mutate sets: section 4 (pricing's `testing.ts` and packets' `test-support.ts` left out as test helpers).
- **Workflow test** (tools/test/workflows.test.ts, replacing the label test): the triggers exactly (push on
  `claude/build-platform`, pull_request default types, the cron, no `paths` filter at the workflow level); the
  `changes` job's map from paths to packages (table-driven cases: a docs-only change runs nothing, a money change
  runs all four, a test-only pricing change runs pricing and packets, a lockfile change runs all); the canary before
  every shard (`needs`); the gate's `if: always()` and its threshold; every shard's mutate and test sets equal the
  configuration's; the timeout table updated.

## 7. The coverage gate

`pnpm exec vitest run --project unit packages/{money,pricing,ledger,packets}/src --coverage --coverage.include='packages/{money,pricing,ledger,packets}/src/**' --coverage.reporter=json-summary`:

| Package | Branches | Gated today |
|---|---|---|
| pricing | 594/594, 100% | yes |
| ledger | 415/415, 100% | yes |
| money | 57/58, 98.28% (cents.ts 40/41; decimal 12/12; rounding 5/5) | **no** |
| packets | 686/779, 88.06% (scan.ts 205/265) | no (PRD 18 does not ask it) |

Add `packages/money/src/**` to `BRANCH_GATED`. rounding.ts already has 100%. The one miss is cents.ts:85,
`BigInt(match[2] ?? '0')`: group 2 of `/^(-?)(\d+)(?:\.(\d+))?$/` is required, so the fallback cannot run, and no
test can cover it (it is also the package's one NoCoverage mutant). Best: replace the unreachable fallback with a
form that has no branch (the match's group read once, typed as present), a behaviour-neutral change outside the
engine freeze (which covers `packages/pricing/src` only; `differential.test.ts` already proves money changes leave
every golden and generated claim's price equal); the alternative, a `/* v8 ignore next */` hint and a Stryker
disable comment, keeps dead code.

## 8. Survivors, and killing them with tests only

| Package | Undetected now | Of which, by mutator | Where |
|---|---|---|---|
| money | 16 | StringLiteral 11 (error texts, the error name), EqualityOperator 2 (min/max at equality: equivalent), ConditionalExpression 2, Regex 1 | cents 11, rounding 3, decimal 2 |
| pricing | 162 | StringLiteral 49, ConditionalExpression 42, Regex 22, EqualityOperator 10, LogicalOperator 8, ArithmeticOperator 7, BlockStatement 6 | recompute 84, engine 39, release 18, trace 13, dates 6, reasons 2 |
| ledger | 130 | StringLiteral 39, ConditionalExpression 29, EqualityOperator 25, Regex 13, MethodExpression 9, Arithmetic 5 | templates 32, totals 17, roi 16, allocation 12, csv 12, stages 12, pairing 10 |
| packets | 345 | StringLiteral 85, ConditionalExpression 82, Regex 55, LogicalOperator 26, MethodExpression 22, EqualityOperator 20 | scan 154, assemble 65, facts 43, mismatches 33, calculation 17, interest 12 |

How they die, all by tests:
- error-text and error-name mutants: assert the error's class and message (`toThrow(new MoneyError('...'))`);
- boundary mutants (`<` vs `<=`): a test at the boundary value; where the two forms are equal at the boundary
  (`a <= b ? a : b`), the mutant is equivalent and is recorded, not killed;
- property-only kills: a fixed example test of the counterexample fast-check found (for example ledger
  allocation.ts:50, `[1n, [0n, 1n, 1n]]`), so the kill no longer depends on a seed;
- the scanner's and templates' regular expressions: table tests of the inputs each quantifier or anchor separates
  (ADR 0047 records most of the verifier's survivors as these);
- packets' interest, calculation and assembly: assertions on every field of a line's interest and calculation
  summary and on the packet totals, which today's tests partly leave unchecked.

The engine freeze (tools/engine-freeze/check.ts: no non-test file under `packages/pricing/src` changes; test files
pass its `/\.test\.tsx?$/`) forbids even a comment in the engine, so equivalent pricing mutants cannot carry
`// Stryker disable` lines. They go in `tools/stryker/equivalent-mutants.json` (file, location, mutator,
replacement, why it is equivalent, who reviewed it), read by a small Stryker ignorer plugin so the report shows
them as Ignored with the reason, and the gate fails when a listed mutant no longer exists. The ledger's checks
(reconciliation-001: LED-01 to LED-11 unchanged, additions only under `packages/ledger/src`) allow new tests.

Every package clears 85% today (packets by 0.40 points), so the gate can turn on in the CI PR; killing the
arithmetic survivors (ConditionalExpression, EqualityOperator, ArithmeticOperator, MethodExpression in pricing,
ledger, money, interest and calculation) belongs in the same PR, before PR 8 touches packets again (audit #54).

## 9. 85% as an exit condition of milestone 6 and Gate 1

- Milestones and their checks live in PRD 17's table (PRD.md:697-713); milestone 6's check is "The three hand-run
  audits reproduce from the app line for line; an independent reviewer signs the checklist" (PRD.md:707). Gate 1's
  conditions go in `docs/product/gates.md`, which does not exist yet: reconciliation-001's item 7 ("Milestone 6
  exit", PR 7, Lane A's queue) creates it (reconciliation-001.md:146).
- PRD 18's own gate is weaker in time: "above 85% before Monitoring v1" (PRD.md:753), and its CI line asks for
  nightly runs (PRD.md:764), which cannot fire from a non-default branch.
- reconciliation-001's check (line 459): "The fourteen milestones and their checks in PRD 17 are unchanged, apart
  from 11b being inserted (CO-08) and the red-team exit added to milestones 6 and 11 (CO-10)." Adding the mutation
  exit to milestone 6 changes a check, so it conflicts with the check's text.
- HANDOFF.md "Founder rulings of 2026-10-20 ~15:10 UTC": "**Adopt all of it.** ... the ruling changes the report
  lists are accepted as it recommends; new PRs land where the report places them". #54's best option says "Make 85%
  an exit condition of milestone 6 and Gate 1" (combined-report.md:683), so the substance is ruled. But the report's
  list of "Rulings and accepted decisions these change" (combined-report.md:27) does not name PRD 17 or this check,
  and the check's own rule is "A pull request that cannot pass one stops and asks the owner"
  (reconciliation-001.md:425). Recommended: the CI PR amends PRD 17's milestone 6 check and PRD 18's mutation row
  and CI line, adds "and the 85% mutation exit added to milestone 6 and Gate 1 (combined audit #54, adopted
  2026-10-20)" to the check's exceptions, records it in ADR 0066, hands PR 7 the line for gates.md's Gate 1, and asks
  the founder one confirming question (below).

## 10. Founder questions (recommended first)

1. **Is the 85% mutation exit for milestone 6 and Gate 1 covered by your adoption of the combined audit on
   2026-10-20, so the CI PR adds it to reconciliation-001's list of exceptions to "the milestones and their checks
   are unchanged"?** Recommended: yes, covered; the PR records it with that ruling. Alternatives: (b) keep PRD 17
   unchanged and keep PRD 18's "before Monitoring v1" (gives up the earlier proof the audit asked for: the gate
   would bind only at Gate 2, after the first real audits); (c) a fresh ruling worded differently (gives up nothing
   but a round trip).
2. **Stryker 10.1.1 is one day old (2026-10-23).** If the dependency-policy scout's design adopts a minimum release
   age (Dependabot cooldown, pnpm `minimumReleaseAge`), 10.1.1 is eligible from the policy's date. Recommended: take
   10.1.1 in the CI PR, since the canary's five cases prove the behaviour the run relies on and 10.0.0 is measurably
   wrong; alternative: wait out the age (gives up a correct score until then; the CI PR would ship the gate on
   10.0.0's under-counting) or keep the patch and add a second patch for #6269 (gives up maintainability).

No question is needed on the runner, triggers, sharding or the coverage gate: they follow from the evidence under
the standing rule. The default branch (which makes the cron fire) is already among the audit's GitHub decisions.

## 11. Risks and open items

- Pricing's full time with the golden tests is dominated by static mutants; if a shard nears its timeout, move
  `runEngineOnGolden()` into the tests (test change only) before splitting further.
- Packets is 0.40 points above the threshold; the CI PR's survivor tests should land with the gate, or the first
  packets change after it may go red.
- If the repository goes private, runners have 2 vCPUs: shard times double (about 20 min for the longest), and
  runner-minutes count against the plan's quota (about 45 to 55 minutes a full run on 4 vCPU, more on 2; one per push
  plus the affected shards per pull request).
- Free-plan job concurrency is shared with ci.yml's parallel jobs; seven shards per run plus ci.yml's jobs may
  queue when two pull requests run at once.
- `stryker.verifier.config.mjs` (command runner) becomes redundant: the packets shards replace it (ADR 0047's
  amendment records that).
- Copy the HTML report as a workflow artifact on every run (the proxy refuses the artifact blob host for this
  machine, so local review reads the job summary).

## 12. Commands (in the scratch worktrees, now removed; their `.scout/` configs are kept in `scratchpad/ci-design/mutation-reports/configs-10.0.0` and `configs-10.1.1`, the 10.1.1 package diff in `configs-10.1.1/stryker-10.1.1.diff`, the reports beside them)

```
export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH
git -C /home/user/PhysicalTherapy worktree add --detach $SP/mutation-wt origin/claude/build-platform   # 49514e8
pnpm install --frozen-lockfile --prefer-offline
pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm stryker run .scout/money.vitest.mjs ; pnpm stryker run .scout/money.command.mjs
pnpm stryker run .scout/rounding-xpkg-{plain,alias,inplace}.mjs
# mutation-wt2: package.json @stryker-mutator/{api,core,vitest-runner} 10.1.1, patchedDependencies entry removed
pnpm install --no-frozen-lockfile --prefer-offline
pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm stryker run .scout/{pricing,ledger,packets}-sample.{vitest,command}.mjs
pnpm stryker run .scout/{money,ledger,packets,pricing}-full.mjs
node scratchpad/ci-design/tools/count-mutants.mjs <root> <files>     # Stryker 10 instrumenter, no test run
node scratchpad/ci-design/tools/diff-reports.mjs <a.json> <b.json>   # mutant-by-mutant status diff
node scratchpad/ci-design/tools/survivors.mjs <report.json>
gh api repos/PureTideWater/PhysicalTherapy/actions/workflows/mutation.yml/runs ; get_job_logs 119639259201, 119624873224
npm view @stryker-mutator/vitest-runner time version peerDependencies
```
