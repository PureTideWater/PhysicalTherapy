# Fix check A1, round 3 (adversarial verifier: D1, D4, D8)

Head under check: 5c01f150... (= origin/co-001/wip-ci-images-digest, ls-remote 2026-11-04). PR branch 83167b8f...,
claude/build-platform 21fa10df.... Repair 2 = a5bc1170..5c01f150: 21 commits (08:44-09:18 UTC 11-02), not 41.
Area commits: D1 2aaaa3d9, b133ee52, 707e436a, 66246ad0; D4 01855cb4, e5c17c37; D8 c0a73c37.
Clone /home/user/fx-imgdigest-A1-3 (read only). Logs scratchpad/imgdigest/logs/A1-3-*.

## Status
- [ ] install
- [ ] (1) D1-2 gaps + commit claims red
- [ ] (2) harmless variants green
- [ ] (3) a5bc1170 red cases still red
- [ ] (4) documents
- [ ] (5) whole file at head and trial merge
- [ ] clone removed

## Log
- (02:45 UTC) install exit 0 (A1-3-install.log). Baseline whole workflows.test.ts at 5c01f150: 124 passed, exit 0 (A1-3-base-whole.log).
- (02:55 UTC) Harness scratchpad/imgdigest/A1-3/scripts/{mutate.py,vt.sh} (CI_TREE copies, T6 by -t "only from the
  list below"). (1) D1-2's inherited-input gaps now RED in T6 (fingerprint message): r_job_env_unit (unit 80031271),
  r_job_env_capacity (capacity measure + runner-image), r_wf_env_largezip, r_job_env_imageversion (db), r_release_
  defaults_shell (release identity), r_wf_defaults_shell (ci.yml db/e2e/static/unit), job defaults working-directory
  (large-zip), job container (capacity). base and comment above every jobs: GREEN. CLOSED.
- (03:10 UTC) Probe copy tools/test/zz-a13-probe.test.ts (deleted after; A1-3/probe1.json). Real table: [] (green).
  D1-2 table gaps now RED: TB2 (db row cites unit's runner-image) "names no step runner-image of job db" + "names step
  runner-image of job unit, which its value does not read"; TB3 (gate sizing cites changes/measure) 4 messages; TB4
  (tool refs only) "names no needed job capacity", "names no output sizing". toJSON: release push row 5252 RED (writes
  5253), target_worker dropped RED, ci gate 556 RED (557). Row bytes 557/2604/2604/5253/5253 = commit's figures.
  toJsonBytes >= JSON.stringify worst case (all control chars): 1299 vs 1298; needsJsonBytes 1445 vs 1432-1436 for
  success/failure/skipped/cancelled. OK.
- ISSUE (should, loosened): job ids are case-folded inconsistently. producersOf looks up jobs[lowercased id], so for a
  job id with a capital: (a) toJSON(needs) / toJSON(needs.Build.outputs) rows no longer must cite the job's outputs,
  so the per-output check (one value alone, has a row, within bound) never runs and bounds() counts a joined output
  as 0 bytes. Fixture (probe2): up's 60 KB output joined twice into Build's output big, use reads toJSON(needs) with a
  200-byte row citing needs('Build') only: head refProblems [] and sum []; a5bc1170 red ("toJSON reads every output of
  job Build (big), and the row names none"). (b) false red: any steps.<id> row in a capitalised job ("names no step
  identity of job Build" + "names step identity of job build"), since wanted keeps row.job's case and cited lowercases.
  No capital job id in today's 10 workflows and no rule refuses one. Fix: resolve job ids case-insensitively in
  producersOf (and needs/outputs lookups), or refuse a job id that is not lower case.
- ISSUE (should): testTitles accepts tests that never run (probe1 titles all true): beforeEach((c) => c.skip()) in the
  describe or at top level; `return;` or `if (...) return;` in a describe's callback before the it(); (nit) skip by
  alias ({ skip: s }) => s(), c['skip'](), const s = c.skip; s(); a shadowed `it`. Commit 66246ad0's listed cases
  (if, loop, ternary, never-called function, skip twin, options, context.skip) are all red in the resolver fixture.
- Job env given as one expression: fingerprint changes (e246360c vs f3672a8b) and the sum refuses it. OK.
- (03:25 UTC) Code mutants of head (A1-3/scripts/mutants.py, mut.sh; N32 describe; logs A1-3-mut-*): ALL KILLED.
  M1 drop "which its value does not read", M2 drop "names no", M3 fingerprint without job, M4 without workflow, M5
  without container, M5b without defaults, M6 toJSON unescaped, M7 needs without its 64 bytes, M8 duplicate titles
  ok, M9 any written title, M10 no context-skip check, M11 places as a set (D4 K2), M12 sites only on the over row
  (D4 K3), M13 over bytes out of the whole (D4 K5b), M14 over exempt beside anything, M15 toJSON byte check off.
- D8 wording (table edits, T6): RED "not over" (W1), "over the wire and within" (W5), ". Under, never over" (W3),
  notify "under 131,072" (W7); GREEN harmless "which is over its 1 MB" (W6). ISSUE (nit): the negation test is case
  and contraction blind: ". Not over GitHub's 1 MB" (W2) and "isn't over GitHub's 1 MB" (W4) pass T6. Fix: /i flag
  and n't before over.
- (03:35 UTC) D4 on CI_TREE copies (N32 describe): RED a second FINDINGS_COPY env in notify (sum + sites), FINDINGS_B64
  joined with "x" (sum: beside), an inline ${{ }} read in notify's run (sites), a second check output reading
  calendar's findings (sites). GREEN ${{NEEDS.check.outputs.FINDINGS}} spelling. (2)(3): only a5bc1170 expect() line
  missing at head is the reworded toJSON "names none" (now "names no output digest_web of job build"); all others
  identical and green; old red cases red, except the capital-job-id toJSON case above (loosened).
- (03:50 UTC) (4) documents at head: ADR 0066 N32 "What holds it" and ci.md's "A step takes only the value it uses"
  and the images failure note say what the code does (producers exactly those the value reads; fingerprint of run,
  env over job's and workflow's, shell/working-directory or defaults.run, job container; toJSON rows quoted and
  escaped, six bytes a byte, names and indents; the over value exempt only alone in its string, counted in its
  process's whole; rows over 131,072 bytes name their sites; testTitles' listed forms, not what the test asserts).
  Only overstatement: "written to always run" / "always runs as written" while a hook skip or a describe early return
  passes (the testTitles issue above). e5c17c37's ci.md sentence present (ci.md ~451).
- (5) claude/build-platform moved to 4846f043... (#94), not 21fa10df. merge-tree --write-tree of 5c01f150 with it:
  clean (tree 3183f8c1...). Materialised as a local worktree (commit-tree, not pushed), pnpm install --frozen-lockfile
  exit 0, whole workflows.test.ts 124 passed (A1-3-trial-whole.log); head's tests with CI_TREE = the merged tree's CI
  files: 123 passed + 1 skipped (the CI_TREE self-run, by design) (A1-3-trial-citree.log). Probe files deleted; clone
  status clean.
- (03:55 UTC) Clone and trial worktree removed. All status boxes done.
## Result
D1 gaps of D1-2 closed (inherited env/defaults/container fingerprinted; producer tie; toJSON bytes); D4 and D8
commits hold under mutants. Issues: should (loosened) case-folded job ids in producersOf; should testTitles accepts
hook skips and describe early returns; nit D8 negation test case/contraction blind. Next: repair round for the two
shoulds (lower-case job id rule or case-insensitive lookups; refuse a skip() call or return in a describe body, or any
beforeEach/beforeAll in the named test's file that calls skip), then recheck.
