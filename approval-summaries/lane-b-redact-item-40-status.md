# Queues item 40 (letter redaction: R1-3, R1-4, ruling (A)'s initial): status

## RESUME-BLOCK (W71, 2026-11-13: STAGE 1 IS DONE: THE TESTS ARE OWED RED ON THE WIP REF, THE GENERATED SET IS RUN; NO READER CHANGE; NEXT IS STAGE 2)

- **Head:** `co-001/wip-redact-item-40` at 3c856166 (one commit over the base 17c234d2; only
  `packages/model-gateway/src/redact.leaks.test.ts`; nothing under `packages/redact/src`; no PR).
- **Owed red, one describe:** `OWED RED, Queues item 40 (...)`, 105 tests, each seen failing on its assertion on
  17c234d2 (0 load errors): `stage 2, R1-3 with ruling 3` 49 (12 letters x member ID and claim number, through the
  screen entry and through redactLetter, and 1 property); `stage 3, R1-4` 50 (8 characters x 6 forms, 1 property, the
  row at the budget with one U+0085); `stage 4, ruling (A)` 6 (5 rows, 1 property). Beside it
  `MOD-25, Queues item 40: beside its three forms ...` 27 tests green (the floor's residual, a number character set
  apart, an unseen character before or after the number, `Zephyra. I am`, the budget row sent). The file's other
  1,125 tests pass; eslint and tsc clean. The five rows pinned SENT (:2760) and the two of (A) are rewritten there.
  Only that file was run (the brief's second file was not changed or run).
- **The generated set:** `scripts/generated-set-40.mts` (seed 40: 51,833 letters, 91 forms, 1,425 patients), run by
  `scripts/lay40.sh <root>` then `scripts/run40.sh <root>` through the gate's worker (`generated-run-40.mts`: item 34's
  with the newly refused rows written). Trees: base; proto-i (P1, P2, P3 and **P4, ruling 3**, `scripts/proto-r3.mjs`);
  proto-ii (the same with R1-4's fallback). Counts: `measure/generated-set-40.counts.md`. **Failures 0, PHI classes
  none, errors 0 on both.** Clear / hidden / refused:
  - R1-3, NFKC keeps (3,812): base 3,780 / 0 / 32; both prototypes 0 / 0 / 3,812.
  - Ruling 3, NFKC rewrites (804): base 345 / 263 / 196; both 0 / 0 / 804.
  - R1-4 inside (768, and 16 with a lone surrogate): base all clear; both all refused. Before or after (384 and 8):
    base hidden; proto-i hidden; proto-ii refused.
  - (A) (42,240 and 8 other names): base 2,736 and 5 clear; both 0 clear, 0 refused.
  - Whole set refused: base 2,366; proto-i 8,396; proto-ii 9,028.
- **R1-4: (i) is CONFIRMED.** No row is clear under (i). On the 320 real-shaped rows that hold an unseen character
  (U+0085 line endings 96, U+0091 to U+0097 144, NUL 80): **(i) newly refuses 80, (ii) 320.** 32 of them the base
  sends in CLEAR (`real.nul.in-number`, `real.nul.utf16-read-as-bytes`, 16 each): both refuse them, rightly. Of the
  other 288, which the base sends hidden: **(i) refuses 48**, named `real.c1.code-range` 16 and `real.c1.no-identifier`
  16 (`97110<U+0096>97112` joined reads as one number of ten digits) and `real.nel.no-identifier` 16 (a line of digits
  after a line of digits over U+0085); **(ii) refuses all 288.** Rows: `measure/generated-set-40.newly-refused-real.*`.
- **Ruling 3's measured cost** (P4: the screen entry reads rule (a) once more on the letter as given, each Nl or No as
  U+2180, and only adds the refusing mark, so **the first reading is unchanged**): of 192 real-shaped rows, **96 newly
  refused**, 16 each: `r3.footnote-after-member-id` (base 9 clear, 7 hidden), `r3.footnote-after-claim-number` (16
  clear), `r3.footnote-after-number-at-line-end` (9, 7), `r3.circled-list-number-before` (8, 8),
  `r3.parenthesized-list-number-before` (0, 16), `r3.list-number-with-full-stop-before` (0, 16): 42 the base sent in
  clear, 54 it sent hidden. Unchanged (96): set apart, after a period, no stored number beside. In the family 608
  newly refused (345 clear, 263 hidden on the base). P4 is in the screen entry only: redactLetter, redactionSpans and
  the drafter's check are not prototyped (the check is given NFKC text and cannot see the character).
- **What the note did not establish, now measured on the base** (probe rows in the set, 96 characters and 2 lone
  surrogates): an unseen character inside a **name: 0 clear of 196** (A-4 joins it); inside a **date of birth: 294
  clear of 294**; a **Social Security number: 194 of 196**; a **phone number: 194 of 196**. Both prototypes refuse
  every one (ruling 2's whole check). **Lone surrogates** behave as the class does (16 of 16 clear inside a number on
  the base, refused on both). **The 8 of 953** the base refuses (`measure/eight-base-17c234d2.out`): U+3007, U+102F5,
  U+10320, U+10322, U+118EC, U+118EF, U+118F2, U+1E8C7: the look-alike table folds each to a Latin letter (O, Z, I,
  X, X, W, C, I), so rule (a) reads a letter glued to the number on that fold.
- **Not done in stage 1:** no test rows for an unseen character inside a date of birth, Social Security or phone
  number (stage 3 writes them first, failing); the properties state the outcome (never sent in clear) and record no
  table of the base's verdicts; the prototype does not charge the further reading in full (the budget row's test is
  owed on the base's answer only: the base sends it); the gate, item 34's set and the fuzz were not re-run on proto-i.
- **Next stage, exactly: stage 2, R1-3 with ruling 3, in `digitsGluedToLetter`** (`[\p{L}\p{Nl}\p{No}]` on each side:
  P1) **and the reading of the letter as given in the redaction's entries** (P4's shape, in redactLetterForScreen,
  redactLetter and redactionSpans), on `co-001/redact-item-40` cut from the WIP ref; it turns the 49 green; then item
  40's set (failures 0), item 34's set, the full gate, the two budget rows, 60,000 fuzzed.
- **Questions for a ruling (one line each, with the recommendation):**
  1. Ruling 3 where the first reading already replaces the whole number (`<U+2474>n` is sent `(1)[MEMBER_ID]`): refuse
     as ruled, or leave hidden (54 of the 96 real-shaped, 263 of 608)? Recommend refuse, one rule: 0 letters of the
     gate hold such a character.
  2. A digit NFKC makes beside a NAME or a number that holds a letter is still sent on both prototypes (49 of 1,154
     and 27 of 1,154 clear, the same on the base; `Zephyra<U+2460>` is sent `Zephyra1`): ruling 3 says digits-only.
     Recommend the same rule for every identifier, measured in stage 2.
  3. The tests ask ruling 3 through redactLetter as well as the screen entry. Recommend yes: the check cannot see it.
  4. (i)'s 48 real-shaped rows (a code range over a C1 dash, digit lines over U+0085) are refused: recommend accept;
     (ii) refuses 288.

## Earlier RESUME-BLOCK (W70, 2026-11-13 about 09:35 UTC: THE MEASURED DESIGN NOTE IS WRITTEN; NOTHING IS BUILT; SIX QUESTIONS WAIT FOR A RULING)

- **The note:** `designs/lane-b-redact-item-40/design-note.md`. Scripts in `designs/lane-b-redact-item-40/scripts/`
  (`lay.sh <root>` then `measure.sh <root>`: about 22 minutes, everything below), counts in `measure/`. Base 17c234d2.
  No change under `packages/`, `apps/` or `fixtures/`; no branch, no PR.
- **The recommendation, in five lines.**
  1. R1-3: rule (a) asks for a letter or a number character that is no decimal digit beside the number
     (`[\p{L}\p{Nl}\p{No}]`): refuse. Base 3,780 rows clear of 953 characters in four forms; prototype 0.
  2. R1-4: where the text holds an unseen character (any `\p{C}` not default-ignorable, not white space, not the
     checks' marks: wider than the review's 62), the check reads it once more with each run as U+200B and refuses on
     either reading. Base 768 clear of 768 inside the number; prototype 0. The safer rule, refuse every such letter,
     is the fallback.
  3. (A): in the wider reading the period after a name that ends in a letter standing alone is that initial's:
     replace. Base 2,736 of 42,240 rows show a letter, and `Zephyr A.J.Q.` for JANE Q ZEPHYRA sends two initials;
     prototype 0.
  4. Measured for the three together against the base: the full uncached gate differ 0 of 975,489 (refused 463,002
     on both); item 34's generated set differ 0; base-refused, head-sent 0 of 60,000 fuzzed (438 newly refused); the
     rows 403,548,210 and 414,023,090 unchanged; time +1.5% to +3.6% on 20,000 letters, near the runs' spread.
  5. The gate holds almost none of these forms (94 letters, all refused already): what real letters with U+0085 line
     endings or C1 quotes cost is NOT measured, and stage 1's generated set is that measurement.
- **Open questions (each with the recommendation, in the note):** (1) R1-4 by one more reading, or refuse every letter
  that holds an unseen character: the reading; (2) the further reading for every identifier: yes; (3) a decimal digit
  NFKC makes beside the number (`①76543210`, 304 rows): stays the recorded longer-number residual; (4) (A) replace,
  refuse or leave: replace; (5) the further reading charged in full, budget not raised: yes; (6) the drafter's check
  takes R1-3 and R1-4, the verifier stays: yes.
- **Not established:** the note's section 4 (the further reading's charge in units; the redaction's own gates were
  not given the reading; lone surrogates; the product's suites were not run on the prototype).
- **Next stage (after the rulings):** stage 1, tests and item 40's generated set, no reader change, on
  `co-001/redact-item-40`: the exact rows are in the note's section 3.
