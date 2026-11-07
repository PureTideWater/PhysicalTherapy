# check-whole-1

- started: clone /home/user/ux42-whole-1, reading diff
- clone at dab7d237 (origin co-001/wip-ux-forms-after-42); design read whole
- read: upload-form.tsx, form-issues.tsx, next.ts, screening/page.tsx, forms-harness, form-hints.test, tables.test, shell.tsx, skip-link.spec, personas, helpers, forms-keep-input
- candidate F1: upload-form `setNoFile(null)` re-shows an older server refusal (Summary remounts under old seq key -> layout effect refocuses / re-announces) when a file is chosen after a no-file press
- read: W1/W2 route files, guard test head, screening routes/messages, routes.db.test re-send, browser test cases, e2e specs, docs/ADR/matrix/registry/fixtures, packets correspondence
- 4b: no 4b file touched; overlap only test-matrix/matrix/registry/screening.spec; 4b merged to base as 8a722f80; git merge-tree HEAD vs base clean
- no model name in files; commit trailers follow repo attribution convention (278 base commits)
- findings: F1 focus steal (should), F2 re-send lead unmet (should), F3 SCREENING_ZIP_MESSAGES called legal surface (nit), F4 abstraction/tagging 'a date (YYYY-MM-DD)' left (nit)
- done; clone removed
