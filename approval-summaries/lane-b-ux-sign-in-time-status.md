# Lane B: ux-sign-in-time status (co-001/ux-sign-in-time)

The UX baseline review's PR 6: each sign-in step says how long it stays open, warns before it closes, and starts again
with the email kept (UX-012, UX-128; C-007 "now" part, C-042's step marker on the invited path). Run by
session_01FcouKNxVRK8x6iV52PfxXz, a Lane B item session started 2026-11-01 by Lane B's orchestrator
(session_01FcouKNNHsdecRMzfTs7XwW); item prompt `lanes/lane-b-item-prompts-2026-11-01/ux-sign-in-time.md`. UX PR 7
(`co-001/ux-sign-in-recovery`) and UX PR 8 get their own sessions later; this one leaves design 3.5's hooks for PR 7.
GitHub login: PureTideWater.

## Now (2026-11-02 02:00 UTC): head ab68af87 (base merged); description + fresh-clone verification running
- **Shots-based UX and brand review** (wf_055bfbb1-e76): after shots at b8654622, 81 of 81 ids, 0 skips (tour fix ddd6fd1f:
  Start again by link or button); before at bce57f16 in screens-before-2. Findings: UXR2-01 (should-fix, upheld: a closed
  enrolment's setup key still looked usable) applied; UXR2-02 (dark-only contrast of the marker) refuted (no dark switch,
  ADR 0056), an advisory for the dark-mode work.
- **Fix 2 + base merge** (wf_5971145f-281): d557f7d9 (UXR2-01: "This step and its setup key have closed."), ab68af87
  merge of claude/build-platform 43565235 (#83), clean, tree identical to git's own merge; checks on the merged tree all
  pass (unit 6,959; db 30 targeted; harness 14; e2e sign-in-time + screening-phone 5/5). Pushed ab68af87. CI was green on
  e4e05a0d and b8654622.
- **Running:** wf_1b56253c-138 (the description rewritten for the final head and checked; the fresh-clone verification
  reading CI on ab68af87). Then: mark ready, wait for approval-of-record's re-run, merge with expectedHeadSha (20:36
  ruling: merge when verified and green).
- **Pushed** b8654622 to #92 (one push). The full local suite passed on it: install, check:fixtures, typecheck, lint,
  lint:copy, lint:logs, verify-content, engine-freeze, watched paths, synth; unit 6,932; golden 376; oracle 687; db 9,298
  (4 shards); build + stamp; e2e 67 (34 + 33, E2E_PREBUILT=1, the real 3-minute test 3.1 min); Stryker: no money path,
  gate passed.
- **Running:** after shots at b8654622 + the UX and brand review with before/after shots + a skeptic per finding
  (wf_055bfbb1-e76; script `workflow-scripts/lane-b-ux-sign-in-time-ux-review-wf_055bfbb1-e76.js`, args {head: b8654622}).
- **Fix round** (wf_aabddb31-b59): SEC-01 (Start again is a POST through the new sign_in.restart route: it ends the
  pending step and releases a key registration's grant, keeps the email; ADR 0081 rewritten), SEC-02, UXS-02..05 applied
  with tests; SEC-03 and UXS-01 recorded as not applied (design section 9, PR #92 table). Two skeptics, then a re-fix.
  Committed locally as b8654622 (WIP ref `co-001/wip-ux-sign-in-time-2`), not pushed yet: one push after the suite.
- **Suite:** install through test:db passed (unit 6,932; golden 376; oracle 687 agree; db 9,298 in 4 shards); the
  5-hour limit stopped it in e2e at ~22:30 UTC; the machine restarted (setup re-run 01:05 UTC). Resumed 01:10 UTC
  (build, stamp, e2e with E2E_PREBUILT=1, Stryker affected + gate).
- **Before shots re-run** (wf_6dc4c594-2c1): screens-before-2, 48 shots + 33 skips, all true before reasons (tour at
  ceabc9a2, with a2d62189). Lesson: a workflow agent that returns while a background run is going kills it (the earlier
  capture and a first re-run were lost this way); every capture prompt now says so.
- **Next:** the after shots + shots-based UX and brand review with skeptics
  (`workflow-scripts/lane-b-ux-sign-in-time-ux-review-pending.js`, args.head = the pushed head); a short fix round if
  it finds anything; merge the latest base (PR is `behind`; 20:36 ruling: merge when verified and green, resolving
  shared documents with any PR merged first); the fresh-clone verification; ready; merge.
- **PR #92** (draft) head e4e05a0d; CI fully green on it (all green, mutation, screening-capacity gate, approval-of-record,
  e2e 4/4 with the real 3-minute test). Description written from the template and checked (wf_b4cf4f54-7c4).
- **Reviews** (wf_b4cf4f54-7c4): security SEC-01..03, UX UXS-01..05, each with a skeptic. Verified for the fix round:
  SEC-01 (Start again left the live pending step usable; blocking, skeptic should-fix), SEC-02 (nit), UXS-02, UXS-03
  (should-fix), UXS-04, UXS-05 (nits). Refuted: SEC-03 (unreachable), UXS-01 (pre-existing; UX PR 7's, design 3.5).
  **The capture was cut off** after its tour fix (a2d62189), so the UX review ran from code only: a shots-based UX review
  runs after the fix round, on the new head.
- **Running:** fix round wf_aabddb31-b59 (fixes, two skeptics, then the full local suite once) and the before re-run
  wf_12938616-543 (screens-before-2 at bce57f16). Then: commit + one push; after shots at the new head and the UX and
  brand review with shots (+ skeptics); any of its findings in a second short fix round; the fresh-clone verification.
- **Built** (wf_01926a3e-1b8; resumed once after the 5-hour limit stopped its last agent ~18:35 UTC): slices A-D;
  integration: typecheck, lint, lint:logs, lint:copy, verify-content, unit (apps/web, synth, screening-capacity), the
  touched db tests, synth (SGN-01..04 expected.json; second run 0 written) all pass; the new e2e spec 4/4 (the real
  3-minute test 3.1 min). Conformance: 4 nits, all fixed. StepHeading hides its colon with opacity-0, not sr-only
  (Chromium spaces absolutely positioned children in a heading's name).
- **Before shots** (wf_67f26406-d45): tour additions per design 6.3 on build-ops (e4ff97a4, b957c80f); 48 shots, 33
  skips at bce57f16. Its skeptic found 5 dark ids with a generic skip reason and two outer attempt() calls without
  andDark: fixed and re-run inside the reviews workflow.
- **Running:** reviews wf_b4cf4f54-7c4 (the PR description from the template with a checker; security review; tour fix,
  before re-run, after shots, then UX and brand review; a skeptic per finding). If stopped: resume it here with
  resumeFromRunId, or rerun its unfinished stage in a new session (progress files `sgn-review-*`, `sgn-capture-after.md`,
  `sgn-pr-body*.md` in the scratchpad).
- **Decision (C-02), taken by this session:** `step-limits.ts` joins the screening-capacity watched set, so the PR commits
  the regenerated `tools/screening-capacity/watched-paths.txt` (`watched.ts --write`), although it is a #42 file: LANES.md
  rule 6 says each PR commits what its generator writes and the PR merged second regenerates it; without it `pnpm test` fails.
- **#82 merged** (base now bce57f16); the branch merges it in before the build.
- **Branch:** `co-001/ux-sign-in-time` on origin at 165c5993 with no commits of its own; fast-forwarded locally to the
  base 83d71fd6 (claude/build-platform). Worktree /home/user/ux-sign-in-time (created by setup; pnpm install done).
- **Reserved:** ADR 0081 (shared with PR 7); test-matrix SGN-01 to SGN-04 (PR 7 has SGN-05 to SGN-08); synth module
  19 (SGN). No migration timestamps. All checked free on 83d71fd6 and every open head (item prompt).
- **Sources:** `designs/lane-b-ux-review.md` section 3 (order 6), `designs/lane-b-ux-review/synthesis/prs.json`
  (order 6), the findings UX-012 and UX-128 and their sources under `designs/lane-b-ux-review/`.
- **Leaves out (recorded for Lane A):** the 15-minute Cognito session and the pending cookie's length
  (`infra/lib/constructs/identity.ts`, `infra/test/identity.test.ts`, #42 files) land in UX PR 66. The stale "three
  days" comment in `identity.ts` (INVITATION_DAYS is 7) is #42's file, for Lane A. WCAG 2.2.1 residue: audit #103.
- **Next:** after the reviews: the fix round with the full local suite (one push); the fresh-clone verification; the merge. Earlier plan: two reviews (security; UX and brand with shots), the fix round with the
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
| 2026-11-01 17:55 | Design done | wf_72aee928-c8b: sections 5-8, review R-01..R-15 (all disposed), critic C-01..C-09. C-02 decision: commit the regenerated watched-paths.txt. Next: build slices A-D. |
| 2026-11-01 20:10 | Built; PR #92 opened | Build wf_01926a3e-1b8 (all checks and the new e2e spec pass); before shots wf_67f26406-d45; commit e4e05a0d pushed; draft PR #92; reviews wf_b4cf4f54-7c4 started. |

| 2026-11-01 20:35 | Reviews done; fix round | Reviews wf_b4cf4f54-7c4 (description, security, UX from code; capture cut off). Fix round wf_aabddb31-b59 and before re-run wf_12938616-543 started. |
| 2026-11-02 01:15 | Fix round committed | wf_aabddb31-b59 fixes + checks done; suite stopped by the limit in e2e, resumed after a machine restart; b8654622 local, WIP ref -2; before re-run done (wf_6dc4c594-2c1). |
| 2026-11-02 01:35 | Fix round pushed | Suite green (e2e 67, db 9,298); b8654622 pushed; UX review with shots wf_055bfbb1-e76 started. |

| 2026-11-02 02:00 | Base merged | UX review with shots (UXR2-01 applied); #83 merged in (ab68af87, pushed); verification wf_1b56253c-138 started. |
