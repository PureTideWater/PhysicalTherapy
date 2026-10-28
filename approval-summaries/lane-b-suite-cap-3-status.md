# SUITE-CAP-3, reconcile at real size: status

Item session session_019i9ifDUYaz9Hta77Vukkzo (SUITE-CAP-1a's, which merged as #81, 56ed6279), run for the co-founder
under Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg; its messages of 2026-10-28 04:15 and 05:55 UTC).
Claim: LANES.md row 190. Branch `co-001/suite-cap-3-reconcile`, worktree `/home/user/suite-cap-3-reconcile`, cut from
`claude/build-platform` at 56ed6279. GitHub login: PureTideWater. Reserved: ADR 0087 if the design needs one; test-matrix
CAS-49 to CAS-51; `packages/synth` cases the same if needed (module 5). Design file: `designs/lane-b-suite-cap-3-reconcile.md`.

## Now
- 2026-10-28 05:57 UTC: started. Branch cut and installed. Next: the design workflow: profile a reconcile pass at 2,000, 6,000 and
  20,000 lines on synthetic twins, with and without SUITE-CAP-1b's `claim_by_superseded` (applied by hand on a scratch
  database for the measurement only, from `co-001/suite-cap-1-triage-locks`, migration 20261109090000), to find the
  real growth terms; then the design with one reviewer (payment-engine and security lenses).

## Freeze and limits (the orchestrator's)
- The matching rules, every amount and the recovered total stay unchanged: the ledger oracle and LED-01 to LED-17 pass
  byte for byte; nothing under `packages/ledger/src` changes.
- `claim_by_superseded` is 1b's D15: not duplicated here. Any other index or table the best fix needs is recorded
  "for Lane A" with its DDL and measured gain; a ledger-table change also needs a founder freeze exception.
- One of the two adversarial reviews is the payment-engine-reviewer agent.

## Decisions taken (recommended option, with reasons)
- None yet.

## Waiting on someone
- None.

## Log
- 2026-10-28 05:57 UTC: started after SUITE-CAP-1a merged (its push runs on 56ed6279: ci, mutation, screening-capacity all success).
