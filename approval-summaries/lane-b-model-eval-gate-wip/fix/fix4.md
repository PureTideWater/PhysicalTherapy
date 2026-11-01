# fix4: MOD-13, a claim number written like a date was kept as a date (PR #75)

Worktree /home/user/contract-phi-check, branch co-001/contract-phi-check. Started from 7cd60740 (check5's merge and docs commits, already saved on origin/co-001/wip-contract-phi-check-6), tree clean. Nothing pushed, rebased or forced. Every heavy step ran under flock /tmp/laneb-heavy.lock with node24. Progress and logs are in /tmp/claude-0/sp/phi/progress/ (fix4.md and fix4-*.log).

## Commit (local only)
- 3a033b32 "model-gateway: a written date needs a plausible year, so a claim number written like a date is redacted (MOD-13, seed 1162287068)". 4 files, +101/-43. The body covers the cause, the rule, each place changed, the tests and the docs, and ends with the Co-Authored-By and Claude-Session lines.

## Reproduction (before the fix)
- I ran a scratch copy of redact.property.test.ts with `{ numRuns: 400, seed: 1162287068 }` (deleted afterwards).
- It printed "Property failed after 186 tests", path 185:0:…:8.
- The shrunk counterexample is claim number 00000101 written "0000-01-01". The letter "Claim 0000-01-01; Dear CLAIM CLAIM," was sent as "[PATIENT_NAME] 0000-01-01; …", so the claim number reached the model unredacted.
- Cause: years() accepted any four digits as a year, and iso() turned them into "0000-01-01". The value then counted as a separated date with a calendar reading that is not a date of birth, so it was kept.
- Why the test only failed on some seeds: the test's own oracle builds dates with Date.UTC, which maps years 0 to 99 onto 1900 to 1999. So the oracle read "0023-04-26" as no date and expected redaction. Years from 100 to 1899 and from 2100 up were kept by both the oracle and the code, so the test never caught those.

## The rule and why
- A four-digit written year counts as a year only from 1900 to 2099. The bounds are `EARLIEST_WRITTEN_YEAR` and `LATEST_WRITTEN_YEAR`, exported from packages/model-gateway/src/redact.ts.
- Why this range:
  - It covers every date the product handles: dates of birth (synthetic records start at 1930), dates of service and remittance dates.
  - It is exactly the range a two-digit year already reads in (19xx or 20xx).
  - It is the bound the contract screen's `isCompactCalendarDate` already used in the same file.
  - packages/rules isIsoDate also starts at 1900.
- No year constant is shared in edi835 or synth to reuse, so this pair is now the single source for both redact.ts paths.

## Each place changed or checked
- **`years()`** returns no year for four digits outside the range. Everything that decides on a date goes through it, so none of these paths keeps "0023-04-26", "0000-01-01" or "2100-04-26" any more:
  - `readings()` and `datesIn()`;
  - in `matchesIn`, the `otherDates` keep-as-date path, which feeds both the name exemption and the dashed-number exemption;
  - `datesIn`'s rule that hides a shorter span.
- **`isCompactCalendarDate`** (the contract screen's `screenIdentifier` dropDates and `SCREEN_FLOORS` path) now uses the same `plausibleYear`. Its behaviour is unchanged (it was already 1900 to 2099); there is now one source for the bound. `identifierRuns` and `someIdentifierRun` keep nothing because it reads as a date (the page side has no date rule), so no change was needed there.
- **A labeled date of birth** ("DOB 0023-04-26") is still replaced because of its label.
- **figures.ts `readDate`** matches model figures. It does not keep or drop PHI, and it already floors years at 1900 through rules' isIsoDate. Not changed.
- **"0001/02/03":** a slash or period between digits is never part of a claim number's written form (ADR 0054, by design: `150.00`, `12/34/5678`). So this value is not kept because it reads as a date; it simply never matches the claim. That is an existing recorded residual, not this bug. Listed under Proposals.

## Tests (packages/model-gateway/src/redact.property.test.ts)
- **The property:** MOD-13's first property is now a named const, `sendsNoIdentifier`. It runs as before with 400 runs.
- **Fixed-seed regression:** the same property runs again with `seed: 1162287068` (`YEAR_BELOW_1900_SEED`, 400 runs).
- **Plain synthetic examples.** These are replaced by their claim placeholders:
  - 00230426 written "0023-04-26" and "0023–04–26";
  - 00010203 written "0001-02-03";
  - 21000426 written "2100−04−26".
- **Kept as before:**
  - datesIn gives no reading for 0023-04-26, 0023/04/26, 0023.04.26, 0001/02/03 or 2100-04-26;
  - "2026-04-26", "April 26, 2027" and "4/26/26" are kept;
  - a 1955-07-14 date of birth becomes [DATE_OF_BIRTH] in all 13 written forms (the 8 dateForms, spaced, YYYYMMDD, MMDDYYYY and MMDDYY);
  - "DOB 0023-04-26" becomes [DATE_OF_BIRTH];
  - holdsIdentifier finds the claim number.
- **Oracle change:** the test's independent oracle, `separatedDateReadings`, now also reads a four-digit year only from 1900 to 2099, written as literals rather than the shared constant, so it stays independent. The property therefore now requires redaction for years outside that range instead of excusing them.
- **The tests fail without the fix:** with the old redact.ts (plus only the two constants), 4 of 7 fail, including the seed regression ("Property failed after 186 tests", seed 1162287068) and the examples. With the fix, 7 of 7 pass.

| Run | Result |
|---|---|
| redact.property.test.ts, numRuns raised tenfold (4000 / 2000) in a scratch copy | 7 of 7 passed, 141 s |
| redact.property.test.ts run 50 times on random seeds | 50 passed, 0 failed |
| model-gateway unit (vitest --project unit) | 27 files, 557 passed |
| pnpm --filter @tp/model-gateway eval | gate: passed; narratives 300 of 300 without a critical error |
| pnpm typecheck | passed, 22 projects |
| pnpm lint | passed, 1,679 files in 3 groups, 0 errors, 0 warnings |
| pnpm lint:logs | 1086 files scanned, ok |
| pnpm lint:copy / pnpm verify-content | 537 files ok / every content set passes |
| pnpm test (whole unit) | 406 files passed; 6937 passed, 4 skipped (6941) |
| pnpm synth --all | 259 cases: 0 written, 659 unchanged, 0 removed; 8 EMR: 0 written, 16 unchanged |

- **The first pnpm test run had one failure.** packages/synth/src/fixtures.test.ts, "holds every row of docs/product/test-matrix.md, word for word", failed because I had reworded the MOD-13 row and the synth cases/matrix.ts mirror no longer matched.
- **I reverted that row edit rather than edit the shared matrix.ts.** Why:
  - the row's "a calendar date with its separators" still holds now that ADR 0054 defines a calendar reading as needing the 1900 to 2099 year;
  - test-matrix.md and matrix.ts are shared with #42, #83 and #85, and leaving them alone avoids new conflicts there.
- **The rerun:** the result in the table above is the rerun (406 files, all passed). The other steps ran on the tree before the revert, which differed only in that docs row. watched-paths.txt is unaffected because no file was added.

## Docs
- **ADR 0054** (the date rule of the letter reader's redaction):
  - A calendar reading now needs a four-digit year from 1900 to 2099. The ADR names the constants and gives two examples: 0023-04-26 (claim number 00230426) and 2100-04-26 (21000426) are replaced. It notes that isCompactCalendarDate uses the same bound.
  - The residual "a real calendar date written with dashes … is sent" now says "(a year from 1900 to 2099)".
- **ADR 0070 Part 3, "Where the build departs from the design" item 2 (the date rule's years):** the bound is now one pair of constants shared with the letter reader. The item records the MOD-13 gap, seed 1162287068 and the date of the change, and points to ADR 0054.
- **docs/product/test-matrix.md:** unchanged, because its wording still holds (see above).

## Secrets and hook
- `/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git --log-opts="871faff9..HEAD" --no-banner`: 27 commits scanned, no leaks found.
- I ran the pre-push hook standalone, with a stdin ref line whose remote sha is 871faff9 and the pinned GITLEAKS.
  - It printed: "1 commit checked: 0 file(s) read by the fixture guard, 4 text file(s) searched for an X12 header, and gitleaks found no secret." Exit 0.
  - It checked one commit because 584f5218 and 7cd60740 are already on origin/co-001/wip-contract-phi-check-6.
- Tree clean at HEAD 3a033b32.

## Proposals (not built here)
- **Digits with slashes or periods.** A digits-only claim number or member ID written with slashes or periods between digits ("0001/02/03" for 00010203, "1234.5678") is never matched, by ADR 0054's design (such digits are dates and amounts). This is a recorded residual and has nothing to do with the year rule. If the founder wants it closed, a digits-only identifier could also match across "/" and "." when the written value has no calendar reading under the new bound and is not an amount with cents. That needs its own design pass for false positives on dates and amounts.
- **A date of birth on record before 1900.** If records ever hold one (impossible for a living patient, and production supplies no datesOfBirth yet), a written form of it would only be caught by a birth label. If records ever feed datesOfBirth, the loader could refuse a date outside 1900 to 2099 rather than pass it on.

# Fix 4 follow-up: review findings F4-1 and F4-2 (2026-11-01, resumed run)

Commit cf61a828 on 3a033b32 in /home/user/contract-phi-check. Not pushed. Tree clean.

## The findings, rechecked
- **F4-1 (minor), confirmed.** A scratch tsx probe at 3a033b32 reproduced every example:
  - "Claim 0023_04_26", "0023|04|26", "0023\04\26", "1234_5678", "1234|5678" and "1234\5678" came out unchanged, and holdsIdentifier returned false.
  - "Member 0023_04_26" and "0023|04|26" came out unchanged.
  - Cause: NUMBER_JOINERS held only white space, dashes and U+00AD, while DATE_SEPARATOR holds `\ _ |`.
- **F4-2 (nit), confirmed.**
  - "Claim Jan 31-2026" and "Jan-31-2026" (claim 312026) came out unchanged.
  - "Claim 1999-1<ZWSP>2-31" (claim 19991) came out unchanged.
  - The reviewers' proposed test ("the match covers every digit of the span") would not close the month-word case, because "Jan" holds no digit. So the fix tests the match's own written form instead.

## Fix (packages/model-gateway/src/redact.ts)
- **NUMBER_JOINERS** now holds `_`, `|` and `\`, which join a member ID or claim number anywhere. numberNearLetter keeps `. / : # (` next to a letter.
- **letterJoins** (identifierCandidates, the letter's other-patient screen) joins `_`, `|` and `\` anywhere too, so it reads what the redaction reads. The MOD-14 property failed without this ("ZZ|00000").
- **The keep-as-date test.** `DASHED.test(match[0])` is replaced by `writtenAsDate(normal, range)`. A digits-only match stays only when:
  - its own NFKC range, read alone with invisible characters dropped or read as spaces, is one whole separated date with a calendar reading, and
  - it still lies in a date that is not a date of birth.
- **What still stays a date:** a real date written with dashes, `_`, `|` or `\`, and a date written across an invisible character ("1999-1<ZWSP>2-31" for claim 19991231).

## Tests (written first; 4 of 8 in redact.property.test.ts failed at 3a033b32)
- **New example test:** every reviewer example, plus member forms, real dates with `_ | \` kept, and dates of birth with `_` and `|` replaced.
- **Property changes:** the number writers join with `_`, `|` and `\`, and the date oracle `separatedDateReadings` splits on `\ _ |` too.
  - With those changes, the main property, the seed-1162287068 regression and MOD-14 failed at 3a033b32 (counterexamples "YY000_00", "00000_0", "ZZ|00000").
- **redact.test.ts N6 pins** (the difference between the letter path and the contract screen):
  - The property now reads "no `*` and no `.` or `/` between two digits".
  - "1234_567890" left the screen-only list, which now holds 4 writings.
  - "ZZ|1234567", "1234|567890" and "1234\567890" joined the letter-only table.

| Run | Result |
|---|---|
| redact.property.test.ts + redact.test.ts | 38 passed |
| the same, 20 times on random seeds | 20 passed, 0 failed |
| model-gateway unit (vitest --project unit packages/model-gateway) | 27 files, 558 passed |
| pnpm --filter @tp/model-gateway eval | gate: passed; narratives 300 of 300 without a critical error |
| pnpm typecheck | passed, 22 projects |
| pnpm lint | passed, 1,679 files, 0 errors, 0 warnings |
| pnpm lint:logs / verify-content | 1086 files ok / every content set passes |
| pnpm test | 406 files passed; 6938 passed, 4 skipped |
| gitleaks 3a033b32..HEAD | no leaks found |

## Docs
- **ADR 0054:**
  - Numbers now join over `_ | \` anywhere.
  - The keep-as-date rule now requires the match's own written form to be the whole date, with both F4-2 examples.
  - The residual now reads "written with dashes, `_`, `|` or `\`".
- **ADR 0070 Part 3 N6:**
  - Both paths join `_` anywhere.
  - Only the screen joins `.` and `/` between digits.
  - The letter path joins `|` and `\` anywhere.
  - The pin table now lists 4 screen-only writings.
- **test-matrix.md and synth matrix.ts:** untouched (shared with #42, #83 and #85).

## Proposals (not built here)
- **The contract screen does not join `|` or `\`.** Its JOIN still rejects `|` and `\` between tokens unless the practice's own values hold them. This is recorded in ADR 0070, with the false-refusal cost on fee-schedule tables. Whether to widen it is a separate decision.
- **Letter tables.** A letter with a table written using `|` could join two adjacent cells into a patient's claim number by chance ("| 1234 | 5678 |" for claim 12345678). That is a possible over-redaction only, never a leak, and white space already joins the same way.
