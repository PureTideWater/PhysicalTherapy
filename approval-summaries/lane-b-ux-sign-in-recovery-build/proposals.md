# Proposals from #108's fix round (not changes in this PR)

## P-1. Close SEC-B1 at Cognito, not only in the app (security review round 2, S-1, confirmed by a skeptic)
- What. The pool's app client is public (`generateSecret: false`, `infra/lib/constructs/identity.ts:112-115`, with
  `authFlows` user and userSrp) and `accountRecovery` is `EMAIL_ONLY` (`identity.ts:91`), with `mfa: REQUIRED`
  (`identity.ts:78`). Anyone who learns the client ID (an identifier: the environment's COGNITO_CLIENT_ID, stack
  outputs, any ID token's `aud`) can call `ForgotPassword` and `ConfirmForgotPassword` directly, past the app's SEC-B1
  gate, its `sign_in` rate limit and the `password_reset_*` audit, and no app session is revoked. A Cognito
  `CONFIRMED` user with no factor (ADR 0081 "Not covered") can then be taken over by a mailbox holder: the next
  sign-in is answered `MFA_SETUP`, and the app's own enrolment takes the attacker's TOTP and, for an internal role,
  their hardware key. The code can also be redeemed on the app's own confirm route, which does not re-check the gate
  (P-2). The same client lets a caller run `InitiateAuth` directly, past the app's ten-failure lock (only Cognito's
  own lockout applies).
- On the base. `git diff 24531dc2..HEAD -- infra` is empty: the gap was on base 24531dc2, before #108, and the base
  app had no reset path at all. #108 creates no new exposure and is not blocked on this.
- Why not here. `infra/lib/constructs/identity.ts` is Lane A's file (#42), and the change is infrastructure, which #108
  keeps unchanged.
- Options for Lane A.
  - (c), preferred: a confidential client (`generateSecret: true`). The secret in Secrets Manager, read by the web role
    only; a rotation plan (a new client and a cutover, since a Cognito client secret cannot be rotated in place); and
    a `SecretHash` on every `InitiateAuth`, `RespondToAuthChallenge`, `ForgotPassword`, `ConfirmForgotPassword` and
    `RevokeToken` call in `apps/web/src/lib/auth/cognito-provider.ts` (a follow-up app PR; the dev twin mirrors it).
    It closes the whole class, the direct `InitiateAuth` route around the lockout included.
  - (a), corrected, as defence in depth (it also covers console-initiated flows): a `CustomMessage` trigger that
    refuses on `triggerSource` `CustomMessage_ForgotPassword` unless `AdminGetUser` shows a TOTP MFA preference. It
    needs a `cognito-idp:AdminGetUser` grant on the pool (the IAM pin test updated). The refusal reaches a direct
    caller as `UserLambdaValidationException`, which tells no-factor accounts apart from unknown addresses (answered
    with success under `preventUserExistenceErrors`): accept that, or pair (a) with (c).
  - (b) `accountRecovery: NONE` and the reset done server-side with `AdminResetUserPassword` behind the app's gate
    (needs an `Admin*` grant and the IAM pin test updated).
  - Not a Pre-authentication trigger: Cognito runs it on sign-in flows (`InitiateAuth`, `AdminInitiateAuth`) only,
    never on `ForgotPassword`.
- Text #108 carries. ADR 0081's amendment: A2 qualified ("the app asks the provider for a code only for an account
  that already has a second factor (on the app's path; see Not covered)"), a Not covered bullet naming the route, the
  takeover chain, that it was so on base 24531dc2 and that closing it is Lane A's (P-1), and a Revisit when line. The
  PR body's "The SEC-B1 gate" and "Left to others" say the same and that it does not block the merge.

## P-2. Re-check the gate on confirm (security review note)
- `confirmPasswordReset` does not re-read `mfa_enrolled`; a factor cleared within the code's hour (UX PR 65's console
  reset) would let a code mailed before it still reset. UX PR 65 should end any live reset (or the confirm re-check
  the gate) when it clears a factor. Left to UX PR 65, which owns that path.
- Round 2 (N-1). Kept as recorded. When UX PR 65 lands, either end live codes on a factor clear or re-check
  `active && mfa_enrolled` before the provider on confirm; a refused account then answers the one `CODE_REFUSED` at a
  wrong code's timing, padded like the request. This alone does not close P-1: `ConfirmForgotPassword` can still be
  called directly. #108 carries it in ADR 0081's Not covered and Revisit when.

## P-3. Count Cognito's per-code cap in the founder's pool smoke check (security review round 2, N-2)
- The production bound on reset-code guessing rests on Cognito's `ConfirmForgotPassword` cap (a
  `LimitExceededException` after some number of wrong codes), which no one has verified; the dev twin's five tries
  model it. The smoke check should count the wrong codes before that exception, and read the
  `password reset request timed` p99 against the 1,500 ms floor (N-3). Keep the per-user alarm on
  `password_reset_requested` (A4). #108 carries this in ADR 0081's Not verified here and Revisit when.
