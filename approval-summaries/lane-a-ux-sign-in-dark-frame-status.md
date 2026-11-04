ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T17:55Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 11:45Z ("then, if time remains").

# Item: the dark sign-in frame's links (`co-001/ux-sign-in-dark-frame`)

Source: UX PR 7's delta check, UXD-N1 (`approval-summaries/lane-b-ux-sign-in-recovery-review-ux-brand.md`): with
data-theme="dark", the sign-in frame stays Paper (#F6F4EE) while --pw-link turns #8FB3F0, so the frame's links read at
about 1.9:1, and its h1s, lockup and Help heading are faint too. This was so on the base before #108.
Scope (orchestrator): fix it within .claude/rules/brand.md, choosing an existing token that meets 4.5:1, with one UX and
brand review (with shots). No new palette value (a new token is the brand owner's, ADR 0056/0058).
Pipeline: design (the token choice, with measured ratios), build red first, before and after shots, draft PR, one UX and
brand review with a skeptic per B/S finding, one fix round with the full suite once, verification, merge.
GITLEAKS RULE: an agent that meets a gitleaks refusal rewrites the flagged text and never touches .gitleaksignore.

## Log (UTC)
- 2026-11-04T17:55:00Z: branch on origin at 9b237a93 through the hook; worktree /home/user/ux-dark-frame, installed. No CSS
  file is in the capacity-watched list. Next: the item workflow.

- 2026-11-04T18:00:00Z: item workflow wf_85a93b20-bdd launched (design with measured ratios; build red first; before and after
  shots; draft PR; one UX and brand review with skeptics; one fix round with the full suite; verification); script archived.

- 2026-11-04T20:10:00Z: **draft #116**, head **f5676fae** (wf_85a93b20-bdd, 5 agents). Design (`designs/lane-a-ux-sign-in-dark-frame.md`):
  option (a), the frame takes the dark ground in dark: `bg-paper dark:bg-bg` at sign-in/layout.tsx:11. No token added and
  no hex restated; light is unchanged; the lowest ratio after the change is 8.39:1 (links 8.53, h1 16.78, muted 8.39, focus
  8.53, up from 1.02-1.97). Red first: the new `expectAccessibleInDark` (axe in dark) and `focusContrast` in e2e/a11y.ts,
  with brand.spec.ts and sign-in-time.spec.ts cases. One UX and brand review: 2 nits; N1 (dark Paper vs dark ground is the brand
  owner's call under ADR 0056:134) recorded for the brand owner in the PR body; N2 (three more screens in the dark axe run)
  fixed. Base 17641c88 merged once; full suite green apart from the known `threads.test.ts` 5 s timeout (not this PR's;
  3/3 alone); e2e 78; CI green on f5676fae. Verification: **RE-MERGE NEEDED** only (base moved to 30871f72). Plan: after
  test-flakes-5 (which also edits e2e/a11y.ts) merges, merge the base into #116 once (keeping both helpers), push, CI, merge.

## Waiting on someone
- The brand owner (not blocking): dark sign-in keeps Paper or takes the dark ground (ADR 0056:134); #116 takes the dark
  ground, within BRAND.md section 4.

## Next step
The item workflow.
