# Scout: the provider (cognito-confidential-client)

Worktree /home/user/cognito-cc at 45d7d0c1. Paths are relative to it. I changed nothing in the repo. Facts marked VERIFY are not shown by the code or the installed SDK types and need a staging run.

## 0. Pool facts the hash depends on
- `signInAliases: { email: true }` (infra/lib/constructs/identity.ts:74). In CDK, email alone becomes `UsernameAttributes: [email]`, so a user's internal username is a UUID (the sub) and the email is what people sign in with. `ensureUser` passes `Username: email` (cognito-provider.ts:354). Cognito stores the sub as the username.
- Web client: `authFlows { user, userSrp }`, `generateSecret: false`, token revocation on, no OAuth (identity.ts:111-121). This is pinned in infra/test/identity.test.ts:119-126 (`GenerateSecret` false; ExplicitAuthFlows ALLOW_REFRESH_TOKEN_AUTH / ALLOW_USER_AUTH / ALLOW_USER_SRP_AUTH).
- The comment at identity.ts:109-110 ("no client secret to store") must change along with the code.
- The SDK is used in one place only: apps/web/package.json:15 (`@aws-sdk/client-cognito-identity-provider` ^3.1160.0, installed 3.1160.0), imported by cognito-provider.ts:1-17 and services.ts:6. The worker, the packages and tools make no Cognito call.

## 1. Every Cognito call, and what a confidential client needs from it
SECRET_HASH = base64(HMAC-SHA256(key = client secret, message = USERNAME + clientId)). It must use the exact USERNAME string sent in that same request. ClientSecret (the raw secret) is a different parameter.

| # | Call | Where (cognito-provider.ts) | Needs | Username in the hash |
|---|---|---|---|---|
| 1 | InitiateAuth USER_AUTH, PREFERRED_CHALLENGE PASSWORD (`signIn`) | 211-223 (send 213-215) | `AuthParameters.SECRET_HASH` | the typed email (sent as USERNAME) |
| 2 | InitiateAuth USER_AUTH, WEB_AUTHN (`beginKeySignIn`) | 286-296 (send 287-289) | `AuthParameters.SECRET_HASH` | the typed email |
| 3 | RespondToAuthChallenge (`respond`, shared) | 190-209 (send 196-198) | `ChallengeResponses.SECRET_HASH` on every challenge (SDK doc, models_0.d.ts ~10611: "You must provide a SECRET_HASH parameter in all challenge responses") | `opened.u`. This is the USERNAME the response carries: `ChallengeParameters.USERNAME ?? USER_ID_FOR_SRP ?? email` (180; key sign-in 294). That is the internal UUID, not the email. The existing test already shows them differ: USER_ID_FOR_SRP `internal-name` is sent as USERNAME (cognito-provider.test.ts:64, 80). So the hash goes inside `respond()` from `opened.u` and never from `opened.email`. |
| 3a | NEW_PASSWORD_REQUIRED (`setNewPassword`) | 225-239 -> 231 | via #3 | opened.u |
| 3b | MFA_SETUP after VerifySoftwareToken (`completeTotpSetup`) | 258-280 -> 279 | via #3 | opened.u |
| 3c | SOFTWARE_TOKEN_MFA (`answerTotp`) | 282-284 | via #3 | opened.u |
| 3d | WEB_AUTHN (`completeKeySignIn`) | 298-307 -> 300 | via #3 | opened.u |
| 4 | AssociateSoftwareToken (Session) | 247 | nothing: the API has no SecretHash field (models_0 grep) | n/a |
| 5 | VerifySoftwareToken (Session) | 265 | nothing | n/a |
| 6 | ForgotPassword | 384-397 (send 388) | `SecretHash` | the typed email (sent as Username) |
| 7 | ConfirmForgotPassword | 399-419 (send 406) | `SecretHash` | the typed email |
| 8 | RevokeToken: refresh token after password-only tokens (`identity`) | 152-154 | `ClientSecret` (raw secret, not a hash) | n/a |
| 9 | RevokeToken in `release` | 335-340 (send 338) | `ClientSecret` | n/a |
| 10 | ListWebAuthnCredentials / StartWebAuthnRegistration / CompleteWebAuthnRegistration | 310, 315, 325 | nothing (AccessToken) | n/a |
| 11 | AdminCreateUser (create, RESEND) / AdminGetUser / AdminUserGlobalSignOut | 352, 376 / 367 / 422 | nothing (SigV4, the task role's USER_POOL_ADMIN_ACTIONS, application-role.ts:14) | n/a |

The app does not call any of these: GlobalSignOut, ChangePassword, SetUserMFAPreference, AssociateSoftwareToken by AccessToken, GetTokensFromRefreshToken, InitiateAuth REFRESH_TOKEN_AUTH, SignUp, ConfirmSignUp or ResendConfirmationCode.
- The app revokes the refresh token as soon as its own session exists (doc at 41-44; sign-in.ts:181-195). So nothing refreshes.
- If refresh is ever added: REFRESH_TOKEN_AUTH's SECRET_HASH uses the internal username (the sub, which is the username in this email-username pool), not the email. GetTokensFromRefreshToken takes `ClientSecret` raw. Both are in the 3.1160.0 types (`GetTokensFromRefreshTokenRequest.ClientSecret`).
- Recommendation: add a test that asserts no refresh command is ever sent. `ALLOW_REFRESH_TOKEN_AUTH` stays only because Cognito always enables it.

Confirmed from the installed types (dist-types/models/models_0.d.ts): `SecretHash?` exists on ForgotPasswordRequest, ConfirmForgotPasswordRequest, ResendConfirmationCodeRequest, ConfirmSignUpRequest and SignUpRequest. `ClientSecret?` exists on RevokeTokenRequest and GetTokensFromRefreshTokenRequest. InitiateAuth and RespondToAuthChallenge carry SECRET_HASH inside their parameter maps.

Known-answer vectors to pin in a unit test (synthetic: clientId `syntheticclient`, secret `synthetic-client-secret-0000000000000000000000000000`):
- `person@synthetic.test` -> `0fwk9eJaaj4xR5Mx8ooZtDWJmJAKzV+YThxODSt/Tw4=`
- `00000000-0000-4000-8000-000000000001` -> `SDnRp0ffi0e/TJypz1uFM58gdES/znkYwY5t3Zbn4Y0=`

VERIFY (staging):
- That USER_AUTH InitiateAuth accepts a hash over the email alias. The usual AWS answer is that the hash uses the username as sent.
- That RespondToAuthChallenge refuses a hash over the email once Cognito has returned the UUID as USERNAME. This is the classic "SecretHash does not match" trap.
- Fallback at :180: when Cognito returns neither USERNAME nor USER_ID_FOR_SRP, the code falls back to the email. Hashing whatever is sent keeps that consistent.

## 2. Proposed shape in the provider
- New pure module `apps/web/src/lib/auth/secret-hash.ts`: `secretHash(username, clientId, secret)` using `createHmac('sha256', secret).update(username + clientId).digest('base64')`. No logging. It is the only function that touches the secret's bytes besides RevokeToken.
- `CognitoProviderOptions` (cognito-provider.ts:58-65) adds a required `clientSecret: string`. Making it required means no Cognito provider can be built for the confidential client without it. A public-client mode is not kept: the old client is gone once it is replaced, and an optional field would hide a missing secret.
- Each call in the table gets its parameter:
  - #1, #2: add `SECRET_HASH` to AuthParameters (214, 288).
  - #3: add `SECRET_HASH: hash(opened.u)` to ChallengeResponses at 197, after the spread, so a caller cannot override it.
  - #6, #7: add `SecretHash` (388, 406).
  - #8, #9: add `ClientSecret` (153, 338).
- Comment at 385 ("The client has no secret (no SecretHash)") is replaced.
- The provider never echoes the secret: the grant (162) and challenge JSON (178-182, 249, 294) carry only Session, USERNAME and email. Keep it that way, and test that no sealed challenge or grant contains the secret string.

## 3. Error mapping: the main hazard
Cognito answers a missing or wrong secret hash with **NotAuthorizedException**. The messages are of the form "Unable to verify secret hash for client <id>" and "Client <id> is configured with secret but SECRET_HASH was not received" (VERIFY the exact texts in staging). Every set this file maps errors through already takes NotAuthorizedException:
- `REJECTED` (93). signIn maps it to `rejected/password`. sign-in.ts `failure()` (143-158, via `after` 172) then counts it in `sign_in_failed`. After a rotation slip or a bad secret, every user who tries to sign in gets failures counted against them, and is **locked at ten**. Unlocking takes a platform administrator.
- `STALE` (97). respond, beginTotpSetup and completeTotpSetup map it to `expired` (204, 251, 274). The user sees "start again" forever.
- `RESET_NOT_DELIVERED` (103). ForgotPassword maps it to a swallowed success that logs only 'password reset request not delivered' (395). Resets stop silently.
- `RESET_REJECTED` (112). ConfirmForgotPassword maps it to `rejected` ("wrong code").
- RevokeToken at 153 swallows every error (`.catch(() => undefined)`), so a refresh token can stay unrevoked without anyone noticing. At 338 the error is thrown, and `release` runs before `openSession` (sign-in.ts:195-196), so sign-in fails with a 500 (http/invoke.ts:395-403 rethrows).

Fix: classify the error before any of those sets.
- Add `isClientCredentialFailure(error)`: true when the name is NotAuthorizedException and the message matches `/secret hash|SECRET_HASH|client secret/i`.
- Throw a named `ClientCredentialError` (like `MfaNotProvenError` at 81-86) from `signIn`, `respond`, `beginKeySignIn`, `requestPasswordReset`, `confirmPasswordReset` and both RevokeToken sites. At 153, rethrow this error instead of swallowing it.
- Use the message only to classify. Never log it, since it carries the client ID; the logger allows only listed fields (packages/observability/src/fields.ts; tools/lint-logs).
- sign-in.ts `unlessFailed` (343-350) catches the reset request's throw and logs `error_code` = the error's name (108, 348). So `ClientCredentialError` reaches the logs as a code. That code is the hook for an alarm ("client credential refused"), alongside R-11.
- The same classification must be tested for every call (see section 7).

## 4. Configuration: where the secret is read and cached
- Env schema: apps/web/src/lib/server/config.ts:25-76.
  - Add `COGNITO_CLIENT_SECRET: z.string().regex(/^[A-Za-z0-9+/=._-]{16,128}$/).optional()`. VERIFY the format: Cognito-generated secrets are about 51-52 lowercase letters and digits, and a custom secret given to AddUserPoolClientSecret has its own length rule.
  - `AuthProviderSettings` (87-89) adds `clientSecret`.
  - The cognito branch (272-276) adds `needed(settings.COGNITO_CLIENT_SECRET, 'COGNITO_CLIENT_SECRET', 'for Cognito')`.
- `readWebConfig` reports only the names of invalid fields (247-250), never their values, so a malformed secret is not echoed. Keep that, and add a test that a bad secret's value is not in the ConfigError message.
- Wiring: services.ts `provider()` (132-141) passes `clientSecret: config.auth.clientSecret` beside clientId (137). `services()` keeps the result for the life of the process (services.ts:280-287), so the secret is read once at start.
- Rotation without a restart is therefore not possible with environment injection. See the rotation note below.

How the secret reaches the process: injection by ECS from Secrets Manager is the only option that keeps the secret readable by the web alone.
- The web and the worker share one task role (application-role.ts:40-41, 56-59). It holds **no** secretsmanager action, pinned by infra/test/application-role.test.ts:136, and the documented reason is that the worker must not read the web's secrets.
- A runtime `GetSecretValue` from the app would need that grant on the shared role, so the worker could read the secret too, or a separate web task role, which is a larger change.
- Injection runs through the **web task definition's execution role** at task start, exactly like `AUTH_COOKIE_SECRET` and the Stripe keys (infra/lib/constructs/compute.ts:269-274, cookie secret 170-176).
  - Add `COGNITO_CLIENT_SECRET: ecs.Secret.fromSecretsManager(<secret>)` to the web container's `secrets` only.
  - infra/test/compute.test.ts:214-225 pins each container's secrets exactly (web 214-223, worker 225), so the test fails if the worker gets it.
- apps/web does not depend on `@aws-sdk/client-secrets-manager`, and does not need to.
- It is never an env file: nothing like `.env*` is tracked (git ls-files). Development and the e2e suite use the dev provider and never set the variable.

Keeping the secret out of the client bundle:
- No `NEXT_PUBLIC_` prefix. next.config.ts:13 reads `process.env` only for the static asset origin.
- config.ts is imported only from server modules (services.ts:32), but no module under lib/server or lib/auth imports `server-only`.
- Recommended:
  - Add `import 'server-only'` to config.ts, services.ts and cognito-provider.ts. The package is not in the repo yet (VERIFY); without it, a guard test does the same job.
  - Add a build check that `.next/static/**` contains neither the variable name nor a test sentinel value.

Rotation, as the provider sees it:
- SDK 3.1160.0 has `AddUserPoolClientSecretCommand` (an optional custom `ClientSecret`), `ListUserPoolClientSecretsCommand` and `DeleteUserPoolClientSecretCommand`. That allows overlapping secrets:
  1. Add a new secret.
  2. Write it to Secrets Manager.
  3. Roll the web service, since new tasks read the new value at start.
  4. Delete the old secret.
- VERIFY in staging: how many secrets one client may hold at once, and that both are accepted while they overlap.
- The provider needs nothing for this beyond reading one value at start.
- CDK 2.275.0's `CfnUserPoolClient` has no `ClientSecret` property, only `generateSecret`. The first secret therefore exists only inside Cognito. The infra side must move it into Secrets Manager through `userPoolClientSecret` (an AwsCustomResource calling DescribeUserPoolClient, whose response logging must be hidden) or through an operator step. That is the infra scout's area. Noted here because the provider's value comes from it.

## 5. The dev twin (dev-provider.ts), and what mirroring SecretHash means there
- DevAuthProvider has no network client and no endpoint. Its store is a file read by the server process only (`FileDevStore`, services.ts:143; owner-only file, dev-provider.test.ts:387). There is no "direct API" around the app to close, so a fake secret check inside the twin would test nothing.
- Mirroring that is worth having:
  1. A **fake pool endpoint for tests** that checks credentials. Extend `cognito()` in cognito-provider.test.ts:25-41 with a `clientSecret` option.
     - For each command that takes one (InitiateAuth, RespondToAuthChallenge, ForgotPassword, ConfirmForgotPassword, RevokeToken), it recomputes SECRET_HASH over the USERNAME in that request, or compares ClientSecret.
     - It rejects a mismatch the way Cognito does: `NotAuthorizedException`, message "Unable to verify secret hash for client …".
     - Every existing scripted test then proves the hash is right for that call's username form. In particular the USER_ID_FOR_SRP `internal-name` case at 64/80 proves the challenge hash uses the internal name, not the email.
  2. The twin stays **true to Cognito** on the MFA_SETUP path. `secondFactor` (dev-provider.ts:129-134) offers `mfa_setup_required` to any non-temporary record with no TOTP, as Cognito does for a CONFIRMED user with no factor. `requestPasswordReset` (342-354) skips only invited (`temporary`) records, as Cognito does.
     - dev-provider.test.ts:222 already documents this ("the twin mirrors Cognito, and the flow's gate stops it (SEC-B1)").
     - So the scope-(2) guard belongs in SignInFlow, where it runs against both providers, and not in the twin.
  3. The twin's reset-attempt cap `DEV_RESET_ATTEMPTS = 5` (dev-provider.ts:55-56) is marked "Cognito's own cap is unverified (ADR 0081)". P-3's staging check replaces that comment with the observed number and its error name.
     - Today `RESET_REJECTED` (cognito-provider.ts:112) already folds `TooManyFailedAttemptsException`, `LimitExceededException`, `CodeMismatchException` and `ExpiredCodeException` into one `rejected`. The provider needs no change for P-3, only the evidence.
- Optionally add `clientSecret`-free typing: the dev settings branch (config.ts:88) gets no secret. config tests assert that `COGNITO_CLIENT_SECRET` set together with `TP_AUTH_PROVIDER=dev` is ignored, or refused (decide which).

## 6. Provider-side facts for scope (2), the MFA_SETUP takeover
- In the flow, `after()` (sign-in.ts:161-176) turns `mfa_setup_required` into a pending enrolment (165-166) **without consulting the account**.
- `start()` loads the account (204-222) but checks only locked (206), disabled (209) and an expired invitation (214-219). An `active` account whose Cognito user has no TOTP is still offered enrolment.
- `completeTotpSetup` (251-263) audits `mfa_enrolled` and opens a session.
- In the database, `record_sign_in_with_mfa` (packages/db/migrations/20261015180000_tenancy_hardening.sql:479-495) sets `mfa_enrolled = true` only where `status = 'invited' OR NOT mfa_enrolled`. It does not refuse enrolment for an active, enrolled user.
- So an app-side guard needs no migration: in `after()` or `start()`, refuse `mfa_setup_required` unless `account.status === 'invited' && !account.mfa_enrolled`. Any other account (active, or `mfa_enrolled` true) asking to enrol is a factor cleared outside the app, and is refused as a security event. The current Account row already carries both fields (sign-in.ts:68-76; `sign_in_account`, 20261015170000_identity_and_permissions.sql:260-263).
- Routes that reach MFA_SETUP:
  - an invitation: AdminCreateUser at cognito-provider.ts:352, then NEW_PASSWORD_REQUIRED, then MFA_SETUP (legitimate while `invited`);
  - an invited user who set a password and left before TOTP: Cognito is CONFIRMED, the app still has `invited` (legitimate until `invitation_expired`, 214-219);
  - a reset of a CONFIRMED user with no factor: closed in the app by SEC-B1 (324), and closed for the direct API only by the secret;
  - a factor cleared by an administrator in Cognito: the app has no call that clears one (no AdminSetUserMFAPreference anywhere in apps or packages). Only console or CLI action could do it. The guard above catches it.
- The provider itself cannot tell these apart, because Cognito offers the same MFA_SETUP to all of them.

## 7. Tests to extend
- apps/web/src/lib/auth/cognito-provider.test.ts:
  - `make()` (49-52) takes clientSecret, and the fake endpoint checks hashes (section 5.1).
  - Exact-input assertions to update with SECRET_HASH, SecretHash or ClientSecret: 69-73, 76-81, 118, 139, 168, 194, 197, 229, 297 (title at 292 says "no secret hash"), 332.
  - The admin calls at 243-262 and 271 must stay without a secret (assert it).
  - New cases:
    - the known-answer vectors from section 1;
    - the challenge hash uses `opened.u`, not the email;
    - `ClientCredentialError` from each call, never `rejected`, `expired` or a swallow (section 3), including RevokeToken at 153;
    - no refresh command is ever sent;
    - the secret never appears in a challenge, a grant or a log line.
- New `apps/web/src/lib/auth/secret-hash.test.ts` for the pure function.
- apps/web/src/lib/http/http.test.ts, config cases (production env 420-422, 470-476, 482-500 "reads Cognito and KMS settings"): add COGNITO_CLIENT_SECRET as required for Cognito, test that the value is not echoed in errors, and test that dev ignores or refuses it.
- apps/web/src/lib/auth/sign-in.db.test.ts:
  - a `ClientCredentialError` from the provider counts **no** sign-in failure and locks nothing;
  - the reset request with a credential error still answers alike, and logs `error_code` only;
  - the scope-(2) guard (an active or enrolled account offered `mfa_setup_required` is refused, against the dev twin, which offers it).
- apps/web/src/lib/auth/dev-provider.test.ts:222 stays as the record that the twin mirrors Cognito.
- Infra pins that this change touches (infra scout to own them):
  - identity.test.ts:125 (`GenerateSecret` false, flipped to true);
  - compute.test.ts:214-223 (the web secrets list adds COGNITO_CLIENT_SECRET; the worker's at 225 must not);
  - application-role.test.ts:136 (stays: no secretsmanager on the task role).

## 8. Notes for R-11 and P-3, from the provider's side
- Undelivered reset requests have one log line already: cognito-provider.ts:395 'password reset request not delivered' with `error_code` (CodeDeliveryFailureException, LimitExceededException, TooManyRequestsException, among others). A metric filter on that message, split by `error_code`, gives the "undelivered" alarm with no code change.
- Per-user reset requests: the audit `password_reset_requested` (sign-in.ts:329) holds the user ID. The log at 334 ('password reset request timed') holds only request_id. A per-user alarm needs either a log line with `user_id` at the send (325), where `user_id` is an allowed field, or a count from the database. A user-ID dimension on a log metric is high-cardinality: count by threshold, not by dimension.
- P-3: `RESET_REJECTED` already covers the cap's possible errors. The staging check:
  - What to look for: which error Cognito returns after the Nth wrong code, and whether the right code still works afterwards.
  - Steps, for a synthetic user: send N wrong codes, then the right one, and record the error name at each try.
  - The result replaces the comment at dev-provider.ts:55 and, if the numbers differ, the twin's cap.
