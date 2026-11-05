# pages-child-process: fix round build

Worktree /home/user/pages-child-process, ref `co-001/wip-pages-child-process`, started at c369bc77… (= origin). Logs in the session scratchpad `pcp/logs/fix/` (<id>-red.log, <id>-green.log).

## Started 2026-11-05 (fresh: no earlier fix-build.md; worktree clean, node_modules present)
Order: F1 sec-S1/cc-B1 (post-reply bound), F2 G1 (core files), F3 cc-S1 (reply bounds), F4 cc-S3+G5 (mutants), F5 G2 (infra measurement), F6 G3 (bundled reader test), F7 G4 (ADR 0071 Status), F8 nits (sec S2, S3, S4+cc N2, cc N3), F9 SEC-24. cc S2 and N1 refuted: left.

## F1 sec-S1 = cc-B1: ed69f919… (pushed)
Red: F1-sec-S1-cc-B1-red.log (new test timed out at 60,000 ms: done-hang never settled). Green: F1-sec-S1-cc-B1-green.log (pages.test.ts 13/13). Suite F1-suite.log: 44 files, 904 passed.

## F2 critic G1: eba1bc3e… (pushed)
core_pattern here `core` (relative), ulimit -c soft 0 / hard unlimited. Red: F2-G1-red.log (test-support/core written by the crashed stand-in at c369bc77 code), F2-G1-infra-red.log (no Ulimits on any container). Green: F2-G1-green.log (evidence + compute 148 passed, core test ran, not skipped). Suite F2-suite.log: 44 files, 905 passed.

## F3 cc-S1: a4078dd6… (pushed)
Red: F3-cc-S1-red.log (replybound-frame, -total, -both all SURVIVED pages.test.ts 14/14). Green: F3-cc-S1-green.log; F3-cc-S1-green-mutants.log (frame and both KILLED; total SURVIVES as an equivalent mutant, recorded). Suite F3-suite.log: 44 files, 906 passed.

## F4 cc-S3 + G5: 5efc739c… (pushed)
Red: F4-cc-S3-G5-red.log (9 mutants vs evidence/ 35 tests: 8 SURVIVED; sigabrt already killed by F2's core test). Green: F4-cc-S3-G5-green.log (41 passed); F4-cc-S3-G5-green-mutants.log: KILLED baselinecap, liveexit, exitcode, child-textcap, child-orphan, child-console-verbose, after-reply, sigabrt; SURVIVED (recorded, equivalent/unreproducible) child-console alone, close-exit. Suite F4-suite.log: 44 files, 912 passed.

## F5 critic G2: d60105ad… (pushed)
Red: F5-G2-red.log (COMMANDS.worker mutated to carry --max-old-space-size=560: `expected [ '--max-old-space-size=560' ] to deeply equal []`). Green: F5-G2-green.log (heap + release-capacity scenario 26 passed), F5-G2-green-with-flag.log (same mutation: 16/16, reader measured), F5-G2-wrong-flag.log (flag 600: red, as it should). Suite F5-suite.log: 912 passed.

## F5b lint: 497f8f8b… (pushed)
eslint found Number() (no-restricted-syntax) in the F3/F4 stand-ins and tests; Number.parseInt. eslint, tsc contracts and infra 0. Suite F5b-suite.log: 912 passed.

## F6 critic G3: 6acbbd90… (pushed)
Red: F6-G3-red.log (yauzl made external in build.ts: old bundle.test.ts 2/2 green). Green: F6-G3-green.log (3/3; bundle built into a temp dir, pdf/xlsx/csv read at 240 MiB), F6-G3-green-mutant.log (same mutant: red, PageReadError exit code 1). Suite F6-suite.log: 913 passed.

## F7 critic G4: 04513eaa… (pushed)
Red: F7-G4-red.log (c369bc77 vs claude/build-platform af3e79f3…, brand-settle, ci-findings-transport, suite-cap-1-triage-locks: CONFLICT in ADR 0071). Green: F7-G4-green.log (0 conflicts vs all four; merged Status block keeps both amendments). Suite F7-suite.log: 913 passed.

## F8 nits (pushed)
- S4 + cc N2: 8c6aaf65… (F8-S4-N2-red.log 11 stale lines at c369bc77; -green.log 2 left on purpose: screening consumer thread, applied migration). Rewraps d078608f…, 9819838a….
- S3: e0829c18… (F8-S3-red.log: no "network" in pages.ts at c369bc77; -green.log).
- S2: 1a4490fa… (F8-S2-red.log, -green.log; comments and ADR 0033 only).
- N3: 535651b7… (F8-N3-red.log memcap-x2 SURVIVED; F8-N3-green.log 3/3; F8-N3-green-mutant.log KILLED: 517 MiB growth vs 261 measured). Suites F8a/F8b/F8w/F8w2/F8c/F8d: 913 passed each.

## F9 SEC-24: 7027cddd… (pushed)
Red: F9-SEC-24-red.log (no SEC-24 in docs or packages at c369bc77). Green: F9-SEC-24-green.log (packages/synth 192 passed), F9-synth.log (wrote fixtures/synthetic/SEC-24/expected.json), F9-synth2.log (0 written after), F9-check-fixtures.log 0. Suite F9-suite.log: 913 passed.

## Final checks (one lock hold): running
All exit 0 (logs/fix/final.log, final-*.log): typecheck 58 s; lint 137 s; lint:copy; lint:logs; check:fixtures; synth --all, tree clean after; @tp/worker build; bundle test; vitest unit packages/contracts, packages/synth, infra/, worker bundle + intake, screening-capacity watched.test, release-capacity scenario.test.
Done. WIP head 7027cddd… = origin/co-001/wip-pages-child-process. Base not merged; co-001/pages-child-process not pushed.
