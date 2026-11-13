# Queues item 40: two forms of a stored number sent in clear, and ruling (A)'s one initial: measured design note

W70, 2026-11-13, on the base 17c234d2 (`packages/redact/src/redact.ts`, sha256 3b34d2a2...). Synthetic values only.
Nothing is built: `scripts/lay.sh` lays the base's reader and a measuring prototype (`scripts/proto.mjs`, three edits
over a scratch copy outside `packages/`); `scripts/measure.sh` runs every measurement below in one command. Counts are
in `measure/`. The form follows item 34's note (`designs/lane-b-redact-item-34/design.md`).

## The construction is item 34's, unchanged

The first reading is not changed by one character. Each rule is in the wider reading or in the check's `holds`, only
adds, and refuses on either reading. What the base's whole entry refuses stays refused (`refusedAsTheBaseRead`). The
check's budget, thresholds and allowances are not raised. Where a boundary cannot be known the rule refuses.

## 1. The mechanisms on the base, and their families (`scripts/probe.mts`, `measure/probe-base-17c234d2.out`)

Outcome of a row: **clear** (sent, the value's letters and digits all in it), **hidden** (sent without it), **refused**.

### R1-3: a number character that is no decimal digit beside a digits-only number

- **Mechanism.** `BEFORE`/`AFTER` (`redact.ts:94-95`, `(?<![\p{L}\p{N}])`, `(?![\p{L}\p{N}])`) end every form of the
  first and the wider reading (`patternOf`, :737), so `ↀ76543210` is no match of the number. Rule (a)
  (`digitsGluedToLetter`, :4053) then asks for `\p{L}` on one side (`(?<=\p{L})core|core(?=\p{L})`, :4070 and :4074),
  and U+2180 is `\p{Nl}`: neither reading takes it and the letter is sent as written.
- **Family: every `\p{Nl}` and `\p{No}` character, 1,154 in this runtime's Unicode.** For the 953 that NFKC leaves as
  they are, in four forms each (bare and after `Member ID`, before and after the number): **3,780 clear, 0 hidden, 32
  refused** (945 clear and 8 refused in each form; by category Nl 203 and 1, No 742 and 7).
- **Not in the family: a number with a letter in it, and a name.** `ↀZZ7654321`, `ZZ7654321ↀ`, `ↀZephyra`, `Zephyraↀ`:
  refused for all 953 (3,812 of 3,812). Only a digits-only number escapes, since only rule (a) reads `\p{L}` alone.
- **Beside it, and not this item's unless ruled (question 3):** the 201 characters NFKC rewrites. They reach the reader
  as decimal digits or letters (`①` is `1`, `Ⅰ` is `I`): the recorded "a digit right beside the number: another,
  longer number" of the 2026-10-27 amendment. 1,608 rows: 304 clear, 638 hidden, 666 refused, the same on the prototype.

### R1-4: an unseen character inside a stored number

- **Mechanism.** The view (`buildView`, :602) keeps a control character as itself: it is no `BLANK`, no
  default-ignorable (so not `VANISHED`), and `\s` holds only U+0009 to U+000D of the controls. `NUMBER_JOINERS` (:669)
  has `\s` and VANISHED, so `GAP.number` does not cross it; the wider reading's run of marks (`runOfMarks`, :754; A-5)
  stands only where the records write a separator (`numberForm`, :775). `7654<U+0085>3210` is two numbers of four
  digits to every reading, and rule (a) reads the same forms, so glued to a letter it is sent as well.
- **Family, wider than the review counted: every `\p{C}` character that is not default-ignorable, not white space and
  not one of the checks' own marks** (U+0001 to U+0003, which the check refuses). Probed: all 57 such controls (U+0085
  among them), all 32 format characters that are not default-ignorable (U+0600 to U+0605, U+06DD, U+070F, U+08E2,
  U+FFF9 to U+FFFB and others), 3 private-use and 4 unassigned code points: 96 characters.
  - **Inside the number, eight forms** (after a label, bare, glued to a letter, after the first digit, twice, after a
    dash, before a space, inside `ZZ76?54321`): **768 clear of 768, 0 hidden, 0 refused.** A joiner beside the
    character does not help (`7654-<U+0000>3210`: clear), and a number with a letter in it is sent too.
  - **Before or after the number, or between it and a letter** (four forms): **0 clear, 384 hidden.**
  - **U+2028, U+2029, the white space controls, every `\p{Zs}` and every default-ignorable format character** (163
    characters): 0 clear in all twelve forms (hidden; refused where glued to a letter).

### (A): the initial after a name whose match ends in a letter standing alone

- **Mechanism.** Under A-4 (`GAP.apart`, :687) and the reading at every place (`ownMatchesIn`, :1335), `ZZ/ZZZZ Z.Z.Z`
  for ZZZZZZ is matched from 0 (`ZZ/ZZZZ`) and from 3 (`ZZZZ Z.Z`); the merged span ends on the second letter of the
  chain. The last `Z` is an initial's candidate (`initialsNextToNames`, :1768), but what stands between the name's end
  and it is `.`: `gapFrom` (:1817) skips a period only after a *taken initial* (`preceding === before`), never after a
  name, and `INITIAL_GAP_AFTER` (:1755) holds no period. So it is not taken: `[PATIENT_NAME].Z`.
- **Family: not only a name of one repeated letter.** Any name whose wider match can end in one letter written as a
  dotted initial: `Ann A.A.` for ANNA is `[PATIENT_NAME].A.`; `Zephyr A.A.` for ANA ZEPHYRA the same; and
  **`Zephyr A.J.Q.` for JANE Q ZEPHYRA is sent as `[PATIENT_NAME].J.Q.`: two initials.**
- **Counted:** names of Z and of A, lengths 2 to 12, each cut by `/`, space, `.` or `-` at every place, with a chain of
  1 to 4 initials in four writings, before and after the name, four frames: 42,240 rows, **2,736 with a letter of the
  name in clear, 39,504 hidden, 0 refused.** By length: 2: 0; 3: 54; 4: 144; 5: 270; 6 to 12: 324 each.

## 2. The candidate rules

Measured for the prototype (P1, P2, P3 together, `measure/`), against the base: the probe; the full uncached gate
(`gate-base-proto.report.md`); item 34's generated set; 60,000 fuzzed letters; the two budget rows; time.

| | What | Shown or sent (probe) | Real-shaped newly refused (the gate, **measured by prototype**) | Budget rows | Time |
| --- | --- | --- | --- | --- | --- |
| **R1-3 (i) refuse (P1)** | Rule (a) asks for a letter **or a number character that is no decimal digit** on one side: `[\p{L}\p{Nl}\p{No}]`. Two lines of `digitsGluedToLetter`. | 3,780 clear become **0**; all 7,624 rows refused. | **0** of 975,489 (0 letters of the gate hold an Nl or No character). | 0 units added: the same scan, the same charge. | None measurable. |
| R1-3 (ii) read wider and replace | A wider form whose edges are `(?<![\p{L}\p{Nd}])`: `Ref ↀ[MEMBER_ID]`. | Not prototyped. | Not measured. | One more form per number: `WORK.formCharacter` per character. | More, on every letter. |
| **R1-4 (i) refuse on one more reading (P2)** | Where the text the check is given holds an unseen character (the class above, one `v`-flag class), the check reads it once more with each run of them as U+200B (which the view joins); refused if either reading refuses. A-6's shape. | 768 clear become **0**, all refused; the 384 hidden stay hidden. | **0** (94 letters of the gate hold one, all U+0085 between digits, source T5; all refused on the base already). | Both rows unchanged (they hold none). The build charges the further reading in full: **not measured** on a row that holds one. | One search per letter; a letter that holds one pays the check twice. |
| R1-4 (ii) refuse the letter | The check refuses any letter that holds an unseen character. No reading. **The safer one.** | 0 clear; the 384 hidden rows become refused too. | By count: at least the same 94, all refused already; **0 new on the gate.** | 0 units. | One search per letter. |
| R1-4 (iii) read wider and replace | The class joins a number in the wider forms. | Not prototyped. | Not measured. | Larger forms on every call. | More, on every letter. |
| **(A) (i) replace (P3)** | In the wider reading only, the period after a name that ends in a letter standing alone is that initial's period, as it is after a taken initial. One line of `initialsNextToNames`. | 2,736 become **0**; `Zephyr A.J.Q.` is three placeholders. | **0**; and 0 letters of the gate change at all. | Unchanged. | None measurable. |
| (A) (ii) refuse | The check refuses an initial's letter standing right after `[PATIENT_NAME].`. **The safer one.** | Not prototyped. | Not measured (434 letters of the gate hold letter, period, letter; that is not the count refused). | One scan. | Small. |
| (A) (iii) leave recorded | | 2,736 stay. | 0. | | |

The prototype's numbers, all three edits together:

- **The gate, full, uncached, 4 workers:** 975,489 letters, **differ 0**, refused 463,002 on both, no PHI class, no
  KEEP class. Real-shaped newly refused: 0. The gate holds almost none of these forms, so this says the rules cost its
  letters nothing; it does not say what real letters that hold such characters cost (section 4).
- **Item 34's generated set** (14,356 letters): differ 0, failures 0, refused 5,789 on both. It holds none of item
  40's forms either: item 40 needs its own generated set (stage 1).
- **Fuzzed, 60,000** (the product's `fuzzLetters`, seeds 401 to 403): **base-refused, head-sent 0**; base-sent,
  head-refused 438 (0.73%; the fuzz alphabet holds U+0004 and U+0085); both sent with another text 6 (P3's: P1 and P2
  only refuse).
- **Budget rows** (`units.mts` of item 34): 403,548,210 and 414,023,090 on both trees.
- **Time** (`scripts/timing.mts`, the first 20,000 letters of shard 0, one thread, two runs each): base 1.036 and
  1.037 ms per letter, prototype 1.052 and 1.074 (+1.5% to +3.6%, near the runs' own spread). The gate's 100,000
  character rows: no row's order changed; differences both ways.

**Recommendations.** R1-3: **(i)**, which is also the safer. R1-4: **(i)**; **(ii) is the safer** and differs only in
refusing letters that hold such a character where no reading finds anything. I recommend (i) because a letter decoded
from Windows-1252 as Latin-1 carries U+0091 to U+0097 for its quotes and dashes, and (ii) would refuse every such
letter; if stage 1's set shows one row sent in clear under (i), the item falls back to (ii) with no further design.
(A): **(i)**; (ii) is the safer and is not measured. None of the three needs the budget touched.

## 3. The build

One branch, `co-001/redact-item-40`; each stage one session; tests first, failing on 17c234d2.

**Stage 1: tests and the generated set, no reader change.** In `redact.leaks.test.ts`:
- the five rows of `describe('MOD-25: forms still sent in clear ...')` (:2760) rewritten to **refused**;
- the two (A) rows (:2855) rewritten to `[PATIENT_NAME].[PATIENT_NAME]`; new rows `Ann A.A.` (ANNA),
  `Zephyr A.J.Q.` (JANE Q ZEPHYRA) all placeholders; `Zephyra. I am` keeps its `I` (the first reading's rule stands);
- R1-3: one row per category each side (`ↀ`, U+1369, U+00B2 as NFKC writes it pinned as the longer-number residual);
  `Ref ↀ7654 on file.` for a number of four digits sent (the floor's residual);
- R1-4: U+0000, U+001B, U+007F, U+0085, U+0096, U+0600, U+FFF9, U+E000 inside the number after a label, bare, glued,
  after a dash, twice, and inside `ZZ76?54321`: refused; before and after the number: `[MEMBER_ID]` as today;
- one property per form: what the base refuses or replaces, the head does (item 34's shape);
- a crafted row at the budget: the 414,023,090 row with one U+0085 added is refused by the count, with no text.
A generated set for item 40 through the gate's worker (`generated-run.mts`): this note's three families, and
**real-shaped rows the gate lacks**: prose with U+0085 line endings, prose with U+0091 to U+0097 as quotes and dashes
(`Zephyra<U+0092>s`, `97110<U+0096>97112`), a NUL from a bad extraction. Each row's newly refused is named.

**Stage 2: R1-3 (i).** `digitsGluedToLetter`, its comment, the ADR's "Left" cell. **Stage 3: R1-4 (i).**
`holdsIdentifier` (a further reading, charged in full, inside `inOneReading`), and the same reading in
`refusedAsFirstRead`; `denial-letter.test.ts` for the crafted row. **Stage 4: (A) (i).** `initialsNextToNames`;
item 34's `a4.sh` again. **Stage 5:** the measurements, ADR 0054's amendment, test-matrix MOD-25, the synth registry
entries; then the two reviews, two fix rounds at most.

**Every stage passes:** item 40's generated set 0 failures (and item 34's: differ only where named); the full uncached
gate with real-shaped newly refused 0 or each named; the rows 403,548,210 and 414,023,090 unchanged; base-refused,
head-sent 0 of 60,000 fuzzed; the 100-letter property's time not above the base's range (Queues item 39 owns the
reader's time; this item adds one search per letter and must show it).

**Review 1 (leaks):** characters outside the measured sets (a lone surrogate, code points a later Unicode assigns,
an unseen character beside a joiner, a numeral or a placeholder; inside a name, a date of birth, a Social Security or
phone number); whether any `\p{Nl}`/`\p{No}` row is still sent; the drafter's check. **Review 2 (cost and
regressions):** base-refused, head-sent; the further reading's charge and the crafted rows at the budget; time and
any backtracking in the new class; real-shaped letters newly refused in stage 1's set; the 6 fuzzed letters P3 changes.

## Open questions, the orchestrator's

1. **R1-4: (i) one more reading, or (ii) refuse every letter that holds an unseen character?** Recommend (i); (ii)
   is the safer and is the fallback if stage 1 shows one clear row.
2. **Does the further reading stand for every identifier or for stored numbers only?** P2 reads the whole check
   again, so a name, date of birth and pattern number are read too. Recommend the whole check: one rule, no case per
   kind.
3. **A decimal digit beside the number that NFKC makes of another character** (`①76543210`, 304 clear rows).
   Recommend it stays the recorded longer-number residual (item 34's question 4), with its own item if wanted.
4. **(A): replace, refuse or leave?** Recommend replace (i). It closes two initials for an ordinary name, not only
   the one the ruling recorded.
5. **The further reading is charged in full, and a letter near the budget that holds an unseen character is then
   refused by the count.** Recommend yes; the budget is not raised.
6. **The drafter's check (`holdsNameOrNumber`) and the packet verifier:** recommend the drafter's check takes R1-3
   and R1-4 in stage 3, measured there; the verifier stays as item 34 left it.

## 4. What this note did NOT establish

- **What real letters that hold these characters cost.** The gate holds 94 letters with an unseen character (all
  U+0085 between digits, all refused on the base) and none with an Nl or No character. "Newly refused 0" is measured
  on the gate and on item 34's set; no real-shaped letter with U+0085 line endings or C1 quotes was run. Stage 1's set
  is that measurement, and the choice between R1-4 (i) and (ii) leans on it.
- **The further reading's charge.** The prototype starts it from the same count as the first; no row that holds an
  unseen character was measured in units, and no time for such a letter (expected: the check twice).
- **The prototype is in the check only.** The redaction's own gates (`refusedAsFirstRead`, `refusedAsTheBaseRead`)
  were not given the reading; whether a wider replacement can then hide what the further reading would refuse was not
  tested beyond the probe and the 60,000 fuzzed letters.
- **Which 8 of the 953 characters the base already refuses**, and why (not read).
- **Characters not probed:** lone surrogates; private-use and unassigned code points beyond 7 samples (the class is
  by property, and "unassigned" changes with the runtime's Unicode); visible marks inside a number where the records
  write nothing (`7654.3210`), which item 34's design leaves sent.
- **R1-4 inside a name, a date of birth, a Social Security or phone number on the base:** not probed (review 1 of
  item 34 says A-4 joins a control character inside a name).
- **(A) beyond Z and A:** other names by eight rows only; (A) (ii) and both "read wider and replace" candidates for
  the numbers were not prototyped, and their costs are stated, not measured.
- **The 438 fuzzed letters newly refused** were not split between P1 and P2, and the 6 changed by P3 were not read.
- **The product's own suites** were not run on the prototype; the drafter's check and the verifier were not probed.
