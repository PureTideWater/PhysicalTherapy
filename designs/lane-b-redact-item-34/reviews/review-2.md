# Review 2 (cost and refusal) of Queues item 34 (MOD-25)

2026-11-12. Head 846968af against base a97d73e4, `packages/redact/src/redact.ts`. Synthetic values only.
Scripts and raw outputs: `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/review-2/` (called `$S` below).
Trees: `/tmp/claude-0/-home-user-PhysicalTherapy/4e62dfb8-8235-5e1b-ad69-2ea7453e671b/scratchpad/trees` (`$T`, `base` and `head`).
Every command below is run from `/home/user/ops/designs/lane-b-redact-ssn-phone/gate` with
`TREES=$T /opt/node24/bin/node --import ./ts-resolve.mjs <script> <arguments>`.

**Wall-clock figures were taken on the shared 4 cores while other heavy runs were going (load average 6 to 13).**
Base and head were timed in the same run on the same input, so the ratios stand; the absolute times are high by an unknown factor.
The path timed is the gate worker's: `redactLetterForScreen`, then `holdsIdentifier` with `checkWorkOf`.

## Verdict

Two BLOCKERs, both time the work counter does not see, both reproduced. Five LESSER findings.
No budget, weight, timeout or allowance was raised. No real-shaped letter is newly refused beyond the stated costs.

## Findings

### R2-1 BLOCKER: A-5's run of marks takes exponential time on a run of the stored separator

- **Where.** `redact.ts:783` (`return own === '' ? gap : runOfMarks(own)`) and `runOfMarks` (head line 34 of the diff):
  `(?:[^\p{L}\p{N}<marks>]|[ʼʹˊ${also}])*`. The separator the records hold (`also`: a space, a hyphen, a slash)
  is matched by both alternatives. When the number does not follow the run, the engine tries both for every character: time doubles with each character.
- **Real-shaped input.** A member ID the records hold with a space, and a letter that pads the column with spaces; or held with a hyphen, above a rule of hyphens.
  The letter is sent, not refused, and the counter reads about 0.3M of 420M units.

| Held | Letter | Base | Head |
| --- | --- | ---: | ---: |
| `ZZ12345 01` | `Member ID: ZZ12345` + 20 spaces + `Group: 100` | not run | 203 ms |
| `ZZ12345 01` | the same with 24 spaces | 88 ms | 1,247 ms |
| `ZZ12345-01` | `Member ID: ZZ12345 ` + 24 hyphens + ` Group: 100` | 112 ms | 1,777 ms |
| `12345-01` | `Ref 12345 ` + 24 hyphens + ` paid` | not run | 3,734 ms |
| `ZZ12345/01` | `Member ID: ZZ12345` + 14 / 18 / 20 / 22 / 24 / 26 slashes + ` Group: 100` | 110 ms at 26 | 130 / 196 / 252 / 684 / 1,945 / 7,310 ms |
| `ZZ12345/01` | `ZZ12345` + 500 slashes (507 characters) | 50 ms | no answer in 45 s (cut) |
| `ZZ12345/01` | `ZZ12345` + 1,000 / 2,000 / 4,000 slashes | 31 / 29 / 43 ms | no answer in 45 s, each |

- **Growth.** About 1.9 times per character of the run (22 to 24 to 26 slashes: 684, 1,945, 7,310 ms). By that rate 28 slashes pass 10 s; I did not run 28.
  A run of another mark is not affected: held `ZZ12345/01`, 2,000 periods 36 ms, 2,000 spaces 38 ms on the head.
- **The drafter's check too** (`holdsNameOrNumber`, no counter): held `ZZ12345 01`, `Member ZZ12345` + 20 / 24 spaces + `Group 100`: base 25 / 5 ms, head 87 / 251 ms.
- **Cause shown on the bare pattern shape** (`$S/cause.mts`): 26 marks, 798 ms with the separator in both alternatives, 0.02 ms without. Not tried in the product.
- **Not caught because** the gate holds no such letter, the A-5 tests write runs of one to three marks, and the new timed rows of `denial-letter.test.ts` hold no stored separator.
- **Reproduce:** `timeout 40 ... $S/expo.mts head 'ZZ12345/01' 'Member ID: ZZ12345' '/' 26 ' Group: 100'` (and `base` for the other side).

### R2-2 BLOCKER: a run of carriage returns with no line feed costs quadratic time the counter does not see

- **Where.** `redact.ts:3862` (`holdsIdentifier`) and `:4044` (`refusedAsFirstRead`) now call `asLineFeeds(text)` on every letter;
  the base asked only where the text held a CR LF. `lineEndingsAsOne` (`:4003`, `matchAll(/\r+\n/g)`) adds a pass with no charge (point 29).
  `/\r+\n/g` rescans the rest of the run from each CR of it.

| Letter, call | Characters | Base | Head |
| --- | ---: | ---: | ---: |
| CRs alone; numbers `ZZ1234567`, `SYN555001` | 25,000 / 50,000 / 100,000 | 68 / 103 / 133 ms | 481 / 1,784 / 7,854 ms |
| `Dear Vantree, ` + CRs; numbers `76543210`, `1234567` | 25,014 / 50,014 / 100,014 | 85 / 103 / 205 ms | 1,084 / 4,488 / **16,610 ms** |
| `The claim was paid. ` + CRs + `x`; lettered numbers | 25,021 / 50,021 / 100,021 | 50 / 79 / 220 ms | 575 / 2,356 / 9,030 ms |

- **Growth.** Four times for twice the size: quadratic. Worst ratio 81 times (16,610 ms against 205 ms). Each letter is sent.
- **The base has the same pattern behind its guard:** `Paid.` + CR LF + 100,000 CRs takes 8,597 ms on the base and 9,850 ms on the head.
  The head removes the guard and adds passes; it did not introduce the pattern.
- **One pass alone:** `'\r'.repeat(100000).replace(/\r+\n/g, '\n')` 7,986 ms; with `(?<!\r)` before the pattern 1 ms (bare regex, not tried in the product).
- **Size limit.** I found no limit on a letter's characters in `redactLetterForScreen` or `functions/denial-letter.ts` (grep); 100,000 is the size the gate and the tests time. Single CRs between words are linear (`a\r` repeated, 100,014: base 1,168 ms, head 952 ms).
- **Reproduce:** `... $S/timing2.mts 0,1,2`.

### R2-3 LESSER: the rule (d) test no longer bounds the check from above for identifiers without a mark

- `packages/redact/src/narrative.test.ts`: the base asserted `holdsNameOrNumber === matcher finds` over 4 cases, 2,000 runs.
  The head asserts "matcher finds implies the check holds" over 6 cases at 2,000 runs, and equality only over 3 "plain" cases at 1,000 runs. None of the 3 holds a number of five characters.
- So nothing asserts that the check reads no more than the matcher for an unmarked lettered number (`ZZ1234567`), the commonest shape.
- Measured, 20,000 random texts each (`$S/dcheck.mts`): names `ZOË`, `VAN-TREEBY`, numbers `ZZ1234567`, `SYNCCN0001`: the head holds more in 0; numbers `4567`, `0001`: 0; numbers `1234567`, `20260305`: 1,526, each a glued form (`X1234567`, `paid1234567)`). The behaviour is as designed; the bound is unpinned.
- The ruling allows "and more", so I class this LESSER and not a weakened test. `packages/packets/src/verifier-identifiers.test.ts` dropped "the verifier flags wherever the drafter's check holds", which the ruling requires.

### R2-4 LESSER: "the check holds wherever the verifier matches" is not true of the verifier's whole-word reading

- The packets test asserts it with `wholeWords.length > 0 ||` in front, so a whole-word match is never asked of the check. The comment over `holdsNameOrNumber` says "(… the packet verifier's)".
- Probe of 22 rows (`$S/zz-r2-probe.test.ts`, outputs `$S/oracle-846968af.out` and `$S/oracle-a97d73e4.out`): the verifier flags and the check passes in 5 on the head, 13 on the base.
  The 5: numbers `2026/03/05`, `03-05-2026`, `2026-03-05` written as held (the date exception); names `Q+R` and `X+Y+Z` written as held.
- The head narrows the gap and does not open it. Such facts pass the check before the call and fail the verifier after it. Whether that is a leak is Review 1's.

### R2-5 LESSER: no timed test holds a run of a stored separator or a run of CRs

The four new timed tests in `functions/denial-letter.test.ts` use numbers with no separator and letters with no CR run. The gate's slowest letter (957 ms) is of neither form. R2-1 and R2-2 pass every test and the gate.

### R2-6 LESSER: the battery's nine scripts that did not load

Named from the status note and `battery.sh`; I read `battery.sh` and the recorded outputs, not the scripts.

| Script | What `battery.sh` has it measure | Covered otherwise for this change? |
| --- | --- | --- |
| `b2fix/repro.mts`, `review-c1/repro.mts`, `review-c2/repro.mts` | reviews' reproduction rows, diffed against the run before | partly: b1 and d1p4 ran (0 lines differ, against a missing earlier run) |
| `c1fix/fz2.mts`, the audit `fz2.mts` | PHI fuzzer flips (base refused, head sent); DEPART lines | yes in kind: fuzz1, fuzz2, fz, fz3 and the audit fuzz1, fuzz2 ran |
| `stress16.mts` with `prop-head.mts` | 20,000 runs of the MOD-16 property | no: the unit properties run 400 |
| `review-i2/main.mts layouts`, `a1.mts` | must-stay layouts (a label, a rule under it, a number) | partly: review H2's layouts ran |
| `review-i2/time.mts` (`v/vL.mts`, `v/vX.mts`) | time of 20,000-character letters, redaction and check, per pattern | **no**: the only other timing is the gate's table |

`time.mts` and `stress16` are the two whose kind of risk (time; a long property run) nothing else that ran covers. I cannot say either would have found R2-1 or R2-2.

### R2-7 LESSER: A-6's third reading is the largest move on the counter (stated, confirmed)

Prose of 99,974 characters with LF CR line endings: 140,558,608 units on the base, 192,004,520 on the head (+51,445,912, 37%), sent. Point 12 states it. No row with a call of no digits-only number moved otherwise.

## What held

**Budget, weights, allowances.** The product diff has no hunk before line 670; `CHECK_WORK_BUDGET = 420_000_000` and the `WORK` weights (lines 297 to 319) are the base's. In the test diffs: no `.skip`, no timeout changed, no allowance changed. The one `numRuns` change is R2-3's. Assertions removed are the five pinned rows the design lists as turning, and the two oracle rows.

**Units, base against head** (`$S/units2.mts 0` and `1`; outputs `$S/units2-0.out`, `$S/units2-1.out`). All sent unless marked.

| Call | Row | Base | Head | Moved |
| --- | --- | ---: | ---: | ---: |
| `ZZ1234567`, `SYN555001` | gap + initials, 100,008 | 403,548,210 | 403,548,210 | 0 |
| | U+33FE to 57,972 with CR LF | 414,023,090 | 414,023,090 | 0 |
| | prose 100k / with CR LF / with look-alikes | 141,615,564 / 192,004,520 / 170,312,538 | the same | 0 |
| | prose 100k with LF CR | 140,558,608 | 192,004,520 | +51,445,912 |
| names only | gap + initials / U+33FE | 401,815,650 / 405,824,290 | the same | 0 |
| | prose / CR LF / look-alikes | 139,550,292 / 188,941,140 / 167,445,330 | the same | 0 |
| | prose with LF CR | 138,502,304 | 188,941,140 | +50,438,836 |
| `1234`, `4321` | gap + initials / U+33FE | 403,474,610 / 408,695,450 | the same | 0 |
| | prose / CR LF / look-alikes | 141,208,724 / 191,407,460 / 169,904,498 | the same | 0 |
| | prose with LF CR | 140,160,768 | 191,407,460 | +51,246,692 |
| `76543210`, `1234567` | gap + initials | 403,526,160 | 404,326,200 | +800,040 |
| | U+33FE with CR LF | 408,772,940 | 409,700,472 | +927,532 |
| | prose / CR LF / look-alikes | 142,093,344 / 192,700,850 / 170,789,958 | 142,493,232 / 193,489,834 / 171,589,734 | +399,888 / +788,984 / +799,776 |
| | prose with LF CR | 141,022,888 | 193,489,834 | +52,466,946 |

- The two recorded rows are unchanged to the unit (403,548,210 and 414,023,090). I ran the same rows through my own script, not `units.mts` itself.
- Point 5 holds: 0 units for names only, lettered numbers and 4-digit numbers, with CR LF and with look-alikes.
- `2020 01 02 ` repeated to 99,990 is refused by the count on both sides for all four calls.

**Timing that held** (`$S/timing2.mts`; ms at about 25,000 / 50,000 / 100,000 characters).

| Letter | Base | Head |
| --- | --- | --- |
| `Acct76543210 ` repeated (each glued number under a placeholder) | 215 / 145 / 346 | 178 / 200 / 409 |
| `Acct76543210\r` repeated | 111 / 136 / 373 | 81 / 191 / 626 |
| `Fax X8852780545 ext ` repeated | 154 / 263 / 432 | 128 / 315 / 493 |
| `Zephy, , , , ` repeated | 83 / 133 / 240 | 55 / 128 / 277 |
| `Z` + commas | 31 / 97 / 278 | 61 / 71 / 231 |
| `Z,e,p,h,y,r,` repeated | 151 / 277 / 551 | 179 / 258 / 597 |
| `Zephy` + 100 marks, repeated | 39 / 110 / 198 | 49 / 105 / 325 |
| `ZZ12345 / . : 02 ` repeated, held `ZZ12345/01` | 226 / 225 / 410 | 244 / 227 / 495 |
| `ZZ12345` + 40 `#`, repeated | 210 / 116 / 199 | 84 / 129 / 293 |
| `7654 321 ` repeated (refused on both) | 218 / 217 / 549 | 109 / 313 / 477 |
| `7-6-5-4-3-2-1-` repeated | 193 / 428 / 1,334 | 183 / 403 / 1,294 |
| `1 ` repeated, number `11111111` | 70 / 189 / 338 | 126 / 146 / 417 |
| prose, 170 digits-only numbers in the call | 210 / 429 / 862 | 378 / 414 / 1,066 |
| prose, 20 member IDs of 8 pieces each | 179 / 163 / 539 | 240 / 434 / 554 |
| drafter's check, prose, 2 marked names and 170 numbers (4k / 25k / 100k) | 15 / 125 / 371 | 43 / 120 / 158 |

All linear. Point 29's stepped `lastIndex` over hidden glued numbers and A-4's `GAP.apart` are not a cost I could raise. 170 numbers is my choice: I found no limit on how many a call carries. Three narrative rows (a slash run, a CR run, `7654 321 `) did not finish before the run's cut and are not reported.

**Letters newly refused** (`$S/refuse.mts`, rows in `$S/refuse.jsonl`). 49 real-shaped lines, 25 numbers of 5 to 8 digits, each as member ID and as claim number: 2,450 letters.
- Base sends 2,450; head sends 2,388. Newly refused 62, **all a stored number glued to a letter**: 60 as written, 2 the date `2026-11-15Paid` for the number `20261115` (no date exception, stated).
- 0 refused for another reason, 0 sent with a different text, 0 the head sends that the base refused.
- By line: `97110GP` forms for 97110, 97140, 97530, 97112, 98941, 20560; `Ref#AB12345`, `Suite 12345B`, `PO Box 12345St.`, `Auth# 54321A`, `Batch B54321`, `EFT trace 729110B`, `Plan 30000PPO`, `Policy form 25000HDHP`, `group 55123A`, `55123USA`, `Reference No. X20261115`, `20261115T000000Z`, `ICN 20261115E12345`.
- Stated but worth a reader's eye: `Dx M54160` is refused for a patient numbered `54160` (the design says a diagnosis code without its point was not measured). `Check no. 0012345A` is refused for `12345` and `Ref: RA0012345` for `00123`: a digit on one side, a letter on the other, the rule asks one side.
- Drafter's check on the same 49 lines and 25 numbers (1,225): base refuses 15, head 50; the 35 new are all glued forms (32 as written, 3 across a joiner). Point 16 states them.
- The gate report: 975,489 letters, refused 462,984 on both sides, 2 differ, none newly refused. Read, not rerun.

**The moved oracle, run on the head:** `pnpm vitest run --project unit packages/packets/src/verifier-identifiers.test.ts packages/redact/src/narrative.test.ts --coverage=false`: 2 files, 124 tests passed. MOD-20's reworded matrix text matches what the packets test asserts (matcher or whole-word reading).

**Tests first failing for the right reason.** The head's six test files over a scratch worktree of the base (removed after): every file loaded; the only new import, `nameOrNumberMatches` in the packets test, is exported by the base.

| File | Tests | Failed on base | By assertion | By fast-check counterexample | Timed out |
| --- | ---: | ---: | ---: | ---: | ---: |
| `redact.leaks.test.ts` | 902 | 172 | 163 | 7 | 2 |
| `redact.property.test.ts` | 95 | 2 | 1 | 0 | 1 |
| `functions/denial-letter.test.ts` | 1,069 | 6 | 3 | 0 | 3 |
| `functions/narrative.test.ts` | 12 | 1 | 1 | 0 | 0 |
| `packages/redact/src/narrative.test.ts` | 17 | 6 | 6 | 0 | 0 |
| `packages/packets/src/verifier-identifiers.test.ts` | 107 | 1 | 1 | 0 | 0 |

- Of 189 tests named for MOD-25 in `redact.leaks.test.ts`, 168 fail on the base, none by a load error; the 21 that pass pin what is left or unchanged (floor edges under 5, residuals, "joins nothing over a letter").
- The 6 timeouts are in tests the base already had, run under the load above (5 s and 60 s limits); I did not rerun them quiet and did not map the 3 assertion failures of `denial-letter.test.ts` to test names.
- That run used the repo's `pnpm` under Node 22 (it warns the repo wants 24).

## Not done

- The full gate and the battery were not rerun. `units.mts` itself was not rerun (my script runs its two rows and the rest).
- No fix was tried in the product; the two regex notes are bare-pattern measurements.
- The head was not timed quiet; R2-2's 16.6 s may fall under 10 s on an idle machine (one pass alone took 8 s here), R2-1 does not depend on load.
