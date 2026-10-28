# dlr-fix-letter (fix round, PR #78) - progress

Worktree /home/user/ux-download-refusals, base head 53c7224 (+ core's uncommitted changes). No commit, no push.
My part: letter.tsx, letter-marks.tsx, letter-contract-check.tsx, letter.test.tsx, letter steps of e2e/download-refusals.spec.ts.

## Status
- [x] read findings/verdicts/core API (SEC-01 letter test already done by core)
- [ ] UX-DLR-03 describedBy/invalidMarks
- [ ] UX-DLR-06 Choose a payer
- [ ] UX-DLR-07 placeholder gone + guard
- [ ] UX-DLR-09 Figure per code
- [ ] UX-DLR-10 messages
- [ ] SEC-02 forget=LETTER_KEPT_KEYS (+ coverage.ts keep, drift test)
- [ ] UX-DLR-15 LetterContractCheck
- [ ] UX-DLR-04 LetterMarks
- [ ] tests, eslint, tsc, e2e

## Log
- 20:2x letter.tsx edited: LETTER_CONTROLS exported (was CONTROLS), MESSAGES plain strings (UX-DLR-10), controlId/errorId, describedBy + invalidMarks (UX-DLR-03), choose -> 'Choose a payer' option (UX-DLR-06), forget={LETTER_CONTROLS} on DownloadRefusal (SEC-02), data-payer on contract options + LetterContractCheck (UX-DLR-15), placeholder deleted (UX-DLR-07), hint two Figures (UX-DLR-09), LetterMarks rendered when marked (UX-DLR-04)
- NEW letter-contract-check.tsx (watchLetterContract pure + LetterContractCheck), letter-marks.tsx (describedWithout, clearMark, watchLetterMarks pure + LetterMarks; message hidden not removed: React owns it)
- next: share.tsx Figure doc, letter.test.tsx, e2e letter steps
- 20:22 tsc apps/web exit 0 (after Pick<HTMLElement,'hidden'> fix); share.tsx Figure doc widened (UX-DLR-09 verdict part 4)
- 20:23 letter.test.tsx updated (placeholder guard, two Figures, messages, Choose a payer + invalid payer case, data-payer, drift test LETTER_CONTROLS == payerLetter.returnTo keep keys + forgetRefusalUrl, LetterMarks fakes, LetterContractCheck fakes; shown() helper reads options with other attributes): vitest 16/16 pass
- next: e2e letter steps
- 20:25 e2e letter steps rewritten: step1 description (UX-DLR-10) returns payerQ; step2 contract held in browser (customError, no request, focus) then noValidate -> server mark, poll held at once (UX-DLR-15); NEW step3 corrected letter downloads, marks cleared, URL clean, reload plain (UX-DLR-04); step4 not_found 'Choose a payer' + checkValidity false + edit clears mark (UX-DLR-06/04a); NEW step5 rate_limited notice + entries leave URL, reload plain (SEC-02); pattern step uses new sendsNoLetter helper; header comment's letter sentences updated
- 20:26 tsc apps/web exit 0; eslint 6 files exit 0 (clean); vitest unit components+lib/http+tools/screening-capacity+tools/brand-copy: 40 files 688 passed; lint:copy pass (530); lint:logs pass (1064); watched.test 6/6
- next: e2e run (download-refusals.spec.ts)
- 20:28 e2e run 1 started (download-refusals.spec.ts --workers=1, E2E_DATABASE=tp_e2e_dlrfl E2E_PORT=3196, build incl.; log progress/dlr-fix-letter-e2e-run1.log)
- 20:29 (during run 1) letter.tsx: ids/htmlFor via controlId() (same ids; cosmetic), helper comment reworded -> rerun tsc/eslint/tests after e2e
- 20:27:32-20:29:25 e2e run 1 (download-refusals.spec.ts --workers=1, tp_e2e_dlrfl/3196, build incl.): 1 passed (1.8m; test 28.2s), exit 0. Build may predate the 20:27:59 controlId edit (same ids) -> run 2 at the end
- 20:30 tsc apps/web exit 0; eslint 6 files exit 0; vitest unit coverage dir + download-refusal.test.tsx + lib/http + watched + brand-copy: 11 files 308 passed
- next: e2e run 2 on final code, cleanup DB, final report
- 20:30:32-20:31:54 e2e run 2 on final code (same command): 1 passed (1.3m; test 28.3s), exit 0
- cleanup: dropped tp_e2e_dlrfl, removed /tmp/tp-e2e-tp_e2e_dlrfl-*; no server on 3196
## DONE (letter part)
