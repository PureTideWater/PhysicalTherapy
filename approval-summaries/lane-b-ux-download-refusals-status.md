# Lane B: ux-download-refusals status (co-001/ux-download-refusals)

A refused download comes back to its form, never a JSON page (the UX review's PR 5; UX-010, cluster C-004). Run by
session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session started 2026-10-27 by Lane A's orchestrator
(session_01TrKDxeLbxVo7t7zwRXFzrg). Follow-on in this session after it merges: PR 9 `co-001/ux-home-figures`
(status `lane-b-ux-home-figures-status.md`).

## Now
- **Stage:** 1, design with one reviewer: the review workflow `wf_a85eb619-cf6` is running (its script archived in `workflow-scripts/`).
- **Paused** on the orchestrator's instruction (2026-10-27 01:50 UTC; weekly usage 94%, resets 14:00 UTC): finish the running review, start no new workflow until 14:05 UTC. A check-in is scheduled for 2026-10-27T14:05:00Z.
- **Branch:** `co-001/ux-download-refusals`, worktree `/home/user/ux-download-refusals`, cut from claude/build-platform
  e908c21 (#49 merged). No commits yet. No PR.
- **Design:** `designs/lane-b-ux-download-refusals.md`.
- **Reserved:** ADR 0079 (the design takes it); test-matrix DLR-01 to DLR-04; `packages/synth` module 18 (DLR).
- **Migration:** none (nothing stored). **#42 files:** none (checked 2026-10-27 01:45 UTC; design D7).
- **GitHub login:** `PureTideWater`.
- **Machine:** setup script ok except Playwright's Chromium (the proxy refuses storage.googleapis.com). Browser stages
  (local e2e, the UX review's shots) wait on it: "waiting on the person: storage.googleapis.com" if still missing then.

## Log
- 2026-10-27 01:45 UTC: machine set up; brief, LANES.md, lanes/lane-b.md read; branch cut; #42 file check done.
- 2026-10-27 01:55 UTC: design written; next, its adversarial review (workflow).

## Waiting on someone
- The account's weekly limit (resets 2026-10-27 14:00 UTC): no new workflow before 14:05 UTC.

## Proposals (improve as you go, outside this PR)
- None yet.
