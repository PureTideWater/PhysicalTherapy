# PR #85 fresh-clone verification (head 0f7a12bbbc98962b3b5f0d813a7559f9b409ec8a)

## Verdict: FAIL (not merge-ready)

CI on 0f7a12bb is green and every boundary held. Two things block the merge:
- **The base moved.** origin/claude/build-platform is now **45d7d0c1** (#108 merged at 11:44Z), so 0f7a12bb is behind its base. GitHub requires the branch to be up to date (the orchestrator's 07:48 rule), so the base has to be merged again and CI run again.
- **The description has false or stale claims**, listed below.

The code needs no change. A trial merge of 45d7d0c1 into 0f7a12bb is clean:
- `git merge-tree` gives tree b2772059, with no conflict.
- Only four files overlap: forms-harness.tsx and the three shared documents.
- `synth --all` reports 296 cases, 0 written. `watched.ts --write` reports 553 lines.
- The packets and uploads vitest run passes: 5 files, 60 tests.
- The trial merge was aborted. The clone is back at head and clean.

## What must change
1. **Merge 45d7d0c1 (#108) into the branch.** Then run the fast checks and generators, push, wait for CI to go green on the new head, and merge promptly.
2. **Head, base and the merge row.** Lines 3, 5, 94 and 165 say the head is 0f7a12bb "on base 24531dc2". After step 1 the head is a new merge commit, so:
   - add a row for the merge of 45d7d0c1 (#108: no conflict; both sides kept in forms-harness.tsx and the three shared documents);
   - update the 13-file statement at :165 (it describes the 24531dc2 merge only);
   - update the CI line.
3. **#108 is no longer an open pull request.** Line 134 lists "#108 (e156d948): forms-harness.tsx and the three shared documents" as open, but #108 is merged (base 45d7d0c1). Move it to the merged items.
4. **#104's head is stale.** Line 133 says "#104 (7076d64e)". #104's head is now **d214ad6c** (updated 11:30Z). It still shares the same seven files: uploader.tsx, lib/routes/uploads.ts, uploads.db.test.ts, billing-routes.db.test.ts and the three shared documents.
5. **The merge of #75 brought eleven pull requests, not nine.** Lines 5 and 74 say "#75 … with nine more pull requests since a97d6011's base (#92, #93, #90, #42, #95, #91, #94, #107, #105)". But:
   - a97d6011's merge base is 83d71fd6;
   - 43565235 (#83) and bce57f16 (#82) are not ancestors of a97d6011;
   - so f03381de also brought in **#82** and **#83**.

   Say eleven, and name #82 and #83. merge75.md's "43565235 = #83's merge, already in" is false, which is where this came from.
6. **#82 is missing from the workflow list.** Line 151, "the workflow and lockfile changes in the merges are the base's (#90, #42, #91, #94, #107, #106, #86)", leaves out **#82**. #82 changed five workflows: ci.yml, release-capacity.yml, release-dry-run.yml, release.yml and screening-capacity.yml. Also, #91 changed only .github/dependabot.yml, which is not a workflow.
7. **The design 6.1 sentence is stale.** Line 39 says "two card description rows corrected at f82a536e, the file's latest commit. Bringing it to a57812ac's and 7e579010's words … is not yet committed to `claude/build-ops`". But **5276c7b1** (11:34Z, on origin/claude/build-ops) is now the file's latest commit, and it does exactly this: it adds the Contracts title, drop zone and refusal rows, and the Uploads drop zone rows.
8. **The tour sentence is stale.** Line 262 says "The tour's `CONTRACT_UPLOAD` pattern on `claude/build-ops` (ddd6fd1f) does not yet take the new title; that change is not yet committed". But 5276c7b1 changed tour.spec.ts:720 to accept ", exhibit or payer’s terms or policy letter".
9. **Fill in the CI line.** Line 163 still says `<!-- ci -->pending<!-- /ci -->`. Fill it in for the new head once its CI completes.

Not false, noted only:
- The local test:oracle row (:182) says pyx12 4.0.0, while CI used 4.0.1. The row is labelled local, so it is accurate.
- The "6 files, 84 passed" row (:198) is labelled f03381de/32bfde40. On head the same set gives 86, after 4db214ef's tests.
- The PR is still a **draft**. It must be marked ready before it merges. That is not mine to do.

## 1. Clone
- Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/verify85-clone
- Detached at 0f7a12bbbc98962b3b5f0d813a7559f9b409ec8a. `ls-remote` shows origin co-001/ux-payer-response still at that SHA.
- `pnpm install --frozen-lockfile` ran clean.

## 2. Claims checked and true
- **Ancestry.** Every named commit is an ancestor of head, with the parents the body says: 29dded52, 90ec40ab (merges 83d71fd6), 2865db68, cf6d0f42, 13e4e2fe, a97d6011, f03381de (a97d6011 + 72096e94), 32bfde40, a57812ac, 7e579010, 4db214ef, 0f7a12bb (4db214ef + 24531dc2).
- **Each commit touches what it claims:**
  - 32bfde40: packets.spec only, `selectOption('contract')`.
  - a57812ac: contracts page, tagging.ts RESPONSE_LETTER_NOT_A_SOURCE, the contracts and packets e2e, and the workbench db test.
  - 7e579010: uploads page heading, uploader default heading, its unit test, and the uploads e2e.
  - 4db214ef: tests only, in two files.
- **Merge of 72096e94.** A re-run with `git merge-tree a97d6011 72096e94` conflicts in exactly the four files named: uploader.tsx, contracts/page.tsx, display.test.tsx and e2e/uploads.spec.ts.
- **Merge of 24531dc2.** `merge-tree 4db214ef 24531dc2` is clean, and its tree equals 0f7a12bb's tree (11c57654). It changes exactly the 13 base files named, none under apps/web.
- **File counts.** The PR changes 44 files (`git diff 24531dc2 HEAD`, and `origin/claude/build-platform...HEAD` at the time). a97d6011 against 83d71fd6 changed 41. The 3 added are e2e/contracts.spec.ts, uploads/page.tsx and uploader.test.tsx.
- **Design 3.7, the #75 row:**
  - `KindField` shows only with more than one kind; `startingKind` (unchanged from #75) starts a lone kind chosen.
  - `single` refuses through `batchProblems` and `afterChoosing`.
  - #75's held Upload and Clear were already `type="button"` at 72096e94 (:466, :470). Retry gains `type="button"` here (:908).
  - `headingLevel` applies.
  - The Contracts page uses `kinds={upload.kinds}`, labelled from CONTRACT_KIND_LABELS (routes/contracts.ts:139).
  - The response-letter sentence sits beside #75's description.
  - The test that no uploader button submits the form exists (4db214ef).
- **display.test.tsx.** 23 tests at 72096e94, 26 at head, no duplicate name. The 3 added are the Exports empty-state tests.
- **uploader.test.tsx.** The gate has `title: null`. There are tests for a lone kind (no select, PDF only, no `multiple`), for single mode in `batchProblems` and `afterChoosing`, for `type="button"` on Clear and on "Upload 2 files", and for the default heading "Choose 835 files to upload" with no "Drop".
- **User-facing strings.** Every string in the body's "Every visible and wording change" section was found in apps/web/src (about 50 checked). "Drop 835 files or ERA exports here" is gone. "Drop zone" survives only in a code comment.
- **Behaviour:**
  - `responseDocumentChoosable` takes the `document_use:` lock, then requires the document to be top-level, of kind payer_letter or other, clean and stored, and not a source of any contract_version.
  - The write-off refuses a contradicted "Window passed" inside `writtenOffReason === null`, before the UPDATE.
  - receivedOn is required, with min = the submission date and max = today. An empty value is refused with "enter the date the payer’s letter was received".
  - Letter options start "Uploaded here, ", then the time, the kind and the SHA-256 prefix.
- **Other checks:**
  - ADR 0085 exists.
  - CAS-45 to CAS-48 are no-file registry entries. CAS is section 5 of the test matrix.
  - The headings match .github/pull_request_template.md.
  - The fix75.md record of both merge reviews ({"findings": []}) exists.
- **Local totals against check75.md** (body :175 to :194). All match: unit 7,488 + 4 skipped; golden 381; db 9,684 + 1 skipped (3,222 / 2,802 / 2,672 / 988); e2e 70; synth 292 / 0 written / 693 unchanged; watched 553; gitleaks 237 commits; lint 1,764; lint:logs 1,123; lint:copy 560; check:fixtures 342 / 4,060.

## 3. Boundaries: held
- `git diff --stat origin/claude/build-platform...HEAD` (44 files) has nothing under content/releases, fixtures/golden, packages/db/migrations, packages/db/functions, non-test packages/pricing/src, packages/ledger/src or apps/worker/src/reconcile. It also has no workflow, manifest, lockfile, domain-model.md or approvers.json.
- No model name or identifier appears in this PR's added lines, or in the messages of its 6 commits since a97d6011 (the attribution trailer excepted).
- `pnpm check:fixtures` passes: 342 guard files, 4,060 text files, every interchange synthetic.
- **#75's PHI guard is intact:**
  - The Uploads page keeps `initialKind="x12_835"`.
  - Contracts (3 kinds) and Reconciliation (2 kinds) pass no initialKind, so they start unchosen.
  - Once a file waits, `afterChoosing` holds it, and it is sent only on the explicit Upload press.
- **Trailers.** All 6 commits since a97d6011 carry `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J`.

## 4. Local checks in the clone (on 0f7a12bb)
- `pnpm typecheck`: pass, 22 projects.
- `pnpm lint:logs`: pass, 1,123 files. `pnpm lint:copy`: pass, 560 files. `pnpm check:fixtures`: pass.
- vitest unit and browser tests under components/uploads, reconciliation and packets: 6 files, 86 passed.
- synth and tools unit tests: 96 files, 1,502 passed, 3 skipped.
- `pnpm synth --all`: 292 cases, 0 written, 693 unchanged. EMR: 0 written, 16 unchanged.
- `watched.ts --write`: 553 lines. The tree is unchanged.
- **4db214ef's tests fail without the fix.** `type="button"` was removed in a scratch edit of uploader.tsx, then restored. The run covered uploader.test.tsx and response-letter.browser.test.tsx:

  | Edit | Result | Failing tests |
  | --- | --- | --- |
  | Upload :521 off | 2 fail | the browser test "CAS-47: a refused upload request keeps the letter waiting…"; HeldFiles "upload only on the explicit Upload button" |
  | Clear :525 off | 3 fail | the same browser test; both HeldFiles tests |
  | Both off | 3 fail | as for Clear |
  | Restored | 51 pass | none |

  Tree clean afterwards.

## 5. CI on 0f7a12bb: all 22 check runs completed
| Check | Result |
| --- | --- |
| all green | success (required) |
| mutation | success (required) |
| screening-capacity gate | success (required, 12:06Z) |
| approval-of-record | success (required) |
| unit | success on the re-run (job 126547247375) |
| static, lint, build, images, domain model | success |
| db 1/4 to 4/4 | success |
| e2e 1/2, 2/2 | success |
| capacity | success |
| changes (x2), .github/dependabot.yml | success |
| stryker | skipped (no shard affected) |
| notify | skipped |

**The unit failure.** unit's first attempt (job 126540094158) **failed**, and it is not this PR's:
- The failing test is `packages/model-gateway/src/redact.property.test.ts:384`, MOD-13's unseeded property, on seed 460548619.
- The counterexample is a member ID 19900101 written "1990-01-01" after "Patient: AA CLAIM.\nID:". It was not redacted (`expected undefined to be defined`). That run had 1 failed and 7,504 passed.
- I reproduced it deterministically in the clone with that seed and path.
- packages/model-gateway is identical between base and head, so this is a base defect (redact.ts) that surfaced as a flake. The orchestrator re-ran the job. The fix belongs on its own branch.

**CI totals against check75.md (local, 4db214ef):**

| Suite | CI on 0f7a12bb | Local | Agrees? |
| --- | --- | --- | --- |
| unit (re-run) | 439 files; 7,505 passed, 1 skipped (7,506) | 7,488 + 4 skipped (7,492) | Same file count. CI is a different commit (24531dc2 merged in) and a different environment, so the totals differ. |
| golden | 5 files, 381 passed | 381 | Yes |
| db | 140 files, 9,685 passed, 0 skipped (3,223 / 2,802 / 2,672 / 988) | 9,684 + 1 skipped | Yes: CI ran the restore-drill test that skips locally |
| e2e | 35 + 35 = 70 passed | 70 | Yes |
| oracle | pyx12 4.0.1, 689 fixtures | pyx12 4.0.0, 689 | Same fixture count; different pyx12 version |

Progress: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/progress/verify85.md
