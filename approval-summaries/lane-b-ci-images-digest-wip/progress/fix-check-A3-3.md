# Fix check round 3, area A3 (D5/D7, D6, D9, D10)
Started 2026-11-04. Live heads: wip 5c01f150..., PR 83167b8f..., claude/build-platform 4846f043... (moved past 21fa10df).
## Checks
- Clone at 5c01f150... (= origin wip); install ok. Area commits: f507f668, d6f70cb8, ae6a566d (D5/D7); bfc19c39, 9ca2b3d0 (D6); 0ad217aa (D9); 5c01f150 (D10).
- Whole workflows.test.ts at head: 124 passed (log A3-3-head.log).
- D9: runs 40652135443 (head 9ec30e1d..., run 204) and 40653896254 (head 83167b8f..., run 205) are #86's pull_request ci runs, both success: the entry's R1/R2 are right; wording "the first two, R1 (...) and R2 (...), and each later one through the merging head's run" reads clearly. OK.
- D10: tools/check-action-pins has cacheGates (reads composite with/defaults/if) and no byte bound anywhere: "never to bound a value" is accurate. ADR N32 and ci.md now scope to this repository's workflows. OK.
- Mutation batch (m1..m6) running; harness scratchpad imgdigest/a3/mut.sh.
- D5/D7 head-rule mutations (CI_TREE copies; logs A3-3-<m>.log). node:24 image also trips the digest test (unrelated), re-run pinned as m1*d.
  - m1 container.env DOCKER_BUILD_SUMMARY on ci.yml images: T5 red "container.env.DOCKER_BUILD_SUMMARY". m1lc lower case: T5 red. m1h container.env FOO: T5 green. m1expr container env as one expression: sum test red.
  - Triggers on release-capacity: pull_request_target, workflow_run, pull_request_review, [schedule, issue_comment], merge_group: T5 red each ("holds a build and runs on X"). m2h pull_request: T5 green (only release-capacity's own trigger test red, by design).
- D6: m4shell (step shell) T3 red at jobs.check.steps[5].shell; m4jobdef (job default shell) T3 red (+T6 fingerprint).
  - m4wfdef (workflow default shell) T3 red; m4rfc (_RUNNER_FILE_COMMANDS in run, upper case) T3 red; m4if (if: names GITHUB_ENV) T3 red.
  - m4built GREEN: run: echo "X=$V$V$V" >> "${GITHUB_OUTPUT%/*}"/set_env_${GITHUB_OUTPUT##*set_output_} (V from vars.A) passes all 123. Runtime-built path, the documented exception; but it names a runner file-command file (set_env_), against "anything naming the runner's file command files ... is refused". SHOULD (refuse set_env_/add_path_ text too, or reword).
  - m6script GREEN: tools/probe.sh writing BODY=$(git log -1 --format=%B) to $GITHUB_ENV, run by `bash tools/probe.sh`: passes all 123. No repo-wide scan; ADR "Nothing else names it" and the exception list (run-time name, another interpreter) omit a file the step runs. Today only ci.yml:289 and check.test.ts name GITHUB_ENV (git grep). SHOULD.
- D6 $GITHUB_PATH: m5run (run: write) T3 red; m5env (env value) T3 red; m5cmt (comment line naming it) T3 red (conservative, same as GITHUB_ENV).
- Next: second batch (m1*d pinned image, o1-o7 old red cases), trial merge, a5bc1170 graft batch, container options probe.
- Trial merge: git merge-tree --write-tree 5c01f150 with origin/claude/build-platform 4846f043... clean (tree 3183f8c1...; only .github/dependabot.yml differs among CI files); whole workflows.test.ts with CI_TREE=merged tree: 123 passed, 1 skipped (the CI_TREE recursion test). PASS.
- Second batch, head rule, pinned image: m1d T5 red; m1lcd T5 red; m1hd (container env FOO) all green; m1exprd sum test red.
  - m1opt GREEN: images job `container: { image: <pinned buildkit>, options: '--env DOCKER_BUILD_SUMMARY=false' }` passes all 123. docker create's --env (or --env-file) sets the container's env, which every docker exec'd step (build-push-action is a node action, run in the job container) inherits: the f507f668 gap stays open by another spelling. SHOULD. m1opth (options --cpus 2) green.
  - Old red cases at head: o1 (build missing BUILDX_METADATA_PROVENANCE), o2 (extra DOCKER_BUILD_SUMMARY), o3 (RECORD_UPLOAD 'true'), o4 (job env DOCKER_BUILD_SUMMARY) T5 red; o6 (unlisted GITHUB_ENV write) T3 red; o7 (job env ACTIONS_ALLOW_UNSECURE_COMMANDS) T3 red. o5 script broke (quoting), re-run.
- a5bc1170-rule graft batch running (tools/test/workflows-a5.test.ts, local untracked copy): m1d GREEN under a5 (red-before proven).
- a5bc1170 rule (graft): m1d, m4shell, m4jobdef, m5run, m5env all green; m2prt, m2rev red only on release-capacity's own trigger test, T5 green: every repair-2 claim in my area was red-before, red-after. o1-o5 red under a5 too (T5), and at head (above): not loosened. o6/o7-a5 and o5/m3count at head pending (heavy lock held by another session).
- o5 (Docker/Build-Push-Action/.@ spelling, no env) red at head and under a5; o6/o7 red under a5 and at head. Not loosened.
- m3count (a uses: key inside the build's with:): "release-capacity.yml: 1 build parsed (...), 2 uses: keys at lines 68, 76" as d6f70cb8 says.
- Docs: ADR N32 / ci.md triggers, container env, GITHUB_ENV/GITHUB_PATH wording match the code, apart from the two gaps above (container options --env; set_env_ by built path / a repository script the step runs).
## Result
- Issues: SHOULD container options --env (m1opt); SHOULD runner file-command file named by a built path, and a repository script writing $GITHUB_ENV (m4built, m6script): code or wording. Everything else in A3 confirmed.
- Clone removed. Next: repair round takes the two shoulds.
