# fix-check D2 (run 1): adversarial verify of D2 (mapping keys) at d257fe6d

Started 2026-11-01 (UTC). Clone: /home/user/fx-imgdigest-D2-1 (read only, never pushed).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D2v-*.log

## Steps
- [x] clone, fetch WIP ref: origin/co-001/wip-ci-images-digest = d257fe6d… (ls-remote too); PR branch still 83167b8f…; build-platform 43565235…
- [x] pnpm install --frozen-lockfile: ok (D2v-install.log)
- [x] read D2 commit 330deea0…: adds `keys(root, '')` walk in unboundedValueProblems (workflows.test.ts ~3213-3226 at d257fe6d…), 9 fixtures (~3548-3565); real-tree assertion at ~3429 is `.problems toEqual([])` with no filter, so a key problem on any real workflow fails T3
- [x] baseline: workflows.test.ts at d257fe6d…: 124/124 passed (D2v-baseline.log)
- [x] old worktree /home/user/fx-imgdigest-D2-1-old at b2a41a00… (same lockfile), installed (D2v-install-old.log)
- [x] mutation script d2bin/mutate.py builds CI_TREE copies of CI_FILES with one key mutation in ci.yml: step-env (the finding), step-env-block, step-env-embedded (X_${{…}}), step-env-escaped (\x24{{…}}), step-env-title, step-with, job-env, workflow-env, step-env-alias (*k), none (control)
- [x] N32 describe on each tree (D2v-1-new-trees.log, D2v-1-old-trees.log):
  - new rule (d257fe6d…): control `none` 7/7 green; all 9 key mutants red, T3 ("admits into a step's environment…") the only failing test (the D3 sum does not catch a key: D2 is the sole guard)
  - old rule (b2a41a00…): control and all 9 mutants green (4/4): the finding was real, CI green with the description in a key
- [x] exact messages (D2v-1-new-msgs.log): e.g. step-env "ci.yml jobs.images.steps[8].env.${{ github.event.pull_request.body }}: an expression in a key"; job-env, workflow-env, step-with ([7].with), embedded X_, escaped \x24, title, alias, block plain key: each one message, that format
- [x] graft (D2v-3-graft.log): b2a41a00's whole route test (25 refused expressions, 12 places, $GITHUB_ENV BODY= and cat reds) run on the new rule: passes (old reds still red; old accepted still no problem; old green write in fixture.yml now refused by D6: tightened)
- [x] probes (reports/probe-head.json): outside visit's places (on.inputs, step-level, service id, matrix key, job id), embedded, no spaces, insert, block plain, \x24, alias, container env: each refused with the key message; harmless keys ($HOME, PRICE$, {{ not }}, "$ {{ x }}"), bounded values, plain with: keys: no problem; a value-only problem gives no key problem
- [x] (1) finding's scenario red (see r2 below)
- [x] (2) harmless variants green (see r2 below)
- [x] (3) old red cases still red (see r2 below)
- [x] (4) docs match code, with nits (see r2 below)
- [x] remove clone (see end)

## Run 1 resumed (2026-11-02 UTC) after an interruption
- repository agrees with the file: clone clean at d257fe6d… (local branch verify-d2), ls-remote WIP = d257fe6d…, PR branch 83167b8f…, build-platform 43565235…; worktree -old was left at 330deea0… (D2 alone), clean
- found logs not yet recorded above:
  - D2v-at-330deea0.log: workflows.test.ts at 330deea0… (D2 alone, before D3-D10): 122/122 passed
  - strength mutations of the new rule (probe set P1-P13, G1-G5; suite = the N32 describe + probe):
    - mut-remove (no key walk): suite RED (the workflow-env fixture names the missing message), all P key probes 0 problems except P7/P8 value problems
    - mut-places (walk limited to visit's places): suite GREEN; P1 on.inputs key, P2 step-level key, P9 job id key give 0 problems => the "WHOLE workflow, independent of visit" property is not pinned by any fixture
    - mut-startswith (key.startsWith('${{') for includes): suite GREEN; P5 embedded X_${{…}} gives 0 problems => the embedded spelling is not pinned by any fixture
- GitHub's own parser, read (npm @actions/workflow-parser 0.3.61, dist/templates/template-reader.js and workflow-v1.0.min.json, read only, never run): a key expression is legal only where the mapping's inherited context is non-empty, else "A template expression is not allowed in this context". Legal (evaluated): workflow env, job env, step env, step with, container env (inherits `container`'s context), services env, AND services ids (`services` has context; the runner uses the id as the service's network alias, a docker argument) AND matrix keys (inherit `strategy`'s). Illegal (refused at parse): job outputs, reusable with:, secrets:, step-level keys, job ids, on.*.inputs. So the disposition's six places and its "GitHub refuses outputs/with/secrets" both hold; service ids and matrix keys are two more evaluated places the rule refuses (P3, P4) but no fixture pins.
- scratch trees/ and route-old.ts from the earlier run were already gone: re-running (1) and (3) fresh below (D2v-r2-*.log)
- [x] r2 trees, fresh (D2v-r2-new-trees.log, D2v-r2-old-trees.log, D2v-r2-new-msgs.log; mutate2.py adds container-env, services-env, service-id, matrix-key on the images job and two harmless mutants):
  - new rule d257fe6d…: none, harmless-keys (PRICE$, X_{{ not }}, "$ {{ x }}", $HOME), harmless-values (github.sha, pull_request.number) 7/7 green; all 13 key mutants red, T3 the only failing test, one message each "ci.yml <path>: an expression in a key" (finding: "ci.yml jobs.images.steps[8].env.${{ github.event.pull_request.body }}: an expression in a key")
  - old rule b2a41a00…: all 16 trees 4/4 green (the finding was real; nothing at b2a41a00 caught any key)
- [x] r2 graft (D2v-r2-graft.log): b2a41a00…'s whole route test (25 refused expressions, 8 accepted, 12 places, $GITHUB_ENV reds) run on d257fe6d…'s rule: passes, so every old red is still red; probes P1-P13 each refused with the key message, G1-G5 no key problem
- [x] r2 strength (D2v-r2-mut-*.log): mut-remove RED (the keyed fixtures catch a missing walk); mut-envwith (walk only env/with/outputs/secrets/container env/services env) GREEN with P1 on.inputs, P2 step-level, P3 service id, P4 matrix key, P9 job id all 0 problems; mut-places GREEN with P1, P2, P9 0; mut-startswith GREEN with P5 embedded 0. Code is right, fixtures pin only the listed places and the leading spelling.
- [x] whole file under mut-envwith: done, below
- [x] whole workflows.test.ts under mut-envwith, real tree (D2v-r2-mut-envwith-whole.log): 125/125 green (124 + probe): a walk narrowed to the six listed places plus outputs/with/secrets ships green
- [x] proposal checked (D2v-r2-proposal.log, patch3.py): four more keyed fixtures (service id, matrix key, a step-level key, X_ embedded) pass at d257fe6d… and turn each surviving mutant red (mut-envwith on the service id, mut-places on the step-level key, mut-startswith on X_)
- [x] (1) finding's scenario red: step-env tree, T3 fails with "ci.yml jobs.images.steps[8].env.${{ github.event.pull_request.body }}: an expression in a key"; green at b2a41a00…
- [x] (2) harmless green: none, harmless-keys, harmless-values trees 7/7; G1-G5; whole file 124/124 at head (D2v-baseline.log)
- [x] (3) nothing loosened: D2's diff only adds (walk + 9 fixtures; comment and doc lines reworded); b2a41a00…'s route test grafted onto head passes (old reds still red); 330deea0… alone 122/122
- [x] (4) docs vs code: ADR N32 "What holds it" and ci.md say "or a key" / "none in a key" (disposition met; lines rewrapped <=120 by D10); header comment "No key holds an expression" right. Nits: (a) ADR "it refuses any expression in a key, which GitHub would evaluate as a variable's or an input's name" and ci.md's "(GitHub would evaluate it as a variable's or an input's name)" read as true of every key, though GitHub refuses one in job outputs and a reusable with:/secrets: (the disposition's own warning) and also evaluates one in a service id and a matrix key; (b) the walk's comment "apart from the places visit reads" reads as "except"; (c) the fixture comment "wherever GitHub evaluates one" lists six places, GitHub's parser also evaluates a service id and a matrix key
- note (not D2's): the D3 environment sum counts a key's literal text; it relies on D2's refusal (the describe header says so: "No key holds an expression, and each environment string ... is summed from its name")
- [x] clone and -old worktree removed 2026-11-02 (both clean; nothing pushed; WIP ref still d257fe6d…, PR branch still 83167b8f…); my scratch trees new-*/old-* and the npm package read removed; logs and d2bin scripts kept
## Verdict
D2 resolved at d257fe6d…, nothing loosened. One test-strength gap (fixtures pin only the six listed places and the leading spelling; four checked fixtures close it) and doc nits, all inside #86's files.
