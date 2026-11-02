# fix-build: the fix round's build for PR #86 (ci-images-digest)

Worktree /home/user/ci-images-digest, started 2026-11-01 at WIP head b2a41a00… (first run; no earlier fix-build file).
Red/green: <id>-green.log = a run that passed (normally the b2a41a00 rule on the mutated tree), <id>-red.log = a run that
failed (normally this round's rule); D1-shift/D1-output/D5-eighth* are named old-/new- as noted.
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/

## Steps
- [x] 0 base merge + generators (21:15 UTC): `git merge --no-ff origin/claude/build-platform` (43565235, first-parent
  brings only #83 UX PR 4; 27 files, none of #86's 9 and none T6 cites) = **29251dbb** (no conflict; message amended
  before any push to add the body and trailer). Generators on the merged tree: `pnpm install --frozen-lockfile` 0,
  `pnpm exec tsx tools/screening-capacity/watched.ts --write` "541 lines", `pnpm synth --all` "0 file(s) written, 657
  unchanged" and "0 written, 16 unchanged"; git status clean: **no generator commit** (watched-paths.txt's two #83
  lines, table-parts.tsx and stacked-rows.tsx, came with the merge). Logs 0-install.log, 0-watched.log, 0-synth.log.
- [x] D1 structural refs: **8681adb9** (test + ADR N32 bullet + ci.md "Changing CI"). Refs {step run-fingerprint |
  uses-action, output, matrix, needs, symbol (TS parser), test (title)}; refProblems; fixture test "resolves each
  row's producers by name…". All rows' symbols/tests also resolve on #42 6c28d6a2, SS-01 efb20704, suite-cap-1 ce408d2f.
  Red/green (logs/, ~21:30 UTC, -t "hands a step another step"): D1-run (range's echo of a commit message) old
  green / new red "fingerprint 5eb0a3d1, not 4dccf1d2"; D1-id (db runner-image id renamed) old green / new red "job
  db has no step runner-image"; D1-symbol (report.ts sizingQuestion renamed in place, restored) old green / new red
  "declares no sizingQuestion"; D1-shift (comment line atop every workflow) old green / new green (no churn);
  D1-output (sizing output removed) old red (set) / new red. eslint + tsc -p tools clean.
  Suite (21:29 UTC, logs/suite-D1.log): 32 files, 457 passed. WIP ref pushed b2a41a00..8681adb9 (hook: 2 commits
  checked, gitleaks clean; logs/push-D1.log).
- [x] D2 keys: **330deea0** (separate from D3: separable). keys() walk over the whole parsed file in
  unboundedValueProblems, "<file> <path>: an expression in a key"; T4 fixtures: workflow/job/step/container/services
  env, step with:, plus job outputs, reusable with:/secrets: (rule refuses those too). ADR N32 "What holds it" + ci.md.
  Red/green (~21:33 UTC, -t T3 "admits into a step’s environment…"): D2-key (ci.yml "The images' directory" env key
  = the description) old green / new red "ci.yml jobs.images.steps[2].env.${{ github.event.pull_request.body }}: an
  expression in a key". Suite 32/457 (suite-D2.log). Pushed 8681adb9..330deea0.
- [x] D3 per-scalar sum: **c1e80912**. environmentProblems (workflow/job/container/services/step env, step with: as
  INPUT_<NAME>); BOUNDED_GITHUB now a Map to bytes; row `bytes` field on all 67 rows; new it "keeps every environment
  string a workflow sets under 131,072 bytes…" (real workflows: 378 strings, largest under limit 49,191; fixtures).
  Binary ops count every operand (parser has no precedence). Docs: ci.md E2BIG sentence + "Changing CI"; ADR Why + sum
  bullet. Red/green (~21:41 UTC, -t "one environment string"): D3-vars old green (4 passed) / new red "NOTES=… is up to
  147463 bytes"; D3-chain (job env A = vars.A vars.B, step env B = env.A vars.C) old green / new red "B=… 147459".
  Suite 32/458. Pushed 330deea0..c1e80912.
- [x] D4 sites: **9ac28806** (test only; the ADR's over-limit sentence gets "held to its one use" in D8's commit, same
  sentence). FoundValue.where; BoundedValue.sites on both findings rows; refProblems checks exact sites; T6 requires the
  over row's sites; FINDINGS_B64 name pin replaced. Fixture it "holds a row with sites to exactly those places…".
  Red/green (~21:46 UTC, -t "one environment string"): D4-copy (critic m-a2: notify step FINDINGS_COPY appended) old
  green (4 passed) / new red T6 "read at … "Keep a copy" env.FINDINGS_COPY, … not exactly at its sites". Suite 32/459.
  Pushed c1e80912..9ac28806.
- [x] D5 T5 count: **6adc518f**. T5: builds without env named first; >0; parsed builds == lines matching
  /^\s*(?:-\s+)?uses:\s*["']?docker\/build-push-action@/i. Trees (~21:50 UTC, -t "sets BUILDX_METADATA_PROVENANCE"):
  D5-eighth (8th build with env) old red "7 but got 8" / new green (the fix); D5-eighth-bare (8th without env) old red /
  new red naming it; D5-alias (screening worker build replaced by `- *web` alias: parsed 7, lines 6) old green / new red
  "length of 6 but got 7" (D5-alias-green.log / -red.log). Suite 32/459. Pushed 9ac28806..6adc518f.
- [x] D6 GITHUB_ENV map: **a7ccead0**. GITHUB_ENV_WRITES {ENGINE_FREEZE_BASE: ci.yml/unit/"The engine freeze's
  base"/exact line, bound text, test "gives the differential test …, through GITHUB_ENV"}; per-file count; T3 asserts each
  entry written exactly once and its test exists. ADR + ci.md. Red/green (~21:55 UTC, -t T3): D6-value
  ($(git log -1 --format=%B)), D6-second (line twice), D6-other (write in images' "The images' directory"): each old
  green / new red. Suite 32/459. Pushed 6adc518f..a7ccead0.
- [x] D7 record upload: **19cc7bf5**. Premises verified, no fallback: build-push-action c3c9e263… src/main.ts post
  step buildRecordUploadEnabled() = Util.parseBool(env) when set, else true, upload only when true (blobless fetch of
  the pin into scratchpad/imgdigest/src-bpa, the MCP refuses repos other than ours); dist/index.cjs same; toolkit
  0.100.0 parseBool true/false (+1,t,T,TRUE,True / 0,f,F,FALSE,False), else throws (caught → warning). No reader of
  .dockerbuild (download-artifact names/patterns; git grep). release/dry-run equality test green; T3 admits; sum 92 B.
  Seven steps' one-line flow map env + comments; T5 asserts exact value; ADR "The build record" + P2 bullet; ci.md
  Changing CI + images failure note; reconciliation clause. Red/green (~22:00 UTC, -t T5): D7-one (screening worker
  build without it) and D7-pr-true (ci.yml web "true") each old green / new red naming the step. actionlint clean.
  Suite 32/459. Pushed a7ccead0..19cc7bf5.
- [x] D8 UTF-16 wording: **91910da1**. check row reworded as the disposition (no over:); T6 asserts 2·FINDINGS_BYTES
  = 1,866,672; ADR over-limit sentence names ci-findings-transport, its job output (UTF-16), and "held to the one place
  each job reads them" (D4's docs). Red/green (in place, MAX_FILE_BYTES 760_000, restored): D8-bound old green / new red
  "expected 2026672 to be 1866672". (Suite + push shared with D9, see below.)
- [x] D9 reconciliation labels: **d5f987a4** (docs only): (C1, C2) (C3, C4) (C5 to C8) (C11) removed; runs named R1 ci
  40652135443, R2 ci 40653896254; ADR pointer kept. Suite at d5f987a4 (covers D8): 32/459. Pushed 19cc7bf5..d5f987a4.
- [x] D10 scope docs: **f89770ca** (docs + the describe's header comment): scope sentence in ADR "What holds it" and
  ci.md "Changing CI" (names "the rule and its list"/"the value rule and its table", not the design's T3/T6); the two
  paragraphs D2 edited rewrapped to width. Suite 32/459. Pushed d5f987a4..f89770ca. Proposal for #82: parseActionMeta
  (tools/check-action-pins/verify.ts:44) to keep composite env/run and apply the value rule.
- [x] Improvement (inside #86's files): **d257fe6d** ADR N32 "whose Part 5 notices, N23 to N31, include an N29 of
  their own" (merge-check-1's nit). Suite 32/459. Pushed f89770ca..d257fe6d.
- [x] 3 final checks at d257fe6d… (exact UTC in each log's first line): pnpm typecheck passed (22 projects, 22:00 UTC);
  pnpm lint passed (1,680 files, 3 groups, 0 errors 0 warnings); pnpm lint:logs (1,087 files, allowlisted); actionlint
  1.7.7 with the test's flags exit 0; pnpm actions:check --offline passed (offline rules). Last suite 32 files / 459.
- Live heads (22:05 UTC): merge-tree of d257fe6d with #42 6c28d6a2, suite-cap-1-triage-locks ce408d2f and SS-01
  efb20704 each clean, .github and workflows.test.ts identical to HEAD's on each merged tree (so no fingerprint moves);
  every symbol and test the rows name exists on all three heads.

## DONE: head d257fe6d… = co-001/wip-ci-images-digest (PR branch still 83167b8f…, not pushed). Worktree clean.
