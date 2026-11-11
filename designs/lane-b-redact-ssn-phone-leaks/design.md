# Design: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

W5, 2026-11-11, as fixed after the two adversarial design reviews (PHI and regressions; must-stay damage and logic).
Base `claude/build-platform` ef3e8d20 (#138). Synthetic data only. Records: ADR 0054 (the amendment of 2026-11-04,
rulings A, A' and B), `LANES.md` Queues item 22, the status file `approval-summaries/lane-b-redact-ssn-phone-leaks-status.md`.

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
- **G1, another number's digits glued to an SSN's or a phone's own shape** (`gluedShape`): three groups no barrier holds,
  joined by joiners with no white space, the middle one of two digits (three for a phone; a slash only for a phone).
  Refused when (a) the first group is three digits and the last longer than four (`900-12-3456150.00`,
  `202-555-0123202-555-0124`), unless a noun names the number (`Case No. 123-45-678901`, `Ticket 802-91-69413`, `Inquiry #
  150-98-68279`); a number under an SSN or phone label is never named (`SSN No. 900-12-3456150.00`, `Phone number
  202-555-01234567`), and no word is a namer for ending in one's letters (`Paid-975-20-18460.00`, `Medicaid 900-12-345678`);
  (b) the last is four digits and the first longer than three, where the digits before the shape are another
  number's: joined to a group before them, after a currency sign, or four or more of them (`01/01/2020900-12-3456`,
  `$514451/293-6215`); (c) both longer, on the same condition. A group one to three digits longer alone is a reference's
  (`29 CFR 2590.715-2719`), and a year-first date with digits after its day (`2020-01-02150.00`) is read as cc3dd7f6 read it.
- **G6, a number glued to an amount's digits**: a run of nine digits or more before a decimal point is no amount (so the
  scan reads the run), and a run of eleven or more with cents after it is refused (`900123456150.00`) unless a noun names
  it (`ICN 12345678901234.01`).
- **G2, a masked SSN glued** to a letter or a digit before it that is no mask character (`PaidXXX-XX-3456`,
  `2020***-**-3456`): refused in every letter (ef3e8d20: only in a held letter). `XXXXXX1234` is a masked account number.
- **G3, a Social Security label glued to the word before it** (`PatientSSN 900.12 3456`, `PATIENTSSN`,
  `PatientSocialSecurityNumber`): read as the label by the survivor scan only (a refusal, never a redaction); never `Assn`
  or `ISSN`. The phone labels are not read glued: words end in them (`Fairfax`, `smartphone`); recorded.
- **G4, a label read through the call's own identifier** on the number's line: the label reads the line as it reads it
  with the identifier gone (`SSN for Zephyra: 90012-3456`, `Call Zephyra at 555-0123`, `Phone (Jane Zephyra, home):
  555.0123`, `Tel: ZZ7654321 - 9001 23456`). The scan reads its chain's label so, and its read over the numbers before an
  amount (refusals: `SSN (Jane Zephyra, patient): 90012-3456`, `Phone Zephyra, Jane: 900 13 9434.00`). The patterns redact
  through it only a number whose own words say nothing, written on one line, with no digit joined to it as a chain joins:
  there ef3e8d20 refused nothing for the number, so no refusal becomes a sent letter. A number a noun names stays named
  (`Phone call with Jane Zephyra regarding claim 230957851`). The cost is the base's own, on one more line: what ef3e8d20
  refuses without the name it now refuses with it (`Contact Jane Zephyra, Springfield, IL 62701-1234` as `Contact
  Springfield, IL 62701-1234`; `Phone on file for Zephyra, 760.39-2,673.50` as `Phone on file 760.39-2,673.50`). A narrower
  reading (only a connecting word between the identifier and the number) was built and withdrawn on the gate's evidence: it
  sent `Phone (Jane Zephyra, home): 555.0123` and `SSN (Jane Zephyra, patient): 90012-3456` with the number in clear.
- **G5, a label's list number**: one or two digits right after an SSN or phone label (`No.`, `#`, a dash or a colon
  between them too) and before `:` or `)` (an ordinal's suffix or a space before it too) are read through, on the same terms
  as G4: `Phone 1: 555-0100` is `Phone 1: [PHONE]`; `TTY 11) 555 0123` stays refused (nine digits in one chain) and `Tel 1)
  555-0123` stays as at ef3e8d20; `TTY 1: Questions? 150.00 120.00 30.00` is refused as ef3e8d20 refuses `TTY: Questions?
  150.00 120.00 30.00`.
- **G7, a pattern's placeholder is a number to what is glued to it**: where `[SSN]` or `[PHONE]` has a letter against it
  (invisible characters between them too), the glued own-identifier check runs once more with a digit on that side, so
  `[SSN]thZephyraPaid` is refused as `0123thZephyraPaid` is.
- **The look-alike fold (ruling A')**: `fold` folds case first and then reads a letter or digit that the Unicode
  confusables data (UTS #39, 10.0.0) maps to one ASCII letter or digit as that one (395 entries), and the 16 small capitals
  the data maps elsewhere (`confusables.ts`, 411 entries), taking the capital's look-alike or, where it has none, its small
  letter's, so both cases of a letter fold to one thing. A decimal digit of any script is its value in every view (the
  call's own number in Arabic-Indic or Devanagari digits is read).
- **Digit-for-letter forms (ruling A')**, letter reader only: a word that reads as one of the call's own name parts, member
  IDs or claim numbers position by position with a digit for a letter or a letter for a digit (O/0, l/1, I/1, S/5, B/8, and
  E/3 for the pinned `VANTR3E`), half of its characters or more the form's own, not digits alone, the form four characters
  or more (six for digits alone), is redacted as that identifier; the same inside a longer run of letters and digits is
  refused. Never a letter for a letter (`well` is no WEIL). A word that is the form itself spelled with another script's
  look-alikes is redacted too.
- **Name joiners**: the middle dot (U+00B7) and the hyphenation point (U+2027) join a name's pieces as a hyphen does
  (`Zeph·yra` is redacted): the measurement the packets verifier's fold asked for (its status file, row D1-2).
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
- The date of birth in writings no rule reads: a Roman-numeral month with day and year; the CJK date characters; its year
  in words within 48 characters after its month's word; its month's word (no part of a longer word) with its day and no
  year after it (`Mar 14th`, `March the 14th`, `14th of March`); its two-digit year, month and day run together as four or
  five digits at the start or end of a run of digits (not four digits that read as a year 1900 to 2099).

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
- A phone label glued to the word before it; a second number after "or" in a phone list; a bare seven digits after a
  label; a letter O for a zero inside an SSN or phone; digit-for-letter pairs beyond the six; a name split by a space and
  confused; look-alikes later Unicode versions added.
- For a patient whose name part is a month's word: that month in a month-and-year phrase is redacted as the name.
- **MOD-23** (`LANES.md` Queues item 26, to land before any real PHI is processed, after this PR and the packets verifier's
  fold): a name written with a lower-case piece after a space or a period (`Zephy ra`, `Zephy. ra`) and a name written
  letter by letter (`Z e p h y r a`) are sent in clear in a letter with no held range by cc3dd7f6, ef3e8d20 and this head
  alike, and refused in a held one. Reproduce: `node name-forms.mts <redact.ts>...` in the gate folder
  (`designs/lane-b-redact-ssn-phone/gate/`), one column per tree.
