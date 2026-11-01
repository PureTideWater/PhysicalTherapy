# Scout: #88, the aws-cdk group (aws-cdk-lib, aws-cdk CLI, constructs)

Base `claude/build-platform` 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56. Bot head #88 f69063f01a7278f16370f31cc60bbffe5f45301c. Work ran 2026-11-01 17:02Z to 17:10Z. The item file's correction 3 holds. The code and the network also showed several things the item file does not say: the CLI and the library must move together, telemetry is on by default and the `synth` script leaves it on, and the metadata gains a new entry. These are below.

## 1. Versions and the 3-day release age
Source: `npm view <pkg> time --json`, 2026-11-01T17:02Z. `pnpm-workspace.yaml:44` sets `minimumReleaseAge: 4320` (3 days).

| Package | Version | Published (UTC) | Usable now (17:05Z) | At 2026-11-01 20:00Z | At 2026-11-02 19:00Z |
|---|---|---|---|---|---|
| aws-cdk-lib | 2.274.0 | 2026-10-20 15:05 | yes | yes | yes |
| aws-cdk-lib | **2.275.0** (latest) | 2026-10-26 19:32 | yes | yes | yes |
| aws-cdk (CLI) | 2.1146.0 | 2026-10-20 02:38 | yes | yes | yes |
| aws-cdk (CLI) | **2.1146.1** | 2026-10-22 17:45 | yes | yes | yes |
| aws-cdk (CLI) | 2.1147.0 (latest) | 2026-10-30 18:57:11 | no | no | yes (usable from 2026-11-02 18:57:11Z, a 3-minute margin) |
| constructs | 10.8.1 (latest) | 2026-08-03 15:28 | already the range floor (`infra/package.json:15` `^10.8.1`): nothing to move | | |
| transitive `@aws-cdk/cloud-assembly-schema` | 55.2.0 | 2026-10-22 00:20 | yes (pnpm picks it; base has 54.26.0) | yes | yes |
| transitive `@aws-cdk/cloud-assembly-schema` | 55.3.0 | 2026-10-30 18:22 | no | no | yes (from 2026-11-02 18:22Z); a re-resolve after then may take it |

- lib 2.274.0 and 2.275.0 both require `cloud-assembly-schema ^55.0.0`. `asset-awscli-v1` stays pinned at 2.2.292 and `asset-node-proxy-agent-v6` at 2.1.3 (no change). `cloud-assembly-api` is bundled (`npm view aws-cdk-lib@2.275.0 bundleDependencies`).
- Trust policy (`pnpm-workspace.yaml:50`, `trustPolicy: no-downgrade`):
  - aws-cdk-lib 2.273, 2.274 and 2.275 have no provenance and no trusted publisher. None ever had them, so there is no downgrade.
  - The CLI (2.1145.0, 2.1146.1, 2.1147.0) and the schema (54.26.0, 55.2.0, 55.3.0) all have a GitHub trusted publisher and SLSA provenance.
- Engines do not change: lib `node >= 20.0.0`, CLI `node >= 18.0.0`.
- Take: **aws-cdk-lib ^2.275.0 and aws-cdk ^2.1146.1.** If the build runs at or after 2026-11-02 19:00Z, take **aws-cdk 2.1147.0** instead, after its notes (section 3). `pnpm toolchain:check` is the final word on transitive ages.
- #88 itself (`git diff 83d71fd6 f69063f0`): `infra/package.json` (the two ranges) plus 28 lockfile lines (lib, CLI, schema 54.26.0 → 55.2.0).

## 2. aws-cdk-lib notes, 2.274.0 and 2.275.0
Source: raw.githubusercontent.com/aws/aws-cdk/v2.275.0/CHANGELOG.v2.md, fetched 2026-11-01T17:03Z. 2.275.0 is lines 5–46; 2.274.0 is lines 48–79. No later version exists.

Modules `infra/lib` uses at 83d71fd6 (grep of `from 'aws-cdk-lib'` and `aws_*`):
- core: App, Stack, CfnParameter, CfnCondition, CfnRule, Fn, Token, Tags, Duration, RemovalPolicy, Annotations, CfnOutput
- certificatemanager, cloudfront, cloudfront_origins, cloudtrail, cloudwatch, cloudwatch_actions
- cognito, ec2, ecr, ecs, elasticloadbalancingv2, events, events_targets, guardduty
- iam, kms, lambda, logs, rds, s3, secretsmanager, ses, ses_actions
- sns, sns_subscriptions, synthetics, wafv2, custom_resources (`network.ts:1`)
- assertions, in the tests only

| Change | Version | Module used here? | Changes our synth? |
|---|---|---|---|
| BREAKING, L1 only: CloudWatch AnomalyDetector Id attribute; Glue Table; IoT PolicyPrincipalAttachment; QuickSight SheetLayoutGroupMember | 2.274 | cloudwatch yes, but no AnomalyDetector (`git grep -i anomalydetector` at 83d71fd6 and be63bdc2: none) | no |
| BREAKING, L1 only: bedrockagentcore, codebuild, dax, dms, emr, fsx, medialive, mediapackagev2 | 2.275 | no | no |
| cloudfront: OAC sigv4a and always-amz-auth signing | 2.274, 2.275 | cloudfront yes, but `edge.ts:243` uses `HttpOrigin` to the ALB, with no origin access control | no |
| core: an App prop switches off the built-in CloudFormation Validate | 2.275 | the validation itself has run since 2.262.0 (CHANGELOG line 439), so it is already on base; we set no such prop | no (`validation-report.json` has empty `pluginReports` on both) |
| core: unresolved Tags tokens preserved | 2.274 | `Tags.of` with literal strings only (`platform-stack.ts:74-75`) | no |
| core: construct traceable to template (#39141); validation messages no longer combined; plugin-invocation slowness | 2.274 / 2.275 | core | metadata only: a new `aws:cdk:templateFile` metadata entry per stack (section 4; attribution to #39141 not verified) |
| L1 resource definitions updated | both | all L1 | no template change observed |
| apigateway, stepfunctions(-tasks), lambda-nodejs, codebuild images, bedrockagentcore fixes | | not used | no |

**Feature flags.** Diffing `recommended-feature-flags.json` and `cx-api/lib/features.ts` (raw, v2.273.0 against v2.275.0) shows two new flags:
- `@aws-cdk/aws-apigateway:logGroupDestinationArnWithoutWildcard`;
- `@aws-cdk/aws-stepfunctions-tasks:evaluateExpressionDedicatedFunction` (unconfigured behaves as `true` in v2).

Neither module is used. `infra/cdk.json:7` is `"context": {}`. CI's "85 feature flags are not configured" (against 84 on 2.273) is the new apigateway flag. Set no flag.

**Deprecations:** none in either version's notes. Typecheck and tests in the trial tree are clean: `pnpm --filter @tp/infra typecheck` exit 0, and `pnpm --filter @tp/infra test` 24 files and 602 tests passed (17:07Z).

## 3. The CLI, 2.1145.0 to 2.1146.1 (and 2.1147.0)
Source: a blobless clone of github.com/aws/aws-cdk-cli (17:05Z), `git log` between tags over `packages/aws-cdk` and what it bundles (`@aws-cdk/toolkit-lib`, `cloud-assembly-schema`, `cloud-assembly-api`, `cloudformation-diff`, `cdk-assets-lib`).

- **2.1145.0 → 2.1146.0:**
  - CloudFormation rollback triggers (new deploy options; `cli-config.ts`).
  - `diff --parameters` for change-set diffs (d27b445e).
  - Change-set diff fixes (1b0155a0, 483b0f33).
  - Drift pagination; duplicate-key templates; region lookup honouring `AWS_EC2_METADATA_DISABLED`; hotswap; dependency upgrades.
  - Our diff uses `--method template` (`cdk-diff-plan.ts:25`), so the change-set fixes do not reach it.
- **2.1146.0 → 2.1146.1:** 8c52d44c only. `deploy --method=execute-change-set` now shows the diff at approval. This is deploy only.
- **2.1146.1 → 2.1147.0:**
  - A new `cdk explore` command: a local web explorer with a `--port` option. It runs only when invoked.
  - Synthesis can be aborted; `toolkit.fromCdkAppDirectory`; assembly-metadata queries.
  - Deploy-approval diff fix (7160c2a4); whitespace trimming of coloured messages (cosmetic output).
  - Opt-in stricter evaluation modes.
  - The library-version lookup no longer spawns a subprocess (0c223c44, `telemetry/library-version.ts`).
  - No change to our synth or template-diff path.
- **Bootstrap:** `git diff --stat aws-cdk@v2.1145.0 aws-cdk@v2.1147.0 -- packages/aws-cdk/lib/api/bootstrap` is empty. The bootstrap version is unchanged. Synth output keeps the same `hnb659fds` asset bucket and roles (section 4).
- **Node engine:** `>= 18.0.0` in all three versions.
- **Notices:** `cli.ts:169` still reads the `notices` setting. Nothing in this range changes them.
- **Telemetry is on by default.**
  - `telemetry/collect-telemetry.ts:6-15` (2.1147.0; unchanged in this range apart from library-version and import order) returns false only when one of these holds:
    - `CDK_DISABLE_CLI_TELEMETRY` is `true` or `1`;
    - context `cli-telemetry` is false;
    - `--no-version-reporting` is passed;
    - the command is `cli-telemetry --disable`.
  - Otherwise a subprocess sink posts to `https://cdk-cli-telemetry.us-east-1.api.aws/metrics` (`io-host/cli-io-host.ts:453-458`).
  - What the repository does:
    - `infra/scripts/cdk-diff.ts:8` sets `CDK_DISABLE_CLI_TELEMETRY: 'true'`, and `cdk-diff-plan.ts:25,29` pass `--no-notices`, so CI's `pnpm cdk:diff` (`ci.yml:488`) sends neither telemetry nor a notices fetch.
    - **`infra/package.json:8` `"synth": "cdk synth --quiet"` sets neither**, and `infra/cdk.json:1-8` has no `cli-telemetry` and no `notices` key. Anyone running `pnpm --filter @tp/infra synth`, or `cdk` by hand in `infra/`, sends CLI telemetry and fetches notices.
    - `grep` finds no CI job that runs that script (`.github`, `package.json`, `tools`, `docs/runbooks`).
  - This predates the bump; the bump does not change it.

## 4. Synth diff (stands in for the credentialed `cdk:diff`)
- **Base:** `cd /home/user/PhysicalTherapy/infra && CDK_DISABLE_CLI_TELEMETRY=true flock … pnpm exec cdk synth --quiet --no-notices -o …/tmp/cdk/base`. It took 9 s, CLI 2.1145.0, lib 2.273.0. The base tree's `git status` stayed clean.
- **Bump:** a trial tree with `aws-cdk-lib ^2.275.0` and `aws-cdk ^2.1146.1`. `pnpm install --lockfile-only` (lockfile diff the same shape as the bot's: lib 2.275.0, CLI 2.1146.1, schema 55.2.0), then `--frozen-lockfile`, both under the lock. Then the same synth, output to `…/tmp/cdk/bump`.
- **Comparison:** `diff -rq`, then a key-sorted JSON diff with paths normalized. The three file assets (`asset.02b51ab5…`, `asset.9b8fce7a…`, `asset.e16ffb3b…`) are byte-identical.

Every difference, explained:

| File | Difference | Why |
|---|---|---|
| `tp-dev`, `tp-staging`, `tp-production` `.template.json` | **Exactly one line each:** `CDKMetadata.Properties.Analytics`. Decoded (gzip+base64), the only change is `2.273.0!aws-cdk-lib` → `2.275.0!aws-cdk-lib`, and the construct list is identical. No resource, property, parameter, rule, condition or output changes. | The library version is reported in `AWS::CDK::Metadata` |
| `*.assets.json` | Template asset hash and destination id change; `version` 54.0.0 → 55.0.0 | The template bytes changed (above); cloud-assembly schema 55 |
| `manifest.json` | Two new flags in the flags report (section 2); `stackTemplateAssetObjectUrl` hashes; **`minimumCliVersion` 2.1144.0 → 2.1146.1**; `version` 54.0.0 → 55.0.0 | lib 2.275 needs CLI ≥ 2.1146.1, so the CLI cannot stay at 2.1145.0 |
| `*.metadata.json` | A new `{"type":"aws:cdk:templateFile","data":"<stack>.template.json"}` entry per stack; stack-trace paths name the new lib version | lib 2.274 core (probably #39141, construct-to-template tracing; not verified); cosmetic |
| `tree.json` | `version` strings 2.273.0 → 2.275.0 only | construct info |
| `validation-report.json`, `cdk.out` | `version` 54.0.0 → 55.0.0 only | schema |

The bootstrap requirement and the asset bucket and role names are unchanged. The deployed effect would be a metadata-only stack update: the CDKMetadata resource's Analytics value changes.

Not done:
- The CLI-2.1147.0 variant was not synthesized. Its commits touch nothing on the synth path, but its synth equality is not verified.
- The synth was not re-run with #42's stacks (#42 adds `infra/lib/address-validation-stack.ts`; section 6).

## 5. CI's `cdk:diff` on #88, and what the runbook needs
- **The step:** `ci.yml:488-489`, `- run: pnpm cdk:diff` with `if: !cancelled() && steps.install.outcome == 'success'`. It runs `infra/scripts/cdk-diff.ts`. Without credentials (STS `GetCallerIdentity` fails, `cdk-diff-plan.ts:35-48`), that becomes `cdk synth --quiet --no-notices` plus a `::warning::`.
- **#88's log** (MCP `get_job_logs` 123266121153, read about 17:06Z):
  - 2026-10-29T04:40:58Z: "Successfully synthesized to …/infra/cdk.out", then "85 feature flags are not configured", then `##[warning]no usable AWS credentials, so every stack was synthesized instead; the diff against staging (tp-staging) needs credentials.`
  - No diff ran. This matches the item file's correction 3. I did not count down to the item file's line number 463: the tail I read has the text, but its numbering is not verified.
- **Runbook lines 273–277** ("`pnpm cdk:diff` in the build job shows what a CDK bump changes in the stacks; read it before taking one"). For this PR, the description must:
  - say that CI's `cdk:diff` cannot diff (no credentials) and only proves synthesis;
  - in its place, give the synth-to-synth comparison of base and bump (section 4): every changed file and line, explained;
  - state that the templates differ only in CDKMetadata's library version, with no resource change;
  - say that a credentialed `cdk:diff` against `tp-staging` waits on a person, if a staging stack exists, and does not block the merge.
  - If #42 merges first, it says the comparison was redone on the merged tree, with #42's new stack included.

## 6. Overlap with #42
- **#42's infra files** (`/home/user/ops/LANES.md:89`): `infra/lib/{mail,deploy-parameters,platform-stack}.ts` and `infra/lib/constructs/{application-role,compute,database,identity,mail-streams,monitoring,network,operator-role,screening-role}.ts`.
- **What be63bdc2 actually changes** (`git diff --stat 83d71fd6...be63bdc2 -- infra`): 31 infra files, adding `address-validation-stack.ts` and `constructs/account-trail.ts`. It also changes `app.ts` and `account-security.ts`, which are not in the LANES.md list, plus tests and `pnpm-lock.yaml` (36 lines). It does not touch `infra/package.json` or `infra/cdk.json`.
- **#42's modules:** its new code uses `aws_sqs`, cloudtrail, cloudwatch, events, ses, iam, kms, s3, CfnParameter, CfnRule, CfnCondition and CfnOutput. None of the breaking L1 changes touches them, and there is no AnomalyDetector.
- **Do the notes call for a change in any #42 file?** No. The bump changes only `infra/package.json` and `pnpm-lock.yaml`, plus the optional `infra/cdk.json` telemetry change below, which is not a #42 file.
- **But:**
  - the lockfile is shared, and is regenerated by whichever merges second;
  - #42 adds a stack and constructs, so the synth comparison must be redone on the merged tree;
  - the item file's merge order (#42 first for the #88/#89 PR, because of #89's app-manifest conflicts) stands.

## What the design must say
1. **Versions.** Take aws-cdk-lib **^2.275.0** (published 2026-10-26 19:32Z) and the aws-cdk CLI **^2.1146.1** (2026-10-22 17:45Z). Take **2.1147.0** only if the builder runs at or after 2026-11-02 19:00Z (it is usable from 18:57:11Z). Leave constructs at ^10.8.1, already the latest. Expect the transitive `cloud-assembly-schema` 55.2.0 (55.3.0 is usable from 2026-11-02 18:22Z). `pnpm toolchain:check` decides.
2. **The CLI and the library move together.** lib 2.275's cloud assembly declares `minimumCliVersion` 2.1146.1, so never take one without the other. This belongs in the PR text and the runbook's AWS paragraph (a one-line improvement there, after #82, because #82 changes that runbook).
3. **Notes read and their effect.** 2.274 and 2.275 breaking changes are L1-only, in modules we do not use. The cloudfront OAC features do not apply (`edge.ts:243` uses `HttpOrigin`). There are two new feature flags, for modules we do not use; set none. There are no deprecations. Nothing in `infra/lib` needs changing. The CLI has no change in bootstrap version, node engines or notices. Its diff-output fixes are for change-set and deploy approval only, and our diff uses `--method template`.
4. **The stack diff for runbook lines 273–277.** CI cannot diff without credentials (job 123266121153). The PR description carries the synth-to-synth comparison of tp-dev, tp-staging and tp-production. The templates differ only in the `AWS::CDK::Metadata` Analytics version string. The manifests and metadata differ only in version strings, the schema 54 → 55, `minimumCliVersion`, the flags report, asset hashes and the new `aws:cdk:templateFile` entry. Builders re-run it on their own tree (and on the merged tree if #42 merges first). The credentialed staging diff waits on a person and does not block.
5. **Improvement in scope: CLI telemetry and notices off for every `cdk` run in `infra/`.**
   - The CLI's telemetry is on by default (`collect-telemetry.ts:6-15`). Only `pnpm cdk:diff` disables it (`cdk-diff.ts:8`); `pnpm --filter @tp/infra synth` (`infra/package.json:8`) and hand-run `cdk` do not.
   - Add `"cli-telemetry": false` to `infra/cdk.json`'s context and a top-level `"notices": false` setting (read at `cli.ts:169`), so every run in `infra/` is covered.
   - Before relying on it, the builder verifies two things: the context key does not change the synth output, and `cdk synth` shows "CLI Telemetry is disabled" at the trace level. Neither is verified here.
   - **Do not** use `versionReporting: false`. It would also drop `AWS::CDK::Metadata` from every template, a real stack change.
   - Optionally also make the `synth` script add `--no-notices`. Keep `cdk-diff.ts:8` as defence in depth.
   - Add a unit test in `infra/test` that reads `cdk.json` and asserts both keys.
6. **Tests:** `pnpm --filter @tp/infra typecheck` and `test` pass on the bump (602 tests). CI's `build` job still runs `pnpm cdk:diff`. #88 runs no Stryker shard (the item file's table), and this bump reaches no money closure.
7. **#42:**
   - No note-driven change lands in a #42 file.
   - The PR touches `infra/package.json`, `pnpm-lock.yaml` and (item 5) `infra/cdk.json` and one new test. None of these is on #42's list, but the lockfile is shared.
   - Keep the item file's merge order: #42 first for the #88/#89 PR. Then regenerate the lockfile and redo the synth comparison with #42's new `address-validation-stack.ts`.
8. **Waiting on someone:** a credentialed `cdk:diff` against tp-staging (a person, if a staging stack exists). It does not block the merge.
