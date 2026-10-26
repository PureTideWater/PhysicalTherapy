# PR 15b status (ledger amounts in payment terms; audit #12)

Open questions: none. Standing ruling (the co-founder, 2026-10-26 ~00:20 UTC, relayed by the orchestrator): "Don't ask for approvals anymore just build and optimize": every choice takes the recommended option (security: the safer one), recorded with its reasons; founder-kept matters (domain model, release tags, owner-admin settings, legal text) stay out of scope, so a migration is still never Lane B's.

| UTC | Stage | Note |
|---|---|---|
| 2026-10-25 23:50 | Machine | setup-container.sh printed OK; `gh api user` prints PureTideWater; main checkout at 6ddd587 (claude/build-platform), ops at f77cf1b. |
| 2026-10-25 23:50 | Reading | LANES.md, lane-b.md (step 5, conventions, rulings), CLAUDE.md, reconciliation-001 "What must not change", combined audit #12 read. #42 is open (head 13f59b1); of its files, 15b shares only the shared documents reconciliation-001.md, test-matrix.md and packages/synth/src/cases/registry.ts, which LANES.md says follow rule 6 (the PR merged second keeps both). |
| 2026-10-25 23:55 | Design | Starting the design workflow: author, one adversarial reviewer (payment-engine checklist), revision. Output: designs/lane-b-pr15b.md. |

| 2026-10-26 00:22 | Design | Scouts done (4/4). Remittance scout: a *stored* case close "payer corrected; balance is the patient's" would need DDL on case/case_line (CHECKs at 20261019160000:166,194,213); the design weighs a derived close from stored data, no migration. Author writing. |
| 2026-10-26 00:47 | Design | Author done (wf_48dc8bcb-176). Payment-terms amounts and billable figures: no migration (every CHECK/trigger checked, design 0.3). The stored case close needs DDL on case/case_line, so the workflow stopped before review as built. |
| 2026-10-26 01:05 | Design | Q1 and Q2 take their recommended answers under the 00:20 ruling (design 0.5). Q1: the outcome is recorded with no entry and the words shown from stored rows; the stored close is handed to Lane A (entry sent to the orchestrator for LANES.md). Q2: a payment fall with allowed the same or higher is 'decreased', capped. Workflow resumed into review and revise. |
| 2026-10-26 01:30 | Design done | Review: verdict revise, 22 findings (2 blocking: B1 the allowed baseline kept in allowed terms beside the paid one; B2 a higher allowed that pays less with nothing approved is 'decreased', no entry). All 22 accepted and applied (design section 9; review in approval-summaries/lane-b-pr15b-design-review.md). Confirmed: nothing 15b builds needs a migration. Departs from #12's best option only on Q2's edge (stored outcome follows the payment) and, until Lane A's migration, the stored close. |
| 2026-10-26 01:40 | Build | Worktree /home/user/pr15b on co-001/pr-15b-ledger-payment-terms from 6ddd587. Build workflow wf_128192b0-55e started: ledger core and records in parallel, then worker, screens, integration. |

- PR: not yet opened. Head: none. CI: none.
- Findings: none yet.
- Next step: builders finish; then the draft PR, subscribe, and the two reviews with the before/after tour.
- Queued after 15b merges: #46 the Verified seal (orchestrator, 00:24 UTC; records verified-seal).
