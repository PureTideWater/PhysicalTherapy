# PR #75 fresh-clone verification 2 (co-001/contract-phi-check)

- **Head:** a8149341abced3c4ddc12c732259455b271a9474. Origin still pointed at it at the start and at the end (ls-remote).
- **Base:**
  - At the start, `claude/build-platform` was 4846f043f6133872f1d26e0296a071bca6be48f0, and the merge base was 21fa10df.
  - **By the end the base had moved to 7bf7b252** (#107, `co-001/ci-trivy-pin-2026-11-04`, merged 05:58:40 UTC). #107 changes `ci.yml`, the release workflows, `tools/trivy/install.sh`, `tools/trivy/release.txt`, `tools/check-action-pins/*` and ADR 0066.
  - A trial merge-tree of a8149341 with 7bf7b252 is clean, as is one with 4846f043.
- **Clone:** /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/verify2-clone. The head is checked out detached, `pnpm install --frozen-lockfile` exited 0, and git status was empty at the end.
- **Logs:** /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/scratch/v2-*.log
- **Probes:** /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/v2probe/probe.ts and probe2.ts
- **Progress:** /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/phi/progress/verify2.md

## Verdict: FAIL (the description only; the code is merge-ready)

The code is merge-ready:
- Every claim about code, constants, wording, the redaction examples, MOD-12, the ADRs and the commits matches the clone.
- Each of this round's three fixes fails its named test when reverted.
- The boundaries hold.
- Every CI failure is outside this PR.

The description is not merge-ready. It has one stale CI block, one stale statement about the base and the Trivy fix, and one inaccurate line about the engine freeze.

### What must change

1. **The CI block (`<!-- ci -->`) is stale.**
   - It says "Still running: stryker packets-rest, so `mutation` has not reported".
   - All 31 check runs on a8149341 have completed. `stryker (packets-rest)` succeeded at 05:46:51 and the required `mutation` succeeded at 05:47:27.
   - Restate the block as:
     - **Required checks:** `approval-of-record` and `mutation` are green. `all green` is red because of `images` only. `screening-capacity gate` is red because of `capacity` (`RUNNER_TOO_SMALL`).
     - **Everything else:** 25 succeeded, `notify` was skipped, and `capacity` and `images` failed.
   - Add the CI totals below.
2. **The base and the Trivy fix are stale.**
   - The description says "The base has since moved to 4846f043 … It is not merged here". It cites PR comment 6623462279, which says the Trivy fix "is being built in another session".
   - That fix has now merged into the base as #107 (7bf7b252, 05:58:40 UTC). That was after this PR's CI run, which ran on merge ref 95b61061 (a8149341 + 4846f043).
   - So `images`, and with it `all green`, can now go green. The PR needs a run on a merge ref that holds 7bf7b252: a base merge of 7bf7b252 (merge-tree clean), or a new push.
   - Restate the base line (7bf7b252: #94, #107) and the `images` bullet to match. `capacity` (issue #102) remains the one red check this PR cannot clear.
3. **The engine-freeze line is inaccurate.** It reads "`tools/engine-freeze/check.ts origin/claude/build-platform` (4846f043; diffed from the merge base 21fa10df)".
   - `check.ts` diffs `<arg>..HEAD` two-dot (`readRepository`, check.ts:781 and :802). CI passes it `git merge-base` (ci.yml:133).
   - So with `origin/claude/build-platform` it diffs from the tip, not from 21fa10df.
   - Both pass: against 4846f043, nothing changes and there are no problems; against 21fa10df, nothing is let through and there are no problems.
   - Say "from the tip 4846f043 (and from the merge base 21fa10df: the same)", or drop the merge-base clause. `affected.ts` does diff from the merge base, so its line is right.

The draft state is closed at the merge step, not here. The API still reports draft=true and mergeable_state "unstable".

## Step 1: fresh clone

| Check | Result |
| --- | --- |
| `git clone -q`; fetch both branches; check out the head detached | head a8149341abced3c4ddc12c732259455b271a9474, equal to ls-remote and to the API's head.sha |
| Base at the start / end | 4846f043 / 7bf7b252 (#107); merge base 21fa10df |
| `pnpm install --frozen-lockfile` | exit 0 |

## Step 2: verification 1's findings at the head

| Item | Status | Evidence |
| --- | --- | --- |
| P11 built | closed | See the P11 details below. |
| Description current | closed except items 1 to 3 above | CI on the head (now stale, item 1), every base merge, the suite on a8149341. |
| Order wording | closed | See the wording details below. |
| Twin line, the "ZZ" third | closed | The description gives the thirds as 26,666 "ZZ" plus 7 digits, 26,666 `9NN00NNNN` and 26,668 eleven letters and digits holding B, L, S or Z. `patient-twins.ts` agrees: `third = floor(80000/3)`, `ZZ${digits(7)}`, `9${digits(2)}00${digits(4)}`, and `/[BLSZ]/`. ADR 0070 Part 3 departure 8 agrees too. |
| P12's reason | closed | The registries are built: `connect.ts:28 const opened = new WeakMap` and `authz/scope.ts:135 const openedScopes = new WeakMap`. `practiceRecordsCheck` throws `ScopeError` at construction for a pool or scope the db package did not record. No #42 file is touched. ADR 0070 departure 31 and Open matters say P11 and P12 are fixed in this PR. |
| Draft | not mine | Closed at the merge step. |

**P11 details** (`packages/model-gateway/src/functions/contract-terms.ts`):
- `:76`: `export const MAX_REQUEST_BYTES = 1_000_000`.
- `:79`: `TOO_LONG_MESSAGE`.
- `:87`: `overCap`, which counts UTF-8 bytes as sent and `redact.ts:1348 screenedBytes`, the NFKC form.
- `:584`: the pages' total.
- `:597`: the framed text.
- Both refuse with `InputRefusedError('too_long', …)`.
- Notice: `apps/web/src/lib/models/notices.ts:54`. Mapping: `path.ts:186` (`too_long: 'too_long'`).
- The worker counts it: `permitted.ts:217` lists `refused:too_long` in `OUTSIDE_MODEL_PROBLEMS`.
- Tests: 4a099795 changes `contract-terms.test.ts`, `path.test.ts`, `gateway.test.ts`, `gateway.db.test.ts`, `models-routes.db.test.ts` and `permitted.test.ts`.

**Order wording details:**
- The description's heading reads "The screen is last before the budget's hold and the call".
- In `gateway.ts:48-51`: "every refusal the gateway can make before the budget's hold comes first … and the screen is the last refusal before the hold and the call; the hold (step 9) can still refuse a call after it". The old line-50 phrase ("the last step that can refuse a call before it is made") is gone repo-wide.
- `spec.ts:47`, `contract-terms.ts:528`, ADR 0070 departure 26 and ADR 0054:460 all say "last of the gateway's refusals before the budget's hold and the call".

## Step 3: the description's claims against the clone

Everything checked holds, except items 1 to 3 above.

**Files, functions and constants:**
- `SCREEN_MAX_IDENTIFIERS = 50_000` (`patient-records.ts:71`).
- `SCREEN_FLOORS` (`redact.ts:1023`).
- `EARLIEST_WRITTEN_YEAR` / `LATEST_WRITTEN_YEAR` = 1900 / 2099 (`redact.ts:109-110`).
- `SCREEN_LIMITS` (`contract-proposals.ts:149-154`): 20 an hour and 60 a day per practice; 20 an hour and 100 a day per person.
- `REMEMBERED_MS = 3_600_000` (`contract-proposals.ts:215`).
- The issued-check registry is a module-private `WeakSet` (`patient-records.ts:126`).
- `practiceRecordsCheckByShape` appears only in `testing.ts`, `patient-records.ts` and tests.
- `leaveAsks(batch, held) = held > 0 || stillSending(batch)` (`uploader.tsx:313`).
- `FIELD_BOX` is `w-full … max-w-md` (`uploader.tsx:118`).
- `initialKind="x12_835"` (`uploads/page.tsx:54`).
- The contracts region is `aria-labelledby="upload-contract-title"` (`contracts/page.tsx:202-204`).

**Refusal and log codes:**
- `too_long`, `names_patient`, `screen_unavailable`, `screen_invalid` (mapped to `screen_unavailable`), `screen_failed` and `screen_limited`.
- `MODEL_INPUT_NAMES_PATIENT`, `_MORE_THAN_ONE_PATIENT`, `_SCREEN_UNAVAILABLE`, `_SCREEN_INVALID`, `_SCREEN_FAILED` and `MODEL_SCREEN_LIMITED` are all present.

**Gateway order:** the description's steps 1 to 10 match `gateway.ts`'s header (steps 0 to 12) one for one: 0 limiter, 1 serving, 2 kill switch and flag, 3 PHI boundary, 4 prepare and the variant served, 5 idempotency, 6 budget read, 7 `beforeScreen`, 8 screen, 9 hold, 10 call.

**Wording:**
- Every quoted string in the Wording table is in the code word for word: the five notices in `notices.ts:54-59`, the propose card at `versions/[versionId]/page.tsx:104-105`, `CHOOSE_KIND_PLACEHOLDER`, `KIND_HELP`, "Kind of document", `waitingText`, "Waiting to upload: ${counted(...)}", "Upload ${counted(...)}", the too-many refusal through `counted()`, `KIND_NAMES` "835 remittance" / "ERA export" (`receipt-labels.ts:191-193`), "Which system’s export", "Choose the system", the system help and the region title.
- "ERA export from a practice-management system" is gone.

**Redaction examples:** I probed all of them with a scratch tsx script outside the repo against the clone's `redact.ts`. All 57 behave as the description states.
- **Replaced:** fix 4's three dates written as claims; "_", "|" and "\"; "Jan 31-2026"; `1999-1<ZWSP>2-31`; 1677792a's joiners; "Claim 1955-07-14" becomes "Claim [CLAIM_1]"; "ICN 1234.5678"; G3's "**Claim:**", "ICN (", "Claim: “"; G4's prime; 49c7a781's five labels; 7639392f's "–", "—", "=", "−" and "Claim # –"; and a8149341's glued forms ("Claim №99887766 denied" becomes "Claim No[CLAIM_1] denied", and so on).
  - In each, `holdsIdentifier` was true before and false after.
  - `identifierCandidates` offers each glued number.
- **Kept:** "2026-04-26", "April 26, 2027", "4/26/26", "The number 2027-03-15", "ID 2027-03-15", "Room AB99887766", "Casino 2027-03-15" and "Nov 2027-03-15".
- **DOB:** "DOB 0023-04-26" becomes "[DATE_OF_BIRTH]".
- **G1:** the candidates offer 12345678 for "ICN 1234.5678" and 7654321 for "Member ID: 7654.321". "ID 2027/03/15" never offers 20270315.
- **Every listed residual behaves as recorded:**
  - "Seen 03-15-61" is kept, while "Member ID 03-15-61" and "Claim 03-15-61" are replaced.
  - "$555001.00", "12/34/5678", "1234.5678", "1234,5678", "ID 03-14-1962", "#1955/07/14", "Claim# 1955-07-14", "CLAIMNO99887766" and "1234ー5678" are kept.
  - "ZZ(1234567)" becomes "[MEMBER_ID])".
  - ADR 0054 holds each of them.

**MOD-12:**
- The `test-matrix.md` row's cells are verbatim in `packages/synth/src/cases/matrix.ts`.
- `registry.ts` MOD-12 `assertedBy` lists 10 files, and all exist.
- `fixtures/synthetic/MOD-12` holds the EOB filed as a contract, the exhibit with a claim number, the fee-schedule twin, `contract-and-eob.zip` and `remit.835`, all marked SYNTHETIC.

**ADR 0070 Part 3:**
- "Where the build departs from the design" has exactly 31 items: 30 is the byte cap (P11) and 31 is the scope and pool check (P12).
- "The request's length" is at :676.
- "Not caught" has the glued label word ("ICN98765432", "№98765432") and the Arabic-Indic digits (R5-3).
- Open matters names F3, F4, P10 and S2, and says P11 and P12 are fixed here.
- ADR 0054 holds the residual list and the amendment wording.

**Commits:**
- All 38 hashes the description names are ancestors of the head, except 4846f043, which the description says is not merged.
- Every merge's second parent is the base the table names:

  | Merge | Parents |
  | --- | --- |
  | f5292c6c | 53076d2 + ecebdc90 |
  | 871faff9 | 4b886fcc + a6e754fc |
  | 26388626 | 871faff9 + 165c5993 |
  | 584f5218 | 7f77cb19 + 83d71fd6 |
  | fe9c8da8 | cf61a828 + 43565235 |
  | b81429f4 | d2a609fd + 4eaf7124 |
  | 315ac91e | b81429f4 + 88708069 |
  | a03654ce | 315ac91e + 21fa10df |

- Each fix commit touches the files it claims:
  - 4a099795: the cap, notice, mapping, permitted, `gateway.ts`/`spec.ts` comments, `packages/db` `connect.ts`/`authz/scope.ts`/`authz/index.ts`/`runtime.ts`, and tests.
  - 4b886fcc: ADR 0070, ADR 0054 and the runbook.
  - 49c7a781, 7639392f and a8149341: `redact.ts`, its tests, and ADR 0054 / ADR 0070.
  - 49156dd8: the uploader. 7cd60740: ADR 0079 and ADR 0070. a8bf75ca: ADR 0070 and ADR 0077. 7f77cb19: the uploads page, uploader and e2e.
  - e552399, 527f2c5, bac083a, 4450750, 53076d2 and 25be3ab, as stated.
- PR comments 6623424027 and 6623462279 exist and say what is cited.
- Every report cited on `claude/build-ops` exists: merge4, check5, fix4, merge5, merge6, check7 (identical to the local check7), shots-ref, shots6, findings-all, the verify-1 summary and the design.

**Local suite totals:** every row of the description's Checks table equals check7's:
- typecheck: 22 projects.
- lint: 1,755 files. lint:logs: 1,118. lint:copy: 557.
- unit: 435 files; 7,436 passed, 4 skipped.
- golden: 381.
- oracle: 689 (678 + 11).
- eval: passed, 300 of 300.
- synth: 288 / 689 / 16.
- watched-paths: 553.
- db: 140 files; 9,674 passed and 1 skipped (3,222 + 1 skipped, 2,793, 2,671, 988).
- e2e: 70.
- Mutation: pricing 98.67% (1,934/1,960), packets 97.75% (4,310/4,409).
- check:fixtures: 342 / 4,044.
- gitleaks: 206 commits, no leaks; the hook checked 4 commits.

**False or stale claims:** only items 1, 2 and 3 above.

## Step 4: boundaries

- **The diff:** `git diff --stat origin/claude/build-platform...HEAD` shows 81 files, 8,751 insertions and 366 deletions.
  - Nothing is under `content/releases`, `fixtures/golden`, `packages/db/migrations`, `packages/db/functions`, `packages/pricing/src` or `packages/ledger/src`.
  - No `.github`, `package.json` or lockfile changes.
- **Model names:** none in any added line. None in the messages of the PR's 17 own commits since 871faff9 (`871faff9..HEAD --not origin/claude/build-platform`), apart from the required trailer.
  - Informational: 315ac91e's subject names "the Anthropic SDK 1.x", which is a provider SDK, not a model name or identifier.
- **Synthetic data:** `pnpm check:fixtures` read 342 files and searched 4,044: ok.
  - The new tests' examples are synthetic: "VANTREE, JANE", `synthetic-patient-13`, `synthetic-claim-1`, 1234.5678, 99887766, ZZ12345678, 20270315.
  - So are the MOD-12 fixtures: "SYNTHETIC EXPLANATION OF BENEFITS", "SYNTHLASTMODTWELVE", "ZZ 712 0034".
- **Trailers:** all 17 PR-own commits carry `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and a `Claude-Session` line.
  - This session's four (49c7a781, 7639392f, a8149341 and a03654ce) carry session_019i9ifCJSbPYXpafL86Rm6J.
  - The older ones carry their own sessions' lines.

## Step 5: commands in the clone

Each heavy command ran under `flock /tmp/laneb-heavy.lock`, one at a time.

| Command | Result |
| --- | --- |
| `pnpm typecheck` | passed, 22 projects, 94.7 s wall |
| `pnpm lint:logs` | 1118 files scanned, ok |
| `pnpm lint:copy` | 557 files read, ok |
| `pnpm --filter @tp/model-gateway test` | `@tp/model-gateway` has no `test` script (exit 0, nothing ran), so I ran `vitest run --project unit packages/model-gateway`: 28 files, 582 passed |
| `pnpm --filter @tp/model-gateway eval` | gate passed; contracts 63 documents, precision and recall 0.996941; narratives 300 of 300 without a critical error |
| `pnpm synth --all` | 288 cases: 0 written, 689 unchanged, 0 removed; 8 EMR formats: 0 written, 16 unchanged; git status empty |
| `tsx tools/screening-capacity/watched.ts --write` | 553 lines; git status empty; the PR adds 2 lines (`patient-records.ts`, `patient-twins.ts`) |
| `tools/engine-freeze/check.ts origin/claude/build-platform` | no non-test file under pricing/src changes; let through: nothing; problems: none. Against 21fa10df: the same |
| `tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` | diffed from 21fa10df; money and ledger not affected; pricing and packets through `packages/db` `authz/index.ts`, `authz/scope.ts`, `connect.ts`, `runtime.ts`; 6 shards, as the description says |
| `pnpm check:fixtures` | 342 / 4044, ok |

**Reverts.** I ran these in the clone after the commands above, then restored. Git status is empty and HEAD is a8149341. Each run covered `redact.property.test.ts` and `redact.test.ts`; the baseline was 2 files, 45 passed.

| Fix | Core lines reverted | Result |
| --- | --- | --- |
| 49c7a781 (phi-G2-regress-1) | `anyLabelAt` tests the narrow `IDENTIFIER_LABEL` again instead of `ANY_IDENTIFIER_LABEL`. That narrows the matcher's non-date branch and `labeledDigitsJoin`. (The commit's reverse patch no longer applies on HEAD, because a8149341 edits the same lines.) | 2 failed: "reads digits joined over "." or "/" that are no whole written date as the number after any label … (review finding phi-G2-regress-1)", and the N6 property "finds every single-line writing the letter path reads … (property; docs/adr/0070 Part 3, N6)" |
| 7639392f (phi-label-end-dash) | the commit's `redact.ts` hunks, applied in reverse onto HEAD | 1 failed: "reads a label’s end through "=", an en or em dash and the minus sign (review finding phi-label-end-dash)" |
| a8149341 (phi-numero-glued) | the commit's `redact.ts` hunks, applied in reverse | 1 failed: "reads a number glued to its label, "№" (which NFKC writes "No") among them, as after that label (review finding phi-numero-glued)" |

## Step 6: CI on a8149341

**Run.** CI ran on merge ref 95b61061 (a8149341 + 4846f043; pull_request, refs/pull/75/merge). All 31 check runs had completed at the first read (05:47:27), so no polling was needed.

**Conclusions:**
- **Succeeded:** approval-of-record (×2), mutation, changes (×2), build, lint, static, domain model, unit, db 1/6 to 6/6, e2e 1/3 to 3/3, the six stryker shards (packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest), and `.github/dependabot.yml`.
- **Skipped:** notify.
- **Failed:** images, all green, capacity and screening-capacity gate.

**Required checks:**

| Check | Result |
| --- | --- |
| approval-of-record | green |
| mutation | green |
| all green | red, from images only |
| screening-capacity gate | red, from capacity only |

**Failures:**
- **images** (job 126406739061): not this PR's. CONFIRMED.
  - Both images built and matched their archive digests, and the worker's headless shell matched `browser.json`.
  - Then `aquasecurity/setup-trivy`'s "Install Trivy" ran `install.sh … v0.70.0`, printed "found version: 0.70.0 for v0.70.0/Linux/64bit" and ended with "Process completed with exit code 6", which is curl's "could not resolve host".
  - The log does not print the host's name. Base-wide: the base's own CI on 4846f043 (run 41763423759) failed `images` in both scan steps the same way, and `all green` with it.
  - The fix has since landed on the base: #107, 7bf7b252.
- **all green** (job 126411626651): not this PR's. Its needs table is all success except "images failure", and the step logs "not every job succeeded: images failure".
- **capacity** (job 126406791815): not this PR's. CONFIRMED.
  - "runner 2 CPUs, 7932 MiB … stopped: RUNNER_TOO_SMALL"
  - "the runner has 2 CPUs; the test needs 4"
  - "Postgres would have -260 MiB; the test needs 2048 MiB"
  - "measured no scenario". The cause is the private repository's runner (issue #102).
- **screening-capacity gate** (job 126408607963): not this PR's. `CAPACITY: failure`, so "the capacity measurement did not pass (failure)".

**CI totals against check7's local totals.** CI runs the merge ref with 4846f043 (#94); local ran a8149341 alone.

| Suite | Local (check7, a8149341) | CI (merge ref 95b61061) | Difference |
| --- | --- | --- | --- |
| unit | 435 files; 7,436 passed, 4 skipped (7,440) | 437 files; 7,453 passed, 1 skipped (7,454) | +2 files and +14 tests in all, which the merge ref adds (the base's #94 is on it, e.g. `infra/test/cli-settings.test.ts`). 17 more passed and 3 fewer skipped; skips that run in CI, as verification 1 saw. |
| golden | 5 files, 381 passed | 5 files, 381 passed | equal |
| db | 140 files; 9,674 passed, 1 skipped | 140 files (24 + 24 + 23 + 23 + 23 + 23); 9,675 passed, 0 skipped (2,467 + 862 + 2,693 + 1,939 + 1,482 + 232) | the one local skip (the restore drill, pg_dump 16 against a PostgreSQL 18 server) runs in CI |
| e2e | 70 passed | 70 passed (24 + 23 + 23); shard 1 also regenerated the 4 brand-baseline tests, which passed with the baselines equal | equal |
| oracle | pyx12 4.0.0 agrees with 689 (678 + 11) | pyx12 4.0.1 agrees with 689 (678 + 11) | the pyx12 version differs; the result is the same |
| lint:logs | 1,118 files | 1,119 files | the merge ref |

The merge must still wait for green on a run whose merge ref holds 7bf7b252 (`images`, and with it `all green`) and for the capacity runner (issue #102). It must also wait for the founder's approving review of the latest commit, and the PR leaves draft at the merge step.
