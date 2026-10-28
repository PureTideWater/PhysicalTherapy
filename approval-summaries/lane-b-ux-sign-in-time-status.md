# Lane B: ux-sign-in-time status (co-001/ux-sign-in-time)

The UX baseline review's PR 6: each sign-in step says how long it stays open, warns before it closes, and starts again
with the email kept (UX-012, UX-128; C-007 "now" part, C-042's step marker on the invited path). Run by
session_01TAgFZo3SGSTBEfKRjX1jeG (a Lane B item session started by Lane A's orchestrator, session_01TrKDxeLbxVo7t7zwRXFzrg),
after #74 (UX PR 1) merged; then PR 7 (`co-001/ux-sign-in-recovery`) in the same session.

## Now (2026-10-28 03:45 UTC)
- **Branch:** `co-001/ux-sign-in-time`, cut from claude/build-platform 165c599 (#74's merge); worktree
  /home/user/ux-sign-in-time (pnpm install done). Not pushed yet.
- **Reserved:** ADR 0081 if the design needs one (shared with PR 7); test-matrix SGN-01 to SGN-04 (a new series; PR 7
  has SGN-05 to SGN-08); synth module 19 (SGN) if needed.
- **Sources:** `designs/lane-b-ux-review.md` section 3 (order 6) and `designs/lane-b-ux-review/synthesis/prs.json`
  (order 6: files, tests, leavesOut), the findings UX-012 and UX-128 and their sources under `designs/lane-b-ux-review/`.
- **Leaves out (recorded for Lane A):** the 15-minute Cognito session and the pending cookie's length
  (`infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts`, #42 files) land in UX PR 66. Anything that needs
  Cognito configuration or a migration is Lane A's.
- **Running:** the design workflow wf_3c17f552-0ea (scouts flow, timer and security; the author; one adversarial
  reviewer with security and UX lenses; the revision). Script `workflow-scripts/lane-b-ux-sign-in-time-design-wf_3c17f552-0ea.js`;
  progress files `progress/sgn-*.md` in this session's scratchpad; the design will be `designs/lane-b-ux-sign-in-time.md`.
  Check-in trig_01K7rHNZ7R1ntNDdusLkiDLC at 08:21 UTC.
- **Next:** builders; the draft PR; two reviews (UX and brand with shots; security); fix round with the full suite; the
  fresh-clone verification; merge.

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-28 03:45 | Started | #74 merged (165c599). Branch and worktree cut from it; design workflow started. |
