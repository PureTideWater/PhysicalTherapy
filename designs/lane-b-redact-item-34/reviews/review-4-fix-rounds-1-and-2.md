# Review 3 (delta): fix rounds 1 and 2 of the redaction module

Scope: `git diff 846968af 483ac960` (round 1) and `git diff 483ac960 17028cfa` (round 2), `packages/redact/src/redact.ts`
and the two test files. Path exercised: `redactLetterForScreen`, then `holdsIdentifier` on its text (the gate worker's
call; a throw counted as refused). Timings use the timed rows' call (`holdsIdentifier(text, p, c, checkWorkOf(r))`).
All values synthetic. Checkout not modified.

Scratch directory (all scripts and outputs):
`/tmp/claude-0/-home-user-PhysicalTherapy/f344a4ea-3385-5c28-91fb-5af3309c1929/scratchpad/review-3/`

Every command below is run as:
`cd /home/user/ops/designs/lane-b-redact-ssn-phone/gate && PATH=/opt/node24/bin:$PATH node --import ./ts-resolve.mjs <script>`

## Summary

| id | severity | one line |
|---|---|---|
| R3-1 | LEAK (narrow; head sends what 846968af hid) | Round 1's every-place scan (R1-1): for a name of one repeated letter (`ZZZZZZ`), `"ZZ/ZZZZ Z.Z.Z"` was fully replaced at 846968af and is sent as `"[PATIENT_NAME].Z"` at 483ac960 and 17028cfa: the last initial of a chain is shown. Reproduced only for a one-letter-repeated single-word name; 0 hits on 9 two-word name shapes and on 13 repeated-syllable names. |
| R3-2 | LESSER | Two of the ten fixed rows of the R1-1 regression test pass on 846968af too (they are not regressions): `'ZEPH+Z E P H Z E'` with rest `'ephze'` (846968af sends `"[PATIENT_NAME] P H Z E"`, which shows `phze`, so the row's `rest` misses the leak it is there for) and `'ZZ12: ZZ12/ZZ12/9'` (846968af already sends `"ZZ12: [MEMBER_ID]"`). |
| - | NONE | Q2: no unbounded or over-limit time found. 77 timed cases at 1k/10k/100k on 17028cfa, worst 801 ms at 100k (limit 3,000 ms). |
| - | NONE | R2-1, R2-2 and R1-2 change nothing they should not: old and new `CR_LF` match identically on 2,391,484 strings; old and new `runOfMarks` on 4,928,115; `gluedCoresOf` changes no outcome on 3,528 letters without "." or "/". |

Answers: Q1 yes (one narrow case, R3-1). Q2 yes, bounded in every case probed; R1-1 adds no quadratic path found. Q3 yes
for 8 of the 10 fixed rows; 2 rows are vacuous (R3-2).

## Q1. Does either round send anything 846968af hid? Yes: R3-1 only.

### R3-1 (round 1, R1-1's every-place scan)

Patient `{ names: ['ZZZZZZ'], datesOfBirth: ['1961-03-03'], memberIds: ['76543210'] }`, claim `SYNCLAIM0001`.

| letter (JS string) | 846968af | 483ac960 | 17028cfa |
|---|---|---|---|
| `"ZZ/ZZZZ Z.Z.Z"` | `"[PATIENT_NAME] [PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]"` | `"[PATIENT_NAME].Z"` | `"[PATIENT_NAME].Z"` |
| `"ZZ/ZZZZ\rZ.Z.Z"` | `"[PATIENT_NAME]\r[PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME]"` | `"[PATIENT_NAME].Z"` | `"[PATIENT_NAME].Z"` |
| `"ZZZZZZ Z.Z.Z"` (control, no mark in the name) | all replaced | same | same |

What is seen: the name written with a mark inside, then a chain of three initials. At 846968af the wider reading took
the name once and the three initials were taken as initials next to a name, each next to the one before. At 483ac960 the
reading asks at every place, so matches starting inside the name run on over the first two initials (the name is its own
letter repeated); the merged span ends at the second initial, and the third, which follows it after a period, is no
longer taken. I did not read `initialsNextToNames`, so the mechanism past "the merged span swallows the initials the
chain stood on" is inferred from the outputs, not from the code.

Reach: I could reproduce it only where the name is one letter repeated. It needs a match that starts strictly inside a
written name and ends on an initial; for a single-word name that means the name has its first letter as its whole
ending period, i.e. one letter repeated. Probed and found unchanged in what they show: 6,055 built letters over
`AZ ZEPHYRA`, `Z ZEPHYRA`, `J ZEPHYRA`, `JANE Q ZEPHYRA`, `ZA ZAZA`, `AL ALAL`, `ZAZ ZAZA`, `ZEPHYRA ZE`, `ZZ ZEPHYRA`
(name writing x separator x initials chain x prefix): 5,562 identical, 381 with the same letters and digits shown and
placeholders merged, 112 with different letters shown, of which 4 show more at head, all four the `ZZZZZZ` rows.
`ZZ ZZZ`, `AA AAAA`, `LL LLLL` rows show the same or less at head.

Command: `.../review-3/r3-1.mts` (three commits, seven rows); the wider probe is `.../review-3/min3.mts`.

### Differential fuzz (846968af against 483ac960 and 17028cfa)

Letters built from stored values (whole, lower case, cut at either end, letters apart over one or two marks, split by
"." "/" "./" or a mark run, glued to a letter before or after, a part alone), label words, and marks including `\r`,
`\r\n`, `\r\r\n`, `\n\r`, `\n\r\r`, `\r\r`, U+0085, an astral character, U+200B, U+02BC, brackets.

| run | letters | identical at head | head refuses, base sent | both sent, head shows same or less | base refused, head sends | both sent, head shows more |
|---|---|---|---|---|---|---|
| `fuzz.mts 3000 1` (names incl. ZEPHYRAZ, ZEPHZE, QUIXQU, ANANA, ZZZZZZ) | 3,000 | 2,949 | 17 | 33 | 0 | 1 |
| `fuzz2.mts 8000 2` (same names) | 8,000 | 7,842 | 63 | 95 | 0 | 0 |
| `fuzz2.mts 8000 7 rep` (LULU, MIMI MIMI, NANA NAN, COCO, ANA ANA, BOB BOBB, ABAB, ...) | 8,000 | 7,486 | 120 | 394 | 0 | 0 |

Total 19,000 letters: "846968af refused, head sends" 0; "846968af hid, head shows" 1 (the letter R3-1 was shrunk from:
name `ZZZZZZ`, `"//:ZZZZ!!!!ZZZZZZZZ!ZZ/ZZZZ\r\rZ.Z.Z.Z.Z.Z998877-ZZZZ"`). 483ac960 against 846968af gave the same single
hit and no new refusals in run 1 (the new refusals are all round 2's R1-2).

### The specific worries, each checked

- `CR_LF = /(?<!\r)\r+\n/g` against `/\r+\n/g`: every string over {CR, LF, x} up to length 13 (2,391,484 strings),
  matches compared by index and length: 0 differ. Covers `\r\r\n`, a CR run at the start, a CR run after a lone CR.
  The constant is a shared global regex, used only through `replace` and `matchAll` (lines 3877, 4015, 4056, 4079 of
  17028cfa), neither of which carries `lastIndex` between calls.
- `runOfMarks` old against new, as the gap in `A<run>B` with flags `giu`, for `also` in: none, `/`, space, `-`, `]`,
  `\`, `^`, an astral character, U+0002, U+0001, U+02BC, `/-`, CR LF, a letter, a digit; every string over a 7 to 9
  character alphabet up to length 6 (4,928,115 strings): 0 differ. (I wrote U+0001 for BARRIER without finding its
  declaration; the result does not depend on which control character it is.)
- `gluedCoresOf` on forms without "." or "/": 483ac960 against 17028cfa on 6,000 letters over digits-only member IDs
  and claim numbers with 29 other marks, labels and glued letters: of 3,528 letters holding no "." and no "/", 0
  differ; of 2,472 holding one, 603 differ and every one is a refusal at 17028cfa.
- `lastIndex` one code point past the start: a form's pattern holds at least two characters, so no zero-length match;
  the start of a match under the `u` flag is a code point boundary. Astral marks were in every fuzz run; no throw and
  no difference traced to them.

Command: `.../review-3/equiv.mts`; fuzz: `.../review-3/fuzz.mts 3000 1`, `.../review-3/fuzz2.mts 8000 2`,
`.../review-3/fuzz2.mts 8000 7 rep`.

## Q2. Is the time bounded for every stored separator and line-ending form? Yes, in everything probed.

One node process at a time, sizes 1,000 / 10,000 / 100,000 characters, redaction plus check, 40 s cap per process.
17028cfa: 77 cases, none killed, none threw, none over 1,000 ms. Output: `.../review-3/time-17028cfa.out`.

- Stored separator, member ID `ZZ12345<sep>01`, letter `Member ID: ZZ12345<sep x n> Group: 100`, for 36 separators:
  `/` space `-` `.` `*` `+` `(` `)` `[` `]` `\` `^` `$` `|` `?` `{` `}` tab LF CR U+00A0 U+2003 U+1F600 U+0301 `,` `:`
  `#` `_` U+02BC U+0085 U+200B U+0002 U+0003 `"` U+2028 U+00B7. Worst at 100k: 691 ms (U+1F600), 689 ms (U+02BC);
  `/` 204 ms, space 269 ms, CR 173 ms, LF 176 ms.
- Run followed by a near-match (`...<sep x n>0x`), 7 separators: worst 693 ms.
- Mixed: held `/-` with an alternating run 268 ms; held ` / ` 187 ms; two member IDs held `/` and `-` with an
  alternating run 186 ms; held CR LF with a CR LF run; a separator at two gaps; `-.` mixed after digits; a claim
  number held `/`: all under 400 ms.
- Line endings (15 forms): `\r\n` x n/2 181 ms; CR x n then LF 136 ms; LF then CR x n 129 ms; CR x n alone 125 ms;
  a name then CR x n; (CR x 50 + `x`) repeated; CR x n/2, `x`, CR x n/2; `\r\r\n` repeated; `\n\r` repeated;
  `\n\r\r` repeated; `\r ` repeated; CR x n then a glued number; `7654\r` repeated 519 ms (the worst); a number, CR x n,
  a letter; LF, CR x n, LF.
- Every-place scan (R1-1), 12 cases, 100k, 17028cfa against 846968af:

| case | 17028cfa | 846968af |
|---|---|---|
| name `ZZZZZZZZ`, `"Z "` x 50,000 | 495 ms (refused) | 858 ms (sent) |
| name `ZZZZZZZZ`, `"Z/"` x 50,000 | 581 ms (refused) | 594 ms (sent) |
| name `ZZZZZZZZ`, `Z` + 200 spaces, repeated | 135 ms | 148 ms |
| name of 30 Zs, `"Z, "` repeated | 396 ms | 421 ms |
| name `ZEPHYRAZ`, `"ZEPHYRA: Z E P H Y R A "` repeated | 801 ms | 847 ms |
| name `ANANANAN`, `"AN "` repeated | 233 ms | 347 ms |
| member ID `1/1/.../1` (20 ones), `"1/"` repeated | 1k 118 ms, 10k 78 ms, 100k 520 ms | no answer in 40 s at 1k (R2-1's defect) |
| same, `1` + 50 slashes, repeated | 176 ms | no answer in 40 s at 1k |
| same, `1` + 2,000 spaces, repeated | 92 ms | 198 ms |
| member ID `Z/Z/.../Z/7`, `"Z:"` repeated | 497 ms | 805 ms |
| member ID `11111111`, `"1 "` repeated | 327 ms | 309 ms |
| claim number `11111111`, `"1-"` repeated | 349 ms | 374 ms |

  No superlinear growth from 10k to 100k in any row. Two rows are refused at 100k at head where 846968af sent (the
  letter of 50,000 one-letter name pieces); a refusal, not a send, and I did not trace it (the many overlapping spans
  or the counted work).

Command: `.../review-3/time.sh 17028cfa` (all 77 cases); `.../review-3/time.sh 846968af 65` (the every-place cases).

## Q3. Is R1-1's regression test the regression? Yes for 8 of 10 fixed rows; 2 are vacuous (R3-2).

The ten `it.each` rows run on each commit, through the screen path and through `redactLetter`, with the test's own
`shown(...)` and `rest`:

| row | 846968af | 483ac960 and 17028cfa |
|---|---|---|
| `"ZEPHYRA: Z E P H Y R A Z"` | FAIL: `"[PATIENT_NAME] E P H Y R A Z"` | pass: `"[PATIENT_NAME]"` |
| `"Zephyra, z e p h y r a z"` | FAIL: `"[PATIENT_NAME] e p h y r a z"` | pass |
| `"ZEPHYRA/Z.E.P.H.Y.R.A.Z paid"` | FAIL: `"[PATIENT_NAME].E.P.H.Y.R.A.Z paid"` | pass: `"[PATIENT_NAME] paid"` |
| `"Ambrid, a m b r i d a"` | FAIL: `"[PATIENT_NAME] m b r i d a"` | pass |
| `"Orlend(o r l e n d o"` | FAIL: `"[PATIENT_NAME] r l e n d o"` | pass |
| `"ZEPH+Z E P H Z E"`, rest `ephze` | **pass**: `"[PATIENT_NAME] P H Z E"` | pass: `"[PATIENT_NAME]"` |
| `"7: 654 # 7,654,7"` | FAIL: `"[MEMBER_ID],654,7"` | pass: `"[MEMBER_ID]"` |
| `"Paid 7.654 $7,654 7 today"` | FAIL: `"Paid [MEMBER_ID],654 7 today"` | pass |
| `"2\r\n212 $2,212 2"` | FAIL: `"[MEMBER_ID],212 2"` | pass |
| `"ZZ12: ZZ12/ZZ12/9"`, rest `zz129` | **pass**: `"ZZ12: [MEMBER_ID]"` | pass, same text |

The eight failing rows fail for the stated reason: the rest of the real writing is in the sent text outside a
placeholder, and at 483ac960 it is under the placeholder. The sent text is the same through both entry points.

R3-2: the `ZEPH+Z E P H Z E` row is a real instance of the defect at 846968af (it sends `P H Z E`) but its `rest`
(`ephze`) is one letter too long to see it (`phze` would); the `ZZ12: ZZ12/ZZ12/9` row never leaked. Neither row
guards the fix.

Command: `.../review-3/q3.mts`.

## What I did not check

- The test suites were not run (as instructed); the fast-check property row of the R1-1 test and the timed rows in
  `denial-letter.test.ts` were read, not executed. The fixed rows were re-run by hand as above.
- `holdsNameOrNumber` (the drafter's check) and `redactLetter` beyond the ten Q3 rows.
- `initialsNextToNames` and the span merge were not read; R3-1's mechanism is inferred from outputs.
- Multi-name patients (aliases), more than one claim, names in non-Latin scripts, and names of one repeated letter
  other than the rows shown.
- Sizes above 100,000 characters; timings were taken once each on a shared machine, so the small figures are noisy.
- Whether the two 100k refusals in the every-place table are the work budget.
- R1-3 and R1-4 (accepted residuals) and anything outside the delta.
