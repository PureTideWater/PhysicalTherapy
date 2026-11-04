# Fix check A1, round 4 (adversarial verifier: D1, D4, D8)

Head under check: 2648ccf0... (= origin/co-001/wip-ci-images-digest, ls-remote 2026-11-04). PR branch 83167b8f...,
claude/build-platform 4846f043.... Repair 3 = 5c01f150..2648ccf0 (13 commits + lint follow-up).
Area commits: A1.1 ec5a5046, A1.2 67a7a119, A1.3 cb77264e (also read the others for overlap).
Clone /home/user/fx-imgdigest-A1-4 (read only). Logs scratchpad/imgdigest/logs/A1-4-*.

## Status
- [x] install
- [x] (1) round-3 A1 issues + commit claims red
- [x] (2) harmless variants green
- [x] (3) a5bc1170 / 5c01f150 red cases still red
- [x] (4) documents
- [x] (5) whole file at head and trial merge
- [x] clone removed

## Log
- (05:10 UTC) install exit 0 (A1-4-install.log). Baseline whole workflows.test.ts at 2648ccf0: 124 passed (A1-4-base-whole.log).
- Probe copy tools/test/zz-a14-probe.test.ts (deleted; A1-4/probe1.json). A1.1 CLOSED: capital job Build,
  toJSON(needs.Build.outputs) citing needs only RED "names no output big of job build"; citing it RED (joined output);
  handed needs.Build.outputs.big RED (joined). ISSUE nit: `needs: build` for job Build (GitHub reads ids in any case)
  is red whatever the row cites ("does not need a job Build" / "declares no output big"): needs case and output case
  still use jobs[ref.job] / needsOf().includes() exact. Strict only.
- testTitles probes: refused as claimed: nested-describe hook skip, describe return, hook ({task}), hook not a fn,
  shadow let it, ...rest, c['skip'], arguments[0].skip() in a hook. Admitted (harmless): plain, ({expect,signal}),
  c.expect, nested describe with options + it.concurrent + timeout, hook with no context, hook ({expect}).
  STILL ADMITTED and confirmed skipping in a real vitest run (exit 0, "1 skipped", the test asserting 1===2):
  `import { beforeEach as setup }` + setup((c) => c.skip()) (A1-4-real-b1.log); `const be = beforeEach` alias
  (titles only); it('T', function () { arguments[0]['skip']() }) (A1-4-real-b2.log) and the same in a hook.
  getCurrentSuite() task.mode mutation: admitted but the real run fails (b3, red). it.only elsewhere: red under CI
  (b4). => nit (deliberate evasion; the commit says "nothing can skip it unseen").
- (05:30 UTC) (3) expect() lines of 5c01f150 / a5bc1170 missing at head (A1-4/exp-*.txt): only the two D8 regexes
  (replaced by /i supersets plus n't), needsJsonBytes 522 -> 554 (NEEDS_JOB_BYTES 96, a larger allowance) and
  a5bc1170's toJSON "names none" (reworded in repair 2). Nothing loosened.
- (4) docs (ADR N32, ci.md diff 5c01f150..head) match the code: "written to run whenever its file runs", hooks of
  its file, return, own-scope it/test/describe, context expect/signal. Overstatement only where the nit above
  escapes ("any hook of its file": an aliased hook is one).
- (5) merge-tree --write-tree head with origin/claude/build-platform 4846f043...: clean, tree 9792b0a8.... Run pending.
- Code mutants running (A1-4/scripts/mutants.py, mut.sh; logs A1-4-mut-*): killed so far (resolver test red, plus the
  CI_TREE self-run): jobnamed-exact, wanted-rowjob-case, hook-taint-off, hook-notfn-ok, describe-return-ok, shadow-off.
- (06:20 UTC) mutants done (A1-4-mut-*.log): KILLED (resolver test + CI_TREE self-run red) jobnamed-exact,
  wanted-rowjob-case, hook-taint-off, hook-notfn-ok, describe-return-ok, shadow-off, context-any,
  context-destructure-any, vitest-alias-ok. SURVIVED: under-case, neg-case, neg-nt (the D8 guard runs on the real row
  only, no fixture of its own), bounds-exact-job (toJSON byte sum's job match back to exact case).
  Probe2 (A1-4/probe2.json): at head a capital job's toJSON(needs.Build.outputs) with two 60 KB outputs and a 60,000
  row is RED "writes up to 720025 bytes" (correct); under bounds-exact-job that would read 0. ISSUE nit (coverage):
  no fixture holds the byte sum for a capital job id, nor the D8 /i and n't forms.
- D8 table edits (T6, logs A1-4-d8-*): RED ". Not over", "isn’t over", "Under and over"; GREEN harmless "which is over
  its 1 MB". STILL GREEN "over the wire and does not exceed GitHub’s 1 MB" (blacklist; nit, same as round 3's).
- Trial merge worktree /home/user/fx-imgdigest-A1-4-trial (local commit-tree, not pushed): running.
- (06:45 UTC) (5) trial merge tree 9792b0a8... materialised: install exit 0, whole workflows.test.ts 124 passed
  (A1-4-trial-whole.log); head's file with CI_TREE = merged tree 123 passed + 1 skipped (self-run, by design)
  (A1-4-trial-citree.log). Clone status clean; clone and trial worktree removed.
## Result
Round 3's A1 issues closed: A1.1 (capital job id: toJSON citations and joined output red again, no false step red),
A1.2 (hook skip, describe return, renamed/indexed/kept/handed context skip, own-scope it all refused), A1.3 (Not over /
isn't over red). D1-2 gaps stay closed; nothing loosened. All nits: (a) testTitles still admits an aliased hook
(import { beforeEach as setup } / const be = beforeEach) and arguments[0]['skip']() (real runs skip, exit 0);
(b) `needs: build` for job Build red whatever the row cites; (c) no fixture holds the toJSON byte sum for a capital
job or the D8 /i and n't forms (mutants survive); (d) D8 blacklist misses "does not exceed". Next: optional nit round,
then the PR-branch step.
