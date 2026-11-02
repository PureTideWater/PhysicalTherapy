# hom-review-ux-r3 progress
Clone: rev-ux at 87691be4 (reused, read-only)
## Checked
## Findings
- Checked: headline.tsx whole, home page diff, gate.ts/uploads.ts move, queries.ts HOME_CASES (cases by state + deadlines same predicate as tile: sound), triage queries CASES/listCases (header total same predicate: sound), statements OPEN_CASES_ACTIONABLE (same case set as home WORKED: sound), recovered-words, reconciliation display, data-figure selectors in e2e (old "recovered" id now only on recon/case pages: sound)
- Shots seen r3: home.empty 390, support-access 390 + 1280-dark, reconciliation 1280 + 390, home.default 1280, roi-statement 390 02-04
- R3-A candidate: "to date, nothing posted yet: cash posted, ..." reads as contradiction (headline.tsx:47,76)
- R3-B candidate: ROI actionable card lists case links all named "Case" (roi page:144) - pre-existing text, card rewritten here
- R3-C candidate: home Deadlines "$0.00 actionable" with no out-of-figure words now possible (page.tsx deadlines dd)
- Dropped R3-C (deadlines $0.00 actionable is pre-existing: base already used ACTIONABLE_NOW there)
- Checked more: empty-state h2 via EmptyState section (heading order sound), HOM-03 render test covers no_baa link/viewer/paused, PR body word list matches code, digest words, firstOn semantics
- R3-D nit: PAYER_APPROVED_HOME_NOTE says "same terms" but drops "never the patient's share" (display.tsx:86-89)
- FINAL: R3-A should-fix, R3-B nit, R3-D nit. Done.
