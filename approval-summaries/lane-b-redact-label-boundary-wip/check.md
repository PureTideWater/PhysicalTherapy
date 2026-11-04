# check round 2: co-001/redact-label-boundary

- **Worktree:** /home/user/redact-label-boundary.
- **HEAD:** the round started at 24b93397. Two new local commits make the final HEAD **e5c4caf2**, and the tree is clean.
- **Git rules:** nothing was pushed, rebased, amended or forced.
- **How commands ran:** every heavy command ran under flock /tmp/laneb-heavy.lock with node24 on PATH.
- **Data:** synthetic twins only.
- **What the change avoids:** no migration, no new test-matrix ID and no new ADR. The engine and ledger are untouched.
- **Scope:** the branch diff from 24531dc2 is now `packages/model-gateway/src/redact.ts`, `redact.property.test.ts` and ADR 0054, and nothing else.
- **Trailers:** each of the 8 commits ends with the two given trailer lines. Those lines are the only place a model name appears.

## Gaps closed

### Gap 1 (scope): the image-id timeout leaves this branch (commit e5c4caf2)
- **On this branch:** commit e5c4caf2 puts `tools/screening-capacity/image-id.test.ts` back exactly as it is on 24531dc2. `git diff 24531dc2 --stat -- tools` is now empty. MOD-13's own 60 s timeouts stay.
- **The new branch:** the timeout now sits on its own narrow local branch, **co-001/image-id-timeout**.
  - Worktree /home/user/image-id-timeout, cut from origin/claude/build-platform c4941291.
  - One commit, **e22df2af** (+2/-1, with the trailers). It is not pushed.
  - There, the file's 10 tests passed and eslint was clean.
- **`pnpm test` here without the timeout:** green. It ran in the full suite below: 437 files; 7,478 passed and 4 skipped. The 64 MiB test did not time out this run.
- **What this proves:** the timeout is only a safeguard against full-suite load, and it no longer touches this branch. The PR description needs no ruling for it.

### Gap 2 (member-label abbreviation residual): fixed, not pinned as a residual (commit d6e2b3d9)
- **Root cause:**
  - Only a capital "ID" after a full stop started a reading of its own (`STOP_THEN_ID`).
  - `LINE_OR_SENTENCE_START` skipped any full stop after `acct|ref|no|nbr|num`.
  - So "SUBSCRIBER NBR. No." stayed one member label, and G2 kept a claim number written as a date.
  - The same held for the claim-label residuals the first round accepted: "acct. No.", "Acct. Number is", "acct. id:" and "Claim No. Number is". It also held for the minor case "CLAIM.id:".
- **The fix in `redact.ts`:**
  - `LINE_OR_SENTENCE_START` now also starts after any full stop, an abbreviation's included, with or without white space.
  - `STOP_THEN_ID` and `LABEL_ABBREVIATION` are removed, and the doc comments are updated.
  - Readings are only added. "Acct. No.", "Claim No.", "Ref. #" and "Member ID No." still read as one label, so a claim number after them is still `[CLAIM_1]`.
  - G2 still holds for a label with no full stop inside it: "Claim ID:", "Claim No", "Claim#", "Claim\tID:", and "Member ID No." / "Subscriber No." for a claim number.
- **What is given up:** G2's claim-only reading of "Acct. No." for a member ID written as a date. That reading moved off the keep list, as "Acct. ID:" did in round 1. It is no over-redaction the brief lists (amounts, dates of service and remittance, deadlines, claim numbers, CPT codes, NPIs), and it applies only when the date's digits equal the member ID.
- **Test:** MOD-13's sec-2 test is rewritten.
  - 12 claim heads × 13 stops × 9 labels ("ID: ", "ID No. ", "ID#", "No. ", "No: ", "Number is ", "id: ", "id no: ", "NO. ") × 3 date writings, for a member ID.
  - 8 member heads with abbreviations (SUBSCRIBER NBR, MEMBER NUM, Member No, MEMBER ID NO, Subscriber Ref, …) × 5 stops × 9 labels (including "Claim: ", "ICN: " and "Acct. No. ") × 3 writings, both as plain text and inside a patient name, for a claim number.
  - The critic's exact counterexample: "Dear AA SUBSCRIBER NBR. No. 2026-04-26 was denied." gives "Dear [PATIENT_NAME]. No. [CLAIM_1] was denied."
  - "Hi MM CLAIM.id:1990-01-01" gives "Hi [PATIENT_NAME].id:[MEMBER_ID]".
  - Claim numbers stay `[CLAIM_1]` after "Acct. ID:", "Acct. No.", "acct. No.", "Claim No. Number is" and "Ref. #".
  - The four earlier residual pins now expect `[MEMBER_ID]`.
  - About 6,400 letters, with a 60 s timeout.
  - The over-redaction guard test gains the heads "Subscriber Nbr." and "Member No."
- **The test fails on the commit before:** with 24b93397's `redact.ts` in place it failed ("We updated the acct. No. 1990-01-01 on file." was sent). With the fix it passes.
- **Probes:** scratch copies, run with node --experimental-strip-types.

| Probe | 24b93397 | d6e2b3d9 |
|---|---|---|
| c2.mts, absolute (92 texts that must be replaced) | 0 sent | 0 sent |
| c2.mts, relative (4,401 texts) | 18 leaks | **0 leaks** |
| adv1 (159,936 texts) | 3,081 leaks | **705 leaks** |
| The critic's p/p2/p3 strings (crit1/) | the member-label "No." and "CLAIM.id:" cases leak (per the critic) | **0 leak** |

  - **The 705 adv1 leaks that remain** all have a tab between the head and the label ("CLAIM\tID:", "Acct\tNumber is"). That is one label on one line, which is G2 by design and pinned ("Claim\tID:"). None has a full stop.
  - **The critic's strings** include "Dear AA SUBSCRIBER NBR. No.", "MEMBER NUM. No.", "MEMBER REF. No.", "Hi GG ACCT. No.", "Hi MM CLAIM.id:" and "Subscriber Nbr. Claim:". The guards in string 5 stay: the deadline, CPT 97110, $150.00 and the NPI.
- **Unit:** model-gateway plus apps/worker/src/models and apps/worker/src/packets: 32 files, 628 tests passed.

### Minor items
- **ADR 0054's dated entry** is rewritten as one dated entry of 8 wrapped lines, the longest 118 characters (it was 15 lines, one of them 158). It now states:
  - the label after any line break, any "!" or "?" with white space, and any full stop, an abbreviation's included, counts;
  - only labels are added;
  - G2 holds for a label with no full stop;
  - a bare "ID" with a qualifier is a label;
  - the accepted over-redaction after "the claim. ID".

  No residual of this class remains, so none is listed. ADR 0070 Part 3 does not state the label rule, so it is unchanged.
- **"CLAIM.id:"** (a whole word's full stop, a lowercase "id", no space) is now redacted and pinned. The new rule covers it.

## Full local suite, once on the final HEAD e5c4caf2

Every step ran under the lock, one at a time. Logs are in scratch/suite2/.

| Step | Result |
|---|---|
| pnpm typecheck | passed, 22 projects |
| pnpm lint | passed, 1,759 files in 3 groups, 0 errors, 0 warnings |
| pnpm lint:logs | 1,120 files scanned, ok |
| pnpm lint:copy | 557 files read, ok |
| pnpm test (unit, coverage) | 437 files passed; 7,478 passed, 4 skipped (7,482). The image-id test passed without the 60 s timeout. One "sha256sum … Input/output error" line on stderr is pre-existing: the round 1 log has it too, and it is no failure. |
| pnpm test:golden | 5 files, 381 passed |
| pnpm test:oracle | pyx12 4.0.0 agrees with all 689 (678 valid, 11 malformed rejected as expected); edi835 agrees on every segment, amount, balance and verdict |
| pnpm --filter @tp/model-gateway eval | gate passed; narratives 300 of 300 without a critical error |
| pnpm synth --all | 288 cases: 0 written, 689 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged; git status empty |
| watched.ts --write | watched-paths.txt 553 lines; git status empty |
| test:db 1/4 (fresh rlb_c2_db1, localhost:5433, migrated) | 35 files; 3,222 passed, 1 skipped |
| test:db 2/4 (rlb_c2_db2) | 35 files; 2,793 passed |
| test:db 3/4 (rlb_c2_db3) | 35 files; 2,671 passed |
| test:db 4/4 (rlb_c2_db4) | 35 files; 988 passed |
| test:db coverage | the 4 JSON reports hold 140 files, each exactly once, which equals every tracked *.db.test.ts |
| stryker affected.ts --event pull_request --base origin/claude/build-platform | money, pricing, ledger and packets not affected; shards none (no money path changed) |
| The mutation gate | no shard is affected, so the gate is the mutation job's "no money path changed" pass, and no shard ran |
| tools/engine-freeze/check.ts $(git merge-base HEAD origin/claude/build-platform) | problems: none |
| pnpm check:fixtures | 342 files read by the guard, 4,050 searched, ok |
| pnpm verify-content | every content set passes |
| pnpm build + BUILD_COMMIT | exit 0; stamped e5c4caf2fd511866c1975abebbc50c00e97302b6 |
| E2E_PREBUILT=1 pnpm test:e2e --workers=2 | 70 passed (13.6 m); E2E_DATABASE=rlb_c2_e2e, E2E_PORT=3187 |
| gitleaks git --log-opts="origin/claude/build-platform..HEAD" | 8 commits scanned, no leaks found |
| pre-push hook standalone (.githooks/pre-push, remote sha zeros, pinned gitleaks) | 8 commits checked, 0 fixture files, 21 text files, no secret, exit 0 |
| git status | clean |

- **Databases:** every rlb_c2_* database, the e2e one included, was dropped WITH (FORCE). None remains.
- **Why the whole suite ran:** the task asks for the full suite once on the final HEAD, so it ran in full rather than only the steps the change can affect.

## Commits this round
- **d6e2b3d9** model-gateway: the label after any full stop counts, an abbreviation's too, so a claim number after "SUBSCRIBER NBR. No." and a member ID after "acct. No." are redacted (MOD-13). 3 files: redact.ts, redact.property.test.ts and ADR 0054.
- **e5c4caf2** tests: the image archive's 64 MiB test leaves this branch, back as on claude/build-platform.
- **e22df2af**, on the separate branch co-001/image-id-timeout: the image archive's 64 MiB test takes a 60 s timeout.

## Notes
- **Base:** origin/claude/build-platform is at c4941291. The merge base is still 24531dc2. The branch is not merged with the new base, because that is not this step.
- **Branches:** co-001/redact-label-boundary is 8 commits ahead of 24531dc2. co-001/image-id-timeout is 1 commit ahead of c4941291. Pushing either is left to the caller, under the hook.
- **Not yet reviewed by a critic:** d6e2b3d9 and e5c4caf2.

**Files**
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/progress/check.md
- Probes: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/c2.mts and /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/adv1.mts
- adv1 output for this round: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/adv1-redact.round2.ts.out
- The redact.ts copy the probes ran against: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/redact.round2.ts
- Suite logs: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/scratch/suite2/
