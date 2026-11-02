# fix-check D7-1 (adversarial verify of D7: DOCKER_BUILD_RECORD_UPLOAD off on pull-request runs)

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D7-1 (read only, never pushed).
Disposition (security S3; CI N5; design §12 P2): all seven build-push-action steps add
DOCKER_BUILD_RECORD_UPLOAD: "${{ github.event_name != 'pull_request' }}" beside BUILDX_METADATA_PROVENANCE: disabled
(one-line flow map kept); release/push keep the default upload; T5 asserts it; docs: ADR N32 "The builds", ci.md,
reconciliation-001 one clause; P2 (provenance-add-gha=false) stays a proposal. Premise: v7.4.0 (c3c9e263…) reads the
variable, 'false' off, 'true' on; nothing reads .dockerbuild; release/dry-run stay equal; T3 admits; D3 sums.

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d…, confirm = origin/co-001/wip-ci-images-digest
- [x] pnpm install --frozen-lockfile
- [x] read D7's commit (19cc7bf5…) and T5 at head
- [x] premise: build-push-action c3c9e263… source (DOCKER_BUILD_RECORD_UPLOAD, parseBool)
- [x] (1) finding's scenario red (step without the var / value that uploads on PR)
- [x] (2) harmless variants green
- [x] (3) b2a41a00 red cases still red
- [x] (4) documents match code
- [x] remove clone

## Log
- C0 (01:58 UTC) heads (git ls-remote): wip d257fe6d…, PR branch 83167b8f… (= refs/pull/86/head), build-platform
  43565235…, #42 6c28d6a2…. Clone checked out detached at d257fe6d… (= origin/co-001/wip-ci-images-digest).
  pnpm install --frozen-lockfile exit 0 (logs/D7-1-install.log, 01:59 UTC). git status clean.
- C1 triggers of the five files with builds: ci (pull_request, push claude/build-platform), release-dry-run
  (pull_request paths, push paths), screening-capacity (schedule, workflow_dispatch, push paths, pull_request),
  release-capacity (schedule, workflow_dispatch), release (push tags v*). No pull_request_target, merge_group or
  workflow_call anywhere (grep), so `github.event_name != 'pull_request'` is 'false' exactly on the pull-request runs.
- C2 read D7 (19cc7bf5…): 5 workflow files (seven builds' one-line flow map env gains DOCKER_BUILD_RECORD_UPLOAD:
  "${{ github.event_name != 'pull_request' }}"; comments), ADR N32 "The build record" + "P2, a proposal" bullets, ci.md
  (failure note + Changing CI), reconciliation-001 clause, workflows.test.ts (T5 title renamed + one expect: every
  parsed build's step.env.DOCKER_BUILD_RECORD_UPLOAD equals the exact string, failures listed by "<file> <job> <step>").
  Nothing removed from the test file by D7 (diff: 1 title line changed, 6 lines added).
- C3 premise at the pin (MCP get_file_contents refused docker/build-push-action: "not configured for this session"; no
  new network read made: read the builder's existing blobless fetch, scratchpad/imgdigest/src-bpa, offline).
  `git hash-object` of its saved main.ts.txt / index.cjs.txt = be43b360… / 4294ed03…, exactly the blobs of src/main.ts
  and dist/index.cjs in c3c9e263…'s tree (ls-tree); action.yml (blob 7a1a94d4…, in the local pack) runs: node24,
  main and post both dist/index.cjs; package.json pins "@docker/actions-toolkit": "0.100.0".
  src/main.ts:274-279 buildRecordUploadEnabled(): env set → Util.parseBool(env), else true; post (:193-227): only when
  isSummarySupported; export always (record written on the runner), GitHubArtifact.upload only if enabled, then
  writeBuildSummary({uploadRes: undefined}); catch → core.warning. dist/index.cjs: KVt() same body, post the same
  (`t&&(i=await nP.upload(...))`). Bundled parseBool: 1,t,T,true,TRUE,True → true; 0,f,F,false,FALSE,False → false;
  undefined → false; else throws "parseBool syntax error" (inside the post's try → warning, nothing uploaded).
  Runner v2.338.2 (scratchpad/s3src/runner): ActionRunner.cs:128-136 registers the post with the same Action object;
  StepsRunner.cs:120-128 evaluates actionStep.Action.Environment for every step, post included, after the global
  (GITHUB_ENV) env, so the step's env reaches the post step and overrides a GITHUB_ENV value. PREMISE HOLDS.
- C4 D3 sum by hand: "DOCKER_BUILD_RECORD_UPLOAD" 26 + "=" + NUL + max(BOOLEAN 5, event_name 64, 'pull_request' 12) =
  92 bytes (binary case, :3372-3375); the real value is "true"/"false" (≤5), so the bound is sound.
- C5 harness (02:1x UTC): scratchpad/imgdigest/d7mut/ (mutate.py SRC DEST NAME; run.sh RULE LABEL SRC SCOPE M...;
  summary.py from d5mut). Old-rule worktree /home/user/fx-imgdigest-D7-1/.old at b2a41a00… (inside the clone; frozen
  install exit 0, logs/D7-1-old-install.log). Mutations: r-strip-all (b2a41a00's env on the new tree), r-one-release,
  r-true, r-inverted (==), r-target ('pull_request_target'), r-empty (""), r-retention (N5's RETENTION_DAYS "7"
  instead), r-bool-false (unquoted false: release loses its record), r-dup-key (second key "true"), r-lowercase (name in
  lower case), r-eighth-bare (8th build, provenance only); harmless h-block (block map), h-order, h-squote (YAML
  single-quoted), h-eighth (8th build with both), h-comments (D7's comments removed), h-retention-extra (RETENTION_DAYS
  "7" beside), h-job-env (images job env DOCKER_BUILD_RECORD_UPLOAD "true", the step's own env overrides it); probes
  p-summary-off (release build step DOCKER_BUILD_SUMMARY "false"), p-job-summary-off (release build job env); old T5's
  red cases o-no-prov-one, o-Disabled, o-bake, o-metadata-file, o-provenance-text. Every mutation dry-run built.
  Batch (scope t5) started ~02:15 UTC: scratchpad/imgdigest/d7mut/batch-t5.txt, logs/D7-1-<label>-t5-<m>.log.
- C6 "nothing reads a record": every actions/download-artifact step (8, ci/mutation/release-dry-run/release) names
  `name:` or `pattern:` (web-build, mutation-*, image-*, image-web, image-worker, image-web-production,
  screening-capacity-${{ github.ref_name }}); none downloads all. The record's artifact name is
  `<owner>~<repo>~<REF6>.dockerbuild` (toolkit exportFilename; R2's: PureTideWater~PhysicalTherapy~2HVOO3.dockerbuild),
  which matches no pattern. git grep for gh run download / actions/artifacts / dockerbuild / build record: only D7's own
  comments, docs and T5. The summary's record link is printed only when uploadRes is set (toolkit writeBuildSummary);
  nothing reads it. HOLDS.
- C7 retention, live (MCP actions_list list_workflow_run_artifacts, R2 ci 40653896254): the two .dockerbuild records
  (71,805 and 66,580 bytes) expire 2027-01-26T08:01:41Z, 90 days; playwright-1/-2 on 2026-11-04 (7 days). Both
  records are still live: D7 stops new pull-request uploads only; R1's, R2's and #42's records (and every other pull
  request run's since the builds were added) stay downloadable until they expire. Outside the files: a proposal.
- C8 runner: job env goes to Global.EnvironmentVariables (JobExtension.cs:236-246), step env merged after it
  (StepsRunner.cs:108-128), so a step's DOCKER_BUILD_RECORD_UPLOAD wins over a job's or a GITHUB_ENV write. action.yml
  has no post-if (default always()), so the post runs on a failed build too, with the same env.
- C9 T5 batch (new rule d257fe6d on new tree, scope t5), results so far: none GREEN; RED r-strip-all ([…(7)]),
  r-one-release, r-true ("ci.yml images Build the web image"), r-inverted, r-target, r-empty, r-retention,
  r-bool-false, r-lowercase, r-eighth-bare (each 1 named step); r-dup-key RED at parse ("Map keys must be unique at
  line 693"); GREEN h-block, h-order, h-squote. (rest running)
- C9 cont.: every red case fails at workflows.test.ts:4103 (D7's expect) and names exactly the mutated step(s)
  (logs/D7-1-new-t5-<m>.log.raw). GREEN h-eighth, h-comments, h-retention-extra, h-job-env. PROBES GREEN under T5:
  p-summary-off (release build step DOCKER_BUILD_SUMMARY "false": no export, no upload, the release's record gone) and
  p-job-summary-off (same at release's build job env): T5 holds the variable, not "the release keeps its record".
  Old T5 red cases on the new rule: o-no-prov-one, o-Disabled, o-bake, o-metadata-file RED. Added probes
  p-summary-both (release + dry run) and p-summary-ci (ci web) for the full-file batch (batch2.sh).
- C10 old rule (b2a41a00…) on the old tree, scope t5: none GREEN (1/121): the finding reproduced, the old T5 passes a
  tree whose seven builds upload on every pull request. o-no-prov-one, o-Disabled, o-bake, o-metadata-file,
  o-provenance-text RED under old; and RED under new (new :4097 provenance for the first two, :4108/:4109/:4110 for
  bake/metadata-file/text): nothing loosened. D7 kept the provenance expect ahead of its own (:4097 then :4103).
  .github unchanged after 19cc7bf5… (git diff 19cc7bf5..d257fe6d -- .github empty). asDryRun (:2404) spreads env, so
  the legs test compares release.yml's and the dry run's build env whole.
- C11 docs vs code (ADR N32 :993-1005, ci.md :153-154 and :442-446, reconciliation-001 :665, the five workflows'
  comments, T5's comment): each says what the code does. Checked: record content (S3's source reading), public + 90
  days (C7), "no retention is set" (no DOCKER_BUILD_RECORD_RETENTION_DAYS anywhere), still written on the runner and the
  summary without its link (toolkit writeBuildSummary prints the link only with uploadRes), release builds
  `provenance: false` (release.yml:116) and attest-build-provenance attests the capacity report only (:448-450),
  parseBool, P2 (buildkit.ts:23 DRIVER_OPTS = ^image=moby/buildkit:vX.Y.Z@sha256:<64 hex>$). Nits: (a) the five
  workflow comments say "anyone can read", the ADR, ci.md and T5 "any signed-in account"; (b) ADR/ci.md/T5 say "a
  push's and the release's keep the default": the code keeps it for every non-pull_request run, schedule and
  workflow_dispatch included (release-capacity, screening-capacity), and release-capacity's and release.yml's comment
  "so a pull request's run uploads none" is vacuous there (neither runs on pull_request; release.yml carries it for the
  dry run's equality).
- C12 T5 batch done (02:05:43-02:10:50 UTC, batch-t5.txt). Old rule on old tree with D7-style values inserted:
  r-true GREEN, r-target GREEN (the old T5 never read the variable). Full-file batch (batch2.sh -> batch-all.txt,
  logs/D7-1-new-all-<m>.log): none, h-*, r-strip-all, r-one-release, p-summary-off, p-summary-both, p-summary-ci.
- C13 full-file batch (02:10:51-02:29:37 UTC, batch-all.txt): none 123 passed / 1 skipped (the Dependabot SELF test,
  skipped under CI_TREE): actionlint 1.7.7, T3 "admits into a step's environment…", the D3 sum "keeps every
  environment string…" and the dry run's legs test all pass at d257fe6d…. GREEN (123/124 each): h-block, h-order,
  h-squote, h-eighth, h-comments, h-retention-extra, h-job-env. RED: r-strip-all (T5 :4103 only; release and dry run
  stay equal), r-one-release (T5 :4103 and the legs test :2461: held twice). PROBES: p-summary-off (release only) RED
  through the legs test (:2461) only; p-summary-both (release + dry run, DOCKER_BUILD_SUMMARY "false") and p-summary-ci
  (ci web) GREEN on the whole file: nothing holds "a push's and the release's keep the default" against a second
  variable (DOCKER_BUILD_SUMMARY false skips export and upload, main.ts:171-186/:193). Not the finding's direction
  (no pull-request exposure); an improvement inside #86's files: T5 could hold each build's env to exactly the two
  keys and refuse DOCKER_BUILD_* in any workflow or job env.
- C14 result: D7 RESOLVED (premise holds at the pin; finding red; harmless variants green; old red cases red; docs
  match). Not loosened. Issues: P-summary gap (low), wording nits (C11 a, b), existing records live until 2027-01-26
  (proposal outside the files).
- C15 (02:3x UTC) clone removed (worktree .old removed first; nothing pushed). Remote refs re-read: wip d257fe6d…,
  PR branch 83167b8f… (unchanged). Kept: scratchpad/imgdigest/d7mut (scripts, reports, trees) and logs/D7-1-*.
## DONE
