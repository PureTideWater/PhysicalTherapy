# Lane A design: cognito-confidential-client (`co-001/cognito-confidential-client`), security priority

Worktree `/home/user/cognito-cc`, base 45d7d0c1 (#108's merge). Paths are relative to it. Inputs: the status file, P-1 to
P-3 (`approval-summaries/lane-b-ux-sign-in-recovery-build/proposals.md`), ADR 0081 (UX PR 7 amendment, Not covered, Not
verified here, Revisit when), #108's security review, the UX PR 7 design sections 3 and 4, and three scout reports
(`scout-infra.md`, `scout-provider.md`, `scout-takeover.md` in the item's scratchpad). Libraries: aws-cdk-lib 2.275.0,
`@aws-sdk/client-cognito-identity-provider` 3.1160.0. No synth with the change was run; no Cognito pool exists in this
lane, and docs.aws.amazon.com did not resolve, so every Cognito behaviour marked VERIFY is checked on the founder's list
(section 10). **No migration** is needed for any part.

Counters: **ADR 0088** (own ADR: it moves an identity trust boundary) plus a short ADR 0081 amendment; test-matrix
**SEC-20 to SEC-23**.

**Review fold (2026-11-04).** The security and infra-auth reviews are folded in; the record is
`lane-a-cognito-confidential-client-review.md`, and each change below carries its finding ID in brackets (for example
[security-B1]). Where two findings fixed the same text differently, the reconciliation is stated in place and in the
record.

---

## 1. Threat and scope

The pool's only app client is public (`generateSecret: false`, `infra/lib/constructs/identity.ts:114`), recovery is
`EMAIL_ONLY`, MFA is `ON` (TOTP only). The client ID is not a secret (environment, stack output, every token's `aud`).

| # | Route to an account | Today | After this item | Closed by |
| --- | --- | --- | --- | --- |
| A1 | Direct `ForgotPassword` + `ConfirmForgotPassword`, then direct `InitiateAuth` and `MFA_SETUP`, for a CONFIRMED user with no factor | open to a mailbox holder | closed | the secret (2) |
| A2 | Direct reset, then sign-in through the app | open | closed | the secret (A1), and the enrolment rule (4) |
| A3 | Direct `InitiateAuth`, past the app's `sign_in` limit, audit and ten-failure lock | open | closed | the secret |
| B1 | App reset when app and Cognito disagree (row `mfa_enrolled`, Cognito factor gone) | open | closed | the enrolment rule |
| B2 | App sign-in by the password holder of an `active` account with no Cognito factor | open | closed | the enrolment rule |
| C1 | Invitation: temporary password, `NEW_PASSWORD_REQUIRED`, `MFA_SETUP` | designed trust | kept, inside a live invitation only | the enrolment rule |
| C1' | Invitee set a password and stopped before TOTP (Cognito CONFIRMED, app `invited`) | enrolable directly after expiry | enrolable only while the invitation lives | the secret + the rule |
| C2 | Invitation onto an existing Cognito user (`ensureUser` reuse, `cognito-provider.ts:363-368`), incl. ADR 0081's "remove and re-invite" | open | refused unless the Cognito user never signed in | the invitation rule (4.3) |
| C3 | Cognito user with no app row (orphan) signs in through the app | factor stored, then session refused | refused before Cognito stores anything | the enrolment rule |
| D1 | A factor cleared by console or CLI (`AdminSetUserMFAPreference`, no app grant) | open | refused; re-enrolment is UX PR 65's to build | the enrolment rule |
| E1 | Pool MFA set to `OPTIONAL` by a regression | tokens on a password | stays pinned `ON` (identity.test.ts) | the pin, stated in ADR 0088 |

**Why both halves.** The secret closes every route that starts with an unauthenticated Cognito call (A1, A2, A3, C1'
after expiry). It does not close the app's own server path: `SignInFlow.after()` (`apps/web/src/lib/auth/sign-in.ts:165-166`)
turns any `mfa_setup_required` into an enrolment step without reading the account, and `record_sign_in_with_mfa` accepts
an `active` account with none. So (2) is an app rule, and it is the half that also closes B, C2, C3 and D1.

**In scope:** (1) the confidential client, its secret, rotation and cutover; (2) the enrolment rule and the invitation
rule; (3) P-3 as a founder staging check plus the CI pins that can exist; (4) R-11 alarms, which fit (section 6).
**Out:** the `CustomMessage` gate and `accountRecovery: NONE` (P-1 (a), (b): redundant once the secret is in place;
recorded as alternatives); threat protection (Plus plan, ADR 0012, the owner's cost call); narrowing
`record_sign_in_with_mfa` (a migration: Revisit); a bounced reset code alarm (worker; Not covered).

---

## 2. The confidential client

### 2.1 CDK change (`infra/lib/constructs/identity.ts`)

- `WebClient`: `generateSecret: true`; the comment at :109-110 rewritten (a confidential client; the secret lives in
  Secrets Manager, read by the web execution role only). `GenerateSecret` forces replacement: same logical ID, a **new
  client ID**. `UserPool` untouched (no schema, no trigger change).
- In the same replacement, at no extra cost, the client is narrowed to what the app uses [security-N4]:
  `writeAttributes: new ClientAttributes()` (empty; the provider never calls `UpdateUserAttributes`, so a leaked access
  token cannot change the email and take the reset route) and `authFlows: { user: true }` only (drops
  `ALLOW_USER_SRP_AUTH`, `identity.ts:111-121`; the provider uses `USER_AUTH` only). Both pinned in identity.test.ts and
  listed in the cdk:diff expectation (2.5). Everything else on the client unchanged.
- Props (`:25-35`) gain `key: kms.IKey` (already in scope at `platform-stack.ts:86-88`, passed at `:106-112`). Docstring
  `:37-64` names the client secret; fix in passing the stale "three days" at `:45-46` (the code is 7, `INVITATION_DAYS`).
- New `clientSecret: secretsmanager.Secret` (exposed on the construct): `encryptionKey: key`, **no `secretName`** (a
  CDK-generated name, so a failed first deploy's pending-deletion secret never blocks the retry), JSON
  `{ clientSecret, clientSecretId }`.
- **The initial value is a fixed, inert literal, never generated** [security-S4, infra-auth-IA-5]:
  `secretObjectValue` (or `secretStringValue`) of the constant `{"clientSecret":"unset","clientSecretId":"unset"}`, and
  **no `generateSecretString`**. CloudFormation then has no generator to re-run (an edit to a generator, or a CDK upgrade
  that renders one differently, would otherwise overwrite AWSCURRENT with random text in every environment), and an
  unchanged literal is never re-put. Reconciled: S4 proposed `{}`, IA-5 a named marker; the marker is chosen because
  `readWebConfig` can then refuse it with a clear cause (3.2), where `{}` fails the task at start with an ECS key-extraction
  error. Pinned in identity.test.ts: the `AWS::SecretsManager::Secret` has exactly that `SecretString`, no
  `GenerateSecretString`, no `Name`, `KmsKeyId` the environment key, with a comment that changing any of them overwrites
  or replaces the live value and that `Custom::WebClientSecret`'s `SeedVersion` (2.2) changes with it. The runbook's CDK
  diff rule gains: any diff on this secret's `SecretString` or `GenerateSecretString` blocks the deploy.
- **Do not use `UserPoolClient.userPoolClientSecret`.** It is an `AwsCustomResource`, a singleton Lambda already used by
  the S3 prefix-list lookup (`network.ts:145-152`): the lookup's role would gain `cognito-idp:DescribeUserPoolClient`
  (a function that reads a prefix list could read the client secret), the secret would return to CloudFormation as
  response data, and the pin `infra/test/network.test.ts:228-229` would fail. A test asserts no
  `Custom::DescribeCognitoUserPoolClient` in the template.

### 2.2 Moving the first secret into Secrets Manager: a dedicated custom resource

`Custom::WebClientSecret`, MigrationRun's pattern (`infra/lib/constructs/migration-run.ts:56-134`): its own
`lambda.Function` (inline source, Node 22, no VPC), `cr.Provider` with its own log group,
`disableWaiterStateMachineLogging`. Log group `/tp/<env>/client-secret`, under the key, one year, retained (as every
named group; the rollback note in 2.5 covers the name).

- **Properties:** pool ID, client ID, secret ARN, and `SeedVersion` [security-S4]: a hash, computed in the construct, of
  the secret's rendered CloudFormation properties. Any change that can rewrite or replace the value then changes this
  resource's properties and forces an Update (a change to the secret alone never invokes this resource otherwise).
  Pinned in a test: editing the secret's properties changes `SeedVersion`.
- **Physical ID = the client ID, returned by the handler.** A replacement of this resource happens only because the Update
  handler returns the new client ID as `PhysicalResourceId`; the physical ID alone does not make a property change a
  replacement [infra-auth-IA-4].
- **Create:** `DescribeUserPoolClient` (the value Cognito generated: the path CDK itself uses) and `PutSecretValue
  { clientSecret }` with **no** `clientSecretId` [infra-auth-IA-3]. `ListUserPoolClientSecrets` is one of the three new
  SDK 3.1160 calls, its availability in the Node 22 runtime SDK and its IAM action name are unverified, so it is kept off
  the cutover's critical path; rotation writes the ID back (2.4). If `DescribeUserPoolClient` returns no `ClientSecret`
  (a public client), the handler fails loudly and never writes a placeholder. Returns **no data** to CloudFormation. Logs
  `{ step }` and, where known, `{ client_secret_id }` only.
- **Update** [infra-auth-IA-4, security-S4]:
  - `ClientId` changed: run the Create path against the new properties and return the new client ID as
    `PhysicalResourceId`; CloudFormation then sends Delete for the old physical ID, still a no-op. This covers any later
    client replacement, and CloudFormation's rollback of a failed later update, which arrives as a second Update carrying
    the old `ClientId`: the handler takes the same path and rewrites the secret with the old client's value (the old
    client still exists then; CloudFormation deletes it only in cleanup).
  - `SecretArn` or `SeedVersion` changed, same client: run **ensure**. Read AWSCURRENT of the (new) secret and call
    `ListUserPoolClientSecrets`. (i) AWSCURRENT parses and its `clientSecretId` is listed: nothing. (ii) Else, exactly one
    Cognito secret exists and the old `SecretArn`'s AWSCURRENT (read from `OldResourceProperties` before the switch) holds
    that ID: copy that value. (iii) Else, exactly one exists: seed from `DescribeUserPoolClient` only when its value's ID
    matches that single listed secret. (iv) Otherwise `AddUserPoolClientSecret` (no caller value, 2.4) and
    `PutSecretValue` the returned value and ID, deleting none. Never re-seed from `DescribeUserPoolClient` when two
    secrets exist. This path does use `ListUserPoolClientSecrets`, but only after F3 has verified it, and never in the
    first cutover.
  - Neither changed: no-op, same physical ID (rotation never goes through CloudFormation).
- **Delete:** no-op (the client's own deletion ends its secrets). So a CloudFormation rollback of the first cutover
  deletes the new resource harmlessly and never calls Cognito on the old public client.
- **Errors:** fixed text only, the step plus the SDK error name (for example `create: describe failed:
  ResourceNotFoundException`), never interpolated SDK output: the message becomes the CloudFormation `Reason`, which any
  ReadOnlyAccess holder reads in stack events, and the provider framework logs it [security-N5]. A handler test asserts
  the `Reason` contains no response field.
- **Order:** the web task definition depends on this resource (`node.addDependency`), so no web task starts on the
  marker value; the web service also depends on it, so a later ensure-Update finishes before the service rolls
  [security-S4].
- **Role, exactly (pinned):** `cognito-idp:DescribeUserPoolClient`, `ListUserPoolClientSecrets`,
  `AddUserPoolClientSecret`, `DeleteUserPoolClientSecret` on the pool ARN (Cognito scopes these to the pool, not the
  client; VERIFY the three secret action names in the Service Authorization Reference, F3);
  `secretsmanager:GetSecretValue`, `PutSecretValue`, `DescribeSecret`, `UpdateSecretVersionStage` on this secret;
  `kms:Decrypt`, `kms:GenerateDataKey` on the key with `kms:ViaService secretsmanager.<region>` **and**
  `kms:EncryptionContext:SecretARN` = this secret (as `operator-role.ts:113` does) [infra-auth-IA-2];
  `ecs:DescribeServices` (read-only) on the web service's ARN, formatted from its fixed names (cluster `tp-<env>`, service
  `tp-<env>-web`, `compute.ts:168`, `:407`) so no reference to the service creates a cycle [infra-auth-IA-10]. **No
  `secretsmanager:GetRandomPassword`** (2.4 no longer needs it, so no grant on `*`) [infra-auth-IA-2, security-N1].
  Nothing else. Not ApplicationRole (shared with the worker). This role is the only role in the stack that may hold the
  Cognito client-secret reads and writes (2.3).
- **Invoke permission, exactly one besides the `cr.Provider`'s** [security-S1, infra-auth-IA-1]: an explicit
  `lambda.CfnPermission`, principal `secretsmanager.amazonaws.com`, `SourceArn` = this secret's ARN, `SourceAccount` =
  this account. Pinned.

### 2.3 The read path: the web execution role only

- `compute.ts:269-274`, web container `secrets`: `COGNITO_CLIENT_SECRET: ecs.Secret.fromSecretsManager(identity.clientSecret,
  'clientSecret')`. ECS injects it at task start through the **web task definition's execution role** (each task
  definition has its own, `compute.ts:426-434`). Never the task role: ApplicationRole is shared by web and worker
  (`compute.ts:214`, `:278`), and `application-role.test.ts:136` pins it to no Secrets Manager action.
- **Two read paths, both closed** [security-B1]. The value can be read from Secrets Manager and, separately, from
  Cognito: `cognito-idp:DescribeUserPoolClient` returns `ClientSecret` in plaintext (the custom resource reads it that way,
  2.2), and `ListUserPoolClientSecrets` may return `ClientSecretValue` (F3 checks). Both are closed:
  - *Secrets Manager:* the resource policy below.
  - *Cognito:* `DescribeUserPoolClient` and `ListUserPoolClientSecrets` are held only by the custodian function's role
    (2.2). The staging pull-request diff role (`tp-staging-pull-request-diff`, `pull-request-diff-role.ts:55`) holds AWS
    `ReadOnlyAccess`, whose `cognito-idp:Describe*`/`List*` include both, and its `NoContentReads` deny
    (`DENIED_CONTENT_READS`, `:20`) does not name them; so `DENIED_CONTENT_READS` gains
    `cognito-idp:DescribeUserPoolClient` and `cognito-idp:ListUserPoolClientSecrets` (`cdk diff --method template` calls
    neither). Pinned in `infra/test/pull-request-diff-role.test.ts`: the existing `toEqual` on the deny statement, plus a
    literal array assertion, since the current one compares against the imported constant and would follow any edit.
    Who could reach it: a workflow on a `pull_request` event from a **same-repository branch** (the OIDC sub is
    `repo:<repo>:pull_request`); fork pull requests get no id-token, and today only `release.yml` requests one. Staging
    holds synthetic data only, but the least-privilege claim is wrong without this deny.
  - *Template-wide assertion* (identity.test.ts or a new `client-secret-custody.test.ts`): no role in the synthesized stack
    other than the custodian function's role is granted `cognito-idp:DescribeUserPoolClient`, `ListUserPoolClientSecrets`,
    `AddUserPoolClientSecret` or `DeleteUserPoolClientSecret`, by name or by a `cognito-idp:*`, `Describe*` or `List*`
    wildcard; named explicitly for the `AwsCustomResource` singleton, the operator, worker, platform and screening execution
    roles and ApplicationRole.
  - *Outside the stack:* read-only principals in the account (AWS `ReadOnlyAccess`, SSO read-only permission sets) can still
    call `DescribeUserPoolClient`. An account-level guard (an SCP or permission boundary denying these calls except to the
    custodian role's ARN) is the owner's call: ADR 0088 Not covered, and the founder's list (F5).
- **Resource policy** on the secret (`addToResourcePolicy`, a separate `AWS::SecretsManager::ResourcePolicy`, no cycle):
  `Deny secretsmanager:GetSecretValue` to `*` unless `aws:PrincipalArn` is the web execution role or the secret
  function's role. This makes "web only" true against any later identity policy in the account (the worker's, platform's
  and screening's execution roles included), not only by the stack's own grants. A second deny statement covers writes
  [infra-auth-IA-11]: `PutSecretValue`, `UpdateSecret`, `UpdateSecretVersionStage` and `RotateSecret` to `*` unless
  `aws:PrincipalArn` is the custodian function's role (the web execution role needs reads only), with one more exception
  for `RotateSecret` only: the principal the key-rotation runbook names as the rotation's caller (2.4; the founder's
  break-glass role, as in 4.3, unless the founder rules otherwise; open question 13). Both pinned; the read deny names
  exactly the two principals.
- `COGNITO_CLIENT_ID` (`compute.ts:231-232`) stays a Ref: its value changes with the replacement; nothing else reads it
  (no env file, SSM parameter, workflow or script; only `platform-stack.ts:225` `WebClientId`). Optional output
  `WebClientSecretArn` (an ARN, never the value) beside `:220-223`: add it (the founder's F3 uses it).
- **Never in env files, logs, the build or the bundle.** No `.env*` is tracked; dev and e2e use the dev provider. The image
  is built in CI with no secret, and ECS injects at start, so the bundle cannot carry the value; Next inlines only
  `NEXT_PUBLIC_*`. Guard: a unit test that no `'use client'` module imports `lib/server/**` or `lib/auth/cognito-provider`
  (a static import scan; no new `server-only` dependency, so no lockfile change). `readWebConfig` reports field names only;
  a test asserts a malformed secret's value is not in the `ConfigError`. The handler and provider log IDs and error names.
- **Serialisation guard** [security-N5]: the secret is never a plain string in `WebConfig` or the provider options. It is
  held in a small `ClientSecret` wrapper whose value sits in a `#private` field read only by `secret-hash.ts`, and whose
  `toJSON`, `toString` and `[util.inspect.custom]` return `'[redacted]'`. So a future log of the config, or a server
  component passing config to a client component (the RSC payload), carries no value, a case the import scan does not
  catch. Unit test: `JSON.stringify`, `String` and `util.inspect` of the config and of the provider show no value.

### 2.4 Rotation

Cognito now holds up to two secrets per client (`AddUserPoolClientSecret`, `ListUserPoolClientSecrets`,
`DeleteUserPoolClientSecret`, in SDK 3.1160). P-1's "cannot be rotated in place" is out of date: **only the public to
confidential change replaces the client**; later rotations keep the client ID.

- **Wiring, exactly** [security-S1, infra-auth-IA-1, infra-auth-IA-2]. Secrets Manager calls a rotation function only
  through an `AWS::SecretsManager::RotationSchedule`, so the secret has exactly one, built by hand as
  `secretsmanager.CfnRotationSchedule`: `SecretId` this secret, `RotationLambdaARN` the custodian function, **no
  `RotationRules`** (no automatic rotation, no `NextRotationDate`), no `HostedRotationLambda`,
  `RotateImmediatelyOnUpdate: false` (CloudFormation's default would rotate at deploy and race `Custom::WebClientSecret`
  while AWSCURRENT is still the marker), and `node.addDependency` on `Custom::WebClientSecret` and on the scoped
  `CfnPermission` (2.2). Reconciled: IA-1 and S1 wrote it with CDK's `RotationSchedule`/`addRotationSchedule`, IA-2
  offered either. The CDK construct adds `GetRandomPassword` on `*`, a `kms:Encrypt`/`ReEncrypt*`/`GenerateDataKey*` key
  grant, an unscoped `grantInvoke` and a `denyAccountRootDelete` statement; meeting S1's scoped permission and 2.2's exact
  pin would then take escape hatches over CDK internals. The hand-built `CfnRotationSchedule` emits only what is pinned, so
  it is chosen (IA-2's option (b)). Pins (identity.test.ts): exactly one `RotationSchedule` with those properties and
  dependencies; exactly one `AWS::Lambda::Permission` for `secretsmanager.amazonaws.com` on this function, with
  `SourceArn` and `SourceAccount`, besides the `cr.Provider`'s; the role's exact statements (2.2), with no
  `GetRandomPassword` anywhere; the key-policy statements for this role are only 2.2's. The wording "no rotation schedule"
  is replaced everywhere by "rotation enabled with the custodian function, no automatic `RotationRules`".
- **The handler's first act** [security-S1]: before any Cognito or Secrets Manager call, refuse any `SecretId` that is not
  its own secret ARN (from an environment variable holding the ARN, never a value). Then check the token is the secret's
  AWSPENDING or in `VersionIdsToStages`, as the AWS rotation template does.
- **Steps:**
  - `createSecret`: **idempotent** first [infra-auth-IA-10]: if AWSPENDING already exists for this `ClientRequestToken`,
    return, so a Secrets Manager retry never deletes the pending Cognito secret and then fails `PutSecretValue` on the same
    token. If AWSCURRENT is the marker or does not parse, refuse (Cognito unchanged). If AWSCURRENT has no
    `clientSecretId` (the state after the first Create, 2.2) [infra-auth-IA-3]: `ListUserPoolClientSecrets`; exactly one
    is AWSCURRENT's, so write its ID back into AWSCURRENT before adding; two means an orphan from a failed earlier
    rotation: delete the one whose `ClientSecretCreateDate` is **later** than AWSCURRENT's version `CreatedDate`, never
    the oldest (running tasks hold the original); if the two cannot be told apart, stop without deleting and alert. When
    AWSCURRENT has an ID and two exist, the one that does not match it is the deletion candidate (the value the previous
    deployment used). The guard below applies to that case only; an orphan no task ever received is deleted without it,
    and the write-back needs none (nothing is deleted). **Deletion guard**
    [infra-auth-IA-10, security-N6]: delete only if `ecs:DescribeServices` shows the web service's PRIMARY deployment
    `createdAt` later than AWSCURRENT's `CreatedDate` and no other ACTIVE deployment remains, so running tasks are on
    AWSCURRENT; otherwise refuse with a fixed-text error (`create: web not redeployed since last rotation`) and change
    nothing. Then `AddUserPoolClientSecret` **without `ClientSecret`** [security-N1, infra-auth-IA-2]: Cognito generates
    the value and returns it as `ClientSecretDescriptor.ClientSecretValue` with its `ClientSecretId`, so no
    caller-generated secret is in the request that CloudTrail records (F3 still checks the response is not logged), no
    `GetRandomPassword` and no length VERIFY. Put both as AWSPENDING.
  - `setSecret`: no-op. `testSecret`: AWSPENDING holds a value and an ID that `ListUserPoolClientSecrets` lists; else fail
    without changing stages. `finishSecret`: AWSCURRENT.
- **On demand, not scheduled.** Running tasks keep the old value, which stays valid; the next rotation deletes it, and the
  deletion guard refuses while tasks may still hold it. A schedule without a forced redeploy would one day delete the value
  running tasks hold; giving the function `ecs:UpdateService` to force one widens its trust (`ecs:DescribeServices` is a
  read). Trigger: yearly and on suspicion (`docs/runbooks/key-rotation.md`'s trigger).
- **Runbook** (new "Cognito client secret" section in `key-rotation.md`, after "Database logins"), run by the principal
  the resource policy excepts for `RotateSecret` (2.3):
  `aws secretsmanager rotate-secret --secret-id <WebClientSecretArn>` (works unchanged: the `RotationSchedule` names the
  function); force a new deployment of the web service; wait steady; sign in with the smoke account. On suspicion: rotate,
  redeploy, wait steady, rotate again, redeploy (the second rotation deletes the exposed value; the guard lets it, because
  the redeploy came between). A rotation refused by the guard means the redeploy was skipped: redeploy, then rotate again.
  **A bad rotation is recovered without CloudFormation** [infra-auth-IA-6]: `ecs.Secret.fromSecretsManager` reads
  AWSCURRENT at task start, so tasks the circuit breaker rolls back read the bad value too. First move AWSCURRENT back to
  the AWSPREVIOUS version (`aws secretsmanager update-secret-version-stage --secret-id <arn> --version-stage AWSCURRENT
  --move-to-version-id <previous> --remove-from-version-id <current>`), then force a new deployment. Record it as "After
  any rotation" says.
- **SDK dependency, stated exactly** [infra-auth-IA-3]: the first cutover (Create, `ClientId`-changed Update) calls only
  `DescribeUserPoolClient` and `PutSecretValue`, both long-standing. `ListUserPoolClientSecrets`, `AddUserPoolClientSecret`
  and `DeleteUserPoolClientSecret` are used only by rotation and by the ensure-Update (2.2). Before release N+1 reaches
  **production**, F3 verifies on staging that the Node 22 runtime's bundled SDK has the three commands and that their IAM
  action names match the pin; this is a gate. If either fails, the builder bundles the pinned
  `@aws-sdk/client-cognito-identity-provider` 3.1160 into this one function (with a test that the bundle contains the
  three commands) before production; until then, rotation fails safely (Cognito unchanged, AWSPENDING not written).

### 2.5 Cutover: replacing the client (release N+1)

**Two releases** (best; the infra scout's finding):
- **Release N (app only, PR 1):** `COGNITO_CLIENT_SECRET` optional; when present the provider sends the hash and
  `ClientSecret` on every call (section 3); the twin-endpoint tests prove it. No client change.
- **Release N+1 (infra, PR 2):** the confidential client, the secret, the function, the web injection, and
  `COGNITO_CLIENT_SECRET` made required for the Cognito provider.

One `cdk deploy` of N+1, in CloudFormation's order: create the new client; run `Custom::WebClientSecret`; register a new
web task definition (new `COGNITO_CLIENT_ID`, the secret); roll the web service (circuit breaker on health); in
`UPDATE_COMPLETE_CLEANUP_IN_PROGRESS`, delete the old client. During the roll, old tasks keep using the old client, which
still exists.

| State | Effect | Action |
| --- | --- | --- |
| App sessions | application-held (ADR 0016): survive | none |
| Cognito refresh tokens | revoked right after sign-in (`cognito-provider.ts:153`); only a `register_key` pending step holds a grant (≤ its cookie) | `release()` swallows every error but `ClientCredentialError` (3.4), so a cross-client `RevokeToken` never fails a sign-in; old client's tokens die with it (VERIFY, F1) |
| Sign-ins in flight (3-minute session) | a step begun on an old task fails on a new one | answered `expired`, Start again (ADR 0081); deploy off-hours |
| Health checks | today they ask only the database (`/api/health`, ADR 0055), so a wrong secret, JSON key or client-ID Ref would not trip the breaker, and CloudFormation would delete the old client at cleanup | the **start-up credential probe** below, so the breaker rolls back while the old client still exists; the `ClientCredentialRefused` alarm (6) and the runbook's step-5 smoke sign-in stay as second checks [infra-auth-IA-6] |

**Start-up credential probe** [infra-auth-IA-6]. A gate inside the stack update, before cleanup, through the ECS circuit
breaker; not a post-deploy workflow step (deploys are a manual `cdk deploy`, and anything after it runs after cleanup),
and not a Cognito call on every health check.
- Once per process at server start (Next instrumentation, or the first `services()` call), one `InitiateAuth` with
  `USER_AUTH` and the computed `SECRET_HASH` for a reserved synthetic username that never exists (a
  constant in a new `apps/web/src/lib/auth/credential-probe.ts`, never a person). The outcome is cached for the process.
- **Fails only on a positive result:** `isClientCredentialFailure(error)` (3.3), or `ResourceNotFoundException` / a "client
  does not exist" refusal (a wrong `COGNITO_CLIENT_ID`). **Passes on everything else:** the expected
  `NotAuthorizedException` or a challenge (the pool has `preventUserExistenceErrors: true`, `identity.ts:115`),
  throttling, a timeout or a network error; those three are logged `cognito probe inconclusive` with `{ error_code }`, so
  a Cognito blip never blocks a deploy or a scale-out. It fails open by design: a false negative is still caught by the
  alarm and the smoke sign-in; a false positive would block every deploy.
- `/api/health` returns 503 only while the cached outcome is a positive credential refusal (an ADR 0055 note: health now
  also reflects this one cached start-up result). The breaker then rolls the web service back while the old client still
  exists; CloudFormation rolls back and cleanup never runs.
- Logged once: `cognito probe passed` / `cognito probe refused` / `cognito probe inconclusive`, `{ error_code }` only.
- Under release N (public client, no secret set) the probe is skipped; it runs whenever `COGNITO_CLIENT_SECRET` is set.
- A wrong value after a rotation is not a CloudFormation event: 2.4's runbook moves AWSCURRENT back first.

**Rollback.**
- *During the deploy:* CloudFormation rollback is safe (the old client is deleted only at cleanup; the custom resource's
  Delete is a no-op). Retry after fixing: the two retained named log groups must go first [infra-auth-IA-13]. The names
  stay (the logs key grant is scoped to `log-group:/tp/<env>/*`, `monitoring.ts:197-202`). The runbook paragraph gives
  the exact commands for each: `aws logs delete-log-group --log-group-name /tp/<env>/client-secret` and the same for the
  provider's group (its exact name from the construct), or `cdk import` of each, as for PR 6b-3's groups
  (`deploy-and-rollback.md:258-262`); F1 records which was used.
- *After N+1, image-only* (`-c tp:skipMigrations=true --parameters ImageTag=<N>`): works, N hashes when the secret is set.
- *After N+1, back to the public client:* from N's tag checkout (precedent `deploy-and-rollback.md:252`); replaces the
  client again (a third ID, public); N runs without the secret; the same log-group note before re-deploying N+1. Never an
  image rollback past N while the client is confidential: every sign-in fails. **This is a security regression, not a
  routine rollback** [security-N3]: it re-opens A1 to A3 (direct reset, direct sign-in past the lock; the enrolment rule
  closes only the app's path). It needs the founder's ruling first, an operator note in the incident record, and a
  re-deploy of N+1 as soon as the cause is fixed (ADR 0088 Consequences).
- *The gap between N and N+1* [security-N3]: while N runs in production, A1 to A3 stay open. N+1 reaches production
  within 7 days of N, and in any case before the first customer user is invited (before launch, that second bound is the
  one that applies). Recorded in ADR 0088 and the status file; a miss is the founder's ruling, not a silent slip.
- F1 step 5 (the old client is gone) also covers `UPDATE_COMPLETE_CLEANUP_FAILED` leaving the public client alive: keep it,
  and if it fails, delete the old client by hand (`aws cognito-idp delete-user-pool-client`) the same day.
- Runbook: a "Rollback across the confidential client" paragraph in `deploy-and-rollback.md` with the cases above. No
  runbook covers replacing an identity resource today; this paragraph is it.

**cdk:diff** (`pnpm cdk:diff`, `infra/lib/cdk-diff-plan.ts:23-31`; `dependency-upgrades.md:394-396`). PR 2's diff must
show exactly: `AWS::Cognito::UserPoolClient` **replace** (GenerateSecret), with `WriteAttributes` empty and
`ExplicitAuthFlows` `ALLOW_USER_AUTH` (and the refresh flow CDK always adds) [security-N4]; added secret (the literal
`SecretString`, no `GenerateSecretString`), resource policy, rotation schedule, Lambda permission, function, role, policy,
log group(s), provider, `Custom::WebClientSecret`, output; web task definition (new revision), web service; KMS key policy
statement for the new role; the diff role's deny statement (two added actions). **No** replacement of
`AWS::Cognito::UserPool` or any other stateful resource.
- **Without staging credentials there is no diff** [infra-auth-IA-12]: `planCdkDiff` then runs `cdk synth --quiet` and
  warns. So the builder quotes, in the PR body, a **synth-template comparison against the base commit**: the resource
  types added and changed, with `UserPoolClient` flagged as replaced because `GenerateSecret` is a replacement property
  (resource lines and property names only, no values). F1 step 1's real `pnpm cdk:diff` against staging is the gate
  before the staging deploy.

---

## 3. SecretHash in the provider (`apps/web/src/lib/auth/cognito-provider.ts`, the only Cognito caller)

### 3.1 Each call

`SECRET_HASH = base64(HMAC-SHA256(secret, USERNAME + clientId))` over the exact username sent in that request; a new pure
module `apps/web/src/lib/auth/secret-hash.ts`.

| Call (line) | Parameter | Username |
| --- | --- | --- |
| `InitiateAuth` password (214), passkey (288) | `AuthParameters.SECRET_HASH` | the typed email, as sent |
| `RespondToAuthChallenge` (197: new password, MFA_SETUP, TOTP, WebAuthn) | `ChallengeResponses.SECRET_HASH`, set **after** the spread | `opened.u` (Cognito's USERNAME, the internal UUID in this email-username pool), **never** `opened.email` |
| `ForgotPassword` (388), `ConfirmForgotPassword` (406) | `SecretHash` | the typed email |
| `RevokeToken` (153, 338) | `ClientSecret` (raw) | n/a |
| `AssociateSoftwareToken`, `VerifySoftwareToken`, WebAuthn calls, `Admin*` | nothing (asserted) | n/a |

The comment at 385 ("no SecretHash") goes. The app never refreshes; a test asserts no `REFRESH_TOKEN_AUTH` or
`GetTokensFromRefreshToken` is ever sent. No sealed challenge, grant or log line contains the secret (test).

### 3.2 Options and caching

`CognitoProviderOptions` gains `clientSecret?: string` in PR 1, **required** in PR 2. `config.ts`: schema `:25-76` adds
`COGNITO_CLIENT_SECRET` (`z.string().min(16).max(128)`, no format guess; Cognito's generated values are letters and
digits; and refused when it equals the 2.1 marker `unset` [infra-auth-IA-5], with a `ConfigError` that names the field
but not the value, so a task on the marker fails at start with a clear cause), held in the `ClientSecret` wrapper (2.3),
settings type `:87-89`, Cognito branch `:272-276` (`needed(...)` in PR 2). Set together with
`TP_AUTH_PROVIDER=dev` it is refused (a config error naming the variable). `services.ts:132-141` passes it; `services()`
holds it for the process (`:280-287`), so it is read once per task start. The compute contract test
(`compute.test.ts:555-575`) needs `COGNITO_CLIENT_SECRET:` in config.ts.

### 3.3 Errors: a wrong secret must not look like a wrong password

Cognito answers a missing or wrong hash with `NotAuthorizedException` ("Unable to verify secret hash for client …",
"… configured with secret but SECRET_HASH was not received": VERIFY texts, F1). Today that would be counted as a password
failure (locking every user who tries at ten), shown as `expired`, swallowed as "not delivered", or shown as a wrong code.

- `isClientCredentialFailure(error)`: name `NotAuthorizedException` and message matching `/secret[ _]?hash|client secret/i`.
  The message is used to classify only, never logged (it carries the client ID). For `RevokeToken` only, the name
  `UnauthorizedException` with the same message test also counts [infra-auth-IA-9]: `RevokeToken`'s modelled errors
  (SDK 3.1160) have no `NotAuthorizedException`, so a missing or wrong `ClientSecret` there likely surfaces as
  `UnauthorizedException`. F1 step 7 records the real `error_code`; a provider test scripts `UnauthorizedException` on
  `RevokeToken`.
- Checked **before** `REJECTED`, `STALE`, `RESET_NOT_DELIVERED`, `RESET_REJECTED`, in `signIn`, `respond`,
  `beginKeySignIn`, `requestPasswordReset`, `confirmPasswordReset` and both `RevokeToken` sites; throws a named
  `ClientCredentialError` (as `MfaNotProvenError`, :81-86).
- In the flow: no `sign_in_failed`, no lock; the person gets the generic "Sign-in could not continue. Start again."; log
  `security event: client credential refused` at error with `{ request_id, error_code }`. On the reset request,
  `unlessFailed` (sign-in.ts:343-350) already logs `password reset request failed` with the error code and answers
  `code_sent` at the floor (S-3 unchanged).
- `release()` (338) swallows every other error, logging `error_code` (cutover, 2.5); `identity()`'s revoke (153) keeps its
  swallow for other errors but rethrows `ClientCredentialError`.

### 3.4 The dev twin

`dev-provider.ts` has no network endpoint, so a secret check inside it tests nothing. The mirror is the mocked Cognito
endpoint in `cognito-provider.test.ts:25-41`: given `clientSecret`, it recomputes the hash over each request's own
username (or compares `ClientSecret`) and answers a mismatch as Cognito does. Every existing scripted test then proves the
username form per call (the `internal-name` case at :64/:80 proves the challenge hash uses `opened.u`). The twin keeps
offering `mfa_setup_required` to a confirmed record with no factor (`dev-provider.ts:129-134`, `dev-provider.test.ts:222`):
it mirrors Cognito, and the rule in section 4 lives in the shared flow, so it runs against both providers. The twin
exposes the record's id as the challenge's `subject` (4.1), as Cognito's USERNAME does [security-S2].

---

## 4. The MFA_SETUP takeover

### 4.1 The enrolment rule (closes B1, B2, C1' after expiry, C3, D1)

> A second factor is enrolled only inside a live invitation: an app account with `status = 'invited'`,
> `mfa_enrolled = false`, not locked, and `invitation_expired(user_id) = false`. Every other `mfa_setup_required` is
> refused, and Cognito stores nothing.

- **Which account: the Cognito subject that is enrolling, matched to the email** [security-S2]. Looking up by the typed
  email alone can pass the rule for app account X while Cognito stores the factor on user Y (email is mutable,
  `identity.ts:77`; orphans and a half-done reconcile exist, 4.3).
  - The provider carries a provider-neutral `subject` on the `mfa_setup_required` step: `Challenge.u` only when it came
    from `ChallengeParameters.USERNAME` or `USER_ID_FOR_SRP` (the internal UUID in this email-username pool). If neither
    is present, the provider returns no subject and the flow refuses with `enrolment_not_open`; it never falls back to
    the email (`cognito-provider.ts:180`'s `?? email` is not used for this).
  - The subject is sealed in the `mfa_setup` pending step.
  - In `after()`, `beginTotpSetup` and `completeTotpSetup`, the rule is applied to the row found by `account({ sub:
    subject })`, which must also have `lower(email)` equal to the pending email, and an email-only lookup must return the
    same `user_id`. `sign_in_account(email, sub)` alone does not prove this: its `OR ... LIMIT 1` returns any row matching
    either value. Both fields are checked on the returned row in the app. Any mismatch, or no row for the subject, is
    refused with `enrolment_not_open`, and the Cognito session is dropped before `AssociateSoftwareToken` or
    `VerifySoftwareToken`.
- **Where:** `SignInFlow.after()`, case `mfa_setup_required` (every caller: `start` and `newPassword`), checks the rule on
  that account **before** sealing `{ step: 'mfa_setup', subject }`. Re-checked in `beginTotpSetup` (before
  `AssociateSoftwareToken`) and `completeTotpSetup` (before `VerifySoftwareToken`, the last point before Cognito stores
  the factor), with the subject from the sealed challenge, since a sealed step can outlive a state change.
- **Refusal:** a new closed `RefusalReason` `enrolment_not_open`. Proposed words (UX line, for the UX review): "This
  account can't set up a second factor here. Ask your organization's administrator, or write to support@…" (UX-066's
  address). Shown only to someone who passed Cognito's password check, so it discloses nothing to an outsider. The
  3-minute Cognito session is dropped.
- **Log:** `security event: second-factor enrolment refused` at warn, `{ user_id | null, request_id }`; alarmed (6).
- **Consequence:** a person whose factor is gone (lost phone) cannot re-enrol by password; that is today's desk-held
  ticket (ADR 0081 Not covered), now enforced. UX PR 65 must issue its own server-recorded re-enrolment right (likely a
  migration, UX PR 65's). P-2's confirm re-check becomes defence in depth, not a takeover fix.

### 4.2 Postgres in depth

`record_sign_in_with_mfa` still accepts `active AND NOT mfa_enrolled`. Narrowing it to `invited` is a function change,
so a migration: **stopped and recorded** (ADR 0088 Revisit when). The app rule already stops Cognito from storing the
factor, which a Postgres check could not.

### 4.3 The invitation rule (closes C2)

`ensureUser` returns `{ sub, created, neverSignedIn }`, from the `AdminGetUser` response it already fetches
(`UserStatus === 'FORCE_CHANGE_PASSWORD'`). No new IAM grant (`USER_POOL_ADMIN_ACTIONS` unchanged). Wording corrected
(review, refuted security-S3): `FORCE_CHANGE_PASSWORD` does **not** in general mean "never signed in", because
`AdminSetUserPassword` with `Permanent=false` puts any user back in that state. In this code base nothing calls
`AdminSetUserPassword` or `AdminResetUserPassword` (no grant, no runbook), and both linking paths run only when no app row
exists for the email, so the rule holds here; ADR 0088 D4 states the premise as "a Cognito user in
`FORCE_CHANGE_PASSWORD`, which this platform never sets on a user that has signed in". The template-wide assertion
(2.3) also asserts no role in the stack holds `cognito-idp:AdminSetUserPassword` or `AdminResetUserPassword` (today
`USER_POOL_ADMIN_ACTIONS` is `AdminCreateUser`, `AdminGetUser`, `AdminUserGlobalSignOut`, `application-role.ts:14`, and
its test compares against that constant, so a literal is needed).
- `settings.ts:1005` and `console.ts:524` (for an email with no app row): `created: false` and not `neverSignedIn` is
  refused with the console's existing words, "this email belongs to another identity; ask an engineer to reconcile it".
  `created: false` and `neverSignedIn`: link it and call `resendInvitation` (`RESEND` mails a new temporary password and
  voids the old one, so whoever held the old one loses it).
- The console's known-user path (`known.cognito_sub === sub`) is unchanged.
- The dev twin's `ensureUser` returns `neverSignedIn` from its `temporary` flag.
- ADR 0081's remedy "remove and re-invite" for a stuck invitee now reaches the engineer: a runbook step in
  `docs/runbooks/support-mail.md` ("Sign-in help tickets"): confirm the person by the organization's administrator, then
  `aws cognito-idp admin-delete-user`, then re-invite. **The principal** [security-N2]: the operator role has no
  `cognito-idp` action (`operator-role.ts`), so the step is run by the founder's break-glass session, recorded as the
  audit runbook requires; never a web or worker grant, and the operator role is not widened. (Alternative, if the founder
  prefers engineer self-service: exactly `cognito-idp:AdminDeleteUser` and `AdminGetUser` on the pool ARN on the operator
  role, with a pin test and a line in ADR 0088. Open question 14.)

### 4.4 Lambda triggers: not built

No trigger fires at `MFA_SETUP`. A Pre-authentication check would need Postgres from a Lambda (a new trust edge) or a
mirrored custom attribute (a second source of truth, and a pool schema change that may replace the pool); whether it
runs for `USER_AUTH` and how passkey-only staff look in `AdminGetUser` are unverified, and a mistake locks staff out.
Once the secret is in place, every route passes the app server, which reads the account of record.

---

## 5. P-3: Cognito's per-code attempt cap

- **Not a CI test:** no pool in CI. AWS publishes neither the per-code cap nor the per-user request throttle (field
  reports: about 5 each; code life one hour; a new request replaces the code).
- **CI pins what can be pinned:** `LimitExceededException` and `TooManyFailedAttemptsException` on
  `ConfirmForgotPassword` map to `rejected`, and `ClientCredentialError` is classified before them (provider test); the
  twin's `DEV_RESET_ATTEMPTS` stays a model.
- **Staging (founder F2):** part 1 on the public client before PR 2 deploys (the cap is the pool's), part 2 black-box
  through the app after. The result replaces the comment at `dev-provider.ts:55-56` and, if N ≠ 5 or the cap ends the
  code, ADR 0081 A3's "about 64 to 80 guesses per account per hour".

---

## 6. R-11 alarms (fit: additive, no replacement; in PR 1, so the operator sees the cutover)

Constants in `infra/lib/security-events.ts` beside `SIGN_IN_BURST_*`; filters on the web log group `/tp/<env>/web`;
alarms to the operator topic (`notify`), missing data not breaching; `monitoring.test.ts` reads the message strings from
the app source (as `:54-60`).

| Metric filter (`TherapyPlatform/Web`) | Pattern | Alarm |
| --- | --- | --- |
| `PasswordResetNotDeliveredConfig` | `$.msg = "password reset request not delivered"` and `$.error_code` in UserNotFound, NotAuthorized, InvalidParameter, CodeDeliveryFailure (`…Exception`) | ≥ 1 in 300 s |
| `PasswordResetNotDeliveredThrottled` | same message, `$.error_code` in LimitExceeded, TooManyRequests | ≥ 3 in 3600 s |
| `PasswordResetRequestFailed` | `$.msg = "password reset request failed"` | ≥ 1 in 300 s |
| `SecondFactorEnrolmentRefused` | `$.msg = "security event: second-factor enrolment refused"` | ≥ 1 in 300 s |
| `ClientCredentialRefused` | `$.msg = "security event: client credential refused"` | ≥ 1 in 300 s |

**Per user:** a new app line in `requestPasswordReset`, for an account only (the audit's branch, sent or not):
`password reset requested` at info, `{ user_id, request_id }` (inside the floor). A Contributor Insights rule
(`cloudwatch.CfnInsightRule`, `CloudWatchLogRule/1`, JSON, key `$.user_id`, filter `$.msg` in that message, Count) and
an alarm on `INSIGHT_RULE_METRIC(rule, 'MaxContributorValue')` ≥ 5 in 3600 s. No `user_id` metric dimension (a metric
per user; CloudWatch disables a filter past 1,000 combinations). The alarm names no user; the operator reads the rule's
top contributors. The daily figure ADR 0081 A4 asked for is a weekly query; no weekly-security-review runbook exists, so it goes in a new "Weekly sign-in review" section of `docs/runbooks/incident-response.md`, run with the operator role:

```sql
SELECT object_id AS user_id, date_trunc('day', at) AS day, count(*)
FROM audit_event WHERE action = 'password_reset_requested' AND at > now() - interval '7 days'
GROUP BY 1, 2 HAVING count(*) > 10 ORDER BY 3 DESC;
```
(Columns per `20261015140500_audit_and_operations.sql`; the operator role's read of `audit_event` is checked by the builder.) VERIFY: Contributor Insights on a KMS-encrypted log group
(F4). Filter pin 22 becomes 27; one insight rule (new count test).

---

## 7. ADR 0088 and the ADR 0081 amendment

### 7.1 `docs/adr/0088-a-confidential-cognito-client-and-second-factor-enrolment-only-inside-a-live-invitation.md`

- **Status:** proposed (Lane A, `co-001/cognito-confidential-client`; P-1 to P-3 of UX PR 7, #108's S-1, N-2; R-11).
  Amends 0016 (deployment variables: `COGNITO_CLIENT_SECRET`) and 0081 (Not covered, A3, A4). **Date:** 2026-11-04.
  **Deciders:** the founder under the standing rule of 2026-10-18; the build (Lane A). **Test matrix:** SEC-20 to SEC-23.
- **Context:** the public client and `EMAIL_ONLY` recovery let a client-ID holder call reset and sign-in directly, past
  SEC-B1, the `sign_in` limit, audit and the ten-failure lock; the app's own flow enrols a factor for any first-factor
  holder whose Cognito user has none. Routes table (section 1).
- **Decision.**
  - D1. The web client is confidential. Every call that takes it carries `SECRET_HASH`/`SecretHash` (over the username
    that request sends) or `ClientSecret`. The secret has two read paths, and both are closed [security-B1]: in Secrets
    Manager it is under the environment key, injected into the web container by its execution role, and denied by
    resource policy to every other principal but its custodian function (writes to all but the custodian); in Cognito,
    `DescribeUserPoolClient` and `ListUserPoolClientSecrets` are held only by the custodian function's role, explicitly
    denied to the pull-request diff role, and granted to no other role in the stack (a template-wide assertion). It is
    never in an env file, a log, an error reason, a serialised config, the build or the client bundle. The client is
    narrowed to `USER_AUTH` and no writable attributes.
  - D2. A refused client credential is the platform's failure, never the person's: it counts no failure, locks nothing,
    and alarms.
  - D3. A second factor is enrolled only inside a live invitation (section 4.1's rule), checked before each enrolment
    call, on the app account matched by **both** the Cognito subject that is enrolling and the email; a mismatch or a
    missing subject is refused [security-S2]. A cleared or missing factor is re-enrolled only through a support-issued
    right (UX PR 65).
  - D4. An invitation links only a Cognito user in `FORCE_CHANGE_PASSWORD`, which this platform never sets on a user that
    has signed in (no role holds `AdminSetUserPassword`/`AdminResetUserPassword`); anything else is an engineer's
    reconcile, run by the founder's break-glass session.
  - D5. The client secret rotates on demand (yearly, on suspicion), with Cognito's two-secret overlap, a Cognito-generated
    value, and a forced web redeploy that the rotation function checks before it deletes the previous value; the secret
    has one rotation schedule with no automatic rules, its invoke permission scoped to this secret and account; the
    client is replaced only once, by this decision.
  - D6. `MfaConfiguration: ON` is load-bearing for this boundary and stays pinned.
  - D7. Alarms on undelivered and failed reset requests, refused enrolments, refused client credentials, and on reset
    requests per user (≥ 5 an hour).
  - D8. A wrong client credential fails the web task's readiness through a once-per-process start-up probe that fails
    only on a positive credential or client refusal and passes open otherwise, so the deploy's circuit breaker rolls
    back before the old client is deleted [infra-auth-IA-6]. The secret's stored value is a fixed literal, never
    generated by CloudFormation, and any change to the secret's properties re-runs the custodian's ensure step
    [security-S4, infra-auth-IA-5].
- **Alternatives considered:** `userPoolClientSecret` (shares a singleton Lambda and its role; secret in the CFN
  response); a first value via `AddUserPoolClientSecret`, or reading its ID with `ListUserPoolClientSecrets` at Create (an
  unverified API on the cutover path); a caller-generated rotation value (`GetRandomPassword` on `*`, and the value in
  the request CloudTrail records); CDK's `RotationSchedule` construct (unscoped invoke grant, `GetRandomPassword` on `*`,
  a wider key grant; escape hatches needed to meet the pins); a post-deploy smoke step as the only credential gate (runs
  after cleanup has deleted the old client); a
  scheduled rotation (deletes a value running tasks hold, or needs `ecs:UpdateService` on the function); a runtime
  `GetSecretValue` (needs the shared task role, so the worker); the `CustomMessage` gate (redundant after D1; turns a
  refusal into enumeration); `accountRecovery: NONE` with `AdminResetUserPassword` (a new Admin grant shared with the
  worker); a Pre-authentication trigger (Postgres from a Lambda or a mirrored attribute; may lock out passkey staff);
  narrowing `record_sign_in_with_mfa` (a migration; Revisit); one release for app and infra (an image rollback breaks
  every sign-in).
- **Consequences:** a new client ID once; in-flight sign-ins during that deploy start again; a person with no factor
  cannot self-enrol outside an invitation (the desk-held ticket stands); a stuck invitee needs the founder's break-glass
  session; `/api/health` also reflects the start-up probe's cached result (ADR 0055 note). **Security regressions that
  need the founder's ruling** [security-N3]: (a) the window while release N runs in production and N+1 does not, in
  which A1 to A3 stay open, is bounded at 7 days and in any case ends before the first customer user is invited;
  (b) a rollback back to the public client re-opens A1 to A3 and is never routine: the founder rules first, an operator
  note goes in the incident record, and N+1 is re-deployed as soon as the cause is fixed.
- **Not covered:** a bounced reset code for an active user raises nothing (`mail_send` records it; a worker code is a
  follow-up); console- or CLI-initiated resets by an IAM holder; Plus-plan threat protection and
  `enablePropagateAdditionalUserContextData` (now possible). **Read-only principals outside the stack** [security-B1]:
  AWS `ReadOnlyAccess` and SSO read-only permission sets include `cognito-idp:DescribeUserPoolClient`, which returns the
  secret; an account-level guard (an SCP or permission boundary denying `DescribeUserPoolClient` and
  `ListUserPoolClientSecrets` except to the custodian role's ARN) is the owner's call, on the founder's list (F5).
- **Not verified here:** Cognito's hash error texts (classifier and probe); `RevokeToken`'s credential error name; the
  three secret IAM action names; the runtime SDK's secret calls (a gate before production N+1); whether
  `ListUserPoolClientSecrets` returns `ClientSecretValue`; CloudTrail logging of `AddUserPoolClientSecret`'s request and
  response; a deleted client's tokens; the per-code cap, request throttle, code life; Contributor Insights on a KMS log
  group. Each is a founder step in section 10; results are recorded here.
- **Revisit when:** F1 to F5 report (F3 step 4 gates production N+1; F5 is the account-level guard ruling); UX PR 65 lands (its re-enrolment right; then narrow `record_sign_in_with_mfa` in its
  migration); refresh tokens are ever used (hash over the sub); Cognito allows a client secret in CloudFormation.

### 7.2 ADR 0081 amendment (edits only)

- Not covered: the bullet "SEC-B1 holds on the app's path only …" is replaced by "Closed by ADR 0088: the client is
  confidential, and the app enrols a factor only inside a live invitation."
- Not covered: "their administrator removes and re-invites them; a console factor reset (UX PR 65) must clear
  `mfa_enrolled`" becomes "an engineer deletes the Cognito user, then the administrator re-invites (ADR 0088 D4); a
  console factor reset must issue its own re-enrolment right (ADR 0088 D3)."
- Not covered: the alarm bullet is struck (ADR 0088 D7).
- A3 and Not verified here: after F2, the measured N, M and code life replace "unverified".
- Revisit when: the line "Lane A closes P-1 …" is struck.

---

## 8. Tests

### 8.1 Unit (apps/web)
- `secret-hash.test.ts`: the known-answer vectors (synthetic client `syntheticclient`, secret
  `synthetic-client-secret-0000000000000000000000000000`): `person@synthetic.test` →
  `0fwk9eJaaj4xR5Mx8ooZtDWJmJAKzV+YThxODSt/Tw4=`; `00000000-0000-4000-8000-000000000001` →
  `SDnRp0ffi0e/TJypz1uFM58gdES/znkYwY5t3Zbn4Y0=`.
- `cognito-provider.test.ts`: the hash-checking endpoint (3.4); exact-input assertions updated (69-81, 118, 139, 168,
  194, 197, 229, 297, 332; the title at 292); `Admin*`, `Associate`/`VerifySoftwareToken` and WebAuthn calls carry none;
  the challenge hash uses `opened.u`; `ClientCredentialError` from every call, never `rejected`/`expired`/swallowed;
  `release()` swallows a non-credential revoke error; no refresh call; the secret in no challenge, grant or log;
  `ensureUser` returns `neverSignedIn`; without `clientSecret` (PR 1), no hash is sent; `UnauthorizedException` on
  `RevokeToken` classified as a credential failure [infra-auth-IA-9]; the `mfa_setup_required` step carries `subject`
  from USERNAME or USER_ID_FOR_SRP and none when both are absent (no email fallback) [security-S2].
- `http.test.ts` config cases: required for Cognito (PR 2), refused with dev, the marker `unset` refused
  [infra-auth-IA-5], its value absent from the `ConfigError`.
- `client-secret.test.ts` [security-N5]: `JSON.stringify`, `String` and `util.inspect` of the wrapper, the config and the
  provider show `[redacted]`, never the value.
- `credential-probe.test.ts` [infra-auth-IA-6]: a credential refusal and a wrong-client refusal fail; NotAuthorized, a
  challenge, throttling, a timeout and a network error pass (the last three logged inconclusive); the result is cached
  (one call per process); `/api/health` is 503 only on a cached positive refusal; the reserved username appears in no
  sealed value or log line.
- An import-scan test: no `'use client'` module imports `lib/server/**` or `cognito-provider`.

### 8.2 Database (`sign-in.db.test.ts`, against the twin)
- `ClientCredentialError` writes no `sign_in_failed` and locks nothing; on the reset request it answers alike at the floor.
- Enrolment: `active` with no factor (`activeNotEnrolled`, :396) refused, nothing stored in the twin; orphan (:181)
  refused; invited and expired refused at `beginTotpSetup` and `completeTotpSetup` even when the step was sealed before
  expiry; locked invited refused; invited and live enrols (the SGN tests at :121, :148 stay green).
- Enrolment by subject [security-S2]: (a) an invited, live row for E whose `cognito_sub` differs from the challenge
  subject is refused and the twin stores no factor; (b) a challenge with no USERNAME or USER_ID_FOR_SRP is refused;
  (c) rows for the email and for the sub both exist but are different users: refused; each at `after()` and again at
  `beginTotpSetup` and `completeTotpSetup`.
- `password reset requested` logged with `user_id` for an account only; not for an unknown address.
- Invitation routes (settings, console): `created: false` and signed in → refused with the reconcile words; `created:
  false` and never signed in → linked and `resendInvitation` called; known user unchanged.

### 8.3 Infra assertions and IAM pins (`infra/test`)
- `identity.test.ts`: :125 `GenerateSecret` true (rename the test at :119); :30 still one client; `WriteAttributes`
  empty and `ExplicitAuthFlows` user-auth only [security-N4]; the secret's exact properties (literal `SecretString`, no
  `GenerateSecretString`, no `Name`, `KmsKeyId`) with the overwrite comment [security-S4, infra-auth-IA-5]; its
  resource policy: the read deny with exactly two allowed principals, and the write deny with the custodian (plus the
  `RotateSecret` caller) [infra-auth-IA-11]; the function role's exact statements (2.2: the KMS `SecretARN` context, the
  read-only `ecs:DescribeServices`, no `GetRandomPassword`); its log group; `Custom::WebClientSecret` with the client ID,
  the secret ARN and a `SeedVersion` that changes when the secret's properties change; exactly one
  `AWS::SecretsManager::RotationSchedule` (this secret, the custodian ARN, no `RotationRules`, no
  `HostedRotationLambda`, `RotateImmediatelyOnUpdate` false, depends on `Custom::WebClientSecret` and the permission);
  exactly one `secretsmanager.amazonaws.com` `AWS::Lambda::Permission` on the function, with `SourceArn` and
  `SourceAccount` [security-S1, infra-auth-IA-1, infra-auth-IA-2]; no `Custom::DescribeCognitoUserPoolClient`;
  `MfaConfiguration: ON` unchanged.
- Template-wide custody assertion [security-B1]: no role other than the custodian's holds `DescribeUserPoolClient`,
  `ListUserPoolClientSecrets`, `AddUserPoolClientSecret` or `DeleteUserPoolClientSecret` (by name or a `cognito-idp:*`,
  `Describe*` or `List*` wildcard), named for the `AwsCustomResource` singleton, operator, worker, platform and screening
  execution roles and ApplicationRole; and no role holds `AdminSetUserPassword` or `AdminResetUserPassword` (4.3).
- `pull-request-diff-role.test.ts` [security-B1]: the `NoContentReads` deny gains `cognito-idp:DescribeUserPoolClient`
  and `cognito-idp:ListUserPoolClientSecrets`, asserted as a literal array (not only against the imported constant).
- `compute.test.ts`: :214-223 web secrets gain `COGNITO_CLIENT_SECRET`; :225-228 worker, platform, screening unchanged;
  :241-248 web execution role's reads gain the secret, others unchanged; KMS grant count :255-258 unchanged; :352-353
  unchanged; the web task definition and the web service depend on the custom resource; contract :555-575 satisfied.
- `network.test.ts:222-229`, `application-role.test.ts` (:17-22, :136, :159-164): **unchanged** (no new Admin call,
  no Secrets Manager on the task role).
- `encryption.test.ts:72-80`: 29 becomes the exact synth count (one secret, the function's and the provider's log groups),
  each named in the comment; the key-policy count there grows only by the custodian's one statement (no CDK
  `grantEncryptDecrypt`, since the rotation schedule is hand-built).
- `monitoring.test.ts`: :342-350 filter count 22 → 27; the five filters and alarms; the insight rule and its alarm; the
  message strings read from source.
- `platform-stack.test.ts`: `WebClientSecretArn` in the outputs.
- The function's handler: a unit test with mocked SDK clients:
  - Create writes the value (no ID, no `ListUserPoolClientSecrets` call) and returns no data; a public client (no
    `ClientSecret`) fails loudly and writes nothing [infra-auth-IA-3, infra-auth-IA-4].
  - Update: changed `ClientId` writes the new value and returns the new `PhysicalResourceId`; the rollback Update back
    to the old `ClientId` rewrites the old value; changed `SecretArn` writes a valid value; changed `SeedVersion` repairs a
    marker; a valid AWSCURRENT is a no-op; the two-secret case never writes the Describe value; unchanged properties make
    no calls and keep the physical ID [infra-auth-IA-4, security-S4]. Delete calls nothing.
  - Rotation: a foreign `SecretId` is refused with no SDK call; a token not in AWSPENDING/`VersionIdsToStages` is
    refused; a rotation while AWSCURRENT is the marker is refused and Cognito is unchanged; AWSCURRENT with no ID and one
    Cognito secret writes the ID back; two secrets and no ID deletes the later-created one, never the original, and stops
    when they cannot be told apart; the deletion guard refuses when the web service has not redeployed since
    AWSCURRENT; a retried `createSecret` with AWSPENDING already present returns; `AddUserPoolClientSecret` is sent
    without `ClientSecret` [security-S1, infra-auth-IA-3, infra-auth-IA-10, security-N1].
  - Every error is fixed text (step plus error name), and a `Reason` contains no response field; no value in any log
    call [security-N5].

### 8.4 e2e
None new: e2e runs on the dev provider; the flow tests cover the rule. Existing suites stay green.

### 8.5 Test-matrix rows (SEC section; the provenance paragraph names ADR 0088 and this item)

| ID | Case | Assertion |
| --- | --- | --- |
| SEC-20 | Every Cognito call that takes the client's credential (ADR 0088 D1, D2) | `InitiateAuth`, `RespondToAuthChallenge`, `ForgotPassword` and `ConfirmForgotPassword` carry a hash over the username that request sends (a challenge's over Cognito's USERNAME, never the typed email), `RevokeToken` the client secret, and no other call either; a hash mismatch answers as Cognito does and surfaces as a client-credential error that writes no sign-in failure, locks nothing, answers a reset request alike at the floor and logs only its name; a credential refusal at start-up fails the web task's readiness, and any other probe outcome passes; a direct reset or sign-in without the hash is refused on staging (F2) |
| SEC-21 | The client secret's custody (both read paths) | The web client is confidential and narrowed (user-auth only, no writable attributes); its secret is in Secrets Manager under the environment key, injected into the web container by the web execution role only; its resource policy denies reads to every principal but the web execution role and the custodian, and writes to all but the custodian (and the rotation's caller for `RotateSecret`); in Cognito, `DescribeUserPoolClient` and `ListUserPoolClientSecrets` are held by the custodian's role only, explicitly denied to the pull-request diff role, and granted to no other role in the stack; the worker's, platform's and screening's containers and the shared task role hold no read of it; the stack has no shared custom-resource read of the client; no env file, log line, error reason, serialised config or client module carries it; the stored value is a fixed literal until seeded, and any change to the secret re-runs the custodian's ensure step; rotation is on demand, Cognito-generated, scoped to this secret and account, refuses to delete a value running tasks may hold, and keeps the client ID; on staging the resource-policy deny is shown to override an identity allow (F3) |
| SEC-22 | A second factor enrolled outside a live invitation (ADR 0088 D3, D4) | An unknown, active, enrolled, locked, disabled or lapsed-invitation account answered `MFA_SETUP` is refused before any enrolment call, at the challenge and again before associate and verify, Cognito stores nothing, and a security event is logged; the account is the one matched by both the enrolling Cognito subject and the email, so a row whose `cognito_sub` differs from the subject, a challenge with no subject, or email and sub rows that are different users are refused; an invited, unexpired, unenrolled account enrols; an invitation onto a Cognito user that has signed in is refused, and onto one that never has re-sends its temporary password |
| SEC-23 | Reset and enrolment signals reach the operator (R-11) | Undelivered reset requests (configuration and throttle codes), failed requests, refused enrolments and refused client credentials each have a filter and an alarm on the operator topic; reset requests per user over 5 in an hour alarm through a contributor rule keyed on the user ID, with no per-user metric; the messages are read from the app's source |

---

## 9. Slices, in order (two PRs; each slice red first)

**PR 1, this branch (release N; app + additive infra; no client change).**
1. **Enrolment rule.** Red: the SEC-22 enrolment cases in `sign-in.db.test.ts` (active no-factor, orphan, lapsed, locked)
   fail against today's `after()`. Then the rule, `enrolment_not_open`, words, the log line.
2. **Invitation rule.** Red: the settings and console cases (`created: false`, signed in) are accepted today. Then
   `neverSignedIn`, the refusal, the resend, the twin, the runbook step.
3. **Hash and credential errors.** Red: the known-answer vectors and the hash-checking endpoint fail with `clientSecret`
   set; `ClientCredentialError` cases fail (counted as `rejected`). Then `secret-hash.ts`, the `ClientSecret` wrapper,
   the optional option, config (optional, refused with dev, marker refused), the classification (with `RevokeToken`'s
   `UnauthorizedException`), `release()`'s swallow, the import-scan test, and the start-up probe and its `/api/health`
   hook (skipped while no secret is set).
3b. **Diff-role deny** [security-B1]. Red: the literal `DENIED_CONTENT_READS` assertion. Then the two `cognito-idp`
   actions. In PR 1 so the deny is live on staging before the secret exists there.
4. **R-11.** Red: `monitoring.test.ts` pins 27 filters, the insight rule and the new message strings; the per-user log
   test. Then the log line, constants, filters, alarms, rule, the SQL in `incident-response.md`.
5. ADR 0088 (proposed), the ADR 0081 edits that hold now, SEC-20 to SEC-23 in the matrix.

**PR 2, a branch cut after PR 1 is deployed to staging (release N+1; infra).** N+1 reaches production within 7 days of N
in production, and before the first customer user is invited (2.5, ADR 0088 Consequences).
6. **Confidential client.** Red: `identity.test.ts`, the custody assertion and `compute.test.ts` pins (2.2, 2.3, 2.4,
   8.3) and the handler test. Then the client (narrowed), the secret (literal value), both resource-policy denies, the
   function and provider, `SeedVersion`, the scoped permission, the hand-built rotation schedule, the dependencies, the
   web injection, the output, `COGNITO_CLIENT_SECRET` required, docstrings, README:542, ADR 0016:89, ADR 0055's note, the
   two runbook sections (with the log-group commands and the AWSPREVIOUS recovery), and the synth-template comparison
   against the base quoted in the PR body (2.5); the real `pnpm cdk:diff` is F1 step 1.
7. After F1 to F5: record results in ADR 0088 and 0081 (A3), the twin's comment. The F3 SDK and action-name gate must
   pass before N+1 goes to production.

Suites: `pnpm test`, `test:db`, the infra tests, `cdk synth`, `lint`, `lint:logs`, `typecheck`. Screening capacity: the
auth files, `config.ts`, `services.ts`, `compute.ts` and the invite routes are watched; the repository is public, so the
gate measures and can pass.

---

## 10. The founder's list (credentialed staging, exact)

Preconditions: staging stack `tp-staging` deployed; a shell with staging credentials; one synthetic smoke account
created through the app's invite flow and enrolled with an authenticator (the operator's synthetic mailbox, never a
person's); a second synthetic account invited and not yet accepted; for the internal path, one synthetic hardware-key
account. Never paste a secret value, code or password into a log, ticket or session. Set:
`POOL=$(aws cloudformation describe-stacks --stack-name tp-staging --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)`
`CLIENT=` the `WebClientId` output the same way, `U=` the smoke address.

**F2 part 1: P-3 on the public client, before PR 2 is deployed.**
1. `aws cognito-idp forgot-password --client-id "$CLIENT" --username "$U"`; note T0; read code C from the mailbox; do not use it.
2. For k = 1..12: `aws cognito-idp confirm-forgot-password --client-id "$CLIENT" --username "$U" --confirmation-code <a six-digit string ≠ C> --password '<a policy-valid synthetic password>'`; record each error name. **N** = the `CodeMismatchException`s before the first `LimitExceededException` or `TooManyFailedAttemptsException`.
3. At once, send C once; record accepted or refused. Wait 15 minutes; send C again (cooldown or ended code). If refused both times, request a new code for step 4.
4. Repeat `forgot-password` until `LimitExceededException`; **M** = requests accepted within the hour.
5. Request once more, wait 61 minutes, send that code: expect `ExpiredCodeException`. On a separate request, send its code at 59 minutes: expect success.
6. CloudTrail Event history (source `cognito-idp.amazonaws.com`, names `ForgotPassword`, `ConfirmForgotPassword`): the `errorCode` sequence matches; record whether unauthenticated calls appear.
7. Logs Insights on `/tp/staging/web`: `filter msg = "password reset request timed" | stats pct(elapsed_ms, 99)`; record against 1,500 ms. One real reset delivery through the app.

**F1: the cutover (PR 2).**
1. `pnpm cdk:diff` against staging; confirm the diff is exactly section 2.5's list (client replaced, pool not).
2. Record the old `WebClientId`. Deploy as the deploy runbook says. Record the new one; it differs.
3. Before the deploy, keep a browser signed in to the app; after it, that session still works, and signing it out succeeds (no error page).
4. New sign-ins: password + TOTP (smoke account); hardware key (internal account); the invited account's first sign-in (new password, enrolment): all succeed.
5. `aws cognito-idp describe-user-pool-client --user-pool-id "$POOL" --client-id <old>`: `ResourceNotFoundException`.
6. Logs Insights: no `security event: client credential refused` since the deploy; the `ClientCredentialRefused` alarm is OK. The new tasks each logged `cognito probe passed` before cleanup began (compare the log times with the stack event `UPDATE_COMPLETE_CLEANUP_IN_PROGRESS`) [infra-auth-IA-6].
7. Record whether any `RevokeToken`/WebAuthn call failed for a token of the old client (the web log's `error_code`s in the deploy window), and the `error_code` a `RevokeToken` credential refusal carries (expected `UnauthorizedException`, 3.3) [infra-auth-IA-9].
8. If a rollback happened during the deploy, record which of the two log-group commands (delete or import) cleared the retry (2.5) [infra-auth-IA-13].

**F2 part 2: P-3 through the app, and the direct route shut.**
9. On `/sign-in/forgot-password`: N wrong codes, then the right one; record. A new request: N-1 wrong, then the right one: expect success.
10. `aws cognito-idp forgot-password --client-id <new> --username "$U"` (no secret hash): expect `NotAuthorizedException`; record the message text (it feeds 3.3's classifier and the probe). Same for `aws cognito-idp initiate-auth --client-id <new> --auth-flow USER_AUTH --auth-parameters USERNAME="$U"`. Then the probe's case: `initiate-auth` as above for the reserved synthetic username with a deliberately wrong `SECRET_HASH=AAAA` (expect the credential refusal text), and with `--client-id` set to a non-existent ID (record the error name); the probe's classification must match both [infra-auth-IA-6].
11. An account with no factor through the app (the builder supplies a synthetic `active` account whose TOTP was cleared with `aws cognito-idp admin-set-user-mfa-preference --user-pool-id "$POOL" --username <its sub> --software-token-mfa-settings Enabled=false,PreferredMfa=false`): signing in with its password is refused with the enrolment words; the `SecondFactorEnrolmentRefused` alarm fires; delete that account afterwards.

**F3: the secret.**
Steps 1 to 4 and 8 run on staging right after N+1 is deployed there; step 4 is the **gate before N+1 goes to production**.
1. `aws secretsmanager describe-secret --secret-id <WebClientSecretArn>`: `KmsKeyId` is the environment key; `RotationEnabled` true with `RotationLambdaARN` = the custodian function; **no `RotationRules`** and no `NextRotationDate`; no `LastRotatedDate` (no rotation ran at deploy) [security-S1, infra-auth-IA-1]. `aws lambda get-policy --function-name <custodian>`: one statement for `secretsmanager.amazonaws.com` with `aws:SourceArn` = the secret and `aws:SourceAccount` = the account, besides the provider's.
2. Custody, both read paths [security-B1, infra-auth-IA-7]. (a) `aws secretsmanager get-resource-policy --secret-id <WebClientSecretArn> --query ResourcePolicy --output text > rp.json` (in a scratch directory; it holds no value); assert the text: one Deny on `secretsmanager:GetSecretValue`, Principal `*`, condition `ArnNotEquals` (or `StringNotEquals`) on `aws:PrincipalArn` listing exactly the web execution role ARN and the custodian role ARN; and the write Deny (2.3). (b) For each of the worker, platform and screening execution roles, ApplicationRole and the shared task role: `aws iam simulate-custom-policy --policy-input-list '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"secretsmanager:GetSecretValue","Resource":"<WebClientSecretArn>"}]}' --action-names secretsmanager:GetSecretValue --resource-arns <WebClientSecretArn> --resource-policy file://rp.json --caller-arn arn:aws:iam::<acct>:user/<any IAM user; the Principal is * so it is not matched> --context-entries ContextKeyName=aws:PrincipalArn,ContextKeyValues=<that role ARN>,ContextKeyType=string`: expect `explicitDeny`, with `MatchedStatements` naming the resource-policy statement. The custom policy supplies the identity allow, so the deny is shown to override it, with no temporary role. (c) The same with `aws:PrincipalArn` set to the web execution role ARN, then the custodian role ARN: expect `allowed` (the exception list is exact). (d) Identity side, for each real role in (b) and the diff, operator roles: `aws iam simulate-principal-policy --policy-source-arn <role> --action-names secretsmanager:GetSecretValue --resource-arns <WebClientSecretArn>`: `implicitDeny` (no grant). (e) Cognito path: `aws iam simulate-principal-policy --policy-source-arn <role> --action-names cognito-idp:DescribeUserPoolClient cognito-idp:ListUserPoolClientSecrets --resource-arns <pool ARN>` for the diff, operator, worker, platform and screening roles and ApplicationRole: `explicitDeny` for the diff role, `implicitDeny` for the others. Record all results in SEC-21. If the account has no IAM user to name as the caller, record that and rely on (a), (d), (e) and the CDK assertion.
3. `aws cognito-idp list-user-pool-client-secrets --user-pool-id "$POOL" --client-id <new>`: exactly one secret; **record whether the response carries `ClientSecretValue`** (it is denied to the diff role either way) [security-B1]. Do not print the response to a shared log; check the field's presence with `--query 'ClientSecrets[0].ClientSecretValue != null'`. `aws secretsmanager get-secret-value` is **not** run.
4. **Gate before production N+1** [infra-auth-IA-3]: record the IAM action names CloudTrail shows for `ListUserPoolClientSecrets`, `AddUserPoolClientSecret` and `DeleteUserPoolClientSecret` (from steps 3, 5, 6) and compare with the role pin; run step 5 once, which proves the Node 22 runtime SDK has the three commands (a missing command fails the rotation with a fixed-text `...: TypeError`/not-a-constructor in `/tp/staging/client-secret`). If either fails, the builder bundles the pinned SDK into the function and this step is repeated.
5. CloudTrail `DescribeUserPoolClient` event from the function: no `ClientSecret` in `responseElements`.
6. `aws secretsmanager rotate-secret --secret-id <WebClientSecretArn>` (as the runbook's caller, 2.3); then `aws ecs update-service --cluster tp-staging --service tp-staging-web --force-new-deployment`; `aws ecs wait services-stable --cluster tp-staging --services tp-staging-web`; sign in (smoke account). `list-user-pool-client-secrets` shows two; the function's log shows the first rotation wrote the ID back. CloudTrail `AddUserPoolClientSecret`: `requestParameters` has **no** `ClientSecret` (none is sent, 2.4) and `responseElements` has no `ClientSecretValue` [security-N1]; if the response is logged, stop and record: the rotation then needs a different call shape.
7. Rotate again **without** redeploying: expect the rotation refused by the deletion guard (`create: web not redeployed since last rotation`), both secrets still listed, sign-in works [infra-auth-IA-10]. Then redeploy and rotate: two listed, the oldest gone; sign-in works.
8. `aws secretsmanager describe-secret` after N+1 and before step 6: no rotation has run, and `list-user-pool-client-secrets` showed exactly one (step 3) [infra-auth-IA-1].

**F4: alarms.** Five reset requests for the smoke account through the app within the hour (wait out the `sign_in` limit as needed): `aws cloudwatch get-insight-rule-report --rule-name <rule> --start-time <T> --end-time <now> --period 3600 --metrics MaxContributorValue` shows the account's `user_id` with 5, and the per-user alarm goes to ALARM (proves Contributor Insights on the KMS group). Record F1 to F5 results in ADR 0088 and the status file.

**F5: an account-level guard on the Cognito read path (the owner's call)** [security-B1]. Decide whether to add, in each
account, an SCP (if the accounts sit in an AWS Organization) or a permission boundary on the read-only permission sets that
denies `cognito-idp:DescribeUserPoolClient` and `cognito-idp:ListUserPoolClientSecrets` on the pool ARN unless
`aws:PrincipalArn` is the custodian role's ARN. Recommended: yes, an SCP on the production account at least. Exact
check after it is applied: step F3 2(e) run for a read-only SSO role returns `explicitDeny`, and F3 steps 6 and 7 still
pass (the custodian is unaffected). Record the ruling in ADR 0088 Not covered.

---

## 11. Risks and open questions (recommended answer: the safer option)

1. **One PR or two?** Two (section 9). One PR makes an image rollback past it break every sign-in.
2. **First secret: Cognito-generated (Describe) or caller-chosen (Add)?** Describe at create, with no ID (CDK's proven
   path; only `DescribeUserPoolClient` and `PutSecretValue` on the cutover); Add (Cognito-generated, no caller value) and
   List only in rotation and the ensure-Update, verified by F3 step 4 before production N+1.
3. **Scheduled rotation?** No: on demand, yearly and on suspicion, with a forced redeploy (2.4).
4. **Resource-policy deny could lock out a break-glass reader.** Accept: nobody needs to read the value; a suspected
   exposure is handled by rotating, which the custodian role does.
5. **Classifier depends on Cognito's message text (unverified).** Match broadly (`secret hash|client secret`), record
   F2 step 10's text, and alarm on `ClientCredentialRefused`; a miss degrades to today's mapping, never to an unlock. The
   start-up probe uses the same classifier: a miss there passes open (the alarm and the smoke sign-in still catch it).
6. **Hash over the email alias at `InitiateAuth` (unverified).** Hash what is sent; F1 step 4 proves it; the
   challenge hash over `opened.u` is pinned by the endpoint test.
7. **The enrolment rule strands a person who lost their factor.** Accept: that ticket is already held at the desk until
   UX PR 65; self-enrolment by password is the takeover.
8. **C2 refusal raises engineer toil for stuck invitees.** Accept, with the runbook step; the old remedy linked a
   possibly controlled identity.
9. **Retained named log group blocks a redeploy after a rollback.** The runbook paragraph says import or delete it, as
   for PR 6b-3.
10. **Runtime SDK lacks the secret calls.** The first cutover does not depend on them (Create calls only Describe and
    Put). Rotation and the ensure-Update do: F3 step 4 is a gate before production N+1, and if it fails the builder
    bundles the pinned SDK into that one function.
11. **Contributor Insights on a KMS log group (unverified).** F4 proves it; if it fails, the per-user alarm becomes a
    scheduled worker query over `audit_event` (a follow-up), and the weekly SQL stands meanwhile.
12. **`record_sign_in_with_mfa` still accepts an active re-enrolment.** Stopped (a migration); ADR 0088 Revisit, with
    UX PR 65's migration.
13. **Who may start a rotation (the `RotateSecret` exception in 2.3)?** Recommended: the founder's break-glass role
    only, the same principal as 4.3's Cognito step, since rotation is yearly or on suspicion; the operator role is not
    widened. Needs the founder's ruling before PR 2 merges (the ARN goes in the resource policy).
14. **Who runs `admin-delete-user` for a stuck invitee (4.3)?** Recommended: the founder's break-glass session, recorded
    per the audit runbook. Alternative: exactly `AdminDeleteUser` and `AdminGetUser` on the pool on the operator role,
    pinned. Founder's ruling.
15. **The N to N+1 window (2.5).** Recommended: N+1 in production within 7 days of N, and before the first customer user
    is invited. Founder's ruling on the bound.
16. **Account-level guard on `DescribeUserPoolClient` (F5).** Recommended: an SCP (or permission boundary on read-only
    permission sets) denying it and `ListUserPoolClientSecrets` except to the custodian role. The owner's call.
17. **The probe adds one Cognito call per web task start.** Accept: one call per process, fails open on anything but a
    positive refusal, so a Cognito outage never blocks a deploy or a scale-out; it is the only gate that runs before
    cleanup deletes the old client.
