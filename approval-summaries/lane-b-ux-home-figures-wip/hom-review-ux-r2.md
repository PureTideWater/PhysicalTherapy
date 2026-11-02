# hom-review-ux-r2 progress
Clone: rev-ux at 87691be4 (reused from r1, read-only)
## Checked
## Findings
- Checked: diff stat vs base 43565235; headline.tsx; queries.ts; actionable-now.ts; ROI page/PDF; ADR 0082 (historical statements + digest case set decided there, skip); agreements page permission practice.open (F12 link reachable, sound); shots packet 1280, case 390, home.tiles 390, home.default dark.
- F-A should-fix: HOM-04 /stage five/i misses "stage-five" in home help (help.ts:10, inside <main>), e2e passes while home still says stage-five (reconciliation.spec.ts:237)
- F-B should-fix: closed_written_off case => openLines 0 => Cases cell "0 of 0" (cases/page.tsx:262), case page "$0.00 on 0 lines" (triage/display.tsx:107) - checklist baseline "no vacuous 0 of 0"; before showed "0 of 3"
- F-C nit: counts mono in Cases cell, sans in case page/packet sentence
- F-D nit: case page nested parens "(cash posted, proved by the posting export (no deposit data is supplied), net...)" case/[caseId]/page.tsx:98 (seen p.case.default.390)
- F-E nit: PDF statement-html.ts:117 hand plural "Its N case(s)" though worker has packets/words counted(); "Its" after "Not recomputed from its links." ambiguous
- F-F nit: Cases header "a written-off line is struck through" describes the case page, not Cases (cases/page.tsx:59)
- Checked sound: help/a11y tile link names, dark tiles contrast, empty open/no-BAA/paused render test, agreements link reachable by practice.open, digest words unchanged, e2e passed 19/19
