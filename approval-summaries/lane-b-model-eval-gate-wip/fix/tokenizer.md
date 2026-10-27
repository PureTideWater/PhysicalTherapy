# PART tokenizer: PR #75 fix round (phi-screen F1, F2, F5, N3, N1 tokenizer side)

Worktree /home/user/contract-phi-check, base 9b7eadfe; nothing committed, stashed, reset or checked out. Integrated
checks ran in my clone /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/clones/fix-tokenizer.
The clone holds the worktree's files as of 19:50 UTC, every part's edits included, with the patient-records request
below applied. Every value is synthetic.

## Files changed (mine only)

- `packages/model-gateway/src/redact.ts`: the tokenizer section is rewritten (lines 325-610), and `identifierPattern` is widened (:77-89).
- `packages/model-gateway/src/redact.test.ts`
- `packages/model-gateway/src/test-support/screen-bound.ts` (new): the bound test's child process.
- `packages/model-gateway/eval/gate.golden.test.ts`: MEASURED (:91-112), the twin pin (:410-424), the separator twin test (:426-443), and the collision test's title.
- `packages/synth/src/screen/patient-twins.ts`: the twin shapes (:63-72), `screenTwinIdentifiers(separators)` (:43-55), and three classes (:88-183).
- `packages/synth/src/screen/patient-twins.test.ts` (new).
- `packages/model-gateway/src/functions/contract-terms.ts`: only the doc comment where screenContractPages refers to the tokenizer (:499-502).
- Fixtures: none. `pnpm synth --case MOD-12` wrote 0 and left 9 unchanged. `--all` wrote 0, left 637 unchanged plus 16 EMR files, and removed 0 (progress/fix-tokenizer-synth.log).

## Request (in fix/requests.md, section "tokenizer"): required

`packages/model-gateway/src/patient-records.ts` (the records part's file) needs three exact replacements:
- the import;
- `ScreenSet` gains `joins` and `index`;
- `screenSet` collects `storedSeparators` of each kept value and builds `runIndex(values)`, and `pagesName` calls `someIdentifierRun` with them.

`python3 -I .../scratchpad/phi/tok/request/apply.py packages/model-gateway/src/patient-records.ts` applies all three, and refuses if any old text is not found exactly once. It applies cleanly to the records part's current version.

Without it, the screen neither joins the practice's own separators nor streams. That fails `redact.test.ts`'s bound test (pagesName still builds every run), gate.golden's separator-twin test, and `tsc`.

## F1: separators inside a stored identifier (major)

**Changed.**
- `JOIN` (redact.ts:343) joins one `.`, `/`, `_` or `*` with no space beside it, on every page. This is the brief's universal join.
- `storedSeparators` (:363-382) collects the practice's own separators: each maximal non-alphanumeric run between two letters or digits of a kept value, as the tokenizer reads a gap. A run that JOIN already accepts is skipped, and so is one holding a line break, a tab or two spaces. `RunOptions.joins` and `joinsTokens` (:384-388) then join those separators on that practice's pages, exactly as written.
- `identifierPattern` (:77-89), the letter redaction's pattern, matches the same separators, so the property test tying the two stays true.

**Reviewer against skeptic.** Both proposed the practice's own separators. I took that (the skeptic's whole-string form: "A..B" and "A. B") and added the brief's universal join over `. / _ *`. A universal join also finds a value the 835 holds without punctuation and a page prints with it. For example, a clearinghouse strips "12345/01" to "1234501", and the practice's own documents still print "12345/01". The practice's separators cannot catch that, because the stored value holds none.

A join over a dot or slash with a space beside it was measured and rejected: it adds 77,754 distinct prose runs over set v2.

**Measured** (set v2, 63 documents; refused with the stored-side rules / without them):

| Practice | 9b7eadfe | Now |
| --- | --- | --- |
| twin, 6/6/8 | 0 / 0 | 0 / 3 |
| twin, 6/6/6 and 6/6/10 | 0, 0 | 0, 0 |
| twin written with `. / _ * # : + ,` (joins `# : + ,`) | n/a | 0 / 3; 0 at 6/6/6 and 6/6/10 |
| date (219) | 0 / 7 | 0 / 7 |
| word (79) | 0 / 63 | 0 / 63 |
| tin (513) | 10 / 10 | 10 / 10 |
| zip4 (500) | 10 / 10 | 10 / 10 |
| slashDate (267) | 0 / 0 | 0 / 9 |
| dateMemberId (486) | 0 / 7 | 17 / 24 |
| decimal (1,453) | 0 / 0 | 0 / 0 |

The twin's 3 without rules are V03, L02 and L04. They are its sequential patient control numbers that are dates (10012026), meeting slash dates; the 8-digit date rule removes them.

Two more measurements:
- A tokenizer without the slash join equals 9b7eadfe on every class. The dot, underscore and asterisk joins cost nothing measured.
- Set v2 writes no number with points of 6 digits or more, so the decimal class keeps none.

The cost on the digit-only run surface: 6-digit runs go from 16 to 96 and 7-digit runs from 1,046 to 1,206 (8-digit dates left out).

**Decision from the numbers.** I kept the universal slash join. Its only measured cost is the adversarial class of member IDs equal to unpadded short dates (17/63), which fails closed and is counted, as TIN and ZIP+4 are. The ordinary twin stays at 0.

Extending ruling 4's date rule to the 6- and 7-digit forms of unpadded dates would bring that class to 0. It would also stop looking for about 1.6% to 5% of 6-digit and about 0.4% of 7-digit identifiers. I did not build it, because it changes a ruled stored-side rule and is the less safe direction. It is written up as a founder option in tokenizer-docs.md §4.

**Tests.**
- redact.test.ts: the eight writings joined; the never-join list widened (a dot or slash beside a space, `..`, `./`, `_ `, `#`, `:`, `+`, U+2028); storedSeparators' cases; the practice separator used only when given; the four review writings plus six more found through the index; a property, at 3,000 runs, that a kept value written as stored is found whatever it holds; a property that every run the 9b7eadfe tokenizer found is still found (its code kept verbatim in the test).
- gate.golden: the new MEASURED rows, the twin's without-rules pin, and the separator twin, whose six values written as stored are each refused.

## F2: format characters and U+2212

**Changed.** INVISIBLE (`\p{Cf}` and `\p{Default_Ignorable_Code_Point}`) is taken out of a gap before it is judged (:325-332, :384-388). JOIN's dash class is `[\p{Pd}\u2212]`. An invisible character stays a token boundary.

**Reviewer against skeptic.** I took the skeptic's fix. The reviewer's whole-text `\p{Cf}` deletion turns "Member ID<ZWSP>ZZ7120034" into the single token IDZZ7120034, which head refused and the deletion would pass, so it is a regression. I also widened the skeptic's `\p{Cf}` to the default-ignorables (U+034F, variation selectors), which compactIdentifier drops too.

**Tests.** redact.test.ts F2 case: each of eight invisible characters, alone and before a hyphen; the minus sign, with and without spaces; still a boundary ("ID<ZWSP>ZZ…", "…<ZWSP>JANE"); and "ZZ <ZWSP> 7120034", "<ZWSP><TAB>", "<SHY>\n" and "<ZWSP>--" still not joined.

## F5: the tokenizer built every run (verdict major)

**Changed.** `someIdentifierRun` (:491-597) streams line by line, NFKC per non-ASCII line only. Tokens come from a lazy `exec`. It keeps ring buffers of size 2^k > maxLength: token starts, prefix hashes and characters. Rolling 32-bit polynomial hashes give each candidate run's hash in O(1). `runIndex` (:426-458) holds the kept values' lengths, first-character bitmaps and murmur-mixed keys in open addressing, never a whole value. A run is built and given to `accept` only on a first-character and key hit, and the scan stops at the first accept. `identifierRuns` (:599-607) is a Set over it, for tests and the measurement.

**Reviewer against skeptic.** I took the skeptic's fix, since streaming the tokens too is what bounds memory. I added the index, which makes the time linear: the skeptic's version still took O(characters × window) string builds.

**Measured** (bench-results2.txt and bench-results3.txt; 16 MiB is intake's cap; a practice at the bound's 50,000 identifiers):

| Text | 9b7eadfe (560 MiB heap) | Now (128 MiB heap) |
| --- | --- | --- |
| 16 MiB prose | out of memory | 0.73 s |
| 16 MiB tab-separated sheet | out of memory | 0.75 s |
| 16 MiB worst case: one-character tokens, one line | out of memory | 1.5 s |
| 16 MiB worst case, 75 lengths | out of memory | 6.9 to 7.7 s (20 s without the first-character test) |
| 16 MiB prose, identifier on page 1 | out of memory | 12 ms |
| 4 MiB prose | 0.51 s, 177 MiB heap | 0.20 s, 40 MiB |
| 4 MiB worst case | 4.5 s, 406 MiB | 0.38 s, 54 MiB |

**Test.** redact.test.ts "screens the largest page text intake accepts in a bounded heap and time, through pagesName". It runs `test-support/screen-bound.ts` in a child with `--max-old-space-size=96` on two inputs: 16 MiB of prose with NBSP, the identifier last; and the worst case. Before: FATAL ERROR, heap out of memory. After: 0.75 to 1.15 s and 1.4 to 1.6 s, with the heap going from 42 to about 65 MiB.

Also: a property, at 3,000 runs, that the indexed screen answers exactly as the plain runs do; the first match stops the stream; no run is built off an index hit (built 0, against 159,932 without the index); and the index holds no value.

## N3: twins' shapes

**Changed.** The 9-digit third is `9NN00NNNN` (patient-twins.ts:65). No SSN has it, since area 9xx and group 00 are both never issued. No ITIN or ATIN has it either: their groups are 50-65, 70-88 and 90-99.

The brief's area 000 was measured and rejected. Set v2's synthetic TINs are 00-NNNNNNN, so 000NNNNNN lies inside them: it held 5 TINs and refused 3 documents. The reviewer's `9xx93xxxx` was rejected too, because group 93 is the ATIN group.

The 11-character third must hold a B, L, S or Z (:69), letters no MBI holds. The doc comments are corrected.

**Test.** patient-twins.test.ts, an independent oracle: SSN, ITIN/ATIN and MBI shape rules, the counts, the separator twin and the new classes. Before: 4 of 7 failed. There were 12,079 ITIN/ATIN-shaped IDs and 2 MBI-shaped ones (2Q52NT4CV83, 3DF2KF8FT23). After: 7 of 7 passed. The twin's TIN and ZIP+4 collisions stay at 0: refusals are 0 at every floor.

## N1, tokenizer side: mutation testing

The driver is tok/mut/mutants-tok.py; the logs are progress/fix-tokenizer-mutants.log and -2.log. 43 mutants were run against redact.test.ts and patient-records.test.ts. All are killed but three, each behaviour-equivalent:
- **The first-character prefilter (`indexStarts` always true).** It is performance only: 20 s against 7 s in the every-length worst case. Kept.
- **runKey's murmur mixing.** It only spreads the table's slots.
- **Splitting lines on `\n`.** It is memory only: a newline in a gap ends a run either way. The 96 MiB bound tolerates one more copy of the text.

Two survivors of the first pass were fixed:
- The line reset was duplicated. `runStart` is now reset only at a line's first token (:552, :563).
- "Marks kept after upper-casing" had no test. A new test covers it: ǰ upper-cases to J plus a caron.

runKey no longer mixes the length, which was equivalent too.

## Also fixed

The previous run's Write tool had turned three no-break spaces in redact.test.ts into plain spaces, at 9b7eadfe's NBSP cases (:77, :84) and the property's separator list. They are restored from head's bytes.

`'#AB12#'` in a test read as a hex color to tools/brand-colors. It is now `'#ZZ12#'`.

## Narrow commands and results

All run in the clone, under flock.

**Unit**
- `pnpm exec vitest run --project unit packages/model-gateway/src/redact.test.ts`: after 27/27; before (head redact.ts, worktree patient-records.ts without the request) 13 failed and 14 passed, the bound test dying out of memory (progress/fix-tokenizer-redact-head.log).
- `... --project unit packages/model-gateway packages/synth/src/screen`: 28 files, 491/491.
- `... packages/synth/src/screen/patient-twins.test.ts`: 7/7; head twins 4 failed (progress/fix-tokenizer-twins-head.log).
- `... tools/brand-colors/scan.test.ts packages/model-gateway/src/redact.test.ts`: 38/38.

**Golden**
- `pnpm exec vitest run --project golden packages/model-gateway/eval/gate.golden.test.ts`: 57/57 (progress/fix-tokenizer-golden-after.log).
- Before, with head redact.ts and no request: 3 failed, the twin's without-rules pin, the separator twin and the collision table (progress/fix-tokenizer-golden-before.log).

**DB** (`DATABASE_URL=postgres://postgres:test@localhost:5433/postgres pnpm exec vitest run --project db`)
- gateway.db and patient-records.db: 32/32.
- web models-routes.db and worker permitted.db: 24/24.

**Static checks**
- `pnpm exec tsc -p packages/model-gateway --noEmit` and `-p packages/synth`: both exit 0.
- `pnpm exec eslint` on my eight files plus the requested patient-records.ts: clean.
- `pnpm lint:logs`: clean.

In the worktree itself, without the request, redact.test.ts's bound test and gate.golden's separator test fail, and tsc reports `set.joins`, until the integrator applies the request.

## Left, and named for others

- **ADR, product docs and the PR's false-refusal table:** fix/tokenizer-docs.md.
- **F5 skeptic item 5:** a character cap on the framed request in `contractTermsSpec.prepare`, before the screen. It is outside my files: it needs a refusal code and a web notice. Written up in tokenizer-docs.md §7.
- **The letter path's `identifierCandidates` (redact.ts:256).** It still drops a word with inner punctuation or a format character. That is P9, under N6: the denial-letter screen is out of this PR, and it is noted in the docs' N6 text.
- **F3, if it moves to stored hashes,** must store the practice's separator set (punctuation only) beside them, or F1 returns. Noted in the request and the docs.
- **Founder option:** extend the date rule to unpadded short dates (tokenizer-docs.md §4).
