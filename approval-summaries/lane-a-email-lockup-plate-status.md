<!-- RESUME-BLOCK (2026-11-05T08:00Z, acting S4 stood down: Lane A's account at 99% weekly usage; Lane B resumes from 2026-11-06 19:00 UTC) -->
## RESUME-BLOCK
- **Branch:** `co-001/email-lockup-plate`. Local head f62265dc, NOT on the PR branch: the PR branch is still 231da9c4.
- **WIP ref:** `co-001/wip/email-lockup-plate-s4` = f62265dc, everything.
- **PR:** #129, a draft, head 231da9c4, base claude/build-platform. CI on 231da9c4 was RED: `unit` failed in
  packages/synth fixtures.test.ts "holds every row of test-matrix.md word for word" (SGN-13's synth copy). That is
  fixed at f62265dc. Unsubscribed; no check-in is pending.
- **Commits after 231da9c4:**
  - 40eae422: the plated PNGs and the generator, UX-S1 and UX-N4;
  - 01f67609: docs, UX-N1 and UX-S1;
  - 9dc0f976: ADR 0081 rewrapped, UX-N3;
  - 1fcd3115: synth SGN-13 and its fixture;
  - 3d3664b0: the base merge of 23b25ad0 (#127), clean;
  - dceba1a5: the SHA-256 pins;
  - f62265dc: the BRAND.md section 7 line.
- **Findings:**
  - Fixed: UX-S1, N1, N2 (the design note in /home/user/ops/designs/lane-a-auth-emails.md, "Ruled 2026-11-05"
    lines; check that it reached claude/build-ops), N3 and N4.
  - None open.
  - The orchestrator, as the brand owner's delegate, CONFIRMED the derived art (07:43Z) with four conditions; all
    four hold at f62265dc.
- **Not done:** the full suite on f62265dc. It was started twice and stopped for the stand-down; only typecheck
  passed.
- **The exact next step:**
  1. Run setup if needed.
  2. In a worktree at the WIP ref, `git fetch origin claude/build-platform`; if it moved past 23b25ad0, merge it
     once.
  3. Run the full local suite once. The script is scratchpad plate/suite2.sh, which may be gone; it is the
     standard list plus `pnpm --filter ./infra test`.
  4. `git push origin HEAD:co-001/email-lockup-plate`.
  5. Update #129's description. The fix agent's round-2 draft is in scratchpad plate/pr-body.r2.draft.md, which
     may be gone. It needs:
     - `{{SUITE}}` replaced with the suite results;
     - the SGN-13 synth fix, the #127 merge, the SHA-256 pins and the BRAND.md line added;
     - the last "Pending" review row changed to done;
     - the UX-S1 row's "needs confirmation" changed to "confirmed by Lane A's orchestrator, 2026-11-05 07:43Z".
  6. On green CI: ready, approval-of-record re-run, merge with expectedHeadSha.
- **Counters used:** none new (no ADR number, no test-matrix case).
<!-- /RESUME-BLOCK -->

ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-05T06:50Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 06:40Z.

# Item: email-lockup-plate (`co-001/email-lockup-plate`), a small UX and brand PR

The orchestrator decided both points, as the brand owner's delegate:
- O-5: every worker email's lockup sits on a fixed White rounded plate (full-colour lockup, not a reversed variant).
  Forced inversion in email clients is undetectable and inconsistent.
- O-8: the reset code email adds "If you asked more than once, use the newest code." ADR 0081's staging smoke list
  gains a check on whether a first code still works after a second request.
Process: one UX and brand review with inverted-client renders, then CI and the merge. It goes before the follow-on
co-001/password-changed-notice.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-05T06:50Z: started. Worktree /home/user/email-plate from 0f4a5ed5 (#125). The workflow's script is archived
  as workflow-scripts/lane-a-email-lockup-plate.js.

- 2026-11-05T07:45Z: workflow wf_80ea358c-97c.
  - Draft PR #129: the table plate, the newest-code sentence, red first.
  - The UX review found UX-S1: forced inversion inverts the plate cells too.
  - The fix round made new plated PNGs (the delivered art composited onto an opaque White plate inside the image),
    written by tools/brand-email-plate and held pixel for pixel by a test. Its agent returned early: 3 commits
    unpushed, the suite unfinished.
  - CI on 231da9c4 was red: SGN-13's synth copy was not updated. I fixed it (synth matrix.ts and its fixture) and
    merged #127 (23b25ad0).
- 2026-11-05T07:55Z: the orchestrator, as the brand owner's delegate, confirmed the derived art, with conditions:
  - versioned file names (kept);
  - each img keeps width, height and alt "PaidWhole" (holds);
  - input and output SHA-256 pinned in the test: dceba1a5, which fails on a one-byte change;
  - BRAND.md section 7 calls it a derived plate composite, generated, never hand-edited: f62265dc.
  The full suite is running on f62265dc.

## Waiting on someone
- None.

## Next step
The suite on f62265dc, the push and the description, CI, then the merge. Then the follow-on.
