# Lane B: ux-sign-in-time status (co-001/ux-sign-in-time)

The UX baseline review's PR 6: each sign-in step says how long it stays open, warns before it closes, and starts again
with the email kept (UX-012, UX-128; C-007 "now" part, C-042's step marker on the invited path). Run by
session_01FcouKNxVRK8x6iV52PfxXz, a Lane B item session started 2026-11-01 by Lane B's orchestrator
(session_01FcouKNNHsdecRMzfTs7XwW); item prompt `lanes/lane-b-item-prompts-2026-11-01/ux-sign-in-time.md`. UX PR 7
(`co-001/ux-sign-in-recovery`) and UX PR 8 get their own sessions later; this one leaves design 3.5's hooks for PR 7.
GitHub login: PureTideWater.

## Now (2026-11-01 17:00 UTC): taken over; finishing the design
- **Hold lifted:** the co-founder's go-wide answer (2026-11-01 ~14:40 UTC, weekly usage under 20%, relayed by Lane B's
  orchestrator) lifts the old "paused for UX PR 10" hold; this item runs now, in parallel. #85 (UX PR 10) is still an
  open draft at 29dded52 (`dirty`).
- **Design:** `designs/lane-b-ux-sign-in-time.md` is a partial draft (header, 1, 2.1-2.11, 3, 4 with SGN-01..04).
  The old run wf_3c17f552-0ea cannot be resumed from a new session: the author is rerun from section 5 (after the
  five live-state corrections in the item prompt), then the review and the revision, from the committed scouts and draft.
  Author progress seeded from `approval-summaries/lane-b-ux-sign-in-time-wip/sgn-author.md`.
- **Branch:** `co-001/ux-sign-in-time` on origin at 165c5993 with no commits of its own; fast-forwarded locally to the
  base 83d71fd6 (claude/build-platform). Worktree /home/user/ux-sign-in-time (created by setup; pnpm install done).
- **Running:** nothing yet (the design workflow starts next). The old scratchpad is gone; its copies are in
  `approval-summaries/lane-b-ux-sign-in-time-wip/`. No scheduled tasks exist from the old session.
- **Reserved:** ADR 0081 (shared with PR 7); test-matrix SGN-01 to SGN-04 (PR 7 has SGN-05 to SGN-08); synth module
  19 (SGN). No migration timestamps. All checked free on 83d71fd6 and every open head (item prompt).
- **Sources:** `designs/lane-b-ux-review.md` section 3 (order 6), `designs/lane-b-ux-review/synthesis/prs.json`
  (order 6), the findings UX-012 and UX-128 and their sources under `designs/lane-b-ux-review/`.
- **Leaves out (recorded for Lane A):** the 15-minute Cognito session and the pending cookie's length
  (`infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts`, #42 files) land in UX PR 66. The stale "three
  days" comment in `identity.ts` (INVITATION_DAYS is 7) is #42's file, for Lane A. WCAG 2.2.1 residue: audit #103.
- **Next:** the design's sections 5-8 (with the corrections), its review and revision (one workflow); then the builders
  (slices A-D), the before shots, the draft PR, two reviews (security; UX and brand with shots), the fix round with the
  full suite, the fresh-clone verification, the merge (nothing must merge first; the PR merged second resolves the
  shared documents and `forms-harness.tsx` with #85).

## Waiting on someone
None blocks this PR. UX PR 66 (Cognito/infra, Lane A); the "three days" comment (Lane A); audit #103; runbook 3i and
`APPROVAL_REVIEW_REQUIRED` (the founder's; until then merge on green checks after the fresh-clone verification).

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-28 03:45 | Started | #74 merged (165c599). Branch and worktree cut from it; design workflow started. |
| 2026-10-28 03:55 | Paused | The orchestrator's order: UX PR 10 first. The running design workflow finishes; build resumes after PR 10 merges. |
| 2026-10-28 05:15 | Clean stop | The limit stopped the design at ~04:20: scouts done, author through section 4. Committed as a partial draft; resumes after PR 10 merges. |
| 2026-11-01 17:00 | Taken over | session_01FcouKNxVRK8x6iV52PfxXz (Lane B's orchestrator, 2026-11-01). Hold lifted by the co-founder's go-wide answer. Status corrected against live state; branch fast-forwarded locally to 83d71fd6. Next: design sections 5-8, review, revision. |
