# PART merge 2: claude/build-platform (a6e754fc: #80 and #79) into PR #75 (co-001/contract-phi-check, 4b886fcc)

## State

- **Worktree:** /home/user/contract-phi-check.
- **Refs:**
  - HEAD is 4b886fcc;
  - MERGE_HEAD is a6e754fc;
  - the merge base is ecebdc90, which f5292c6c had already merged.
- **Done:** `git merge --no-ff --no-commit origin/claude/build-platform`. Everything is resolved and staged with `git add`. No unmerged path and no untracked file remain.
- **Not done:** nothing is committed. Nothing is rebased, forced or pushed.
- **Boundaries held:**
  - every value is synthetic;
  - no migration;
  - no model name or identifier in an added line (grepped);
  - nothing changes under packages/pricing, packages/ledger, content/releases, fixtures/golden or `domain-model.md`, compared with either side;
  - none of #42's four files (`services.ts`, `rate-limit.ts`, `settings.ts`, `fields.ts`) is touched by an edit of mine. #80's own change to apps/worker/src/packets/services.ts comes in with the base.
- **Paths:**
  - progress: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/progress/merge2.md
  - logs: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-logs/
  - scripts: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-scripts/ (`probe.mts` compares the paths gap by gap; `sweep.mts` and `stats.mts` run the new property over many seeds; `mutate.py` holds the mutants; `db.sh`)
  - the three sides of redact.ts and ADR 0070 before my edit: /tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi/merge2-work/

Staged against HEAD: 114 files, 7297 insertions and 2372 deletions, almost all of it #79's and #80's.

## Conflicts and how each was resolved

| File | Conflict | Resolution and why |
| --- | --- | --- |
| `packages/model-gateway/src/redact.ts` | One hunk: #75's widened `identifierPattern` (and `namePattern`) against #80's removal of both | Took #80's side. The file is now #80's 815 lines, byte for byte, followed by #75's whole screen section (`SCREEN_FLOORS` through `identifierRuns`, `screenedBytes`, `storedSeparators`, `runIndex`), byte for byte. The one exception is a doc comment (below). There is no duplicate top-level name. #75's widening is dropped because the function it widened no longer exists. Nothing in #75's code called `identifierPattern`; only its test and ADR 0070 named it. |
| `apps/web/src/components/uploads/uploader.tsx` | The kind select: #75's `KindField` against #79's class change to the inline select | Kept #75's `KindField`. It already carries #79's two changes (`max-w-full` on the select; the wrapper is `flex min-w-0 max-w-full flex-col gap-1`, a superset of #79's `flex max-w-full flex-col gap-1`). It also keeps the held files, the kind help, `aria-invalid`/`aria-describedby`/focus and the Upload/Clear group. #79's third change auto-merged: the file name is shown whole, `min-w-48 wrap-anywhere` with no hover title. The merged file is ours plus that span. The held list uses `break-all` in a `ul`, not a table cell, so #79's guard (`apps/web/src/app/tables.test.ts`) passes. |
| ADR 0054 | The status line, and both amendments appended at the end | The status line names both 2026-10-27 amendments: #80's ("the letter reader's redaction in one pass over one folded view") and then 0070 Part 3's. In the body, #80's amendment comes first, verbatim, then #75's, verbatim. Both are dated 2026-10-27, so the tie is broken by the order they reached the base: #80 first. One sentence is added to the end of #75's own amendment (below). |
| `docs/product/test-matrix.md` | MOD-12 (ours) against MOD-13 and MOD-14 (theirs) | All three rows, in ID order, word for word (each row's sha256 equals its side's). Both paragraphs under the table were already there. |
| `packages/synth/src/cases/matrix.ts` | The same rows | MOD-12's object is closed, then MOD-13's and MOD-14's objects follow, verbatim. `fixtures.test.ts` "holds every row of docs/product/test-matrix.md, word for word" passes. |
| `packages/synth/src/cases/registry.ts` | MOD-12's entry against MOD-13's and MOD-14's | MOD-12's entry, then MOD-13's and MOD-14's, verbatim. |

### Auto-merged files that both sides changed (checked by hand)

- `contracts/page.tsx` and `reconciliation/page.tsx` keep both sides:
  - #79's `ScrollTable`, `WholeDates` and min-widths;
  - #75's `aria-labelledby="upload-contract-title"` and every kind's content types.
- `functions/narrative.ts` keeps #80's `holdsNameOrNumber` matcher and #75's `Object.freeze` of the spec.

### Edits beyond the markers (needed to keep the tree true after the merge)

1. **`redact.test.ts`.** The property "agrees with the letter redaction's identifier pattern on every single-line, single-separator writing" fails on the merged tree: 1 failed, 28 passed. Its counterexample is `AAAA7.6`, a dot between two digits, which #80's matcher does not join. It is replaced by two tests (below), and the imports gain `datesIn` and `identifierCandidates`.
2. **ADR 0070 Part 3.**
   - N6 is rewritten. It said the letter's `identifierPattern` joined everything the screen joins, "so a letter is redacted of at least what the screen would find". It also said `identifierCandidates` "still drops a word with inner punctuation or a format character". Both are false after #80.
   - "Not caught" names U+2043 and the Hangul fillers, and says what the letter path reads.
   - The tokenizer bullet says `compactIdentifier` keeps the Hangul fillers.
   - The Tests line replaces "properties against `identifierPattern`".
   - The text is below.
3. **ADR 0054, #75's amendment, last bullet.** One sentence is added: "The contract screen does not tokenize through `identifierTokenRuns` (amendment of `co-001/redact-placeholders`, above): it streams its own runs (`someIdentifierRun`), which join differently, each path for its task (0070, Part 3, N6)." #80's amendment calls `identifierTokenRuns` "the one tokenizer", and next to #75's amendment that would read as covering the contract screen too. #80's own text is left verbatim.
4. **`redact.ts`, the `identifierTokenRuns` doc comment, comment only.** "the one tokenizer for …" becomes "the letter path's one tokenizer for … (the contract screen streams its own, someIdentifierRun below, which joins differently: docs/adr/0070 Part 3, N6)". The code is byte for byte #80's.

## What changed in meaning

- **The letter path is #80's, as decided in #80.**
  - It no longer joins digits over `.`, `/` or `_`, and it never joins `*`. The `*` and digit-dot joins were #75's widening from fix round F1.
  - So a letter that writes a member ID as `SYN*PCN*44551`, or a digits-only one as `1234.567890`, now sends it. `identifierCandidates` offers only `44551` of the first.
  - #80 records the digits-with-dot-or-slash case as a residual ("being how dates and amounts are written"). It does not record `*`.
  - This is the one place the merge loses something #75 had.
- **The contract screen is unchanged:** byte for byte #75's tokenizer, floors, index and cap.
- **What now holds between the two paths** (proved by the new tests, stated in N6):
  - **Both join:** nothing; one space; a dash or minus sign with at most one space beside it; invisible characters; a dot, slash or underscore next to a letter.
  - **Only the screen joins:**
    - a dot, slash or underscore between two digits;
    - `*` anywhere;
    - the practice's own stored separators;
    - more than three tokens (the letter's candidates stop at three).
  - **Only the letter path reads:**
    - two or more white-space characters, a tab or a line break;
    - two dashes, or a dash with two spaces beside it;
    - U+2043 HYPHEN BULLET;
    - `:`, `#`, `(` or `. ` next to a letter;
    - a lone combining mark (dropped as invisible);
    - a Hangul filler (read as a space);
    - an accented letter folded to its plain one.

    The screen finds each of these only when the practice's own value holds that separator. It never finds the tab, the line break, two spaces or a dash with two spaces.
- **Why they differ.**
  - The letter redaction rewrites the text the model reads. It must leave "150.00" an amount and "03/15/2027" a deadline, so it joins digits only over white space and dashes.
  - The screen never rewrites; it refuses. Joining digits over a dot or slash costs at most a false refusal, which "Measured: the false refusals" counts. Not joining would send an identifier written in groups.
  - The screen ends a run at column gaps, tabs, line breaks and other punctuation because a contract is tables. Wider joins would build runs from neighbouring cells that equal one of up to 50,000 kept identifiers by chance. The letter's matcher looks only for the one patient's own values, so its wider joins cost nothing the task reads.

## The new property (exactly what it holds)

`redact.test.ts`, describe "identifierRuns: the page runs the contract screen compares".

**1. The property.** "finds every single-line writing the letter path reads over the separators the screen joins, and the letter path reads exactly those with no "*" and no ".", "/" or "_" between two digits (property; docs/adr/0070 Part 3, N6)". 2,000 runs, a 60 s timeout, 5.2 s locally.

- **What is generated:** 1 to 4 groups of `[A-Z0-9abcz]`, joined by one separator each, drawn from every gap the screen's `JOIN` takes: `''`, a space, NBSP, `-`, ` - `, `–`, ` – `, `- `, ` -`, U+2212, ` U+2212 `, `.`, `/`, `_`, `*`, SHY, ZWSP, BOM, `-ZWSP`, `ZWSP.` and `_SHY`. Each writing gets the old prefixes and suffixes.
- **What is skipped:** compact forms outside 6 to 30 characters, and digits-only writings that `datesIn` reads as a separated calendar date. The latter is the letter's deadline rule, a separate case.
- **What is asserted, all together:**
  - (a) the screen finds the compact form in `identifierRuns` (`JOIN` alone, no stored separators);
  - (b) `holdsIdentifier` (#80's `matchesIn`) is true exactly when no gap holds `*` and no `.`, `/` or `_` gap lies between two digits;
  - (c) `identifierCandidates` (#80's `identifierTokenRuns` with `letterJoins`) offers it exactly when (b) holds, the writing spans at most 3 tokens and it holds a digit.
- **What it proves:** on the screen's own grammar, the screen finds at least every writing either letter reader finds, and the letter readers' gap is exactly the digits-with-`.`/`/`/`_` case and `*`.
- **Checks on the property itself:**
  - 60 seeds × 500 runs, 0 failures (76 s; `sweep.log`).
  - Seed 7 at 2,000 runs splits three ways: 1,189 found by all three; 566 by the matcher and the screen but not the candidates; 245 by the screen only. 893 were skipped by `fc.pre`. Every branch of the assertion is exercised.

**2. The table.** "pins each writing the letter path reads and the screen does not, unless the practice's own value holds its separator (docs/adr/0070 Part 3, N6)". 15 ms.

- **The 12 letter-only writings:**
  - `ZZ  1234567`, `ZZ\t1234567`, `ZZ\n1234567` and `ZZ-  1234567`;
  - `ZZ--1234567` and `ZZ⁃1234567`;
  - `ZZ:1234567`, `ZZ#1234567`, `ZZ(1234567` and `ZZ. 1234567`;
  - `1234<U+0301>567890` and `ZZ<U+3164>1234567`.
- **For each writing:**
  - `holdsIdentifier` is true;
  - the screen, given the plain stored value, is false;
  - the screen, given the value stored as written, finds it, except for the tab, the line break, two spaces and the dash with two spaces, which `storedSeparators` never adds.
- **The 5 screen-only writings:** `1234.567890`, `20261234/01`, `1234_567890`, `SYN*PCN*44551` and `123*4567890`. The screen finds each; `holdsIdentifier` finds none.

**Mutants.** Each was a temporary edit to redact.ts, restored and checked with `cmp`.

| Mutant | Result |
| --- | --- |
| M1: the screen's `JOIN` without `*` | both tests fail |
| M2: `letterJoins` takes `*` | the property fails |
| M3: #80's `GAP.number` takes `.` between digits | both fail |
| M4: the screen joins U+2043 | the table fails |
| M5: the screen joins neither `.`, `/` nor `_` | both fail |

## Regenerated files

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile --config.modules-cache-max-age=0` | exit 0. "Lockfile is up to date", "Already up to date". The base changed no manifest and no lockfile. |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | 535 lines, identical to HEAD's file. The base's had 533; the 2 extra lines are #75's own. Nothing new to stage: #79 kept its files off the screening import path. |
| `pnpm synth --all`, run 1 | 246 cases; 0 files written, 646 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. |
| `pnpm synth --all`, run 2 | the same, 0 written |

Nothing was regenerated by hand. `packages/db/functions/*.sql` are not touched by either side.

## Tests

Every run was under `flock /tmp/laneb-heavy.lock` with `PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin`, one at a time.

| Run | Totals |
| --- | --- |
| `vitest --project unit redact.test.ts` before the restatement (merged tree) | 1 failed, 28 passed (29); counterexample `[[["AAAA7",""],["6","."]],"",""]` (`redact-before.log`) |
| `redact.test.ts` after | 1 file, 30 passed (30) (`redact-after.log`) |
| Unit, narrow, in one run: model-gateway `redact.test.ts`, `redact.property.test.ts`, `functions/denial-letter.test.ts`, `functions/contract-terms.test.ts`, `functions/narrative.test.ts`, `gateway.test.ts`, `patient-records.test.ts`, `lint.test.ts`, `specs.test.ts`; web `components/uploads/uploader.test.tsx`, `lib/models/path.test.ts`, `app/tables.test.ts`; synth `fixtures.test.ts`, `index.test.ts` | 14 files passed (14); 368 tests passed (368); 18.6 s (`unit-narrow.log`). The 16 MiB bound lines printed 894 ms (prose), 1,415 ms (dense) and 53 ms for the largest admitted U+FDFA request. |
| Golden: `vitest --project golden packages/model-gateway/eval/gate.golden.test.ts` | 1 file, 57 passed (57); 31.5 s (`golden.log`) |
| Db, on a fresh database `phi_merge2_db` at localhost:5433 (44 migrations applied, dropped after): `apps/web/src/lib/models/path.db.test.ts`, `routes/models-routes.db.test.ts`, `routes/uploads.db.test.ts`, model-gateway `patient-records.db.test.ts` and `gateway.db.test.ts`, `apps/worker/src/packets/letter-records.db.test.ts` | 6 files passed (6); 70 tests passed (70); 21.6 s (`db.log`) |
| `pnpm typecheck` | passed, 22 projects, 40.9 s wall; model-gateway, worker, synth and web were rechecked (`typecheck.log`) |
| ESLint `--max-warnings=0` on redact.ts, redact.test.ts, uploader.tsx, matrix.ts, registry.ts, the two pages and narrative.ts | exit 0 (`eslint.log`) |
| Seeded sweep of the new property (tsx, outside vitest) | 60 seeds × 500 runs, 0 failed (`sweep.log`) |
| Mutants M1 to M5 against the two new tests | every one killed (`mutant-*.log`) |

## What ADR 0070 Part 3 must now say (written into the staged ADR; the check part should review it)

- **N6:** rewritten as described under "What changed in meaning":
  - #80's matcher and tokenizer replace `identifierPattern`;
  - the three lists (both join, only the screen, only the letter path), each with its reason: the letter's redaction against the screen's refusal, and a contract's tables against a letter's one patient;
  - the test that holds them;
  - "A letter is therefore no longer redacted of everything the screen would find".
- **"What it gives up", "Not caught", first bullet:**
  - U+2043 HYPHEN BULLET added to the characters that split an identifier;
  - "or holding a Hangul filler (U+115F, U+1160, U+3164 or U+FFA0), which is a letter by class, so the run keeps it and equals no stored value";
  - which of these the letter path reads: the white space, the dashes, U+2043, the mark and the filler, and a colon, a hash, an opening parenthesis, a dot or a slash next to a letter, but no comma or plus sign.
- **The tokenizer bullet:** `compactIdentifier` drops the invisible characters "(all but the Hangul fillers, which are letters by class: 'Not caught')".
- **Tests:** "a property against the letter path (`holdsIdentifier` and `identifierCandidates`, N6), a table of the writings only the letter path reads, and a property for whole tokens".

## For the check part: open points (none fixed here, by the rule that the screen section is kept whole)

1. **The `*` regression on the letter path.** The letter path no longer joins `*`, and no longer joins `.`, `/` or `_` between digits.
   - #80 records the dot and slash case; ADR 0054's residuals do not list `*`.
   - Two options: record `*` there, or add `*` to #80's near-letter class (`GAP.numberNearLetter`, `letterJoins`) in a follow-up. The follow-up must measure first: #80's property tests and the amounts rule.
2. **Two writings the screen misses that a PDF can produce, and that the letter path now reads.**
   - The first is U+2043. #80 says PDF text writes it for a hyphen, and contracts are PDFs.
   - The second is a Hangul filler inside an identifier.
   - Candidate fixes for the screen, each needing set v2's false-refusal measurement:
     - U+2043 in `JOIN`'s dash class (and `storedSeparators`);
     - the fillers read as a space before tokenizing, as #80's `BLANK` does.
   - The `INVISIBLE` comment in redact.ts says default-ignorable characters "stay token boundaries" and that compactIdentifier drops them. That is untrue of the fillers, which are letters by class. The comment is left as #75 wrote it, and the ADR now says so.
3. **The ADR 0054 order.** The two same-day amendments are ordered #80 then #75, by merge order. Reorder them if the founder reads "date order" as the order the pull requests were opened.
4. **The merge commit.** When the check part commits, a message in the branch's pattern would be: "Merge claude/build-platform (a6e754fc: #80 redact-placeholders, #79 ux-table-scroll) into co-001/contract-phi-check", plus the two attribution lines.
