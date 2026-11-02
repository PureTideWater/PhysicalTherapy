# SUITE-CAP-3 design progress (design phase)
Started 2026-11-02. Design file: /home/user/ops/designs/lane-b-suite-cap-3-reconcile.md (not yet written)
## Steps
- [x] cap3-try: scratch clone of cap3-base with the candidate fix
- [x] fix: matchClaims set-based candidates + per-pass claimLines cache
- [x] fix: syncLineStages one multi-row INSERT
- [x] fix: lineChain match index, settle running sum, claimsWithReference memo
- [ ] LED tests + oracle on cap3-try (shared 5433)
- [ ] probe runs (private cluster /tmp/laneb-suitecap3-pg-2, 5494)
- [ ] equality dumps base vs try
- [ ] design written
- [ ] cluster removed

## Notes
- cap3-try diff: remittances.ts (passCandidates/controlCandidates/patientCandidates replace candidatesFor/candidateClosure/chainOrdered; reprocessingOf optional `read` map; lineChain standingByLine WeakMap), stages.ts (insertStages one multi-row INSERT), postings.ts (settle running sum per check; RemittanceClaims memo in matchPostings). Typecheck OK.
- cluster up: /tmp/laneb-suitecap3-pg-2 port 5494 (remove at end)
- probe additions: cap3-probe/dump.py (equality dump), runcap3.sh (label base|try), queue-cap3.sh (resumable), common.mts families candidates.pass*
- results: cap3-results-try, cap3-results-base2, seeds in cap3-results-seeds
- db tests on try running (log progress/cap3-try-dbtests.log)
- 02:10 design file: sections 0-6 written (header, In twelve lines, problem, options, decisions D1-D14, app changes, why same writes, sentences). Next: 7 tests, 8 measurement (numbers from cap3-results-try), 9-16.
- db tests on try: 13 files / 175 tests pass (reconcile + report, LED-01..18, ledger oracle, CAS-41 streamed)
- try 2,000: 7b c 57.7/53.7 s, 7b a 61.3 s, P c pre 8.1 + P 9.9, P a pre 12.1 + P 18.4
- dump.py v2 (settle entries compared as a set + order-rule check); v1 dumps moved to cap3-results-try/v1
- state l = c + CREATE INDEX ledger_entry_by_service_line ON ledger_entry (service_line_id, stage) (Lane A candidate)
- 02:20 sections 7 (tests), 9-15 skeleton written; placeholders MEASUREMENT_PLACEHOLDER, LANE_A_PLACEHOLDER, PATIENT_SECONDS, PROPOSALS_PLACEHOLDER, PROBES_PLACEHOLDER to fill; fix CAS-51 "fails first" text (ratio claim unmeasured)
- state l (index on service_line_id) = NO gain at 2,000 (55.7 vs 53.7 s): ledger_line_net's cost is the LEFT JOIN t/r seq scans planned on empty stats. New Lane A candidate state m = c + ledger_line_net rewritten (CASE scalar subqueries by pk), queue-cap3m.sh running (2000 dump, 6000, 10000)
- try 6000 c 7b: 381.2 s (settle 330.7 s = ledger triggers)
