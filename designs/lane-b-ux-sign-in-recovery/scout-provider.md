# Scout: the provider and security for UX PR 7 (forgotten password)

Base df4daff7, worktree /home/user/ux-sign-in-recovery. Read only. Confidence marks: **[code]** read in the repo at
base; **[AWS]** Cognito behaviour from AWS's documented API (no user pool reachable here, so not exercised; the
"Not verified here" section of the ADR amendment should list these); **[rec]** my recommendation.

## 1. What the infra already sets (infra/lib/constructs/identity.ts) [code]

User pool:
- `selfSignUpEnabled: false`; `signInAliases: { email: true }`; `signInCaseSensitive: false`; `autoVerify.email`;
  email required and mutable. AdminCreateUser sets `email_verified=true` (cognito-provider.ts:330-333).
- `mfa: REQUIRED`, `mfaSecondFactor: { otp: true, sms: false, email: false }`; passkeys allowed as first factor
  (`allowedFirstAuthFactors: { password, passkey }`, user verification REQUIRED).
- Password policy 12+ chars, four classes (`PASSWORD_MIN_LENGTH`, mirrored by `auth/password.ts` passwordProblems).
- **`accountRecovery: AccountRecovery.EMAIL_ONLY`** (pinned in infra/test/identity.test.ts:103 as
  `verified_email` priority 1). A reset needs no pool change.
- `featurePlan: ESSENTIALS`: no threat protection (Plus), so no adaptive auth, no compromised-credential check and
  no Cognito "password changed" notification email. UserContextData would be ignored; don't send it.
- No `userVerification` block: the code email uses Cognito's default verification template
  ("Your verification code is {####}"). See section 7.
- Email: phase 1 (MailIdentitiesVerified=false) Cognito's own default sender (capped, from
  no-reply@verificationemail.com); phase 2 SES `DEVELOPER` from MailFromAddress through the **transactional**
  configuration set (bounces/complaints recorded, docs/adr/0065).

Web client (`addClient('WebClient')`):
- `authFlows: { user: true, userSrp: true }`, `disableOAuth`, `generateSecret: false` (so no SecretHash on
  ForgotPassword/ConfirmForgotPassword).
- **`preventUserExistenceErrors: true`** (pinned: identity.test.ts:129 `PreventUserExistenceErrors: 'ENABLED'`).
- `enableTokenRevocation: true` (identity.test.ts:128); access/ID 15 min, refresh 12 h, authSession 3 min.

IAM [code]: infra/test/application-role.test.ts:18-22 collects every `new Admin\w+Command(` in cognito-provider.ts and
requires it to equal `USER_POOL_ADMIN_ACTIONS` = AdminCreateUser, AdminGetUser, AdminUserGlobalSignOut
(application-role.ts:14). `ForgotPasswordCommand` and `ConfirmForgotPasswordCommand` are not Admin* and are
unauthenticated client APIs (IAM is not evaluated for them) [AWS], so the test stays green and **no IAM change**.
`AdminUserGlobalSignOut` is already granted, so it can be used after a reset with no grant change.

WAF [code]: edge.ts:62 rate rule covers path prefixes `/sign-in` and `/api/sign-in`. **Keep the new page and actions
under `/sign-in/...`** (e.g. `/sign-in/forgot-password`), so the WAF's 300-per-5-min sign-in rule covers them; a
root `/forgot-password` would only get the general rule.

## 2. Cognito ForgotPassword / ConfirmForgotPassword semantics [AWS]

ForgotPassword `{ ClientId, Username }` (Username may be the email: email alias, case-insensitive pool):
- Sends a numeric code (6 digits) to the verified email (account recovery EMAIL_ONLY), through the pool's email
  configuration (Cognito's sender, never our worker mail stream). Returns `CodeDeliveryDetails { Destination
  (masked, e.g. a***@e***), DeliveryMedium: EMAIL, AttributeName: email }`.
- The code is valid for **1 hour**; a new ForgotPassword for the same user replaces the earlier code (only the latest
  works); a code is single-use.
- With PreventUserExistenceErrors ENABLED, an **unknown username returns a simulated success** with a fake
  CodeDeliveryDetails, no `UserNotFoundException`. (Disabled, it would throw UserNotFoundException: that's why the
  pin matters.)
- Errors that can still come back for real users, and must be swallowed into the same answer (they occur only for
  existing accounts, so showing them would enumerate):
  - `NotAuthorizedException` ("User password cannot be reset in the current state"): a user in
    FORCE_CHANGE_PASSWORD, i.e. **an invited user who never set a password**. Also a Cognito-disabled user.
  - `LimitExceededException`: Cognito's per-user throttle on repeated reset requests (the exact count is not
    published; a handful an hour).
  - `InvalidParameterException`: no verified email (shouldn't happen: AdminCreateUser verifies it).
  - `CodeDeliveryFailureException`: the email couldn't be sent.
  - `TooManyRequestsException`: pool-wide quota (account recovery category); also swallow, log by name.
  - `UserNotFoundException` should not occur with the setting on; treat it the same anyway.
  - Anything else (`InternalErrorException`, `ResourceNotFoundException`, network) is our failure: rethrow, so a broken
    provider doesn't silently answer "check your email". That 500 can happen for any address, so it leaks nothing.
- **Never render or log `CodeDeliveryDetails.Destination`**: it's part of an email address, and for unknown addresses
  it's simulated, so showing it could enumerate.

ConfirmForgotPassword `{ ClientId, Username, ConfirmationCode, Password }`:
- Success returns `{}`, **no tokens and no session**. The person signs in again through USER_AUTH with the new
  password, and the pool still asks for SOFTWARE_TOKEN_MFA (or WEB_AUTHN): **MFA stays required after a reset by
  construction**. A reset doesn't change the TOTP secret, the passkeys or `user.mfa_enrolled`.
- Errors: `CodeMismatchException` (wrong code), `ExpiredCodeException` (past 1 h or replaced),
  `LimitExceededException` / `TooManyFailedAttemptsException` (too many wrong codes), `InvalidPasswordException`
  (policy), `UserNotFoundException` / `NotAuthorizedException`. With PreventUserExistenceErrors ENABLED, an unknown
  user gets `CodeMismatchException` (some API paths say ExpiredCodeException), so wrong-code answers must be one class.
- **It doesn't revoke existing refresh tokens or sign the user out** (it isn't documented to, and the API returns
  nothing that would). The application has to end sessions itself (section 4).
- With MFA REQUIRED, no `MFA_SETUP` is forced by a reset; a user who never enrolled is the invited case, which
  Cognito refuses anyway.

## 3. Enumeration and timing [rec]

A known and an unknown address must get the same page, the same status, the same cookie set and the same timing class.

Request step (`POST /sign-in/forgot-password`, input `{ email }`):
1. Zod `emailAddress` (routes/schemas.ts), origin check and rate limit through `publicRoute` (`rateLimit: 'sign_in'`,
   `rateAccount: (input) => input.email`), as `signInWithPassword` does (routes/sign-in.ts:271-276). The account
   subject is HMACed (rate-limit.ts:70-73), so no email is stored in clear.
2. `sign_in_account(email, null)` (one indexed lookup, every address).
3. **Call the provider for every address**, whatever the account looks like. Decisions about invited, disabled or
   locked accounts are *not* made by skipping the call, because a skipped call is a different timing class.
   Cognito answers unknown addresses itself, the FORCE_CHANGE_PASSWORD refusal is swallowed, and an app-disabled user
   still exists in Cognito (membership end calls globalSignOut, not AdminDisableUser), so it gets a code it can't use:
   harmless, because `start()` refuses a disabled account with the credentials answer.
4. For a known account only, `recordAuditEvent` `password_reset_requested` (section 5). This adds one short
   transaction only for known addresses.
5. **Pad the whole handler to a fixed floor** (a constant, e.g. `RESET_REQUEST_FLOOR_MS`, set above Cognito's p99 for
   ForgotPassword plus the audit write: 1,500 ms is a safe start). Measure from handler entry with the services clock,
   and sleep the remainder, so the known path's audit insert and Cognito's real email send fall inside the same class.
   Pad errors too: a provider error that is swallowed returns after the floor. The test uses an injected
   clock/sleep and asserts both paths resolve to identical results at the floor.
   - Considered and not chosen: (a) Next's `after()`, which defers the provider call past the response, so a Cognito
     failure can't be seen or rate-limit-classified, and it isn't testable through `publicRoute.invoke`. (b) A job:
     the payload would need the email (forbidden in a job payload).
6. Same answer for all: redirect to the code page (`/sign-in/forgot-password/code` or a second state of the page)
   with words like "If an account uses this address, we've emailed it a code. It works for an hour." Never "we sent a
   code to a***@...".
7. Carry the email to the code step in a **sealed HttpOnly cookie** (Sealer, like `KEPT_EMAIL_COOKIE`; e.g.
   `tp_password_reset`, life 1 h to match the code), never a URL parameter. Set it for every address. Don't model it as a
   `Pending` step. Pending is the post-password state machine whose steps all get step-limits, STEP_PAGES and a timer
   (step-limits.ts:24-38), and the code's 1-hour life has no provider challenge behind it.

Confirm step (`POST`, input `{ code: sixDigitCode, password, confirm }`, email from the sealed cookie, or a typed email
when the cookie has lapsed):
- Rate limit `sign_in` with `rateAccount` = the email, so per-address guessing is bounded at 20 per 15 min (on top of
  Cognito's own attempt cap): at most about 80 guesses in a code's hour against 10^6.
- Check `passwordProblems()` **before** calling the provider (as `setNewPassword` does, cognito-provider.ts:201-204),
  so a policy failure is answered identically for any address without touching Cognito. `InvalidPasswordException` from
  Cognito anyway gives the same `passwordIssue([])` words.
- Map CodeMismatch, ExpiredCode, LimitExceeded, TooManyFailedAttempts, UserNotFound and NotAuthorized to **one**
  refusal on the `code` field: "That code didn't match or has expired. Ask for a new code." An unknown address and a
  known address with a wrong code can't be told apart.
- **Don't count a wrong reset code in `sign_in_failed`**: no lockout from reset codes. Counting would add a DB write
  only for known accounts (a timing difference) and let anyone lock a victim with ten wrong codes without even a
  password guess. Cognito's attempt cap and the sign_in bucket bound guessing. No audit on a wrong code, since
  unknown addresses have nothing to audit.
- The success path is reachable only with the mailed code, so it may differ in timing.

## 4. Sessions after a reset [rec]

On ConfirmForgotPassword success, in the sign-in service (new `SignInFlow.completePasswordReset`):
1. `sign_in_account(email)`; if there is an account:
2. `withActor(pool, userId, scope => revokeUserSessions(scope, userId))`. `revoke_user_sessions()` admits
   `target_user = app_actor_id()` [code: packages/db/functions/revoke_user_sessions.sql], so this needs no migration.
   It ends every open `user_session` with end_reason `revoked`, so a thief's open session dies on its next request
   (resolveSession re-checks every request). Audit `password_reset_completed` in the same transaction, `purpose`:
   e.g. the count class, or none.
3. `provider.globalSignOut(cognito_sub)`: Cognito `AdminUserGlobalSignOut`, already granted. It revokes any Cognito
   refresh/access tokens still alive (key registration's 15-minute grant). This is the precedent at settings.ts:1085-1089
   (revokeUserSessions then globalSignOut). The dev provider's is a no-op, which is fine because dev grants are sealed
   and short.
4. Do **not** unlock: `unlock_user` stays a platform administrator's (UX-066's words point to support). Do not
   reset `failed` counters (`sign_in_succeeded` does that at the next real sign-in). Do not touch devices: a device
   isn't trusted for MFA (device tracking is off), so a known device still asks for the code.
5. A security log line with IDs only: `logger.warn('security event: password reset completed', { user_id, request_id })`.
   Don't add it to `SIGN_IN_BURST_MESSAGES` (infra/lib/security-events.ts:9); that would be an infra alarm change.
6. Redirect to `/sign-in?reason=password_reset` (a new `SIGN_IN_REASONS` code, routes/sign-in.ts:40) with the kept
   email filled in (reuse `writeKeptEmail` / the `readKeptEmail` branch in signInPage, which today reads it only for
   `step_expired`/`restarted`). The notice says the password changed, every other session was signed out, and the next
   step asks for the code from the authenticator app or the key. Clear the reset cookie.
- A locked account: the reset still completes (the person proved the mailbox). The sign-in attempt then shows UX-066's
  locked notice with the support address. No special answer at request time.
- Invited accounts never reach here (Cognito refuses at request time; the dev twin mirrors). The help line covers them:
  "use the temporary password from your invitation".

## 5. Audit events and logging [code + rec]

- `recordAuditEvent` accepts any lowercase code as `action` (packages/db/src/authz/audit.ts:12, :102-121). There's no
  enum and no DDL. Names: **`password_reset_requested`** and **`password_reset_completed`**, `objectType: 'user'`,
  `objectId: userId`, `requestId`, through `withActor(pool, userId, ...)`. This is the same pattern as
  `password_changed` (sign-in.ts:97-99, :193), which is also written before any session exists.
- **`record_security_event()` can't be called by the app**: packages/db/functions/record_security_event.sql revokes it
  from PUBLIC and grants no EXECUTE to tp_app (only triggers call it). The design text (UX-006 fix part 1) assumed it;
  using it would need a migration (Lane A, schema gate). Recommendation: the two plain audit events above, which need no
  migration. Record in the ADR that the weekly review reads them by action, or hand Lane A a later migration that
  admits them as `security_event` rows.
- The insert policy requires `actor_id = app_actor_id()` (migration 20261015140500 :47-51) and the actor CHECK requires a
  non-null actor for non-system kinds, so an **unknown address can't be audited** and isn't. That's fine: there's
  nobody to audit, and it isn't visible to the requester.
- The request event's actor is the account *named*, not a proven person (anyone can type the address). Say so in its
  `purpose`, e.g. `purpose: 'unverified_request'` (a code). The completed event's actor did prove the mailbox
  (`purpose: 'email_code'`).
- Logs: IDs and codes only. Never the email, the code, the masked Destination, or a Cognito `error.message` (log
  `error_code: error.name` plus `request_id`, and `user_id` when known). The cookie value isn't logged either.
  `pnpm lint:logs` applies.

## 6. What the dev provider must mirror (dev-provider.ts, dev-store.ts) [rec]

New AuthProvider methods (names illustrative): `requestPasswordReset(email): Promise<void>` and
`confirmPasswordReset(email, code, newPassword): Promise<{ kind: 'reset' } | { kind: 'rejected' } | { kind: 'invalid_password'; problems }>`.
In Cognito, `ForgotPasswordCommand`/`ConfirmForgotPasswordCommand` with the error mapping in section 2. Don't name them
`Admin...` (the IAM test).

DevAuthProvider twin:
- Unknown email: no code and no error (the simulated success). The record is `temporary` (invited): no code and no
  error (Cognito's FORCE_CHANGE_PASSWORD refusal, swallowed).
- Known: a 6-digit code from `crypto.randomInt(0, 1_000_000)` zero-padded. Store only a **hash** in the record (e.g.
  `sealer.sign('dev-reset', code)` hex) with `resetExpiresAt` (now + 1 h, a named constant
  `PASSWORD_RESET_CODE_SECONDS = 3600` beside the step limits) and `resetAttempts`. A new request replaces it.
  Single use. A wrong-attempt cap (e.g. 5) mirrors Cognito's LimitExceeded and invalidates the code.
- Confirm: `passwordProblems` first; unknown email, a wrong, expired or used code, or over the cap all give the same
  `rejected`. Success sets `passwordHash` (scrypt, `this.cost`), clears the reset fields, and **keeps `totpSecret`,
  `totpLastStep`, `credentials` and `temporary: false`**, so the next sign-in asks for MFA.
- `DevUserRecord` gets the reset fields as **optional** (`resetCodeHash?`, `resetExpiresAt?`, `resetAttempts?`), so
  existing store.json files and the seed still load.
- Delivery: a new option (e.g. `deliverResetCode(email, code)`) beside `deliverInvitation`, wired in
  apps/web/src/lib/server/services.ts:121-126 and in the two test constructors (routes/route-tests/world.ts:262,
  screening/test-support/page-services.ts:47). **Write it to a sibling directory, not the existing outbox**:
  apps/web/e2e/onboarding.spec.ts:41-52 reads *every* entry of `<E2E_DEV_AUTH_DIR>/outbox` without a `.json` filter and
  casts each to `{ email, temporaryPassword }`. A subdirectory there would make `readFileSync` throw EISDIR, and a
  same-email reset file would come back as `last` with no temporaryPassword. So use e.g. `<auth dir>/reset-outbox/<ts>-<uuid>.json`
  `{ email, code }`, mode 0600, which the new e2e step reads. The dev outbox is local, synthetic accounts only.
- The dev `globalSignOut` stays a no-op. Application sessions are ended by `revoke_user_sessions` in both providers.

## 7. Where the code email goes, and its words [code + rec]

- Cognito sends it, **not our mail stream**: no worker job, no `mail.ts` template, no notification row. In phase 2 it
  leaves through SES with the transactional configuration set (bounces recorded); in phase 1 through Cognito's capped
  default sender (about 50 a day for the account, shared with invitations), which is acceptable before customers exist.
- Its words today are Cognito's default ("Your verification code is {####}."), unbranded. Branding it means
  `userVerification: { emailSubject, emailBody, emailStyle: CODE }` in identity.ts (the same template Cognito uses for
  forgot-password codes absent a CustomMessage trigger), plus an identity.test.ts pin. Both are infra and watched files,
  and the template is shared with attribute-verification codes. **Recommend Lane A or a follow-up, not this PR**: the
  reset works and leaks nothing without it, and the page tells the person what the email looks like ("an email from
  <MailFromAddress> with a six-digit code").
- No "your password was changed" email exists (Essentials sends none). Best practice is to send one. If wanted, it's a
  worker job whose payload carries **user_id only** (the worker reads the address), on the transactional stream.
  Name it for the lead and founder as a follow-up. It's not in this PR's file list.

## 8. Rate limits [code + rec]

- Both reset actions use `sign_in` (address 30 per 5 min; account 20 per 15 min, rate-limit.ts:41), per the
  constraint and design (no new bucket: rate-limit.ts is #42's). Consequence to state in the ADR: reset requests and
  sign-in attempts for the same address share one 15-minute count. A burst of reset requests from an attacker can
  hold a victim's sign-in for up to 15 minutes, as wrong passwords already can. The refusal is the same for known and
  unknown (it's counted on the HMAC of whatever was typed).
- Mail bombing is bounded by the account count (20 per 15 min) and, beneath it, Cognito's per-user LimitExceeded, which
  is swallowed.
- The `rate_limited` outcome must be answered alike for both steps (the existing `retryMinutes` sentence).

## 9. Things the implementer should know

- `REJECTED` in cognito-provider.ts:87 already treats `PasswordResetRequiredException` as a wrong password at sign-in.
  Nothing sets RESET_REQUIRED today, so leave it.
- Public routes (`publicRoute`) open no practice scope. The reset touches no tenant table: `sign_in_account` and
  `revoke_user_sessions` are SECURITY DEFINER, and the audit is actor-scoped. So "a practice-scoped transaction where it
  applies" doesn't apply. The Zod schema, origin check, rate limit and audit do. Authorization is the mailed code
  (checked by the provider) plus Postgres's own check in `revoke_user_sessions`.
- UXS-01 (from #92): the closed hardware-key step's redirect should land on the key surface, fixed in
  `lib/routes/sign-in.ts` (`verifyHardwareKey`'s `RESTART` and `settle`'s `expired` when `from?.step === 'key'`, a
  `KEY_RESTART`), not in components/hardware-key.tsx, with a database test. It isn't a provider question, but it's the
  same file.
- ADR 0081's "Revisit when" names UX PR 7 as its amender. The amendment should state: the reset cookie's 1-hour life
  (Cognito's code), that it isn't a timed `Pending` step (no warning or timer), the timing floor, and, under "Not
  verified here", Cognito's simulated responses, its attempt and request caps, and whether ConfirmForgotPassword
  revokes tokens (we revoke regardless).

Files read: infra/lib/constructs/identity.ts, infra/lib/platform-stack.ts (95-125), infra/lib/constructs/edge.ts (57-62,
167-193), infra/lib/security-events.ts, infra/test/identity.test.ts (pins), infra/test/application-role.test.ts,
apps/web/src/lib/auth/{provider,cognito-provider,dev-provider,dev-store,sign-in,sessions,step-limits}.ts,
apps/web/src/lib/http/rate-limit.ts, apps/web/src/lib/routes/sign-in.ts (1-380),
apps/web/src/lib/server/services.ts (100-127), apps/web/e2e/{outbox,onboarding.spec}.ts (helpers),
packages/db/src/authz/{audit,scope}.ts, packages/db/functions/{record_security_event,revoke_user_sessions,sign_in_account}.sql,
packages/db/migrations/20261015140500_audit_and_operations.sql (audit policies), docs/product/sessions.md,
docs/adr/0081 (Not covered / Not verified / Revisit), /home/user/ops/designs/lane-b-ux-review.md (UX PR 7, UX-006, UX-066),
/home/user/ops/designs/lane-b-ux-sign-in-time.md:1837 (UXS-01).
