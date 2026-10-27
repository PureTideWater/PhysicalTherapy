# build-c progress (slice C: components)

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll. Do not commit.

## Steps
- [x] 0. Read design (whole), build-a.md, scroll-table.tsx, scroll-state.ts.
- [x] 0b. Review JSON, scouts' notes for slice C files.
- [x] 1. Sites (file:line, label) — list below as done.
- [x] 2. Guard (scratchpad/b1/guard.mjs, TS parser) over my 16 files and over every non-test components .tsx: ok. No overflow-*/max-h box left in my files.
- [x] 3. vitest --project unit apps/web/src/components apps/web/src/app/type-scale.test.ts tools/brand-colors tools/brand-copy: 27 files, 286 tests passed.
- [x] 4. pnpm typecheck: 22 projects passed (run twice, last after the final edit); eslint on my 19 files from the root: clean; pnpm lint:copy: 516 files passed.
SLICE C DONE. Not committed (as instructed).

## Sites done
- contracts/review.tsx:241 ScrollTable "Fields of rate record N" (DR-16), 32rem, wrap value cell + approver span (was OV)
- contracts/display.tsx:92 CitedPageView ScrollBox "Page N of the contract", lg, faint, as div, data-page-text=""

- models/display.tsx:104 ScrollTable "Proposed fields of proposal P, candidate N" (DR-16; P = position+1 in list, passed as proposalNo), 48rem, wrap As written + Page and quote (was NONE)
- reports/display.tsx Table (7 uses): ScrollTable {caption}, table gains aria-label={caption}, keeps sr-only caption; minWidthOf(columns): <=3 none, 4 32rem, 5-6 40rem, 7-8 48rem, 9+ 54rem; new `wraps` prop, Pattern column (index 2) in 'Validated discrepancies by payer pattern' and 'Cases' (was OV)
- reports/documents.tsx:66 Unpriced reasons and their remedies 32rem; :112 Plans waiting on mapping 32rem wrap Plan td; :175 Lines by stage 32rem; :240 Stages by payer 48rem; :286 Packets approved by their own writer 40rem wrap Packet version td (all were NONE)
- reports/roi.tsx:51 ScrollTable `Entries of ${label.toLowerCase()}` (const entriesLabel), 32rem (was NONE)

- reconciliation/template-mapper.tsx:174 Preview rows, 48rem, wrap Check or trace td (OV div replaced)
- uploads/receipts.tsx:146 ScrollTable {props.title}, table gains aria-label={props.title}, 48rem (was NONE, unnamed)
- releases/note.tsx:31 Changes by record type 32rem; :55 Records that differ 36rem, wrap on the record key span only (not the record type code); :94 notes pre -> <div mt-2><ScrollBox label=`Release notes of release ${n}`> (matches slice D's wording)
- releases/content-due.tsx:136 Content due by family (none); Block removed, its two uses now ScrollBox (labels unchanged, data-state passed); content-due.test.tsx pins updated (", scrolls" names, data-scroller, 2 scroll-box, table in region; focus-visible:ring-2 count dropped, DR-03). releases+models+reports vitest: 4 files 13 tests green.

- screening/coverage.tsx:63 ScrollTable TITLE "Coverage, and the rows missing a contract" (const shared with CardTitle), table keeps aria-labelledby, 40rem (OV div replaced)
- screening/anomalies.tsx:291 ANOMALIES_TITLE, :364 TOP_ROWS_TITLE: hand-rolled regions (data-scroll hooks) replaced by ScrollTable, 54rem each; consts shared with CardTitles
- screening/result.test.tsx:478-485 pins updated (regex, ", scrolls sideways" names, min-w); new coverage pin test in 'the coverage'. content-due.test pin softened to regex. releases+screening vitest: 5 files 49 tests green.

- packets/display.tsx:139 Line schedule (ST), +min-w-[54rem], wrap Claim td
- packets/calculation-words.tsx:77 worksheet (ST), +min-w-[32rem]; calculation-words.test.tsx:91 pin updated
- packets/pricing.tsx:82 Lines not on current pricing (ST), +min-w-[48rem]
- pricing/display.tsx:505 Unpriced reasons (ST) +min-w-[32rem]; :550 Variance by payer pattern (ST) +min-w-[48rem], wrap Payer and plan td
ALL 1.4 SITES IN SLICE C EDITED. Next: guard grep, tests, typecheck, eslint.

## Handovers / proposals
- Slice E: names per DR-16 for models.spec/tables-phone: "Proposed fields of proposal 1, candidate 1", "Fields of rate record 1"; cited page box "Page N of the contract, scrolls".
- Slice E: release notes ScrollBox "Release notes of release N, scrolls" contains "Release N" (pricing.spec.ts:238 'Release 900001'): safe while <details> is closed, exact: true recommended.
- Slice E (full DR-02 check): card regions now hold scroller regions extending their names: reports 'Evidence gaps', 'Validated discrepancies'; ROI cards (`Entries of <label>`); documents section 'Unpriced reasons'; content-due section 'Content due'. No spec reads them today.
- Proposal: models/display.tsx proposal cards show no position, so "proposal P" in the table name is not visible; give the card title its number (models.spec.ts:127,139 read the region 'Model proposal' exact, so keep the region's name).
- Slice E: "Fields of rate record 1, scrolls sideways" contains 'Rate record 1' (case-insensitive substring): layout-1280.spec.ts:167 and models.spec.ts:133, :181 getByRole('region', { name: 'Rate record 1' }) need exact: true.
