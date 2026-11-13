# Queues item 40, stage 3 (R1-4): what was measured (W74, 2026-11-13)

Trees: the base 17c234d2 (`redact.ts` 3b34d2a284c9) against the head's file as committed at 943be057
(24359600cc53; `trees.sha256`). Every count below is from a file in this directory. Synthetic letters only.

## 1. Every unseen character inside every kind of identifier (`every-unseen.mts`, `every-unseen-*.out`)

93 characters (every control and format character that is not default-ignorable, not white space and not one of the
checks' marks, with one private-use, one unassigned code point and the two lone surrogates) x 3 places inside the
value x 7 frames x 18 kinds, through `redactLetterForScreen` and the check, and through `redactLetter` and its check.
Counted apart, in neither column: 1,395 letters in which the value written with NO such character is sent in clear
too (a phone number of seven digits that is not stored, in a frame with no label: no reading takes it there at all).

| | clear | hidden | refused |
| --- | --- | --- | --- |
| base 17c234d2 | **23,337** | 8,483 | 1,939 |
| head 943be057 | **0** | 5,334 | 28,425 |

Per entry, each of the 18 kinds: **0 clear on the head.** The base sent in clear, among others: a digits-only member
ID 1,953 of 1,953, a lettered member ID 1,953, a date of birth as the records hold it 1,953, in words 1,953, with
slashes 1,302, a Social Security number by pattern 1,932, a phone number of seven digits that is stored 1,947. A
name is never sent in clear on either tree (the first reading's own rule, A-4): 1,953 hidden in all three writings.

## 2. The drafter's check, `holdsNameOrNumber` (`drafter.mts`, `drafter-*.out`)

| rows | base | head |
| --- | --- | --- |
| R1-3: a number character beside one of the call's identifiers (1,154 x 2 sides x 5 frames x 7 writings) | held 20,520 of 80,780 | **held 80,780 of 80,780** |
| R1-4: an unseen character inside one of them (93 x 3 places x 5 frames x 7 writings) | held 1,860 of 9,765 | **held 9,765 of 9,765** |
| an unseen character beside one of them | held 6,510 of 6,510 | held 6,510 of 6,510 |
| a number character beside a value that is NOT the call's (9 writings) | held 0 of 103,860 | **held 0 of 103,860** |
| an unseen character inside a value that is not the call's | held 0 of 12,555 | **held 0 of 12,555** |
| an unseen character beside a value that is not the call's | held 0 of 8,370 | **held 0 of 8,370** |

## 3. Item 40's generated set (seed 40, 51,833 letters; `generated-set-40.stage-3.counts.md`)

Failures **0 in every family this stage builds**; PHI classes **none**; errors 0/0. The 2,741 failures counted are
stage 4's families alone (`A.length-*` 2,736 and `A.other-names` 5), the same letters clear on both trees.
Refused 2,366 on the base, 8,570 on the head.

- **R1-4, no row left clear:** `r14.inside` 768 base clear / 0 head clear, all 768 refused; `r14.surrogate.inside`
  16 of 16; `r14.outside` 384 and `r14.surrogate.outside` 8 hidden on both trees, unchanged.
- **The kinds W71 found clear on the base** (`probe.*`, all newly refused): a date of birth **288 of 288** (and 6
  of 6 for a surrogate), a Social Security number **190 of 192** (2 were hidden on the base; 4 of 4 surrogate), a
  phone number **190 of 192** (4 of 4 surrogate). `probe.name` 192: hidden on both trees, as the base has it.
- **R1-3 (stage 2's families): every count the same as stage 2 measured** — `r13.stable` 3,812, `r13.nfkc` 804,
  `r13.control.name` and `r13.control.lettered` 1,154 each, all refused on the head; `r13.apart` 60 and `r13.left`
  30 unchanged.
- **Real-shaped rows newly refused, 84 of 320 of the R1-4 families** (the prototype's 80, each by form, and 4 more):
  `real.c1.code-range` 16, `real.c1.no-identifier` 16, `real.nel.no-identifier` 16, `real.nul.in-number` 16,
  `real.nul.utf16-read-as-bytes` 16, and **`real.nel.number-then-date-line` 4** (the 4 the prototype did not refuse:
  the entry's reading of the whole letter merges "Member ID: 30072299<U+0085>01/05/2026" into one number and writes
  a different placeholder, so the two readings differ). Of the 84, **32 were sent in clear by the base**
  (`real.nul.in-number`, `real.nul.utf16-read-as-bytes`: a leak this stage closes); **52 the base sent redacted**
  (C1 quotes and dashes 32, U+0085 line endings 20), and they are the cost of the blunt rule.
- Refused 0 of: `real.c1` nine other forms, `real.nel` five others, `real.nul` three others, and every `real.r3`
  form stage 2 did not refuse. The `real.r3` 96 are stage 2's named cost, unchanged.

## 4. Item 34's generated set (14,356 letters)

**differ 0**, failures 0, refused 5,789 on both trees, errors 0/0, PHI classes none, notes 6 as before.

## 5. The two budget rows, and what the further reading is charged (`units-*.out`, `charge.mts`, `charge-*.out`)

**Unchanged on both trees:** `gap + initials 100k` **403,548,210 units, sent**; `U+33FE; to 57,972 with a CR LF`
**414,023,090 units, sent**.

The charge of a letter that holds one unseen character, in the budget's units (redaction + check, read off the
entries), with nothing there / with U+0085 there:

| letter | base | head |
| --- | --- | --- |
| small (131 characters) | 440,630 / 442,402 | 440,630 / **913,164** (2.07x) |
| middling (about 26,000 characters) | 42,441,968 / 42,443,740 | 42,441,968 / **91,027,130** (2.14x) |
| about a quarter of the budget | 100,253,170 / 100,255,918 | 100,253,170 / **235,927,376** (2.35x) |
| about half of the budget | 200,157,170 / 200,159,918 | 200,157,170 / **REFUSED** by the count (331,927,346 in the redaction, and the check past the budget) |
| the row nearest the budget (414,023,090) | sent / sent | sent / **REFUSED, count 420,000,001, one character of text** (the mark alone) |

So: a letter near the budget that holds such a character is refused by the count, with no text, and the budget is not
raised. A letter whose only such character is U+200B (which every reading joins already) is read once: its count is
the base's.

## 6. The full uncached gate, 4 workers (`gate-base-head.report.md`)

975,489 letters, **same 975,489, differ 0**, refused **463,002 on both** (as #161 left it), errors 0/0,
spanMismatch 0, cached 0/0. **PHI none, KEEP none, UNPLACED none, reverse PHI none, reverse KEEP none.**
**Real-shaped newly refused 0**: the gate's 94 letters with U+0085 between digits are refused on the base already,
and no other letter of the gate holds such a character beside or inside anything a reading takes. The gate's own
timing: max A 1,122 ms, B 1,239 ms (its run: A 1,769 s, B 1,515 s over the whole corpus).

## 7. Fuzzed letters (item 34's `w58/fuzz.mts`, seeds 301 to 303, 20,000 each)

**base-refused, head-sent 0** in all three (and 0 with a letter or digit outside placeholders). The head refuses
**558 / 569 / 558 more** than the base (1,685 of 60,000, 2.8%): the fuzzer writes control characters freely, and
each such letter is read once more and refused where the two readings differ.

## 8. Time (`timing-*.out`, `timing-unseen-*.out`, `property-100-letters.out`)

- The reader over 20,000 letters of the gate's shard 0, one thread, two runs each: base 1.4074 and 1.3741 ms per
  letter, **head 1.3916 and 1.3578** — at or below the base, and the same 6,997 refused on both.
- **A letter that holds an unseen character** (the same 20,000 with U+0085 after each): base 1.3805 ms per letter,
  **head 2.6375 — 1.97x the head's own 1.3362 for the same letters without one: the check twice, as expected.**
  With U+200B after each (joined already, read once): head 1.4479.
- The **100-letter property** (`denial-letter.test.ts`, three runs each, alternating on a quiet machine,
  `property-100-letters.out`): base 4,194 / 3,802 / 3,945 ms, **head 3,919 / 3,988 / 3,940 ms — inside the base's
  range** (stage 2 measured base 4,463 / 3,920 / 3,974, head 3,764 / 3,625 / 3,790 on the same machine).

## 9. The product's suites on the head

redact 54 passed; packets 1,825 passed; synth 192 passed; model-gateway **6,018 passed, 6 failed**: the six owed-red
tests of stage 4 alone (`gateway.db.test.ts` and `patient-records.db.test.ts` do not run for want of DATABASE_URL,
as on the base). `redact.leaks.test.ts` on its own: 1,511 passed, 6 failed (stage 4's). eslint and tsc clean on
`packages/redact` and `packages/model-gateway`.
