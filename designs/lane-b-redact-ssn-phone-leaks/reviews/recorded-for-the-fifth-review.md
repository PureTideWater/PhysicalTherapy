# Recorded for the fix round reviewed here (a66fee45 against 8e599038 and ef3e8d20): do not report these again

All letters are synthetic twins (patient ZEPHYRA / VANTREE, SSN 900-xx-xxxx, phones 555-01xx and 202-555-01xx, IDs SYN... and ZZ...).
"Base" is ef3e8d20 (`/home/user/tree-ef3`), "before" is the head the last two reviews read (8e599038, `/home/user/work/p13/before`),
"head" is a66fee45 (`/home/user/fix`). A "held letter" holds a range of two kinds glued, such as `Service 01/01/2020-150.00 Paid`.
A cost or a give-back is recorded by its family, not only by its one example.

## What this round gives back on purpose (sent again, as the base sends them; "before" refused each)
- A month's word across a space after a number is a date of its own, never one glued to the number: `802-45-678901 Jan 15, 2026`,
  `Web ID 802-456-78901 Sep 30, 2026`, `(001) 420 97116 Jan 15, 2026`, `802-45-678901 may 30 days`, `724-24-822630 Jan 2026 97535`.
  So `900-12-345601 Jan 2020` (a day glued to the number, its month after a space) is sent. Glued it is read: `900-12-345601Jan2020`,
  `(202) 555-012301-Jan-2020`.
- After a bare nine or ten, a bar, an underscore, a backslash or a tilde is no date's joiner unless a Social Security label stands over
  the run: `91895853214|3|20260401|97110`, `ERA_79790014228_08_2026.pdf`, `12345678901~02~2026`, `Fax ERA_79790014228_08_2026.pdf`. So
  `Seen 90012345601|02|2020`, `Phone 20255501231_02_2020` and `Medicare 90012345601_02_2020` are sent (`SSN: 90012345601_02_2020` is refused).
  And after that date stands an amount with cents, a second date or no digit: `12345678901/02/20261234` is sent.
- A reference's noun names its number across a blank line or a rule drawn under the label where the label ends as one does (a number
  word, a number's own name such as ICN, a colon or `#`) or the rule stands between; a label wrapped over two lines is one label:
  `Claim Number:\n\n20260112345.01`, `ICN\n-----\n12345678901234.01`, `Claim\nNumber\n20260112345.01`, `Remittance\nAdvice No. ...`.
  So `Statement No.\n\n900-12-3456150.00`, `Claim Number:\n\n900-12-3456150.00` and `REMITTANCE ADVICE\n=====\n900-12-3456150.00` are
  sent, as a named number on its label's line is. A heading with no such end and a blank line stays no name (`STATEMENT\n\n900-12-3456150.00`
  and `REMITTANCE ADVICE\n\n900-12-3456150.00` are refused), and three line breaks name nothing.
- A date before a year glued to a shape is read in digits only with its separators tight, and a month's word with no day only at its
  word's start: `Sec. 2.1. 2026011-22-3333`, `Items 3 - 5 - 2026011-22-3333`, `Dismay 2026011-22-3333` are sent. So
  `01 / 02 / 2020900-12-3456` and `Dismay 2020900-12-3456` are sent (`01/02/2020900-12-3456`, `January 2020900-12-3456`, `PaidJan 1, 2020900-12-3456` are refused).

## What this round adds (refused; the base sends each unless said)
- The scan keeps ef3e8d20's reading: where the strict reading may hold less in a chain than ef3e8d20 held (a label found only through the
  call's own identifier or a list number; a list number, which is no digit of a chain to it; a run of nine digits or more before a
  decimal point, which is no amount to it), the text is read once more as ef3e8d20 read it and the worse of the two is the answer
  (`survivorIn`, `survivorRead`, `departs`). `Phone (20) 2555 0123`, `SSN (9) 00-12-3456`, `Fax 2) 15 00 30 00`, `Cell number 1) 7886924.4`,
  `Telephone number 8 1234567893.1` are refused, as the base refuses each ("before" sent the first four; the last was sent since an earlier round).
- A date written year first after a bare nine or ten with a day or month of one digit (`9001234562020-1-5`); a second date after the
  date (`90012345601/02/202001/31/2020`); a nine and a date that begins with one digit, with slashes (`1234567899/9/2020`). COST,
  recorded: an unnamed ten-digit run before `/D/YYYY`.
- The Social Security label right before a noun makes the noun the label's own word, however far the number stands after it and whatever
  is glued before its shape (`Social Security Account Number:` and a column of spaces, `SSN Account 01-900-12-3456150.00`,
  `Social Security Claim Number 900-12-3456150.00`).
- Under a Social Security label, a point between the second and third groups of the usual writing (`SSN 900 12.3456150.00`); under
  Medicare or a phone word that writing stays an amount and a number (`Medicare rate 110 32.74420`, so `Medicare 900 12.3456150.00` is sent).
- `Phone on-file:`, `Phone on\nfile:` name nothing.
- In a held letter an area code in parentheses with a longer last group is refused again with no label: `(202) 555-01234`. COST,
  recorded: `Line (001) 420-97110`, `Table (555) 456-23099` in a held letter (the round before gave these back; the two cannot be told apart).

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
  (`Call us about ID 802-456-78901-02`, `Fax your ID 802-45-678901`). `Section (123) 456-78901.50`.
- Under a Social Security label whatever noun stands between (`Social Security Administration Notice 802-45-678901`,
  `SSN verified. Account 802-45-678901.50`, `SSN 1: Account 802-45-678901.50`); a claim's or another code's label nearer the number
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
- A number a listed noun names, under no Social Security label: `Remittance Advice Number 802-45-678901.50`, `Claim(s) 802-45-678901.50`,
  `Claim 2020-900123456150.00`, `Member   ID 802-45-678901.50`; a Social Security label out of the label's reach or unlisted with a noun between
  (`Social Security number as shown on your record: 900-12-345678`, `S.S. No. on file: 900-12-345678`); `Social Security Account Number 4-900-12-345678`.
- A name glued to a word with no digit beside it (`DearJane`, `MsZephyra`), `Zephy ra`, `Z e p h y r a` (MOD-23), `L1AM`, `νan-tree`, `Zepħyra`.
- Where the base's SSN pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`).
- A patient whose names are months (JUNE MARCH): the head redacts the month word that the base's own check finds in its text, so the base
  refuses and the head sends (ruling B; the ready-made fuzzers print these as flips for patient "M").
