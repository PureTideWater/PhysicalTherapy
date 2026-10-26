# CI: what runs, reading a red gate, timing a run

`.github/workflows/ci.yml` runs every gate of PRD 18 on every pull request and on every push to `claude/build-platform`,
as parallel jobs behind one gate, `all green` (docs/adr/0066, Part 1). This runbook is for whoever reads a run: the
build, a reviewer, the verifier, the founder.

## The required checks

<!-- required-checks -->
- `all green` (ci): every ci.yml job below passed.
- `mutation` (mutation): the money paths' mutation score.
- `screening-capacity gate` (screening-capacity): passes at once when no watched path changed, else only on a
  measurement that passed every check but time (docs/runbooks/screening-capacity.md).
- `approval-of-record` (approval-of-record): the founder's review as the approval of record (docs/adr/0063).
<!-- /required-checks -->

The list lives in `tools/required-checks.ts`; every document that lists the checks is held to it
(`tools/test/required-checks.test.ts`). The founder sets them in the ruleset (docs/runbooks/github-governance.md, step
4A). No other ci.yml job is required by name: `all green` needs them all, so a shard added or removed changes no setting.

## The jobs

| Job (its check) | What it runs | Timeout |
| --- | --- | --- |
| `static` | the dependency audit; the secret scan of the commits the run checks; the fixture check; the content checker; published releases and prompt versions unchanged; the engine freeze (pull requests); `pnpm synth --all` and its clean diff; `pnpm typecheck`; `pnpm lint:logs`; `pnpm test:golden`; `pnpm synth --large` (the 10,000-claim remittance the oracle reads) and `pnpm test:oracle`; `pnpm licenses:check` | 15 min |
| `lint` | `pnpm lint`, ESLint in three memory-bounded groups | 15 min |
| `unit` | Chromium, the pinned gitleaks (the pre-push hook's tests run it), the engine freeze's base, `pnpm test` (with coverage) | 20 min |
| `db (k/N)` | its own Postgres, Chromium, `pnpm db:migrate && pnpm test:db --shard=k/N`, then "Files this shard ran" | 20 min |
| `domain model` | its own Postgres; on a pull request "Changes since the last approved domain model"; `pnpm db:migrate`; `pnpm db:domain-model --check --strict --require-approval` | 10 min |
| `build` | `pnpm build` (web and worker); the web build stamped and kept as `web-build`; `pnpm cdk:diff` | 15 min |
| `e2e (k/M)` | after `build`: its own Postgres, Chromium, the downloaded build, `pnpm test:e2e --shard=k/M`; its report kept as `playwright-<k>` | 25 min |
| `images` | both images built from their Dockerfiles and scanned by Trivy | 20 min |
| `all green` | every job's result, to its log and its summary | 5 min |

Beside ci.yml, two workflows of the release content checks (docs/adr/0071) run on a schedule. Neither is a required
check, and their schedules fire only from the default branch (the founder's ruling F1 (a)); until then they run on
request. Each issue they open holds only public references: page addresses, file names, release numbers and run links.

| Workflow, job | What it runs | Timeout |
| --- | --- | --- |
| `content-calendar`, `check` | daily at 07:17 UTC, on request, and on a push to `claude/build-platform` or a pull request touching the calendar, `records.ts`, `tools/content-calendar` or `content/`: `tools/content-calendar/index.ts` over the calendar, the newest published release's `COVERAGE.md`, the prepared releases, the drafts and the source pages; the findings to its summary (docs/runbooks/content-updates.md). Read-only, no secret | 15 min |
| `content-calendar`, `notify` | not on a pull request: one `content-due` issue per finding not already open under the same title, or one saying the check failed. It alone holds `issues: write`, checks nothing out and runs no repository code | 5 min |
| `release-capacity`, `capacity` | weekly on Tuesday at 03:29 UTC and on request: the worker image built, the quarterly scale release 900110 built outside the repository, and `tools/release-capacity/run.ts`, the real-size price job, triage and reports at the worker task's limits (RCC-07); its report kept as `release-capacity` | 180 min |
| `release-capacity`, `notify` | on its failure: opens or comments on the issue "Release capacity test failing" (label `release-capacity`). It alone holds `issues: write` and checks nothing out | 5 min |

Each `static` check runs once the install succeeded, whatever the check before it did, so one red step does not hide
the others' verdicts. Every verdict a job writes to its summary it also writes to its log, which is what the verifier
reads (the session's proxy refuses GitHub's artifact host).

What a run checks: on a pull request, its commits beyond the base branch (`origin/<base>..HEAD`; the engine freeze and
the differential test against the merge base); on a push, the commits beyond the branch's previous head
(`github.event.before`), or the last commit alone when the branch is new. "The commits this run checks", the first
step of `static`, prints the range. The engine freeze's own check (`tools/engine-freeze/check.ts`) runs on pull
requests only, because its exception names a pull request, which a push does not carry: a merge's push follows its
pull request's run, which the check gated, and a direct push to `claude/build-platform`, which the ruleset of the
governance runbook's step 4A blocks once the founder applies it, is until then checked by the unit job's differential
test alone, which prices the base's engine and this commit's.

## Reading a red gate

1. Open the run's **all green** job. Its summary (and its log) is a table of every job's result; the error line names
   each job that did not succeed. A `skipped` job is red too: `e2e` skips when `build` failed, so read `build` first.
   A `cancelled` job on an old commit means a newer push superseded it; read the newer run.
2. Open the red job.
   - **`static`:** every step reports; the red ones are the findings. A red "The commits this run checks" means the
     range's base is not in the clone (on a push, a previous head the branch no longer holds, which a force push
     leaves; once the founder applies step 4A's ruleset, it blocks those).
   - **`db (k/N)`:** the failing file and test are in the suite step's output. "Files this shard ran" lists the files
     the shard ran, with the ten slowest. Run the file locally on its own (below); every db file makes its own
     database, so a shard's failure is a file's, never the shard's order.
   - **`domain model`:** "documents differ" means a migration without the regenerated document
     (`pnpm db:domain-model --out`, through `/new-migration`); an approval refusal on a schema pull request means the
     founder has not signed yet, and the job prints the SHA-256 to sign (governance runbook, "A pull request that asks
     you to approve the domain model"). Nothing else is waiting on it: the database suite reports on its own.
   - **`e2e (k/M)`:** the failing journey is in the step's output and annotated on the pull request. A screenshot
     comparison prints each diff and actual picture under 300 KB in the log as base64 (docs/adr/0058). A "flaky" test,
     one that passed only on its retry, fails the run by design: fix it, never re-run it to green. A refusal of the
     build's stamp means the shard was handed another commit's build: re-run the whole workflow, not the shard.
   - **`images`:** the Trivy table names each HIGH or CRITICAL finding with a fixed version: take the fix (a base-image
     or package bump), or record why not in docs/adr/0010's way.
3. **Re-running.** Re-run failed jobs only for an infrastructure failure (a runner lost, a download refused, a service
   that did not start), never for a test that failed: a test that passes on a re-run is a flaky test, and is fixed.
   A re-run replaces the artifacts the first attempt left (`overwrite: true`).

## Timing a run

The target (docs/adr/0066, A1): `all green` within 10 minutes median and 12 worst, from the first job's start to the
gate's end, and at most 50 runner-minutes a run, read on a pull request's last three heads and the first five push
runs after a CI change. Queue time is reported beside it, never folded in.

```sh
run=<run id>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate \
  --jq '.jobs[] | [.name, .created_at, .started_at, .completed_at, .conclusion] | @tsv'
created="$(gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run" --jq .created_at)"
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate --jq '.jobs[]' | jq -s --arg created "$created" '
  def t: fromdateiso8601;
  map(select(.started_at != null and .completed_at != null)) as $jobs
  | ($jobs | map(.started_at | t) | min) as $first
  | ($jobs | map(select(.name == "all green")) | .[0].completed_at | t) as $gate
  | { wall_minutes: (($gate - $first) / 60),
      queue_minutes: (($first - ($created | t)) / 60),
      runner_minutes: ($jobs | map((.completed_at | t) - (.started_at | t)) | add / 60),
      billed_minutes: ($jobs | map(((.completed_at | t) - (.started_at | t)) / 60 | ceil) | add) }'
```

The time until a pull request can merge (A1′) is the last of the four required checks, from the head's first workflow
run: on a pull request that touches a watched path the capacity gate (13 to 16 minutes measured), on a money-path pull
request `mutation`, otherwise `all green`. Record which check finished last.

```sh
sha=<head commit>
gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?head_sha=$sha" --jq '[.workflow_runs[].created_at] | min'
gh api "repos/PureTideWater/PhysicalTherapy/commits/$sha/check-runs" --paginate \
  --jq '.check_runs[] | select(.name | IN("all green", "mutation", "screening-capacity gate", "approval-of-record")) | [.name, .started_at, .completed_at] | @tsv'
```

Dependabot's pull requests are read the same way; their runs queue behind the account's other jobs (GitHub Free runs
20 jobs at once per account, ci.yml up to about 11 of them), and that bot queue time is reported apart.

## Proving the shards ran every database file once

Each `db (k/N)` job prints "Files db (k/N) ran: <count>, list SHA-256 <hash>", then the sorted list in a fenced block.
The union of the N lists must be disjoint and equal to the db project's files at the head (vitest's `list` ignores
`--shard`, so it gives the whole project):

```sh
run=<run id>
for job in $(gh api "repos/PureTideWater/PhysicalTherapy/actions/runs/$run/jobs" --paginate --jq '.jobs[] | select(.name | startswith("db (")) | .id'); do
  gh api "repos/PureTideWater/PhysicalTherapy/actions/jobs/$job/logs" | sed -E 's/^[0-9-]+T[0-9:.]+Z //' \
    | awk '/^### Files db \(/ { on = 1; next } on && /^```$/ { if (++fence == 2) exit; next } on && fence == 1'
done | LC_ALL=C sort > shard-files.txt
LC_ALL=C sort -u shard-files.txt | cmp - shard-files.txt   # no file in two shards
pnpm -s vitest list --project db --filesOnly | sed 's/^\[db\] //' | LC_ALL=C sort | diff - shard-files.txt   # every file, once
```

Where `gh api .../logs` is refused, read each job's log with the GitHub connector's `get_job_logs` and take the same
lines. A shard's hash is the SHA-256 of its list, sorted bytewise (`LC_ALL=C sort`) with a newline after each path
(`sha256sum` of the block's lines).
`tools/test/db-shards.test.ts` proves the same split for 4 and 6 shards through vitest's own sequencer on every run.

## A private repository

GitHub's standard runner for a private repository has 2 CPUs and 8 GB, not 4 and 16. The matrices widen by themselves
from `github.event.repository.private`: six `db` shards and three `e2e` shards, so the wall stays near 10 minutes, at
about 70 to 80 billed minutes a push instead of about 45. The lint runner fits its groups to the host's memory (web
alone, then the others), and the capacity measurement refuses a 2-CPU runner (docs/runbooks/screening-capacity.md, "The
8-core runner"). The two scheduled workflows of docs/adr/0071 add at most about 1,250 runner minutes a month (about
450 for the daily calendar, 780 for the weekly real-size test), inside GitHub Team's included 3,000. Read the budget
after the first private week (docs/runbooks/github-governance.md, step 1).

## Caches

| Cache | Key | Saved by | Restored by |
| --- | --- | --- | --- |
| The pnpm store | setup-node's own | every job | every job |
| tsc's build information, `node_modules/.cache/tsc` | `tsc-v1-<os>-<lockfile hash>-<commit>` | `static`, when its typecheck ran | `static`, by the prefix with the lockfile's hash, then any |
| Each db shard's test durations, `node_modules/.vite/vitest` | `vitest-db-v1-<os>-<N>-<k>-<commit>` | each `db` shard, whatever its result | the same shard, by prefix |
| Playwright's browsers, `~/.cache/ms-playwright` | `playwright-v1-<os>-<hash of playwright-core's browsers.json>` | `unit`, on a miss | `unit`, every `db` and `e2e` shard, by the exact key |

A pull request restores its own caches and its base branch's, and only push runs on the build branch write the base
branch's, so the first pull request after a CI change runs cold. A cache only saves time: tsc compares every input's
hash, the durations only order a shard's files, whose membership the paths alone fix, and the browsers' key is the
list of builds the installed Playwright pins, whose install fetches any build missing from the cache (on a hit it
fetches only the system libraries; in run 40166129200, whose seven installs took 18 to 29 seconds, the browsers'
download was about 10 of `e2e (1/2)`'s 24). The image scans keep no cache: each downloads Trivy's vulnerability
database, the data its verdict is made from, into the runner's temporary directory, outside the checkout the worker
image is then built from. To clear one:
`gh cache list --key tsc-v1-` and `gh cache delete <id>`.

## Running the same checks locally

- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, `pnpm test:oracle` (pyx12 in a virtualenv).
- One database file: `DATABASE_URL=postgres://postgres:test@localhost:5432/postgres pnpm vitest run --project db <file>`
  (each file makes and drops its own database). A shard as CI runs it: `pnpm test:db --shard=k/N`.
- The schema approval: `pnpm db:migrate && pnpm db:domain-model --check --strict --require-approval`.
- The journeys over a build of this commit, from a tree with no uncommitted change: `pnpm build`, then
  `pnpm -s exec tsx apps/web/scripts/build-stamp.ts --write "$(git rev-parse HEAD)"`, then
  `E2E_PREBUILT=1 pnpm test:e2e`. The stamp and the run both refuse a tree with uncommitted changes, which a stamp
  that names a commit cannot vouch for; with edits in the tree, leave `E2E_PREBUILT` unset and the web server builds
  first.
- The workflows: `actionlint .github/workflows/*.yml`, and `pnpm exec vitest run tools/test/workflows.test.ts
  tools/test/ci-gate.test.ts tools/test/required-checks.test.ts`.

## Changing CI

- A new ci.yml job joins `all green`'s `needs` (`workflows.test.ts` fails until it does) and the timeouts table
  (CI-10), and installs Chromium before any vitest step of the unit or db project (CI-05).
- A new required check changes `tools/required-checks.ts`, every marked listing (the test names each file) and the
  ruleset, which only the founder sets.
- A new workflow's concurrency group starts with its own name (`${{ github.workflow }}-`), since groups are shared by
  every workflow of the repository.

## Mutation testing

`.github/workflows/mutation.yml` scores the money paths by mutation (PRD 18; docs/adr/0066, Part 4): the money package,
the pricing engine, the ledger, and the packet verifier and arithmetic. Its `mutation` job is one of the required
checks above.

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
`tools/stryker/unicode.json` lists it with that Node's Unicode and ICU versions (`tools/stryker/gate.test.ts` fails
while an equivalent whose reason names Unicode is not listed). The gate fails a listed entry when a shard ran on other
data, and a test fails when the pin and the listing's Node differ.

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
