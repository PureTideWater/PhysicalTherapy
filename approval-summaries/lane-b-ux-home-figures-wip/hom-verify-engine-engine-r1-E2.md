# engine-r1-E2 verify\nstarted; cloning vE2
- read test (line 61 totalsOver == statements.ts:72 composition), statements.ts:39-80, ledger totals.ts/stages.ts
- ledgerTotals itself has independent tests incl. period w/ whole-ledger corrections (packages/ledger/src/totals.test.ts:60,190)
- proposed "independent oracle" = same countedStage sum as ledgerTotals:116-133 -> not independent
- db test reconciliation-routes.db.test.ts:416-419 compares practiceRecoveredPeriods to practiceLedgerTotals
- next: mutation check (period byId from period entries) in vE2
- base: 3 pass. Mutant A (period byId from period entries) -> property + line-95 test fail (test does pin the one non-trivial composition choice)
- Mutant B (practiceLedgerTotals adds a filter, recoveredPeriods unchanged) -> unit test still passes: drift undetected by unit test (only db test on LED-06 ledger)
- VERDICT: real, nit (correct). Fix part 1 (shared pure helper) is right; part 2 (countedStage-sum oracle) is not independent - same sum as ledgerTotals:116-133, already tested in packages/ledger totals.test.ts; drop it, have test line 61 call the shared helper instead.
