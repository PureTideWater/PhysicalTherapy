# Review of the fix round 1 delta: the letter check's work budget

Scope: only `git diff 70b1eb0f c5fc89a8 -- packages/redact/src/redact.ts packages/model-gateway/src/functions/denial-letter.test.ts`
(given first as the uncommitted working tree; committed as c5fc89a8 during the review, code unchanged; HEAD 7a5a26bb
differs by one test-message line). Base for the invariant: `/home/user/tree-base` (58fb29e5).
Node 24.22.0, tsx, 4 cores. Synthetic data only (JANE Q ZEPHYRA, JANE Q VANTREE, ZZ..., SYN...).
Scripts and raw output: `/home/user/review-fix1/` (`out/`). Nothing under the repo or tree-base was modified.

Verdict: on PHI the delta is sound (no refusal became a send, no sent text changed, 0 differences in 9,000 checks).
On TIME it is not done: two BLOCKING findings. The new charge is `identifiers x letter length`; the reading's cost
also has a part that does not depend on the letter's length at all (F-1) and a part that goes by forms, not
identifiers (F-2).

A note on the time figures. "ref" is cpu x 144 / calibration, the calibration taken in the same process (the least of
the one before and the one after). In processes that have read thousands of identifier patterns the in-process
calibration itself reads 280 to 370 ms where a fresh process on the same idle machine reads 145 to 185 ms (F-6), so
"ref" for those rows is about half of what a fresh calibration would give. Both the raw cpu and the scaled figure are
shown; the findings hold on either.

## Findings

### F-1 BLOCKING (time; on a precondition the letter's author does not control): the cost per identifier that does not depend on the letter's length is uncharged

The new charge is `2 x identifiers x normal.length`: for a short letter it is nothing. But each identifier's pattern
is built and compiled whatever the letter's length (the profile of a 19-character letter: `ownMatchesIn` 45 %,
its closures 27 %, `patternOf` 15 % of the processor time). A letter of 19 characters, "The claim was paid.", read and
SENT:

Least of 3 after a warm-up (`fam.mts "tiny ..."`, `out/rest.log`):

```
tiny claims5000x40 across nearmiss39   19 ch   42.8 Mu  cpu  40093 ms  ref 17400 ms  sent  [cal 367/332]
tiny allmax across yensemi             19 ch   47.4 Mu  cpu  43493 ms  ref 19054 ms  sent  [cal 363/329]
tiny claims5000 across prose (9 chars) 19 ch   10.2 Mu  cpu   2221 ms  ref   957 ms  sent  [cal 372/334]
tiny names50x40 prose                  19 ch    5.8 Mu  cpu   1093 ms  ref   472 ms  sent  [cal 367/334]
tiny members1000 prose                 19 ch    3.0 Mu  cpu    276 ms  ref   271 ms  sent  [cal 174/147]
```

So 5,000 claim numbers of 40 characters make a 19-character letter cost 40 s per check, every check, at a tenth of
the budget (42.8 M units of 420 M).

Call by call in a fresh process (`cold.mts`, `out/cold.txt`; the first call is what a fresh worker pays):

```
 300 x 40 chars: 3840 ms |  618 |  226 |  239      (2.6 M units, sent)   [cal 167/148]
1000 x  9 chars: 4058 ms |  491 |  231 |  225      (2.1 M units, sent)   [cal 172/143]
1250 x 40 chars: 17435 ms | 3754 | 1056 | 1113     (10.7 M units, sent)  [cal 168/146]
2500 x 20 chars: 17924 ms | 3281 | 1282 | 1303     (10.9 M units, sent)  [cal 176/148]
2500 x 40 chars: 33515 ms | 7057 | 2141 | 2131     (21.4 M units, sent)  [cal 176/152]
5000 x  9 chars: 22358 ms | 4788 | 2230 | 2166     (10.2 M units, sent)  [cal 184/151]
5000 x 40 chars: 64487 ms first call (calcheck.mts), then about 40 s every call (above)
```

The first check in a process costs 320 to 500 microseconds per identifier character (1,000 claim numbers of nine
characters, the new test's own shape: 4.1 s for a 19-character letter); warm it falls to 20 to 50, until the set is
large enough (between 2,500 and 5,000 patterns of 40 characters) that it never warms. (These six cold runs overlapped
one other measuring process on the 4 cores; processor time, not wall time.)

Sized to the budget the same shows (`out/time.txt`, `out/rest.log`):

```
claims5000x40 prose              8992 ch  414.3 Mu  cpu 5066 ms  ref 2683 ms  sent  [cal 304/272]
claims5000x40 prose (second run) 8710 ch  414.8 Mu  cpu 7454 ms  ref 3245 ms  sent  <<< OVER 3 s  [cal 359/331]
claims5000x40 nearmiss39         9028 ch  414.3 Mu  cpu 4548 ms  ref 2373 ms  sent  [cal 291/276]
claims5000x40 across nearmiss39  9028 ch  414.3 Mu  cpu 4598 ms  ref 2586 ms  sent  [cal 280/256]
claims5000 one prose (9 chars)   7030 ch  419.6 Mu  cpu 2212 ms  ref 1122 ms  sent  [cal 316/284]
claims5000 across prose          7030 ch  419.6 Mu  cpu 2557 ms  ref 1288 ms  sent  [cal 316/286]
claims5000 one tok9              5658 ch  413.5 Mu  cpu 2156 ms  ref 1063 ms  sent  [cal 316/292]
claims5000 one nearmiss          9858 ch  418.5 Mu  cpu 2445 ms  ref 1190 ms  sent  [cal 301/296]
```

(The second claims5000x40 prose run is with the F-2 trial charge, which leaves claim numbers' charge as it is.)

Smallest fix: a second charge at the same two sites that does not multiply by the letter's length, per character of
identifier, for example `work(WORK.formPattern * charactersOf(subject))` with `charactersOf` the sum of the lengths
of the names, member IDs and claim numbers. Its weight is a ruling this review cannot make: if the first check in a
process must hold 3 s, the measurements above put it near 50,000 units per identifier character per check (about
7,500 identifier characters read, so the new test's "a fifth of the letter with 1,000 claim numbers is read" would
turn into a refusal); if only a warm process counts, a weight cannot be linear, since 2,500 x 40 is 2.1 s and
5,000 x 40 is 40 s, and a ceiling on the count of patterns (refuse above it) is the honest form. The other way,
larger than a charge and needing its own differential, is not to compile a pattern for an identifier whose letters
and digits the letter does not hold (the prefilter `nameOrNumberMatches` already documents).

### F-2 BLOCKING (time; on names of many parts): `identifiersOf` counts names, the reading goes by forms

`formsOf` makes one form for the whole name, one for each word and one for each part of a word, and each form is
read for over the whole letter; the charge counts the name once. 50 names, each of 12 words of three hyphenated
parts (49 forms a name), letters sized to just under the budget and SENT (`out/time.txt`):

```
names50x12 prose            231076 ch  419.5 Mu  cpu 3300 ms  ref 3833 ms   9.14 ns/u  sent  <<< OVER 3 s  [cal 144/124]
names50x12 prefix2          202752 ch  417.9 Mu  cpu 4478 ms  ref 5040 ms  12.06 ns/u  sent  <<< OVER 3 s  [cal 147/128]
names50x12 yensemi           77796 ch  408.7 Mu  cpu 5531 ms  ref 5865 ms  14.35 ns/u  sent  <<< OVER 3 s  [cal 148/136]
names50x40 prose            225575 ch  413.6 Mu  cpu 8136 ms  ref 9450 ms  22.85 ns/u  sent  <<< OVER 3 s  [cal 148/124]
names50x12 parts(matches)   161134 ch  415.9 Mu  cpu 1859 ms  ref 2163 ms              sent
names50x12 wordsoutoforder  127473 ch  414.5 Mu  cpu 1439 ms  ref 1425 ms              sent
```

Names of plain words are inside the 3 s: 50 names of 2, 3 and 4 words (3, 4, 5 forms each) read in 1,265, 1,425 and
1,534 ms at reference. The rows fit about 3.1 + 0.12 x (forms per name) ns per unit, so the 3 s is passed from about
33 forms a name at 50 names (some 1,650 name forms in all).

Smallest fix, tried: charge by forms. In both functions replace `identifiersOf(subject)` by `formsOf(subject).length`
(one form per member ID and claim number, so those charges stay as they are). With that in a scratch copy
(`TRIAL=1`, `lib2.mts`, `fam2.mts`, `out/rest.log`):

```
names50x40 prose      6252 ch  418.6 Mu  cpu 1627 ms  ref 1549 ms  sent
names50x12 prefix2   19367 ch  413.7 Mu  cpu  832 ms  ref  820 ms  sent
names50x12 yensemi    9458 ch  414.8 Mu  cpu 1082 ms  ref 1058 ms  sent
members1000 digitLF  26605 ch  412.6 Mu  cpu 1930 ms  ref 1879 ms  sent   (1806 ms without the trial)
yensemi, 1 claim     92340 ch  413.7 Mu  cpu 2053 ms  ref 2056 ms  sent   (2040 ms without)
```

The trial charge was not put through the PHI differential; it is a charge only, at the same place, so the argument
of the section below carries, but it is unrun.

### F-3 RECORD (time, fails closed): a list that is not an array makes the charge NaN and switches the budget off for the redaction

`edge.mts`, `out/edge.txt`: with `memberIds` a Set (iterable, no `length`), `identifiersOf` is NaN, the counter is NaN,
`> CHECK_WORK_BUDGET` is false for the rest of the redaction, which then runs with no budget; `checkWorkOf` is NaN and
`holdsIdentifier` refuses it (`!(NaN >= 0)`):

```
memberIds a Set   head {"replaced":5,"spent":null(NaN),"held":true} | base {"replaced":5,"held":false}
```

The answer moves only from sent to refused; the time is the base's. `names` or `claimNumbers` as a Set throw the same
TypeError in head and base before any reading; a string for `claimNumbers` counts its characters and answers as the
base. Outside the types (`readonly string[]`), hence RECORD. Smallest fix: in `work`, throw unless the count is a
number within the budget: `if (!(checkWorkSpent <= CHECK_WORK_BUDGET)) throw new PastCheckWorkBudget();`.

### F-4 RECORD (tests): the second new test does not pin change (2)

`tests.mts`, `out/tests.txt`: the two tests' assertions (not their timings) against the head, the code before the
delta (`pre`), and the head less each one change:

```
head  TEST1 pass (ratio 7.39)   TEST2 pass (ligatures/letters 38.25)
pre   TEST1 FAIL (ratio 2.98)   TEST2 FAIL (null -> false, true -> false, 0n throws TypeError)
no1   TEST1 FAIL (ratio 2.98)   TEST2 pass
no2   TEST1 pass                TEST2 pass (ligatures/letters 28.44)   <- change (2) reverted, nothing fails
no3   TEST1 pass                TEST2 FAIL (null -> false, true -> false, 0n throws)
```

`expect(checkWorkOf(ligatures)).toBeGreaterThan(10 * checkWorkOf(letters))` holds at 28.4 without the NFKC charge.
Smallest fix: assert the equality the charge makes true: the letter costs what the same letter written in NFKC
costs. Run (`nfkc.mts`, `out/nfkc.txt`): on the head the two counts are equal for U+FDFA, "U+33FE;", U+FF21 and
"U+00BD " (23,190,170 = 23,190,170 for 1,000 U+FDFA); with change (2) reverted they differ by exactly
350 x (NFKC length - written length) (5,950,000 = 350 x 17,000).

### F-5 RECORD (tests): the first new test pins change (1) by one assertion only, and its title claims more than it shows

Same run: before the delta the letter of 100,000 characters with 1,000 claim numbers was already refused and the
fifth of it already sent; only `spent > 5 x` (7.39 against 2.98) fails without change (1). That is a pin, with
margin on both sides. But "1,000 claim numbers are no way past the 3 s" is not what F-1 measures: a 19-character
letter with those 1,000 claim numbers costs 4.1 s the first time a process reads for them. Also of the seven
counts in the second test, `'0'`, `'5'`, `{}` and `[]` were refused before the delta too; `null`, `true` and `0n`
are the ones that pin change (3).

### F-6 RECORD (measurement): the calibration reads double in a process that has read thousands of identifier patterns

`calcheck.mts`: fresh 184/182 ms, after one check with 5,000 claim numbers 151/152 ms; but in the family processes
with 5,000 claim numbers or 50 names of 40 words the calibration before and after the timed runs reads 256 to 372 ms
(rows above), against 143 to 185 ms in every other process on the same machine minutes apart. Whatever scales a
measured time by that calibration (this harness, and `timed` in the tests if it calibrates in the test's process)
allows such a check about twice the time. Not from this delta. Smallest fix: take the calibration before the first
identifier is read, or in a process of its own.

### F-7 RECORD (no PHI): a missing list throws a different TypeError than the base

`claimNumbers`, `names` or `memberIds` undefined: head "Cannot read properties of undefined (reading 'length')",
base "numbers is not iterable" / "subject.names is not iterable". Both throw, neither message holds letter text or
an identifier, and after it the next letter reads as the base (the entries' `finally`). Nothing to fix.

## What was run and found sound

- PHI differential, head against base, `diff.mts` seeds 11, 12, 13: 3,000 letters x (1, 30 in one claim, 300 across
  claims) = 9,000 checks, 0 differences. The head sent 7,292 (2,442 / 2,441 / 2,409); every one sent by the base with
  identical text, replaced, candidates and claims map. Both refused 1,673. Head refused where the base sent: 35
  (3 / 3 / 29), 15 of them past the budget in redaction (all at 300 claims); in every under-budget redaction the
  redacted text equalled the base's. No throw on either side. Refused letters were interleaved, so each was followed
  by letters read correctly.
- Uncounted entries, same run: 11,808 comparisons of `redactLetter`, `redactionSpans`, `holdsNameOrNumber` and
  `nameOrNumberMatches` against the base, all equal.
- `work` is a no-op with no counter (`edge.mts` 3): 3,000 claim numbers and an 83,300-character letter, where one
  `ownMatchesIn` call would charge 474,916,400 (over the budget): the four uncounted entries do not throw and equal
  the base; `redactLetterForScreen` on the same input is refused (spent 420,000,001, text the unread mark, held true).
- Empty subjects (`edge.mts` 1): no names, member IDs or claims; claims holding empty lists; both: head equals base
  (text, replaced, candidates, held false), counts finite (84,510 / 94,154 / 91,290).
- The throw at the top of the two functions is inside the frames that restore state (`edge.mts` 4): six checks
  entered at 400,000,000 to 419,999,999 spent (the throw lands in `holdsIdentifier`, on either fold) and 18 letters
  sized across the budget (8 refused in redaction): after each, the next letter (with look-alike forms) and the next
  uncounted call equal the base, 24 of 24. By reading: `redactLetterForScreen` and `holdsIdentifier` restore the
  counter, `viewsOfCheck` and `datesOfCheck` in `finally`; `onFold` restores the fold in `finally`; the new line is
  the first statement of each function, before any cache is written.
- The guard (`edge.mts` 2): undefined (default 0), 0, -0, 1 answer as the base (false); 420,000,000, 420,000,001,
  -1, NaN, Infinity, null, '0', '5', 0n, {}, [], true, a boxed Number and an object with valueOf are refused, none
  throws. Change (3) only adds refusals.
- Change (2) only adds to the counter, and only where NFKC lengthens the text (`nfkc.mts`: no change for U+FF21).
- Time, sized to the budget, inside 3 s (`out/time.txt`): 1,000 member IDs with separators: prose 856 ms, digit
  lines 1,806 ms, near misses 1,788 and 1,289 ms; 50 plain names of 2 to 4 words 1,265 to 1,534 ms; the earlier
  dearest letter (yen-semicolon, 1 claim) 2,040 ms, unchanged; 5,000 claim numbers of nine characters 1,063 to
  1,288 ms scaled, 2,156 to 2,557 ms raw (see F-6: inside 3 s either way).
- The delta as committed is the delta given: `git diff c5fc89a8 HEAD -- packages/redact/src` is empty.

## Unrun

- "allmax" (50 names x 12 words, 1,000 member IDs, 5,000 claim numbers of 40 characters) sized to the budget: each
  check is over 43 s, the sizing did not finish in 240 s and was stopped. Its 19-character row is in F-1.
- The two tests themselves under vitest with a change reverted: their assertions were replayed in `tests.mts`
  instead; their time assertions (`timed`, `allowedMs`) were not.
- The F-2 trial charge through the PHI differential; any trial of an F-1 charge.
- The time families ran before a container restart (`out/time.txt`, quiet machine) and after it (`out/rest.log`,
  `out/cold.txt`); the six cold runs and the profile overlapped one other measuring process.
