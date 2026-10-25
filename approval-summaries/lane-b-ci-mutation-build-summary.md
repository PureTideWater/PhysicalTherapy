# co-001/ci-mutation build summary (CI 4 of 4, combined audit #54; ADR 0066 Part 4; 2026-10-25)

Branch co-001/ci-mutation, cut at 49514e8 (claude/build-platform) ahead of PR 1 (co-001/ci-speed, #43, still open),
integrated and pushed once at 9099fac075f9072b9a30aaa0e050fe032f8a8a7d (25 commits: the builders' 15, five
merges and the integrator's 5). Draft PR #44 (https://github.com/PureTideWater/PhysicalTherapy/pull/44) into
claude/build-platform. No migration; docs/product/domain-model.md, packages/db, apps, content/releases,
fixtures/golden and synthetic releases 900001-900004 unchanged; nothing non-test under packages/pricing or
packages/packets; the ledger by additions only; the one non-test money change is packages/money/src/cents.ts:85.
110 files, +8,175 / -398. Synthetic data only.

## M1, runner, configs, canary, gate, affected, workflow and documents (head 4939f8b)

M1 built the runner bump first (445725f, the commit M2 to M4 measured on) and then the tooling, in five more commits:
ffb51d0, 5efd0dc, fb6e66c, bad695d and 4939f8b.

What was built:
- **Runner:** @stryker-mutator/{api,core,vitest-runner} 10.1.1; the 10.0.0 patch, its `patchedDependencies` entry and
  tools/stryker/runner.test.ts deleted; stryker.config.mjs, stryker.verifier.config.mjs and both vitest.stryker
  configs replaced by stryker/base.mjs (vitest runner, perTest, json/html/clear-text, every CPU, no break threshold,
  `timeoutMS: 30000`) and stryker/{money,pricing,ledger,packets}.config.mjs; stryker/shards.json with the six shards.
- **vitest.mutation.config.ts:** every workspace export aliased to the sandbox's files, fast-check seeded for mutation
  runs only (tools/stryker/seed.ts, setup in seed-setup.ts), each package's own tests (pricing's with
  tools/golden-worksheet/engine*.test.ts) less the four reasoned exclusions; `mutationTestConfig()` shared with the
  canary.
- **The canary** (tools/stryker/canary, CI-15): five cases held to expected.json (named.ts, load.ts, lib/index.ts as
  `@tp/stryker-canary`, seeded.ts, prefix.ts), its verdict (verdict.ts) written to reports/mutation/<shard>/canary.json.
- **The gate** (tools/stryker/gate.ts, CI-16) with mutants.ts's keys (file, mutator, original, occurrence,
  replacement) and shards.ts.
- **What a change affects** (tools/stryker/affected.ts, CI-17): file-level closures (imports with tests, manifests and
  tsconfigs, DATA_FILES held complete by a scan of path literals under fixtures/, content/ and docs/, lockfile
  snapshots and the test tooling); watched.ts's `includeTests` (off by default, the watched list unchanged).
- **mutation.yml** rewritten: push to the build branch, pull requests on default types, weekly, dispatch; `changes`
  (5), `stryker (<shard>)` (30, canary first, reports uploaded with overwrite), `mutation` (10, `if: always()`);
  actions pinned to the release workflows' SHAs; workflows.test.ts's mutation block rewritten.
- `packages/money/src/**` joins `BRANCH_GATED`.
- **Documents:** ADR 0066 (header and Part 4 only), ADR 0064 and 0047 amended, PRD 17's milestone 6 check and 18's
  mutation row and CI line, milestone-prompts.md's milestone 6, reconciliation-001's F6 exception, the CI runbook's
  mutation section, CI-15 to CI-17 in the test matrix and the synth registry with their expected files.

- difference: workflows.test.ts changes outside the mutation block in one line, the job-timeouts table's mutation.yml entry. Why: the table lists every job of every workflow.
- difference: the gate is stricter than section 3.4.1: it also fails an equivalent matched to a detected or load-breaking mutant; Ignored, CompileError or Pending mutants; a selected shard that reported nothing and an unselected one that did; unknown shard directories and stray files; keys out of order; a reviewedOn that is not a real date. Why: a detected mutant is not equivalent, the file is the only form, and a missing artifact must not pass silently.
- difference: the data-file scan also reads docs/; a directory literal needs `<dir>/**` unless DIRECTORY_READS names what is read there. Why: pricing's unpriced-reasons.test.ts reads two docs/product files.
- difference: closures include each workspace package's tsconfig.json; the global inputs add the root tsconfigs and the tooling's own import closure. Why: esbuild reads tsconfig options, and the tooling decides what runs.
- difference: "a test-only pricing change gives pricing and packets" holds for pricing's test support (testing.ts); one of pricing's own tests gives pricing alone. Why: the file-level closure the design adopted (R5).
- difference: the canary's verdict is a second command of the canary step; its Stryker report goes to reports/canary. Why: case 5 expects a survivor, so no break threshold can decide, and the shards' artifacts must merge without collisions.
- difference: the seed constant is split from its setup file; case 1's files are named.ts and named.test.ts. Why: case 4 must read the seed without seeding the run.
- difference: @tp/stryker-canary declares no dependency of its own. Why: its node_modules under tools/ broke tools/test/repository.test.ts.
- difference: milestone-prompts.md gets milestone 6's exit beside PRD 17's check. Why: the opening prompt's "Done when" must equal the amended check (F6).
- difference: the shard job prints its own view (gate.ts --shard); scores are truncated, never rounded up. Why: verdicts in the log; no printed score above the line when the score is not.

## M2, pricing survivors and the golden test (head 415155a)

M2 committed fd7a0dc, 7ce73cd and 415155a on 445725f.

What was built:
- **The golden engine test priced per claim** (fd7a0dc): 154 per-claim tests and a claim-set test, no value the engine
  computes shared between tests (each test indexes its claim's release itself); `pnpm test:golden` 38 to 188
  (38 - 5 + 154 x 1 + 1); the --report output byte-identical; `git diff --color-moved=plain` leaves 29 removed lines
  unmoved (imports, the describe-level run, five it headers, the report call and the aggregate assertions restated over
  the golden lines).
- **54 new pricing tests** (7ce73cd), none changed or removed and no source touched, with fixed examples for the ten
  mutants only fast-check's properties killed (dates.ts:61, recompute.ts:514 x4, engine.ts:276, :371 x3, :740).
- **35 equivalents** proposed in tools/stryker/equivalent/pricing.json (415155a).
- Pricing on 445725f 91.48% (1,782 of 1,948, 166 undetected); on 415155a 98.21% (1,925 of 1,960, 35 recorded).

- difference: the claim-set test restates the old aggregate assertions over the golden expected lines, not over engine results. Why: no test holds all results once each claim is priced in its own test.
- difference: each golden test indexes its claim's release itself. Why: goldenRelease memoizes the index across tests, which would credit release.ts mutants to the first claim only.
- difference: analysis runs beyond the three shards (a no-bail pricing-rest run of 23.7 min, two shards without properties.test.ts in a scratch worktree). Why: to turn property-only kills into fixed examples; never two Stryker runs at once.
- open: three frozen-engine behaviours are pinned by new tests a reviewer may question: a malformed year basis prices as CURRENT, an unknown terms rounding rule stops at step 'rounding' with ENGINE_ERROR unexpected, an inherited 'null' place-of-service key gives no setting. For Lane A's PR 6c: if 6c makes a malformed year basis ENGINE_ERROR, those two tests change with it.

## M3, money and ledger survivors (head 4d7da25)

M3 committed bf95991, 1f2d6bf and 4d7da25 on 445725f.

What was built:
- **cents.ts:85** branch-free, behaviour unchanged: `BigInt(match[2] ?? '0')` became `BigInt(match[2] as string)`;
  UNROUNDED_CENTS_TEXT at :73 requires group 2 (`(\d+)`), so the fallback was unreachable. The series' one non-test
  money change; the engine differential test against 49514e8 prices alike (23 passed); money at 100% branches (56/56).
- **Money tests:** each refusal by class, name and message; formatUnroundedUsd by a table; multiplyCents to cents or a
  decimal, and text or a number cast past the type refused (rounding.ts:26).
- **Ledger tests by additions only:** new `it` blocks in eleven files and one new file (rules.test.ts); `git diff
  --numstat 49514e8 -- packages/ledger/src` shows 0 deletions on all 12 files, all *.test.ts.
- allocateByWeight's tie order held under an insertion sort that calls the comparator as (earlier, later), so its two
  allocation.ts:50 tie mutants are killed instead of recorded on V8's sort.
- **Equivalents proposed:** money 7, ledger 31.
- Money 93.22% to 97.01%; ledger 91.89% to 98.14%; LED-01 to LED-11 and the ledger oracle unchanged and passing.

- difference: one new ledger test file, rules.test.ts, for the stage tables and every refusal's message. Why: stages.test.ts's one-line import could not change without deleting a line.
- difference: allocation.test.ts gains a second vitest import line. Why: its existing import line may not change (0 deletions).
- difference: two kills use an input or environment the types or V8 would not produce (rounding.ts:26 by text cast past Cents; allocation.ts:50 by a conforming insertion sort). Why: nothing else tells those mutants apart, and ECMAScript fixes a sort's result only for a consistent comparator.
- open: LED-01's Playwright spec (apps/web/e2e/packets.spec.ts) was not run locally; CI's e2e shards run it.

## M4a, packets: scan, readable, placeholders and the verifier (head 42673ef)

What was built:
- 34 new `it` blocks in scan.test.ts, verifier.test.ts, placeholders.test.ts and readable.test.ts, killing 122 of the
  200 undetected mutants of scan.ts, verifier/mismatches.ts, verifier/index.ts, placeholders.ts and readable.ts.
- 78 equivalents proposed (required-group fallbacks, the number-word grammar's invariants, NFKC's hidden characters,
  sorts of already ordered passes, a hash's default encoding), with fuzz evidence for readable.ts:81 and
  mismatches.ts:196.
- Those files 86.29% to 94.65%; placeholders.ts 100%.

- open: for the founder: verifier.test.ts pins today's conservative reading that "a 3650-day window" fails (DAYS_AFTER does not accept the hyphen); accepting it is a later packets source change.
- open: a later packets source pull request could remove 37 of the records by writing scan.ts's `?? ''` reads after required groups branch-free; outside this pull request's one-money-change rule.

## M4b, packets: assembly, facts, calculation, interest, payer, dates and windows (head 9656467)

What was built:
- 27 new `it` blocks in assemble, calculation, facts and interest tests and a new dates.test.ts, killing 121 of the
  145 undetected mutants of assemble.ts, facts.ts, calculation.ts, interest.ts, payer.ts and dates.ts.
- 24 equivalents proposed; the seven that hold only for values their type or format allows name the code that keeps
  each so (MA_NONCONTRACTED_CITATION, the worker's date::text reads, triage's window ends, the release schema's
  required rate at packages/rules/src/schema.ts:298).
- Those files and windows.ts 84.56% to 97.44%; a run with every property at zero runs leaves all 939 statuses as they
  were, so no kill rests on the seed.

- open: the reviewer's judgment on the seven type- or format-bound records (settled by the integrator below: four hold, three are killed).

## Integrator: draft PR #44 head 9099fac075f9072b9a30aaa0e050fe032f8a8a7d

### Merges and seams
- `git merge --no-ff` of m1 (d2b724e), m2 (0fd44b6), m3 (edb2ef7), m4a (b734b2f) and m4b (0a465cf), each a merge
  commit in the ci-speed integration's form. Only conflict: `tools/stryker/equivalent/packets.json` (add/add), resolved
  as M4a's 78 and M4b's 24 entries in one array sorted by file, original and occurrence (byte-identical to M4b's trial
  merge, `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/m4b/merged-packets.json`). M2 to M4 had built on 445725f; M1's later tooling merged
  without a conflict, and the tooling tests pass on the merged tree (43 files, 547 tests).
- Seams found by the full runs and fixed (17d575a):
  - `tools/brand-colors`' scan read three canary comments' stryker-js issue numbers written with a hash (load.ts:5,
    prefix.ts:3, stryker.config.mjs:15) as hex colors; they now say "issue 6246" and "issue 6269". The canary is 5 of
    5 after it.
  - `tools/stryker/gate.test.ts`'s 85.01% case (10,000 mutants) took 4.5 s alone and 8.7 s in the full unit run, past
    Vitest's 5 s: the gate's report reader rescanned the source per mutant. mutants.ts's new `sourceIndex` reads each
    file's line starts and each original's start positions once (offsetOf's and occurrenceAt's answers by lookup and
    binary search, held equal to theirs at every position by a new test), and test-support's `reportOf` likewise. The
    case now takes milliseconds, and so does the gate on a large report.
  - `tools/stryker/affected.test.ts`'s lockfile case (rewrites and reads the 1 MB lockfile ten times) took 3.7 s alone
    and 6.9 s loaded: it parses the lockfile once for its versions and has a 60-second limit, as the repository's other
    whole-repository tests do.
- M2's recommended optimization, done (b136446): tools/golden-worksheet/engine.test.ts priced every golden claim when
  the file loaded, so 799 of engine.ts's 855 mutants were static. Its six tests now price the claims they read inside
  the test, each under a release index of its own (the engine.golden.test.ts pattern); every assertion and test is
  unchanged. Measured: static 799 to 45, every engine mutant's status the same, but the shard's time barely moves (9 min
  21 s against 9 min 27 s), because the tests that price every claim still cover nearly every engine mutant. Recorded in
  ADR 0066 Part 4.
- M2's request 3 (drop goldenRelease's cache or add an opt-out) is not done: every test that needs its own index now
  builds it, so nothing reads the cache across tests, and the worksheet and triage golden tests keep the speed the cache
  gives them. `runEngineOnGolden` in tools/golden-worksheet/engine.ts now has no caller (open item).

### The equivalents review (175 proposed: money 7, ledger 31, pricing 35, packets 102)
Each record was read against its source and the integrator tried to build an input that tells the mutant from the
original: a value of the function's declared parameter types, as plain data (a string any text, an object exactly its
declared fields), on any conforming JavaScript engine. 165 hold and carry `reviewedBy: "integrator (Lane B,
ci-mutation)"`, `reviewedOn: "2026-10-25"`; 10 did not and are killed by new tests in their owners' file sets
(752cb9d), their records deleted.
- **Killed, pricing (7):** engine.ts:401 `a - b` to `a + b`, engine.ts:725's two tie-breaks to sums, and release.ts:55's
  four comparator mutants were right only because V8 calls a comparator as (later, earlier) and reads only "below
  zero". ECMAScript leaves the call order to the engine and fixes the result only for a consistent comparator. The new
  `packages/pricing/src/sorts.test.ts` (15 runs) prices a visit, two lines tied on practice expense and one line's units,
  and indexes out-of-order and same-start records, under the native sort and under a stable insertion sort that calls
  the comparator in either order, and expects the same lines; under the earlier-first order each mutant reverses an
  order a trace, a price or `latestInYear` shows (for engine.ts:725's line tie, the reduction lands on the other line).
  M3 had applied the same standard to allocation.ts:50, so the pull request now has one.
- **Killed, packets (3):** assemble.ts:219's two (a line with no end kept and sorted as the text "null") and
  assemble.ts:164's (the service dates taken in the schedule's localeCompare order instead of sorted) agree with the
  original for every YYYY-MM-DD date but not for every string. Two new `it` blocks in assemble.test.ts hold the
  deadline to the lines that state an end and the pattern's first and last dates to code-unit order, with text that is
  not a date.
- **Held, with the evidence:** the money and ledger records against their branches (each boundary, `null <= 0n` in
  JavaScript, CSV's CRLF and blank rows, readDate's whole-text check); pricing's placeholder outcome, kind literals
  compared only with 'stopped', sorts of already ordered lists with a consistent (`() => undefined` reads as +0) or no
  comparator, and recompute's checks an earlier step or the trace schema already decides (`rvu` is nullable, not
  optional, in a strict object); packets' required-group fallbacks, the number-word grammar's invariants, the hash's
  default encoding, ECMA-402's default granularity, JSON parameters, the regulation citation's literal method and the
  release schema's required rate. The scanner's 21 non-trivial records were checked again by differential fuzzing:
  each mutant applied to its own copy of packages/packets/src, scanText and sentenceSpans compared with the original
  on 60,000 random narratives: no difference (one apparent difference was the fuzzer's own missing parentheses for the
  `||` mutant, fixed and rerun). readable.ts:81's three (NFKC never adds or removes a hidden character) were checked
  over every code point on Node 24.22 (Unicode 17.0), canonical decompositions and compositions with marks included:
  0 differences; mismatches.ts:196 (no marker starts exactly at a sentence end) by checking that no grapheme cluster's
  shown form puts whitespace after content or before a `[`: none. These two rest on the engine's Unicode data, as their
  reasons say; ADR 0066 Part 4 and the runbook now state the standard. Scripts:
  `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/int/fuzz/scan-mutants.mjs`, `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/int/tools/nfkc-hidden.mjs`, `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/int/tools/cluster-ws.mjs`.
- M4b's seven type- or format-bound records: four hold (assemble.ts:106 x2 and :141 by the regulation citation's
  declared fields, interest.ts:117 by its required key), three are the packets kills above.

### Checks
- [pass] `git merge --no-ff co-001/ci-mutation-m1` … `-m4b`: one add/add conflict, resolved as above.
- [pass] `pnpm install --frozen-lockfile`: exit 0 (Stryker 10.1.1 in, 10.0.0 out).
- [pass] `flock … pnpm exec vitest run tools/stryker tools/test tools/screening-capacity packages/synth` (merged tree, `DATABASE_URL` set): 43 files, 547 passed.
- [pass] `flock … pnpm typecheck` (17d575a): exit 0, 94 s.
- [pass] `flock … pnpm lint` (17d575a): exit 0, `--max-warnings=0`, 169 s.
- [pass] `actionlint .github/workflows/*.yml` (1.7.7): exit 0, no output.
- [fail, then fixed] `flock … pnpm test` (cc0260c): 3 failed of 4,813 (the brand-colors scan, the gate and affected timeouts), fixed in 17d575a.
- [pass] `flock … pnpm test` (17d575a): 310 files, 4,811 passed, 3 skipped; every BRANCH_GATED threshold met. `vitest run --project unit packages/money packages/ledger --coverage` on the two packages: 361 passed, branches 471 of 471 (money 56 of 56).
- [pass] `vitest list --project unit` at 49514e8 and at the head (offline-installed base worktree, removed): 3,053 and 3,288 by file and name; 241 added; 6 gone, all moves the design names (canary.test.ts's 3, renamed named.test.ts with the same names; runner.test.ts's 2, deleted with the patch; the old mutation block's label test).
- [pass] `flock … pnpm test:golden`: 4 files, 188 passed (38 - 5 + 154 x 1 + 1), the claim-set test green.
- [pass] `flock … vitest run --project db` packets, reconcile ledger, ledger-oracle, chain, lines, exports, reconciliation-routes and catalog (PG18 on 5433): 8 files, 129 passed (LED-01 to LED-11, the ledger oracle, SEC-01).
- [pass] `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8`: "(no non-test file under packages/pricing/src changes)", nothing let through, no problems; `ENGINE_FREEZE_BASE=49514e8 vitest run tools/engine-freeze/differential.test.ts apps/worker/src/packets/export.test.ts`: 2 files, 23 passed.
- [pass] The canary (`pnpm stryker run tools/stryker/canary/stryker.config.mjs`, then `verdict.ts --shard <s>`) first in every shard: 5 of 5 as expected in each of the six (and again after 17d575a's comment change).
- [pass] All six shards on 17d575a, one after another under the lock, then `pnpm -s exec tsx tools/stryker/gate.ts reports/mutation --expected '<all six>' --summary`: "mutation gate: passed". money 97.00% (227 of 234), ledger 98.13% (1,633 of 1,664), pricing 98.57% (1,932 of 1,960), packets 95.87% (2,299 of 2,398); undetected 7, 31, 28 and 99, every one a reviewed equivalent; load failures 7, 0, 12, 2. Stryker's times: money-ledger 3 min 34 s, packets-scan 5 min 31 s, packets-rest 8 min 17 s, pricing-engine 9 min 21 s, pricing-recompute 3 min 54 s, pricing-rest 5 min 49 s, each under 15 minutes. Mutant for mutant, every shard equals the first integrated run but for the three packets kills (Survived to Killed); the first run's gate failed only on those three, run before their tests landed. Reports: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/int/run-final/` (and `run-final2/` for money-ledger, rerun after a local coverage run of mine raced its sandbox copy).
- [pass] The gate's negative proof: in a scratch worktree at 17d575a, the formatUnroundedUsd row deleted from cents.test.ts's MoneyError table, `TP_MUTATION_SHARD=money-ledger pnpm stryker run stryker/money.config.mjs`, then the gate over every shard: exit 1, "money: unexplained Survived packages/money/src/cents.ts:83:26 StringLiteral "'an unrounded amount is cents as decimal text'" #1 -> """, covered by "formatUnroundedUsd > refuses anything but cents as decimal text", money 96.58%. Worktree removed; nothing restored in the branch because nothing in it changed.
- [pass] Scope (section 3.4.4 step 1): `git diff 49514e8 -- packages/pricing/src ':!**/*.test.ts'` and `-- packages/pricing ':!packages/pricing/src/**'` empty; `git diff --numstat 49514e8 -- packages/ledger/src` 12 files, all *.test.ts, 0 deletions each; `git diff --name-only 49514e8 -- packages/money/src ':!**/*.test.ts'` exactly cents.ts, the :85 line; `fixtures/golden`, `content`, migrations, the domain model, apps and packages/db unchanged; under fixtures/ only CI-15 to CI-17's expected files; no non-test file under packages/packets.
- [pass] Test deletions: every deleted line in a test file is an import line widened, the golden restructure's moves, runner.test.ts, the canary rename, the rewritten mutation block or engine.test.ts's module-level run; no assertion weakened.
- [pass] `flock … bash -c 'pnpm synth --all && git diff --exit-code -- fixtures/synthetic && test -z "$(git status --porcelain -- fixtures/synthetic)"'`: 180 cases, 0 written, 449 unchanged; 16 EMR files unchanged.
- [pass] `pnpm install --frozen-lockfile --offline && pnpm -s lint:logs && pnpm -s check:fixtures && pnpm -s verify-content`: 984 files; 234 guarded and 2,747 searched; every content set passes.
- [pass] `flock … vitest run --project unit tools/test tools/brand-copy tools/brand-fonts tools/brand-colors tools/stryker tools/engine-freeze/check.test.ts tools/golden-worksheet/engine.test.ts` on 9099fac (after the last docs commit): 28 files, 324 passed.
- [pass] `pnpm -s db:domain-model --summary-since origin/claude/build-platform`: "No change: the two documents have the same text"; SHA-256 6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712 on both sides, approved by Tyler Williams on 2026-10-23. It opens the PR body's Domain model section.
- [pass] Model identifiers: none in the diff or any commit message beyond the two attribution lines, which end all 25 commits (the builders' 15, the five merges and the integrator's 5).
- [pass] `git push -u origin co-001/ci-mutation`: the pre-push hook checked 25 commits (fixture guard, 141 text files searched for an X12 header, gitleaks found no secret); new branch, no force, no `--no-verify`.
- [pass] Draft PR #44 opened with the GitHub MCP tool (owner PureTideWater, head co-001/ci-mutation, base claude/build-platform, draft). The create call replaced the body's last two lines with its own footer; an update_pull_request call restored them, and the body is byte-identical to `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/int/pr-body.md` (`gh api .../pulls/44 --jq .body`).
- [pass] CI run 40195705539 on 9099fac, mutation.yml: `changes` chose all four packages; all six `stryker (<shard>)` jobs succeeded (money-ledger 4 min 6 s, pricing-recompute 4 min 17 s, packets-rest 5 min 50 s, pricing-engine 6 min 22 s with a 5 min 59 s Stryker run, pricing-rest 6 min 33 s, packets-scan 6 min 39 s), each canary 5 of 5, each upload with `overwrite: true`; `mutation` (30 s) merged the `mutation-*` artifacts into reports/mutation and passed with exactly the local numbers (money 97.00%, pricing 98.57%, ledger 98.13%, packets 95.87%). The workflow took 7 min 35 s. Read with the GitHub MCP tool's job logs (the proxy refuses the log host for gh).
- [running] On the same head at the time of writing: ci.yml's `check` (the old single job; ci-speed replaces it) and the capacity job; `licenses`, `images (web)`, `images (worker)` and `approval-of-record` succeeded.

### Hand-over: Gate 1 for Lane A's PR 7 (`docs/product/gates.md`)
To record in lanes/lane-b.md on the ops branch (not changed here) and give PR 7:

> Every money package's mutation score is above 85% with no unexplained survivor: the required mutation check
> (.github/workflows/mutation.yml, tools/stryker/gate.ts) green on the release commit, every survivor killed by a test
> or recorded as a reviewed equivalent (tools/stryker/equivalent/<package>.json). PRD 17 milestone 6; combined audit
> #54; the founder's ruling of 2026-10-25, relayed by the co-founder (F6); docs/adr/0066, Part 4.

### Rule-6 merge with ci-speed (when this branch merges claude/build-platform after #43)
Files both change: README.md, ADR 0064, ADR 0066, reconciliation-001, the test matrix, docs/runbooks/ci.md,
package.json, the synth plumbing (args.ts, common.ts, matrix.ts, registry.ts, expected/types.ts, fixtures.test.ts,
write.ts), tools/test/workflows.test.ts and vitest.config.ts; and the lockfile.
- ADR 0066: keep ci-speed's header and Parts 1 to 3; replace its "## Part 4 … Appended by that pull request."
  placeholder with this branch's Part 4 section; drop this branch's header.
- docs/runbooks/ci.md: the same title; append this branch's "## Mutation testing" section.
- Test matrix: move CI-15 to CI-17 into ci-speed's CI table after CI-10; drop this branch's heading and intro.
- Synth: the plumbing hunks are identical to ci-speed S1's; keep both sets of matrix and registry rows in ID order;
  then `pnpm synth --all` and a clean diff.
- workflows.test.ts: replace ci-speed's mutation block with this branch's, and set CI-10's timeout table line to
  `'mutation.yml': { changes: 5, stryker: 30, mutation: 10 }`. The mutation job uses `if: ${{ always() }}`, the form
  ci-speed's required-checks test accepts; its concurrency group starts `${{ github.workflow }}-`.
- vitest.config.ts: keep both hunks (this branch puts 'packages/money/src/**' first in BRANCH_GATED, with its comment).
- README, ADR 0064, reconciliation-001: different sections; keep both.
- Lockfile: never hand-merged; start from the build branch's and run `pnpm install --lockfile-only` (with ci-deps's
  pnpm if ci-deps merged first), then `pnpm install --frozen-lockfile`. This branch adds the
  tools/stryker/canary/lib importer ({}), tools' devDependency link to @tp/stryker-canary and Stryker 10.1.1.
- If ci-deps merges first: re-pin mutation.yml's `uses:` in ci-deps's form; its pin tests hold it.
- After the merge: the PR's own run measures every package again (the configs change); O7 rebalances
  stryker/shards.json from that run's times.

### Open items
- CI, still to read: ci.yml's `check` and the capacity job on 9099fac (running when this was written), `overwrite` on
  the first re-run, the docs-only time of a later pull request (about a minute), A1′ for the head, and the first push
  run after the merge. O7: rebalance stryker/shards.json from CI's times (this run's jobs took 4 to 7 minutes; the
  pricing-engine and packets-scan shards are the longest).
- The two adversarial reviews (payment-engine; CI tooling and security) and the fix round are next.
- Founder notes carried from the builders: verifier.test.ts pins that "a 3650-day window" fails (DAYS_AFTER does not
  accept the hyphen; M4a); three frozen-engine behaviours pinned by M2's tests (a malformed year basis prices as
  CURRENT, an unknown terms rounding rule stops at 'rounding' with ENGINE_ERROR unexpected, an inherited 'null'
  place-of-service key gives no setting). Lane A's PR 6c: if it makes a malformed year basis ENGINE_ERROR, those two
  tests change with it; it also plans its killing tests under this gate.
- Follow-ups outside this pull request's rules: a packets source change could remove 37 of the 99 packets records
  by reading scan.ts's required groups branch-free (M4a); `runEngineOnGolden` in tools/golden-worksheet/engine.ts has
  no caller after the golden restructure, and could go in a later pull request.
- Residual risk recorded in the records' reasons: readable.ts:81's three and mismatches.ts:196 rest on Unicode 17.0's
  data; a Node upgrade with new Unicode data should have them checked again (the scripts above). Stryker copies
  ignored directories such as coverage/ into its sandbox, so a concurrent local coverage run can break a shard (seen
  once here); CI's shard jobs have none.
- PG16 on 5432 is still down (M3's note); PG18 on 5433 is up.
