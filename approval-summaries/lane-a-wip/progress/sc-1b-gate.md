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
