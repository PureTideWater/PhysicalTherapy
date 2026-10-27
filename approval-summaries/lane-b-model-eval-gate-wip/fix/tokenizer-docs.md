# tokenizer part: what the documents must now say (PR #75 fix round)

For the integrator. Findings phi-screen F1, F2, F5, N3 and N1 (tokenizer side). Nothing here is applied: docs/adr,
docs/product and docs/runbooks are the integrator's. Every figure below comes from synthetic pages (set v2) and
synthetic twins; the commands that produce them are in the last section.

ADR below means `docs/adr/0070-gate-models-on-wrong-but-verified-fields-and-people-set-floors-serve-each-model-feature-on-its-own-evaluation-and-check-contracts-against-the-practices-records-before-the-model.md`, Part 3. Line numbers are at 9b7eadfe.

## 1. ADR, Decision, "The tokenizer" (ADR:626-634): replace the bullet

> - **The tokenizer** (`someIdentifierRun`, `src/redact.ts`; `identifierRuns` lists the same runs for tests). The page
>   text is read one line at a time, and a run never crosses a line break. Each line is NFKC-normalized, so a no-break,
>   thin or full-width space becomes a space and a full-width digit becomes a digit. A token is a maximal run of letters
>   and digits (`[\p{L}\p{N}]+`). Every other character is a boundary, so "Member ID:ZZ1234567", "Claim#9876543210" and
>   "(ZZ1234567)" each hold the identifier as a token.
>
>   A run extends from a token over the following tokens while each gap between them joins. First the gap's invisible
>   characters are taken out: format characters and default-ignorable code points, such as a soft hyphen, a zero-width
>   space or joiner, a word joiner or a byte-order mark. NFKC keeps these characters, and `compactIdentifier` drops them.
>   They still count as token boundaries, so "ID<zero-width space>ZZ1234567" holds the token ZZ1234567.
>
>   What is left joins two tokens when it is one of these:
>   - nothing;
>   - one space;
>   - one hyphen, dash or minus sign (U+2212), with at most one space on either side;
>   - one dot, slash, underscore or asterisk, with no space beside it
>     (`^(?:[ ]|[ ]?[\p{Pd}\u2212][ ]?|[./_*])?$`);
>   - a separator the practice's own kept values hold, exactly as they hold it (`storedSeparators`). The screen's set
>     carries these separators, punctuation only: "ZZ#7120077" adds `#`, and "A12:34" adds `:`. A separator holding a line
>     break, a tab or two spaces is never added.
>
>   So "ZZ 123 4567", "ZZ-123-4567", "ZZ - 123", "77−1200−0000345", "SYNPCN.12001", "20261234/01" and "SYN_PCN_44551"
>   are each one run, and a value the practice stores with any separator is found when a page writes it as stored.
>
>   These end the run: a newline, a tab, two spaces, two dashes, a dot or slash beside a space ("Agreement. Section",
>   "PT / OT"), two separators, or any other character. So the fields of a CSV or a workbook, which the readers join with
>   tabs, never join. A PDF's columns on one line do join: pdf.js reads a gap of any width as one space, so set v2's C03
>   reads "97110 59 GP" and yields the run 9711059. The false-refusal measurement reads the pages as read, so it counts
>   these joins.
>
>   Each run's compact concatenation is compared while its length is from the smallest floor (6, `SCREEN_MIN_RUN`) to
>   the longest kept identifier, at most 80 characters (`SCREEN_MAX_RUN`: X12 caps CLP01 at 38 and CLP07 at 50).

Also correct the sentence at redact.ts's old doc comment, quoted in the review (ADR:631-632, "a table's columns ... never join"). The text above replaces it. This is F8's item (c). The code comment is already corrected in `redact.ts`.

## 2. ADR, a new bullet after "Whole-token match": the stream and its bound (F5)

> - **Streamed, stopping at the first match** (phi-screen F5). The check builds no list of runs. It reads the text as a
>   stream and stops at the first run that is one of the practice's identifiers. It holds the current line and, for the
>   open run, the last `maxLength + 1` positions' token starts, prefix hashes and characters. That is bounded by the
>   longest run and the longest line, whatever the text's length.
>
>   The set carries an index of its kept values (`runIndex`: their lengths, first characters and 32-bit polynomial
>   hashes, never a whole value). For each token the check does one constant-time test per kept length. It builds a run,
>   and looks it up exactly, only when a kept value has that run's length, first character and hash. A hash match only
>   costs time; it never decides a match. So the time is linear in the text.
>
>   Measured on synthetic text (the largest page text intake accepts, 16 MiB, framed as `prepare` frames it, against a
>   practice at the bound's 50,000 identifiers), on this 4-CPU machine:
>
>   | Text | 9b7eadfe (560 MiB heap) | Now (128 MiB heap) |
>   | --- | --- | --- |
>   | 16 MiB of prose | out of memory | 0.73 s |
>   | 16 MiB tab-separated sheet | out of memory | 0.75 s |
>   | 16 MiB worst case: one-character tokens, single spaces, one line | out of memory | 1.5 s |
>   | The same worst case, kept identifiers of every length from 6 to 80 | out of memory | 6.9 to 7.7 s |
>   | 16 MiB of prose, the identifier on page 1 | out of memory (no early exit) | 12 ms |
>   | 4 MiB of prose | 0.51 s, 177 MiB of heap after | 0.20 s, 40 MiB |
>   | 4 MiB worst case | 4.5 s, 406 MiB | 0.38 s, 54 MiB |
>
>   The first-character test is what keeps the every-length case at 7 s: without it the same text takes 20 s. Figures
>   are from `scratchpad/phi/tok/bench-results2.txt` and `bench-results3.txt`. `redact.test.ts` holds the bound: it
>   screens 16 MiB of prose, with the identifier written last, and the worst case through `pagesName` in a child
>   process with a 96 MiB old space: about 0.8 s and 1.5 s, with the heap going from 42 to 65 MiB.

## 3. ADR, "What it gives up" (ADR:728-750)

Replace the first sentence of **Not caught** ("an identifier wrapped across lines, split by a tab, or spaced by two or
more spaces or two dashes") with:

> an identifier wrapped across lines; split by a tab, two or more spaces, two dashes, a dot or slash with a space beside
> it, or two separators together; split by any other character (a comma, a colon, a hash, a plus sign, a parenthesis)
> that none of the practice's own kept values holds; or written with a separator other than the practice's own (stored
> "SYNPCN#12001", written "SYNPCN:12001");

Keep the rest of the list. F8's items, if the integrator takes them, go into the same list (OCR misreads, a glued
prefix or suffix, dropped leading zeros, thousands separators). Do **not** list "groups split by '.' or '/'", "a stored
value written with dots, slashes or underscores" (F1) or "format characters and U+2212 between groups" (F2): this
round fixes them.

Add to **Refused that names no patient**, after the TIN and ZIP+4 sentence:

> a member ID or payer claim number equal to a date written with slashes or dots without leading zeros (1/1/2026 is
> 112026, above the member ID floor and no 8-digit date), or to a number written with points (an amount 1234.56 is
> 123456): the check joins over a slash and a dot as it does over a hyphen, so these are refused exactly as a hyphenated
> date is. They are counted below.

Add a new item:

> - **The time per click:** the check is linear in the text and bounded in memory (above). At the largest text intake
>   accepts it blocks the web's event loop for about 1 to 2 s on this machine, up to about 7 s for a practice whose
>   identifiers have every length from 6 to 80, and longer on the web task's 0.5 vCPU. A request that long cannot be
>   read by a model anyway. The cap that bounds it belongs in `contractTermsSpec.prepare` (see §7).

## 4. ADR, "Measured: the false refusals" (ADR:752-772): the new figures

Replace the twin's description (ADR:754-756) with:

> 80,000 member IDs: a third `ZZ` and 7 digits; a third 9 digits in an area 9NN with group 00, which no Social Security
> number has (neither the area nor the group is ever issued) and no ITIN or ATIN has (their groups are 50 to 65, 70 to
> 88 and 90 to 99); and a third 11 letters and digits holding a B, L, S or Z, letters no Medicare Beneficiary
> Identifier holds (phi-screen N3; `patient-twins.test.ts` checks each shape).

Keep "refuses **none at the ruled floors (6/6/8), none at 6/6/6 and none at 6/6/10**". Add:

> Without the stored-side rules it refuses 3 (V03, L02, L04; none at 9b7eadfe). Those are its sequential patient control
> numbers that are dates (10012026 is 10/01/2026), meeting a slash date the tokenizer now joins. The 8-digit date rule is
> what keeps the twin at zero.
>
> The same twin written with separators inside its values (each value with one of `. / _ * # : + ,` in turn: the
> practice's joins are `# : + ,`) refuses none at 6/6/8, 6/6/6 or 6/6/10 either, and the same 3 without the rules. Each
> of its values written on a page as stored is refused.

Replace the table with (new rows marked; old rows unchanged):

| Class | Identifiers | With the stored-side rules | Without them |
| --- | --- | --- | --- |
| date: hyphenated dates as the tokenizer joins them, stored as patient control numbers | 219 | 0 | 7 |
| word: letter-only words of 8 or more letters, stored as patient control numbers | 79 | 0 | 63 |
| tin: 9-digit member IDs equal to the set's TINs | 513 | 10 | 10 |
| zip4: 9-digit member IDs equal to the set's ZIP+4s | 500 | 10 | 10 |
| **slashDate**: dates written with slashes or dots, as joined, stored as patient control numbers | 267 | 0 | 9 |
| **dateMemberId**: every date of date and slashDate, stored as member IDs | 486 | 17 | 24 |
| **decimal**: numbers written with points (1234.56, 4.2.1), as joined, stored as member IDs | 1,453 | 0 | 0 |

Then:

> The stored-side rules bring the date, slashDate and word classes to zero. Patient control numbers' floor is 8, and an
> 8-digit date is dropped. TIN and ZIP+4 collisions stay refused, by design, and are counted.
>
> So do member IDs equal to a short date: 1/1/2026 joins to 112026, which is above the member ID floor of 6 and is no
> 8-digit date. At 9b7eadfe the dateMemberId class refused 0 with the rules, and 7 without. Every one of its refusals
> now comes from the slash join.
>
> No number set v2 writes with points is 6 digits long (its amounts are under 1,000.00), so the decimal class keeps
> none, with the rules or without. A contract that writes 1234.56 is refused only for a practice that holds 123456
> as a member ID or payer claim number.
>
> On the ordinary twin practice all of these are zero, so the design stands.

The decision, for the ADR's departures list (§5) and the pull request:

> The join over a dot, an underscore and an asterisk costs nothing measured. A tokenizer without the slash join gives
> exactly 9b7eadfe's figures on every class.
>
> The slash join costs the dateMemberId class 17 of 63 documents, and the twin 3 without the rules. It is kept because
> it fails closed. A clearinghouse that strips punctuation from a claim's patient control number stores "1234501",
> while the practice's own documents print "12345/01". Only a universal join finds that writing. The practice's own
> separators cannot: the stored value holds none.
>
> The refusals it adds are fail-closed and counted, as TIN and ZIP+4 are. At 9b7eadfe set v2's distinct digit-only
> runs (8-digit dates left out) were 16 of 6 digits and 1,046 of 7. Now they are 96 and 1,206. A practice whose member
> IDs or payer claim numbers are 6 or 7 digits sees that many more chances of a collision.
>
> **For the founder:** extending the 8-digit date rule (ruling 4) to the unpadded forms M/D/YYYY, MM/D/YYYY, M/DD/YYYY
> and MM/DD/YY (6- and 7-digit compact dates) would bring dateMemberId to 0. In exchange the check would stop looking
> for the 6- and 7-digit identifiers those forms take: about 1.6% of 6-digit values with a 4-digit year (about 5% with
> 2-digit years too), and about 0.4% of 7-digit values. Not built: the stored-side rules are ruling 4's, and failing
> closed is the safer default.

## 5. ADR, "Where the build departs from the design" (ADR:774-): amend item 1, add a new item

Item 1 ("The join between tokens") now reads:

> 1. **The join between tokens.** The design's code sketch (its Appendix A.3) also joined two spaces with no dash,
>    which its own algorithm rules out (two spaces are a column gap). Its algorithm (section 5.3) ended a run at any
>    other character. The build follows the algorithm on two spaces, tested with "ZZ  1234567". It departs on three
>    joins (phi-screen F1 and F2):
>    - one dot, slash, underscore or asterisk with no space beside it joins on every page;
>    - every separator the practice's own kept values hold joins on its pages, exactly as held;
>    - invisible format characters are taken out of a gap before it is judged, and a minus sign joins as a dash.
>
>    Before, a stored identifier written on the page exactly as stored was missed when it held one of those separators
>    ("SYNPCN.12001", "20261234/01", "E7712000.345"). So was one split by a zero-width space or a soft hyphen, or grouped
>    with minus signs, which a CSV or xlsx exhibit carries through to the screen. The cost is measured above. A join
>    over a dot or slash with a space beside it was measured and refused: it adds 77,754 distinct runs over set v2's
>    prose ("ARTICLE1PARTIES ...").

New item:

> **The tokenizer streams** (phi-screen F5). The design's code sketch (Appendix A.3) returned an array of every run.
> Over the largest page text intake accepts, that array exhausted the web task's 560 MiB heap. A V8 out-of-memory abort
> fails every request in flight on that task, and a retry crashes the other task too. The build streams the text and
> stops at the first match (Decision, above).

## 6. ADR, the Alternatives row and notice N5 (ADR:834, 841): correct "decryption catches every writing"

Alternatives, the row "The stored payer claim number hash": replace "decryption catches every writing (N5)" with:

> decryption catches every writing the tokenizer joins: one space, dash, minus sign, dot, slash, underscore or asterisk
> between groups, and every separator the practice's own values hold, exactly as written (N5). A writing with another
> separator still misses ("What it gives up").

N5: append:

> Since phi-screen F1, it also catches the identifier written exactly as stored, whatever separators it holds. The
> practice's separators come from the decrypted values. If F3 moves the check to stored compact hashes, the practice's
> separator set must be stored and returned with them. It is punctuation only, no PHI. Without it F1's gap comes back.

N6: append:

> The letter redaction's identifier pattern (`identifierPattern`, used by `redactLetter` and `holdsIdentifier`) matches
> the separators the contract screen's tokenizer now joins too: any run of white space, dashes, minus signs, dots,
> slashes, underscores, asterisks and invisible characters between two of an identifier's characters. So a letter is
> redacted of at least what the screen would find, and the property test that ties the two stays true. The letter
> path's other-patient screen (`identifierCandidates`) is unchanged: it still drops a word with inner punctuation or a
> format character, and that gap is P9's.

## 7. ADR, Consequences (ADR:846-): add

> - The check's time per click is linear in the text (about 1 to 2 s at the 16 MiB intake cap on this machine), and its
>   memory is bounded. A cap on the framed request's characters in `contractTermsSpec.prepare` should come before the
>   screen: an `InputRefusedError` with a fixed sentence, sized to what the model can read and above the 80-page
>   documents the design sizes at about 100k tokens. It would bound the screen's event-loop time and refuse a request
>   no model can read. That is phi-screen F5's skeptic item 5, outside the tokenizer part: it needs a refusal code and
>   a web notice.

## 8. ADR, "Tests (test matrix MOD-12)" (ADR:866-): amend the bullets

`redact.test.ts`, replace the bullet with:

> - `packages/model-gateway/src/redact.test.ts`: the tokenizer after `:`, `#`, `(` or a word; 2, 3 and 4 groups; NFKC
>   forms; one dot, slash, underscore or asterisk joining; invisible characters out of a gap and a minus sign as a dash,
>   each still a boundary; never across a newline, a tab, two spaces, two dashes, a dot or slash beside a space, two
>   separators or another character; never inside a longer token; the run lengths; the practice's own separators
>   (`storedSeparators`), and a value written as stored found whatever it holds (a property, 3,000 runs); every run the
>   9b7eadfe tokenizer found still found (a property against its code, kept verbatim in the test); the index answering
>   exactly as the plain runs (a property); the first match stopping the stream; no run built off an index hit; the
>   bound (16 MiB through `pagesName` in a 96 MiB child); properties against `identifierPattern` and for whole tokens;
>   the floors and stored-side rules.

Add:

> - `packages/synth/src/screen/patient-twins.test.ts`: the twin's counts; no 9-digit member ID SSN-, ITIN- or
>   ATIN-shaped; no 11-character one MBI-shaped; the twin written with separators; the new collision classes read as
>   the tokenizer joins.

`eval/gate.golden.test.ts`: replace "the false refusals and the collision classes above, pinned" with:

> the false refusals (with and without the stored-side rules), the twin written with separators, and the seven
> collision classes above, pinned.

## 9. docs/product/test-matrix.md, MOD-12 row (line 231)

Replace "found as a whole token however the page spaces or hyphenates it" with:

> found as a whole token however the page spaces, hyphenates, dots, slashes or underscores it, splits it with an
> invisible character, or writes it exactly as stored

## 10. docs/product/reconciliation-001.md, item 16's amendment (line 263)

In the attacks: after `("ZZ 123 4567", "ZZ-123-4567")`, add:

> , or with dots, slashes, underscores or minus signs ("SYNPCN.12001", "20261234/01", "77−1200−0000345"), with a
> zero-width space or soft hyphen between groups, or exactly as stored whatever separators the practice's identifiers
> hold

In "what the check gives up", replace "(an identifier wrapped across lines or spaced by two or more spaces, ...)" with:

> (an identifier wrapped across lines, split by a tab, two or more spaces, two dashes, a dot or slash beside a space, or
> a separator the practice's identifiers do not hold, ...)

And add to what it confirms is sent:

> and a member ID equal to a short date or an amount written with points is refused and counted (fail closed)

## 11. The pull request: the false-refusal table (with and without the stored-side rules)

Over set v2's 63 documents, read as intake reads them. Refused documents at 9b7eadfe and after this round:

| Practice | 9b7eadfe, rules | 9b7eadfe, no rules | Now, rules | Now, no rules |
| --- | --- | --- | --- | --- |
| twin (80k/201k/200k), floors 6/6/8 | 0 | 0 | 0 | 3 |
| twin, floors 6/6/6 and 6/6/10 | 0, 0 | | 0, 0 | |
| twin written with separators `. / _ * # : + ,` (joins `# : + ,`) | 0 | | 0 | 3 |
| date (219) | 0 | 7 | 0 | 7 |
| word (79) | 0 | 63 | 0 | 63 |
| tin (513) | 10 | 10 | 10 | 10 |
| zip4 (500) | 10 | 10 | 10 | 10 |
| slashDate (267) | 0 | 0 | 0 | 9 |
| dateMemberId (486) | 0 | 7 | 17 | 24 |
| decimal (1,453) | 0 | 0 | 0 | 0 |

The separator twin cannot be measured at 9b7eadfe: that tokenizer had no practice separators. Its compact values are
the plain twin's, so it would read 0. Kept identifiers with and without the rules: slashDate 0 and 47, dateMemberId 220
and 486, decimal 0 and 0.

Alternatives measured (same table; `scratchpad/phi/tok/measure-1.txt`, `measure-2.txt`):
- the F2 change alone, and the join without the slash: identical to 9b7eadfe on every class;
- the join over a dot or slash with a space beside it: no extra refusal on these classes, but 77,754 more distinct
  prose runs over set v2, so it was rejected;
- area 000 for the twin's 9-digit member IDs (the brief's example): holds 5 of set v2's synthetic TINs, which are
  00-NNNNNNN, so 000NNNNNN is inside the TIN space, and refuses 3 documents. It was rejected for area 9NN with group 00
  (0 held, 0 refused).

Commands: `scratchpad/phi/tok/measure-2.mts`, `measure-3.mts` and `surface.mts`, run with tsx from the tokenizer clone
(`scratchpad/phi/clones/fix-tokenizer`, the worktree's files plus the patient-records request). The pins live in
`eval/gate.golden.test.ts`, 57 of 57 passing there.
