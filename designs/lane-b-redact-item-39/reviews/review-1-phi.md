# Review 1 (PHI, adversarial) of Queues item 39: `git diff 6299c550 c1caa730`

Synthetic data only. Identifiers used throughout unless a row says otherwise:
names `['JANE Q ZEPHYRA']`, member IDs `['76543210']`, dates of birth `['1980-03-14']`, one claim with numbers `['ZZ99887']`.
BASE = `/home/user/PhysicalTherapy` (6299c550), HEAD = `/home/user/item39` (c1caa730). Every script is in `/home/user/rv1/`
and is run as `cd /home/user/rv1 && /opt/node24/bin/node --no-warnings <script>`. `lib.mts` loads both trees' `redact.ts`
and runs the reader's sequence (`redactLetterForScreen`, `checkWorkOf`, `holdsIdentifier`): outcome `sent`, `HELD` or `REFUSED`.
No tracked file was edited, nothing committed or pushed.

## Answer to the question

Yes. HEAD sends, in clear, letters that BASE refuses (P-1, blocker). The matcher half of the change (automaton places,
lazy sources, dense rule, views Map) showed no difference from BASE in about 30,000 differential cases. All three findings
that change behaviour are in stage 5, the windows.

## Findings

### P-1 (blocker): a window edge cuts an identifier whose gap holds white space; the half outside the window is never joined to the unseen character, and the letter is sent in clear

- Code (HEAD, `packages/redact/src/redact.ts`): `windowsOf` 4064-4104, the edge rule at 4072, 4080 and 4086 (`/\s/u`),
  radius 4035; the per-window decision at 4153 (`refusedWithUnseenCharactersJoined(piece, ...)`) and 4184
  (`refusedWithNumberCharactersAsOne(piece, ...)`); the comment at 4025 ("no window cuts a run of letters, digits and joiners").
- Why: the comment's claim is false. White space is itself a joiner of a stored number (`NUMBER_JOINERS` begins `\s`, line 680,
  and `GAP.number` is `[...]*`, unbounded), of a name's parts (`GAP.part`), and of written dates. A window edge stops at the first
  white-space character at or past 256 characters from the unseen character, so an identifier written as
  `first half + unseen character + a gap of 256 or more characters that holds one white-space character + second half`
  is cut in the gap. The window's joined reading sees only the first half; the first reading (whole letter) never joins across
  the unseen character; `sameInside` compares only the readings as given, which agree; nothing falls back. `holdsIdentifier`
  does not join unseen characters either, so the final check passes. BASE's whole re-read joins the two halves and refuses.
  U+FEFF counts as white space for the edge (`\s`) while every reading treats it as an invisible joiner, so one U+FEFF after
  256 hyphens is enough (variant c). A line break and an indent is enough (variant d). The number-character windows fail
  the same way (variant j).
- Smallest input: `'Member ID 7654\u0085' + ' '.repeat(256) + '3210'` (275 characters; with 255 spaces the one window is the
  whole letter and HEAD refuses, as BASE does).

| variant | text (JS) | BASE | HEAD | should be | in clear at HEAD |
|---|---|---|---|---|---|
| a | `'Member ID 7654\u0085' + ' '.repeat(256) + '3210'` | HELD (output ends U+0001) | **sent**, text unchanged | refused | yes: member ID, both halves |
| b | `'Member ID 7654\u0085' + '-'.repeat(255) + ' 3210'` | HELD | **sent** | refused | yes: member ID |
| c | `'Member ID 7654\u0085' + '-'.repeat(256) + '﻿3210'` | HELD | **sent** | refused | yes: member ID |
| d | `'Member ID 7654\u0085-\n' + ' '.repeat(255) + '3210 was denied.'` | HELD | **sent** | refused | yes: member ID |
| e | `'Member ID 7\u0085654' + ' '.repeat(260) + '3210 ok'` | HELD | **sent** | refused | yes: member ID |
| f | `'Claim ZZ\u0085' + ' '.repeat(256) + '99887 was denied.'` | HELD | **sent** | refused | yes: claim number |
| g | `'DOB 03/14/\u0085' + ' '.repeat(256) + '1980 on file.'` | HELD | **sent** | refused | yes: date of birth |
| h | `'DOB March\u0085' + ' '.repeat(256) + '14, 1980 on file.'` | HELD | **sent** | refused | yes: date of birth |
| i | `'Patient Jane Q\u0085' + ' '.repeat(256) + 'Zephyra was seen.'` | HELD | **sent** (`Patient [PATIENT_NAME] [PATIENT_NAME]\u0085 ... [PATIENT_NAME] was seen.`) | refused | no (each word replaced), but the outcome differs |
| j | `'Member ID 76' + ' '.repeat(256) + '54½32' + ' '.repeat(256) + '10 was denied.'` | HELD | **sent** | refused | yes: member ID in pieces around the fraction |
| k | `'Member ID 7654\u0000' + ' '.repeat(256) + '3210'` | HELD | **sent** | refused | yes: member ID |

- Reproduce: `node --no-warnings p1.mts` (all rows, with HEAD's own `withWindows({ off: true })` answering HELD on each),
  and `node --no-warnings t1b.mts` (16 shapes at gaps of 0 to 600: every identifier kind flips from HELD/HELD to HELD/sent
  between 254 and 256 characters of gap; the row with no white space, hyphens only, stays HELD at every length).
- The two paths disagree at HEAD: on every row above `redactLetter` + `holdsIdentifier` answers HELD on both trees
  (p1.mts prints it), while `redactLetterForScreen` + `holdsIdentifier` sends at HEAD. One path sends what the other refuses.
- Why the builders' tests miss it: the generated-letters test joins its pieces with a single space and its longest white-space
  run is one character; the 50,000-character rows put the unseen character inside an unbroken identifier.
- Direction for a cure (not built, not tested): an edge is sound only where no single match can reach from the character to
  the edge. Distance in characters does not bound that, since gaps are unbounded; distance in kept letters and digits does
  (more of them than the longest form or date writing holds). Or fall back to the whole re-read whenever an edge lands in a
  run of gap characters that has letters or digits on both sides within the letter.

### P-2 (should): HEAD's output differs from BASE's on letters the base's entry marks; the entry no longer marks a letter whose identifier stands outside every window

- Code: 4135-4158 and 4166-4189 (each window is checked alone; BASE's whole re-read ran `holdsIdentifier` over the whole
  re-read text and marked the letter whatever the check held, anywhere).
- Input: `'Ref 76543210x on file. ' + prose(600) + ' Paid ½ of the charge. ' + prose(300)` with
  `prose(n) = 'The claim was reviewed and paid in full by the plan. '.repeat(...).slice(0, n)`; the same with `'Paid\u0085 half'`.
- BASE: HELD, output ends with U+0001 (the entry's mark). HEAD: HELD, output is the same text without the mark.
  Should be: byte-identical to BASE if "only time, never outcome" is the claim.
- Identifier in clear: no change. Both outputs leave `76543210x` and both are held by `holdsIdentifier`; the caller
  (`packages/model-gateway/src/functions/denial-letter.ts:230-233`) runs that check, so the outcome there is the same.
  The risk is any reader of `redactLetterForScreen(...).text` that trusts the mark alone.
- Frequency: 200 of 3,000 generated letters at the shipped radius (`t3.mts shipped`), 672 of 8,000 at radius 24 against HEAD's
  own whole re-read (`t3.mts small`). Every one is HELD/HELD and differs only by the trailing mark. So the test title
  "windows write what the whole re-read writes" does not hold in general; it passes on its 20 pieces.
- Reproduce: `node --no-warnings p2.mts`; the population: `node --no-warnings t3.mts shipped 21 1500` then
  `node --no-warnings show.mts out-t3-shipped-21.jsonl 3`.

### P-3 (should): the returned result keeps the whole unredacted letter alive (`spansOfReading`)

- Code: 4044-4049 (`spansOfReading`, a module-level WeakMap; `withSpans`), set at 4363, 4380, 4382. The key is the very
  object `redactLetterForScreen` returns to its caller when the letter is not marked (it passes up unchanged through
  `redactedForScreen`, `redactLetterForScreenAsGiven` 4303-4322 and both wrappers); the value holds `normal`, the letter's
  full NFKC text with every identifier in clear, and the spans.
- The section comment (4032: "Nothing here is kept past the call") is false: the raw letter lives as long as the caller keeps
  the redacted result, which exists precisely so that the caller can keep and pass on a text without identifiers. It is not
  reachable through the API, but it is PHI in the heap for an unbounded time (heap dumps, crash dumps), and the windows of
  one call also set an entry for each window's reading.
- Reproduce: `node --no-warnings --expose-gc p3.mts base` and `... p3.mts head`. The script redacts one synthetic letter,
  keeps only the result, forces collection and counts copies of the raw text (`qxxxxxq Member ID 76543210 for Jane Q Zephyra`)
  in a heap snapshot (written to and deleted from /home/user/rv1/x).
  BASE: 1 copy with the result held, 1 after it is dropped. HEAD: **2** with the result held, 1 after it is dropped.
  Should be: as BASE. (The one copy both trees keep after the call was not traced; it is not from this change.)
- Identifier in clear to a reader: no. Lifetime only.
- Direction: hand the spans to the windows as an argument or a field read and removed inside `redactLetterForScreen`
  (try/finally), not through a map keyed by the returned object.

### P-4 (nit): the test seam is exported to every consumer and switches the windows through module-level state

- Code: 4035-4041 (`let WINDOW_RADIUS`, `let WINDOW_MARGIN`, `let windowsOff`, `windowCounts`), 6397 and 6431
  (`matchingForTests.withWindows`), exported by `packages/redact/src/index.ts:6` (`export * from './redact'`).
- Any production importer of `@tp/redact` can run a check with `radius: 1, margin: 0`, which widens P-1 to every gap of two
  characters. The seam restores its values in `finally`, and `windowCounts` holds two numbers and no text, so nothing of a
  letter is kept by it. No reproducing script: this is a reading of the code, not a behaviour difference.

## Attacked and found sound (BASE against HEAD, outcome and output text compared)

- Lemma 1, the skeleton against the patterns' gaps: 10,000 generated letters (`t2.mts`, seeds 11 to 14), 13 names (precomposed and NFD,
  ß, dotted İ, Ĳ and ǅ digraphs, final sigma, U+02BC inside a name, mathematical bold and Deseret astral letters, Cyrillic) and 24 numbers
  (`/`, `]`, `[`, `\`, U+2028, `\n`, regex metacharacters, U+2180 and ½ inside a stored number, Arabic-Indic and full-width digits,
  the Kelvin sign), 49 joiners between characters (marks, U+02BC/U+02B9/U+02CA, modifier letter, ZWJ, soft hyphen, U+FFFC, number
  characters, unseen characters, a lone surrogate, glued letters and digits), 23 edge contexts (glued letter, glued digit, labels): 0 differences.
- `redactLetter` path (`redactionSpans`) BASE against HEAD: 2,500 of those letters: 0 differences.
- Lemma 2, overlapping and self-overlapping forms (`12121212`, `1212`, `ANNA NAN`, `AB12AB12`, glued and labeled writings): 6,000 cases (`t4.mts`): 0 differences.
- The dense rule at 13 to 20 writings of one number (16 = DENSE_PLACES, one less, one and more above), 16 ways of writing it, matches and non-matches mixed: 1,200 cases (`t4.mts`): 0 differences.
- Lemma 4, `sourceOf` against `new RegExp(text, 'gu').source`: 149,645 compiling patterns built from 44 fragments (`/` in and out of classes, `[^]`, `[]`, `[[]`, escaped brackets, backslashes, all four line terminators, astral): 0 differences (`t4.mts`).
- The automaton's fail and output links with 3 to 300 numbers sharing prefixes and suffixes, on one claim and across claims, ASCII, Arabic-Indic and astral digits: 500 cases (`t5.mts`): 0 differences.
- The `.some` sites (`digitsGluedToLetter`, `numberGlued`): covered by the glued edges in `t2.mts` and `t4.mts` and the number characters in `t3.mts`; no difference seen. Not isolated in a test of their own.
- Windows other than P-1 (no white-space run longer than two): letter-wide inputs (name far from initials, dates of birth, the letter's own U+0001/U+0002, look-alike letters, labels and amounts near an edge, merged windows): 8,000 letters at radius 24 against HEAD's whole re-read and 3,000 at the shipped radius against BASE (`t3.mts`): HEAD never sent what the reference held, and never refused what the reference sent; the only differences are P-2's mark.
- A letter with no white space (`x.`-filler, hyphen gaps of 0 to 600 around U+0085): 11 cases (`t1b.mts`, last row): HELD on both.
- U+2180 inside a number with a long white-space gap (`7654ↀ` + spaces + `3210`): the first reading replaces it across the gap, `sameInside` fails and the whole re-read runs: HELD on both at every gap (11 cases).
- Lifetime, by reading: `inOneReading` (1276-1291) clears `viewsOfCheck`, `datesOfCheck`, `formsOfCheck`, `alikeOfWider` in `finally` on every exit, over-budget throws included; `redactLetterForScreenAsGiven` restores the counter in `finally`; `placesOf`' automaton, `searchOf`'s sticky RegExp and `windowsOf`'s search are locals of the call; `KEPT_RUN` is module-level and sticky but its `lastIndex` is set before each use and it holds no text. The one thing that outlives a check is P-3.

## Observations that are not findings of this change

- Initials around an unseen character (`J.\u0085Q. Z.` with the full name elsewhere in the letter) are sent in clear by BASE and HEAD alike (`t1b.mts`, three rows marked `ss!`). Same on both trees, so outside this diff, but worth its own item.
- The windows deliberately change outcome on cost: letters BASE refuses over `CHECK_WORK_BUDGET` (one ½ and one U+0085 in 100,000 characters of prose) are now sent. That is the stated cure of S-1 and C-1, not "time only", and it is sound only once P-1 is closed.

## Not reached

- `searchOf` and lemma 2 were tested only through the entries, not as a unit against a global scan from arbitrary `lastIndex` values (it is not exported).
- Over-budget paths inside a window (the count passing the budget between a window's two readings) and whether HEAD and BASE agree on REFUSED near the budget: no letter in these runs came near the budget.
- The interior fallback's exact margin (a difference at 63, 64, 65 characters from an edge): not probed separately; the 3,000 shipped-radius letters saw 7 fallbacks.
- Nested windows (number-character windows inside an unseen-character window's reading, and inside the whole fallback) beyond what the fuzzers hit by chance.
- NFKC at a window edge (`windowsOf`'s slice comparison, 4091-4102) with characters whose normalisation depends on a neighbour across the edge.
- Letters above about 2,600 characters, and calls with thousands of identifiers together with windows.
- The test files of the diff were read, not run.
