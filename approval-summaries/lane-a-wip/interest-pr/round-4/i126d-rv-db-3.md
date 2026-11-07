# i126d rv-db-3 progress (round 3 db/perf/security lens)
Clone: scratchpad/r4-db-3 at 98bb9c00 (head moved past 9824f4e9). Install done.
## Checked
## Found
- DB tp_i126d_rvdb3_1 created (drop when done)
- Checked: migration header diff (comment only), runbook section claims (RR empty read, RC proceeds) - correct; guard test reviewed
- Gap3 confirmed: Home (practice.home oneSnapshot) reads ledger_match via unmatchedItems (unmatched.ts:120,129) -> all postings unmatched once; runbook/header list only Reconciliation/ROI
- Gap7 measured (rvdb3/gen.sql; 69k claims p0, 60% reversed+corrected, 4000 rem, 58,130 wanted rows; 9 noise practices): ATTRIBUTION_CLAIMS base 715-770 ms, head 916-1063 ms; plan sane (claim_pkey for rc, GroupAggregate on up, RLS quals present). NOT a defect.
- Gap1 CONFIRMED (unit scratch, removed): attributeInterest LED-23 renumbered shape draws c+540,v-540,k+200 (cash 200); with K on L3: interestWrites -> [] each pass (a: unlinkedReversals permanent); without (a) -> 740 written. K's 2.00 lost for good. ADR 0084:291-299 doesn't name it.
- No new logs/errors in PR commits; no packages/db/functions change; domain-model --check passes.
- Gap2 CONFIRMED: mutant (remittances.ts:1236 delete removed) passes interest/ledger-oracle/ledger db tests (99/99). Scratch db scenario (twin zz-late-rest-paid = one-line-rest-paid dated 2026-09-01; one-line-paid; then one-line-netted + twin in one reconcile; +2 reconciles): head L1 [100,-100], L2 [600] = 600/600; mutant L1 [100,-100,440], L2 [] = 440/600. Scratch files removed after.
- Gap6 CONFIRMED (nit): outcome.variants of LED-23/24 read by no test (grep); spot-check matchedByHand/renumberedReversal consistent with db tests (no drift found).
- Gap3 extended: oneSnapshot RR readers of ledger_match = Home (practice.ts:217 -> dashboard/queries.ts:195 unmatchedItems), Reconciliation (reconciliation.ts:85), ledger review (specialist.ts:111 -> reconciliation()); case page (triage.ts:402) reads ledger_entry only. Rating nit (docs).
- Gap5: (1) reverseMatch claim -> (b) false releases; later re-match guarded by outOfReach (reasoned, no over-cash found). (2) interest match reversal = person's action, L6 stays spent (ADR by design). (3) untested, not demonstrated. No finding.
- Gap4: ops design has no mayYetHold/outOfReach/unplaced text (grep); nit records.
- Cleanup done: zz files removed, DB tp_i126d_rvdb3_1 dropped, clone r4-db-3 removed. Bench SQL kept in scratchpad/rvdb3/.
- DONE: findings = gap1 (should-fix), gap2 (should-fix, test coverage), gap3 readers (nit), gap6 variants unread (nit), gap4 design stale (nit).
