# Lane B: the letter reader's redaction, in one pass and complete (`co-001/redact-placeholders`)

Started 2026-10-27 19:12 UTC by a Lane B item session run by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg).
Base: `claude/build-platform` at 085299b (#76 merged). Reserved: ADR 0085 if needed (this design amends ADR 0054, which
owns redaction, instead); test-matrix MOD-13 to MOD-14; `packages/synth` cases the same if needed (module 9, MOD).
No migration, no schema, nothing a person sees (no UX review).

## 1. The defect, and what else can go wrong (established 2026-10-27 on 085299b)

`packages/model-gateway/src/redact.ts` is the only path that keeps a patient's details from the model when a payer
letter is read (`readDenialLetter`; CLAUDE.md: models only through the gateway). `redactLetter` NFKC-normalizes the
letter, replaces dates of birth, then runs one regular expression per identifier form, **longest form first, each over
the text the previous ones already rewrote**. `holdsIdentifier` then re-runs the same expressions as the self-check, and
`identifierCandidates` offers the redacted text's runs to the practice's records (`holdsOtherPatient`).

Probed with synthetic twins on 085299b (each line: the input, what is sent, what the self-check says):

| # | Class | Records | Letter | Sent to the model | Self-check |
|---|---|---|---|---|---|
| A1 | Name part equal to a placeholder word | `CLAIM DATE` | `Claim SYN555001 for Date, DOB 03/03/1961` | `[PATIENT_NAME] [[PATIENT_NAME]_1] for [PATIENT_NAME], DOB [[PATIENT_NAME]_OF_BIRTH]` | passes: the model loses `[CLAIM_1]` |
| A2 | Name part `NAME`, `ID`, `MEMBER`, `PATIENT`, `OF`, `BIRTH` | `NAME ID` | `member ZZ1234567` | `[MEMBER_[PATIENT_NAME]]` | refuses (`identifier_left`): a clean letter is never read |
| B1 | Diacritics | `JOSE GARCIA` | `Dear José García` | unchanged | passes: **name sent** |
| B2 | Typographic apostrophe | `MARY O'BRIEN` | `Ms. O’Brien` | unchanged | passes: **name sent** |
| B3 | Hyphenated surname, one half | `ANA SMITH-JONES` | `Ms. Jones` | unchanged | passes: **name sent** |
| B4 | Dash or space for the hyphen | `ANA SMITH-JONES` | `Smith–Jones`, `Smith Jones` | unchanged | passes: **name sent** |
| B5 | Invisible characters (soft hyphen, zero-width space: PDF text) | `JANE VANTREE` | `Van­tree` | unchanged | passes: **name sent** |
| B6 | Spacing inside a part | `JOANN VANTREE` | `Jo Ann Vantree` | `Jo Ann [PATIENT_NAME]` | passes: **first name sent** |
| B7 | Full case folding | `STRAUSS` | `Strauß` | unchanged | passes: **name sent** |
| B8 | Initials | `JANE Q VANTREE` | `Jane Q. Vantree, J. Vantree` | `[PATIENT_NAME] Q. [PATIENT_NAME], J. [PATIENT_NAME]` | passes: **initials sent** |
| C1 | Member ID or claim number with `_` or `.` | `ZZ1234567`, `SYN555001` | `ZZ_1234567`, `SYN.555001` | unchanged | passes: **IDs sent** |
| C2 | Member ID with a zero-width space | `ZZ1234567` | `ZZ​1234567` | unchanged | passes: **ID sent** |
| D1 | Other patient's ID with `_`, a zero-width space, or bracketed like a placeholder | (another patient's `ZZ7654321`) | `ZZ_7654321`, `YY​7654321`, `[QQ_7654321]`, `ID:ZZ7654321` | `identifierCandidates` returns **nothing** | the one-patient screen is never asked |

Why each happens:
- **A**: replacement is sequential over rewritten text, and a placeholder's own words (`CLAIM`, `DATE`, `OF`, `BIRTH`,
  `MEMBER`, `ID`, `PATIENT`, `NAME`) are whole words to the next expression (`_`, `[`, `]` are word boundaries).
- **B1, B7**: matching is regular-expression `iu`: simple case folding, no mark stripping, no `ß`/`SS`.
- **B2 to B6**: a name form matches only character for character, its spaces as white space; the parts come from
  `identifierForms` (packets), which splits on white space, `,`, `;` and `/` only, so `SMITH-JONES` and `O'BRIEN` are one
  part each, and a letter's `’`, `–`, soft hyphen or extra space defeats the match.
- **B8**: a part needs two letters, so an initial is never a form.
- **C, D**: an identifier's pattern allows only white space and hyphens inside it; `identifierCandidates` splits on
  white space and hyphens only, drops any word with other punctuation inside it (`ZZ_7654321`, `ID:ZZ7654321`), and
  strips `\[[A-Z_]+(?:_\d+)?\]`, which is wider than the placeholders (`[QQ_7654321]`).

What does **not** go wrong today (checked): a corrupted placeholder carries no identifier itself (it only loses the
claim); replacement never cuts a word in half (every match is whole-word on both sides); the date patterns read their
forms on the NFKC text. Re-identification through a corrupted placeholder is not possible (the corruption is made of
placeholder text), but the model loses the claim mapping (A1) and a clean letter can be refused (A2).

## 2. The fix (the recommended option, taken)

**One pass over one folded view of the original text; every match found before anything is replaced; overlapping
matches merged; one placeholder per merged span.** Masking inserted placeholders was the other option; it is rejected
because it keeps sequential rewriting, so a later form can still match across a mask's edge or a text rewritten by an
earlier form, and its completeness needs an argument per mask. One pass needs one argument (section 3).

### 2.1 The folded view (`fold`)
From the NFKC text, a view and a map from each view position back to the NFKC position it came from:
1. drop every `\p{Default_Ignorable_Code_Point}` (soft hyphen, zero-width space and joiner, word joiner, BOM...);
2. per code point: NFD, drop `\p{M}` (marks), upper-case (full mapping: `ß` → `SS`, `ŉ` → `ʼN`); each produced unit maps
   to its source code point.

Dates, labels, names and identifiers are all found on this one view. Placeholders are emitted on the NFKC text, so what
is sent is the NFKC letter with spans replaced, nothing else changed (as today).

### 2.2 The forms
- **Claim numbers, member IDs**: the compact form (letters and digits of the folded value), at least two characters.
- **Names**: each whole name and each part, the parts split on white space, `,`, `;`, `/`, every dash (`\p{Pd}`),
  apostrophes (`'`, `’`, `‘`, `ʼ`, `` ` ``, `´`) and `.`; each kept at two letters or digits or more, compact. (A
  superset of `identifierForms`, which stays as it is for the packets verifier.)
- **Initials**: the first letter of each part, and each one-letter part.

### 2.3 The matcher
A compact form `c1 c2 ... cn` matches the view where `c1 J* c2 J* ... J* cn` stands, bounded on both sides by a
character that is not a letter or digit (or the text's edge), where the joiners `J` are:
- for an identifier: white space, dashes, `_`, `.` (today: white space and hyphens);
- for a name: white space, dashes, apostrophes, `_`, `.`.

So `Smith–Jones`, `Smith Jones`, `O’Brien`, `OBrien`, `Jo Ann`, `ZZ_1234567`, `SYN.555001` match, and `JANET` still
does not match `JANE`, nor `ZZ12345678` `ZZ1234567`.

### 2.4 Dates of birth
`datesIn` runs on the folded view (its patterns are case-blind already); a date span is a date of birth as today (one of
the patient's dates in any reading, or any date a birth label introduces).

### 2.5 Initials
After the name spans are found: an upper-case single letter that is an initial of the patient's name, standing alone as
a word (optionally followed by `.`), separated from a name span (or from an initial already taken) only by white space,
optionally after a comma (`Vantree, J.`), is a name span too. Repeated to a fixed point (`J. Q. Vantree`). The letter
is replaced; its period stays.

### 2.6 One pass
All spans (dates of birth, identifier and name matches, initials) are mapped back to NFKC positions, sorted, and
overlapping spans merged. A merged span takes the placeholder of its longest member; on a tie, `[CLAIM_n]` (lowest n),
then `[MEMBER_ID]`, `[DATE_OF_BIRTH]`, `[PATIENT_NAME]`. The output is built once, left to right. `replaced` counts the
placeholders written.

### 2.7 The self-check and the screen
- `holdsIdentifier(text, ...)`: the exact placeholders (`[PATIENT_NAME]`, `[DATE_OF_BIRTH]`, `[MEMBER_ID]`,
  `[CLAIM_<n>]`) are masked with a barrier character (neither letter, digit nor joiner), then the same view and matcher
  run. It stays in `denialLetterSpec.prepare` as the guard it is.
- `identifierCandidates(text)`: exact placeholders masked; the view without the mark stripping (NFKC, default
  ignorables dropped, upper case), so a candidate compacts as `compactIdentifier` compacts the stored side; tokens are
  maximal runs of letters and digits; a run joins up to three tokens separated only by identifier joiners; kept with a
  digit and five or more characters (as today). So `ID:ZZ7654321`, `ZZ_7654321`, `YY​7654321` and
  `[QQ_7654321]` are offered.

### 2.8 The neighbouring check
`mentionsIdentifier` (`functions/narrative.ts`) refuses a narrative input that holds a case identifier, with today's
character-for-character match. It takes the same folded matcher (names and identifiers alike, with the name joiners,
the wider of the two), so a fact text that writes an identifier differently is refused too. The packets verifier's
`identifierSpans` (the model's output check) has the same gaps; it is in `packages/packets` (another package, the
follow-on item's), so it is a proposal in the status file, not this PR.

## 3. Why one pass is complete
Let the output be the NFKC text with each merged span replaced by a placeholder.
1. Every match of every form, every date of birth and every taken initial lies inside a merged span, so none of its
   characters is sent.
2. A match starts and ends on a letter or digit and has a non-letter, non-digit (or the edge) on each side. So the
   characters next to each merged span in the NFKC text are not letters or digits, and they are kept.
3. The self-check masks placeholders with a barrier that is neither a letter, digit nor joiner, so no match crosses a
   placeholder. A match in a kept segment then lies in the segment with the same neighbours it had in the original (by
   2, a segment's edge characters are not letters or digits, so a match never ends at them), so it was a match in the
   original, and is inside a span: a contradiction. Hence `holdsIdentifier(redactLetter(t).text) === false` for every
   `t` (the property test asserts it; the prepare-time guard stays as defence in depth).
4. Inserted placeholders are never scanned, so they survive exactly: the property asserts that the output, with every
   span replaced, equals the expected placeholder sequence and that `[CLAIM_n]` is present wherever claim n's number was.

Date-of-birth label reads (a label within the 40 characters before a date) can differ between the original and the
output (a label word may itself be a replaced name part); the guarantee rests on (1), not on the self-check.

## 4. Tests (MOD-13, MOD-14)
- **MOD-13, every placeholder survives and no identifier survives (property, `redact.property.test.ts`)**: names
  drawn adversarially: parts equal to placeholder words (`CLAIM`, `DATE`, `OF`, `BIRTH`, `MEMBER`, `ID`, `PATIENT`,
  `NAME`), to month names, to each other, hyphenated, apostrophized, accented, with `ß`, initials, one-letter parts;
  member IDs and claim numbers equal to name parts or to each other; the letter writing each in a random form (case,
  marks stripped or added, joiners, default-ignorables inserted, typographic apostrophes and dashes, `Last, First`
  order, initials). Asserts: the folded output holds no form, date of birth or initial-next-to-name; every `[CLAIM_n]`
  of a claim whose number the letter wrote is in the output; no placeholder is corrupted (every `[` ... `]` in the
  output that was not in the letter is an exact placeholder); `holdsIdentifier` is false; text with no identifier is
  unchanged (NFKC).
- **MOD-14, the one-patient screen sees every written form (`identifierCandidates`)**: another patient's ID written
  with `_`, `.`, a zero-width space, after `ID:`, inside `[..._...]`, spaced, hyphenated: always a candidate; an exact
  placeholder never.
- Each row of section 1's table as a named example test in `denial-letter.test.ts` (A1, A2's letter now read; B1 to B8;
  C1, C2; D1), and the `identifier_left` guard tested on a hand-made redacted text, since a complete redaction no longer
  reaches it.
- The existing tests stand unchanged except `refuses to send a letter that still holds an identifier after redaction`
  (A2: a name `PATIENT_NAME` is now redacted, so the guard is tested directly).
- Fixtures: none (no document); `packages/synth` gets no case unless the fixtures test requires a registry entry per
  matrix row (then no-file entries MOD-13 and MOD-14, module 9).

## 5. Records
- ADR 0054 amendment (dated 2026-10-27): the one-pass rule, the fold, the joiners, initials, the merge, the screen's
  tokens, what is still not covered (below). PRD 14's PHI minimization text is unchanged in substance.
- `docs/product/test-matrix.md`: MOD-13, MOD-14.
- Not covered, recorded: nicknames (Bob for Robert); homoglyphs (Cyrillic `а` for Latin `a`; a payer letter's text is not
  adversarial and OCR in Latin mode does not emit them); digits of other scripts (`٣`); a name written in a script other
  than the records'; a date of birth written in a form `datesIn` does not read (`1961 March 3`). None is new; each is
  recorded in the ADR as a residual.

## 6. Coordination
`co-001/contract-phi-check` (#120, in another session) appends `screenIdentifier` and `identifierRuns` to `redact.ts`
right after `identifierCandidates`, adds `redact.test.ts`, amends ADR 0070 (Part 3; not ADR 0054), and also changes
`packages/model-gateway/src/index.ts` and `testing.ts`. This PR keeps its new tests in `redact.property.test.ts`, changes
`redact.ts` above that appended block (but rewrites `identifierCandidates`, the function the block follows, so the PR
merged second resolves an adjacent-hunk conflict keeping both), adds nothing to `index.ts` or `testing.ts`, and adds its
ADR 0054 amendment as its own dated section. MOD-13 and MOD-14 are free (that branch stops at MOD-12).

## 7. Review and departures (as built, 2026-10-27)

Each finding of the design review, and how the build applied it:

1. **Default-ignorables removed word boundaries (blocking).** Applied. In the view names and numbers are matched on, a
   run of default-ignorables (and a mark with nothing to sit on) becomes one U+00AD, which is neither a letter nor a
   digit (so it bounds a word) and is in both joiner classes (so it joins inside one). The Hangul fillers and U+180E are
   white space. `datesIn` runs on the view with them dropped and on the view with them as spaces, and the readings are
   united. `identifierCandidates`' tokens treat them as a joiner between tokens, so it offers the single tokens and
   the joined runs. Named tests: ZWSP between words, between a label and an ID, after a DOB; Hangul filler between words.
2. **Tests that prove only the matcher (blocking).** Applied. MOD-13's oracle is the generator: it records each
   segment it wrote an identifier, name part, initial or date of birth into, and asserts each letter or digit of them
   lies in a replaced span (`redactionSpans`, exported for this, with the output asserted equal to the letter with
   those spans replaced). A frozen copy of today's redaction, with positions tracked, is a second oracle: every letter
   or digit it replaced is replaced now, except in a date that is not a date of birth or an amount (findings 4 and 6).
   An over-redaction property sends common phrases, amounts, deadlines and `REF-SYN-77` unchanged. Deseret (with case)
   and an emoji next to a name are in the generator and in named tests.
3. **Name joiners made names of common phrases.** Applied: inside a part, a space or `.` only where it leaves pieces
   of two letters or more each capitalized as written (`spacedPiecesPass`); between the parts the records hold apart,
   white space, `.` and `,` join freely (so `jane q zephyra` and `Zephyra, Jane` still match). Dashes, apostrophes, `_`
   and invisible characters join anywhere.
4. **`.` made numbers of amounts; mentionsIdentifier's reach.** Applied. `.` and `_` join a number only next to a
   letter. A digits-only number is not taken after a currency sign or before cents. Departure (safer): a digits-only
   number inside a date that is not a date of birth is dropped only when written with separators; "Claim 20270315"
   (also a compact date) is still replaced, since dropping every date-shaped match would send a date-shaped claim
   number. `mentionsIdentifier` takes typed lists (`{ names, numbers }`); `NarrativeInput.names` (optional) says which
   identifiers are names, the worker's `scheduleIdentifiers`/`packetDraftInputs` now return `names` and the web drafter
   passes them; without it a value with no digit is a name (the eval set and older callers).
5. **Longest-member merge dropped a claim.** Applied: the placeholder is chosen by kind (claim, lowest n; member;
   date of birth; name). MOD-13 asserts each written claim's span is a claim placeholder no higher than its own.
6. **A month-name patient removed the deadline.** Applied: a name match inside a date that is not a date of birth is
   not taken; dates of birth are replaced whole. Named test: JUNE's "June 30, 2027" survives, "DOB June 3, 1961" does not.
7. **Initials missed and over-redacted.** Applied: zero or more white space, apostrophes or dashes between an initial
   and its name; case judged on the NFKC text, a lower-case initial taken next to a lower-case name; after a name (past
   an optional comma) only when `.` follows or no lower-case word does. Named tests for each case. Bare monograms are a
   residual in the ADR.
8. **Missing separators; forms folded the same way.** Applied: U+2212 and U+2043 in both joiner classes and the name
   split; every form is compacted from the same fold as the letter. Named tests: `JOSÉ GARCÍA` against "Jose Garcia",
   an ID written with U+2212.
9. **Two tokenizers.** Applied: `identifierTokenRuns(text, { joins, maxTokens, keep })` in `redact.ts` is the one
   tokenizer; `identifierCandidates` calls it with the letter's joiners. Proposal to #120: `identifierRuns` calls it
   with the contract screen's stricter `JOIN` (or a follow-on if #120 merges first). Section 6 corrected.
10. **The barrier must survive the fold (nit).** Applied: U+0001 (`BARRIER`), with a test that `fold` keeps it.
11. **Residuals (nit).** Applied: listed in the ADR 0054 amendment. Proposals (glued-name check, SSN and phone by
    pattern as a PRD 14 question) are in the status file, not built.
12. **`identifierSpans` in packets (nit).** Kept as a proposal: it should adopt the shared fold and matcher, with the
    default-ignorable and joiner fixes.

Other departures:
- Name forms include each word of a name as well as each part ("O'BRIEN" gives `OBRIEN`, `BRIEN`), so `O’Brien` is
  one placeholder rather than an initial and a part.
- MOD-13's and MOD-14's registry entries use module 10 (`completesIn: 10`), as MOD-07 to MOD-11 do, not 9; the fixtures
  test requires each row's generated `fixtures/synthetic/MOD-1x/expected.json` (written by `pnpm synth --case`), so both
  are added, holding no document.
- The differential and oracle checks compare letters and digits only: a comma or space the old whole-name form
  swallowed is not PHI.
- The existing property test's `fc.pre` (excluding names `PATIENT`/`NAME`) is removed: those names now redact.

### Fix round (the PR #80 reviews, 2026-10-27)

Each finding of the correctness and security reviews, and how it was applied. Every reproduction is a named test in
`functions/denial-letter.test.ts`; the properties were extended so the old code fails them (checked: on the PR head's
`redact.ts` the extended MOD-13 properties fail on `Claim 19900<ZWSP>101` and `Claim 0101-19-90`, and MOD-14 on
`ZZ/000000`).

1. **Digits-only IDs with an invisible character exempted as dates (blocking; security 1).** Applied. A digits-only
   number inside a date that is not a date of birth is kept only when its match holds a dash and the date span is
   separated (a slash, a period, a dash or a month word) with a calendar reading. An invisible character or a space is
   no separator. `Claim 1234<ZWSP>5678`, `Claim 1234<SHY>5678`, `Member 123<ZWSP>456` and `Claim 2027<ZWSP>0315` are
   replaced, and the narrative check refuses them.
2. **Lower-case initial missed on a tie (blocking).** Applied. The range next to an initial is the nearest part: of
   the names starting at one place the shortest, of those ending at one place the latest start. Named tests: the two
   counterexamples (`AA, PATIENT` / `Dear p. aa, Patient:`; `PATIENT CLAIM` / `RE: Patient claim, p.`).
3. **Date-shaped spans with no reading exempted numbers and month words (should fix).** Applied. Only a separated span
   with a calendar reading is kept as another date; `12-34-56`, `1234-56-78`, `8765-43-21`, `44-55-66` as IDs and MAY in
   `May 45, 2027` are replaced. The differential oracle's kept-on-purpose rule now reads each span on its own
   (`separatedDateReadings` in the test, not the code's `readings`), so it no longer mirrors the exemption. Residual
   recorded: a digits-only ID that is a real calendar date written with dashes (`03-15-61` for 031561) is sent.
4. **Amount exemption regressions (should fix; security 2 and 7).** Applied, the safer rule: a member ID is never an
   amount; a claim's digits are an amount only after a currency sign and with cents (`$15000.00`), which with their
   cents are never the claim's own written form. `555001.01`, `555001,12`, `$555001`, `member $12345678`,
   `member $12345678.00` and `Claim 87654321.00` are replaced; `$150.00` and `$15000.00` for claim 15000 are kept. The
   narrative check reads every number as a member ID, so `$12345678` is refused again. The oracle's amounts are a claim's
   digits after a currency sign and before cents, never a member's.
5. **Quadratic initials loop (nit).** Applied. The nearest names are found by binary search over two sorted lists,
   names' cover by a prefix sum, and a candidate is looked at again only when a neighbouring candidate is taken (a
   worklist), so a run is linear up to the sorts. 20 000 initials on either side of a name take under 0.1 s (21 s
   before); a named test runs both directions.
6. **MOD-14 coverage (nit; security 6).** Applied. `/` and `:` join a number next to a letter, in the matcher and the
   screen (`ZZ/1234567`, `ZZ:1234567` replaced; `ZZ/7654321` offered). MOD-14 generates digits-only IDs written with
   spaces, dashes and invisible characters, and `/` and `:` next to a letter. Digits alone with `/` or `.` between them
   (`12/34/5678`, `1234.5678`) stay out, being how dates and amounts are written: recorded as a residual.
7. **Line-break hyphenation (security 3).** Applied. A dash (or an invisible character) followed by a line break, with
   optional spaces, joins inside a part whatever the case: `Van-⏎tree`, `Vantr-⏎ee`, `Van–⏎  tree`, `Jo-⏎ann`.
   Lower-case `jo ann` stays a recorded residual.
8. **Labeled dates of birth not read (security 4).** Applied. Separators are any dash (U+2212, U+2043 too), a slash
   or a period, without the backreference; spaces alone between numbers; an apostrophe, straight or typographic, before
   a two-digit year; `/`, `.` and dashes around a month word. Spaces-alone and compact dates are read as dates of birth
   but never kept as other dates. `datesIn` keeps a shorter form over a longer one when only the shorter has a reading.
   Named tests for `03–03–1961`, `03−03−1961`, `03 03 1961`, `Mar 3 ’61`, `3/Mar/1961`, `03/Mar/61`, with and without the
   records' date of birth.
9. **The screen masked `[CLAIM_7654321]`; placeholder-shaped text in a letter (security 5).** Applied, the safer
   options. The mask hides a placeholder's word only: a claim placeholder past the call's claims keeps its digits
   between two barriers (all of them, for the screen), so `[CLAIM_7654321]` offers 7654321 and `[CLAIM_555001]` fails
   the self-check for claim 555001. Before matching, the letter's own `[` and `]` become `(` and `)`, so the only square
   brackets sent are placeholders and `[CLAIM_1]`, `[claim_2]` or a full-width `［MEMBER_ID］` written by the letter can
   never be cited as a claim. Recorded in the ADR amendment.

The MOD-13 generator now writes digits-only numbers with dashes and invisible characters, and dates' digits as numbers
(compact, or cut where a date's numbers end with one dash); its oracle requires each replaced unless the written text
is a calendar date with its separators that is not the date of birth. The five properties were run once over 60 seeds
at 400 runs each (zero failures; scratchpad `progress/fix1-sweep.log`) before keeping the repository's fixed run counts
(400, 200, 200, 300, 300) unseeded.

### Second fix round (the PR #80 security review, 2026-10-27)

Each finding of the second security review, and how it was applied. Every reproduction is a named test in
`functions/denial-letter.test.ts`, checked to fail on the first fix round's `redact.ts`.

1. **Quadratic time on a crafted letter (blocking).** Applied, the reviewer's fix. The gap after a name
   (`INITIAL_GAP_AFTER`) is one starred class with an optional comma tail, so a failing match no longer backtracks
   over two overlapping classes; a prefix array (`runStart`) records where each run of gap characters starts, so a
   candidate initial is tested only when its run reaches back to the name or initial it would follow. `datesIn` keeps
   its spans in one sweep in order of start (longest first), tracking the furthest end of a span with a reading and
   of any span, which gives the pairwise rule's result since holding is transitive. `inOtherDate` is a binary search
   over the other dates by start with a running maximum of their ends. Named test "redacts a letter crafted to be slow
   in time linear in its length", five 100 kB letters, each with a budget of 3 s for the redaction, the self-check and
   the narrative check: on the first round's code they took 95 s (a 2 000-space gap after a name, then 49 000
   initials), 4.5 s, 9.0 s (`1/1/11 ` repeated), 9.5 s (`1 1 11 `) and 5.9 s (dates and a claim's digits); each now
   takes well under a second.
2. **A dotted chain of initials after the name (should fix).** Applied. After a taken initial the gap is measured
   past its `.`, so `Vantree J.Q.`, `Vantree J. Q.`, `Vantree, J.Q.`, `Vantree Q.J.` and `Vantree J.Q` are taken
   whole (named test "takes every initial of a dotted chain after the name").
3. **Separators not read (nit).** Applied, the safer option, in code rather than as residuals: a date is read with
   `_`, a backslash or `|` between its numbers (`03_03_1961`, `03\03\1961`, `03|03|1961`), and a number joins with
   `#` or `(` next to a letter (`ZZ#1234567`, `ZZ(1234567)`), in the matcher and the screen alike (named test "joins
   a number with "#" or "(" next to a letter, and reads a date written with "_", "\" or "|""). Recorded as residuals
   in the ADR: a date of birth with its day or month spelled out (`MARCH THIRD 1961`), and the `)` sent after
   `[MEMBER_ID]` for `ZZ(1234567)`, which holds no digit.

The ADR 0054 amendment gains a "Time linear in the letter" rule, and the MOD-13 and MOD-14 rows name the new forms
and the time budget.
