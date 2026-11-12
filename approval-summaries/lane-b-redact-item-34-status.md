# Queues item 34 (MOD-25): build status

Design of record: `designs/lane-b-redact-item-34/design.md` (ops 163894a9). Rulings of 2026-11-12 12:10 UTC: floor 5,
one constant; (d) the verifier keeps its reading; A-4's costs accepted; a digit beside the number stays recorded.
WIP ref: `co-001/wip-redact-item-34`, cut from claude/build-platform a97d73e4. No PR is open.

## RESUME-BLOCK (W54, 2026-11-12, after the fix of rule (a); THE ITEM IS WHOLE BUT FOR THE TWO REVIEWS AND THE PR)

- **WIP head: 846968af** on `co-001/wip-redact-item-34`, pushed through the hook; the tree is clean. No PR is open.
  W54's commits on 20af8fb3: 04e2932b (the fix and its tests), 229da4cc (a whole number under one first-reading
  placeholder is hidden), c902443e (records), 6e4849f3 (the mark only where a placeholder is written), 846968af
  (records). Product code as of 6e4849f3; every measure below is of that code.
- **The fix, built as ruled (2026-11-12 20:15 UTC), both cases.** Rule (a) is read on the letter as written, before
  any placeholder: `gluedBeforeRedaction` in `packages/redact/src/redact.ts`, called in `screenAsBothRead` and in
  `redactionSpans` right after the wider reading, with `digitsGluedToLetter` given a `hidden` test and asked for every
  place, in each writing of the line endings (`lineEndingsAsOne` maps a place back to the letter). Where a digits-only
  number of 5 or more stands whole and glued to a letter and is not wholly under ONE span of the first reading, the
  entry returns the first reading's text with the mark the check refuses (`refusedByMarkAfter`, the renamed
  `unreadPastTheBudgetAfter`). Asked only where some placeholder is written: with none the check reads the same text.
  The check (`holdsIdentifier`) is not changed.
- **Files changed by W54:** `packages/redact/src/redact.ts`; `packages/model-gateway/src/redact.leaks.test.ts` (the
  MOD-25 block, under "read on the raw letter", and one property beside it); `docs/adr/0054-...md` (the amendment's
  paragraph "Rule (a) is read on the letter as written", which was "Open: W51's finding"); `docs/product/test-matrix.md`
  and `packages/synth/src/cases/matrix.ts` (MOD-25's last sentence); `fixtures/synthetic/MOD-25/expected.json`.
- **Tests first:** 30 new tests failed on 20af8fb3 (28 on an assertion of a row, the property, the CR LF row); the row
  of what must not turn passed. Case 1 rows: each example, its mirror, the separators space, period, underscore and
  slash, a joiner and a run of marks at the stored separator, a line ending after the letter, a label word before,
  the long piece held as a number of its own. Case 2 rows: 10, 11 and 12 digits, a joiner, a space, a stored
  separator. Not turned and pinned: the number not glued (replaced, sent), the whole number under one placeholder
  (`Acct21318-5`, `Fax X8852780545 ext`, `Fax X900123456 ext` for `ZZ 900123456`), a glued piece under five, a number
  under the floor in all, a digit beside.
- **Measured on 6e4849f3 against a97d73e4** (`designs/lane-b-redact-item-34/measure/`):
  - The two rows nearest the budget (`units-fix-6e4849f3.out`): 403,548,210 and 414,023,090, both sent, unchanged;
    the budget and every weight untouched. (A first draft asked the look-alike question again for each writing of the
    line endings and moved the second row to 418,370,840, still sent; the answer is now taken once. Never pushed.)
  - The generated set (`generated-set-6e4849f3.summary.json`; notes identical to stage 6's): failures 0 of 13,780
    (238 before), PHI classes none, refused A 1,680, B 5,213 (4,975 before: the 238 and no other: a.joiner 57, a.crlf
    16, a.stored-separator 165). Every other form's counts as W51 recorded them. Against the base the 108 letters of
    case 2 are class KEEP.refused.letter-with-identifiers (the base sends them with 1 to 3 digits in clear).
  - The gate, full, `--no-cache` (`gate-fix-6e4849f3.report.md`): 975,489 letters, PHI none, unplaced none, refused
    462,984 and 462,984, differ 2 (KEEP.changed.text 1, i 187859; the other in no class, as stage 6: W54 did not run
    the two trees directly on i 187754 again), 0 letters newly refused, timing max A 944 ms, B 957 ms.
  - Case 2 is in the fix: it newly refuses no letter of the gate and moves no budget row.
- **Green on 6e4849f3** (846968af differs by the ADR only; `pnpm verify-content` passes on it): `pnpm typecheck` 24
  projects; `pnpm lint` 1,943 files, 0 errors, 0 warnings; `pnpm lint:logs` 1,202 files; `packages/redact` 2 files, 54
  tests; `packages/packets` 46 files, 1,825; `packages/synth` 14 files, 192; `packages/model-gateway` 32 files, 5,399
  tests passed, 34 skipped. **Not run here:** `gateway.db.test.ts` and `patient-records.db.test.ts` (no DATABASE_URL
  in this container), `pnpm test:db`, golden, e2e, and the battery (not run again on the fix).
- **What the last session does:** two adversarial reviews on PHI and redaction, each finding verified before it is
  recorded, at most two fix rounds; the base merged; the full local suite once; the PR from
  `.github/pull_request_template.md`; the merge on green required checks.
- **Every named point for the two reviews, in one list:**
  1. (W39, stage 1) A-5 keeps what the records write in the joining class beside the run of marks: a superset of MOD-23's form.
  2. (W39) A piece is split at an APOSTROPHE_LETTER too (U+02BC, U+02B9, U+02CA).
  3. (W39) Two numbers that share a piece: the first in the call's order gives the placeholder (claims, then member IDs).
  4. (W39) A cost the note's A-5 cell does not state: a claim held `1234/56` replaces `$1234.56` too (`isAmount` asks for cents after the number). A placeholder, never a leak.
  5. (W39, stage 2) The prototype's rule (a) did not cost 0 for a call with no digits-only number (`alikeReads` charges `WORK.fold` per character outside ASCII); the build returns before any reading where no stored number can hold five digits and takes the wider reading's look-alike answer (`alikeOfWider`): 0 units.
  6. (W39) A digits-only piece of a number that holds letters (`7654321` of `ZZ 7654321`) is read by (a) too: `XQ7654321` is refused. The safer side; the co-founder may rule otherwise.
  7. (W39) The crafted letter (dates with spaces 100k, `SYN555001` and ten 7-digit claim numbers): 418.78M sent on the base, 420.78M refused on the head; with nine 419.73M sent.
  8. (W48, stage 3) (b) splits at every non-letter, non-digit character that is no part joiner (a combining mark NFKC leaves too); the wider words' initials are taken next to a name; held `ZEPHYRA+JANE+Q` written `Zephyra, Jane` gives two placeholders.
  9. (W48) `GAP.apart` is a getter returning `runOfMarks()` (declaration order).
  10. (W48) Accepted costs pinned: `h/o`, `N/A`, `L/E`, `w/o` for a patient HO, NA, LE, WO; `New, man.`; held `ZEPHYRA*MEDICARE`; `a4.sh` on the build: one new placeholder (IDA: `id)'); // a`).
  11. (W48) Added work for a name held with a mark: gap and initials 62,008 characters 351.6M sent, 82,008 420.0M REFUSED, 100,008 refused by the redaction's own count (the base sent each with the name in clear).
  12. (W48, stage 4) A-6: a letter with LF CR is read a third time; U+33FE 30,002 with LF CR 139.9M to 214.4M sent; 57,972 with `\r\n\n\r` REFUSED by count; 0 of the gate's letters hold LF CR.
  13. (W48) The stage 3 gate: differ 2, both A-4's cost of a placeholder (i 187859 `K.<emoji> RE`; i 187754 `member jun;e`, named above by W49); no PHI class, none newly refused.
  14. (W49, stage 5) The packets differential test changed its oracle from the check to the matcher (see Tests above): is anything the verifier owed the check's reading lost? The verifier's source is not touched.
  15. (W49) (d) reads a marked name's wider words only where the wider reading has MORE words than the first (a wider split only adds words); the words are rebuilt from folded, compacted parts joined by `-`.
  16. (W49) Costs of (d), each a narrative call refused before it is made, never a leak (probed on synthetic rows): digits glued to a letter have no exception for a date or a code, so for a case number `20260305` facts holding `2026-03-05T00:00:00Z` are refused, and for a number `97110` facts holding `97110GP` (`2026-03-05 to` and `97110 GP` were and are as before; the synthetic facts hold neither glued form and still pass with `20260305` and `30000` in the case); a number held `1234/56` refuses `$1234.56` and `1234.56` (point 4, now in the check); `12345` alone is refused for a number held `ZZ 12345` (a piece); a name held `IN+A` or `VAN+TREE` refuses "in" and "van" (every part of two letters counts in this check, as on the base for `HYE-IN`); `ZEPHYRA*MEDICARE` refuses "Medicare".
  17. (W49) `$300.00USD` for a number `30000` is NOT read by the glued rule (the period stands between), in the letter check too: the base's reading, unchanged; say if it should be.
  18. (W49) The check runs with no work counter (the note: "No counter runs there"): a narrative's facts are code's own and short, but nothing bounds them here.
  19. (W51, stage 6) Rule (a) is asked only on the redacted text: any replacement of a part of a glued number hides it from the check (the fix above). After the fix, is there another reading that replaces part of a stored number before the check (a date of birth's digits, a look-alike match)?
  20. (W51) In the generated set 197 of 816 plainly glued letters are replaced by the first reading on the base and the head alike, not refused (`Fax X8852780545 ext` is `Fax X[MEMBER_ID] ext`): the base's reading of a long number after a phone word. Hidden either way; say if (a) should refuse there too once it reads the raw letter.
  21. (W51) A-4 joins over a control character: `Dear Zeph<U+0004>yra,` is replaced (the battery's b1 row). The check refuses any text holding one of its own three marks; is every other control character meant to join?
  22. (W51) MOD-20's matrix text now says the verifier flags wherever its whole-word reading or the matcher (`nameOrNumberMatches`) holds, where it said the drafter's check: W51's rewording after stage 5's oracle change (point 14). Is it what the verifier's tests assert?
  23. (W51) The battery's nine scripts that do not load in `lay.sh`'s layout (above) ran for neither side here or in item 26: what they cover is unmeasured for this item.
  24. (W51) The generated set draws each form from a small list of frames, letters and marks with one seed (34); a second seed is one argument of `generated.sh`.
  25. (W54, the fix) Rule (a) on the letter as written is asked only where some placeholder is written (first reading's spans or wider matches); with none, the check's own reading of the unchanged text is relied on. Is there a text where `digitsGluedToLetter(masked(read, claims))` in the check misses what the same reader finds on `unmarked(normal)`?
  26. (W54) What is not counted: the whole written number under ONE merged span of the first reading, whatever its placeholder (own, `[SSN]`, `[PHONE]`, a name's, a birth date's). 46 generated letters stay replaced and sent as on the base (a.glued 10, a.piece 12, a.piece-of-lettered 24); W54's first draft counted only `[MEMBER_ID]` and `[CLAIM_n]` and refused them. Point 20's 197 letters stay replaced too. Say if (a) should refuse there.
  27. (W54) A span of the first reading for a PART of the number hides nothing, its own included: held `21318` and `21318-5`, `Fax 21318-5B ext` is refused. Is there a reading that removes or rewrites a part without a span (`unbracketed`, NFKC, `unmarked`) so that the number is no longer whole on the text read?
  28. (W54) The refusal is the first reading's text with U+0001 after it (screen path), or the NFKC letter with it and the first reading's spans (`redactionSpans`), as the past-budget path already writes. `redactLetterForScreen`'s candidates are the first reading's. Does anything show or store a refused letter's text and now carry the mark where it did not?
  29. (W54) Work: each reading is charged `WORK.formCharacter` for each character and form, once, however many places the number stands; every place is asked (`lastIndex` stepped by one), so a crafted letter of many glued numbers each hidden under a placeholder costs regex time the counter does not see. The position map of a letter with a CR (`lineEndingsAsOne`) is built with no charge. The gate's slowest letter is 957 ms; no crafted letter was timed.
  30. (W54) The look-alike answer is taken once for all writings of the line endings (a CR is no look-alike) and from the wider reading where it read the text; asked afresh it moved the CR LF budget row by 4,347,750 units.
  31. (W54) Case 2 refuses 108 generated letters the base sends (with 1 to 3 digits of the number in clear) and 0 of the gate's. The gate holds no letter of this form, so its cost on real-shaped letters is unmeasured beyond the floor table of the design.
  32. (W54) `Fax 12-8852780545B ext` for a number `128852780545` is `Fax [MEMBER_ID]B ext` and `Fax 900123456B ext` for `900123456 01` is `Fax [SSN] ext`, on the base and now: the first reading's span takes the number whole, and in the second the letter after it. Not turned by this fix.
  33. (W54) Not run on the fix: the battery, the two `.db.test.ts` files of `packages/model-gateway`, `pnpm test:db`, golden and e2e. The second differing gate letter (i 187754) was not compared directly again.
- The gate's `cache/` under `designs/lane-b-redact-ssn-phone/gate/` is untracked scratch: do not commit it.

## Earlier: RESUME-BLOCK (W51, 2026-11-12, after stage 6 and stage 7's records; its fix is built, see W54's block above)

- **WIP head: 20af8fb3** (83d7bf7d stage 5; 3d75922a and 20af8fb3 are stage 7's records only: no product code changed
  by W51), pushed through the hook; the tree is clean. No PR is open. **The item is NOT whole: a fix to rule (a) is
  owed first** (the orchestrator's ruling, 2026-11-12 20:15 UTC), then the reviews.
- **THE FIX, AS RULED (first thing).** Rule (a) is to be read on the RAW letter, before any replacement by (c) or by
  the `[SSN]`/`[PHONE]` reading: where a stored number of 5 or more digits in all, in any form the records or a joiner
  give it, stands whole and glued to a letter, the letter is refused, whatever placeholder took a part of it. Case 2
  below is in the same fix unless its measurement shows real-shaped letters newly refused or the two budget rows
  moving: then it goes back to the orchestrator with the counts.
  - Case 1 (new on the head; the base sent the whole number): a digits-only number held with a separator, one piece of
    5 or more and one under 5, written whole with a letter glued on the short piece's side. (c) replaces the long
    piece; the check then reads text that no longer holds the number. Held `21318-5`, `Fax 21318-5B ext` is sent as
    `Fax [MEMBER_ID]-5B ext`; held `1/852830`, `Fax X1/852830 ext` as `Fax X1/[MEMBER_ID] ext`; held `97537335/1821`,
    `Fax 97537335/1821B ext` as `Fax [MEMBER_ID]/1821B ext`. (`Fax X21318-5 ext`, `Fax 213185B ext` and held
    `7654/3210`, `Fax 7654/3210B ext` ARE refused; `holdsIdentifier` on the raw letter is true for every one.) 130 of
    the generated set's 768 `a.stored-separator` letters.
  - Case 2 (the base writes the same text): a number of 10 to 12 digits glued to a letter with a joiner, a CR LF or a
    stored separator inside it; `[SSN]` or `[PHONE]` takes 9 or 10 digits and 1 to 3 are sent. Held `8852780545`,
    `Fax X8-852780545 ext` is `Fax X8-[SSN] ext`. 108 letters (a.joiner 57, a.crlf 16, a.stored-separator 35).
  - **Where the order of readings decides it** (`packages/redact/src/redact.ts` on 20af8fb3): `digitsGluedToLetter`
    (line 3873) is asked only inside `holdsIdentifier`'s `holds` (3827 to 3832), on `masked(read)` of the text
    ALREADY redacted (`prepare`, `functions/denial-letter.ts` 233, hands it `redacted.text`). The replacements happen
    before, in `screenAsBothRead` (3704): the first reading at 3712 (`screenAsFirstRead`, which writes `[SSN]` and
    `[PHONE]`: case 2), the wider matches at 3720 (`widerMatchesIn`, the pieces of (c): case 1), applied at 3727
    (`written`) unless `refusedAsFirstRead(first.text, ...)` at 3723. Nothing reads (a) on `normal` there. The same
    holds for `redactionSpans` (3609) and `redactLetter` (3656). A reading of (a) on the raw text in
    `screenAsBothRead` needs a way to make the check refuse (the mark `unreadPastTheBudgetAfter` uses is one that
    exists), and its work charged on the counter; the budget rows must not move.
  - **The test that must turn:** `bash designs/lane-b-redact-item-34/scripts/generated.sh <out root>` (one command:
    lays a97d73e4 and the checkout's files, writes the 13,780 letters with seed 34, runs them through the gate's own
    worker and checks each form's outcome; about 3 minutes). Today: `failures 238`, exit 1. After the fix: failures 0,
    PHI classes none. Add rows for the examples above to `redact.leaks.test.ts` (failing first), amend the ADR's
    "Open: W51's finding" paragraph and test-matrix MOD-25's last sentence (`packages/synth/src/cases/matrix.ts`,
    `docs/product/test-matrix.md`, then `pnpm synth --case MOD-25`), and run the gate again.
- **Stage 6, run on 83d7bf7d against a97d73e4** (files under `designs/lane-b-redact-item-34/measure/`):
  - The gate, full, `--no-cache` (`gate-stage-6.report.md`): 975,489 letters, PHI classes none, refused 462,984 and
    462,984, differ 2, both A-4's recorded cost (i 187859 `K.<emoji> RE`, class KEEP.changed.text; i 187754
    `member jun;e`, in no class, confirmed differing by a direct run of both trees), 0 real-shaped letters newly
    refused, timing max A 1,290 ms, B 1,177 ms.
  - The generated set (`generated-set-83d7bf7d.summary.json` counts per form; `.failures.jsonl` the 238;
    `.notes.jsonl`; `generated-set.manifest.json`): 13,780 letters, 1,207 patients; against the base no PHI class
    (REVERSE.PHI: member 2,845, claim 2,808, name 2,700, ssn 440; KEEP.changed.text 66), refused A 1,680, B 4,975.
    Per form, letters and the head's outcome: a.glued 816 (619 refused, 197 replaced by the first reading);
    a.joiner 1,104 (945, 102; 57 fail); a.crlf 576 (442, 118; 16 fail); a.script 768 in four scripts (576, 192);
    a.stored-separator 768 (566, 37; 165 fail); a.piece 144 (132, 12); a.piece-of-lettered 96 (72, 24);
    c.piece 640 and c.piece-digits 512 all replaced; a5.marks 1,920 (1,897 replaced, 23 refused); a5.marks-digits 576
    replaced; b.held-with-mark 780, with A-4 936, b.held-three 72 all replaced; a4.mark-in-part 768 and a4.edge-cut
    384 all replaced; a6.lf-cr 1,200 of 1,200 refused. Pinned as left and sent as the base sends them: glued 2 to 4
    digits 360, a glued piece of 4 48, a digit beside 240 (6 of them `[SSN]` on both sides: `Ref B009716522`), a
    piece under 5 256, of letters 128, a name glued 12.
  - The battery (`battery-hr-83d7bf7d.out`, `battery-hf-83d7bf7d.out`; the base as head `battery-rr-a97d73e4.out`,
    `battery-rf-a97d73e4.out`; laid by `designs/lane-b-redact-item-26/tools/lay.sh` under `/home/user/bt`, fresh seeds
    are lay.sh's plus 2000): every verdict line of the head is the base's on both seed sets (rows 697, 406, 5;
    SENT_WITHHELD 0; DEPART 0; base flags 0; head sends more than the base in 0; 72 new must-stay refusals as
    recorded). One reproduction row differs, by A-4: `Dear Zeph<U+0004>yra,` is now `Dear [PATIENT_NAME],`.
    **Nine of the battery's scripts do not load in this layout, on either side, as in item 26's kept runs** (b2, c1,
    c2 reproductions, `fz2`, the audit `fz2`, `stress16` (no `fast-check` from `/home/user/bt/*/work`), review I2's
    layouts, a1 and time: missing `leaks/`, `review-c1/aea`, `review-c2/aea`, `review-i2/v`). Not repaired.
  - The two rows nearest the budget (`units-stage-6.out`): 403,548,210 and 414,023,090, both sent, on the base and on
    the head; the budget is 420,000,000, no threshold or allowance touched.
- **Stage 7's records, built:** the ADR 0054 amendment (`co-001/redact-item-34`, 2026-11-12; its "Open" paragraph is
  the fix owed); test-matrix MOD-25 with its registry entry and `fixtures/synthetic/MOD-25/expected.json`; MOD-20 and
  MOD-23 reworded (the check and the matcher are no longer one reading; MOD-25 closes what MOD-23 left sent).
  **Green on 20af8fb3:** `pnpm verify-content`; `pnpm typecheck` 24 projects; `pnpm lint` 1,943 files, 0 errors, 0
  warnings; `pnpm lint:logs` 1,202 files; the redaction suites, `packages/redact`, `packages/packets` and
  `packages/synth` together: 68 files, 6,446 tests.
- **What the last session does:** the fix above with its tests, the generated set at failures 0, the gate again; then
  two adversarial reviews on PHI and redaction, each finding verified before it is recorded, at most two fix rounds;
  the base merged; the full local suite once; the PR from `.github/pull_request_template.md`; the merge on green
  required checks.
- The named points for the two reviews are in W54's block above (1 to 24 as W51 wrote them).
- The gate's `cache/` under `designs/lane-b-redact-ssn-phone/gate/` is untracked scratch: do not commit it.

## Earlier: RESUME-BLOCK (W49, 2026-11-12, after stage 5)

- **WIP head: 83d7bf7d** (stage 3 6bec2b4e, stage 4 4fac5c31, stage 5 83d7bf7d), pushed through the hook; the tree is
  clean. **Stages 1 to 5 are built.** Stage 6 is not started. No PR is open.
- **Stage 5 built, (d)** (ruling: the verifier keeps its reading). `redact.ts`: `holdsNameOrNumber` only. It asks the
  first reading first (the base's whole check, unchanged), then, inside `inOneReading`: `widerMatchesIn` and
  `digitsGluedToLetter` on a subject with `names: []` (numbers as stored with A-5, pieces (c), digits glued (a); no
  name written apart), then `matchesIn` once more on each name whose `nameWords(name, true)` has more words than
  `nameWords(name)`, rewritten as its wider words (parts joined by `-`, words by a space). `nameOrNumberMatches` and
  `packages/packets/src` are not touched. No counter runs there; `holdsIdentifier` is not touched.
- **Tests, 8 failed first on 4fac5c31, each on an assertion:** `packages/redact/src/narrative.test.ts` (6: the new (d)
  describe; the equality property is now "holds wherever the matcher finds", with marked cases added, and a second
  property keeps equality on cases that hold nothing (d) reads); `functions/narrative.test.ts` (1: `prepare` refuses
  `ZZ12345/01`, `ZZ12345 / 01`, `ZZ12345`, `Fax X76543210`, `Ms. Zephyra`, `JANE`; the facts still pass; `in a` passes);
  **`packages/packets/src/verifier-identifiers.test.ts` (1; a test file outside the design's stage 5 list, it had to
  change):** the differential's oracle was `holdsNameOrNumber` and is now `nameOrNumberMatches` asked plainly (the
  same reading it was), plus "the check holds wherever the matcher does"; the rows `ZZ12345/01`, `.01`, `,01`, `+01`,
  `ZZ12345` of `ZZ12345 01` and `Quill+Treeby` pinned `holdsNameOrNumber` false and now pin the matcher `[]` and the
  check true. The verifier's own rows there did not change.
- **Green on 83d7bf7d:** the redaction suites of `packages/model-gateway` (`src/redact*`, `functions/denial-letter.test.ts`,
  `functions/narrative.test.ts`): 6 files, 4,375 tests; `packages/redact`: 2 files, 54 tests; `packages/packets` whole:
  46 files, 1,825 tests; `pnpm typecheck` 24 projects; **`pnpm lint` whole, 1,943 files, 0 errors, 0 warnings** (run
  once on the stage 5 tree, which is 4fac5c31 plus these four files: stages 1 to 4 left nothing to fix).
- **The work budget, not raised, no threshold or allowance touched; the two rows nearest it, measured on 4fac5c31 and
  on 83d7bf7d by `scripts/units.mts` (the product's own entries, no prototype hook):** gap and initials 100k
  **403,548,210** sent; U+33FE to 57,972 with a CR LF **414,023,090** sent: the same to the unit before and after
  stage 5. `measure/units-stage-5.out`.
- **The second differing letter of the stage 3 gate, named (W49; `scripts/differ.mts`, a full rerun of both trees:
  975,489 letters, differ 2, `measure/gate-stage-3-differ.out`):** corpus i 187754 (shard 2, line 23469; fuzz T5/MOD-13
  letterCase; names `MEMBER JUNE`, member ID and claim `JUNE`). For `member jun;e;` A writes `[PATIENT_NAME] [CLAIM_1];`
  (spans 122-128 name, 129-134 claim) and B `[CLAIM_1];` (one span 122-134). **Rule A-4**: `;` is a run of marks, so
  the wider reading reads `member jun;e` as the whole name MEMBER JUNE; it overlaps the claim match and the one span
  takes the claim's placeholder by kind. B covers one character more (the space) and shows nothing A covers; both
  sent, neither check holds. **A cost, never a leak**: one space under a placeholder and two placeholders made one.
  The report has no class for it because the only character that changed cover is a space. The other letter is i
  187859 (KRE I FGK, `K.<emoji> RE`), as W48 wrote. The gate's hits never held either: a rerun is the only way to see them.
- **Exact next step: stage 6**, the generated set, the gate and the battery. The gate FULL and `--no-cache` on
  83d7bf7d against a97d73e4 (stage 4 and stage 5 have not been gated; (d) changes no letter path, so expect the stage
  3 outcome plus what A-6 turns, 0 of the corpus's letters by `measure/lfcr.out`): lay A from
  `git show a97d73e4:packages/redact/src/{redact,confusables}.ts` and B from the head's, each into
  `<root>/<tree>/packages/model-gateway/src/`, then
  `bash designs/lane-b-redact-ssn-phone/gate/run.sh <root>/base <root>/head <root>/out --workers 4 --no-cache`
  (about 13 minutes). For any letter the report puts in no class, `scripts/differ.mts` prints it (usage in its head).
  **Stage 7:** the ADR 0054 amendment, test-matrix MOD-25 and its synth registry entries
  (`packages/synth/src/cases/matrix.ts` line 645 describes the check and the verifier as one reading: reword it there);
  then the two adversarial reviews (two fix rounds at most) and the PR.
- **Every named point for the two reviews, in one list:**
  1. (W39, stage 1) A-5 keeps what the records write in the joining class beside the run of marks: a superset of MOD-23's form.
  2. (W39) A piece is split at an APOSTROPHE_LETTER too (U+02BC, U+02B9, U+02CA).
  3. (W39) Two numbers that share a piece: the first in the call's order gives the placeholder (claims, then member IDs).
  4. (W39) A cost the note's A-5 cell does not state: a claim held `1234/56` replaces `$1234.56` too (`isAmount` asks for cents after the number). A placeholder, never a leak.
  5. (W39, stage 2) The prototype's rule (a) did not cost 0 for a call with no digits-only number (`alikeReads` charges `WORK.fold` per character outside ASCII); the build returns before any reading where no stored number can hold five digits and takes the wider reading's look-alike answer (`alikeOfWider`): 0 units.
  6. (W39) A digits-only piece of a number that holds letters (`7654321` of `ZZ 7654321`) is read by (a) too: `XQ7654321` is refused. The safer side; the co-founder may rule otherwise.
  7. (W39) The crafted letter (dates with spaces 100k, `SYN555001` and ten 7-digit claim numbers): 418.78M sent on the base, 420.78M refused on the head; with nine 419.73M sent.
  8. (W48, stage 3) (b) splits at every non-letter, non-digit character that is no part joiner (a combining mark NFKC leaves too); the wider words' initials are taken next to a name; held `ZEPHYRA+JANE+Q` written `Zephyra, Jane` gives two placeholders.
  9. (W48) `GAP.apart` is a getter returning `runOfMarks()` (declaration order).
  10. (W48) Accepted costs pinned: `h/o`, `N/A`, `L/E`, `w/o` for a patient HO, NA, LE, WO; `New, man.`; held `ZEPHYRA*MEDICARE`; `a4.sh` on the build: one new placeholder (IDA: `id)'); // a`).
  11. (W48) Added work for a name held with a mark: gap and initials 62,008 characters 351.6M sent, 82,008 420.0M REFUSED, 100,008 refused by the redaction's own count (the base sent each with the name in clear).
  12. (W48, stage 4) A-6: a letter with LF CR is read a third time; U+33FE 30,002 with LF CR 139.9M to 214.4M sent; 57,972 with `\r\n\n\r` REFUSED by count; 0 of the gate's letters hold LF CR.
  13. (W48) The stage 3 gate: differ 2, both A-4's cost of a placeholder (i 187859 `K.<emoji> RE`; i 187754 `member jun;e`, named above by W49); no PHI class, none newly refused.
  14. (W49, stage 5) The packets differential test changed its oracle from the check to the matcher (see Tests above): is anything the verifier owed the check's reading lost? The verifier's source is not touched.
  15. (W49) (d) reads a marked name's wider words only where the wider reading has MORE words than the first (a wider split only adds words); the words are rebuilt from folded, compacted parts joined by `-`.
  16. (W49) Costs of (d), each a narrative call refused before it is made, never a leak (probed on synthetic rows): digits glued to a letter have no exception for a date or a code, so for a case number `20260305` facts holding `2026-03-05T00:00:00Z` are refused, and for a number `97110` facts holding `97110GP` (`2026-03-05 to` and `97110 GP` were and are as before; the synthetic facts hold neither glued form and still pass with `20260305` and `30000` in the case); a number held `1234/56` refuses `$1234.56` and `1234.56` (point 4, now in the check); `12345` alone is refused for a number held `ZZ 12345` (a piece); a name held `IN+A` or `VAN+TREE` refuses "in" and "van" (every part of two letters counts in this check, as on the base for `HYE-IN`); `ZEPHYRA*MEDICARE` refuses "Medicare".
  17. (W49) `$300.00USD` for a number `30000` is NOT read by the glued rule (the period stands between), in the letter check too: the base's reading, unchanged; say if it should be.
  18. (W49) The check runs with no work counter (the note: "No counter runs there"): a narrative's facts are code's own and short, but nothing bounds them here.
- The gate's `cache/` under `designs/lane-b-redact-ssn-phone/gate/` is untracked scratch: do not commit it.

## Earlier: RESUME-BLOCK (W48, 2026-11-12, after stage 4)

- **WIP head: 4fac5c31** (stage 3 6bec2b4e, stage 4 4fac5c31), pushed through the hook; the tree is clean. Stages 1 to
  4 are built. Stage 5, (d), is not started: W48 reached its context limit at the end of stage 4.
- **Stage 3 built, (b) and A-4** (`redact.ts` only): `WIDER_WORD_SPLIT` and `nameWords(name, wider)` (a stored name's
  words in the wider reading: split at every character that is no letter, no digit and no `PIECE_SPLIT` joiner);
  `formsBuiltOf` and `initialsOf(names, wider)` take it; `GAP.apart` is a getter returning `runOfMarks()` (a getter
  because `runOfMarks` names marks declared further down the file). The first reading is unchanged.
  68 rows failed first on ea109dc0. Pinned rows that turned, as the note names: `New, man. Under/wood.` (now
  `[PATIENT_NAME].`) and A-4's eight recorded marks (was line 1096). **No row of "review B, the recorded costs" turned.**
  Accepted costs pinned: `h/o`, `N/A`, `L/E`, `w/o` for a patient HO, NA, LE, WO; `New, man.`; held `ZEPHYRA*MEDICARE`.
- **`a4.sh` again, on the build** (base a97d73e4 against the stage 3 head, `cost-names.mts`, 546 prose texts, 64 names):
  **one** new placeholder (IDA: `id)'); // a`), the note's own figure. `measure/a4-cost-stage-3.out`.
- **Stage 4 built, A-6** (`redact.ts` only): `asOneLineFeed`; `holdsIdentifier` and `refusedAsFirstRead` read a third
  time where the text with CR LF as line feeds still holds a line feed before a CR. 10 rows failed first on 6bec2b4e;
  the pinned row that turned is A-6's (was line 1119).
- **Green on 4fac5c31:** the redaction suites (`packages/model-gateway/src/redact*`, `functions/denial-letter.test.ts`,
  `functions/narrative.test.ts`: 6 files, 4,374 tests; `packages/redact`: 2 files, 46 tests); `pnpm typecheck`.
  `pnpm lint` (all 1,943 files) 0 errors on stage 3; on stage 4 eslint was run on the two changed files only, 0 errors:
  **the next session runs `pnpm lint` whole once.**
- **The work budget, not raised; units (redaction + check), measured after each stage, both stages the same:** gap and
  initials 100k **403,548,210** sent; dates with spaces 100k 410,267,230 sent; U+33FE to 57,972 with a CR LF
  **414,023,090** sent: each W39's count to the unit. Neither stage added a unit to a call whose names hold no mark
  and whose letter holds no line feed before a CR.
- **Added work, where the rules do read (new patients and letters only; each pinned in `redact.leaks.test.ts`):**
  1. (b): for a name held with a mark (`JANE+Q+VANTREE`) only the wider reading finds the name and its initials, and
     the first reading's check is then asked once more. Gap and initials: 62,008 characters 351.6M sent (space-held
     248.1M); 82,008 characters 420.0M REFUSED (space-held 329.9M sent); 100,008 REFUSED by the redaction's own count.
     The base sent each with the name in clear. Dates 100k 408.7M and U+33FE 411.2M for that patient: sent, under the
     space-held patient's counts.
  2. A-6: a letter with a line feed before a CR is read twice (as CR LF is), with both endings three times. U+33FE
     30,002 characters with LF CR: 139.9M before, 214.4M now, sent. U+33FE 57,972 with `\r\n\n\r`: REFUSED by count
     (three readings); with `\n\r` alone sent. 0 of the gate's 975,489 letters hold LF CR (`measure/lfcr.out`).
- **Small things decided, the blunt side:** (b) splits at every non-letter, non-digit character that is no part joiner
  (a combining mark that NFKC leaves too); the initials of the wider words are taken next to a name (the note says
  "as if a space were held there"). A name held `ZEPHYRA+JANE+Q` written `Zephyra, Jane` gives two placeholders, as
  the name held with spaces does.
- **The gate on the stage 3 head (6bec2b4e's `redact.ts`), `--no-cache`:** A = a97d73e4 (`redact.ts` 8b2be7ade7ce), B
  `redact.ts` a1f15736360a, 975,489 letters, cachedA 0, cachedB 0 (a full run, 763 s): **same 975,487, differ 2;
  refusedA 462,984, refusedB 462,984; PHI classes none; reverse none; unplaced none; errors 0; span mismatches 0.**
  Real-shaped letters newly refused by count: 0 (no letter is newly refused at all). **KEEP.changed.text 1**, a fuzz
  letter (T5/MOD-13 letterCase, patient KRE I FGK): `K.<emoji> RE: Patient` is read as KRE by A-4's run of marks, so
  `RE` goes under the placeholder: A-4's recorded kind of cost, a placeholder, never a leak. **The second differing
  letter is in no class of the report** (no PHI, KEEP or reverse row; `metadata 2`): W48 did not look it up in the
  gate's hits; the next session should name it. Timing: max A 937 ms, B 891 ms of 3,000; none over in B. Report:
  `designs/lane-b-redact-item-34/measure/gate-stage-3.report.md`. Stage 4 has not been gated (stage 6 runs the full gate).
- **Exact next step: stage 5, (d)** in `holdsNameOrNumber` (tests first in `packages/redact/src/narrative.test.ts`
  and `functions/narrative.test.ts`). Read by W48, not built; a sketch the builder should check, not a decision:
  - today `holdsNameOrNumber` is `matchesIn(masked(text), narrativeSubject(names, numbers)).length > 0`, and
    `narrative.test.ts`'s property "holdsNameOrNumber answers as nameOrNumberMatches finds" holds it EQUAL to the
    verifier's matcher. Under the ruling that property becomes one-way: wherever `nameOrNumberMatches` finds, the
    check holds (and more); `nameOrNumberMatches` itself is not touched.
  - what (d) adds to the check: numbers in the wider forms (as stored with A-5, pieces (c)): `widerMatchesIn` on a
    subject with `names: []`, so no name is read written apart (item 26's ruling: `in a` for INA); digits glued (a):
    `digitsGluedToLetter(masked(text), subject)`; names split as (b) but read as the FIRST reading reads a name
    (`spacedPiecesPass` kept): `matchesIn` once more with each name rewritten from `nameWords(name, true)` (parts
    joined by `-`, words by a space), only where that differs from the name as held.
  - run it inside `inOneReading` so `alikeOfWider` holds no narrative text past the call. No counter runs there.
  - rows: each (d) cell of the design's table (held `ZZ12345/01` written so and `ZZ12345+01`; held `JANE+ZEPHYRA`,
    `Ms. Zephyra`); `in a` for a patient INA still passes; `ZEPHYRA*MEDICARE` fails "Medicare" narratives (the note's cost).
- The gate's `cache/` under `designs/lane-b-redact-ssn-phone/gate/` is untracked scratch: do not commit it.

## Earlier: after stage 2 and its gate (W39, 2026-11-12 18:50 UTC)

- **WIP head: ea109dc0** (stage 1 d438ce76, stage 2 ea109dc0), pushed through the hook; the tree is clean. Stages 1
  and 2 are both built. Nothing of stage 3 is started.
- **Stage 2 built, (a):** `digitsGluedToLetter` beside `widerMatchesIn` in `holdsIdentifier`'s `holds`, on
  `masked(read, claims.length)` (the text whose view the wider reading stored); the floor is `WIDER_NUMBER_FLOOR`;
  `alikeOfWider` keeps the wider reading's look-alike answer for that text (set in `widerMatchesRead`, dropped by
  `inOneReading`), so the rule asks nothing twice.
- **Green on ea109dc0:** the redaction suites (`packages/model-gateway/src/redact*`, `functions/denial-letter.test.ts`,
  `functions/narrative.test.ts`, `packages/redact`): 8 files, 4,345 tests; `pnpm typecheck`; `pnpm lint` 0 errors.
  27 stage 2 rows failed before the build: the (a) block in `redact.leaks.test.ts`, the check's row for
  `Room AB99887766` in `redact.property.test.ts`, and in `functions/denial-letter.test.ts` the timed rows, the crafted
  refused row and the count pinned at two units a character.
- **The work budget, not raised; measured units (redaction + check):** gap and initials 100k 403,548,210; dates with
  spaces 100k 410,267,230; U+33FE to 57,972 characters with a CR LF 414,023,090: each the base's count to the unit,
  sent. The crafted letter (dates with spaces 100k, `SYN555001` and ten 7-digit claim numbers) 418.78M sent on the
  base, 420.78M refused on the head; with nine 419.73M sent.
- **A finding against the note, fixed in the build:** the prototype's rule did NOT cost 0 for a call with no
  digits-only number: `alikeReads` charges `WORK.fold` (150) for every character outside ASCII, per reading. Built so,
  the U+33FE row went 414.0M sent to 422.7M REFUSED (an existing timed row failed). The build returns before any
  reading where no stored number can hold five digits, and takes the wider reading's own look-alike answer: 0 units.
  The note's `work-floor6.out` rows for the own patient are unaffected only because they hold no such character or
  were already refused.
- **Decided, the safer side for privacy (the note does not settle it):** a digits-only piece of a number that holds
  letters (`7654321` of `ZZ 7654321`) is read by (a) too: `XQ7654321` is refused. Tell the co-founder if it should not be.
- **The gate, run on ea109dc0 (2026-11-12 about 19:00 UTC): as expected.** A = a97d73e4 (`redact.ts` 8b2be7ade7ce),
  B = ea109dc0 (`redact.ts` 6d2e97775dfd), 975,489 letters: **same 975,489, differ 0; refusedA 462,984, refusedB
  462,984; PHI classes none; KEEP none; reverse none; errors 0; span mismatches 0.** Real-shaped letters newly
  refused by count: 0 (no letter differs). Timing: max A 975 ms, B 964 ms of 3,000; none over in B. Report:
  `designs/lane-b-redact-item-34/measure/gate-stage-2.report.md`. Both trees' outcomes were read from the gate's
  cache, which the first run (cut off after its corpus pass, same two hashes) had written: the same outcomes.
  Command: lay A from `git show a97d73e4:packages/redact/src/{redact,confusables}.ts` and B from the head's, each into
  `<root>/<tree>/packages/model-gateway/src/` (not `proto.sh`, which copies the checkout, now the head), then
  `bash designs/lane-b-redact-ssn-phone/gate/run.sh <root>/base <root>/head <root>/out --workers 4`.
- **Exact next step:** stage 3, (b) and A-4 (a fresh session; W39 stands down). `runOfMarks` is the class A-4 takes.
  The gate's `cache/` under `designs/lane-b-redact-ssn-phone/gate/` is untracked scratch: do not commit it.

## Earlier: after stage 1 (W39, 2026-11-12)

- **Built:** stage 1, A-5 and (c), commit d438ce76 on the WIP ref. `packages/redact/src/redact.ts` only:
  `runOfMarks` (the run of marks, a function: stage 3's A-4 takes the same class for `GAP.apart`),
  `WIDER_NUMBER_FLOOR = 5` (the one constant: (c)'s pieces now, (a)'s digits in stage 2), `numberForm` (with `asStored`,
  a run of marks where the records write a separator; what the records write there still joins too, so the form is a
  superset of MOD-23's), `piecesOf` and `addPieces` in `formsBuiltOf` (wider only).
- **Green on d438ce76:** the MOD-25 block in `redact.leaks.test.ts` (44 rows; 40 failed on a97d73e4 first), the whole
  file 767 of 767; the redaction suites (`packages/model-gateway/src/redact*`, `functions/denial-letter.test.ts`,
  `functions/narrative.test.ts`, `packages/redact`): 8 files, 4,308 tests; `pnpm typecheck` 24 projects; `pnpm lint` 0 errors.
- **Pinned rows that turned, as the note names:** `redact.leaks.test.ts` the piece `ZZ12345` (was line 861) and A-5's
  recorded row (was 1109). No other pinned row turned.
- **Small things decided, the safer side for privacy, and why:**
  1. A-5 keeps what the records themselves write in the joining class beside the run of marks, so nothing MOD-23 read is lost.
  2. A piece is split at an APOSTROPHE_LETTER too (U+02BC, U+02B9, U+02CA: apostrophes in every number here).
  3. Where two numbers share a piece the first in the call's order gives the placeholder: claims in order, then member IDs.
- **A cost the note's A-5 cell does not state, pinned in the tests:** for a claim number held `1234/56`, `$1234.56` is
  replaced too (`Paid $[CLAIM_1] on the claim`), not only `1234.56` with no currency sign: `isAmount` asks for cents
  *after* the number, exactly as the base does for a claim held `1234.56`. A placeholder, never a leak; left so.
- **Exact next step:** stage 2, (a) in `holdsIdentifier`'s `holds`: tests first (the (a) block in the MOD-25 describe,
  the row at `redact.property.test.ts` "Room AB99887766", the timed rows, the crafted refused row and the count on the
  stored view in `functions/denial-letter.test.ts`), then one function beside `widerMatchesIn` reading
  `masked(read, claims.length)` (the text whose view the wider reading stored), then the suites, then the gate.
- **The gate (not yet run):** `designs/lane-b-redact-ssn-phone/gate/run.sh A B out --workers 4`, A the `base` tree of
  `designs/lane-b-redact-item-34/scripts/proto.sh <root>`, B the head laid the same way. Expected: PHI classes 0,
  `refusedB` 462,984, no change from stages 1 and 2. Output path: recorded here when it runs.
