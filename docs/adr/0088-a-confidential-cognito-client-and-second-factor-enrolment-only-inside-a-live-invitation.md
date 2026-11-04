# 0088. A confidential Cognito client, and second-factor enrolment only inside a live invitation

- **Status:** proposed (Lane A, `co-001/cognito-confidential-client`; UX PR 7's proposals P-1 to P-3, #108's security
  review S-1 and N-2, and R-11). Two releases: release N, the first pull request, is built (the rules, the hash
  inactive until a secret is set, the probe, the diff role's deny and the alarms); release N+1, the second pull
  request, makes the client confidential and is designed, not built ("Two releases", below). Amends
  [0016](0016-sign-in-through-an-auth-provider-with-application-held-sessions-and-devices.md) (its deployment
  variables gain `COGNITO_CLIENT_SECRET`: optional in release N, required for the Cognito provider in N+1, where 0016's
  text is edited) and [0081](0081-state-and-enforce-each-sign-in-steps-limit-warn-before-it-closes-and-start-again-with-the-email-kept.md)
  (its amendment's A4 and Not covered now; A3 and Not verified here after the staging checks). Adds to
  [0012](0012-aws-foundation-from-shared-cdk-constructs.md) (the pull-request diff role's deny on content reads also
  names the two Cognito reads that return a client secret, D1; 0012's sentence is not edited) and
  [0055](0055-keep-model-calls-off-the-requests-connection-give-billing-and-e-signature-their-own-logins-bound-bodies-open-tickets-from-mail-and-keep-cognito.md)
  (`/api/health` also reflects one cached start-up result, D8; 0055's note is written with release N+1)
- **Date:** 2026-11-04
- **Deciders:** the founder, under the standing rule of 2026-10-18; the build (Lane A), for the design's choices and its
  security and infra-auth reviews' findings, each reversible by the founder; Lane A's orchestrator, 2026-11-04, on the
  co-founder's standing direction, for the design's rulings 13 (only the founder's break-glass role may start a
  rotation, D5), 14 (only the founder's break-glass session runs `admin-delete-user` for a stuck invitee, D4) and 15
  (N+1 reaches production within 7 days of N in production, and before the first customer invitation, Two releases),
  each as recommended and reversible by the founder. Ruling 16 (an account-level guard, Not covered) is the owner's.
- **PRD sections:** 6 (Identity and sessions), 7 (Sign-in and MFA); `docs/product/sessions.md`; test matrix SEC-20 to
  SEC-23; ADRs 0012, 0016, 0055 and 0081

## Context

The user pool's only app client is public (`generateSecret: false`, `infra/lib/constructs/identity.ts`), recovery is
`EMAIL_ONLY`, and MFA is `ON` with TOTP only. The client ID is an identifier, not a secret: it is in the environment,
the stack outputs and every token's `aud`. So anyone holding it can call Cognito directly:

| # | Route to an account | Before | Closed by |
| --- | --- | --- | --- |
| A1 | Direct `ForgotPassword` and `ConfirmForgotPassword`, then direct `InitiateAuth` and `MFA_SETUP`, for a Cognito `CONFIRMED` user with no factor | open to a mailbox holder | the secret (D1, release N+1) |
| A2 | A direct reset, then sign-in through the app | open | the secret, and the enrolment rule (D3) |
| A3 | Direct `InitiateAuth`, past the app's `sign_in` limit, its audit and the ten-failure lock | open | the secret |
| B1 | The app's reset where the app and Cognito disagree (the row `mfa_enrolled`, the Cognito factor gone) | open | the enrolment rule |
| B2 | The app's sign-in by the password holder of an `active` account with no Cognito factor | open | the enrolment rule |
| C1 | An invitation: temporary password, `NEW_PASSWORD_REQUIRED`, `MFA_SETUP` | designed trust | kept, inside a live invitation only |
| C1' | An invitee who set a password and stopped before TOTP (Cognito `CONFIRMED`, the app `invited`) | enrolable directly after expiry | enrolable only while the invitation lives |
| C2 | An invitation onto an existing Cognito user (`ensureUser` reuse), including 0081's "remove and re-invite" | open | the invitation rule (D4) |
| C3 | A Cognito user with no app row signs in through the app | the factor stored, then the session refused | refused before Cognito stores anything |
| D1 | A factor cleared from the console or the CLI | open | refused; re-enrolment is UX PR 65's to build |
| E1 | The pool's MFA set to `OPTIONAL` by a regression | tokens on a password | stays pinned `ON` (D6) |

Both halves are needed. The secret closes every route that starts with an unauthenticated Cognito call (A1, A2, A3,
and C1' after expiry). It does not close the app's own server path: `SignInFlow.after()` turned any
`mfa_setup_required` into an enrolment step without reading the account, and `record_sign_in_with_mfa` accepts an
`active` account with no factor. So the enrolment rule is an app rule, and it is the half that also closes B, C2, C3
and D1. This was so on base 24531dc2, before UX PR 7; 0081's Not covered recorded it.

## Decision

- **D1. The web client is confidential.** Every call that takes the client's credential carries `SECRET_HASH` (in
  `AuthParameters` or `ChallengeResponses`) or `SecretHash`, `base64(HMAC-SHA256(secret, username + clientId))` over the
  username that request sends: the typed email on `InitiateAuth`, `ForgotPassword` and `ConfirmForgotPassword`;
  Cognito's own USERNAME (the internal subject in this email-username pool) on `RespondToAuthChallenge`, never the typed
  email. `RevokeToken` carries the raw `ClientSecret`. `AssociateSoftwareToken`, `VerifySoftwareToken`, the WebAuthn
  calls and the `Admin*` calls carry neither. The hash is one pure module (`apps/web/src/lib/auth/secret-hash.ts`), and
  the secret lives in a `ClientSecret` wrapper whose value sits in a private field read only there, and whose
  `toJSON`, `toString` and `util.inspect` give `[redacted]`, so a logged config or a server-to-client prop carries no
  value. The secret has two read paths, and both are closed:
  - *Secrets Manager* (release N+1): under the environment key, injected into the web container at task start by the
    web task definition's execution role (never the task role, which the worker shares), with a resource policy that
    denies reads to every principal but that role and the custodian function's, and writes to every principal but the
    custodian (and, for `RotateSecret` only, the founder's break-glass role).
  - *Cognito*: `DescribeUserPoolClient` and `ListUserPoolClientSecrets` return the value. In release N+1 they are held
    by the custodian function's role only, and a template-wide assertion grants them to no other role in the stack. In
    release N (built), the staging pull-request diff role, which holds AWS `ReadOnlyAccess`, is explicitly denied both:
    `DENIED_CONTENT_READS` (`infra/lib/constructs/pull-request-diff-role.ts`) gains them, pinned against a literal list,
    so the deny is live on staging before any secret exists there. `cdk diff --method template` calls neither.

  The value is never in an env file, a log line, an error reason, a serialised config, the build or the client
  bundle: the image is built with no secret, ECS injects it at start, and a static scan fails if any `'use client'`
  module imports `lib/server/**` or the Cognito provider. The client is narrowed in the same replacement to the
  `USER_AUTH` flow and no writable attributes (release N+1). The secret is seeded by a dedicated custom resource,
  `Custom::WebClientSecret`, never through CDK's `userPoolClientSecret` (a shared singleton Lambda, whose role would
  gain the read, and the value returned to CloudFormation); its stored value is the fixed literal
  `{"clientSecret":"unset","clientSecretId":"unset"}` until the custodian seeds it, and the web config refuses the
  marker `unset` with an error that names the variable, never the value.
- **D2. A refused client credential is the platform's failure, never the person's.** Cognito answers a missing or wrong
  hash with `NotAuthorizedException` (on `RevokeToken`, likely `UnauthorizedException`); a message matching
  `secret[ _]?hash|client secret` classifies it, before every other mapping, as a `ClientCredentialError`. The message
  classifies only and is never logged. The flow then counts no `sign_in_failed`, locks nothing, answers the closed
  refusal `client_credential` with the existing words "Sign-in could not continue. Start again." (final; both sign-in
  cookies cleared), and logs `security event: client credential refused` at error with `{ request_id, error_code }`.
  A reset request answers `code_sent` at its floor like every other path, through `unlessFailed`, which logs
  `password reset request failed` with the error code. `release()`'s revoke swallows every other error (logging
  `provider token revoke failed` with its code), and the sign-in revoke rethrows only this one. Release N sends the
  hash only when `COGNITO_CLIENT_SECRET` is set, which no environment does until N+1.
- **D3. A second factor is enrolled only inside a live invitation:** an app account with `status = 'invited'`,
  `mfa_enrolled = false`, not locked, and holding a live invitation: an unaccepted, unexpired invitation exists whose
  membership has not ended. This is a positive check, read as the invitee under the invitation and membership policies
  that let a user read their own rows, never `invitation_expired(user_id) = false`, which is also false for an invited
  user with no invitation row at all (one invited before invitations were recorded, or inserted with no actor). The
  seed records each invited persona's invitation for that reason. The account is the one matched by
  **both** the enrolling Cognito subject and the email: the provider names the subject on the `mfa_setup_required`
  step only when Cognito gave it (USERNAME or USER_ID_FOR_SRP), never from the email; the row found by that subject must
  have the step's email (lower-cased), and an email-only lookup must return the same user. The rule runs in
  `SignInFlow.after()`, before the `mfa_setup` step is sealed with the subject, and again in `beginTotpSetup` (before
  `AssociateSoftwareToken`) and `completeTotpSetup` (before `VerifySoftwareToken`, the last point before Cognito stores
  the factor), since a sealed step can outlive a state change. Anything else, a missing subject or a mismatch included,
  is refused with the closed reason `enrolment_not_open` before any enrolment call: no failure counted, nothing locked,
  the Cognito session dropped, both sign-in cookies cleared, the words "This account can’t set up a second factor
  here. Ask your organization’s administrator, or write to <support address>.", and `security event: second-factor
  enrolment refused` at warn with `{ user_id | null, request_id }`. The words are shown only to someone who passed
  Cognito's password check, so they disclose nothing to an outsider. A cleared or lost factor is re-enrolled only
  through a support-issued right (UX PR 65), never by password.
- **D4. An invitation links only a Cognito user in `FORCE_CHANGE_PASSWORD`, which this platform never sets on a user
  that has signed in.** No role holds `AdminSetUserPassword` or `AdminResetUserPassword`, and both linking paths run
  only when no app row exists for the email. `ensureUser` returns `{ sub, created, neverSignedIn }` from the
  `AdminGetUser` response it already fetches (no new grant); the dev twin reads its record's temporary flag. From
  Settings and from the console, an existing Cognito user that has signed in is refused before any row is written:
  Settings answers as for any address in use ("this address cannot be invited from here"), so an organization never
  learns that Cognito knows an address (such a user is usually another organization's invitation that rolled back), and
  the console, a platform administrator's, names it: "this email belongs to another identity; ask an engineer to
  reconcile it". One that never signed in is linked, and its invitation is re-sent after the rows are written
  (Cognito mails a new temporary password and voids the old one). The console's known-user path is unchanged.
  Anything else is an engineer's reconcile, run in the founder's break-glass session (the operator role holds no
  Cognito action and is not widened): `docs/runbooks/support-mail.md`, "Sign-in help tickets".
- **D5. The client secret rotates on demand** (yearly and on suspicion), release N+1: Cognito's two-secret overlap,
  a value Cognito generates (`AddUserPoolClientSecret` with no caller value), and a forced web redeploy that the
  rotation function checks (`ecs:DescribeServices`, read only) before it deletes the previous value. The secret has one
  hand-built rotation schedule with no automatic rules and `RotateImmediatelyOnUpdate: false`, the custodian's invoke
  permission is scoped to this secret and account, and only the founder's break-glass role may start a rotation. The
  client is replaced only once, by this decision; later rotations keep the client ID.
- **D6. `MfaConfiguration: ON` is load-bearing for this boundary** and stays pinned in `identity.test.ts`.
- **D7. Alarms reach the operator** (built): metric filters on `/tp/<env>/web` in `TherapyPlatform/Web`, each with an
  alarm on the operator topic, missing data not breaching:

  | Filter | Alarms at |
  | --- | --- |
  | `PasswordResetNotDeliveredConfig` (the configuration codes) | ≥ 1 in 300 s |
  | `PasswordResetNotDeliveredThrottled` (the throttle codes) | ≥ 3 in 3600 s |
  | `PasswordResetRequestFailed` | ≥ 1 in 300 s |
  | `SecondFactorEnrolmentRefused` | ≥ 1 in 300 s |
  | `ClientCredentialRefused` | ≥ 1 in 300 s |
  | `ClientCredentialProbeRefused` (the start-up probe's `cognito probe refused`) | ≥ 1 in 300 s |

  Per account: `requestPasswordReset` logs `password reset requested` at info with `{ user_id, request_id }` for an
  account only (sent or not, inside the floor), and a Contributor Insights rule keyed on `$.user_id` alarms at a
  `MaxContributorValue` of 5 or more in an hour. No metric has a user dimension, and the alarm names no user; the
  operator reads the rule's top contributors. A weekly sign-in review in `docs/runbooks/incident-response.md` runs
  0081 A4's per-user query over `password_reset_requested` as the operator role.
- **D8. A wrong client credential fails the web task's readiness.** Once per process, at the first `services()` call
  and only while `COGNITO_CLIENT_SECRET` is set, one `InitiateAuth` with the computed hash for the reserved synthetic
  username `credential-probe@probe.invalid` (`apps/web/src/lib/auth/credential-probe.ts`; never a person). It fails only
  on a positive result: a client-credential refusal, `ResourceNotFoundException`, or a refusal saying the client does
  not exist. Everything else passes: the expected `NotAuthorizedException` or `UserNotFoundException`, a challenge, and,
  logged `cognito probe inconclusive`, throttling, a network error or a 5-second timeout. The outcome is cached, logged
  once with `{ error_code }` only, and `/api/health` answers 503 (a generic `{ status: 'unavailable' }`, so the public
  check never names the cause, before the database check) only while it holds a refusal, so the deploy's circuit breaker rolls back while the old client still
  exists. It fails open by design: a missed refusal is still caught by the alarm and the smoke sign-in, where a false
  refusal would block every deploy.

### Two releases

- **Release N (the first pull request, built):** D2, D3, D4, D7 and D8 as above; D1's hash, wrapper, client-module scan
  and diff-role deny, with `COGNITO_CLIENT_SECRET` optional (refused with `TP_AUTH_PROVIDER=dev` and as the marker).
  No change to the Cognito client, no secret, no rotation, no custom resource. A hash-checking twin of the Cognito
  endpoint in `cognito-provider.test.ts` proves the username each call hashes. The enrolment rule (D3) is live in
  this release and rests on an unverified Cognito behaviour (Not verified here), so release N reaches production only
  after a founder step on staging running release N: invite a synthetic account, set its password, enrol TOTP and sign
  in, expecting `signed_in` and no `security event: second-factor enrolment refused`. If it fails, release N stays off
  production until the subject the rule reads is corrected.
- **Release N+1 (the second pull request, cut after release N is on staging):** the confidential client (narrowed),
  the secret with its literal value and both resource-policy denies, `Custom::WebClientSecret` (Create reads the value
  with `DescribeUserPoolClient` and writes it without an ID; an Update on a changed client ID or `SeedVersion` re-seeds;
  Delete is a no-op), the rotation schedule, the web injection, the `WebClientSecretArn` output, `COGNITO_CLIENT_SECRET`
  required, and the runbook sections for rotation and for rollback across the client. The first cutover calls only
  `DescribeUserPoolClient` and `PutSecretValue`; the newer secret calls are used only by rotation and the ensure step.
- **The window between them:** while release N runs in production and N+1 does not, A1 to A3 stay open. N+1 reaches
  production within 7 days of N in production, and in any case before the first customer user is invited. A miss is
  the founder's ruling, not a silent slip.

### As built in the first pull request

Choices the design left open, or where the build differed from it, each with its reason:

- An enrolment step sealed by the previous release carries no subject; at `beginTotpSetup` and `completeTotpSetup` it
  answers `expired` (Start again), not `enrolment_not_open`, so an invitee caught mid-enrolment at the deploy starts
  again and gets a subject. The cookie is sealed server-side, so this is no weaker. A provider step with no subject at
  `after()` is still refused.
- The Cognito challenge records which name Cognito gave (USERNAME or USER_ID_FOR_SRP), so an `MFA_SETUP` after a new
  password keeps the subject named on the `NEW_PASSWORD_REQUIRED` step when the second answer repeats neither. It is
  never filled from the email.
- The hardware-key challenge takes the name the same way (USERNAME, else USER_ID_FOR_SRP), so its
  `RespondToAuthChallenge` hashes over Cognito's name and not the typed email (review infra-auth-IA-1). The twin holds
  the name Cognito gave for each Session and refuses an answer sent under any other.
- A new password is refused the same way before the step is sealed and again before `RespondToAuthChallenge` stores it
  (review security-N2): open only for the email's account, not locked, that is an invitee holding a live invitation
  or an active account with a factor. So an orphan in `FORCE_CHANGE_PASSWORD`, or an invitee whose invitation lapsed
  mid-step, keeps its temporary password and never becomes a confirmed Cognito user with no factor. Cognito names no
  subject on this step to the app, so the match is by the email; the subject is matched at `MFA_SETUP`.
- After `VerifySoftwareToken`, tokens whose `sub` is not the subject the rule approved are refused with
  `enrolment_not_open`, the grant given back, and no factor audited or session opened (review security-N1).
- `beginTotpSetup`, `abandon` and `beginKey` take the sign-in context, so their security lines carry the request ID.
- The `ClientSecret` wrapper lives in `secret-hash.ts`, so its private value is read in exactly one file.
- A credential refusal on a reset request alone raises `PasswordResetRequestFailed`, not `ClientCredentialRefused`
  (D2: the request's answer and log stay those of every failed request); every other step raises the latter.
- If the revoke after key registration is refused for the credential, the refusal is logged and the key stays
  registered.
- The probe starts on the first `services()` call, not through Next instrumentation, and its 503 comes from a wrapper
  in `app/api/health/route.ts`, not a new outcome status in the route framework.
- The alarm descriptions are fixed text naming the environment, with no log values; the design gave none.
- No migration was needed.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| CDK's `UserPoolClient.userPoolClientSecret` | An `AwsCustomResource` on the singleton Lambda the S3 prefix-list lookup uses: its role would gain `DescribeUserPoolClient`, and the value would return to CloudFormation as response data |
| The first value through `AddUserPoolClientSecret`, or its ID read with `ListUserPoolClientSecrets` at Create | Calls not yet verified in the Lambda runtime's SDK, on the cutover's critical path; kept to rotation and the ensure step, gated by the staging check |
| A caller-generated rotation value | `GetRandomPassword` on `*`, and the value in the request CloudTrail records |
| CDK's `RotationSchedule` construct | An unscoped invoke grant, `GetRandomPassword` on `*` and a wider key grant; meeting the pins would take escape hatches over CDK internals |
| A post-deploy smoke step as the only credential gate | Deploys are a manual `cdk deploy`, and anything after it runs after cleanup has deleted the old client |
| A scheduled rotation | Would one day delete the value running tasks hold, or need `ecs:UpdateService` on the function |
| A runtime `GetSecretValue` | Needs the task role, which the worker shares |
| A `CustomMessage` trigger refusing `CustomMessage_ForgotPassword` without TOTP (P-1 (a)) | Redundant once the secret is in place, and its refusal turns into enumeration |
| `accountRecovery: NONE` with `AdminResetUserPassword` (P-1 (b)) | A new admin grant on the role the worker shares, and it would break D4's premise |
| A Pre-authentication trigger | Postgres from a Lambda (a new trust edge) or a mirrored custom attribute (a second source of truth, a pool schema change); unverified for `USER_AUTH`, and a mistake locks staff out |
| Narrowing `record_sign_in_with_mfa` to `invited` | A migration; the app rule already stops Cognito from storing the factor, which a database check cannot (Revisit when) |
| Looking the enrolling account up by the typed email alone | The email is mutable, and orphans and a half-done reconcile exist: the rule could pass for one account while Cognito stores the factor on another |
| One release for the app and the infra | An image rollback past it would break every sign-in |

## Consequences

- A new client ID, once. Application sessions survive (0016); sign-ins in flight during that deploy start again
  (0081's `expired`), so it is deployed off-hours.
- A person with no factor cannot self-enrol outside an invitation: the lost-factor ticket held at the desk stands until
  UX PR 65. A stuck invitee who still knows their password is helped by a re-sent invitation, which opens seven new
  days; one who does not, and an invitation refused as another identity, need the founder's break-glass session
  (`support-mail.md`).
- `/api/health` also reflects the probe's cached start-up result (a note in 0055 with release N+1).
- One Cognito call per web task start, which fails open on anything but a positive refusal.
- **Security regressions that need the founder's ruling:** (a) the window between N and N+1 (above); (b) a rollback
  back to the public client, which re-opens A1 to A3 and is never routine: the founder rules first, an operator note
  goes in the incident record, and N+1 is re-deployed as soon as the cause is fixed. An image rollback past release N
  while the client is confidential would fail every sign-in.
- Checks: SEC-20 to SEC-23 (`docs/product/test-matrix.md`); release N+1 adds the identity, custody and handler tests,
  and the staging checks (the design's F1 to F5) record their results here.

## Not covered

- A bounced reset code for an active user raises nothing (`mail_send` records it; a worker code is a follow-up).
- Console- or CLI-initiated resets by an IAM holder.
- Plus-plan threat protection and `enablePropagateAdditionalUserContextData` (now possible); the owner's cost call
  (0012).
- **Read-only principals outside the stack:** AWS `ReadOnlyAccess` and SSO read-only permission sets include
  `cognito-idp:DescribeUserPoolClient`, which returns the secret. An account-level guard (an SCP, or a permission
  boundary, denying it and `ListUserPoolClientSecrets` except to the custodian role) is the owner's call, on the
  founder's list.
- Moving an app account to a new Cognito subject: `tp_app` may insert `"user".cognito_sub` but never update it, so
  deleting a stuck invitee's Cognito user and inviting them again cannot complete; the runbook does not use that remedy.
- How a person opens a session as the operator role (`tp_operator`) for the weekly sign-in review is not written down
  (`tp_operator_login` is the platform jobs' login); the founder names the access path.

## Not verified here

There is no user pool in this lane. Each item is a founder step on staging, with its result recorded here: that Cognito
names the enrolling user (`USERNAME` or `USER_ID_FOR_SRP`) on `NEW_PASSWORD_REQUIRED` or `MFA_SETUP` under `USER_AUTH`,
and that the name is the user's `sub`, the value `ensureUser` stores as `cognito_sub` (D3's rule matches on it, and
every test here uses the twin or a scripted mock; a gate before release N reaches production, Two releases); which
name Cognito gives on the `WEB_AUTHN` challenge (`USERNAME`, `USER_ID_FOR_SRP` or neither): the key sign-in sends it,
as the other challenges do, as `USERNAME` on `RespondToAuthChallenge` and hashes over it, falling back to the typed
email only when Cognito names nobody, so a hardware-key sign-in on staging with the secret set is a gate before
release N+1 reaches production; Cognito's hash error texts for both mismatch directions (a secret sent to a client
without one, and a missing or wrong one to a client with one), for the classifier and the probe, a gate before release
N+1 reaches production: a text the classifier missed would turn the platform's failure into failures counted against
people, locking real accounts at ten, so the classifier takes any `NotAuthorizedException` naming a secret or the
client (review security-N5); `RevokeToken`'s credential error name; the three secret calls' IAM
action names; whether the Lambda runtime's SDK has those calls (a gate before release N+1 reaches production); whether
`ListUserPoolClientSecrets` returns the value; whether CloudTrail logs `AddUserPoolClientSecret`'s request or response;
whether a deleted client's tokens die with it; Cognito's per-code attempt cap, request throttle and code life (0081 A3);
and Contributor Insights on a KMS-encrypted log group.

## Revisit when

- The release-N staging check of the enrolment subject reports (it gates release N in production).
- The staging checks report (the check of the runtime SDK and the action names gates release N+1 in production; the
  account-level guard is the owner's ruling).
- UX PR 65 lands: its server-recorded re-enrolment right, and narrowing `record_sign_in_with_mfa` to `invited` in its
  migration.
- A support case needs an app account moved to a new Cognito subject: that needs a migration.
- Contributor Insights proves not to work on the KMS log group: the per-user alarm becomes a scheduled query over
  `audit_event`, and the weekly query stands meanwhile.
- Refresh tokens are ever used (the hash is then over the subject).
- Cognito allows a client secret to be set or read in CloudFormation.
- A federated identity provider is added to the pool: `DescribeIdentityProvider` and `GetIdentityProviderByIdentifier`
  return its `client_secret` in `ProviderDetails`, and the diff role's deny (D1) names neither.
