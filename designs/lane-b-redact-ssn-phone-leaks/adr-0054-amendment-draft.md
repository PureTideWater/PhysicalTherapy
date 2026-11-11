
## Amendment (`co-001/redact-ssn-phone-leaks`, 2026-11-11): the Social Security, phone and own-identifier forms the range fix exposed

The amendment above ends with three accepted residuals, by the orchestrator's rulings of 2026-11-07: (A) a Social
Security or phone number in a shape no rule reads, in a letter whose chain only the range fix's barriers hold; (A') the
call's own name, member ID, claim number or date of birth in a form no rule reads, in such a letter; (B) a name part that
is a month's word, next to a date. This amendment closes them (test matrix MOD-21 and MOD-22), for the letter reader only
(`letterSubject`'s `patterns`, `redactLetterForScreen` and `holdsIdentifier`): the narrative's check and the packet
verifier, which read through the same matcher, read as before. Its design note, the reviews' reproduction
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
  - *ef3e8d20's reading stands, and this one only adds.* The call's own identifiers are read first as ef3e8d20 read
    them. What only this reading reads is a fresh match (`Found.fresh`): a number a label names only through the call's
    own identifier or a list number (the call's own number found so too); a name written with a joiner ef3e8d20 did not
    read, and what is read only beside it (an initial next to that name: ef3e8d20's own matches are taken on the text
    with each new joiner written as the katakana middle dot, which every list of ef3e8d20 holds beside them and which
    joins no name); an identifier found only on the look-alike fold; a digit-for-letter form. The Social Security and
    phone patterns read the settled matches alone as what stands found, so a fresh match ends no label's window and is
    no item of a list. `redactLetterForScreen` applies the fresh matches only in a letter that the scan and the glued
    checks, read as ef3e8d20 read them (`chainLeft` with `strict` false), do not refuse without them (`appliedMatches`).
    Where they do, ef3e8d20 refused the letter: the fresh matches are left as written, and `holdsIdentifier`, whose
    patterns read through the call's own placeholders as redaction read through the identifiers, finds them again and
    refuses that text (`Call Zephyra at 555-0123/555-0124`, an invisible character between the two numbers or not; `ID
    SYNMEMBERO042 555-0123`). `redactLetter` and `redactionSpans`, which no check follows, apply every match, a
    pattern's match inside a run that holds an identifier glued in a look-alike form too (`900-12-3456Z3PHYRA` is
    `[SSN]Z3PHYRA` there, as at ef3e8d20; the letter reader leaves the run whole and its check refuses it). The first
    build tested instead whether the number stood alone, and read one look-alike fold everywhere; the reviews found an
    invisible character that defeated the test (B1-1), refusals of ef3e8d20 lost to the fold (B1-3, B1-14, C1-3, C1-4)
    and an initial beside a name written with a new joiner that stood as settled (D1-1: `Ze·ph·yra J 900 12 34, 56`,
    which ef3e8d20 refuses, was sent with its nine digits). The survivor scan keeps ef3e8d20's reading by construction
    (`survivorIn`): its strict reading is ef3e8d20's own with refusals added, but in three places where it may hold less
    in a chain than ef3e8d20 held: a label found only through the call's own identifier or a list number, under which an
    amount is no barrier; that list number, which is no digit of a chain; and a run of nine digits or more before a
    decimal point, which is no amount. A text that holds one of them and that the strict reading does not refuse is read
    once more as ef3e8d20 read it, and the worse answer is taken. The fuzzers showed the need: the round that took the
    list number out of the chain sent 22 of their letters that ef3e8d20 refuses (`Cell number 1) 7886924.4`, `Phone (20)
    2555 0123`, the number's own first digits written as a list number: G1-1), and one more had been sent since the
    amount rule (`Telephone number 8 1234567893.1`, an eleven that starts with 1 to ef3e8d20). A copy of the head that
    always takes the second reading and reports a text where it is worse though no such place was marked reported none
    over @@AUDIT_LETTERS@@ fuzz letters; always taking it was measured and not kept, at half as much time again on the
    slowest crafted letters.
- **In every letter.**
  - *Another number's digits glued to an SSN's or a phone's own shape* (`gluedShape`, in the survivor scan): three
    groups joined by joiners with no white space (a dash at a line's end and the next line too), the middle one of two
    digits (three for a phone; a slash only for a phone), the first of three digits or more and the last of four or
    more, one of them longer; a phone with its area code in parentheses is the shape too, a space inside the
    parentheses, a space, a dash, a point or the line's end after them and a space before its last four read with it
    (`(202) 555-0123`, `( 202 ) 555-0123`, `(202) - 555-0123`). Refused where structure says whose the other digits are.
    Before the shape: a currency amount's digits, an amount's cents joined by a point to the group before, or the end of
    a date: its two-digit year or its day, or its four-digit year after the rest of its date, which is its month and day
    in digits, its month in digits and a slash, or its month's word with its day before it, after it or left out, a line
    break before the year too; the digits and their separators with no space between them (`Sec. 2.1. 2026011-22-3333`
    is a section and a number) and a month's word with no day at its word's start (`$150.00900-12-3456`,
    `$514451/293-6215`, `150.00900-12-3456`, `01/02/20900-12-3456`, `2020-01-01900-12-3456`, `01/01/2020900-12-3456`,
    `Jan 1, 2020900-12-3456`, `01-Jan-2020900-12-3456`, `January 2020900-12-3456`, `01/2020202-555-0123`). After a shape
    that starts at its group's start: cents after a point, a range after them too (a dash or a slash and a second amount
    or a date), a second shape begun in its last group, or a date glued to it, its month in digits or as a word
    (`900-12-3456150.00`, `900-12-3456150.00-120.00`, `202-555-0123202-555-0124`, `202-555-012301/02/2020`, `(202)
    555-012301.02.2020`, `(202) 555-012301-Jan-2020`); a month's word after a space begins a date of its own, and the
    number before it is kept (`802-45-678901 Jan 15, 2026`: review G2-1). A reference's noun and what stands between it
    and its number name the whole joined number, from the first of its joined groups, across a form's column of spaces
    and one line break after the label's last word, and the letter keeps it (`Case No. 123-45-678901.00`, `Claim #
    20260115-12-3456`, `Policy No. 01-23456-78-9012`), under a phone word or Medicare too where the noun stands nearer
    the number (`Medicare Summary Notice 802-45-678901`, `Fax confirmation number 802-456-78901.50`, `Contact us
    regarding account 802-456-789012`); no other word names one (`Patient # 900-12-3456150.00` is refused; `on file` and
    a bare `advice` are none: `Phone on file: 202-555-0123150.00`). A label wrapped over two lines is one label, and a
    blank line or a rule drawn under the label stands between it and its number where the label ends as one does, in a
    number word, a number's own name, a colon or `#`, or the rule is there (`Claim Number:` and a blank line, `ICN` over
    a rule: review G2-3); a heading over a blank line names nothing (`REMITTANCE ADVICE`, a blank line and
    `900-12-3456150.00` is refused: E1-7), nor anything three line breaks up. Under a Social Security label no noun
    names a number: what follows that label is the person's whatever stands between (`Social Security Account Number
    900-12-345678`, `SSN on file: 900-12-345678` and `SSN/Member ID: 900-12-3456150.00` are refused), unless a claim's
    or another code's own label stands nearer the number and is the scan's label for it (`SSN on file. Claim
    802-45-678901.50` is kept); and the label right before a noun makes the noun the label's own word however far the
    number stands after it and whatever is glued before its shape (`Social Security Account Number:` and a column of
    spaces, `SSN Account 01-900-12-3456150.00`: G1-3). Under an SSN or phone label, or Medicare over an SSN's shape,
    with no such noun, the shape is the person's number whatever is glued after it, in the number's usual writing too
    (`SSN No. 900-12-345678`, `Phone number (202) 555-01234567`, `Medicare ID 900-12-345678`), with a point between its
    groups only where a date is glued after its last four (`SSN 900.12 345601/01/2020`; `Contact: Billing 250.75 123456`
    and `Medicare rate 110 32.74420` are an amount and a number) or, between the second and third groups, where the
    label is a Social Security label, which is no ordinary word (`SSN 900 12.3456150.00`: G1-5). With no structure and
    no label, a longer group is as often a reference's (`Tracking 123-456-78901`, `Referral # 123-45-67890-01`,
    `2026-0115-123-4567`, `29 CFR 2590.715-2719`), and so are digits before the shape that no date, amount or currency
    sign places: a year or a longer run (`20260115-12-3456`, `2020900-12-3456`), the cells of a row joined by a bar
    (`1234567893|11|97110|2|150.00`), a file's name (`remit_20260115_01_0001.pdf`), a field after a comma
    (`1,00123-456-7890`). Each is sent as at cc3dd7f6 (the review of the fix round's delta, D2-1, D2-2 and D2-4), and a
    longer last group that nothing names is refused in a held letter only (`900-01-202012th`, `(202) 555-01234`); a
    line's own numbers written with parentheses are refused with it there (`Line (001) 420-97110`), because the two
    cannot be told apart (reviews E2-5 and G1-4).
  - *A number glued to an amount's digits*: a run of nine digits or more before a point is no amount, so the scan reads
    the run; a run of eleven or more with cents after a point is refused (`900123456150.00`, `900123456150.00-120.00`)
    unless a noun names it (`ICN 12345678901234.01`); and an amount's cents with a nine or a ten right after them
    (`150.00900123456`, `$150.002025550123`). A comma after a long number is as often the next field of a row (`20260112345,01/05/2026`, `ICN
    12345678901,12345678902`) and is read as ef3e8d20 read it.
  - *A date glued after a bare nine or ten*: a run of eleven or twelve digits whose last two begin a date with a
    four-digit year, or of thirteen or fourteen whose last four are that date's year written first, is a nine or a ten
    and a date (`SSN: 94156421006-22-2027`, `9001234562020-01-02`, `9001234562020-1-5`): refused unless a noun names the
    run (`ICN 96104065401-04-2026`). The date's parts are joined by a slash, a point, a dash or a dot written for one,
    its month a word too (`90012345601-Jan-2020`); a bar, an underscore, a backslash or a tilde joins the cells of a row
    and the parts of a file's name as often (`91895853214|3|20260401|97110`, `ERA_79790014228_08_2026.pdf`: review G2-2)
    and is a date's joiner under a Social Security label alone (`SSN: 90012345601_02_2020`). After the date stands no
    digit, an amount with its cents or a second date (`90012345601/02/2020150.00`, `90012345601/02/202001/31/2020`),
    never a longer number's digits. After a nine or a ten, a date that begins with one digit is read with slashes
    (`20255501239/9/2020`); with dashes or points one digit and two groups are as often a reference's own end
    (`20260112345-01-2026`) and are sent.
  - *A masked SSN glued* to a word before it, or to another number's digits, the mask in an SSN's own shape: three mask
    characters (a word's own final `x` before them too), a gap the masked pattern reads, two, such a gap and four
    digits, the four on the next line too (`PaidXXX-XX-3456`, `PaidXXX - XX - 3456`, `FaxXXX-XX-3456`). The digits
    before the mask are another number's where structure says so (a year, a date's end, written year first too, an
    amount's cents, a currency amount: `2020***-**-3456`, `150.00XXX-XX-3456`, `$150XXX-XX-3456`,
    `2020-01-02XXX-XX-3456`) and wherever they are three or more, because a masked number shows one or two of its own
    first digits at most (`CPT 97110XXX-XX-3456`); after digits an underscore is a mask character too
    (`150.00___-__-3456`). A digit or two with no such structure are the masked number's own first digits (`Acct
    4XXX-XX-1234`), and underscores after a word are a form's blank (`Initials___ __ 2026`). Five mask characters and
    four digits, a gap missing, or four after `#` is as often a masked account number (`Acct#XXXX1234`, `Acct
    No.XXXXX1234`, `Acct#XXXX-XX-1234`): each is read as ef3e8d20 read it, sent in a letter with no held range and
    refused in a held one after a letter or after digits that structure places (`2020-01-02XXXXX3456`), where digits no
    structure places are the account's own (`Account 0XXXXX1234`).
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
    colon between them too; the label in the plural or with `numbers` after it), in parentheses, or before `:` or `)`
    (an ordinal's suffix, a space or a word in parentheses before it too), are read through on the same terms: `Phone 1:
    555-0100` is `Phone 1: [PHONE]`, and so `Tel. 1:`, `Phone (1):`, `Phone 1 (home):`, `Tel 1)`, `Phone (2) 555-0100`,
    `Phone ( 2 ) 555-0100`, `Phone (2nd) 555-0100`, `Phone numbers (2) 555-0100` and the same with a line break before
    the parenthesis; `TTY 1: 7,439.10 942.77 3098` is refused as ef3e8d20 refuses it without the list number, and so are
    `Cell (2) is 933.67 4536` and `SSN (2). 150.00 120.00 30.00`. The list number is no digit of the number the label
    names: the scan starts no chain in it, so `Telephone call (2) 30.00 60.00` and `Fax 2) 15.00 30.00` are sent as the
    same rows are without it (review E2-1: the rule's first build counted the digit in the chain and refused such rows).
    The number in parentheses was first read only before a colon; the gate replayed both ways decided it: of the letters
    that turn on it, @@PAREN_LEAK@@ hold a number written as an SSN or a phone and @@PAREN_AMOUNT@@ hold amounts, and
    ef3e8d20 refuses every one of the second with the number in parentheses taken out. With no parentheses, colon or
    closing parenthesis, a digit and a space are as often the number's own first digit (`Phone 1 800 555 0199`): no list
    number.
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
  the pieces, the letter stays refused): the packets verifier's fold asked for the measurement. In the letter reader
  only: the narrative's check (`holdsNameOrNumber`) and the packet verifier (`nameOrNumberMatches`) read a name as
  ef3e8d20 read it, because which stored narratives fail is the verifier's to change, and its own test pins what the
  matcher does not read (`packages/packets/src/verifier-identifiers.test.ts`).
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
  - The date of birth in writings no rule reads: a Roman-numeral month with day and year, the year of two digits too;
    the CJK date characters, the year of two digits or left out too; its year in words within 48 characters after its
    month's word; its month's word (no part of a longer word) with its day in digits and no year after it (`Mar 14th`,
    `March the 14th`, `14th of March`); its two-digit year, month and day run together as four or five digits, or six in
    an order a date is written in, at the start or end of a run of digits (not four digits that read as a year 1900 to
    2099). The month of May is a verb too: before its day it is the month only where the day carries an ordinal's
    suffix, on the next line too (`May` at a line's end and `14th` on the next), or, on the same line, ends its phrase,
    and after its day only with "of" between them or where a full stop or the text's end follows it (`Visits over 12 may
    require`, `the 12th may require`, `Up to 12 may, at our discretion,` and `You may` before `12.` on the next line are
    no date of birth).
- **Measured** (synthetic letters only; the scripts, the reviews' reproductions and the gate are in the ops repository).
  - *Pinned rows* (`src/redact.residuals.json`, regenerated by `residual-scripts/gen-residual6.mts` and held row by row by
    `redact.residuals.test.ts`): ruling A 697 of 697 (632 refused, 65 redacted), ruling A' 406 of 406 (200 redacted, 206
    refused), ruling B 5 of 5 (the month's word redacted as the name). The 938 rows of lone initials and the 243
    fail-safe rows stand as recorded.
  - *The differential gate* (975,489 letters). Against cc3dd7f6 and against ef3e8d20: no letter in which the older tree
    redacted or refused an identifier and this one sends it. Against ef3e8d20 this reading redacts or refuses a Social
    Security number in 16,318 letters more, a phone number in 10,657, a name in 12,645, an initial in 635 and a date of
    birth in 34. Of the letters ef3e8d20 sent unchanged and in which the gate's oracle places no number, it refuses 3,877
    that hold the call's identifiers (the glued and look-alike forms), 603 after an SSN or phone word and 3,345 others
    (1,725 of them the earlier reviewers' own letters, written with a number glued that the oracle cannot place), and it
    changes a date in 308 (a month's word that is the patient's name: ruling B), a number in 17 and an amount in 1 (a
    label read through its list number reads what ef3e8d20 reads without it: `Tel 7: is 802⏎8185.55` is `[PHONE].55`).
    It sends 33 letters ef3e8d20 refused, each for a patient whose name is a month's word, which ef3e8d20's own check
    found left in its text and this reading redacts. Against cc3dd7f6 the three classes are 2,882, 7,479 and 559; the
    13,575 must-stay letters and 4,483 with identifiers that cc3dd7f6 refused whole are sent, the range fix's gain kept;
    and 385 letters it refused that hold digits after an SSN or phone word and no number the oracle can place are sent:
    195 must-stay rows unchanged, 189 with the number redacted and one amount-shaped split of the kind recorded above.
  - *The fuzzers* the reviews left, each ef3e8d20 against this head on letters it generates, with fresh seeds after the
    last change: no letter ef3e8d20 refuses that this head sends in 122,992 letters, and no match left as written and
    sent in 58,496; the last PHI review's two fuzzers, 62,432 letters: 67 such letters, every one the patient whose names
    are months.
  - *What the reading costs*, each the safer reading, each measured:
    - A label read through the call's own identifier or its list number refuses what ef3e8d20 refuses without them: 72
      of 12,000 letters of the must-stay fuzzer, 71 of them `Contact <own name>, <city>, IL <ZIP+4>` and one a `TTY:
      711` line with the call's identifiers and a service row on the next line; the @@PAREN_AMOUNT@@ gate letters with a
      number in parentheses; `Contact 1: Springfield, IL 62701-1234`; `TTY 1: Questions? 150.00 120.00 30.00`; and a
      numbered list on the line after a phone word (`please call` and `1) Member Services 97110 97140` on the next line:
      33 of 180 and 44 of 192 letters of review G2's grid for `1)` and `1:`, none for `1.`).
    - In a held letter, which cc3dd7f6 refused whole: of 20,000 letters of ef3e8d20's own must-stay generator 359 are
      refused, every one a letter cc3dd7f6 refused (344 hold a local number with no label beside the held range); a
      named number is refused there too where its chain reads nine or ten digits (`Claim 802-456-789012`, `Policy No.
      802-456-789012 150.00`, `ACH ****1234 150.00`), and a shape with a longer last group that no listed noun names
      (`Web ID 802-456-78901`), an area code in parentheses among them (`Line (001) 420-97110`, `Table (555)
      456-23099`); and a label read through its list number hands the line to these rules, which refuse under a label
      what ef3e8d20 sends (`phone (4) pages to Tracking 802-456-71718` beside a held range: 101 of 2,241 held letters of
      review E2's generator with a label word and a number in parentheses). None of 4,000 letters of ordinary form was a
      held letter (review D2).
    - With no noun naming it: cents, a second shape or a date after a shape that starts at its group's start
      (`802-456-78901.01`, `802-45-6789012-34-5678`, `802-91-69413-01-2026`, `310.216.62432.7`), eleven digits or more
      with cents (`Visit ID 123456789.1`), an eleven- to fourteen-digit run whose last digits begin a date (`On
      12345678901/02/2026`, `Seen 12345678901-Jan-2026`), a ten and a one-digit date with slashes (`1234567899/9/2020`),
      a phone with its area code in parentheses and digits after it (`Section (123) 456-78901.50`), a year glued before
      a shape after a month's word or a month and a slash (`Plan SEP 2020802-45-6789`, `Page 3/2020900-12-3456`); under
      a phone word or Medicare with no listed noun between (`Call us about ID 802-456-78901-02`); under a Social
      Security label whatever noun stands between (`Social Security Administration Notice 802-45-678901`, `SSN verified.
      Account 802-45-678901.50`); and a letter glued before a reference's digits, which un-names it (`Claim
      W2026008123456.01`). Review D2's grids: @@D2_GRIDS@@.
    - A shape that starts inside a currency amount (`$1500-12-2026`, `$1000/250/5000`).
    - A name's digit-for-letter form among ordinary tokens: one of 651 common names against 26,143 tokens (`Week5` for
      WEEKS); `S83511A` for member 583511, and its pieces across a space; a month-and-year phrase for a patient named
      May or June (the @@B_DATES@@ above); asterisks in a masked SSN's shape glued to a word (`Total due*** ** 2026`),
      and three digits or more before a masked SSN's shape (`Acct 123XXX-XX-1234`).
  - *MOD-16's generator* (`redact.property.test.ts`, `keptLetter`) changed in three places, each said there and pinned
    on both sides in `redact.leaks.test.ts`: a letter that holds a service period or a range writes no local number with
    no label; a segment that begins with a word and holds a bare nine or ten is not glued to a range's end; no letter
    holds the date of birth run together with a two-digit year. Its five seeds and three fresh ones pass on this head.
  - *Time.* The slowest letter of the gate's timing set takes 857 ms (488 ms at cc3dd7f6; the budget is 3,000 ms), and
    the timing rows of `functions/denial-letter.test.ts` hold, four added.
  - *Reviews.* Two adversarial reviews of the design; two of the build (PHI, B1-1 to B1-14; what must stay, B2-1 to
    B2-9); of the fix round, two that the session's usage limit cut off before a report, which count for nothing but
    whose rows were each run and fixed (C1-1 to C1-4, C2-1 to C2-8), then two that ran to their reports (D1-1 and a note
    on `redactLetter`; D2-1 to D2-7); two of the round after that (E1-1 to E1-8; E2-1 to E2-6, the first of them a
    fault: a label's list number counted as a digit of the number the label names); two of the round after that (G1-1 to
    G1-5, the first a letter ef3e8d20 refuses that was sent, which the fuzzers' run on that round had shown too; G2-1 to
    G2-7, three of them ordinary rows the round had begun to refuse); and two of the round after that (@@REVIEW_H@@).
    Every finding was run before it was fixed, and each is a row of `redact.leaks.test.ts` on both sides; the gate,
    replayed against its last run after each round, found the forms a round re-opened (a number in parentheses after a
    label, a range after an amount's cents, a date after a bare nine or ten), which no review had, and the fuzzers found
    the letters ef3e8d20 refuses that a round sent.
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
written together and a short part split, and the date-of-birth writings listed above, as at cc3dd7f6; a phone label
glued to the word before it (`PaidPhone 202 555 01.23`), and `SS#`, `SS NO` and `HIC` glued in capitals throughout; a
label, a keep-noun or a month's word spelled with another script's look-alikes, read as ef3e8d20 read them; a second
number after "or" in a phone list (`Phone 555-0100 or 555-0101`); a bare seven digits after a phone label with a word
between (`Tel mobile 5550123`); a letter O for a zero inside an SSN or phone (`SSN 9OO-12-3456`); digit-for-letter pairs
beyond the six; a name part of four letters in a digit-for-letter form (`L1AM`), and a month's word with digits that is
such a form (`MAR10` for a patient Mario); a look-alike whose small letter looks unlike its capital inside a name split
by a joiner (`νan-tree`); letters with a stroke (`Zepħyra`); a control character inside a number or a name
(`900-12<U+0004>-3456`, as at ef3e8d20); a day of the date of birth written as an ordinal's word in a held letter
(`March fourteenth`), and for a date of birth in May its day in digits with the phrase going on after it (`May 12 for
review`, where `may 1) call us` is the verb); a number glued so that a bare nine or ten reads across the join
(`123456900-12-3456` is `[SSN]-12-3456`, as at ef3e8d20); digits glued before the shape that no date, cents after a
point or currency sign places: one to three (`150900-12-3456`), a year or a longer run (`2020900-12-3456`,
`2025550100900-12-3456`), and a comma for a decimal point (`150,00900-12-3456`); a date with a two-digit year glued
after a bare nine or ten (`90012345601-04-26`), a one-digit day or month written with dashes or points after one
(`20255501239-9-2020`), a bar, an underscore, a backslash or a tilde for the date's joiner under no Social Security
label (`Seen 90012345601|02|2020`), and a month's word after a space following a number (`900-12-345601 Jan 2020`,
`90012345601 Jan 2020`), which begins a date of its own as often; a date written with spaces around its separators, with
spaces alone or with underscores before a year glued to a shape (`01 / 02 / 2020900-12-3456`, `01 02 2020900-12-3456`),
and a quarter or a fiscal year there (`Q1 2020900-12-3456`); a shape with digits glued after it under a phone word or
Medicare where a reference's noun stands nearer (`Fax / Member ID 202-555-012378`), under any label where a claim's or
another code's own label does (`SSN on file. Claim 900-12-345678`), and under a Social Security label out of its reach
or written in a form no label reads, with a noun between (`Social Security number as shown on your record:
900-12-345678`, `S.S. No. on file: 900-12-345678`); under Medicare or a phone word, a point between the second and third
groups of the usual writing (`Medicare 900 12.3456150.00`); one or two digits before a mask with no year, date, cents or
currency sign there (`12XXX-XX-3456`), one cent digit or a decimal comma before it (`150.0XXX-XX-3456`,
`150,00XXX-XX-3456`), mask characters with spaces between them, and underscores for the mask glued to a word outside a
held letter (`Paid___-__-3456`); a list number with no parenthesis or colon (`Phone 2 555-0100`, `Phone #2 555-0100`),
as often the number's own first digit, and one in parentheses with no space after them or written otherwise (`Phone
(2)555-0100`, `Phone (#2) 555-0100`, `Phone (2 of 3) 555-0100`, `Phone line (2) 555-0100`, a blank line before it);
after an amount's cents, a slash and a number with no cents, a month's word in the date, or a date of two parts
(`900-12-3456150.00/3`, `900-12-3456150.00-01-Jan-2020`, `900-12-3456150.00-1/2020`); where ef3e8d20's pattern takes an
amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`), the date's end no longer stands before
the shape and the letter is sent as ef3e8d20 sends it; the shape wrapped before its last group with an amount glued
after it; the shape written with spaces and no label with an amount glued after it (`900 12 3456150.00`, `(202) 555
0123150.00`, `(202) 555 - 0123150.00`, `{202} 555-0123150.00`); an amount with a thousands separator or a decimal comma
glued after a number (`20255501231,250.00`); a number of an SSN's shape that a reference's noun names with digits glued
after it (`Case No. 123-45-678901.00`); an SSN with a slashed date for its last six (`SSN 900 12/03/56`) and the
amount-shaped splits of review GATEWAY2-1 (`Soc Sec 93798 4 1.46`), each as recorded above. **MOD-23** (`LANES.md`
Queues item 26, to land before any real PHI is processed, after this amendment and the packets verifier's fold): a name
written with a lower-case piece after a space or a period (`Zephy ra`, `Zephy. ra`) and a name written letter by letter
(`Z e p h y r a`) are sent in clear in a letter with no held range by cc3dd7f6, ef3e8d20 and this head alike, and
refused in a held one; the kept script `leaks-scripts/name-forms.mts` in the gate's folder reproduces both on any tree
(`node --import ../ts-resolve.mjs name-forms.mts <redact.ts>...`), and `src/redact.leaks.test.ts` pins them as they are
sent today. Of the list that ends the amendment above, this one closes: a label's list number (`Phone 1: 555-0100`, `TTY
1: 7,439.10 942.77 3098`), two phones with nothing between them, the Social Security label glued to a word (`PatientSSN
900.12 3456`, `PATIENTSSN 900.12 3456`), a masked SSN glued to a word, a year, a date or an amount's cents, an SSN or
phone glued digit to digit to a date, an amount or a currency amount (`SSN 900-12-3456150.00`, `SSN
01/01/2020900-12-3456`, `$514451/293-6215`), a labeled SSN or phone written with spaces and an amount glued to it (`SSN
900 12 345615.00`, `Phone 202 555 012315.00`), a label with the call's own identifier before its number (`SSN Vantree
900.12 3456`, `SSN for Zephyra Vantree: 90012-3456`), and other-script digits in member IDs, claim numbers and dates.
ADR 0070's Part 3 lists the call's own number in other-script digits as not caught: for the letter reader it is caught
now.
