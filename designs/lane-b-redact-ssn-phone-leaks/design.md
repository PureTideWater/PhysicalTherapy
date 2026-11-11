# Design: SSN and phone leaks (`co-001/redact-ssn-phone-leaks`; MOD-21, MOD-22)

W5, 2026-11-11. Base `claude/build-platform` ef3e8d20 (#138). The prototype is WIP `co-001/wip-redact-ssn-phone-leaks`.
Synthetic data only. Records: ADR 0054 (the amendment of 2026-11-04, rulings A, A' and B), `LANES.md` Queues item 22.

## What must hold
1. Every pinned row of `redact.residuals.json` classes `ssnPhone` (697, ruling A) and `ownIdentifierA` (406, ruling A')
   flips to redacted or refused; the gate against cc3dd7f6 reads SSN 0 and phone 0.
2. Ruling B (a name part that is a month's word, next to a date) has a decided rule.
3. Nothing ef3e8d20 protects is sent: the gate with ef3e8d20 as tree A reads no `PHI.*`.
4. Must-stay damage is measured (the gate's `KEEP.*`, MOD-16's generator) and each new safer-reading cost is recorded
   in ADR 0054.

## The principle
The change only adds redactions and refusals. Two tiers:
- **In every letter**, the shapes structure decides.
- **In a held letter only** (a letter whose digit chain only the range fix's barriers hold; cc3dd7f6 refused every one),
  the shapes no structure decides are refused as cc3dd7f6 refused them. In a letter with no held range those shapes stay
  the recorded residuals of ADR 0054 (R1's `150.00 1234`, a code column, a local number with no label).

## Every letter
- **G1, digits glued to a number's own shape** (`gluedShape`): three groups no barrier holds, joined by joiners with no
  white space, of three digits or more, two (three for a phone; a slash only for a phone) and four or more, one outer group
  longer than the shape's: `900-12-3456150.00`, `01/01/2020900-12-3456`, `900.12.34563456`, `202)555-01561`. Refused: the
  boundary cannot be known. Not a year-first date with digits after its day (`2020-01-02150.00`), read as cc3dd7f6 read it.
- **G6, a number glued to an amount's digits**: a run of nine digits or more before a decimal point is no amount (so the
  scan reads the run), and a run of eleven or more with cents after it is refused (`900123456150.00`).
- **G2, a masked SSN glued** to a letter or a digit before it (`PaidXXX-XX-3456`, `2020***-**-3456`): refused in every
  letter (ef3e8d20: only in a held letter).
- **G3, a label glued to the word before it**: SSN, SS#, SOC SEC, SOCIAL SECURITY, PHONE, TELEPHONE, FAX, FACSIMILE after a
  letter are read as the label, in any case (`PatientSSN 900.12 3456`, `PATIENTSSN`); the short labels (PH, TEL, CALL, TTY,
  CELL, HIC) are not, since words end in them.
- **G4, a label read past the call's own identifier** on the number's line: the placeholder of the name, member ID, claim
  number or date of birth between a label and its number is read through (`SSN for Zephyra Vantree: 90012-3456`,
  `Call Zephyra at 20255 50123`, `Tel: ZZ7654321-9001 23456`), by the patterns and by the scan. Not across a line break
  (a contact line above a service row). A pattern's own placeholder (`[SSN]`, `[PHONE]`) still ends the window.
- **G5, a label's list number**: one or two digits right after an SSN or phone label and before `:` or `)` are read
  through (`Phone 1: 555-0100`, `Call 2) 202 555 01.23`).
- **G7, a pattern's placeholder is a number to what is glued to it**: the glued own-identifier check runs once more with
  `[SSN]` and `[PHONE]` read as a digit, so `[SSN]thZephyraPaid` is refused as `0123thZephyraPaid` is (without it G4 and G5
  turned 29 refusals of ef3e8d20 into letters sent with the name glued).
- **The look-alike fold (ruling A')**: `fold` reads a non-ASCII letter or digit that the Unicode confusables data (UTS #39,
  10.0.0) maps to one ASCII letter or digit as that one (395 entries), and the 16 small capitals the data maps elsewhere
  (`confusables.ts`, 411 entries). Every reader of the folded view gets it (names, numbers, labels).
- **Digit-for-letter forms (ruling A')**, letter reader only: a word that reads as one of the call's own name parts,
  member IDs or claim numbers position by position (O/0, l/1, I/1, S/5, B/8, and E/3 for the pinned `VANTR3E`), half of
  its characters or more the form's own, not digits alone, the form four characters or more (six for digits alone), is
  redacted as that identifier; the same inside a longer run is refused (with a digit for a letter or the reverse in every
  letter; with l for I too in a held letter).
- **Ruling B**: a month word that is a name part is a date's month only in a date with two numbers or more (a day and a
  year: `May 5, 2026`, `3 June 2026`). `May 2020` and `June 103`, which the date reader takes as a day and a year run
  together, are the name: redacted.

## A held letter only (`heldStrict`, `heldBirthUnread`)
- An amount (with or without a currency sign), a dash and a date as one range holds nothing: refused
  (`1499.90—07/14/2021St`, `0461.36-12/4/22—…`, `$2,025.55-01.09.2020`). A date and then an amount stands as at ef3e8d20.
- Beside a held range: a free or noun-named number joined to its end by a joiner alone (`Ref 5900481017(April 3th,
  2025-7125.74`, `1900123456,01/01/2020–150.00`); a free number before its first end by white space (`34569
  01-12-1985-150.00`); a word glued to its end and then a bare nine or ten (`302.23.Ref 5900335398`); a number of seven
  digits or more, one or two letters and a date with nothing between (`2025550122th10–28–2026`).
- Chains read again with unsigned amounts and groups of five to seven digits as parts of a chain, twelve groups at most,
  after the must-stay structures are placed (a ZIP or ZIP+4 after a state's abbreviation or ZIP; two five-digit codes
  joined by a dash or slash; a TIN written two and seven; codes after a code word; a service-line row of a code, units and
  an amount on one line; a code and the next line's count; a code's digits after its one letter; a currency amount; a
  standing date; a nine or ten that NPI, TIN or EIN names): nine or ten digits, eleven starting with 1, or a local number
  of three and four, with one group no barrier holds, refuses. An amount and a year after it stay (`150.00 2026`), and a
  local number's shape inside a longer token (`SYN-APL-123-4567`) or after a currency amount.
- Under a label, a chain of free groups of nine digits or more.
- A date written two, two and four with a lone digit beside it (`9 01-12-1985`).
- The date of birth in writings no rule reads: a Roman-numeral month with day and year, the CJK date characters, its year
  in words, its month's word with its day and no year after it, and its two-digit year, month and day run together as
  four or five digits at the start or end of a run of digits (not four digits that read as a year 1900 to 2099).

## What changes in the generators (changed with the rules, nowhere else)
- MOD-16 no longer writes, in a letter with a service period or range, an unlabeled local number (`555-0100 local`: in a
  held letter it is refused), nor glues a segment that begins with a word and holds a bare nine or ten to a range's end
  (`…2026Ref. No. 2025550123`); and it draws no run of digits that begins or ends with its patient's two-digit-year date
  of birth run together. Each is pinned on both sides by a fixed test (held: refused; not held: sent unchanged).
- MOD-21 (new): the SSN and phone shapes above, generated; MOD-22 (new): the call's own identifiers through the fold.

## Measured (prototype)
See the status file's RESUME-BLOCK for the current numbers (pinned rows, MOD-16's generator on five seeds, the gate
against cc3dd7f6 and against ef3e8d20).

## Recorded, not closed
- In a letter with no held range: an unlabeled amount-shaped number, a five-four with no ZIP before it, a local number
  with no label, nine single digits, initials written together and a short part split, the date-of-birth writings above:
  as at cc3dd7f6 (ADR 0054's residual list).
- Digit-for-letter pairs beyond the six; look-alikes later Unicode versions added.
