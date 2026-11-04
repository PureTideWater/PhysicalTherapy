# P4 fix build (PR #96, review findings)

Clone /home/user/ci-mutation-trigger, WIP ref co-001/wip-ci-mutation-trigger cut from 50029e64… (co-001/ci-mutation-trigger untouched, not pushed, base not merged).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4/logs/fix/

Plan (one commit per finding): B1 (typescript), B1-guard, S1, S2, C-G2 (+C-G3 case), N1, N2, N3, PE-N1, C-G1, C-G4. PE-S1 pending (base merge after #84).

## Progress
- (started) WIP branch created at 50029e64…; baseline suite running.
- Baseline at 50029e64…: tools/stryker + tools/test 35 files, 457 tests (logs/fix/baseline.log).
- **B1 done**: 6ab288d2… (TEST_TOOLING gains typescript; manifests + affected tests; ADR N51; ci.md). Red B1-red.log (2 failed on assertions), green B1-green.log (85/85). Suite 35 files / 459 tests (suite-6ab288d2.log). Pushed to co-001/wip-ci-mutation-trigger (hook ran, push-6ab288d2.log).
- **B1 guard done**: dd000772… (affected.test.ts walks the installed tooling, ~200 packages, fails on an undeclared resolving import outside TEST_TOOLING and its lockfile closure; ADR hoisting limit + N51). Red with 50029e64's affected.ts: names core's ts-config-preprocessor.js -> typescript alone (B1-guard-red.log); green (B1-guard-green.log). Suite 35 / 460 (suite-dd000772.log). Pushed.
- **S1 done**: 77febe43… (control-character path fails closed in affected(), quoted() exported and escapes DEL/C1/separators, closureProblems quoted, globs with s flag; ADR rule + N52; ci.md). Red with 50029e64's affected.ts (S1-red.log: 2 failed on assertions), green (S1-green.log 88/88). Suite 35 / 462. Pushed.
- (resumed after interruption) found M12 mutant left applied in manifests.ts by the interrupted mutant run; restored from the runner's saved copy, re-ran M12 to M16.
- **S2 done**: 43792849… (tests only, plus a defaulted `shards` argument to affected()/classifyManifests(); ADR Part 7 consequence). Mutants M01 to M05, M08 to M16 each KILLED (logs/fix/S2-mutants.txt, S2-mut-M*.log); at 50029e64 the new shards-injection case fails (S2-at-50029e64.log); green S2-green.log (105/105).
  Suite at 43792849…: 35 files / 479 tests (suite-43792849.log). Pushed.
- C-G2 tests applied in the WIP tree (fixwork/cg2.py; includes C-G3's data-entry case); green C-G2-green.log 112/112; critic mutants C01 C02 C04 C05 C06 C07 C13 re-running against them (fixwork/mutc.py -> logs/fix/C-G2-mutants.txt, C-G2-mut-C*.log), heavy lock contended.
- Drafts (local only, not pushed) in worktree /home/user/ci-mt-draft, detached, on 43792849…: N1 3453450c…, N2 d9133666…, N3 d7349eec…, PE-N1 fb4fcb90…, C-G1 ddf1ebfb…, C-G4 dabdfa36…. Each is to be cherry-picked (-n) into the WIP tree after C-G2, red-run with the source as at 50029e64, green-run, then committed and pushed one at a time.
- **C-G2 (+C-G3) done**: ace865d3… (tests only; ADR consequence). C01 C02 C04 C05 C06 C07 C13 each KILLED (logs/fix/C-G2-mutants.txt, C-G2-mut-C*.log; they survived at 50029e64 per logs/critic/mut-results.txt); green C-G2-green.log 112/112.
- Chain running (fixwork/chain.sh -> fixwork/chain.log): suite+push ace865d3, then N1, N2, N3 (synth), PE-N1, C-G1 (synth) via fixwork/finding.sh (cherry-pick -n draft; red = the fix's source hunks reversed; green; commit -C draft; suite; push). C-G4 doc-only: red/green wording logs C-G4-red.log / C-G4-green.log.
