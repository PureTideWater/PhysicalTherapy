# Review C-PHI (PHI: what is sent): the delta since the reviewed build (fix round 1 and the work bound)

Scope: `/home/user/rev/delta-since-review.diff` (r0 to head), measured against `/home/user/rev/base`. Four trees
(`base`, `r0`, `f0d`, `head`), both paths (screen: `redactLetterForScreen`; letter: `redactionSpans` and `redactLetter`),
each followed by `holdsIdentifier` on the returned text. Synthetic letters and patients only. Nothing under
`/home/user/PhysicalTherapy` was changed, committed or pushed.

## Verdict

No blocking finding. Bars 1, 2, 3 and 4 held in every run: no letter the base refuses was sent by the head, no
character the base replaced stood in clear in a text the head sent, no candidate was dropped, every head answer was
f0d's or a refusal by the mark, and no stored answer differed from a fresh reading's. Three findings below are NOT
BLOCKING; each is reproduced, and each is the stated construction working as written, with a consequence the brief
did not state.

## Findings

### C-PHI-1 NOT BLOCKING (outside the bar: a refusal the base, r0 and f0d do not make)

The bound refuses, by length alone, a letter the base, r0 and f0d all send: one name part written apart, once, in a
letter whose first text is 100,001 characters (50,001 with CR LF line endings). One character fewer and the head sends
it, with the name replaced. This is the construction as designed (refuse, never send unread), and no bar is touched;
it is recorded because it is the head's only change of answer and because it is a refusal of a letter with nothing left
in it under f0d's reading.

Patient `{ pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }`,
claims `[{ claimId: 'c1', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }]`.

Letter, one over the bound (100,001 written): `'paid in full. '.repeat(7141) + ' Patient Zephy ra was seen.'`

| tree | path | answer | returned text ends in U+0001 | returned text length | "Zephy ra" in clear in the returned text |
|---|---|---|---|---|---|
| base | screen | sent | no | 100,001 | yes |
| base | letter | sent | no | 100,001 | yes |
| r0 | screen | sent | no | 100,007 | no |
| r0 | letter | sent | no | 100,007 | no |
| f0d | screen | sent | no | 100,007 | no |
| f0d | letter | sent | no | 100,007 | no |
| head | screen | REFUSED | yes | 100,002 | yes |
| head | letter | REFUSED | yes | 100,002 | yes |

The same letter one character shorter, at the bound (100,000 written): `'paid in full. '.repeat(7141).slice(1) + ' Patient Zephy ra was seen.'`

| tree | path | answer | returned text ends in U+0001 | returned text length | "Zephy ra" in clear in the returned text |
|---|---|---|---|---|---|
| base | screen | sent | no | 100,000 | yes |
| base | letter | sent | no | 100,000 | yes |
| r0 | screen | sent | no | 100,006 | no |
| r0 | letter | sent | no | 100,006 | no |
| f0d | screen | sent | no | 100,006 | no |
| f0d | letter | sent | no | 100,006 | no |
| head | screen | sent | no | 100,006 | no |
| head | letter | sent | no | 100,006 | no |

Ran: `findings.mts` (and `bound.mts`, rows "apart name, no line ending").

### C-PHI-2 NOT BLOCKING (no bar broken; the refusal past the bound rests on the caller running the check)

Past the bound the letter path returns the first reading's text with U+0001 after it. For the letter of C-PHI-1 (one
over the bound) the head's `redactLetter(...).text` holds "Zephy ra" in clear and ends in U+0001, where f0d's and r0's
hold `[PATIENT_NAME]` there; `redactionSpans(...).text` is 100,002 units for a letter whose NFKC text is
100,001, so it is no longer "the letter as NFKC text" its comment promises (the spans still fit: they are the
base's, all before the mark; checked on every marked row). `holdsIdentifier` refuses the text, so a caller that runs
the check sends nothing. A caller that does not would send what the base sends plus a control character: no worse
than the base (bar 2 is measured against the base and holds), but worse than f0d for the same letter.
`redactLetter` is re-exported from `packages/model-gateway/src/index.ts:208`; it has no caller outside tests today,
and neither has `redactionSpans`. The one production caller, `packages/model-gateway/src/functions/denial-letter.ts`
lines 230 to 233, calls `redactLetterForScreen` (230) and runs `holdsIdentifier(redacted.text, ...)` on the next line, before
`redacted.text` or `redacted.candidates` is used anywhere (lines 234 to 239 are reached only after the check).

Letter and patient: those of C-PHI-1, one over the bound. Outcome: the table of C-PHI-1 (rows head/letter and
f0d/letter). Ran: `findings.mts`; `bound.mts` (50 marked rows, 25 on the letter path, each with spans equal to the
base's and a text one unit longer than the base's).

### C-PHI-3 NOT BLOCKING (the brief's "one path under, the other over": found, and not harmful)

The two paths count different first texts (the screen path leaves withheld matches as written), so one letter can be
over the bound on the screen path and under it on the letter path. Found: the head refuses it by the mark on the
screen path and sends it on the letter path. The text sent on the letter path is f0d's exactly (text, spans, answer),
and the base and f0d send the letter on both paths, so nothing is sent that f0d does not send. The reverse case (letter
path over, screen path under) was found only in letters the base refuses on both paths.

Patient `{ pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['3456150.00', '12-3456', '345.678'] }`,
claims: one claim each for `'56150'`, `'0123'`, `'1/02/2020'`, `'12/3456'`.

Letter (50,010 written; first text's work 100,001 on the screen path and 99,985 on the letter path):

```js
"76543210 \r\njan e J-Member ID:: ja-\nNE\nq\nz\u0415pH\u0443Ra\u200b900\u201112\u20113456\n900 12 5615001/02/2020\r\n\r\n1-800-555-0199\u200b12/3456\r\n" + '\n' + 'paid in full. '.repeat(7200).slice(0, 49870) + '\r\n' + '\nPatient Zephy ra was seen.'
```

| tree | path | answer | returned text ends in U+0001 | returned text length | "Zephy ra" in clear in the returned text |
|---|---|---|---|---|---|
| base | screen | sent | no | 50,003 | yes |
| base | letter | sent | no | 49,995 | yes |
| r0 | screen | sent | no | 50,033 | no |
| r0 | letter | sent | no | 50,025 | no |
| f0d | screen | sent | no | 50,033 | no |
| f0d | letter | sent | no | 50,025 | no |
| head | screen | REFUSED | yes | 50,004 | yes |
| head | letter | sent | no | 50,025 | no |

Ran: `asym.mts 5` (40,000 generated letters; 1,128 with first texts of different lengths between the paths; the
screen path sends 1 of them, this one), then `findings.mts`.

## What I ran, in numbers

| script | what | letters | result |
|---|---|---|---|
| `fuzz.mts`, seeds 11, 12, 13 (540 s each) and 21, 22, 23 (500 s each) | short letters, 11 patients, five trees (the four and `nostore/`, the head with its stores never opened), both paths | 47,891 | 0 rows in every bar category; 0 throws in any tree |
| `fuzz.mts` seed 999 (25 s, smoke) | the same | 711 | the same |
| `fuzz.mts` seed 900 with `HEAD_TREE=/home/user/rev/r0/redact.ts` (100 s) | proof of the harness: r0 read in the head's place | 1,424 | bar 1 on the letter path fires 100 times (review A's A-1), "differs from f0d" 65 (screen) and 620 (letter): the harness detects what it is built to detect (`out/harness-proof/`) |
| `bound.mts` | 19 kinds of letter padded to first-text work 99,999 to 100,002, and 3 long ones (200,000, 250,000 and 300,000 written) | 49 letters, 98 rows | 50 rows marked, all 50 refused, each text the base's and the mark; 44 rows at or under the bound, none marked, all 44 f0d's exactly; 4 rows over the bound and not marked are the two letters with no wider match, f0d's exactly; 0 violations |
| `nfkc.mts` | written length against NFKC length: ligatures, U+FDFA, combining marks, supplementary letters, with and without CR LF, at the bound and one over | 10 letters, 20 rows | at 100,000 (99,999 for the CR LF kind) not marked and f0d's; at 100,001 marked and refused, whether the written length was 32,273 or 118,109; 0 violations |
| `asym.mts 5` | letters whose first text differs between the paths, the longer one over the bound | 5 letters, 10 rows | 0 violations (C-PHI-3) |
| `asym.mts 8 any 40` | 40 random letters of reviewer A's generators, padded, a name apart added, 20 at the bound and 20 one over | 40 letters, 80 rows | 40 rows marked and refused, 40 not marked and f0d's exactly; 0 violations |
| `stores.mts` | module state across calls (below) | 32 letters x 5 patients | 9,510 comparisons, 0 differ |
| `findings.mts` | the three findings, once more from their letters | 3 letters | as the tables above |

Totals of the six fuzz seeds, screen / letter path: the base refuses 27,995 / 27,928; base and head both send
18,568 / 18,633, and in 11,610 / 11,653 of those the head's text is not the base's (more is replaced; a run the base
replaced standing in the head's text: 0; a base candidate the head does not offer: 0; a base span position the head's
spans do not cover: 0); the base sends and the head refuses 1,328 / 1,330; r0 sends and the head refuses 272 / 3,610
(the fix round's effect); r0 refuses and the head sends 0 / 0; the base refuses and the head's text is not the base's
text 0 / 0; the two paths of the head answer differently in 65 letters. No short letter reaches the bound, so in the
fuzzer every head answer was compared with f0d's for exact equality (text, answer, candidates or spans): 0 differ in
47,891 x 2.

## What I tried that held

Bar 1. No letter the base refuses was sent by the head on either path (0 of 27,995 and 27,928; 0 in the long letters).
Where the base refuses, the head's returned text was the base's text in every letter, so the first reading is the
base's there.

Bar 2. In every letter both send: no run the base replaced is in clear in the head's text (reviewer A's `shown`), the
head's spans cover every position of the base's spans (letter path, exact), and the head offers every candidate the
base offers.

Bar 3, the bound and the mark.
- Exact at the edge on both paths: work 100,000 runs the check and gives f0d's answer; 100,001 gives the mark. With
  CR LF the count is the length and the length again with `\r+\n` as `\n`; `\r\r\n`, lone `\r`, a CR LF only inside the
  name, U+0085 inside the name, a look-alike name, own identifiers replaced before the name, a held range, an SSN twin:
  all as the rule says (`bound.mts`).
- The count is on the normalised first text in UTF-16 units: written length under the bound and NFKC over it is
  marked; written over and NFKC at the bound is read and is f0d's (`nfkc.mts`). No letter was sent that f0d refused.
- The mark is refused in every case tried: after a lone high surrogate, after a lone low surrogate and a CR, after a
  letter that itself ends in U+0001 (two marks), with U+0001 or U+0004 inside the letter; `holdsIdentifier` of 16
  texts with the mark at the end, as written and after NFKC and NFKD, refuses all 48. Nothing in `unbracketed`,
  `unmarked` or `masked` runs between the return and the check's first line (`text.search(PRIVATE_MARKS)`), and
  `written` appends after the mark's position only on the letter path, where the mark is the text's last unit.
- Every marked text is the first reading's whole (equal to the base's text and one mark); marked candidates are the
  base's; marked spans are the base's and fit the returned text.
- Where the wider reading has nothing to apply there is no bound: 200,000 and 250,000 written are f0d's answers.

Bar 4, the stores and the fix round.
- The head with its stores never opened (`nostore/redact.ts`, one line added to `inOneReading`) gives the head's text,
  answer, candidates and spans in all 47,891 letters on both paths.
- Order and freshness: 4,747 letters read again later in the same process, other letters and patients between, 0
  differ; 116 fresh instances of the head's module, 4,640 letters read in them against the long-running instance, 0
  differ; `stores.mts` A: 160 letter and patient pairs each in an instance of its own against one instance reading
  them forward, in reverse and shuffled twice, 640 comparisons, 0 differ.
- A reading that throws midway (`stores.mts` B): a patient and claims whose Nth property read throws, for every N a
  reading makes (up to 418 in one call), on `redactLetterForScreen`, `redactionSpans` and `holdsIdentifier`, 4
  letters, 2,823 throws; after each, letters read in the same instance against fresh answers: 8,629 comparisons, 0
  differ. C: 27 calls with identifiers of the wrong type or shape (15 throw), then 241 comparisons, 0 differ.
- The A-1 and A-2 fixes: the fuzzer's letters carry reviewer A's K-1 letters and held ranges with CR LF, `\r\r\n`,
  `\r\r\r\n`, lone `\r`, `\n\r`, U+0085, U+2028, U+2029, VT, FF and mixtures, names apart across each of them, stored
  numbers with brackets and parentheses, and the patient of A-2 (member ID `3456150.00`). r0 refuses and the head
  sends: 0. The head refuses what r0 sends in 272 (screen) and 3,610 (letter) letters.

## Not reproduced

Nothing is held back as a suspicion. Two rows `bound.mts` first printed as violations were my script's error (it took
a letter that itself ends in U+0001 for "not marked"; the head's text ends in two marks there, and all three trees
refuse the letter); the test was corrected and the script rerun whole (`out/bound.log`: 0 violations).

## Limits of this review

- The first reading's equality with the base is shown by the fuzzer (47,891 letters) and by the long letters, not by
  reading r0's 5,000 lines; reviews A and B hold that ground.
- A fresh process was stood in for by a fresh instance of the module (its own fold, stores and patterns); each script
  run is also a process of its own. A throw from inside a pattern's engine was not produced; throws came from the
  identifiers' property reads and types.
- One letter was found with the screen path over the bound and sending under it (C-PHI-3); 20 random letters were
  taken over the bound, 49 built ones around it.
- Time was not measured for a verdict (that is C-time's); the long letters' worst times here, on a loaded machine:
  base 0.9 s, f0d 3.4 s, head 1.1 s.

## Rerun

```
cd /home/user/PhysicalTherapy
PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx /home/user/ops/designs/lane-b-redact-item-26/reviews/c-phi/fuzz.mts <seed> <seconds>
... bound.mts | nfkc.mts | asym.mts 5 | asym.mts 8 any 40 | stores.mts | findings.mts
```

Scripts are beside this report; results in `out/` (per seed: `fuzz-<seed>.json` with the counts, a `.jsonl` per
category that has rows). `nostore/` is a copy of the head's `redact.ts` and `confusables.ts` with one line added.
`out/` and `nostore/` are not in `reviews/.gitignore`.
