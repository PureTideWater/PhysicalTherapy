# SC-1b builder G: measurement gate + CAS-42.1/.2 + ADR 0083 1b section
Worktree /home/user/sc1b, start ce408d2f (pull: already up to date).
## Steps
- [x] read code
- [x] wrote apps/worker/src/triage/triage.large.db.test.ts + test-support/large-jobs.ts (child script; new file beyond owned list, report it)
- [x] head trial 2,000 lines: pass (log logs/cas42-head-2k.log). observed allowed 2000c -> 1666/2000 validated, 834 actionable, 1 case
- [~] gate run on base: worktree made, test+child+heap.ts copied in, running gate-base.sh in bg (100k then 20k) under flock; logs gate-base-100k.log, gate-base-20k.log
- [ ] full-size run on head
- [x] SLOW_FIRST (+triage.large, +reconcile.large; comment has @@TRIAGE_MIN@@ placeholder) and db-shards 15->17; registry assertedBy edited (synth regen pending)
- [~] ADR 0083: status, deciders(grant), PRD line edited in file; section drafted at scratchpad/adr-1b.md (placeholders @@WHEN@@ @@TABLE@@ @@BASE@@), to insert before "## Alternatives considered"; also Revisit-when items to add (reconcile pass time, checks.ts limit)
- [ ] checks, commit, push
## Findings
- V8 heap_size_limit = 612 MiB under --max-old-space-size=420, 752 under 560 (young gen included). heap.ts's heap_limit_mib reports this; check checks.ts's 75% rule uses which limit -> open item?
## Peaks and times
## Open items
## Gate results so far
- base 100k (efb20704 + test/child/heap.ts copied): FAIL in setup, 53200 "out of shared memory" at B's (20k) validated insert (execute.ts:510 advanceStages validated), 30 s. log logs/gate-base-100k.log
- base 20k run 1: both tests failed, child exit 1 (stderr message truncated) -> added "large job failed: {code,message}" line in child + test message; rerunning via gate-2.sh (base 20k, then head 100k), task bodadr4gu
- base 20k rerun: both FAIL with child 'large job failed: {code 53200, out of shared memory}' (A's triage in 42.1; A's report+Y's triage in 42.2); setup 44.7 s incl B 4k triage+report OK. 72 s. Gate worktree removed.
- HEAD 100k (sc1b ce408d2f + new files), 838 s total, setup 191.2 s:
  - 42.1 triage alone (420 flag): 61.5 s, actionable write 6.7 s, live peak 160 MiB (limit reported 612), sampled heapUsed 231, rss 477, locks peak 1 (2390 samples); 83,332 validated, 41,667 actionable, 1 case
  - 42.1 report alone (420): ready but 481.3 s  > 180 s budget -> FAIL; live 149, sampled 197, rss 531, locks 1 (18256 samples)
  - 42.2 together (560): report 89.4 s, Y triage 72.3 s (actionable 6.6 s), live 220 MiB (<420), sampled 289, rss 637, locks 1 -> PASS
  - => investigating first report's 481 s (second report 89 s): suspect stale stats right after triage. Adding slow-statement capture to child.
- (resumed run 2) slow-statement capture is in the child (slowest 5 per job). Head migration DOES carry claim_by_superseded (line 140). Rerunning head 100k -> logs/head-100k-2.log
- HEAD 100k run 2 (logs/head-100k-2.log, 939 s, setup 316.8 s waited lock): 42.1 triage 60.1 s, actionable 6.6 s, live 151; 42.1 report 460.2 s FAIL (live 128, sampled 212, rss 549, locks 1) -- 391.8 s of it is "FETCH 2000 FROM triage_candidates" (21 runs) = the report's inline re-triage right after A's triage; 42.2 report 87.2 s (triage_candidates 10.3 s), Y triage 70.0 s (actionable 6.9), live 189, sampled 307, rss 649, locks 1 PASS.
  => stale stats on line_status/case_line right after triage (A's 125k events unanalyzed) -> bad CANDIDATE_QUERY plan. Diagnosing with auto_explain (zz-diag file, untracked, remove after).
- diag run 1 (logs/diag-100k.log): triage 62.7 s live 162; report right after 80.4 s (fast!) -> slowness is a race with autovacuum's ANALYZE of line_status after A's triage. Next: diag 2 with autovacuum off on line_status/case_line/line_status_head to get the bad plan via auto_explain.
- diag 2 (logs/diag2-100k.log, autovacuum off on line_status/case_line/line_status_head): triage 62.6 s live 159; report killed by the child's timeout (~965 s). auto_explain (pg18.log, 02:00:14): DECLARE triage_candidates took 421.7 s: planner estimated 1 row for the in_effect set (stale stats), chose Nested Loop Anti Join to case_line via case_line_by_case (practice_id only) with Join Filter cl.service_line_id = p.service_line_id: 83,332 loops x 31,250 rows = 2.6e9 rows removed. case_line_once (service_line_id) exists but is unused. => DEFECT in candidateRows' query (execute.ts, not my file): open item. Not a test problem.
- (resume 3, 02:10) next: remove zz-diag, check PG settings, fill placeholders, synth regen, checks, final large run, commit, push.
- (resume 3) zz-diag removed; no auto_explain DB setting left; ADR 1b section inserted (placeholders filled, report-plan finding + 3 Revisit items); vitest comment filled (14-16 min). Decision: one file, no split (setup would double; slowness is the defect). Head run 2 = the large-tests check (files unchanged since 01:10).
- next: synth --case CAS-42, checks, commit, push.
- (resume 3) synth --case CAS-42 regenerated expected.json. Checks script g-checks.sh started (typecheck still running when the turn was forced to end). NOT committed, NOT pushed. Next run: rerun scratchpad/g-checks.sh, then commit + push.
