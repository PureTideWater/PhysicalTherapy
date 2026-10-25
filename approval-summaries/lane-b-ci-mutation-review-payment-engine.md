# Adversarial review, payment-engine lens: draft PR #44 (co-001/ci-mutation)

- Head reviewed: 9099fac075f9072b9a30aaa0e050fe032f8a8a7d, against claude/build-platform 49514e8.
- Reviewer: payment-engine reviewer (Lane B, ci-mutation), read-only. I made no commit, no push and no GitHub comment.
- Clone: a fresh `git clone` of PureTideWater/PhysicalTherapy at the head, `pnpm install --frozen-lockfile --prefer-offline`. It was removed at the end.
- Checklist: .claude/agents/payment-engine-reviewer.md, plus the seven points in the brief.
- Evidence scripts, outside the repository: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/rpe-tools/`
  - `flipped.mjs`: before and after reports, compared mutant by mutant.
  - `apply-run.mjs` and `apply-suite.mjs`: apply a mutant by hand and run the named test, or the named files.
  - `fuzz/scan-chars.mjs`: a character-level differential fuzz.
  - `cents-diff/diff.ts`: formatUnroundedUsd at the base and at the head, compared.
  - `zz-review-nan.test.ts`: the probe that breaks two pricing equivalents.

## Verdict

**One blocking finding.** Two of pricing's recorded equivalents are not equivalent. Both are at engine.ts:401, and an input of the declared types tells each mutant from the original on V8 today. Everything else I checked holds:
- Every one of the 51 sampled kills is real.
- cents.ts:85 is behaviour-neutral.
- The freeze holds.
- The ledger changed by additions only, with LED-01 to LED-11 and the oracle passing.
- The golden restructure prices every claim exactly once.
- No new test puts a float on an amount.

There are also two should-fix findings and five nits about tests that assert implementation, and about the equivalence standard being applied unevenly.

## Findings

### B1 (blocking): pricing.json's two engine.ts:401 records are not equivalent

**Where.** tools/stryker/equivalent/pricing.json:93 and :126. The two records:
- ArrowFunction `(a, b) => a - b` -> `() => undefined`;
- MethodExpression `visit.map(...).sort((a, b) => a - b)` -> `visit.map(...)`.

**The records' claim.** `visit` is already ascending because `price` sorts the lines at :159, and a repeated number stops its lines.

**Why the claim fails.** It misses a line number that is a `number` but not an integer:
- `LineFacts.lineNo` is declared `number` (packages/pricing/src/types.ts:40).
- `price` sorts with `(a, b) => a.lineNo - b.lineNo` (engine.ts:159) *before* `validateFacts` refuses the bad line.
- With a NaN line number that comparator is inconsistent, and V8 leaves the array as it is: `node -e "[3,NaN,1].sort((x,y)=>x-y)"` gives `[3, NaN, 1]`.
- The NaN line stops with ENGINE_ERROR invalid_line_facts. The visit then holds lines 3 and 1 in that order.
- The original sorts them again at :401. Both mutants keep `[3, 1]`.

**Evidence.** I ran the probe `rpe-tools/zz-review-nan.test.ts`, placed temporarily at packages/pricing/src/ and then removed. It prices a per-visit claim of lines 3, NaN and 1 and expects `visit_line_nos` to be `[1, 3]`.
- Original: 1 passed.
- Each mutant, applied by hand at engine.ts:401: it fails, stdout `[["priced","",3,[3,1]],["unpriced","ENGINE_ERROR",null,null],["priced","",1,[3,1]]]` and `AssertionError: expected [ [ 3, 1 ], [ 3, 1 ] ] to deeply equal [ [ 1, 3 ], [ 1, 3 ] ]`.

**Impact.** The two traces differ in `steps.per_visit.visit_line_nos`. The trace is stored with the immutable priced_line, so this is output of `price`. NaN is a value of the declared type, and the order difference shows on V8 itself, not only under another conforming sort. So the records fail the PR's own standard (ADR 0066 Part 4; docs/runbooks/ci.md:80).

**Fix.**
1. Add the probe's case as a test in packages/pricing/src/sorts.test.ts or engine.test.ts. It is test-only, so the freeze allows it.
2. Delete the two records. Pricing goes from 28 recorded equivalents to 26, and from 1,932 to 1,934 detected.
3. Rerun the pricing-engine shard and the gate.
4. Correct ADR 0066 Part 4's and the runbook's counts (165 to 163).

### S1 (should fix): rounding.ts:26 is killed with a cast past the type, which the PR's own standard calls an equivalent, and through an incidental TypeError

**Where.** packages/money/src/rounding.test.ts:138-143. The mutant is rounding.ts:26 ConditionalExpression `typeof amount === 'bigint'` -> `true`.

**Equivalent within the declared types.** `multiplyCents` takes `Cents | UnroundedCents`. The mutant always calls `centsToDecimal(amount)`, and that is `decimal(amount)`. `decimal(x)` returns `x` itself for a Decimal (decimal.ts:187-189) and `new Exact(String(x))` for a bigint. So for every declared input the branch decides nothing.

**How the test kills it.** It passes `'12' as unknown as Cents` and `12 as unknown as Cents` with a bare `toThrow()`. The original "refuses" only by accident:
```
"12" TypeError base.times is not a function
12 TypeError base.times is not a function
```
(that is what multiplyCents throws for both inputs)

**Why that matters.**
- The kill rests on an input the PR's own standard excludes: "no value of the function's declared parameter types, as plain data" (ADR 0066 Part 4:132-133).
- The test would fail on a type-correct simplification, `return unroundedCents(decimal(amount).times(factor))`, which accepts `'12'` and gives 24.
- The build summary notes this as a difference, but the standard that cc0260c wrote down does not allow it.

**Fix.** Record the mutant in tools/stryker/equivalent/money.json with that reason, and delete the cast test. If a refusal of non-bigint text is wanted, it needs an explicit guard with a MoneyError in a later money change, and a test that asserts that class and message.

### S2 (should fix): engine.test.ts:1044 states, as the engine's rule, that a malformed year basis prices at the records in force on the service date

**Where.** packages/pricing/src/engine.test.ts:1044-1054.

**What it asserts.** `'LOCKED:2025X'`, `'XLOCKED:2025'`, `'LOCKED:202'`, `'LOCKED:20250'` and `'locked:2025'` each price exactly as `'CURRENT'` does.

**Why that is a problem.**
- `'LOCKED:202'` and `'LOCKED:20250'` are values of the declared type: `YearBasis = 'CURRENT' | `LOCKED:${number}`` (packages/contracts/src/terms.ts:124).
- The test's title presents the fallback as the specification: "any other text reads the records in force on the service date".
- The frozen engine prices a term it cannot read instead of stopping, which is a guessed price against CLAUDE.md ("Never a guessed price"; unpriced reasons are a closed list).
- A correct engine fix (ENGINE_ERROR) would break this test. M2 raised the point as open, and the build summary carries it to the founder and Lane A's PR 6c, but the test text reads as intended behaviour.

**Fix.**
- Keep the pin, since it is what kills engine.ts:99's anchor mutants.
- Retitle it and comment it as a pin of today's frozen behaviour, a known defect: a malformed year basis should stop the line. Name the open item (Lane A PR 6c, founder question) so the next engine change flips it knowingly.
- List it in the PR description's founder notes as a money-path defect, not only as a pinned behaviour.

### N1 (nit): engine.test.ts:273 kills engine.ts:599 only with an object whose prototype carries a "null" key, which is not plain data

**Where.** packages/pricing/src/engine.test.ts:273-279. The mutant is engine.ts:599 `place === null` -> `false`.

**Why it is an equivalent under the PR's own standard.** With plain data the mutant cannot be told apart. `validSettings` refuses any own key that is not two digits (engine.ts:265), so `settings.placeOfServiceSettings['null']` is always undefined. The kill needs `Object.create({ null: 'non_facility' })`.

**The case for keeping it.** It is defensible as prototype-pollution hardening.

**Fix.** Either say so in ADR 0066 Part 4 and the runbook ("a test may hold the code to inputs beyond the standard, as hardening; such a kill does not make the mutant non-equivalent"), or record the mutant. Then S1 and N1 get one consistent rule.

### N2 (nit): the insertion-sort harnesses couple tests to how the code sorts

**Where.**
- packages/ledger/src/allocation.test.ts:142 and :145 assert `sorts: 1`.
- allocation.test.ts:115 and packages/pricing/src/sorts.test.ts:37 throw on a sort called without a comparator.

**Why it matters.** Each of these correct changes would fail them:
- a refactor to `toSorted()`, which the `Array.prototype.sort` spy never sees: 0 sorts;
- a second sort;
- a dependency that calls `.sort()` with no comparator while `price` runs (zod, decimal.js) under the spy.

**Fix.** Assert `sorts >= 1`, which is the premise that the harness was reached. Fall back to the default (string) comparison instead of throwing, or spy on `toSorted` too.

### N3 (nit): pricing.json reasons cite source line numbers

**Where.** tools/stryker/equivalent/pricing.json:8, :19 and :30, among others. They cite "priced() at line 925 or unpriced() at line 952", "price, lines 179 and 180", "line 292", "line 296" and "line 159".

**Why it matters.** The design keys records by original text and occurrence, precisely because line numbers move on unrelated edits. The gate would keep matching a record whose reason then names the wrong lines.

**Fix.** Cite the functions and expressions instead, for example "price's final map", `priced()` and `unpriced()`.

### N4 (nit, for Lane A, outside this PR's rules): the engine sorts line numbers before validating them

**Where.** engine.ts:159.

**What happens.** A NaN line number leaves the claim's other lines out of line order: `[3, NaN, 1]` stays as it is. That changes the order of `price`'s results and of anything ranked in claim order.

**Fix.** This needs an engine change, so it is outside this PR. Hand it to the next engine-change PR (Lane A 6c): validate line numbers, or sort with a comparator that is total over every number, before ranking. B1's new test pins only the per-visit half.

### N5 (nit): `claimRelease` is duplicated and `runEngineOnGolden` is dead code

**Where.** The same `claimRelease` helper is in tools/golden-worksheet/engine.test.ts:22-25 and in engine.golden.test.ts:110-113. `runEngineOnGolden` (tools/golden-worksheet/engine.ts:434) now has no caller.

**Fix.** tools/ is outside the freeze. Move `claimRelease` into tools/golden-worksheet/engine.ts, then delete `runEngineOnGolden` or make it the per-claim builder.

## What I verified and how

### (1) The new tests really kill what they claim: 51 mutants by hand

**Method.**
- `rpe-tools/flipped.mjs` lists every mutant that was Survived or NoCoverage in the scout's Stryker 10.1.1 reports (`ci-design/mutation-reports/10.1.1/*-full.json`) and is Killed in the integrator's final reports (`ci-mutation/int/run-final{,2}/reports`). The counts:

  | Package | Killed now | Plus recorded equivalents | Scout's undetected (16 + 162 + 130 + 345) |
  |---|---|---|---|
  | money | 8 | 7 | 16, the 16th is cents.ts:85's, now branch-free |
  | ledger | 99 | 31 | 130 |
  | pricing | 134 | 28 | 162 |
  | packets | 246 | 99 | 345 |

- `rpe-tools/apply-run.mjs` applies each sampled mutant's replacement to the clone's source at its report location, then runs the killing test's file under `vitest --project unit` (fast-check unseeded). It reads the named test's status from the json reporter, then restores the file.
- Each batch ran under `flock /tmp/laneb-heavy.lock`.
- `git status` was clean after every batch.

**Baseline.** On the unmutated clone, `vitest run --project unit packages/money packages/ledger packages/pricing packages/packets tools/golden-worksheet` gave 48 files, 773 passed.

**Results by package.**

money (4), each named test FAILED:
- cents.ts:86 Regex `/0+$/` -> `/0+/` ("expected '$100.005' to be '$100.0005'");
- rounding.ts:26 `true` (see S1);
- cents.ts:12 `'MoneyError'` -> `""`;
- decimal.ts:184's message.

ledger (12), each named test FAILED:
- allocation.ts:50 `false` and `a.index + b.index`, under the insertion sort;
- allocation.ts:23 `<`;
- csv.ts:50 `index - 1`;
- matching.ts:87 `true`;
- pairing.ts:63 `&&`;
- reconciliation.ts:145 `proved - recouped`. The report credits the property, and the fixed example "refuses a line whose recoupments exceed its posting…" also fails, by `apply-suite.mjs`;
- roi.ts:96 `<`;
- templates.ts:159 `>= 100`;
- totals.ts:156 `>`;
- totals.ts:192 `>=`;
- totals.ts:196 `>=`.

pricing (17), the named test FAILED for 15:
- engine.ts:274 `< 4`;
- engine.ts:371 `true`, and the MethodExpression;
- engine.ts:401 `a + b`, in sorts.test.ts;
- engine.ts:725 `lineNo +` and `unit +`;
- engine.ts:599 `false`;
- recompute.ts:281 `===`;
- recompute.ts:434 `<`;
- recompute.ts:501 `line_no +`;
- dates.ts:61's arithmetic;
- release.ts:55 `+1`, and the MethodExpression;
- release.ts:72 `true`;
- trace.ts:24's anchor.

For engine.ts:371 ArrowFunction `() => undefined` and ArithmeticOperator `a.lineNo + b.lineNo`, the report names only the seeded property in properties.test.ts, and that property **passed** unseeded. A run of every pricing test file except properties, performance and purity, with tools/golden-worksheet/engine.test.ts (193 tests), fails exactly one fixed example under each: "step 3, the NCCI edits > lists a line's edits … in line order whatever order the lines arrive in" ("expected [ 3, 2 ] to deeply equal [ 2, 3 ]"). So M2's fixed examples do kill all three engine.ts:371 mutants. The report's attribution is the bail order, not a defect.

packets (18), each named test FAILED:
- interest.ts:82 `<`;
- interest.ts:120 `true`;
- interest.ts:136 sort dropped;
- assemble.ts:144 `a + b`;
- assemble.ts:164 sort dropped, the integrator's non-date kill;
- assemble.ts:219 `true`, the integrator's kill;
- assemble.ts:233 `false`;
- calculation.ts:30 `false`;
- calculation.ts:41 `true`;
- facts.ts:71's anchor;
- facts.ts:232 `===`;
- verifier/mismatches.ts:94's case;
- verifier/mismatches.ts:77's anchor;
- scan.ts:285 `&&`;
- scan.ts:287 `<= 100`;
- scan.ts:572's anchor;
- scan.ts:470 `\.\D`;
- placeholders.ts:77 `&&`.

**Result: 51 of 51 killed by a test that fails under the mutant.** No sampled kill rests on the seed alone.

### (2) Every equivalent record: I tried to build a distinguishing input

**Coverage.** I read all 165 records against their source:
- money's 7, the ledger's 31 and pricing's 28, one by one;
- packets' 26 outside scan.ts, and its 73 scan.ts records by reason, then by a fuzz (below).

I mapped each record's (original, occurrence) to its source line (`node` over each file). Every one lands on the line its reason describes.

**Broken: pricing's two engine.ts:401 records (B1).**

**Held, with the check behind each.**

money:
- cents.ts:32's `''` fallback after a required `(\d*)`.
- cents.ts:37 `''`/`'0'`/`whole === ''`: `BigInt('')` is `0n`.
- min/max at the boundary: bigints are values.
- rounding.ts:52 `'halfUp'` -> `""`: `toDecimalPlaces(0, undefined)` uses the engine's rounding. Every EngineDecimal is an `Exact` (add, sub, mul and `new Exact(Quotient.div)`; `negated` and `abs` keep the constructor), and Exact's rounding is ROUND_HALF_UP.

ledger:
- csv.ts's CRLF records: `endRow` drops a row of one empty field, the original included, whatever skips. The closing-quote error's index is the source position either way.
- `null <= 0n` is `true` (matching.ts:134, reconciliation.ts:131).
- reconciliation.ts:145: `inTotal` excludes a zero sum.
- settings.ts:42: a one-key object whose template is not a string finds no built-in template and throws the same LedgerSettingsError.
- stages.ts: `includes` over strings.
- templates.ts:191: the anchors are redundant behind the `toISOString().slice(0, 10) === iso` check. I tried `'+02026-01-01'`, `'2026-01-01x'`, `'x2026-01-01'` and year 10000; all null either way.
- templates.ts:342 and :347: `'Stryker was here!'` is neither a date nor a code.
- templates.ts:257: `cells[undefined]` on a parseCsv row.
- totals.ts:186: `latest.interest` is never read.
- The rest are boundary-equal.

pricing:
- The placeholder outcome: every path ends in `priced()` or `unpriced()`, and `attempt` catches into `stop`, never returning the placeholder.
- Kind literals: only `'stopped'` is compared (engine.ts:179, :180, :292, :296).
- engine.ts:314: PER_VISIT and LESSER_OF are exclusive.
- engine.ts:717: `stopped` is keyed by Working lines.
- recompute's null checks: `derivedStop` returns NO_PFS_VALUE for a recorded null rvu, `perUnit` throws first, and `checkFeeSchedule` is called only from `perUnit` (recompute.ts:320).
- release.ts:63 and :72: `undefined <= date` is false.

packets:
- The RegulationCitation literal method, and the absent `parameters`.
- `Hash.update(text, '')` against `'utf8'`: equal for é, an astral character, a lone surrogate and NUL.
- `new Intl.Segmenter(undefined, {})` resolves to granularity 'grapheme'.
- `Intl.Segmenter` segments `null` as `n|u|l|l`.
- interest.ts:120 at `0n`: the unpaid part only enters `addUnrounded` and then `roundOnce`, so even a −0 from a negative rate gives `0n`. Reasoned from the code, not run.
- interest.ts:117: the required rate. Type-bound; I accept it.
- payer.ts's greedy group.
- readable.ts's `original()` for `start >= length`, negative, fractional and NaN starts.

**scan.ts.** I wrote a character-level differential fuzz of my own, `rpe-tools/fuzz/scan-chars.mjs`, independent of the integrator's token-level one.
- It covers 12 mutants: `/\D/`, `true`, `end > start` (×2), `index <= match.index`, `index > start` (×2), the percent slices (×2), and the markers' and placeholders' unsorted lists. `int(part)` is in the list too, though the fuzz did not exercise it (see below).
- Inputs: 60,000 random strings over digits, `_`, `x`, `×`, the TRIM characters, `.`, `,`, `-`, `$`, `%`, `/`, `⁄`, brackets, quotes, markers, placeholders and abbreviations.
- Result: **0 differences** for every recorded mutant.
- The harness's control mutant (other-numbers' lookbehind without `.`) differed on 740 of 20,000 inputs, so the harness does detect differences.
- The number-word grammar and marker-list records (m70-m84, `int(part)`) are not exercised by a character alphabet. For those I rely on the integrator's token fuzz, which I read.

**Not re-proved.** readable.ts:81's three records and mismatches.ts:196 rest on Node 24's Unicode 17.0. I accept the integrator's exhaustive code-point scripts; the residual risk on a Node upgrade is already recorded.

### (3) cents.ts:85 is behaviour-neutral

- **The change.** `git diff 49514e8 -- packages/money/src` shows that :85 is the only non-test line: `BigInt(match[2] ?? '0')` -> `BigInt(match[2] as string)`, with a comment.
- **Why it is neutral.** `UNROUNDED_CENTS_TEXT = /^(-?)(\d+)(?:\.(\d+))?$/` (:73) has group 2 `(\d+)`, so every match has a non-empty string of ASCII digits there. No `u` flag is needed: `\d` is ASCII-only.
- **Differential test.** `rpe-tools/cents-diff/diff.ts` runs formatUnroundedUsd from `git show 49514e8:packages/money/src/cents.ts` and from the head's cents.ts on 209,618 inputs:
  - every admitted text with a sign, 1-4 whole digits and 0-3 fraction digits over {0, 1, 9};
  - edge cases;
  - 200,000 random strings that include `+`, `e`, whitespace and an Arabic-Indic digit.

  Of those, 35,565 are admitted by :73. Differences: **0**. A refused text throws the same MoneyError and message at the base and at the head.
- **Engine differential.** `ENGINE_FREEZE_BASE=49514e8 vitest run tools/engine-freeze/differential.test.ts`: 1 file, 4 passed.
- **The worker's export.** formatUnroundedUsd's only non-test caller is apps/worker/src/packets/html.ts. `vitest run --project unit apps/worker/src/packets/export.test.ts`: 19 passed.
- **Coverage.** `vitest run --project unit packages/money --coverage`: branches 100% (56/56), statements, functions and lines 100%.

### (4) The freeze and the golden restructure

- **Freeze, by diff.**
  - `git diff --stat 49514e8 -- packages/pricing/src ':!**/*.test.ts'`: empty.
  - `-- packages/pricing ':!packages/pricing/src/**'`: empty.
  - `--numstat -- packages/pricing`: seven `*.test.ts` files. The one deletion is trace.test.ts's widened import line.
  - No helper file was added. sorts.test.ts holds its helpers in itself.
- **Freeze, by tool.** `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8`: "Problems: None", exit 0.
- **No other non-test change.** No non-test change under packages/packets.
- **Fixtures.** `fixtures/golden` and `content` are unchanged. Under fixtures/ only `fixtures/synthetic/CI-1{5,6,7}/expected.json` are added.
- **Moved lines.** `git diff --color-moved=plain 49514e8 -- tools/golden-worksheet/engine.golden.test.ts`, parsed for moved and unmoved lines: 29 removed lines are not moved:
  - the imports;
  - the describe-level `runEngineOnGolden()`;
  - the five `it` headers;
  - the report call;
  - the aggregate assertions.

  This is the count the PR body states (pr-body.md:45). The design asked that only the wrapper be unmoved, but the deviation is declared, and each restated aggregate holds:
  - The claim-set test asserts methods, review flags, `contract_adjustment` and reasons over the fixture lines.
  - Each claim's test now also asserts `results.length === expected.lines.length` and `engineDifferences(runs) === []` field by field.
  - So the old engine-side aggregates are implied.
  - The PRC-21 `read` assertion is filtered per claim, and the four-claim ZIP+4 set is asserted in the claim-set test.
- **Each claim priced in exactly one test.** The claim-set test compares the test names' ids with the 154 ids read from `fixtures/golden/claims/*.json` (`ls … | grep -c json`: 154). It checks the counts and the absence of duplicates. Each `it.each` test indexes its own release (`claimRelease`), so nothing is memoized across tests.
- **Golden run.** `flock … pnpm test:golden`: 4 files, 188 passed. The arithmetic is 38 − 5 + 154 + 1, where the base had 5 `it` blocks in the file (`git show 49514e8:… | grep -c "^  it("`).

### (5) The ledger

- **Additions only.** `git diff --numstat 49514e8 -- packages/ledger`: 12 files, all `*.test.ts`, 0 deletions each. One file is new (rules.test.ts).
- **No new test leaks state.** The `vi.spyOn(Array.prototype, 'sort')` in allocation.test.ts is restored in `finally`.
- **The LED tests are unchanged.** The LED rows' assertedBy lists in packages/synth/src/cases/registry.ts are unchanged; the diff adds only the CI-15 to CI-17 rows and the module slice. `git diff --stat 49514e8 -- apps` is empty, so the LED database tests and LED-01's e2e spec are unchanged.
- **Database run.** With `DATABASE_URL=postgres://postgres:test@localhost:5433/postgres` and the lock, `vitest run --project db` over five files gave 5 files, 99 passed. The five files:
  - apps/worker/src/reconcile/ledger.db.test.ts;
  - ledger-oracle.db.test.ts;
  - chain.db.test.ts;
  - apps/worker/src/packets/packets.db.test.ts;
  - apps/web/src/lib/routes/reconciliation-routes.db.test.ts.
- **Unit run.** The ledger's unit tests are in the 773 that passed.

### (6) Tests that assert implementation

S1, S2, N1 and N2 above. Elsewhere:
- The refusal tables assert class, name and message, as the design asks.
- recompute.test.ts's hand-built traces (`as unknown as PricingTrace`) exercise `recompute(value: unknown)`, whose input is JSON, so they are in-type.
- assemble.test.ts:254's `{ amount_cents: 5000 }` is a negative case: a number is not cents text, and the result is null.

### (7) Integer cents in the new tests

- **Method.** I grepped every added line under `packages/*/src/**/*.test.ts` and `tools/golden-worksheet/*.test.ts` for `parseFloat`, `Number(`, `toFixed`, `Math.round`, `Math.floor`, `Math.ceil`, decimal literals and numeric `_cents`/`Cents` values.
- **Result.** Every amount is a bigint (`3000n`, `cents(…n)`) or cents as text. The decimal figures in interest.test.ts are comments that show the unrounded arithmetic; the assertions compare cents text or bigints.
- **The floats that remain** are inputs that the money package must refuse:
  - `decimal((1 / 2) as unknown as string)`;
  - `cents(12 as unknown as bigint)`;
  - `decimal('1').times(2 as unknown as Decimal)`.

  Each is asserted as an explicit MoneyError with its own message.
- formatUnroundedUsd's table includes `'900719925474099399.25'`, beyond 2^53.

### Other checks

- **Model identifiers.** `git diff 49514e8 | grep '^+' | grep -iE 'opus|sonnet|haiku|claude-[0-9a-z]'`: none. The commit messages hold only the attribution lines.

## CI read

Check runs on 9099fac (`gh api repos/PureTideWater/PhysicalTherapy/commits/9099fac…/check-runs`):

| Job | Id | Result |
|---|---|---|
| `stryker (money-ledger)` | 121176043997 | success |
| `stryker (packets-scan)` | 121176043946 | success |
| `stryker (packets-rest)` | 121176043968 | success |
| `stryker (pricing-engine)` | 121176043978 | success |
| `stryker (pricing-recompute)` | 121176044052 | success |
| `stryker (pricing-rest)` | 121176044019 | success |
| `mutation` | 121177563096 | success |
| capacity, licenses, images, approval-of-record, screening-capacity gate | | success |
| ci.yml's `check` | 121175950469 | still in progress when I read it |

The `mutation` job log, read through the GitHub MCP tool's job logs, ends "mutation gate: passed" after listing the recorded equivalents with their covering tests. That pass includes B1's two records, which the gate accepts only because they are recorded.
