# SUITE-CAP-3 profile: progress (continue from here)

Started 2026-11-01 (item session). Base 83d71fd6.

## Done
- Scratch clone $S/cap3-base at 83d71fd6, pnpm install --frozen-lockfile OK (results/install.log).
- Read: reconcile/{pass,job,remittances,stages,postings,ledger}.ts; 1b's reconcile.large.db.test.ts, scenario.ts (7b), migration 20261109090000 (saved as $S/1b-migration.sql).

## Plan
- cluster: /tmp/laneb-suitecap3-pg-1, port 5494, shared_buffers 128MB (as 5433), max_locks_per_transaction 4096.
- seed per N one template DB (migrated from empty at base, state a), then CREATE DATABASE ... TEMPLATE copies per (state, shape); DDL for (b)/(c) applied by hand on the copy (as tp_owner), then ANALYZE.
- probe in $S/cap3-probe; results in $S/cap3-results.

## Databases

## Runs
- Cluster up: /tmp/laneb-suitecap3-pg-1 port 5494 (cap3-probe/cluster.sh), PG 18.4, locks/tx 4096, shared_buffers 128MB.
- Probe written: cap3-probe/{common.mts,seed.mts,pass.mts,probe.sh,prep.sh,matrix.sh,analyze.py,explain.sql,state-*.sql,cluster.sh}.
- Seeds (template DBs on 5494): cap3_r_2000_seed (meta in cap3-results/cap3_r_2000_seed/meta.json).
- Results so far: cap3_r_2000_c_7b-7b 208.4 s (state c, realistic, 2,000). c pre 136.5 s.
- Matrix running (matrix.log): 2000 R: c P, b 7b, a 7b, b P, a P; then seeds 6000 R, 2000 A, 6000 A.
- Plan for 6000+: prep.sh pre once (state b), then prep.sh P <seed> a|b|c; probe.sh shape <seed> a|b|c 7b.
- Plan findings (explain.sql on post-pass DB, N=2000): claimLines per call seq-scans claim (merge join on CTE) and
  hashes all of adjustment (EXISTS subplan) even with claim_by_superseded; byControl hash-anti-joins all case_line x
  service_line per call; byPatient bitmap scans every line of the code (all dates) + seq scan of claim per call.
- 2000 R results: 7b a 262.5 s (locks/backend 5,999), b 224.2 s (5,995), c 208.4 s (1); c pre 136.5 s; c P 66.4 s.
- Case refresh: UPDATE "case" (case_rules) 11.6 ms on a 400-line case (cases = 5, one per code) - each stage insert pays it.
- diag.sh (auto_explain into $OUT/diag/<db>.plans.txt): run 1 (min 20ms, 5%) only top-level INSERT plans; run 2 with
  log_triggers, min 3ms, 1% running.
- prep.sh written for 6000+ (pre once in state b, then per-state copies).
- 17:41 seeds done: cap3_r_6000_seed, cap3_a_2000_seed, cap3_a_6000_seed. 2000 R P: a 64.?/b 65.5/c 66.4 s; pre a ?/b 143.8/c 136.5.
- diag run 2 (cap3-results/diag/cap3_r_2000_c_diag.plans.txt): 7b posted inserts: ledger_entry_within_line 24.6 ms avg -
  ledger_line_net seq-scans ledger_entry three times per call (stats from an empty ledger: cached plan); case_rules
  9.7 ms per stage insert (case refresh of a 400-line case).
- 6000 R matrix queued (bjavywekx): c 7b, pre(b), P c, b 7b, P b, a 7b, P a; appends "all-done" to matrix.log.
- 6000 R c 7b: 1,486.4 s (k 1.79 vs 2000). Families k(time) ~1.9-1.96: settle/insert.entry, claimLines, stages.insert,
  byControl; byPatient k 1.12 (R spread).
- 18:10 detached queue runner launched: setsid nohup cap3-probe/runq.sh cap3-results/queue1.txt (skips steps whose
  result json exists; waits for the bjavywekx matrix shell to end). If the session restarts: check matrix.log, then
  relaunch runq.sh with the same queue (export TP_REPO=$S/cap3-base OUT=$S/cap3-results).
- 20:0x RESUMED (machine restart): cluster restarted (cluster.sh up, data dir survived). 6000 b 7b had died mid-run (no json).
  queue2.txt launched with runq.sh (order: 6000 a 7b, 6000 a P, A 2000 c/a 7b, seed 10000 R, 10000 pre(b), 10000 c P,
  A 6000 c 7b, 10000 c 7b, then 6000 b 7b, 6000 b P (lowest priority, drop if time)). 20,000 not run: 6000->10000 extrapolated.
- 20:15 statsx.sh added (stats control: a fresh 7b copy whose ledger/stage tables carry the planner statistics of the
  same seed's post-pass database, via PG18 pg_restore_*_stats) - tests whether 7b's settle/insert.entry growth is the
  empty-ledger cached trigger plans. queue2.txt rewritten in place (same first line): statsx 2000 c after 6000 a P,
  statsx 6000 c after 10000 c P.
- Findings so far (read): ledger_entry_within_evidence/within_line plans use ledger_entry_by_case / seq scans although
  ledger_entry_by_evidence and ledger_entry_by_line exist -> plans made on empty-table stats. Interest fix's
  ledger_entry_within_interest returns before any query for a non-interest entry (no growth term here).
- 20:26 6000 R a 7b 1,653.3 s (locks/backend 17,997); 20:30 6000 R a P 264.7 s.
- 20:33 statsx 2000 c 7b (prod-like ledger stats): 143.8 s vs 208.4 s; settle/insert.entry 47.6->19.9 s (23.8->9.9 ms/call), byPatient 28.9->13.0, stages.insert 36.8->29.7; claimLines/byControl ~-15%. Same after counts (posted_cents 6000000).
- 20:45 reordered queue2: killed the 10000 pre (b) at start (40-min projected) to run 10000 c 7b first; then statsx 6000 c, A 6000 c 7b, 6000 b 7b/P, and 10000 pre+P last. A 2000: c 7b 183.6 s, a 7b 247.2 s (decrypts 50/line remittances).
- 21:39 10000 R c 7b: 3,412.1 s (statements 160,035; heap peak 172.1 MiB; locks 1). Fit from 2000/6000 had projected 3,912 s.
- 21:56 statsx 6000 c 7b: 1,035.3 s (vs 1,486.4 s with seed stats).
- 22:05 settle/insert.entry still grows in statsx (planner rescales restored stats to the table's actual pages). Added fillx.sh (100,000 other-tenant ledger_entry rows written with replication role replica, ANALYZE) and queued fillx 2000 c, 6000 c after A 6000 c.
- 01:05 RESUMED 2 (machine restart): cluster restarted; queue3.txt = fillx 2000 c, fillx 6000 c only. DROPPED: 10000 pre+P (state c P at 10000) and 6000 b 7b/P - states (a) and (c) bracket (b) (b differs from a only by claim_by_superseded; 2000 b measured both shapes), and 10000 c 7b is measured.
- 01:05 fillx 2000 c 7b (100,000 other-tenant ledger rows, analyzed): 144.5 s (= statsx 143.8). fillx 6000 c running (started 01:04:57).
- 01:22 fillx 6000 c 7b: 1,033.7 s. queue3 done. Next: analyze, attribute, cluster down.
- 01:30 DONE: profile.md regenerated (analyze.py), README notes fillx.sh, private cluster on 5494 stopped and /tmp/laneb-suitecap3-pg-1 removed. Dropped (with why): 6000 b 7b/P and 10000 pre+P (states a and c bracket b; 10000 c 7b measured); 20,000 extrapolated (projects ~2.9-3.3 h).
