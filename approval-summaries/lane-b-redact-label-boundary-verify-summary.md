# Fresh-clone verification: PR #115 (co-001/redact-label-boundary)

**Verdict: FAIL.** The code, tests, scope and CI pass. The PR description fails: two statements in it are false
and several are stale. Only the description must change. No commit is needed.

- **Head:** b8eea9092fbaf49f89e473a0d0ff87a6a2324d7d. `git ls-remote` gives the same SHA for origin co-001/redact-label-boundary.
- **Base:** claude/build-platform 17641c8843b7c87e4dd52bd113070f2d01676712, which is also the merge base.
- **Clone:** /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/verify-clone, checked out detached at the head. `pnpm install --frozen-lockfile` passed.

## What must change (PR description only)
1. **False: the deadline claim.** The description says the over-redaction after "We reviewed the claim. ID 2027-03-15" "is now kept as the deadline it is". The head replaces it: `We reviewed the claim. ID [CLAIM_1] is the deadline.` The base did the same. The head's own guard test pins `[CLAIM_1]`, and ADR 0054's entry says the over-redaction is "accepted as before". The sentence comes from a01a0737, and 3356df22 (oracle-1) reversed it. It should say the over-redaction is kept, as on the base.
2. **False: "The root rule".** The description says a head word joins a qualifier only "over its own abbreviation's full stop on the same line", and that "a full stop after a whole word ... ends the head". Neither holds after 3356df22.
   - LABEL_HEAD still joins over any full stop of the head's own, a whole word's included, and over line breaks. On the head, "Claim. No 2026-04-26" gives [CLAIM_1], and "Member No.\nID 1990-01-01" gives [MEMBER_ID].
   - The redact.ts doc comment says this too: such a reading "may join over a sentence end ("CLAIM.\nID:")".
   - The fix is additive instead. `labelsBefore` also reads the label after each line break, after each "!" or "?" followed by white space, and after any full stop (LINE_OR_SENTENCE_START). The bullet should state that rule, and "What still holds" should follow it.
3. **Stale: "A capital ID".** The description says "After a full stop, an 'ID' in capitals begins a label of its own". The same claim appears in the sec-2 row of the reviewer table. d6e2b3d9 removed STOP_THEN_ID and LABEL_ABBREVIATION. Now any label after any full stop counts, in any case ("acct. id:", "CLAIM.id:", "acct. No."). Both places should say that.
4. **Stale: the CI count.** The description says "all 21 check runs completed, every one successful". get_check_runs on b8eea909 now returns 22 runs: 20 success and 2 skipped (`notify` and `stryker (${{ matrix.shard }})`). approval-of-record ran twice, at 18:43 and at 19:06 (after the body was edited), and both succeeded. The four required runs succeeded: `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`. The text should say 22 runs, 20 successful and 2 skipped. "Every one successful" contradicts the two skipped runs.
5. **Stale: the 50-seed run.** "MOD-13's property also ran on 50 seeds × 400 runs locally" was measured on a01a0737, the first commit (fix/build.md). It was not run on the final redact.ts. The text should say which commit it ran on, or the run should be repeated on the head.
6. **Imprecise:**
   - **The sweep sizes.** "The class sweeps ... about 6,400 letters": there are two sweeps. The first is about 5,800 letters (its comment says "About 5,900"), and the sec-2 sweep is about 6,400.
   - **"Each test failed on the commit before its fix".** It does not apply to the over-redaction-guards test, which passes on the base's redact.ts. The oracle-1 test also passes on the base, by design, since it restores base behaviour. Both are guards, so the description should say so.
   - Optional, not in the PR body: the message of merge commit 83414ebd lists "#108, #104, #109, #113" and leaves out #114, although 9c6bb102 is the #114 merge. The PR body lists #114 correctly. Leave the commit as it is.

## Checked and true
- **The defect and its counterexample.**
  - The probe is /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/rlb/vprobe/probe.mts, run with tsx, and its output is in vprobe/probe.out.
  - On the base's redact.ts (identical at 24531dc2 and 17641c88):
    - "Patient: AA CLAIM.\nID:1990-01-01 on file." gives "Patient: [PATIENT_NAME].\nID:1990-01-01 on file.", so the member ID is sent.
    - "Hi AA CLAIM. ID:1990-01-01" sends it the same way.
    - "acct. id:" also sends the member ID.
    - In "Dear AA SUBSCRIBER NBR. No. 2026-04-26", the claim number is sent.
  - The head redacts all four, to [MEMBER_ID] or [CLAIM_1].
  - **"Since #75":** `git log -S labelBefore` puts the label-kind logic in 72096e94, the merge of #75.
  - **"Found in #85's CI on seed 460548619":** run 41819868956, attempt 1. The unit job 126540094158 failed with "seed: 460548619" and a counterexample. Attempt 2 was green.
- **Abbreviations that stay one label (head):** "Acct. No.", "Claim No.", "Ref. #", "Pt. Acct. #" and "Claim\nNumber:" each give [CLAIM_1], and "Member.ID" gives [MEMBER_ID].
- **G2:** a member ID written as a date is kept after "Claim ID: 1990-01-01". The residual "Claim\tID:" / "CLAIM\tID:" is kept by design and pinned in the test.
- **Over-redaction guards:** after "claim.\n", "No. 97110", "$150.00", "NPI 1234567893" and the deadline 2027-03-15 all stay as written.
- **Commits:** a01a0737, 3356df22, cbe89f0c, 4a51f77e, 30946b56, 24b93397, d6e2b3d9, e5c4caf2, 83414ebd and b8eea909. All 10 are ancestors of the head, which matches the PR's count of 10. Each commit's subject and the files it touches match its row in the description. 24b93397 added the image-id timeout, and e5c4caf2 removed it, so the net diff has no tools/ file.
- **Base merges:**
  - 83414ebd merges 9c6bb102 (#108, #104, #109, #113, #114).
  - b8eea909 merges 17641c88 (#85).
  - Neither merge changes the three files against its first parent. The base changed nothing under packages/model-gateway or in ADR 0054 between 24531dc2 and 17641c88.
- **Test names and the seed pin:** `LABEL_BOUNDARY_SEED = 460548619` is run as a fixed property run (400 runs, with a 60 s timeout). The other tests are present as described: the counterexample with its controls, the two class sweeps, the abbreviations, sec-3, oracle-1 and the guards.
- **ADR 0054:** one dated entry, "Since 2026-11-04 (MOD-13 seed 460548619)". It is 8 lines, the longest 118 characters, inside the Numbers bullet of the 2026-10-27 amendment. Its content matches the code, including the accepted over-redaction.
- **Local totals:** the table matches fix/check.md for the run on e5c4caf2: lint 1,759; lint:logs 1,120; lint:copy 557; unit 437 files, 7,478 passed and 4 skipped; golden 381; oracle 689; eval 300/300; db 140 files with 3,222 (1 skipped) + 2,793 + 2,671 + 988; e2e 70. The 28 files / 589 tests for model-gateway were reproduced on b8eea909, below.

## Boundaries
- `git diff --stat origin/claude/build-platform...HEAD` holds only three files, with 276 insertions and 14 deletions:
  - `packages/model-gateway/src/redact.ts` (+76/-14 in all)
  - `packages/model-gateway/src/redact.property.test.ts` (+206)
  - ADR 0054 (+8)
- No model identifier appears in the added lines.
- In the commit messages, a model name appears only in the required `Co-Authored-By` trailer.
- All 10 commits carry both trailers, `Co-Authored-By` and `Claude-Session`.

## Commands in the clone (b8eea909, under flock)
| Command | Result |
|---|---|
| `pnpm typecheck` | passed, 22 projects |
| `pnpm lint:logs` | 1,132 files scanned, ok. The count is higher than e5c4caf2's 1,120 because of the base merges. |
| `vitest run --project unit packages/model-gateway` | 28 files, 589 passed |
| `pnpm --filter @tp/model-gateway eval` | gate passed; narratives 300 of 300 without a critical error |
| `redact.property.test.ts` with the base's redact.ts copied in | 6 failed, 16 passed. Failing: the seed-460548619 run (the same CLAIM.\nID counterexample), the counterexample test, the line/sentence class sweep, the one-label test ("Acct.\nID:"), the sec-2 full-stop sweep ("acct. ID:") and the G2/G3 test (sec-3 "ID Number:"). Passing: the oracle-1 and over-redaction-guard tests. After the run, `git checkout` restored redact.ts and the tree is clean. |

## CI (get_check_runs on b8eea909)
- **22 runs:**
  - **Success:**
    - approval-of-record (×2)
    - screening-capacity gate
    - all green
    - e2e (1/2) and e2e (2/2)
    - mutation
    - capacity
    - domain model
    - lint
    - db (1/4), db (2/4), db (3/4) and db (4/4)
    - static
    - images
    - build
    - unit
    - changes (×2)
  - **Skipped:**
    - notify
    - stryker matrix
- **Required, all success:** `all green`, `mutation`, `screening-capacity gate` and `approval-of-record`.
