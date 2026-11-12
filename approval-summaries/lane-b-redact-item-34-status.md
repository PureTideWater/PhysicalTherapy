# Queues item 34 (MOD-25): build status

Design of record: `designs/lane-b-redact-item-34/design.md` (ops 163894a9). Rulings of 2026-11-12 12:10 UTC: floor 5,
one constant; (d) the verifier keeps its reading; A-4's costs accepted; a digit beside the number stays recorded.
WIP ref: `co-001/wip-redact-item-34`, cut from claude/build-platform a97d73e4. No PR is open.

## RESUME-BLOCK (W49, 2026-11-12, after stage 5; stages 6 and 7, the two reviews and the PR are the last session's)

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
