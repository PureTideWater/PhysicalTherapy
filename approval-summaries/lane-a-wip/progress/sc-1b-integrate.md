# sc-1b-integrate (1b integrator)
started 2026-11-02; fresh (no prior file). sc1b at ce408d2f with gate builder's uncommitted work (large test, child, ADR 0083, registry, db-shards, vitest.config, CAS-42 expected.json).
## Steps
- [ ] 0 wait for SS-01 (origin/co-001/ss-01-suspension-refusal contains 6c28d6a2), merge --no-ff
- [~] 0: poll running in bg (poll-ss01.sh, every 5 min, 4 h). At 02:15 not yet; WIP ref co-001/wip-ss01-chain at bb13be1b (merged #42 6c28d6a2 + 43565235), other workflow running checks.
- [~] 2 (adversarial read, started while waiting):
  - migration read: ledger bodies differ from 20261027 only in lock line (+CREATE OR REPLACE); line_status_rules no per-line advisory lock; lock loop NOWAIT both in one subxact. OK.
  - FIX 1 (reliability): worker.ts attempt()'s finally could throw (logger sink) -> failed a completed job / replaced its error. Failing-first test in worker.test.ts ('never lets the heap line change how an attempt ends') FAILED before, passes after try/catch. UNCOMMITTED.
  - report slowness (gate open item): plan diag running (zz-diag.large.db.test.ts, untracked, DELETE after) at 20k: logs/int-diag-20k.log
  - FIX 2 (reliability/check): checks.ts held a job's live heap to 75% of V8 heap_size_limit (752 under 560 flag -> 564 MiB) vs alarm's 420. New heapLimitMib(command, logged) = min(flag, logged). checks.test.ts additions failed first (1 failed/20), pass after (38/38 release-capacity). ADR 0083 reading + Revisit item updated; ci.md paragraph updated. UNCOMMITTED.
  - diag 20k: no bad plan reproduced (0.8 s all variants). diag 100k running (logs/int-diag-100k.log): original / scalar subquery / composite index.
  - diag2 100k with Y priced, queries as worker login via cursor (logs/int-diag2-100k.log): original NOT EXISTS cursor CUT at 120 s with 16,000 of 41,665 rows; scalar-subquery form 4.4 s; after ANALYZE 3.9 s. => FIX 3: candidate query's case_line check as a correlated scalar subquery (probes case_line_once per row; no anti-join plan to choose). zz-diag file deleted.
- SS-01 ARRIVED (poll done). Next: commit work, merge.
- committed 91efb58a (gate measurement) and a9e60b4f (fixes 1-3 + ADR). Next: pull, merge SS-01 bb13be1b.
- [x] 0 merged SS-01 bb13be1b: add1ebed. conflict only domain-model.md (took ours, regenerated on fresh tp_sc1bint_1: 100 tables, 381 fn files 0 written). watched 550 lines no change; synth --all 0 written; dm --check pass. #42's 20261107 changes touch no 1b object.
## Suite (on add1ebed + later fixes)
- scripts: int-checks.sh (typecheck, lint, lint:copy, lint:logs, unit, golden, oracle, verify, fixtures; status logs/int-checks.status), int-db.sh (4 shards, logs/int-db.status), int-e2e.sh (build+stamp+e2e port 4971), int-stryker.sh (affected: packets-scan/rest/explain, pricing-engine/recompute/rest; via tools/stryker/affected.ts --base bb13be1b)
- int-checks.sh started 02:5x
- typecheck pass (22 projects); lint pass (1,732 files, 0/0); lint:copy pass (552 files); lint:logs pass (1,110 files); unit pass 422 files, 7,188 passed, 4 skipped
- engine-freeze vs efb20704 and vs bb13be1b: no non-test pricing change, problems none
- scope (bb13be1b...HEAD, 47 files): 1b's list + execute.ts (fix 3), large-jobs.ts (test child), tools/test/db-shards.test.ts; one migration 20261109090000; packages/ledger untouched
- golden pass; oracle pass (687 fixtures); verify-content pass; check:fixtures pass (333). Next: int-db.sh (4 shards)
- db shard1 PASS 35 files, 3,312 passed, 1 skipped, 722 s. CAS-42.1 triage 70.8 s (actionable 6.9), report alone 95.8 s (<180; candidates 10.8 s), live 163/117; CAS-42.2 report 111.8 s triage 88.6 s live 219; locks 1. CAS-42.3 pass 67.2 s.
- db shards ALL PASS: s1 35/3,312+1skip 722 s; s2 35/2,187 202 s; s3 35/3,118 460 s; s4 34/991 166 s; total 139 files 9,608 passed 1 skipped. Next: int-e2e.sh
- committed 048bc843 (ADR after-fix figures, vitest comment). e2e build 1 refused stamp (dirty tree), rerunning int-e2e.sh on clean 048bc843
- build+stamp 048bc843 pass; e2e (E2E_PREBUILT=1, --workers=2, port 4971) 69 passed, 10.8 min. Next: int-stryker.sh (6 shards)
- infra unit 26 files 705 passed. stryker packets-scan run 0 gate 0 416 s; rest running
- stryker: packets-scan 416 s, packets-rest 745 s, packets-explain 784 s all run 0 gate 0; pricing-* running
- stryker all 6 shards run 0 gate 0; overall gate passed
- final: dm --check pass, SHA-256 (approval line hash) e024cf9f...efc4df, approval line 7459 blank; --require-approval exit 1 as expected. lint rerun on 048bc843 pass. No marker.
- PUSHED 048bc843 (ce408d2f..048bc843). tp_sc1bint_* dropped. DONE.
