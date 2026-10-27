# dlr-build-reports progress (builder: reports downloads, UX PR 5)
Worktree: /home/user/ux-download-refusals (no commits by me)
## Status
- [x] read design, api, other progress files
- [x] routes: reports.ts reportFilePage (from=list -> reportsPage.path, from=review -> reviewChecklistPage.path, else reportPage.path) on reportPdf/reportCsv; reviewCsv -> reviewChecklistPage.path; roi.ts statementFilesPage on pdf/csv; report-documents.ts documentFilesPage (from=list -> /reports keep {list: DOCUMENTS_LIST='documents'} so the list page puts its notice in the documents section; else the document page); monitoring.ts exported monthlyParams shared by page+csv, csv returnTo keeps keptMonth
- [x] pages: reports/page.tsx (links ?from=list; notice in Audit reports section unless ?list=documents, then in Generated reports section), [reportId] (notice in Files card; when content null, after the status alerts), [reportId]/review (PDF link ?from=review; notice after the header), roi/[statementId] + documents/[documentId] (searchParams added to Props; notice top of Files card), monthly (notice after the GET form; invalid with fields month -> MONTH_NOT_READ_TEXT from monitoring.ts)
- improvement: monitoring.ts monthlyParams (one schema for the page and its CSV; exported so the test proves a kept month parses)
- [ ] tests appended to download-refusal.test.ts
- [ ] checks
## Commands run
- dropped: a monthly invalid override (unreachable: a params parse failure is not_found in invoke.ts parse(), so a bad month comes back refused=not_found)
- [x] tests appended to download-refusal.test.ts: describe 'the reports’ downloads name their pages (D2, R05, R07)' (8 cases; static imports monthlyParams, DOCUMENTS_LIST)
- tsc -p apps/web --noEmit (routes+pages): exit 0
- eslint 10 files (4 routes, 6 pages): exit 0
- vitest --project unit download-refusal.test.ts (before my append): 127 pass (the 8 report scan cases now pass)
- vitest -t "reports’ downloads": 8 pass
- vitest --project db route-tests/ -t 'practice\.reports\.(pdf|csv|review_csv|roi\.pdf|roi\.csv|documents\.pdf|documents\.csv|monthly_csv|monthly)\b': 7 files, 323 pass, exit 0 (44 s)
- running: db monitoring-routes + report-documents-routes; eslint test file; unit (download-refusal, component, registry, partition, http.test); tsc
- vitest --project db monitoring-routes.db.test.ts + report-documents-routes.db.test.ts: 13 pass, exit 0
- eslint download-refusal.test.ts: exit 0
- vitest --project unit download-refusal.test.ts, components/download-refusal.test.tsx, registry.test.ts, partition.test.ts, http.test.ts: 5 files, 429 pass, exit 0
- tsc -p apps/web --noEmit (final): exit 0
- pnpm lint:copy: pass (517 files); pnpm lint:logs: pass (1058 files)
- eslint 11 files (final, after the monthly revert): exit 0
- PR42 overlap check on my 11 files: none; no model identifier in my files
## DONE (reports downloads)
