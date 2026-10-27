# Lane B: ux-download-refusals status (co-001/ux-download-refusals)

A refused download comes back to its form, never a JSON page (the UX review's PR 5; UX-010, cluster C-004). Run by
session_01L3tN5LCq2aNYetEQBNJYZg, a Lane B item session started 2026-10-27 by Lane A's orchestrator
(session_01TrKDxeLbxVo7t7zwRXFzrg). Follow-on in this session after it merges: PR 9 `co-001/ux-home-figures`
(status `lane-b-ux-home-figures-status.md`).

## Now (2026-10-27 14:30 UTC)
- **Stage 2, builders, running:** workflow `wf_64b87764-990` (script `workflow-scripts/lane-b-ux-download-refusals-build-wf_64b87764-990.js`): core (handler, route shape, parser, notice, letter rule, unit tests), then four in parallel (coverage and the e2e spec; packets, uploads and console; reports, ROI and monthly; ADR 0079, test-matrix and synth), then an integration check. Builders do not commit; the session commits after the check. Progress files in the scratchpad `progress/dlr-build-*.md`.
- **Before shots, running:** workflow `wf_c067d77c-56b` (script archived): adds the refused-download states to the screen tour on claude/build-ops, then the base run (TOUR_REF e908c21).
- **If this container is gone:** both runs restart from their scripts (the builders from the worktree's state, which is uncommitted until the check; so a lost container means the build starts again from the design). Resume in this session with resumeFromRunId.
- **Branch:** `co-001/ux-download-refusals`, pushed at e908c21 (no commits of its own yet). No PR.
- **Design:** `designs/lane-b-ux-download-refusals.md` (§6 wins over §2 to §5); review `designs/lane-b-ux-download-refusals-review.json`.
- **Reserved:** ADR 0079; test-matrix DLR-01 to DLR-04; `packages/synth` module 18 (DLR).
- **Migration:** none. **#42 files:** none (checked 2026-10-27 01:45 UTC; design D7).
- **GitHub login:** `PureTideWater`.
- **Machine (14:20 UTC):** setup script OK on every line, playwright included (`ok playwright 1.56.1 chromium-1194 chromium_headless_shell-1194 in /opt/pw-browsers, laid out from Chrome for Testing 141.0.7390.37`).
- **Overlaps:** ux-forms is PR #74 (open), ux-table-scroll in build: LANES rule 6, the one merged second keeps both.
- **Safety check-in:** send_later at 2026-10-27T19:33Z.

## Log
- 2026-10-27 01:45 UTC: machine set up; brief, LANES.md, lanes/lane-b.md read; branch cut; #42 file check done.
- 2026-10-27 01:55 UTC: design written; next, its adversarial review (workflow).
- 2026-10-27 02:10 UTC: review done (`designs/lane-b-ux-download-refusals-review.json`); dispositions written (design §6). Holding until 14:05 UTC (usage).
- 2026-10-27 14:20 UTC: resumed on the orchestrator's message (the 14:05 check-in did not fire); setup OK, playwright included.
- 2026-10-27 14:30 UTC: build workflow `wf_64b87764-990` and before-shots workflow `wf_c067d77c-56b` started.

## Waiting on someone
- Nothing.

## Proposals (improve as you go, outside this PR)
- None yet.
