# 0066. Run CI as parallel jobs behind one gate, measure mutation on every money package, move the browser and runner together, and pin every dependency

- **Status:** accepted, Part 4 (`co-001/ci-mutation`, combined audit #54). Parts 1 to 3 are the series' other pull
  requests (`co-001/ci-speed`, `co-001/ci-deps`, `co-001/ci-browser`). Part 4 amends
  [0064](0064-resolve-a-split-zips-locality-from-the-zip-plus-four-files-ranges-the-one-engine-change-the-freeze-allows.md)
  (mutation by path, not by label; Stryker 10.1.1 in place of 10.0.0 and its patch) and
  [0047](0047-read-narratives-as-they-show-refuse-the-cases-identifiers-bound-ledger-corrections-and-give-them-and-the-regulation-to-the-specialist.md)
  (the verifier's own configuration retired).
- **Date:** 2026-10-25
- **Deciders:** the founder, Tyler Williams, who adopted the combined best-option audit in full on 2026-10-20 (#54
  among it, placed "CI PR before PR 7"), under the standing rule of 2026-10-18, and who ruled on 2026-10-25 (relayed by
  the co-founder) that the adoption covers #54's 85% exit for milestone 6 and Gate 1 (the series' question F6); the
  build (Lane B), for the notices below, decided under that rule and each reversible by the founder
- **PRD sections:** 17 (milestone 6's check), 18 (the mutation layer and continuous integration); reconciliation-001's
  checks (the engine freeze, the ledger's additions-only rule, the milestones); test matrix CI-15 to CI-17; ADRs 0047
  and 0064

## Part 4 (`co-001/ci-mutation`)

### Context

PRD 18 asks for a mutation score "above 85% before Monitoring v1" on the money packages, and for mutation testing in
CI. Combined audit #54 found the measurement not to be trusted, and the run not to happen:

- **The runner was unfaithful.** `@stryker-mutator/vitest-runner` 10.0.0 named a test by its describe and test names
  joined by spaces, where Vitest 5 filters by `fullTestName` (joined by " > "), so a mutant run selected no test and
  every runtime mutant survived. The local patch of PR 6b-1 (ADR 0064) fixed the names, but 10.0.0 still reported
  **Survived** for any mutant that breaks a test file's load: 7 of the money package's 243 mutants (2.9 points), 21 of
  pricing's (20 in `trace.ts`, whose 76.16% on CI was really 90.08%) and 2 of the verifier's.
- **Tests that import a package by name reached the original files.** Stryker links each `node_modules` into its
  sandbox, so `@tp/pricing` resolved to the unmutated checkout. The golden engine tests, the pricing oracle, could kill
  no engine mutant, and were not in the run at all.
- **The run rarely ran.** It ran only on a pull request labelled `money`, in one job of 26 to 46 minutes. Of 31 runs,
  3 measured anything. No push or scheduled run ever happened.
- **Kills depended on the run.** 18 test files on the money paths hold fast-check properties, none seeded, so a
  property-only kill could flip between runs (the ledger's `allocation.ts:50`).
- **The money package was outside both gates.** It was in neither the branch-coverage gate (98.28%, one unreachable
  `?? '0'`, `cents.ts:85`) nor the mutation run.

Stryker 10.1.0 and 10.1.1 (2026-10-23) fixed the runner upstream (#6214 Vitest 5, #6269 collection failures reported as
errors, #6246 no prefix selection). The mutation scout measured 10.1.1's vitest runner against Stryker's command runner
mutant for mutant on 878 mutants across the four packages. They agreed but for labels, the load failures and one
seed-dependent kill.

### Decision

**The runner.** `@stryker-mutator/{api,core,vitest-runner}` 10.1.1, the vitest runner with `coverageAnalysis: perTest`.
The patch, its `patchedDependencies` entry and `tools/stryker/runner.test.ts` are gone.

- `stryker/base.mjs` holds the options every run shares: the json, html and clear-text reports, every CPU, no break
  threshold (the gate decides), and `timeoutMS: 30000`. On four shared CPUs, Stryker's 5 s let the load decide a
  static mutant's status: five pricing mutants timed out at load 8 to 11 and survived or errored at load 2 to 5.
- One configuration per package, `stryker/{money,pricing,ledger,packets}.config.mjs`. The mutate sets are:
  - money: `src/**`;
  - pricing: `src/**` less the test helper `testing.ts`;
  - ledger: `src/**`;
  - packets: the verifier and what it reads (`verifier/**`, readable, scan, facts, payer, placeholders) and the packet's
    arithmetic (interest, calculation, dates, windows, assemble), less `test-support.ts`.

  Each package's tests run against its mutants, through `vitest.mutation.config.ts`:
  - Pricing's tests add the golden engine tests (`tools/golden-worksheet/engine*.test.ts`).
  - Every workspace package's exports are aliased to the sandbox's files, generated from each `package.json`.
  - fast-check is seeded (`tools/stryker/seed.ts`) in mutation runs only, so unit runs keep finding new
    counterexamples.
  - Four exclusions, each with its reason: the timing test, the source-reading purity test, the differential test
    (which kills every engine mutant by construction) and the database tests.
- The golden engine test prices each claim inside its own test, with no memo shared across tests. Priced in its
  `describe` body, it made 93% of the engine's mutants static, and perTest coverage would credit only the first test.
  The claims, their assertions and `fixtures/golden` are unchanged.

**Six shards** (`stryker/shards.json`), split by the scout's measured mutant time:

| Shard | Packages and files |
| --- | --- |
| `money-ledger` | money and the ledger |
| `packets-scan` | packets' `scan.ts` |
| `packets-rest` | the rest of packets' set |
| `pricing-engine` | pricing's `engine.ts` |
| `pricing-recompute` | pricing's `recompute.ts` |
| `pricing-rest` | the rest of pricing |

A test holds every mutated file in exactly one shard of its package. A shard runs all its files; a package's shards run
all or none.

**The canary** (`tools/stryker/canary`) is the first step of every shard job, before any of its mutants (about 7 s).
It holds five cases to an expected status per mutant (`expected.json`), each proving one thing a score rests on:

1. runtime mutants selected by their tests' names;
2. mutants reached at import that break the test file's load: RuntimeError or Killed, never Survived;
3. a mutant in `@tp/stryker-canary`, a private workspace package at `tools/stryker/canary/lib`, which only a `tools`
   test importing it by name kills: the aliases;
4. a mutant only a property run from the committed seed kills: the seed. The input it marks is derived from that seed
   at run time (`seeded-input.ts`), so a fast-check release that draws other values moves it with them;
5. a mutant covered by one of two tests whose names share a prefix, which must survive: no prefix selection.

A case is as expected only when every mutant of its file has an expectation, every expectation a mutant, and every
status is allowed. The verdict goes to the log and to `reports/mutation/<shard>/canary.json`; any case not as expected
stops the shard.

**The gate** (`tools/stryker/gate.ts`), the required `mutation` job, merges the shards' reports by package. A package
is fully run when every shard holding it ran. The gate fails when:
- a shard the changes job selected reported nothing;
- a shard that ran lacks its canary verdict of 5 of 5 as expected, or one of its packages' reports;
- a package ran in some of its shards and not all;
- a fully-run package scores at or below 85%. The score is Stryker's, (Killed + Timeout) / (Killed + Timeout +
  Survived + NoCoverage), compared in integers, so 85.00% fails and 85.01% passes. RuntimeError mutants are left out
  of it, as Stryker leaves them. A recorded equivalent stays in it as a survivor, so recording one never raises a
  score;
- any Survived or NoCoverage mutant of a fully-run package is not recorded as equivalent;
- a RuntimeError's reason is not a test file's load failure;
- a mutant is Ignored, CompileError or Pending;
- an equivalents file is malformed, unsorted or holds a duplicate;
- for a fully-run package, a recorded equivalent lacks its reviewer and date, no longer matches a mutant (stale), or
  matches one a test detects or that breaks a load.

A package none of whose shards ran is "not affected", and neither score rule judges it. The gate prints per-package
and per-file scores, and every survivor with its covering tests, to the log and the summary.

**Equivalents** live in `tools/stryker/equivalent/<package>.json`, one file per package. Each is a JSON array sorted
by file, then original, then occurrence. Each entry has exactly these keys:
- the file;
- the mutator;
- the original source text and its occurrence index (stable across unrelated edits, unlike a line number);
- the replacement;
- why no input can tell the two apart;
- who proposed it, and who reviewed it and when.

The builder leaves `reviewedBy` and `reviewedOn` empty, and only an independent reviewer fills them. The match is per
mutant, on the gate's side. The freeze forbids `// Stryker disable` comments in the engine, and the gate refuses an
Ignored mutant anywhere, so the file is the only form.

**What runs** (`.github/workflows/mutation.yml`, its own workflow and concurrency group beside ci.yml's `all green`):
- **Every package** on a push to `claude/build-platform`, weekly and on `workflow_dispatch`.
- **On a pull request** (default types; the `money` label and its step are gone), every shard of each package whose
  closure the change touches (`tools/stryker/affected.ts`), diffed from the merge base. A package's closure is:
  - its mutated files and tests and their import closure, tests included: `importClosure()` of
    `tools/screening-capacity/watched.ts`, with its new `includeTests` option, off by default, so the watched list is
    unchanged;
  - the `package.json` and `tsconfig.json` of every workspace package the closure lies in;
  - the data files its tests and code read, held complete by a scan of the closure for path literals under
    `fixtures/`, `content/` and `docs/`;
  - the third-party packages it imports and the test tooling, resolved through the lockfile's snapshots.

  A lockfile change counts only when it moves one of those resolved versions. The mutation configuration and tooling,
  the root manifest, the workspace list, the root tsconfigs and the workflow affect all four.
- **Jobs:**
  - `changes` (5 min);
  - `stryker (<shard>)` (30 min; skipped when nothing is affected; reports uploaded with `overwrite: true`);
  - `mutation` (10 min, `if: always()`). It fails on a failed or cancelled job, and on a skipped shard job when a
    package was affected. It passes with "no money path changed" when none was.

**Coverage.** `packages/money/src/**` joins `BRANCH_GATED`. `cents.ts:85`'s unreachable `match[2] ?? '0'` (the
regular expression at `:73` requires the group) becomes branch-free, with behaviour unchanged. This is the series' one
non-test change in a money path, reviewed as one.

**Survivors are killed by tests only.** Each package's survivors (16 money, 162 pricing, 130 ledger, 345 packets at
the scout's measurement) die by tests, or are recorded only when truly equivalent:
- nothing non-test changes under `packages/pricing/src` (the freeze), where test helpers stay inside `*.test.ts`;
- the ledger takes new `it` blocks and new files only (reconciliation-001: LED-01 to LED-11 and the ledger oracle
  unchanged, additions only).

**Milestone 6 and Gate 1** (F6). PRD 17's milestone 6 check gains "every money package's mutation score above 85% with
no unexplained survivor" (the `mutation` gate). PRD 18's mutation row and CI line say what this part runs.
reconciliation-001's milestone check names the exception. Lane A's PR 7 writes the same condition into Gate 1 in
`docs/product/gates.md`.

### Measured (2026-10-25, four CPUs shared with other agents)

- **The canary on 10.1.1:** 24 mutants, 5 of 5 cases as expected, 7 s. On 10.0.0 with the patch, case 2 fails (its
  three load-breaking mutants Survived) and so does case 5 (the prefix mutant Killed by the longer-named test): 3 of 5.
  On 10.0.0 without the patch: 0 of 5. On 10.1.1 without the aliases, case 3 fails (its two mutants NoCoverage); on
  10.1.1 without the seed, case 4 fails (the seeded mutant Survived): 4 of 5 each.
- **The money shard on 10.1.1**, before any survivor-killing test:
  - money scores 93.22% (220 killed, 15 survived, 1 no coverage, 7 load failures), the scout's 243 statuses exactly;
  - the ledger, with the committed seed, scores 91.89% (1,524 killed, 5 timeouts, 135 survived);
  - the shard took 3 min 7 s, its canary included;
  - the gate passes both scores and fails on their 151 unexplained survivors (16 and 135), naming each with its
    covering tests. It prints scores truncated to two decimals, never rounded up (the ledger's 91.88%), so no printed
    score is above the line when the score is not.
- **The scout's other packages** (10.1.1, aliases): pricing with its golden tests 91.70% (counting 10 clock-made
  timeouts as detected), packets 85.40%.

### Alternatives considered

| Option | Why not |
| --- | --- |
| Stryker's command runner per package (the audit's proposal) | Equal statuses on the evidence, but 2.5 to 6 times slower (pricing about 45 minutes in one job). Any non-zero exit counts as a kill, so a crash or a flaky timing test reads as one. It names no killing or covering test, which killing survivors needs (notice N4) |
| Keep 10.0.0 and the patch, adding one for #6269 | Two local patches that every Dependabot bump of Stryker breaks, for what 10.1.1 does upstream |
| `inPlace: true` instead of the aliases | Equal statuses, but it mutates the checkout itself, which a killed local run leaves mutated |
| A Stryker ignorer plugin for equivalents | Its `shouldIgnore` ignores a whole AST node, every mutant in it, which is coarser than the evidence for one mutant |
| `// Stryker disable` comments | The freeze forbids any non-test change in the engine, and a comment hides the record from review |
| Mutate only the changed files (the audit's fallback) or Stryker's incremental mode | A change can make another file's mutants survive, and incremental mode cannot see changes to static mutants' tests, helpers, fixtures or dependencies. The affected packages' full shards take minutes |
| The canary as a job of its own | A job's setup, about a minute, on every money pull request's wall, and it proves a different runner from the one each shard scores with |
| The `money` label | A forgotten label is an unmeasured change; path-affected runs cannot be forgotten |
| Mutation inside ci.yml under `all green` | It would make `all green` as slow as the longest shard on every money pull request, and mutation has triggers ci.yml does not |

### Notices (decided by the build under the standing rule; the founder can reverse any)

- **N4.** Mutation uses Stryker 10.1.1's vitest runner, not the command runner the audit named. Affected packages run
  in full, not only the changed files. The gate is stricter than 85%: no unexplained survivor.
- **N5.** Stryker 10.1.1 was published on 2026-10-23T19:18Z, and is older than a three-day release age from
  2026-10-26T19:18Z. It is taken because 10.0.0 is measurably wrong, and the canary's five cases prove, before every
  score, what it relies on.

### Consequences

- `mutation` is a required check on every pull request. It takes about a minute when no money path changed, and about
  13 to 17 minutes when one did, depending on the slowest affected shard.
- A Stryker, Vitest or fast-check bump runs all four packages. If the canary fails, the bump has changed what the
  scores rest on, and the pull request says why before `expected.json` changes.
- A new money file needs a shard in `stryker/shards.json` (the partition test fails until it has one). A new data file
  a money test reads needs `DATA_FILES`, or the changes job stops naming it.
- Every new survivor in a money package fails its pull request until a test kills it or a reviewed equivalent records
  it. PR 6c plans its killing tests in its design.
- What cannot be verified locally (GitHub's `needs` results, the artifacts between jobs and `overwrite` on a re-run,
  the weekly schedule) is read on this pull request's own full run and the first push run. Every verdict is printed to
  the job logs.

### Revisit when

- A shard nears its 30-minute timeout, or after this pull request's first CI run, which replaces the loaded-machine
  estimates in `stryker/shards.json` (open item O7).
- The repository goes private: two vCPUs double shard times, and runner minutes are billed.
- Stryker ships an ignorer that matches a single mutant.
- fast-check, Stryker or Vitest fails a canary case on an upgrade.
