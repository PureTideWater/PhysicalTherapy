# verify ux-r3-01 (Recovered tile "nothing posted yet: cash posted") at 87691be4
Clone: scratchpad/v-r3-01 (read-only checks, no install needed).
- headline.tsx:34-37,46-48,76 render "to date, nothing posted yet: cash posted, proved by ..." when recoveredSince null. Confirmed by headline.test.tsx:80-83 asserting exactly that text. Design D7 (lane-b design :161-162, table :313) prescribes it; no disposition F1-F13 touches it.
- REAL. The period clause names the cash verb, so it reads as "nothing posted" then "cash posted". $0.00 beside it limits harm: should-fix stands (could be argued nit).
- Proposed fix (reorder, "none to date") works but is not best: changes the since form too and the HOM-04 e2e string for no gain. Its claim that "none yet: cash posted" trips scan.ts DENIED is wrong: recoveredUnlabelled (scan.ts:171-182) splits clauses at ':' and only tests clauses holding "recovered"; the note has none.
- Better fix: NOTHING_YET -> one verb-free string 'none yet' for both levels: "to date, none yet: cash posted, ...". Update headline.tsx:33-37,45,47; headline.test.tsx:80-83; queries.ts:62 comment; design D7. HOM-04 e2e (since form) unchanged. Run pnpm lint:copy.
VERDICT: real, should-fix, better fix given. DONE.
