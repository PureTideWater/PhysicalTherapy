# p4 build check (integrator), progress

Started 2026-10-28. Worktree /home/user/ux-screening-result-tables, branch co-001/ux-screening-result-tables.
HEAD at start: 8c235304 (slice A: 995f568f, 8c235304). B, C, D uncommitted in the tree.

## Steps
- [x] 0 read design (whole, section 12), review json, scouts' notes (skimmed sections that bear on the build), B/C/D results
- [x] 1 handovers applied (none needed edits); committed B ed08391e, C cf361174, D 5a4cbe51; tree clean
- [x] 2 diff review vs design: every section 12 item and 2.x/3.x/4.x item present; words exact; no #42 or lib/screening file edited; result.test.tsx untouched
- [x] 3 checks: all pass on 0c261ee9 (see log below)
- [x] 4 fixes: none needed (no check failed); F1 refactor 0c261ee9 only

## Findings and fixes
- (step 0) origin/claude/build-platform has moved to 165c5993 (#74, UX PR 1 forms, merged) since the cut at a6e754fc;
  merge base a6e754fc. Diff reviewed three-dot (a6e754fc..). A base merge is not this step's: reported as a handover.
- (step 0) Changed files vs #42 list: only test-matrix.md, matrix.ts, registry.ts, watched-paths.txt (allowed). No lib/screening,
  no packages/{db,pricing,ledger,money}, no migration. No model name added.
- (step 1) Handovers: every worktree one already applied by slice D (generator run: +table-parts, +stacked-rows, -lib/copy/words.ts;
  TBL-08 phone tone + nouns agree; TBL-06/ADR 994). Component mtimes: none after 03:25:32. The rest are PR description,
  status file and LANES.md items (outside the worktree): passed on.
- (step 2) F1 improve: fieldsFrom used its own naming filter beside fieldColumns; now calls fieldColumns. Commit 0c261ee9.
  Focused run: components/screening + stacked-rows 6 files / 77 tests pass.
- (step 2) Finding H-BASE (not fixed here, handover): origin/claude/build-platform is 165c5993 (#74 merged). merge-tree clean
  (32283d2f) but on the merged tree lib/routes/sign-in.ts (in the screening closure, watched-paths:91) imports listed() from
  lib/copy/words.ts, so the generator keeps words.ts; git's textual merge drops it -> watched.test.ts red on the merge ref.
  The base merge (LANES rule 6) must re-run watched.ts --write.
- (step 3) runner: scratchpad/p4check/phase1.sh (results.tsv, steps.txt, NN-*.log)
- (step 3, head 0c261ee9) typecheck pass (22 projects, warm, 24 s); lint pass (1,630 files, 0/0); lint:copy pass (517 files);
  lint:logs pass (1,060 files); pnpm test pass: 387 files, 6,475 passed + 4 skipped (6,479), 220 s
- (step 3) watched.test.ts 6/6; synth --all 249 cases, 0 written, 641 unchanged, 0 removed (EMR 16 unchanged); git diff and
  status clean after; verify-content pass; db (5433): result-page.large.db.test.ts + routes.db.test.ts 2 files / 46 tests pass,
  worst shape page 1 387 KB +15.7 MiB, page 206 375 KB +16.1 MiB, page 411 205 KB +12.3 MiB (B's run: page 1 +19.3 MiB)
- (step 3) phase 2 started: scratchpad/p4check/phase2.sh (build, stamp, e2e 4 specs, tp_e2e_p4check, port 3186, workers 2)
- (step 3) build pass (20 s, incremental), stamped 0c261ee9; e2e E2E_PREBUILT=1 --workers=2 (tp_e2e_p4check, 3186): 6 passed in
  1.8 m (114 s wall): screening-phone 8.0 s; screening.spec.ts :147 25.8 s, :692 1.8 s (no flake, no re-run needed);
  tables-phone :171 50.8 s, :293 14.8 s; layout-1280 29.6 s. e2e db dropped. apps/web/.next = stamped build of 0c261ee9.
DONE: commits ed08391e (B), cf361174 (C), 5a4cbe51 (D), 0c261ee9 (fix). Not pushed. Tree clean.
Open: base merge of 165c5993 (#74) with watched.ts --write (words.ts stays, H-BASE); PR description and status file items.
