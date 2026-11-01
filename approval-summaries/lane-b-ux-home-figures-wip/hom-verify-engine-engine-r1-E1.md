# engine-r1-E1 verify: DONE. Verdict: real, should-fix (severity right); fix adjusted
Clone: scratchpad/vE1 at 87691be4 (installed; db tests on PG18 :5433).
- Probe at home-figures.db.test.ts:180: all_lines 16, written off 0, atActionable 16, calls 16. Guard never exercised.
- Mutant (check first in CASE, actionable-now.ts:36): original test passes 5/5 (vE1-mut-old.log).
- Write off one case line inside counted()'s rolled-back transaction (actor set) + assert atActionable < case lines:
  passes on 87691be4 (vE1-fix.log), fails on the mutant "expected 16 to be 15" (vE1-mut-new.log).
- Moved-on half: direct ledger_entry 'approved' is refused ("an approval from a payer response is of a response
  accepting an amount for its case"); needs exported packet + payer response (pricing-current-routes exportedCase). Heavy.
