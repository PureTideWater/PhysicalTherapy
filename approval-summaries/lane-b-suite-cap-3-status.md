# SUITE-CAP-3, reconcile at real size: status

Item session session_01FcouKP4ekrT97eyDtLe4Rd (https://claude.ai/code/session_01FcouKP4ekrT97eyDtLe4Rd), started 2026-11-01
under Lane B's orchestrator (session_01FcouKNNHsdecRMzfTs7XwW); item prompt
`lanes/lane-b-item-prompts-2026-11-01/suite-cap-3.md`. Claim: LANES.md line 195 (at 15725ba2). Branch
`co-001/suite-cap-3-reconcile`, worktree `/home/user/suite-cap-3-reconcile`, cut from `claude/build-platform` at
83d71fd62c6d419be61fd7aaa5b9033ef5c18b56 and pushed 2026-11-01 16:57 UTC. GitHub login: PureTideWater. Reserved: ADR 0087 if
the design needs one; test-matrix CAS-49 to CAS-51; `packages/synth` cases the same if needed (module 5, the existing CAS
module). No migration timestamp and no fixture release are reserved; this item opens no migration. Design file (to be
written by this session's design workflow): `designs/lane-b-suite-cap-3-reconcile.md`.

## Now
- 2026-11-01 17:00 UTC: container set up (setup-container OK; Node v24.22.0 after moving the base image's v24.22.1 aside);
  branch re-cut at 83d71fd6 and pushed; worktree installed. Next: adapt and run the design workflow (pipeline stage 1).

## Corrections of the 2026-10-28 record (stale facts; the 2026-10-28 session and its scratchpad are lost)
1. Session and orchestrator: now this session, under Lane B's orchestrator, from 2026-11-01 (was session_019i9ifDUYaz9Hta77Vukkzo
   under Lane A's orchestrator).
2. Claim row: LANES.md line 195 (was "row 190").
3. Branch and worktree: the old branch never reached origin and the old worktree is gone; re-cut at 83d71fd6 (was 56ed6279).
   Nothing under `apps/worker/src/reconcile` or `packages/ledger` changed between the two.
4. Design file: `designs/lane-b-suite-cap-3-reconcile.md` was never committed; it is rewritten by this session.
5. Workflow wf_860fa29e-3e1 and its scratchpad are lost and cannot be resumed; the design restarts from the archived script.
6. Check-in trig_01XCQ1wFB3pozWMx6cnPpRC2 no longer exists; this session schedules its own.
7. Freeze: the ledger oracle and LED-01 to LED-18 (LED-18 added in e46aa6b8) pass byte for byte.
8. Probe scripts (`${SP}/repro/`, `${SP}/results/`) are gone; only `approval-summaries/lane-b-suite-cap-1a-capacity-probe.md`
   survives. The probe is rebuilt from it and from 1b's `reconcile.large.db.test.ts` seeding.

## Freeze and limits
- The matching rules, every amount and the recovered total stay unchanged: the ledger oracle and LED-01 to LED-18 pass
  byte for byte; nothing under `packages/ledger/src` changes.
- `claim_by_superseded` is 1b's D15: cited, not duplicated. Any other index or table the best fix needs is recorded
  "for Lane A" with its DDL and measured gain; a ledger-table change also needs a founder freeze exception.
- One of the two adversarial reviews is the payment-engine-reviewer agent; the other security-reviewer (tenancy, PHI reads,
  decrypt counts, logs, with 1a's concurrency-and-capacity lens).

## Decisions taken (recommended option, with reasons)
- None yet.

## For Lane A
- None yet (the design writes any with exact DDL and measured gain).

## Waiting on someone
- Founder: a ledger freeze exception, only if the design wants a ledger-table change (that part goes for Lane A; does not
  block this PR).
- Founder: an 8-CPU runner to prove step 7b at full size after 1b merges (does not block this PR).
- Founder: runbook 3i and `APPROVAL_REVIEW_REQUIRED` (until then merge on green CI after the verification; does not block).

## Log
- 2026-11-01 17:00 UTC: new session; setup OK; branch re-cut at 83d71fd6 and pushed; status file corrected.
- 2026-10-28 05:58 UTC: design workflow wf_860fa29e-3e1 launched (lost with the old container).
- 2026-10-28 05:57 UTC: started after SUITE-CAP-1a merged (its push runs on 56ed6279: ci, mutation, screening-capacity all success).
