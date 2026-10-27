# PR #78 fix round: re-read and full local suite

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. The base head was 53c7224f (CI green on every check). The merge base with origin/claude/build-platform is e908c214. Nothing was pushed. No rebase, no prettier, no migration, no new dependency, nothing under packages/pricing.

## Commits (53c7224f..HEAD)
- aa4176ff: the fix round, in one commit (29 files). It holds the work of the core, letter, downloads and docs builders. The re-read changed no code. The commit covers SEC-01 to SEC-03 and UX-DLR-01 to UX-DLR-15.
- f4b01073: tools/screening-capacity/watched-paths.txt gains one row, apps/web/src/lib/http/download-refusal-words.ts, written by `watched.ts --write` (download-refusal.ts now imports it). It is a separate commit, as 53c7224f was.

Final head: f4b01073.

## Re-read against reviews-result.json (verdict's fix where it differs)
- SEC-01: fixed. `keptCodes` (lib/http/download-refusal.ts) also returns undefined when `textPhiFindings(codes)` finds anything. There is no separator normalisation. Tests drop '123456789', '19500115' and '919 555 0100', and keep 'L1832, 0101T', 'G2061, 0106T' and 'L2000; 0512T'. letter.test.tsx has the crafted-codes case: no value, still aria-invalid. ADR 0079 D3 and the Consequences match. Holds.
- SEC-02 with UX-DLR-14: fixed. The pure `forgetRefusalUrl(href, also)` is in components/forget-refusal.tsx. `ForgetRefusal` takes `also`, and `DownloadRefusal` takes `forget` and passes it on. The letter passes `LETTER_CONTROLS` (payer, contract, codes); a drift test holds that equal to payerLetter's kept keys. Reports passes `['list']`. The letter's gate is kept: entries are read only beside a refusal. `RefusalNotice`'s page key strips the same keys (verdict point 7). There are unit tests and an e2e step for the letter's notice and for the Reports list. Holds.
- SEC-03: fixed as a comment only (handler.ts `returnParams`, the verdict's wording). Holds.
- UX-DLR-01: fixed.
  - `ForgetRefusal` replaces the URL on a setTimeout with `replaceState(null, ...)` and clears the timer on cleanup.
  - The new components/refusal-notice.tsx holds the notice through a router refresh while `pageOfRefusal` stays the same.
  - The e2e calls `window.next.router.refresh()`. It asserts that the RSC request carries no `refused`, the URL stays clean and the notice stays visible and focused. Then it reloads, and the notice is gone.
  - Holds.
- UX-DLR-02: fixed.
  - `DownloadLink` and `DownloadLinks` are in components/download-link.tsx. A plain primary click fetches the file as a script and saves the blob under its Content-Disposition name. A refusal is said in place with `RefusalAlert` and focused through a ref, because React's autoFocus does not focus a div. The href stays for a new tab, a modifier click or a page without script.
  - It is used by the receipts' Report link and the export review's PDF and CSV, with `refresh` until both files are downloaded.
  - `Uploader` adds a `beforeunload` guard while `stillSending`.
  - The words come from the new lib/http/download-refusal-words.ts, which imports nothing (a test holds this). It is the one source: download-refusal.ts and download-refusal.tsx re-export from it, and next.ts takes `minutesWords` from it. rate-limit.ts (#42) is unchanged, and a test holds `waitMinutes` equal to its `retryMinutes`.
  - There are unit tests for the save and refusal paths, and an e2e step on Uploads (a download in place, then a 429 stand-in said in place and focused, with the page kept).
  - Holds.
- UX-DLR-03: fixed. `describedBy` and `invalidMarks` replace `controlMarks`. All three letter controls write `aria-describedby` as their own attribute. Holds.
- UX-DLR-04: fixed. The new components/coverage/letter-marks.tsx clears a control's mark on input or change. A valid submit clears all marks and takes refused, fields, retry, payer, contract and codes out of the URL. There are unit tests on fakes, and an e2e step (the corrected letter downloads, no marks, a clean URL, and a reload shows the plain form). Holds.
- UX-DLR-05: fixed.
  - The packet page's Forbidden branch says the file's words ("...a billing manager or a firm principal downloads them...") and has `ForgetRefusal` as a sibling. components/shell.tsx is untouched.
  - Narrower-permission check, page against file:
    - Packet page `packet.draft` against PDF and CSV `phi.export`: narrower, done.
    - Reviewer checklist `audit_finding.validate` against the report PDF's `report.read`: narrower, done, with an extra sentence and `ForgetRefusal`.
    - Export review: equal, but `ForgetRefusal` was added anyway.
    - Every other return page takes its file's permission or a broader one. The report page has `report.read` against the CSV's `phi.export`, and every role with `phi.export` also has `report.read`.
  - There is an e2e step (a viewer's packet PDF). Holds.
- UX-DLR-06: fixed. A marked payer that is none of the options shows a plain `<option value="">Choose a payer</option>`, not disabled, and it is the default. The e2e checks that `checkValidity()` is false. Holds.
- UX-DLR-07: fixed. The placeholder is deleted, with a test guard. Holds.
- UX-DLR-08: fixed. Every refusal is titled "Not downloaded". The forbidden body is the disposition's sentence. The console's sentence is kept. Tests cover every status's title. Holds.
- UX-DLR-09: fixed. Each example code is in its own `Figure`, with the comma in the sentence face. Figure's doc comment is widened. Holds.
- UX-DLR-10: fixed. The three messages are now the disposition's words. The tests and e2e are updated. Holds.
- UX-DLR-11: the markup is kept. ADR 0079's Revisit when names the second-merge move (form-issues' FieldError, and `scroll-mt-18` replaced by ADR 0077's `scroll-padding-top`). The PR body still needs this line (Proposals).
- UX-DLR-12: no defect. No change. Holds.
- UX-DLR-13: no defect. ADR 0079's upload-report row now says a zip's file returns to its receipt, which links back to the zip. Holds.
- UX-DLR-15: fixed. components/coverage/letter-contract-check.tsx uses `setCustomValidity` (optgroups are not disabled). Contract options carry `data-payer`. The e2e checks that the contract is held in the browser, that no request is sent, and that the server mark still appears when the form is sent with noValidate. Holds.
- #42 files: `git diff --name-only 53c7224f` against pr42-files.txt touches three files:
  - docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts: against e908c214, 0 removed lines; the DLR rows only, and this round changed only DLR-04's.
  - tools/screening-capacity/watched-paths.txt: 3 added rows, all from the generator (this round's row is re-checked by the suite's `watched.ts --write` plus `git diff`).
- Model identifiers: none in `git diff e908c214 HEAD`. In the commit messages, only the attribution lines.

## Dispositions
Every disposition was followed as the session set it. SEC-01, SEC-02 with UX-DLR-14, SEC-03 (comment only), UX-DLR-01 to UX-DLR-11 and UX-DLR-15 are fixed in aa4176ff. UX-DLR-11's PR line is still open. UX-DLR-12 is not a defect (no change). UX-DLR-13 is not a defect (ADR row).

## Full local suite on f4b01073
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433. Logs are in scratchpad/suite-dlr/*.log.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass (2 s). |
| pnpm check:fixtures | Pass. 333 files read, 3,798 searched. |
| pnpm typecheck | Pass. 22 projects (51 s, cache warm). |
| pnpm lint | Pass. 1,629 files in 3 groups, 0 errors, 0 warnings (124 s). |
| pnpm lint:copy | Pass. 530 files. |
| pnpm lint:logs | Pass. 1,064 files. |
| pnpm verify-content | Pass. |
| tsx tools/engine-freeze/check.ts e908c214 (merge base) | Pass. No non-test file under packages/pricing/src changes. Nothing let through, no problems. |
| pnpm exec tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code watched-paths.txt | Pass. 532 lines, unchanged from f4b01073. |
| pnpm synth --all, then git diff --exit-code | Pass. 240 cases: 0 written, 632 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. The tree is clean. |
| pnpm test | Pass. 383 files: 6,463 passed, 4 skipped (277 s), coverage thresholds met. |
| pnpm test:golden | Pass. 5 files, 376 tests. |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed), and edi835 agrees. |
| pnpm db:migrate (5433, fresh database tp_dlr_migrate, dropped afterwards) | Applied 44 migrations. None were applied beforehand. |
| pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (222 s). |
| pnpm test:db --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (139 s). |
| pnpm test:db --shard=3/6 | Pass. 21 files, 2,510 passed (189 s). |
| pnpm test:db --shard=4/6 | Pass. 21 files, 1,836 passed (145 s). |
| pnpm test:db --shard=5/6 | Pass. 21 files, 1,398 passed (201 s). |
| pnpm test:db --shard=6/6 | Pass. 21 files, 222 passed (93 s). |
| test:db total | 127 files, the same as `vitest list --project db`: 9,222 passed, 1 skipped, 0 failed. |
| pnpm build | Pass (20 s, Turbopack's cache warm). The tree was clean afterwards. |
| build-stamp.ts --write f4b01073… | Stamped f4b01073. The web server read "the build is f4b01073…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr78 E2E_PORT=3178 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 28 passed (6.1 min). download-refusals.spec (DLR-04), packets and reports included. |
| same, --shard=2/2 | Pass. 27 passed (5.3 min). screening.spec and uploads included, so no flake re-run was needed. |
| e2e total | 55 passed, 0 failed (55 tests in 27 files, `playwright test --list`). tp_e2e_pr78 and its /tmp directories were dropped afterwards. |
| tsx tools/stryker/affected.ts --event pull_request --base e908c214 | Money, pricing, ledger and packets are not affected. No shards. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed", "mutation gate: passed". |
| Model identifiers in git diff e908c214 HEAD and the messages | None beyond the attribution lines. |

## Failures

None. No command failed and no flake re-run was needed.

## Proposals
- Refresh the PR #78 description with the fix round:
  - line 25: forbidden "Your role cannot download this file. Ask your organization’s administrator, who manages users and roles."
  - line 31: every title is "Not downloaded"
  - the #74 overlap line (UX-DLR-11): whichever merges second moves the letter onto form-issues' FieldError and drops scroll-mt-18 for ADR 0077's scroll-padding-top
  - the first line's zip case (UX-DLR-13)
  - a fix-round summary
- Nine equal-permission return pages still keep `?refused=` in the address bar on their Forbidden branch: Uploads, an upload's receipt, Reports, an audit report, a report document, an ROI statement, the monthly summary, Coverage and the console's compliance page. Nothing replays because they render no notice. ADR 0079 Consequences records this. The UX-DLR-05 verdict's part 2 (a `ForgetRefusal` beside each `Forbidden`) is a small follow-up.
- The audit report's reviewer checklist (its PDF and CSV links, with ticked boxes) and the packet page's export-history links (typed words) are still plain links, so a refused file there loads the page again. ADR 0079 Revisit when records this. Moving them onto `DownloadLink` would keep that state.
- design §6 in /home/user/ops/designs/lane-b-ux-download-refusals.md still has the old words: R09's title and forbidden body, D6's messages, R16's "ux-forms' Field clears the mark", and D6's "Before the server" does not name LetterContractCheck. Update it to match ADR 0079 (build-ops, not committed here).
- Retake the after-screens whose look changed: p.coverage.error-letter-payer, -contract and -codes at 1280, 1280-dark and 390, and p.report.refused-forbidden and p.packet.refused-forbidden.
- The e2e has no step that ticks the export review's boxes and then forces an in-place refusal (the UX-DLR-02 verdict's third test). The unit tests and the Uploads step cover the in-place path.
- Carried from core: packages/synth/src/cases/registry.ts (#42) could name apps/web/src/lib/http/download-refusal-words.test.ts under DLR-02.
- Carried from the security review, outside this PR: download GETs do not check Sec-Fetch-Site, so a cross-site top-level navigation can start a download and its export record.
