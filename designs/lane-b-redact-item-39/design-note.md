# Queues item 39: the letter check without a pattern per identifier per check (measured design note)

Lane B designer, 2026-11-13. A design note only: no product build, no pull request. Synthetic data only (W25's SYN and
base-36 claim numbers, the gate's synthetic corpus, item 40's generated set). Every number below was measured in this
container on Node 24.22.0, and is scaled to the reference speed (`calibrationMs` 144 ms) where it is a time.

- **Base:** `claude/build-platform` 4d40557f, `packages/redact/src/redact.ts` (5,746 lines). Read only: `viewOf`,
  `WORK` and `workOfIdentifiers`, `patternOf`, `numberForm`, `nameForm`, `formsOf`/`formsBuiltOf`, the form loop of
  `ownMatchesIn`, `digitsGluedToLetter`'s cores, `numberGlued`, and the list of every `new RegExp(` in a function body.
- **Item 40:** its head is now 107c87e1 (newer than e17c1192); section 7 says how this sits over it. Section 5 is the
  orchestrator's widening of 2026-11-13 (S-1, S-2 of item 40's review summary, 4120cef4).
- **Everything reruns** from this folder: `run.mts` (one row in a fresh process: call 1 cold, then warm),
  `battery.sh` (every variant over every row), `variants.mts` (each candidate as an asserted source patch of the base),
  `lay.mts` (gate trees), `prof.py` (self time from a CPU profile), `summarize.py` (the table), `item40/` (section 5).
  Outputs in `out/`.

## 0. The answer in five lines

1. The cold cost is V8 compiling a few thousand regular expressions, one or more per form, the first time each runs:
   `patternOf` builds two per number at form building, and every reading builds three or four more per form.
2. **G-1's square is not pattern building.** It is the check's store of views (`viewOf`), an array searched with
   `findIndex`, asked once per identifier by `numberForm`: N identifiers make N²/2 string comparisons. A Map cures it,
   with no change to any answer. W25's expectation that "matching without a pattern per identifier removes the square"
   holds only if this store is fixed too, so the build fixes it by name.
3. **Recommended: one pass over a prepared set, built per call.** Cut the letter's view to its letters and digits (the
   skeleton). Run one Aho-Corasick automaton over it for the forms' compacts. Run each form's own pattern, unchanged,
   only at the places its compact starts, or as one global scan where the places are dense. No form builds a RegExp
   until a place needs it. Cold 4.06 s falls to 0.32 s at 1,000 x 9 and to 1.03 s at the identifier ceiling. Warm is no worse than the base
   on any row, and the G-1 rows fall from 3.4 to 45 s to 1.0 to 1.3 s.
4. It cannot change what is redacted. Every match of a form spells the form's compact contiguously in the skeleton
   (lemma 1). A sticky run at every such place finds exactly what a global scan finds (lemma 2). No charge on the
   counter moves (lemma 3). On the full gate: **975,489 letters, 0 differing, 463,002 refused on both**.
5. Item 40's whole re-read (S-1): reading **windows** around the unseen and number characters, charged in full, gives
   back the base's limit (about 305,000 characters, against item 40's 93,000) with **0 letters differing** from item 40's
   head on its generated set (51,833) and on the full gate. S-2 is cured on the way.

## 1. What costs the time

### 1.1 W25's figures, reproduced

| | W25 (ADR 0054) | here, base 4d40557f |
| --- | --- | --- |
| 1,000 claim numbers of nine characters, first check of a fresh process | 4.1 s | **4.06 s** (warm 0.20 s) |
| 1,250 of 40 characters (50,000 identifier characters) | 15.7 to 17.4 s | **15.18 s** (warm 0.82 s) |
| 6,300 of nine, 19-character letter, warm | 3.1 s | **3.38 s** (cold 27.7 s) |
| 9,400 of six / 14,000 of four / 18,500 of three, warm | 6.9 / 11.1 / 18.4 s | **6.15 / 20.9 / 45.1 s** |

The square reproduces. The two rows of the shortest numbers are slower here than W25's, by 1.9x and 2.5x. This
folder's generator for numbers under nine characters is W25's `r.mts` one (base 36, zero-padded); W25's G-1 time
harness is not in this folder, so the difference is not traced. Either way, the cure takes those rows to 1.1 and
1.3 s.

The cold rows are W25's own (`review-fix1/cold.mts`): the same identifier generator, letter and patient, with redaction then the check on one
counter, as `prepare` runs them (`lib.mts` `once`).

### 1.2 The cold first check: a RegExp per form, compiled on first use

Profile (`out/profiles.txt`, base, 1,000 x 9): 44 % self time in `ownMatchesIn`, where every reading builds
`new RegExp(form.pattern.source)` per form (plus `labeled` and two glued variants for a number) and runs it. Another
12 % is in `patternOf` (two RegExps per number at form building) and 12 % in the per-core RegExps of
`digitsGluedToLetter` and `numberGlued`. V8 compiles a regular expression lazily, at its first `exec`, and caches the
compiled code by (source, flags). A fresh process has never seen this call's identifiers, so every source is new and
is compiled: about 4 ms a form at 1,000 numbers. Later checks of the same call hit V8's cache. That is the whole
difference between 4.1 s and 0.2 s.

Every RegExp the base builds inside a function body, by what it varies with:

| site | per | built |
| --- | --- | --- |
| `patternOf` (form and its `labeled` writing) | identifier, piece, name word and part | at form building (once per check, stored) |
| `ownMatchesIn`: pattern, labeled, glued x2 | form | every reading that reads forms (both readings, both folds) |
| `digitsGluedToLetter`: the glued cores | digits-only number of 7+ digits | every wider reading |
| `numberGlued` | number with a letter | every check |
| `spacedNameGlued`, `initialsNextToNames` and the date-of-birth patterns | name part, date of birth | per check, but few |
| the module's constant patterns | none | once per process |

Only the first four grow with the call's identifiers. The design removes them from every place that holds no match.

### 1.3 G-1: the square is in the store of views

Profile of the warm calls alone (`out/profiles.txt`, base, 6,300 x 9, inspector started after call 1): 36 % in
`numberForm` and 23 % in `formsBuiltOf`, self time, with `viewOf` inlined into them. `viewOf` keeps the views built in a
check in `viewsOfCheck`, an **array**, and finds one with `findIndex((each) => each.key === key && each.normal ===
normal)`. `numberForm` asks `viewOf(value, 'join')` once for each identifier and each piece, and each ask scans every
view stored so far. N identifiers cost N²/2 string comparisons, whatever the letter. The `viewmap` variant makes it a
Map keyed by (key, text), with the same store-or-replace rule, and the square goes (table, section 2). Nothing else
changes: the array held at most one entry per (key, text), since a found entry was replaced at its own index.

## 2. The candidates, measured

`variants.mts` builds each one as asserted patches of the base's own source, so all are timed in one harness and
compared on one corpus:

- `viewmap`: G-1's store as a Map. Part of every candidate below.
- `cache` (**patterns kept per process**): every per-form pattern taken from a process-wide Map by (source, flags).
- `ac` (**one pass over a prepared set**, built once per call): skeleton, automaton and sticky runs at the places
  (section 3). Forms still build their RegExps in `patternOf`.
- `aclazy`: `ac`, and `patternOf` builds no RegExp. A form holds its source and flags, and a pattern is compiled only
  where a place needs it. A form whose places are dense (more than 16) is searched by one global scan, as the base
  does, because a sticky run at each of hundreds of places is slower than one scan. Both paths are exact.
- `acproc`: `aclazy` with the automaton kept per process, keyed by the forms' compacts.
- `acnokeep`: `aclazy` with nothing held past the check. The sticky patterns' store is emptied when the entry
  returns, as the base empties its views.

Cold (call 1) / warm (best of calls 2-5, or 2-3 for the slow rows) whole check, at the reference speed; heap growth over the run. Same output: the outcome and text of every call hash alike among runs of as many calls, and call 1 spent the same units on the counter.

| identifiers, letter | base | viewmap | cache | ac | aclazy | acproc | acnokeep | same output, same units |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 300 x 15, one, tiny | 1.74 / 0.08 s, 28 MB | 1.69 / 0.08 s, 23 MB | 1.78 / 0.09 s, 20 MB | 0.41 / 0.07 s, 30 MB | 0.21 / 0.09 s, 35 MB | 0.17 / 0.07 s, 18 MB | 0.28 / 0.09 s, 35 MB | yes (sent, 33,377,566 units) |
| 1,000 x 9, one, tiny | 4.06 / 0.20 s, 87 MB | 4.01 / 0.16 s, 98 MB | 4.04 / 0.16 s, 107 MB | 0.87 / 0.16 s, 50 MB | 0.32 / 0.19 s, 40 MB | 0.30 / 0.16 s, 70 MB | 0.37 / 0.17 s, 121 MB | yes (sent, 66,585,966 units) |
| 1,250 x 40, one, tiny | 15.18 / 0.82 s, 278 MB | 16.86 / 0.80 s, 333 MB | 15.84 / 0.83 s, 474 MB | 2.88 / 0.74 s, 75 MB | 1.03 / 0.81 s, 63 MB | 1.09 / 0.76 s, 83 MB | 1.24 / 0.79 s, 185 MB | yes (sent, 368,383,966 units) |
| 2,000 x 9, one, tiny | 8.00 / 0.51 s, 185 MB | 7.55 / 0.29 s, 173 MB | 8.01 / 0.35 s, 181 MB | 1.59 / 0.27 s, 160 MB | 0.57 / 0.34 s, 80 MB | 0.64 / 0.35 s, 149 MB | 0.53 / 0.30 s, 65 MB | yes (sent, 132,977,966 units) |
| 4,000 x 9, one, tiny | 16.97 / 1.52 s, 351 MB | 16.13 / 0.64 s, 334 MB | 13.78 / 0.66 s, 316 MB | 3.28 / 0.64 s, 43 MB | 0.99 / 0.68 s, 201 MB | 0.89 / 0.56 s, 200 MB | 0.91 / 0.72 s, 178 MB | yes (sent, 265,761,966 units) |
| 6,300 x 9, one, tiny | 27.74 / 3.38 s, 420 MB | 24.92 / 1.04 s, 403 MB | 26.09 / 1.21 s, 440 MB | 4.54 / 0.93 s, 287 MB | 1.35 / 0.97 s, 261 MB | 1.41 / 1.10 s, 57 MB | 1.49 / 1.11 s, 52 MB | yes (sent, 418,463,566 units) |
| 9,400 x 6, one, tiny | 40.07 / 6.15 s, 470 MB | 29.47 / 1.24 s, 528 MB | 32.80 / 1.31 s, 575 MB | 6.01 / 1.10 s, 191 MB | 1.63 / 1.22 s, 212 MB | 1.57 / 1.14 s, 224 MB | 1.56 / 1.18 s, 160 MB | yes (sent, 416,756,938 units) |
| 14,000 x 4, one, tiny | 52.97 / 20.89 s, 297 MB | 38.16 / 1.82 s, 240 MB | 36.90 / 1.41 s, 580 MB | 7.31 / 1.07 s, 181 MB | 1.57 / 1.06 s, 234 MB | 1.91 / 1.29 s, 172 MB | 1.67 / 1.27 s, 206 MB | yes (sent, 414,481,966 units) |
| 18,500 x 3, one, tiny | 71.26 / 45.10 s, 239 MB | 44.31 / 1.83 s, 590 MB | 44.06 / 1.56 s, 714 MB | 8.23 / 1.32 s, 106 MB | 1.79 / 1.33 s, 82 MB | 2.01 / 1.50 s, 206 MB | 1.93 / 1.51 s, 252 MB | yes (sent, 411,485,966 units) |
| 1,000 x 9, across, tiny | 4.02 / 0.23 s, 80 MB | 4.14 / 0.18 s, 103 MB | 3.95 / 0.15 s, 109 MB | 0.96 / 0.16 s, 51 MB | 0.31 / 0.17 s, 54 MB | 0.33 / 0.17 s, 76 MB | 0.32 / 0.17 s, 56 MB | yes (sent, 66,585,966 units) |
| 3,000 x 9, one, prose | 9.46 / 1.29 s, 182 MB | 8.91 / 0.82 s, 135 MB | 8.84 / 0.79 s, 167 MB | 2.85 / 0.70 s, 64 MB | 1.09 / 0.72 s, 122 MB | 1.30 / 0.75 s, 169 MB | 1.19 / 0.74 s, 124 MB | yes (sent, 406,577,920 units) |
| 7,000 x 4, one, prose | 14.45 / 2.21 s, 187 MB | 11.99 / 0.55 s, 217 MB | 12.84 / 0.62 s, 234 MB | 3.64 / 0.40 s, 16 MB | 0.71 / 0.45 s, 234 MB | 0.71 / 0.41 s, 234 MB | 0.74 / 0.46 s, 14 MB | yes (HELD, 453,454,560 units) |
| 1,000 x 9, one, listed | 3.26 / 0.45 s, 121 MB | 3.11 / 0.38 s, 128 MB | 3.39 / 0.39 s, 133 MB | 1.99 / 0.38 s, 112 MB | 1.40 / 0.37 s, 156 MB | 1.46 / 0.39 s, 146 MB | 1.45 / 0.39 s, 98 MB | yes (sent, 204,610,296 units) |
| 6,300 x 9, one, listed | 16.07 / 1.15 s, 149 MB | 14.18 / 0.59 s, 157 MB | 15.64 / 0.52 s, 161 MB | 4.62 / 0.29 s, 110 MB | 1.30 / 0.30 s, 135 MB | 1.49 / 0.29 s, 147 MB | 1.34 / 0.34 s, 162 MB | yes (REFUSED, 420,000,001 units) |

Reading the table (every cell is one fresh process; the hash column checks that every variant sent or refused the
same letters with the same text and spent the same units on the counter):

- **Cold (the item's first residual).** The base's first check costs 4.06 s at 1,000 x 9, 15.2 s at the ceiling
  (1,250 x 40) and 71 s at 18,500 x 3. Neither `viewmap` nor `cache` moves it: every source is new in a fresh process,
  so every pattern is compiled either way. `ac` takes it to 0.87 s, 2.9 s and 8.2 s. What is left is `patternOf`
  building a RegExp per form, a parse even when it never runs. `aclazy` takes it to **0.32 s, 1.03 s and 1.79 s**.
  Every row is under 3 s, the 3 s rows are unchanged, and no letter's text has changed.
- **Warm, G-1 (the second residual).** The base grows with the square of the count: 3.38 s at 6,300 x 9, 6.15 s at
  9,400 x 6, 20.9 s at 14,000 x 4 and 45.1 s at 18,500 x 3. `viewmap` alone brings those rows to 1.04, 1.24, 1.82 and
  1.83 s. `aclazy`: 0.97, 1.22, 1.06 and 1.33 s.
- **Growth with identifier count** (`aclazy`, nine characters; 2,000, 4,000, 6,300): cold 0.57, 0.99, 1.35 s; warm
  0.34, 0.68, 0.97 s. Linear in the count and in the identifiers' characters, which is what the budget's
  `identifierCharacter` charge already prices. The rest of the cost is form building (`numberForm`, its views, the
  pieces), paid once per check.
- **Letters that hold the identifiers.** At 1,000 x 9 with 400 written in the letter, cold falls from 3.26 s to 1.40 s.
  That remainder is the 800 sticky runs and the replacements, which are real matches.
- **Refusals are the base's.** 6,300 x 9 "listed" is refused past the budget in the redaction (420,000,001 units on
  every variant), and 7,000 x 4 prose is held at 453,454,560 units on every variant (lemma 3).
- **Memory.** Heap growth over a run is mostly garbage not yet collected, so it is noisy (14 to 714 MB). Only `cache`
  grows with what it keeps: 580 to 714 MB at the 14,000 and 18,500 rows, holding every pattern of every call the
  process has seen. `acnokeep` keeps nothing past the check and costs the same as `aclazy` within the noise (0.37 against
  0.32 s cold at 1,000 x 9, 1.93 against 1.79 s at 18,500 x 3).

### Per candidate

| | cold | warm | growth with identifier count | memory | can it change what is redacted? |
| --- | --- | --- | --- | --- | --- |
| `viewmap` | unchanged (4.0 s at 1,000 x 9) | G-1 cured (1.04 s at 6,300 x 9) | linear | none | no: the same store-or-replace rule |
| `cache`, patterns kept per process | **unchanged** (13.8 to 44 s at the big rows) | as `viewmap` (V8 already caches by source) | linear | **grows with every call's identifiers, held past the check** (up to 714 MB here); needs a bound | not by its matches, but it shares `lastIndex` across readers (a re-entrancy hazard) and holds identifier text in a process-wide store |
| `ac`, automaton per call | 0.87 s; 8.2 s at 18,500 x 3 | as `viewmap` | linear | automaton per call, dropped after | no (lemmas 1 to 3) |
| **`aclazy`**, plus lazy patterns | **0.32 s; 1.03 s at the ceiling; 1.79 s at 18,500 x 3** | ≤ base on every row | linear | per call only (the sticky store per process in the prototype) | **no: lemmas 1 to 4; full gate 0 differing** |
| `acproc`, automaton per process | as `aclazy` | as `aclazy` | linear | holds the call's compacts past the check | no |
| `acnokeep`, nothing past the check | 0.37 s; 1.24 s at the ceiling | as `aclazy` | linear | **none past the check** | no (as `aclazy`; the store's lifetime decides no match) |

## 3. Why the recommended design cannot change what is redacted

Notation: a form F has the code points c0 … c(n-1) of `F.compact`. Its pattern is `BEFORE c0 g0 c1 … g(n-2) c(n-1)
AFTER` (`patternOf`), its `labeled` writing has the same characters with other gaps, and its glued writings replace
`BEFORE` with a lookbehind. K is the set of code points `compactFolded` keeps: `[\p{L}\p{N}]` without U+02BC, U+02B9
and U+02CA. The **skeleton** of a text is its K code points in order, each with the index where it starts.

**Lemma 1 (a match spells its compact in the skeleton).** If no gap class of F matches a code point of K, every match
of any of F's writings, starting at index s of the view, has the K code points c0 … c(n-1) in that order and no others,
and its first code point starts at s. So `F.compact` stands contiguously in the skeleton, starting at the skeleton index
of s. *Proof:* the escaped characters match only themselves (no `i` flag: `patternOf` is `'gu'`), the gaps match only
code points outside K, and the lookarounds consume nothing. ∎ Conditions, each checked:

- (a) Every gap source is disjoint from K. The gaps are a finite set: `GAP.*`, `runOfMarks(...)`, and the class escapes
  of a stored value's own non-K characters. The build adds a unit test that runs each distinct gap source against
  every code point in K (147,593 in this runtime, `out/automaton-cost.txt`), so a joiner added later that is a letter or digit fails the test, not a
  letter.
- (b) Each cᵢ is in K. Checked per form at run time (`compactFolded(F.compact) === F.compact`). A form that fails is
  searched whole, as the base searches it. On the gate: 0 such forms.
- (c) The text the automaton reads is the same view (`viewOf(normal, 'join')`) the patterns run over.

**Lemma 2 (a sticky run at every place finds what a global scan finds).** A global `exec` from `lastIndex` returns the
match at the least index i ≥ `lastIndex` at which the pattern matches, and the match there is the one a sticky copy finds
at i (same source, same backtracking). By lemma 1, no index outside the places can match. So "the first place ≥
`lastIndex` at which the sticky copy matches" is the global scan's answer, `lastIndex` included. It holds for the base's
three ways of moving on: after the match, one code point on (the wider reading and the names' `spacedPiecesPass`), and
reset to 0 when nothing is left. Places are code-point starts, and the base never sets an index inside a surrogate
pair. ∎ The dense rule runs the base's own global scan, so it is trivially the same.

The two `.some` sites (`digitsGluedToLetter`'s cores, `numberGlued`) skip a core whose form's compact has no place.
Each core is the form's own source between `BEFORE` and `AFTER`, and both regexes must match a whole core, so by lemma 1
a skipped core matches nowhere, and every `.some` answer is the base's.

**Lemma 3 (the counter is the base's, charge for charge).** No `work(...)` call and no argument changes. The
`formCharacter x forms x length` charges are made from the full lists, and the cores' charge from the full `cores.size`.
So every letter's count, and every refusal past the budget, is the base's. The budget's constants are untouched.

**Lemma 4 (the lazy source is V8's).** A form keeps `source` as text. Where the text has no `/` outside a class and no
line terminator, it is the string V8's `RegExp.prototype.source` returns. Otherwise it falls back to building one. The
keys `formsBuiltOf` deduplicates by, and the cores `gluedCoresOf` splits, read the same string as before. This matters:
`gluedCoresOf` splits a source by `GAP.labeledNumber`, so a source escaped differently would change the cores. The gate
ran with `ITEM39_CHECK_SOURCE=1`, which builds the RegExp for every form and throws on any difference: 0.

**Measured:** the full gate (`lane-b-redact-ssn-phone/gate`, `--no-cache`, 4 workers), base against `aclazy`:
**975,489 letters, same 975,489, differ 0, refused 463,002 on both, errors 0/0, span mismatches 0; PHI none, KEEP
none, UNPLACED none** (`out/gate-base-aclazy.report.md`). The gate's timing rows: max 1,166 ms on the base, 1,214 ms
on the prototype; none over 3 s.

An earlier prototype without the dense rule was also 0 differing. But it took **7.5 s** on the gate's "many parts run"
letters: 100,000 characters with a name's parts written thousands of times, so tens of thousands of places
(`out/gate-base-aclazy-nodense.report.md`). That is why the dense rule exists, and why the build keeps the gate's
timing rows as its bar and not only the outcome rows.

## 4. Depend on a matcher, or write our own

Prior art (2 tool calls of the 5 allowed; `out/prior-art.txt`): `modern-ahocorasick` 3.3.0 (MIT, no dependencies,
published 2026-09-23) and `@monyone/aho-corasick` 1.5.11 (MIT, no dependencies, 2026-10-19) are maintained and
permissively licensed. `ahocorasick` 1.0.2 has had no release since 2018. `@stll/aho-corasick` is a native binding.

**Write our own.** About 60 lines: a trie of Maps, failure links by breadth, and output lists. That beats depending on
one here, for four reasons:

- `@tp/redact` is declared pure: "no import but the look-alike table beside it". Its dependency on the check is the
  PHI boundary. A third-party module there is an update path into the redactor, behind the three-day release age and
  exact pins of ADR 0066 and the licence gate of ADR 0010. It is still code read by no one on this team at each bump.
- The library would replace only the trie. The skeleton cut, the index map, lemma 1's conditions, the places-to-sticky
  driver and the dense rule are ours either way, and they are where correctness lives.
- We need code points (a surrogate pair is one character of a name). Both packages match strings, and code-point
  handling would be ours to verify.
- Our automaton's whole contract is "every occurrence of every word, with its start". It is checked by the gate and by
  a property test against `indexOf` over random words.

Nothing was copied, and nothing was installed.

## 5. Item 40's whole re-read (the orchestrator's widening): read windows, charged in full

### 5.1 S-1, measured

`item40/s1.mts`: an ordinary prose letter with no identifier, with one ½ and one U+0085, bisected on its length for the
longest letter each tree still sends. The verdict is a count, not a clock, so it is the same on every machine.

| tree | ½ and U+0085 | U+0085 only | ½ only | units at 100,000 characters (both) |
| --- | --- | --- | --- | --- |
| base 4d40557f | sent to about 306,400 | 306,400 | 306,400 | 84.1 M, sent |
| item 40's head 107c87e1 | **sent to about 93,000** | 149,800 | 189,900 | 398.6 M (redaction alone), **refused** |
| head with windows, R = 128 | 305,400 | 305,700 | 306,100 | 85.5 M, sent |
| head with windows, R = 256 | 304,900 | 305,300 | 306,000 | 86.2 M, sent |

Item 40's review measured 77,600 characters on its own prose. The shape is the same here. Each unseen character makes
the head read the whole letter again, and each number character adds a further whole reading inside it. Windows put
the cost back at the base's (+1 to 2.5 % units), whatever the letter's length: 2 windows of about 200 to 400
characters each here.

### 5.2 The windowed re-read (`item40/variants.mts`, `headwin`)

For each run of unseen characters (`UNSEEN_CHARACTERS`), and separately for each number character that is no decimal
digit (`NUMBER_CHARACTERS`):

1. **The window:** the run's place ± R (R = 128 prototyped, 256 recommended, 5.3). Each edge is moved out to a white-space
   character, which is taken into the window, so no window cuts a run of letters, digits and joiners however long.
   Windows that overlap merge.
2. **Read the window twice,** as given and as the re-read writes it (unseen runs joined as U+200B; number characters as
   U+2180): the same entry the head uses for the whole letter (`redactLetterForScreenBesideNumberCharacters`, or
   `refusedWithNumberCharactersAsOne` on the window).
3. **Refuse** if the re-read's check holds an identifier in the window, or if the window's two writings differ (the
   head's own rule, window by window).
4. **Charged in full:** every window's two readings and its check count on the letter's one counter, from where the
   letter's count stands. Past the budget the letter is refused, as now. S-2 is cured by construction: the number
   re-read's check is `holdsIdentifierCounted(..., further)`, so its work reaches `checkWorkOf`.

### 5.3 Proof: the windows never send what the whole re-read refuses, other than letters with no identifier in clear

Write W for the head's whole re-read and V for the windows. Let T be the letter and J the rewriting (join the unseen
runs, or read number characters as one). R(x) is the entry's reading and C(x) the check. W refuses when (W-i)
C(R(J(T))) holds an identifier, or (W-ii) R(J(T)) ≠ J(R(T)). V refuses when, for some window w, C(R(J(w))) holds or
R(J(w)) ≠ J(R(w)). Neither is reached unless the first reading sent, and the caller's check of R(T) still follows both.

**Locality, L(r):** every decision a reading or the check makes about a span (replace it, keep it, hold it) depends
only on the call's identifiers and on the text within r characters of the span, with each edge moved out to white
space as the windows' edges are. r = 64 is the widest fixed context in the reader: the label, amount, date and range
windows all slice 10 to 64 characters, and the `{0,48}` and `{0,40}` quantifiers are inside that. Unbounded runs are
covered by the edge rule.

**Theorem.** Under L(r), with R ≥ 3r, V refuses every letter W refuses.

- (W-i) The joined check holds at a span o. If no J-changed place lies within 2r of o, the texts R(J(T)) and J(R(T))
  agree within r of o. That is by L, since the readings' decisions there saw the same text, and J changes nothing that
  is not an unseen or number character. The check's decision about o is then the one it makes on the letter as sent,
  which the caller's check refuses, so the letter is not sent. Otherwise a J-changed place u lies within 2r of o, and
  the window around u covers o's reading context (≤ 2r from u) and o's check context (≤ r more). Within the window, by
  L, R(J(w)) is R(J(T)) around o, and C(R(J(w))) holds at o: V refuses.
- (W-ii) The writings differ at a span d. Away from J-changed places they agree (as above), so some u lies within r of
  d. The window around u holds d's context, so by L its two writings differ at d too: V refuses. ∎

So under L the windows are exactly as strict as the whole re-read, not only on letters with identifiers. **Where L does
not hold, V may send what W refuses.** The reader has three letter-wide inputs: whether a name was found anywhere
(initials next to names, `names.length === 0`), the dates of birth found (`inWholeDate`), and a letter that ends in the
barrier mark. Each can change from a joined place u to a decision far away. But each such far change is caused by a
match at u that one writing has and the other has not (a name, a date). That match is a difference inside u's window,
and V refuses there. **The one escape is a match at u that changes a letter-wide input and is written identically in
both readings of the window.** That is a joined-only match that a reading suppresses where it stands, such as a name
inside a whole written date. In that case the far span is not an identifier the joined reading found in clear: it is
an initial or date that W then redacts and V leaves, and the base also leaves it. So V sends only letters where W's
refusal adds no identifier in clear that the base reading would not leave. That is the orchestrator's exception, and
the gate classes measure it.

**The build closes the escape at run time, not by audit alone.** It keeps the first reading's spans. If a window's
reading as given differs from the first reading over the window's interior (more than r from either edge), L has failed
on that letter, and V falls back to W for that letter, charged. So every letter is either proven local on its own text
or read whole, as now. The fallback is a string comparison on the window.

### 5.4 Measured equivalence (`item40/run.sh`)

- **Item 40's generated set** (seed 40: R1-3, R1-4, ruling (A), probes, real-shaped U+0085, U+0091 to U+0097, NUL,
  superscripts), head (A, the whole re-read, the oracle) against windows (B): **51,833 letters, differ 0, refused 8,570
  on both, PHI classes none, failures 0**. Notes 2: the head's two pinned `r13.left.floor` residuals, written the same
  on both (`out/item40-generated-run.*`).
- **The full gate,** head against windows: **975,489 letters, differ 0, refused 463,002 on both**; PHI, KEEP and
  UNPLACED none. Timing max 1,201 ms head, 1,267 ms windows (`out/item40-gate-head-headwin.report.md`).
- So on every letter either corpus holds, the windows send and refuse exactly what the whole re-read does. The
  exception in 5.3 did not occur once.

## 6. Recommendation and stages

**Build `aclazy` with nothing kept past the check (`acnokeep`'s lifetime), the dense rule, and the views Map, and fold
item 40's windows in.** No process-wide store of the call's identifiers or of patterns built from them. The cost is
the same (table), and the module's rule that nothing of a check outlives it extends to the identifiers. The automaton is
built per call: 6 to 30 ms at the identifier ceiling of about 60,000 characters (20 to 40 ms in a fresh process;
`out/automaton-cost.txt`), already inside the table's figures. The per-process variant measured no gain.

Each stage is its own commit on one branch (`co-001/redact-item-39`), proven before the next, with the full gate
(`--no-cache`) at each stage's end. The bar at every stage: **0 letters differing; `CHECK_WORK_BUDGET`, every `WORK`
constant and the 3 s rows unchanged.**

1. **Tests first, seen failing on an assertion.** (a) G-1: a 19-character letter with 6,300 nine-character numbers
   checked under 3 s at the reference speed, and the growth from 3,150 to 6,300 numbers under 2.2x (linear plus noise,
   not 4x). (b) Cold: in a fresh worker, the first check with 1,000 nine-character numbers under 1 s. (c) Lemma 1(a):
   every gap source against every K code point. (d) The automaton against `indexOf` (fast-check, code points, overlapping
   words). (e) Lemma 4: for every form of the synth twins, the lazy source equals V8's.
2. **The views Map** (G-1). One function. Gate: 0 differing.
3. **The skeleton and the automaton,** with the sticky driver and the dense rule, at the three per-form sites of
   `ownMatchesIn` and the two `.some` sites. Gate.
4. **Lazy patterns** (`patternOf` builds none; the source rule with its fallback). Gate, with the source check on.
5. **Item 40's windows** (after item 40 merges, on its head): R = 256 = 4r; the first reading's spans kept; the
   window-interior fallback to the whole re-read; S-2's charge. Item 40's generated set and the gate against item 40's
   head as the oracle: 0 differing, PHI none.
6. **Two reviews** (PHI and time), as the item asks: PHI against lemmas 1 to 4 and 5.3; time against the battery and
   the gate's timing rows, including the dense "many parts" letters.
7. **ADR 0054:** the two pinned rows (cold, G-1) closed with their measured figures, and the residual paragraphs
   rewritten. The ceiling by count stays as the budget's guard; the item adds no constant.

Stage 5 can ship alone if the orchestrator wants S-1 cured inside item 40. It needs only the item 40 head, not stages 2
to 4.

## 7. How this sits over item 40's head

Item 40's head (107c87e1) touches three things this design touches:

- `ownMatchesIn` passes one more argument to `initialsNextToNames`, after the form loop. No conflict with the form loop.
- `digitsGluedToLetter`'s two core regexes: item 40 widens the lookarounds from `\p{L}` to `[\p{L}\p{Nl}\p{No}]`, on
  the same two lines stage 3 changes. The conflict is textual only. The core between the lookarounds is unchanged, so
  lemma 1 and the `.some` argument hold as written, and stage 3 takes item 40's class.
- Its new code (`redactLetterForScreen`'s re-reads, `holdsNameOrNumber`) builds no new RegExp per identifier. Its diff
  holds four `new RegExp(` lines: the two core lines above, changed, and two constants (`UNSEEN_CHARACTER(S)`). Its re-reads call the same entry, so every gain here multiplies through
  them. Today a letter with an unseen character pays the cold compile twice and the G-1 square twice.

Order: item 40 merges first (it is in review). Item 39's branch is cut from `claude/build-platform` after that, and
stage 5 takes item 40's re-reads into windows. If item 39 is cut before item 40 merges, stages 2 to 4 merge cleanly
except for the two lines above, and stage 5 waits.

## 8. Questions for a ruling

1. Build the per-call automaton with lazy patterns (`aclazy`), not patterns kept per process? **Recommend yes:** the
   only candidate that cures the cold check, and it holds no identifier past the check.
2. Fix G-1's store of views as its own stage, named in ADR 0054 as the square's cause? **Recommend yes.**
3. Write the automaton ourselves rather than depend on an MIT package? **Recommend writing our own,** about 60 lines,
   keeping `@tp/redact` free of third-party code.
4. Cure S-1 and S-2 with item 40's windows inside item 39 (stage 5), with the window-interior fallback? **Recommend
   yes,** R = 256, the fallback in.
5. Keep the dense rule's threshold as a constant (16 places) with the gate's "many parts" rows as its bar? **Recommend
   yes.**
6. Leave the identifier ceiling by count (W25's interim option) unadopted, since the cure removes its reason?
   **Recommend yes:** keep only the budget's existing characters-based charge.
