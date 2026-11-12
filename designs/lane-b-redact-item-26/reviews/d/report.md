# Review D: item 26's readings on the check's work counter (the delta since c52f262a; head a447958e)

Saved by the builder (W36) from the reviewer's hand-back: the reviewer's own write of this file was refused by its
tool, and it did not work around that. Its scripts and raw output were in `/home/user/review-d/` of W36's container
(`fuzz.mts`, `big.mts`, `hunt.mts`, `rows.mts`, `cov.test.ts` and their `.out` files). All letters synthetic.

## Verdict

No blocking finding. Nothing found where the head sends what the base or c52f262a protects. No still-sent letter past
3 s. Three non-blocking notes on time; D-TIME-2 was left unsettled by the reviewer and settled by the builder (below).

## Findings

- **D-PHI-0, not blocking: no PHI finding.**
- **D-TIME-1, not blocking.** The dearest still-sent letter: U+33FE and `;` repeated 28,985 times, then one CR LF
  (57,972 characters). Head sent, 1.90 to 2.00 s (thread processor time at the 144 ms calibration, 4 runs; one reading
  of 2.09 s at 51,750 characters in the bisection); base sent, 1.22 to 1.33 s. Cause: the second (CR LF) reading; the
  same letter with no CR LF is 1.22 to 1.28 s on the head. The head refuses the family from about 61,000 characters;
  the base still reads it at 93,006 characters in 1.8 to 2.3 s, so the head's dearest is no dearer than the base's.
  Builder's run: 1.66 to 1.93 s head, 1.04 to 1.28 s base. Now a row of `denial-letter.test.ts`; it holds its 3 s under
  coverage (three runs).
- **D-TIME-2, not blocking; the reviewer could not settle it.** Under `--coverage`, timed rows reached 2.89 to 2.99 s
  by whole-test duration (which holds the row's work twice: the timed run and the run that checks the same answer and
  count), among them base rows and item 26's. Settled by the builder with the helper's own first-run figures logged
  (a temporary line in `test-support/time-budget.ts`, removed; three runs of the file under coverage, 194 timed runs
  each): no first run reached 3 s, so no retry and no allowance; the largest were 2.04 to 2.34 s, all rows of the base
  ("counts every name, member ID and claim number", "a run of one letter a digit touches"); item 26's rows were at most
  about 1.4 s; the calibration read 119 to 159 ms against the reference 144.
- **D-TIME-3, not blocking (read-to-refused, allowed).** With nothing for the wider reading: U+33FE and `;` to 93,006
  characters (no CR LF, no name) is refused in the check by the head (1.6 to 2.2 s) and sent by the base (1.7 to 2.3 s);
  dates written with spaces to 100,000 characters and one CR LF likewise. Both recorded in ADR 0054.

## What was tried and found nothing

- Differential fuzz, 31,072 letters, both paths, four seeds, seven identifier sets (one or two names, none, empty
  strings, short parts, numbers stored with separators and brackets, a member ID that is a month's word, zero to two
  dates of birth); identifiers varied by case, written apart (space, period, U+0085, LF, CR LF, joiners, zero-width),
  letter by letter, with look-alikes; initials, labels, SSNs, phones, dates, amounts, literal placeholders and the
  three marks mixed in. Head sent and base refused: 0. Head sent a piece base replaced: 0. Base's or c52's check
  refusing the head's sent text: 0. Both head and c52 sent, different texts: 0. Allowed: head refused where base sent,
  137 per path; more replaced than the base in about 9,850 per path.
- `checkWorkOf` head < base: 0 of 31,072 (equal 505, greater 30,567). The check's own work (by bisecting the handed
  count on about 6,000 texts): head < base 0; the head's check passing a text the base's refuses: 0.
- 40 letters of 100,100 to 140,000 characters past c52's bound, against c52 with only the bound raised: every text the
  head sent is that reader's text to the character (29 on the screen's path, 22 of them refused by c52 by the bound
  alone; 40 without the screen); 11 refused by the budget.
- With no identifiers, 26 families at 20,000 characters: head's count equals the base's in 20 and exceeds it in 6.
- Odd counts (NaN, negatives, strings, infinities, null, objects, bigint, symbol and others): the head answers as the
  base for each.
- State after a throw: past the budget, and for a RangeError thrown at the k-th property read of the identifiers (k 1
  to 400, each of the three entries; 942 threw): the next letter's text, count and answer unchanged in all 1,200.
- Time hunt: 26 families, each bisected to the longest still-sent length up to 400,000 characters. After D-TIME-1's
  letter the dearest still sent: the name's letters spaced with CR LF, 157,458 characters, 1.26 to 1.40 s; look-alike
  prose with CR LF, 95,289, 1.11 to 1.16 s; 40 names, letters spaced, 98,382, 1.13 to 1.36 s.

## Limits the reviewer stated

The fuzz cannot separate the first reading's charge from the wider reading's inside one count (the claim that a first
reading is charged at least what the base charges rests on the no-identifier counts and on head >= base everywhere);
budget-edge refusals were tested through counts, not by a search at the edge; the machine's calibration drifted between
96 and 146 ms; the narrative's and the verifier's readers were not reviewed.
