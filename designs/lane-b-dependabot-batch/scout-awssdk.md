# Scout: #89, the @aws-sdk packages and stripe (2026-11-01, 17:10–17:25 UTC)

Base `claude/build-platform` is 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56; this report cites lines at that commit unless it names another. The trial tree was removed afterwards, and nothing tracked was changed. Scratch files are in `design/tmp/scout-awssdk/` (lockfiles, lockfile moves, logs, `scripts/variant.sh`, `scripts/ages.py`, `scripts/affected-sim.mts`) and `design/tmp/dl-*` (downloads, treated as untrusted).

## 1. Manifests: what #89 moves and what it leaves

On the base, every direct `@aws-sdk/*` dependency is `^3.1152.0`:

| Manifest:line | Package | Field |
|---|---|---|
| packages/model-gateway/package.json:17 | client-bedrock-runtime | dependencies |
| packages/db/package.json:17 | client-kms | dependencies |
| packages/contracts/package.json:16 | client-textract | dependencies |
| apps/web/package.json:15-17 | client-cognito-identity-provider, client-s3, s3-request-presigner | dependencies |
| apps/worker/package.json:36-38 | client-rds, client-s3, client-sesv2 | dependencies |
| infra/package.json:18 | client-sts | **devDependencies** |

- `stripe` is `^23.0.0` at packages/billing/package.json:19.
- No `tools` or root manifest declares any `@aws-sdk` package.
- That makes 9 distinct names (client-s3 appears twice): 8 clients plus `s3-request-presigner`.

**#89 (83f04cbd) moves all nine names and leaves none.** It sets each to `^3.1156.0` in 11 ranges across 7 manifests, and sets stripe to `^23.0.1` (`git diff 83d71fd6 83f04cbd`).
- **client-sts is included.** `infra/package.json` goes to `^3.1156.0`, and the commit's metadata gives `dependency-group: minor-and-patch` for every update.
- **Why it is included (routing).**
  - `.github/dependabot.yml:62-64` puts `@aws-sdk/*` in the `aws-sdk` group. Dependabot instead put all nine in `minor-and-patch` (`dependabot.yml:68-69`, which has no patterns and no dependency-type filter), as correction 2 records from job 123265353642.
  - Because `minor-and-patch` has no dependency-type filter, the infra devDependency is caught as well.
  - Nothing in the code or the network contradicts correction 2.
- **The item file's "eight clients plus s3-request-presigner" is correct.**

**#42 (be63bdc2, `refs/pull/42/head` = `co-001/pr-06b-mail-streams`)** adds three ranges, all `^3.1152.0`:
- apps/web/package.json:17 `client-sesv2`;
- apps/web/package.json:18 `client-sts`;
- apps/worker/package.json:39 `client-sqs`, a 10th distinct name that the base lockfile does not hold.

#42's merge base with the base is 56ed6279, so it is behind 83d71fd6.

## 2. Release ages (npm view, 2026-11-01 17:12 UTC; the policy is 4,320 minutes, tools/check-toolchain/policy.ts:50)

`latest` is 3.1161.0. 3.1162.0 is not published yet. Times below are the latest publish across the 10 clients we use, plus the presigner:

| Version | Latest publish (UTC) | Usable from | Now (17:05) | About 20:00 today | 11-02 19:00 |
|---|---|---|---|---|---|
| 3.1156.0 (#89) | 10-22 18:53 | 10-25 | yes | yes | yes |
| 3.1159.0 | 10-28 18:55:42 (client-sts) | 10-31 18:55 | **yes (newest usable)** | yes | yes |
| 3.1160.0 | base clients: 10-29 18:53:13 (client-rds); with #42's client-sqs: 18:55:06 | 11-01 18:53 / 18:55 | no | **yes** | yes |
| 3.1161.0 | 10-30 18:52:27 (client-textract) | 11-02 18:52:27 | no | no | **yes** |
| stripe 23.0.1 | 10-22 17:47:58 | 10-25 | **yes** | yes | yes |
| stripe 23.1.0 (latest) | 10-29 19:58:14 | 11-01 19:58:14 | no | **yes, 1 m 46 s of margin** | yes |

Prereleases are ignored: 23.2.0-beta.1 and 23.2.0-alpha.1.

**Transitive versions (the deciding entries).** Clients pin `@aws-sdk/token-providers` exactly at their own version; everything else is a caret range, so pnpm takes the newest mature version:
- `@aws-sdk/core`: 3.978.7 (10-28), 3.979.0 (10-29 18:44), 3.979.1 (10-30 18:44:16);
- `@aws-sdk/checksums`: 3.1002.0 (10-29), 3.1002.1 (10-30 18:47);
- `credential-provider-node`: 3.972.92 (10-30 18:44);
- `@smithy/core`: 3.38.0 (10-29 15:49:14), **3.38.1 (10-30 23:11:40, usable 11-02 23:11:40)**;
- `@smithy/node-http-handler`: 4.14.0 (10-29 15:48), 4.14.1 (10-30 23:11:05).

**Deprecation, not in the item file.**
- Every `@smithy/core` from 3.24.0 to 3.38.0 is npm-deprecated: "Deprecated due to a bug in custom logger data redaction. See https://github.com/aws/aws-sdk-js-v3/issues/8393" (registry.npmjs.org/@smithy%2fcore, 17:13 UTC). That includes the base's 3.36.0 (pnpm-lock.yaml:2195), #89's version and every resolution before 11-02 23:11.
- The fix is 3.38.1: "Redact sensitive fields within list items and map values in schema-based logging" (smithy-typescript `packages/core/CHANGELOG.md`, main, 17:15 UTC).
- **We are not exposed.** None of our AWS clients sets a `logger`:
  - model-gateway src/config.ts:137;
  - web services.ts:107, 207, 229 and uploads/targets.ts:63;
  - worker platform/wiring.ts:20, 30, 41, mail/mail.ts:85 and intake/wiring.ts:19;
  - contracts evidence/scan.ts:92, db crypto/kms-key-provider.ts:44 and infra/lib/cdk-diff-plan.ts:39.

  The SDK's default logger is a no-op. Not verified against the SDK source.
- pnpm prints "WARN 1 deprecated subdependencies found: @smithy/core@3.38.0". `toolchain:check` does not read deprecation.

**What `pnpm toolchain:check` checks (check.ts at 83d71fd6).** Each added version is a lockfile `packages:` key that is not in the merge base's lockfile (check.ts:605-622). Each one is held to:
- **release age:** 4,320 minutes against `now` (check.ts:645-688). There is no exclusion unless the version is listed exactly (`name@x.y.z`) in both `minimumReleaseAgeExclude` and `release-age-exceptions.json`, with a GHSA and an expiry no more than 7 days out (check.ts:489-546). Both lists are empty on the base (pnpm-workspace.yaml:45).
- **integrity:** the lockfile's integrity must equal the registry's `dist.integrity` (check.ts:691-708).
- **trust no-downgrade:** no added version may carry weaker evidence than any earlier non-prerelease version (check.ts:720-760). The only exclude is `semver@6.3.1` (pnpm-workspace.yaml:51-52).

#82 (96758e44) refactors the exclude window and adds an images rule, but leaves these three lockfile rules as they are (`git diff 83d71fd6...96758e44 -- tools/check-toolchain`).

## 3. Release notes 3.1152.0 → 3.1161.0, and stripe

**Sources:**
- raw.githubusercontent.com/aws/aws-sdk-js-v3/v3.1161.0/ for `CHANGELOG.md` and each client's `CHANGELOG.md` (17:14 UTC);
- `npm pack` of every client at 3.1152.0 and 3.1161.0, with `dist-cjs` diffed.

**Per client:**

| Client | Change from 3.1153 to 3.1161 |
|---|---|
| client-bedrock-runtime | Version bump only. `dist-cjs/index.js` differs only in the version string ("3.1151.0" → "3.1160.0"). Protocol is AwsRestJson, unchanged. |
| client-s3 | Version bump only. 3.1158 fixed only e2e test keys. Protocol S3RestXml. |
| s3-request-presigner | `dist-cjs` identical. |
| client-sts, client-sesv2, client-textract, client-cognito-identity-provider, client-sqs | Version string only. Protocols unchanged: AwsQuery; RestJson; AwsJson1_1; AwsJson1_1; AwsJson1_0. |
| client-kms | 3.1157.0 adds ML-KEM keys (new shapes only). |
| client-rds | 3.1154.0 adds On-Demand Capacity Reservations (new shapes and a new fault class). |

No endpoint ruleset changed for any of these clients.

**`bedrock.ts`.** It sends only `InvokeModelCommand` with these fields (bedrock.ts:51-54):
- `modelId`;
- `contentType` and `accept` both `application/json`;
- a body of `{anthropic_version: 'bedrock-2023-05-31', ...messagesBody}`, encoded as bytes;
- `abortSignal`.

The client is built with `region`, `endpoint` and `maxAttempts: 1` (config.ts:137), and failures map by `error.name` (bedrock.ts:23-41). Nothing in that path changes at the client level.

**Shared runtime (top-level CHANGELOG and the smithy changelog), where all the real behaviour change is:**

| Version | Change |
|---|---|
| 3.1153 | `token-providers` awaits an in-flight SSO token refresh. This is SSO only; production uses task roles (not verified). |
| 3.1159 | `middleware-sdk-s3` scopes the S3 Express cache by identity. We use no S3 Express directory buckets (not verified in infra). |
| 3.1160 | `checksums` adds xxHash and SHA-512. **Defaults are unchanged:** `DEFAULT_CHECKSUM_ALGORITHM = CRC32`, and request calculation and response validation are `WHEN_SUPPORTED`, in both `@aws-sdk/checksums` 3.1001.7 and 3.1002.1 (`npm pack`). |
| 3.1160 | Codegen adds the Smithy RPCv2 JSON protocol. None of our clients switched. |
| 3.1161 | Clock-skew correction excludes server processing time. |
| @smithy/core 3.38.0 | Service-default idle timeout via `updateHttpClientConfig`; headers named after Object-prototype properties are now signed. |
| @smithy/core 3.38.1 | The redaction fix. |
| node-http-handler 4.14.0 / 4.14.1 | Idle timeout; one `http.Agent` for concurrent first requests. |

**Presigned URLs.** apps/web/src/lib/uploads/targets.ts:63 builds S3 with `requestChecksumCalculation: 'WHEN_REQUIRED'`, and :84-89 signs with explicit `signableHeaders` and `unhoistableHeaders`. Nothing in the notes changes the presigned URL's shape. targets.test.ts passed on 3.1159 and 3.1161 (section 4).

**stripe** (`npm pack`, CHANGELOG.md, `cjs/apiVersion.js`):

| Version | Changes |
|---|---|
| 23.0.1 | Rejects webhook secrets that are only whitespace. Adds v2 search. The notification handler verifies asynchronously. Discarded fetch responses are disposed before a retry. `lastResponse.statusCode` for fetch. |
| **23.1.0** | **The pinned API version moves `2026-09-30.endive` → `2026-10-28.endive`.** Many additive types. `SubscriptionSchedule.pause_schedules` becomes required (types only; billing uses no subscription schedules). |

- packages/billing/src/stripe.ts:50-52 builds `new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000, appInfo })` with **no `apiVersion`** ("the SDK pins its own API version"). So 23.1.0 changes the API version on every request; ADR 0050 line 48 says "at the API version its release pins".
- Within one release name ("endive"), Stripe's monthly versions are meant to be non-breaking. Not verified against Stripe's documentation here.
- The webhook endpoint's own API version is set in Stripe, not in the repository. Not verified.

## 4. Trial (worktree at origin/claude/build-platform = 83d71fd6; removed at 17:23 UTC)

**Trial A (now): all ranges `^3.1159.0`, client-sts in infra included, stripe `^23.0.1`.** Every heavy step ran under `flock /tmp/laneb-heavy.lock`.

| Step | Result |
|---|---|
| `pnpm install --lockfile-only` | rc 0 (4.1 s) |
| `pnpm install --frozen-lockfile` | rc 0 |
| `BASE=origin/claude/build-platform pnpm toolchain:check` | **passed, 0 errors**: 32 added versions, each at least 3 days old, each with registry integrity, none a trust downgrade. One warning: pnpm 10.34.9 (10-25) is newer than packageManager's 10.34.8. |
| `pnpm licenses:check` | ok, 185 production packages |
| `pnpm exec tsx tools/screening-capacity/watched.ts --write` | **no diff** (539 lines; the manifests and lockfile are already watched at watched-paths.txt:9-23) |
| `pnpm typecheck` | rc 0 |
| unit project on model-gateway, billing, db, contracts, web uploads/agreements/auth, worker platform/storage/support/intake/mail, infra, tools/test/eslint-rules | **103 files, 1,752 tests passed** |

**Lockfile moves (A).** 32 versions added and 33 removed:
- the 9 clients and the presigner 3.1152.0 → 3.1159.0;
- `@aws-sdk/core` 3.978.3 → 3.978.7;
- `checksums` 3.1001.3 → .7;
- `credential-provider-{env,http,ini,login,node,process,sso,web-identity}`;
- `eventstream-handler-node`, `middleware-eventstream`, `middleware-sdk-rds`, `middleware-sdk-s3`, `middleware-websocket`, `nested-clients`, `signature-v4-multi-region`, `types` 3.974.6 → 3.975.0, `xml-builder`;
- `token-providers` 3.1150.0 and 3.1152.0 → 3.1159.0;
- `@smithy/core` 3.36.0 → **3.38.0 (deprecated)**;
- `@smithy/node-http-handler` 4.12.1 → 4.14.0;
- stripe 23.0.0 → 23.0.1.

Nothing outside `@aws-sdk`, `@smithy` and stripe moves. The lockfile diff is 260+/272−.

**Simulated later resolutions.** `minimumReleaseAge` was lowered in the scratch tree only, so that it resolved as at the target time, then restored. Each frozen install passed.

| Variant | Ranges | Resolves | Added | Youngest added (usable from) |
|---|---|---|---|---|
| B, about 20:00 today | ^3.1160.0, stripe ^23.1.0 | @smithy/core 3.38.0 (deprecated) | 32 | stripe 23.1.0 (19:58:14) |
| C, 11-02 19:00 | ^3.1161.0, ^23.1.0 | @smithy/core 3.38.0 (deprecated); signature-v4 5.7.4 → 5.7.5 | 33 | client-textract 3.1161.0 (11-02 18:52:27) |
| **D, 11-02 23:15** | ^3.1161.0, ^23.1.0 | **@smithy/core 3.38.1, node-http-handler 4.14.1, no deprecation warning** | 33 | @smithy/core 3.38.1 (11-02 23:11:40) |

- **D's checks (17:20 UTC):**
  - `toolchain:check` integrity is ok and trust is ok for all 33. The only errors are 30 release-age errors, and the last of those versions is usable by 11-02 23:11:40.
  - `licenses:check` ok; `watched.ts` no diff.
  - **typecheck rc 0** (stripe 23.1.0 types included).
  - **Unit: 104 files, 1,757 tests passed** (apps/web/src/lib/billing added).
- If #42 has merged, its `client-sqs` is an extra added version, with 3.1160.0 at 18:55:06 and 3.1161.0 at 18:51.
- Not run here: `test:db`, `test:golden`, e2e, Stryker. They are the fix round's.

## 5. Mutation

**How a lockfile change selects shards** (tools/stryker/affected.ts:21-33, :624-664):
- A package is affected when a changed path is in its closure or its closure's manifests.
- It is also affected when the lockfile moves any resolved snapshot among the third-party packages its closure imports. That set includes their transitive snapshots, plus `TEST_TOOLING` (`vitest`, `@vitest/*`, `@stryker-mutator/*`, `fast-check`, `tsx`; :118) and what the mutation tooling imports.
- Every shard of an affected package runs (`shardsFor`, :681).

**Reproduced with `affected()` itself** (scripts/affected-sim.mts against the trial tree):
- **#89 and trial A:** packets and pricing are affected. Their closures import `@tp/contracts` (client-textract) and `@tp/db` (client-kms).
  - The reasons are `packages/contracts/package.json` and `packages/db/package.json` ("a manifest of its closure"), as well as the lockfile moving client-kms, client-textract "and 29 more" (33 more in A).
  - money and ledger are not affected.
  - So the **6 shards** run: packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest (stryker/shards.json:38-96).
  - The runbook (dependency-upgrades.md:277) says "through the lockfile". It is also through the two manifests.
- **#87:** `@opentelemetry/api` 1.9.1 → 1.10.0 re-keys the `vitest@5.0.5(@opentelemetry/api@…)` snapshot. vitest is `TEST_TOOLING`, so all four packages are affected and **7 shards** run, money-ledger included.
- **stripe:** no mutation closure imports `@tp/billing`, so stripe selects nothing.

**What the fix round must run locally:**
- **#88/#89 PR:** the 6 packets and pricing shards, each in full: `pnpm -s exec tsx tools/stryker/shards.ts <shard>`, then `tools/stryker/gate.ts reports/mutation --shard <shard>`. The CDK packages are in no closure.
- **#87 PR:** all 7 shards, because `@opentelemetry/api` moves.
- **Checking the selection:** run `pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` on the committed head. Expect the same shard list.

## What the design must say

1. **Ranges.**
   - Raise all nine `@aws-sdk` names, client-sts in infra included, to one version. #89 already moves client-sts; the routing only put it in the wrong group.
   - After #42 merges, also raise #42's apps/web client-sesv2 and client-sts and apps/worker client-sqs.
   - Raise stripe to the newest usable version.
2. **Pick the version by the build time, against the deprecation.**
   - Only a resolution after **2026-11-02 23:11:40 UTC**, with `^3.1161.0`, takes `@smithy/core` 3.38.1 (the logger-redaction fix) and drops every deprecated `@smithy/core`.
   - Before that, every choice locks a deprecated `@smithy/core`: 3.38.0 (3.1159.0 now, 3.1160.0 from about 18:55 today, 3.1161.0 from 11-02 18:53).
   - Recommended: build #88/#89 at or after 11-02 23:12 with `^3.1161.0` and stripe `^23.1.0`.
   - If it must be built today:
     - `^3.1160.0` and `^23.1.0` once it is **after 19:58:14 UTC** (19:59 at the earliest);
     - or `^3.1159.0` and `^23.0.1` now.

     Either way, record that `@smithy/core` 3.38.0 is deprecated, the base's 3.36.0 is too, and nothing passes a `logger` (the file:line list in section 2). The next triage then takes 3.38.1.
   - Never use a release-age exclude for 3.38.1. There is no GHSA, and F2 (b) allows an exclude only for an advisory fix (check.ts:439, :467-487).
3. **Stripe 23.1.0 moves the request API version** to `2026-10-28.endive`, because stripe.ts:50-52 pins none.
   - Either take 23.1.0 and say so, against ADR 0050:48 (same "endive" release, additive by Stripe's policy; not verified here), or hold stripe at 23.0.1.
   - Taking it is recommended: typecheck and billing's tests pass on 23.1.0 (variant D).
   - Webhook payloads follow the endpoint's API version in Stripe, which a person checks. It is not in the repository.
4. **No code change is needed for the AWS clients.**
   - Bedrock (the default model path), S3 and the presigner, STS, SESv2, Textract, Cognito and SQS change only their version string from 3.1152 to 3.1161. KMS and RDS gain shapes only.
   - Checksum defaults (CRC32, `WHEN_SUPPORTED`) and every wire protocol are unchanged.
   - The behaviour change is in the shared runtime: clock skew, idle timeout, signing of prototype-named headers, the S3 Express cache and the SSO refresh. None of these touches our options. targets.test.ts and providers.test.ts cover the shapes we depend on.
5. **Gates.**
   - `toolchain:check`: release age, integrity and trust pass for 3.1159 now. For the 3.1161 and 23.1.0 set, integrity and trust already pass and only the age is pending.
   - `licenses:check`: ok.
   - `watched.ts --write`: no diff.
   - typecheck and the client-touching unit tests: green on both 3.1159 and 3.1161.
   - Put each added version's age in the PR description (section 2's table and `scripts/ages.py`).
6. **Mutation.** Run the 6 packets and pricing shards for the #88/#89 PR and all 7 for #87.
   - Amend runbook line 277 to name the cause: the closure's manifests (packages/contracts and packages/db package.json) as well as the lockfile.
   - This is in scope only if the design edits that runbook; it is shared with #82, so merge after #82.
7. **Correction to the item file's correction 7.**
   - 3.1160.0 is usable from 18:53:13 on the base's clients, but from 18:55:06 once #42's client-sqs is in.
   - stripe 23.1.0 at 19:58:14 is what limits a build "at about 20:00".

## Notes and proposals (outside this item)

- **pnpm 10.34.9** (published 2026-10-25) is newer than packageManager's 10.34.8. `toolchain:check` warns about it, and the runbook's "pnpm itself" step bumps it by hand. That is a separate PR.
- **Proposal: let `toolchain:check` warn on an added version npm marks deprecated** (the registry document is already fetched, check.ts:605-622). Today the @smithy/core deprecation shows only as a pnpm WARN line that CI never fails on and nobody reads.
- **Proposal: in the routing fix, note that `minor-and-patch` (no patterns) also catches devDependencies** such as infra's client-sts, so the fixed `aws-sdk` group should hold it as well (CI-12 test).
