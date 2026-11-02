# hom-rereview-ux (round 4)\nStarted: reading diff
- Read full diff vs 87691be4. pnpm lint:copy OK; vitest headline/triage display/reconciliation display/queries.test: 4 files 50 tests pass.
- Candidate findings: stale "nothing posted yet" comments (queries.ts:66, recovered-periods.test.ts:107); "moved on past actionable" false for reopened lines (now documented in queries.ts:123); case page Payer approved fact lacks to-date/patient-share; "all 1 line" phrasing; ROI PDF not changed (verdict optional).
- Checked sound: UX-R1-01/E3 NetExpected branches+ADR; UX-R1-02/r3-02 notes (lint ok, both carry to date + patient share); R1-04 quarter span; R1-05 listed + parens; R1-06 Counted; R1-07 note; r2-01 e2e selector (details is direct child of main, shell.tsx:350); r2-02 0-of-0; r2-03 parens; r2-05; r2-06 mono; r3-01 none yet; r3-03 ROI link names.
- Findings: F1 movedOn words false for reopened lines; F2 stale comments; F3 case page Payer approved note; F4 "all 1 line" phrasing. Ready to report.
- Round-4 confirm pass done; reporting F1-F4.
