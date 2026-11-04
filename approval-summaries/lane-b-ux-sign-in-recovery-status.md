ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T06:35Z; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Lane B item: UX PR 7, sign-in recovery (`co-001/ux-sign-in-recovery`)

Assigned to acting S4 by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg), 2026-11-04 06:28 UTC, after #94 and PR D merged.
Claim: LANES.md, the ux-forms row (PR 6 and PR 7 share the sign-in files). Reserved: ADR 0081 (shared with PR 6, #92;
amended, not a new number), test-matrix SGN-05 to SGN-08, synth module 19 (SGN) if needed.
Scope: designs/lane-b-ux-review.md "UX PR 7": UX-006 (C-005) parts (1), (5) and (2)'s line, plus UX-066 (C-075), plus
#92's left UXS-01 (the hardware-key step's redirect to the key surface).
Review depth (speed rule 3): sign-in is security, so two adversarial reviews (security; UX and brand with shots), each
finding checked by a skeptic.
**Screening-capacity:** the item must touch watched paths (`apps/web/src/lib/auth/{provider,cognito-provider,dev-provider,
dev-store,sign-in}.ts`, `apps/web/src/lib/routes/sign-in.ts`, `packages/synth/src/cases/matrix.ts`). Its gate measures,
and on the private repository's 2-CPU runner it stops with RUNNER_TOO_SMALL. **The merge waits on the founder's runner
decision (#102)**; everything up to verification proceeds (orchestrator, 06:28Z).

## Log (UTC)
- 2026-11-04T06:35:00Z: branch created on origin at df4daff7 through the hook; worktree /home/user/ux-sign-in-recovery,
  installed. Next: the design workflow (scouts, writer, security reviewer at design, skeptic per finding, fold).

- 2026-11-04T06:40:00Z: design workflow wf_3774eb46-b96 launched (3 scouts, writer, security and UX design reviews, a skeptic
  per B/S finding, fold); script archived; check-in at about 11:50Z. #106 dormant until the orchestrator says the runner exists.

- 2026-11-04T07:10:00Z: **design done** (wf_3774eb46-b96, 16 agents): `designs/lane-b-ux-sign-in-recovery.md` (809 lines), review
  `-review.md`, scouts in `lane-b-ux-sign-in-recovery/`. Security and UX reviewers at design: 22 findings (2 B, 7 S, 13 N),
  all confirmed and folded. SEC-B1: a reset code only for an active account that already enrolled a second factor.
  UXR-01: "Use a different email" ends the step. No migration, no IAM or infra change. Lane A (proposals, not blocking):
  an alarm on password_reset_requested per user per day and on undelivered requests (R-11); branded wording for
  Cognito's code email; a "your password was changed" email; optionally the security_event migration. Next: the build.

- 2026-11-04T07:15:00Z: build workflow wf_a3949540-155 launched (before shots on the base; slices A-E failing-first;
  integration; adversarial checker; push and draft PR); script archived. Next: two reviews (security; UX and brand with
  after shots), each finding checked by a skeptic; one fix round with the suite once; verification.

- 2026-11-04T07:15:00Z: the repository is public again (confirmed), so **the merge no longer waits on #102** (orchestrator,
  07:10Z).

- 2026-11-04T08:30:00Z: **draft PR #108 opened** (build wf_a3949540-155, 9 agents): head 6b25ed60 on df4daff7; 40 files, +2.4k;
  slices A-E red first; integration green (unit apps/web 1,381; browser 53; db 46; build; e2e sign-in + axe specs 26);
  51 before shots on the base. Checker (record `lane-b-ux-sign-in-recovery-build/check.md`): S-1 and S-2 fixed with tests
  (ce2a20fc, 6b25ed60); **S-3 ruled TAKEN by S4** (a provider or audit failure on a real account would answer 500 while
  non-accounts get code_sent: catch it, log IDs only, answer code_sent; ADR A2 amended); N-1 taken (a test for
  timingSafeEqual); N-2 to N-6 not defects; N-7 settled (public again, so the merge waits on the gate itself, not #102).
  The PR footer was rewritten by gh: it is restored through update_pull_request in the fix round. Subscribed to #108.
  Reviews wf_341d1a32-40c launched (security; UX and brand with after shots; skeptics; one fix round: S-3, N-1, findings,
  base merge, full suite once, one push; verification); script archived.

- 2026-11-04T10:50:00Z: fix round (wf_341d1a32-40c) pushed **0bd5721a**: S-3 taken (f2aacae4, ADR A2 27bd7440), N-1 taken
  (00a7ab21), base 24531dc2 merged; full local suite once, green (unit 7,505/4 skipped; golden 381; db 9,696/1 skipped over
  4 shards; build; e2e 74 with axe 53; synth clean; Stryker none); 96 after shots. CI green on 0bd5721a, capacity gate on
  4 CPUs pass (time advisory; O9 S4 53.0 s, the standing ruling). **Both reviews FAILED to report** (the custom agent
  types ended without output; the UX tour build stopped before any shot). The security notes were salvaged unverified: P-1
  (Cognito's public client and EMAIL_ONLY recovery let ForgotPassword be called past the app's SEC-B1 gate; infra, Lane A)
  and P-2 (for UX PR 65), in `lane-b-ux-sign-in-recovery-build/proposals.md`. **Reviews re-run**: wf_1b69883e-023 (both
  lenses as default agents with their briefs, on the existing shots; skeptics; a fix round only if confirmed; verification).

## Waiting on someone
- None blocks the merge (the repository is public again, 07:10Z).

## Next step
Design.
