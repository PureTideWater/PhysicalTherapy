# check7: PR #75 check, round 1 (co-001/contract-phi-check)

**Final HEAD:** a8149341abced3c4ddc12c732259455b271a9474. Worktree /home/user/contract-phi-check. The tree is clean and nothing has been pushed (origin's PR head is still 871faff9). There was no rebase, amend or force.

**Start:** HEAD was a03654ce. That is merge6's base merge of 21fa10df (parents 315ac91e and 21fa10df), described in fix/merge6.md. No check7 progress file existed, so this run started fresh.

## Commits (each ends with the two required trailer lines)
1. **49c7a781**: phi-G2-regress-1. Digits joined over "." or "/" count as the number after any label again. Only a whole written date still needs G2's head word.
2. **7639392f**: phi-label-end-dash. A label's end now accepts "=", any dash and the minus sign.
3. **a8149341**: phi-numero-glued. A number glued to its label word, "№" among them, is read as if it came after that label.

All three change only packages/model-gateway/src/redact.ts, its tests (redact.property.test.ts, redact.test.ts), ADR 0054 and ADR 0070 Part 3. None touches a migration, the engine (packages/pricing) or the ledger, and no file or commit names a model.

## Findings
### phi-G2-regress-1 (major): confirmed and fixed in 49c7a781
- **Cause:** G2's narrow IDENTIFIER_LABEL also gated the matcher's non-date branch (`labeledAt`) and `labeledDigitsJoin`. So "Patient ID 1234.5678", "Policy number 1234/5678", "Member's ID 1234.5678", "Policy # 1234.5678", "ID 1234.5678" and the critic's other examples sent the patient's own digits-only ID. `holdsIdentifier` and the candidates missed them too.
- **New label:** `ANY_IDENTIFIER_LABEL` is the head-word labels, or a bare id/number/nbr/no/num/identification/reference/# with any qualifiers after it. That covers any word before ID, number, no or #.
- **Matcher:** the non-date branch now uses that label (`anyLabelAt`). The kinded `labelFor` still applies to whole written calendar dates, so "ID 2027-03-15" and "The number 2027-03-15" keep their deadline.
- **Candidates:** `labeledDigitsJoin` now reads the label as the matcher does: any label when the run is not a whole written date, a head-word label when it is. `identifierTokenRuns` now passes the join rule the end of the next token.
- **Tests:**
  - All of the critic's labels are pinned, checking redactLetter, holdsIdentifier before and after redaction, and identifierCandidates.
  - Deadlines after bare words are kept, and "ID 2027/03/15" never offers 20270315.
  - The N6 property's LABELS has "ID ", "The number ", "reference: " and "no. " again (it draws only non-date digits).
- **Verified:** with the fix reverted (HEAD's redact.ts), the new test and the N6 property both fail.
- **ADRs:** ADR 0054 (Numbers, the candidates, residuals) and ADR 0070 Part 3 (N6).

### phi-label-end-dash (minor): confirmed and fixed in 7639392f
- **Fix:** `LABEL_END` now takes `[:#=\p{Pd}−]`. The "number is" lookahead accepts the same marks.
- **Tests:** a pinned test covers "Member ID – 1234.5678", "Member ID — 1234.5678", "Member ID = 1234.5678", "Member ID − 1234/5678", "Claim # – 9988/7766", "Claim — 2026-04-26" and "The number – is 2026-04-26". It checks redactLetter, holdsIdentifier after redaction and the candidates.
- **Verified:** the test fails without the fix.
- **ADR:** ADR 0054 (Numbers).

### phi-numero-glued (major): confirmed and fixed in a8149341
- **Choice of approach:** the fix does not insert a space into the text. The text sent stays NFKC with only the spans replaced, which MOD-13's first property asserts.
- **Matcher:**
  - It runs each claim or member form once more, and its labeled form, without BEFORE but with a letter in front of it.
  - It keeps a match only when `GLUED_LABEL` ends right there. That is a head word, ID, Nbr, Num, Ref, or "No" with a capital N, either as a whole word or after a small letter ("ClaimNo" from "Claim№", checked on the written code points).
  - The match is then read as if after a label of that kind: a whole written date counts only after a label of its own kind, and a claim is never read as an amount.
- **Candidates:** `identifierCandidates` also reads the text with each glued label word set apart (`unglued`), alongside the text as it is.
- **Result:** "Claim №99887766 denied" becomes "Claim No[CLAIM_1] denied". "Member №ZZ12345678", "ICN99887766", "Member ID12345678", "CLAIM NO99887766", "ICN9988.7766" and "Claim №2027-03-15" are also replaced, and the candidates offer each of these numbers.
- **Tests:**
  - All the forms above are pinned, checking redactLetter, holdsIdentifier before and after redaction, and the candidates.
  - Glued words that are not labels stay unchanged: "Room AB99887766", "Casino 2027-03-15", "Nov 2027-03-15".
- **Verified:** the test fails without the fix.
- **New residuals, recorded in ADR 0054:** a number glued to a word that is not a label word, and "NO" after a capital letter ("CLAIMNO99887766").
- **ADR 0070 Part 3, "Not caught":** the contract screen still treats a glued label word ("ICN98765432", "№98765432") as a glued prefix. The letter path now reads both.

### Re-probe
All 19 of the critic's examples from p1.ts and p2.ts are replaced on a8149341, and holdsIdentifier is false on each output (probe: scratch/p3.ts).

### Refuted
None.

## Full local suite on a8149341
Every step ran under flock /tmp/laneb-heavy.lock, one at a time. No code changed after the first step ran.

| Command | Totals |
|---|---|
| pnpm typecheck | passed, 22 projects, 59.4 s wall |
| pnpm lint | passed, 1,755 files in 3 groups, 0 errors, 0 warnings |
| pnpm lint:logs | 1118 files scanned, ok |
| pnpm lint:copy | 557 files read, ok |
| pnpm test (unit, coverage) | 435 files passed; 7436 passed, 4 skipped (7440) |
| pnpm test:golden | 5 files, 381 passed |
| pnpm test:oracle | pyx12 4.0.0 agrees with all 689 (678 valid, 11 malformed rejected); edi835 agrees on every segment, amount, balance and verdict |
| pnpm --filter @tp/model-gateway eval | gate passed; narratives 300/300 without a critical error |
| pnpm synth --all | 288 cases: 0 written, 689 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged; git status empty |
| watched.ts --write | 553 lines; git status empty |
| test:db 1/4 (fresh phi_check7_db1, PG on 5433) | 35 files; 3222 passed, 1 skipped (3223) |
| test:db 2/4 (phi_check7_db2) | 35 files; 2793 passed (2793) |
| test:db 3/4 (phi_check7_db3) | 35 files; 2671 passed (2671) |
| test:db 4/4 (phi_check7_db4) | 35 files; 988 passed (988) |
| tools/engine-freeze/check.ts origin/claude/build-platform | nothing changes; problems: none |
| pnpm check:fixtures | 342 files read by the guard, 4044 searched, ok |
| pnpm verify-content | every content set passes |
| pnpm build + BUILD_COMMIT stamp | exit 0; stamped a8149341abced3c4ddc12c732259455b271a9474 (as ci.yml: `git rev-parse HEAD > apps/web/.next/BUILD_COMMIT`) |
| E2E_PREBUILT=1 pnpm test:e2e --workers=2 | 70 passed (13.7 m); E2E_DATABASE=phi_check7_e2e, E2E_PORT=3177 |
| gitleaks git --log-opts="871faff9..HEAD" --no-banner | run 1: 171 commits, 17 findings, exit 1 (see below); run 2: 206 commits, no leaks found, exit 0 |
| pre-push hook standalone (remote sha 871faff9, pinned GITLEAKS) | 4 commits checked, 0 fixture files, 20 text files, no secret, exit 0 |

- **test:db shards:** each shard ran migrations on its own new database, and each database was dropped WITH (FORCE) afterwards. The shards' JSON lists cover 140 files, each exactly once, which equals every tracked *.db.test.ts. No phi_check7_* database remains.
- **gitleaks run 1:** the local clone was shallow, and 471818b5 was a shallow boundary. 471818b5 is a base-branch commit from #42's history, not one of this PR's commits. Because its parent was missing, gitleaks read it as adding the whole tree (3887 files), and the 17 findings are the repository's reviewed false positives, which .gitleaksignore fingerprints under their real commits. The fix was `git fetch --deepen=300 origin claude/build-platform`, which changes local history only; the repository is no longer shallow. Run 2 then reported no leaks.

## Mutation shards
`tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform`: money and ledger are not affected. Pricing and packets are affected through packages/db authz/index.ts, authz/scope.ts, connect.ts and runtime.ts. Each shard ran as ci.yml runs it: canary, verdict, shards.ts, then gate --shard. Every canary was 5 of 5 on Node v24.22.0.

| Shard | Result |
|---|---|
| packets-scan | scan.ts 93.95% (995/1059) |
| packets-rest | assemble 99.05%, calculation 98.24%, dates 100%, facts 95.34%, interest 97.52%, payer 98.33%, placeholders 100%, readable 93.47%, verifier/index 83.33%, verifier/mismatches 97.30%, windows 100% |
| packets-explain | every file 100% |
| pricing-engine | engine.ts 98.71% (844/855) |
| pricing-recompute | recompute.ts 98.03% (649/662) |
| pricing-rest | dates 100%, reasons 100%, release 97.01%, trace 100%, windows 100% |

The gate with `--expected` set to the 6 shards printed "mutation gate: passed":
- pricing: 98.67% (1934 of 1960). All 26 undetected mutants are recorded equivalents; 12 load failures were left out.
- packets: 97.75% (4310 of 4409). All 99 undetected mutants are recorded equivalents; 2 load failures were left out.

These figures match check5.

## Open items
- **The base branch moved during this run:** origin/claude/build-platform is now 4846f043 (#94, the aws-cdk minor and patch dependency update; it changes packages/model-gateway/package.json and pnpm-lock.yaml). It arrived after merge6's 21fa10df and is not merged here, because that is not this step. A later merge round should take it, regenerating the lockfile with its tool. The engine-freeze check and affected.ts both diff from the merge base, 21fa10df.
- **Push:** the branch is 4 commits ahead of origin (a03654ce and the three fixes), and pushing is left to the caller under the hook. 871faff9 is still the PR head on origin.
- **Residuals recorded rather than fixed:**
  - A number glued to a non-label word ("Room AB99887766") or to "NO" after a capital letter ("CLAIMNO99887766") is not read as labeled (ADR 0054).
  - The contract screen still misses a glued label word such as "№98765432" (ADR 0070 Part 3, Not caught, glued prefix).
- **Not yet reviewed by a critic:** the three new commits, along with what was listed as unreviewed before (d2a609fd, b81429f4, 315ac91e, a03654ce).

## Files
- Progress file: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/progress/check7.md
- Step logs: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/scratch/c7-*.log
- Re-probe script: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/scratch/p3.ts
