# UX PR 4b full local suite (PR #131)
Worktree /home/user/ux-screening-result-words, branch co-001/ux-screening-result-words. Base 31a7345f.
Head under test: 9e577017748fc4f91967cacaaa5c3639a190d2bf (git rev-parse HEAD at start; task text names c2725961, which is 4 commits back: 03ec41f5, e01d96bc, 9e577017 are the fix round's; e01d96bc and 9e577017 are local, not pushed).
Started 2026-11-07 (fresh; no earlier 4b-suite.md). Tree clean at start. PG 5433 up (postgres, template0, template1).
Runner: scratchpad/suite4b/run.sh <step> <cmd> (flock /tmp/laneb-heavy.lock); logs scratchpad/suite4b/<step>.log; results.tsv; phase1..4.sh.
## Results
- Scope (git diff 31a7345f..HEAD, 15 files): nothing under packages/db|pricing|ledger|money, no migration; model-gateway, packets and the lockfile untouched. Model identifiers in the diff: none. Commit messages: each ends with the two mandated attribution lines only.
- Phase 1 (01..13) launched in background 2026-11-07 (suite4b/phase1.sh); phase2..4.sh written.
- 01 install --frozen-lockfile PASS 1 s (already up to date). 02 check:fixtures PASS 1 s: 342 read, 4,231 searched. 03 typecheck PASS 18 s: 23 projects (23 of 23 warm).
- 04 lint PASS 83 s: 1,868 files in 3 groups (packages 568, apps/web 708, root 592), 0 errors, 0 warnings. 05 lint:copy PASS 2 s: 595 files. 06 lint:logs PASS 2 s: 1,177 files. 07 verify-content PASS 1 s (drafts 10 records). 08 engine-freeze vs 31a7345f PASS 1 s: nothing let through, no problems. 09 synth --all PASS 2 s: 319 cases, 0 written, 720 unchanged, 0 removed; EMR 8 formats, 16 unchanged. 10 git diff --exit-code + empty porcelain PASS.
- 11 pnpm test PASS 342 s: 479 files passed; 9,954 tests: 9,950 passed, 4 skipped, 0 failed (no model-gateway redaction flake this run). Coverage lines 69.07%.
- 12 test:golden PASS 46 s: 5 files, 381 tests. 13 test:oracle PASS 43 s: pyx12 4.0.0 agrees on all 689 (678 valid, 11 malformed); edi835 agrees.
- PHASE 1 DONE. Phase 2 (14 migrate on fresh tp_4b_migrate, dropped after; 15 vitest list --project db; 16 test:db 4 shards) launched in background.
- 14 db:migrate on fresh tp_4b_migrate PASS 2 s: applied 47 (schema_migrations 47); tp_4b_migrate dropped. 15 vitest list --project db --filesOnly PASS 1 s: 149 files (suite4b/db-files.txt).
- 16 test:db shard 1/4 PASS 375 s: 38 files, 3,290 passed, 1 skipped.
- 16 test:db shard 2/4 PASS 141 s: 37 files, 2,256 passed.
- 16 test:db shard 3/4 PASS 224 s: 37 files, 3,311 passed.
- 16 test:db shard 4/4 PASS 263 s: 37 files, 1,006 passed.
- test:db total PASS 1,003 s: 149 files (= vitest list --project db 149), 9,863 passed, 1 skipped, 0 failed.
- PHASE 2 DONE. Phase 3 (20 build, 21 build-stamp, 22 e2e shards 1/2 and 2/2: tp_e2e_4b, port 3185, 2 workers) launched in background.
- 20 pnpm build PASS 15 s: web (next build, compiled in 3.1 s from the warm .next cache) and worker (esbuild).
- 21 build-stamp --write 9e577017748f... PASS; --expect reads "the build is 9e577017...'s".
- 22 e2e shard 1/2 PASS 319 s (5.3 min): 41 passed.
- 22 e2e shard 2/2 PASS 395 s (6.6 min): 40 passed, incl. screening-phone.spec.ts:123, screening.spec.ts:170 (SCR-01..07, SCR-18) and :742 (SCR-15), tables-phone.spec.ts:171 and :293. No flake, no re-run. Web server read "the build is 9e577017...'s" on both shards.
- e2e total PASS 714 s: 81 passed, 0 failed. tp_e2e_4b dropped WITH (FORCE); 6 /tmp/tp-e2e-tp_e2e_4b-* dirs removed. Databases: postgres, template0, template1.
- PHASE 3 DONE. Phase 4 (30 stryker affected, 31 gate) launched.
- 30 stryker affected.ts --event pull_request --base 31a7345f PASS 14 s: money, pricing, ledger, packets not affected; any=false, shards=[]. 31 gate.ts (empty reports, --expected '[]') PASS 1 s: "No money path changed"; mutation gate passed.
- PHASE 4 DONE. No failure, so no fix commit. Final: HEAD 9e577017 (unchanged), tree clean, databases postgres/template0/template1, port 3185 free. Summary table: scratchpad/4b-suite.md. DONE.
