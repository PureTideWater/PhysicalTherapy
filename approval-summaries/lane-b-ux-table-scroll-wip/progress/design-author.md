# design-author progress (UX PR 3, co-001/ux-table-scroll)
Status: decisions made; writing /home/user/ops/designs/lane-b-ux-table-scroll.md section by section.
Decisions (keep):
- ScrollTable: fragment [caption p (only overflows) + frame div data-slot=scroll-table .pw-scroll-frame data-scroll=unmeasured|fits|overflows data-edge-start/end] > region div (role,name,tabindex while unmeasured|overflows|focused; plain div when fits) > table (direct child, layout-1280 placement() keeps working)
- three-state pure fn scrollState() in scroll-table-state.ts, unit-tested in node; MutationObserver re-observe; 1px threshold; keep stop while focused
- fades: overlay ::before/::after on frame in brand.css, surface var --pw-scroll-surface default --pw-bg; forced-colors hide; print overflow visible; scroll-padding-inline 1.5rem; motion-safe opacity transition
- caption "Scroll sideways for more columns." any width while overflows, above, aria-hidden, keep data-state="scrolls-sideways"
- ScrollBox (same file) for 4 text boxes + content-due Block; name "<label>, scrolls"; block axis; bottom fade
- min-w cap 56rem (fits card at 1280); per-site table; wrap-anywhere on long values
- StackedRows server comp, fields with figure role grouped in brand order; optional table pairing via container query (@container, literal class map); not adopted in PR3 (PR 4 first user); case page lines proposal for later
- guard: vitest AST test apps/web/src/app/tables.test.ts, exemptions = 3 #42 files (4 tables) with unused-exemption failure; rendered check in atPhoneWidth
- anomalies.tsx wrapped in PR3 (exemptions only #42); result.test.tsx pins updated
- e2e: new tables-phone.spec.ts (own practice, setup shared with layout-1280 via helper in journeys.ts) + console test with new persona tables-admin; single atPhoneWidth calls in reconciliation/reports/packets/onboarding/billing specs; atPhoneWidth gets {tables, soft}; exact:true fixes for region locators (uploads.spec:53, layout-1280:246, unattested:62,171)
- ADR 0078 (shared with PR4) + 0056 status/italic pointer; PR34 cites 0078 not amend 0056
- written: header, contents, §1, §2 (2026-10-27)
- written: §3 StackedRows
- written: §4 guard, §5 tests
- written: §6-§11. DONE except final checks
- COMPLETE: design written and checked (1265 lines). Counts fixed: 73 wrapped, 5 min-w added, 55 files, 18 ux-forms shared, unit +20, e2e +2.
