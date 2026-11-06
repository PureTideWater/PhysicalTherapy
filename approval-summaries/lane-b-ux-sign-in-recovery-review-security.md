# PR #108 (UX PR 7, sign-in recovery): the security review of the build, on 0bd5721a

Second adversarial security review, read only, on head 0bd5721a against base 24531dc2, with a skeptic per finding
(the first round's agents ended without output; its partial notes were sgn7c/progress/review-security.progress.md and
proposal P-1). Four findings: 1 should-fix and 3 nits, all confirmed, none refuted. Dispositions are in the fix round's
summary (round 2).

## Findings
| ID | Sev | Finding | Skeptic | Disposition |
| --- | --- | --- | --- | --- |
| S-1 | S | P-1: Cognito's public client (`generateSecret: false`, identity.ts:112-115) and `EMAIL_ONLY` recovery (:91), with `mfa: REQUIRED` (:78), let a caller with the client ID run ForgotPassword and ConfirmForgotPassword directly, past the SEC-B1 gate, the sign_in limit and the audit; a CONFIRMED user with no factor is then taken over through the app's own MFA_SETUP enrolment and, for staff, key registration. Direct InitiateAuth also goes past the ten-failure lock. On the base (identity.ts unchanged since 24531dc2). ADR A2 stated the gate as a whole-system property; Not covered left the gap out; P-1(a) wrongly named Pre-authentication | Real; corrected fix: text only in #108, P-1 rewritten (c preferred, a corrected to CustomMessage with the UserLambdaValidationException caveat and the AdminGetUser grant) | Text in #108: ADR 0081 A2 qualified, Not covered bullet, Revisit when line (2fe8d2fa, e156d948); PR body. P-1 corrected for Lane A (sgn7c/proposals.md). Does not block the merge |
| N-1 | N | The confirm does not re-check the gate, so the app's own route redeems a code that skipped it | nit | Kept as P-2 (UX PR 65), with the timing note; in ADR Not covered and Revisit when (2fe8d2fa) |
| N-2 | N | The production bound on code guessing rests on Cognito's unverified per-code cap; the twin's five tries are a model | nit | ADR Not verified here names the cap; the founder's pool smoke check counts it (2fe8d2fa); proposal P-3 |
| N-3 | N | A Cognito tail above the 1,500 ms floor falls only on enrolled accounts | nit | Accepted as stated; Revisit when: raise the floor if the timed p99 nears it (2fe8d2fa); P-3 |

## Found sound (the reviewer's record, summarized)
Enumeration (one redirect, cookies and page data for every address; the gate in the handler; audit for accounts only;
the 1,500 ms floor in a finally; S-3 built), the confirm (policy before the provider, one CODE_REFUSED, a changed hidden
email refused, no sign_in_failed), rate-limit keys (sign_in by the normalized address, the confirm bound to the sealed
one; refusals log request_id only), the sealed pending step (email only, 900 s, KEEPS_EMAIL exhaustive), sessions after
a reset (revoke and audit in one transaction, retried once, then AdminUserGlobalSignOut), CSRF (originChecked actions,
server-side `to`, no state-changing GET), logging (IDs only), no address in a URL, the dev twin (keyed hash,
timingSafeEqual, single use, an hour, five tries, 0600 outbox, refused in production outside e2e), authorization (public
by design, no tenant table, actor-scoped confirm), and no IAM or infra change.
