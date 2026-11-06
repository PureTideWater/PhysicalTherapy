# SUITE-CAP-1b: root cause of F's reconcile time (CAS-42.5 7b, head 3ac856d5), 2026-11-04

Started ~21:00 UTC. No earlier progress file. Work dir: scratchpad/inv-recon/.

## Read so far
- Local after-side (cas42-final/local-after): F reconcile 730.8 s (20:17:26-20:29:37); the only live samples (recon-rate*.log)
  are from 20:28:33-20:28:53 (last minute): single-row INSERT INTO line_status, 25-47 ms apart. What the first 11 minutes
  did is NOT sampled (the stage-writes sampler matched only triage's priced_line_id inserts).
- Triggers on line_status (head): line_status_rules (BEFORE, 1b's body: head upsert), line_status_ledger_rules (BEFORE),
  line_status_belongs (AFTER row), line_status_refresh_cases (AFTER STATEMENT: UPDATE "case" SET updated_at -> case_rules,
  which re-counts EVERY line of the case with two `ORDER BY seq DESC LIMIT 1` lookups on line_status per line).
- Harness F: 2,000 lines in ONE case (scenario.ts); CAS-42.3: 5 cases (one per code; Lane B's map). syncLineStages writes
  2 events per line (payer_approved, recovered) = 4,000 single-row statements, each refreshing the whole case.
- Lane B (SUITE-CAP-3 profile, 2026-11-01/02): case_rules 9.7-11.6 ms per stage insert on a 400-line case;
  ledger_entry_within_line -> ledger_line_net seq-scans ledger_entry 3x per call (cached plan from empty-ledger stats).

## Setup
- Scratch clone inv-recon/head at 3ac856d5 (clean); prep.sh (install, worker build, img dir, quarterly release dir) under the lock.
- Private cluster: PG 18.4, /tmp/sc1b-inv-recon-pg/data, port 5497 (NOT under the scratchpad: /tmp/claude-0 is 0700 root and
  its mode is reset, so the postgres user cannot reach a data dir there; a chmod o+x was tried and reverted at once, all
  modes back to 700). Settings = 5433's non-defaults (shared_buffers 128MB, max_connections 100, en_US.utf8) plus
  max_locks_per_transaction 1024 (the base's per-line locks at 2,000 lines), shared_preload_libraries auto_explain,
  track_functions all, track_io_timing, logging_collector (log/). auto_explain/log_min_duration off by default: set per
  role for the profiled session only. REMOVE AT END: pg_ctl stop; rm -rf /tmp/sc1b-inv-recon-pg.
- Prep done 21:01 (release 900110, 4,172,393 records, MANIFEST 0b700554...8723, same as CAS-42.6's). Scratch harness change
  (never committed): run.ts writes inv-recon/stop-7b.json and stops (HarnessStop PROFILE_STOPPED_BEFORE_F_RECONCILE)
  right after F's reprocessing parse and cancelMonitoring, i.e. where step 7b queues F's reconcile; --keep-database.
  profile-7b.ts (scratch) runs that reconcile job as run.ts would (ProcessRuntime worker: same cgroup 0.5 vCPU/1024 MiB,
  cpuset 3, command, env), on a copy (CREATE DATABASE ... TEMPLATE tp_sc1b_rt_1), timing pg-boss's started->completed.
- run-stop.sh launched 21:03 (FULL_SIZE, DB tp_sc1b_rt_1 on 5497). on-stop.sh turns autovacuum off the moment the stop
  file appears (freezes the planner statistics at step 7b's start for every copy).
- run-copy.sh <name> <copy> <variant.sql|-> <profile 0|1>: copy, variant bodies (no ANALYZE/VACUUM), pg_stat_statements
  (track all, after a restart with it preloaded) + track_functions reset, then profile-7b; dumps pss/functions/tables.
- state-base.sql: base bodies (00fd2906 = merge base 17641c88 for these objects: the only schema delta base..head is
  20261109090000; reconcile code identical): line_status_rules (20261023120000), ledger_entry_within_evidence/_line
  (20261027090000; differ from 1b's only in the lock line), DROP INDEX claim_by_superseded, DROP TABLE line_status_head.
- 21:19:39 harness STOPPED where 7b queues F's reconcile (stop-7b.json; F practice a95548a2..., export 4afd4a17...;
  worker login tp_worker_login_a790a8ad). Setup times as CAS-42.6's (load 548.6 s frozen, A triage 30,795 of 30,795).
  autovacuum off at 21:19:40.5 (0.7 s after). Stats at the stop (pg_class): case 3 rows (A, B, F: ONE case each; never
  analyzed, reltuples -1), ledger_entry/ledger_match/posting_row/remittance never analyzed (empty or tiny), line_status
  114,707, line_status_head 75,841, case_line 38,866, claim 91,961, service_line 322,000, adjustment 353,992,
  priced_line 222,000 (analyzed 21:13-21:18). DB 5.3 GB. Release dir removed (disk).
- Cluster restarted with pg_stat_statements (track all) preloaded (nothing ran between).
- 21:21 head-prof: copy tp_sc1b_rt_2, auto_explain (min 10 ms, analyze, buffers, nested, triggers, sample 0.25,
  log_min_duration_statement 50) on the worker login in that db only; activity sampler 1 s.

## Profile: head (3ac856d5 bodies), runs/head-prof (auto_explain sampled 25% with analyze; pg_stat_statements track all)
- F's reconcile COMPLETED attempt 1 in 690.3 s (21:21:48-21:33:18; local CAS-42.6 730.8 s, CI 615.7 s): reproduced.
  Advisory locks at most 1 per backend. Activity samples: 21:22-21:30 nearly every 1-s sample is candidatesFor;
  21:31-21:33 single-row INSERT INTO line_status.
- pg_stat_statements (exact totals, nested statements included), of 690.3 s:
  1. remittances.ts candidatesFor **byPatient** (:190): 4,000 calls, **500.1 s (72%)**, 125.0 ms a call, 137 M buffer hits.
     (byControl :181: 4,000 calls, 4.7 s, 1.19 ms.)
  2. stages.ts insertStage INSERT INTO line_status: 4,000 calls, **130.4 s (19%)**; of it the AFTER STATEMENT
     line_status_refresh_cases -> UPDATE "case" 127.4 s -> case_rules()'s totals SELECT 122.8 s (30.7 ms a call:
     re-counts all 2,000 lines of F's ONE case with two latest-event lookups per line, per stage event).
     1b's own statements: the head upsert INSERT INTO line_status_head 4,000 calls 0.32 s (0.08 ms);
     line_status_rules() total 0.51 s (track_functions).
  3. ledger_entry inserts 10.5 s (ledger_line_net 12,063 calls 4.1 s; within_evidence 1.6 s; within_line 4.6 s).
  4. claimLines 4,003 calls 3.9 s (claim_by_superseded in use). Everything else < 2.4 s.
- byPatient's plan (auto_explain, 1,035 explained, mean 124.6 ms, max 300.7 ms): claim c by claim_by_patient with only
  practice_id (all 1,680 of F's claims; 560 pass the filters) -> per claim: anti-join case_line/service_line, remittance,
  then the NOT EXISTS on ledger_match as a Bitmap Heap Scan of ledger_match_by_remittance on practice_id alone (every F
  match so far: 1,480 rows removed by filter, 0.455 ms x 560 loops = 255 ms of the 300), the code/date EXISTS last.
  ledger_match was EMPTY and never analyzed at the pass's start (reltuples -1); the pass writes F's ~4,000 matches
  inside its own transaction, so each later call scans more: O(lines x claims x matches) in F's OWN rows. No other
  practice's row is read (every scan's Index Cond has practice_id).
- case_rules' plan: F-scoped index scans only (case_line_by_case 2,000 rows, priced_line_pkey x2,000, line_status_by_line
  x4,000): a good plan, O(lines in the case) per event x 4,000 events.
- Interim reading: neither hot statement is 1b's (remittances.ts and case_rules/line_status_refresh_cases are unchanged
  base code; 1b's head upsert costs 0.3 s). Base run next to confirm.
- EXPLAIN of byPatient after the pass committed (runs/head-prof/explain-bypatient.txt; captured parameters, worker login,
  F in scope): 29.4 ms as found (now ledger_match_by_line, 86 pages, never analyzed); + index ledger_match (claim_id)
  WHERE kind='claim' 14.6 ms; ANALYZE ledger_match 15.2 ms; ANALYZE claim 28.4 ms. In the pass the plan (made while F's
  matches were being written in the same transaction) took ledger_match_by_remittance on practice_id alone: 125 ms mean.
  (Note: ANALYZE's pg_class reltuples/relpages update is in place, not rolled back: rt_2's later variants saw it.)
- tp_sc1b_rt_2 dropped (disk: 4.1 GB free with two 5.3 GB dbs).

## Base bodies (state-base.sql on a copy; runs/base; no auto_explain), 21:38:40-21:49:57
- F's reconcile COMPLETED attempt 1 in **676.8 s**; advisory locks at most **6,001** per backend (head: 1).
- byPatient 4,000 calls **479.1 s** (119.8 ms) with **137,231,521 buffer hits: the same count as the head's** (same plan,
  same work); the case refresh: INSERT line_status 114.9 s, case_rules' SELECT 108.1 s with **120,287,999 hits, the same
  as the head's**; claimLines 28.6 s (7.1 ms; no claim_by_superseded) against the head's 3.9 s; ledger_entry inserts 9.9 s;
  line_status_rules() 0.25 s (the head's with its upsert: 0.51 s).
- => PRE-EXISTING. The time is the same statements with the same plans and the same buffer counts on the base's bodies.
  1b's migration takes ~25 s OFF this pass (claimLines through claim_by_superseded) and adds ~0.3 s (the head upsert).

## Head, clean (runs/head-clean; no auto_explain), 22:07:46-22:16:44 (the lock was held by another session 21:51-22:07)
- **538.1 s**, attempt 1, locks 1. byPatient 403.5 s (100.9 ms; 137,231,521 hits, = base = head-prof); case refresh:
  INSERT line_status 89.5 s / case_rules SELECT 84.4 s (120,287,999 hits, = base); ledger_entry inserts 8.2 s.
- Base (676.8 s) vs head (538.1 s): the head is FASTER: claimLines -24.7 s (claim_by_superseded); the rest of the gap
  is the same statements with the same buffer counts running slower on the base (6,001 advisory locks held to the end
  of a transaction of ~30,000 statements; and run-to-run noise: CAS-42.6 local 730.8 s, CI 615.7 s, here 538-690 s).
