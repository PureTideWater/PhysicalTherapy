# AWS SDK comparison, base against head (lane B dependencies, 2026-11-12)

Required by docs/runbooks/dependency-upgrades.md, "The upgrades made on purpose", bullet "AWS": the SDK over real
sockets to local stubs and inside the worker's esbuild bundle, base against head.

- base: /home/user/wt/base at fd14d89f. `@aws-sdk/client-*` 3.1160.0, `@smithy/core` 3.38.0,
  `@smithy/node-http-handler` 4.14.0, `@smithy/fetch-http-handler` 5.8.0, `@smithy/types` 4.19.0, `@aws-sdk/core` 3.979.0.
- head: /home/user/PhysicalTherapy at f063e54f. `@aws-sdk/client-*` 3.1164.0, `@smithy/core` 3.39.0,
  `@smithy/node-http-handler` 4.14.2, `@smithy/fetch-http-handler` 5.8.1, `@smithy/types` 4.20.0, `@aws-sdk/core` 3.980.1.
- The versions were checked three ways: each client's package.json as resolved from the workspace package that depends on
  it, the pnpm link of each client to its `@smithy/*` packages, and the list of packages esbuild put in each bundle.
- Nothing was changed in either checkout; no git writes. Scripts and recordings are in /home/user/wt/sdk-compare.
  All data is synthetic (AKIDEXAMPLE, example.test addresses, FAKE-… markers). Node v22.

## Result in one paragraph

44 cases ran on each install, unbundled and inside an esbuild bundle built with the worker's options. 40 are identical
on the wire and in their results. 4 differ, all of them fixes on head, and none is reached by this codebase's present
configuration: two are the custom-logger redaction bug of `@smithy/core` 3.38.0 (reproduced on base, fixed on head; no
production code passes a `logger` to an SDK client), one is an abort during retry backoff now rejecting at once (it
makes the Cognito global sign-out's 10 s abort timer exact instead of up to one backoff late), and one is the error a
configured `socketTimeout` produces when a response body stalls (no production client sets `socketTimeout`). The
bundled recordings equal the unbundled ones on both installs except the minified class name of the HTTP/2 handler.

## How the code builds its clients (what the stubs exercised)

| Client | Where | Configuration |
| --- | --- | --- |
| BedrockRuntimeClient | packages/model-gateway/src/config.ts:143 | `{ region, endpoint, maxAttempts: 1 }`; no request handler given, so the client's default, `NodeHttp2Handler` (HTTP/2) on both installs; only `InvokeModelCommand` is used (providers/bedrock.ts:52), no streaming call |
| S3Client | apps/worker/src/platform/wiring.ts:24,45; apps/worker/src/intake/wiring.ts:19; apps/web/src/lib/server/services.ts:310,333 | `{}` |
| S3Client (presign) | apps/web/src/lib/uploads/targets.ts:63 | `{ region, requestChecksumCalculation: 'WHEN_REQUIRED' }`; `getSignedUrl` with `signingDate`, `signableHeaders`, `unhoistableHeaders` |
| KMSClient | packages/db/src/crypto/kms-key-provider.ts:44 | `{}` |
| SESv2Client | apps/worker/src/mail/mail.ts:181; apps/worker/src/platform/wiring.ts:63; apps/web/src/lib/server/services.ts:343 | `{}` or `{ credentials }` |
| RDSClient, SQSClient | apps/worker/src/platform/wiring.ts:34,62 | `{}` |
| STSClient | apps/web/src/lib/screening/validation-credentials.ts:49; infra/lib/cdk-diff-plan.ts:39 | `{ maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: 2000 } }`; `{ region, maxAttempts: 1 }` |
| CognitoIdentityProviderClient | apps/web/src/lib/auth/cognito-provider.ts:80 | `{ region }` and `{ region, maxAttempts: 1 }`; `globalSignOut` passes `{ abortSignal }` (line 673) |
| TextractClient | packages/contracts/src/evidence/scan.ts:92 | `{}` |

In the harness each client also gets `endpoint` (the local stub), `region: 'us-east-1'` and static fake credentials
(case j gives none, on purpose); S3 uses `forcePathStyle: true` to reach 127.0.0.1.

## Table

"same" means the recording is byte-identical after masking: method, path, header names (sorted and in wire order), every
header value (dates, signatures, invocation ids, ports and version numbers masked), HTTP version, body length and
SHA-256, connection reuse, and the parsed result or error.

| Case | base | head | Same or different |
| --- | --- | --- | --- |
| a0 Bedrock request handler class | `NodeHttp2Handler` | `NodeHttp2Handler` | same |
| a1, a2 Bedrock InvokeModel over h2c, twice on one client | HTTP/2.0 `POST /model/synthetic.model-v1%3A0/invoke`, `amz-sdk-request: attempt=1; max=1`, body hash signed | identical | same |
| a3 Bedrock InvokeModel, 429 with maxAttempts 1 | `ThrottlingException`, 1 request | identical | same |
| b1 S3 PutObject 2 MB | `expect: 100-continue`; body sent only after the stub's 100; `x-amz-sdk-checksum-algorithm: CRC32`, `x-amz-checksum-crc32` present, `content-length: 2097275`, no `transfer-encoding` | identical | same |
| b2 S3 PutObject 2 MB, stub delays its 100 by 2.5 s | client waited; no body byte before the 100 | identical | same |
| b3 S3 PutObject as the object-lock store (ChecksumSHA256, IfNoneMatch, lock, SSE-KMS) | `x-amz-checksum-sha256` sent, no CRC32 added | identical | same |
| b4, b5 (two parts), b6 S3 multipart | Create, UploadPart ×2 (`x-amz-checksum-crc32` each), Complete (`if-none-match: *`); one connection reused | identical | same |
| b7 S3 GetObject, correct `x-amz-checksum-crc32` | body read, `ChecksumCRC32: "yO0JEw=="`; request carries `x-amz-checksum-mode` | identical | same |
| b8 S3 GetObject, wrong `x-amz-checksum-crc32` | rejected: `Checksum mismatch: expected "AAAAAA==" but received "yO0JEw==" in response header "x-amz-checksum-crc32".` | identical | same |
| b9 S3 HeadObject | `HEAD`, signed | identical | same |
| b10 presigned PUT as the upload targets build it (fixed signing date) | query names `X-Amz-Algorithm, X-Amz-Content-Sha256, X-Amz-Credential, X-Amz-Date, X-Amz-Expires, X-Amz-Signature, X-Amz-SignedHeaders, x-id`; signed headers `content-length;content-type;host;if-none-match;x-amz-server-side-encryption;x-amz-server-side-encryption-aws-kms-key-id` | identical URL, identical signature | same |
| b11 presigned PUT, default client; b12 presigned GET | b11 adds `x-amz-checksum-crc32`, `x-amz-sdk-checksum-algorithm`; b12 adds `x-amz-checksum-mode`, signed headers `host` | identical URLs, identical signatures | same |
| c1 KMS GenerateDataKey, c2 Decrypt | `application/x-amz-json-1.1`, one connection reused | identical | same |
| d1 SESv2 SendEmail | `POST /v2/email/outbound-emails`, `application/json` | identical | same |
| d2 SESv2 SendEmail, 500 then 200 (default retry) | two requests, `amz-sdk-request: attempt=1; max=3` then `attempt=2; max=3`, same connection | identical | same |
| e1 RDS DescribeDBSnapshots | `application/x-www-form-urlencoded`, XML parsed | identical | same |
| f1 SQS SendMessage, f2 ReceiveMessage, f3 DeleteMessage | `application/x-amz-json-1.0`, MD5 checks pass | identical | same |
| g1 STS AssumeRole (with the web app's timeouts), g2 GetCallerIdentity | `amz-sdk-request: attempt=1; max=1` | identical | same |
| h1 Cognito InitiateAuth, h2 AdminGetUser, h3 InitiateAuth refused | h1 and h3 unsigned (no `authorization`, no `x-amz-content-sha256`); h3 `NotAuthorizedException` | identical | same |
| i1 Textract StartDocumentTextDetection, i2 GetDocumentTextDetection | `application/x-amz-json-1.1` | identical | same |
| j1 ECS container credentials through the default chain, then STS | stub saw `GET /synthetic-ecs-credentials` with headers `authorization: Bearer FAKE-CONTAINER-TOKEN-0000`, `connection: keep-alive`, `host`; the STS call was then signed with `Credential=AKIDCONTAINEREXAMPLE/…` and `x-amz-security-token: FAKE-CONTAINER-SESSION-TOKEN`; source `CREDENTIALS_HTTP` | identical | same |
| k1 logger, KMS GenerateDataKey; k2 KMS Decrypt | no sensitive marker in the capture (Plaintext redacted); the ciphertext, which the model does not mark sensitive, appears on both | identical | same |
| k3 logger, Cognito InitiateAuth; k4 the same refused | no marker: `AuthParameters`, `ClientId`, `AccessToken`, `IdToken`, `RefreshToken` all `***SensitiveInformation***` | identical | same |
| k5 logger, STS AssumeRole; k6 Bedrock InvokeModel | no sensitive marker (SecretAccessKey and the body redacted; the session token, not marked sensitive in the model, appears on both) | identical | same |
| k7 logger, Cognito AdminGetUser (sensitive members inside list items) | **leaked**: `output.UserAttributes.0.Value: "00000000-0000-4000-8000-000000000003"`, `output.UserAttributes.1.Value: "FAKE-SECRET-ATTRIBUTE-0013@example.test"` | both `"***SensitiveInformation***"` | **different** |
| k8 logger, Cognito AdminCreateUser | **leaked**: `input.UserAttributes.0.Value: "FAKE-SECRET-ATTRIBUTE-0014@example.test"`, `input.UserAttributes.1.Value: "true"`, `output.User.Attributes.0.Value: "FAKE-SECRET-ATTRIBUTE-0016@example.test"` (TemporaryPassword redacted on both) | all `"***SensitiveInformation***"` | **different** |
| l1 Cognito AdminUserGlobalSignOut with `abortSignal`, aborted 100 ms into a 3 s retry delay (stub: 400 `TooManyRequestsException`, `retry-after: 3`) | `AbortError: Request aborted`, but `"only after the retry delay ran out (1.5 s or more from the first response)"` (3008 ms); 1 request | `AbortError: Request aborted`, `"promptly after the abort (under 1.5 s from the first response)"` (101 ms); 1 request | **different** |
| m1 S3 GetObject whose body stalls after the headers, codebase configuration | `still pending 4500 ms after the call began` | identical | same |
| m2 the same with `requestHandler: { socketTimeout: 1000 }` (NOT a configuration this codebase uses) | `rejected: Error: aborted` | `rejected: TimeoutError: @smithy/node-http-handler - the request socket timed out after 1000 ms of inactivity (configured by client requestHandler).` | **different** |
| n1 (slow.mjs) KMS Decrypt, stub never answers, codebase configuration | `still pending after 330 s` | `still pending after 330 s` | same |

No header name or header value differs in any case. The only on-the-wire text that differs is the version inside the
unmasked user agent, kept outside the comparison: base `aws-sdk-js/3.1159.0 … api/s3#3.1159.0 m/N,Z,b,U,E,e`, head
`aws-sdk-js/3.1163.0 … api/s3#3.1163.0 m/N,Z,b,U,E,e` (the feature letters are the same). Each release's built file
carries the version before its package.json's (3.1160.0 says 3.1159.0, 3.1164.0 says 3.1163.0); that is how the two
packages were published, the same on both sides, and not something this repository reads.

## Judgement of each difference

1. **k7, k8: logger redaction (aws/aws-sdk-js-v3 issue 8393).** Cause, read from the installed packages:
   `@smithy/core` `dist-es/submodules/client/smithy-client/schemaLogFilter.js` on 3.38.0 returns a list or a map unfiltered
   unless the list member or map value is itself marked sensitive; 3.39.0 filters each list item and map value
   (changelog 3.38.1: "Redact sensitive fields within list items and map values in schema-based logging"). On base, a
   client given a custom `logger` hands it Cognito user attribute values (email, sub) in clear for AdminGetUser and
   AdminCreateUser. Top-level sensitive members (KMS Plaintext, Cognito AuthParameters and tokens, STS SecretAccessKey,
   Bedrock body, TemporaryPassword) were redacted on both. Can it change behaviour here: **no today**, because no
   production client is given a `logger` (next section), so the SDK logs nothing on either install. Head removes a
   latent leak that would have breached the "log IDs, never a name" rule the day someone passed a logger; head is the
   safer side and base is the release npm marks deprecated.
2. **l1: abort during retry.** `@smithy/core` 3.39.0 passes the command's `abortSignal` into the retry middleware
   (changelog: "Return `AbortError` immediately when an operation is aborted during retry-token acquisition, backoff,
   or custom retry-token delays"). The one production use is `globalSignOut` (apps/web/src/lib/auth/cognito-provider.ts:667-676,
   `SIGN_OUT_TIMEOUT_MS = 10_000`, default 3 attempts). On base an abort that lands inside a backoff is honoured only when
   the backoff ends; on head at once. Same error name and message, same number of requests. Effect: the sign-out
   timeout becomes exact; **a small improvement, no code change needed**. Any caller that matched on timing would not
   exist; callers matching `AbortError` see the same error.
3. **m2: stalled body with a configured `socketTimeout`.** `@smithy/node-http-handler` 4.14.2 keeps the socket idle
   timeout armed through the response body and rejects with `TimeoutError`; 4.14.0 destroyed the request and the body
   read failed with a bare `Error: aborted`. **Cannot change behaviour here**: no production client sets `socketTimeout`
   (grep for `socketTimeout` under apps, packages, infra: none; the STS client sets `connectionTimeout` and
   `requestTimeout` only). With the codebase's configuration a stalled body hangs on both installs (m1), as before.
4. **Seen in the packages, not a behaviour difference today.** The 3.1164.0 KMS, SESv2, STS, Cognito and Textract clients
   carry `defaultSocketTimeout: getDefaultSocketTimeout(config?.requestHandler, 300_000)` (SQS and RDS `900_000`; S3 and
   Bedrock runtime none); base has no such line. `@aws-sdk/core` 3.980.1 returns it only when the environment variable
   `AWS_ENABLE_DEFAULT_SOCKET_TIMEOUT_2026` is `"true"`, which nothing in apps, packages or infra sets, and n1 confirms no
   timeout fires at 300 s on head. The name suggests a later release may turn it on by default; when it does, a call
   idle for 5 minutes (15 for SQS and RDS) fails with `TimeoutError` instead of hanging. The longest wait the code asks
   for is the SQS long poll, far below that.
5. **Other changes read in the diff and not separately observable:** `@smithy/node-http-handler` 4.14.1 creates one
   `http.Agent` for concurrent first requests (so `destroy()` closes every socket); `@smithy/fetch-http-handler` 5.8.1
   creates its request timeout once (the worker and the web server use the Node handlers, not fetch).
6. **Same on both, worth knowing:** the Bedrock stub saw a new HTTP/2 session for the second InvokeModel on the same
   client (a1, a2) on base and on head alike; the cause was not investigated.

## The worker bundle

apps/worker/build.ts bundles with esbuild `bundle: true, platform: 'node', format: 'esm', target: 'node22', sourcemap: true,
external: ['pg-native', 'playwright-core']` and a `createRequire` banner. build.mjs reuses exactly those options with each
install's own esbuild (0.28.2 on both), on the whole harness (all ten clients, all 44 cases), with two departures: the
`embed-brand-files` plugin is left out (it only rewrites src/report/brand-files.ts), and `nodePaths` is added so the
harness, which lives outside the repository, resolves `@aws-sdk/*` from the workspace packages that depend on them.
esbuild's input list confirms each bundle holds that install's versions (base: `@smithy/core@3.38.0`,
`@smithy/node-http-handler@4.14.0`; head: `@smithy/core@3.39.0`, `@smithy/node-http-handler@4.14.2`).

| Comparison | Result |
| --- | --- |
| base unbundled against base bundle | 1 of 44 different: `a0.bedrock.requestHandlerClass` `"NodeHttp2Handler"` against `"_NodeHttp2Handler"` (esbuild's renaming of the class; the wire is identical) |
| head unbundled against head bundle | the same single difference |
| base bundle against head bundle | the same 4 cases as unbundled (k7, k8, l1, m2), with identical text |

## Step 5: does production code pass a `logger` to an AWS SDK client?

**None.** Every `new …Client(` under apps/, packages/ and infra/ on head (non-test) takes `{}` or only `region`,
`endpoint`, `maxAttempts`, `credentials`, `requestChecksumCalculation` or `requestHandler` timeouts (the lines in the
table above, plus infra/lib/migration-runner.ts:22-23 `new ECSClient({})`, `new CloudFormationClient({})`). No shared
client config object exists (no `ClientConfig`, no spread of a config into a client). The word `logger` in the files
that import `@aws-sdk/*` (apps/web/src/lib/server/services.ts, apps/web/src/lib/auth/cognito-provider.ts,
apps/web/src/lib/screening/validation.ts, apps/worker/src/platform/mail-events.ts) is always the application's own
`Logger`, used for the application's log lines and never placed in an SDK client's configuration.
packages/contracts/src/testing/recorded-textract.ts:69 (test support) passes `region`, `credentials`, `requestHandler`,
`maxAttempts`, no logger.

## What was not run, and why

- **TLS.** The stubs are cleartext (h2c and plain HTTP/1.1). Over TLS the S3 client sends `x-amz-content-sha256:
  UNSIGNED-PAYLOAD` where these recordings show the body hash; ALPN negotiation of HTTP/2 for Bedrock is not exercised.
  Both installs were run the same way, so the comparison holds, but it is a comparison of the cleartext paths.
- **Bedrock streaming and Converse.** The gateway calls only `InvokeModel`; no streaming variant was run.
- **Real AWS.** Nothing left 127.0.0.1; server-side acceptance of the signatures is inferred from identical signed
  headers and, for the presigned URLs with a fixed date, identical signatures.
- **The worker's real entry points in the bundle.** The harness was bundled with the worker's options, not
  apps/worker/src/main.ts itself (that would need a database and queue); no build was run inside either checkout.
- **The default socket timeout switched on** (`AWS_ENABLE_DEFAULT_SOCKET_TIMEOUT_2026=true`): not run; the codebase does
  not set it.
- **Not every command the code calls**: one or more per client (those in the table). Cognito WebAuthn and software-token
  calls, SES `GetEmailAddressInsights` and the configuration-set calls, the other RDS restore calls, `ListObjectsV2`,
  `GetObjectTagging`, `AbortMultipartUpload`, and the infra ECS and CloudFormation clients were not driven.
- **Timing cases** (b2, l1, m1, m2, n1) record a coarse bucket, not a measurement; each was run at least twice
  (unbundled and bundled) with the same bucket.
- pnpm test, lint and typecheck were not run in head, as instructed.

## Commands to re-run

```sh
cd /home/user/wt/sdk-compare
RUN="env -i PATH=$PATH HOME=/home/user/wt/sdk-compare/empty-home AWS_EC2_METADATA_DISABLED=true node"

# unbundled, module resolution rooted in each install (about 20 s each)
$RUN unbundled.mjs /home/user/wt/base base.json base
$RUN unbundled.mjs /home/user/PhysicalTherapy head.json head
node compare.mjs base.json head.json            # add --summary for the wire lines of every case

# the worker's bundling options, each install's own esbuild
node build.mjs /home/user/wt/base /home/user/wt/sdk-compare/bundle-base.mjs
node build.mjs /home/user/PhysicalTherapy /home/user/wt/sdk-compare/bundle-head.mjs
$RUN bundle-base.mjs bundle-base.json bundle-base
$RUN bundle-head.mjs bundle-head.json bundle-head
node compare.mjs bundle-base.json bundle-head.json
node compare.mjs base.json bundle-base.json
node compare.mjs head.json bundle-head.json

# the one slow case (5.5 minutes each; run side by side)
$RUN slow.mjs /home/user/wt/base slow-base.json base & $RUN slow.mjs /home/user/PhysicalTherapy slow-head.json head & wait
```

Files: core.mjs (stubs and cases), unbundled.mjs, bundle-entry.mjs, build.mjs, compare.mjs, slow.mjs; recordings
base.json, head.json, bundle-base.json, bundle-head.json, slow-base.json, slow-head.json; saved comparisons
diff-base-head.txt, diff-bundle-base-head.txt, diff-base-vs-its-bundle.txt, diff-head-vs-its-bundle.txt; build logs
build-base.log, build-head.log. The harness reads nothing from either repository except its installed packages.
