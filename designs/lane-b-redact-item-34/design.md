# Queues item 34 (MOD-25): the forms item 26 left in clear: design note

W38, 2026-11-12, on the base a97d73e4 (`packages/redact/src/redact.ts`). Synthetic twins only. Scripts in `scripts/`,
their outputs in `measure/`. Nothing here is built; `scripts/proto.sh` lays a measuring prototype, not a change.

## The construction is item 26's, unchanged

The first reading is not changed by one character. Every rule below is in the wider reading (`widerMatchesIn`, the forms
of `formsOf(subject, true)`) or beside it in `holdsIdentifier`'s `holds`: a wider match is applied only to a letter the
first reading's check sends, and the check refuses on either reading, in every writing it reads. Where a boundary cannot
be known the rule is to refuse, never to redact.

## The rules

| Form | Today (probe: `scripts/probe.mts`) | Rule | Cost |
| --- | --- | --- | --- |
| **(a) Digits-only number glued to a letter** | `Fax X76543210 ext 12`, `XYZ76543210`, `76543210B`, `XYZ7654 3210` sent | In `holds`: a member ID or claim number of digits alone, of **6 digits or more**, matched with its own gaps, with a letter right before or right after it, refuses. Whatever stands on the other side (`XYZ7654321001`, a suffix glued on, is refused too). Plain and look-alike fold; both CR LF writings. No date or amount exception. | Refusals only. Measured below. |
| **(b) A name held with a plus sign** | Held `JANE+ZEPHYRA`, `JANE&ZEPHYRA`: `Ms. Zephyra` and `JANE` sent. Held `ZEPHYRA(JANE)`, `ZEPHYRA*JANE`, `ZEPHYRA:JANE`: `Jane Zephyra` sent too. | Wider reading: a stored name is also split into words at every character that is no letter, no digit and no joiner the records' split already reads. Each piece is a word of the name, as if the records held a space there. One rule for `+ & ( ) * :` and the rest. | Redaction only: what the same name held with spaces costs today. Reads nothing for a name with no such character (none of the gate's 5,292 patients). |
| **(c) One piece of a stored number** | Held `ZZ12345 01`: `ZZ12345` sent, with a label too. | Wider reading: each piece the stored value's own separators set off is a number of its kind if it holds a digit and is 6 characters or more. Redacted at word boundaries; under (a) when digits alone and glued. `01` is never read. | Redaction of that exact piece. Reads nothing for a number held with no separator (none in the gate). |
| **(d) The drafter's check** | `holdsNameOrNumber`: held `ZZ12345/01` written so, false; `ZZ12345+01`, false; held `JANE+ZEPHYRA`, `Ms. Zephyra`, false. | `holdsNameOrNumber` = its reading today, or: numbers as stored (item 26's P6, A-5 below), pieces (c), digits glued (a), names split as (b). Not the name written apart (item 26's ruling stands: `in a` would fail every narrative of a patient INA). | A narrative refused before the call (`identifier_in_input`), never a leak. No counter runs there. |
| **A-4, in the build** | `Zephy, ra`, `Zephy(ra`, `Zephy。ra`, `Zephy*ra`, `Zephy/ra`, `Zephy+ra` and 30 more sent | Wider reading: inside a name's part, any run of characters that are no letter, no digit and none of the checks' three marks joins (`GAP.apart`). No case per mark. | Redaction only. Over 539 prose texts and 64 names alone as the patient: **one** new placeholder (`measure/a4-cost.out`). The pinned row `New, man. Under/wood.` for NEWMAN UNDERWOOD turns to placeholders. |
| **A-5, in the build** | Held `ZZ12345/01`: `.01 ,01 +01 *01 :01 #01` sent | Wider reading: at a place where the records write a separator, any run of up to three characters that are no letter, no digit and no mark joins. The first reading's exceptions stay (a currency amount with cents, a whole written date with no label). | For a claim held `1234/56`, `1234.56` with no currency sign is replaced. No gate patient holds such a number. |
| **A-6, in the build** | `Account \n\rNo. 900-12-345678` sent; `\n` or `\r` alone refused | A third reading in `holdsIdentifier` and `refusedAsFirstRead`: where the text, with each CR LF as a line feed, still holds a line feed right before a CR, it is read once more with each such pair as one line feed. Refused if any reading refuses. | A third check, charged in full, on such letters only: **0** of the gate's 975,489 letters hold one (`scripts/lfcr.mts`). |

Why A-4 to A-6 belong here: each is one line of the same wider reading or one more reading of the same check, each
only adds, none needs the scan's internals, and "before any real PHI" covers them. Leaving them would keep three pinned
leaks for the price of one test block.

## The floor for (a): 6, by measurement

**On the gate's own patients, every floor from 2 to 11 newly refuses 0 letters** (`scripts/measure.mts`,
`measure/floor-summary.json`): of 975,489 letters the base sends 512,505; 8,060 of those are for a call that holds a
digits-only number (6 to 10 digits, one of 4); in none does that number stand glued to a letter. The gate cannot show
this rule closing anything, and cannot set the floor by its patients. So the floor is set by what a number of L digits
*would* meet: every run of digits in a sent letter with a letter right before or after it, the number's own joiners
read (first L or last L digits). T3 is the gate's real-shaped set (codes, units, amounts, dates, references beside a name).

| L | T3 letters (of 51,510) holding any such value | Distinct values (share of all L-digit numbers) | Commonest value: T3 letters | Expected T3 letters refused, a random number | Commonest over all 512,505 sent |
| --- | --- | --- | --- | --- | --- |
| 2 | 42,120 | 100 (100%) | `12`: 4,080 | 424 | `20`: 45,664 |
| 3 | 19,605 | 138 (13.8%) | `110`: 1,275 | 19.6 | `020`: 26,530 |
| 4 | 12,720 | 143 (1.4%) | `7110`: 1,020; `0283`: 255 | 1.27 | `2020`: 28,586 |
| 5 | 10,965 | 146 (0.15%) | `97110`: 1,020 | 0.11 | `97110`: 2,784 |
| **6** | 9,135 | 141 (0.014%) | `123456`: 255 | 0.009 | `200102`: 4,508 |
| 7 | 2,640 | 42 | 120 | 0.0003 | 4,508 |
| 8 | 600 | 10 | 60 | under 0.0001 | `20200102`: 4,663 |

Reading it: up to 5 digits the values are codes every letter repeats (a procedure code with its modifier glued,
`97110GP`; a supply code, `G0283`; a year against a word). A patient numbered `97110` would have 1,020 of T3's letters
refused; one numbered `0283`, every `G0283`. From 6 digits the values are no code: in T3 a reference's own digits
(`PA123456`), over all letters a date's digits glued to a word by the fuzzers (`2020-01-02Jane`). Six is also the floor
the reader already holds twice (`confusableOf`, digits alone; `SCREEN_FLOORS`, member ID and payer claim number).

**Recorded residual, plainly:** a member ID or claim number of 2 to 5 digits alone, glued to a letter that is no label
word (`Account12345`), is still sent in clear. So is a digits-only number of any length glued to digits on both sides
(`976543210`: another number, the 2026-10-27 amendment, unchanged).

## The check's work budget (never raised)

`scripts/work.mts`, `measure/work-floor6.out`, the counter's own units. Rule (a) charges `WORK.formCharacter` (2) for
each character and each digits-only number at or over the floor, per fold and per writing; it takes the stored view.

- A call with no digits-only number: **0 units added.** The base row at 403.5M of 420M stays at 403.5M, sent.
- The same rows with an 8-digit member ID and a 10-digit claim number: +0.2M to +1.2M over the same call without the
  rule (0.4M on the 403M row: 405.3M to 405.7M, sent). No row of item 26's `dear.mts` set changes its answer.
- Letters refused by the count: **0 of the gate's 975,489** (the longest is 1,780 characters). The rule past the
  budget is the base's: refused. A crafted letter within about 0.3% of the budget, for a call with digits-only
  numbers, is refused where it was read; none is known.
- (b), (c): `formCharacter` per added form, only for a call whose stored value holds the character. A-4, A-5: no added
  form. A-6: a third check where a LF CR stands. (d): no counter. Not prototyped; the builder measures each on `work.mts`' rows.

## Tests that fail first, the gate, the build

Tests, `redact.leaks.test.ts`, `describe('MOD-25 ...')`, written before each stage and failing on a97d73e4: the pinned
rows turn (line 861 `ZZ12345`; 1096 A-4; 1109 A-5; 1115 A-6; 835 `New, man. Under/wood.`;
`redact.property.test.ts:1064` `Room AB99887766`), plus new rows for each "Today" cell above, the floor's two edges
(5 digits sent and pinned as the residual, 6 refused), `G0283` and `97110GP` read for a patient numbered `0283` or
`97110`, and one property per form (a letter the first reading refuses is refused; nothing it replaced is shown).

Gate: `scripts/proto.sh`'s `base` tree as A against the head as B, `run.sh A B out --workers 4`. Expected: PHI classes
0, `refusedB` = 462,984 (the gate holds none of these forms), KEEP.changed only A-4's. Because the gate cannot show the
closes, the builder adds a generated set under this directory (each form, 6 to 12 digits, each side, joiners, CR LF,
another script's digits) and runs it through the same worker; then W5's and W13's battery, recorded and fresh seeds.

Stages, one session each, on `co-001/redact-item-34`:
1. (a): `redact.ts` (`holds`, one function, one constant), the two test files, a timed row in `denial-letter.test.ts`.
2. A-5 and (c): `redact.ts` (`numberForm`, the wider forms), `redact.leaks.test.ts`.
3. (b) and A-4: `redact.ts` (the wider name split, `GAP.apart`), `redact.leaks.test.ts`; `cost-names.mts` again.
4. A-6: `redact.ts` (`holdsIdentifier`, `refusedAsFirstRead`), `redact.leaks.test.ts`.
5. (d): `redact.ts` (`holdsNameOrNumber`), `packages/redact/src/narrative.test.ts`, `functions/narrative.test.ts`.
6. Gate, battery, ADR 0054 amendment, test-matrix MOD-25 and its synth registry entries; two adversarial reviews.

## Open questions, a person's

1. **The floor: 6 or 5?** Recommend 6, as measured. 5 is safer for privacy (it closes `Account12345`) and costs
   refusals for the 0.15% of 5-digit numbers that are a code in a letter. If the first practices' records hold
   digits-only numbers of 5 digits or fewer, rule 5. A count of stored numbers by length, run in the product, answers it.
2. **(d) and the packet verifier.** `narrative.test.ts` holds the drafter's check and `nameOrNumberMatches` to one
   answer. Recommend the verifier keeps its reading and the test becomes "the check holds wherever the verifier
   matches, and more"; the verifier's own widening is another item (stored narratives would fail).
3. **A-4's pinned cost row** (`New, man.` replaced). Recommend accepting it: a placeholder, never a leak.
4. **A piece of letters alone** (`ZZ` of `ZZ 1234567`) is not read. Recommend leaving it: it is a word.
