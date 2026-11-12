# Review of the letter check's work budget, fix round 2 (delta 7a5a26bb..0289304f)

Scope: `git diff 7a5a26bb 0289304f -- packages/redact/src/redact.ts packages/model-gateway/src/functions/denial-letter.test.ts`
and nothing else. Head 0289304f (the working tree, clean), base 58fb29e5 (`/home/user/tree-base`).
Scripts: `/home/user/review-fix2/` (b.mts, r.mts, e.mts, edge2.mts, diff2.mts, chain.sh, chain2.sh; output in `out/`),
reusing `/home/user/review-fix1/` (fam.mts, diff.mts) and the harness `/home/user/review-time/lib.mts`.
Synthetic data only. Node 24.22.0, one process at a time on the shared machine; times are processor time
(`process.cpuUsage`), the least of 3 calls after a warm-up call in the same process, scaled by 144 / the calibration
read beside the timed calls ("ref"). The calibration read 140 to 155 beside the timed calls, so ref is within 7 % of
the raw processor time in every row of G-1.

Verdict: **one BLOCKING finding (G-1, time, warm process)**. No PHI finding: nothing the base refuses is sent and
nothing it redacts is shown, in anything run.

## Findings

### G-1 BLOCKING (time, warm process): many short identifiers under the identifier ceiling are read and sent in 3 to 18 s

The new charge is per character of identifier (3,500 units). The cost it stands for is per identifier, and in the
check it grows with the square of their number, so a call of many short identifiers stays under the budget and is read.

Reproduction (`cd /home/user/PhysicalTherapy && BUDGET=420000000 PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx
/home/user/review-fix2/b.mts <kind:count:length> tiny`; letter `The claim was paid.`, 19 characters; one name, one
member ID; `c` = one claim holding all the numbers, `a` = one claim per number, `m` = member IDs, `d` = digits only).
Output (`out/chain.log`, `out/time.txt`), all READ and SENT, the whole check's count under 420,000,000:

| identifiers | characters | units | warm cpu | ref | of which redaction | first call of the process |
|---|---|---|---|---|---|---|
| 18,500 claim numbers of 3 (`c:18500:3`) | 55,523 | 403.2 M | 19,291 ms | **18,441 ms** | 696 ms | 59.8 s |
| 14,000 of 4 (`c:14000:4`) | 56,023 | 406.1 M | 11,104 ms | **11,119 ms** | 644 ms | 46.2 s |
| 14,000 of 4, one claim each (`a:14000:4`) | 56,023 | 406.1 M | 11,401 ms | **11,766 ms** | 667 ms | 50.9 s |
| 9,400 of 6 digits (`d:9400:6`) | 56,423 | 408.3 M | 6,924 ms | **6,859 ms** | 1,024 ms | 65.6 s |
| 6,300 of 9 (`c:6300:9`) | 56,723 | 410.0 M | 3,153 ms | 3,154 ms | 552 ms | 26.6 s |
| 6,300 of 9, one claim each (`a:6300:9`) | 56,723 | 410.0 M | 3,261 ms | 3,177 ms | 536 ms | 27.1 s |
| 6,300 member IDs of 9 (`m:6300:9`) | 56,723 | 410.0 M | 3,076 ms | 3,075 ms | 527 ms | 27.1 s |
| 7,000 of 4 with a prose letter of 3,611 characters sized to the budget (`c:7000:4 prose`) | 28,023 | 409.4 M | 3,166 ms | 3,145 ms | 399 ms | 22.3 s |

The three rows of 9 characters and the last row are over 3 s by 2 to 6 % with the calibration read beside them
(144 to 148) and under it (2.5 to 2.7 s) with the calibration read at the start of the same process (168 to 177):
take them as at the line. The rows of 3, 4 and 6 characters are over by a factor of 2 to 6 on either reading.

Where the time is: the check, not the redaction (the redaction is 0.5 to 1.0 s of each row). The time goes with the
square of the count at an equal charge: 14,000 to 18,500 is x1.32 in count and x1.66 in time (1.32 squared is 1.75);
6,300 identical numbers (`u:6300:9`, one form after formsOf's own de-duplication) cost 910 ms where 6,300 different
ones cost 3,154 ms. By reading (not profiled, no trial run): `numberForm` and `nameWords` call `viewOf(identifier,
'join')`, and inside `holdsIdentifier` `viewOf` keeps every view of the check in the list `viewsOfCheck` and looks
each one up with `viewsOfCheck.find(...)`, a walk of the whole list; every `formsOf` call of the check (there are
about ten call sites, and two folds) therefore walks a list of N entries N times. No `work()` counts that walk.

Preconditions: `prepare` accepts these calls (it asks only that each claim has one number of two characters or more);
the letter's author controls none of it, the practice's records do. 14,000 claim numbers for one patient is far from a
real call; so were the 5,000 of fix round 1's F-1, and the bound is stated without a limit on the count.

Smallest fix (two parts, both needed; neither changes an answer except sent to refused):
1. Take the square away: do not look the identifiers' views up in a list. Either `numberForm`/`nameWords` call
   `buildView` directly (an identifier's view is never the letter's), or `viewsOfCheck` becomes a `Map` keyed by
   `key` then `normal`. The first changes the count where a view was a cache hit (more work charged, so sent to
   refused only); the second changes no count.
2. Charge by identifier as well as by character, because a pattern costs about the same to build at 3 characters as at
   9: `workOfIdentifiers = WORK.identifier * count + WORK.identifierCharacter * characters`, with the weight per
   identifier taken from a measurement after (1) at 3, 4, 6 and 9 characters. As a check on the size: after (1) the
   cost should be near linear in the count, and 6,300 x 9 at 3.1 s is already at the line with the square in it, so the
   ceiling on the count that the weight implies should come out at a few thousand, not 18,500. An empty string must
   cost the weight too (G-3).
Then a test at the new ceiling with identifiers of 3 or 4 characters, timed warm, and the refusal just past it.

### G-2 RECORD (time, refusal): between 60,000 and 120,000 identifier characters the call is refused, but not "at once"

Each entry alone refuses at once only past 120,000 characters (3,500 x 120,000 = the budget). The call as `prepare`
makes it charges the identifiers twice, so it is refused from about 60,000, but between the two the redaction reads to
its end (or nearly) first. `r.mts` (`out/refuse.txt`), warm, tiny letter:

| identifiers | redaction | check with the redaction's count | check alone with spent 0 |
|---|---|---|---|
| 6,700 x 9 (60,300) | read, 570 ms (first call 15.0 s) | refused at its entry | READ, held false, 3,108 ms |
| 15,100 x 4 (60,400) | read, 699 ms (first call 23.5 s) | refused at its entry | READ, held false, 14,941 ms |
| 13,300 x 9 (119,700) | refused after 54 ms (first call 2.0 s) | refused | refused after 105 ms |
| 29,900 x 4 (119,600) | refused after 86 ms (first call 4.7 s) | refused | refused after 500 ms |
| 29,900 x 4, one claim each | refused after 105 ms (first call 4.6 s) | refused | refused after 551 ms |

So a refused call costs up to about 0.7 s warm, not under 100 ms, in that band; and `holdsIdentifier(text, ..., 0)`
called alone (the test's own shape, not `prepare`'s) reads 15,100 x 4 for 14.9 s and answers false. Same cause and same
fix as G-1; after it, state the claim as "past the ceiling of one entry" or charge so the first entry refuses what the
pair refuses (the redaction could charge both entries' identifier work up front: `2 * workOfIdentifiers`, and the
check none, which changes no total for the pair).

### G-3 RECORD (time): an empty identifier costs nothing and is still walked

`workOfIdentifiers` charges by length, so `''` is free; `prepare` lets empty claim numbers through beside one real one.
`b.mts e:300000:0 tiny`: 300,000 empty claim numbers and one real one, 19-character letter: 0.3 M units, read and sent,
553 ms warm (ref 542 ms). Linear in the count (unrun past 300,000): about 1,700,000 empty strings would be 3 s at
almost no charge. Fix: G-1's weight per identifier.

### G-4 RECORD (no PHI; a crash where the base sent): `workOfIdentifiers` throws on two list shapes the base read

`edge2.mts` (`out/edge2.txt`), 34 odd inputs, head against base. The head THROWS (a TypeError out of both entries, so a
crash of `prepare`, not a send) where the base SENT:
- `claimNumbers` a string (`'SYN556000'`): head `claim.claimNumbers.reduce is not a function`; base read it letter by
  letter and sent (4 replaced);
- `memberIds` a Set: head `patient.memberIds.reduce is not a function`; base read it and sent (5 replaced).
Both are outside the declared type (`readonly string[]`). Every other list shape tried throws in both (a claim without
`claimNumbers`, `null`, a Set or array-like `claimNumbers`, `names` undefined, a string or a Set, `memberIds`
undefined, `claims` undefined or a Set, a hole or `null` in a list), with a different TypeError message than the base
(as fix round 1's F-7), none naming a value.
The other way round, the head REFUSES (barrier, count 420,000,001, no throw) where the base THREW: a number in
`claimNumbers`, `names` or `memberIds` (its `.length` is undefined, the charge NaN, change (3) refuses), and a letter
text that is a number. Fix, if wanted: `Array.isArray` on the three lists in `workOfIdentifiers`, NaN otherwise, so
every shape that is no list of strings is refused the same way.

### G-5 RECORD (time only, not reachable from stored data): an identifier that reports a negative length takes the budget off

`workOfIdentifiers` trusts `identifier.length`. An object with `normalize()` and `length: -1e9` in `claimNumbers`
(`edge2.mts`, "identifier object"): the redaction's count is -3,499,999,823,660 and `holdsIdentifier` refuses it
(`spent >= 0`), but `holdsIdentifier(clean, ..., 0)` alone runs with the count negative, that is with no budget, and
answers false as the base does. With a length chosen to land the redaction's count inside 0..budget both entries would
run unbudgeted (reasoned, not landed in a run: the three lengths tried gave negative counts and a refusal). The answer
is the base's in every case, so no PHI; it needs an object with methods, which no JSON or database row carries. Fix:
`typeof identifier === 'string' ? identifier.length : NaN` in `lengthOf`.

### G-6 RECORD (tests): change (3) and the short-identifier ceiling are not pinned

Run on both commits (`e.mts`, the test's own expressions on the head and on 7a5a26bb's reader):
- forms of a name: head 22,571,280 > 18,306,700 + 1,600,000 true; 7a5a26bb 18,041,780 > 18,034,700 + 1,600,000
  **false**. Pins (1).
- 300 x 15, tiny letter: head spent 16,555,404 > 13,500,000 true; 7a5a26bb 724,752 **false**. Pins (2). (`few.text`
  and the final `toBe(false)` pass on both, as they should.)
- 5,000 x 40 refused, count `CHECK_WORK_BUDGET + 1`, under 100 ms, and `holdsIdentifier(tiny, ..., 0)` true: on
  7a5a26bb the redaction reads it (run: text kept, count 30,397,952, 40.3 s), so the barrier, the count and the
  100 ms fail there; `holdsIdentifier(tiny, ..., 0)` true was not run there (by fix round 1's F-1 it reads and
  answers false).
- the NFKC equality (`toBe`): 23,518,170 = 23,518,170 on the head and 23,190,170 = 23,190,170 on 7a5a26bb: passes on
  both. It answers fix round 1's F-4 (it pins round 1's change against the commit before it, unrun here), not this delta.
- nothing fails if `!(checkWorkSpent <= CHECK_WORK_BUDGET)` is turned back to `>`: no test gives a list entry with no
  length. One line would: `expect(checkWorkOf(redactLetterForScreen(tiny, who, [{ ...claimOf, claimNumbers: [556000 as
  unknown as string] }]))).toBe(CHECK_WORK_BUDGET + 1)` (measured so on the head, G-4).
- the test's only timed identifier sets are 40 and 15 characters long; G-1's are 3 to 9. The 100 ms assertion is at
  200,000 characters, past both ceilings; nothing times a call between them (G-2).

### G-7 RECORD (not in the delta; the base does the same by reading): one name of 14,000 words throws a SyntaxError

`b.mts w:1:14000 tiny`: `SyntaxError: Invalid regular expression` out of `ownMatchesIn` (the whole-name pattern is too
large for the engine), so `prepare` crashes. `formsOf` is byte-identical to the base's (same md5 of the function), so
the base throws the same; not run on the base. The message printed by Node starts with the pattern, which is built
from the name: if that error is ever logged, a name is in it. Fix outside this delta: refuse a name past a number of
words before a pattern is built.

## Answers to the questions

a. PHI. The refactor in (1) is equivalent under the budget. `formsOf` reads `subject`, the module's `ownFold` (through
`viewOf`'s default) and the check's view cache; `ownFold` is set only by the fold wrapper (lines 506 to 514), not by
`datesOf`, `birthFormsIn` or `viewOf`, and the cache is a pure memo whose order changes no result, so hoisting `formsOf`
above `datesOf` moves only where a throw past the budget happens. `confusableOf(formsOf(subject))` is the old
`confusableForms(subject)` term for term at both sites; `ownMatchesIn` and `confusedMatchesIn` each still call
`formsOf` once. (2) adds a non-negative charge for every list of strings and (3) only widens the throw, so neither can
turn a refusal into a send for typed input (G-5 is the untyped exception, and its answer is still the base's). New
throws: G-4. Differential: see below, 0 differences.

b. Time, warm. Yes, there is still a letter that is read and takes over 3 s: G-1. The round-1 worst cases are closed:
`allmax prose`, `allmax across yensemi`, `claims5000x40 prose` are refused at once (0 ms, count 420,000,000+);
`names50x12 wordsoutoforder` 25,067 characters, 413.8 M units, 637 ms (ref 626 ms), sent; `members1000 nearmiss`
30,337 characters, 412.0 M, 1,432 ms (ref 1,378 ms), sent; `names50x40` with the tiny letter 174.8 M, 1,340 ms raw
(ref 579 ms by a calibration that read 333 to 362 in that process, fix round 1's F-6: take the raw 1.3 s);
`names50x40 prose` was not fitted by the harness's sizing (unrun at a sized letter). Long identifiers at the ceiling
are sound: 1,420 x 40 tiny 1,162 ms (ref 1,114 ms); 700 x 40 with a 29,524-character letter 1,073 ms; 3,000 x 9 with a
5,897-character letter 1,431 ms and with a near-miss letter of 8,380 characters 1,762 ms (ref 1,670 ms); 60 names of
40 words with a near-miss letter 1,598 ms; 7,000 x 4 one claim each with a 3,611-character letter 2,891 ms.

c. Time, refusal. Past 120,000 identifier characters both entries refuse in under 22 ms, first call of the process
included (5,000 x 40 with a tiny or a 100,700-character letter 0.1 to 0.6 ms; one claim each 1.0 to 2.7 ms; 13,400 x 9
0.1 to 0.8 ms; 30,100 x 4 0.6 to 1.3 ms, one claim each 7.8 to 11.8 ms; 60,100 claims of one 2-character number 19.7 to
21.5 ms, which is `claimPlaceholders` over 60,100 claims). Between 60,000 and 120,000 it is not: G-2.

d. Cold. Not re-measured. Nothing in the delta adds cold work to a call that is read: `formsOf` runs as many times as
before, and `workOfIdentifiers` is two passes of additions. The delta bounds it for the first time: a first call past
120,000 identifier characters is refused in under 22 ms where 7a5a26bb read it (40 s). What a first call under the
ceiling can still cost, seen in passing in the first (unwarmed) call of each process of G-1 and G-2, on the loaded
machine and unscaled: 26.6 s at 6,300 x 9, 46.2 s at 14,000 x 4, 59.8 s at 18,500 x 3, 65.6 s at 9,400 x 6 digits,
19.5 s at 1,420 x 40, and 2.0 to 4.7 s for a first call that ends refused at 13,300 x 9 and 29,900 x 4. Those are the
base's costs too (not run on the base), for the ruling already asked for.

e. Tests. Each new assertion that concerns this delta fails on 7a5a26bb (G-6, run); (3) and the short-identifier
ceiling are unpinned.

## What was run and found sound

- Differential head against base, `/home/user/review-fix1/diff.mts`, seeds 7, 8, 9, 10, 11 x 250 letters x (1, 30,
  300 claim numbers): 3,750 letter-and-set pairs, **0 differences**; the head sent 1,016 + 1,016 + 1,008 = 3,040, each
  sent by the base with identical text, replaced, candidates and claims; 9 head-refused-base-sent at 300 claim numbers
  and 1 each at 1 and 30 (the budget, the allowed direction); 4,980 comparisons of the uncounted entries equal.
  (1,000 letters in one process did not finish in 236 s on the loaded machine and was stopped; 1,250 run, not 3,000.)
- The same with three names, one of 12 words of 3 parts, and their written forms among the fragments
  (`diff2.mts 5 200`): 600 pairs, 0 differences. `diff2.mts 6 200`: 600 pairs, 0 differences. The head sent 481 and 480 of them, each as the base did.
- Odd inputs, `edge2.mts`: 34 shapes; no shape is sent by the head that the base refuses or throws on (G-4, G-5).
- Purity of the hoist: by reading (answer a); `formsOf` identical to the base's by md5.
- Round-1 families at the real budget, long-identifier ceilings, sized letters: answer b, all under 1.8 s except G-1's.
- Refusals past the single-entry ceiling: answer c, all under 22 ms.
- New assertions on 7a5a26bb: G-6. 5,000 x 40 with the tiny letter on 7a5a26bb (`e.mts slow`): read, text kept, count 30,397,952, 40,306 ms of processor time (first call, unscaled): the three assertions on it fail there.

## Unrun

- No trial of G-1's fix (neither part), no profile: the cause is from the scaling and from reading.
- G-3 past 300,000 empty strings; G-5 with a length that lands inside the budget; G-7 on the base.
- `names50x40 prose` at a sized letter; identifier sets of 2 characters under the ceiling (about 28,000; by G-1's
  square, worse than the 3-character row); names at the 60,000-character ceiling with the tiny letter (my two sets were
  62,700 and 62,983 characters and were refused by the check after a 1.3 s redaction, which is G-2's band).
- The cold measurements (d), by instruction. `prepare` itself (the gateway function) was not called; the two entries
  were called as it calls them. The repository's own test file was not run.
- `fam.mts` appended its rows to `/home/user/review-fix1/out/time.txt` and the harness rewrote its scratch copy under
  `/home/user/review-time/x/`; nothing under the repository or the base tree was modified.
