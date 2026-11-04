# PR #108 (UX PR 7, sign-in recovery): the security review of the build, on 6b25ed60

Adversarial security review in a fresh clone (scratchpad sgn7c/clone-security), merge-base df4daff7. Its record is its
progress file (sgn7c/progress/review-security.progress.md); no finding reached this fix round as confirmed by a skeptic
(the round's confirmed, refuted and sound lists were empty). Dispositions are in the fix round's summary.

## What it raised
- **S-A.** SEC-B1 is enforced only in the app: the Cognito app client is public (`generateSecret: false`,
  `infra/lib/constructs/identity.ts:114`) with `AccountRecovery.EMAIL_ONLY` (:91), so a caller with the client ID can
  run ForgotPassword and ConfirmForgotPassword directly, past the gate and the app's rate limit; a Cognito CONFIRMED
  user with no factor is exposed (ADR 0081 "Not covered"). Infrastructure, Lane A's file: proposal P-1.
- **S-B.** Checker S-3 still as built at 6b25ed60. Answered by the session's ruling (1): fixed in f2aacae4.
- **N.** The confirm does not re-check the gate (a factor cleared within the code's hour): proposal P-2, for UX PR 65.
- **N.** The floor does not pad a run over it (the Cognito tail on enrolled accounts only): acknowledged in the ADR.
- **N.** The head lacked the current base: merged in the fix round (24531dc2).

## What it checked and found holding
The reset request and confirm routes, the flow, both providers, the sealed pending step, the public-route guard
(origin check, rate limit).
