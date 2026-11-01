# hom-build-integrate progress (UX PR 9 integration check)
Started 2026-11-01 fresh (no earlier file). Worktree /home/user/ux-home-figures, base 83d71fd.
## Step 1 (status/diff)
- git status: 34 modified + new files; all named by design (D10 + F4 packet page, F7 e2e monitoring/packets) or justified (triage.spec:111 case Actionable words; synth common/types per design §4). #42 overlap only test-matrix.md, synth matrix.ts/registry.ts (additions only; MODULE_NUMBER line extended). Nothing under packages/pricing|ledger; no migration. PASS
- scratch home-cost.measure.db.test.ts present (delete before commit). OLD statements in it match base 83d71fd queries.ts:93-97,138-146 verbatim.
## Step 2 (CAS-41 gate)
- started 100k run (bg, under flock) -> /tmp/hom-measure/run-100k-integrate.log, result json in /tmp/hom-measure/
## Step 3 (light ones done while 100k runs under the lock)
- lint:copy: 539 files, pass. lint:logs: 1085 files, pass. model-id grep over changed files: none.
- stryker affected on HEAD: none, but HEAD==base (uncommitted changes invisible). Re-ran on a dangling commit of the working tree (commit-tree da8a233e via temp index, scratch worktree /tmp/hom-affected with node_modules symlinks; remove after): money/pricing/ledger/packets not affected, shards none. gate.ts --expected '[]': passed ("No money path changed").
- watched.ts --write: +1 line apps/worker/src/triage/actionable-now.ts in tools/screening-capacity/watched-paths.txt -> KEEP (part of PR).
## Step 2 RESULT (CAS-41 gate, 100k month: 100,040 service lines, 20,420 case lines, 4 cases, triaged as of 2026-10-26)
- vitest scratch run (HOM_LINES=100000) built the month (~17:42-18:00) and did its EXPLAINs, but its superuser track_functions pass of the OLD headline ran >20 min (superuser bypasses RLS -> different plan); cancelled 18:3x; run reported 1 failed; JSON never written. temp DB dropped.
- Measured instead on that DB while it existed, as tp_app (SET LOCAL ROLE + practice scope), scratch /tmp/hom-measure-script/measure.mts, 5 runs, medians (concurrent with the one superuser query on 1 of 4 cores):
  old headline 8300.1 + states 8590.3 + near 1422.0 = 18312.4 ms; NEW HOME_CASES 7775.4 ms -> GATE PASSES (0.42x). /tmp/hom-measure/manual-100k-1793557112481.json
  (first 1-run pass: old 22659.8 vs new 11214.9)
- whole dashboard() as tp_app, 3 calls: new 47449.6 / 47406.8 / 48129.3 ms; base 83d71fd (temp worktree) 61491.7 / 56316.3 / 64050.4 ms. /tmp/hom-measure/manual-100k-whole-*.json
- sample: tile 17380 lines 18971000 cents, out of figure stale 20 moved 0; base 17400 lines (no pricing check) same cents.
- scratch measure file deleted from the worktree (copy at /tmp/hom-measure-script/home-cost.measure.db.test.ts.saved)
- typecheck: 22 projects pass. lint: 1 error recovered-periods.test.ts:52 no-unsafe-unary-minus -> FIX negateCents; eslint+tsc worker+vitest file 3 passed. synth --all: 0 written, 654 unchanged.
## RESUMED 2026-11-01 ~20:00 (after restart)
- confirmed negateCents fix present; PG 5432/5433 up. Remaining: pnpm test, db shards, build, e2e.
- pnpm test (unit, coverage): exit 0, 404 files, 6818 passed | 4 skipped. Coverage thresholds ok.
- 6-shard plan (tools/test/db-shards.ts 6): every shard holds a changed/related db test -> run whole db project.
- pnpm test:db (whole, DATABASE_URL default = 5432 which is PG 16.15 after restart): 126 passed, 5 failed (rule-tables catalog, release load, domain-model, domain-model-drift, function-files): PG16 lacks catalogued NOT NULL constraints/MAINTAIN -> env. Re-run those 5 on PG18 (5433): 5 files 34 tests passed.
- PG18: 13 changed/related db files incl catalog+cross-tenant: 1265 tests passed.
- pnpm build: exit 0. e2e started (8 specs incl triage, PG18 5433, tp_e2e_hom, port 3191, workers 2).
- e2e: 19 passed (5.8m), exit 0. tp_e2e_hom dropped. scratch measure file confirmed absent.
