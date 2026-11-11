# Review N: three lines in `redactLetterForScreen` (247a53e3 -> c9dddaa7)

The reviewer's report as its last message (2026-11-11; 12 tool calls), saved here by W13 and shortened only in its tables.
Look-alike characters are written `<U+XXXX>`. Scripts are beside this file (synthetic twins only); W13's run of each
finding on four trees is `../../w13/n-verify.mts` and `../../w13/out/n-verify.out`.

(A) and (B) hold in everything run, and no exact own compact form is newly offered. (D) is broken in two forms, both MAJOR
by the brief's rubric. Nothing BLOCKING.

Patient in every case: names `['JANE Q ZEPHYRA']`, DOB `['1980-03-14']`, claims `[['SYNCLAIM0001']]` unless stated. All four
trees (base ef3e8d20, ac412151, 247a53e3, c9dddaa7) send the same text and none refuses, in every letter below.

## N-1 (MAJOR, D joined form): a long own identifier inside the hidden number is newly offered joined to its neighbours, and the base does not offer it

- `"ID 77 202-555-0123 88"`, member IDs `['77202','5550123']`: sent `"ID [MEMBER_ID] 88"`; new on head only: `555012388`, `012388`.
- `"ID ZZ 900-12-3456 88"`, member IDs `['ZZ900','123456']`: sent `"ID [MEMBER_ID] 88"`; new: `12345688`, `345688`.
- `"Tel 202-555-0123 88"`, member IDs `['012388','202555']`: sent `"Tel [MEMBER_ID]"`; new: `TEL202555`, `TEL202`.

Base, ac412151 and 247a53e3 offer none of the new candidates (for the first letter the base offers only `2025550123
202555012388 772025550123 77202555012388`). The same with `5550123` as a claim number. Mechanism: an own match written
plainly lies partly over one end of the number (`77 202`), so the number merges under `[MEMBER_ID]` on every tree, base
included. Before, the second text replaced the inner own match (`555-0123`); the head leaves it as written because it is
strictly inside the phone match, so `identifierCandidates` joins it to the next tokens or to the label before it. `own.has`
removes only the exact `5550123`. Where the outer own run is a look-alike (`ZZ1980O314\n555-0123 77`) the base offers
`555012377` too (not a finding). Calibration: all four trees already offer the same joined form when the number is sent as
`[PHONE]` (`"Member ID: ZZ1980O314\n202-555-0123 77"` offers `555012377` everywhere); the delta extends that to the hidden
case. Rate: `n-family.mts`, 1,064 of 1,216 sent letters (plain own over the number's start, long own inside; the other 152
have nothing after the number), 0 of 384 where the outer own is a look-alike; `n-fuzz.mts` seed 11, 14 such candidates in
7,540 letters (2 in refused letters), seed 23, 0 in 4,843. Reproduce: `n-fuzz.mts 0 1 probe`; `n-family.mts`.

## N-2 (MAJOR, D whole identifier in a look-alike writing): an own identifier written with a non-ASCII digit, which the head reads as the own, is newly offered whole

- `"ID 77 202-555-<U+0660>123"`, members `['77202','5550123']`: sent `"ID [MEMBER_ID]"`; new on head only: `555<U+0660>123`.
- `"ID ZZ 900-12-345<U+0666>"`, members `['ZZ900','123456']`: sent `"ID [MEMBER_ID]"`; new: `12345<U+0666>`.
- `"ID 77 202-555-<U+0966>123"`, members `['77202','5550123']`: sent `"ID [MEMBER_ID]"`; new: `555<U+0966>123`.
- `"Fax 7654<U+0663>210<U+200B>1-202-555-0123 4455"`, member `['76543210']`, claims `[['SYNCLAIM0001','01234455']]`: sent
  `"Fax [CLAIM_1]"`; new: `7654<U+0663>210` and four runs that begin with it.

Base, ac412151 and 247a53e3 do not offer these. Mechanism: the patterns read `\p{Nd}` digits and the head reads the same run
as the own identifier; it is strictly inside the pattern's match, so it is left as written, and `own.has` holds only the
ASCII compact form. Not the exact compact form, so not rated BLOCKING. Calibration: all four trees already offer
`555<U+0660>123` when the number is sent as `[PHONE]` (`"Member ID: ZZ1980O314\n202-555-<U+0660>123"`, same IDs). Rate:
`n-family.mts`, 2,432 of 2,432 sent letters of its family, 0 of 696 where the base does not also offer it when the outer own
is a look-alike; `n-fuzz.mts` seed 11, 2 of 7,540 letters, seed 23, 0 of 4,843. Reproduce: `n-probe2.mts`; `n-family.mts`.

## Minor
- A short own identifier inside the hidden number is newly offered joined to what follows, where the base offers nothing:
  `"ID ZZ77 202-555-0123 88"`, member `['ZZ77202']`, claims `[['SYNCLAIM0001'],['0123']]`: head adds `012388`, `5550123`,
  `555012388`. Fuzz: 13 candidates in 7,540 letters and 10 in 4,843.
- (E) time: the quadratic term is measurable and under the threshold. 200,012 bytes of `"Member ID:
  ZZ1980O314\n555-0123\n"` with claim `0123` (6,061 numbers, 12,122 own matches): 548 ms before, 675 ms head, ratio 1.23;
  400,024 bytes: 967 and 1,481 ms, 1.53; a plain-line letter 1.22 at 200 KB and 1.09 at 400 KB; 5 to 50 KB 0.81 to 1.35.
  No exception (`n-time.mts`, minimum of 4 runs, alternating).
- The four new rows assert only that `5550123` is offered; none puts a long own identifier, or one in a non-ASCII digit
  writing, inside the hidden number.

## Ran, nothing found
- (A) by reading: the only non-comment change is the three `ownText` lines after `screenText`; `found`, `spans`, `sent`,
  `redactionSpans`, `redactLetter` and `holdsIdentifier` are untouched; `inNumber` is equivalent to `merge`'s `reach` rule on
  the same `found`.
- (A) by run: `n-fuzz.mts`, seeds 11 and 23, 12,383 letters (an own writing, look-alike, plain or spaced; one of 19 number
  writings before, after or between; 0 to 3 extra own identifiers cut from the letter's own tokens, sometimes a date of
  birth cut from the number): sent text, refusal, `redactionSpans` and raw `holdsIdentifier` differ on 0 letters; no throw.
- (B): the same 12,383 letters and the 7,200 of `n-family.mts`: 0 candidates lost against 247a53e3, 0 against ac412151.
- (D) exact: 0 candidates equal to an own compact form newly offered.
- (C): 0 planted numbers that the base offers and the head misses where head and base send the same text; 22 where the sent
  text differs, the 15 printed all with an own identifier in a look-alike writing the base does not read, head equal to
  before on them (the excluded class), among them `"Claim 202-555-0123|7654E210/88"`, members `['7654321','76543210']`,
  claims `[['SYNCLAIM0001','555','012376543210']]`: the base offers `5550123`, the head does not.
- Probes on four trees (`n-probe.mts`, 29 letters), head equal to before or restoring what the base offers: own equal to
  the whole number (nothing offered on any tree); own partly over the number's end; the number before the look-alike run
  (`202555` restored); SSN and phone overlapping with `3456` inside (restored); the date of birth inside the number (no
  change); three nested (only N-1's joined form, which the base offers there).
- The previous reviewer's family (`family2.mts 8 0` on this head): 4,787 letters, 0 in every class.

## Did not get to
`m-verify-author.mts` and `fuzz.mts` as they stand; a name part inside a number; deeper nesting; an own identifier inside
one pattern match and partly inside a second (only through two writings); letters above 400 KB and a prose letter's time.
