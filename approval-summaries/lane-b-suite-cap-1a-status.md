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

## Decisions taken (recommended option, with reasons)
- Pattern order in the fold: today's patterns sort by payer, plan, behavior and rate record, and ties keep the order of
  the first line in the report's sort. The fold keeps, per pattern, its first line's sort key and breaks ties by it, so
  the content stays identical (the design's "keeping the key's fields from the first line", made exact).

## Waiting on someone
- None.

## Log
- 2026-10-27 20:35 UTC: started; setup OK; worktree and install done.
