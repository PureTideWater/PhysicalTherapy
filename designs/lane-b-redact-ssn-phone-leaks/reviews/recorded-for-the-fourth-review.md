# Recorded for the fix round reviewed here (8e599038 against 91e1527a and ef3e8d20): do not report these again

All letters are synthetic twins (patient ZEPHYRA / VANTREE, SSN 900-xx-xxxx, phones 555-01xx and 202-555-01xx, IDs SYN... and ZZ...).
"Base" is ef3e8d20 (`/home/user/tree-ef3`), "before" is the head the last two reviews read (91e1527a, `/home/user/work/p12/before`),
"head" is 8e599038 (`/home/user/fix`). A "held letter" holds a range of two kinds glued, such as `Service 01/01/2020-150.00 Paid`.

## What this round gives back on purpose (sent again, as the base sends them)
- A label's list number is no digit of the number the label names: `Telephone call (2) 30.00 60.00`, `Fax 2) 15.00 30.00`,
  `SSN (2) 15.00 30.00`, `Calls (3) 25.00 75.00` read as the same line reads with the list number taken out.
- A point between the second and third groups of the usual writing under a label: `Medicare rate 110 32.74420`,
  `Contact: Billing 250 75.123456`.
- In a held letter, an area code in parentheses with no label and nothing glued after the number: `Line (001) 420-97110`.

## What this round adds (refused or redacted; the base sends each)
- Under a Social Security label no noun names the number: `SSN/Member ID: 900-12-3456150.00`, `SSN on file: 900-12-345678`,
  `Soc. Sec. Acct. No. 900-12-345678`. A phone word or Medicare still yields to a noun nearer the number. COST, recorded:
  `Social Security Administration Notice 802-45-678901`, `SSN verified. Account 802-45-678901.50` are refused (a claim or
  another code label nearer the number still names it: `SSN on file. Claim 802-45-678901.50` is sent).
- "on file" names nothing (`Phone on file: 202-555-0123150.00`); "advice" names only as "remittance advice"; a noun names
  across one line break at most (`REMITTANCE ADVICE\n\n900-12-3456150.00 01/02/2020` is refused).
- Before an SSN's masked shape: three digits or more, a currency amount, a year-first date's day (`CPT 97110XXX-XX-3456`,
  `Paid $150XXX-XX-3456`, `DOS 2020-01-02XXX-XX-3456`, `Paid 150.00___-__-3456`; in a held letter `DOS 2020-01-02XXXXX3456`).
  COST, recorded: `Acct 123XXX-XX-1234` is refused; one or two digits before the mask stay (`Acct 4XXX-XX-1234`).
- The date before a year glued to a shape in more writings: `01-Jan-2020900-12-3456`, `Jan 1,2020900-12-3456`,
  `January 2020900-12-3456`, `01/2020202-555-0123`, `01Jan2020202-555-0123`, a line break before the year. COST, recorded:
  `Plan SEP 2020802-45-6789`, `Page 3/2020900-12-3456` are refused. A bare year with no date before it stays (`Seen 2020900-12-3456`).
- A date glued after a bare nine or ten: with more glued after it (`90012345601/02/2020150.00`), its month's word
  (`90012345601-Jan-2020`), a middle dot or bullet as its joiner, year first with more after it (`9001234562020-01-02150.00`),
  and after a ten a one-digit day or month with slashes (`20255501239/9/2020`). Kept where a noun names the run, and
  `20260112345-01-2026` (one digit and dashes) is sent. COST, recorded: `Seen 12345678901-Jan-2026` is refused.
- An area code in parentheses with no label and something glued after the number, written more loosely: `( 202 ) 555-0123150.00`,
  `(202) - 555-0123150.00`, a line break after the parenthesis, a month-word date after it (`(202) 555-012301-Jan-2020`).
- The list number in parentheses with a space inside, an ordinal's suffix, a plural label, a line break before it:
  `Phone ( 2 ) 555-0100`, `Phone (2nd) 555-0100`, `Phone numbers (2) 555-0100`, `Phone\n(2) 555-0100` are `... [PHONE]`.
- A range after cents written with a slash or a dotted date: `900-12-3456150.00/120.00`, `900-12-3456150.00-1.2.2020`.
- In a held letter, for a date of birth in May: `May` at a line's end and the day with an ordinal's suffix on the next line.

## Costs recorded before this round, still there
- A label read through the call's own identifier or a list number refuses what the base refuses without them (`Contact Jane Zephyra, Springfield,
  IL 62701-1234`, `Contact 1: Springfield, IL 62701-1234`, `TTY 1: Questions? 150.00 120.00 30.00`, `Cell (2) is 933.67 4536`,
  `SSN (2). 150.00 120.00 30.00`, a `TTY: 711` line with the own identifiers and a service row on the next line).
- A shape that starts inside a currency amount: `$1500-12-2026`, `$1000/250/5000`.
- With no noun naming it: cents, a second shape or a date after a shape that starts at its group's start (`802-456-78901.01`,
  `802-45-6789012-34-5678`, `802-91-69413-01-2026`, `310.216.62432.7`), eleven digits or more with cents (`Visit ID 123456789.1` too),
  an eleven- to fourteen-digit run whose last digits begin a date (`On 12345678901/02/2026`), and under a phone word or Medicare
  with no listed noun between (`Call us about ID 802-456-78901-02`, `Fax your ID 802-45-678901`). `Section (123) 456-78901.50`.
- A letter glued before a reference's digits un-names it (`Claim W2026008123456.01`; in a held letter `Claim W802-456-78901`).
- `S83511A` for member 583511 and such pieces across a space; `Week5` for a patient WEEKS; a month-and-year phrase for a patient named May or June.
- In a held letter (a letter cc3dd7f6 refused whole): a shape with a longer last group that no listed noun names (`Web ID 802-456-78901`), chains
  of nine or ten digits that no structure places, a named number among them (`Claim 802-456-789012`, `Policy No. 802-456-789012 150.00`,
  `ACH ****1234 150.00`), a local number with no label, the date of birth's month word with its day, and its compact forms.
- `Total due*** ** 2026` (asterisks in a masked SSN's shape glued to a word).

## Not read, as at the base (residuals, not findings)
- In a letter with no held range: an unlabeled amount-shaped number, a five-four with no ZIP before it, a local number with no label, nine single
  digits; a phone label glued to the word before it; `SS#`, `SS NO`, `HIC` glued in capitals; a label, keep-noun or month spelled with look-alikes.
- `Phone 2 555-0100`, `Phone #2 555-0100` (a list number with no parenthesis or colon); `Phone (2)555-0100` (no space after the
  parenthesis); `Phone 555-0100 or 555-0101`; `Tel mobile 5550123`.
- A bare run before a shape with no date, cents or currency sign before it (`2020900-12-3456`, `FY2020900-12-3456`, `2019-2020900-12-3456`,
  `150900-12-3456`); a thousands separator or decimal comma glued after a number (`20255501231,250.00`); a date with a two-digit year
  after a bare nine or ten (`12345678901-04-26`); a ten and a one-digit date with dashes or points.
- The shape written with spaces and no label with an amount glued after it (`Service (202) 555 0123150.00` too); a point-writing under its
  label with an amount glued after it (`SSN 900.12 3456150.00`); `SSN 900 12/03/56`; amount-shaped splits (`Soc Sec 93798 4 1.46`).
- A number a listed noun names, under no Social Security label: `Remittance Advice Number 802-45-678901.50`, `Claim(s) 802-45-678901.50`,
  `Claim 2020-900123456150.00`, `Member   ID 802-45-678901.50`.
- A name glued to a word with no digit beside it (`DearJane`, `MsZephyra`), `Zephy ra`, `Z e p h y r a` (MOD-23), `L1AM`, `νan-tree`, `Zepħyra`.
- Where the base's SSN pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`).
