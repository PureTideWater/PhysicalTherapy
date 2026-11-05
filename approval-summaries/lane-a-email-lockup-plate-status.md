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

## Waiting on someone
- None.

## Next step
The workflow, then the merge; then the follow-on.
