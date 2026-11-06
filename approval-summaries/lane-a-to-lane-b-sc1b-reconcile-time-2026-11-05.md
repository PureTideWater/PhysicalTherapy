# For Lane B (SUITE-CAP-3): step 7b's reconcile time on SUITE-CAP-1b, a finding from 1b's CAS-42.5

From Lane A's schema-chain session (session_019i9ifEG147aKfNHEAsoS7h), 2026-11-04. Head measured: 3ac856d5 (PR #110).
Full record: approval-summaries/lane-a-wip/sc1b-pool/reconcile-time-record.md
Recorded in ADR 0083 as a known limit ("The
reconcile pass at step 7b's 2,000 lines: a known limit, SUITE-CAP-3's, 2026-11-04"). 1b changes no reconcile code for it.

## The shape
Harness practice F: 2,000 actionable lines in ONE case (one pattern), 560 reprocessing claims of 1,680, one posting export.
Step 7b runs approvals and postings in one pass (unlike CAS-42.3's measured pass, which posts only: 55.2 s at 2,000).

## Times (attempt 1 everywhere; the job's attempt is pg-boss's 900 s)
- CI: 615.7 s (run 41901463895) and 526.3 s (run 41913629020, same tree plus a harness probe): 58-68% of 900 s, 284-374 s
  to spare. A runner 1.46x slower than the slower CI run would cross 900 s.
- Local: 730.8 s (CAS-42.6, 81%); profile copies 538.1 s (clean), 603-690 s (auto_explain on).
- Section 8.4's 2.5x headroom convention would need <= 360 s: not met. F is pinned at 2,000 lines in one case, so only the
  runner's speed can move it.
- From now on every capacity summary's Known gap line prints the run's F reconcile time against its 900 s attempt, with its
  share and the seconds to spare (tools/release-capacity/checks.ts knownGap).

## The profile (private PG 18.4, same settings as 5433, harness stopped where 7b queues F's reconcile, autovacuum frozen;
pg_stat_statements track=all, track_functions=all; each variant on a fresh TEMPLATE copy, run through the worker as run.ts runs it)
1. candidatesFor byPatient (apps/worker/src/reconcile/remittances.ts:190, CANDIDATE_FILTERS :172-176): 4,000 calls,
   ~403 s (100.9 ms a call) at 137,231,521 buffer hits; 72-75% of the pass. Plan: the NOT EXISTS (SELECT 1 FROM
   ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = $5) is a Nested Loop Anti Join
   whose inner side is a Bitmap Heap Scan on ledger_match_by_remittance with only the RLS practice qual as Index Cond
   (kind and service_line_id as Filter, claim_id = c.id as Join Filter), re-run for each of ~560 candidate claims, each
   reading every F match the pass has written so far (up to ~2,000 removed by filter per loop): O(lines x claims x
   matches), all in F's own rows. Cause: ledger_match was empty and never analyzed at the pass's start (reltuples -1), and
   every row it holds is the pass's own uncommitted write, so no ANALYZE or autovacuum can correct the estimate (rows=4).
   Same family as your 14.1 (cached trigger plans made on empty tables).
   - Measured and rejected: index ledger_match (practice_id, claim_id, service_line_id) WHERE kind = 'claim': never used
     (idx_scan 0), 580.5 s, byPatient still exactly 137,231,521 hits; ledger_match_by_remittance 2,033,690 scans reading
     2.22 billion index tuples.
   - Measured: the exclusion as an uncorrelated InitPlan,
     `c.id <> ALL (ARRAY(SELECT m.claim_id FROM ledger_match m WHERE m.kind = 'claim' AND m.service_line_id = $5 AND m.claim_id IS NOT NULL))`
     (scratch patch: scratchpad/inv-recon/shape.patch, one line in CANDIDATE_FILTERS, remittances.ts:175; never committed):
     the pass 538.1 -> 223.7 s (25% of the attempt); byPatient 403.5 -> 55.2 s (13.8 ms a call; 137.2 M -> 40.4 M hits);
     result rows (byPatient 2,454, byControl 2,000) and write counts (ledger_entry 4,021, line_status 4,000, ledger_match
     4,000) identical to the clean head.
2. The per-event case refresh: stages.ts insertStage writes 4,000 single-row INSERT INTO line_status; each fires the
   AFTER STATEMENT trigger line_status_refresh_cases -> UPDATE "case" -> case_rules(), whose totals SELECT re-counts all
   2,000 lines of F's one case with two latest-event lookups per line: INSERT line_status ~90-115 s (89.5 s clean head,
   114.9 s base bodies), of it case_rules' SELECT 84.4-108.1 s at 120,287,999 buffer hits (21-31 ms x 4,000). A good,
   F-scoped plan (case_line_by_case, priced_line_pkey, line_status_by_line); the cost is O(events x lines in the case).
3. Everything else: ledger_entry inserts 8-10 s (ledger_line_net 12,063 calls 3.2-4.2 s, your 14.1), byControl 3.9-4.9 s,
   claimLines 3.1-3.9 s (claim_by_superseded, 1b's D15; 28.6 s on the base without it).

## Not 1b's
On the base's bodies (1b's trigger bodies reverted, claim_by_superseded and line_status_head dropped) the pass took
676.8 s with exactly the same buffer counts for both families (137,231,521 and 120,287,999). 1b's own statements cost 0.6 s
of the pass (head upsert 0.23 s, 0.09 ms a call through line_status_head_once; line_status_rules() 0.36 s). origin/
claude/build-platform has changed neither apps/worker/src/reconcile nor case_rules since 17641c88.

## Asked of SUITE-CAP-3
- D1 (one candidate search per pass) and D3 (syncLineStages as one multi-row INSERT, so each case refreshes once per
  statement) remove both families. One addition to D1: write the ledger_match exclusion so its cost cannot depend on
  ledger_match's statistics (an uncorrelated InitPlan as above, or a pre-materialized set), never a correlated NOT EXISTS.
- D14: whichever of 1b and SUITE-CAP-3 lands second resets step 7b's expectation (and CAS-42.3's PASS_BUDGET_MS and size)
  from section 8.4's numbers; once SUITE-CAP-3 moves step 7b back to A's full month, the Known gap line and its margin go.
- Plans: inv-recon/runs/head-prof/ae-plans.txt and runs/head-plans/ae/ae-plans.txt (5,013 plans, 51 statement texts,
  every statement inside the triggers); per-run pss.txt, functions.txt, indexes.txt, result.json, activity.log under
  inv-recon/runs/*/.
