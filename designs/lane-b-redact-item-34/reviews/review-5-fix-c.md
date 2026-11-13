# Review 5: the fix of finding (C), commit 287c68d3 (parent 17028cfa, base a97d73e4)

Scope: two questions only. (1) Can a letter the base refuses now be sent? (2) Does the fix add time, or move the
units the entry counts? Synthetic data only. All timing was taken while another long measurement ran on the machine
(4 workers): the figures are under load.

## Summary

- No letter was found that the base refuses and the fix sends: 0 of 10,500 fuzzed letters of new shapes (the
  pre-fix head sent 2 of them), and none by reading the code.
- No move of counted units was found on any letter that is sent. The entry's count does move on letters the base
  refuses (R5-2), all of which stay refused.
- One way a base refusal is not reproduced is left open by construction, the base refusing by its work count
  (R5-1). I could not build a letter for it: it is a lesser finding with a measured window, not a blocker.
- The added time is bounded by a second work budget per entry call (R5-3); measured between nothing and about
  +60% of the entry's time, by the letter's shape.

## Findings

### R5-1 (LESSER): a base refusal by the work COUNT is not reproduced; the fix can count fewer units than the base

Place: `asTheBaseRead` (`checkWorkSpent = 0`) and `refusedAsTheBaseRead` in packages/redact/src/redact.ts.

The base's verdict counts on one counter: its first reading, its wider reading, its gate, then the check
(holdsIdentifier continues from checkWorkOf). The base's reading as the fix runs it again starts from 0 and leaves
out the first reading, the gate where the entry has already answered it, and the first reading's check where the
shortcut applies. So it passes the budget only on far longer letters than the base did, and a letter the base
refused by count alone is refused by the fix only if the fix's own count (entry plus check) passes the budget too.
The doc comment of `refusedAsTheBaseRead` says as much ("it counts no more than the base's entry counted").

That holds only if the fix never counts fewer total units than the base. It does count fewer, on short letters:
41 of 313 sampled letters that all three trees send, by up to 238,226 units. In 40 of the 41 the widened reading
replaced more, so the check read a shorter text or one writing fewer (a CR LF inside a replaced span); in 1 the
texts were equal and the gap was 906 units.

Example (base SENT, pre-fix head SENT, fix SENT; the verdicts agree, only the counts differ):

- names `['AAAAAAAA']`, memberIds `['ZZ12345/01']`, claimNumbers `["7'7'7'7'7", 'ZZ12345/01']`
- text `"A\nA\na\na\nA\nA\nA\nA\r\nA#7\u00047\u0004𝟕\u00047\u00047\r7#𝟕#7#7\t"`
- base: total 929,476 units, text `"[PATIENT_NAME]\r\n[PATIENT_NAME]#7\u00047\u00047\u00047\u00047\r7#7#7#7\t"`
- fix (and pre-fix head): total 725,942 units, text `"[PATIENT_NAME]#[CLAIM_1]\t"`

What I could not do: scale this to the budget. A blocker needs a letter the base counts just past 420,000,000 and
the fix counts at or under it. On seventeen scalable shapes (a run of marks inside a stored number or a name's
part, with and without CR LF; plain filler with a marked name; a letter of spaced letters) the fix counted more
in total than the base, by 0.1% to 28%, because the entry's gate reads the long first text where the widened
reading finds a match, and the glued-number reading and the pieces add work where it finds none. The gaps where
the fix counts fewer were constant in size (up to about 240,000 units, 0.06% of the budget), not growing with the
letter. So the open window is: a letter whose base count falls within about 240,000 units above the budget and
whose long part costs the same in both readings. I hold no such letter. If the ruling is to cover the count too,
the direct way is to run the base's reading on a counter that starts from the first reading's units and add the
base's check in full, and refuse where that sum passes the budget.

### R5-2 (LESSER): the entry's counted units move on letters the base refuses

Place: `screenAsBothRead`, `const wrote = base.spans === first.spans ? asFirstWrote : widened(base.spans)`.

`widened` runs on the entry's counter (formsOf, identifierCandidates). Where the base refuses with spans of its
own, the entry now writes the base's spans, not the widened ones, so checkWorkOf of the result differs from the
pre-fix head. 6 of 10,500 letters, all refused by the base and by the fix; 0 among letters the fix sends.

Example (base REFUSED, pre-fix head REFUSED, fix REFUSED):

- names `['J. ZEPHYRA']`, memberIds `['7,7,7,7,7']`, claimNumbers `['77777']`
- text `"7J.z.E.p.H.Y.R.A\nJ&Z&E&p&H&Y&R&a·jZ\r\r\nE-|PhyRA­7,7,7,7,7,Patient: 77777.𝟕7)7\r\n7-,7\u0085A\t"`
- checkWorkOf: pre-fix head 650,506; fix 659,506. The fix returns the base's text.

Example where the count goes down (base REFUSED, pre-fix head SENT, fix REFUSED with the mark; a second instance
of finding (C), now closed):

- names `['ΑΑΑΑΑΑΑΑ']`, memberIds `['12345 6789']`, claimNumbers `['7-7-7-7-7', '77777']`
- text `"7777𝟕)77777–SSN 7-7-7-7-7|7-X123456789–Α,Αα\r\n_ [ΑʼΑ'ΑΑ\"Α Α\rΑ\rΑ\rΑ\rΑ\rα\rα123456789 "`
- checkWorkOf: pre-fix head 699,546; fix 695,586.

The other moves seen (pre-fix to fix): 796,792 to 800,792; 1,442,074 to 1,447,074; 1,282,676 to 1,284,176.

Why lesser: every such letter is refused whatever the count (the base's text refuses itself in the check, or it
carries the mark; a count pushed past the budget is refused by the entry's catch). It is still a move of counted
units, strictly read, and the commit message's "so the entry's counted units do not move" is true only of letters
the base sends. If no move at all is wanted, write the base's spans without `widened` (the candidates of a refused
letter are not used), or run `widened(base.spans)` off the entry's counter.

### R5-3 (LESSER): the added time is bounded by one more budget per entry call, and is paid by every letter

Place: `refusedAsTheBaseRead`, called by `screenAsBothRead` and `redactionSpans` for every letter that passes the
glued-number test and the entry's gate, a letter no reading touches included.

Bound: the base's reading counts on its own counter from 0 and stops at CHECK_WORK_BUDGET (the catch in
`refusedAsTheBaseRead` then refuses with the mark). So an entry call can now do up to 840,000,000 units of counted
work, 420,000,000 of them not in checkWorkOf. Nothing in the extra reading runs uncounted that the base's own
readings did not run uncounted (`written`, `merge`, `within`). The time is bounded, at about twice the worst
entry.

Measured, whole entry, pre-fix head against fix, same process layout, under load (one or two runs each):

| letter | length | pre-fix entry | fix entry |
| --- | --- | --- | --- |
| plain filler, no identifier | 2,002 | 8 to 12 ms | 7 to 15 ms |
| plain filler, no identifier | 20,020 | 61 to 67 ms | 51 to 63 ms |
| plain filler, no identifier | 200,046 | 421 to 555 ms | 544 to 569 ms |
| `'A '.repeat(40000)`, name AAAAAAAA | 80,000 | 833 to 865 ms | 928 to 1,033 ms |
| `'Ref 7' + ':\r\n'.repeat(80000) + '7:7:7:7 end'`, claim `7'7'7'7'7` | 240,016 | 630 to 660 ms | 947 to 1,071 ms |
| plain filler + `'Dear ZEPH Y RA end'`, name `ZEPH:YRA JANE` | 220,007 | 791 ms | 1,258 ms |

Fuzzed short letters (entry and check together, summed): +3%, +16% and +18% on the three seeds. The noise
between two runs of the same row is as large as the difference on the plain rows; the rows with a wider match
show +45% to +60% consistently.

## Checked and found sound

1. `baseReading` against a97d73e4. I read every changed code line of `git diff a97d73e4 287c68d3` on redact.ts.
   What MOD-25 changed inside the wider reading is exactly the six places the flag guards: GAP.apart, the
   stored-separator gap of numberForm, the pieces (addPieces), nameWords' wider split, the every-place scan
   (lastIndex) and initialsOf. widerMatchesRead differs only by the `alikeOfWider` note. The first reading
   (matchesIn, holdsAsFirstRead, chainLeft, masked, merge) has no changed line; numberForm's `asStored` is passed
   only as `wider`, so the first reading never builds a stored-separator form. `asLineFeeds` went from `/\r+\n/g`
   to `/(?<!\r)\r+\n/g`: the same replacements.
2. Module state. GAP.apart is read only in nameForm when a form is built; no regex built at module load reads it.
   Forms are stored only in `formsOfCheck`, whose key now carries the flag, and `asTheBaseRead` gives the base's
   reading stores of its own anyway (views, dates, forms, alikeOfWider, storeScope, widerReading, the counter),
   restored in a `finally`, where the flag is cleared too, so a throw leaves nothing set. `subjectsAlike` holds a
   fact of the identifiers alone, the same under both readings, and counts no work. `ownFold` is restored by
   onFold's own `finally`. The fold caches (`foldedCodePoints`, `plainlyFolded`, `digitValues`) do not depend on
   the reading.
3. Returns before the base is asked. The glued-number return carries the mark; holdsIdentifier and
   holdsAsFirstRead both refuse any text with a private mark at their first line. The entry's gate returns the
   first reading's text only where the first reading's check holds in one of three writings, and holdsIdentifier
   asks that same check of that same text in the same three writings. The catch of redactLetterForScreen returns
   the mark alone with a count past the budget; the catch of redactionSpans returns the mark.
4. The shortcut (`text !== sent`). Where the base's text equals `sent`, a null answer makes both entries return
   exactly that text (`first.text`, or `written(normal, both)`; in redactionSpans the spans that write it), and
   holdsIdentifier asks the first reading's check of it in the writings the base read and one more. Where the
   skipped check would have held, the wider check that now runs after it can only refuse more.
5. `byFirstRead: true`. Returned in two places, both for a text the first reading's check has just refused in
   one of two writings, with the spans that write that text; holdsAsFirstRead does not read the flag or the
   wider forms, and it throws past the budget rather than answer true, so the answer is of the content and
   holdsIdentifier repeats it. A letter's own private mark in the first reading's text is refused on every path.
6. `firstRefused`. `false` is passed only after the entry's gate, which reads the base's two writings and one
   more, answered no.
7. Verdicts by fuzz: see below. Units on sent letters: checkWorkOf equal between pre-fix head and fix on every
   sent letter of the 10,500; total units (entry plus check) equal on all 313 sampled; equal on the long rows
   above (for example 346,735,808 on `'A '.repeat(40000)`, 343,662,858 on the 240,016-character run of marks,
   281,708,848 on 200,046 characters of filler). `'A '.repeat(49000)` is refused by the count on both.

## Not checked

- The two budget rows measured at 403,548,210 and 414,023,090 units: I did not find which letters they are and did
  not re-measure them. The rows I measured are named above.
- redactionSpans by fuzz: only redactLetterForScreen and holdsIdentifier were run. redactionSpans was read; its
  call of `refusedAsTheBaseRead` passes the same arguments, and its first reading runs with no counter as before.
- Letters longer than about 300,000 characters, and calls with many claims or many names.
- An error that is no budget error thrown inside the base's reading (it would leave the entry by throwing; the
  flag and the stores are restored).
- The tests of the commit: not run, not read.

## What was fuzzed

Script: /tmp/claude-0/-home-user-PhysicalTherapy/179e1ec1-f2e5-5e51-954e-b58916f3dd83/scratchpad/review5/fz.mts
(base, pre-fix head and fix on the same letter). Seeds 9101 (1,500 letters), 9102 (4,500), 9103 (4,500): 10,500
letters. Shapes, none of them fuzz.mts's: 15 names with marks inside (`ZEPH:YRA JANE`, `JANE+ZEPHYRA`,
`A+ZEPHYRA`, `ZEPHYRA(JANE)`, `ZE'PHYRA`, `J. ZEPHYRA`, a Greek-letter name), 21 stored numbers with separators
(`7,7,7,7,7`, `7'7'7'7'7`, `7 7,7-7.7`, `1111,7777.7`, `12345 6789`, `7(7)777`, `7+7+7+7+7`); each value written
whole, with one mark between all characters, with runs of zero to four mixed marks between characters, or as a
cut piece; a second writing of the same value right after the first in 30% of places; look-alike characters
(Cyrillic and Greek letters, full-width and mathematical digits, l and I for 1, O for 0) and lower case; marks
among CR LF, LF CR, CR CR LF, a lone CR, U+0085, U+2028, U+00A0, U+200B, U+00AD, U+0004, U+02BC, U+00B7, the
private marks U+0001 to U+0003, square brackets and literal placeholders; labels (Member ID, Claim No., SSN, DOB
with a date, Tel, a glued letter or digit).

| seed | letters | base refuses | pre-fix refuses | fix refuses | base refuses, pre-fix sends | base refuses, fix sends | fix refuses, base and pre-fix send |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 9101 | 1,500 | 348 | 575 | 575 | 0 | 0 | 0 |
| 9102 | 4,500 | 1,083 | 1,676 | 1,677 | 1 | 0 | 0 |
| 9103 | 4,500 | 1,100 | 1,686 | 1,687 | 1 | 0 | 0 |

No call threw. The text of a sent letter never differed between the pre-fix head and the fix.

VERDICT: 0 blocker(s), 3 lesser
