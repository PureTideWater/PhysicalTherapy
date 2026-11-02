# Fix check D1, round 2 (adversarial verifier)

Disposition: D1 (structural refs replace line numbers in BOUNDED_VALUES; run: fingerprints; symbol refs; resolver fixture).
Head under check: a5bc1170... (repair round 1), WIP ref co-001/wip-ci-images-digest.
Clone: /home/user/fx-imgdigest-D1-2 (read only, removed at end).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D1-2-*

## Status
- [ ] clone + install
- [ ] (1) finding's failing scenario now red
- [ ] (2) harmless variants green
- [ ] (3) nothing loosened (b2a41a00 fixtures)
- [ ] (4) documents match code
- [ ] (5) trial merges with live heads
- [ ] clone removed

## Log
- (04:08 UTC) ls-remote: wip-ci-images-digest = a5bc1170... (= report), PR branch and refs/pull/86/head 83167b8f...,
  claude/build-platform 88708069... (moved since R1's 877e662f...), refs/pull/42/head 9426a8d1....
  Clone checked out a5bc1170 detached (= origin/co-001/wip-ci-images-digest). pnpm install --frozen-lockfile exit 0
  (D1-2-install.log). Baseline whole tools/test/workflows.test.ts: 124 passed, exit 0 (D1-2-base-whole.log).
  Harness: scratchpad/imgdigest/D1-2/scripts/vt.sh LABEL TREE FILTER (CI_TREE copies under D1-2/trees/).
- (04:25 UTC) (1) RED on CI_TREE copies, T6 alone (-t "only from the list below"; logs D1-2-t6-<mutation>.log, mutations
  in scratchpad/imgdigest/D1-2/scripts/mutate.py; each mutation asserts it matched): every one RED, the base GREEN.
  r_range_script "has a changed script, env, shell or working-directory, fingerprint e9d68655, not 1fe2d7a2";
  r_range_s2_2 (S2-2, commit message in the range output) fingerprint 24e893e8; r_range_shell 317af17e; r_range_wd
  72580e15; r_db_id_renamed_only "job db has no step runner-image" (x2); r_db_id_renamed (readers moved too) by the set
  comparison; r_sizing_output_renamed "job capacity declares no output sizing"; r_sizing_output_removed and
  r_sizing_output_repointed by the set comparison (capacity's sizing no longer read); r_sizing_output_joined (G3) and
  r_advisories_doubled (G5) "... is "<both>", not one step's or needed job's output alone"; r_identity_env_both (G1c)
  18 rows fingerprint ad28f365 + "writes no <name>=... its own lines spell none"; r_matrix_worker_renamed (G1b) 3
  rows "writes no sha256_worker= ..."; r_tsc_cache_action (M8) "uses actions/cache, not actions/cache/restore";
  r_runner_image_after_reader "does not come before the step that reads it"; r_need_removed "job gate does not need a
  job capacity" (2 rows). Batch output: D1-2/red1.txt.
- (3) by title and expect() text, b2a41a00 vs a5bc1170 (D1-2/scripts/expects.mjs, D1-2/expects.txt): 117 old tests,
  111 bodies identical, 5 changed, 1 renamed (T5, D7's). Old T6's expects missing in new: the file:line regex
  (inverted by D1, by design) and the FINDINGS_B64 env pin (replaced by sites, D4; mutations below). Other missing
  expects are D6's (the differential test now checks `written`, the whole GITHUB_ENV file, in place of `base`) and
  D4's/D6's fixture reshapes (old T3 cases re-expressed: values carry where/step; GITHUB_ENV writes now a closed map).
- (04:35 UTC) more T6 runs (D1-2/red2.txt, green1.txt): RED r_range_env_secret (range env BEFORE gains github.sha)
  fingerprint db8ddcdc; r_findings_env_renamed and r_findings_second_reader "not exactly at its sites" (the old
  FINDINGS_B64 pin's red cases stay red through D4's sites). GREEN (parsed equal to the head, checked with
  D1-2/scripts/same.mjs): comment atop all 10 workflows; a comment (and blank line) above 42 id'd steps; S2-1 five
  comment lines at ci.yml:21; the range step's keys reordered; comments between the identity steps' keys; a harmless
  new step above db's runner-image. GAP PROBES T6 GREEN: r_job_env_imageversion (db job env ImageVersion:
  ${{ vars.RUNNER_PIN }}, which the runner-image script reads: fingerprint is the step's own env only);
  r_wf_defaults_shell (ci.yml defaults.run.shell sh); r_release_defaults_shell (release.yml's); r_shards_repoint_keep
  (mutation's shards output hands packages, 256 <= 1,024, shards still read in a new step). Whole-file runs next.
- (04:45 UTC) (2) GREEN also: g_range_env_reordered_flow (range env as a flow map, keys reversed) and
  g_comment_above_every_step (a comment and a blank line above all 297 steps of the 10 workflows), both parsed equal.
  Whole-file runs of the gap probes (D1-2/whole1.txt, whole2.txt): r_job_env_imageversion red only by the db job's
  pinned env test; r_wf_defaults_shell red only by ci.yml's bash-with-pipefail test; r_release_defaults_shell (release.yml
  default shell sh under the fingerprinted identity and image producers) WHOLE FILE GREEN 123+1 skipped;
  r_shards_repoint_keep red only by the mutation workflow's pinned outputs test; r_wf_env_largezip (large-zip.yml
  workflow env ImageOS: ${{ vars.RUNNER_OS_NAME }}, which its runner-image producer reads; rows bound key/os at 256
  bytes, a variable is 48 KB) WHOLE FILE GREEN 123+1 skipped. Finding: the fingerprint covers the step's own env,
  shell and working-directory, not the workflow's or job's env and defaults the script also runs with.
- (04:55 UTC) whole file GREEN also for r_job_env_unit (ci.yml unit job env ImageVersion: ${{ vars.RUNNER_PIN }}) and
  r_job_env_capacity (screening-capacity capacity job, the same): CONFIRMED gap, inherited env (D1-2/whole3.txt).
  Table probes (copy of the test file as tools/test/zz-d12-probe.test.ts, deleted after; status clean;
  D1-2/tableprobe.txt): a row's refs are not tied to its own value's producer. TB2 (db's runner-image key row cites
  runnerImage('unit')), TB3 (gate's sizing row cites needs('changes'), output('changes','measure')), TB4 (gate's
  sizing row cites only the tool refs, no needs or output) each leave T6, the sites test and the resolver GREEN. TB1
  (range row cites tsc-cache) is red only because tsc-cache follows a reader of range.
- (05:05 UTC) proposed-fix probes (copy file, deleted, status clean; D1-2/fixprobe1.txt, fixprobe2.txt): FX1 (T6 also
  requires a steps.<id> row to name step <id> of its own job, and a needs.<j>.outputs.<n> row to name needs(j) and
  output(j, n)) is GREEN on the real table (no churn) and turns TB2, TB3, TB4 RED ("names no step runner-image of job
  db"; "names no needs capacity", "names no output sizing of job capacity"). FX2 (fingerprint the env the script runs
  with: the workflow's and the job's env under the step's own, only when either is set, so other rows keep theirs)
  re-fingerprints 4 rows on the real tree (db and e2e runner-image, whose job env sets DATABASE_URL: ec7354ef) and
  turns r_job_env_unit RED (unit's two rows, 79e357bd). Defaults (shell, working-directory) would go the same way.
- Trials next (D1-2/scripts/trial.sh; logs D1-2-trial-<label>.log).
- (05:15 UTC) (4) documents, read at a5bc1170: ADR 0066 N32 "What holds it" sub-bullet 1 (lines ~1020-1027) and
  ci.md's "A step takes only the value it uses" bullet (lines ~445-449) name every ref kind the code resolves (step by
  job and id, uses: step with its action, job output that is one output alone within the reader's bound, matrix key,
  needed job, path#symbol, the named always-run test) and the fingerprint's four keys; no row holds a line and no
  bound text names one (grep of the table). Mismatches: (a) the ADR and the Ref comment say the fingerprint covers
  "what the script runs with" so "a changed script or input fails": the code reads only the step's own env, shell and
  working-directory, and an inherited env change leaves the whole file green (r_job_env_unit, r_job_env_capacity,
  r_wf_env_largezip); ci.md's "its script, env, shell and working-directory" is accurate. (b) "Each row names its
  producers by what they are": T6 checks the refs resolve, not that they are the value's own producer (TB2-TB4).
  (c) "the unit test that holds it": T6 checks a title exists and always runs; R1's T7 showed a named test need not
  hold the byte figure (owners' length assertions are R1's proposal). reconciliation-001's entry says nothing on
  citations.
- (05:25 UTC) (5) trials so far (D1-2/trials.txt; logs D1-2-trial-*.log), each merge --no-commit then abort, status
  clean after: A base 88708069 (#90, #93; only watched-paths.txt and the lockfile among tool files) clean, refs
  identical, whole workflows.test.ts 124 passed. B #42 9426a8d1 clean, 124 passed; report.ts/run.ts/report.test.ts
  move: jobResult 863->960, sizingQuestion 835->932, verdict 507->554, run.ts main 779->823, the two named report
  tests 323->329 and 185->191, each the same declaration (first line identical). C suite-cap-1-triage-locks ce408d2f
  clean, 124 passed: also checks.ts verdict 119->206, advisoriesOutput 194->315, release-capacity run.ts main
  311->375, named checks tests 120->211, 156->270. D ss-01 / wip-ss01-chain bb13be1b and E wip-interest-chain
  c18a847e: clean, 124 passed, the same moves. F1 packet-day-counts e3299ea2: clean, 124 passed, refs identical
  (base.mjs, affected.test.ts move elsewhere). F2 wip-packet-day-counts acfd8980 (10-28): conflicts outside #86
  (test-matrix, synth matrix and registry), not tested. Note: a merged lockfile was installed in the clone during
  trials; the clone is reinstalled at a5bc1170 before later runs.
- (05:35 UTC) trials done (D1-2/trials.txt): F3 wip-pdc-2 bf849464, F4 -3 9554cdc7, F5 -4 081a8034 clean, 124 passed,
  refs identical. G ci-mutation-trigger 50029e64 (live, moves mutation.yml, affected.ts, affected.test.ts and
  workflows.test.ts): conflicts only in ADR 0066 and reconciliation-001 (taken as ours for the run), whole file 126
  passed; it adds a step before the affected producer and leaves the producer's run and env alone (fingerprint
  4d1e744c holds); shardsFor 681->766 and the named test 362->377, same declarations. H wip-ci-findings-transport
  b9a83bd3 (built on d257fe6d): conflicts in ADR 0066, reconciliation-001 AND workflows.test.ts, not tested; it removes
  check's findings output and the calendar step's id, so on its rebase T6's two findings rows go red by the set
  comparison until it removes them (the over row's own comment says it rewrites them). I #42's older integration
  6c28d6a2 clean, 124 passed, the same moves as B. J ledger-interest-once e0646746 (10-28): 9 conflicts (apps/web,
  ADR 0062, test-matrix, ci.md, synth) not tested; contained in E (c18a847e), which merges clean. K1-K5 old #42 WIPs
  (c65f9cf2, be63bdc2, 8128a036, f077c048, f972a8f0): clean or ADR 0062 only, 124 passed each. No live head turns a
  row red; every cited symbol and test resolves on each merged tree to the same declaration (refs-at diffs).
  main-dependabot-template 07e78d20 (main-based, 10-20) not trial-merged. Named tool tests on merged trees next
  (D1-2/scripts/trial2.sh).
