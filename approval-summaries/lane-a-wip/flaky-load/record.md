# flaky: tools/release/load.db.test.ts (relallvisible 0 vs 7 after VACUUM FREEZE)
Started 2026-11-04 03:15 UTC. Clone: $SP/flaky at 221777317df88c6c33890ff8ba023d4bb45a2271 (detached), pnpm install done.
PG source for reference (REL_18_4): $SP/pgsrc (procarray.c, pruneheap.c, vacuumlazy.c, analyze.c, autovacuum.c, postinit.c).

## The test
'leaves the release analyzed and frozen once loaded' (withLoadedRelease: scratch db, migrate, loadRelease as tp_owner).
Asserts pg_stats rows, reltuples = records, relallvisible = relpages, relallfrozen = relpages.
Loader (packages/rules/src/loader.ts:175): COMMIT then `VACUUM (FREEZE, ANALYZE) rule_record`.

## PG18 rules (read from source)
- lazy vacuum sets a page all-visible only if every tuple is HEAP_XMIN_COMMITTED-hinted AND xmin precedes
  cutoffs.OldestXmin (pruneheap.c:1383-1407); freezes xmin only if it precedes OldestXmin (FREEZE: FreezeLimit=OldestXmin).
- OldestXmin = data_oldest_nonremovable (ComputeXidHorizons, procarray.c:1735): min over procs IN THE SAME DATABASE of
  (xmin, xid), skipping PROC_IN_VACUUM procs; other databases ignored (only shared catalogs see them), except
  PROC_AFFECTS_ALL_HORIZONS (hot standby feedback) and replication slot xmin (cluster-wide).
- BUT a snapshot's xmin is cluster-wide (GetSnapshotData: oldest running xid in ANY database). So an open xid in another
  database "amplifies": any snapshot then taken in our db, even after the load's commit, has xmin <= that xid.
- ANALYZE (manual or autovacuum) holds a normal snapshot (no PROC_IN_VACUUM); so do autovacuum's pg_class scans.
- Hint bits: synchronous_commit=on on the cluster (checked), so VACUUM's HeapTupleSatisfiesVacuum sets XMIN_COMMITTED; no async-commit path.
- Prepared xacts: max_prepared_transactions=0 (none possible). Replication slots: none; wal_level replica; no standby.
- relallvisible/relallfrozen in pg_class: written by VACUUM at its end and by ANALYZE (visibilitymap_count).

## Hypotheses
H1 async commit / missing hint bit: ruled out (synchronous_commit on, no SET in repo).
H2 a snapshot in the scratch db older than the load's xid at VACUUM's cutoff: only autovacuum workers can be there
   (the test opens no other connection). Amplified by any open xid in another db of the cluster (shared 5433 cluster
   with other lanes; shard 1's own long transactions in other scratch dbs).
H3 an open transaction in another db alone: per source, should NOT give 0. To verify.

## Reproductions
- Baseline: file alone on shared 5433 (no lock contention): 13/13 passed, 16 s.
- Controlled harness tools/.repro/repro.ts in the clone (untracked, excluded via .git/info/exclude; mirrors
  withLoadedRelease, proxy client hooks the moment between the loader's COMMIT and its VACUUM). Log: progress/flaky-repro1.log.
  3 runs each, shared cluster 5433, under the heavy lock:
    none 3/3 pass | otherdb-xid (BEGIN; pg_current_xact_id() in tp_ss01_flaky_1) 3/3 pass | otherdb-snapshot (RR) 3/3 pass
    samedb-before (RR snapshot in the scratch db before the load) 0/3: relallvisible 0, relallfrozen 0 of 7, VM 0/0, relfrozenxid = load xid
    samedb-after (snapshot taken after COMMIT, before VACUUM) 3/3 pass
    otherdb-xid + samedb-after 0/3 (amplifier: the later snapshot's xmin is the other db's xid)
    otherdb-snapshot + samedb-after 3/3 pass (no xid, nothing to amplify)
    samedb-analyze-before (throttled ANALYZE, as autovacuum's) 0/3 | samedb-analyze-after 3/3 | otherdb-xid + samedb-analyze-after 0/3
  => 0 needs a snapshot in THE SAME database at VACUUM's cutoff whose xmin <= the load's xid. An open transaction in
     another database alone never gives 0; it widens the window (any later same-db snapshot then qualifies).
- Shard 1/4 (35 files at 22177731; tools/test/db-shards.ts 4 -> progress/flaky-shards4.json) run unfixed beside a held
  open xid in tp_ss01_flaky_1 (xid 126946), monitor tools/.repro/monitor.ts -> progress/flaky-shard1-unfixed-hold.monitor:
  autovacuum workers DO visit tp_test_ scratch dbs mid-shard (VACUUM ANALYZE / ANALYZE of pg_type, pg_attribute,
  pg_class, audit_event, service_line ...), each with backend_xmin = 126946, the other db's held xid (the amplifier, live).
  Result: 35 files, 3,312 passed, 1 skipped, 670 s, EXIT 0 (load.db.test.ts passed 13/13 that time). Monitor caught a
  live coincidence: 03:41:01.817 a loader VACUUM (FREEZE, ANALYZE) rule_record in tp_test_c73b81c5... while an autovacuum
  worker of that same db ran 'ANALYZE pg_catalog.pg_index' with xmin 126946 (the held xid): another file's load left unfrozen.
- Private PG18 cluster (initdb /tmp/tp_ss01_flaky_pgdata, port 5497, autovacuum_naptime=1s, log_autovacuum_min_duration=0;
  to be stopped and removed at the end). progress/flaky-loop.sh runs the UNMODIFIED test (-t 'analyzed and frozen'):
    beside a held xid (765) in tp_ss01_flaky_1: 19 passed, 1 FAILED of 20: 'AssertionError: expected +0 to be 7' (the CI symptom)
    no holder: 20/20 passed.
  PG log: with the held xid, autovacuum re-vacuums the shared catalog pg_shdepend in EVERY scratch db it visits
  ('1646 are dead but not yet removable, removable cutoff: 765'): migrate's role grants leave dead shared-catalog rows the
  held xid keeps, so workers keep landing in fresh dbs, and every snapshot they take there has xmin 765.

## Root cause (so far)
The loader's single VACUUM (FREEZE, ANALYZE) can freeze/mark all-visible only records older than its database's
horizon. Autovacuum's ANALYZE (and its catalog scans) in the scratch db holds a snapshot; if it predates the load's commit,
or if any older xid runs anywhere in the shared cluster (other lanes' sessions; shard 1's own long tests), that snapshot's
xmin <= the load's xid and the VACUUM leaves every page of the release unfrozen: relallvisible 0, relallfrozen 0 of 7.
Rare alone (one db at a time, short-lived), likely in a busy shard on the shared cluster. Not hint bits, not prepared
xacts, not slots, not another db's transaction alone.

## Fix design (decided)
Test-only cannot be deterministic: autovacuum cannot be kept out of a database (workers override datallowconn), and
FREEZE vs no FREEZE are indistinguishable while the horizon is held. So the loader keeps its promise instead:
after COMMIT it runs VACUUM (FREEZE, ANALYZE) and confirms via pg_class (relallfrozen >= relpages, which VACUUM and
ANALYZE set from the visibility map); while not, it pauses (50 ms doubling to 2 s) and VACUUMs again (frozen pages
skipped), up to freezeWaitMs (default 120 s). LoadResult gains `frozen`; false only when the wait ran out; the
already-loaded path finishes an unfinished freeze (also heals a loader killed between COMMIT and VACUUM). CLI prints a
warning when not frozen. Rollback is never blocked by the freeze (it gets frozen:false, proceeds).
New tests (deterministic, horizon held by the test itself): an older same-db snapshot (load waits, then frozen);
a same-db snapshot taken after commit beside an older xid in another db (waits for the snapshot, not for the other
db's transaction); the wait running out (frozen:false, in force, re-load finishes the freeze).

## Fix (written in the clone, 2026-11-04 ~04:00 UTC)
- packages/rules/src/loader.ts: analyzeAndFreeze (VACUUM (FREEZE, ANALYZE), confirm relallfrozen >= relpages, pause
  50 ms doubling to 2 s, up to freezeWaitMs, default FREEZE_WAIT_MS 180 s); LoadResult.frozen; LoadOptions.freezeWaitMs;
  already-loaded path finishes an unfinished freeze. tools/release/index.ts: stderr warning when not frozen.
- tools/release/load.db.test.ts: frozen in the two result checks; 3 new tests (older same-db snapshot; same-db snapshot
  after commit beside an other-db xid; wait runs out then re-load finishes). Saved copy: progress/loader.fixed.ts.
- Checks: pnpm typecheck passed (22 projects, 125 s wall); eslint on the 3 files clean.
- File once (shared 5433): 16/16 passed. Failing-first: old loader + new tests: 5 failed, 11 passed (incl. 'expected true
  to be false': the old loader returned while the older snapshot held the release unfrozen).
- Wording: 'in force' -> 'published' (an older release number loads without being the one in force).
- Running (04:06 UTC, under the lock): progress/flaky-loop.sh fixed-alone 5433 20 no; then fixed-hold 5433 5 yes.
  Next: private cluster fixed 20x beside held xid (unfixed was 1 fail of 20); shard 1 + the 50 touched files outside it
  (progress/flaky-touched-outside-shard1.txt; 72 touched in all); lint, lint:logs, lint:copy, check:fixtures after
  removing tools/.repro; fix.patch; stop/remove the private cluster; drop tp_ss01_flaky_1 on 5433.

## Resumed by a second agent (2026-11-04 04:22 UTC)
- fixed-alone (shared 5433, no holder, whole file, 20 runs, finished 04:15): 20 passed, 0 failed (16/16 tests each);
  monitor: 121 autovacuum visits to tp_test dbs, 138 loader vacuums seen, 42 of them with same-db holders (all frozen in the end).
- fixed-hold (5433, 5 runs beside a held xid) had not started. Private cluster 5497 still running (pid 15873).
- Code review of the fix before the remaining runs found two defects, fixed first (so every remaining run is on the final tree):
  1. already_loaded pre-check `ruleRecordFrozen(client) || analyzeAndFreeze(...)` trusts pg_class, which only the last
     VACUUM/ANALYZE wrote: a load stopped between COMMIT and VACUUM leaves pg_class at the earlier counts (0/0 on a
     first release, or the previous release's n/n), so `relallfrozen >= relpages` reads true and the claimed heal never runs.
     Fix: the already-loaded path always runs analyzeAndFreeze (frozen pages are skipped; one ANALYZE sample).
  2. Every retry pass re-ran ANALYZE: the first pass's statistics already count every committed record (ANALYZE counts
     HEAPTUPLE_LIVE whatever the horizon), so later passes run VACUUM (FREEZE) alone (it still writes relallfrozen,
     vacuumlazy.c:903-926).
- Failing-first for defect 1 (new test 'analyzes and freezes, when loaded again, a release whose load stopped between
  its commit and its VACUUM'; a SqlClient proxy throws at the first VACUUM): old already-loaded path FAILED
  ('expected 0 to be greater than 0': no VACUUM ran, frozen:true reported); fixed: passed. Loader fixed (both defects),
  saved again to progress/loader.fixed.ts. File now 17 tests.
- fixed-hold (5433, whole file, 5 runs beside held xid 360300 in tp_ss01_flaky_1, under the lock, 04:27-04:33): 5 passed,
  0 failed (17/17 each); monitor: 23 AV visits to tp_test dbs, 36 loader vacuums seen, 6 with same-db holders.
- private-fixed-hold (port 5497, '-t analyzed and frozen', 20 runs beside held xid 3190 in tp_ss01_flaky_1, under the
  lock): 20 passed, 0 failed (unfixed there: 19 passed, 1 failed 'expected +0 to be 7'). Monitor caught the failure
  condition live once (04:30:21.438, a loader VACUUM in tp_test_2b226d67... while autovacuum worker pid 27641 of that db
  ran VACUUM ANALYZE of catalogs with xmin 3190, the held xid); that run passed.
- Next: shard 1 + the 50 touched files outside it, no holder (as CI: each shard its own cluster), --maxWorkers=2, under the lock.

## Answers (draft 04:40 UTC; evidence at 22177731 unless noted)
(a) Schema files: none. The diff touches packages/rules/src/loader.ts, tools/release/index.ts, tools/release/load.db.test.ts
    (and, planned, tools/release/rollback.ts + a rollback test). `git diff --stat -- packages/db docs/product/domain-model.md`
    empty. No DDL: VACUUM is a utility statement the loader already ran once (ADR 0062 :1282); rule-tables catalog unaffected.
(b) Freeze: CO-001 rule 4 (change-order-001.md:10) and "What must not change" (:115: "The content release pipeline and
    the hooks that protect it"). PRD 9 "The release pipeline" (PRD.md:403-409) step 4 "The worker loads the release into
    the global tables" -> the loader is part of the pipeline on the literal reading. reconciliation-001's checks
    (:454 "Every pull request above passes these checks"; :472-485 Content pipeline): content/releases untouched;
    tools/verify-content, protect-content.sh, publish-content.yml unchanged; no DDL on rule tables; verify-content passes
    -> this change passes all four as written. Precedents: combined audit #30 ("Content checker and importer: added
    refusals only, which touches the frozen content pipeline. Freeze exception: yes") counts packages/rules/src/import.ts
    as frozen pipeline though the checks do not name it; #8 ("Freeze exception: yes, but only for rewording one line of
    the load-release skill") counts the skill. PR 6b-3 added the loader's VACUUM (FREEZE, ANALYZE) (HANDOFF.md:626, ADR
    0062:1282) with no exception recorded. Freeze exceptions are the founder's (HANDOFF.md:152); the co-founder's
    delegation covers Lane B's work only (LANES.md:348) and this is Lane A's PR. Verdict: inside the freeze (changes the
    load step's behaviour: may block up to 180 s after commit; re-load now VACUUMs; new result field; CLI warning),
    so it needs a founder exception before it merges; text in the final result.
(c) Narrower fix: none that keeps the test meaningful and deterministic. Test-side options and why not: (1) the test
    VACUUMs again itself until frozen -> asserts its own VACUUM, the loader's freeze could be deleted and it would pass
    (a loosened test); (2) assert only when no holder -> loosened/conditional; (3) keep autovacuum out: impossible per db
    (workers ignore datallowconn; the holders are catalog ANALYZEs, and catalogs take no per-table reloptions without
    allow_system_table_mods); (4) autovacuum=off for CI's whole Postgres service: changes every shard's environment
    (CAS-42's budgets are measured with autovacuum on), cannot be set per lane on the shared local cluster, and still
    leaves the production loader's promise broken beside any older same-db snapshot; (5) COPY FREEZE needs the table
    created/truncated in the same transaction; a per-release partition is rule-table DDL (frozen, :483).
(d) Cost: see final result.
- ~04:38 UTC: shard 1 run (flaky-final-shard1.aborted.out) STOPPED after ~7 min, no file finished, to make two more
  changes first so that every run is on the final tree:
  3. rollback (tools/release/rollback.ts) waits for no freeze: it loads the previous release with freezeWaitMs: 0
     (one pass, as the loader always did before this fix), so a withdrawal is never held up to 180 s behind an older
     transaction; a later release:load finishes the freeze. Failing-first test in load.db.test.ts.
  4. the pause between passes is at least 4x the last pass's duration (at most a fifth of the wait spent vacuuming a
     large release while the horizon is held), on top of the 50 ms -> 2 s doubling.
  Then re-run: failing-first, 5x hold on 5433, 20x private, shard 1, outside files, lints.
- Failing-first for change 3 (new describe 'a rollback beside a transaction older than the release it loads'): old
  rollback FAILED ('Test timed out in 30000ms': the rollback's load waited for the freeze behind the held snapshot);
  with freezeWaitMs: 0 in rollback.ts: passed (2.7 s). Change 4 applied (FREEZE_PAUSE_PER_PASS = 4, after passes >= 2).
  eslint on loader.ts, rollback.ts, index.ts, load.db.test.ts: clean. File now 18 tests. Saved loader copy refreshed.
- Cleanup: an orphaned vitest worker of the stopped shard run (pid 31407, cwd the clone) killed; its scratch db
  tp_test_4a175c96... (release 900001, 0 connections, created 04:38:01) and the failing-first's tp_test_76126d15...
  (releases 900001,1) dropped.
- Re-running on the final tree: 5x hold (5433), 20x private, then shard 1 + outside.
- Typecheck on the final tree (04:42): passed, 22 projects, 33 s wall (warm cache; packages/rules, tools, apps/web,
  apps/worker rechecked).

## Answers, (b) exception text and (d) cost (draft 04:45 UTC)
(b) Proposed founder exception (to record in reconciliation-001 "Content pipeline" and the PR's ADR):
  "Granted: an exception to reconciliation-001's content-pipeline check for the release loader's freeze, as written:
  after a load commits, loadRelease (packages/rules/src/loader.ts) runs VACUUM (FREEZE, ANALYZE) rule_record and,
  while pg_class shows rule_record not all-frozen, pauses and runs VACUUM (FREEZE) rule_record again, for up to 180
  seconds (FREEZE_WAIT_MS, LoadOptions.freezeWaitMs); its result gains `frozen`, false only when the wait runs out;
  loading a release already loaded writes nothing and runs the same freeze; pnpm release:load warns on stderr when
  the release is not yet frozen; pnpm release:rollback loads the previous release without waiting. What stays
  frozen: every check and refusal before the transaction, what the transaction writes and publishes, the advisory
  locks, the withdrawal, content/releases, tools/verify-content, .claude/hooks/protect-content.sh,
  .github/workflows/publish-content.yml, the load-release skill and every rule table's DDL. Any other change to the
  loader still needs its own ruling."
  Optional clause: "It also covers the loader's VACUUM (FREEZE, ANALYZE) after a load's commit, added by PR 6b-3
  (7abb99c), which no ruling recorded."
(d) Cost: no held horizon: unchanged (one pass + one pg_class read). Held: returns when frozen or at 180 s; release
  published from COMMIT (only the command's return waits); passes after 50 ms doubling to 2 s and, from pass 2, at
  least 4x the last pass (<= 1/5 of the wait re-reading unfrozen pages); manual VACUUM unthrottled; ShareUpdateExclusive
  on rule_record only during a pass; load/withdraw advisory locks are xact-scoped (released at COMMIT). Re-load of a
  loaded release: was instant, now one VACUUM (FREEZE, ANALYZE) (frozen pages skipped) + the same wait if unfrozen.
  Rollback: freezeWaitMs 0, one pass, never waits (as before the fix). CLI: same stdout line, exit 0; stderr warning
  when not frozen. /load-release: never loads (assemble + dry-run only) -> nothing new. Capacity harnesses print the
  LoadResult JSON, now with "frozen".
- FINAL TREE final-hold (5433, whole file, 5 runs beside a held xid, under the lock): 5 passed, 0 failed (18/18 each);
  monitor: 36 AV visits, 47 loader vacuums seen, 10 with same-db holders.
- FINAL TREE final-private-hold (5497, '-t analyzed and frozen', 20 runs beside a held xid, under the lock): 20 passed,
  0 failed (unfixed: 1 of 20 failed); monitor: 29 AV visits, 7 loader vacuums seen, 1 with a same-db holder.
- 04:46 UTC: private cluster /tmp/tp_ss01_flaky_pgdata (5497) stopped (pg_ctl -m fast) and removed; tools/.repro removed from the clone (copies in progress/flaky-repro-scripts). Lints next.
- Lints on the clone (tools/.repro removed): lint passed (1,732 files in 3 groups, 0 errors, 0 warnings, 100 s);
  lint:logs passed (1,110 files); lint:copy passed (552 files); check:fixtures passed (333 read, 4,007 searched).
- fix.patch written: $SP/flaky/fix.patch = git diff 22177731 (4 files), sha256 3eede2563843ac0c...
  No file under packages/db, docs/product/domain-model.md, content, .claude, .github, tools/verify-content or packages/pricing.
- Shard 1 + outside on the final tree: started under the lock.
- FINAL TREE test:db shard 1/4 (pnpm -s test:db --shard=1/4 --maxWorkers=2, shared 5433, no holder, under the lock, 04:47:52): 35 files passed, 3,317 passed + 1 skipped (3,318), EXIT 0 in 722 s (unfixed run: 3,312 + 1 skipped; +5 = the five new tests). load.db.test.ts 18 tests in 27.9 s.
- FINAL TREE touched files outside shard 1 (50 files of progress/flaky-touched-outside-shard1.txt; vitest run --project db --maxWorkers=2, shared 5433, no holder, under the lock, 04:59:54): 50 files passed, 761 tests passed (761), EXIT 0 in 383 s (tools/release/dry-run.db.test.ts, the rollback's own test, among them). All 72 touched db files run once on the final tree.
- Cleanup (05:07 UTC): tp_test_0dbc6e0e... (release 900001, created 04:37:57 during the stopped shard run, its 2
  connections gone with the orphaned worker) dropped; tp_ss01_flaky_1 dropped on 5433. Correction to the 04:40 note:
  tp_test_4a175c96... (created 04:38:01, 0 connections, no test process alive) may have been another session's run that
  had already ended (it leaked; nothing was using it) rather than the orphan's. No tp_test_ or tp_ss01_flaky database
  is left on 5433. The private cluster is stopped and its directory removed.
- The four patched files are identical at 22177731, at SS-01's head e4a6d2fc and at the base 4846f043, so fix.patch
  applies to any of them as is.

## DONE (05:08 UTC). Final: fix.patch sha256 3eede2563843ac0cd5acc52daf067529304169ca9be0074ec6117cb3286a63b9 (4 files,
## +305 -17). Answers (a)-(d) as drafted above; (d) also: rollback never waits; e2e not run locally (CI's suite of record).
