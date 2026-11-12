# Review, scope TIME: the letter check's work budget (co-001/check-work-budget)

Head 33380cd5 against base 58fb29e5. Files read: the diff of `packages/redact/src/redact.ts`,
`packages/model-gateway/src/functions/denial-letter.ts` and its test, and line ranges of `redact.ts` where a question
needed them. Nothing under `/home/user/PhysicalTherapy` or `/home/user/tree-base` was changed by this review. The
branch's head moved to 70b1eb0f while the review ran (not by this review); `redact.ts` and `denial-letter.ts` in the
working tree are identical to 33380cd5 (`git diff 33380cd5 --stat` on the two files is empty), and they are what
every script read. Synthetic data only
(JANE Q ZEPHYRA, ZZ1234567, SYN555001, 900-12-3456, (202) 555-0123).

## How every number here was taken

- Scripts: `/home/user/review-time/` (`lib.mts`, `special.mts`, `fuzz.mts`, `hunt2.mts`, `claims.mts`, `prof.mts`,
  `refuse.mts`, `determinism.mts`, `calls.mts`, `nullspent.mts`); outputs in `/home/user/review-time/out/`.
  Run from the repo root: `cd /home/user/PhysicalTherapy && PATH=/opt/node24/bin:$PATH node_modules/.bin/tsx /home/user/review-time/<script> <args>`.
- Node v24.22.0 (Unicode 17.0, ICU 78.3) unless a line says Node 22 (v22.23.4, same Unicode and ICU).
- The whole check as `prepare` runs it: `redactLetterForScreen(text, patient, claims)` then
  `holdsIdentifier(r.text, patient, claims, checkWorkOf(r))`.
- The count is read from a scratch copy (`x/redact-lifted.ts`) with the budget lifted and the counter exported after
  `holdsIdentifier`; a letter is "read" when that count is at or under 420,000,000. Families are sized to
  0.96 to 1.00 of the budget ("fitted").
- Time is processor time of the process (`process.cpuUsage()`, user + system), the minimum of 3 runs after the fitting
  runs as warm-up. This includes the collector's helper threads, so it reads 5 to 25 % above the thread time the
  builder's scripts and the test use; the thread time is in every output line beside it.
- Reference time = 144 / calibration x time here. The calibration (`calibrationMs`) is taken before and after each
  family's timed runs and the lower of the two is used (the higher reference time). It read 119 to 138 ms beside the
  measurements (the first reading in a new process 148 to 182 ms, never used when the second was lower).
- At most two processes ran at once.

## Findings

### T-1. BLOCKING (on a precondition the letter's author does not control): the claims list is an uncounted driver

A letter that is read takes more than 3 s at reference when the call carries some hundreds of claim numbers. The
passes that read each of the call's forms over the text (`ownMatchesIn`, `confusedMatchesIn`, `confusedGluedIn`:
2 to 3, 2 and 3 calls per whole check, `out/calls.txt`) cost time per form per character and are charged nothing per
form: with the `U+33FE ,` letter the fitted length moves from 118,537 characters (1 claim) to 118,160 (1,000 claims),
so 1,000 claims cost about 1,400 units each while costing about 1.6 ms each.

Reproduction: `claims.mts <shape> <claims>` (one family per fresh process; `out/claims.txt`), `hunt2.mts b`
(`out/hunt2-b.txt`). Each claim has one number `SYN556000+i`; patient JANE Q ZEPHYRA.

| letter (read, sent) | claims | characters | count | cpu ms here | calibration | ms at reference |
|---|---|---|---|---|---|---|
| `Zeph∙yra Zephyra ` + `a;` repeated | 1 | 170,949 | 413.7 M | 1,704 | 124/131 | 1,976 |
| same | 200 | 171,075 | 414.5 M | 2,486 | 128/124 | 2,888 |
| same | 400 | 171,196 | 415.4 M | 3,036 | 152/126 | **3,482** |
| same | 1,000 | 171,534 | 417.8 M | 5,391 | 152/131 | **5,921** |
| `U+33FE ,` repeated | 30 | 118,527 | 413.7 M | 1,863 | 124/124 | 2,166 |
| same | 100 | 118,501 | 413.8 M | 2,015 | 123/124 | 2,350 |
| same | 200 | 118,463 | 413.8 M | 2,258 | 124/128 | 2,622 |
| same | 400 | 118,388 | 413.9 M | 2,556 | 123/132 | 2,988 |
| same | 1,000 | 118,160 | 414.3 M | 3,508 | 156/133 | **3,812** |

The cost is linear in the number of claim numbers (about 3.9 ms each on the first letter, 1.6 ms each on the second),
and the same whether they are 30 numbers of one claim or 30 claims (`out/special-2.txt`: 1,532 and 1,499 ms). The
crossing is at about 250 to 400 numbers with these shapes.

Who controls it: `patient` and `claims` are the caller's (`DenialLetterInput`, read from the practice's records), not
the letter's; `prepare` (denial-letter.ts lines 221 to 233) checks that there is at least one claim and one patient
and sets no upper bound on their number. The letter's author chooses the shape; the practice's records choose the
count. Member IDs and names are forms too but cost less: 200 member IDs 1,601 ms, 40 names 1,569 ms.

Smallest fix (a charge, not a budget): at the top of `ownMatchesIn(normal, subject)` and of
`confusedMatchesIn(tokens, subject, normal)`,
`work(WORK.formCharacter * (subject.names.length + subject.memberIds.length + subject.claims.flat().length) * normal.length)`
with `formCharacter: 1`. Run as a trial (`FIX=1 ... claims.mts`, scratch copy `x/redact-lifted-fix1.ts`; output in `out/log-chainC.txt` and `out/log-chainD.txt`):

| letter, with the trial charge | claims | characters | ms at reference |
|---|---|---|---|
| name + `a;` | 1,000 | 54,686 | 2,171 |
| `U+33FE ,` | 1,000 | 35,661 | 1,298 |
| prose | 1,000 | 46,548 | 1,274 |
| name + `a;` | 1 | 169,896 (171,196 without) | 1,924 |
| `5\n` | 1 | 56,254 (56,346 without) | 1,165 |

So it costs a one-claim letter under 1 % of the length it may have. The name + `a;` letter with 1,000 claims is
still at 5.3 ns per unit under weight 1; weight 2 is the safer fit and wants one more run of that row.

### T-2. RECORD: the dearest letter still read takes 2.3 to 2.4 s at reference, not "about 1.5 s"

`U+33FE` (one character that NFKC writes as `31日`) followed by `;`, 100,000 characters, one claim: count 405.0 M,
read and sent, 2,078 ms cpu here (thread 1,855), calibration 124/127, **2,406 ms at reference, 5.94 ns per unit**
(`hunt2.mts a`, `out/hunt2-a.txt`); 2,287 ms in a fresh process (`claims.mts yensemi 1`); 2,154 ms on thread time.
The same letter after a name, with a line break: 2,284 ms. It is under the 3 s, with 20 to 25 % to spare where
the comment on `CHECK_WORK_BUDGET` states a half ("about 2.5 ns" a unit, "about 1.5 s"); the builder's own table
(`dearest.out`, 1,141 ms) is thread time on this machine, uncalibrated, over other families.

Two things undercount it, both RUN:
1. Digits glued to a letter: the plain `31日,` reads 4.52 ns per unit (1,868 ms), `1日,` 4.54, `5x,` 3.79, where a
   digit to a line reads 2.8 to 3.1. The profile (`prof.mts yensemi 1`, `out/prof.txt`) puts 14.9 % of the time in
   `datesIn` itself and 26.6 % in anonymous callbacks, against one `dateReadings` charge per reading.
2. The entry charge is on the letter as written, the reading is of its NFKC text: `U+FDFA` repeated is 12,057
   characters in and 217,026 read (1,767 ms; with a space 1,929 ms), `U+33FE` doubles, `U+3300` quadruples.

Smallest fix: charge the entry on the NFKC text as well (`work(WORK.character * (normal.length - text.length))` after
`unbracketed`, when it is longer), and charge `datesIn` per candidate it examines. The second weight is an estimate,
not run: this family needs about 1.7 times its present count to come to 3.5 ns per unit, about 2,900 units more per
`31日;`.

### T-3. RECORD: `spent = null` switches the counter off; an unknown result counts as 0

`holdsIdentifier(text, patient, claims, null)`: `null >= 0 && null <= CHECK_WORK_BUDGET` is true, `checkWorkSpent`
becomes null, and null is the counter's own "no check is running", so `work` counts nothing. Run
(`nullspent.mts`, module as shipped; output in `out/log-chainD.txt`): a 920,000-character letter is REFUSED with spent 0 (952 to 1,441 ms cpu) and
READ with spent null in 2,233 ms cpu, uncounted. `checkWorkOf` of any object the redaction did not return (a spread
copy, a clone) is 0 (run: 294,002,220 for the result, 0 for its copy), which gives the check a second whole budget.
The production caller passes the result itself and a number, so neither is reachable today.

Smallest fix: `if (typeof spent !== 'number' || !(spent >= 0 && spent <= CHECK_WORK_BUDGET)) return true;` and
`workOfRedacted.get(redacted) ?? CHECK_WORK_BUDGET + 1`.

Other values, run (`calls.mts`, `out/calls.txt`): NaN, Infinity, -Infinity, -1, -1e-9, 2^53 - 1, B + 1, strings,
arrays and objects are refused; `0n` throws a TypeError (no reading); `true` and `false` count as 1 and 0.

### T-4. RECORD: with many forms the time, not the count, depends on what the process read before

The same letter and claims (prose, 1,000 claims, 84,783 characters, 407.8 M): 3,148 ms at reference in a process
that had fitted 14 other families (`out/log-2.txt`), 1,977 ms in a fresh one (`out/claims.txt`); with 200 claims
2,163 against 1,559. Counts identical. Each call builds a new regular expression per form. One-claim families
repeated within 5 % between processes. The charge of T-1 bounds it; a time test of a many-claims row should run after
other letters, not first.

### T-5. RECORD: "the same answer on every machine" holds per Unicode version, and this container cannot test another

The count depends on engine data at `normalize('NFKC')` and `normalize('NFD')` (entries, `fold`, `foldPlain`), on
`\p{...}` classes and `toUpperCase`/`toLowerCase`, and line 3294 sorts forms with `localeCompare`. Node 22.23.4 and
Node 24.22.0 here both carry Unicode 17.0 and ICU 78.3, so the cross-version run below compared two engines over one
data set. A runtime with other Unicode data can count a letter that holds newer characters differently. Smallest fix:
say so in the ADR beside "a count, not a clock", and pin the runtime's ICU with the Node version.

## Measured and found sound

- Question 1, the test's letter families (the builder's 50 rows of `rowsdef.mts`, each fitted to the budget, so at or
  above the cost of the row as the test sizes it when that row is read): 635 to 1,589 ms at reference; dearest
  `heldparts` 150,979 characters 1,589 ms, `keeplist` 1,567, `heldnear` 1,533, `heldinit` 1,514 (`out/special-3.txt`,
  `out/log-4.txt`).
- The three rows cut to 50,000 characters are read at up to 56,346 (`5\n`, 1,155 to 1,286 ms), 84,698 (`1\r\n`,
  1,323 ms) and 79,294 (`5-\n`, 1,214 ms).
- 41 plain, placeholder and compatibility-character families (`out/special-10.txt`, `out/special-11.txt`): 338 to 2,181 ms; dearest
  `U+33FE` + line break 2,181, `U+FDFA ` 1,929.
- Seeded hunt, 929 random token families at two sizes, the dearest 19 fitted (`out/fuzz-1.txt`, `out/fuzz-2.txt`):
  none over 2,250 ms (`Zephyra ` + `U+33FE ,`); no family's time per unit grew with length past 4.6 ns.
- Mixed drivers at the budget (`out/log-2.txt`): initials beside a name, joiner, look-alike, invisible runs, one digit
  to a line, date of birth: 791 to 1,264 ms; Arabic digit + U+2028 + U+FDFA 2,005 ms.
- Long letters still read: 200,000 to 457,680 characters, 622 to 1,751 ms (`Z Z 1 2 3 4 5 6 7_` 457,680: 1,245;
  spaces 426,576: 650; SSNs 406,450: 1,315; phones 404,306: 981). No letter over 460,000 characters was read: the
  views' charge ends reading before the entry charge's 600,000.
- Refusal at the entry, module as shipped (`out/refuse.txt`, calibration 126): 5,000,000 characters refused by
  `redactLetterForScreen` in 0.01 ms (the charge is before `unbracketed`); by `holdsIdentifier` in 0.33 to 3.86 ms
  (its `text.search(PRIVATE_MARKS)` runs first); 50,000,000 characters 0.01 and 3.80 ms.
- 1,190,000 characters (entry charge under the budget): refused in 1.85 ms and 4.91 ms, at the first view.
- Latest refusals, whole check: 840 to 1,683 ms (`a ` to 600,000 characters 1,682; `5\n` to 100,000 1,443).
- Count across runs and engines (`determinism.mts`, real budget, 30 letters of 1,500 to 240,000 characters, 4 of them
  refused part-way): fresh, after 200 other letters with refused ones between, and reversed, on Node 24 and Node 22:
  six files identical, sha256 `ee0e1c2312fd765e...`.
- State outside the call: `fold` is charged before its cache; `foldPlain` and `digitValue` hold no counted site;
  `subjectsAlike` is keyed by a subject built per call; `viewsOfCheck`, `datesOfCheck`, `ownFold` and the counter are
  restored in `finally`; the only `catch` clauses are the two entries'; no clock or random call in the file.
- Arithmetic (`calls.mts`): a 33-character clean text spends 31,790 in the redaction and 18,480 in the check; read at
  spent = B - 18,480, refused at B - 18,480 + 1. The largest charge, 350 x (2^29 - 24) + B = 188,324,810,800, is an
  exact integer; every increment is an integer, so no NaN and no lost unit.

## Table

One claim unless stated. ms at reference = 144 / calibration x cpu ms; ns per unit at reference.

| family | characters | count | cpu ms here | ms at reference | ns per unit |
|---|---|---|---|---|---|
| name + `a;`, 1,000 claims | 171,534 | 417.8 M | 5,391 | 5,921 | 14.17 |
| `U+33FE ,`, 1,000 claims | 118,160 | 414.3 M | 3,508 | 3,812 | 9.20 |
| name + `a;`, 400 claims | 171,196 | 415.4 M | 3,036 | 3,482 | 8.38 |
| `U+33FE ,`, 400 claims | 118,388 | 413.9 M | 2,556 | 2,988 | 7.22 |
| name + `a;`, 200 claims | 171,075 | 414.5 M | 2,486 | 2,888 | 6.97 |
| prose, 3,000 claims (fresh process) | 34,898 | 409.7 M | 2,492 | 2,784 | 6.80 |
| `U+33FE ;` | 100,000 | 405.0 M | 2,078 | 2,406 | 5.94 |
| `Zephyra ` + `U+33FE` + LF | 96,457 | 413.8 M | 2,018 | 2,284 | 5.52 |
| `U+33FE ,` | 118,537 | 413.7 M | 2,190 | 2,251 | 5.44 |
| `U+33FE` + LF | 100,000 | 405.0 M | 1,848 | 2,181 | 5.38 |
| held prefix + `Zephyr--U+FDFA--` | 85,921 | 414.0 M | 1,838 | 2,084 | 5.03 |
| Arabic digit + U+2028 + U+FDFA | 28,985 | 413.7 M | 1,723 | 2,005 | 4.85 |
| name + `a;` | 170,949 | 413.7 M | 1,704 | 1,976 | 4.78 |
| prose, 1,000 claims (fresh process) | 84,783 | 407.8 M | 1,810 | 1,977 | 4.85 |
| `U+FDFA ` | 22,122 | 413.7 M | 1,669 | 1,929 | 4.66 |
| plain `31日,` | 215,472 | 413.7 M | 1,629 | 1,868 | 4.52 |
| `U+0003` + `½` (refused by its mark, counted to the end) | 362,130 | 413.7 M | 1,546 | 1,751 | 4.23 |
| row heldparts | 150,979 | 413.7 M | 1,402 | 1,589 | 3.84 |
| `a ` | 210,003 | 413.7 M | 1,487 | 1,580 | 3.82 |
| row keeplist | 167,791 | 414.1 M | 1,410 | 1,567 | 3.78 |
| prose, no digits | 296,511 | 413.7 M | 1,254 | 1,463 | 3.54 |
| row arabicNEL | 72,277 | 413.8 M | 1,262 | 1,430 | 3.46 |
| row prose | 221,666 | 413.7 M | 1,231 | 1,375 | 3.32 |
| row digitCRLF | 84,698 | 413.8 M | 1,153 | 1,323 | 3.20 |
| row ssns | 406,450 | 413.9 M | 1,141 | 1,315 | 3.18 |
| row digitLF | 56,346 | 413.8 M | 1,108 | 1,286 | 3.11 |
| `Z Z 1 2 3 4 5 6 7_` | 457,680 | 413.7 M | 1,062 | 1,245 | 3.01 |
| mix initials + invisible run + digit | 83,858 | 413.8 M | 1,090 | 1,264 | 3.05 |
| ct2 (name, initials, look-alike) | 38,785 | 404.5 M | 757 | 867 | 2.14 |
| row digitrun | 311,070 | 413.7 M | 697 | 795 | 1.92 |
| spaces | 426,576 | 413.8 M | 594 | 650 | 1.57 |
| soft hyphens only | 279,547 | 413.7 M | 300 | 338 | 0.82 |
| refused: 5,000,000 `a`, redaction / check | 5,000,000 | past | 0.01 / 0.40 | 0.01 / 0.45 | n/a |
| refused late: `a ` | 600,000 | past | 1,478 | 1,682 | n/a |

## Verdict

With the one claim of the test rows, every letter I could construct that is still read stays under the 3 s on
Node 24 at reference speed: the dearest is 2,406 ms (`U+33FE ;`, 100,000 characters), across 50 test families, 41
plain and compatibility families, 929 seeded families and the mixes, and refusal is immediate at the entry (0.01 to
4.9 ms) and at most 1.7 s when late. The count is identical across runs, orders and the two Node versions here, and
its arithmetic is exact. One driver remains outside the count: the number of the call's own identifiers. With about
250 to 400 claim numbers a read letter takes 3.0 to 3.5 s, with 1,000 it takes 3.8 to 5.9 s (T-1); the letter's
author cannot set that number, the practice's records do, and nothing in `prepare` bounds it. A charge of one to two
units per character per form at `ownMatchesIn` and `confusedMatchesIn` closes it (run at weight 1: 1.3 to 2.2 s
with 1,000 claims) at under 1 % of an ordinary letter's length. The margin under the budget is 20 to 25 %, not the
half the comment states (T-2), and should be restated or restored by charging the NFKC length and `datesIn`.
