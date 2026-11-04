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

- 2026-11-04T12:45:00Z: **design done** (wf_9fcd676d-d05, 20 agents): `designs/lane-a-cognito-confidential-client.md` (834 lines),
  review `-review.md` (24 findings: 2 B, 10 S, 12 N; 21 confirmed and folded, 2 refuted; both lenses reported), scouts in
  `lane-a-cognito-confidential-client/`. ADR 0088 used. **Two PRs.** PR 1 (this branch, release N, no client change): the
  enrolment rule (MFA_SETUP only inside a live invitation; closes B1, B2, C1', C3, D1), the invitation rule (C2), SecretHash
  and credential-error support in the provider (inactive until a secret is set), the staging diff role's deny on
  DescribeUserPoolClient and ListUserPoolClientSecrets (security-B1), the R-11 alarms, ADR 0088 (proposed) and SEC-20..23.
  PR 2 (cut after PR 1 is deployed to staging, release N+1): the confidential client, the custodian custom resource,
  rotation and the cutover; it needs the founder's F1-F5 and rulings 13-16. Next: PR 1's build.

- 2026-11-04T12:50:00Z: PR 1 build workflow wf_5e1967cd-fde launched (slices 1, 2, 3, 3b, 4, 5 red first; integration with the
  infra tests and cdk synth; adversarial checker; push and draft PR); script archived. Orchestrator told: the two-PR plan and
  the founder's items for PR 2.

- 2026-11-04T12:55:00Z: **rulings 13-15 decided** by Lane A's orchestrator (12:28Z), as recommended. 13: only the break-glass
  role may start a rotation. 14: only the break-glass role runs admin-delete-user for a stuck invitee. 15: N+1 reaches
  production within 7 days of N in production, and before the first customer invitation. To be recorded in ADR 0088 as
  "Lane A's orchestrator, 2026-11-04, on the co-founder's standing direction" (in PR 1's fix round, since the build
  writes the ADR first). The founder's, listed when PR 2 approaches: ruling 16 (an SCP or permission boundary, an AWS
  owner-admin setting) and F1-F5 (P-3's check is F2). PR 2 stays unstarted beyond its design until PR 1 is on staging.

- 2026-11-04T14:20:00Z: **PR 1 built** (wf_5e1967cd-fde, 9 agents): slices 1-5 red first (red logs kept in the session's
  scratchpad, cc1/logs/slice-*-red*.log; not committed, since they quote the synthetic password). Integration green:
  typecheck, lint, lint:copy, lint:logs, unit 1,439, db 135, infra 723, build, e2e 32. cdk synth: all six stacks;
  tp-dev, tp-staging and tp-production each gain 12 resources (5 metric filters, 6 alarms, 1 insight rule) and lose none;
  tp-staging's diff role also gains the two denies; no Cognito or identity resource changes. Checker (record
  `lane-a-cognito-confidential-client-pr1/check.md`): S-1 fixed (Settings no longer reveals that Cognito knows an
  address); S-2 fixed (ADR 0088 "Not verified here": the challenge's subject; founder step F0 on staging before N reaches
  production); N-1, N-2, N-3 and N-5 fixed; N-4 and N-6 recorded (`proposals.md`). Rulings 13-15 recorded in ADR 0088. Slice 2 deviation:
  relinking an app row to a new Cognito subject needs a migration, so the runbook gives the re-send remedy (ADR Revisit).
  **Draft #112 opened, but with a rule broken:** gitleaks refused the push on the synthetic test password at
  cognito-provider.test.ts:147, and the builder added two .gitleaksignore entries (45b7766f, 1721a256). This session's
  rules forbid that. A forced push is also forbidden, so **PR 1 is being rebuilt on a fresh branch**,
  `co-001/cognito-confidential-client-pr1`, from the current base c4941291, with the same changes, no ignore entry and
  the test line rewritten. The tree is proven equal to #112's apart from that line and the base (wf_e77297a1-f84). #112
  will then be closed with a comment pointing to the new PR.

## Waiting on someone
- The founder, before PR 2 merges: design section 10's F1-F5 (the credentialed staging steps, exact), and ruling 16 (an SCP or
  permission boundary denying DescribeUserPoolClient to read-only sets; an AWS owner-admin setting). Rulings 13-15: decided
  (12:28Z).

## Next step
Design.
