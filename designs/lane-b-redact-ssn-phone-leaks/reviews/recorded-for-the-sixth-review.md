# Recorded for the fix round reviewed here (24ad1075 against a66fee45 and ef3e8d20): do not report these again

All letters are synthetic twins (patient ZEPHYRA / VANTREE, SSN 900-xx-xxxx, phones 555-01xx and 202-555-01xx, IDs SYN... and ZZ...).
"Base" is ef3e8d20 (`/home/user/tree-ef3`), "before" is the head the last two reviews read (a66fee45, `/home/user/work/p14/before`),
"head" is 24ad1075 (`/home/user/fix`). A "held letter" holds a range of two kinds glued, such as `Service 01/01/2020-150.00 Paid`.
A cost or a give-back is recorded by its family, not only by its one example.

## What this round gives back on purpose (sent again, as the base sends them; "before" refused each)
- A rule drawn under a label may be of underscores, tildes or box-drawing lines, with a table's corners and bars around it, and three
  underscores or more (a form's blank), a tilde run or a `+` may stand between a noun and its number on one line too:
  `ICN\n_____\n12345678901234.01`, `Claim Number\n+------------+\n20260112345.01`, `| Claim |\n|-------|\n| 20260112345.01 |`,
  `Claim Number: ______ 20260112345.01`. So `STATEMENT\n_____\n900-12-3456150.00`, `Claim: ____ 900-12-3456150.00` and
  `Claim + 900-12-3456150.00` are sent, as a named number is.
- A Social Security label counts only where it is the number's own label (the scan's label for it, the nearest): under Medicare with
  such a label merely within reach, a point between the second and third groups stays an amount and a number
  (`Social Security Act. Medicare rate 110 32.74420`, `SSN: Medicare rate 110 32.74420`). So `SSN/Medicare ID 900 12.3456150.00` is sent.
- "On file" names nothing only as one phrase on one line: `This notice is based on\nFile Number: 12345678901234.01` is sent. So
  `Phone on\nfile: 202-555-0123150.00` is sent.
- The scan's second reading is ef3e8d20's own and reads no Social Security label glued after a letter: `MemberSSN 8 1234567893.1`,
  `Assoc. Sec. 8 1234567893.1` are sent, as the base sends them (`Member SSN 8 1234567893.1` is refused, as the base refuses it).

## What this round adds (refused; the base sends each unless said)
- A letter that writes U+0001, U+0002 or U+0003 anywhere is refused (`holdsIdentifier`): the base refuses some such letters
  (`Total\u0002for45.00 and 9 0 0 1 2 3 4 5 6`) and "before" sent them. COST, recorded: every letter with one of the three characters,
  those the base sent unchanged (`Our office: 555-0123. Paid\u0002`) and those it sent with a number redacted (`SSN\u0001 900 12 3456`).
- A month's word glued to a number's last digits is its date's with a four-digit year after a space or a comma too:
  `900-12-345601Jan 2020`, `202-555-012301Jan, 2020`. COST, recorded: `802-45-678901Jan 2026` (a reference and a month-and-year phrase
  glued by a lost space). Two digits after the space are not read (`900-12-345601Jan 20`, `802-45-678901Jan 15, 2026` are sent).
- After the date that follows a bare nine or ten: no digit, or digits that begin another number with a structure of its own (digits,
  then a point, a comma, a slash or a dash, then a letter or digit): `90012345601/02/20201,250.00`, `...2020150.5`,
  `...202001/31/2020150.00`, `...202001-Jan-2020`. COST, recorded: `12345678901/02/20261234-56`, `12345678914/3/20260401/97110` (a row
  joined by slashes), with no noun naming the run. Under a Social Security label that is the run's own, whatever follows the date.
- The hyphen bullet (U+2043) joins that date's parts as a dash does.
- A noun names its number with one line break at most inside the label (a wrapped label) and, after the label's last word, one, or
  two where a rule is drawn or the label ends as one does, the colon or `#` that ends it on the label's own line:
  `Statement\n\nNumber: 900-12-3456150.00`, `STATEMENT\n\n\n\nNo. 900-12-3456150.00`, `REMITTANCE ADVICE\n\n#900-12-3456150.00` are
  refused. A rule is three of its characters or more (dashes, equals signs, underscores, tildes, asterisks, box-drawing lines; points
  are none): `STATEMENT\n-  \n...` and `STATEMENT\n...\n...` are refused.

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
  characters under a label. A noun before "on file" (`Claim number on-file: 12345678901234.01`).
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
  and a column of spaces); `SSN 900 12·3456150.00`, `SSN 900 12/3456150.00`; `Phone on record:`, `Phone on our file:`, `Phone on_file:`;
  a date written year first with its month's word after a bare run (`9001234562020-Jan-5`); a month's word glued to a number with two
  digits after a space (`900-12-345601Jan 20`).
- A number a listed noun names, under no Social Security label: `Remittance Advice Number 802-45-678901.50`, `Claim(s) 802-45-678901.50`,
  `Claim 2020-900123456150.00`, `Member   ID 802-45-678901.50`; a Social Security label out of the label's reach or unlisted with a noun between
  (`Social Security number as shown on your record: 900-12-345678`, `S.S. No. on file: 900-12-345678`); `Social Security Account Number 4-900-12-345678`.
- A name glued to a word with no digit beside it (`DearJane`, `MsZephyra`), `Zephy ra`, `Z e p h y r a` (MOD-23), `L1AM`, `νan-tree`, `Zepħyra`.
- Where the base's SSN pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`).
- A patient whose names are months (JUNE MARCH): the head redacts the month word that the base's own check finds in its text, so the base
  refuses and the head sends (ruling B; the ready-made fuzzers print these as flips for patient "M").
