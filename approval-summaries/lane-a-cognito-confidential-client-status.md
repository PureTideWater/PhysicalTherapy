ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAfByN2caCea4jgSdu) holds this item from 2026-11-04T11:50Z, assigned by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) at 11:45Z.

# Lane A item: cognito-confidential-client (`co-001/cognito-confidential-client`), security priority

Source: UX PR 7's P-1 (`approval-summaries/lane-b-ux-sign-in-recovery-build/proposals.md`), confirmed by #108's security
review and its skeptic. Cognito's app client is public (`generateSecret: false`, `infra/lib/constructs/identity.ts`) with
EMAIL_ONLY recovery, so anyone with the client ID can call ForgotPassword, ConfirmForgotPassword and InitiateAuth directly,
past the app's SEC-B1 gate, rate limit, audit and lockout. A CONFIRMED user with no factor can then be taken over through
the app's MFA_SETUP enrolment. It was on the base before #108; ADR 0081's "Not covered" records it.
Scope (orchestrator, 11:45Z): a confidential client with SecretHash (the secret in Secrets Manager, readable by the web
role only); close the MFA_SETUP takeover path for a CONFIRMED user with no factor; P-3 (Cognito's per-code attempt cap,
a test or a staging check where it can be shown); R-11 (alarms on reset requests per user and on undelivered requests) if it
fits the same infra change.
Counters: ADR 0088 if it needs its own (else an ADR 0081 amendment); test-matrix SEC-20 to SEC-23.
Pipeline: design (scouts, writer, security and infra/auth design reviews, skeptics, fold); build red-first; draft PR; two
adversarial reviews (security-reviewer; infra and auth correctness), each finding checked by a skeptic; one fix round with
the full suite once, the infra tests and cdk synth; verification; the up-to-date rule; merge.
Founder: a credentialed staging step (exact steps) goes to the founder's list.
Then, if time remains before 2026-11-06 18:30 UTC: the dark sign-in frame's links (about 1.9:1; an existing token that
meets 4.5:1; one UX and brand review); the branded code email and the "password changed" email (one UX item).

## Log (UTC)
- 2026-11-04T11:50:00Z: branch created on origin at 45d7d0c1 (#108's merge) through the hook; worktree /home/user/cognito-cc,
  installed. ADR 0088 free; SEC-20..23 unused. Next: the design workflow.

- 2026-11-04T11:55:00Z: design workflow wf_9fcd676d-d05 launched (3 scouts: infra and IAM, provider, takeover path with P-3 and
  R-11; writer; security and infra/auth design reviews; skeptics; fold); script archived.

## Waiting on someone
- The founder: a credentialed staging step (to be written with exact steps).

## Next step
Design.
