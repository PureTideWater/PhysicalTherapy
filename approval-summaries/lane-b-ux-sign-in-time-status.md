# Lane B: ux-sign-in-time status (co-001/ux-sign-in-time)

The UX baseline review's PR 6: each sign-in step says how long it stays open, warns before it closes, and starts again
with the email kept (UX-012, UX-128; C-007 "now" part, C-042's step marker on the invited path). Run by
session_01FcouKNxVRK8x6iV52PfxXz, a Lane B item session started 2026-11-01 by Lane B's orchestrator
(session_01FcouKNNHsdecRMzfTs7XwW); item prompt `lanes/lane-b-item-prompts-2026-11-01/ux-sign-in-time.md`. UX PR 7
(`co-001/ux-sign-in-recovery`) and UX PR 8 get their own sessions later; this one leaves design 3.5's hooks for PR 7.
GitHub login: PureTideWater.

## Now (2026-11-02 02:20 UTC): MERGED as #92 (4eaf7124); item done
- **Merged** PR #92 into claude/build-platform at 2026-11-02 ~02:18 UTC, merge commit 4eaf7124, head ab68af87
  (merge method, expectedHeadSha), on the 20:36 ruling (verified and green). Unsubscribed. Worktree
  /home/user/ux-sign-in-time and the local branch removed; remote branches stay (`co-001/ux-sign-in-time`, WIP refs
  `co-001/wip-ux-sign-in-time` 92984990 and `-2` b8654622, both superseded by the merge). The main checkout is
  fast-forwarded to 4eaf7124, with pnpm install. Push runs on 4eaf7124: mutation and screening-capacity green; ci failed once on an unrelated timeout (apps/worker/src/report/csv-arena.test.ts:151, 5 s limit, under runner load; the merge's tree 4f443b69 is identical to ab68af87's, whose unit job passed), re-run of the failed jobs once: green (attempt 2). Proposal for whoever owns CAS-41.3: give that test an explicit timeout.
- **Final head ab68af87:** CI green on every check (all green, mutation, screening-capacity gate, approval-of-record
  re-run after ready; Stryker matrix and notify skipped legitimately). The fresh-clone verification passed
  (wf_1b56253c-138). The description was rewritten for the final head and proved byte for byte (copy:
  `approval-summaries/lane-b-ux-sign-in-time-pr92-body.md`).
- **What shipped:** one limit per step from `apps/web/src/lib/auth/step-limits.ts` (3 minutes; key registration 15),
  enforced by the server from the sealed start; the limit sentence above the work (states the time actually left after a
  reload); one polite warning a minute before (two on a step of ten minutes or more); Start again a POST through
  `sign_in.restart` that ends the step and keeps the email in the sealed HttpOnly `tp_sign_in_email`; the step markers
  "Step 1 of 2" / "Step 1 of 3" on the invited paths; ADR 0081 (amends 0016 and 0077); SGN-01..04; synth module 19.
- **Pipeline record:** design wf_72aee928-c8b; build wf_01926a3e-1b8; before shots wf_67f26406-d45 and wf_6dc4c594-2c1;
  reviews wf_b4cf4f54-7c4 (security SEC-01..03; UX from code UXS-01..05); fix round wf_aabddb31-b59 with the full local suite;
  the UX and brand review with shots wf_055bfbb1-e76 (UXR2-01..02); fix 2 + base merge wf_5971145f-281; verification
  wf_1b56253c-138. Every finding's disposition: design section 9.
- **Left for others (recorded in design 3.5 and 7.2 and in the PR body):** UX PR 7 (sign-in recovery; also UXS-01: a closed
  hardware-key step's redirect to the key surface, in lib/routes/sign-in.ts), UX PR 66 (the 15-minute Cognito session, a
  security trade-off for the founder; Lane A), Lane A (the stale "three days" comment in identity.ts; a staging check of
  AssociateSoftwareToken's session), UX PR 64 (two bare "Start again." refusals), the dark-mode work (UXR2-02 advisory),
  audit #103 (WCAG 2.2.1 residue, screen-reader checks by hand).
- **Lesson for later sessions:** a workflow agent that returns while its background run is going kills that run (two
  captures were lost this way); every capture prompt now says so (workflow-scripts/lane-b-ux-sign-in-time-*).
- **Next:** none for this session (the pacing call: no follow-on item). UX PR 7 and UX PR 8 get their own sessions.

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
| 2026-11-01 17:55 | Design done | wf_72aee928-c8b: sections 5-8, review R-01..R-15 (all disposed), critic C-01..C-09. C-02 decision: commit the regenerated watched-paths.txt. Next: build slices A-D. |
| 2026-11-01 20:10 | Built; PR #92 opened | Build wf_01926a3e-1b8 (all checks and the new e2e spec pass); before shots wf_67f26406-d45; commit e4e05a0d pushed; draft PR #92; reviews wf_b4cf4f54-7c4 started. |

| 2026-11-01 20:35 | Reviews done; fix round | Reviews wf_b4cf4f54-7c4 (description, security, UX from code; capture cut off). Fix round wf_aabddb31-b59 and before re-run wf_12938616-543 started. |
| 2026-11-02 01:15 | Fix round committed | wf_aabddb31-b59 fixes + checks done; suite stopped by the limit in e2e, resumed after a machine restart; b8654622 local, WIP ref -2; before re-run done (wf_6dc4c594-2c1). |
| 2026-11-02 01:35 | Fix round pushed | Suite green (e2e 67, db 9,298); b8654622 pushed; UX review with shots wf_055bfbb1-e76 started. |

| 2026-11-02 02:00 | Base merged | UX review with shots (UXR2-01 applied); #83 merged in (ab68af87, pushed); verification wf_1b56253c-138 started. |
| 2026-11-02 02:20 | Merged | #92 merged as 4eaf7124 (head ab68af87) after the fresh-clone verification and CI green; worktree removed; item done. |
| 2026-11-02 02:55 | Push runs read | 4eaf7124: all green (ci on its second attempt after an unrelated csv-arena timeout). Session done. |
