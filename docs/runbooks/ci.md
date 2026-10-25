# CI: what runs, reading a red gate, timing a run

## Mutation testing

`.github/workflows/mutation.yml` scores the money paths by mutation (PRD 18; docs/adr/0066, Part 4): the money package,
the pricing engine, the ledger, and the packet verifier and arithmetic. Its `mutation` job is a required check.

### What runs

- **On a push to `claude/build-platform`, weekly, and on request:** every package, all six shards.
- **On a pull request:** every shard of each package whose closure the change touches, and nothing else. The
  `changes` job prints which packages it chose and why (the first changed paths that reach each one) to its log and
  summary (`tools/stryker/affected.ts`). A package's closure is:
  - its mutated files and its tests, and everything they import, upstream workspace packages included;
  - the `package.json` and `tsconfig.json` of each workspace package in that closure;
  - the data files its tests and code read (`DATA_FILES` in `affected.ts`);
  - the third-party packages it imports and the test tooling (vitest, `@vitest/*`, `@stryker-mutator/*`,
    fast-check), as the lockfile resolves them: a lockfile change counts only when it moves one of them, or anything
    below them.

  The mutation configuration (`stryker/**`, `tools/stryker/**`, `vitest.mutation.config.ts`), the root
  `package.json`, `pnpm-workspace.yaml`, the root tsconfigs and this workflow affect all four.
- **A pull request that touches no money path** runs only `changes` and `mutation`, which passes with "No money path
  changed".

| Shard | Mutates | Time (4 shared CPUs, measured) |
| --- | --- | --- |
| `money-ledger` | money, then the ledger | about 3 min |
| `packets-scan` | packets' `scan.ts` | about 7 min |
| `packets-rest` | the rest of packets' set | about 7 min |
| `pricing-engine` | pricing's `engine.ts` | about 7 to 11 min |
| `pricing-recompute` | pricing's `recompute.ts` | about 7 to 11 min |
| `pricing-rest` | the rest of pricing | about 7 to 11 min |

Each shard job runs the canary first (`tools/stryker/canary`, about 7 s). It then runs its packages
(`pnpm -s exec tsx tools/stryker/shards.ts <shard>`), prints its files' scores and survivors, and uploads
`reports/mutation/<shard>/` (`<package>.json` and `.html`, and `canary.json`) as `mutation-<shard>`.

### Reading a red `mutation`

The `mutation` job's log and summary give each package's score, each file's score, and every survivor, with the tests
that cover it. Scores are truncated to two decimals, never rounded up, so one may read 0.01 below Stryker's own table. Each `FAIL` line, also an error annotation, is one of these:

| Failure | What it means | What to do |
| --- | --- | --- |
| `<pkg>: unexplained Survived ...` or `NoCoverage ...` | a mutant no test told apart from the code | Kill it with a test: assert the error's class and message, test the boundary value, pin a property's counterexample as a fixed example. Record it as equivalent only if no input can tell it apart (below) |
| `<pkg> scores 85.00% (... of ...), not above 85%` | the package is at or below PRD 18's line (killed + timeout over killed + timeout + survived + no coverage; load failures left out, recorded equivalents counted as survivors) | Kill survivors. Recording equivalents never raises a score |
| `<pkg>: RuntimeError that is not a test file's load failure` | the mutant made Vitest fail outside any test, and not by breaking a test file's load | Read the reason; it is a real error the run must not hide |
| `shard <s> ran with no canary verdict` or `canary is n of 5` | the shard's runner was not proved | Read the shard's canary step (below) |
| `<pkg> ran in ... but not in ...` | some of a package's shards ran and some did not | Re-run the failed or missing shard jobs |
| `... records ... which no longer exists (stale)` | a recorded equivalent matches no mutant: its code changed | Remove the entry, then judge the new mutant afresh |
| `... records ... as equivalent, but it is Killed` | a test now tells the recorded mutant apart, so it was never equivalent | Remove the entry |
| `... is not reviewed` | an equivalent lacks its reviewer and date | The reviewer confirms it independently, then fills `reviewedBy` and `reviewedOn` |

A job line, not a gate line:
- **"The changes job ended failure":** read `changes`. A data file a closure reads that `DATA_FILES` lacks stops it,
  naming the file and the path; add it to `DATA_FILES` (or, for a directory read file by file, to `DIRECTORY_READS`)
  with its reason.
- **"A shard job ended failure":** read that shard's job.
  - **The canary step.** It prints each of its five cases; a case "NOT as expected" lists the mutant and the status it
    got against the one `tools/stryker/canary/expected.json` allows. The cases:
    1. runtime mutants selected by their tests' names;
    2. a mutant that breaks a test file's load: RuntimeError or Killed, never Survived;
    3. a workspace package imported by name: the aliases;
    4. a mutant only the seeded property kills: the seed;
    5. a test whose name starts with the covering test's: must not run.

    A Stryker or fast-check upgrade that fails a case has changed what the scores rest on. Read the case: never
    update `expected.json` to match the new status without knowing why it moved.
  - **The shard step.** Stryker's own error, or the 30-minute timeout. Rebalance `stryker/shards.json` if a shard
    nears it.

Re-run a shard job only for an infrastructure failure; its upload overwrites the first attempt's.

### Recording an equivalent

Only when no input can tell the mutant from the original: for example, `a <= b ? a : b` mutated to `a < b ? a : b`,
equal at the boundary. Not for a mutant no test happens to reach, an error text nobody asserts, or a branch "that never
runs": kill those with a test. Each package's builder records its own in `tools/stryker/equivalent/<package>.json`, a
JSON array sorted by file, then original, then occurrence (strings in code-unit order, as `Array.prototype.sort`
compares them). Each entry has exactly these keys, in this order:

```json
{ "file": "packages/money/src/cents.ts", "mutator": "EqualityOperator", "original": "a <= b", "occurrence": 1,
  "replacement": "a < b", "reason": "Both return a when a equals b.", "proposedBy": "<builder>",
  "reviewedBy": "", "reviewedOn": "" }
```

- `original` is the exact source text Stryker replaced. `occurrence` is which occurrence of that text in the file
  (from 1, counting every start position), so an edit elsewhere in the file leaves the entry valid.
- The builder leaves `reviewedBy` and `reviewedOn` empty. The reviewer fills them (a name and a `YYYY-MM-DD` date)
  only after confirming the entry independently. The gate refuses an unreviewed entry of every package it scores.
- The file is the only form: no `// Stryker disable` comments (the engine freeze forbids them in the engine; the gate
  fails an Ignored mutant anywhere).
- To list a report's survivors with their original text and occurrence:
  `pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard <shard>` after a shard run.

### Running it locally

Run one shard at a time, never two. Each command writes `reports/mutation/<shard>/`, then the gate reads it:

```sh
pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard money-ledger
pnpm -s exec tsx tools/stryker/shards.ts money-ledger
pnpm -s exec tsx tools/stryker/gate.ts reports/mutation
```

The last line judges what ran: a package none of whose shards ran is "not affected". A narrow run while killing
survivors: `pnpm stryker run stryker/<package>.config.mjs --mutate <file>[:<lines>]` (report
`reports/mutation/<package>.json`). A package's mutation test set outside Stryker:
`TP_MUTATION_PACKAGE=<package> pnpm exec vitest run --config vitest.mutation.config.ts`. What a branch affects:
`pnpm -s exec tsx tools/stryker/affected.ts --base origin/claude/build-platform`.
