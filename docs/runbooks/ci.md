# CI: what runs, reading a red gate, timing a run

## Mutation testing

`.github/workflows/mutation.yml` scores the money paths by mutation (PRD 18; docs/adr/0066, Part 4): the money package,
the pricing engine, the ledger, and the packet verifier and arithmetic. Its `mutation` job is a required check.

### What runs

- **On a push to `claude/build-platform`, weekly, and on request:** every package, all six shards.
- **On a pull request:** every shard of each package whose closure the change touches, and nothing else. The
  `changes` job prints which packages it chose and why (the first changed paths that reach each one) to its log and
  summary (`tools/stryker/affected.ts`). A package's closure is:
  - its mutated files and its tests, and everything they import, upstream workspace packages included (every package
    `pnpm-workspace.yaml` lists, resolved as the mutation aliases resolve them, `tools/stryker/workspace.ts`);
  - the `package.json` and `tsconfig.json` of each workspace package in that closure;
  - the data files its tests and code read (`DATA_FILES` in `affected.ts`);
  - the third-party packages it imports, what the mutation tooling itself imports (yaml) and the test tooling
    (vitest, `@vitest/*`, `@stryker-mutator/*`, fast-check, tsx), as the lockfile resolves them: a lockfile change
    counts only when it moves one of them, or anything below them.

  Closures are taken at the head and at the merge base, and a changed path a package's mutate or test set selects
  counts whether or not it still exists, so deleting a money test, renaming one to `*.db.test.ts`, or deleting a
  helper, manifest or fixture only the old side held, measures its package.

  The mutation configuration (`stryker/**`, `tools/stryker/**`, `vitest.mutation.config.ts`), the root
  `package.json`, `pnpm-workspace.yaml`, the root tsconfigs and this workflow affect all four.
- **A pull request that touches no money path** runs only `changes` and `mutation`, which passes with "No money path
  changed".

| Shard | Mutates | Time (Stryker's, 4 CPUs shared with other work, 2026-10-25) |
| --- | --- | --- |
| `money-ledger` | money, then the ledger | 3 min 37 s (money 32 s, the ledger 3 min 5 s) |
| `packets-scan` | packets' `scan.ts` | 6 min 13 s |
| `packets-rest` | the rest of packets' set | 5 min 43 s |
| `pricing-engine` | pricing's `engine.ts` | 8 min 25 s |
| `pricing-recompute` | pricing's `recompute.ts` | 3 min 47 s |
| `pricing-rest` | the rest of pricing | 5 min 24 s |

Each shard job runs the canary first (`tools/stryker/canary`, about 7 s). It then runs its packages
(`pnpm -s exec tsx tools/stryker/shards.ts <shard>`), prints its files' scores and survivors, and uploads
`reports/mutation/<shard>/` (`<package>.json` and `.html`, and `canary.json`) as `mutation-<shard>`.

### Reading a red `mutation`

The `mutation` job's log and summary give each package's score, each file's score, and every survivor, with the tests
that cover it. Scores are truncated to two decimals, never rounded up, so one may read 0.01 below Stryker's own table.
Each `FAIL` line, also an error annotation, is one of these:

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
| `... is reviewed by its proposer` or `... after the run's date` | the entry's reviewer is the builder who proposed it, or its date is in the future | Another person reviews it, on the day they do |
| `shard <s>'s <pkg> report has no <file>, which the shard mutates` | the shard's run left a file out (a narrowed `mutate`, a crashed run), or a file Stryker finds no mutant in is not listed | Re-run the shard; a file of imports, re-exports and types only goes in `stryker/shards.json`'s `noMutants` (a test holds it there) |
| `shard <s> left <pkg>.json, a report of <pkg>, which the shard does not hold` or `the reports directory holds <file> at its top` | a report the gate would otherwise not judge | Read where it came from; the gate reads only `<shard>/` directories, each holding its own packages' reports |
| `<pkg>: n recorded equivalents rest on the engine's Unicode data as Node ... has it ...` | a shard ran on a Node whose Unicode or ICU data differs from what `tools/stryker/unicode.json`'s entries were checked on | Run mutation on the pinned Node; when moving the pin, check those entries again over every code point on the new Node, then record it in `unicode.json` |
| `shard <s>'s canary verdict names no runtime` | the canary's verdict lacks the Node, Unicode and ICU versions it ran on | Re-run the shard with this commit's `verdict.ts` |

A job line, not a gate line:
- **"The changes job ended failure":** read `changes`. It stops, naming the file, on:
  - a data path a closure names that `DATA_FILES` lacks: add it with its reason (or, for a directory read file by
    file, to `DIRECTORY_READS`, which must list every file the reader names there);
  - a closure file that imports `node:fs` and is no `DATA_FILES` entry's reader, no `DIRECTORY_READS` file and no
    `UNCALLED_READS` file: name it where it belongs, with what it reads;
  - an import of a relative path, or of a workspace package's name or scope, that resolves to no file (an unexported
    subpath, a package without `exports`): export it, or fix the import;
  - a third-party package a closure imports that the lockfile resolves for no importer.
- **"The changes job gave no verdict" or "gave shards=... not JSON arrays":** its outputs are missing or garbled, so
  nothing is known about what changed; `mutation` fails closed. Read `changes`' last step.
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
runs": kill those with a test. "No input" means no value of the function's declared parameter types, as plain data (a
string is any text, an object exactly its declared fields), on any conforming engine. So these are not equivalents,
and a test kills them:
- a comparator mutant that sorts right only because V8 calls the comparator as (later, earlier): run the code under an
  insertion sort that calls it as (earlier, later) too (`packages/pricing/src/sorts.test.ts`,
  `packages/ledger/src/allocation.test.ts`);
- a mutant told apart only by text that is not a date, where the code compares dates as text
  (`packages/packets/src/assemble.test.ts`, "assemblePacket's dates as text");
- a sort of a list already in order, when an earlier sort's comparator is inconsistent for a value of the declared
  type (`packages/pricing/src/sorts.test.ts`, the NaN line number case).

A test may also hold the code to an input beyond its declared types, as hardening, when it asserts the code's own
outcome for that input (its own check's error class and message, or its reason): such a kill stands and the mutant is
not recorded, but it is no evidence against an entry. A kill that rests only on an incidental failure (a TypeError from
a method the value lacks, asserted by a bare `toThrow`) is not one: the mutant is recorded and the test dropped
(`packages/money/src/rounding.ts`'s bigint check).

An entry that rests on the engine's Unicode data (NFKC forms, grapheme clusters) says so in its reason, the reviewer
checks it over every code point on the Node the workflow pins (24.22.0 in all three jobs), and
`tools/stryker/unicode.json` lists it with that Node's Unicode and ICU versions. The gate fails a listed entry when a
shard ran on other data, and a test fails when the pin and the listing's Node differ.

Each package's builder records its own in `tools/stryker/equivalent/<package>.json`, a
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
  only after confirming the entry independently. The gate refuses an unreviewed entry of every package it scores, one
  whose `reviewedBy` is its `proposedBy`, and one dated after the run.
- The file is the only form: no `// Stryker disable` comments (the engine freeze forbids them in the engine; the gate
  fails an Ignored mutant anywhere).
- To list a report's survivors with their original text and occurrence:
  `pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --shard <shard>` after a shard run.

### Running it locally

Run one shard at a time, never two, on the Node the workflow pins (24.22.0: the gate holds the Unicode-bound
equivalents to its data). Each command writes `reports/mutation/<shard>/`, then the gate reads it:

```sh
pnpm stryker run tools/stryker/canary/stryker.config.mjs
pnpm -s exec tsx tools/stryker/canary/verdict.ts --shard money-ledger
pnpm -s exec tsx tools/stryker/shards.ts money-ledger
pnpm -s exec tsx tools/stryker/gate.ts reports/mutation
```

The last line judges what ran: a package none of whose shards ran is "not affected". A narrow run while killing
survivors: `pnpm stryker run stryker/<package>.config.mjs --mutate <file>[:<lines>]` (report
`reports/mutation/<package>.json`, at the top of the directory, which the gate refuses as stray: delete it, or point
the gate at a directory of shard reports only). A package's mutation test set outside Stryker:
`TP_MUTATION_PACKAGE=<package> pnpm exec vitest run --config vitest.mutation.config.ts`. What a branch affects:
`pnpm -s exec tsx tools/stryker/affected.ts --base origin/claude/build-platform`.
