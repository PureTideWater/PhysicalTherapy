# i126d judge 3 of 3 (file judge-2): F-M2-1 / DB2-1 (LED-R1 widening, PLB L6 naming latest correction)
Status: started 2026-11-07. Clone: scratchpad/r4-judge2 (to be removed). DB: tp_i126d_judge2_<n>.
- Test: scratchpad/judge2-gen/zz-judge2.db.test.ts (copied into clone apps/worker/src/reconcile/); fixtures by scratchpad/judge2-gen/gen.py
  into fixtures/synthetic/LED-23/zz-j2-*.835 (8 variants: drop/keep L2 on C2; named C2 / unnamed+AMT I / named C2+AMT I / named C1 / named O).
- Runner: scratchpad/judge2-gen/run.sh <label> <dbsuffix> <clone>; outputs progress/i126d-judge-2-<label>.{log,out}.
- Second worktree at c49367c5: scratchpad/r4-judge2-c49 (git worktree of my clone).
- HEAD 9824f4e9 run (progress/i126d-judge-2-head.out): third L6 3.00 lands
  drop-named-c2: L1 159 (C2) + L2 141 (C1) | drop-unnamed-amti: L1 300 | drop-named-c2-amti: 159/141 | keep-named-c2: 159/141
  keep-unnamed-amti: L1 300 | keep-named-c1: 159/141 | keep-named-o: 159/141 | drop-named-o: 159/141. 3 of 5 design assertions red.
- c49367c5 run (progress/i126d-judge-2-c49.out): all 5 design assertions green. drop/keep named-c2: L1 300 (C2); unnamed: L1 300;
  named-c1: L1 159 / L2 141 (both name C1); named-o (drop and keep): nothing (the LED-R1 loss).
- Leaning: REAL (should-fix). Next: prototype forward-walk fix in r4-judge2, rerun my test + interest.db.test.ts.
- FIX prototype (progress/i126d-judge-2-fix.diff.txt: namedClaimIds = the reached claims plus the claims after them by the loader's
  links, among the rows read; interest-chains.ts only): my test 8/8 green (named C2 -> L1 300 in both shapes; named C1/O -> 159/141,
  so LED-R1 stays fixed) + interest.db.test.ts + ledger-oracle.db.test.ts + chain.db.test.ts: 4 files, 59 tests passed (rc=0);
  tsc --noEmit -p apps/worker clean.
## VERDICT: REAL (should-fix), introduced by 84534029 (LED-R1 widening). See StructuredOutput.
- Cleanup: DBs tp_i126d_judge2_1..3 dropped by runner; clone r4-judge2 and worktree r4-judge2-c49 removed; /home/user/interest untouched.
