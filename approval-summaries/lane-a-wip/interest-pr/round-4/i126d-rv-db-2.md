# i126d-rv-db-2 progress
## checked
## found
- clone at scratchpad/r4-db-2, head 9c68a4be (newer than 0755a533: +1fda5637 MONEY-R4-1, 5a78e33f RV-DB1-1, 9c68a4be ADR); install ok
- read todo-findings/contested/last-gaps/fix-round
- PR body (fetched 09:21Z) still names 9824f4e9 as head, SHA f1b603ca/35e53da4 (head: 72e62104 approval line, migration c44a0c65; doc file sha 6793de99); lines 72,102,104,112,145,172,198,202,210,228-231,265,272 stale
- migration diff since d2fdd106: header only (lines 50-56)
- FOUND (nit) DB-C1 fix text too narrow: migration header :53-56 and runbook :324-326 say snapshot "began before the locks were taken"; probe (PG18.4, db tp_i126d_rvdb2_1, r4db2-work/mig.out page.out): RR snapshot begun DURING hold (after locks, before commit) also reads m=0, e=5; reload 5. Correct condition: before the migration commits.
- oneSnapshot pages: practice home, ledger review (specialist), reconciliation, case page (all readWithAudit?) -> check "writes nothing"
- running CAS-42.3 with EXPLAIN patch (r4db2-work/large.sh, explain.txt, large.log); clone patched interest-chains.ts (revert after)
- FOUND (should-fix) gap1 partial take-back at head: r4db2-scripts/partial-head.mts (real interestWrites+interestOutOfReach composed as recordInterest): in order total 600 (=cash); out of order (Z,X then Y) total 0 forever: Y's 4.40 kept off L1 by MONEY-R4-1 guard, X owes 4.40 forever, b's 6.00 waits. Contradicts ADR 0084 D5 "outcome is the one the remittances give uploaded in order" (ADR ~:134-137). Unit test interest.test.ts:553 puts late interest on L2; property :963 single Y.
- gap2 (take-back side of F-M2-1): design D5 (designs/ledger-interest-once.md ~:403-409) says taken back = "lines that hold interest of the chain ... matches naming any claim of the chain"; ADR D5 same; F-M2-1 sentence scoped to paid draws. NOT a defect vs granted text.
- CAS-42.3 at head with EXPLAIN (patch reverted): pass 36.4 s (<150 s), ATTRIBUTION_CLAIMS 69-82 ms exec (S=201, 2000 hashes, 4100 rows), RLS predicate on every scan, role tp_worker_dev; rc join = hash join seq scan claim (single-tenant DB). No perf defect.
- now: mutation drop (b) caseLineChains from mayYetHold, run interest db tests (r4db2-work/mutb.log)
- FOUND (should-fix) gap3 confirmed: with (b) dropped (mayYetHold: unlinkedReversals only), 7 db files / 154 tests pass (interest, ledger-oracle, ledger, payment-terms, chain, packages/db ledger-interest, reconciliation-routes) r4db2-work/mutb.log
- FOUND (nit?) runbook :333-336 "one practice's pass at 2,000 lines takes most of a minute, CAS-42.3" vs 0.5 vCPU deployed worker 333 s/2,084 lines (ADR 0083:414,845) & F 603 s (PR body CAS-42.5); reconcile = one transaction (pass.ts:38-50) holding AccessShare on ledger tables > 5 min window; advice "no reconcile queued" misses a running one
- (b) mutation reverted; cond-b.mts: (b) kept -> in/out of order both 0; (b) dropped -> out of order 600. So (b) decides an outcome no committed test pins.
- gap4: PRD.md:548 granted text "Interest the payer pays (PLB L6) is recorded ... against the case lines of the claims it is for"; ADR 0084 "Payments that wait for good" (:278-282) contradicts; design section 14 (:1498-1514) handed renumbered-reversal interest flip to a later Lane B PR; PR body:265 asserts behaviours 1 and 4 unchanged. -> should-fix records/scope (distinct from already-raised UX of waiting)
- gap5: PR body (09:21Z) names 9824f4e9 head, f1b603ca/35e53da4, F-M2-1/F-M2-2/DB-C1 "not fixed", no MONEY-R4-1/RV-DB1-1 rows; 0 PR review comments, 0 issue comments, 0 reviews (no approval-line suggestion for 72e62104); CI on 9c68a4be: domain model failure, others success/in progress
- holdings index (F-M2-2) equivalence: checked by reading, OK
- FOUND (nit) guard escape: LOCK without TABLE + ERRCODE '55P03' (both valid PG18) escape lockLoopFailures and locksWithNowait (migrate.test.ts:76,84,117); r4db2-scripts/guard.mjs
- CI domain model on 9c68a4be: matches schema; fails only on blank approval (r4db2-work/dm-job.log)
- DONE checking; cleanup: drop tp_i126d_rvdb2_1, remove clone
