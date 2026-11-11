
## Amendment (`co-001/redact-ssn-phone-leaks`, 2026-11-11): the Social Security, phone and own-identifier forms the range fix exposed

The amendment above ends with three accepted residuals, by the orchestrator's rulings of 2026-11-07: (A) a Social
Security or phone number in a shape no rule reads, in a letter whose chain only the range fix's barriers hold; (A') the
call's own name, member ID, claim number or date of birth in a form no rule reads, in such a letter; (B) a name part that
is a month's word, next to a date. This amendment closes them (test matrix MOD-21 and MOD-22), for the letter reader only
(`letterSubject`'s `patterns`, `redactLetterForScreen` and `holdsIdentifier`). Its design note, the reviews' reproduction
scripts and the differential gate are in the ops repository (`claude/build-ops`,
`designs/lane-b-redact-ssn-phone-leaks/`); every count below is measured on synthetic letters.

- **Acceptance.** Every pinned row of `src/redact.residuals.json` classes `ssnPhone` (697) and `ownIdentifierA` (406) is
  now redacted or refused (632 refused and 65 redacted; 200 redacted and 206 refused), and the 5 rows of `monthWordName`
  have their month word redacted as the name. The differential gate (975,489 letters) reads no SSN, phone or name letter
  against cc3dd7f6 (385, 171 and 5 at ef3e8d20), and none against ef3e8d20 either.
- **Two principles.**
  - *Two tiers.* In every letter, the shapes structure decides are read. In a held letter only (a letter whose digit
    chain only the range fix's barriers hold; cc3dd7f6 refused every one), the shapes no structure decides are refused as
    cc3dd7f6 refused them; in a letter with no held range they stay the residuals recorded above (R1's `150.00 1234`, a
    code column, a local number with no label).
  - *ef3e8d20's reading stands, and this one only adds.* The call's own identifiers are read first as ef3e8d20 read them.
    What only this reading reads is a fresh match (`Found.fresh`): a number a label names only through the call's own
    identifier or a list number (the call's own number found so too); a name written with a joiner ef3e8d20 did not
    read; an identifier found only on the look-alike fold; a digit-for-letter form. The Social Security and phone
    patterns read the settled matches alone as what stands found, so a fresh match ends no label's window and is no item
    of a list. `redactLetterForScreen` applies the fresh matches only in a letter that the scan and the glued checks, read
    as ef3e8d20 read them (`chainLeft` with `strict` false), do not refuse without them (`appliedMatches`). Where they do,
    ef3e8d20 refused the letter: the fresh matches are left as written, and `holdsIdentifier`, whose patterns read through
    the call's own placeholders as redaction read through the identifiers, finds them again and refuses that text (`Call
    Zephyra at 555-0123/555-0124`, an invisible character between the two numbers or not; `ID SYNMEMBERO042 555-0123`).
    `redactLetter` and `redactionSpans`, which no check follows, apply every match. The first build tested instead whether
    the number stood alone, and read one look-alike fold everywhere; the reviews of the build found an invisible character
    that defeated the test (B1-1) and refusals of ef3e8d20 lost to the fold (B1-3, B1-14, C1-3, C1-4).
- **In every letter.**
  - *Another number's digits glued to an SSN's or a phone's own shape* (`gluedShape`, in the survivor scan): three groups
    joined by joiners with no white space (a dash at a line's end and the next line too), the middle one of two digits
    (three for a phone; a slash only for a phone), the first of three digits or more and the last of four or more, one of
    them longer. Refused where structure says whose the other digits are. Before the shape: a currency amount's digits,
    four digits or more, an amount's cents joined by a point to the group before, or the end of a date (`$150.00900-12-3456`,
    `$514451/293-6215`, `2020900-12-3456`, `01/01/2020900-12-3456`, `150.00900-12-3456`, `01/02/20900-12-3456`). After a
    shape that starts at its group's start: cents after a point, a second shape begun in its last group, or a date
    (`900-12-3456150.00`, `202-555-0123202-555-0124`, `202-555-012301/02/2020`). A reference's noun and what stands between
    it and its number name the whole joined number, and the letter keeps it (`Case No. 123-45-678901.00`, `Claim #
    20260115-12-3456`, `Policy No. 01-23456-78-9012`); no other word names one (`Patient # 900-12-3456150.00` is refused).
    Under an SSN, phone or Medicare label the shape is the person's number whatever is glued after it, in the number's
    usual writing too (`SSN No. 900-12-345678`, `Phone number (202) 555-01234567`, `Medicare ID 900-12-345678`). With no
    structure and no label, a longer group is as often a reference's (`Tracking 123-456-78901`, `Referral #
    123-45-67890-01`, `2026-0115-123-4567`, `29 CFR 2590.715-2719`): sent as at cc3dd7f6, and refused in a held letter
    only (`900-01-202012th`).
  - *A number glued to an amount's digits*: a run of nine digits or more before a point is no amount, so the scan reads
    the run; a run of eleven or more with cents after a point is refused (`900123456150.00`) unless a noun names it (`ICN
    12345678901234.01`); and an amount's cents with a nine or a ten right after them (`150.00900123456`,
    `$150.002025550123`). A comma after a long number is as often the next field of a row (`20260112345,01/05/2026`, `ICN
    12345678901,12345678902`) and is read as ef3e8d20 read it.
  - *A masked SSN glued* to a letter or a digit before it that is no mask character, the mask in an SSN's own shape: three
    mask characters (a word's own final `x` before them too), a gap the masked pattern reads, two, such a gap and four
    digits, the four on the next line too (`PaidXXX-XX-3456`, `2020***-**-3456`, `PaidXXX - XX - 3456`, `FaxXXX-XX-3456`).
    Five mask characters and four digits, a gap missing, or four after `#` is as often a masked account number
    (`Acct#XXXX1234`, `Acct No.XXXXX1234`, `Acct#XXXX-XX-1234`): each is read as ef3e8d20 read it, sent in a letter with no
    held range and refused in a held one.
  - *A Social Security label glued to the word before it*: `SSN`, `SOC SEC` and `HICN` in any case (`PatientSSN 900.12
    3456`, `PATIENTSSN`, `PatientSocialSecurityNumber`, `PatientHICN`; never `Assn` or `ISSN`), and `SS#`, `SS No` and
    `HIC` where a change of case sets them apart (`PatientSS# 900.12 3456`), read by the survivor scan only, so a refusal
    and never a redaction, and as a second reading beside the text as written, never in its place. The phone labels are
    not read glued, nor `SS#`, `SS NO` and `HIC` in capitals throughout: words end in them (`Fairfax`, `smartphone`,
    `CLASS#`, `ADDRESS NO`).
  - *A label read through the call's own identifier*: the label reads the text as it reads it with the identifier gone,
    across the one line break a label reads too (`SSN for Zephyra: 90012-3456`, `Call Zephyra at 555-0123`, `Phone (Jane
    Zephyra, home): 555.0123`, the number on the line after `Phone Zephyra`). The scan reads its chain's label so, and its
    read over the numbers before an amount (refusals: `SSN (Jane Zephyra, patient): 90012-3456`, `Phone Zephyra, Jane: 900
    13 9434.00`). The patterns redact through it a number whose own words say nothing and that no plain reading takes,
    never one wrapped across a line break; a number a noun names stays named (`Phone call with Jane Zephyra regarding
    claim 230957851`).
  - *A label's list number*: one or two digits right after an SSN or phone label (`No.`, `#`, a full stop, a dash or a
    colon between them too) and before `:` or `)` (an ordinal's suffix, a space or a word in parentheses before it too),
    or in parentheses before a colon, are read through on the same terms: `Phone 1: 555-0100` is `Phone 1: [PHONE]`, and
    so `Tel. 1:`, `Phone (1):`, `Phone 1 (home):` and `Tel 1)`; `TTY 1: 7,439.10 942.77 3098` is refused as ef3e8d20
    refuses it without the list number; `SSN (2). 150.00 120.00 30.00` holds no list number.
  - *A pattern's placeholder is a number to what is glued to it*: where `[SSN]` or `[PHONE]` has a letter against it
    (invisible characters or a mark between them too), the glued own-identifier check runs once more with a digit on that
    side, so a name glued to a number is refused whether or not the number was redacted first.
  - *The checks' own marks*: a letter's own U+0001, U+0002 or U+0003 is read as the control character it is, never as a
    placeholder's mark (B1-4).
- **The look-alike fold (ruling A') is for the call's own identifiers only, and beside ef3e8d20's fold.** `fold` folds
  case first and then reads a letter or digit that the Unicode confusables data (UTS #39, `confusables.txt` 10.0.0) maps
  to one ASCII letter or digit as that one (395 entries: the sources that are one letter or number NFKC leaves as it is),
  and the 16 small capitals the data maps elsewhere (`src/confusables.ts`, 411 entries, its count and hash pinned by
  `src/confusables.test.ts`), taking the capital's look-alike or, where it has none, its small letter's; a decimal digit
  of any script is its value. Names, member IDs, claim numbers and dates of birth are matched on ef3e8d20's fold and, where
  the letter or the call's identifiers hold a look-alike, on this one too (`ownFold`); the glued checks of the strict
  check run on both. The Social Security and phone patterns and the survivor scan fold as ef3e8d20 folded: a look-alike is
  theirs to read as the letter it is. A name part of two or three letters found only by the look-alike fold in a word
  written wholly in another script is that script's word (`на` in a Russian notice is no HA); a name stored in its own
  script is read as before. The table is a file in the repository, generated once: nothing is fetched at build or run
  time.
- **Digit-for-letter forms (ruling A').** A word that reads as one of the call's own name parts, member IDs or claim
  numbers position by position, with a digit for a letter or a letter for a digit (O/0, l/1, I/1, S/5, B/8, and E/3 for
  the pinned `VANTR3E`; another script's digit that looks like a letter too), half of its characters or more the form's
  own and not digits alone, the form five characters or more (six for digits alone), is redacted as that identifier,
  written in pieces too with a joiner its plain pattern reads between them (`ZZ 765432l`, `VAN-TR3E`; each piece of a
  name holds a letter, so `Week-5` is no WEEKS). Inside a longer run of letters and digits it is refused (`2020S1MONE`,
  `PaidVANTR3E`), and so is the form spelled with a look-alike among its letters there; no Social Security or phone
  pattern redacts a part of such a run first. Never a letter for a letter (`well` is no WEIL). A month's word and digits
  with no space is a date (`MAR13` is no MARIE). A form of four is as often an ordinary token (`11am` for LIAM, `CO13` for
  COLE, `80th` for BOTH: 42 of 651 common names had one among 26,143 ordinary tokens) and is not read.
- **Name joiners.** The middle dot (U+00B7), the hyphenation point (U+2027), the bullet operator, the dot operator and the
  bullet join a name's pieces as a hyphen does (`Zeph·yra` is redacted alone; in a held letter, which ef3e8d20 refused for
  the pieces, the letter stays refused): the packets verifier's fold asked for the measurement.
- **Ruling B.** A month word that is a name part is a date's month only in a date with two numbers or more (a day and a
  year: `May 5, 2026`, `3 June 2026`). `May 2020` and `June 103`, which the date reader takes as a day and a year run
  together, are the name: redacted.
- **In a held letter only** (`heldStrict`, `heldBirthUnread`, `gluedShape`'s shape with no structure, the wider masked
  rule).
  - An amount (with or without a currency sign), a dash and a date as one range holds nothing: refused. A date and then
    an amount stands as at ef3e8d20.
  - Beside a held range: a number no barrier holds, or one a noun names, joined to its end by a joiner alone; a number no
    barrier holds before its first end across white space; a word glued to its end and then a bare nine or ten; a number
    of seven digits or more, one or two letters and a date with nothing between.
  - Chains read again with unsigned amounts and groups of five to seven digits as parts of a chain, twelve groups at most,
    after what must stay is placed by its structure (a currency amount; a standing date; a nine or ten that NPI, TIN or EIN
    names; a ZIP or ZIP+4 after a state's abbreviation or name or the word ZIP, a comma, a full stop or a line break
    between them too; two five-digit codes joined by a dash or a slash; a TIN written two and seven after TIN, EIN, FEIN
    or a writing of Tax ID; the codes of a list a code word begins; a service-line row's code and units before its
    amount, modifiers between them and the units in parentheses too; a code and the next line's count; a code's digits
    after its one letter, an ICD-10 code's after its point too): nine or ten digits, eleven starting with 1, or a local
    number of three and four, holding one group no barrier holds, refuses; under an SSN or phone label, nine digits or
    more of groups no barrier holds. A year beside an amount stays, and a local number's shape inside a longer token or
    after a currency amount.
  - A date written two, two and four with dashes and a lone digit across white space beside it, never a time after it.
  - The date of birth in writings no rule reads: a Roman-numeral month with day and year, the year of two digits too; the
    CJK date characters, the year of two digits or left out too; its year in words within 48 characters after its month's
    word; its month's word (no part of a longer word) with its day in digits and no year after it (`Mar 14th`, `March the
    14th`, `14th of March`); its two-digit year, month and day run together as four or five digits, or six in an order a
    date is written in, at the start or end of a run of digits (not four digits that read as a year 1900 to 2099). The
    month of May is a verb too: before its day it is the month only where the day carries an ordinal's suffix or ends its
    phrase, and after its day only with "of" between them or where it ends its phrase (`Visits over 12 may require` and
    `the 12th may require` are no date of birth).
@@MEASURED@@
- **Where the build departs from the ruling's words, and why.** Ruling A' names NFKC, a TR39-style skeleton and five
  digit pairs. The views were NFKC already, so the table holds only what NFKC leaves. It is no whole skeleton: one
  character for one ASCII letter or digit, case folded first; a look-alike written with two characters for one (`rn` for
  `m`) is not read, and the data's entries later Unicode versions added are not in it. The fold reaches the call's own
  identifiers only, never a label, a keep-noun or a month's word, and it stands beside ef3e8d20's fold, never in its
  place. E/3 is a sixth pair, because the pinned `VANTR3E` needs it. A digit stands for a letter only position by
  position in a whole own identifier of five characters or more, never letter for letter, because a fold of every word
  of a letter to digits and back redacts ordinary words.

Still not covered after this amendment, recorded as residuals: in a letter with no held range, an unlabeled
amount-shaped number, a five-four with no ZIP before it, a local number with no label, nine single digits, initials
written together and a short part split, and the date-of-birth writings listed above, as at cc3dd7f6; a phone label glued
to the word before it (`PaidPhone 202 555 01.23`), and `SS#`, `SS NO` and `HIC` glued in capitals throughout; a label, a
keep-noun or a month's word spelled with another script's look-alikes, read as ef3e8d20 read them; a second number after
"or" in a phone list (`Phone 555-0100 or 555-0101`); a bare seven digits after a phone label with a word between (`Tel
mobile 5550123`); a letter O for a zero inside an SSN or phone (`SSN 9OO-12-3456`); digit-for-letter pairs beyond the six;
a name part of four letters in a digit-for-letter form (`L1AM`), and a month's word with digits that is such a form
(`MAR10` for a patient Mario); a look-alike whose small letter looks unlike its capital inside a name split by a joiner
(`νan-tree`); letters with a stroke (`Zepħyra`); a control character inside a number or a name (`900-12<U+0004>-3456`, as
at ef3e8d20); a day of the date of birth written as an ordinal's word in a held letter (`March fourteenth`), and for a date of birth
in May its day in digits with the phrase going on after it (`May 12 for review`, where `may 1) call us` is the verb); a number
glued so that a bare nine or ten reads across the join (`123456900-12-3456` is `[SSN]-12-3456`, as at ef3e8d20); one to
three digits glued before the shape with no structure (`150900-12-3456`); the shape wrapped before its last group with
an amount glued after it; the shape written with spaces and no label with an amount glued after it (`900 12
3456150.00`); an amount with a thousands separator or a decimal comma glued after a number (`20255501231,250.00`); a
number of an SSN's shape that a reference's noun names with digits glued after it (`Case No. 123-45-678901.00`); an SSN
with a slashed date for its last six (`SSN 900 12/03/56`) and the amount-shaped splits of review GATEWAY2-1 (`Soc Sec
93798 4 1.46`), each as recorded above. **MOD-23** (`LANES.md` Queues item 26, to land before any real PHI is
processed, after this amendment and the packets verifier's fold): a name written with a lower-case piece after a space or
a period (`Zephy ra`, `Zephy. ra`) and a name written letter by letter (`Z e p h y r a`) are sent in clear in a letter
with no held range by cc3dd7f6, ef3e8d20 and this head alike, and refused in a held one; the kept script
`leaks-scripts/name-forms.mts` in the gate's folder reproduces both on any tree (`node --import ../ts-resolve.mjs
name-forms.mts <redact.ts>...`), and `src/redact.leaks.test.ts` pins them as they are sent today. Of the list that ends
the amendment above, this one closes: a label's list number (`Phone 1: 555-0100`, `TTY 1: 7,439.10 942.77 3098`), two
phones with nothing between them, the Social Security label glued to a word (`PatientSSN 900.12 3456`, `PATIENTSSN 900.12
3456`), a masked SSN glued to a digit or a word, an SSN or phone glued digit to digit to a date, an amount or a currency
amount (`SSN 900-12-3456150.00`, `SSN 01/01/2020900-12-3456`, `$514451/293-6215`), a labeled SSN or phone written with
spaces and an amount glued to it (`SSN 900 12 345615.00`, `Phone 202 555 012315.00`), a label with the call's own
identifier before its number (`SSN Vantree 900.12 3456`, `SSN for Zephyra Vantree: 90012-3456`), and other-script digits in
member IDs, claim numbers and dates. ADR 0070's Part 3 lists the call's own number in other-script digits as not caught:
for the letter reader it is caught now.
