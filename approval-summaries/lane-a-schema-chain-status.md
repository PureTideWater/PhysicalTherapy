# Lane A schema chain: build status (SS-01, SUITE-CAP-1b, the interest fix)

Session: https://claude.ai/code/session_01FcouKQthXdmDnPmwhFepxW, **acting Lane A on Lane B's account** (GitHub login
PureTideWater), started 2026-11-01 ~16:58 UTC by Lane B's orchestrator session_01FcouKNNHsdecRMzfTs7XwW, until Lane A
returns (2026-11-03 14:00 UTC, possibly 15:00). Briefs: `lanes/lane-b-session-brief.md`, `lanes/acting-lane-a-brief.md`
(wins where they differ), item `lanes/lane-b-item-prompts-2026-11-01/schema-chain.md`. The earlier session
(session_019i9ifCi6u3MV8sy7oAhUmy, Lane A's account) is stopped; its record is kept below under "History".

## Now (Lane A, 2026-11-04)
Session https://claude.ai/code/session_019i9ifEG147aKfNHEAsoS7h (Lane A's schema-chain session; started 2026-11-04 by
Lane A's orchestrator session_01TrKDxeLbxVo7t7zwRXFzrg). Takes the chain back from acting Lane A (session_01FcouKQthXdmDnPmwhFepxW;
its unpushed work is not waited for).
- **02:35 UTC.** Machine OK (tools/setup-container.sh: every line ok, one note: tp-oracle pip 26.2.2). GitHub login
  PureTideWater. Heads: base 21fa10df; SS-01 bb13be1b (no PR); 1b 22177731; interest 74a6b290. Base delta for SS-01
  since 43565235: #92, #93, #90, #42's final (22789493), #95, #91; the only migration in it is #42's own
  20261107090000. Next: SS-01's PR stage (base merge, draft PR, two reviews, fix round, verification), one workflow.
- **02:40 UTC. Running: wf_c5833de7-aa6** (`workflow-scripts/lane-a-ss01-pr-stage-wf_c5833de7-aa6.js`): base
  21fa10df into SS-01 (re-read of SS-01's recreated objects on the base's bodies; regenerate; fast checks; push); the
  draft PR headed by the summary; security and UX/brand reviews in fresh clones, a skeptic per finding; fix round with the
  full local suite once and one push (WIP ref `co-001/wip-ss01-chain` before the suite); fresh-clone verification reading
  CI. Beside it, read-only: the flaky `tools/release/load.db.test.ts` root cause (fix as a patch, for 1b). Check-in
  scheduled 07:46 UTC (trig_01G5HLTy6TevngHswpbJDA2S).
- **03:28 UTC. SS-01 PR #104 open (draft):** https://github.com/PureTideWater/PhysicalTherapy/pull/104, head
  e4a6d2fc (base 21fa10df merged, then #94 4846f043, no conflict). Re-read: no body SS-01 recreates moved since
  6c28d6a2; 20261108090000 unchanged, no marker. Two semantic conflicts fixed (abbf3052; one is #95's
  mapping-routes.db.test.ts asserting the pre-SS-01 refusal sentence, now SS-01's R1); ADR 0080 count-free (776b6a15).
  Fast checks, touched db tests (7,097 passed), actions:check, toolchain:check green. Domain model 08c1ba47…6142, line
  7414 (provisional). Body 40,568 characters, read back equal. Subscribed. Reviews running.
- **03:31 UTC (corrected from 03:50). CI red, not SS-01's: the repository is now private** (`private: true`; repo updated 02:51:33 UTC). The
  base 4846f043 is red too (ci run 41763423759: images; screening-capacity 41763423983). (1) images: the Trivy install
  exits 6 (trivy-action v0.36.0 -> setup-trivy v0.2.6 -> install.sh @75c4dc0 fetches get.trivy.dev; the runner cannot
  resolve it). (2) screening-capacity: RUNNER_TOO_SMALL, 2 CPUs (a private repository's runner); on #104 its `changes`
  job's blobless clone cannot fetch blobs without credentials. (3) This voids 1b's CAS-42.5 route (free 4-CPU runner
  while public). The domain model job fails only for the approval line, as expected. Failed jobs re-run once.
  Reported to the orchestrator for the founder/co-founder. No merge in the chain until required checks can go green.
- **03:33 UTC. The orchestrator's ruling on the CI breakage:** S4 (session_019i9ifAfByN2caCea4jgSdu) owns the CI fixes
  (Trivy from its GitHub release with a pinned SHA-256, `co-001/ci-trivy-install-2026-11-04`; the gate's `changes` fetch
  with the workflow token; any other public-repository assumption) and sends the diff, which goes into #104 (one comment) or
  at its base merge. The founder decides on the private repository (GitHub Team organization with a 4-core larger runner,
  or public again); the harness's CPU requirement is not lowered. **CAS-42.5 is blocked on that decision**; CAS-42.6
  (local process route) still runs. SS-01 continues; its suggested line goes up on the final head once every check that
  can pass has passed.
- **04:25 UTC. wf_c5833de7-aa6 stopped; its reviews had not run.** Both reviewer agents (agentType security-reviewer,
  ux-brand-reviewer) hit their frontmatter `maxTurns` (20, 30) before returning, so the fix round started with no findings.
  Stopped before it could write "no findings" into #104's body. Its partial full suite on e4a6d2fc is kept as a record
  (chain1 green; test:db 4 shards 9,718 + 1 skipped; build). Lesson: run the reviews as default workflow agents (LANES
  rule 1) with the agent file as their brief.
  **Running: wf_4c65fb5f-eab** (`workflow-scripts/lane-a-ss01-reviews-fix-verify-wf_4c65fb5f-eab.js`): both reviews
  again as default agents, a skeptic per finding, fix round (full suite once, counting e4a6d2fc's parts if the tree is
  unchanged), one push, verification reading CI; beside it, the flaky fix finished as a patch.
- **Flaky `tools/release/load.db.test.ts`: root cause found** (progress record, to be archived): the loader's one
  `VACUUM (FREEZE, ANALYZE) rule_record` freezes only rows older than its database's horizon; an autovacuum ANALYZE (or
  catalog scan) in the scratch database holds a snapshot whose xmin precedes the load's xid when it predates the commit,
  or when any older xid runs anywhere in the shared cluster (a snapshot's xmin is cluster-wide), so every page stays
  unfrozen (relallvisible 0 of 7). Reproduced deterministically (a same-database snapshot before the load: 0/3 frozen) and
  in the wild (private cluster beside a held xid: 1 of 20 fails with the CI symptom; none without). The proposed fix is
  in `packages/rules/src/loader.ts` (re-VACUUM until frozen, bounded wait, `LoadResult.frozen`): no schema file, but it
  is being checked against Change Order 001's content-pipeline freeze before it goes into 1b.
- **05:55 UTC. Container restart (~05:40); setup re-run OK; resuming wf_4c65fb5f-eab.** Before the restart: both reviews
  returned (11 findings; skeptics confirmed 7: UX-SS01-1 blocking, SEC-F1, UX-SS01-2, UX-SS01-3 should-fix, UX-SS01-5,
  -6, -8 nits; refuted SEC-F2, SEC-F3, UX-SS01-4, UX-SS01-7); the fix round had its failing-first tests written
  (uncommitted; saved as WIP ref `co-001/wip-ss01-fix2` f99ea08e).
- **Flaky load test: the fix is a content-pipeline change (Change Order 001 rule 4; change-order-001.md:10, :115).** No
  deterministic test-only fix exists (record and patch: `approval-summaries/lane-a-wip/flaky-load/`). **Asked of the
  founder via the orchestrator (05:50 UTC):** the exception, text proposed in the record. Until a ruling it stays a
  known flake and the patch is not applied anywhere.
- **05:57 UTC. S4:** the images fix is #107 (`co-001/ci-trivy-pin-2026-11-04`, 41818ac4; Trivy 0.70.0 from its GitHub
  release, SHA-256 pinned; CI green), merging next; the gate's fetch fix is #106. SS-01 takes them by one base merge
  before its final push (no hand port). A schema PR's screening-capacity gate measures (migrations are watched) and stops
  RUNNER_TOO_SMALL on the private repository's 2-CPU runner until the founder's runner/organization decision (#102).
- **07:12 UTC. The repository is public again** (API private=false; the orchestrator, 07:10): 4-CPU runners, the gate can
  pass; **CAS-42.5's dispatch route is open again** for 1b. The loader freeze exception is still with the founder.
  SS-01's fix round: all seven confirmed findings fixed (failing-first tests); base 7bf7b252 (#107) merged (84ec0093);
  head 3b796604 locally: unit 7,376 + 4 skipped (two failures from this round fixed and re-run), golden, oracle, test:db
  4 shards 9,720 + 1 skipped, build, e2e 73 passed; Stryker running; then one push and the PR body.
- **08:40 UTC. SS-01 fix round done: #104 head 3b796604 pushed** (wf_4c65fb5f-eab). Fixed, each failing first: SEC-F1
  (8b85a7ef: mapping holds monitoring only for the owner's hold), UX-SS01-1 (2d4ae8b1: E1 kept and Export disabled while
  held), UX-SS01-2/-6 (5a526016), UX-SS01-3 (86cc892d), UX-SS01-5/-8 (28a88558); BIL-07/BIL-09 amended (79315a09,
  3b796604); base 7bf7b252 (#107) merged. Refuted: SEC-F2, SEC-F3, UX-SS01-4, UX-SS01-7. **Full local suite once, green on
  3b796604:** unit 7,378 + 4 skipped; golden 376; oracle 688; test:db 9,720 + 1 skipped; build; e2e 73 (0 flaky); Stryker
  6 shards + gate (pricing 98.67%, packets 97.75%); typecheck, lint 1,762, lint:copy 562, lint:logs 1,121, fixtures,
  synth, verify-content, actions:check, toolchain:check. Domain model 08c1ba47…6142, line 7414. PR body 57,946.
  Verification: blocked: the base moved to 881e2bbd (#105, #75, #106; no migration) and conflicts in
  `apps/web/src/components/uploads/uploader.tsx`, so no CI run starts.
  **Running: wf_b656bc57-787** (archived): merge 881e2bbd (fast + touched checks; push; body), then the re-shoot of the
  fixed states (the review saw them only broken) beside the fresh-clone verification reading CI. Then the suggested line.
  Next after it: `workflow-scripts/lane-a-chain-forward-1b-interest.js` (SS-01 into 1b, CAS-42.5 dispatch, 1b into
  interest, verifiers, CAS-42.6 local). CAS-42's assertedBy already holds reconcile.large (91efb58a, 2026-11-02).
- **The orchestrator's merge step (07:48):** before any merge, if origin/claude/build-platform is no longer an ancestor of
  the head: merge it again, fast checks and generators, push, CI green, then merge; check `--check --require-approval`
  after each base merge (a delta with no migration keeps the hash, so the founder's line stays valid).
- **09:45 UTC. SS-01 verified; suggested line posted.** wf_b656bc57-787: base 881e2bbd merged (a8d53a97; uploader.tsx
  both sides), head **7076d64e** (fast + touched checks green; body 62,183). Re-shoot: every fixed state shown fixed (one
  new nit: mixed apostrophes in the grantee mapping sentence, deferred). CI on 7076d64e: 24 of 27 green (images,
  screening-capacity with a time advisory the base shares (O9: S4 54.5 s vs 44 s), mutation, db, e2e); domain model and
  all green fail only for the blank line. Fresh-clone verification passed. **Domain model SHA-256
  08c1ba4746589dc3d1acbcce966680e9bd22aa2ae07fb87f1c03b18ce9576142, line 7414. Suggested line (one PR comment):**
  https://github.com/PureTideWater/PhysicalTherapy/pull/104#discussion_r4465978371 . Reported to the orchestrator.
  Base moved to 24531dc2 (#86; no migration): merged after the founder commits, then CI green, ready, merge.
  **Running: wf_130f3090-169** (`workflow-scripts/lane-a-chain-forward-1b-interest.js`, args ss01Head 7076d64e).
- **11:35 UTC. Chain forward (wf_130f3090-169):** 1b **ab8c9c27** pushed (SS-01 7076d64e merged; 20261109090000
  unchanged); CAS-42.5 dispatched on it (release-capacity run 41810890284); interest **adf0f5d2** pushed (1b merged; its
  migration unchanged); both merges' adversarial fresh-clone verifiers: ok. CAS-42.6 (local process route, one release
  dir): **before** (56ed6279, #81) FAIL as expected: A triage, A report x2, D triage 53200 out of shared memory after 3
  attempts, one backend at 13,703 advisory locks; **after** (ab8c9c27) running.
- **The founder GRANTED the release loader's freeze exception** (~09:55 UTC, relayed by the orchestrator 11:33; text in
  `approval-summaries/founder-asks-2026-10-27.md`, "Granted 2026-11-04"). The fix goes into 1b with the grant recorded in
  ADR 0083 and reconciliation-001; tools/release/load.db.test.ts is no longer a known flake. Script ready
  (`workflow-scripts/lane-a-loader-freeze-into-1b.js`); it starts when CAS-42.6's head run ends, so the measurement runs
  undisturbed.
- **11:38 UTC. The founder committed SS-01's approval line:** d214ad6c (11:30:05 UTC, "Update domain-model.md", GitHub's
  "Commit suggestion"): line 7414 only, `Approved by: Tyler Williams  Date: 2026-11-04  Document SHA-256:
  08c1ba47…6142`. Next, once CAS-42.6's head run ends (~12:00): merge base 24531dc2 (#86; no migration), fast checks and
  generators, `--check --require-approval`, push, CI green, ready, approval-of-record's re-run, merge (method merge,
  expectedHeadSha).
- **11:55 UTC. CAS-42.6 PASSED; CAS-42.5 FAILED (memory.peak).** Results and logs: `approval-summaries/lane-a-wip/cas42/`.
  - CAS-42.6 (local process route, one release dir 900110, same harness and server; only the worker differs): **before**
    56ed6279 (#81) FAIL: A triage, A report x2, D triage 53200 after 3 attempts, one backend at 13,703 advisory locks;
    **after** ab8c9c27 PASS: 19 jobs on attempt 1, locks max 1, live heap max 339 MiB (line 420), A triage 43.6 s (120),
    A report 95.4 s (180), together A report 2 139.6 s and D triage 79.9 s; memory peak 721.6 MiB (cgroup v1, local).
  - CAS-42.5 (release-capacity.yml run 41810890284 on ab8c9c27, ubuntu-26.04 4 CPUs, worker 0.5 vCPU / 1,024 MiB):
    **fail on two checks only:** the worker's memory.peak 980.4 MiB over the run and 936.6 MiB in the together phase, above
    921.6 (90%). Everything else passed (attempt 1, live heaps <= 420, locks <= 64, no OOM/restart). Commented on #73 by
    the workflow. Artifact unreadable here (blob host refused by the egress proxy). **Open for 1b's PR stage:** root-cause
    the container peak (live heap is 339 MiB; the rest is native memory, Chromium or page cache), fix or measure, never
    loosen the 90% line. Also open: the harness's step 7b posts 0 of 0 (A has no actionable lines), so section 8.4's 30 s
    actionable-write budget is never exercised.
  - Merge verifiers for 1b ab8c9c27 and interest adf0f5d2: ok.

## Now (acting Lane A, 2026-11-01)
- **17:00 UTC (acting Lane A).** Machine OK (tools/setup-container.sh, every line ok, Playwright included; Node 24.22.0;
  worktrees /home/user/ss01, /home/user/sc1b, /home/user/interest, /home/user/ops). Login PureTideWater.
  Live heads (`git ls-remote`, 16:58 UTC): SS-01 `co-001/ss-01-suspension-refusal` **f897a282** (not f5bd6201: 2ff5c631
  merged base 56ed6279 = #76, #77, #80, #79, #74, #81; f897a282 puts the suspension card on #74's fields and #79's table
  floor; domain model still 6559c5b9…c2fadc at line 7413); 1b `co-001/suite-cap-1-triage-locks` **358dc53f** (lacks
  f897a282 and 56ed6279); interest `co-001/ledger-interest-once` **e0646746** (358dc53f + b5949dc1 schema, a3c9d068 ledger
  core, 1b5036e3 synth, 39e5caa0 reconcile, e0646746 records; **slice 4, the screens, not on origin**; its integrator and
  full suite never ran; domain model 3083defa…0d09 at line 7468, unchecked). #42 `co-001/pr-06b-mail-streams` be63bdc2
  (open, draft; its own session S0 runs its last steps). Base `claude/build-platform` 83d71fd6 (adds #78 over 56ed6279).
  No PR and no CI run exists on any chain branch; no WIP refs for the chain.
- **Corrections to the record below (acting Lane A, 17:00 UTC):** wf_96af352a-4ed did not finish: it stopped in or after
  stage 1 (pushed 2ff5c631 05:47 and f897a282 05:56; the account stopped ~08:00); stage 1's checks have no surviving
  record, so **f897a282 is unchecked**; stages 2 to 4 never pushed (no b1b-*.md progress files survive). wf_4860596d-bb1
  did not finish: slices 1, 2, 3 and 5 pushed, slice 4 (builder W) not, Integrate never ran, the re-read's deltas and the
  builders' reports are lost. 1a has merged (#81, 56ed6279) but 1b does not contain it yet. The old check-ins
  (trig_015zUyNTQAE48NHK4vYz3Sw6, trig_011P79pdAThs6U9K5f147QAX) are gone. "#42 moved to 6f23c42b" and "fix round on
  co-001/wip-pr42-*" are stale: #42 is at be63bdc2. The base delta for SS-01 is now #78 (83d71fd6) only; the trial merge
  conflicts in `apps/web/scripts/synthetic-personas.ts` only (#80, #79, #74 are already in SS-01). SUITE-CAP-3 is Lane B's
  own item (`lane-b-suite-cap-3-status.md`), not this session's.
- **Running: wf_5566bd1c-8eb (acting Lane A; script `workflow-scripts/lane-a-schema-chain-merge-build-wf_5566bd1c-8eb.js`),
  from 17:10 UTC.** (1) base 83d71fd6 (#78) into SS-01, verifying #79/#74 patterns, the whole check list (f897a282 was
  unchecked), push; adversarial verifier + fixer. (2) SS-01 into 1b, push; verifier + fixer. (3) In parallel: 1b's
  deferred parts (gate, CAS-42.1/.2, SLOW_FIRST, ADR 0083 1b section) + read-only real-size route scout + 1b's integrator
  (full suite less CAS-42.5/.6, one push); and the interest chain (1b's new head merged in, builder W slice 4, integrator
  with the full suite, one push). (4) Fresh-clone adversarial verifiers on both heads. Progress files in the session
  scratchpad `progress/sc-*.md`. Check-in scheduled (send_later, ~22:20 UTC).
  **Decision (acting Lane A):** the item file's two workflows run as one, with 1b's deferred parts and the interest chain as
  parallel branches after the 1b merge: the interest branch starts the moment stage 2 pushes (as the item file requires)
  with no idle wait for a session turn, both share the heavy lock and their own e2e port ranges, and every step gains an
  adversarial verifier (ultracode). If stopped: setup, leftover markers, resumeFromRunId.
- **18:20 UTC (acting Lane A): stage 1 green.** SS-01 9777ddc0 (base 83d71fd6 merged; synthetic-personas.ts both sides):
  typecheck, lint 1,712, lint:copy 550, lint:logs 1,102, unit 7,032 + 4 skipped, test:db 4 shards 9,561 + 1 skipped,
  build, stamp, e2e 68 passed, verify-content, synth 0 written, fixtures, domain model --check (6559c5b9…c2fadc, line
  7413; provenance only). Pushed. The base then moved to bce57f16 (#82): merged as efb20704 (no conflict), re-checking.
- **~19:00 UTC: the account's 5-hour limit stopped wf_5566bd1c-8eb in stage 1** (round 2 on efb20704: typecheck, lint
  1,719, lint:copy, lint:logs 1,106, verify-content, dm check, fixtures, actions:check, toolchain:check, unit 7,125 + 4
  skipped, test:db 4 shards green after one flake in tools/release/load.db.test.ts shard 1 (relallvisible 0 vs 7 after
  VACUUM FREEZE; untouched by SS-01 and #82; passed on re-run and alone 3/3: an open item); build and e2e not yet run).
  Worker restarted; setup re-run 19:58 UTC (PostgreSQL back; no marker); efb20704 kept as WIP ref
  `co-001/wip-ss01-chain`; **resumed 19:59 UTC** with resumeFromRunId (the stage-1 agent continues from its progress file,
  copied to `approval-summaries/lane-a-wip/progress/sc-m1-ss01.md`).
- **~11:00 UTC (acting Lane A): 1b's CAS-42.1 fixed: 1b head 22177731 pushed** (wf_3118d5d7-edb; no migration, domain
  model unchanged at e024cf9f…efc4df). Cause: RUN_LINES_QUERY joined each line to a DISTINCT ON CTE over the practice's
  whole stage log and plain-joined case_line; on pre-triage statistics the planner chose a nested loop (first 2,000 rows
  27.4 s; ~23 min for 100,000). Fix (query shape): the stage as a scalar subquery on line_status_head through
  line_status_head_once, the case line as LEFT JOIN LATERAL ... LIMIT 1 through case_line_once; rows unchanged
  (streamed.db.test.ts). Proof: cold statistics, all 100,000 lines read in 16.6 s; CAS-42.1 report 79.5-85.9 s in 4
  runs (autovacuum off once, on three times), 1 lock; CAS-42.2 passes. Skeptic in a fresh clone: ok, report 75.4 s.
  ADR 0083's 1b section updated. Revisit: CANDIDATE_QUERY's DISTINCT ON over the stage log. Interest (74a6b290) takes
  22177731 at its PR stage.
- **~09:20 UTC (acting Lane A): interest at its clean point: 74a6b290 pushed** (wf_3c4cf5ac-af0; results
  `approval-summaries/lane-a-schema-chain-wf_3c4cf5ac-af0-result.json`). 379fed9f merged 1b 048bc843; builder W's slice
  4 d37a0ee3 (reconciliation and ROI words per section 7, word for word in the result; routes db test 17/17 and
  ledger-interest.spec 2/2, both failing first); the integrator's seam read found and fixed one defect (74a6b290: a
  take-back is now capped at the line's whole interest as well as the chain's, so two chains on one line after a
  specialist's correction can no longer trip ledger_interest_line_floor and roll back a reconcile (D8); failing-first
  test). **One full local suite:** unit 7,275 + 4 skipped; golden 376; oracle 712; test:db shards 2-4 green, shard 1
  3,334 passed + 1 failed: **CAS-42.1 (1b's test)**; build, stamp, e2e 71; Stryker affected shards (interest.ts 100%,
  308/308) + gate; verify-content; synth; engine-freeze clean; scope 75 files in section 11. **Domain model SHA-256
  47887070bc3c99f9a5148590e5f30c85a5661ca053ad54712a6d4104f10eb8ef, line 7469** (provisional). Open: ADR 0084 D5
  sentence on the line-whole cap (at interest's PR); its UX review at its PR.
- **CAS-42.1 fails at 1b's own head 048bc843 too** (report 730-750 s vs 180 s, nearly all FETCH report_lines; 95.8 s in
  1b's integrator run): the report's plan depends on whether autovacuum's ANALYZE lands after triage. **Running:
  wf_3118d5d7-edb** (script archived) on /home/user/sc1b: a plan-independent fix (query shape first), proven by 3 runs
  plus one with autovacuum off, narrow checks, push; a skeptic re-runs it. 1b's full suite runs once in its PR fix round.
- **07:40 UTC (acting Lane A): #42 MERGED as 22789493 (orchestrator, 07:36 UTC). SS-01's PR stage started.**
  **Running: wf_78cd4c88-7b1** (script `workflow-scripts/lane-a-ss01-pr-stage-wf_78cd4c88-7b1.js`): base 22789493 merged
  into SS-01 (regenerated; SS-01's recreated objects re-read on #42's merged body; delta checks; push); the draft PR into
  claude/build-platform (description headed by `--summary-since origin/claude/build-platform --function-diffs list`, whole;
  every template section; < 65,536; read back); two adversarial reviews in fresh clones (security and tenant isolation;
  UX and brand with 1280/390 light and 1280 dark shots), each finding checked by a skeptic; the fix round with the full
  local suite once and one push; the fresh-clone verification reading CI and naming the approval line. Then the session
  posts the suggested line as ONE PR review comment and reports its link. 1b and interest stay at their clean points
  (interest finishing slice 4 and its one suite in wf_3c4cf5ac-af0) until SS-01 merges.
- **06:25 UTC (acting Lane A): resumed after the 5-hour stop (~05:50) and a worker restart.**
  - **Route proved; the 8-CPU-runner ask is WITHDRAWN.** wf_3c4cf5ac-af0's smoke: release-capacity run.ts --small
    --runtime process at 1b 048bc843 on this 4-CPU container: "runner 4 CPUs, 16091 MiB", verdict pass, 19 jobs on
    attempt 1, 1 advisory lock; requiredCpus = 4 (limits.ts); runs 40479127979 and 40584379787 reached FULL_SIZE
    verdicts on GitHub's free 4-CPU runner. Needs no person and no money while the repository stays public. At 1b's PR
    stage on its final head: CAS-42.5 by dispatching release-capacity.yml on 1b's branch (a failure or advisory also
    comments on the "Release capacity test failing" issue); CAS-42.6 by the local process route, base and head builds,
    one release dir (commits named by hand: the process route records Commit unknown; Postgres unthrottled, recorded as
    departures). Commands in `approval-summaries/lane-a-wip/progress/rc-smoke.md`.
  - **Interest: pushed 379fed9f** (1b 048bc843 merged). Builder W stopped mid failing-first e2e with its implementation
    stashed (stash 589e31d5, saved as WIP ref `co-001/wip-interest-w`); its progress file says to pop it. Setup re-run
    (PostgreSQL back; no marker); **wf_3c4cf5ac-af0 resumed 06:22 UTC** (W, then the integrator's one full suite).
  - #42: open, draft, head 9426a8d1 (moved past 6c28d6a2), base now 88708069. SS-01 takes #42's final head and the base at
    SS-01's PR stage (after #42 merges).
- **~05:10 UTC (acting Lane A): wf_5566bd1c-8eb done** (results: `approval-summaries/lane-a-schema-chain-wf_5566bd1c-8eb-result.json`).
  - **1b head 048bc843 pushed** (add1ebed merged SS-01 bb13be1b with #42 6c28d6a2 and base 43565235; only the domain model
    conflicted, regenerated; 20261109090000 unchanged, marker never used). Built: the measurement gate, CAS-42.1/.2
    (apps/worker/src/triage/triage.large.db.test.ts + test-support/large-jobs.ts), SLOW_FIRST 15 -> 17, ADR 0083's 1b
    section. **Full local suite once, green:** unit 7,188 + 4 skipped; golden 376; oracle 687; test:db 4 shards 9,608 + 1
    skipped (shard 1 722 s, holds both large tests); build, stamp, e2e 69; Stryker six affected shards + gate passed;
    verify-content; fixtures; engine-freeze clean; **domain model SHA-256
    e024cf9fce732e2c94795c0cacf8dfc890cef486413c92039108034854efc4df, approval line 7459** (blank; provisional).
    CAS-42.1: triage 70.8 s (budget 120), report right after 95.8 s (budget 180; was 460 s before the integrator's fix of
    the report's candidate query planning on stale statistics), live heap 163/117 MiB, 1 advisory lock; CAS-42.2 report
    111.8 s + triage 88.6 s, live 219 MiB < 420; base: 53200 out of shared memory at 20,000 lines.
    Integrator fixes: the heap line can no longer fail a finished job (worker.ts, failing-first test); the weekly heap
    check now uses the worker's --max-old-space-size (checks.ts); the report's candidate lookup (performance).
  - **The real-size runs need no 8-CPU runner (route scout, 02:30 UTC):** runnerTooSmall needs requiredCpus = 4 (the
    shared layout since the founder's "Free: time advisory" ruling); FULL_SIZE runs 40479127979 and 40584379787 reached a
    verdict on GitHub's free 4-CPU runner. CAS-42.5: dispatch release-capacity.yml on 1b's branch ($0); CAS-42.6: the
    design's section 8.2 local process-runtime route (base and head builds, one release dir). Being proved by a --small
    smoke now (wf_3c4cf5ac-af0); the "waiting on the founder" entry is withdrawn when it passes. The full runs go at 1b's
    PR stage on its final head (pacing: no run on a head the reviews may still change).
  - **Interest: not finished.** The forced stop at 02:15 made its merge agent return early (local d39b72c0, WIP ref
    `co-001/wip-interest-chain`; not pushed), so W and its integrator did not run. Lesson recorded: stopping a workflow
    makes in-flight agents return and their partial results are cached on resume.
  - **Running: wf_3c4cf5ac-af0** (script `workflow-scripts/lane-a-schema-chain-interest-finish-wf_3c4cf5ac-af0.js`), from
    05:15 UTC: interest merges 1b 048bc843 (quick checks, push), builder W slice 4, the integrator's seam read and ONE full
    local suite, push; beside it the route smoke (read-only; no dispatch).
- **~03:40 UTC (acting Lane A): wf_a12c973a-c12 done. SS-01 head bb13be1b pushed** (6af518c5 merged #42 6c28d6a2: only
  the domain model conflicted, regenerated; bb13be1b merged base 43565235, no conflict). SS-01's recreated objects re-read
  on #42's bodies: audit_event_record keeps #42's 7 reserved actions and adds organization_suspended/_reinstated; #42
  touches none of SS-01's other objects; **migration 20261108090000 unchanged, marker never used.** Checks: typecheck,
  lint 1,725, lint:copy 552, lint:logs 1,108, unit 7,160 + 4 skipped, test:db 4 shards 9,567 + 1 skipped, build, stamp,
  e2e 69 passed (0 flaky), verify-content, synth 0 written, fixtures, **domain model --check: SHA-256
  3922b6a6bb6d2042f5e4c16342841e150d0cae439b797e8cdb4240436195f019, approval line 7414 (blank; provisional until the
  PR's final head).** Fresh-clone verifier: ok (two nits: one loose commit-message phrase; the attribution trailer the
  brief requires). Base has since moved to 4eaf7124 (#92, no migration): taken at SS-01's PR time.
- **02:15 UTC (acting Lane A): the co-founder's pacing call (7-day limit at warning; resets 2026-11-06 19:00 UTC):
  finish to the next clean point, spend nothing that does not change the outcome.** Decision: wf_5566bd1c-8eb's script
  edited (archived copy updated) and resumed so each full suite runs ONCE, on the final tree: 1b's integrator first waits
  for SS-01 with #42 6c28d6a2 (wf_a12c973a-c12) and merges it, then runs 1b's full suite; the interest integrator runs
  after 1b's and merges 1b's integrated head first; the two pre-PR fresh-clone verifiers are dropped (each PR's own
  pipeline step 6 does that). Earlier agents replay from cache; the in-flight ones continue from their progress files.
- **2026-11-02 01:05 UTC (acting Lane A): both workflows resumed** after the 5-hour limit (~22:00-00:10) and a worker
  restart stopped them; setup re-run (PostgreSQL back; no marker). State at the stop:
  - wf_a12c973a-c12: SS-01 local **bb13be1b** (#42 6c28d6a2 and base 43565235 merged; WIP ref `co-001/wip-ss01-chain`):
    typecheck, lint 1,725, lint:copy, lint:logs, verify-content, fixtures, unit 7,160 + 4 skipped, test:db shards 1-2
    green; shards 3-4, build, e2e, push still to run.
  - wf_5566bd1c-8eb interest merge: local **c18a847e** (1b ce408d2f merged; WIP ref `co-001/wip-interest-chain`); test:db
    shard 1 found 15 failures from the merge (1b's streamed.db.test.ts order phrase now `ORDER BY m.seq`; ledger-world.ts's
    one-record interest match that 20261110090000 now skips): fixed uncommitted, shards to re-run.
  - wf_5566bd1c-8eb 1b gate (uncommitted in /home/user/sc1b): CAS-42.1 triage alone 61.5 s, live peak 160 MiB, 1 lock;
    **CAS-42.1 report alone 481.3 s against a 180 s budget (FAIL; a second report 89 s: suspected stale statistics right
    after triage, under investigation)**; CAS-42.2 together PASS (live 220 MiB < 420, 1 lock). Route scout not yet run.
- **21:15 UTC (acting Lane A): wf_5566bd1c-8eb's stages 1 and 2 done.** SS-01 **efb20704** pushed (bce57f16 merged;
  round 2: build, e2e 68 passed, synth 0 written; verifier: ok, one pre-existing nit). 1b **ce408d2f** pushed (SS-01
  merged; test:db 9,600 + 1 skipped; dm 81d0ac76…, line 7458; verifier's open items: CAS-42.1/.2 not yet in-repo (being
  built now), CAS-42's assertedBy lacks reconcile.large). Now running in parallel: 1b's gate builder + route scout, and
  the interest merge of ce408d2f (typecheck, lint green so far).
- **#42's head for the chain: 6c28d6a2** (orchestrator, 21:14 UTC; #78 and #82 merged; suggested line posted for the
  founder: https://github.com/PureTideWater/PhysicalTherapy/pull/42#discussion_r4437376734). Base now 43565235 (#83).
  **Running: wf_a12c973a-c12** (script `workflow-scripts/lane-a-schema-chain-pr42-into-ss01-wf_a12c973a-c12.js`), from
  21:20 UTC, in /home/user/ss01 only (idle since stage 1): #42 6c28d6a2 then base 43565235 merged into SS-01, SS-01's
  recreated objects re-read on #42's bodies (marker route only if a body moved), the whole check list (e2e ports
  4991-4999), push; adversarial fresh-clone verifier + fixer. Then, after wf_5566bd1c-8eb finishes: the new SS-01 head
  into 1b and 1b into interest (a follow-on workflow).
- **#42's step-1 head c65f9cf2 pushed (orchestrator, 18:15 UTC); a #82-merged head follows.** Decision: wait for that
  head (one regeneration; no merge into a worktree a workflow is writing) and merge it down SS-01 -> 1b -> interest in a
  follow-on workflow once wf_5566bd1c-8eb's merges have pushed.
- **Next:** when #42's S0 pushes its step-1 head (be63bdc2 moves): merge it into SS-01 -> 1b -> interest (never into a
  worktree a workflow is writing). SS-01's PR opens only after #42 merges.

## History (session_019i9ifCi6u3MV8sy7oAhUmy, Lane A's account, 2026-10-27/28; corrected above)
- **2026-10-27 20:45 UTC.** Machine OK (tools/setup-container.sh, every line ok, Playwright's Chromium included).
  Worktree `/home/user/ss01` on `co-001/ss-01-suspension-refusal`, cut from #42's head 098636e3 and pushed.
  #42's fix round is on `co-001/wip-pr42-*`; its new head is merged into SS-01 with a merge commit as it moves.
- **Running: wf_8ee54e2b-824 (ss01-build; script `workflow-scripts/lane-a-ss01-build-wf_8ee54e2b-824.js`), from
  2026-10-27 20:45 UTC:** the design re-read against #42's 098636e3 (one reviewer), builder D (the migration
  20261108090000 via the marker route, packages/db, domain model, function files), then W (worker, SS-08), C (console),
  P (wrapper, customer surfaces, seed, e2e) and M (ADR 0080, amendments, matrix, synth) in parallel, then the
  integrator (adversarial seam read, the full local suite once, one push; no PR). Progress files in the session's
  scratchpad `progress/ss01-*.md`. Safety check-in: see below.
  If stopped: re-run the setup script if PostgreSQL is down, remove a leftover `/home/user/ss01/.claude/.allow-protected-edit`,
  resume with resumeFromRunId (same session only).
  At 21:25 UTC builder D had pushed d213416b (BIL-07/08 db tests, 39 failing on the base) and 7da01015 (the migration,
  domain model and function files); W, C, P and M were building.
- **Running: wf_6e2dedb0-b5e (suitecap1b-reread, one agent)** from 21:26 UTC: SUITE-CAP-1b's design re-read against
  SS-01's head, #42's and part 1a's state (light; no build yet).
- **Never force a push, WIP branches included** (the orchestrator, 21:31 UTC): a diverged WIP ref goes to a fresh name
  (co-001/wip-<item>-2, ...), recorded here.
- **SUITE-CAP-1b re-read done (wf_6e2dedb0-b5e, 21:38 UTC): build with deltas** (`approval-summaries/lane-a-suitecap1b-reread.json`):
  line_status_head gets an `id` primary key plus the unique index line_status_head_once (the cross-tenant factory needs a
  single-column key); one combined NOWAIT lock loop over claim and line_status; fields.test.ts's unit regex gains `mib`;
  JOB_HEAP_MESSAGE/METRIC in infra/lib/jobs.ts; CAS-40.7 migrates a partial set; claim_by_superseded stays in 1b and the
  interest PR drops its object 5. CAS-42 and the slice-1 gate need part 1a's readers, so they run after 1a merges
  (1a has no remote branch yet). Decision (recommended): build 1b's other slices on SS-01's branch after SS-01's build
  and #42's merge, so nothing waits idle; regenerate everything on the final tree.
- **#42 moved to 6f23c42b** (38 commits past 098636e3; mail_streams.sql +163/-62). After SS-01's builders finish: merge
  it into SS-01 (merge commit), re-check the audit_event_record policy body SS-01 recreates, regenerate the domain model
  and function files, re-run the affected db tests.
- **22:20 UTC: a container restart stopped wf_8ee54e2b-824 in its integrator** (after every builder had pushed, to
  3b26e73f; the integrator's checks, seam read and domain-model check done: SHA-256 12b0e87d…, approval line 7407; its
  revert of an out-of-scope comment in standing.ts committed locally as d763ba78; suite part 1 lost). Setup re-run (OK),
  no marker left, the script given a RESUMED note and **resumed at ~22:27 UTC** (the six finished agents from cache).
- **~23:00 UTC: the account's 5-hour limit stopped the integrator in part 3; then a second container restart.** At
  d763ba78 the full local suite had passed: unit 6,439 passed, 1 failed (apps/worker/src/web-entries.test.ts, which
  fails identically on 098636e3: #42's, fixed by #42's 15189a50 guard), 4 skipped; golden 376; oracle 687 fixtures agree;
  test:db 4 shards 9,489 passed, 1 skipped, 0 failed; build; e2e 59 passed; Stryker packets-scan and its gate; content,
  synth and fixtures checks; domain model --check exact (99 tables, 375 function files, SHA-256 12b0e87d…, line 7407).
  Scope: 86 paths, all the design's section 13, tests or generated.
- **Resumed 2026-10-28 00:20 UTC** (the orchestrator's RESUME of 00:15): setup re-run (OK), no marker, the integrator
  given a second RESUMED note to run only Stryker packets-rest, packets-explain, pricing-engine, pricing-recompute,
  pricing-rest, the gate, then scope and its one push. Check-in moved to trig_015zUyNTQAE48NHK4vYz3Sw6 at 05:25 UTC.
- **00:25 UTC: wf_8ee54e2b-824 finished** (result: `approval-summaries/lane-a-ss01-build-result.json`); its integrator
  returned before Stryker's last five shards ran and before its push, so the session runs them itself
  (`scratchpad/ss01/suite/part3b.sh`, background, at d763ba78). Scope 74 paths at d763ba78, all section 13, tests or
  generated; one migration; nothing frozen touched. Handed-to-Lane-A items (a) to (j) are in the result's open items for
  the orchestrator (mail + Q13 PR next after SS-01; the tp_app status REVOKE after deploy; closure lifecycle and firm
  billing to milestone 12; UX PRs 78, 79, 57; model calls not refused).
- **01:04 UTC: SS-01's full local suite complete at d763ba78** (Stryker packets-rest, packets-explain, pricing-engine,
  pricing-recompute, pricing-rest, each with its gate, and the six-shard gate: all exit 0); **d763ba78 pushed.**
- **Running: wf_8bd6852a-2dd (script `workflow-scripts/lane-a-ss01-merge42-sc1b-build-wf_8bd6852a-2dd.js`), from
  01:07 UTC:** (1) #42's head (6f23c42b or newer) merged into SS-01 with a merge commit, generated files regenerated,
  SS-01's recreated objects re-read on #42's new body (the audit_event_record policy first), typecheck, lint, unit,
  test:db 4 shards, domain model, content, synth; push. (2) SUITE-CAP-1b on `co-001/suite-cap-1-triage-locks`
  (worktree /home/user/sc1b) cut from that merge: database (migration 20261109090000 with the re-read's deltas and 4.5
  under the granted Q1; CAS-40 first), then the heap line and alarm, CAS-42.3 and the harness code, documents
  (reconciliation-001's Q1 exception word for word), then the integrator (database suite; push; no PR).
  **Deferred until part 1a merges** (1a still building in session_019i9ifDUYaz9Hta77Vukkzo): the measurement gate
  (slice 1), CAS-42.1 and .2, the harness's real-size runs, ADR 0083's 1b section (1a creates the file), then 1b's
  full local suite.
- **03:55 UTC: wf_8bd6852a-2dd done** (result `approval-summaries/lane-a-ss01-merge42-sc1b-build-result.json`):
  - **SS-01 with #42's 6f23c42b merged: head f5bd6201** (pushed). Only conflict the generated domain model
    (regenerated). #42's new commits leave the audit_event_record policy, the organization table and SS-01's functions
    alone: SS-01's migration unchanged. Typecheck, lint (1,654), lint:copy, lint:logs, unit 6,492 passed + 4 skipped
    (web-entries.test.ts now passes), test:db 9,500 + 1 skipped (restore-drill's pg_dump 16 vs PG 18, environmental),
    billing.spec 6 passed, content, synth, fixtures. **Domain model SHA-256 6559c5b9…c2fadc, approval line 7413.**
  - **SUITE-CAP-1b: head 358dc53f** on `co-001/suite-cap-1-triage-locks` (worktree /home/user/sc1b): migration
    20261109090000 (line_status_head with id PK and line_status_head_once; one NOWAIT loop over claim and line_status;
    claim_by_superseded; line_status_rules as a definer writing the head row; 4.5's two ledger triggers on the practice's
    ledger: key, their files differing only in the lock line); CAS-40 15 tests (failed 15 of 15 on f5bd6201, pass after);
    heap line and alarm; CAS-42.3 and the harness code; ADR 0038 note, matrix and registry rows CAS-40 and CAS-42,
    runbooks, reconciliation-001's Q1 exception word for word. Checks: typecheck, lint 1,659, lint:copy, lint:logs,
    unit 6,522, golden 376, test:db 9,539, ledger oracle 10/10 unchanged, infra 702, content, synth, engine-freeze clean;
    scope 41 files. **Domain model SHA-256 81d0ac76…254065, approval line 7458.**
  - Decisions taken (recommended; recorded for the PR description and ADR 0083):
    - **line_status_head grants SELECT to tp_app** (the design said no grant): the access and cross-tenant suites read
      every tenant table as tp_app and must not be loosened; RLS forced, practice policy, no write grant to any role,
      CAS-40.8 asserts the exact ACL. Safer than exempting the table from the tenancy tests.
    - **CAS-42.3 runs 2,000 lines by default** (TP_LARGE_RECONCILE_LINES sets any size): a reconcile pass grows faster
      than its lines for reasons other than locks (6,000 lines 341.8 s), so 20,000 cannot fit a CI shard. Its lock
      bound (at most 1 advisory lock per backend) is the point under test and holds.
    - CAS-42.3's 835s come from LED-06's synthetic segments (no new @tp/synth dependency in the worker).
  - **Proposal (for the orchestrator; a new item, not this PR):** reconcile performance at real size: candidatesFor's
    two queries per open case line per pass (the by-patient one decrypting every claim of a code and date), claimLines'
    recursive read per line, syncLineStages' one-row stage inserts each refreshing the case. Until then the weekly
    run's step 7b at full size is expected to fail its attempt check. It sits beside the ledger freeze.
  - **Deferred until part 1a merges:** slice 1 (the measurement gate), CAS-42.1 and .2 (with SLOW_FIRST and
    tools/test/db-shards.test.ts's count, reconcile.large added beside triage.large), the harness's real-size runs
    (they need an 8-CPU runner: this container's 4 CPUs stop as RUNNER_TOO_SMALL), ADR 0083's 1b section, the shared
    documents merged with 1a's CAS-41 rows, then 1b's full local suite and a fresh domain model.
- **Running: wf_4860596d-bb1 (interest-once-build; script `workflow-scripts/lane-a-interest-once-build-wf_4860596d-bb1.js`),
  from 04:02 UTC:** the interest fix on `co-001/ledger-interest-once` (worktree /home/user/interest), stacked on
  SUITE-CAP-1b's 358dc53f; migration 20261110090000 without claim_by_superseded (1b has it). Re-read; ledger core
  (Stryker 100% on interest.ts) and schema in parallel; reconcile; screens and records (ADR 0084, PRD 13's granted
  sentence, reconciliation-001's grant word for word); integrator with the full local suite; one push; no PR (it
  opens after SS-01 and SUITE-CAP-1b merge). If stopped: setup, leftover marker in /home/user/interest, resumeFromRunId.
  **~04:10 UTC the usage limit stopped it in its re-read (nothing built); a container restart followed. Resumed
  2026-10-28 05:18 UTC** (setup re-run with the four worktrees; PostgreSQL 16's stale lock files from the old container
  removed by hand, its PID reused by PostgreSQL 18; both clusters answer; the re-read given a RESUMED note). Check-in
  trig_011P79pdAThs6U9K5f147QAX at 10:25 UTC (the window ends near 10:10).
- **Superseded:** when Stryker and its gate pass, push d763ba78; then merge #42's head 6f23c42b into SS-01 (merge commit;
  domain model and function files regenerated, never hand-merged), re-check, push; then SUITE-CAP-1b's build on it.
- **Then:** read the build's result; the PR waits for #42 to merge (then merge #42's head and the latest
  claude/build-platform in, regenerate, open the draft PR, two reviews: security and tenancy, UX and brand).

## Items
| # | Item | Branch | State |
| --- | --- | --- | --- |
| 1 | SS-01 (`designs/ss-01-suspension.md`; ADR 0080; BIL-07 to BIL-10; synth module 15) | `co-001/ss-01-suspension-refusal` (on #42's branch) | Built; full suite passed at d763ba78; head f897a282 (base 56ed6279 merged; unchecked); needs base 83d71fd6 and #42's step-1 head; PR waits on #42's merge |
| 2 | SUITE-CAP-1b (`designs/suite-cap-1-triage-locks.md` part 1b; ADR 0083; CAS-40, CAS-42) | `co-001/suite-cap-1-triage-locks` (on SS-01's); the ledger part (section 4.5) goes in the PR: Q1 granted | Built but the 1a-dependent parts (358dc53f); 1a merged (#81); needs SS-01 f897a282+ merged in, deferred parts, full suite; real-size runs wait on an 8-CPU runner |
| 3 | The interest fix (`designs/ledger-interest-once.md`; ADR 0084; LED-23 to LED-25; synth module 6) | `co-001/ledger-interest-once` (on SUITE-CAP-1b's) | Partial at e0646746: slices 1, 2, 3, 5 pushed; slice 4 (screens) and the integrator not done; exception granted; PR opens after 1b merges |

## Decisions taken (recommended option; security: the safer), with reasons
- **line_status_head grants SELECT to tp_app** (1b; 2026-10-28 03:55 UTC): the access and cross-tenant suites read every
  tenant table as tp_app and must not be loosened; RLS forced, practice policy, no write grant; CAS-40.8 asserts the ACL.
- **CAS-42.3 runs 2,000 lines by default** (TP_LARGE_RECONCILE_LINES sets any size): a reconcile pass grows faster than its
  lines for reasons other than locks; its lock bound is the point under test.
- **CAS-42.3's 835s come from LED-06's synthetic segments** (no new @tp/synth dependency in the worker).

## Waiting on someone
- #42's merge (SS-01's PR opens after it); #42's own domain-model approval is the founder's.
- The founder: each schema PR's domain-model approval (the founder commits the suggested line, as on #39, 54ec890).
- ~~Waiting on the founder: an 8-CPU runner~~ **Withdrawn 2026-11-02 06:25 UTC: the runs need 4 CPUs (proved by smoke; see Now).** Former text: This container's 4 CPUs stop
  them as RUNNER_TOO_SMALL; GitHub's larger runners exist only for organizations on Team or Enterprise Cloud and the owner
  PureTideWater is a User account; the 2026-10-23 "Free: time advisory" ruling does not decide this case. A cost and
  owner-admin decision; it does not block 1b's PR or reviews, but as designed it blocks 1b's merge.
- For the founder's information only: SS-01's REFUSAL_SUMMARY.organization_suspended reads "new work had stopped for the
  practice's organization".

## SUITE-CAP-1a merged as #81 (56ed6279; the orchestrator, 05:55 UTC)
- **Running: wf_96af352a-4ed** (script `workflow-scripts/lane-a-base-into-ss01-sc1b-deferred-wf_96af352a-4ed.js`), from
  05:45 UTC, beside the interest build (two heavy workflows): the latest claude/build-platform (#74, #79, #80, #81)
  merged into SS-01 (#79's ScrollTable and #74's kept input applied to SS-01's tables and forms; whole e2e suite), SS-01
  merged into 1b (1a's ADR 0083 and CAS-41 rows kept beside 1b's), then 1b's deferred parts: the measurement gate,
  CAS-42.1 and .2, SLOW_FIRST, ADR 0083's 1b section; a read-only scout of the real-size runs' route (8-CPU runner);
  then 1b's full local suite and one push.
- #81's notes: about 650 s of the real-size report is claimLines without D15 (stays in 1b); CAS-41.2's sizes are
  10,000 and 20,000 as built; both triage and the report fail 53200 on the default lock table until 1b.

## For SS-01's base merge at PR time (the orchestrator, 04:15 UTC)
- The base moved since f5bd6201: #80 (0dd1ba7), #79 (a6e754f: every table in ScrollTable, phone stacked rows), #74
  (165c599: forms keep input). #79 merged first, so SS-01 keeps both: #79's ScrollTable and stacked rows and SS-01's
  Suspension card content. `apps/web/src/app/tables.test.ts` exempts bare tables by exact count: wrap any table SS-01
  adds or moves in ScrollTable (preferred) rather than editing the count. Re-run watched.ts --write and synth --all on
  the merged tree. #42's verification round already merged #80 and #79 (46974a25).
- Reconcile at real size is SUITE-CAP-3 (SUITE-CAP-1a's session, after 1a; ADR 0087, CAS-49 to CAS-51): out of these PRs.

## Rulings received
- **Founder (Tyler Williams), relayed by the co-founder, 2026-10-27 20:49 UTC** (`approval-summaries/founder-asks-2026-10-27.md`
  line 3; the orchestrator's message ~20:50 UTC): "Granted: the ledger freeze exceptions in designs/ledger-interest-once.md
  section 10.1 and designs/suite-cap-1-triage-locks.md section 4.5, as written." Each PR records it word for word, with
  who and when, in its ADR (0083, 0084) and reconciliation-001, and stays within the granted text.

## Log
- 2026-10-27 20:45 UTC: session started; setup OK; SS-01 branch cut from #42's 098636e3 and pushed; wf_8ee54e2b-824 started.
- 2026-10-27 20:52 UTC: both ledger freeze exceptions granted (above); SUITE-CAP-1b's ledger part goes into its PR, no WIP branch.
- 2026-10-27 21:26 UTC: SS-01's database slice pushed (d213416b, 7da01015); SUITE-CAP-1b re-read started (wf_6e2dedb0-b5e).
- 2026-10-27 21:40 UTC: SUITE-CAP-1b re-read: build with deltas; #42 at 6f23c42b, to merge into SS-01 after its build.
- 2026-10-27 22:27 UTC: container restart; setup re-run; wf_8ee54e2b-824 resumed in its integrator.
- 2026-10-28 00:20 UTC: resumed after the usage limit and a second restart; integrator finishing Stryker and pushing.
- 2026-10-28 00:27 UTC: SS-01 build workflow done; Stryker's remaining shards running in the session.
- 2026-10-28 01:07 UTC: SS-01 suite complete, d763ba78 pushed; wf_8bd6852a-2dd started (merge #42; SUITE-CAP-1b build).
- 2026-10-28 03:58 UTC: #42 merged into SS-01 (f5bd6201); SUITE-CAP-1b built but its 1a-dependent parts (358dc53f).
- 2026-10-28 04:02 UTC: interest fix build started (wf_4860596d-bb1).
- 2026-10-28 04:16 UTC: orchestrator's base-merge notes recorded; SUITE-CAP-3 claimed elsewhere.
- 2026-10-28 05:18 UTC: resumed after the usage limit and a restart; interest fix build resumed in its re-read.
- 2026-10-28 05:45 UTC: 1a merged (#81); wf_96af352a-4ed started (base into SS-01, SS-01 into 1b, 1b's deferred parts).
