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
- None.

## Log
- 2026-10-27 21:24 UTC: the orchestrator's reminder (21:31) taken: never force a push, WIP branches included; a diverged WIP ref gets a fresh name (co-001/wip-suite-cap-1a-2, ...), recorded here. Before figures at 100,000 lines on the base (private cluster, 1,024 locks per transaction; 560 MiB heap flag): A's triage 260.4 s, its actionable advanceStages 207.9 s for 33,334 lines (quadratic), live heap after judging 74.8 MiB, sampled peak 509.2 MiB; A's audit report heap out of memory at about 62 s, twice, holding runLines' 100,000 rows (511.7 MiB live). On the default cluster (64 locks): A's report 53200 at 47.3 s, 14,533 advisory locks.
- 2026-10-27 20:37 UTC: build workflow wf_34688805-4ff launched.
- 2026-10-27 20:35 UTC: started; setup OK; worktree and install done.
