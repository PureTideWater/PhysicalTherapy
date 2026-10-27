# SUITE-CAP-1a, bounded reads: status

Item session session_019i9ifDUYaz9Hta77Vukkzo, started by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on
2026-10-27 for the co-founder. Design: `designs/suite-cap-1-triage-locks.md` (part 1a only; 1b is Lane A's schema PR).
Branch `co-001/suite-cap-1-bounded-reads`, worktree `/home/user/suite-cap-1-bounded-reads`, cut from
`claude/build-platform` at 085299bd. GitHub login: PureTideWater. Reserved: ADR 0083 (1a writes its part, with "The
split"; 1b completes it), test-matrix CAS-41, `packages/synth` case CAS-41 (module 5, no fixture file).

## Now
- 2026-10-27 20:35 UTC: machine set up (setup-container.sh: every line ok, Chromium included); branch cut and installed. The design
  stage is done (designed and reviewed, nine findings taken); re-read against 085299bd: none of 1a's files changed
  since the design's base e908c21. Next: the build workflow (slices of section 13, 1a).
- 2026-10-27 20:37 UTC: build workflow wf_34688805-4ff running (script `workflow-scripts/lane-b-suite-cap-1a-build-wf_34688805-4ff.js`): the real-size reproduction on the base in a scratch clone (a private cluster with 1,024 locks per transaction for the defects behind the lock, as the design's probes did), beside the five build slices in order, then a check that re-runs the probe on the head. Safety check-in scheduled for 2026-10-28 01:47 UTC (trig_01LLGSsPuwpPuqUKg1frFo17). If stopped: resume with resumeFromRunId wf_34688805-4ff (this session only); the agents keep progress files in the session scratchpad's progress/.

## Decisions taken (recommended option, with reasons)
- Pattern order in the fold: today's patterns sort by payer, plan, behavior and rate record, and ties keep the order of
  the first line in the report's sort. The fold keeps, per pattern, its first line's sort key and breaks ties by it, so
  the content stays identical (the design's "keeping the key's fields from the first line", made exact).

## Waiting on someone
- None for 1a. For Lane A (1b, already in its design as D15): the report's patient-balance step at 100,000 lines is dominated by claimLines' lookup on superseded_by_claim_id, which has no index: 718.7 s of the base report's 842.5 s (no heap flag). 1a's grouping (D16) and batching (D18) remove the rest (about 47 s), but the report stays near pg-boss's 15-minute attempt until `claim_by_superseded` lands (1b section 4.4, or the interest PR, whichever merges first). It is a migration, so it is not 1a's.

## Log
- 2026-10-27 21:39 UTC: reproduction done (scripts and results in the session scratchpad's repro/ and results/). Base report with no heap flag: ready in 842.5 s, the patient-balance step 766.0 s (claimLines 718.7 s, no index). Base triage re-run: live heap with the candidate rows held 415.6 MiB, 75.0 MiB after judging. Slices 1 (CAS-41.1 tests first, passing on the base: 9 triage and 11 report job cases) and 2 (D12, D13) done; slice 3 (the report) running. WIP snapshot pushed: `co-001/wip-suite-cap-1a` at 23847b0b.
- 2026-10-27 21:24 UTC: the orchestrator's reminder (21:31) taken: never force a push, WIP branches included; a diverged WIP ref gets a fresh name (co-001/wip-suite-cap-1a-2, ...), recorded here. Before figures at 100,000 lines on the base (private cluster, 1,024 locks per transaction; 560 MiB heap flag): A's triage 260.4 s, its actionable advanceStages 207.9 s for 33,334 lines (quadratic), live heap after judging 74.8 MiB, sampled peak 509.2 MiB; A's audit report heap out of memory at about 62 s, twice, holding runLines' 100,000 rows (511.7 MiB live). On the default cluster (64 locks): A's report 53200 at 47.3 s, 14,533 advisory locks.
- 2026-10-27 20:37 UTC: build workflow wf_34688805-4ff launched.
- 2026-10-27 20:35 UTC: started; setup OK; worktree and install done.
