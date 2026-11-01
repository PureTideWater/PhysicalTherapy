# Review (CI and test infrastructure) of PR #86 at WIP head b2a41a00… — progress

Started 2026-11-01 (after 17:47 UTC). Clone: /home/user/review-imgdigest-ci-infra (detached at b2a41a00, clean).
Install: `flock … pnpm install --frozen-lockfile` exit 0. Scratch: /tmp/rci-data (logs), /tmp/rci-scripts, /tmp/rci-src
(runner v2.338.0, buildx v0.38.1, build-push-action c3c9e263 blobless sparse checkouts).

## Checked
- Read: status file, merge.md, merge-check-1.md, design (all 1,205 lines), whole diff bce57f16..b2a41a00 (9 files,
  738+/18-; three-dot and two-dot identical since b2a41a00 contains bce57f16).
- R2 images log (job 122700187970): original_length 3,037 = lines read (complete). Metadata groups at log lines 983 and
  2555: 780 and 783 bytes, keys buildx.build.ref, containerimage.config.digest, containerimage.descriptor,
  containerimage.digest, image.name. Counts: buildx.build.provenance 0, "synthetic length-test row" 0, "Argument list
  too long" 0, github_event_payload 0, ##[error] 0. BUILT web sha256:326bb524… (line 2914), worker
  sha256:bca9c01c… (2940). Status file item CONFIRMED. Runner 2.338.0; buildx "v0.38.0 0dbe87f3" (v0.38.0 and
  v0.38.1 tags both peel to 0dbe87f3, same code); BuildKit v0.34.1. Step env shows BUILDX_METADATA_PROVENANCE: disabled
  (lines 468, 1499). Post steps still export+upload records: 70.12 KB (artifact 12800604026) and 65.02 KB (12800384581).
- Artifacts of run 40653896254: the two .dockerbuild records expire 2027-01-26 (90 days, repo default; build-push-action
  sets no retention), the playwright ones 2026-11-04 (7 days, workflow sets it). e2e ran 2 shards → repository.private
  false → public repo: any signed-in user can download the records.
- runner v2.338.0 StepsRunner.cs:113-138: step env evaluated before the condition; an env error fails the step and the
  condition is never evaluated (evaluateStepEnvFailed). FromJson.cs: JToken.ReadFrom on the string (''→throws).
  Template memory 10 MB (PipelineTemplateEvaluator.cs:52, passed as MaxMemory) → no memory issue.
- buildx v0.38.1: confutil/metadata.go exact "disabled" (or ParseBool false); provenance.go:26-28 returns early;
  build.go:980 still sets buildx.build.ref; commands/build.go:217-221 mode only with --metadata-file. Image export
  untouched. bpa main.ts:105 passes process.env to buildx; post step uses stateHelper.buildRef; record upload
  DOCKER_BUILD_RECORD_UPLOAD default true, retention DOCKER_BUILD_RECORD_RETENTION_DAYS unset → repo default.
- No repo tool writes GITHUB_ENV (git grep), only ci.yml:289.

## To do
- Mutation probes on T1–T6 (CI_TREE); citation drift probe; 131,072 arithmetic.
- merge-tree with #42 be63bdc2 + run tests on merged tree.
- Docs vs code; capacity/release-dry-run logs (provenance absent).

## Findings so far
- P2 candidate: build records kept 90 days on a public repo (vs the repo's 1/7/14-day CI artifacts), outliving any
  edit of the description; in-file fix possible (DOCKER_BUILD_RECORD_RETENTION_DAYS on the seven env lines).

## Update (mutation probes, batch 1; trees in /tmp/rci-trees, results /tmp/rci-data/probes)
- head 121/121 pass; base copy via CI_TREE 120 pass + 1 skipped.
- m1 METADATA back on web identity: T1, T2 (E2BIG "spawnSync bash E2BIG"), T3, T6 (66 vs 67) red. Good.
- m2 steps.Worker.outputs['METADATA'] on the browser step: T3 red. m3 github.event.pull_request.title in e2e env: T3 red
  (+ e2e exact-env pin). m3b `toJSON (github.event.head_commit)` in a run: T3 red (+ #82's token rule, T2).
- m4 drop env from screening-capacity worker build: T5 red. m7 job-level env instead of step: T5 red (by design).
  m8 `Disabled`: T5 red. m9 `Docker/Build-Push-Action@`: T5 red (lower-case match works).
- m5 eighth build-push-action step WITH the env (harmless): T5 red on toHaveLength(7) only -> harmless change fails (N).
- m10 whole metadata as a job output: T3 + T6 red.
- m11 `${{ vars.A }}${{ vars.B }}${{ vars.C }}` in one env string (3 x 48 KB = 147,456 > 131,072): T3 PASSES (only the
  unrelated e2e exact-env pin failed) -> per-expression bound, not per-string (N).
- m6 comment at top of every workflow: only the frozen publish-content test failed; T6 passed with every workflow
  citation off by one. m6b (frozen file untouched) running.
- #42 trial merge (merge-tree HEAD be63bdc2 -> tree 06b57e50, clean): .github and workflows.test.ts identical to HEAD;
  but #42 rewrites tools/screening-capacity/report.ts and run.ts, so T6's citations report.ts:835-838 (now 932-935),
  :635-639 (now ~692-696), :866-867 (now 963-964), run.ts:1036-1039 (now ~1092-1095) point at unrelated lines, and
  nothing fails -> S finding (T6 citations drift silently, even from non-CI PRs).
- Docs: reconciliation-001:665 cites (C1, C2), (C3, C4), (C5 to C8), (C11): labels of the out-of-repo design, defined
  nowhere in the repo (git grep C11 finds only this line); C11 is the red R0 run that never ran.
- Runner/buildx/bpa: release-dry-run worker build (job 122700187835, 2,116 lines complete) Metadata 815 bytes, no
  provenance; capacity job 122700247351 (1,948 lines complete) Metadata 784/787 bytes, no provenance; both builds'
  BUILT matched. release-dry-run runs ubuntu-24.04 with the same buildx 0dbe87f3.

## Update (batch 2, #42 merged tree, schema)
- m6b (comment line atop every workflow but the frozen publish-content.yml): workflows.test.ts 120 passed, 0 failed,
  1 skipped (= base) -> every workflow citation off by one, CI green. Silent drift CONFIRMED.
- m11 three vars in one env string: the N32 describe 4/4 pass (T3 admits it).
- Problem messages are precise (file, job, step, key, the expression).
- #42 trial merge (commit-tree of 06b57e50, worktree, pnpm install --frozen-lockfile exit 0): workflows.test.ts
  121/121 pass; the 4 report.ts/run.ts citations stale. #42 changes no bound (sizingQuestion/jobResult text same).
- actionlint 1.7.7 with the test's flags on all workflows: exit 0.
- Runner schema (workflow-v1.0.json at v2.338.0): step `shell` is non-empty-string (no expressions); context keys that
  reach a process are exactly what unboundedValueProblems visits. Sound.
- buildx is not pinned (no setup-buildx `version:`; runner image's 0dbe87f3); BuildKit pinned by digest.
- P2: (iv) provenance-add-gha=false is refused by #82's tools/check-action-pins/buildkit.ts:46 DRIVER_OPTS -> stays a
  proposal; retention (DOCKER_BUILD_RECORD_RETENTION_DAYS) is in-file.
- All 67 T6 rows parse; anchor-token pass over workflow citations: all correct at b2a41a00 (6 flagged were the cache
  `key:` lines, correct by the row's own wording).

## Findings (final list, to write)
- S1 T6 citations drift silently (workflows.test.ts:3267-3351, :3358): m6b, #42 merge, #82 merge's 27 ranges. Fix P6 now.
- N1 T5 toHaveLength(7) (:3374) fails a harmless eighth step with the env (m5).
- N2 T6 content-calendar check row (:3286) "under GitHub's 1 MB" false under UTF-16 (1,866,672 B); name the item.
- N3 reconciliation-001:665 dangling (C1..C11) labels; C11 = R0 never run.
- N4 T3 per-expression bound (m11) + ci.md:150-152 wording (per string incl. name/=/NUL; total ARG_MAX).
- N5 P2 retention 90 days public (in-file improvement) / provenance-add-gha proposal.
- (concur, not new) ADR:983-984 "took N29 to N31" wording (merge-check-1's nit).

## DONE
- Review written to approval-summaries/lane-b-ci-images-digest-review-ci-infra.md (not committed): verdict sound, no
  blocker; S1 (T6 citations drift silently), N1-N5, one concurrence.
- Clone /home/user/review-imgdigest-ci-infra, its trial worktree, and scratch (/tmp/rci-*) removed; nothing pushed.
