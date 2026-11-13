# Review 3: the design rulings of Queues item 40 (head e17c1192 against base 17c234d2)

Method: read the redact.ts hunks and the new tests in item40.diff, then ran the probes in
$S/probe3/p1.ts and $S/probe3/p2.ts on both trees. They use the leaks-test harness: sentOrRefused =
redactLetterForScreen, then holdsIdentifier; the redactLetter text is shown too. All names and numbers are invented.
Member IDs are 76543210 and ZZ7654321, the DOB is 1980-03-14, the name is JANE Q ZEPHYRA unless a row says otherwise.
"Clear" means the identifier's digits or letters are all in the sent text.

## (a) A number character (\p{Nl}/\p{No}) beside an identifier refuses the letter, even where the first reading hid the number. AGREE, but the class is too narrow.
- Head output: `Ref ⑴76543210 on file.` is REFUSED (base sent `Ref (1)[MEMBER_ID] on file.`). `Ref ①76543210`, `76543210²` and `Call 2125550123ↀ` are REFUSED. A number character set apart from the ID is still sent: `Zephyra ¹ was seen.` gives `[PATIENT_NAME] 1 was seen.`.
- Why agree: after NFKC, `⑴` before the ID turns into "(1)", and the placeholder then depends on how NFKC split the run. Judging the letter as its reader sees it is the only rule that stays the same across the 1,154 such characters. The cost is false refusals of footnote or list markers glued to an ID. Those are rare in denial letters, and a refusal fails closed.
- Safer alternative: none is needed for the beside case. The gaps are next to it and are listed under F1 and F2. The rule should cover every non-ASCII decimal digit (`[\p{Nd}--[0-9]]`, about 650 characters NFKC does not fold) and number characters inside an identifier. The cost is one more character class in NUMBER_CHARACTER and in rule (a)'s lookarounds. False refusals would come only from Arabic-script or Indic digits glued to Latin digits, which is near zero in this product.

## (b) An unseen character inside an identifier is caught by one more reading of the whole check, and the letter is refused. AGREE.
- Head output: these are all REFUSED: `Member ID 7654\u00853210 paid`, `DOB 03/1\u00004/1980`, `76543210`, `7654͸ 3210`, `ZZ\u00857654321`, `7\u00856\u00855\u00854\u00853\u00852\u00851\u00850` and `7654\u0085‍3210`. On base every one was sent in clear.
- No false refusals: these are sent unchanged: `Paid\u0085 $10.00 for visit 3.`, `Total 12\u008534 paid`, `Line 1\u0085Line 2 Zephyra` (as `Line 1\u0085Line 2 [PATIENT_NAME]`) and `Member ID 76543210\u0085 01 paid` (as `[MEMBER_ID]\u0085 01`). `Jane\u0085Q\u0085Zephyra` is now REFUSED. Base sent `[PATIENT_NAME]\u0085Q\u0085[PATIENT_NAME]`, which leaked the middle initial, so the refusal is correct.
- Cost: the letter is read twice, and only a letter that holds such a character is. The work counts toward CHECK_WORK_BUDGET, so a letter near the budget with one U+0085 added is refused by the count. That is the tested and accepted outcome.
- The alternative would be to drop or replace unseen characters before the first reading. It is simpler, but it changes what is sent for every letter that holds one, so it is a regression risk to the base's outputs. The chosen design only adds refusals. Keep it.

## (c) A phone number found only by pattern, not stored, is still sent with a number character beside it, as a residual. AGREE, with a caveat.
- Head output: `Call ↀ555-0123 now`, `Call 212ↀ555-0123 now`, `Call (212)ↀ555-0123 now` and `Call 555ↀ0123 now` are sent in clear on both trees. `Call ①555-0123 now` is sent as `Call 1555-0123 now`.
- The rule is not symmetric. With the character AFTER the number, head REFUSES: `Call 555-0123ↀ now` comes out as `[PHONE]ↀ`, which PLACEHOLDER_BESIDE_ONE_NUMBER_CHARACTER catches. So the residual is "the character before the number, or inside it, where the pattern fails to match", not "beside it".
- Why agree: a pattern phone the records do not hold is most often the practice's or the payer's number, not PHI. Refusing every 7- or 10-digit run that touches a numeral would refuse many ordinary letters, such as "①555-0123" in a numbered list.
- Safer alternative and cost: run the phone pattern a second time with number characters read as a space, and refuse on a match. The cost is a few false refusals, plus one more regex pass, which is negligible. Record the before/after asymmetry in the residual's test if the ruling stands.

## (d) Explicit 20 s wall-time limits. The premise does not hold at e17c1192. AGREE with the principle; the change needs the limits added.
- e17c1192 adds no explicit timeout. The only `{ timeout: 20_000 }` in the leaks file is the pre-existing test at line 2562 (line 2557 on base), and denial-letter.test.ts:72 is pre-existing too. The unit project inherits Vitest's 5 s default; only the db project sets 30 s.
- Measured with 2 files in parallel: "the row nearest the budget is read to its end and sent" took 4,150 ms. "...with one U+0085 added is refused by the count" took 3,825 ms. "...goes back as the mark alone" took 4,140 ms. "counts the wider reading's initials on the check's work budget" took 2,715 ms. Run with only a name filter, the first three took 2.4 to 2.5 s each. The three NEAR_THE_BUDGET tests sit at about 80 % of the 5 s default under light load, so they will flake on a loaded CI runner.
- Sound: yes. The product's bound is the counted work (CHECK_WORK_BUDGET, asserted through checkWorkOf). A wall-time limit is only a guard against hangs, and it should be generous. Use 20 s, or the file's existing `LONG = { timeout: 60_000 }`, on the three NEAR_THE_BUDGET tests. A real performance regression is caught by the count assertions, not by the timeout.

## (e) Wider reading: the period after a name whose match ends in one letter belongs to that name. AGREE.
- Fixed on head (base output in brackets):
  - `Zephyr A.J.Q.` gives `[PATIENT_NAME].[PATIENT_NAME].[PATIENT_NAME].` (base `[PATIENT_NAME].J.Q.`)
  - `Ann A.A.` for ANNA gives `[PATIENT_NAME].[PATIENT_NAME].` (base `[PATIENT_NAME].A.`)
  - `Zephyr A．J.Q.` and `Zephyr A․J.Q.`, where NFKC folds the period, are fixed the same way
  - `Zephyr A. J.Q.` is fixed
  - `Maria X.M.` for MARIA X is fixed
- Over-replacement is only of the patient's own letters, and never a placeholder over ordinary words:
  - `Zephyr A. A claim was denied.` and `Zephyr A. I called.` keep the article and the pronoun, because an undotted capital before a lower-case word is not taken
  - `Zephyr A.J.Q. Then A.M.` keeps A.M.
  - `Seen Zephyr A. Q. Zed, PT, signed.` gives `[PATIENT_NAME]. [PATIENT_NAME]. Zed`, replacing another person's initial Q (the cost the test names)
  - `Zephyr A. U.S. Army` for a patient with a part U gives `[PATIENT_NAME]. [PATIENT_NAME].S. Army`. This is a loss of meaning (nit), with no leak.
- Still missed on both trees, initials only:
  - `Zephyr A。J.Q.` (ideographic full stop) gives `[PATIENT_NAME]。J.Q.`
  - `Zephyr A.:J.` gives `[PATIENT_NAME].:J.`
  - `Zephyr A.. J.` gives `[PATIENT_NAME].. J.`

  These are contrived and low-identifying. Treat them as residuals.
- Alternative: take the period after any name, in both readings. That breaks "Zephyra. I am", as the test shows. The chosen bound (the match ends in a letter standing alone, wider reading only) is the right one.

## (f) `Maria.M.L.`, and an undotted last initial before a lower-case word, stay on every tree. AGREE as a residual; a cheap partial fix exists.
- Head output, the same on base, with the patient MARIA M LYRE:
  - `Maria.M.L.` gives `[PATIENT_NAME].M.L.`
  - `Lyre.M.` gives `[PATIENT_NAME].M.`
  - `Maria M L reported` gives `[PATIENT_NAME] [PATIENT_NAME] L reported`
  - `Lyre M L reported` gives `[PATIENT_NAME] [PATIENT_NAME] L reported`
  - `Maria M. L reported` gives `[PATIENT_NAME] [PATIENT_NAME]. L reported`
- Why acceptable: only one or two initials go out, the name itself is replaced, and they are not identifying on their own. A rule that took a capital after "Name." would also take "Zephyra.I" and similar run-on text.
- Cheap improvement, if wanted:
  - For `Name.X.`, take a chain only when the letter after the period is itself followed by a period. `Zephyra.I am` stays.
  - For the undotted case, take an undotted single capital after an initial that was already taken even before a lower-case word, except A, I and O, the only one-letter English words.

  The cost is a handful of rows in initialsNextToNames and their tests. False replacements would be only of capitals that are the patient's own letters.

## Findings
- F1 (blocker; ID sent in clear; pre-existing on base, the same family as R1-3). A non-ASCII decimal digit glued to a stored digits-only number goes out with the number in clear:
  - `Ref ٣76543210 on file.` gives `Ref ٣76543210 on file.`
  - `Ref 76543210१ on file.` gives `Ref 76543210१ on file.`

  Names and dates with the same character are refused (`Ms. Zephyra٣ seen` and `DOB 03/14/1980٣` are REFUSED). The fullwidth and mathematical digits are safe (`１`, `\u{1D7CF}` give `176543210`), because NFKC folds them into a longer number.

  Should be: REFUSED. Fix: add `[\p{Nd}--[0-9]]` to NUMBER_CHARACTER (v flag), or `(?![0-9])\p{Nd}`, and to rule (a)'s lookarounds at redact.ts:4280 and :4284.
- F2 (should; ID sent with one visible character inside; on both trees). A number character inside a stored number:
  - `Ref 7654ↀ3210 on file.` is sent as written
  - `Ref 7654Ⅰↀ3210 on file.` is sent as `Ref 7654Iↀ3210 on file.`
  - `Ref 7654٣3210 on file.` is sent as written
  - `Ref 7654²3210 on file.` is sent as `765423210`, arguably another number

  This is the visible twin of R1-4, which head now refuses for U+0085. The name case is the same: `Zeph²yra was seen.` is sent as `Zeph2yra was seen.`, whereas `Zeph\u0085yra` is replaced.

  Should be: REFUSED, at least where the character is not folded to a digit. Fix: in refusedWithUnseenCharactersJoined, also join runs of [\p{Nl}\p{No}\p{Nd}--[0-9]] that stand between two digits or two letters. The cost is one more character class and the same further reading.
- F3 (should; the guard is missing). The three NEAR_THE_BUDGET tests have no wall-time limit and take 3.8 to 4.2 s against the 5 s default (see (d)). Should be: an explicit `{ timeout: 20_000 }` or LONG.
- F4 (nit). The phone residual is asymmetric (see (c)): after the number it is refused, before it is sent. The residual's test should state which side it means.
- F5 (nit). `Zephyr A. U.S. Army`, where the patient has a name part U, gives `[PATIENT_NAME]. [PATIENT_NAME].S. Army`. Ordinary text is over-replaced and no identifier is sent.
