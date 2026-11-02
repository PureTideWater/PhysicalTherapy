# Fix repair 1 (ci-images-digest): progress

Started 2026-11-02 (UTC). Worktree /home/user/ci-images-digest, start head d257fe6d… (= origin/co-001/wip-ci-images-digest).
PR branch still 83167b8f…. Base now 877e662f… (#93), #42 at 9426a8d1….
Logs: scratchpad/imgdigest/logs/R1-*.log; scripts and patches: scratchpad/imgdigest/r1/.

## Issues (verifier id: issue) and state
Status legend: todo | doing | done <commit> | not-real (why) | proposal

- D4-1 / W-1 (loosening): over string exempt only when the value is alone: done 46e555e9 (logs R1-c1-*)
- D4-2 / D8-2 / W-6a: docs on the over exemption (ADR, ci.md, comments, BoundedValue.over doc): done 46e555e9
- D4-3: sites on every row over MAX_ARG_STRLEN: done 11534e93 (logs R1-c2-*)
- D1-1: templated output names on the real table (narrow skip); fixture; fingerprint env too: done ff3793b0 (narrow, logs R1-c5-*), 646c5bc1 (fingerprint covers run, env, shell, working-directory; logs R1-c6-*)
- D1-2: job output ref checks its declared expression: done 66350147 (logs R1-c7-*)
- D1-3 / D6-3: testTitles ignores skip/todo; SIZING points at an exact-text test: done ca54de5d (logs R1-c8-*); length assertions in the owners' tests: proposal
- D1-4: uses: producer fixture: done 197686ce (logs R1-c9-*)
- D1-5: docs name the uses: producer and "named by title": done ca54de5d
- D1-6: shards comment: done 748a3485
- D2-1: four keyed fixtures: done 31735bb7 (logs R1-c10-*)
- D2-2 / D2-3: key-rule reason wording; comment wording: done 31735bb7
- D3-1: mapping given as one expression: done c06f3f3e (logs R1-c3-*)
- D3-2: sum fixtures at workflow/job/container/services env; token bound: done 30d05555 (logs R1-c4-*)
- D3-3: env() scope comment; "each" wording: done 30d05555 (comment), c06f3f3e (each is now true)
- D3-4: release.yml origin newline: done 212da396 (logs R1-c20-*)
- D5-1: build matched by resolved repository (/.@): done 5e42c2fa (logs R1-c15-*)
- D5-2 / D5-3: count by parsed uses keys, message names the line: done 5e42c2fa
- D6-1: behavioural test reads the whole GITHUB_ENV file: done 942a6b02 (logs R1-c17-*)
- D6-2: GITHUB_ENV_WRITES fingerprint: done 942a6b02 (b3e2ef69)
- D6-4: backslash-newline join, ACTIONS_ALLOW_UNSECURE_COMMANDS, ADR wording: done 1b8e595a (logs R1-c18-*)
- D7-1: exact build env; no DOCKER_BUILD_ at workflow/job env: done ed43d78f (logs R1-c16-*)
- D7-2 / D7-3: workflow comment wording; "every other run": done (docs commit after ed43d78f)
- D7-4: old .dockerbuild artifacts: proposal (founder/ops)
- D8-1: check row's words asserted: done c4de5872 (logs R1-c19-*)
- D9-1: reconciliation runs-of-record wording: done 0dd58dbf
- D9-2: labels P2 / S3 / S1: done b9f9ca4c (S1 in 31735bb7)
- D10-1/2/3: wording: done 2fbff79b (1, 3), 0dd58dbf (2; the workflows.ts spelling part is not real: the entry already says workflows.test.ts)
- W-2: parallel: (closed key lists): done 633c2c0e (logs R1-c11-*)
- W-3: toJSON of one output: done 81be3473 (logs R1-c12-*)
- W-4: argument strings and ARG_MAX: done 14a9e6bf (logs R1-c13-*)
- W-5: performance (memoise): done e68363a0 (logs R1-c14-timing-*)
- W-6d: status file heads: left to the item session, which owns the status file (base now 877e662f…, #42 9426a8d1…)

## Log
- Harness: r1/run.sh LABEL TESTFILE FILTER MUTATION... and r1/mutate.py; old rule = a zz-r1-old.test.ts copy of HEAD's file (deleted after).
- 46e555e9 C1, 11534e93 C2 committed (not yet pushed).
- 46e555e9 (C1 amended before push for an ADR rewrap), 11534e93, c06f3f3e, 30d05555 pushed to the WIP ref (fast-forward from d257fe6d…).
- ff3793b0 C5, 646c5bc1 C6, 66350147 C7 committed (not yet pushed).
- ca54de5d C8, 197686ce C9; pushed through 197686ce.
- 31735bb7 C10, 633c2c0e W-2, 81be3473 W-3; pushed through 81be3473.
- 14a9e6bf W-4, e68363a0 W-5; pushed through e68363a0. Next: D5 (T5), D6, D7, D8, D9, D10, D3-4, D1-6.
- 5e42c2fa D5, ed43d78f D7-1, then the D7 wording commit (not yet pushed).
- 3409fb65 D7 wording, 942a6b02 D6a, 1b8e595a D6b; pushed through 1b8e595a. Next: D8-1, D9, D10, D3-4, D1-6, then final checks.
- c4de5872 D8, 2fbff79b D10, 0dd58dbf reconciliation, b9f9ca4c labels, 748a3485 shards comment, then the origin ci commit. Next: final checks, push.
- The origin commit was amended before any push (its first form changed an existing SCRIPT_ENV fixture by a too-wide
  sed, which the whole file caught): e0bc5717.
- Final checks running (logs R1-final-*): tools suite, typecheck, lint, lint:logs, actions:check --offline; actionlint
  1.7.7 gave only the 22 known ubuntu-26.04 label messages; whole workflows.test.ts 124/124 at e0bc5717.
- Trial merges (r1/merges2.txt; logs R1-trial-*): base 877e662f…, #42 9426a8d1…, ce408d2f…, bb13be1b…, 081a8034…,
  e3299ea2…, c18a847e… merge clean; b9a83bd3… (wip-ci-findings-transport, built on d257fe6d…) now conflicts in ADR 0066,
  reconciliation-001 and workflows.test.ts (it rewrites what this round changed); 50029e64… (ci-mutation-trigger)
  conflicts in the same two docs as it did with d257fe6d…; the rest conflict outside #86's files (old bases).
- e0bc5717's message amended before push (the ref rows are 4,260 and 192 bytes, not the verifier's 4,393): 212da396,
  same tree. a5bc1170: the key fixtures' extra messages, a readability follow-up to 633c2c0e.
- Final checks at 212da396's tree (logs R1-final-checks.log): tools suite 82 files, 1,283 passed, 3 skipped; typecheck
  22 projects; lint 1,680 files 0/0; lint:logs 1,087 files; actions:check --offline passed. At a5bc1170
  (R1-final-head.log): workflows.test.ts 124/124, typecheck passed.
- Trial merges at 212da396 (R1-trial-*): base 877e662f…, 081a8034…, e3299ea2… all pass; #42 9426a8d1…, ce408d2f…,
  bb13be1b…, c18a847e… pass workflows.test.ts and every cited tool test but one report.test.ts test ("counts the
  consumers' lines of a run the mail gate held…"), which fails on 9426a8d1… alone in the same trial worktree
  (SCREENING_MAIL_PAUSED in this container), so not from #86.
- PUSHED: co-001/wip-ci-images-digest at a5bc1170… (fast-forward from 1b8e595a…). PR branch still 83167b8f…. DONE.
