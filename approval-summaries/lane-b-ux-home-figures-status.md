# Lane B: ux-home-figures status (co-001/ux-home-figures)

One actionable figure on the home and the ROI statement, and the Recovered tile names its period (the UX review's PR 9;
UX-003 (C-009), UX-015 (C-048), UX-140 (C-183); `designs/lane-b-ux-review.md` §3.2 "UX PR 9";
`designs/lane-b-ux-review/synthesis/prs.json` order 9). Run by session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session
started 2026-10-27 by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), as the follow-on of PR 5
(`co-001/ux-download-refusals`, merged as #78, 83d71fd, 2026-10-28 06:51 UTC).

## Now (2026-10-28 06:55 UTC)
- **Stage 1, design with one reviewer, running:** `wf_132e0b59-2b4` (script archived; a design author, then an adversarial design review with
  the payment-engine checklist and the UX lens).
- **Branch:** `co-001/ux-home-figures`, worktree `/home/user/ux-home-figures`, cut from claude/build-platform 83d71fd,
  pushed (no commits of its own yet). No PR.
- **Reserved:** ADR 0082 if needed; test-matrix HOM-01 to HOM-04, a new series; `packages/synth` module 20 (HOM) if needed.
- **Reviews (the brief):** the UX and brand review, and the payment-engine review (`.claude/agents/payment-engine-reviewer.md`,
  as a default workflow agent with that checklist). It changes how a dollar figure is computed and shown: code computes
  every number (CLAUDE.md rule 1), money stays integer cents.
- **For Lane A, if found:** anything that needs a migration or changes frozen code (the engine under packages/pricing,
  the ledger's existing behaviour) is recorded here and left out.
- **#42 files:** none of the review's file list is in #42's (217 files at 06:52 UTC; #42 still open).

## Log
- 2026-10-28 06:55 UTC: PR 5 merged (#78); PR 9 started: branch cut, status file written.

## Waiting on someone
- Nothing.

## Proposals (improve as you go, outside this PR)
- None yet.
