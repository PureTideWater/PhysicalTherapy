# Scout: the MFA_SETUP takeover path, P-3 and R-11 (cognito-confidential-client)

Read only, on worktree /home/user/cognito-cc at 45d7d0c1. Sources: the status file, proposals P-1 to P-3, ADR 0081
(D, Not covered, Not verified here, the UX PR 7 amendment, Revisit when), #108's security review, and design sections 3
and 4. Code: `infra/lib/constructs/identity.ts`, `apps/web/src/lib/auth/{cognito-provider,sign-in,dev-provider}.ts`,
`apps/web/src/lib/routes/{settings,console}.ts` (the invite routes), `packages/db` (the user and invitation tables,
`sign_in_account`, `record_sign_in_with_mfa`, `invitation_expired`, `operator_record_mail_event`),
`packages/observability`, `infra/lib/{security-events.ts,constructs/monitoring.ts}` and `infra/test/{identity,
monitoring,application-role}.test.ts`.
Network note: docs.aws.amazon.com does not resolve in this session. The Cognito limits in section 3 come from what I
already knew and from one web search. None of them was read from AWS's pages here. The founder's staging check
(section 3.3) is what verifies them.

## 0. Summary

- The confidential client (`generateSecret: true` and a `SecretHash` on every call) closes every **direct** route. That
  covers direct `ForgotPassword`, `ConfirmForgotPassword`, `InitiateAuth` (password or passkey) and
  `RespondToAuthChallenge`, and with them the direct `MFA_SETUP` enrolment and the bypass of the ten-failure lock.
  `AssociateSoftwareToken` and `VerifySoftwareToken` take only a `Session`, and that session comes only from an
  `InitiateAuth`, which now needs the secret.
- **It does not close the app's own path.** `SignInFlow.after()` (`sign-in.ts:165-166`) turns any `mfa_setup_required`
  into an enrolment step and never looks at the account. Today the app offers enrolment to any password holder whose
  Cognito user has no factor:
  - an `active` app account whose Cognito factor is gone (a support or console clear, UX PR 65's future path, or drift);
  - a Cognito user with no app row (an orphan from an invite whose insert rolled back);
  - an invited account (the intended case).
  Postgres would accept the result: `record_sign_in_with_mfa` sets `mfa_enrolled` for `status = 'active' AND NOT
  mfa_enrolled`.
- **Recommended (2), no migration.** The app refuses enrolment outside a live invitation. It allows `MFA_SETUP` only for
  an app account with `status = 'invited'`, `mfa_enrolled = false`, not locked, and `invitation_expired(user_id) = false`.
  It checks this in `after()` before the enrolment step is sealed, and again in `beginTotpSetup` before
  `AssociateSoftwareToken`. Every other case is refused with a new closed reason, plus a security-event log and an alarm.
  Both providers go through the flow, so the dev twin needs no change. Lambda triggers are not needed for this item.
  The `CustomMessage` gate is optional defence in depth (section 2.4).
- **A second gap the invitation routes open** (the admin-created-user route). `ensureUser` reuses an existing Cognito
  user on `UsernameExistsException` (`cognito-provider.ts:363-368`), with whatever password and factor that user already
  has. `resendInvitation` swallows `UnsupportedUserStateException`, so it sends nothing to a `CONFIRMED` user. An
  invitation can then land on an identity that someone else already controls. The fix is in the app and needs no new IAM
  grant: the `AdminGetUser` call already made there returns `UserStatus` and `UserMFASettingList` (section 1.3, route
  C2).
- **P-3.** AWS documents neither the exact per-code attempt count nor the per-user `ForgotPassword` throttle. Section 3
  shows it with exact staging steps: run them against the public client before the cutover, then repeat black-box through
  the app after it.
- **R-11.**
  - There is no log line today that carries `user_id` for a reset request; `password_reset_requested` is a Postgres audit
    row only. The smallest per-user design is one new log line (`password reset requested`, `{ user_id, request_id }`,
    accounts only) and a CloudWatch Contributor Insights rule keyed on `$.user_id`, with an alarm on its
    `MaxContributorValue`.
  - Undelivered requests: two metric filters on the web log group (`password reset request not delivered`, split into
    configuration and throttle codes, and `password reset request failed`) with alarms to the existing operator topic.
  - It fits the same infra change. The monitoring test's filter count of 22 moves.

## 1. Every route by which a CONFIRMED user with no factor reaches MFA_SETUP

Facts these rest on:
- The pool. `mfa: REQUIRED` (template `MfaConfiguration: 'ON'`, pinned in `identity.test.ts`), with
  `EnabledMfas: ['SOFTWARE_TOKEN_MFA']`. `allowedFirstAuthFactors: { password, passkey }`. `accountRecovery:
  EMAIL_ONLY`. There is one client, `WebClient`: public, `USER_AUTH` and SRP, `disableOAuth`,
  `preventUserExistenceErrors`, `authSessionValidity` 3 minutes.
- Under `ON`, a user with no factor who passes the first factor is answered `MFA_SETUP`. The provider then calls
  `AssociateSoftwareToken({ Session })`, `VerifySoftwareToken({ Session, UserCode })` and
  `RespondToAuthChallenge(MFA_SETUP)` (`cognito-provider.ts:240-279`).
- App state. The `user` table has `status` (`invited | active | disabled`), `mfa_enrolled`, `locked_at` and
  `hardware_key_required`. `invitation` has `expires_at` (at most 7 days), `accepted_at` and `undelivered_at`/`_reason`.
  Only `record_sign_in_with_mfa` sets `mfa_enrolled = true` (and `invited` to `active`). Nothing sets `mfa_enrolled =
  false` today: there is no such statement in migrations, functions or app code.
- The flow.
  - `start()` (`sign-in.ts:204-222`) refuses locked and disabled accounts, and an invited one whose invitations have all
    lapsed (`invitation_expired`). An unknown account (`account === undefined`) still goes on to the provider.
  - `after()` maps `mfa_setup_required` to `{ step: 'mfa_setup' }` with no account check.
  - `completeTotpSetup` writes `mfa_enrolled` audit only if an account exists.
  - `authenticated()` refuses no-account and disabled accounts *after* Cognito has already stored the factor.
  - For `hardware_key_required` with no key, `authenticated()` goes on to `register_key`, so a takeover of TOTP leads to
    the attacker's hardware key too.

### Route table

| # | Route | Who reaches MFA_SETUP today | Closed by the confidential client alone? | What else closes it |
| --- | --- | --- | --- | --- |
| A1 | Direct `ForgotPassword` + `ConfirmForgotPassword` with the client ID, then direct `InitiateAuth` and `MFA_SETUP` | Any mailbox holder, for any CONFIRMED no-factor user | **Yes.** All four calls need `SECRET_HASH`/`SecretHash` once the client has a secret. `Associate`/`VerifySoftwareToken` need a session from a hashed `InitiateAuth` | none needed |
| A2 | Direct reset, then sign-in **through the app** (the attacker now knows the new password) | Same | **Yes**, since the reset itself is closed (A1) | (2) as well, in depth |
| A3 | Direct `InitiateAuth` past the ten-failure lock (password guessing) | Anyone with the client ID | **Yes** | none |
| B1 | The app's reset (`/sign-in/forgot-password`) | Gated by SEC-B1: only `active && mfa_enrolled` gets a code (`sign-in.ts:322-325`) | n/a: app path | Safe while app state matches Cognito. If Cognito has no factor but the row says `mfa_enrolled` (a Cognito-side clear, or UX PR 65 forgetting the flag), the reset then the sign-in reaches `MFA_SETUP`. **Closed by (2)**, which also makes P-2's confirm re-check a nice-to-have, not a takeover fix |
| B2 | App sign-in by the password holder of an `active` account with no Cognito factor | Whoever knows the password (phished, reused, set via B1) | No | **(2)** refuses it |
| C1 | Invitation: `AdminCreateUser` mails a temporary password. The invitee signs in, gets `NEW_PASSWORD_REQUIRED`, then `MFA_SETUP` | The holder of the invitation email, inside 7 days | n/a: the designed trust (the invitation email is the authorization) | Kept by (2): `invited`, unexpired, not enrolled |
| C1' | Invited, chose a password, stopped before TOTP (Cognito `CONFIRMED`, app `invited`) | The password holder, while the invitation lives (`start()` checks `invitation_expired`) | Direct sign-in past the expiry was open; **the secret closes it** | (2) keeps the expiry check at enrolment, not only at `start()`. After expiry the administrator removes and re-invites (ADR 0081 Not covered), and that runs into C2 |
| C2 | **Re-invite or orphan reuse**: `ensureUser` finds an existing Cognito user (`created: false`) and links a fresh `invited` row to its sub. `resendInvitation` sends nothing for `CONFIRMED` | Whoever already holds that Cognito user's password (and factor, if any). If it has no factor they enrol under the invitation (C1 rules pass). If it has one they answer TOTP, and `record_sign_in_with_mfa` activates the row | No: the route works as designed and needs only the app | **App check in `ensureUser` callers** (see 1.3) |
| C3 | Cognito user with no app row (orphan) signs in through the app | Holder of its password | No | (2) refuses `MFA_SETUP` when `account === undefined`. Today the factor is stored first and the session refused after |
| D1 | Support clears a factor (UX PR 65, not built). Cognito's admin tool is `AdminSetUserMFAPreference` (no grant today). Whether `ON` then answers `MFA_SETUP` for a user whose token is associated but disabled is **unverified** | The password holder; with B1, a mailbox holder | No | (2) refuses it outright. UX PR 65 must then build its own re-enrolment bound to a server-sealed step issued by support, plus app state, which will likely need a migration (UX PR 65's, not this item's). Record it in ADR 0088 |
| E1 | Pool MFA `OPTIONAL` (a config regression) | A no-factor user gets tokens on the password alone. The app revokes them (`identity()` throws `MfaNotProvenError`), but a direct caller keeps a 15-minute access token and can call `AssociateSoftwareToken({ AccessToken })` | With the secret, direct auth is closed. A secret-holder (the web role) is trusted | Keep `MfaConfiguration: 'ON'` pinned (it is: `identity.test.ts`). ADR 0088 should say `ON` is load-bearing for this boundary |
| E2 | Passkey first factor (`USER_AUTH` + `WEB_AUTHN`) | Needs a registered passkey (a factor) | Direct calls need the secret | n/a |
| E3 | Hosted UI or OAuth | `disableOAuth: true`, no domain | n/a | Pin stays |

### 1.1 What the confidential client closes, and what it does not
- **Closed (A1, A2, A3; E1 for outsiders).** These are all routes that start with an unauthenticated Cognito call. Cognito
  requires `SecretHash` on `ForgotPassword`, `ConfirmForgotPassword`, `ResendConfirmationCode`, `SignUp` and
  `ConfirmSignUp`, `SECRET_HASH` in `InitiateAuth`'s `AuthParameters` and `RespondToAuthChallenge`'s
  `ChallengeResponses`, and `ClientSecret` on `RevokeToken`. (I knew this already; I could not re-read the API
  reference here.) Nothing reaches `MFA_SETUP` without a session from a hashed `InitiateAuth`.
- **Not closed (B1-drift, B2, C2, C3, D1).** Each of these goes through the app's own server, which holds the secret.
  They come down to one fact: the app enrols a factor for whoever passes the first factor, whatever the account's state.

### 1.2 Recommended closure for (2): the app's refusal of MFA_SETUP outside a live invitation (no migration)
Rule (ADR 0088 decision text):
> A second factor is enrolled only inside a live invitation. Enrolment is allowed only for an app account with
> `status = 'invited'`, `mfa_enrolled = false`, not locked, and `invitation_expired(user_id) = false`.

Every other `mfa_setup_required` is refused. That covers an unknown account (no row), `active`, `disabled`, locked,
enrolled, and invited with every invitation lapsed.

- **Where.**
  - `SignInFlow.after()`, case `mfa_setup_required`: look up `sign_in_account(email)`. The pending email is the typed
    one, and the lookup is by `lower()`, as `start()` does it. Check, and only then seal `{ step: 'mfa_setup' }`.
  - `beginTotpSetup` (before `AssociateSoftwareToken`) re-checks, since the sealed step can outlive a state change within
    Cognito's 3-minute session.
  - `completeTotpSetup` may re-check once more before `VerifySoftwareToken`. That one is cheap, and it is the last point
    before Cognito stores the factor.
- **Refusal.** A new closed reason (for example `enrolment_not_open`). Its words point to the administrator or support
  (UX-066's support address); this needs a UX line from the writer. Nothing is stored in Cognito. The 3-minute session
  is simply dropped.
- **Log.** `security event: second-factor enrolment refused` at warn, with `{ user_id | null, request_id }`. Alarm on it
  at 1 or more in 5 minutes (section 4.3): it means someone holds a password for an account with no factor, or Cognito
  and the app disagree.
- **Enumeration.** The refusal is shown only to someone who passed Cognito's password check, so it tells nothing to
  someone who does not know the password.
- **Twin.** The dev twin answers `mfa_setup_required` whenever `totpSecret === null` (`dev-provider.ts:131`). The rule
  lives in the flow, so both providers get it, and `sign-in.db.test` proves it on the twin.
- **Tests (SEC-2x rows).**
  - `active` with no factor (the `activeNotEnrolled` fixture already exists, `sign-in.db.test.ts:396`): refused, and
    nothing stored in the twin.
  - An orphan (no app row; the test at :181 sets one up): refused.
  - Invited and expired: refused at enrolment even when the sealed step was taken before the expiry.
  - Invited and live: enrols (the existing SGN tests at :121 and :148 stay green).
  - Locked invited: refused.
- **Postgres in depth (optional, needs a migration, so not proposed).** Narrowing `record_sign_in_with_mfa` to
  `u.status = 'invited'` would make Postgres refuse a re-enrolment of an `active` account. It is a function change, which
  means a migration. Record it as a Revisit item, and stop there per the item's rule. The app refusal stops Cognito from
  storing the factor at all, which the Postgres check could not do anyway.
- **Why not a Lambda for this.**
  - A Pre-authentication or Pre-token trigger would need either Postgres (a VPC Lambda with database credentials, a new
    trust edge) or a Cognito custom attribute mirrored from app state, which is a second source of truth.
  - A Pre-token trigger runs after `MFA_SETUP` has already stored the factor.
  - Pre-authentication does not run on `ForgotPassword`.
  - Once the secret is in place, all of these paths go through the app server, so the app check is the right place, and
    it reads the account of record.

### 1.3 Route C2: an invitation onto an existing Cognito identity (app change, no new grant)
`settings.ts:1005` (organization invite) and `console.ts:524` both call `ensureUser`. On `created: false`, the provider
already calls `AdminGetUser`, which is granted. The response carries `UserStatus` and `UserMFASettingList`.
- **Recommend.** `ensureUser` returns `{ sub, created, status, hasFactor }`.
- **Settings path.** There is no app row for the email, or the insert fails as `EMAIL_IN_USE`. So `created: false` means
  an orphan. Refuse with "this email belongs to another identity; ask an engineer to reconcile it" (the console's
  existing words) unless `UserStatus === 'FORCE_CHANGE_PASSWORD'` and there is no factor. Otherwise the reconcile is an
  engineer's `AdminDeleteUser`, a runbook step with the operator role, not a web-role grant.
- **Console path.** A known user (`known.cognito_sub === sub`) keeps today's behaviour. An unknown user follows the
  settings rule.
- **Why it matters.** "Remove and re-invite", the remedy ADR 0081 states for a stuck invitee, runs straight into C2
  today. A re-invite sends no email (`RESEND` refuses a `CONFIRMED` user) and links the old Cognito identity.
- **Scope.** This is an admin-created-user route in scope (2). It touches the invite routes, not `identity.ts`. If the
  writer scopes it out, it goes in ADR 0088 Not covered with the reason, and nothing marks it as fixed.

### 1.4 What the ADR text changes
- ADR 0081, amendment Not covered: the "SEC-B1 holds on the app's path only" bullet goes (Revisit when: "Lane A closes
  P-1"). The bullet on "a console factor reset must clear `mfa_enrolled`" becomes: "a console factor reset must issue its
  own sealed re-enrolment; the app refuses enrolment outside an invitation (ADR 0088)".
- Suggested split of the SEC rows:
  - SEC-20: the secret on every call.
  - SEC-21: enrolment outside an invitation refused.
  - SEC-22: an invitation onto an existing identity refused.
  - SEC-23: the R-11 alarms.
  - The P-3 check is a founder staging step, not a CI row.

## 2. Pool MFA configuration and the defence-in-depth options

### 2.1 Keep MFA `ON`
Keep `MfaConfiguration: 'ON'`. Under `OPTIONAL`, a no-factor user gets tokens on the password alone (E1). The pin exists
in `identity.test.ts`; ADR 0088 should state it.

### 2.2 `CustomMessage` refusal on `CustomMessage_ForgotPassword` (P-1(a))
It is redundant once the secret is in place, because every `ForgotPassword` comes from the app, which gates it. The
costs:
- a Lambda;
- an `AdminGetUser` grant for the Lambda;
- `UserLambdaValidationException` turns into enumeration for direct callers (no longer possible) and for the app (it
  swallows it).

Value: it covers a reset started from the console (`AdminResetUserPassword`, not granted, so an operator only). Not
recommended for this item. Record it under Alternatives.

### 2.3 `accountRecovery: NONE` with an admin reset (P-1(b))
It needs an `AdminResetUserPassword` grant, and that call puts the user in `RESET_REQUIRED`. Not needed once the secret
is in place.

### 2.4 Threat protection (Plus plan)
This is the owner's cost call (ADR 0012). It is not needed for this item.

## 3. P-3: Cognito's per-code attempt cap, expiry and request throttle

### 3.1 What Cognito says (from what I knew; **not re-read here**, since docs.aws.amazon.com is unreachable)
- **Expiry.** The quotas page lists code validity: a forgotten-password code lasts 1 hour, sign-up and attribute codes
  24 hours, an MFA code 3 minutes. One web search found an AWS re:Post answer agreeing on "about an hour". A code works
  once; a used code answers `ExpiredCodeException`. A new `ForgotPassword` replaces the earlier code.
- **Per-code attempt cap.** AWS publishes no number. `ConfirmForgotPassword`'s documented errors include
  `CodeMismatchException`, `ExpiredCodeException`, `LimitExceededException` ("exceeds the limit for a requested AWS
  resource") and `TooManyFailedAttemptsException` ("too many failed attempts for a given action").
  - Field reports put `LimitExceededException` ("Attempt limit exceeded, please try after some time") after about 5
    wrong codes. That is folklore and needs measuring.
  - Whether the cap ends the code or only throttles for a while is undocumented. That matters because the guessing bound
    in ADR 0081 A3 assumes the code is replaced, not retried.
- **Request throttle.** `ForgotPassword` per user is throttled (`LimitExceededException`) at an undocumented count.
  Field reports say about 5 per hour. User-pool API rate quotas (requests per second per category) are documented and
  adjustable; per-user throttles are not.
- **SecretHash and timing.** None of this depends on the client, so it can be measured on the public client before the
  cutover.

### 3.2 Can it be a CI test?
No. There is no Cognito in CI, and the dev twin's 5 tries (`DEV_RESET_ATTEMPTS`) are a model, as ADR 0081 says. What CI
can do is a provider unit test proving that `LimitExceededException` and `TooManyFailedAttemptsException` on
`ConfirmForgotPassword` map to `rejected`. That test already exists through `RESET_REJECTED`. So P-3 is a credentialed
staging check, which goes to the founder's list.

### 3.3 The founder's staging check (exact steps)
Preconditions:
- Staging stack deployed.
- One synthetic user created through the app's invite flow, enrolled with an authenticator, so it is `active` and
  enrolled. The mailbox must be one the founder reads: use the operator's synthetic mailbox, never a real person's.
- The founder's shell has staging credentials with `cognito-idp:*` on the staging pool and CloudTrail read access.
- The values: `POOL` (stack output), `CLIENT` (the web client ID), and `U` (the synthetic address).

**Part 1: before the cutover, on the public client** (no secret needed). The cap is a property of the pool, not the
client.
1. `aws cognito-idp forgot-password --client-id "$CLIENT" --username "$U"`. Note the time T0. Read the code `C` from the
   mailbox and do not use it yet.
2. In a loop, k = 1, 2, …, up to 12: `aws cognito-idp confirm-forgot-password --client-id "$CLIENT" --username "$U"
   --confirmation-code 000000 --password 'Synthetic-Pass-2026!'`. Use a code that differs from `C` (pick any other
   six-digit string if `C` is 000000). Record each error name. **N is the number of `CodeMismatchException`s before the
   first `LimitExceededException` or `TooManyFailedAttemptsException`.**
3. Straight away, send the right code `C` once. Record whether it is refused: refused means the cap ends or blocks the
   code. Wait 15 minutes and send `C` again: this tells a cooldown apart from an ended code.
4. Request throttle: `forgot-password` repeatedly, recording the error name each time, until `LimitExceededException`.
   **M is the requests accepted in the hour.** Each accepted request mails the synthetic box.
5. Expiry: make one more request, wait 61 minutes, send that code. Expect `ExpiredCodeException`. Check that the 60-minute
   code still works, with a separate request at 59 minutes.
6. Read both counts again in CloudTrail Event history (Event source `cognito-idp.amazonaws.com`, Event name
   `ConfirmForgotPassword` and `ForgotPassword`). The `errorCode` sequence should match the shell's. Whether Cognito
   records these unauthenticated calls there is itself to confirm (`account-trail.ts` records all management events).
7. Read `password reset request timed` in the staging web log group (Logs Insights: `filter msg = "password reset request
   timed" | stats pct(elapsed_ms, 99)`) against the 1,500 ms floor (N-3). Do one real app reset delivery (ADR 0081 "Not
   verified here").

**Part 2: after the cutover, black-box through the app.** The secret is the web role's only, so the founder does not
need it.

8. Do a reset on `/sign-in/forgot-password`. Enter N wrong codes, then the right one, and record the result. Then on a new
   request, enter N-1 wrong codes and the right one: expect success. The app's `sign_in` limit (20 per 15 minutes)
   allows this.
9. The shell: `aws cognito-idp forgot-password --client-id "$NEW_CLIENT" --username "$U"`, with no `--secret-hash`.
   Expect `NotAuthorizedException` ("Client … is configured with secret but SECRET_HASH was not received"). This is the
   proof of A1 on staging (SEC-20).
10. Record N, M, the answer from step 3, the expiry and the p99 in ADR 0081 "Not verified here" (or ADR 0088). Change A3's
    "about 64 to 80 guesses per account per hour" if N is not 5 or the cap ends the code.

Clean-up: none needed. The synthetic user keeps its password from the last success. Rollback: none, since the steps only
read and reset a synthetic user.

## 4. R-11: alarms on reset requests per user and on undelivered requests

### 4.1 What exists

**Web log lines** (JSON from `@tp/observability`: `{ …, time, level, msg }`, allowlisted fields only; `user_id`,
`request_id`, `error_code` and `elapsed_ms` are allowed):

| msg | level | fields | written for |
| --- | --- | --- | --- |
| `password reset request timed` | info | request_id, elapsed_ms | every address |
| `password reset request over floor` | warn | request_id, elapsed_ms | every address |
| `password reset request not delivered` | warn | error_code (UserNotFound, NotAuthorized, InvalidParameter, LimitExceeded, CodeDeliveryFailure, TooManyRequests), request_id | gated accounts only (`cognito-provider.ts:395`) |
| `password reset request failed` | error | request_id, error_code | gated accounts or the audit write (`sign-in.ts:346`) |
| `password reset code refused` | warn | request_id, error_code `'rejected'` (Cognito's name is not kept) | every confirm refusal |
| `password reset rate limited` | warn | request_id | either reset route |
| `security event: password reset completed`, `… sessions not ended`, `… provider sign-out failed` | warn or error | user_id, request_id (error_code) | after a reset |

- `password_reset_requested` is an **audit_event row** (purpose `unverified_request`, actor = the account named), **not a
  log line**. No log carries `user_id` per request, so no log metric can count per user today.
- **Infra.**
  - `Monitoring` has the encrypted operator topic and `notify`.
  - The web log group is `/tp/<env>/web` (KMS, 1 year).
  - The precedent is `FailedSignInBursts`: a `$.msg` filter whose messages live in `infra/lib/security-events.ts`, with
    an alarm of SUM at least 1 per 300 s (`SECURITY_ALARM_PERIOD_SECONDS`) and missing data not breaching.
  - `monitoring.test.ts` reads `sign-in.ts` for the message strings and pins **22** metric filters (`:153`).
- **Mail bounces.**
  - SES events for Cognito mail (`kind = 'cognito'`, transactional set) go to `mail_send` with `recipient_user_id`. They
    raise `INVITATION_UNDELIVERED` only for an unaccepted invitation.
  - **A bounced reset code for an active user is recorded and raises nothing.**

### 4.2 The smallest per-user design
1. **App.** In `requestPasswordReset`, for an account only (the same branch as the audit), add
   `logger.info('password reset requested', { user_id, request_id })`.
   - It costs nothing in timing: the work is inside the floor, and a stdout write is microseconds.
   - No address goes in it.
   - It is written whether or not a code was sent, as the audit is, so a flood against a non-enrolled account shows too.
2. **Infra.** A Contributor Insights rule (`AWS::CloudWatch::InsightRule`, `cloudwatch.CfnInsightRule`) on the web log
   group:
   - `Schema: CloudWatchLogRule/1`, `LogFormat: JSON`;
   - `Contribution.Keys: ['$.user_id']`;
   - `Filters: [{ Match: '$.msg', In: ['password reset requested'] }]`;
   - `AggregateOn: Count`.

   Then an alarm on the math expression `INSIGHT_RULE_METRIC('<rule>', 'MaxContributorValue')`, period 3600 s, at least
   **5 per user per hour**, missing data not breaching, action `notify`.
   - Rationale: a legitimate person sends 1 to 3 requests. The `sign_in` limit allows at most about 13 rounds an hour for
     one address (ADR 0081 A3's 64 to 80 guesses at 5 a round).
   - ADR 0081 A4 and design 4.3's threshold was "10 per user per day". The weekly-security-review SQL over `audit_event`
     keeps the daily figure.
   - Whether `INSIGHT_RULE_METRIC` allows an 86,400 s period is unverified, so the hourly alarm is the one proposed.
   - The alarm names no user. The operator finds the user in Contributor Insights' top contributors, or from
     `audit_event`.
3. **Why not a metric filter with a `user_id` dimension.** CloudWatch disables a filter that creates more than 1,000
   dimension combinations in an hour, each user would become a billed custom metric, and an alarm cannot fan out over
   dimensions. Contributor Insights costs about $0.50 per rule per month plus matched events. Whether it works on a
   KMS-encrypted log group is unverified, so the infra scout or the staging step should confirm it.
4. **Only meaningful after the secret.** Before the cutover, direct `ForgotPassword` calls write nothing. After it, every
   request goes through the app.

### 4.3 The smallest undelivered and enrolment design (metric filters on the web log group, alarms to `notify`)

| Filter (metric in `TherapyPlatform/Web`) | Pattern | Alarm |
| --- | --- | --- |
| `PasswordResetNotDeliveredConfig` | `$.msg = "password reset request not delivered"` && `$.error_code` in {UserNotFoundException, NotAuthorizedException, InvalidParameterException, CodeDeliveryFailureException} | SUM ≥ 1 / 300 s. The app and Cognito disagree, or the mail setup is broken; only gated accounts reach the send |
| `PasswordResetNotDeliveredThrottled` | same msg && `$.error_code` in {LimitExceededException, TooManyRequestsException} | SUM ≥ 3 / 3600 s. Per-user throttling is expected under a flood, which the per-user alarm also shows; a pool quota shows here |
| `PasswordResetRequestFailed` | `$.msg = "password reset request failed"` | SUM ≥ 1 / 300 s (an outage) |
| `SecondFactorEnrolmentRefused` (from 1.2) | `$.msg = "security event: second-factor enrolment refused"` | SUM ≥ 1 / 300 s, or join the existing `FailedSignInBursts` message list (less infra, but the description changes) |

- **Contract.** Add the messages and codes to `infra/lib/security-events.ts` (for example `PASSWORD_RESET_*`). Give
  `monitoring.test.ts` the same source-read assertion as the burst messages, from `cognito-provider.ts` and `sign-in.ts`.
- **Count.** The filter count moves from 22 to 25 or 26. Add an Insight rule count test.
- **A bounced reset code (optional, worker, no migration).** `operator_record_mail_event` already returns the state for
  `kind = 'cognito'` with `recipient_user_id`. A new worker log code (for example `COGNITO_MAIL_UNDELIVERED` with the
  mail_send ID) for a Cognito message that is not an invitation, added to `MAIL_PLATFORM_ALARM_CODES`, would alarm. That
  is a worker file and a platform-log alarm. If it does not fit, it goes in Not covered.
- **CDK diff.** All of this is additive: new `AWS::Logs::MetricFilter`, `AWS::CloudWatch::Alarm` and
  `AWS::CloudWatch::InsightRule`. There is no replacement and no stateful change. It can ship in the same PR as the client
  replacement or before it, and before is safer, since it gives the operator eyes for the cutover.

## 5. Inputs for the writer: order, risks, stops
- **Order.**
  1. Alarms, then the app refusal (1.2) and the C2 check (1.3).
  2. Then the confidential client cutover (the infra and provider scouts own it).
  3. Then P-3 part 2.

  The refusal is independent of the secret and closes B and C at once, so it can land first.
- **No migration is needed.** The one tempting one, narrowing `record_sign_in_with_mfa` to invited only, is defence in
  depth. Recorded, not done.
- **Unverified points for the security review to hold me to.**
  - Cognito's behaviour under `ON` for a user whose TOTP was disabled by `AdminSetUserMFAPreference` (D1).
  - Contributor Insights on a KMS log group, and the longest `INSIGHT_RULE_METRIC` period.
  - CloudTrail logging of unauthenticated `ConfirmForgotPassword`.
  - Every number in 3.1.
- **Watched paths.** `apps/web/src/lib/auth/**` (`sign-in.ts`, `cognito-provider.ts`) and the invite routes are
  screening-capacity watched. The repository is public, so the gate can pass.
