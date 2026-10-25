# Fixer FA: the payment-engine review's findings on draft PR #44 (co-001/ci-mutation)

- Branch `co-001/ci-mutation-fa`, worktree `/home/user/ci-mutation-fa`, cut at 9099fac. Five commits, not pushed:
  - `b059686` B1, and N2's pricing half;
  - `f55e589` S1;
  - `925ac9e` S2 and N1, plus the unknown-rounding-detail note;
  - `2996dbf` N3;
  - `5f9f2ed` N5.
- Head: 5f9f2edef7a933e18e78ee15bddb3da7a5891cea.
- Findings are named `<reviewer>/<id>`. All eight payment-engine findings are mine. Each was checked by a probe of my own
  before I changed anything. Probe output: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fa/probe-out.txt`.
- Hard rules, all held:
  - nothing non-test under packages/pricing;
  - nothing under packages/ledger at all (`git diff --numstat 9099fac -- packages/ledger/src` is empty);
  - packages/money changed only in rounding.test.ts;
  - fixtures/golden, migrations and content are unchanged;
  - no model identifier outside the attribution lines.
- One file outside my listed set: `tools/golden-worksheet/engine.ts` (N5, see below). FB's branch does not touch it.

## Dispositions

### payment-engine/B1 (blocking): fixed, b059686

**Verified.**
- `node -e "[3,NaN,1].sort((x,y)=>x-y)"` gives `[3, NaN, 1]`.
- The probe priced a per-visit claim of lines 3, NaN and 1 and got:
  ```
  [["priced","",3,[1,3],1,"0"],["unpriced","ENGINE_ERROR invalid_line_facts",null,null,null,null],["priced","",1,[1,3],1,"8800"]]
  ```
  On the original, `visit_line_nos` is `[1, 3]` and line 1 carries the visit.
- I applied each mutant by hand at engine.ts:401: the sort dropped, and the comparator `() => undefined`. Both keep the
  visit at `[3, 1]`.

**Fix.**
- packages/pricing/src/sorts.test.ts gains `lists a visit's lines in line-number order when another line of the claim
  has NaN for its number`. It runs under all three sortings (native, earlier first, later first), so it adds 3 tests.
  - The NaN line stops at `ENGINE_ERROR invalid_line_facts`.
  - Lines 1 and 3 (found by line number, not by position) both have `visit_line_nos` `[1, 3]`, and carrier/base
    `[1,'8800']` and `[1,'0']`.
- Under each hand-applied mutant, all three runs fail. On the frozen engine, all three pass.
- The case does not assert the order of `price`'s results for such a claim. That order follows the inconsistent sort, so
  it is the frozen engine's current behaviour, not its rule. The comment says so and names Lane A's PR 6c (see N4).
- The two records are deleted from tools/stryker/equivalent/pricing.json: 28 records to 26.
- Narrow Stryker run (engine.ts lines 99, 159, 401, 566-567 and 598-600): 23 of 23 mutants killed. Both :401 mutants
  are killed by the new case (sort: native).

### payment-engine/S1 (should fix): fixed as a true equivalent, f55e589

**Decision: a true equivalent.** It is decided by the declared types.
- `multiplyCents(amount: Cents | UnroundedCents, factor)`.
- A `Cents` is a `bigint`, and both branches send it to `centsToDecimal`.
- An `UnroundedCents` is a `Decimal`. Its brand key `DECIMAL` is a `declare const` unique symbol that the package does
  not export, so no code outside @tp/money can write one without a cast. A grep finds the only `as Decimal` casts in
  decimal.ts's `wrap` and rounding.ts's `unroundedCents`.
- So every in-type value is an `ExactDecimal`, and `centsToDecimal(amount)` is `decimal(amount)`, which returns a
  decimal itself (`if (isDecimal(value)) return value`). `base` is `amount` either way.
- I also checked two copies of the module loaded at once. Both forms throw a MoneyError there. It is also not a value of
  the declared type, since a unique symbol type is nominal per declaration.

**Why not a real refusal.**
- The probe gives `'12'` -> `TypeError base.times is not a function`, and `12` -> the same TypeError.
- That is an incidental V8 TypeError, not a refusal the code makes. Asserting its class and message would pin V8's
  wording.
- The mutant actually refuses `12` better: `decimal(12)` throws the MoneyError "never a number".
- The test passed only a value cast past `Cents`, with a bare `toThrow()`. A type-correct simplification
  (`decimal(amount).times(factor)`) would fail it.

**Fix.**
- The `it` "reads only a bigint as cents: text or a number cast past the type is refused" is dropped. The brief
  authorizes dropping this kill. The unused `type Cents` import goes with it.
- tools/stryker/equivalent/money.json records rounding.ts:26 ConditionalExpression `typeof amount === 'bigint'` ->
  `true`, with that reason. money goes from 7 to 8 records.
  - `proposedBy`: "payment-engine reviewer (Lane B, ci-mutation)", who proposed the record in S1.
  - `reviewedBy`: "fixer FA (Lane B, ci-mutation)", 2026-10-25.
  - The two differ, so FB's new self-review refusal holds.
- Narrow run on rounding.ts: 21 of 23 killed. The 2 that survive are this record and `'halfUp'`.
- Open: if a refusal of text cast past the type is wanted, it is a later money change. It would be an explicit
  MoneyError guard in multiplyCents, with a test asserting class and message. That is outside this PR's
  one-money-change rule.

### payment-engine/S2 (should fix): fixed, 925ac9e

**Verified.**
- `YearBasis = 'CURRENT' | `LOCKED:${number}`` (packages/contracts/src/terms.ts). So 'LOCKED:202' and 'LOCKED:20250' are
  in-type.
- `LOCKED_YEAR = /^LOCKED:(\d{4})$/`. Anything else takes `yearOf(date)`, the records in force.

**Fix.**
- The single test is split, with every assertion kept, into a new top-level describe, "a year basis, read as whole
  text":
  - the rule: `locks the basis year for LOCKED and four digits: LOCKED:2025 reads the latest records in force during
    2025`;
  - the pin: `frozen engine, current behaviour, a known defect (Lane A PR 6c): a year basis it cannot read as LOCKED
    and four digits, the whole text, prices at the records in force on the service date, as CURRENT does`.
- The pin's comment says:
  - a term the engine cannot read should stop the line ("never a guessed price");
  - it is open for the founder and Lane A's PR 6c, and that change flips the test knowingly;
  - two of its values are in the engine's declared type;
  - @tp/contracts' schema admits only CURRENT and LOCKED:19xx/20xx, so no record read through it reaches the fallback
    today.
- engine.ts:99's anchor mutants and :566-567 are still killed (narrow run).
- For the PR's founder notes, as a money-path defect: the frozen engine prices a year basis it cannot read at the
  records in force instead of stopping the line. This is in for_lane_a.

### payment-engine/N1 (nit): fixed by one rule for S1 and N1; the kill stands as hardening, 925ac9e

**Verified.**
- With plain data, `validSettings` refuses an own key that is not two digits, so `settings['null']` is always
  undefined. The mutant is equivalent under the plain-data standard.
- New finding from my probe: the frozen engine does read an inherited setting for a real place of service.
  `Object.create({'11':'facility'})` prices line 11 as facility, because `validSettings` checks only own keys
  (`Object.entries`) and the lookup reads through the prototype. So the test's old title, "whatever the settings object
  inherits", claimed more than the engine does.

**Choice.**
- Recording the mutant would need the kill dropped: the gate fails a record matched to a killed mutant. That deletes a
  test, which the brief does not authorize here.
- The consistent rule I applied (S1 and N1):
  - A test may hold the code to an input beyond its declared types, as hardening, when it asserts the code's own outcome
    for that input: its own check's class and message, or its reason. Such a kill stands, and the mutant is not
    recorded.
  - A kill that rests only on an incidental failure is not hardening. An example is a TypeError from a method the value
    lacks, asserted by a bare `toThrow`. Then the mutant is recorded and the test dropped.
  - N1's test asserts the engine's explicit `place === null ? undefined` branch and its reason
    `ENGINE_ERROR place_of_service_unmapped`, so the kill stands. S1's rests on an incidental TypeError, so it is
    recorded.

**Fix.**
- The test is retitled `reads no setting for a line with no place of service, even from a settings object that inherits
  a key named "null"`.
- Its comment:
  - calls it hardening beyond the declared input;
  - says that is all it holds;
  - says that for a two-digit place of service the frozen engine does read an inherited key, recorded for Lane A's
    PR 6c (read own keys only).
- The rule's sentence belongs in ADR 0066 Part 4 and docs/runbooks/ci.md. Those are not my files; the text is under
  "For the Suite".

### payment-engine/N2 (nit): the pricing half fixed (b059686); the ledger half left as a ready patch

**Pricing half (sorts.test.ts).** The harness:
- also replaces `Array.prototype.toSorted`;
- passes a sort called without a comparator to the native sort, captured before the spy. The default order is
  ECMAScript's consistent SortCompare, so every conforming sort gives that result. This replaces the throw;
- requires at least one sort or toSorted call under either insertion sort, checked after both spies are restored.
  Before, nothing checked that the case reached a sort at all.

A probe (scratch copy, removed) shows:
- the premise fails a case that makes no sort;
- `toSorted` runs under the harness;
- `[10, 9, 1, undefined, 2].toSorted()` and `[10, 9, 1, 2].sort()` give the native order.

**Ledger half (allocation.test.ts:115, :142, :145).** Not changed.
- It needs edits to lines this PR added. The brief's check is 0 deletions in `git diff --numstat 9099fac --
  packages/ledger/src`, and "NEW it blocks or NEW test files only".
- Against 49514e8, reconciliation-001's base, the same edit is still additions only.
- The patch is ready and validated: applied temporarily, allocation.test.ts 13 of 13 passed and `tsc -p
  packages/ledger` was clean; then reverted, and the numstat is empty.
  - The patch: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fa/n2-ledger-allocation.patch`.
  - It makes the same harness changes, and asserts `result` and `sorts > 0` apart instead of `{ result, sorts: 1 }`.
- Open item for the Suite and the co-founder: whether the 9099fac-based additions-only rule covers lines this PR itself
  added.

### payment-engine/N3 (nit): fixed, 2996dbf

Every record's reason now cites code instead of a line number, in all four files, not only pricing.json:
- pricing: 9 reasons. The placeholder outcome cites "price's final map gives each line to priced() or unpriced(), and
  each sets context.trace.outcome". The kind literals cite the `item.kind === 'stopped'` and `agreement.kind` / `unit.kind`
  comparisons in `price` and `stepsOneToThree`.
- ledger: "the filter at :127" becomes "inTotal keeps only the groups whose proved + recouped !== 0n".
- packets: 4 reasons. `records.ts:80` becomes "MA_NONCONTRACTED_CITATION, in apps/worker/src/packets/records.ts", and
  `schema.ts:298` becomes "state_prompt_pay's interest: annual_rate_percent is percent.nullable() in a strict object".
- money: `decimal.mjs:1969` becomes "decimal.mjs's toDecimalPlaces: if (rm === void 0) rm = Ctor.rounding".
- A grep for `file:NN`, `line NN` and `at :NN` over tools/stryker/equivalent/*.json now finds nothing.

### payment-engine/N5 (nit): fixed, 5f9f2ed

- `claimRelease(claim, files)` and `claimReleaseFiles(claims, root)` now live in tools/golden-worksheet/engine.ts. Both
  golden test files use them, in place of their two copies.
- `claimRelease` names the claim when its release was not read, instead of the old `as ReleaseContents` cast.
- `runEngineOnGolden` is deleted. Grep finds no caller anywhere in the repository (code, docs, scripts). Its `price`
  import goes with it, and the file's header no longer says it "runs the engine".
- This is the one file outside my listed set. The brief's N5 instruction (one helper; runEngineOnGolden removed only if
  unused) can only be met there.
- FB's new data-scan rules (fb `10ebda3`) already list engine.ts as a reader of `fixtures/golden/**`. readRelease is
  RULES_CONTENT, so the move adds no reader.

### payment-engine/N4 (nit, for Lane A only): recorded, no engine change

engine.ts's `price` sorts a claim's lines by `a.lineNo - b.lineNo` before `validateFacts`. A NaN line number makes the
comparator inconsistent, so `price`'s result order, and anything ranked in claim order, follows the sort's choice. On
V8 the claim [3, NaN, 1] prices in the order 3, NaN, 1. The fix belongs in PR 6c (in for_lane_a below).

### Also described as current behaviour (the brief's rule for pinned engine behaviour), 925ac9e

`stops a line at the rounding step for a rule it does not know` pins the detail `'unexpected'`: roundToCents' MoneyError
reaches attempt's catch-all. The comment now names that detail as the frozen engine's current one, not its rule. A
detail of its own is for 6c.

## For Lane A's PR 6c (engine corrections)

1. **N4.** Validate line numbers (`Number.isSafeInteger`, at least 1, unique) before `price` sorts and ranks a claim's
   lines, or sort with a comparator total over every number. Then sorts.test.ts's NaN case may also assert the order
   of the results.
2. **S2.** A year basis the engine cannot read as `LOCKED:` plus four digits should stop the line (ENGINE_ERROR, with a
   detail of its own), not price at the records in force. This is a founder question.
   - It flips engine.test.ts "a year basis, read as whole text > frozen engine, current behaviour, a known defect …".
   - `YearBasis`'s `LOCKED:${number}` is wider than the contracts schema: it also admits 'LOCKED:202', 'LOCKED:20250',
     'LOCKED:2025.5', 'LOCKED:-1' and others.
3. **From N1.** The engine reads an inherited place-of-service setting for a two-digit place, because `validSettings`
   checks own keys and the lookup reads through the prototype. Read own keys only (`Object.hasOwn`). The null-place
   hardening test then generalizes to every place.
4. **The unknown rounding rule.** It stops with ENGINE_ERROR detail `'unexpected'`, the catch-all. A detail of its own is
   better.

## For the Suite (documents I do not own; FB's fba28f8 holds the current text)

**ADR 0066 Part 4's table:**
- money After `96.58% (226 of 234)`, undetected `8`;
- pricing After `98.67% (1,934 of 1,960)`, undetected `26`;
- ledger and packets unchanged;
- shard times from this run: money-ledger 3 min 42 s, pricing-engine 8 min 28 s, pricing-recompute 3 min 50 s, pricing-rest 5 min 28 s, packets-scan 6 min 17 s and packets-rest 5 min 45 s (Stryker time on four shared CPUs).

**ADR 0066 Part 4's paragraph after the table:**
- "went from 662 to 164";
- add: "the payment-engine review killed two more by a test (engine.ts:401's visit sort, told apart when a NaN line
  number leaves price's own sort to the implementation), and found one that a test told apart only with text cast past
  its type through an incidental TypeError, now recorded (rounding.ts:26)".

**ADR 0066 Part 4's standard paragraph, and docs/runbooks/ci.md "Recording an equivalent", add:**
- "A mutant told apart only once an earlier sort's comparator is inconsistent for a value of the declared type (a NaN
  line number) is not equivalent either."
- "A test may also hold the code to an input beyond its declared types, as hardening, when it asserts the code's own
  outcome for that input (its own check's error class and message, or reason): such a kill stands and the mutant is not
  recorded, but it is no evidence against an entry. A kill that rests only on an incidental failure (a TypeError from a
  method the value lacks, asserted by a bare toThrow) is not one: the mutant is recorded and the test dropped
  (packages/money/src/rounding.ts:26)."

**The runbook's list of non-equivalents, add a bullet:** "a sort of a list already in order, when an earlier sort's
comparator is inconsistent for a value of the declared type (`packages/pricing/src/sorts.test.ts`, the NaN line number
case)".

**The PR body's founder notes:**
- S2 as a money-path defect;
- S1's later MoneyError guard;
- N2's ledger half.

## Mutation runs (Stryker 10.1.1, under the lock, the canary first in every shard)

Narrow, first:
- `pnpm stryker run stryker/money.config.mjs --mutate packages/money/src/rounding.ts`: 21 killed, 2 survived. The two are
  rounding.ts:26 `true` and :52 `'halfUp'`, both recorded.
- `pnpm stryker run stryker/pricing.config.mjs --mutate "engine.ts:99-99,…:159-159,…:401-401,…:566-567,…:598-600"`:
  23 of 23 killed.

All six shards, one after another, then the gate over their reports
(`/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fa/runs/full/`):
- every canary 5 of 5;
- `gate.ts reports/mutation --expected '<all six>'` gave "mutation gate: passed".

| Package | Score | Undetected, all recorded |
| --- | --- | --- |
| money | 96.58% (226 of 234) | 8 |
| ledger | 98.13% (1,633 of 1,664) | 31 |
| pricing | 98.67% (1,934 of 1,960) | 26 |
| packets | 95.87% (2,299 of 2,398) | 99 |

Undetected mutants: 165 to 164, each a reviewed equivalent.

Then pricing-engine, pricing-recompute and pricing-rest were run again on the committed head. sorts.test.ts's
comparator-less fallback changed to the native sort after the first two pricing shards had run; that was the lint fix,
`no-base-to-string`. Result of the rerun:
- every canary 5 of 5;
- all 1,917 pricing mutants have the same status as in the first run;
- the gate over the six shards' reports (the reruns' for pricing) again gave "mutation gate: passed", with the same
  scores. Reports: `/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad/ci-mutation/fa/runs/pricing-final/`.

Negative check: in a scratch copy of those reports, the two engine.ts:401 mutants were set back to Survived. The gate
then fails with exactly 2 problems: "unexplained Survived packages/pricing/src/engine.ts:401:21 MethodExpression" and
":401:73 ArrowFunction". So the records are gone and the new kills carry the gate.

## Checks (on 5f9f2edef7a933e18e78ee15bddb3da7a5891cea)

- [pass] My tests, then `flock … pnpm exec vitest run --project unit packages/money packages/pricing packages/ledger
  packages/packets`: 45 files, 762 passed.
- [pass] `flock … pnpm exec vitest run --project unit tools/golden-worksheet tools/stryker`: 13 files, 81 passed.
- [pass] `flock … pnpm test:golden`: 4 files, 188 passed. The claim-set test is green; the count is unchanged.
- [pass] `env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8`: "(no non-test file under
  packages/pricing/src changes)", "Let through by the exception: Nothing", "Problems: None".
- [pass] `git diff --numstat 9099fac -- packages/ledger/src`: empty (0 files, 0 deletions).
- [pass] `flock … pnpm typecheck`: exit 0 (2 min 9 s).
- [fail, then fixed] `flock … pnpm lint` on the first harness: 2 errors, `@typescript-eslint/no-base-to-string` on
  `String(a)` and `String(b)` in a hand-written default order. That order was replaced by the native sort, and eslint
  on the touched files then exited 0.
- [pass] `flock … pnpm lint` on the head: exit 0, `--max-warnings=0` (2 min 37 s).
- [pass] Scope against 49514e8:
  - `git diff 49514e8 -- packages/pricing/src ':!**/*.test.ts'` is empty;
  - the only non-test money file is cents.ts;
  - nothing under fixtures, content, packages/db or apps changed since 9099fac;
  - no model identifier in the diff or the commit messages but the attribution lines.

Test count changes against 9099fac, by file:
- sorts.test.ts: +3 (the NaN case under three sortings);
- engine.test.ts: +1. The year-basis test is split in two with every assertion kept; the inherited-"null" test is
  retitled;
- rounding.test.ts: -1 (S1's cast test, as the brief directs);
- the golden files: unchanged.
