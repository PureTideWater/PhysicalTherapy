# fix-check D6-1 (adversarial verify of D6: GITHUB_ENV_WRITES closes name, value form, place, count)

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D6-1 (read only, never pushed).
Disposition (security N2): replace GITHUB_ENV_NAMES with a closed map name -> {file, job, step, line (exact text)};
every line naming GITHUB_ENV across all workflows equals one entry; each name written exactly once; bound recorded
beside it, pointing to the behavioural test that runs the step (a SHA or exit 1). T4 fixtures: second write, changed
value form, write in another step: each red.

## Steps
- [ ] clone, fetch WIP ref, check out d257fe6d..., confirm = origin/co-001/wip-ci-images-digest
- [ ] pnpm install --frozen-lockfile
- [ ] read the D6 code (a7ccead0...) and the rule at head
- [ ] (1) finding's scenario ($(git log -1 --format=%B)) red; newline-at-run-time variant
- [ ] (2) harmless variants green
- [ ] (3) b2a41a00 fixtures/red cases still red
- [ ] (4) documents match code
- [ ] remove clone

## Log
- C0 (02:0x UTC) heads (git ls-remote): wip d257fe6d…, PR branch 83167b8f… (= refs/pull/86/head), build-platform
  43565235…, #42 6c28d6a2…. Clone checked out at d257fe6d… (= origin/co-001/wip-ci-images-digest).
  pnpm install --frozen-lockfile exit 0 (logs/D6-1-install.log).
- C1 read D6 (a7ccead0…: test + ADR N32 bullet + ci.md sentence). GITHUB_ENV_WRITES {ENGINE_FREEZE_BASE: ci.yml / unit /
  "The engine freeze's base" / exact line / bound text / test title}. unboundedValueProblems: every step.run line that
  includes 'GITHUB_ENV' must equal an entry's line (trim) at file+job id+step name; per-file count >1 refused. T3 it:
  each entry's line appears exactly once among the job's steps of that name, and testTitles(workflows.test.ts) has the
  test title. env.<name> of the map in an expression → unbounded (Infinity) in the D3 sum (was GITHUB_ENV_NAMES).
  Old rule (b2a41a00… :3010-3013, :3156-3157): name set + regex ^echo "NAME=[^"]*" >> "$GITHUB_ENV"$, any step, any file.
  ci.yml engine freeze step identical in b2a41a00 and d257fe6d (ci.yml:271-290).
  Behavioural test (:1584-1597): runs the step via stepNamed(ciJob('unit'), name) (reads CI_TREE), 4 cases (pull → first,
  push before → second, created zeros → HEAD^1, e*40 → exit 1 and no write); value read by /^ENGINE_FREEZE_BASE=(.*)$/m
  (first match only; whole file not asserted). testTitles (:3832) counts it.skip/it.skipIf/it.todo titles too.
  github.env (the file's path) not in BOUNDED_GITHUB: `${{ github.env }}` in run is refused by T3 (not a bypass).
- C2 harness (02:10 UTC): scratchpad/imgdigest/d6mut/ (mutate.py SRC DEST NAME: copy CI_FILES, one edit of ci.yml;
  run.sh RULE LABEL SRC SCOPE(all|d6) M...; summary.py). Old-rule worktree /home/user/fx-imgdigest-D6-1-old at
  b2a41a00… (frozen install exit 0, logs/D6-1-old-install.log). Mutations (mutations.txt): none; n2-value (the finding),
  n2-second, n2-other-step-copy, n2-other-step-move, n2-other-job, n2-other-file, n2-other-var; g1-newline (N2's second
  input: value with a newline after the verify), g2-runner-only, g3-no-verify, g4-message; h1-shift, h2-echo,
  h3-trailing, h4-indented; o1-body, o2-cat, o3-unquoted, o4-printf, o5-heredoc, o6-tee; b1-continuation
  ("$GITHUB_\<nl>ENV"), b2-indirection (${!v}), b3-set-env (ACTIONS_ALLOW_UNSECURE_COMMANDS + ::set-env). Dry-run built
  every one on both trees. Scope d6 = -t 'admits into a step|gives the differential test|keeps every environment
  string|refuses each route' (the old file lacks the sum test). Baseline new/none d6: 4 passed (21 s).
- Probe (scratchpad/d6probe): bash -eo pipefail writes BODY via "$GITHUB_\<nl>ENV" and via ${!v}, no line naming
  GITHUB_ENV. Runner v2.338.2 (scratchpad/s3src/runner, ActionCommandManager.cs:236-254) still runs set-env when the
  step's env sets ACTIONS_ALLOW_UNSECURE_COMMANDS=true; nothing in the repo names that variable (git grep). actionlint
  (which flags set-env) runs only where installed; CI installs none (workflows.test.ts:2575-2580).
- Second test of the step: tools/engine-freeze/check.test.ts:746-757 (toContain of the merge-base line, base="$BEFORE"
  and the exact write line; env toEqual). Neither it nor :1584 asserts the whole GITHUB_ENV file.
- (times above: C0 ~01:40 UTC, C2 ~01:49 UTC; the batch started 01:49:28 UTC, scratchpad/imgdigest/d6mut/batch-d6.txt,
  logs/D6-1-{new,old}-d6-<m>.log and .log.raw; digest.sh prints each run's failures and received problem lines.)
- Early results (new rule, new tree): none 4/4 green; n2-value (the finding) RED twice: T3 "ci.yml job unit step
  "The engine freeze's base" run: a $GITHUB_ENV write outside its closed map: echo "ENGINE_FREEZE_BASE=$(git log -1
  --format=%B)" >> "$GITHUB_ENV"" and the behavioural test (base "third", not the SHA); n2-second RED "ci.yml:
  ENGINE_FREEZE_BASE is written to $GITHUB_ENV 2 times, not once"; n2-other-step-copy RED "ci.yml job images step "The
  images' directory" run: … outside its closed map".
- Skip worktree /home/user/fx-imgdigest-D6-1-skip (d257fe6d…, frozen install exit 0): the behavioural test made
  it.skip(…) in place (uncommitted), to test whether T3's "its test exists by name" accepts a skipped test.
- The step's script fingerprint today (D1's fingerprint: SHA-256 of the parsed run, 8 hex): 4294b64f.
- C3 new rule, new tree, scope d6 (01:49-01:53 UTC): RED n2-value, n2-second, n2-other-step-copy, n2-other-job ("ci.yml
  job db step … outside its closed map"), n2-other-file ("mutation.yml job stryker step "The canary" … outside its
  closed map"), n2-other-var ("… OTHER_BASE=$base …"), g3-no-verify (behavioural: status 0 base eeee…, expected 1 and
  no write). n2-other-step-move: my mutation was malformed (offset after the removal; YAMLParseError), fixed in
  mutate.py, re-run queued after chain2.
  **GREEN g1-newline and g2-runner-only (4/4 passed each).** Direct run of the mutated scripts (scratchpad/d6probe,
  bash -eo pipefail, a 3-commit repo, pull_request): g1 writes "ENGINE_FREEZE_BASE=<sha>\nBODY=third" (a second
  variable from the commit message: N2's own second input, "a value carrying a newline at run time"); g2 writes the SHA
  without GITHUB_ACTIONS and "ENGINE_FREEZE_BASE=third" with GITHUB_ACTIONS=true (a runner). The exact line pins the
  form `$base`, not what the rest of the step puts in $base; the behavioural test reads only the first
  ENGINE_FREEZE_BASE line (/^ENGINE_FREEZE_BASE=(.*)$/m), never the whole file, and only the paths it drives.
- C4 new rule, new tree, scope d6 (rest): RED g4-message (behavioural only: base "third"); o1-body, o3-unquoted,
  o4-printf, o5-heredoc ("cat >> "$GITHUB_ENV" <<EOF"), o6-tee: T3 "… outside its closed map: <line>"; o2-cat T3 + the
  behavioural test (cat of a missing file exits 1). GREEN h1-shift, h2-echo, h3-trailing, h4-indented (harmless, 4/4
  each). GREEN b1-continuation and b2-indirection (writes naming no GITHUB_ENV on a line; old rule to compare).
- C5 old rule (b2a41a00…) on the old tree, scope d6 (3 tests; batch ended ~02:0x UTC): none GREEN 3/3.
  n2-value: T3 GREEN (the finding reproduced: the old rule admits it), behavioural RED (base "third"): the whole old
  suite was already red on the literal finding through the behavioural test; the new rule adds T3's red.
  n2-second, n2-other-step-copy, n2-other-job, n2-other-file: GREEN under old, RED under new (the disposition's
  tightening). n2-other-step-move (fixed mutation; the old half ran after the fix): T3 GREEN, behavioural RED (no write
  in the named step); new-rule re-run pending. n2-other-var: RED both. o1..o6: RED under old and RED under new, T3 each
  ("closed list" → "closed map"), o2 also behavioural: **nothing loosened**. h1..h4 GREEN both. g3, g4 RED both
  (behavioural). **g1-newline, g2-runner-only, b1-continuation, b2-indirection GREEN under both** (not loosened; open
  before and after D6).
- C6 chain2 (scratchpad/imgdigest/d6mut/batch-chain2.txt, from 01:56:42 UTC): b3-set-env (a new unit step with env
  ACTIONS_ALLOW_UNSECURE_COMMANDS: 'true' and run: echo "::set-env name=BODY::$(git log -1 --format=%B)") GREEN under
  new (4/4) and old (3/3). Skip worktree (behavioural test it.skip, uncommitted): none, g4-message, g3-no-verify each
  GREEN 3 passed / 121 pending: T3's "its test exists by name" (testTitles) accepts a skipped test, so with the test
  skipped nothing holds the bound. No guard against .skip in eslint.config.js or tools/test (grep). Full file, new rule,
  unmutated copy: 123 passed, 1 pending (SELF, skipped under CI_TREE), exit 0.
- C7 full file, new rule (01:57-01:59 UTC, logs/D6-1-new-all-<m>.log): none, g1-newline, g2-runner-only, h1-shift,
  h2-echo, h3-trailing, h4-indented, b1-continuation, b2-indirection: each 123 passed / 1 pending (SELF), exit 0.
  b3-set-env: red only for reasons other than D6 (the probe step lacked the unit job's if:, and local actionlint's
  "workflow command "set-env" was deprecated"); b3b-set-env-if (with the if:): with local actionlint (/usr/local/bin)
  only actionlint fails; with ACTIONLINT= (as on CI, which installs none; no workflow, tool or package script runs it:
  git grep) the whole file is GREEN (122 passed, 2 pending). new d6 n2-other-step-move (fixed): RED, T3 "ci.yml job unit
  step "Another step" run: … outside its closed map" and the behavioural test (no write in the named step).
- Verdict so far: (1) finding RED; (2) harmless h1-h4 GREEN; (3) old red cases o1-o6 still RED, admitted set new ⊆ old
  (exact line matches the old regex; same filter; same name set for env.X) → not loosened; (4) docs overclaim (see
  issues). Open: g1 (N2's newline input via the script), g2, the it.skip title check, b1/b3 (pre-existing).
- C8 prototype of the fix (in the skip worktree, uncommitted, never pushed): whole-file assertion in the behavioural
  test + fingerprint 4294b64f in the map entry checked in T3; run on none/g1/g2/h2 next.
- C8 result (prototype, scope d6; diff saved as scratchpad/imgdigest/d6mut/proto.diff, 9+/6-): none GREEN 4/4,
  h1-shift GREEN; g1-newline RED twice (behavioural "written": "ENGINE_FREEZE_BASE=<sha>\nBODY=third" and T3
  "ENGINE_FREEZE_BASE: re-read the bound against the changed script: expected 'a6875939' to be '4294b64f'");
  g2-runner-only RED (fingerprint 60863082); h2-echo RED (fingerprint; the trade N32 already accepts for run: rows).
- (4) docs: ADR 0066 N32 :1026-1028 and ci.md :441-442 describe the map as built (file, job, step, exact line, bound,
  test). Two overclaims: "A `$GITHUB_ENV` write is one entry of a closed map" (the code reads lines of run: scripts
  that name GITHUB_ENV: b1, b2, b3b pass) and "its bound, which the behavioural test … holds by running the step"
  (g1, g2 pass; a skipped test satisfies the title check). The test's own comment (:3056-3058, "every line of every
  workflow that names GITHUB_ENV") is accurate.
- C9 cleanup: worktrees -old and -skip removed, clone /home/user/fx-imgdigest-D6-1 removed, mutated trees removed
  (logs, reports, mutate.py, run.sh, digest.sh, proto.diff kept in scratchpad/imgdigest/). Nothing committed or
  pushed: wip still d257fe6d…, PR branch still 83167b8f… (git ls-remote).

## Steps (final)
- [x] clone, fetch, check out d257fe6d… (= origin/co-001/wip-ci-images-digest); install frozen
- [x] read D6 (a7ccead0…) and the rule at head
- [x] (1) finding RED (T3 + behavioural); second write, changed form, another step/job/file/variable RED
- [x] (2) harmless h1-h4 GREEN (scoped and full file)
- [x] (3) old red cases o1-o6 RED under both; new admitted set ⊆ old: not loosened
- [x] (4) docs: two overclaims (see C8)
- [x] remove clone
## DONE (verdict: finding's scenario fixed, not loosened; NOT fully resolved: g1, N2's own newline input, still green)
