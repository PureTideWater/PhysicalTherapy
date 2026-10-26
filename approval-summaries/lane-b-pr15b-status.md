# PR 15b status (ledger amounts in payment terms; audit #12)

Open questions: none. Standing ruling (the co-founder, 2026-10-26 ~00:20 UTC, relayed by the orchestrator): "Don't ask for approvals anymore just build and optimize": every choice takes the recommended option (security: the safer one), recorded with its reasons; founder-kept matters (domain model, release tags, owner-admin settings, legal text) stay out of scope, so a migration is still never Lane B's.

| UTC | Stage | Note |
|---|---|---|
| 2026-10-25 23:50 | Machine | setup-container.sh printed OK; `gh api user` prints PureTideWater; main checkout at 6ddd587 (claude/build-platform), ops at f77cf1b. |
| 2026-10-25 23:50 | Reading | LANES.md, lane-b.md (step 5, conventions, rulings), CLAUDE.md, reconciliation-001 "What must not change", combined audit #12 read. #42 is open (head 13f59b1); of its files, 15b shares only the shared documents reconciliation-001.md, test-matrix.md and packages/synth/src/cases/registry.ts, which LANES.md says follow rule 6 (the PR merged second keeps both). |
| 2026-10-25 23:55 | Design | Starting the design workflow: author, one adversarial reviewer (payment-engine checklist), revision. Output: designs/lane-b-pr15b.md. |

| 2026-10-26 00:22 | Design | Scouts done (4/4). Remittance scout: a *stored* case close "payer corrected; balance is the patient's" would need DDL on case/case_line (CHECKs at 20261019160000:166,194,213); the design weighs a derived close from stored data, no migration. Author writing. |

- PR: not yet opened. Head: none. CI: none.
- Findings: none yet.
- Next step: the design, and its migration check.
