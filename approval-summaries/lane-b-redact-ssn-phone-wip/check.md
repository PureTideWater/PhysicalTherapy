# redact-ssn-phone: check round 2

Branch `co-001/redact-ssn-phone` (/home/user/redact-ssn-phone). Started at 6a8cff99; final HEAD **10b48fb3** (10b48fb3b594fea92abaf7a82dd51258c1596875). The base is now f185655c, and the merge base is f185655c too. Seven new commits (one merge and six), none pushed. The tree is clean. 19 commits since the base, and each ends with exactly the two required trailer lines. Progress log: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/progress/check.md. Against f185655c the branch changes no migration, workflow, lockfile, engine, money or ledger file, and no added line holds a model identifier. Every number is a synthetic twin.

## Commits
| Commit | Finding | What changed | Fail-first evidence |
|---|---|---|---|
| 4dc9a110 | 1 | Merged claude/build-platform f185655c (#121). I resolved two append-at-end conflicts by hand, base first. ADR 0054's Status line takes the packet-day-counts (ADR 0086) amendment, then this branch's. The file keeps the 2026-10-28 amendment before the 2026-11-04 one. reconciliation-001 keeps the base's P4 and findings-transport paragraphs before the "Ruled by" paragraph. `pnpm install --frozen-lockfile --offline` was up to date. | n/a |
| be3b35e6 | 4 | Twins that read as no real phone, with each row asserting what it did before. R5-4 is `Medicare 2025550142` and still gives `[PHONE]` (not NPI-valid). The NPI twin 2345678900 becomes 2340178906: Luhn-valid like it, with an exchange starting 0. The ICN twin 12345678901 becomes 10012345678 (area 001) in redact.test.ts and in denial-letter rows I1 and "an ICN". A scan of the added lines finds no other NANP-valid number outside 555-01xx. | Tests only: 389 passed. |
| ef901af6 | 2 | `wholeRanges` in the scan. A date span or unsigned amount stays a barrier when each side is either free or joined by one or two dashes only to another such span whose own far side is free. Linear: one pass by start, one by end. A range joined to a further group is still no barrier (`Seen 10/01/2026-10/15/2026-0123` and `Ref 12.34-56.78-901` are refused), and so are A3's rows (`SSN 900-12-03-56`, `SSN 900-12-34.56`). MOD-16 gets a new generator writer (keptSegment case 17): hyphen- and en-dash-joined date ranges in six forms (slashed, unpadded, ISO, dashed, two-digit year, dotted) and unsigned amount ranges in three. | **19 failed / 429 passed** on 4dc9a110+be3b35e6. The failures: D15-D23, K5-K7, six no-refusal rows, and the MOD-16 kept-letter property (counterexample `Service 01/01/2020-01/02/2020`). D24 (two-digit years) and the two refusal guards pass before and after. After the fix: 3 files, 481 passed. |
| 26aa9ff5 | 3 | `decideNamed`, used by the matcher's bare decision and by the scan's keep-noun barrier. Take a number whose own words decide nothing and that follows another number, a match already found or a placeholder, with only a list joiner between (`,`, `and`, `or`, `&`, or a comma plus one of them). It is kept when the list's first number that its words decide is kept. A label in the list, another word, a line break or a sentence end ends the list. A list after an SSN or phone label is no keep. The list is followed back 16 numbers at most. MOD-16's keep-noun writer adds a listed second number to a third of its segments. Three 100 kB time rows were added: date ranges, amount ranges, and one long list. | **5 failed / 452 passed** before: R5-27 to R5-30 and the MOD-16 property (`Reference no.: 000000000 and 2000000000`). R5-36 (`Claim SYNCLAIM0001 and 900123457`, after the call's own claim) was `[SSN]` before. Guards R5-31 to R5-35 pass before and after. After: 3 files, 491 passed. Time: a 100 kB list takes 0.8 s and a 400 kB list 3.3 s (linear). |
| bf12d736 + 10b48fb3 | 6 (corr-ssn-2) | New test in redact.test.ts. It counts `RegExp.prototype.exec` runs (spied) while it redacts and checks a short letter, then the same letter with one ZWSP added, and requires `once * 100 < twice * 90`. 10b48fb3 replaced a float literal that `pnpm lint`'s money rule refused. | The fix was taken out in a copy (both readings for every letter, in the patterns and the scan): **fails** with 1,150 runs against 1,176 (115,000 is not below 105,840). At HEAD it passes (about 83 in 100). Counts are deterministic, so the test cannot flake the way a time budget would. |
| 11f0ee29 | 2, 3, 5 (docs) | ADR 0054 amendment: list naming (labels bullet), range barriers (self-check bullet), the time paragraph, and the tests paragraph (the count test and the twins). A new bullet, "Where the build departs from the design, and why", records departure 1 (the N6 oracle and why it is not generator-side) and departure 2 (a spaced dash counts as white space, with `Paid 150.00 - 2026 total` sent and `Call 202.555 - 0123` refused). Two new residuals: a number written as two dates or two amounts joined by a dash is read as a range, and a person's bare number in a keep-noun's list is kept. The self-check bullet and the residual paragraph are rewrapped, which removes round 1's 172-character line. MOD-16's title now names ranges and lists, word for word in test-matrix.md and matrix.ts. fixtures/synthetic/MOD-16/expected.json was regenerated. | n/a |

## Findings
1. **Base moved.** Merged in 4dc9a110. HEAD now descends from f185655c, and the full suite below ran on the merged HEAD.
2. **Hyphen-joined dates and amounts.** Fixed in ef901af6, failing first. All ten probe rows are now sent unchanged: the eight date rows, `Billed 150.00-120.00 allowed.` and `Range 123.45-67.89.`. The en-dash form and the spaced forms are sent too.
3. **List after a keep-noun.** Fixed in 26aa9ff5, failing first, rather than recorded as a departure. `Claim number(s) 900123456 and 900123457.` and `Reference numbers 2025550123, 2025550124.` are sent unchanged. The safety cost is recorded in ADR 0054 as a residual: a person's bare nine or ten inside a claims list is kept, as the keep-noun keeps the first.
4. **Twins.** Fixed in be3b35e6.
5. **Departures 1 and 2.** Recorded with reasons in ADR 0054 (11f0ee29).
6. **Fail-first.**
   - corr-ssn-2 now has a deterministic test that fails with the fix taken out (bf12d736, 10b48fb3).
   - **corr-ssn-3 still needs the reviewer's explicit acceptance.** It found tests that were missing for a guard that already existed (the currency guard), so no fix exists to fail against. Its proof is mutant M4: with the currency-guard clause removed, 6 tests fail (K-c1 to K-c5 and the MOD-16 property). Writing a failing test would mean breaking the guard on purpose.
   - **Also flagged:** R5-36's fail-first was shown by a probe, not a test run: the rule's first version, without the found-match item, gave `[SSN]`, and so did the parent commit, which has no list rule at all.

## Re-probed at 11f0ee29 (rule code identical at 10b48fb3)
- **Redacted, as the critic found:** `1 (202) 555-0147 ext. 22`, the wrapped `SSN 900 - 34 -\n   5678`, `202·555·0188`, `SSN#900554321`, `Phone:2025550119,SSN:900-33-1212;`, `202.555.0175x301`, the non-breaking-hyphen SSN, the full-width phone, `Medicare 9001234567` (as `[PHONE]`), and the HICN forms.
- **Kept:** amounts, ISO and slashed dates, NPI, TIN, ICN, check, EFT, trace, ZIP+4, CARC, HCPCS, `CPT 97110-GP` and `Tax identification number 900123457`.
- **Ranges and lists:** the spaced ranges and `11/01/26-11/15/26` are sent. A3's rows are refused, with the fixed sentence that names no number.

## Seed sweep (extra)
redact.property.test.ts, every property, seeds 20261106 + 7919·i for i < 8, on the code of 26aa9ff5: **8/8 passed** (69 passed and 2 skipped each).

## Full local suite, once, on HEAD 10b48fb3 (each step under /tmp/laneb-heavy.lock)
An earlier start on 11f0ee29 stopped at `pnpm lint`: one error, the float literal 0.9 at redact.test.ts:608. typecheck, lint:logs and lint:copy had passed. I fixed it in 10b48fb3 and reran every step on that commit.

| Step | Result |
|---|---|
| pnpm typecheck | passed, 22 projects |
| pnpm lint | passed, 1,822 files in 3 groups, 0 errors, 0 warnings |
| pnpm lint:logs | 1,153 files, ok |
| pnpm lint:copy | 584 files, ok |
| pnpm test (unit) | **461 files passed; 9,621 passed, 4 skipped (9,625)**, first run, no flake |
| pnpm test:golden | 381 passed |
| pnpm test:oracle | pyx12 4.0.0 agrees with all 689 (678 valid, 11 malformed rejected); edi835 agrees on every segment |
| pnpm --filter @tp/model-gateway eval | gate passed; narratives 300/300 without a critical error |
| pnpm synth --all | 312 cases: 0 written, 713 unchanged, 0 removed; 8 EMR: 0 written, 16 unchanged; git status empty |
| watched.ts --write | 568 lines; git status empty |
| pnpm test:db, 4 shards on fresh migrated ssn_check2_db1..4 (5433), each dropped after | 3,297 + 1 skipped / 2,773 / 2,760 / 984: **9,814 passed, 1 skipped**; 145 files, exactly the 145 tracked `*.db.test.ts` |
| tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform | diffed from f185655c; money, pricing, ledger and packets not affected; shards: none. So no shard runs, and the gate's verdict is "no mutation run". |
| tools/engine-freeze/check.ts f185655c (merge base) | nothing let through (the exception is stale and ignored); no problems |
| pnpm check:fixtures | 342 guard files, 4,150 searched, ok |
| pnpm verify-content | every content set passes |
| pnpm build, BUILD_COMMIT stamped | exit 0; stamped 10b48fb3b594fea92abaf7a82dd51258c1596875 |
| E2E_PREBUILT=1 pnpm test:e2e --workers=2 (E2E_DATABASE=ssn_check2_e2e, E2E_PORT=3194) | **81 passed** (15.1 m); database dropped |
| gitleaks git --log-opts="origin/claude/build-platform..HEAD" | 18 commits scanned (the merge commit adds no content of its own), no leaks |
| pre-push hook standalone (remote sha f185655c, pinned gitleaks 8.24.3) | exit 0: 4 commits checked (the hook's own selection against the given remote sha), 0 fixture files, 9 text files, no secret |

**Steps rerun:** all of them. The merge changed the base under every earlier total, so none of round 1's totals stand for this HEAD.

## Residuals and open items
- **corr-ssn-3 needs the reviewer's explicit acceptance** (finding 6 above).
- **New recorded residuals (ADR 0054):**
  - A number written as two whole dates or two amounts joined by a dash is read as a range (`9-1-26-1-23-45`). No SSN or phone shape is one.
  - A person's bare nine or ten in a list a keep-noun names (`Claims 900123456 and 900551234`) is kept.
- **Conservative edges (refused, never sent):**
  - A list item glued to letters (`Claim SYN123 and 900123457`, when that is not the call's own claim) ends the list, so the later number is redacted.
  - A range joined to a further group is refused.
- Not pushed. No ssn_check2 database is left.
