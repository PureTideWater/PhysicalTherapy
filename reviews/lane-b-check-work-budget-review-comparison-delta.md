# Lane B review: the work budget's comparison weight, 1 to 4 (commit f10209a0)

## Scope

One delta: `WORK.comparison` 1 -> 4 in `packages/redact/src/redact.ts` (f10209a0 against 493be1b2), on branch
`co-001/check-work-budget`. Two questions only: (1) does anything the base redacts or refuses get sent because of
it; (2) does any timed budget row of `denial-letter.test.ts` pass only because of how it is run. Not reviewed: the
rest of the budget design, the identifier charge, the recorded residuals, the registry entry and fixture.
All probe text is synthetic. Nothing in the repository was edited, committed or pushed.

## Verdict

- Question 1: NO. No path found where the larger charge changes an answer other than "was read, is now refused".
- Question 2: NO. Every timed row passes on its first, cold run with no machine allowance, alone and in the whole file under coverage; worst row 1.93 s of processor time against 3.00 s.

## What I checked

### Question 1

Swallowed exceptions (code citation, reader after the delta).
- `grep -n catch packages/redact/src/redact.ts` gives exactly two: line 3393 (`redactLetterForScreen`) and line 3511
  (`holdsIdentifier`). Both rethrow anything that is not `PastCheckWorkBudget`; on it the first returns only
  `unreadPastTheBudget` (the BARRIER mark, replaced 0, no candidates, count = budget + 1) and the second returns true.
- The only other `try` is `onFold` (511 to 515): `try { return read() } finally { ownFold = before }`, no catch, so a
  throw from the `onFold('alike', ...)` closure at 1204 to 1213 propagates and the fold is restored.
- The five `someOf` call sites: 1202 (inside `Array.filter`, which catches nothing), 1206 (inside the `onFold`
  closure, in a `for...of` over an array already built), 1230 (`Array.filter`), 1232 (`for...of` over the array
  `patternMatchesIn` returns, line 2047 `: Found[]`, no generator), 3428 (`inNumber`, inside `Array.filter`). None sits
  inside a shared regular expression's `exec` loop, so no `lastIndex` is left part-way by a throw from `someOf`.
- State after a throw: `checkWorkSpent` restored in both `finally` blocks (3399, 3518); `viewsOfCheck` and
  `datesOfCheck` are set only by `holdsIdentifier` (3498, 3499) and nulled in its `finally` (3519, 3520); the
  redaction entry never sets them. `workOfRedacted` is a WeakMap keyed by the returned object.
- Count: the largest single charge is `4 * list.length` on an array of matches; the counter cannot leave the safe
  integer range from 420,000,000, and `work` refuses on `!(spent <= budget)`, so a NaN refuses too (336).
- Callers with no counter (`redactLetter`, `redactionSpans`, 4481, 4534): `checkWorkSpent` is null there and `work`
  returns at 331 before the weight is read; the constant cannot reach them.
- `denial-letter.ts` 230 to 235: `prepare` has no try/catch around the two entries; refusal is `identifier_left`.

Differential, base reader (no budget) against the reader before the delta and after it
(`/home/user/review-w28/diff.mts`): six letter shapes (CT-2's with a look-alike, with the joiner form, plain, with a
tail of identifiers, the call's own identifiers among phone and Social Security numbers, repeated joiner names) at
eleven sizes from 1,000 to 50,000 repeats, 66 letters. For each: the new reader's text, replaced count, candidates,
claims and check answer are exactly the base's, or the letter is refused (in the redaction: BARRIER only, no
candidates; or in the check: same redaction as base, answer true). Result: 0 mismatches, 0 letters sent where the
base or the earlier reader holds, every letter the earlier reader refuses is refused, every answer and count is the
same on a second run, and after each letter five probe letters (clean, identifier-bearing, glued, look-alike, joiner)
gave the base's answers and an unchanged count (no state leak).

Throw sites actually exercised (`/home/user/review-w28/sites.mts`, on a copy of the new reader in
`/home/user/review-w28/redact-copy` whose only change is recording the stack in the exception's constructor; six
shapes, sizes 2,000 to 60,000 in steps of 1,000, 354 letters): `PastCheckWorkBudget` was thrown from `someOf` at
1202 (both its found and not-found charges, 85 times), at 1206 inside the `onFold` closure (56), at 3428 `inNumber`
(27), and from other counted sites (`buildView`, `fold`, `firstIndex`, `labelWindow`, `letterJoins`, the entry's own
charge). Every throw ended in a refusal (0 "thrown but sent"), and the probe letter read after each gave the same
result and count (0 leaks). Sites 1230 and 1232 were not reached by a throw in my shapes; they are covered by the
code citation above only.

Flip lengths (bisected on the unmodified reader; the last letter still read equals the base in every field):
- CT-2 with a look-alike: read to 11,936 initials (23,881 characters), refused from 11,937. Before the delta this
  shape was read at 15,000 and refused at 20,000.
- CT-2 with the joiner form: read to 8,649 (17,316 characters), refused from 8,650 (before: read at 13,000).
- Repeated joiner names: read to 58,947 characters. Own identifiers among numbers: read to 179,211 characters.

### Question 2

How `timed` measures (`packages/model-gateway/src/test-support/time-budget.ts`): processor time of the thread
(`process.threadCpuUsage`) around the whole of `checked()` (the redaction, `checkWorkOf`, and the check), so it is
not narrower than the check. The first run is the one judged, against 3,000 ms with slowdown 1; a second run and a
machine allowance happen only if the first ran over. The untimed `checked()` at the end of each row runs after the
timed one, so there is no warm-up before the measurement inside a row. The test file is unchanged by the commit
(`git diff 493be1b2 f10209a0 --stat`: redact.ts, two synth files, one fixture).

Measured (this machine, load average 4 to 5 from the background gate, so processor time only):
- Each of the eight rows in its own fresh process, V8 precise coverage on as the v8 provider turns it on, nothing
  run before it (`/home/user/review-w28/covtime.mts`), first run / second / third, seconds of processor time:
  1.93/1.68/1.67, 1.29/1.34/1.29, 0.70/0.57/0.57, 1.42/1.29/1.19, 1.37/1.28/1.29, 1.46/1.25/1.28, 1.48/1.42/1.36,
  1.56/1.47/1.39. The cold first run is the worst case and is 36 % under the 3.00 s at its worst. Without coverage
  rows 1, 2 and 4 take 0.40, 0.35 and 0.98 s. (My replica runs the reader through the type-stripping resolver, not
  vite's transform; the builder's vitest figures, 1.71 down to 0.64 s, agree within 0.25 s. Load may have added to
  mine.)
- The whole file with coverage, unfiltered, as the unit project runs it:
  `pnpm exec vitest run --project unit --coverage packages/model-gateway/src/functions/denial-letter.test.ts`:
  1 file, 1,038 tests passed, including the eight rows and the five budget tests after them (lines 398 to about 500).
- Rows 3 to 8 are refused in the check with the redaction's count at 146.6 to 414.1 million; their cost is not from
  comparisons and the delta does not move them. Rows 1 and 2 are the only rows the delta changes.
- The answers are counts: whether a row is refused does not depend on the machine or the run, only its time does.
  A runner would have to be about 1.55 times slower than this loaded machine on the cold first row before the
  calibration allowance (already in the test support, unchanged) is even consulted.

I did not run the full `pnpm test` across every package on this loaded machine; the claim "passes in the full
coverage run" rests on the whole-file run plus the cold single-row runs, which bound the row from both sides
(warmest and coldest).

## Findings

BLOCKING: none.

LESSER (for the queue):
- L-1. The header comment of the budget in `packages/redact/src/redact.ts` (about lines 292 to 293) still says "The
  unit is one comparison of two matches (2 to 5 ns on the reference machine)". After the delta a comparison is four
  units. The ADR (lines 1743 to 1749) states four; the code comment does not.
- L-2. The cost of the tightening, for the record: letters of CT-2's shape between about 24,000 and 40,000
  characters (look-alike form) and between about 17,000 and 30,000 (joiner form), which the earlier reader read in
  0.3 to 0.9 s of processor time without coverage, are now refused. Fail closed, crafted shapes only (thousands of
  initials beside the name), and it is the stated intent of the ruling; the weight is now fitted to the cost of a
  comparison under coverage (about 13 ns), not in production (2 to 5 ns). Whether any letter of the corpus flips is
  the differential gate's question, not answered here.
- L-3. Sites 1230 and 1232 have no letter in my probes (and I found none in the test rows) that takes the reading
  past the budget there; their fail-closed behaviour is by code reading. A row whose refusal lands in each of the
  five `someOf` sites would pin it.

## Scripts

- /home/user/review-w28/diff.mts (three-reader differential, 66 letters, probes after each)
- /home/user/review-w28/sites.mts (throw sites, state after each throw, flip lengths)
- /home/user/review-w28/covtime.mts (cold per-row processor time with precise coverage)
- /home/user/review-w28/redact-copy/ (instrumented copy of packages/redact/src used by sites.mts only)
