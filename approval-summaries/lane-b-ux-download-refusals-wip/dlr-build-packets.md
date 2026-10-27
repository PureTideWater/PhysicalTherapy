# dlr-build-packets progress (builder: packet, upload and console downloads, UX PR 5)
Worktree: /home/user/ux-download-refusals (no commits by me)
## Status
- [x] read design, api, core
- [x] routes: packets.ts (packetPdf, packetCsv, reviewPacketPdf, reviewPacketCsv), uploads.ts uploadReport, compliance.ts exportEvidence
- [x] pages (no reconciliation/contracts: no receipts there): cases/[caseId]/packet, packet/[versionId]/review, uploads/[documentId], reconciliation, contracts, console/compliance
- [x] receipts.tsx (+ uploader.tsx reportFrom/receiptsNotice slot, receipt-labels.ts REPORT_FROM/reportHref): drop download, ?from= prop
- [x] tests appended to download-refusal.test.ts
- [x] checks: eslint, tsc, vitest
## Commands run
## Decisions
- receipts.tsx's report link renders on /p/[id]/uploads (Uploader, showReceipts default) and /p/[id]/uploads/[documentId] (zip's files, ReceiptList). NOT on reconciliation/contracts (both pass showReceipts={false}) -> no from=reconciliation/contracts.
- uploadReport: from=uploads -> /uploads; default -> the file's own receipt page (also for a zip's files: zip lists are paginated up to 20 pages, the receipt page links its zip, and the notice is beside that file's report link).
- packet history links carry ?version=<shown> when the shown version is not current; packetPdf/Csv returnTo keeps version: keptId(params.version) (exact page; the API's suggestion of keeping the downloaded versionId could 404 / differ from the shown one).
- tsc -p apps/web --noEmit (after routes+pages): exit 0
- appended describe 'the packet’s, the upload’s and the console’s downloads name their pages (D2, R05)' (6 cases) to download-refusal.test.ts
- vitest --project unit download-refusal.test.ts: 119 pass, 8 fail = the R01 scan for the 8 report routes (roi, reports, monthly, documents: not mine); my 6 scan entries + 6 new cases pass
- eslint (12 files: 3 route files, receipt-labels, receipts.tsx, uploader.tsx, 5 pages, download-refusal.test.ts): exit 0
- vitest --project db route-tests/ -t '<my 6 route ids>': 5 files, 208 pass, exit 0 (35 s)
- vitest --project unit receipt-labels, components/download-refusal, registry, partition, http.test: 310 pass
- vitest --project db uploads.db.test.ts: 13 pass
- tsc -p apps/web --noEmit (after test append): exit 0
- pnpm lint:copy: pass (517 files); pnpm lint:logs: pass (1058 files)
- final vitest unit download-refusal.test.ts: 119 pass, 8 fail = R01 scan for the 8 report routes (another builder's)
## DONE (packets/uploads/console). Notes for orchestrator in result: reload re-shows notice (R16 vs "Reload the page" words); uploads batch abort on refused report; R05 reconciliation/contracts premise wrong.
