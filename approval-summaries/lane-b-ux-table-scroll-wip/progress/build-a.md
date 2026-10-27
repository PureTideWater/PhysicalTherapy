# build-a progress (slice A: components and their tests)

Worktree /home/user/ux-table-scroll, branch co-001/ux-table-scroll, base e908c21.

## Steps
- [x] 0. Read design (whole, section 12 wins), review JSON.
- [x] 0b. Read scouts' notes, current code (scroll-table.tsx, its test, line-words.tsx, pins, brand.css, tokens).
- [x] 1. Tests first: scroll-table.test.tsx (18 tests), stacked-rows.test.tsx (11 tests) against stubs (scroll-state.ts and stacked-rows.tsx stubs throw "not built yet"; ScrollBox stub appended to scroll-table.tsx). Run: 29 of 29 fail. ScrollTable markup tests fail on the old markup (expected '<div role="region"...' to match /^<div data-slot="scroll-table".../; to contain 'data-scroll="unmeasured"'; empty label did not throw); every other test throws "<name> is not built yet" (scrollState, ownFocus, ScrollBox, StackedRows, brandOrderProblems, repeatedIds).
- [x] 2. Implementation: scroll-state.ts (+ ownFocus, stateChanged), scroll-table.tsx (useScroller hook, ScrollTable, ScrollBox), stacked-rows.tsx, brand.css (fades, :has outline under @supports, no print), line-words.tsx (DR-10, 'As PaidWhole recorded it').
- [x] 3. Pins: pricing/display.test.tsx, diff.test.tsx, line-words.test.tsx updated. The 5 files: 74 tests green (scroll-table 19, stacked-rows 11).
- [x] 4. typecheck passed (22 projects); lint passed (1,615 files; first run caught <a> to a page route in stacked-rows.test.tsx, fixed with next/link); lint:copy passed (516 files); vitest --project unit tools/brand-colors tools/brand-copy apps/web/src: 68 files, 844 tests passed. Committed 40314fb3 (tests first faa7bf15).

SLICE A DONE. Nothing remains in this slice.

## Notes

- Decisions: ownFocus(event) pure helper in scroll-state.ts makes DR-01 testable; the stacked figure dd carries data-stacked-figure (not data-figure: data-figure is a strict single-match spec hook in monitoring/ledger-patient-share/packets specs); repeatedIds = ids repeated anywhere + data-* name=value in both the table copy (data-stacked-copy="table") and the rows copy (data-stacked-copy="rows"), apart from data-slot and data-tone (component-owned); ScrollBox text classes whitespace-pre-wrap wrap-anywhere font-mono text-xs on both pre and div (div is the cited page, also leading-relaxed).
- Handovers so far: e2e/pricing.spec.ts:141 and e2e/viewer-phi.spec.ts:152 read "As the engine recorded it" (slice E); content-due.test.tsx:66 counts focus-visible:ring-2 (slice C).
