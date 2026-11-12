# Review 3: fix round 1 of Queues item 34 (MOD-25), commit 483ac960, the delta only

Synthetic data only. Three trees, each row run on all three in the same process:

- **base**: a97d73e4 (`scratchpad/trees-483ac960/base`)
- **pre**: the head before the fix (`scratchpad/trees/head`; its `redact.ts` is byte-identical to `483ac960~1`)
- **fixed**: 483ac960 (`scratchpad/trees-483ac960/head`; its `redact.ts` is byte-identical to the commit's)

Path used: `redactLetterForScreen`, then `holdsIdentifier(text, patient, claims, checkWorkOf(redacted))`; coverage from `redactionSpans`.
Scripts: `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/review-3/` (called `$R` below).
Command form: `cd $R && PATH=/opt/node24/bin:$PATH node --import /home/user/ops/designs/lane-b-redact-ssn-phone/gate/ts-resolve.mjs <script> <args>`. Nothing was written into the gate folder or the repository.
The machine was busy throughout (load average 5 to 11 on 4 cores, a gate with 4 workers running): every timing is one run, to be read as base against pre against fixed in the same run, not as an absolute.

## Verdict

No BLOCKER. The three claims hold on everything I ran: no letter where the base or the pre-fix head hides or refuses something that the fixed head shows or sends (54,702 fuzzed letters, 0); the two patterns match the same strings; every timed row is linear and within 2 times the base.

One thing the commit message says is not true: "No budget ... is changed" holds for the constants, but **the counted units are not the same as before the fix** (R3-1). A letter the base and the pre-fix head redact whole and send is now refused past the budget.

## Findings

### R3-1 LESSER (but it breaks the stated invariant): every-place scanning changes the counted units; a letter sent before is now refused past the budget

- **What.** Each extra match the wider reading now finds is charged by the work that follows it (the per-match and per-list charges; `work(WORK.formCharacter * forms.length * normal.length)` itself is unchanged). So `checkWorkOf` differs between pre and fixed wherever a stored value's writings overlap themselves.
- **Input 1 (refused now, sent before).** names `['AAAAAAAA']`, memberIds `['SYN555001']`, claimNumbers `['ZZ99887']`, text `'A '.repeat(49000)` (98,000 characters):
  - base: SENT, 0 letters or digits outside placeholders, 341,006,350 units
  - pre: SENT, the same text, 341,006,350 units
  - fixed: **REFUSED, 420,000,001 units** (past the budget). The same at 100,000 characters (base and pre 347,962,100 units, about 1.0 and 0.8 s; fixed refused in about 0.6 s).
- **Input 2 (largest rise that is still sent).** names `['JANE Q VANTREE']`, memberIds `['7,7,7,7,7']`, claimNumbers `['7,7,7,7,7,7,7']`, text `'7, '` repeated to 100,000 characters: base 242,692,610, pre 243,492,610, fixed **350,715,110 units (+44%)**, all three sent.
- **Input 3 (small letter).** names `["AA'AAAAAA"]`, memberIds `['12 12 12']`, claimNumbers `['11111111', '11111111/7']`, text `'12\r\r\n12\t1212;12\r\n1@2\n\rNo.ʼn '`: pre 155,458 units, fixed 615,744 (3.96 times), both sent.
- **How often.** In the self-overlap fuzzer, 3,119 of 24,120 letters have different units on pre and fixed (12.9%). In the 1,189 of them from seeds 301 to 303: fixed above pre in 872, **below** pre in 317 (least ratio 0.944), greatest ratio 3.96.
- **Where it does not move.** Values that do not overlap themselves: prose of 100,000 characters with `JANE Q VANTREE` / `ZZ12345/01` 183,139,220 units on both; with `ANNA HANNAH` / `1001001` 184,699,010 on both; every row of groups C and D below where pre ran.
- **Why LESSER and not BLOCKER.** The change is to a refusal (fail closed): nothing the base hid is shown. It is not a raised threshold. But the brief's condition "the counted units must not change between the pre-fix and the fixed head for any input" is false, so the rows measured at 403,548,210 and 414,023,090 units cannot be assumed unchanged: if their letters hold a self-overlapping writing they can pass 420,000,000 and turn from sent to refused. I did not run those two rows.
- **No test sees it.** None of the commit's new rows compares units before and after, or holds a long letter of a self-overlapping writing.
- **Reproduce:** `... probe3.mts` (inputs 1 and 3, and the prose rows); `... time3.mts B` (input 2 is row B6, input 1 at 100,000 is row B1).

### R3-2 LESSER: the new timed rows leave three R2-1 shapes without a row

All three are linear on the fixed head today (table below); none has a test, so a later change to `runOfMarks` could bring the doubling back unseen.

- The drafter's check (`holdsNameOrNumber`, no counter), which Review 2 named: numbers `['ZZ12345/01']`, text `'Member ZZ12345' + '/'.repeat(20) + 'Group 100'`: base 1 ms, pre 67 ms, fixed 4 ms; at 100,000 slashes base 19 ms, fixed 25 ms.
- A separator of more than one character: held `'ZZ12345 - 01'`, text `'Member ID: ZZ12345' + ' - '.repeat(8) + ' Group: 100'`: base 8 ms, **pre 2,127 ms**, fixed 16 ms (at 33,000 repeats base 187 ms, fixed 207 ms).
- A run repeated after each of many near misses: held `'ZZ12345/01'`, text `('ZZ12345' + '/'.repeat(18))` repeated to 5,000 characters: base 9 ms, pre 592 ms, fixed 11 ms.
- **Reproduce:** `... time3.mts C` (rows C13, C7, C5b).

### R3-3 LESSER: the R1-1 tests assert less than the finding states

`hides(...)` in `redact.leaks.test.ts` asserts only that the sent text does not hold the name's last n-1 letters (or the number's last digits) as one unbroken run outside placeholders (`not.toContain(rest)`). R1-1 states that the base hides the real writing **whole**. A regression that showed, say, 6 of the 7 remaining letters (`'[PATIENT_NAME] P H Y R A Z'` for ZEPHYRAZ) would pass every row and the property. Nothing of that kind exists on the fixed head (0 in the 960 letters of Review 1's count, below); the assertion should be "no letter of the real writing outside a placeholder". The number rows are 4 fixed letters with no property beside them. No threshold or allowance is touched: the commit only adds lines to the two test files (`git show --numstat`: 40/0 and 57/0), and the new timed rows use the existing `BUDGET_MS = 3_000`, `HANG_GUARD_MS` and `timed`.

### R3-4 LESSER (outside the delta, noted because the fix covers it by accident): the pre-fix head sent a piece the base refused

names `['AAAAAAAA']`, memberIds `['12121/2121']`, claimNumbers `['12312312', '000&11']`, text `'000&11.12121\u00852121\u0085aaAaaaAa A\u0085A\u0085AaA\u0085Aa\u0085a\r\naaAaA&'`:

- base: REFUSED
- pre: SENT `'[CLAIM_2].[MEMBER_ID]\u0085[PATIENT_NAME] [PATIENT_NAME]\r\naaAaA&'` (5 of the name's 8 letters in clear)
- fixed: SENT `'[CLAIM_2].[MEMBER_ID]\u0085[PATIENT_NAME] [PATIENT_NAME]&'` (no letter or digit outside placeholders)

On the fixed head this letter is fully hidden, so it is not a finding against the delta. It is the only base-refused, fixed-sent letter in 54,702. I did not look for other letters of the class where the fix does not happen to cover the piece (my fuzzers did not class base against pre).
**Reproduce:** `... probe3.mts` (first block).

## What held

### A. R1-1: whatever the base replaced, the fixed head replaces

| Run | Letters | Base covers or refuses, fixed shows or sends | Pre covers or refuses, fixed shows or sends | Pre sent, fixed refused | Fixed threw | Span/text mismatch |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `fuzz3.mts` seeds 301 to 306 (95 s each; self-overlapping names and numbers, a value inside another, shared head/tail, held separators, pieces, 44 marks, CR/LF/U+0085) | 24,120 | 0 shown; 1 refused-to-sent, fully hidden (R3-4) | 0 | 0 | 0 | 0 |
| Review 1's `fuzz2.mts` seeds 202, 203 against the fixed head (seed 202 found R1-1 before) | 14,670 | 0 | not compared | not compared | 0 | 0 |
| Review 1's `fuzz1.mts` seed 101 against the fixed head | 15,912 | 0 | not compared | not compared | 0 | 0 |

- In `fuzz3`, pre and fixed refuse exactly the same count in every seed (1,699 of 24,120) and no letter moves from sent to refused; their texts differ in 2,284 letters, each time with the fixed head covering at least what pre covered.
- Review 1's reproduction on the fixed head (`repro.mts R1-1`, `R1-1n`): 960 letters, the base hides the whole name written apart in 960, **the fixed head shows letters of it in 0, refuses 0**. `'ZEPHYRA: Z E P H Y R A Z'` → `'[PATIENT_NAME]'`; `'Ambrid, a m b r i d a'` → `'[PATIENT_NAME]'`; `'7: 654 # 7,654,7'` → `'[MEMBER_ID]'`; `'Paid 7.654 $7,654 7 today'` → `'Paid [MEMBER_ID] today'`; `'2\r\n212 $2,212 2'` → `'[MEMBER_ID]'`.
- Read, not run: the `labeled` and the glued loops of `ownMatchesIn` still scan from the end of each match. I could not build an R1-1 letter through them by hand (a letter stands before the glued writing and stops the earlier match) and the fuzzers found none.

### B. Cost of every-place scanning (ms, one run each, busy machine; state; units)

| Letter | Characters | base | pre | fixed |
| --- | ---: | --- | --- | --- |
| B1 name `AAAAAAAA`; `'A '` repeated | 25,000 / 50,000 / 100,000 | 386 / 490 / 1,017 sent | 358 / 545 / 829 sent | 373 / 547 sent; 556 **REFUSED** (R3-1) |
| B2 member `7,7,7,7,7`; `'7,'` repeated | 25,000 / 50,000 / 100,000 | 312 / 485 sent; 1,149 refused | 301 / 593 sent; 1,002 refused | 399 / 588 sent; 991 refused |
| B3 name of 30 letters `ZEPHYRAZEPHYRAZEPHYRAZEPHYRAZE`; `'Z E P H Y R A '` repeated | same | 207 / 326 / 747 | 207 / 343 / 686 | 192 / 270 / 702 |
| B4 twelve names; `'A N N A B A B Z E P H Y R A O T T L U '` repeated | same | 301 / 368 / 719 | 211 / 322 / 756 | 251 / 319 / 758 |
| B5 name `AAAAAAAA`; `'A'` + 49 spaces, repeated | same | 71 / 65 / 141 | 78 / 59 / 141 | 39 / 70 / 155 |
| B6 member `7,7,7,7,7`, claim `7,7,7,7,7,7,7`; `'7, '` repeated | same | 159 / 174 / 316 | 191 / 185 / 471 | 157 / 268 / 445 |
| B7 name `ANNANNA`; `'ANN '` repeated | same | 130 / 189 / 394 | 174 / 173 / 425 | 118 / 206 / 424 |

Growth on the fixed head is at most about 2 times for twice the size in every row; no row is slower than 1.5 times the base. Units: equal on pre and fixed in B4 and B7; higher on fixed in B1 (+24%), B2 (+19% at 50,000), B3 (+2%), B5 (+3%), B6 (+44%). `... time3.mts B`.

### C. R2-1: the same language, linear time

- **Language** (`lang.mts`, the old and the new pattern text built with the three marks U+0001, U+0002, U+0003 as in the source): 15 values of `also` (none, space, hyphen, slash, U+02BC, U+0301, U+0001, U+0002, U+0003, two combinations, U+1F600, period and comma, U+00AD, U+200B) × flags `gu` and `giu` × 6 pattern shapes × 2,500 generated strings of 0 to 12 characters over 29 characters (the marks, lone surrogates, U+017F, U+212A, U+01C5, an Arabic-Indic digit among them), each compared leftmost and at every place: **899,986 comparisons, 0 differ**. Every code point from 0 to U+FFFF and every seventh up to U+2FFFF as a run of one, each `also`, flags `u` and `iu`: **2,527,830 comparisons, 0 differ**. (The product builds its patterns with `gu`.)
- **Time** (fixed head; pre not run where Review 2 showed it does not answer):

| Letter | Size | base | pre | fixed |
| --- | --- | --- | --- | --- |
| C1 held `ZZ12345/01`; `'Member ID: ZZ12345'` + k slashes + `' Group: 100'` | k = 20 / 26 / 500 / 4,000 / 100,000 | 84 / 4 / 12 / 18 / 192 | 141 at 20 | 38 / 6 / 8 / 41 / 240 |
| C2 held `ZZ12345 01`; k spaces | 20 / 100,000 | 5 / 159 | 192 at 20 | 8 / 278 |
| C3 held `ZZ12345-01`; k hyphens | 20 / 100,000 | 9 / 150 | 106 at 20 | 19 / 191 |
| C3b held `12345-01`; `'Ref 12345 '` + k hyphens + `' paid'` | 20 / 100,000 | 20 / 132 | 231 at 20 | 14 / 216 |
| C4 held `ZZ12345/01`; `'ZZ12345/'` repeated | 25,000 / 50,000 / 100,000 characters | 137 / 191 / 375 | 122 / 191 / 381 | 127 / 220 / 408 |
| C5 the same; (`'ZZ12345'` + 300 slashes) repeated | same | 49 / 76 / 149 | not run | 78 / 105 / 198 |
| C5b the same; (`'ZZ12345'` + 18 slashes) repeated | 2,500 / 5,000 / 100,000 | 6 / 9 / 229 | 279 / 592 / not run | 6 / 11 / 228 |
| C6 held `'ZZ12345ʼ01'`; k U+02BC | 20 / 26 / 4,000 / 100,000 | 38 / 2 / 42 / 676 | 17 at 20 | 20 / 2 / 45 / 681 |
| C7 held `'ZZ12345 - 01'`; k of `' - '` | 8 / 12 / 4,000 / 33,000 | 8 / 1 / 16 / 187 | 2,127 at 8 | 16 / 2 / 21 / 207 |
| C8 held `'ZZ12345́01'`; k U+0301 | 20 / 26 / 4,000 / 100,000 | 6 / 2 / 12 / 249 | 7 at 20 | 7 / 8 / 16 / 411 |
| C9 name `JANE Q VANTREE`; `'Dear Jane'` + k periods + `'Q'` + k spaces + `'Vantre'` + k commas + `' paid'` | 20 / 26 / 4,000 / 33,000 | 14 / 2 / 22 / 173 | 11 / 2 / 33 / 187 | 5 / 1 / 54 / 175 |
| C10 the same name; (`'V a n t r e'` + 45 mixed marks) repeated | 25,000 / 50,000 / 100,000 | 107 / 127 / 220 | 94 / 123 / 252 | 126 / 108 / 247 |
| C11 the same name; (`'Jane Q'` + 30 of `. ,-'`) repeated | same | 80 / 128 / 226 | 68 / 116 / 240 | 75 / 103 / 213 |
| C12 held `ZZ12/ZZ12/9`; `'ZZ12/'` repeated | same | 131 / 193 / 384 | 127 / 183 / 429 | 133 / 177 / 450 |
| C13 drafter check, `ZZ12345/01`; `'Member ZZ12345'` + k slashes + `'Group 100'` | 20 / 26 / 4,000 / 100,000 | 1 / 0 / 1 / 19 (clear) | 67 at 20 (held) | 4 / 8 / 2 / 25 (held) |
| C14 drafter check; `'ZZ12345/'` repeated | 25,000 / 50,000 / 100,000 | 8 / 18 / 34 | 11 / 17 / 50 | 9 / 19 / 43 |

Every letter of C1 to C12 is sent on every tree that ran; units are equal on pre and fixed in every row where both ran. I found no other super-linear pattern near the change. `... time3.mts C`.

### D. R2-2: identical matches, linear time

- **Matches** (`lang.mts`): every string of 0 to 10 characters over CR, LF, `a` and space (**1,398,101 strings**): `replace` and `matchAll` with `/\r+\n/g` and with `/(?<!\r)\r+\n/g` give the same result in all; `lastIndex` of the one shared pattern is 0 after every call.
- **The shared global pattern.** `CR_LF` has two uses in the file (line 3998 through `matchAll` in `lineEndingsAsOne`, line 4039 `replace`). `replace` with a global pattern starts from 0 and leaves 0; `matchAll` works on a copy. No `test` or `exec` touches it, so no path leaves `lastIndex` non-zero. Read and measured as above; a third use added later with `test` or `exec` would break this.
- **Time**, 25,000 / 50,000 / 100,000 characters (pre stops being run after a row over 4 s):

| Letter | base | pre | fixed |
| --- | --- | --- | --- |
| D1 `'Dear Vantree, '` + n CRs | 160 / 117 / 211 | 910 / 3,159 / 13,191 | 112 / 95 / 192 |
| D2 `'The claim was paid. '` + n CRs + `'x'` | 48 / 60 / 200 | 434 / 1,695 / 6,626 | 44 / 77 / 131 |
| D3 `'Paid.\r\n'` + n CRs | **432 / 1,888 / 6,463** | 430 / 1,695 / 6,358 | 47 / 81 / 207 |
| D4 `'Paid.\n'` + n CRs + `'x'` | 42 / 63 / 130 | 434 / 1,644 / 6,825 | 39 / 69 / 123 |
| D5 `'\n\r'` repeated | 45 / 81 / 168 | 47 / 96 / 238 | 52 / 94 / 212 |
| D6 `'\r\n'` repeated | 49 / 85 / 175 | 47 / 90 / 180 | 51 / 90 / 230 |
| D7 (99 CRs + `'x'`) repeated | 36 / 61 / 127 | 42 / 62 / 144 | 32 / 67 / 148 |
| D8 (999 CRs + space) repeated | 30 / 63 / 141 | 49 / 105 / 203 | 31 / 58 / 138 |
| D9 (50 CRs + LF + `'a'`) repeated | 42 / 66 / 160 | 39 / 70 / 179 | 40 / 95 / 154 |
| D10 `'a\r'` repeated | 145 / 370 / 702 | 204 / 318 / 539 | 198 / 403 / 682 |
| D11 CRs alone | 60 / 54 / 125 | 453 / 1,648 / 6,562 | 41 / 61 / 121 |
| D12 (LF + 99 CRs) repeated | 35 / 58 / 121 | 35 / 59 / 127 | 35 / 58 / 132 |

All sent on all trees; units equal on pre and fixed in every row. The fix also removes the base's own quadratic row (D3). Bare pattern, 100,000 CRs: old 1,465 ms for the first 20,000 alone, new 5.6 ms. `... time3.mts D`.

### E. The new tests

- Only additions in the two test files; no constant, budget, weight or allowance changed (R3-3 for what the assertions do not hold).
- R2-1 rows: 26 and 2,000 slashes, 100,000 spaces, two hyphen rules; each asserts sent, the piece replaced, `[MEMBER_ID]` present, and the existing 3 s bound. R2-2 rows: the four positions of Review 2 at 100,000 CRs, each asserts sent, the name replaced, the same bound.
- I did not run the repository's test suite; the commit's statement that 9 rows and 4 rows failed before the fix is not checked here.

## Not done

- The two rows at 403,548,210 and 414,023,090 units (measured separately, see R3-1).
- `pnpm test`, the gate, the oracle: not run.
- Letters above 100,000 characters; repeated timing runs on a quiet machine.
- A base-against-pre class in the fuzzers (R3-4 was seen only because the fixed head changed the outcome).
