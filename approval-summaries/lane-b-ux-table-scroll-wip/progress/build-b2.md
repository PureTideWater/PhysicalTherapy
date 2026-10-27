# build-b2 progress (slice B2: practice pages, remittances to uploads)

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll. Started fresh (no earlier file).

## Steps
- [x] 0. Read design whole (section 12 wins: 56rem -> 54rem), scroll-table.tsx, build-a.md.
- [ ] 1. Sites (below)
- [ ] 2. Grep check, unit tests, typecheck, eslint

## Sites done
(none yet)
- remittances/page.tsx:73 Remittances, min-w-[48rem], wrap-anywhere on Trace cell. DONE
- remittances/[remittanceId]/page.tsx:109 Provider adjustments, min-w 36rem with PHI (Reference col) / 32rem without; wrap Reference. DONE
- remittances/[remittanceId]/page.tsx:149 Claims, min-w 54rem with PHI (3 PHI cols) / 48rem without; wrap Claim control numbers cell. DONE (JSDoc says width follows the role's columns)
- reports/page.tsx:240 Generated reports, min-w-[36rem], no wrap (design). DONE
- reports/page.tsx:290 Exports, no min-w, wrap By. DONE
(helper: scratchpad/b2/wrap.py re-indents and wraps one table)
- reports/roi/page.tsx:64 ROI statements, min-w-[48rem]; wrap only the generatedBy email (a span), not the time in the same cell. DONE
- settings/access-log/page.tsx:46 Access log, min-w-[48rem]; wrap Who and Record cells. DONE
- settings/agreements/page.tsx:92 Grants, min-w-[40rem]; wrap Roles. DONE
- settings/pricing/page.tsx:138 Places of service in effect: OV div -> ScrollTable, no min-w. DONE
- coverage/page.tsx:246 Plans waiting on mapping, min-w-[48rem]; wrap Plan. DONE
- coverage/page.tsx:299 Unpriced reasons and their remedies, min-w-[40rem]. DONE
- lines/[lineId]/page.tsx:241 Adjustments, min-w-[32rem]. DONE
- releases/page.tsx:155 Rule releases, min-w-[32rem]. DONE
- uploads/[documentId]/page.tsx:103 Transaction sets, min-w-[40rem]. DONE
- uploads/[documentId]/page.tsx:138 Errors, no min-w; wrap What. DONE
- uploads/[documentId]/page.tsx:181 Payments, min-w-[40rem]; wrap Payment. DONE
- uploads/[documentId]/page.tsx:219 Holds, no min-w. DONE
- Optional pages (contracts/versions/[versionId], abstraction/versions/[versionId], reports/[reportId], reports/roi/[statementId], cases/[caseId]/submissions, pricing-runs/compare, uploads/page.tsx): no <table>, no box of their own (their tables are slice C's components). Nothing to do.
- [x] 1. All 17 sites in 11 files done.
- [x] vitest --project unit tools/brand-colors tools/brand-copy tools/brand-fonts apps/web/src: 70 files, 869 tests passed (14:41)
- [x] pnpm typecheck: passed, 22 projects (apps/web 3,963 files)
- reports/page.tsx:259 Generated reports: the requester's email in Figures fixed wraps (a span), as ROI's; beyond the design's row (rule: emails wrap)
- [x] eslint on 11 files: exit 0
- [x] lint:copy passed (516 files); local guard (scratchpad/b2/guard.cjs): 17 tables, each ScrollTable's only child, label == aria-label, no style=.
SLICE B2 DONE. Nothing remains. Not committed (by instruction).
Handovers: slice E (role-dependent Claims/Provider adjustments widths; region names that a section region prefixes: Generated reports, Unpriced reasons, Places of service).
