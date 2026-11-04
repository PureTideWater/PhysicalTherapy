# Proposals from #108's fix round (not changes in this PR)

## P-1. Close SEC-B1 at Cognito, not only in the app (security review of the build, item S-A; not confirmed by a skeptic in this round)
- What. The pool's app client is public (`GenerateSecret: false`, `infra/lib/constructs/identity.ts:114`) and `AccountRecovery`
  is `EMAIL_ONLY` (`identity.ts:91`). Anyone who learns the client ID (an identifier, not a secret) can call
  `ForgotPassword` and `ConfirmForgotPassword` directly, past the app's SEC-B1 gate and its `sign_in` rate limit. A
  Cognito `CONFIRMED` user with no factor enrolled (ADR 0081 "Not covered") could then be reset by a mailbox holder.
- Why not here. `infra/lib/constructs/identity.ts` is Lane A's file (#42), and the change is infrastructure, which this PR keeps
  unchanged.
- Options for Lane A. (a) A Pre-authentication or custom-message Lambda that refuses a forgot-password flow for a user
  with no MFA preference; (b) `AccountRecovery: NONE` on the pool and the reset done server-side with
  `AdminResetUserPassword` behind the app's gate (needs an `Admin*` grant and the IAM pin test updated); (c) a
  confidential client (`GenerateSecret: true`) with a `SecretHash` computed server-side, so only the app can call the
  public flows. (c) is the smallest; (a) also covers the console.
- Until then, the app's gate holds for the app's path only; the ADR's "Not covered" should say so.

## P-2. Re-check the gate on confirm (security review note)
- `confirmPasswordReset` does not re-read `mfa_enrolled`; a factor cleared within the code's hour (UX PR 65's console
  reset) would let a code mailed before it still reset. UX PR 65 should end any live reset (or the confirm re-check
  the gate) when it clears a factor. Left to UX PR 65, which owns that path.
