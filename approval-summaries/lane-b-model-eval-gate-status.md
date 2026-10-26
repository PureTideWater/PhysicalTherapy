# Lane B: model-eval-gate (#84, #120; LANES queue item 12): status

Session: the parallel Lane B session started by the orchestrator (session_01CntuGR3wkXMF6kK3at6bGh) on the co-founder's direction of 2026-10-25 ~23:40 UTC. Reserved: ADR 0070; test-matrix MOD-7 to MOD-12; `packages/synth` cases MOD-7 to MOD-12.

## Open questions
None. The co-founder's standing ruling of 2026-10-26 ~00:20 UTC (relayed by the orchestrator): "Don't ask for approvals anymore just build and optimize." Every choice takes the recommended option (security: the safer one), recorded with its reasons here and in the design and PR description. Founder-kept matters stay out of scope; Lane B still opens no migration PR (LANES rule 2).

## Stage
- 2026-10-25 23:40 UTC: machine set up (`tools/setup-container.sh` printed OK; `gh api user` is PureTideWater).
- 2026-10-25 23:55 UTC: read LANES.md, lane-b.md, CLAUDE.md, reconciliation-001's checks, audit #84 and #120. #42's files: none of this item's (only the shared test-matrix and synth registry, rule 6).
- 2026-10-26 ~00:00 UTC: **Design** in progress: `designs/lane-b-model-eval-gate.md`, one adversarial reviewer (workflow).

- 2026-10-26 00:22 UTC: design scouts done (`designs/lane-b-model-eval-gate/scout-*.md`); author drafting. The PHI scout found that an exact member-ID and patient-control-number check needs decrypting every identifier the practice holds per proposal (no lookup hash), and that a document's kind cannot be corrected after upload: both better fixed by a migration, which goes to Lane A as a proposal.
- 2026-10-26 ~01:05 UTC: **Design done** (wf_82384b40-62a: four scouts, the author, one adversarial reviewer, the revision; 1.63M subagent tokens, 68 min). `designs/lane-b-model-eval-gate.md`, its review `designs/lane-b-model-eval-gate/review.md` (2 blocking, 13 major, 16 minor; every one fixed or rebutted, listed in the design's last section). **No migration** in either PR (design section 12).
- 2026-10-26 ~01:10 UTC: **Session rulings** under the co-founder's ruling of 00:20 UTC (design, "Session rulings"): two PRs, `co-001/model-eval-gate` (#84: the gate, set v2, the new faults, per-feature serving; ADR 0070 Parts 1-2) then `co-001/contract-phi-check` (#120; Part 3), cut after the first merges; `watched-paths.txt` treated as a generated file under rule 6 (regenerated, never hand-merged); Q1 50,000 identifiers; Q2 the stored-side rules; Q3 the large tier generated in CI; F5 (a); F6 CODEOWNERS lines in the first PR.

- 2026-10-26 ~01:20 UTC: **Builders** running (wf_95daa8e9-fea): synth set v2, the gateway core and the docs in parallel; then the eval harness and gate; then serving and the apps; then an integrator (full checks, generated files, commits). Draft PR opens on its first push.

- 2026-10-26 02:17 UTC: build stage 1 done (synth set v2: synth 178/178 tests, fixtures regenerated idempotently; gateway core; docs); stage 2 (the eval harness, gate and faults) half done. The account's 5-hour limit is at 90% (resets ~03:40 UTC): a self check-in at 03:50 UTC (trig_01XpjmcPPR3qYDuBCCPXa6YT) resumes wf_95daa8e9-fea with resumeFromRunId if it stopped. #84's PR comes before #120's (the orchestrator, 02:16 UTC).

- 2026-10-26 03:55 UTC: the 5-hour limit stopped the build at ~02:30 UTC (stage 1's three agents done; eval, serving, apps and integrate failed with the limit). The worker restarted; `setup-container.sh` re-run (both clusters up); wf_95daa8e9-fea resumed with resumeFromRunId (task woijlp7nr), the eval builder continuing from its progress file.

- 2026-10-26 ~04:45 UTC: **Build done** (wf_95daa8e9-fea; summary `approval-summaries/lane-b-model-eval-gate-build-summary.md`). Local, Node 24: typecheck, lint, lint:logs, lint:copy pass; unit 5,095 passed / 3 skipped / 1 failed (a `packages/packets` property-test flake at seed 2019154346, closure unchanged since 6ddd587, passes on rerun: not this PR's); golden 215 passed (~19 s); db files 7 + 15 passed; synth idempotent; engine freeze, verify-content, check:fixtures pass.
- 2026-10-26 ~05:00 UTC: the first push was refused by gitleaks (`generic-api-key` on a report field `twinKey` holding a SHA-256). Renamed to `twinSha256`, re-recorded through the CLI, folded into the two unpushed commits (tree otherwise identical), pushed.
- 2026-10-26 05:05 UTC: **Draft PR #53** (https://github.com/PureTideWater/PhysicalTherapy/pull/53), head 388f213c; description from the template, written with update_pull_request and proved byte for byte; subscribed.
- 2026-10-26 05:08 UTC: **Two adversarial reviews** running (wf_f15d6416-cdd): AI safety and evaluation correctness; security (security-reviewer.md); each finding verified by a skeptic.

## Proposals outside this PR
- `packages/packets/src/verifier.test.ts:384`: the property's `fc.pre` should leave out the pattern's procedure codes (any code-shaped number), so a random count equal to a code cannot fail it (seen at seed 2019154346).
- A CLI option to run the twins twice and compare them, in place of the runbook's manual comparison.

## For the founder (founder-kept; nothing waits on them)
- **F1:** the per-field recall and precision floors (`eval/floors.json` ships unset; production refuses a real provider until set). Before the first real-model baseline run.
- **F2:** whether the data-rights addendum covers keeping an accepted, uncorrected proposal as an evaluation example (legal text). Not built until ruled.

## Proposals for Lane A (migrations; the orchestrator writes LANES.md)
- **F3:** compact keyed lookup hashes on `patient_ref.member_id`, `claim.patient_control_number` and `claim.payer_claim_control_number`, a backfill, and a SECURITY DEFINER boolean screen function that audits one screen event and only matched rows. #120's best option; PR C is the bounded fail-closed interim (refuses above 50,000 identifiers).
- **F4:** a reviewed, audited correction of a document's kind (today `source_document.kind` is immutable and a re-upload is a held duplicate).
- LANES.md's claim row: "MOD-7 to MOD-12" reads MOD-07 to MOD-12.

## Next step
Builders (workflow) in `/home/user/model-eval-gate` on `co-001/model-eval-gate` from the latest `claude/build-platform` (6ddd587 at start).
