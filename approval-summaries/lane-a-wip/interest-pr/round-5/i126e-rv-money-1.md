# i126e rv-money-1 progress
- clone created at scratchpad/r5-money-1
## checked
## found
- HEAD of clone: 87ce6146 (origin/co-001/ledger-interest-once; task named 75cb2b70, branch moved: +7ace47e6 re-walk, +87ce6146 comment)
- install done
- read: packages/ledger/src/interest.ts (all), remittances.ts 860-1387, pass.ts, design 10.1
- termination proof of re-walk (interestRoom) checked: entries per L6 per line once; room covers paid reach + held+payment-landed lines -> looks sound
- interest-chains.ts read: new interest matches in a pass name claims already read (claim matches) -> next reconcile's attribution unchanged; approvedRemaining ignores interest -> re-walk fixed point = next reconcile's first walk (modulo WOs, which write whole in walk 1)
- renumbered/never-linked reversal double count: design section 14 hands it on (out of scope) -> not reported
- property gaps noted: two-take-back prop has no manual match / no shared k-a lines / no weight change; manual-match prop has one take-back, models one walk, asserts per-reconcile only when yFirst
- NEXT: write pure TS simulator of recordInterest composition (packages/ledger/src/zz-sim.test.ts in clone) to search for total > cash after any reconcile
- sim v1 (zz-sim.test.ts: Y pays a, X takes back a + pays own k, manual matches over time, recoup to 0, date/upload orders, re-walk): 60000 runs, no total>cash when payments of a cover its take-backs (cash over case-line chains). A naive invariant fails only for take-back > uploaded payments (inherent, design errs).
- NEXT: sim v2 general: chains a,b contested, mixed-sign L6s, correction claims A/A2, claim match reversals, approvals over time
- FOUND (sim v2, pure): one PLB L6 taking back two chains (a, b) whose interest is held on the SAME line: take-back of the first chain reaches the line, the second's heldLines filter(!reached) drops it -> second chain's interest stays credited: above the cash (min case: P1 pays a1,b1; P2 pays b1; P0 takes back a1,b2; lines A,B both on L1: total 1 vs cash 0). Root: interest.ts:410 (heldLines exclude reached) + ledger_match_standing one standing match per (kind, L6, line) (20261023120000_recovery_ledger.sql:171). Pre-dates 9c68a4be (LED-R2 fix took take-backs first). Fix needs index change = beyond 10.1 -> founder. NEXT: DB repro using LED-24 two-chains shape (B unlinked correction on both lines beside C).
- CONFIRMED in DB (log i126e-rv-money-1-probe1.log; probe test + 835s saved as i126e-rv-money-1-zz-*.txt): paired.835, zz-b-paid.835 (B unlinked on both lines, AMT I 6.00, PLB L6 -6.00), zz-both-back.835 (C reversed AMT I -5.40 + B reversed AMT I -6.00, one PLB L6 +11.40): draws e918: B -600, C -540; B's take-back on both lines, C's nowhere: interest 5.40 vs cash 0.00, settled (2 more reconciles). Finding RVM5-1.
- NEXT: sim v2 restricted to one take-back per L6 to look for other defects
- sim v2 (general; walk-bound check = interestRoom): one take-back per L6: 260k runs clean (cash and bound). Two take-backs per L6: only RVM5-1 family; walk bound checked separately (SIM_NO_CASH)
- pure unit repro RVM5-1 saved (i126e-rv-money-1-zz-unit.test.ts.txt): interestWrites returns only a's -100 on L1, b's -100 dropped (red)
- checked: LED-01..18 fixtures/golden, stages.ts, totals.ts untouched since 9c68a4be; rules.test/index.ts changes only types/exports; RemittanceOutcome.interestWalks only consumed by pass.ts; pass.ts logs ids/code/walks only; caseLines reads all case lines (written-off too)
- ADR 0084:131-134 and matrix LED-24 row (test-matrix.md:178) only address opposite-sign meetings
- Finding 2 (test gap): properties lack one-L6 two-chain take-backs on shared lines, manual match x two take-backs x re-walk; MONEY-R4-1 property (interest.test.ts:1343) one walk/reconcile, per-reconcile bound only if yFirst (:1396)
- migration diff since 9c68a4be: header comment only (f4bd94d3); nothing beyond 10.1 found in the round's code; RVM5-1's structural fix would need an index change on ledger_match (beyond 10.1) -> founder
- DONE: findings RVM5-1 (blocking, DB+unit repro), RVM5-2 (should-fix, property gaps). Clone and tools removed; DB tp_i126e_rvmoney1_1 dropped by run.sh.
