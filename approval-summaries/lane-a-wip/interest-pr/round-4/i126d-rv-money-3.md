# i126d-rv-money-3 progress (round 3 money review, PR #126)
## Checked
## Found
- head is 98bb9c00 (not 9824f4e9): 16 first-parent commits since d2fdd106 incl 1fda5637 (MONEY-R4-1 outOfReach), 1fadbc11 (R2M2-1 unplaced, RV-DB2-1 kept-off line), 47eb9f51/bdb218f1.
- clone at scratchpad/r4-money-3, installed OK.
- read: packages/ledger/src/interest.ts (head), remittances.ts 860-1280, interest-chains.ts (all)
- (a) renumbered reversal: confirmed by code: remittances.ts:1186 mayYetHold via unlinkedReversals; interest.ts:414 waiting; LED-23 expected note hides K ("K's 2.00 on no case line"); ADR bullet says "chain's net". Loader: remittances only ever inserted 'loaded' (loader.ts:347), never updated -> the "linked to non-loaded remittance" sub-case is unreachable today.
- expected.json variants: read by no test (oracle reads only outcome.entries/recoveredCents/postedEntries/matches, ledger-oracle.db.test.ts:175-275). Compared LED-24 variants vs db test figures: agree today.
- design /home/user/ops/designs/ledger-interest-once.md dated Nov 1, last commit e682aa56 Oct 27; no mayYetHold/wait/outOfReach/unplaced text.
- MUTANT A (drop interest.outOfReach.delete, remittances.ts:1236): interest.db.test.ts + ledger-oracle.db.test.ts 54/54 PASS -> survives.
- PROBE (scratch fixture LED-24/zz-rvm3-late-rest-paid.835 = one-line-rest-paid redated 2026-09-01; scratch test in interest.db.test.ts, uncommitted): head: both orders 600/600. Mutant A: in-order 600, one-pass (netted+late before one reconcile) 440 vs 600 cash, L1 [100,-100,440], L2 [] -> B's 6.00 lost for good. FOUND: invalidation load-bearing & unpinned.
- MUTANT B1 (outOfReachOf ignores takeBacksOf): KILLED (MONEY-R4-1, oneLine between, probes).
- MUTANT B2 (unplacedOf passes takeBacks: [] to interestUnplaced, remittances.ts:1123): interest.db + oracle 56/56 PASS -> survives.
- PURE PROBE packages/ledger/src/zz-rvm3.test.ts (scratch): two take-backs of chain a (X1 -3.00 nets K1 +6.00; X2 -4.40 nets K2 +6.00), Y1 1.00, Y2 4.40 dated first: cash 10.00. head in order 6.00, out of order (Y2 last) 0.00 -> ORDER-DEPENDENT. Mutant takeBacks [] out of order 12.00 > cash. Property at interest.test.ts:1167/1249 always passes takeBacks: []. FOUND.
- renumbered with K on case line: interestWrites returns [] (K's 2.00 never written). FOUND (a).
- stryker money-ledger at head (CI job 128403035236): interest.ts 100% (411 killed). Survivors in other ledger files only.
- runbook 315-340 & migration header 40-60 name only Reconciliation/ROI; Home practice.ts:217 oneSnapshot reads unmatchedItems (dashboard/queries.ts:195) + practiceRecoveredPeriods (:215); case page triage.ts:402, ledger review specialist.ts:111 also oneSnapshot. nit.
- reverseMatch (manual.ts:177) accepts any kind; claim-match reversal releases waiting but outOfReach keeps <= cash (reasoned). written-off lines stay in caseLines (remittances.ts:161-170, open flag only gates new matches) -> reopen same as by-hand. no defect.
- ATTRIBUTION_CLAIMS EXPLAIN ANALYZE at LED-25 size (reader, 2500 matched claims): 6.5 ms, third branch via ledger_match_by_remittance; LED-25 fixture's claims join no remittance of reader so walk never exercised. no defect evidence.
- remittances.ts diff since d2fdd106: only imports, header comment, interest functions. principal untouched.
- earlier-only subtraction (take-backs dated before it) in the pure probe: 6.00 both orders; safety same.
- DONE checking; findings: RVM3-1 (a) permanent wait/K; RVM3-2 cache delete unpinned (probe 440 vs 600); RVM3-3 two take-backs order-dependent + subtraction unpinned + property generators; RVM3-4 runbook/header readers (nit); RVM3-5 design out of step (nit); RVM3-6 expected variants unread (nit).
- clone to be removed; DBs dropped.
