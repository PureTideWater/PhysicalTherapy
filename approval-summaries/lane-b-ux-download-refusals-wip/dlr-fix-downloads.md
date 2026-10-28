# dlr-fix-downloads (fix round PR #78): UX-DLR-02 + UX-DLR-05
Worktree /home/user/ux-download-refusals (head 53c7224, uncommitted; core builder's changes present).
Started 2026-10-27.
## Done
- 20:2x NEW apps/web/src/components/download-link.tsx: attachmentFilename, fetchDownload(href, fetcher), saveFile, isPlainClick, DownloadLinks({arrived, children}) context (outer one wins; in-place notice replaces the arrived 303 notice; file saved clears it), DownloadLink({href, children, className, surface, refresh}) (RefreshOnSave child reads router only when refresh).
- Plan: receipts.tsx Report -> DownloadLink inside DownloadLinks in its section; uploader.tsx wraps receiptsNotice+ReceiptList in DownloadLinks(arrived) + beforeunload guard (stillSending); review page files -> DownloadLink refresh={!downloadedBoth}, one CardContent with DownloadLinks(arrived=DownloadRefusal); packet page Forbidden (verdict words + ForgetRefusal sibling); report review checklist Forbidden (narrower than PDF's report.read) same; unit tests download-link.test.tsx, uploader stillSending test; e2e step at END of download-refusals.spec.ts (Uploads Report in place: success download + page.route 429 refusal in place).
## Commands
- 20:2x receipts.tsx: Report -> DownloadLink; table block inside DownloadLinks (section). uploader.tsx: stillSending(batch) exported + useLeaveGuard(beforeunload: preventDefault + returnValue='') while sending; receiptsNotice+ReceiptList inside DownloadLinks(arrived). Doc comments updated.
- 20:2x review page (packet/[versionId]/review): PDF/CSV -> DownloadLink refresh={!downloadedBoth}; one CardContent with DownloadLinks(arrived=<DownloadRefusal/>, always rendered so the latch holds); "Then reload this page." -> "The checklist opens here once both are downloaded; after a download in another tab, reload this page."; Forbidden branch + ForgetRefusal sibling.
- 20:2x packet page Forbidden: verdict's words when refused=forbidden + ForgetRefusal sibling (no also: version is the page's own). reports/[reportId]/review Forbidden (page narrower than the PDF's report.read): extra nextStep sentence when a refusal is present + ForgetRefusal.
- tests: NEW components/download-link.test.tsx (11), NEW components/uploads/uploader.test.tsx (2).
## Commands
- 20:29 vitest unit download-link.test.tsx + uploader.test.tsx: first run 2 failed (my expected markup: data-arrived="true"), fixed -> 14 passed
- 20:29 tsc apps/web (flock): exit 0
- 20:30 eslint 8 touched files: exit 0
- NEXT: e2e steps at END of download-refusals.spec.ts (Uploads Report in place + packet PDF forbidden to a viewer), then run e2e.
- 20:31 found: React focuses autoFocus only on button/input/select/textarea (react-dom commitMount), so a client-mounted RefusalAlert is NOT focused (the 303's works by the browser's own autofocus on load). DownloadLinks wraps the in-place notice in <div key={attempt} ref={focusNotice}> which focuses [data-download-refusal]. (core's api note "React focuses it when it mounts on the client" is wrong for a div -> notes)
- 20:32 e2e steps appended at END of download-refusals.spec.ts: NO_CASE/NO_VERSION consts; "a receipt's report downloads in place on Uploads ..." (download event name receipt-<uuid>.csv, same document mark, page.route 429 stand-in -> notice focused, words, URL same, a11y, unroute -> download clears notice); "a viewer who opens a packet's PDF lands on the packet's permission state ..." (words, no 'an analyst', URL clean, no notice). Spec doc comment extended.
- 20:32 eslint spec + download-link: exit 0; 20:32 tsc apps/web (incl e2e): exit 0; 20:33 vitest download-link + uploader + download-refusal tests: 33 passed; lint:copy pass (530); lint:logs pass (1064); vitest tools/screening-capacity + tools/brand-copy: 8 files 230 passed
- NEXT: e2e run (download-refusals, packets, uploads, unattested) E2E_DATABASE=tp_e2e_dlrfd E2E_PORT=3198
- 20:34 e2e run 1 started in background (flock): download-refusals, packets, uploads, unattested --workers=2; tp_e2e_dlrfd/3198; log progress/dlr-fix-downloads-e2e-run1.log
- 20:3x comment-only edits after the run started: review page doc comment ("the page is read again (router.refresh)"), download-link.tsx DownloadLinks doc comment.
## Notes for the report (outside my files)
- Equal-permission return pages' Forbidden branches still keep ?refused= in the URL (no ForgetRefusal): console/compliance/page.tsx:93, coverage/page.tsx:105, reports/monthly/page.tsx:36, reports/page.tsx:64 (also forget RETURN_ONLY), reports/[reportId]/page.tsx:36, reports/documents/[documentId]/page.tsx:33, reports/roi/[statementId]/page.tsx:33, uploads/page.tsx:26, uploads/[documentId]/page.tsx:253.
- reports/[reportId]/review/page.tsx's PDF/CSV links (checklist ticks) and packet/page.tsx's export-history PDF/CSV links (a typed narrative) would keep their state with DownloadLink; console/compliance export lost `download` too.
- core's API note: "autoFocus (React focuses it when it mounts on the client)" is false for a div (react-dom commitMount focuses only button/input/select/textarea); the 303 notice is focused by the browser's own autofocus on load.
- ADR 0079 D4 amendment wording for the ADR builder.
- 20:34-20:40 e2e run 1: 6 passed (packets x2 incl. the reviewer's DownloadLink downloads, unattested, uploads x3), 1 failed: download-refusals at my Uploads step line 350 (waitForEvent download timed out). Snapshot: the FIRST receipt is a contract doc (id 04b688ff-3593-b95b-..., inserted by the e2e's signedOffSchedule) whose report is not_found -> the in-place notice showed "Not downloaded / This file is not available here now..." and was FOCUSED (so the in-place path works). Fix: target the row with '835 remittance'.
- 20:42-20:43 e2e run 2 (download-refusals.spec.ts --workers=1, build incl.; tp_e2e_dlrfd/3198): 1 passed (1.4m), exit 0 (both new steps pass). log progress/dlr-fix-downloads-e2e-run2.log
- 20:44 final: vitest unit (download-link, uploader, download-refusal, lib/http): 10 files 256 passed; tsc apps/web exit 0; eslint 9 touched files exit 0
- cleanup: dropped tp_e2e_dlrfd, removed /tmp/tp-e2e-tp_e2e_dlrfd-*; no server on 3198
## DONE (UX-DLR-02 + UX-DLR-05). No commit, no push.
