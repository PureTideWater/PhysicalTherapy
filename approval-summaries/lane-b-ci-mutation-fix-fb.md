# Fixer FB: the ci-tooling-security findings of draft PR #44 (co-001/ci-mutation)

- Worktree `/home/user/ci-mutation-fb`, branch `co-001/ci-mutation-fb`, cut at 9099fac (the PR's head). Committed, not
  pushed (the Suite agent pushes).
- Scope kept: tools/stryker/** (never tools/stryker/equivalent/*.json), tools/screening-capacity/{watched.ts,
  watched.test.ts} (watched.test.ts unchanged), .github/workflows/mutation.yml, tools/test/workflows.test.ts's mutation
  block, vitest.mutation.config.ts, stryker/**, and the documents: ADR 0066's header and Part 4, ADR 0064's and 0047's
  amendments, the CI runbook's mutation section. Nothing under packages/, fixtures/, content/ or a migration; no model
  identifier but the attribution lines. PRD 18's mutation row and CI line needed no change (they stay true; a deleted
  money test now does count as touching a money path).
- Every behaviour fix failed first: the new tests ran on 9099fac's sources (31 failed, and workspace.test.ts failed to
  load: its module did not exist), then on the fixed ones. Logs:
  `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-failing-first/before-fix.log`,
  `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-failing-first/after-fix-1.log`.
- Tests: none deleted or weakened. The deleted test lines are two import lines widened and three assertions of the
  rewritten mutation block replaced by stricter ones (the guard's env now with SHARDS, its text with `case "$ANY" in`,
  seven `exit 1`s instead of three), beside a new case that runs the guard's own script with bash over 16 verdicts.

## Dispositions (all 14 fixed; none rejected)

### ci-tooling-security/B1 (blocking): a deleted or renamed money test affected no package. Fixed.
Verified first: on 9099fac, deleting cents.test.ts, engine.test.ts, engine.golden.test.ts or scan.test.ts, or renaming
allocation.test.ts to allocation.db.test.ts, gave no package (the reviewer's attack, rerun; and the new tests'
`expected [] to deeply equal [ 'money' ]`).
- `tools/stryker/affected.ts`:
  - each `Closure` carries its `sets` (its MUTATE globs; its TEST_SETS globs less EXCLUDED), and `affected()` counts any
    changed path they select, whether or not the file exists ("(its mutate or test set)"). A rename into the exclusions
    is caught by its old name; the new excluded name alone is still no package's.
  - `affectedSince(base)` (the changes job's whole pull-request path, now a tested function) takes every closure at
    HEAD and at the merge base and unions them (`unionClosures`, `unionGlobal`): the merge base's tree is read from git
    by `treeAt()` through a temporary index into a temporary directory (`git read-tree` + `git checkout-index
    --prefix`), so the repository's index, working tree and worktrees are untouched. A file or manifest only the base
    holds is reported "(in its closure at the merge base)": a deleted helper only a deleted test imported, and a deleted
    package tsconfig.json, which no glob could catch.
- Tests (`affected.test.ts`): a deleted test with its helper, the helper alone, a rename into `*.db.test.ts`, a deleted
  tsconfig, nothing on either side; a real temporary git repository diffed by `affectedSince` (the base tree read from
  git, the deletion found, and a closure that names unlisted data stopping the run); and on this repository the
  reviewer's five cases (cents.test.ts, engine.test.ts, engine.golden.test.ts and scan.test.ts deleted, the allocation
  rename) and a deleted golden claim, each on the head's sets alone and on both sides.

### ci-tooling-security/SF1: the gate never checked that a shard's report holds every file the shard runs. Fixed.
- `stryker/shards.json` gains `noMutants` (the four files Stryker finds no mutant in: money, ledger and pricing
  `index.ts`, pricing `types.ts`), read by `readNoMutants()` (stryker/base.mjs).
- `gate.ts` fails "shard <s>'s <pkg> report has no <file>, which the shard mutates" for any other file of the shard
  missing from its report (not repeated when the report already fails for naming a file the shard does not hold).
- `shards.test.ts` holds each `noMutants` file, through TypeScript's parser, to imports, re-exports, types, `declare`
  statements and `as const` values (the instrumenter reads `TSAsExpression` and `TSEnumDeclaration` as type nodes:
  `@stryker-mutator/instrumenter` 10.1.1 `syntax-helpers.js`, `isTypeNode`), so types.ts's three `as const` arrays are
  sound to list; and refuses a probe with a function, a computed constant, a statement or a local re-export.

### ci-tooling-security/SF2: the mutation job failed open on missing or garbled changes outputs. Fixed.
- `mutation.yml`'s guard: `case "$ANY" in true | false) ;; *) ... exit 1`; SHARDS and PACKAGES must be JSON arrays of
  names (`^\[("[a-z]+(-[a-z]+)*"(,...)*)?\]$`), empty exactly when `any` is false and non-empty when it is true; the
  step now receives SHARDS.
- The gate refuses an empty `--expected` (`expectedShardsOption`), and a garbled one says so instead of a JSON parse
  stack; `affected.ts` refuses an empty `--github-output`.
- `workflows.test.ts` runs the step's own script with `bash -e` (its outputs in files bash makes) over the two good
  verdicts and 14 bad ones: changes failed or cancelled, no `any`, no outputs at all, `any=True`, shards while nothing
  is affected, a shard job while nothing is affected, no shards or `[]` or a bare name while affected, no packages, and
  the shard jobs skipped, failed or cancelled.

### ci-tooling-security/SF3: the Unicode-bound equivalents were not tied to the Node CI runs. Fixed (pin, listing, runtime check).
The best sound way is all three parts together, since a pin alone cannot tell a later pin move from the data the records
were checked on, and a canary case cannot hold an equivalence that only a code-point sweep proves:
- the three jobs of `mutation.yml` run `node-version: 24.22.0` (the Node the integrator's code-point checks ran on:
  Unicode 17.0, ICU 78.3);
- `tools/stryker/unicode.json` lists the four equivalents that rest on Unicode data (readable.ts's three NFKC records,
  mismatches.ts's `marker.start < span.end`), keyed as the equivalents files key them, with `checkedOn` {node 24.22.0,
  unicode 17.0, icu 78.3} (listed here because the equivalents files are FA's: their keys are exact, so no field can be
  added there);
- each shard's canary verdict now names its runtime (`verdict.ts`: `runtime` {node, unicode, icu} from
  process.versions, the same Node the shard's Stryker runs on), and the gate fails a verdict without one;
- the gate fails, naming each entry, a fully-run package whose listed entries a shard scored on other Unicode or ICU
  data, and a listing of an entry no equivalents file records;
- `workflows.test.ts` holds the three jobs to one exact `x.y.z` version equal to `checkedOn.node`, so moving the pin
  fails until the entries are checked again on the new Node and the listing records it.

### ci-tooling-security/SF4: the data-file scan missed common path forms. Fixed.
- `dataLiterals` finds a root after an interpolation (`${REPO}/fixtures/...`, `${base}fixtures/...`), a bare root
  after `./` or `../` anywhere (`new URL('../../../fixtures', ...)`), and a bare root inside `join()`, `resolve()` or
  `new URL()` with nested calls (balanced scan, strings skipped). A root after a plain `/` is not taken as the
  repository's: `packages/rules/content/x` names a nested directory, and reading it as `content/` would fail the job on
  a path no fixture lies at. A bare root stays the whole directory (it needs `<root>/**`), as before.
- The backstop: every closure file that imports `node:fs` (or `fs`, `fs/promises`) must be a DATA_FILES entry's listed
  `readers`, a DIRECTORY_READS file, or an UNCALLED_READS file (`tools/content-files.ts`: its two readers are named in no
  closure file), so a root held in a variable or an array joined is caught at its reader. DIRECTORY_READS also holds
  its list complete: every string the reader names under its directory (interpolations read as `*`) must be a listed
  read. The repository's readers are listed and a test holds each to importing node:fs and lying in its closure.
- The changes job stops on these (`closureProblems`), as it did on uncovered literals.

### ci-tooling-security/SF5: the rule-6 recipe dropped Part 4's provenance from ADR 0066's header. Fixed.
This branch's header now holds every Part 4 fact in an indented `**Part 4**` line under Status, Deciders and PRD
sections (amends 0064 and 0047; #54; the founder's F6 ruling of 2026-10-25, relayed by the co-founder; PRD 17 and 18;
reconciliation-001's checks; CI-15 to CI-17; ADRs 0047 and 0064), and its own field lines hold nothing ci-speed's do
not. The merge keeps ci-speed's field lines and appends those three lines verbatim (recipe below), done by
`/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-rule6/merge-adr-0066.py`,
whose output is
`/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-rule6/adr-merged.md`.

### ci-tooling-security/SF6: importClosure resolved only apps/* and packages/* with simple exports. Fixed.
- New `tools/stryker/workspace.ts`, the one reading of the workspace both readers use: `workspaceDirectories` (moved
  from vitest.mutation.config.ts), `workspacePackages`, `importTarget` (import, node, default; arrays; null),
  `exportEntries`, `resolveExport` (Node's pattern rule: exact subpath first, then the longest text before `*`, `*` one
  character or more, every `*` of the target replaced) and `resolveWorkspaceImport`.
- `vitest.mutation.config.ts`'s `workspaceAliases` is built from it (exact aliases first, then patterns by
  specificity): the 63 aliases are the same set as before (compared on this repository).
- `watched.ts`'s `importGraph` resolves through it and reports what should resolve and does not: a relative path to no
  file, a workspace package's subpath it does not export or excludes, a package without exports, a name in a
  workspace scope that is no package. `importClosure` keeps its signature; the watched list is unchanged
  (watched.test.ts passes unchanged).
- The changes job stops on any such import in a closure. Tests: a synthetic workspace with tools, a nested package,
  conditions, arrays, a pattern and an excluded pattern; `workspace.test.ts` holds every export of this repository to
  resolve to the file its mutation alias points at.

### ci-tooling-security/N1: the gate took a self-review and a future review date. Fixed.
`reviewProblem` refuses `reviewedBy` equal to `proposedBy` (trimmed, any case) and a `reviewedOn` after the run's UTC
date (`GateInput.today`, today's by default).

### ci-tooling-security/N2: the ledger's `fixtures/synthetic/**` ran money-ledger for every synthetic fixture. Fixed.
DATA_FILES.ledger names what templates.test.ts reads: six LED files (LED-04, 05, 06, 08 twice, 09; the review said
five) and `emr/*/manifest.json`, `emr/*/posting-export.csv`, through a DIRECTORY_READS entry whose completeness rule
holds the list to every name the test joins to `fixtures/synthetic`. CI-15's expected.json, an 835 or an ERA export no
longer run the ledger; a posting export or vendor manifest still does.

### ci-tooling-security/N3: tsx and the tooling's own imports were not tracked. Fixed.
`TEST_TOOLING` adds tsx; `globalFiles` returns the global closure's bare imports by importer (yaml, owned by tools;
vitest/config), and every closure's lockfile comparison includes them. A tsx or yaml bump now affects all four.

### ci-tooling-security/N4: ADR 0047's amendment gave only the old packets score. Fixed.
It now gives 95.87% (2,299 of 2,398; 99 undetected, each a reviewed equivalent; 2 load failures left out), from
85.61% on the runner bump alone.

### ci-tooling-security/N5: the rule-6 notes listed the lockfile and missed two stale lines. Fixed (recipe below).

### ci-tooling-security/N6: the gate ignored top-level files and a package report in the wrong shard. Fixed.
`readReportDirectory(dir)` returns the shards and the files at dir's top (`readShardResults` keeps its contract); the
gate fails each top-level file, and a shard's report of a package the shard does not hold. The runbook says a narrow
local run's top-level report is refused as stray.

### ci-tooling-security/N7: one heading level per Part after the merge. Fixed (recipe below).
Parts 2 to 4 are `## Part N` with `###` sections (ci-speed's own placeholders and this branch's Part 4), so the merge
puts Part 1 under `## Part 1 (`co-001/ci-speed`)` with each of its headings one level down.

## Rule-6 merge with ci-speed (replaces the build summary's section)
When this branch merges claude/build-platform after #43 (co-001/ci-speed, b5ff4c7 when checked):

- **Files both change** (`git diff --name-only 49514e8 origin/co-001/ci-speed` against this branch): README.md, ADR
  0064, ADR 0066, reconciliation-001, the test matrix, docs/runbooks/ci.md, package.json, the synth plumbing (args.ts,
  common.ts, matrix.ts, registry.ts, expected/types.ts, fixtures.test.ts, write.ts), tools/test/workflows.test.ts and
  vitest.config.ts. Not the lockfile: ci-speed does not change pnpm-lock.yaml, so it merges as this branch's (N5). Only
  if ci-deps or another lockfile change merged first: start from the build branch's lockfile, `pnpm install
  --lockfile-only` (ci-deps's pnpm if it pinned one), then `pnpm install --frozen-lockfile`; this branch adds the
  tools/stryker/canary/lib importer, tools' devDependency link to @tp/stryker-canary and Stryker 10.1.1.
- **ADR 0066** (add/add), mechanically, as
  `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-rule6/merge-adr-0066.py`
  does it (`python3 -I merge-adr-0066.py <ci-speed's file> <this branch's file>`; its output on b5ff4c7 and this branch
  is `adr-merged.md` beside it):
  1. Header (SF5): keep ci-speed's five field lines; under its Status, Deciders and PRD sections bullets, add this
     branch's indented `**Part 4**` line of the same field, verbatim; drop this branch's own field lines (all they say
     beyond ci-speed's is in those three lines).
  2. One heading level per Part (N7): insert `## Part 1 (`co-001/ci-speed`)` before ci-speed's `## Context`, and
     move each heading from there to the `## Part 2` placeholder one level down (`##` to `###`, `###` to `####`).
  3. N5: in Part 1's alternatives, "mutation's own triggers (the schedule, labels)" becomes "mutation's own triggers
     (every push to the build branch, the schedule, dispatch, and pull requests by the paths they change)".
  4. Replace ci-speed's `## Part 4 (`co-001/ci-mutation`)` / "Appended by that pull request." with this branch's
     `## Part 4` section, to the end of the file. Parts 2 and 3 stay placeholders.
- **docs/runbooks/ci.md** (add/add): ci-speed's file, then this branch's `## Mutation testing` section (its `###`
  subsections included) appended; one title.
- **Test matrix**: move CI-15 to CI-17 into ci-speed's CI table after CI-10; drop this branch's heading and intro; and
  (N5) ci-speed's intro sentence "CI-11 to CI-20 are reserved for the series' later pull requests." becomes "CI-11 to
  CI-14 and CI-18 to CI-20 are reserved for the series' later pull requests; CI-15 to CI-17 are the mutation workflow's
  (docs/adr/0066, Part 4)."
- **Synth**: the plumbing hunks are identical to ci-speed S1's; keep both sets of matrix and registry rows in ID order;
  then `pnpm synth --all` and a clean diff.
- **tools/test/workflows.test.ts**: replace ci-speed's mutation block with this branch's whole block (its helpers,
  `spawnSync`, `PINNED.setupNode` and `stepIndex`, are in ci-speed's file), and set CI-10's timeout table line to
  `'mutation.yml': { changes: 5, stryker: 30, mutation: 10 }`. The mutation job keeps `if: ${{ always() }}`, the form
  ci-speed's required-checks test accepts, and its concurrency group starts `${{ github.workflow }}-`.
- **vitest.config.ts**: keep both hunks (this branch puts 'packages/money/src/**' first in BRANCH_GATED).
- **README, ADR 0064, reconciliation-001**: different sections; keep both.
- If ci-deps merges first: re-pin mutation.yml's `uses:` in its form (its pin tests hold it); the exact
  `node-version: 24.22.0` of the three mutation jobs stays (workflows.test.ts holds it to tools/stryker/unicode.json).
- After the merge: the PR's own run measures every package again (the configs change); O7 rebalances
  stryker/shards.json from that run's times.

## Commits (on 9099fac; not pushed)
- 10ebda3 mutation: closures on both sides of a change and from the sets, the shared workspace resolver, the data scan
  and its readers, the ledger's named exports, tsx and yaml as tooling, an empty --github-output refused (B1, SF4, SF6,
  N2, N3, SF2's changes side).
- 5a60b4d mutation: every shard file in its report (noMutants), independent and dated reviews, stray reports, an
  empty or garbled --expected, the canary's runtime and the Unicode listing (SF1, N1, N6, SF3, SF2's gate side).
- 68b6f30 ci: Node 24.22.0 in all three jobs, the fail-closed guard and its behavioural test (SF2, SF3).
- fba28f8 docs: ADR 0066's header and Part 4, ADR 0064's and 0047's amendments, the CI runbook (SF5, N4).

## Checks (on the fixed tree, each heavy command under `flock /tmp/laneb-heavy.lock`)
Batch logs: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fb-checks-1/`
(and `fb-checks-2/` beside it).
- [pass] `pnpm exec vitest run --project unit tools/stryker tools/screening-capacity tools/test`: 30 files, 425 passed
  (53 s); the watched list test unchanged and passing.
- [pass] `actionlint .github/workflows/mutation.yml .github/workflows/ci.yml .github/workflows/screening-capacity.yml`
  (1.7.7): no output.
- [pass] The canary (`pnpm stryker run tools/stryker/canary/stryker.config.mjs`, then `verdict.ts --shard
  money-ledger`): 5 of 5 as expected, case 3 through the aliases now built from tools/stryker/workspace.ts; the verdict
  names Node v24.22.0, Unicode 17.0, ICU 78.3.
- [pass] The money-ledger shard (`pnpm -s exec tsx tools/stryker/shards.ts money-ledger`, 3 min 42 s) and the gate over
  its fresh report (`pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected '["money-ledger"]'`): "mutation
  gate: passed"; money 97.00% (227 of 234; 7 undetected, all recorded; 7 load failures left out), ledger 98.13% (1,633 of
  1,664; 31, all recorded); every file of the shard in its report but the noMutants index files.
- [pass] The review's gate attacks, rerun on the fixed gate over the integrator's final reports of all six shards
  (`fb-tools/gate-attacks.mts`, their canary verdicts given the runtime the fixed verdict.ts writes): the baseline
  passes with the PR's numbers (money 97.00%, pricing 98.57%, ledger 98.13%, packets 95.87%), so the per-file rule and
  noMutants fit the real reports; and every attack now FAILS, naming the problem: trace.ts left out, pairing.ts left
  out, every pricing-rest file but release.ts, packets-rest without dates.ts, placeholders.ts and windows.ts,
  reviewedBy = proposedBy, reviewedOn 2099-12-31, money.json in packets-scan, a top-level file, packets scored on a
  Node with Unicode 18.0, a verdict without its runtime.
- [pass] The review's affected attacks, rerun (`fb-tools/affected-attacks.mts`): deleting engine.test.ts, cents.test.ts,
  engine.golden.test.ts or scan.test.ts, and renaming allocation.test.ts to allocation.db.test.ts, each give their
  package on the head's sets alone and on both sides ("(in its closure at the merge base)"); a deleted
  packages/money/tsconfig.json gives none on the head alone and all four on both sides; CI-15's expected.json gives none;
  `closureProblems` on this repository is empty. Of the path forms, the four literal ones are found by the scan; the
  variable and the joined array are found at their reader (synthetic cases in affected.test.ts).
- [pass] `pnpm typecheck`: exit 0 (125 s).
- [pass] `pnpm lint` (`--max-warnings=0`): exit 0 (166 s).
- [pass] Failing first: the new cases on 9099fac's sources, 31 failed and workspace.test.ts did not load (logs above).
- [pass] Scope: `git diff --name-only 9099fac HEAD` touches only the files listed at the top; no file under packages/,
  fixtures/, content/ or a migration; no model identifier in the diff (grep), and each commit ends with the two
  attribution lines.
- [pass] The changes job on this branch's own diff (`pnpm -s exec tsx tools/stryker/affected.ts --event pull_request
  --base 49514e8 --github-output <file> --summary <file>`, 13 s with the merge base's tree read from git): all four
  packages and all six shards (the workflow and the tooling changed), `any=true` with both arrays written; no closure
  problem. With `--github-output ''` it exits 1, writing nothing.
- [pass] `pnpm exec vitest run --project unit tools/brand-colors tools/brand-copy tools/engine-freeze/check.test.ts
  packages/synth tools/golden-worksheet/engine.test.ts`: 17 files, 254 passed (the colour scan finds nothing in the new
  files). `pnpm -s lint:logs`: 985 files, every log call allowlisted. `pnpm -s check:fixtures`: every interchange
  synthetic.
- [pass] Rule-6 trial: `git merge-tree --write-tree origin/co-001/ci-speed HEAD` conflicts in the same six files as at
  9099fac (ADR 0066, the test matrix, the runbook, matrix.ts, registry.ts, workflows.test.ts; workflows.test.ts in 2
  hunks, as before); the ADR's header, headings and Part 4 merge by the script above.

## For Lane A (PR 6c)
- No engine behaviour is changed or pinned by this fix round (no file under packages/ changes).
- A new pricing source file PR 6c adds needs its shard in stryker/shards.json (the partition test fails until it has
  one), and the gate now fails a shard report that leaves out a file the shard holds; only a file of imports,
  re-exports, types and `as const` values may go in `noMutants`, which shards.test.ts checks through TypeScript's parser.

## Open items and notes for the Suite agent
- FA's fixes may move the pricing, money or ledger numbers in ADR 0066 Part 4's table ("Measured"); this round leaves
  that table as it was at 9099fac. ADR 0047's new after score is packets', which FA does not touch. FA and FB both edit
  ADR 0066 Part 4 only if FA changes "Measured"; FB's edits are in the header, the gate list, the equivalents paragraph,
  "What runs" and "Consequences".
- tools/stryker/unicode.json lists mismatches.ts's `marker.start < span.end` record, whose reason in
  tools/stryker/equivalent/packets.json (FA's file) speaks of grapheme clusters but does not name "Unicode" as
  readable.ts's three do; ADR 0066's rule is that such a reason says so. A one-word addition there, by the file's owner,
  would make the four alike (the gate matches by key, so the listing holds either way).
- The PR's next CI run measures all four packages (tools/stryker/** changed), regenerating every canary verdict with
  its runtime; the integrator's earlier artifacts have none, so the fixed gate would refuse them, as it should.
- Node 24.22.0 is not in the ubuntu-24.04 image's toolcache (run 40195705539 found 24.21.0 there), so setup-node
  downloads it in each mutation job: a few seconds each.
- The gate refuses a narrow local run's top-level report (`reports/mutation/<package>.json`) as stray; the runbook says
  so and how to run the gate past it.
