# PR #85 check, round 2 (closing the critic's NOT-READY gaps)

Worktree /home/user/ux-payer-response, branch co-001/ux-payer-response. Origin head is still a97d6011; nothing was pushed. Round 2 started at 7e579010 with a clean tree. Round 1's record was complete, and its text is kept in the progress file. Final HEAD is **4db214ef9a113a1b921fcf7e880cabb3011c0fb3**, and the tree is clean.

## Commit (local, never pushed; ends with the given Co-Authored-By / Claude-Session trailer)
- 4db214ef "Payer response letter: test that a refused upload's waiting letter never submits the form". It changes two test files and no product code:
  - apps/web/src/components/packets/response-letter.browser.test.tsx
  - apps/web/src/components/uploads/uploader.test.tsx
- No model identifier appears in the added lines (checked by grep), and there is no migration. The engine and ledger are untouched.

## Gap 1: the held-files buttons inside the form (design 3.7, the #75 row): closed
- `standIn` has a new field `request: 'ok' | 'refuse'` and counts calls in `requests`. In refuse mode the request route answers 400 `{status:'invalid', issues:[{message:'SYNTHETIC: the upload request was refused.'}]}`.
- New browser test: "CAS-47: a refused upload request keeps the letter waiting in the form; its Upload and Clear send nothing of the form, Enter in Amount sends the response once and presses neither, and leaving asks until Clear". It does this:
  1. Fills the letter (on file), Response and Amount first. That way any button that submitted the form would actually post the response, instead of stopping on an empty required field.
  2. Refuses the request and chooses the file. It checks that the refusal alert shows, that the group "Waiting to upload: 1 file" is inside the `form` with the file name, that there is no "This batch", that the status is `none`, and that there was 1 request.
  3. Presses "Upload 1 file". The server refuses again (2 requests) and the letter still waits. `calls(page)` has length 0 and there is no summary.
  4. Presses Enter in Amount while the letter waits. The response posts once, with documentId = the on-file letter, kind partial and amount 60.00. There is still no new request, and the letter still waits, so Enter pressed neither Upload nor Clear.
  5. Presses "Clear". The group is detached, `calls` is still 1 and requests are still 2.
- HeldFiles unit tests:
  - `type="button"` is asserted on Clear, in both tests;
  - `type="button"` is asserted on "Upload 2 files".
- **Failing first.** Each `type` was taken off in place in uploader.tsx, never committed, and restored with `git checkout`. The diffs are in scratch/notype-upload.diff and scratch/notype-clear.diff; the logs are scratch/logs/failfirst-upload.log and failfirst-clear.log.
  - Upload's type off: the new browser test fails at :498, where `waitForSelector(SUMMARY)` times out because Enter pressed the uploader's Upload instead of the form's button. The HeldFiles test "upload only on the explicit Upload button" also fails.
  - Clear's type off: the same browser failure at :498, and both HeldFiles tests fail.
  - With the types in place, the 2 browser tests and both HeldFiles tests pass.
- **Clicking alone cannot fail.** A first draft of the test only clicked Upload and Clear. It still passed with the type taken off. Both handlers empty `held`, so the button is removed from the DOM during the click. A button that is no longer connected never submits its form.
  - So the real risk is implicit submission: Enter in a field would press the uploader's button. The test now covers that by pressing Enter while the letter waits. The click checks stay as well.

## Gap 2: the test name, and the browser asking while the letter waits: closed
- `CAS-47: inside the form, leaving asks only while the letter is being sent; …` is renamed to `CAS-47: inside the form, leaving asks while the letter is being sent or waits to upload, not after a failed PUT; a Retry that sends it again asks again, and the press after the upload meets no question`.
- `asks()` is now a shared module helper, `asksBeforeLeaving(page)`, which dispatches a cancelable `beforeunload`.
- The Gap 1 test checks `asksBeforeLeaving` at three points:
  - true while the refused letter waits;
  - still true after the second refusal;
  - false after Clear.
- Same commit as Gap 1.

## Gap 3: the merge's two adversarial reviews: NOT closable from this lane (for the orchestrator)
- The status file's 07:40 entry (/home/user/ops/approval-summaries/lane-b-ux-payer-response-status.md:119) plans two reviews of the merge, with one skeptic per finding:
  - the resolution's safety;
  - both sides and UX.
- Neither has any record:
  - there is no fix75.md;
  - there is no review output anywhere under scratchpad/pay;
  - the wip folder has only rev85-*/pay-rerev-* files from earlier rounds, and nothing for the 72096e94 merge.
- This step cannot confirm the reviews ran. Before the push, the orchestrator must do one of two things:
  - confirm they ran and found nothing, and record that;
  - or run them on 4db214ef.

## Full local suite, once on 4db214ef (each heavy step under flock /tmp/laneb-heavy.lock; logs scratch/logs2/)
The commit changes only tests, so the full suite on the new HEAD includes every rerun Gap 1 asked for: packets/uploads browser and unit tests, typecheck, lint, build, and the e2e that touch the form.

| step | result |
|---|---|
| pnpm typecheck | passed: 22 projects; exit 0 |
| pnpm lint | passed: 1,764 files in 3 groups, 0 errors, 0 warnings |
| pnpm lint:logs | 1123 files scanned; every log call uses allowlisted fields |
| pnpm lint:copy | 560 files read; the product copy keeps the brand's words |
| pnpm test (unit) | 439 files passed; **7488 passed**, 4 skipped (7492); 513 s. That is round 1's 7487 plus the new browser test |
| pnpm test:golden | 5 files; 381 passed |
| pnpm test:oracle | pyx12 4.0.0 agrees with all 689 synthetic 835s (678 valid with identical summaries, 11 malformed rejected); packages/edi835 agrees on every segment, amount, balance and verdict |
| pnpm synth --all | 292 cases: 0 written, 693 unchanged, 0 removed. 8 EMR formats: 0 written, 16 unchanged. Tree unchanged |
| watched.ts --write | 553 lines; tree unchanged |
| pnpm test:db 1/4 | 35 files; 3222 passed, 1 skipped (3223); 821 s |
| pnpm test:db 2/4 | 35 files; 2802 passed; 301 s |
| pnpm test:db 3/4 | 35 files; 2672 passed; 594 s |
| pnpm test:db 4/4 | 35 files; 988 passed; 209 s |
| test:db, all shards | 140 distinct files in the union of the shards' JSON lists. 9684 passed, 1 skipped (restore-drill, which skips without its environment). Each shard ran on its own fresh PG18 database at 5433 (tp_check75r2_db1..4) after `pnpm db:migrate`, then the database was dropped |
| stryker affected.ts --event pull_request --base origin/claude/build-platform | origin/claude/build-platform is now 24531dc2; diffed from the merge base 72096e94. any=false, packages=[], shards=[] |
| stryker shards + gate | No shard is affected. By mutation.yml's logic the gate reports no money path changed and runs no mutation. Pass |
| engine-freeze check.ts 72096e94 | exit 0; the exception lets through nothing; problems none |
| pnpm check:fixtures | 342 files read by the guard, 4060 text files searched for an X12 header; every interchange is synthetic |
| pnpm verify-content | every content set passes (content/drafts: 10 records, no problems) |
| pnpm build | exit 0. BUILD_COMMIT stamped as ci.yml does; "build-stamp: the build is 4db214ef…'s" |
| E2E_PREBUILT=1 pnpm test:e2e --workers=2 | **70 passed** (14.1 min). E2E_DATABASE=tp_e2e_check75r2, E2E_PORT=3488, admin at 5433. The database was dropped and the tree is clean |
| gitleaks 8.24.3 git --log-opts=a97d6011..HEAD | the clone is not shallow; 237 commits scanned; no leaks found; exit 0 |
| pre-push hook standalone (remote sha a97d6011) | "5 commits checked: 0 file(s) read by the fixture guard, 32 text file(s) searched for an X12 header, and gitleaks found no secret"; exit 0 |

No step failed and none was rerun. The only code change, the commit, came before the suite.

## Still open after the push (unchanged from round 1; not blockers, for the orchestrator)
- **PR description.** /home/user/ops/approval-summaries/lane-b-ux-payer-response-wip/pr85-body.md:28, :91 and :195 still say "payer’s terms letter" and "Drop 835 files or ERA exports here". The description should also carry merge75.md's WHAT-CHANGED lines and this round's new test.
- **Design 6.1.** /home/user/ops/designs/lane-b-ux-payer-response.md:1269-1270 and :1286 still have the old strings.
- **Screen tour.** The `CONTRACT_UPLOAD` regex at /home/user/ops/tools/lane-b-screen-tour/capture/tour.spec.ts:719 needs `, exhibit or payer’s terms or policy letter`.
- **Base moved.** origin/claude/build-platform is at 24531dc2, past this branch's merge base 72096e94. Round 1's check found no conflict with `git merge-tree`, and this round did not merge it in.

## End state
- HEAD 4db214ef; tree clean; nothing pushed.
- 5433 holds only postgres, template0 and template1. No /tmp/tp-e2e-tp_e2e_check75r2-* directories are left.
- Progress: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/progress/check75.md
- Logs: /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/scratch/logs2/ (suite) and /tmp/claude-0/-home-user-PhysicalTherapy/e19abd3f-a55e-5749-a0e9-7b2833d14390/scratchpad/pay/scratch/logs/failfirst-*.log (failing-first runs)
