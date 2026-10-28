# Verify UX-DLR-02 (receipts Report / export review links lost download)
Started 2026-10-27. Clone: scratchpad/verify-ux02 at 63aaa7f4.
## Checked
(in progress)
- Diff confirmed: receipts.tsx:181 and review/page.tsx:129,138 dropped `download` (ADR 0079 D4); uploadReport rateLimit 'export' (uploads.ts:378), returnTo /uploads with from=uploads.
- Export bucket 60/user/600s + 300/address/600s shared by 16 download routes (rate-limit.ts:44). Receipts poll is not in it.
- Uploader: request URLs for whole batch, then XHR PUT 3 at a time (uploader.tsx:111-139, 217-224); no beforeunload. Only Uploads page shows receipts beside a live uploader (contracts/reconciliation showReceipts={false}).
- Report refusals reachable: rate_limited (main); not_found only if doc gone; forbidden practice.open; signed-out -> sign-in (uploads' complete POST would fail anyway).
- Review page: 7 confirm_ checkboxes render only after downloadedBoth (review/page.tsx:333-364); re-download refusal then reloads -> ticks lost.
- ADR 0079 and design never discuss live-state loss.
- Browser probe (scratchpad/verify-ux02-probe/probe.cjs, log probe.log; Chromium 141, standalone server, synthetic):
  A link w/o download + attachment: same document, PUT completes (success path fine).
  B link w/o download + 303 -> HTML: new document, server saw the PUT aborted (the finding's mechanism).
  C beforeunload guard + link w/o download + attachment: "beforeunload" dialog fires on a SUCCESSFUL download -> guard only safe once Report no longer navigates (finding right).
  D/E link with download: Dest=empty, no beforeunload, page stays (pre-PR shape).
- Screens: p.uploads.default.1280 shows Report links right under the drop zone; uploads up to 2.0 GiB, 100 per batch -> minutes in flight.
- DownloadRefusal words: downloadRefusalWords exists (download-refusal.tsx:28); JSON refusal body = outcome + Retry-After (handler.ts:78-86).
- DLR-04 e2e covers Coverage letter + report CSV only; not Uploads or the review.
## Verdict
REAL, should-fix right (regression of D4; narrow trigger = export-bucket rate limit while a batch uploads; review part minor).
Fix right in kind; amend: filename from Content-Disposition, deferred revoke, signed-out/maintenance -> location.assign(href), router.refresh() on review after success, client-safe words module, tests + ADR D4 amendment.
## Resumed run (2026-10-27): re-checked at 63aaa7f4
- Confirmed again: receipts.tsx:181 (no download), review/page.tsx:129,138 (no download), handler.ts:293-300 isNavigation (navigate+document -> 303), no beforeunload anywhere in apps/web/src, uploader.tsx:111-139 XHR PUT.
- Extra: reports/[reportId]/review/page.tsx:48,52 never had download (pre-PR a refusal opened a JSON page); its checklist (line 115) loses ticks too. Not a regression, but the same client wrapper should cover it.
- lib/http/download-refusal.ts imports @tp/observability, rate-limit, sign-in-for: not client-safe; the client must import words from a client-safe module (split it).
## Final verdict: REAL, should-fix (unchanged). Fix right in kind, with the amendments above.
