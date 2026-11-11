# Builder F (the web's sign-in flow): the build spec for `co-001/step-before-reset`

W8, 2026-11-11. From design v2 (`designs/lane-a-step-before-reset.md`: D2 to D9, D11). The design is settled and
reviewed; this file fixes the code-level choices so the flow, its tests and the other builders' work agree. Where this
file and the design differ, the design wins: say so in the report.

## 1. The database contract (builder D's migration `20261112090000_sign_in_not_before.sql`)
- `sign_in_step_began() RETURNS timestamptz`: whole milliseconds; node-postgres gives a `Date`; seal `.getTime()`.
- `sign_in_lock_account() RETURNS void`: the acting account's row lock; call it first inside a `withActor` transaction.
- `sign_in_step_refused(target_user uuid, began timestamptz, step text, request text) RETURNS boolean`: pass `began` as
  `new Date(ms)` or `null`; steps `new_password`, `mfa_setup`, `mfa`, `key`, `register_key`, `key_registered`. True is
  a refusal; when the start is at or before the mark it has already written the `security_event` row.
- `user_session.sign_in_began_at`: the session insert carries it. The insert trigger's refusal is SQLSTATE `23514`
  with `constraint` `user_session_sign_in_not_before`.
- The audit action `password_reset_outcome_unknown` (purpose `unverified_code`, the account as actor and object) moves
  the mark and sweeps the sessions, as `password_reset_completed` does.

## 2. `apps/web/src/lib/auth/sign-in.ts`
- `Pending`: `new_password`, `mfa_setup`, `mfa`, `key` and `register_key` gain `readonly began: number` (the
  database's clock when the attempt began, before its first provider call, epoch ms; docs/adr/0093 D3).
  `register_key` also gains `readonly also?: string`: the typed address's account when it is not `userId` (D5).
  `reset` is unchanged.
- `private async began(): Promise<number>`: `SELECT sign_in_step_began() AS began`; throw if it returns no value.
- `private async refusedAfterReset(accounts, began, step, context)`: for each distinct, defined account ID call
  `SELECT sign_in_step_refused($1, $2, $3, $4) AS refused` (its own statement on the pool, never inside a
  transaction scope); a `began` that is not a finite number goes as `null`. Call it for every account even after one
  refuses (each stale account gets its record). When any refuses and the step is not `key_registered`, log
  `security event: sign-in step refused after a password reset` at warn with `user_id` (the refused account),
  `request_id` and `error_code: step`. Return whether any refused. It counts no failure.
- `started()`: read `began` first (before the account read and `provider.signIn`); every `Pending` built in `after()`
  carries it. `beginKey()`: read `began` before `provider.beginKeySignIn`.
- `after()` and `authenticated()` take the attempt (`email`, `began`) and the step the answer came from (`mfa`,
  `key`, `mfa_setup`, `new_password`). A provider that authenticates on the password alone does not exist (MFA is
  required); if `started()` ever reaches `authenticated()` directly, judge it as `mfa` and say so in a comment.
- `authenticated()`, in this order: the account by the provider's subject; `no_account`/disabled; locked (each as
  today, releasing the grant); then the account the typed address names (`account({ email })`), `also` being its ID
  when it is another account; then `refusedAfterReset([account.user_id, also], ...)`: on a refusal `release(grant)`
  and `refused('expired')`. Only then `hasHardwareKey`, the `register_key` step (carrying `began` and `also`),
  `release`, and `openSession({ ..., began })`. If `openSession` throws the trigger's refusal (`staleSignIn(error)`),
  call `refusedAfterReset([account.user_id], ...)` so the refusal is recorded, and answer `refused('expired')`
  whatever it returns; rethrow anything else.
- `answerTotp`: before the provider is asked, `account({ email: pending.email })`; if it names an account and
  `refusedAfterReset([id], pending.began, 'mfa', context)` is true, `refused('expired')`. No provider call, no failure
  counted.
- `completeKey`: NO check before the provider (the key step is sealed for any typed address with no proof; a refusal
  before a valid assertion would tell an outsider that the address has an account reset inside the step's life). Say
  so in a comment. It is decided in `authenticated()`.
- `newPasswordOpen` and `enrolment` return the account they approved (or nothing), so their callers can judge it.
  `passwordChosen`, `totpSetupBegun` and `totpSetupCompleted`: after ADR 0088's own check, before the provider call,
  `refusedAfterReset([account.user_id], pending.began, 'new_password' | 'mfa_setup', context)`: `refused('expired')`.
- `beginKeyRegistration(pending, context?)` and `completeKeyRegistration`: before the provider call,
  `refusedAfterReset([pending.userId, pending.also], pending.began, 'register_key', context)`: release the grant
  (through `guarded`, as `abandon` does) and `refused('expired')`.
- `completeKeyRegistration`, after the provider answered that the key is registered: `refusedAfterReset([...],
  pending.began, 'key_registered', context)`. If true: `removed = provider.removeHardwareKey(pending.grant,
  response.id)` (any throw is `false`); log `security event: hardware key registered across a password reset` at
  error with `user_id`, `request_id`, `error_code: removed ? 'removed' : 'not_removed'`; audit
  `hardware_key_registered` only when it was not removed; release the grant; `refused('expired')`. Otherwise as today.
- `confirmPasswordReset` (D9). `PasswordResetResult` gains `{ kind: 'outcome_unknown'; code: string }` and
  `ResetResult` gains `{ kind: 'outcome_unknown' }`. On it: log `security event: password reset outcome unknown` at
  error (`user_id` or null, `request_id`, `error_code: result.code`). If the address names an account: the same
  transaction as a completed reset, with the action `password_reset_outcome_unknown` and purpose `unverified_code`
  (retried once; if it fails twice log the existing `security event: password reset sessions not ended`), then the
  provider's `globalSignOut` as after a reset (its failure logged with the existing line). Answer `{ kind:
  'outcome_unknown' }`. Never `rejected`.
- The reset's transaction, for both actions, is one helper: `withActor(pool, account.user_id, ...)`: `SELECT
  sign_in_lock_account()` first, then `revokeUserSessions`, then `recordAuditEvent`. Check how
  `infra/test/monitoring.test.ts` (around lines 112 and 152) pins the web's log lines in this file: if a pin counts
  occurrences, keep each line at one call site.

## 3. `apps/web/src/lib/auth/sessions.ts`
- `OpenSessionRequest` gains `readonly began: number` (required: no caller can forget it). `openSession`: `SELECT
  sign_in_lock_account()` as the transaction's first statement, before the device read; the session insert adds
  `sign_in_began_at` (`new Date(request.began)`).
- Export `staleSignIn(error: unknown): boolean`: a PostgreSQL error with code `23514` and constraint
  `user_session_sign_in_not_before` (see how the routes' `isPgError` reads a code).
- Every test that calls `openSession(...)` (about 35 files under `apps/web/src/lib`) passes `began: Date.now()`.

## 4. The providers
- `provider.ts`: `removeHardwareKey(grant: string, credentialId: string): Promise<boolean>` (whether it was removed;
  never throws for a refusal) and the new `PasswordResetResult` kind, each with a doc comment.
- `dev-provider.ts`: `removeHardwareKey` drops the credential with that ID from the granted record. The twin has no
  unknown outcome of its own.
- `cognito-provider.ts`: a required option `once: CognitoClient` (a client that never retries); `confirmPasswordReset`
  sends `ConfirmForgotPasswordCommand` through it and through nothing else. Its catch, in order: a refused credential
  (as today); `RESET_REJECTED` (as today); `InvalidPasswordException` (as today); an answer that changed nothing, which
  is a service exception with `$fault === 'client'`, a 4xx status and a name that does not contain `Lambda`: thrown, as
  today; anything else (no answer, a server fault, a trigger's failure): `{ kind: 'outcome_unknown', code: <the error's
  name> }`. `removeHardwareKey`: `DeleteWebAuthnCredentialCommand` with the grant's access token and the credential ID;
  any error is logged by its name, as `release` logs, and answers false.
- `apps/web/src/lib/server/services.ts`: the second client, `new CognitoIdentityProviderClient({ region, maxAttempts:
  1 })`, passed as `once`. A unit test reads its setting (`await client.config.maxAttempts()` is 1); make the seam the
  smallest that lets a test reach it.

## 5. `apps/web/src/lib/routes/sign-in.ts`
- `pendingOf`: a step other than `reset` whose `began` is not a number is no step (it returns `undefined`, so the
  route answers as for a closed step). `readPending` itself is unchanged, so Start again still releases a grant.
- `hardwareKeyRegistrationOptions` passes `contextOf(context)` to `beginKeyRegistration`.
- `resetConfirm`: `outcome_unknown` is answered as `sessions_not_ended` is: `clearSignIn`, `COULD_NOT_CONTINUE`.
- No new words anywhere a person reads. If you find you need one, stop and report it.

## 6. Tests
- `sign-in.db.test.ts`: flip the two cases titled "SGN-16, open residual (ADR 0091 D10): ..." (retitle them as closed:
  keep `SGN-16` and add `SGN-17`), and remove `step-before-reset.repro.db.test.ts`. New `SGN-17` cases: every row of
  the design's D5 table; the key step asks the provider first and is refused only after a valid assertion (a wrong key
  on a reset account still counts a failure as today; nothing before the assertion differs between a reset account and
  another); the crossed state (two rows: the address's and the subject's; the reset marks the address's; the stale
  code step is refused before the provider is asked); a reset landing between `authenticated()`'s check and the insert
  (a provider wrapper that completes the reset inside `release`): refused by the database, recorded, `expired`, no
  session; the key registered across a reset, removed and not removed (a wrapper that resets inside
  `completeKeyRegistration`); a fresh sign-in after the reset works (wait past the mark's millisecond before starting;
  never loosen a comparison); a step with no `began` is refused; an invited person's whole path still enrols and
  opens a session; each refusal's `security_event` row (purpose, request ID) and its log line and fields; no failure
  is counted by a refusal. New `SGN-18` cases: unknown after the provider applied the reset and after it did not (the
  sessions end, the mark moves, no notice is queued, the answer is `outcome_unknown`, the line with the user ID and the
  error's name); no account under the address (the line with a null user); the transaction failing twice (the existing
  not-ended line too); a definite refusal is unchanged.
- `cognito-provider.test.ts`: `confirmPasswordReset` goes through `once` and nothing else does; the classification
  for a network error, a 5xx, a Lambda-named 4xx (unknown), a throttle and an unlisted 4xx (thrown), the code problems
  (rejected); `removeHardwareKey` both ways. `dev-provider.test.ts`: `removeHardwareKey`. The routes' tests: a step
  with no `began` restarts; `outcome_unknown` answers the generic words and clears the step. `pending.test.ts` if it
  pins the sealed fields.
- `apps/web/e2e/sign-in.spec.ts`: SGN-17's journey: a second browser context holds the code step; the first context
  resets the password; the second's code lands on the "Sign-in step closed" notice and no session opens.
- Use `sign-in.db.test.ts`'s own constants for passwords and seeds (a new constant named for a password with a
  high-entropy value trips the pre-push secret scan).
