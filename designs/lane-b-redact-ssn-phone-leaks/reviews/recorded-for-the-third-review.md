# Recorded for the fix round reviewed here (cf5094a0 against 0ddfa078 and ef3e8d20): do not report these again

All letters are synthetic twins (patient ZEPHYRA / VANTREE, SSN 900-xx-xxxx, phones 555-01xx and 202-555-01xx, IDs SYN... and ZZ...).
"Base" is ef3e8d20 (`/home/user/tree-ef3`), "before" is the head the last two reviews read, 0ddfa078 (`/home/user/work/p9/beforeF`),
"head" is cf5094a0 (`/home/user/fix`).

## What this round gives back on purpose (sent again, as the base sends them)
- A bare run of digits glued before an SSN's or phone's shape, with no date, amount's cents or currency sign before it: `2020900-12-3456`,
  `2025550100900-12-3456`, `Paid 1234900-12-3456` (as often a reference: `20260115-12-3456`, `1234567893|11|97110`, `remit_20260115_01_0001.pdf`).
- A comma before the shape's two extra digits (`150,00900-12-3456`, `1,00123-456-7890`).
- A reference's noun nearer the number than a phone word or Medicare names it: `Medicare Summary Notice 802-45-678901`,
  `Fax confirmation number 802-456-78901.50`, `Contact us regarding account 802-456-789012`. An SSN label right before the noun still holds
  (`Social Security Account Number 900-12-345678` is refused).
- Medicare is a label over an SSN's shape only (`Medicare 802-456-78901` is sent).
- A masked number with one or two digits before the mask and no year, date's end or cents there (`Acct 4XXX-XX-1234`, `Paid 12XXX-XX-3456`),
  and underscores as the mask after a word outside a held letter (`Initials___ __ 2026`, `Paid___-__-3456`).
- In a held letter: digits before five mask characters with no such structure (`Account 0XXXXX1234`, `Loan 12*****1234`).
- For a date of birth in May, in a held letter: the verb before `,` `;` `:` `)` (`Up to 12 may, at our discretion`), and `may` at a line's end
  before a list's number on the next line (`You may` / `12. Appeal`).

## What this round adds (refused or redacted; the base sends each)
- A range after an amount's cents: `900-12-3456150.00-120.00`, `900123456150.00-120.00`, `...150.00-1/2/2020`.
- Under a label, the usual writing with a point between its first groups where a date is glued after its last four: `SSN 900.12 345601/01/2020`.
- A phone with its area code in parentheses and no label, digits glued after it: `Service (555) 012-345601.01.2020`, `(555) 012-3456150.00`
  (cost: `Section (123) 456-78901.50` with no noun naming it).
- One or two digits in parentheses right after an SSN or phone label are its list number whatever follows: `Phone (2) 555-0100` is
  `Phone (2) [PHONE]`; `Cell (2) is 933.67 4536`, `SSN (2). 150.00 120.00 30.00`, `TTY users call (2), 2,403.99; Paid 150.00 2026` are refused,
  as the base refuses each with the "(n)" taken out. That is the recorded cost of the rule.
- An initial read only beside a name written with a new joiner is fresh too (D1-1), and a pattern's match inside a run that holds an
  identifier glued in a look-alike form is applied by `redactLetter` and `redactionSpans` again (withheld only on the screen path).

## Costs recorded before this round, still there
- A label read through the call's own identifier or a list number refuses what the base refuses without them (`Contact Jane Zephyra, Springfield,
  IL 62701-1234`, `Contact 1: Springfield, IL 62701-1234`, `TTY 1: Questions? 150.00 120.00 30.00`, a `TTY: 711` line with the own identifiers
  and a service row on the next line).
- A shape that starts inside a currency amount: `$1500-12-2026`, `$1000/250/5000`.
- With no noun naming it: cents, a second shape or a date after a shape that starts at its group's start (`802-456-78901.01`,
  `802-45-6789012-34-5678`, `802-91-69413-01-2026`, `310.216.62432.7`), eleven digits or more with cents (`Visit ID 123456789.1` too), and
  under a phone word or Medicare with no listed noun between (`Call us about ID 802-456-78901-02`, `Fax your ID 802-45-678901`).
- A letter glued before a reference's digits un-names it (`Claim W2026008123456.01`; in a held letter `Claim W802-456-78901`).
- `S83511A` for member 583511 and such pieces across a space; `Week5` for a patient WEEKS; a month-and-year phrase for a patient named May or June.
- In a held letter (a letter cc3dd7f6 refused whole): a shape with a longer last group that no listed noun names (`Web ID 802-456-78901`), chains
  of nine or ten digits that no structure places, a named number among them (`Claim 802-456-789012`, `Policy No. 802-456-789012 150.00`,
  `ACH ****1234 150.00`), a local number with no label, the date of birth's month word with its day, and its compact forms.
- `Total due*** ** 2026` (asterisks in a masked SSN's shape glued to a word).

## Not read, as at the base (residuals, not findings)
- In a letter with no held range: an unlabeled amount-shaped number, a five-four with no ZIP before it, a local number with no label, nine single
  digits; a phone label glued to the word before it; `SS#`, `SS NO`, `HIC` glued in capitals; a label, keep-noun or month spelled with look-alikes.
- `Phone 2 555-0100`, `Phone #2 555-0100` (a list number with no parenthesis or colon); `Phone 555-0100 or 555-0101`; `Tel mobile 5550123`.
- A thousands separator or decimal comma glued after a number (`20255501231,250.00`, `584-231-85596,902.96`); one to three digits before the shape
  with no structure (`150900-12-3456`); the shape written with spaces and no label with an amount glued after it; a point-writing under its
  label with an amount glued after it (`SSN 900.12 3456150.00`); `SSN 900 12/03/56`; amount-shaped splits (`Soc Sec 93798 4 1.46`).
- A name glued to a word with no digit beside it (`DearJane`, `MsZephyra`), `Zephy ra`, `Z e p h y r a` (MOD-23), `L1AM`, `νan-tree`, `Zepħyra`.
- Where the base's SSN pattern takes an amount's digits and a date's year for an SSN (`$0,000.00.2020-01-01900-12-3456`), the date's end no
  longer stands before the shape: sent as the base sends it.
