# fix-check D5-1 (adversarial verify of D5: T5 without the fixed count of 7)

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D5-1 (read only, never pushed).
Disposition: T5 first names builds whose env is not exactly `disabled`, then builds > 0 and parsed builds == raw
`uses: docker/build-push-action` lines; D7's DOCKER_BUILD_RECORD_UPLOAD asserted on every build the same way.

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d..., confirm = origin/co-001/wip-ci-images-digest
- [x] pnpm install --frozen-lockfile
- [x] read the D5 code (6adc518f...) and T5 at head
- [x] (1) finding's scenario (N1: harmless eighth build) and the failing variants
- [x] (2) harmless variants green
- [x] (3) b2a41a00 fixtures/red cases still red
- [x] (4) documents match code
- [x] remove clone

## Log
- C0 (01:36 UTC) heads (git ls-remote): wip d257fe6d…, PR branch 83167b8f…, build-platform 43565235…, #42 6c28d6a2….
  Checked out d257fe6d… (= origin/co-001/wip-ci-images-digest). pnpm install --frozen-lockfile exit 0
  (logs/D5-1-install.log).
- C1 read D5 (6adc518f…, test only, 5+/1-): toHaveLength(7) removed; builds without env BUILDX_METADATA_PROVENANCE ===
  'disabled' named first (toEqual([])); D7 (19cc7bf5…) adds the same named check for DOCKER_BUILD_RECORD_UPLOAD exact;
  then builds.length > 0; then builds toHaveLength(lines matching
  /^\s*(?:-\s+)?uses:\s*["']?docker\/build-push-action@/i over workflowFiles()). Both the parse and the lines read
  WORKFLOWS = CI_ROOT (CI_TREE honoured by both), so mutated-tree runs are valid.
- C2 old rule (b2a41a00…:3368-3380): toHaveLength(7) first, then the env named, bake-action, --metadata-file,
  buildx.build.provenance. New (d257fe6d…:4089-4111): env named, D7 named, >0, count == lines, the same three refusals
  verbatim. Disposition order matches. #82's formProblems (tools/check-action-pins/workflows.ts:95) already refuses
  an action not on a `uses:` line of its own (flow maps), so a flow-style build's count mismatch is not a new false red.
- (4) docs grep (ADR 0066 N32 :991/:997, ci.md :442, reconciliation-001 :665): each says "every
  docker/build-push-action step"; no document, workflow comment or test comment says "seven" builds. Docs match the
  count-free rule. (Caveat to test: "every" vs the test's prefix match `docker/build-push-action@`.)
- C3 harness (01:37 UTC): scratchpad/imgdigest/d5mut/ (mutate.py: copy CI_FILES of a source tree, apply one mutation;
  run.sh RULE LABEL SRC SCOPE(all|t5) M...; summary.py). Worktrees: /home/user/fx-imgdigest-D5-1-old (b2a41a00…, the
  previous rule and tree), /home/user/fx-imgdigest-D5-1-pre (9ac28806…, the rule just before D5), both installed
  frozen. Logs: imgdigest/logs/D5-1-<label>-<scope>-<mutation>.log. 23 mutations + none; dry-run built all on both trees.
  Timing check: new rule T5-only on new none and m5-eighth-env: both 1 passed (exit 0).
- C4 T5-only batch (01:38-01:46 UTC; d5mut/batch-t5.txt; logs D5-1-{new,old,pre}-t5-<m>.log):
  - new rule, new tree: GREEN m5-eighth-env (the finding), m5-eighth-dash, m5-eighth-newfile, m9b-case-env,
    comment-uses, block-env, swap-env, quoted-uses, remove-one; RED m5b-eighth-bare, m5c-eighth-no-record (D7),
    m4-drop-env, m8-Disabled, m9-case-bare, m7-env-to-job (each [Array(1)] to equal []), strip-all [..(7)], alias
    (length 6 but got 7), bake, metadata-file, provenance-text, run-text-uses (length 8 but got 7: a `uses:` line inside
    a run: heredoc; fails closed). dotpath-rewrite and dotpath-eighth GREEN (see C5).
  - old rule (b2a41a00…), old tree: m5-eighth-env RED "length of 7 but got 8" (the finding reproduced); m5b, m5c RED
    by count only; m4, m8, m9-case-bare, m7, strip-all, bake, metadata-file, provenance-text RED (all still red in new);
    alias GREEN (new is stricter); remove-one RED by count (new green: intended, no inventory);
    **dotpath-rewrite RED by count (6) under old, GREEN under new**.
- C5 POSSIBLE LOOSENING: `uses: docker/build-push-action/.@<same sha> # v7.4.0` with the env dropped. The runner
  (actions/runner v2.338.2 PipelineTemplateConverter.cs:629-645, local copy scratchpad/s3src/runner) splits on '@',
  then on '/' and '\' dropping empties: Name docker/build-push-action, Path "."; ActionManager.cs:1424-1426
  Path.Combine(dest, ".") loads the root action.yml. #82's PIN regex (tools/check-action-pins/workflows.ts:14) takes
  "/." as a path segment. On the mutated tree (worktree /home/user/fx-imgdigest-D5-1-mut): `pnpm actions:check
  --offline` exit 0 (logs/D5-1-mut-dotpath-rewrite-actions-check.log); actionlint 1.7.7 exit 0 with the repo's one
  ignored label message (logs/D5-1-mut-dotpath-rewrite-actionlint.log). T5's parse filter
  (startsWith('docker/build-push-action@')) and its line regex (docker\/build-push-action@) share one blind spot, so the
  count no longer catches a rewrite of an existing build that the old toHaveLength(7) did. Whole-file and tools-suite
  runs on it queued.
- C6 tools suite (unit project, `tools`, 82 files) with dotpath-rewrite of screening-capacity's worker build
  (logs/D5-1-mut-dotpath-rewrite-tools-suite.log, 01:43 UTC): 3 failed / 1280 passed, all in workflows.test.ts and
  not T5: "builds every image whose identity is checked with no attestation manifest…" (length 6 but got 5), the
  screening-capacity behaviour test (Dockerfiles built), and the Dependabot-rewrite self-test. So for THAT build the
  old count's catch is covered by other tests. Next: the same rewrite on each of the seven builds (dot:<file>:<n>),
  whole file, to find any build only the old count held. mut worktree restored (git checkout -- .github).
- C7 (1)+(2) whole file, new rule (d257fe6d…), CI_TREE copies: none 123 passed + 1 skipped (the self test that skips
  under CI_TREE); **m5-eighth-env (the finding, CI review tree m5) 123 + 1 skipped, exit 0**; m5-eighth-dash (`- uses:`
  first) 123 + 1. Pre-D5 rule (9ac28806…) on the same new-tree copies: m5-eighth-env and m5-eighth-dash RED "length of
  7 but got 8", so D5 alone turns the finding green.
- C8 prototype fix (scratch worktree /home/user/fx-imgdigest-D5-1-fix, never committed): T5 matches builds (and
  bake-action, and the raw lines) by the repository the runner resolves (split at '@', then '/' and '\' without
  empties, first two segments, lower case). tsc -p tools --noEmit exit 0 (logs/D5-1-fix-tsc.log). T5-only runs on
  every mutation plus dot:<file>:<n> for each build queued (d5mut/batch-fix.txt).
- C9 (3) whole file, every old red case (01:45-01:52 UTC; d5mut/batch-all.txt, batch-dot.txt):
  - new rule: m5b, m5c RED (T5 only, naming "release-capacity.yml capacity Build the worker image a second time");
    m4/m7/m8/m9-case-bare RED naming "screening-capacity.yml capacity Build the worker image"; strip-all names all
    seven; bake/metadata-file/provenance-text RED; alias RED (T5 count + 3 others); remove-one RED (release-capacity
    and headless-shell behaviour tests: removal is held by those inventories, not T5 now).
  - dot:<file>:<n>, each of the seven builds rewritten to docker/build-push-action/.@<sha> with its env dropped: each
    RED in the whole file under the new rule (2 to 5 behaviour tests each: "builds every image whose identity is
    checked with no attestation manifest" length 6 got 5, the images/scan, release, dry-run, capacity tests; ci.yml's
    also T6), since usesAction (workflows.test.ts:257) is a case-sensitive `docker/build-push-action@` prefix and the
    rewritten build vanishes from each inventory. So no old red case turns green in the file; the old count's
    incidental catch of a rewrite is held by those tests. (tools suite on the screening worker rewrite: same 2 + the
    Dependabot self test, C6.)
  - Harmless, whole file, new rule: m5-eighth-env, m5-eighth-dash, block-env, swap-env, comment-uses green (123 + 1
    skipped). m9b-case-env and quoted-uses red by OTHER tests (usesAction's case; #82's pin form rule), same as old.
    m5-eighth-newfile red by the runner/timeout/digest tables (a new file must join them), not T5.
  - Prototype fix (C8), T5 only: same red set as d257fe6d's plus all seven dot:* and dotpath-eighth RED naming the
    step; all harmless variants and none GREEN (logs D5-1-fix-t5-*.log).
- C10 gap shared by old and new T5 (not a loosening): a NEW build spelled docker/build-push-action/.@<sha> without the
  env. Testing a tail build no behaviour test positions (tail-* mutations) under new, old and fix rules.
- C11 tail-* (a build placed where no behaviour test positions it: release-capacity's last step, web Dockerfile,
  outputs type=cacheonly), whole file (d5mut/batch-tail.txt):
  - tail-plain-env (another harmless eighth build): new GREEN 123+1; old RED "length of 7 but got 8". Finding fixed.
  - tail-plain-bare: new RED, T5 alone.
  - **tail-dotpath-bare** (`docker/build-push-action/.@<sha> # v7.4.0`, no env): new GREEN 123+1 AND old GREEN 120+1.
    A gap T5 had before D5 and still has (not a loosening): the parse filter and the line regex share the
    `docker/build-push-action@` prefix. The runner runs it (C5). Prototype fix: RED naming "release-capacity.yml
    capacity Warm the web image's layers"; fix none, tail-plain-env, m5-eighth-env GREEN 123+1.
    Patch: d5mut/t5-repository-match.patch (scratch, never committed).
- C12 live heads (01:55 UTC): of 98 co-001 heads + #42 (6c28d6a2…), those changing any workflow vs their merge base
  with d257fe6d…: main-dependabot-template (main lineage, not #86's base), pr-06b-mail-streams/#42 and the pr42
  integrate refs (ci.yml, no build line touched), wip-ci-findings-transport (content-calendar.yml), wip-ss01-chain
  (ci.yml, no build line). ss-01-suspension-refusal (efb20704…) and suite-cap-1-triage-locks (ce408d2f…) touch no
  workflow. Trial merges HEAD+#42 and HEAD+wip-ss01-chain: 7 build lines each; T5 on each merged tree (CI_TREE) 1
  passed (logs/D5-1-merge-{pr42,ss01}-t5.log).
- C13 T5 on the repository itself at d257fe6d… (no CI_TREE, 01:57 UTC): 1 passed (logs/D5-1-repo-t5.log).
- C14 cleanup (02:00 UTC): worktrees old/pre/mut/fix removed, clone /home/user/fx-imgdigest-D5-1 removed, scratch
  trees removed; harness, reports, logs and the patch kept under scratchpad/imgdigest/d5mut and logs/.

## Verdict
D5 RESOLVED: the finding's tree (a harmless eighth build with the env) is green in the whole file at d257fe6d… and
red at b2a41a00… and at 9ac28806… (D5 alone fixes it); a build without either env is named; >0 and the line count hold;
every b2a41a00 red case is still red in the whole file. Not loosened. Docs say "every docker/build-push-action step",
as the code holds. Proposals (not D5 regressions): (a) match builds by the repository the runner resolves, closing a
pre-existing gap where `docker/build-push-action/.@<sha>` without the env passes old and new (patch dbe30ee1…);
(b) a message on the count assertion; (c) count `uses:` keys from the YAML document, not raw lines, so a `uses:` line
inside a run: script is not a false red.
