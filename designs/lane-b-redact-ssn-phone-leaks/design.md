# Design: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

W5, 2026-11-11, as fixed after the two adversarial design reviews and the two adversarial build reviews (PHI and
regressions; must-stay damage and logic).
Base `claude/build-platform` ef3e8d20 (#138). Synthetic data only. Records: ADR 0054 (the amendment of 2026-11-04,
rulings A, A' and B), `LANES.md` Queues item 22, the status file `approval-summaries/lane-b-redact-ssn-phone-leaks-status.md`.

> **Read first (2026-11-11 09:40 UTC):** the rules as built at 0ddfa078 are stated in `adr-0054-amendment-draft.md` beside
> this file (the text that goes into ADR 0054 in the PR, its measured section still to fill from the final gate). The
> sections "Every letter" and "A held letter only" below are the design as it stood at a64cc9af, before the findings
> recovered from the two cut-off reviewers of the fix round (`reviews/c1`, `reviews/c2`); where they differ, the draft
> amendment is right: ef3e8d20's reading stands and the look-alike reading only adds; structure decides the glued shape
> (four digits or more, a currency amount, cents or a date before it; cents after a point, a second shape or a date after
> it); the masked rule, the "may" rule, the list number in parentheses and the name pieces are narrower.

## What must hold
1. Every pinned row of `redact.residuals.json` classes `ssnPhone` (697, ruling A) and `ownIdentifierA` (406, ruling A')
   flips to redacted or refused; the gate against cc3dd7f6 reads SSN 0 and phone 0.
2. Ruling B (a name part that is a month's word, next to a date) has a decided rule.
3. Nothing ef3e8d20 protects is sent: the gate with ef3e8d20 as tree A reads no `PHI.*`.
4. Must-stay damage is measured (the gate's `KEEP.*`, MOD-16's generator, the reviewers' letter generators) and each new
   safer-reading cost is recorded in ADR 0054.

## The principle
Two tiers. **In every letter**, the shapes structure decides. **In a held letter only** (a letter whose digit chain only
the range fix's barriers hold; cc3dd7f6 refused every one), the shapes no structure decides are refused as cc3dd7f6 refused
them; in a letter with no held range those shapes stay the recorded residuals of ADR 0054 (R1's `150.00 1234`, a code
column, a local number with no label). A new redaction is made only where ef3e8d20 refused nothing for the number;
everything else the change adds is a refusal.

## Every letter
- **G1, another number's digits glued to an SSN's or a phone's own shape** (`gluedShape`): three groups joined by joiners
  with no white space (a dash at a line's end and the next line too), the middle one of two digits (three for a phone; a
  slash only for a phone), the first of three or more and the last of four or more, one of them longer. Refused where
  structure says whose the other digits are: after it, an amount's end after its last group or a group joined to that group
  (`900-12-3456150.00`, `202-555-0123202-555-0124`); before it, a currency amount's digits or a group joined to its first
  group (`$150.00900-12-3456`, `$514451/293-6215`, `01/01/2020900-12-3456`, `150.00900-12-3456`); unless a reference's noun
  names the whole number (`Case No. 123-45-678901-02`, `Policy No. 01-23456-78-9012`). Under an SSN, phone or Medicare
  label the shape is the person's number whatever is glued to it, in the number's usual writing too (`SSN No.
  900-12-345678`, `Phone number (202) 555-01234567`, `Medicare ID 900-12-345678`). With no structure and no label a longer
  group is as often a reference's (`Tracking 123-456-78901`, `Claim # 20260115-12-3456`, `29 CFR 2590.715-2719`): sent as at
  cc3dd7f6, and refused in a held letter only (`900-01-202012th`). No other word names a number (`Patient #
  900-12-3456150.00` is refused).
- **G6, a number glued to an amount's digits**: a run of nine digits or more before a decimal point is no amount (so the
  scan reads the run); a run of eleven or more with an amount's end after it is refused (`900123456150.00`,
  `20255501231,250.00`) unless a noun names it (`ICN 12345678901234.01`); and an amount's cents with a nine or a ten right
  after them (`150.00900123456`, `$150.002025550123`).
- **G2, a masked SSN glued** to a letter or a digit before it that is no mask character, the mask in an SSN's own shape:
  three mask characters, a gap the masked pattern reads, two, such a gap and four digits (`PaidXXX-XX-3456`,
  `2020***-**-3456`, `PaidXXX - XX - 3456`, `FaxXXX-XX-3456`): refused in every letter. Five mask characters and four
  digits, or a gap missing, is as often a masked account number (`Acct#XXXX1234`, `Acct No.XXXXX1234`): refused in a held
  letter only, as at ef3e8d20.
- **G3, a Social Security label glued to the word before it**: `SSN`, `SOC SEC` and `HICN` in any case (`PatientSSN 900.12
  3456`, `PATIENTSSN`, `PatientSocialSecurityNumber`, `PatientHICN`; never `Assn` or `ISSN`), and `SS#`, `SS No` and `HIC`
  where a change of case sets them apart (`PatientSS# 900.12 3456`): read as the label by the survivor scan only (a
  refusal, never a redaction). The phone labels are not read glued, and `SS#`, `SS NO` and `HIC` in capitals throughout
  are not: words end in them (`Fairfax`, `smartphone`, `CLASS#`, `ADDRESS NO`); recorded.
- **G4, a label read through the call's own identifier**: the label reads the text as it reads it with the identifier gone,
  across the one line break a label reads too (`SSN for Zephyra: 90012-3456`, `Call Zephyra at 555-0123`, `Phone (Jane
  Zephyra, home): 555.0123`, `Phone Zephyra⏎555-0123`). The scan reads its chain's label so, and its read over the numbers
  before an amount (refusals: `SSN (Jane Zephyra, patient): 90012-3456`, `Phone Zephyra, Jane: 900 13 9434.00`). The
  patterns redact through it a number whose own words say nothing; a number a noun names stays named.
- **G5, a label's list number**: one or two digits right after an SSN or phone label (`No.`, `#`, a period, a dash, a colon
  or an opening parenthesis between them too) and before `:` or `)` (an ordinal's suffix, a space or a word in parentheses
  before it too) are read through on the same terms: `Phone 1: 555-0100`, `Tel. 1: 555-0100`, `Phone (1): 555-0100`, `Phone 1
  (home): 555-0100`.
- **A match ef3e8d20 did not make is applied only where it is safe** (`appliedMatches`): a number a label names only through
  the call's own identifier or a list number, and a member ID or claim number in a form only this reading reads, are
  redacted only in a letter the scan, read as ef3e8d20 read it, does not refuse without them. Where it does, ef3e8d20
  refused the letter, and it stays refused with those numbers as written (`Call Zephyra at 555-0123/555-0124`, an invisible
  character between them or not; `ID SYNMEMBERO042 555-0123`). No test of what stands beside the number: an invisible
  character defeated the one the build first had (build review B1-1).
- **G7, a pattern's placeholder is a number to what is glued to it**: where `[SSN]` or `[PHONE]` has a letter against it
  (invisible characters or a mark between them too), the glued own-identifier check runs once more with a digit on that
  side.
- **The look-alike fold (ruling A') is for the call's own identifiers only.** `fold` folds case first and then reads a
  letter or digit that the Unicode confusables data (UTS #39, 10.0.0) maps to one ASCII letter or digit as that one (395
  entries), and the 16 small capitals the data maps elsewhere (`confusables.ts`, 411 entries), taking the capital's
  look-alike or, where it has none, its small letter's. The views names, member IDs, claim numbers and dates of birth are
  matched on read it; the Social Security and phone patterns and the survivor scan fold as ef3e8d20 folded (build review
  B1-3 and B1-14: a Cyrillic letter that looks like a digit ended a label's window, and a keep-noun spelled in look-alikes
  kept a number). A decimal digit of any script is its value in every view. A name part of two or three letters written
  wholly in another script's letters is that script's word (`на` is no HA).
- **Digit-for-letter forms (ruling A')**, letter reader only: a word that reads as one of the call's own name parts, member
  IDs or claim numbers position by position with a digit for a letter or a letter for a digit (O/0, l/1, I/1, S/5, B/8, and
  E/3 for the pinned `VANTR3E`; another script's digit that looks like a letter too), half of its characters or more the
  form's own, not digits alone, the form five characters or more (six for digits alone), is redacted as that identifier,
  written in pieces too with a joiner its plain pattern reads between them (`ZZ 765432l`, `VAN-TR3E`). Inside a longer run
  of letters and digits it is refused, and so is the form spelled with a look-alike among its letters there
  (`150.00νantree`); no pattern redacts a part of such a run first. Never a letter for a letter (`well` is no WEIL). A
  month's word and digits with no space is a date (`MAR13` is no MARIE). A form of four is as often an ordinary token
  (`11am`, `CO13`, `80th`): not read.
- **Name joiners**: the middle dot (U+00B7), the hyphenation point (U+2027), the bullet operator, the dot operator and the
  bullet join a name's pieces as a hyphen does (`Zeph·yra` is redacted).
- **The checks' own marks**: a letter's own U+0001, U+0002 or U+0003 is read as the control character it is, never as a
  placeholder (build review B1-4).
- **Ruling B**: a month word that is a name part is a date's month only in a date with two numbers or more (a day and a
  year: `May 5, 2026`, `3 June 2026`). `May 2020` and `June 103`, which the date reader takes as a day and a year run
  together, are the name: redacted.

## A held letter only (`heldStrict`, `heldBirthUnread`)
- An amount (with or without a currency sign), a dash and a date as one range holds nothing: refused. A date and then an
  amount stands as at ef3e8d20.
- Beside a held range: a number no barrier holds, or one a noun names, joined to its end by a joiner alone; a number no
  barrier holds before its first end across white space; a word glued to its end and then a bare nine or ten; a number of
  seven digits or more, one or two letters and a date with nothing between.
- Chains read again with unsigned amounts and groups of five to seven digits as parts of a chain, twelve groups at most,
  after what must stay is placed (a currency amount; a standing date; a nine or ten that NPI, TIN or EIN names; a ZIP or
  ZIP+4 after a state's abbreviation or name or ZIP; two five-digit codes joined by a dash or slash; a TIN written two and
  seven after TIN, EIN, FEIN or Tax ID; the codes of a list a code word begins; a service-line row's code and units before
  its amount, modifiers between them too; a code and the next line's count; a code's digits after its one letter): nine or
  ten digits, eleven starting with 1, or a local number of three and four, holding one group no barrier holds, refuses;
  under an SSN or phone label, nine digits or more of groups no barrier holds. A year beside an amount stays, and a local
  number's shape inside a longer token or after a currency amount.
- A date written two, two and four with dashes and a lone digit across white space beside it, never a time after it.
- The date of birth in writings no rule reads: a Roman-numeral month with day and year, the year of two digits too; the
  CJK date characters, the year of two digits or left out too; its year in words within 48 characters after its month's
  word; its month's word (no part of a longer word) with its day, in digits or as an ordinal's word, and no year after it
  (`Mar 14th`, `March the 14th`, `14th of March`, `March fourteenth`); its two-digit year, month and day run together as
  four or five digits, or six in an order a date is written in, at the start or end of a run of digits (not four digits
  that read as a year 1900 to 2099). The month of May is a verb too: after a day it is the month only with an ordinal's
  suffix or "of" before it, or with no word after it on its line (`Visits over 12 may require` is no date of birth).
- What a held letter places by its structure reads more of its ordinary writings since the build reviews: a state written
  `D.C.` or `N.Y.`, a comma, a period or a line break before the ZIP, the territories and military codes; `Tax ID #:`, `Tax
  I.D.`, `Taxpayer ID`, `(TIN)`; `CPT code(s)`, `CPT®`, `CPT-4`, the codes on the next line; an ICD-10 code's digits after
  its point; a row's units in parentheses.

## What changes in the generators (changed with the rules, nowhere else)
- MOD-16 no longer writes, in a letter with a service period or range, an unlabeled local number (`555-0100 local`: in a
  held letter it is refused), nor glues a segment that begins with a word and holds a bare nine or ten to a range's end
  (`…2026Ref. No. 2025550123`); and it draws no run of digits that begins or ends with its patient's two-digit-year date
  of birth run together. Each is pinned on both sides by a fixed test (held: refused; not held: sent unchanged).
- MOD-21 (new): the SSN and phone shapes above; MOD-22 (new): the call's own identifiers through the fold.

## Measured
The status file's RESUME-BLOCK holds the current numbers.

## Recorded, not closed
- In a letter with no held range: an unlabeled amount-shaped number, a five-four with no ZIP before it, a local number with
  no label, nine single digits, initials written together and a short part split, the date-of-birth writings above: as at
  cc3dd7f6 (ADR 0054's residual list).
- A phone label glued to the word before it; `SS#`, `SS NO` and `HIC` glued in capitals throughout; a label, a keep-noun or
  a month's word spelled with another script's look-alikes (read as ef3e8d20 read them); a second number after "or" in a
  phone list; a bare seven digits after a label with a word between; a letter O for a zero inside an SSN or phone;
  digit-for-letter pairs beyond the six; a name part of four letters in a digit-for-letter form (`L1AM`); a look-alike
  whose small letter looks unlike its capital inside a name split by a joiner (`νan-tree`); letters with a stroke;
  look-alikes later Unicode versions added; a control character inside a number or a name (both trees).
- A number glued so that a bare nine or ten reads across the join (`123456900-12-3456` is `[SSN]-12-3456`, as at ef3e8d20);
  the shape wrapped before its last group with an amount glued after it (`900-12-⏎3456150.00`); the shape written with
  spaces and no label with an amount glued after it (`900 12 3456150.00`); a number a reference's noun names with digits
  glued after it (`Case No. 123-45-678901.00` is sent).
- Costs of the safer readings: what ef3e8d20 refuses without the patient's name it now refuses with it (`Contact Jane
  Zephyra, Springfield, IL 62701-1234`); a currency amount of four digits or more glued to two or three digits and four
  (`$1500-12-2026`, `$1000/250/5000`); a nine with a decimal fraction (`Visit ID 123456789.1`) and a fraction of eleven or
  twelve digits; a reference of three, two (or three) and five digits or more with a group joined after it and no noun
  before it; a code that reads as the patient's own all-digit member ID with a letter for a digit (`S83511A` for member ID
  583511); a name that is a plural word and its singular with a 5 (`Week5` for a patient Weeks).
- For a patient whose name part is a month's word: that month in a month-and-year phrase is redacted as the name.
- **MOD-23** (`LANES.md` Queues item 26, to land before any real PHI is processed, after this PR and the packets verifier's
  fold): a name written with a lower-case piece after a space or a period (`Zephy ra`, `Zephy. ra`) and a name written
  letter by letter (`Z e p h y r a`) are sent in clear in a letter with no held range by cc3dd7f6, ef3e8d20 and this head
  alike, and refused in a held one. Reproduce: `node name-forms.mts <redact.ts>...` in the gate folder
  (`designs/lane-b-redact-ssn-phone/gate/leaks-scripts/`), one column per tree.
