# Recorded for the fix round reviewed here (f2f9f05e against 24ad1075 and ef3e8d20): do not report these again

All letters are synthetic twins (patient ZEPHYRA / VANTREE, SSN 900-xx-xxxx, phones 555-01xx and 202-555-01xx, IDs SYN... and ZZ...).
"Base" is ef3e8d20 (`/home/user/tree-ef3`), "before" is the head the last two reviews read (24ad1075, `/home/user/work/p15/before`),
"head" is f2f9f05e (`/home/user/fix`). A "held letter" holds a range of two kinds glued, such as `Service 01/01/2020-150.00 Paid`.
A cost or a give-back is recorded by its family, not only by its one example.

## What this round gives back on purpose (sent again, as the base sends them; "before" refused each)
- What ends a label (a colon or `#`) may stand on the label's own line or alone on the line under it, never on the number's line:
  `Claim\n#\n20260112345.01`, `| Claim |\n|:------|\n| 20260112345.01 |`, `Statement\n#########\n802-45-678901.50`. So
  `STATEMENT\n#\n900-12-3456150.00` and `Claim\n:\n900-12-3456150.00` are sent (`REMITTANCE ADVICE\n\n#900-12-3456150.00` is refused).
- A label may run over three lines and hold a rule; a blank line inside it still makes it a heading: `Member\nID\nNumber\n20260112345.01`,
  `Invoice\n-------\nNo. 20260112345.01`. So `STATEMENT\n-----\nNo. 900-12-3456150.00` is sent (`STATEMENT\n\nNo. 900-12-3456150.00` is refused).
- A box-drawing line is a connector between a noun and its number as a bar is, a cell drawn with box lines is read, a label's own full
  stop or closing mark may stand before its rule, and U+0085 is a line break to the noun's reading: `Acct.\n-----\n802-45-678901.50`,
  `Claim Number \u2502 20260112345.01`. So `Claim Number \u2502 900-12-3456150.00` is sent, as `Claim Number | 900-12-3456150.00` is.
- After a month's word glued to a number, an amount that begins as a year does is no year: `Row 366-535-16935Nov 2000.00`.

## What this round adds (refused; the base sends each)
- The label right before a number, no other word between them (a number word, a colon, `#`, a dash, an opening parenthesis and one
  line break may stand there), is the number's own label where a point stands between its second and third groups, whatever the label:
  `Medicare 917 16.2677535.06`, `Call 900 77.3283150.00`, `SSN/Medicare ID 900 12.3456150.00`, `Phone\n250 75.123456`. COST, recorded:
  `Medicare 110 32.74420`, `Medicare: 110 32.74420`, `Medicare 150 12.50120.00`, `Fax 250 75.123456`, `Soc. Sec. and Medicare 110 32.74420`
  (three digits, two digits, a point and four digits or more right after the label). With another word between them the writing stays
  an amount and a number: `Medicare rate 110 32.74420`, `Contact: Billing 250 75.123456`, `Call us at 250 75.123456` are sent.
- After a bare nine or ten, the date's month as a word with its four-digit year after a space or a comma: `90012345601Jan 2020`,
  `SSN: 90012345601Jan, 2020`. COST, recorded: `Seq 12345678901Jan 2026` (an unnamed eleven-digit run and a month-and-year phrase glued
  by a lost space; `Claim 12345678901Jan 2026` is named and sent).
- A `+` is a connector between a noun and its number only as a table's corner beside a dash or an equals sign:
  `Provider: +1-202-555-0123150.00` and `Claim + 900-12-3456150.00` are refused, as before the round that made `+` a connector.
- Time: a run of three underscores or tildes or more between a noun and its number is taken whole (`[_~]{3,}(?![_~])`); the round
  before cut it into pieces and a rule of sixty did not return.

## Recorded by the round before, still there
- A letter that writes U+0001, U+0002 or U+0003 anywhere is refused whole (`Our office: 555-0123. Paid\u0002`, `SSN\u0001 900 12 3456`).
- A rule under a label of dashes, equals signs, underscores, tildes, asterisks or box-drawing lines (three or more), a table's bars and
  corners around it, and three underscores or more between a label and its number on one line, name as a label on the number's line does:
  `STATEMENT\n_____\n900-12-3456150.00`, `Claim: ____ 900-12-3456150.00`, `SSN / Member ID\n-----\n900-12-3456150.00` are sent.
- A Social Security label counts over a noun, a row's joiners and an unlabeled-style date only where it is the number's own label (the
  nearest): `SSN/Phone: 90012345601_02_2020` is sent. "On file" names nothing only on one line: `Phone on\nfile: 202-555-0123150.00` is sent.
- A month's word glued to a number with a four-digit year after a space or a comma (`802-45-678901Jan 2026`, `Unit 398-272-12393MAY 1999 units`,
  `Medicare rate 110 32.744201Jan 2026` are refused: a lost space before the month's word); after a bare run's date, digits that begin
  another number (`12345678901/02/20261234-56`, a row joined by slashes).
- The scan's second reading reads no Social Security label glued after a letter (`MemberSSN 8 1234567893.1` is sent; the strict reading
  itself reads such a label, so `Assoc Sec 1 1593441279.3` is refused).

## Costs recorded before this round, still there
- A label read through the call's own identifier or a list number refuses what the base refuses without them (`Contact Jane Zephyra, Springfield,
  IL 62701-1234`, `Contact 1: Springfield, IL 62701-1234`, `TTY 1: Questions? 150.00 120.00 30.00`, `Cell (2) is 933.67 4536`,
  `SSN (2). 150.00 120.00 30.00`, `Telephone call (2nd) 98966 45.00`, a `TTY: 711` line with the own identifiers and a service row on the
  next line), a numbered list on the line after a phone word among them (`please call\n1) Member Services 97110 97140`,
  `Questions? Call\n1: 150.00 120.00 30.00`: the base refuses each with the list number taken out). In a held letter the label so read
  hands the line to the held rules (`Telephone call (2nd) 99441 1 45.00 45.00` beside a held range).
- A shape that starts inside a currency amount: `$1500-12-2026`, `$1000/250/5000`.
- With no noun naming it: cents, a second shape or a date after a shape that starts at its group's start (`802-456-78901.01`,
  `802-45-6789012-34-5678`, `802-91-69413-01-2026`, `310.216.62432.7`), eleven digits or more with cents (`Visit ID 123456789.1` too),
  an eleven- to fourteen-digit run whose last digits begin a date (`On 12345678901/02/2026`, `Seen 12345678901-Jan-2026`), a year glued
  before a shape after a month's word or a month and a slash (`Plan SEP 2020802-45-6789`, `Page 3/2020900-12-3456`), three digits or
  more before a masked SSN's shape (`Acct 123XXX-XX-1234`), and under a phone word or Medicare with no listed noun between
  (`Call us about ID 802-456-78901-02`, `Fax your ID 802-45-678901`). `Section (123) 456-78901.50`. An unnamed ten-digit run before
  `/D/YYYY` (`Seq 0000012345/1/2026`).
- A number under a header row of several columns, or after a label with other words between (`Claim Number    Service Date    Billed`
  over `20260112345.01    01/15/2026    150.00`; `Claim Number for this service: 20260112345.01`): no noun names it, and a long run with a
  decimal suffix or a dashed shape with one is refused (measured by the last review: every such row). A rule wider than about 110
  characters under a label, a rule written with spaces between underscores or tildes (`_ _ _ _`), a single tilde between a label and its number. A noun before "on file" (`Claim number on-file: 12345678901234.01`).
- Under a Social Security label whatever noun stands between (`Social Security Administration Notice 802-45-678901`,
  `SSN verified. Account 802-45-678901.50`, `SSN 1: Account 802-45-678901.50`, `SSN   Claim Number: 20260112345.01`,
  `Social Security Check 12345678901.00`); a claim's or another code's label nearer the number
  still names it (`SSN on file. Claim 802-45-678901.50` is sent).
- A letter glued before a reference's digits un-names it (`Claim W2026008123456.01`; in a held letter `Claim W802-456-78901`).
- `S83511A` for member 583511 and such pieces across a space; `Week5` for a patient WEEKS; a month-and-year phrase for a patient named May or June.
- In a held letter (a letter cc3dd7f6 refused whole): a shape with a longer last group that no listed noun names (`Web ID 802-456-78901`), chains
  of nine or ten digits that no structure places, a named number among them (`Claim 802-456-789012`, `Policy No. 802-456-789012 150.00`,
  `ACH ****1234 150.00`), a local number with no label, the date of birth's month word with its day (for May: `Benefits may\n14th Street`), and its compact forms.
- `Total due*** ** 2026` (asterisks in a masked SSN's shape glued to a word).

## Not read, as at the base (residuals, not findings)
- In a letter with no held range: an unlabeled amount-shaped number, a five-four with no ZIP before it, a local number with no label, nine single
  digits; a phone label glued to the word before it; `SS#`, `SS NO`, `HIC` glued in capitals; a label, keep-noun or month spelled with look-alikes.
- A list number written otherwise: `Phone 2 555-0100`, `Phone #2 555-0100`, `Phone (2)555-0100`, `Phone (#2) 555-0100`, `Phone (2.) 555-0100`,
  `Phone (2 of 3) 555-0100`, `Phone line (2) 555-0100`, a blank line before it; `Phone 555-0100 or 555-0101`; `Tel mobile 5550123`.
- A bare run before a shape with no date, cents or currency sign before it (`2020900-12-3456`, `FY2020900-12-3456`, `Q1 2020900-12-3456`,
  `150900-12-3456`), a date written with spaces or underscores before the year (`01 02 2020900-12-3456`); a thousands separator or decimal
  comma glued after or before a number (`20255501231,250.00`, `150,00XXX-XX-3456`); a date with a two-digit year after a bare nine or ten;
  a nine or a ten and a one-digit date with dashes or points; a month's word after a space (`90012345601 Jan 2020`).
- The shape written with spaces and no label with an amount glued after it (`(202) 555 0123150.00`, `(202) 555 - 0123150.00`, `{202} 555-0123150.00`);
  a point-writing under its label with an amount glued after it (`SSN 900.12 3456150.00`); `SSN 900 12/03/56`; amount-shaped splits.
- After cents: `900-12-3456150.00/3`, `/120`, `-01-Jan-2020`, `-1/2020`, `-1.2.20`. Before a mask: one cent digit (`150.0XXX-XX-3456`), spaced mask characters.
- A Social Security label that is not the nearest label over a run (`SSN/Phone: 90012345601_02_2020`, `SSN/Medicare ID: 90012345601_02_2020`);
  a label and a noun with punctuation between them (`SSN: Account 01-900-12-3456150.00`, `S.S.N. Account ...`, `Soc. Sec. Account Number:`
  and a column of spaces); `SSN 900 12·3456150.00`, `SSN 900 12/3456150.00`; after a shape and its glued date, another number glued (`900-12-345601/02/2020150.00`), the
  hyphen bullet in that date (`900-12-345601\u204302\u20432020`), a line break, a tab or three characters before its year (`900-12-345601Jan\n2020`);
  after a bare run's date, an amount written with a space or a time (`90012345601/02/2020150 00`, `...202012:30`); `SSN 2020-01-02 900 12 3456900-12-3456`; `Phone on record:`, `Phone on our file:`, `Phone on_file:`;
  a date written year first with its month's word after a bare run (`9001234562020-Jan-5`); a month's word glued to a number with two
  digits after a space (`900-12-345601Jan 20`).
- A number a listed noun names, under no Social Security label: `Remittance Advice Number 802-45-678901.50`, `Claim(s) 802-45-678901.50`,
  `Claim 2020-900123456150.00`, `Member   ID 802-45-678901.50`; a Social Security label out of the label's reach or unlisted with a noun between
  (`Social Security number as shown on your record: 900-12-345678`, `S.S. No. on file: 900-12-345678`); `Social Security Account Number 4-900-12-345678`.
- A name glued to a word with no digit beside it (`DearJane`, `MsZephyra`), `Zephy ra`, `Z e p h y r a` (MOD-23), `L1AM`, `νan-tree`, `Zepħyra`.
- Where the base's SSN pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`).
- A patient whose names are months (JUNE MARCH): the head redacts the month word that the base's own check finds in its text, so the base
  refuses and the head sends (ruling B; the ready-made fuzzers print these as flips for patient "M").
