# fix-check-whole-1: whole-diff adversary for #86's fix round

Started 2026-11-02 (~02:45 UTC). Head under check: d257fe6d... (WIP ref co-001/wip-ci-images-digest), diff base b2a41a00...
Clone: /home/user/fx-imgdigest-whole-1 (read only; remove at the end) + worktree /home/user/fx-imgdigest-whole-1-old at b2a41a00.
Untracked probe in the clone: tools/test/zz-w1probe.test.ts (head's file + one probe it; delete before the suite run).
Logs: scratchpad/imgdigest/logs/W1-*.log; scripts, trees, JSON: scratchpad/imgdigest/w1/.

## Steps
- [x] clone + fetch; head d257fe6d... checked out detached; installs exit 0 (W1-install.log, W1-install-old.log)
- [x] live refs (ls-remote, ~02:45 UTC): WIP d257fe6d... (= report), PR branch 83167b8f..., **claude/build-platform
  MOVED to 4eaf7124...** (#92 UX PR 6, one first-parent merge over 43565235...), **#42 MOVED to 9426a8d1...**
  (was 6c28d6a2...).
- [x] new base 4eaf7124...: 43 files; of #86's nine and T6's cited files it touches only
  tools/screening-capacity/watched-paths.txt (+1 line, step-limits.ts). merge-tree with d257fe6d... clean; on the
  merged tree .github, workflows.test.ts, ADR 0066, ci.md, reconciliation-001, tools/release-capacity and
  tools/content-calendar are identical to d257fe6d...'s.
- [x] read git diff b2a41a00..d257fe6d whole (workflows: D7 only; test: D1-D8; docs: ADR N32, ci.md, reconciliation)
- [x] T1-T6 code read at head (lexer/parser, expressionProblems, unboundedValueProblems + keys walk, environmentProblems,
  refProblems/resolver helpers, T5)
- [x] timing (W1-timing.log, w1/timing-*.json; 3 runs each, workflows.test.ts alone, under the lock): old b2a41a00
  33.2/34.7/34.4 s wall, 121 tests; new d257fe6d 40.0/44.3/42.6 s wall, 124 tests (+~8 s, ~+23%). T6 48 ms -> 1,084 ms
  (x22); the SELF Dependabot-rewrite test (nested vitest) 22.8 s -> 28.6 s. All exit 0, no flake in 6 runs.
- [x] fixture probe (W1-probe-1.log, w1/probe-1.json; head's functions on fixtures):
  - toJSON(needs.build.outputs.big) with a 100,000-byte row: T3 admits, records the bare value; the sum counts the
    row's bytes and passes, though toJSON quotes and escapes (" and \ two bytes, a control character six); the same
    value twice is refused at 200,003. -> a byte bound the sum gets wrong.
  - the over row's string exempts whatever stands beside it: + three vars, + env.NOPE (unset), + format of a
    literal: T3 [] and the sum [] on each (confirms fix-check-D4's M6 class: the FINDINGS_B64 exact-value pin was
    deleted, sites hold only the place).
  - a `parallel:` step (GitHub's workflow-parser 0.3.61, 2026-08-04: steps-item one-of run/regular/wait/wait-all/
    cancel/parallel-step; parallel-steps a nested step list) holding the description in env, three vars, and a
    step input of steps.web.outputs.metadata: T3 problems [] values [], the sum []. -> an unhandled place.
  - arguments: container options, job defaults.run.shell, a service's options/entrypoint/command, a script's
    argument, each with three vars (147,456 bytes in one argument): T3 [] (admits vars), the sum [] (reads no
    argument). Each is one argv string over MAX_ARG_STRLEN.
  - 50 env strings in one step, each a var (49,157 bytes): T3 [], the sum []; together 2,457,850 bytes, over
    ARG_MAX's 2 MiB. The docs name ARG_MAX; nothing holds a step's total.
- [x] CI_TREE trees (w1/mutate.py, w1/run.sh; whole workflows.test.ts; W1-trees-summary.log, W1-<side>-<m>.log),
  head d257fe6d...: none 123/1 skipped GREEN.
  - par-body, par-vars, par-metadata (a `parallel:` step, nested run step with the description / three vars / the
    whole metadata): RED only by the actionlint test ("unexpected key "parallel" for "step" section"); T3, the sum,
    T6 green. The actionlint test is it.runIf(actionlint installed): none on CI (the SELF test's comment, "as on CI";
    no workflow runs actionlint). Re-run with ACTIONLINT= (as on CI) queued: batch2 (log /W1-batch2.log, moved later).
  - bg-body (a top-level step with background: true reading the description): RED by actionlint AND T3 and the sum.
  - over-plus-var / over-plus-sha / over-plus-format (FINDINGS_B64 = the findings plus vars.A / -github.sha / a
    format of a literal): GREEN 123/1 at head; old b2a41a00 over-plus-var RED (T6's FINDINGS_B64 exact-value pin).
    -> CONFIRMED loosening from D3's whole-string exemption plus D4's removal of the pin.
  - container-options (node:24, options with three vars): RED only by the image-digest rule (node:24); a digest
    image queued (container-digest). defaults-shell: RED only by the bash/pipefail shell rule. run-argv
    (/usr/bin/printf with three vars in one argument, 147,456 bytes): GREEN 123/1 (one argv string over
    MAX_ARG_STRLEN passes every rule).
- [x] batch2 (W1-batch2.log; W1-nolint-new-*.log), ACTIONLINT= as on CI: none 122/2 skipped GREEN; par-body,
  par-vars, **par-metadata** (a nested step's env = steps.web.outputs.metadata, the defect N32 fixes) each 122/2
  GREEN: on CI's configuration the whole workflows.test.ts passes them. container-digest (job container by digest,
  options with three vars in one docker argument) 123/1 GREEN with actionlint.
- [x] perf (w1/perf-*.json; w1/perf-memo.diff): T6 alone, head's code 1,102/1,146/1,547 ms; with refProblems
  memoising each workflow's parse, each tool file's declaredNames/testTitles, and stepLine computed only for a message:
  320/291/293 ms (x3.7), green. Causes: parse(workflowText) once per row (67), stepLine's parseDocument for every
  step ref even when nothing fails, TypeScript parses of the same tool/test file once per ref (image-id.ts and its
  test 18 times each).
- [x] probe 2 (W1-probe-2.log, w1/probe-2.json): a closed list of job keys (name, needs, if, runs-on, timeout-minutes,
  continue-on-error, container, services, env, environment, permissions, concurrency, outputs, defaults, steps,
  strategy, uses, with, secrets) and step keys (name, id, if, uses, run, with, env, working-directory, shell,
  continue-on-error, timeout-minutes): real workflows [] ; parallel, background, snapshot each refused by name.
- [x] probe files removed (diffs kept: w1/probe.diff, w1/perf-memo.diff); git status clean at d257fe6d...
- [x] tools tests at d257fe6d... (`vitest run --project unit tools/`, every tools test of the unit project, under the
  lock; W1-tools-suite.log, 02:57 UTC): 82 files passed, 1,283 tests passed, 3 skipped, exit 0 (a stray
  "sha256sum: chrome-headless-shell-linux64/icudtl.dat: Input/output error" line from the container's browser cache,
  no test failed). `pnpm typecheck` (W1-typecheck.log): 22 projects passed, exit 0.
- [x] old-side trees (b2a41a00): none 120/1 GREEN; over-plus-var, over-plus-sha, over-plus-format each RED at T6's
  FINDINGS_B64 exact-value pin (old :3364); par-body RED by actionlint only (pre-existing: the old rule never read
  nested steps either); container-options RED by the digest rule (node:24).
- [x] #42 9426a8d1...: one commit over 6c28d6a2... ("Update domain-model.md", that file alone); merge-tree with
  d257fe6d... clean; .github, workflows.test.ts, release-capacity, content-calendar, stryker, publish-content.test.ts
  identical to d257fe6d...'s; screening-capacity differs as on 6c28d6a2 (fix-check-D1 checked those symbols).
- [x] co-001 heads (100, ~03:00 UTC, w1/heads-now.txt) vs the D9 listing: one new head, wip-unmapped-plan-2
  dc205946... (02:42 UTC, base 43565235...): changes reconciliation-001.md only among #86's and T6's files; merge-tree
  with d257fe6d... clean.
- [x] tool-code bounds read: advisory line (checks.ts verdict: one fixed sentence + two numbers, base64 under 256),
  sizingQuestion (one sentence, an upload label, toFixed(1): under 512), time-warnings (one line per judged upload,
  joined '; '): plausible; none is asserted by a test (fix-check-D1/D3 said so too).
- [x] CRLF: yaml normalises CRLF in a block scalar (parse of 'run: |\r\n  a\r\n  b\r\n' gives 'a\nb\n'), so a
  Windows checkout moves no fingerprint. workflowFiles() is sorted; refProblems sorts places; no Date or timing in
  the rules: no flake source found; 6 timing runs + 17 tree runs all deterministic.
- [x] docs vs code at d257fe6d...:
  - ADR N32 sum bullet "refuses one over 131,072 bytes, or one holding a value with no bound, but for the one value
    named over the limit": the code skips the WHOLE string that holds it (environmentProblems `if (reading.over)
    continue;`, before the unbounded check), whatever stands beside it. ADR "held to the one place each job reads
    them, so no second use joins them": sites hold the place; the string at that place may gain anything (trees
    over-plus-*). ci.md :151-153 omits the exception (fix-check-D8 said so).
  - ADR "reads every expression that reaches a step's environment, an input or a script", the describe header and
    ci.md "sums each environment string a workflow sets": a parallel: step's nested steps are read by neither rule.
  - ci.md :151-152 "'Argument list too long' ... means an environment string ... over 131,072 bytes, or the whole
    environment and arguments over ARG_MAX": one ARGUMENT over 131,072 fails the same way (fs/exec.c copy_strings
    holds argv and envp strings each to MAX_ARG_STRLEN); the test holds neither arguments nor ARG_MAX (probe 1: a
    container's options, a default shell, a service's options/entrypoint/command, a script's argument; 50 strings
    totalling 2,457,850 bytes in one step).
  - status file RESUME-BLOCK (:15, :21, :42) still names base 43565235... and #42 6c28d6a2...; live are 4eaf7124...
    and 9426a8d1....
- [x] remote refs at the end: WIP d257fe6d..., PR branch 83167b8f..., #42 9426a8d1..., **claude/build-platform
  moved again to 877e662f...** (#93 UX home figures; 50 files, of #86's and T6's only watched-paths.txt, +1 line);
  merge-tree with the WIP head clean, .github, workflows.test.ts, ADR 0066, ci.md, reconciliation-001,
  release-capacity and content-calendar identical (blobless temp fetch in scratch, removed).
- [x] clone and old worktree removed (both clean; nothing committed or pushed); scratch trees and the npm package
  removed; logs, scripts, JSON and the two diffs kept.

## Result: NOT RESOLVED, loosened (one interaction regression); the rest are gaps and proposals
1. LOOSENED (D3 + D4 together): environmentProblems skips the whole string that holds the over row
   (`if (reading.over) continue;`, before the unbounded check) and D4 deleted T6's FINDINGS_B64 exact-value pin, so
   FINDINGS_B64 = findings + vars.A / -github.sha / format of a literal / an unset env.X passes the whole file at
   d257fe6d... and was red at b2a41a00... (old :3364). Fix: exempt the over string only when the value is that one
   expression alone (fix-check-D4's trial patch), and say so in ADR N32's sum bullet.
2. Unhandled place: GitHub's parser (workflow-parser 0.3.61) has `parallel:` steps (a nested step list); T3, the sum and
   the $GITHUB_ENV check iterate top-level steps only, so a nested step's env holding steps.web.outputs.metadata
   whole (the defect itself), the description or three vars passes the whole file on CI's configuration (no
   actionlint; actionlint 1.7.7 refuses the key only where installed). Pre-existing, not a regression; the round's
   docs and header now claim "every". Fix (checked, probe 2): a closed list of job and step keys the rule reads
   ([] on the real workflows; refuses parallel, background, snapshot).
3. Wrong bytes: toJSON(needs.<job>.outputs.<name>) is admitted by T3 as the bare value and summed at the row's bytes;
   toJSON quotes and escapes (up to 6N+2). Fix: refuse toJSON of one output in T3 (no workflow uses it), or sum
   6 x bytes + 2.
4. Arguments and ARG_MAX: one argv string over 131,072 (container/service options, entrypoint, command, a job's
   default shell, a script's argument) and a step's total over ARG_MAX pass every rule (container-digest and run-argv
   trees green; probe 1). No present exposure. ci.md's diagnostic sentence omits one argument over the limit.
5. Performance: workflows.test.ts 34 s -> 42 s wall; T6 48 ms -> ~1.1 s (memoised: ~0.3 s, w1/perf-memo.diff).
6. Docs: ADR N32 sum bullet and "no second use joins them" vs (1); "every expression"/"each environment string"
   vs (2); ci.md :151 vs (4); status file RESUME-BLOCK names stale heads (base now 877e662f..., #42 9426a8d1...).
No flake found; the earlier per-disposition gaps (D1 G1/G3/T5-T7, D2 fixture places, D3 mapping-from-expression, D6
g1, D8 wording) stand as their checkers wrote them; nothing here contradicts them.
## DONE

