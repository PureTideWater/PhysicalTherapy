# review-correctness (PR #79, head 35b14cd5)
Status: started. Clone at scratchpad/clone-correctness.
## Checked
## Findings
- vitest unit (components/, tables.test, type-scale, tools/screening-capacity) on 35b14cd5: see review-correctness/vitest.log
- Read: design s.1.6, 2, 3, 4, 5, 8.2, 12; builder reports; scroll-table.tsx; stacked-rows.tsx; tables.test.ts; a11y.ts; brand.css diff
- Per-file JSX diff (tags/attrs/texts/classes old vs new): review-correctness/hunks.txt (script scripts/hunks.cjs)
- vitest: 33 files, 420 tests passed (components/, tables.test, type-scale, tools/screening-capacity)
- Rollout script (hunks.txt): no data-*, id, key, aria or text lost in any of the 56 page/component files; only intended changes (labels, min-w, wrap-anywhere, DR-16 names, date/email spans, sr-only Actions, flex td -> inner div).
- labels.txt: 83 ScrollTables; every label == table aria-label expression (79) or aria-labelledby target text (4); every min-w in 32/36/40/48/54.
- Tailwind output (ux-table-scroll build of 35b14cd5): @container, @min-[32..54rem]:block/hidden, @min-[24rem] dl, surface classes, :has outline all generated.
- Browser harness (review-correctness/harness, built CSS): frame outline on region focus OK (both scrollers), fades opacity 1 per edge, forced colours keep outline + hide fades.
## Findings so far
- F1 should-fix: focus outline of a first-column link is clipped on its left by the scroller (overflow-x:auto), confirmed in Chromium (harness/zoom-in-scroller.png vs zoom-no-scroller.png); regression for ~56 newly wrapped tables. Fix: brand.css `.pw-scroll-frame > [data-scroller] :focus-visible { outline-offset: -2px; }` (inset), or similar.
