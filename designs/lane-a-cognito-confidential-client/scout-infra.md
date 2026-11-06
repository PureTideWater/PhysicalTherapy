# Scout: infra and IAM, cognito-confidential-client (worktree /home/user/cognito-cc, base 45d7d0c1)

Read only. aws-cdk-lib 2.275.0 installed (infra/node_modules), aws-cdk CLI ^2.1146.1, @aws-sdk/client-cognito-identity-provider
3.1160.0. Baseline: `pnpm exec vitest run test/identity.test.ts` in infra passes 30/30 (10 s).

## 1. Where the client is and who reads its ID

| Place | file:line | What changes |
| --- | --- | --- |
| Client definition | infra/lib/constructs/identity.ts:109-121 (`generateSecret: false` at :114; comment "no client secret to store" :109-110) | `generateSecret: true`; comment rewritten |
| Pool docstring | identity.ts:37-64 (also :45-46 says temp passwords "expire after three days"; the code is 7, `INVITATION_DAYS` :23, :89 — stale, fix in passing) | add the confidential client and the secret |
| Recovery | identity.ts:91 `AccountRecovery.EMAIL_ONLY` | unchanged under the recommended design (see 5) |
| Props | identity.ts:25-35 | add `key: kms.IKey` (secret and log group under the environment key) and the environment name |
| Instantiation | infra/lib/platform-stack.ts:106-112 | pass `key` (already in scope, :86-88) |
| Web env | infra/lib/constructs/compute.ts:231-232 `COGNITO_CLIENT_ID: props.identity.webClient.userPoolClientId` | stays (a Ref; its value changes on replacement) |
| Web secrets | compute.ts:269-274 | add `COGNITO_CLIENT_SECRET: ecs.Secret.fromSecretsManager(identity.clientSecret, 'clientSecret')` |
| Compute docstring | compute.ts:117-120 ("web: ... the cookie-sealing secret") | name the client secret |
| Stack output | infra/lib/platform-stack.ts:225 `WebClientId` | stays; optionally add `WebClientSecretArn` (an ARN, never the value) beside the login secret ARNs :220-223 |
| Web config | apps/web/src/lib/server/config.ts:33-34 (schema), :272-276 (auth) | `COGNITO_CLIENT_SECRET` in the schema (the compute contract test requires `NAME:` there, below) and required for cognito |
| Provider wiring | apps/web/src/lib/server/services.ts:133-140 | pass the secret to `CognitoAuthProvider` |
| Docs | README.md:542; docs/adr/0016-...:89 (deployment variables) | add `COGNITO_CLIENT_SECRET` (Secrets Manager) |

Nobody else reads the client ID: no `.env*` or `*.example` file holds COGNITO_*, no SSM parameter, no workflow or
script reads `WebClientId` (grep of the repo outside node_modules: only platform-stack.ts:225 and its test). The unit
tests use the synthetic `syntheticclient` (apps/web/src/lib/http/http.test.ts:421-605, releases.test.ts:66-67,
cognito-provider.test.ts). The uptime canary does not sign in through Cognito. The web reaches Cognito through NAT
(infra/lib/constructs/network.ts:47), no endpoint change.

## 2. CDK 2.275 behaviour (read in node_modules)

- `generateSecret`: CFN `AWS::Cognito::UserPoolClient.GenerateSecret`, update requires replacement. `CfnUserPoolClient`
  in 2.275 has no `ClientSecret` property (cognito.generated.d.ts, CfnUserPoolClientProps: "you can't specify a secret
  value"). Replacement keeps the logical ID (`IdentityUserPoolWebClient...`) and gives a new physical client ID.
- `UserPoolClient.userPoolClientSecret` (aws-cognito/lib/user-pool-client.js): throws unless `generateSecret`; else an
  `AwsCustomResource` `Custom::DescribeCognitoUserPoolClient`, onUpdate `describeUserPoolClient`, policy
  `fromSdkCalls({ resources: [pool ARN] })`, `installLatestAwsSdk: false`, response `UserPoolClient.ClientSecret` as
  `SecretValue.resourceAttribute`. Logging is `Logging.withDataHidden()` unless the feature flag
  `@aws-cdk/cognito:logUserPoolClientSecretValue` is on; infra/cdk.json does not set it (off: hidden).
- DO NOT USE IT HERE. `AwsCustomResource` is a `SingletonFunction` (uuid `679f53fa-c002-430c-b0da-5b7982bd2287`,
  custom-resources/lib/aws-custom-resource/aws-custom-resource.js), and the stack already has one: the S3 prefix-list
  lookup (network.ts:145-152, `ANY_RESOURCE` policy, `logGroup: lookupLogGroup` :131-136). A second AwsCustomResource
  reuses that one function and role (its own `role`/`logGroup` props are ignored by the singleton), so
  (a) the network lookup's role gains `cognito-idp:DescribeUserPoolClient` on the pool: a function that only reads a
  prefix list could read the client secret (least privilege broken); (b) the secret passes back to CloudFormation as
  custom-resource response data (hidden from logs, but in the response); (c) the pin
  infra/test/network.test.ts:228-229 (`statements ... toEqual([['ec2:DescribeManagedPrefixLists', '*']])`) fails.
- Rotation in place now exists. SDK 3.1160 has `AddUserPoolClientSecret`, `ListUserPoolClientSecrets`,
  `DeleteUserPoolClientSecret` (models_0.d.ts:397-444, 7464-7488, 9952-9964): "up to 2 active secrets per app client for
  zero-downtime credential rotation"; Add takes an optional caller-chosen `ClientSecret` (then the value is not returned);
  `ClientSecretId` is `<client-id>--<epoch-create-time>`; List never returns values. Add works only on an existing
  confidential client. So P-1's "a Cognito client secret cannot be rotated in place" (proposals.md P-1 (c)) is out of date:
  only the public-to-confidential change replaces the client; later rotations keep the client ID. IAM action names
  (`cognito-idp:AddUserPoolClientSecret` etc.) and the custom value's length and charset rules are NOT verified here
  (check the Service Authorization Reference and staging, founder step F3).
- `AccountRecovery` enum (aws-cognito/lib/user-pool.d.ts:491-516): EMAIL_AND_PHONE_WITHOUT_MFA, PHONE_WITHOUT_MFA_AND_EMAIL,
  EMAIL_ONLY, PHONE_ONLY_WITHOUT_MFA, PHONE_AND_EMAIL, NONE. A pool property: in-place.
- `enablePropagateAdditionalUserContextData` needs a client secret (CfnUserPoolClientProps doc); only useful with the
  Plus plan's threat protection (not bought, identity.test.ts:96-99). Leave off; note it becomes possible.

## 3. Recommended infra design (best option)

The secret's value is generated by Secrets Manager, set on Cognito by a dedicated stack function, and reaches only the
web task's execution role.

1. `ClientSecret` (`secretsmanager.Secret`, in Identity, `encryptionKey: key`), JSON `{ clientSecret, clientSecretId }`,
   value generated (`generateSecretString`, `generateStringKey: 'clientSecret'`, letters and digits, length within
   Cognito's limit, to verify in F3). `RemovalPolicy.RETAIN` is not needed (replaceable), but keep it consistent with
   the cookie secret (compute.ts:171-175, no retain).
2. A dedicated custom resource `Custom::WebClientSecret` (its own `lambda.Function`, inline source <4 KiB, Node 22, no VPC,
   own log group `/tp/<env>/client-secret` under the key, one year, retained), following MigrationRun's pattern
   (infra/lib/constructs/migration-run.ts:56-134: inline `Code.fromInline`, `cr.Provider` with `logGroup`,
   `disableWaiterStateMachineLogging`). Not an AwsCustomResource (section 2). Properties: pool ID, client ID, secret ARN
   (so a client replacement re-runs it). On Create/Update: GetSecretValue, `AddUserPoolClientSecret` with that value,
   `ListUserPoolClientSecrets`, `DeleteUserPoolClientSecret` for every other secret (Cognito's generated one), write the
   new `clientSecretId` back (PutSecretValue keeps the value). It returns no data to CloudFormation and logs IDs only.
   Role, exactly: `secretsmanager:GetSecretValue`, `secretsmanager:PutSecretValue` on that secret; `kms:Decrypt`,
   `kms:GenerateDataKey` on the key with `kms:ViaService secretsmanager.<region>` (the KMS key policy pattern the
   compute pin checks, compute.test.ts:252-260); `cognito-idp:AddUserPoolClientSecret`, `ListUserPoolClientSecrets`,
   `DeleteUserPoolClientSecret` on the pool ARN. Nothing else.
   Simpler alternative with the same isolation: the function calls `DescribeUserPoolClient` and PutSecretValue (no Add or
   Delete), but then the value is Cognito's and rotation needs Add anyway; one function for create and rotate is better.
3. Rotation: the same handler as a Secrets Manager rotation function (`secret.addRotationSchedule` with
   `rotationLambda`, or invoked on demand by `aws secretsmanager rotate-secret`), steps: createSecret = if two Cognito
   secrets exist, delete the one that is not AWSCURRENT's `clientSecretId`; Add a new generated value as AWSPENDING;
   setSecret no-op; testSecret = a harmless call that needs the hash (an `InitiateAuth` for a synthetic smoke account is
   too heavy; accept no-op plus the deploy's smoke check); finishSecret = AWSCURRENT. Then force a new deployment of the
   web service (ECS injects at task start), exactly like database logins (docs/runbooks/key-rotation.md:26-32). The old
   value stays valid until the next rotation deletes it; on suspicion, rotate twice after the redeploy is steady (the
   second rotation deletes the exposed one). Schedule: founder's call (30 days like logins, `SECRET_ROTATION_DAYS` in
   infra/lib/retention.ts, or on demand only). Add a "Cognito client secret" section to docs/runbooks/key-rotation.md
   (between :32 and :34).
4. Web only: ECS secret on the web container (compute.ts:269-274). Each task definition gets its own CDK execution role
   (compute.ts:426-434 sets only `taskRole`), so the grant lands on the web execution role alone. Do not grant the task
   role: ApplicationRole is shared by web and worker (compute.ts:214 and :278), so a task-role read would reach the
   worker. Nothing in env files, the build or the bundle: the value arrives as a container secret at start; the client
   bundle never sees server config (config.ts is server-only, `apps/web/src/lib/server/`).
5. Logs: the handler logs `{ client_secret_id, step }` at most; never the value. The CloudTrail trail
   records `AddUserPoolClientSecret` request parameters; Cognito marks `ClientSecret` sensitive in its API model, so
   CloudTrail should redact it (NOT verified; founder step F3 checks the trail event shows it redacted). If it is not
   redacted, use the generated-by-Cognito path (Add without a value, then PutSecretValue) instead, where only the
   response carries it and CloudTrail does not log responses for this call (also to verify).

## 4. Tests that pin this (all must be changed in the same PR)

- infra/test/identity.test.ts:30 (`onlyResource` UserPoolClient: still exactly one; good) and :119-130 (`GenerateSecret`
  `toBe(false)` at :125 becomes true; test name "no secret" :119 renamed). Add: the secret under the key, the custom
  resource's exact role statements, its log group, no `Custom::DescribeCognitoUserPoolClient` in the template, and the
  network lookup role unchanged.
- infra/test/compute.test.ts:214-223 (web secrets exact `toEqual`: add `COGNITO_CLIENT_SECRET: field(<secret>, 'clientSecret')`);
  :225-228 (worker, platform, screening exact: they stay without it, which proves "web only");
  :241-248 (each execution role's GetSecretValue resources exact: add the client secret to `web` only; the KMS grant
  count per role stays 1, :255-258); :263-275 (no `SECRET` in plain env names: satisfied, it is a secret);
  :352-353 (`COGNITO_CLIENT_ID: ref(webClient)`: unchanged); the compute contract test :555-575 requires
  `COGNITO_CLIENT_SECRET:` in apps/web/src/lib/server/config.ts (or billing config) because it is a non-URL secret the
  web container gets (`configured()` :564-567).
- infra/test/encryption.test.ts:72-80: `expect(checked).toBe(29)` and its comment (nine secrets, seven log groups)
  become 31 (ten secrets, eight log groups) with the design above; +1 more if a separate rotation log group.
- infra/test/network.test.ts:222-229: unchanged with the dedicated function; fails with `userPoolClientSecret`.
- infra/test/platform-stack.test.ts:40-90 (outputs `arrayContaining`, `WebClientId` :60): unchanged; add
  `WebClientSecretArn` if output.
- infra/test/application-role.test.ts:17-22 scans cognito-provider.ts for `new (Admin\w+)Command(` and must equal
  `USER_POOL_ADMIN_ACTIONS` (infra/lib/constructs/application-role.ts:14), and :159-164 pins the one
  `UserPoolAdministration` statement (application-role.ts:142-147). Any new Admin call for item (2) (AdminGetUser is
  already there; `AdminResetUserPassword`, `AdminSetUserMFAPreference`, `AdminDisableUser` are not) changes both. Note:
  ApplicationRole is the worker's too, so every Admin action added is the worker's as well.
- infra/test/monitoring.test.ts:54-60 (log-line contract read from apps/web sign-in.ts) and :342-350 (filter pin) are the
  pattern for R-11's new filters.

## 5. Item (2), the MFA_SETUP takeover: infra levers

The confidential client removes every direct route (ForgotPassword, ConfirmForgotPassword, InitiateAuth all need
SECRET_HASH without the secret: refused), leaving the app's own path. Routes to a CONFIRMED user with no factor:
an invited user who answered NEW_PASSWORD_REQUIRED and stopped before MFA_SETUP (Cognito marks CONFIRMED then); a
factor cleared by an administrator (UX PR 65's console reset, or by hand); an admin-created user outside the invitation
flow; a reset (already gated on `mfa_enrolled` in the app, A2). Infra options:
- No Cognito trigger fires at MFA_SETUP. Pre-authentication fires on InitiateAuth (sign-in) only, not on ForgotPassword
  (P-1 is right on that), and not again between NEW_PASSWORD_REQUIRED and MFA_SETUP in one flow. A Pre-authentication
  function calling `AdminGetUser` could refuse a CONFIRMED user with an empty `UserMFASettingList` at the start of
  sign-in (the abandoned invitation and the cleared factor), while the invitation's first sign-in (FORCE_CHANGE_PASSWORD
  at InitiateAuth) passes. Caveats: whether it runs for `USER_AUTH` choice-based sign-in, and how a passkey-only account
  shows in AdminGetUser (WebAuthn credentials are not in `UserMFASettingList`; there is no admin list call), are NOT
  verified; refusing passkey-only internal users would lock staff out. Treat as defence in depth only, after F4.
- The CustomMessage gate (P-1 (a)) adds nothing once the client is confidential except for IAM-holder console calls.
- Either trigger: `lambdaTriggers` is an in-place pool update (LambdaConfig), but the function's policy on the pool ARN
  and the pool's reference to the function form a cycle if granted through the function's default policy; put the grant
  in a separate `iam.Policy` attached to the function's role (Policy -> pool, pool -> function -> role; no cycle) and
  pin it. Needs `cognito-idp:AdminGetUser` on the pool for that function's own role (not ApplicationRole).
- Avoid custom attributes for an "enrolment open" flag: a pool `Schema` change risks replacing the pool (retained,
  deletion-protected in production: the deploy would fail; NOT verified which schema edits replace). No migration is
  needed for any infra option. The robust closure is in the app: answer MFA_SETUP only when the database shows a live
  enrolment right (an `invited` user with a live invitation, or a console-issued factor reset), else end the sign-in and
  send the person to their administrator; that is the provider/takeover scouts' part.
- `AccountRecovery.NONE` (P-1 (b)) would move resets to `AdminResetUserPassword` behind the app (a new Admin grant on the
  shared ApplicationRole, pins in 4). Not needed once the client is confidential.

## 6. Item (4), R-11 alarms (fits the same change; monitoring.ts and security-events.ts)

- Undelivered: a metric filter on the web log group for `$.msg = "password reset request not delivered"` (logged at
  apps/web/src/lib/auth/cognito-provider.ts:395 with `{ error_code, request_id }`), dimension `error_code` (a closed set
  of Cognito error names, low cardinality), and an alarm on the sum (any `CodeDeliveryFailureException` or
  `LimitExceededException` at >= 1 in `SECURITY_ALARM_PERIOD_SECONDS`, infra/lib/security-events.ts:14). Also count
  `password reset request failed` (sign-in.ts:348) in the same or a second filter. Pattern: monitoring.ts:306-321;
  constants beside SIGN_IN_BURST_* in security-events.ts:9-11; contract test like monitoring.test.ts:54-60.
- Per user: CloudWatch Contributor Insights (`AWS::CloudWatch::InsightRule`, none in the stack yet) on the web log group,
  keyed by `$.user_id`, filtered to a new line, e.g. `security event: password reset requested` with `{ user_id,
  request_id }` (an ID only; the audit row stays the record), and an alarm on
  `INSIGHT_RULE_METRIC(rule, 'MaxContributorValue')` over a day (threshold the writer sets against A3's rate, e.g. > 5).
  A metric-filter dimension on user_id would create one custom metric per user (cost and cardinality): not that. The app
  log line is a new string in sign-in.ts (watched path; lint:logs allows `user_id`). InsightRule is not a data store type
  in encryption.test.ts:33-50, so no change there; check monitoring's "every alarm notifies the operator topic" style
  tests pick it up.

## 7. Item (3), P-3: where it can be shown

No user pool exists in CI or this session, so Cognito's per-code cap on ConfirmForgotPassword can only be measured in
staging (founder step F2). The dev twin's `DEV_RESET_ATTEMPTS` (5) stays a model. A unit test can pin only the mapping
(`LimitExceededException`, `TooManyFailedAttemptsException` -> `rejected`, design 3.2 table).

## 8. Cutover (replacing the client)

One `cdk deploy` with the new template does, in CloudFormation order: create the new client (new ID); run
`Custom::WebClientSecret` (sets the generated value, deletes Cognito's); register a new web task definition (new
`COGNITO_CLIENT_ID` Ref, new secret); the web service's rolling deployment (circuit breaker rollback on failed health;
services depend on the migration run, compute.ts:421-423); then, in UPDATE_COMPLETE_CLEANUP_IN_PROGRESS, delete the old
client. Consequences:
- Sessions: application-held (ADR 0016); they survive. Cognito refresh tokens are revoked right after sign-in
  (cognito-provider.ts:153, comment :40-45), so almost none exist; any left are dead once the old client is deleted.
- In-flight sign-ins (3-minute auth session, identity.ts:14): a step started on an old task whose next request reaches a
  new task fails (session from another client); the person starts again (ADR 0081's Start again). Deploy off-hours.
- `release()` (cognito-provider.ts:335-340) sends `RevokeToken` with the new client for an old grant's refresh token:
  it will fail; the provider must swallow that (check sign-out does not 500) — provider scout.
- The grant's access token (`a`, used for ListWebAuthnCredentials / Start/CompleteWebAuthnRegistration,
  cognito-provider.ts:310-325) from the old client: whether Cognito still accepts it after the client's deletion is NOT
  verified; at most its 15 minutes (identity.ts:11). F1 checks it.
- Deploy order, two releases (best): release N, app only: `COGNITO_CLIENT_SECRET` optional; when present, SECRET_HASH /
  ClientSecret on every call; the dev twin requires and checks a hash when configured with a secret; infra unchanged.
  Release N+1, infra: the confidential client and the secret. Then an image-only rollback (deploy-and-rollback.md
  :278-298, `-c tp:skipMigrations=true --parameters ImageTag=<previous>`, which keeps the new template) to N still
  works. If shipped as one release, an image-only rollback to the previous tag breaks every sign-in (a confidential
  client refuses a call without SECRET_HASH); the rollback must then run from the previous tag's checkout (precedent:
  deploy-and-rollback.md:252) and replaces the client again (a third ID, public again). Record that in the runbook either
  way. A CloudFormation rollback during the deploy is safe: the old client is deleted only at cleanup.
- cdk:diff (infra/lib/cdk-diff-plan.ts:23-31; `pnpm cdk:diff`): with credentials it diffs staging `--method template`;
  without, it synthesizes only. The diff must show exactly: `AWS::Cognito::UserPoolClient` replace (GenerateSecret),
  the new secret, the function, its role and policy, its log group, the custom resource, the web task definition (new
  revision), the web service, the KMS key policy statement for the new roles, the R-11 filters, alarms and insight rule,
  and no replacement of the UserPool or any other stateful resource. docs/runbooks/dependency-upgrades.md:394-396 asks
  to read `pnpm cdk:diff` before taking a CDK change; there is no runbook specific to replacing an identity resource
  (searched docs/runbooks): add the client cutover and rollback to deploy-and-rollback.md as its own paragraph.

## 9. Screening-capacity watched paths

tools/screening-capacity/watched-paths.txt: infra/lib/constructs/compute.ts (:16), apps/web/src/lib/server/config.ts
(:113), services.ts (:114), cognito-provider.ts (:62), dev-provider.ts, dev-store.ts, sign-in.ts (:62-71) are watched;
identity.ts, monitoring.ts, security-events.ts, platform-stack.ts are not. The gate measures on the PR.

## 10. Founder's credentialed staging steps (for the list)

- F1. Cutover: `pnpm cdk:diff` against staging (read the diff above); deploy; record old and new client IDs from
  `aws cloudformation describe-stacks --stack-name tp-staging --query "Stacks[0].Outputs[?OutputKey=='WebClientId']"`
  before and after; sign in with a synthetic smoke account (password, TOTP; and a key account); confirm an app session
  opened before the deploy still works and that signing it out does not fail; confirm
  `aws cognito-idp describe-user-pool-client --user-pool-id <id> --client-id <old>` returns ResourceNotFoundException.
- F2. P-3: for a synthetic smoke account, request a reset through the app, then submit wrong codes on the app's confirm
  route (or `aws cognito-idp confirm-forgot-password --client-id <new> --secret-hash <computed locally, never pasted
  into a log> ...`) and count wrong codes until `LimitExceededException`; then whether the right code still works after;
  read the `password reset request timed` p99 in the web log group against 1,500 ms. Also: a `forgot-password` with the
  new client ID and no secret hash is refused (`NotAuthorizedException ... SECRET_HASH`), proving the direct route shut.
- F3. Secret: `aws secretsmanager describe-secret` on the new secret (KMS key is the environment key); its resource
  policy and IAM: only the web execution role and the secret function read it; `aws cognito-idp
  list-user-pool-client-secrets` shows exactly one, whose ID matches the secret's `clientSecretId`; the CloudTrail event
  for `AddUserPoolClientSecret` shows the value redacted; then one `aws secretsmanager rotate-secret` and a forced web
  redeployment, sign-in still works, two secrets listed, and the next rotation deletes the older.
- F4 (only if the Pre-authentication defence is built): a passkey-only internal account and an invited account's first
  sign-in both still pass; a CONFIRMED account with no factor is refused.

## Not verified here

Cognito: the custom secret's length and charset, IAM action names for the three secret calls, CloudTrail redaction of
`ClientSecret`, whether an access token of a deleted client is still accepted, whether Pre-authentication runs for
USER_AUTH, how passkey-only users appear in AdminGetUser, the per-code cap. CDK: no synth with the change was run
(design only); the singleton and feature-flag findings are from the 2.275 sources.
