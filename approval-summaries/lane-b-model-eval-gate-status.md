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

## For the founder (founder-kept; nothing waits on them)
- **F1:** the per-field recall and precision floors (`eval/floors.json` ships unset; production refuses a real provider until set). Before the first real-model baseline run.
- **F2:** whether the data-rights addendum covers keeping an accepted, uncorrected proposal as an evaluation example (legal text). Not built until ruled.

## Proposals for Lane A (migrations; the orchestrator writes LANES.md)
- **F3:** compact keyed lookup hashes on `patient_ref.member_id`, `claim.patient_control_number` and `claim.payer_claim_control_number`, a backfill, and a SECURITY DEFINER boolean screen function that audits one screen event and only matched rows. #120's best option; PR C is the bounded fail-closed interim (refuses above 50,000 identifiers).
- **F4:** a reviewed, audited correction of a document's kind (today `source_document.kind` is immutable and a re-upload is a held duplicate).
- LANES.md's claim row: "MOD-7 to MOD-12" reads MOD-07 to MOD-12.

## Next step
Builders (workflow) in `/home/user/model-eval-gate` on `co-001/model-eval-gate` from the latest `claude/build-platform` (6ddd587 at start).
