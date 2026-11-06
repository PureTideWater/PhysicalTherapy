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
**RESUMED 2026-11-06 19:31 UTC for the DESIGN REVIEW ONLY** (the orchestrator's go, 19:40 UTC by its clock; the build waits for its next go). Workflow wf_9dd7a743-340 (`workflow-scripts/lane-b-suite-cap-3-review-wf_9dd7a743-340.js`): merge cc3dd7f6 into the WIP candidate (pushed as a fast-forward of `co-001/wip-suite-cap-3`); re-measure step 7b at 2,000 lines (1b's practice F and spread R, base vs candidate; D1's statistics-proof exclusion; D3; practice A's month for D14); update the design (1b hand-off, #126 c49367c5 collision, index/table decision) and write `approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md`; two adversarial reviews (payment-engine-reviewer, security-reviewer) with a skeptic per finding; revise; completeness critic. Speed rules per lanes/acting-lane-b-2026-11-04.md. Check-in 2026-11-07 00:42 UTC (trig_01CxB98ZAbaHYeznbUiUYzaX); if stopped: resumeFromRunId wf_9dd7a743-340. Next: commit the reviewed design, report, wait for the build go.

Earlier: **PAUSED 2026-11-02 04:05 UTC** on the orchestrator's pacing call (02:10 UTC, the co-founder's: the account's 7-day limit at its
warning level, resets Fri 2026-11-06 19:00 UTC). Resume only when the orchestrator says so. Only check-in: 2026-11-06 19:15 UTC
(trig_01HArjxdYb2yesXHFKy8JJkq).

**Stage:** pipeline stage 1 (design), with the design WRITTEN and NOT YET REVIEWED. Workflow wf_4bc31523-700 finished Scout
(code map, profile) and Design, and was stopped (TaskStop) before its Review phase, as the pause asked.
- Design: `designs/lane-b-suite-cap-3-reconcile.md` (838 lines; committed with this entry, pre-review).
- Candidate code (the design's probe, not a build): WIP ref `co-001/wip-suite-cap-3` at 956b32ef (on 83d71fd6; remittances.ts,
  stages.ts, postings.ts). Branch `co-001/suite-cap-3-reconcile` is still at 83d71fd6.
- WIP records: `approval-summaries/lane-b-suite-cap-3-wip/` (map, profile, design progress, probe scripts and README, results).
  The probe's seeds and the private cluster are gone with the container's /tmp at any restart; the README re-creates them.

**2026-11-06 19:16 UTC:** the 19:15 UTC check-in fired after the weekly reset. No resume from the orchestrator yet (none on
build-ops or by message), so the item stays PAUSED and idle; asked the orchestrator for its go. New input for the review on
resume: `approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md` (1b's CAS-42.5, step 7b's practice F: one case of
2,000 lines, 526-731 s against the 900 s attempt; byPatient's correlated `NOT EXISTS` on `ledger_match` ~403 s, the per-event case
refresh 90-115 s). It asks: D1 writes the `ledger_match` exclusion so its cost cannot depend on that table's statistics (an
uncorrelated InitPlan or a pre-materialized set, never a correlated NOT EXISTS); D3 removes the case-refresh family; and (D14)
whichever of 1b and this item lands second resets step 7b's expectation, CAS-42.3's PASS_BUDGET_MS and size, and this item's
acceptance includes moving step 7b back to practice A's full month (the Known gap line then goes). The review phase must check
the design and the WIP candidate against all three, and against practice F's one-case shape.

**2026-11-06 19:25 UTC, the orchestrator's HOLD check:** nothing changed by anyone else. Claim row (LANES.md line 211 now): Lane B,
this session, last entry 2026-11-05 (1b's hand-off). My files changed only by this session since the pause. Origin:
`co-001/suite-cap-3-reconcile` 83d71fd6 (no commits), `co-001/wip-suite-cap-3` 956b32ef, no PR. The base moved 83d71fd6 ->
cc3dd7f6: SUITE-CAP-1b merged (#110, f7d609cc; `claim_by_superseded`, `line_status_head`, the ledger lock; adds
`reconcile.large.db.test.ts` and `stage-head.db.test.ts`); in `reconcile/` only public.ts, statement-html.ts, statements.ts
changed (not remittances.ts, stages.ts or postings.ts, so the WIP candidate applies). The interest fix is not on the base.
On resume the branch first merges cc3dd7f6 and the review measures against state (c), which is now the base. Waiting for the
orchestrator's go; no workflow started.

**Exact next step on resume:**
1. Re-run setup with `co-001/suite-cap-3-reconcile:/home/user/suite-cap-3-reconcile`.
2. If this same session resumes: `Workflow({scriptPath: <session>/workflows/scripts/lane-b-suite-cap-3-design-wf_4bc31523-700.js,
   resumeFromRunId: 'wf_4bc31523-700'})`; Scout and Design replay from cache and the Review phase (payment-engine and security
   lenses, each finding adversarially verified), Revise and the completeness critic run. If a new session resumes: run a
   review-revise-critic workflow on the committed design (the archived script's last three phases, with SP changed), restoring
   cap3-probe from the WIP folder and the candidate from `co-001/wip-suite-cap-3`.
3. Commit the revised design; then builders (from the WIP candidate plus CAS-49 to CAS-51, ADR 0087), the draft PR, and on.

**Design in short (pre-review):** D1 candidates found once per round for the whole pass (one statement per round by control
number, one per pass by patient, each claim decrypted once); D2 each claim's lines read once per pass (`claimLines`' SQL
unchanged, so the interest fix's `CLAIM_LINES` copy stays valid); D3 a pass's stage events in one multi-row INSERT in today's
order; D5-D7 and D15 four quadratic TypeScript loops made linear. Matching rules, amounts, order and locks unchanged; nothing
under packages/ledger/src changes. ADR 0087 needed (D12). Probed: step 7b, state (c) (1b applied): 2,000 lines 208.4 -> 60.2 s,
6,000 1,486.4 -> 378.3 s, 10,000 3,412.1 -> 1,058.4 s; the pass's own part linear at 5.1-5.7 ms a line; the rest is the
ledger_entry triggers (For Lane A below). Decrypts at 2,000 lines 144,000 -> 3,500. Writes identical row for row to the base in
seven pairs at 2,000; reconcile/report db tests (175, LED-01 to LED-18, oracle, CAS-41) and unit (239) pass on the candidate.

**Merge rule now (the orchestrator's 20:36 ruling, relayed 2026-11-02 01:00 UTC):** a verified, green PR merges as soon as it is
ready; only conflicting PRs keep the section-6 order.

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
- **`ledger_line_net` rewrite** (design section 14.1, exact DDL there; a ledger function, so it needs a founder freeze
  exception). The two LEFT JOINs on reversal/adjustment targets become one correlated subquery per row; same answer for every
  line and stage. Measured on top of this item's worker fix (step 7b, state (c) -> (m)): 2,000 lines 60.2 -> 21.6 s, 6,000
  378.3 -> 101.2 s, 10,000 1,058.4 -> 263.3 s; writes identical to the base at 2,000. `ledger_line_stage()` has the same two
  joins and takes the same rewrite in the same migration (not measured apart; 1-5 s a pass after D3).
- Measured and rejected: `ledger_entry (service_line_id, stage)` index (no gain).
- Nothing else beyond 1b's D15 (`claim_by_superseded`), cited.

## Waiting on someone
- Founder: a ledger freeze exception, only if the design wants a ledger-table change (that part goes for Lane A; does not
  block this PR).
- Founder: an 8-CPU runner to prove step 7b at full size after 1b merges (does not block this PR).
- Founder: runbook 3i and `APPROVAL_REVIEW_REQUIRED` (until then merge on green CI after the verification; does not block).

## Log
- 2026-11-06 19:31 UTC: design-review workflow wf_9dd7a743-340 launched on the orchestrator's go (review only).
- 2026-11-06 19:25 UTC: HOLD check done; nothing changed by others; base now cc3dd7f6 (1b merged); waiting for go.
- 2026-11-06 19:16 UTC: weekly-reset check-in; no resume from the orchestrator yet; still paused. 1b's reconcile-time hand-off noted for the review.
- 2026-11-02 04:05 UTC: PAUSED (weekly-limit pacing). Design written (pre-review), committed; candidate on WIP ref co-001/wip-suite-cap-3 956b32ef.
- 2026-11-02 01:05 UTC: stopped again by the 5-hour limit; WIP pushed; resumed.
- 2026-11-01 19:58 UTC: design workflow stopped by the 5-hour limit after the map; resumed.
- 2026-11-01 17:03 UTC: design workflow wf_4bc31523-700 launched.
- 2026-11-01 17:00 UTC: new session; setup OK; branch re-cut at 83d71fd6 and pushed; status file corrected.
- 2026-10-28 05:58 UTC: design workflow wf_860fa29e-3e1 launched (lost with the old container).
- 2026-10-28 05:57 UTC: started after SUITE-CAP-1a merged (its push runs on 56ed6279: ci, mutation, screening-capacity all success).
