# PR 6b-1 (#35): ZIP+4 localities in the pricing engine
Verified from a fresh clone at e50c310, 2026-10-22. Verdict: pass. Every CI check is green, and nothing found blocks the merge.

## What it changes, and why
- The problem. Some ZIP codes cross two Medicare payment areas, called localities. For those ZIPs Medicare needs the nine-digit ZIP (the ZIP+4) to know which rate applies. Today the engine stops every such line with "needs ZIP+4".
- The fix. The engine now looks the ZIP+4 up in CMS's ZIP9 file and prices the line at the right locality. This is the one engine change your ruling of 2026-10-18 allows. Five-digit ZIPs price exactly as before.
- It never guesses. If the ZIP+4 file is missing, the line stops as a gap in our content. If the ZIP+4 is not in the file, the line stops. It never borrows a neighbouring area's rate.
- Also in the PR: a new rule record type for the ZIP9 ranges (your Q3 (a)); four new golden claims, G196-G199 (your Q4 (a)); a freeze checker that runs on every PR; and a fix that makes mutation testing measure the money code again. Before the fix it measured nothing.

## What proves it (CI on e50c310, all green)
- Engine diff: exactly the five allowed files (95 lines added, 14 removed). The freeze checker finds no problems. Run under another PR's number, the same check fails, as it should.
- Old engine against new: they agree on all 150 existing golden claims (326 lines) and on 20,000 random five-digit claims (18,885 priced lines, 49,978 stopped lines). The test ran in CI; it did not skip.
- Golden lines: the engine matches the independent Python worksheet on 154 claims and 330 lines. No existing golden file changed, and test releases 900001-900005 are byte-identical.
- Other tests: unit tests 4,211 passed, 1 skipped (actionlint is not installed on the CI runner); parser oracle 630 of 630 agree; database tests 8,776 passed, 1 skipped (the restore drill, because of a tool version mismatch); browser tests 49 passed; the build passed.
- Mutation testing: the canary scored 100%. Every one of its mutants was killed, which shows the test runner works. The money code scored 89.49% against a pass mark of 85; pricing alone scored 90.02%.
- Capacity run: pass. Timing limits are not enforced until 6b-3.
- What it leaves alone: no database migration, nothing in the app, and the domain model, approvals and content releases are untouched.

## What it does not do yet
No customer sees any change: nothing in the app sends a ZIP+4 yet. PR 6b-2 connects it. It records each practice's location and ZIP+4 at onboarding, adds the ZIP+4 to the screening, and adds the database rule that lets the new record type load.

## Open items
1. O1, the ZIP9 file layout. It comes from a third-party copy, because CMS's own document could not be reached. Confirm it against CMS's layout before any real ZIP9 data loads. Until then the parser refuses any line it could misread.
2. Q37, for the specialist: what to do with a ZIP+4 the file does not list. Until it is answered, the engine stops the line and does not guess.
3. PR 5's trigger on rule_release_withdrawal. It breaks the freeze rules, and it is recorded as waiting for your ruling, not as approved. You can accept it as an exception, or decline it and a later PR removes it.
4. GitHub settings, yours to set: make mutation a required check, and set up the rulesets and code-owner review that ADR 0063 describes. Until you do, nothing on GitHub requires your review of exception.json.
5. Also flagged in the PR: the review split "ZIP+4 not found" into two separate stops, which changes design section 8 (e). The PR asks you or the design owner to confirm that.
