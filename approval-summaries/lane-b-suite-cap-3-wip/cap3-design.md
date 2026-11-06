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
- 02:35 equality: base vs try IDENTICAL for r2000 7b a and c (seq values, settle order rule true). State m (ledger_line_net rewrite) 2000: 25.6 s, writes identical to base c. try 6000: c 381.2 s, a 446.8 s. beforeafter.py makes the table.
- 02:20 candidate v2: postings.ts neverMatched() (posting/eft rows never matched: ids read apart, linear; the anti-join was 0.6 s at 2,000 and 5.6 s at 6,000 in P, quadratic on unanalyzed posting_row). Runs that started before this time are v1; re-run P shapes and 7b 2000 dumps with v2 at the end.
- 02:55 v2 db tests: reconcile+report 13 files/175 pass; unit reconcile+ledger 16 files/239 pass. m 10000: 263.3 s. try a6000 c 7b 421.6 s (patient query 1.52 s, decrypts 7,500). base2 A 2000 c 196.8 s.
- design: D15 added; proposals 14.4 written. Remaining: section 8 numbers, 14.1 Lane A, 14.3 PATIENT_SECONDS, 15 probes, CAS-51 text fix, section 9 postings D15.
- 03:56 ALL RUNS DONE; private cluster /tmp/laneb-suitecap3-pg-2 REMOVED. Table: cap3-results-try/beforeafter.md. Equality: 7 pairs identical + state m identical. Remaining: write section 8, fill M_* in 14.1, PATIENT_SECONDS, CAS-51 text, section 9 D15, final read-through.
- 04:10 DESIGN COMPLETE: /home/user/ops/designs/lane-b-suite-cap-3-reconcile.md (838 lines, sections 0-15, D1-D15), not committed. Probe README updated. Cluster removed. Nothing tracked changed elsewhere.
