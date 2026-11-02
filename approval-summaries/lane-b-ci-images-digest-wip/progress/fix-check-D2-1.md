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
- [ ] (1) finding's scenario red
- [ ] (2) harmless variants green
- [ ] (3) old red cases still red
- [ ] (4) docs match code
- [ ] remove clone
