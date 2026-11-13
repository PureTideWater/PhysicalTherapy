# Review 1 (leaks) of Queues item 40: head e17c1192 against base 17c234d2

Harness: `$S/probe1/lib.mts` copies `sentOrRefused` from redact.leaks.test.ts (redactLetterForScreen, then
holdsIdentifier with checkWorkOf). Patient JANE Q ZEPHYRA, DOB 1980-03-14, member IDs SYNMEMBER0042 / ZZ7654321 /
76543210, claims SYNCLAIM0001 / C2026000417 (all synthetic). Probes: `$S/probe1/{unseen,numerals,inside,inside2,final}.mts`,
outputs `*.out` / `*.tsv` beside them. "Clear" means every letter and digit of the stored value is in the sent text, in order.

## Findings

### F1 (blocker, by parity with R1-3; also on base): a \p{Nl}/\p{No} character INSIDE a stored identifier is sent
- Input (letter): `Member ID 7654ↀ3210 was denied.` (and `৴`, `\u{10107}`, `\u{1D360}`, ... every one of the
  953 Nl/No characters NFKC leaves as they are).
- Head: sent as written. Should be: refused. Base: the same (sent).
- Counted on head: 953 characters x 6 kinds (digits-only member ID `7654@3210`, member ID `ZZ765@4321`, name
  `Dear Zeph@yra,`, DOB `03/14@/1980`, claim `C20260@00417`, SSN `900-12@-3456`): **5,718 of 5,718 sent, identifier in clear.**
- Why: the R1-3 rule asks only whether the character stands *beside a whole* stored identifier (rule (a) and
  PLACEHOLDER_BESIDE_ONE_NUMBER_CHARACTER); split by it, no reading finds an identifier, so nothing is beside one, and
  the check reads the two halves as two short numbers. This is the R1-4 mechanism ("7654<U+0085>3210") with a visible
  numeral where R1-4 has an unseen character, and the R1-4 fix does not reach it (the character is no \p{C}).
- Combined with an unseen character it is still sent: `Member ID 7654\u0085ↀ3210 x`, `7654ↀ\u00853210`,
  `7654\u{E0080}ↀ3210` (head: sent, clear; R1-4's joined reading misses it the same way, so both writings agree).
  In my first pass 756 of 756 rows of `7654<unseen>ↀ3210` were these (initially miscounted as hidden by an NFKC classifier).
- Note for the ruling: the matrix records "a stored number with another separator" as MOD-25's cost
  (`7654,3210`, `7654#3210`, `7654:3210`, `(7654) 3210` are sent on head and base). If Nl/No is ruled such a
  separator, this is a recorded cost, not a blocker; but ruling 3 treats Nl/No beside an identifier as refusing, and
  "inside" is the stronger case (all digits on both sides).

### F2 (should; new scope on head, name only): the narrative drafter's check passes a name with an Nl/No inside
- Input to holdsNameOrNumber: `Patient Zephↀyra x`, names [JANE Q ZEPHYRA].
- Head: false (sent to the model), 953 of 953 NFKC-stable Nl/No. Should be: true. Base: same (false).
- Why: the new "apart" reading writes the character as a space ("Zeph yra"), and no name is read apart (item 26).
  Numbers are now caught (member, ZZ, claim inside: 953/953 refused on head, 953/953 sent on base), so the change fixed
  numbers but not names. Lower likelihood: narrative facts are code's own.

### F3 (should; also on base): an initial after a taken name/initial, with an unseen or default-ignorable character before its period, is sent
- `Dear Zephyr A\u0085.J\u0085.Q\u0085., your claim` (JANE Q ZEPHYRA) -> head `Dear [PATIENT_NAME]\u0085.J\u0085.Q\u0085., your claim`.
- `Dear Zephyr A​.J​.Q​., your claim` -> `Dear [PATIENT_NAME]​.J​.Q​., your claim`.
- Not only the (A) form: `Dear Zephyra J\u0085.Q\u0085., your claim` -> `Dear [PATIENT_NAME] [PATIENT_NAME]\u0085.Q\u0085., your claim`;
  `Dear J\u0085.Q\u0085. Zephyra, your claim` -> `Dear J\u0085.Q\u0085. [PATIENT_NAME], your claim`.
- Should be: initials replaced (or refused). Base: identical output.
- Why: initialsNextToNames' gapFrom skips the period only when it is at `preceding.end` exactly
  (`view.text[preceding.end] === '.'`), and the new `itsPeriod` keeps that test; R1-4's joined reading writes the run
  as U+200B, which the view makes VANISHED before the period, so it misses the same way and both writings agree.
  The (A) fix holds only for the period written right after the name's last letter.
- Same class, other joiners (head and base): `Dear Zephyr A/J/Q/` -> `[PATIENT_NAME]/J/Q/`; `A:J:Q:`, `A·J·Q·`,
  `A。J。Q。` likewise; and for a whole name `Dear Zephyra J/Q/` -> `[PATIENT_NAME] [PATIENT_NAME]/Q/`.

### F4 (should; also on base): characters that render blank but are not \p{C} split a stored number
- `Member ID 7654\u{1D159}3210 x` (MUSICAL SYMBOL NULL NOTEHEAD, So, blank glyph) -> sent as written, clear.
- `Member ID 7654￼3210 x` (OBJECT REPLACEMENT CHARACTER, So) -> sent, clear.
- UNSEEN_CHARACTER is \p{C} only and BLANK lists seven characters; these are neither. With U+0085 beside them
  (`7654\u{1D159}\u00853210`) the letter is still sent. U+16FE4 (Khitan filler) is hidden.

### F5 (nit; also on base): last undotted initial before a lower-case word
- `ZZ/ZZZZ Z.Z.Z was seen.` (ZZZZZZ) -> head `[PATIENT_NAME].Z was seen.` (the design note's own example, in this frame);
  `Zephyr A.J.Q was seen.` -> `[PATIENT_NAME].[PATIENT_NAME].Q was seen.` (base `[PATIENT_NAME].J.Q`); `Zephyra J.Q was seen.`
  -> `... .Q was seen.` for a plain name too. This is the standing "Vantree, I am" rule (beforeLowerCaseWord), not (A);
  the head's test rows for (A) use frames without a lower-case word after.

### F6 (nit, API shape): redactLetter (exported from model-gateway) returns the identifier in clear with only the mark after it
- `redactLetter('Member ID 7654\u00853210 x', ...)` -> text `Member ID 7654\u00853210 x\u0001`. Refused only for a caller
  that runs holdsIdentifier; no production caller uses redactLetter today (only the re-export in index.ts). Same shape as
  the existing past-budget answer.

## What held on head (counts)
- Unseen characters (57 Cc, 32 non-ignorable Cf, 270 Co sampled, 393 Cn sampled, 4 lone surrogates = 756) x 32 forms
  (inside a digits-only number; beside a dash, space, slash or period on each side; beside a numeral before/after;
  beside a placeholder `76543210@1`, `1@76543210`, `ZZ7654321@ↀ`; inside ZZ7654321; inside/after a name word;
  inside a DOB in four writings; inside an SSN, a phone, two claim numbers): 0 sent clear except the 756 `7654@ↀ3210`
  rows of F1. Base: these were sent.
- Every \p{Nl}/\p{No} (1,154) beside a digits-only number in the four forms (bare and after `Member ID`, before and after),
  with nothing between and with each of U+200B, U+034F, U+0308, U+200D, U+FE0F, U+0085, U+20E3, U+00AD between:
  **41,544 of 41,544 refused** (base: 3,804 clear with nothing between). No Nl/No row beside a number is still sent.
- Nl/No before/after a name (`Dear @Zephyra,`, `Dear Zephyra@,`): 2,308 of 2,308 refused (base 98 clear).
- Lone surrogates (D800, DBFF, DC00, DFFF) beside and inside a number, a name, a DOB, an SSN, a phone, a claim, ZZ7654321,
  and after U+2180: 13 forms, none clear (base: 6 clear). Unassigned U+0378 / U+10FFFF beside a dash in a number: refused.
  Default-ignorable unassigned U+E0080 inside a number: hidden (the view drops it).
- Non-ASCII Nd (760) beside a number: 3,040 hidden; non-ignorable marks (770) inside a number or name: 2,310 hidden;
  keycap digits `7⃣6⃣...`: hidden.
- The drafter's check and budget: every refusal on the R1-3/R1-4 paths ends in BARRIER, which holdsIdentifier refuses at
  its first line; the further readings count from the letter's count and answer refused past CHECK_WORK_BUDGET, and
  workOfRedacted carries further.spent to the check. I found no input where the redaction's mark is dropped or the
  further reading's text is sent; the leaks above pass because both readings agree, not because the check is skipped.
- Not this item's (question 3, the 201 NFKC-rewritten characters): `Member ID 7⑺6543210` is sent as `7(7)6543210`
  on head and base (5 such rows inside a number).
