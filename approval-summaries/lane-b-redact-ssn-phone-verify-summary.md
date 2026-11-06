# PR #127 fresh-clone verification

**Verdict: FAIL.** The description must change. The code, the tests, the boundaries and CI all pass on head d333d70dc5c2fe6422d6d6a45952288b95465bbc. Two statements in the PR description are wrong: one is stale and one is false. Nothing in the branch needs to change.

## What must change (the PR description only)
1. **The Checks section is stale.**
   - It says "CI on c9641eda: pending" and "The branch was pushed at c9641eda".
   - Its last local table is "on c9641eda".
   - The head is now d333d70d, a merge of claude/build-platform 0f4a5ed5 (#125, Cognito's code emails). The description does not mention that merge anywhere.
   - What to write instead: name d333d70d and say it merged 0f4a5ed5 with no conflict, in the three shared files (test-matrix.md, matrix.ts, registry.ts). Set the CI line to d333d70d's results: all 21 check runs completed, with no failure (listed below).
2. **One false claim.** The paragraph "Refused by the survivor scan, never sent" lists "a list item glued to letters that is not the call's own claim". That number is not refused; it is redacted.
   - Probe at head: `Claim SYN123 and 900123457` gives `Claim SYN123 and [SSN]` and is not refused.
   - check.md says the same ("ends the list, so the later number is redacted").
   - The fix: move that item out of the refused list, for example "redacted as [SSN], since letters end the list". ADR 0054 does not make this claim.

## Should correct (not blocking): fail-first counts in the review table
Every fix commit still fails first, and every one passes at its own commit. Some counts in the table are inexact. I ran each commit's three model-gateway test files with the redact.ts of its parent.

| Commit | Claimed | Found |
|---|---|---|
| 881a3fd6 (SEC-2) | "4 tests failed" | 5: three named SEC-2 rows and two MOD-15 properties |
| 93ce734c (SEC-3) | 19 | 19 |
| 7029ae14 (SEC-6) | "6 tests failed" | 7 |
| 6b1a5060 (corr-ssn-4) | R5-15a, R5-15b and the MOD-16 property | 3 failed, the same tests |
| ef901af6 (finding 2) | "19 failed / 429 passed" | 19 failed / 462 passed of 481; 481 passed after |
| 26aa9ff5 (finding 3) | "5 failed / 452 passed before, 491 after" | 6 failed / 488 passed before, 494 after |

On 26aa9ff5, the sixth failure is R5-36. So R5-36's fail-first is shown by a test run on the parent, not only by a probe. That is stronger than the description says.

corr-ssn-2's count test, run at head against redact.ts from before a79d731a (5cd823b4), **fails**: 1148 runs against 1174 (114800 is not below 105660). The description cites 1,150 against 1,176 from a different copy with the fix removed. The direction is confirmed.

## Step 1: the clone
- Location: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/verify-clone, a fresh clone of github.com/PureTideWater/PhysicalTherapy.
- HEAD is d333d70dc5c2fe6422d6d6a45952288b95465bbc, detached. It equals origin/co-001/redact-ssn-phone and `git ls-remote`.
- The base is 0f4a5ed53afb5a6d244086d96e9ec4a80afd0adb, and it is the merge base.
- `pnpm install --frozen-lockfile` passed. The tree is clean after every step.

## Step 2: the description's claims against the clone
**Patterns.** I wrote a scratch tsx probe outside the repository (/tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/vscripts/probe.ts, probe2.ts and probe3.ts). It imports the head's redact.ts and the base's redact.ts (copied to vscripts/base). There are 94 rows plus 31 more on residuals and the screen.

- **SSN forms are redacted at head, and none at base:**
  - 3-2-4; masks `XXX`, `***`, `###`, `___` and `SSN *****3456`;
  - a bare nine (`member [SSN]`); HICN `900123456A` and `Medicare no. 900-12-3456-A`;
  - spaced dashes; a wrapped group; FF gaps; `SSN#900554321`; full-width and Arabic-Indic digits;
  - non-breaking hyphens; `900 - 34 -⏎ 5678`; `900_12_3456`; `Line 000 02 1500` gives `Line [SSN]`.
- **Phone forms are redacted at head, and none at base:**
  - `(202) 555-0147`, `202 555 0147`, `202.555.0175`, `1 (202) 555-0147 ext. 22`, `202.555.0175x301`;
  - `+2025550147`, `+1 202 555 0147`, a bare ten, `Phone 12025550119`, the local `Phone 555-0100`;
  - `202·555·0188`, `Tel202-555-0123`, `(202)555-0123`;
  - `Phone:2025550119,SSN:900-33-1212;` gives `Phone:[PHONE],SSN:[SSN];`;
  - the ZWSP-after-date row; `Medicare 9001234567` and `Medicare 2025550142` give `[PHONE]`;
  - Arabic-Indic and Devanagari phones; `Tel …;Fax …`; a comma list with no space.
- **Must-stay classes are sent unchanged and not refused:**
  - amounts and dates (`$150.00 2026-11-01`, `150.00 - 2026`, `Total 1,250.00 2026`, `Row 250 10 1500.00`);
  - deadlines (`12/31/2026`, `December 31, 2026`); NPI with Luhn (`2340178906`, `1234567893`);
  - TIN/EIN (`12-3456789`, `90-0123456`, `Tax identification number 900123457`);
  - CPT/HCPCS (`CPT 97110-GP`, `G0283 97140 97530`); ICD-10 (`M54.50`, `S83.241A`); CARC/RARC;
  - ZIP+4 (`90001-1234`, `ZIP 900011234`); check (`000555012`); EFT trace; ICN 11+;
  - the currency-guard rows (`$202-555-0123`, `$202 555 0123`, `$900 12 3456`, `€202.555.0123`);
  - ranges (`10/01/2026-10/15/2026`, `2026-10-01-2026-10-15`, `150.00-120.00`, `123.45-67.89`, `11/01/26-11/15/26`);
  - lists (`Claim number(s) 900123456 and 900123457.`, `Reference numbers 2025550123, 2025550124.`);
  - service-line rows; `Claim lines 1 2 3 4 5 6 7 8 9`; `Please call about CPT 97110 97140.`; `Call our office, TIN 12-3456789`.
- **Labels and keep-nouns behave as described:**
  - `See our claim. 900551234` gives `[SSN]`; `Ref. No. 2025550123` is kept;
  - `Claim 900123456 and SSN 900551234` gives `... and SSN [SSN]`; `Phone/SSN: 2025550123` is redacted;
  - a bare ZIP+4 run `ST 900011234` gives `[SSN]` (the stated residual); hyphenated ZIP+4 stays.
- **The call's own identifiers keep their placeholders:**
  - `[CLAIM_1]`, `[MEMBER_ID]`, `[PATIENT_NAME]`, `[DATE_OF_BIRTH]`;
  - `Claim (202) 555-0123`, `Claim +1 202 555 0123` and `Claim SYN (202) 555-0123` give `Claim [CLAIM_1]`, and offer no candidates;
  - the call's short claim `1234` inside `900-55-1234` gives `[SSN]`; `900-55-1234-01` offers `90055123401`.
- **The survivor scan refuses at head, and refuses none at base:**
  - `10/01/2026-10/15/2026-0123`, `12.34-56.78-901`, `SSN 900-12-03-56`, `SSN 900-12-34.56`;
  - `202/555-0123`, `202)555-0123`, `SSN 900-12-34 56`, `Tel 202    555    0123`;
  - `Phone: 202-5550123`, `SSN 90012-3456`, `SSN 9 0 0 1 2 3 4 5 6`, `SSN 900.12 3456`;
  - `RE: Vantree900-12-3456`, `Call 202.555 - 0123`, `Please call regarding 97110 97140`;
  - `ICN 2026 110 123 456`, `Check 0001 2345 67`, `Call 123-456-7890`.
- **The refusal names no number.** denial-letter.ts refuses `identifier_left` with the fixed sentence "the letter still holds an identifier after redaction; it is not sent".
- **The residuals behave as recorded.** `Also 202-5550123`, `Patient 12025550123`, `Phone 1: 555-0100`, `1-800-555-SYNP`, `ending in 3456`, `202-555-0123202-555-0124`, `SSN 900 12/03/56` and `Claims 900123456 and 900551234` are all sent.
- **One false claim:** the glued-list item (What must change, item 2).

**Other code claims hold:**
- `redactLetterForScreen` is not in index.ts.
- `verifyDenialLetter` now flags any reference holding a placeholder.
- The screen reads `prepared.context.candidates`.
- letter-records.ts changes in its header comment only.

**Commits.**
- All 21 cited hashes, plus f185655c, f7d609cc and 0f4a5ed5, are ancestors of head.
- Each commit touches what the description says. 5cd823b4, be3b35e6, bf12d736, 10b48fb3 and 36bb44ec are tests only. 11f0ee29 and d51286e8 are the ADR, the matrix row and expected.json. 88aaa649 is the docs and the letter-records comment.
- d333d70d: the three shared files are byte-identical to a clean `git merge-file` of c9641eda, f7d609cc and 0f4a5ed5. The two-dot and three-dot diffs against the base list the same 15 files.

**Local totals.** The description's table for 10b48fb3 matches /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/fix/check.md row for row:
- typecheck 22, lint 1,822, lint:logs 1,153, lint:copy 584;
- unit 461 files / 9,621 + 4 skipped, golden 381, oracle 689, eval 300/300;
- synth 312/713, watched 568, db 9,814 + 1 in 145 files, check:fixtures 342/4,150;
- build stamp, e2e 81 in 15.1 m, gitleaks 18, pre-push 4/9, seeds 8/8.

**Docs.**
- PRD 14 records the ruling with who and when: "ruled by the founder, Tyler Williams, on November 1, 2026; docs/adr/0054".
- ADR 0054 has the 2026-11-04 amendment: ruling, scope, patterns, labels, lists, stays, ranks, screen, scan, time, tests, departures and residuals. Its Status line names it.
- ADR 0070 N6 has a dated "Amended 2026-11-04" bullet under N6.
- reconciliation-001 has the "Ruled by" paragraph with the relay sessions, 18bbe0e9 and the times.
- test-matrix.md has the MOD-15 and MOD-16 rows, and their title and assertion match matrix.ts word for word.
- registry.ts adds `none(10, …)` entries. fixtures/synthetic/MOD-15 and MOD-16 hold only expected.json, with `files: []`, `generated: []` and noFileReason.

**Design section 17 (R1-R14)** is reflected in the code and the tests as probed. The two departures (the N6 oracle, and a spaced dash counting as white space) are recorded in ADR 0054.

## Step 3: boundaries
- `git diff --stat origin/claude/build-platform...HEAD` shows 15 files, +2255/-58.
- No file is under content/releases, fixtures/golden, packages/db/migrations, packages/db/functions, packages/pricing/src or packages/ledger/src. There is no workflow, manifest or lockfile.
- No model identifier appears in any added line, or in any of the 22 commit messages outside the trailer.
- All 22 commits end with the exact `Co-Authored-By` and `Claude-Session` trailers.
- Synthetic numbers:
  - No NANP-valid phone outside 555-01xx appears in an added line.
  - The only SSN-shaped strings outside the 9xx, 000 and 666 areas are amounts and date rows that must stay: `Row 250 10 1500.00` (design R1), `$500-50 2020-01-01` and `$305 50 0345 2020-01-01` (MOD-16 seed counterexamples). Critic round 2 accepted these, and none is redacted.

## Step 4: the clone's own runs (each heavy step under /tmp/laneb-heavy.lock)
- `pnpm typecheck`: passed, 23 projects. The base added one since 10b48fb3.
- `pnpm lint:logs`: 1,163 files, ok.
- `vitest run --project unit packages/model-gateway`: 28 files, 1,436 passed.
- `pnpm --filter @tp/model-gateway eval`: gate passed; narratives 300/300 without a critical error.
- **redact.ts set back to the base's**, running the three test files:
  - With the base file as it is: 312 failed / 183 passed. MOD-15 has 35 failures and MOD-16 has 4. 22 of the 312 are only "redactLetterForScreen is not a function".
  - With a shim (the base's behaviour plus a `redactLetterForScreen` wrapper over the base's `redactLetter` and `identifierCandidates`): 190 failed / 305 passed. MOD-15 has 35 failures (every property and named survivor). MOD-16 has 3: the call's own IDs keep their placeholders in SSN and phone shapes; another patient's ID is offered whole and with a prefix; an unlabeled bare nine or ten is redacted.
  - MOD-16's must-stay property passes on the base, as a guard should.
  - redact.ts was restored afterwards; `git diff` is empty.

## Step 5: CI on d333d70dc5c2fe6422d6d6a45952288b95465bbc
All 21 check runs completed by 07:29 UTC.
- **Success:** all green, unit, lint, static, images, build, domain model, db (1/4), db (2/4), db (3/4), db (4/4), e2e (1/2), e2e (2/2), changes (x2), capacity, screening-capacity gate, mutation, approval-of-record.
- **Skipped, as expected:** stryker (no affected shard), notify.
- **The four required checks:** all green success, mutation success, screening-capacity gate success, approval-of-record success.
- **No failure.** No known base flake appeared, including route-tests.8.
- CI built refs/pull/127/merge, commit 11af538c. Its parents are 0f4a5ed5 and d333d70d, and its tree is identical to d333d70d.
- **Totals from the logs:**
  - unit: 468 files, 9,824 passed, 1 skipped (9,825);
  - db: 149 files (38 + 37 + 37 + 37, which equals the 149 tracked `*.db.test.ts`), 3,291 + 2,256 + 3,311 + 1,006 = 9,864 passed, 0 failed;
  - e2e: 41 + 40 = 81 passed, plus the 5-test brand baseline regeneration, passed.

Progress log: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/ssn/progress/verify.md
