# Queues item 40 (letter redaction: R1-3, R1-4, ruling (A)'s initial): status

## RESUME-BLOCK (W72, 2026-11-13: STAGE 2 IS BUILT AND MEASURED, GREEN AND PUSHED; NEXT IS STAGE 3)

- **Head:** `co-001/wip-redact-item-40` at 07670552 (two commits over stage 1's 3c856166, which is over the base
  17c234d2): `packages/redact/src/redact.ts` (+75, -2) and `packages/model-gateway/src/redact.leaks.test.ts`. No PR.
- **The rule, as built** (R1-3 with ruling 3 and the rulings of 09:55 UTC; the first reading is not changed by one
  character, and each rule only ADDS a refusal):
  1. Rule (a) (`digitsGluedToLetter`) asks for `[\p{L}\p{Nl}\p{No}]` on one side, not `\p{L}` alone (P1, two lines).
  2. Each of the three entries (`redactLetterForScreen`, `redactLetter` through `redactionSpans`, `redactionSpans`)
     reads the letter AS GIVEN once more with every `\p{Nl}`/`\p{No}` character written as U+2180
     (`refusedWithNumberCharactersAsOne`), and only refuses, with the mark the check refuses after what the reading of
     the letter as given wrote (`refusedByMarkAfter`); the spans are that reading's, unchanged. Refused where, on that
     writing: rule (a) finds a digits-only number glued to the character (whatever a placeholder took of it); a
     placeholder stands right against the character, or over one (fewer U+2180 sent than the letter holds) — this is
     what catches a nine- or ten-digit number a PATTERN takes (`Claim 496736367<U+00B2>`, sent `Claim [MEMBER_ID]2` on
     the base); or the check refuses what that reading wrote (a name, a date, a number that holds a letter).
  3. A letter with no such character costs one search; one whose every such character is U+2180 already is read ONCE
     (the entry's own reading is passed in as `given`) and only rule (a) is added. The further reading is charged in
     full on the letter's count, and `checkWorkOf` carries the sum, so one budget holds for the whole check.
- **Green:** the stage-2 group is a describe of its own, `MOD-25, Queues item 40, stage 2 (R1-3 with ruling 3) ...`,
  the "owed red" mark gone for it alone; the groups of stages 3 and 4 stay inside the OWED RED describe, untouched
  (56 tests, each still failing on its assertion). redact.leaks.test.ts: 1,247 passed, 56 failed (those 56 alone).
  eslint and tsc clean on both files.
- **Rows added before the change, each seen failing on its assertion on 3c856166** (84 failed, 6 passed on the base):
  17 of `EVERY_KIND` through all three entries (a name, a name with the character NFKC writes as a letter, a lettered
  number, a date of birth in three writings, a pattern's number, the nine- and ten-digit numbers, the rows the first
  reading already replaces); the 12 ROWS through `redactionSpans`; a property over 11 written values x 1,154
  characters x 2 sides x 5 frames x 3 entries; the work row (`work(noted) === work(plain) + work(asOne)`); 5 rows set
  apart, sent as before.
- **Measurements** (`designs/lane-b-redact-item-40/stage-2/`: `measure-stage-2.sh`, `every.mts`,
  `summarize-stage-2.mjs`, `after-stage-2.sh`; counts in `stage-2/measure/`). Trees: base 17c234d2 (redact.ts
  3b34d2a284c9) against the head's file as committed (28cb0f16f860, `measure/trees.sha256`).
  - **Item 40's generated set** (seed 40, 51,833 letters, `generated-set-40.stage-2.counts.md`): **failures 0 in every
    family this stage builds; PHI classes none; errors 0/0; spanMismatch 0.** Refused 2,366 on the base, 7,020 on the
    head. R1-3 families, clear / hidden / refused: `r13.stable` (NFKC keeps, 3,812) base 3,780 / 0 / 32, head 0 / 0 /
    3,812; `r13.nfkc` (804) base 345 / 263 / 196, head 0 / 0 / 804; `r13.control.name` and `r13.control.lettered`
    (1,154 each) head 0 / 0 / 1,154 (newly refused 96 and 74: W71's 49 and 27 still clear on the base, plus the rows
    it sent hidden). `r13.apart` (60) and `r13.left` (30, the recorded residual) unchanged. The families of stages 3
    and 4 (`r14.*`, `A.*`) and the `probe.*` rows are untouched, each count the same on both trees.
  - **Every newly refused REAL-SHAPED row, by form (96, each named):** `real.r3.footnote-after-member-id` 16,
    `real.r3.footnote-after-claim-number` 16, `real.r3.footnote-after-number-at-line-end` 16,
    `real.r3.circled-list-number-before` 16, `real.r3.parenthesized-list-number-before` 16,
    `real.r3.list-number-with-full-stop-before` 16. Of them the base sent 42 in clear and 54 hidden (the named cost of
    ruling 3). Refused 0 of: set apart (3 forms, 48), after a period (16), superscripts with no number beside (16), no
    identifier (16), and every `real.c1`, `real.nel`, `real.nul` row (320) — those are stage 3's.
  - **Item 34's generated set** (14,356): **differ 0**, failures 0, refused 5,789 on both, notes 6 as before.
  - **The full uncached gate, 4 workers** (`gate-base-head.report.md`): 975,489 letters, **same 975,489, differ 0**,
    refused **463,002 on both** (as #161 left it), errors 0/0, spanMismatch 0; **PHI none, UNPLACED none, KEEP none,
    reverse PHI and reverse KEEP none. Real-shaped newly refused 0** (no letter of the gate holds such a character).
  - **The two budget rows unchanged:** 403,548,210 and 414,023,090, both sent, on base and head (`units-*.out`).
  - **Fuzzed 60,000** (item 34's `w58/fuzz.mts`, seeds 301 to 303): **base-refused, head-sent 0** in all three
    (2,198 / 2,238 / 2,274 refused, identical on both trees); base-sent, head-refused 0; both sent differently 0.
  - **Every number character beside every KIND of identifier** (`every.mts`: 1,154 characters x 2 sides x 5 frames x
    14 kinds, through `redactLetterForScreen` and through `redactLetter`, each with its check):
    base clear / hidden / refused 34,549 / 38,466 / 88,545 per entry; **head 11,285 / 0 / 150,275**. Every one of the
    12 stored kinds (two digits-only numbers, the nine- and ten-digit ones a pattern takes, two lettered numbers,
    three writings of the name, three of the date of birth) and a Social Security number by pattern: **11,540 of
    11,540 refused, both entries.** The 11,285 still clear are the one NOT-STORED kind named below.
  - **Time:** the reader `timing.mts` (20,000 letters of shard 0, one thread, two runs each): base 1.2301 and 1.2965
    ms per letter, head 1.3047 and 1.3176 (+1.6% to +6.1%). The gate's own timing: max A 1,326 ms, B 1,167 ms. The
    **100-letter property** (`denial-letter.test.ts`, three runs each, alternating on a quiet machine,
    `property-100-letters.out`): base 4,463 / 3,920 / 3,974 ms, **head 3,764 / 3,625 / 3,790 ms — inside the base's
    range, and below it.**
  - **Unit suites:** redact 54 passed; packets 1,825 passed; synth 192 passed; model-gateway 5,746 passed with the 56
    owed-red tests failing and `gateway.db.test.ts` and `patient-records.db.test.ts` not running for want of
    DATABASE_URL (`pnpm test:db`'s, not this session's: they fail at import on the base too).
- **Named costs of this stage (nothing else changed):**
  1. The 96 real-shaped rows above, 42 of them sent in clear by the base. Why refused where the first reading already
     hides the number: the orchestrator's ruling of 09:30 UTC, one blunt rule with no case for what another reading
     happened to replace.
  2. **Five rows pinned SENT in the reviews' describe (docs/adr/0054, the withheld match, L-1)** held their look-alike
     digit as U+A6EF, which is `\p{No}`, and a pattern's number stands right after it
     (`ID ZZ76543<U+A6EF>1\n01-02-2020`): the letter is now refused. The rows keep their mechanism rewritten with
     **U+A75A**, a LETTER that folds to 2 (the same five outcomes, verified on the base and the head), and the three
     refused forms are pinned in this stage's describe as the cost. `ID ZZ76543<U+A6EF>1\nPaid 01/02/2020`, where
     nothing a reading takes stands after the character, is still sent as before.
  3. **Still sent in clear, and NOT this item's: a phone number by pattern that is not stored** (11,285 of 11,540
     rows; `Call 555-0123<U+00B9>` is sent `Call 555-01231`). The first reading takes no pattern number there at all,
     so there is no identifier for the rule to find beside the character; a STORED number of the same digits is
     refused, and a Social Security number by pattern is refused (its reading takes it). Named here, not fixed: the
     fix would be a change to the first reading, which this item's construction forbids.
- **Unexplained differences: none.** Every difference between the trees in every gate is named above.
- **Next stage, exactly: stage 3, R1-4** (an unseen character inside a stored number), by one more reading of the
  WHOLE check, charged in full, with rows written first and seen failing for the unseen character inside a date of
  birth, a Social Security number and a phone number (W71 measured those clear on the base: 294 of 294, 194 of 196,
  194 of 196); the drafter's check takes R1-3 and R1-4 there. The group `stage 3, R1-4` (50 tests) is owed red inside
  the OWED RED describe, with `stage 4, ruling (A)` (6). Stage 2's entry point for it:
  `refusedWithNumberCharactersAsOne` is the shape a further reading takes, and `redactLetterForScreenAsGiven` is where
  the reading of the letter as given now ends.
- **Questions for a ruling (one line each, with the recommendation):**
  1. The five pinned rows of the withheld match now read with U+A75A instead of U+A6EF, keeping their mechanism, and
     the U+A6EF forms are pinned refused: recommend accept (the mechanism is the look-alike digit, not which one).
  2. A phone number by pattern that is NOT stored is still sent with such a character beside it (11,285 rows):
     recommend leave to the item that may widen the first reading; refusing it needs the first reading changed.
  3. Stage 3 can reuse stage 2's further-reading shape (one more reading of the whole entry, charged in full) rather
     than P2's reading inside `holdsIdentifier`: recommend the former, one construction for both.

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
