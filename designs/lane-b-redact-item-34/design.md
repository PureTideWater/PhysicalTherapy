# Queues item 34 (MOD-25): the forms item 26 left in clear: design note

W38, 2026-11-12, on the base a97d73e4 (`packages/redact/src/redact.ts`). Synthetic twins only. Scripts in `scripts/`,
outputs in `measure/`. Nothing is built: `scripts/proto.sh` lays a measuring prototype of rule (a) alone. Revised once
after `review-1.md` (13 findings, each verified: `scripts/verify-review-1.mts`, `measure/verify-review-1.out`).

## The construction is item 26's, unchanged

The first reading is not changed by one character. Every rule is in the wider reading (`widerMatchesIn`, the forms of
`formsOf(subject, true)`) or beside it in `holdsIdentifier`'s `holds`. A wider match is applied only to a letter the
first reading's check sends; the check refuses on any reading, in every writing it reads. Where a boundary cannot be
known the rule refuses and never redacts. One class of gap serves A-4 and A-5: **any run of characters that are no
letter, no digit and none of the checks' three marks** ("a run of marks" below).

## The rules

| Form | Sent today (`scripts/probe.mts`) | Rule | Cost, and what it still leaves |
| --- | --- | --- | --- |
| **(a) Digits-only number glued to a letter** | `Fax X76543210 ext 12`, `XYZ76543210`, `76543210B`, `XYZ7654 3210`; held `7654/3210`: `X7654/3210` | In `holds`: a member ID or claim number of digits alone, **5 digits or more**, in each of its wider forms (as stored, A-5, pieces of (c)), with a letter right before or right after the match, refuses. Plain and look-alike fold; every writing. No date or amount exception. `XYZ76543210-01` and `XYZ76543210123` are refused. | Refusals only; measured below. **Left:** a digit right beside the number (`976543210`, `0076543210`, `7654321001`, `765432109B`): another, longer number, the 2026-10-27 amendment, unchanged. |
| **(b) A name held with a plus sign** | Held `JANE+ZEPHYRA`, `JANE&ZEPHYRA`: `Ms. Zephyra`, `JANE`. Held `ZEPHYRA(JANE)`, `ZEPHYRA*JANE`, `ZEPHYRA:JANE`: `Jane Zephyra` too | Wider reading: a stored name is also split into words at every character that is no letter, no digit and no joiner the records' split reads. Each piece is a word of the name, as if a space were held there. | Redaction only: what the name held with spaces costs today (held `ZEPHYRA*MEDICARE`, "Medicare" is replaced, and under (d) fails that case's narratives). **Left:** a name the records glue to a digit or to another word (`ZEPHYRA2`, `JANEZEPHYRA`): no split can be known. |
| **(c) One piece of a stored number** | Held `ZZ12345 01`: `ZZ12345`; held `12345 01`: `Member ID: 12345` | Wider reading: each piece set off by a character of the stored value that is no letter and no digit (a joiner too) is a number of its kind if it holds a digit and has 5 characters or more. It takes its number's placeholder (the first in the call's order if two share it) and the first reading's exceptions (an amount, a whole written date with no label). | Redaction of that piece wherever it stands whole: a piece that is a compact date (`20261115` of `20261115 000123`) replaces that date written compact. **Left:** a piece under 5 characters (`01`, `1234`), or of letters alone (`ZZ`). |
| **(d) The drafter's check** | `holdsNameOrNumber`: held `ZZ12345/01` written so; `ZZ12345+01`; held `JANE+ZEPHYRA`, `Ms. Zephyra` | Its reading today, or: numbers as stored (item 26's P6, with A-5), pieces (c), digits glued (a), names split as (b). Not a name written apart: item 26's ruling stands (`in a` would fail every narrative of a patient INA). | A narrative refused before the call (`identifier_in_input`), never a leak. No counter runs there. |
| **A-4, in the build** | `Zephy, ra`, `Zephy(ra`, `Zephy。ra`, `Zephy*ra`, `Zephy/ra`, `Zephy+ra`: 36 of 39 marks probed | Wider reading: inside a name's part a run of marks joins (`GAP.apart`). No case per mark. | Redaction only. Over 539 prose texts, 64 names alone as the patient: **one** new placeholder (`scripts/a4.sh`, `measure/a4-cost.out`). Not in that run: a part of two letters that an abbreviation spells with a slash. For a patient HO, NA, LE or WO, `h/o`, `N/A`, `L/E`, `w/o` are replaced (`n a` already is). `New, man. Under/wood.` for NEWMAN UNDERWOOD turns to placeholders. |
| **A-5, in the build** | Held `ZZ12345/01`: `.01 ,01 +01 *01 :01 #01` | Wider reading: where the records write a separator, a run of marks joins. The first reading's exceptions stay. | For a claim held `1234/56`, `1234.56` with no currency sign is replaced. |
| **A-6, in the build** | `Account \n\rNo. 900-12-345678`; `\n\r\r` too | A third reading in `holdsIdentifier` and `refusedAsFirstRead`: where the text with each CR LF as a line feed still holds a line feed right before a CR, it is read once more with each line feed and the CRs after it (`\n\r+`) as one line feed. Refused if any reading refuses. | A third check, charged in full, on such letters only: **0** of the gate's 975,489 hold one (`scripts/lfcr.mts`, `measure/lfcr.out`). |

A-4 to A-6 belong here because each is one line of the same wider reading or one more reading of the same check, each
only adds, and "before any real PHI" covers them. Item 26's `review B, the recorded costs` block was weighed and stays:
each row is a placeholder or a refusal, and a narrower rule is the kind that leaked. The builder re-reads its rows after
the name stage and lists any that turn.

## The floor for (a) and (c): 5

**On the gate's own patients every floor newly refuses 0 letters** (`scripts/measure.mts`; `measure/floor-summary.json`,
whose `newlyRefused` and `census` are empty: no letter counted). The base sends 512,505 of 975,489; 8,060 of those are
for a call with a digits-only number; in none does it stand glued to a letter. The gate's digits-only numbers are all
6 to 10 digits but one of 4 (`measure/census.out`), so the gate tests floors 2 to 6 as one. It cannot show this rule
closing anything. The floor is set by what a number of L digits *would* meet: each run of digits in a sent letter with
a letter right before or after it, the number's joiners read (its first or last L digits). T3 is the gate's real-shaped
set (codes, units, amounts, dates, references beside a name).

| L | T3 letters (of 51,510) holding any such value | Distinct values (share of all L-digit numbers) | Commonest in T3 | Expected T3 letters refused, a random number | Commonest over all 512,505 sent |
| --- | --- | --- | --- | --- | --- |
| 2 | 42,120 | 100 (100%) | `12`: 4,080 | 424 | `20`: 45,664 |
| 3 | 19,605 | 138 (13.8%) | `110`: 1,275 | 19.6 | `020`: 26,530 |
| 4 | 12,720 | 143 (1.4%) | `7110`: 1,020; `0283`: 255 | 1.27 | `2020`: 28,586 |
| **5** | 10,965 | 146 (0.15%) | `97110`: 1,020 | 0.11 | `00102`: 4,508; `97110`: 2,784 |
| 6 | 9,135 | 141 (0.014%) | `123456`: 255 | 0.009 | `200102`: 4,508 |
| 7 | 2,640 | 42 | 120 | 0.0003 | 4,508 |
| 8 | 600 | 10 | 60 | under 0.0001 | `20200102`: 4,663 |

A floor costs only a patient who holds a number of that length: where no such number is stored it reads nothing. So the
question at each L is what such a patient pays, against that number sent in clear.

- **5, the note's floor.** The reader itself expects a five-digit patient control number (the comment over
  `SCREEN_FLOORS`). 0.15% of five-digit numbers are a value some T3 letter glues to a letter; a patient numbered `97110`
  has every letter that writes `97110GP` refused (1,020 of T3's). A refusal goes to a person; nothing leaks.
- **4 is where codes are glued by their own format** (`G0283`: a letter and four digits), 1.4% of numbers, and a year
  against a word. Not taken: the cost falls on ordinary letters of about one such patient in 70.
- **6** is what the reader's two other floors hold (`confusableOf`; `SCREEN_FLOORS`, 6 and 6, 8 for a patient control
  number) and costs a tenth of 5. It leaves `Account12345`. Not taken: the safer side for privacy is 5.
- Not measured: a diagnosis code written without its point (a letter and up to five digits); T3 writes the point.
- The "all sent" column shows no break at any L: the fuzzers glue a date's digits to a word (`2020-01-02Jane`).

**Recorded residual, plainly:** a member ID or claim number of 2 to 4 digits alone, glued to a letter that is no label
word (`Account1234`), is sent in clear; so is a piece under 5 characters; so is every "Left" cell above.

## The check's work budget (never raised)

`scripts/work.mts`, `measure/work-floor6.out`, the counter's own units; the cost does not depend on the floor.

- A call with no digits-only number at the floor: **0 units added.** The base row at 403.5M of 420M stays, sent.
- Otherwise `WORK.formCharacter` (2) per character, per such number and form, per fold and writing: 0.2M per number
  for 100,000 characters in one reading. Two numbers: +0.2M to +1.2M on item 26's rows; the 403M row goes 405.3M to
  405.7M, sent. Ten numbers: +2.0M, and +11.6M (2.8%) with CR LF and a look-alike (the review's rows).
- **A crafted letter does turn:** dates written with spaces, 100,000 characters, ten 7-digit claim numbers: 418.78M
  sent becomes 420.78M refused. The rule past the budget is the base's: refused, to a person.
- **Letters refused by the count: 0 of the gate's 975,489** (at most 1,780 characters, ADR 0054); one crafted row.
- The prototype takes the check's stored view as the wider reading does. A build that builds its own view pays
  `WORK.viewCharacter` too, +3.4M per reading for two numbers: the build must take the stored view, and pin it.
- Not prototyped, for the builder to measure on `work.mts`' rows: (b), (c) and A-5 add `formCharacter` per added form,
  only where a stored value holds the character; A-4 adds no form; A-6 a third check where LF CR stands; (d) no counter.

## Tests that fail first, the gate, the build

`redact.leaks.test.ts`, `describe('MOD-25 ...')`, written before each stage, failing on a97d73e4. Pinned rows that turn:
line 861 (`ZZ12345`), 1096 (A-4), 1109 (A-5), 1115 (A-6), 835 (`New, man. Under/wood.`). `redact.property.test.ts:1064`
(`Room AB99887766`) does **not** turn (it reads `redactLetter`'s text, which (a) leaves): its comment is corrected and a
row added that the check refuses it. New rows: each "Sent today" cell; the floor's edges (4 digits sent and pinned as
the residual, 5 refused); `97110GP` refused for a patient numbered `97110`, `G0283` sent for one numbered `0283` (`measure/floor-edges.out`); each
"Left" cell pinned as sent; one property per form (what the first reading refuses or replaces, the head does).

Gate: `scripts/proto.sh`'s `base` tree as A, the head as B, `run.sh A B out --workers 4`. Expected: PHI classes 0,
`refusedB` 462,984, changes only from A-4. Since the gate holds none of these forms, the builder adds a generated set
here (each form, 5 to 12 digits, each side, joiners, CR LF, another script's digits, stored separators, pieces) through
the same worker; then W5's and W13's battery, recorded and fresh seeds.

Stages, one session each, on `co-001/redact-item-34`:
1. A-5 and (c): `redact.ts` (`numberForm`, the wider forms), `redact.leaks.test.ts`.
2. (a) on those forms: `redact.ts` (`holds`, one function, one constant), both test files, a timed row and the crafted
   refused row in `functions/denial-letter.test.ts`. Then the gate, a first time.
3. (b) and A-4: `redact.ts` (the wider name split, `GAP.apart`), `redact.leaks.test.ts`; `a4.sh` again.
4. A-6: `redact.ts` (`holdsIdentifier`, `refusedAsFirstRead`), `redact.leaks.test.ts`.
5. (d): `redact.ts` (`holdsNameOrNumber`), `packages/redact/src/narrative.test.ts`, `functions/narrative.test.ts`.
6. The generated set, the gate and the battery.
7. ADR 0054 amendment, test-matrix MOD-25, its synth registry entries; then two adversarial reviews, two fix rounds at most.

## Open questions, a person's

1. **The floor: 5, 6 or 4?** Recommend 5. A count of stored numbers by length, run inside the product, would say
   whether any practice holds 4-digit numbers; if so, rule on 4 with the table above.
2. **(d) and the packet verifier.** `narrative.test.ts` holds the drafter's check and `nameOrNumberMatches` to one
   answer. Recommend: the verifier keeps its reading, the test becomes "the check holds wherever the verifier matches,
   and more", and the verifier's own widening is another item (stored narratives would fail).
3. **A-4's costs** (`New, man.`, and `N/A` for a patient NA). Recommend accepting: placeholders, never a leak.
4. **A digit beside the number** (`7654321001` for 76543210). Recommend leaving it recorded: refusing it refuses every
   longer number that holds a patient's digits, and needs its own measurement.
