# dlr-fix-core (fix round, PR #78) - progress

Worktree /home/user/ux-download-refusals, base head 53c7224. No commit, no push.

## Status
- [x] read findings + code (started)
- [x] words module (client-safe)
- [x] SEC-01 keptCodes + tests
- [x] SEC-03 handler comment
- [x] UX-DLR-01 forget-refusal setTimeout/null + RefusalNotice latch
- [x] SEC-02/UX-DLR-14 forgetRefusalUrl(also), DownloadRefusal forget, Reports list
- [x] UX-DLR-08 words + tests
- [x] eslint / tsc / unit tests
- [x] dlr-fix-api.md

## Notes
- rate-limit.ts is a PR #42 file: not edited.
- 19:5x wrote apps/web/src/lib/http/download-refusal-words.ts (client-safe: DOWNLOAD_REFUSALS, REFUSED_FIELD, MAX_*, refusedFields, waitMinutes, RefusedDownload, refusedDownloadOf, minutesWords, DownloadSurface, DownloadRefusalWords, NOT_DOWNLOADED, downloadRefusalWords with UX-DLR-08 words)
- next: rewire download-refusal.ts (re-export, refusalLocation via refusedDownloadOf, keptCodes SEC-01), components, next.ts
- SEC-03 comment done (handler.ts returnParams); SEC-01 keptCodes done; next.ts imports minutesWords from download-refusal-words
- forget-refusal.tsx rewritten: forgetRefusalUrl(href, also), pageOfRefusal(pathname, search, also), ForgetRefusal({also}) setTimeout + replaceState(null,...)
- NEW components/refusal-notice.tsx ('use client'): ShownRefusal, HeldRefusal, heldRefusal(held, notice, page), RefusalNotice({notice, forget, className}) latch keyed on pageOfRefusal (strips refusal keys + forget)
- download-refusal.tsx: words moved out (re-exported), DownloadRefusal({refusal, surface, forget, className}) always renders RefusalNotice
- next: reports/page.tsx forget list; tests; e2e
- reports/page.tsx: RETURN_ONLY=['list'] passed as forget to both notices
- tests: download-refusal.test.ts (SEC-01 cases), NEW download-refusal-words.test.ts, download-refusal.test.tsx (words, forgetRefusalUrl, pageOfRefusal, heldRefusal), letter.test.tsx (forbidden words + SEC-01 case)
- e2e: download-refusals.spec.ts: UX-DLR-08 words, router.refresh step (UX-DLR-01), Reports list=documents step (UX-DLR-14)
- 20:00 vitest 4 files 173 passed; 20:01 tsc apps/web exit 0; 20:03 eslint 13 files clean
- next: watched.test.ts / brand scan, e2e run, api file
- 20:02 watched.test failed as expected (new file in screening closure) -> watched.ts --write added 1 row (download-refusal-words.ts) -> 6/6 pass
- 20:03-20:06 e2e run 1 (download-refusals.spec.ts, E2E_DATABASE=tp_e2e_dlrfc E2E_PORT=3197, build included): 1 passed (2.6m), exit 0
- 20:06 refactor: RefusalAlert extracted (refusal-notice.tsx), ShownRefusal + shownRefusal moved to words module; test added
- 20:06 vitest 8 files 287 passed; tsc exit 0; eslint exit 0; lint:copy pass (527); lint:logs pass (1061)
- API file written: progress/dlr-fix-api.md
- 20:08 e2e run 2 started (download-refusals, reports, packets, uploads, mapping --workers=2)
- 20:1x dropped refusedDownloadOf from download-refusal.ts's re-export (only names it exported before)
- 20:08-20:12 e2e run 2 (download-refusals, reports, packets, uploads, mapping --workers=2; tp_e2e_dlrfc/3197; build incl.): 10 passed (4.0m), exit 0
- 20:12 after the re-export trim: tsc exit 0; eslint exit 0; vitest unit apps/web/src/lib/http + apps/web/src/components + watched + brand scan: 34 files, 501 passed
- cleanup: dropped tp_e2e_dlrfc, removed /tmp/tp-e2e-tp_e2e_dlrfc-*; no server on 3197
## DONE (core part). API in progress/dlr-fix-api.md
