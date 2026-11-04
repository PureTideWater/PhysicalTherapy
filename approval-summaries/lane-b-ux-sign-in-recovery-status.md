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

## Waiting on someone
- The founder: the 4-CPU runner and organization (#102) before the merge.

## Next step
Design.
