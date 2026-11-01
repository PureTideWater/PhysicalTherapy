# hom-review-ux-r1 progress

Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e9e32b44-ea9a-56f5-83b4-9164e617462b/scratchpad/rev-ux at 87691be4

## Checked

## Findings
- Read checklist, design F1-F13 and D1-D11, diff of headline.tsx, page.tsx, display.tsx (recon, triage), format.ts, gate.ts, case/cases/packet/roi pages, statement-html, recovered-words, actionable-now.ts
- Shots seen: home.default 1280/390, roi-statement 1280 (01-03 vs before 03: $30 -> $0.00, UX-003 closed on LEDGER), cases 1280, case 1280
Findings so far:
- should-fix: quarter key "2026-Q4" not kept whole (WholeDates regex \d{4}-\d{2}-\d{2}); headline.tsx:79; break at sm 3-col widths
- nit: Cases header openCases manual plural (cases/page.tsx ~58) not counted()
- nit: moved_on includes null stage "never there" but words say "moved on past actionable" (actionable-now.ts:73, display.tsx:89)
- nit: counts in case page / tile not mono while Cases cell mono
- lint:copy passes (540 files); headline/format/triage/recon display unit tests 42 pass
- #42 overlap now also tools/screening-capacity/watched-paths.txt (different hunks, no conflict)
- More findings: Net expected value negative on resolved cases (case page:115-126, queries.ts caseSummary); HOM-04 loose regex (reconciliation.spec.ts:226-233); listed() not used + packet ", as of" binding (triage/display.tsx:86-112, packet/page.tsx:219); Payer approved home note reads as pending though cumulative (display.tsx PAYER_APPROVED_HOME_NOTE)
- pre-existing: packet line schedule "(Actionable)" $90 beside $0.00; case page Written off manual plural; help.ts stage-five (follow-up)
