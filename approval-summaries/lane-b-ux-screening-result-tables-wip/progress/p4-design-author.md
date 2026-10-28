# p4-design-author progress
Started 2026-10-28. Output: /home/user/ops/designs/lane-b-ux-screening-result-tables.md
## Done
- Read p4/screen.md, p4/tests.md, p4/words.md
## Next
- Read review §3 UX PR 4 + six findings, PR3 design (form, s3, s12), ADR 0078, status files, LANES, code
- Read review §3 UX PR 4 + six findings, prs.json order 4, PR3 design s3+s12, ADR 0078, both status files, LANES (rule 6 generated files incl watched-paths.txt; delegation co-founder answers Lane B decisions)
- Read code: stacked-rows.tsx, anomalies.tsx, coverage.tsx, status.tsx, result-view.tsx, result-summary.tsx, result.test.tsx pins (401,411,418,419-424,430,431,432,437,479-484,498,500-503,510,531,539,550,557)
## Key facts so far
- result.test.tsx pins: UX-040 (:430,:431,:510), UX-206 (:411,:419-424,:500-503), UX-042 headers (:273 summary dt literal, :401, :531), UX-132 reason words (:550 + spec :461) break; "Below by $5" (:432) pinned
- table class strings pinned exactly (:479-484, :557-558): keep `w-full min-w-[54rem] text-left text-sm` / 40rem
- stacked copy must not carry data-anomaly/data-standing/data-figure=one-figure/data-group*/data-row-no/data-coverage/data-reason
## Next
- (optional) measure table min-content at 1280 with a static render + tailwind + chromium (scratchpad/p4/measure)
- read labels.ts, labels.test.ts, watched.ts/test, tables.test.ts, a11y.ts, brand-copy scan, test-matrix TBL, matrix.ts, registry.ts
## Decisions taken (so far)
- No measurement run (only design + progress files may be written); widths are estimates; spec measures.
- PR 4 now: UX-005 all; UX-043 all; UX-042 sign sentence (a key paragraph `DIFFERENCE_SIGN` above each table/list in anomalies + top rows; anomaliesDescription untouched since pinned); UX-132 code span dropped + "PaidWhole" at result-summary:267 + top-rows sentence. Status td chip wraps w/ floor (min-w-40) so anomalies fits at 1280 for small sums.
- After #42 -> "UX PR 4b" co-001/ux-screening-result-words (component words, no migration): UX-040 tone, UX-206 count sentence, "Below the Medicare figure by $5", lede order, UX-154's engine version move to foot (pins :367), + pin updates in result.test.tsx; if #42 merged before slice A starts, PR 4 takes them.
- Labels (UX-042 headers, UX-132 reason words labels.ts:175, DISPOSITION_NOTES.unpriced): need labels version; Q to co-founder/Lane A: 2026-11-05 stays unreleased until first deploy from main (recommended yes -> 4b re-pins, no migration); else Lane A migration.
- watched-paths.txt: regenerate under LANES rule 6 (generated file), one line stacked-rows.tsx; open point.
- StackedRow gains optional `description` (note under heading) for the others item; ADR 0078 dated amendment.
- Coverage heading = product + ": " + outcome chip (unique headings); fields Reason, Rows, Claim lines, Allowed.
- Top rows heading "Row N: <code>, <product>"; anomalies heading "<code>, <product>".
- Hooks: data-stacked-group (+"others"), data-stacked-row-no, data-stacked-coverage, data-stacked-reason, data-stacked-standing on chips (copy prop).
- Open PRs (2026-10-28 REST): #81 suite-cap-1a, #78 ux-download-refusals, #75 contract-phi-check ALL change watched-paths.txt + test-matrix/matrix/registry (precedent for rule-6 regen while #42 open); #74 ux-forms changes components/screening/split-form.tsx, forms.test.tsx, test-matrix (no overlap with PR 4's code files)
- New module decided: components/screening/table-parts.tsx (Copy, ScreeningColumn, headClass, cellClass, StatusCell floor min-w-40, fieldsFrom, ColumnHeads) -> watched-paths gains it + stacked-rows.tsx
- Spec: e2e/screening-phone.spec.ts; a11y.ts gains `lists` option; JS-disabled 390 check; 1280 + 1263 anomalies & coverage fit; 820 switch.
- Words final: DIFFERENCE_SIGN "Each difference is its Medicare figure less the allowed amount in your file: positive where the allowed amount is below that figure, negative where it is above it." ; top rows: one/many lead + "PaidWhole prices one claim line under the Medicare fee schedule, before sequestration, and rounds it once; the row’s figure is that times its claim lines." ; could-not-price "Medicare rows PaidWhole could not price, or whose rates change within the quarter. Coverage, below, gives each reason."
- 4b count sentences: only-group cases, Neither/Both for 2, None of the n, a of n, All n.
## Next: WRITE the design doc /home/user/ops/designs/lane-b-ux-screening-result-tables.md (sections 1-12)
- WROTE design section header, contents, section 1 (1.1-1.5). Next: section 2
- WROTE section 2 (2.1-2.9; incl. StackedRows description + fit-content(40%) term column). Next: section 3 words
- WROTE section 3 words (3.1-3.9). Next: section 4 tests. TODO at end: fix cross-refs 2.5->2.6 (StackedRows description) and 2.6->2.7 (widths) in section 1/2.3
- WROTE section 4 tests (4.1-4.8). Next: 5 ADR, 6 migration/overlaps, 7 shots/lens, 8 slices, 9 risks, 10 proposals, 11 follow-on
- WROTE sections 5-11 (design complete draft). Next: fix cross-refs, consistency pass
- Consistency pass 1 done (cross-refs, tables, backticks). Remaining: final verification of a few cited lines
- DONE: design written and checked (1077 lines). Return summary.
