# Lane B design: Dependabot's batch of 2026-10-29 (#87, #88, #89) as the build's own PRs, and the group routing fix

Stage 1 of the item "dependabot-batch" (session_01FcouKRD17iBBR4HhnYcQQx). Written 2026-11-01 17:30Z from four scout
reports (scratchpad `design/scout-{sdk,cdk,awssdk,routing}.md`, 17:02Z-17:25Z) and the writer's own re-checks. Every
file:line is at `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56` unless it names `bce57f16` (below). "Not verified" means
nobody here could check it.

**The base moved while the scouts ran.** `claude/build-platform` is now `bce57f167bc2217dc25ebbc1cabceb10a195a0a0`:
#82 (ci-pin-age, head 9db52a2b) merged at 2026-11-01T17:19:46Z (`git ls-remote origin` at 17:26:50Z; `git log
83d71fd6..bce57f16`). It changed `docs/runbooks/dependency-upgrades.md` (+110 lines), ADR 0066 (Part 5),
`tools/check-toolchain/*`, `test-matrix.md` (CI-21 to CI-23), synth `matrix.ts` and `registry.ts`. It did not touch
`.github/dependabot.yml`, `tools/test/dependabot-config.test.ts`, `packages/model-gateway`, `infra/package.json`,
`infra/cdk.json`, either app manifest or `pnpm-lock.yaml` (`git diff --quiet 83d71fd6 bce57f16 -- …`, 17:28Z). The scouts'
routing diff applies cleanly on bce57f16 (`git apply --check`, 17:29Z). Consequences:
- The item's "#82 first" is done; nothing here waits on #82 any more, and its runbook and ADR edits are on the base.
- Builders merge bce57f16 (or later) into both item branches before their first commit.
- Lines that moved, at bce57f16: runbook "The Anthropic SDK" 319-320 and "AWS" 321-323 (were 273-277); ADR 0066 Part 2
  "Dependabot's configuration" 603-624 and "Revisit when" 723-729, Part 3 from 731; test-matrix CI-12 at 279 (was 278).
  Runbook lines 10-15, 28 and 45-99 did not move.

**Folded 2026-11-01 17:47-17:57Z** with the review (`designs/lane-b-dependabot-batch-review.md`) and the completeness
critic: 3 blocking, 12 should-fix and 18 nits (33), each disposed of in the last section. Live heads re-read at 17:47:55Z
(`git ls-remote origin`): base still bce57f16; #42 be63bdc2, #75 871faff9, #83 f4a97668, #84 e3299ea2, **#85 90ec40ab**
(was 29dded52), #86 83167b8f. The scouts' reports are copied beside this file, `designs/lane-b-dependabot-batch/scout-{sdk,cdk,
awssdk,routing}.md`.

## 1. Summary and decisions

Three replacement changes, in two kinds of PR plus one small fix PR. Each decision below names the options, the choice and
why. Under the founder's standing rule (CLAUDE.md "Conventions") the choice is the best option, never weighted by effort;
where security and convenience pull apart, the safer option is taken.

| # | Decision | Options | Chosen | Why |
|---|---|---|---|---|
| D1 | SDK version for #87 | 1.3.0 (bot); hold 0.x | `@anthropic-ai/sdk ^1.3.0` | Newest, 8+ days old (published 2026-10-23T23:31Z, `npm view` 17:02Z); every change checked against the gateway (§3); the 0.x line gets no fixes. |
| D2 | What the SDK may take from the environment (tracing, logging, host, headers) | leave the SDK defaults; off by env var; fixed on the client, and refused in configuration where no client option can fix it | `anthropicClient` (`anthropic.ts:46`) passes `baseURL: 'https://api.anthropic.com'`, `logLevel: 'off'`, `webhookKey: null` and `openTelemetry: { traces: false, propagation: false }`; `readGatewayConfig` (`config.ts:115-116`) refuses `ANTHROPIC_CUSTOM_HEADERS` on the Anthropic path; pinned by MOD-17/MOD-18 and a config test | Safer: ADR 0048:150-152 and PRD.md:583 forbid prompts and outputs leaving the product's own records. Without these, `…TRACES_CONTENT_MODE=content` puts prompts in spans, `ANTHROPIC_LOG=debug` logs every request body to the console (1.3.0 `client.mjs:156-162,821`; `internal/utils/log.mjs:90-107` masks only auth headers), `ANTHROPIC_BASE_URL` sends the key and prompts to another host (`client.mjs:102,147`), and `ANTHROPIC_CUSTOM_HEADERS` adds headers no client option can remove (`client.mjs:176-185`). A client option wins over every env var; an env var does not protect against a forgotten one; the one variable no option overrides is refused by configuration and fails closed: the web turns every model feature off when it first reads the model path, at its first model request (it logs `MODEL_PATH_UNAVAILABLE` once, shows the refusal as the reason on /console/models and keeps serving with hand entry); the evaluate-permitted task exits 2 and the evaluation CLI (`eval/cli.ts --provider configured`) throws, both before any call (corrected in A's fix round, ci-infra-r2-S1, SEC2-N1). All four reads exist in 0.131.0 too (review S1), so this hardens, not repairs. |
| D3 | `@opentelemetry/api` | 1.10.0 (bot's lockfile); 1.9.1 (already locked) | 1.9.1, unchanged, plus a gateway devDependency `^1.9.1` for the tests | `pnpm install --lockfile-only` keeps 1.9.1 (scout trial 17:04:51Z); only the bot's lockfile moved it. Moving it re-keys vitest and runs all 7 shards for no gain. |
| D4 | Record of the SDK change | new ADR 0089; amend ADR 0048 | Amend ADR 0048; release ADR 0089 | No new decision: the gateway's design is unchanged, the amendment records the tracing setting, API version, auth header and licence (§3.7). |
| D5 | CDK versions (#88) | lib 2.274.0 + CLI 2.1146.1 (bot); newest usable | aws-cdk-lib `^2.275.0`, aws-cdk `^2.1146.1` now, `^2.1147.0` if built at or after 2026-11-02T18:57:11Z; constructs stays `^10.8.1` | Newest under the 3-day age; the lib and CLI move together (lib 2.275's assembly declares `minimumCliVersion` 2.1146.1). 2.1147.0's notes are already read (§4.3). |
| D6 | CDK CLI telemetry and notices | leave on; `versionReporting: false`; `cli-telemetry: false` context; the variable on the synth script + top-level `notices` setting | `infra/package.json:8` `"synth": "CDK_DISABLE_CLI_TELEMETRY=true cdk synth --quiet --no-notices"`, top-level `"notices": false` in `infra/cdk.json` (a CLI setting, not context; `context` stays `{}`), a new `infra/test/cli-settings.test.ts`, and an ADR 0012 amendment | Safer: today `pnpm --filter @tp/infra synth` posts CLI telemetry and fetches notices; only `cdk-diff.ts:8` turns them off. A context key is rejected: `deploy-parameters.test.ts:338-342` holds `context` equal to `{}` and is #42's file; ADR 0012:23-26 and :127 keep `cdk.json` free of what only `cdk synth` sees; `app.ts:49` reads every context key (review B1). `versionReporting: false` would remove `AWS::CDK::Metadata` from every template, a real stack change. |
| D7 | `@aws-sdk/*` and stripe (#89) versions | 3.1156.0/23.0.1 (bot); newest usable | One version for all nine names (client-sts in infra included), the newest usable at build and again at the merge regeneration; stripe likewise | §7 rule. Only a resolution at or after 2026-11-02T23:11:40Z takes `@smithy/core` 3.38.1, the first not npm-deprecated; before that every choice locks a deprecated 3.38.0, no worse than the base's deprecated 3.36.0, and nothing of ours passes a `logger` (§5.2). |
| D8 | stripe 23.1.0 | hold 23.0.1; take 23.1.0 | Take 23.1.0 once usable (2026-11-01T19:58:14Z) | Same "endive" API release; typecheck and billing tests pass on it (scout variant D); `stripe.ts:50-52` deliberately lets "the SDK pin its own API version" (`stripe.ts:50` comment), which is what ADR 0050:48 says ("at the API version its release pins"). The webhook endpoint's API version is a person's check in Stripe. |
| D9 | #88 and #89 | one PR; two | One PR, `co-001/deps-aws-cdk-minor-patch` | Trial merge #88 × #89 clean; both touch `infra/package.json` and the lockfile; one regeneration, one synth comparison, one mutation run. |
| D10 | Group routing fix | in the #88/#89 PR; its own PR | Its own PR, `co-001/dependabot-group-routing` (new branch) | The #88/#89 PR waits on #42; Dependabot reads the default branch on Thursday 2026-11-05T04:31Z; the fix touches no manifest, lockfile or #42 file and adds no conflict with any open PR (fold's trial merges at 17:49Z on current heads, §8.7). The branch is not in the claim row: a CLAIM REQUEST to the orchestrator first (§8.0). Fallback if the claim is refused or not back by 2026-11-02T17:00Z: separate commits in the bundle, cut out by 2026-11-04 if #42 is still open. |
| D11 | How to fix routing | `exclude-patterns` on minor-and-patch; `patterns: ["*"]` | `exclude-patterns` listing all 13 patterns of the six specific groups | Routes the same under dependabot-core's specificity rule and GitHub's documented first-match; closes the refresh pull-in; `["*"]` rests on undocumented score constants and behaves like today under the documented rule (§6). |
| D12 | Mutation | as the item said (7 for #87, 6 for #89); what `affected.ts` selects | What `tools/stryker/affected.ts` selects on the committed head, run in full | #87's replacement selects **no shard** (writer's run, §3.6); #88/#89 selects the 6 packets and pricing shards (scout reproduction, §5.5). If a regeneration ever moves `@opentelemetry/api` or vitest, all 7. |

## 2. The weekly triage, steps 1-6 (runbook lines 45-99)

1. **Dependabot's own runs** (step 1, lines 49-61). `gh api "repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=2026-10-28"`
   (routing scout, 17:19Z): three runs since 10-28, all `success`: 40818560725 (npm, 2026-10-29), 40634047077 (compose) and
   40634046721 (docker). No actions run fell in the window. The npm run opened #87, #88 and #89. Its job 123265353642 says
   at lines 168-226 that each `@aws-sdk/*` package "belongs to more specific group 'minor-and-patch'", line 160 the same for
   `@next/eslint-plugin-next`, line 2367 that the `aws-sdk` group matched nothing (item file correction 2). Those lines were
   **not re-read**: the 5,115-line log's download host answers 403 through the proxy (17:14Z); only its tail was read
   (three PRs created, release age satisfied, no "release-age block detected"). The scouts' model of dependabot-core
   reproduces the routing (§6). The image runs opened no PR (2026-10-28 summary).
2. **Each open Dependabot PR** (step 2, lines 62-69). All three open, not drafts, mergeable, on 83d71fd6, no comments;
   the four required checks pass on each.

   | PR | Check runs | Result | Stryker shards | Read under |
   |---|---|---|---|---|
   | #87 | 27 | 26 success, 1 skipped (`notify`) | 7 | runbook 319-320 (bce57f16): the evaluation gate, a deliberate PR (§3) |
   | #88 | 21 | 19 success, 2 skipped | none | runbook 321-322: the stack diff read first (§4) |
   | #89 | 26 | 25 success, 1 skipped | 6 | runbook 323: holds the aws-sdk group's packages, so read as AWS, not as a plain minor-and-patch (§5) |

   Every major and minor's notes were read (§3-§5). None merges as it stands (lines 10-12); each is taken as the build's
   own PR (§8).

   **Bot queue record, batch 1 of 4** (`docs/runbooks/ci.md:175-179` at 83d71fd6, pointed to by `dependency-upgrades.md:104`
   at bce57f16: the first four weekly batches after the 2026-10-25 switch, `github-governance.md:33`). Computed with the
   runbook's own `queue_minutes` (ci.md:140-151) and A1′ (ci.md:153-162) commands through `gh api` by the review's skeptic at
   about 2026-11-01T17:45Z; the fold did not re-run them. npm run of 2026-10-29 (40818560725):

   | PR | head | first run created | queue_minutes (ci / mutation / screening-capacity) | A1′ | finished last |
   |---|---|---|---|---|---|
   | #87 | 20c180a0 | 04:36:45Z | 0.03 / 0.03 / 0.03 | 15.97 min | screening-capacity gate (04:52:43Z) |
   | #88 | f69063f0 | 04:37:34Z | 0.03 / 0.22 / 0.05 | 17.70 min | screening-capacity gate (04:55:16Z) |
   | #89 | 83f04cbd | 04:43:27Z | 0.05 / 0.03 / 0.05 | 19.28 min | mutation (05:02:44Z, 13 s after the gate) |

   No lane PR ran during the batch (04:20Z-05:10Z held only these 12 runs and the dynamic run), so the 15-minute trigger
   for revisiting the queue (ADR 0066 Part 2, O13) did not fire. Each A1′ falls in the 12-19 minute capacity-gate range
   (ci.md:153-155) bar #89's, slightly above it because its mutation run outlasted the gate. Batches 2-4 (actions Tuesday
   11-03, images Wednesday 11-04, npm Thursday 11-05) are recorded in each next triage's design the same way; the 10-28
   compose and docker runs opened no PR, so they had no head. The co-001 replacements are lane PRs, not Dependabot heads:
   record one only if it is pushed while a batch is running.
3. **Open alerts** (step 3, lines 70-89). `dependabot/alerts` answers HTTP 403 "Resource not accessible by integration"
   (17:19:55Z). **Waits on a person** (the founder or co-founder reads the alerts page). Does not block.
4. **Exception lists** (step 4, runbook 90-96 at bce57f16). Release-age excludes empty (`pnpm-workspace.yaml:45`);
   `tools/check-action-pins/age-exceptions.json`, `tools/check-toolchain/image-age-exceptions.json` and the audit
   exceptions `tools/check-toolchain/audit-exceptions.json` all hold `entries: []` at bce57f16 (read 17:39Z by the critic,
   17:48Z by the fold). Nothing expired to remove, no audit entry nearing 30 days. Trial B's `toolchain:check` on #82's
   checker (17:49Z, §5.5) agrees: "0 audit exception(s)", "0 exclude(s)".
5. **check-toolchain's warnings** (step 5). Every `toolchain:check` run warned that pnpm 10.34.9 (published 2026-10-25,
   more than 3 days old) is newer than `packageManager`'s 10.34.8. A `packageManager` PR is due: a proposal outside this
   item (§10). The step's second half, an action whose tag moved under an unchanged pin (a push run's `pnpm actions:check`
   warning), is **not verified**: no push run's log was read here. The builder reads the latest push run's
   `actions:check` step on bce57f16 or later and records any moved tag (a security tool's goes to the founder).
6. **Stored ignores** (step 6). Listing them needs an `@dependabot show` comment, a write; not done. The three PRs carry no
   comments, so no ignore was stored through them. A person may run it; does not block.

**Waiting on a person** (none blocks a merge): the alerts (step 3); a real-model evaluation on the Anthropic path, people
only (`model-evaluation.md:7-11`), whose first record will be made on SDK 1.x and API version `2026-10-21`; a credentialed
`pnpm cdk:diff` against tp-staging if a staging stack exists; the API version of Stripe's webhook endpoint, set in Stripe,
checked by a person when B takes stripe 23.1.0 (§5.4); a trust-policy failure, should one appear (founder's
security question, blocks only that version); runbook 3i / `APPROVAL_REVIEW_REQUIRED` (until then merge on green checks
after verification, LANES.md rule 7).

## 3. #87: `@anthropic-ai/sdk` 0.131.0 -> 1.3.0

### 3.1 Versions and ages
| Package | Version | Published (UTC) | 3 days old |
|---|---|---|---|
| `@anthropic-ai/sdk` | 1.3.0 (latest) | 2026-10-23T23:31Z | yes |
| `@opentelemetry/api` | 1.9.1 (stays; already locked) | 2026-03-25 | yes |
| `@opentelemetry/api` | 1.10.0 (bot's lockfile only; not taken) | 2026-10-20 | yes |

Range `^1.3.0`; `pnpm install --lockfile-only` changes 2 files, 7+/6- in the lockfile: the SDK importer and snapshot,
and the snapshot gains `'@opentelemetry/api': 1.9.1`. Nothing else moves (scout trial, 17:04:51-17:05:01Z,
`tmp/scout-sdk/trial.diff`). **This corrects item correction 4:** the replacement does not move `@opentelemetry/api`.

Trust: 0.131.0 (from `.github/workflows/create-releases.yml`) and 1.0.0 and 1.3.0 (from `publish-npm.yml`) all carry
trusted-publisher SLSA provenance from `anthropics/anthropic-sdk-typescript` `refs/heads/main`. The publishing workflow
moved to `publish-npm.yml` in the same repository, under a new trusted-publisher config id, at 0.132.1 (published
2026-10-08T03:20:39Z), not at 1.0.0; every release since has used it (registry attestations read by A's two reviews,
2026-11-01 20:28-20:29Z; corrected in A's fix round, ci-infra-r2-N2, SEC2-N3). Same repository and branch, still
provenance: no downgrade, and `toolchain:check`'s trust rule passed (`tmp/scout-sdk/toolchain.log`). The PR A
description says so.

### 3.2 Every changelog and migration-guide item against the gateway
Sources: `npm pack @anthropic-ai/sdk@{0.131.0,1.3.0}` (CHANGELOG.md 1-290 read whole); the migration guide
`https://platform.claude.com/docs/en/api/migration-2026-10-21.md?sdk_languages=typescript` (HTTP 200, 17:02:21Z, 625
lines). The gateway's request is `anthropic.ts:57-64` (`model`, `max_tokens`, `system` string, one user text block,
`output_config` with `effort` and `json_schema`, `stream:false`), per-request options `anthropic.ts:65`.

| Change (version) | Applies? | Evidence | Action |
|---|---|---|---|
| API version `2023-06-01` -> `2026-10-21` (1.0.0) | Yes, every request | `pack-0.131.0/client.mjs:842` vs `pack-1.3.0/client.mjs:972` | Record in ADR 0048; MOD-18 asserts the header. Guide lists no change to what the gateway sends or reads. |
| Key sent as `Authorization: Bearer`, not `X-Api-Key` (1.0.0; source and guide L399-448, not in CHANGELOG) | Yes | Nothing reads `x-api-key` in apps, packages, infra, tools, docs, eval, .github; no `baseURL`/`ANTHROPIC_BASE_URL`; egress is plain HTTPS (`infra/lib/constructs/network.ts:149-154`) | Record; MOD-18 asserts Bearer and no `x-api-key`. |
| One credential per client; code credential means env/disk not read (1.0.0) | Yes, safer | `anthropicClient` passes only `apiKey` (`anthropic.ts:46`); under 0.131.0 a stray `ANTHROPIC_AUTH_TOKEN` would also have been sent | Record. |
| Text Completions, `HUMAN_PROMPT`, `AI_PROMPT` removed (1.0.0) | No | Gateway uses `messages.create` only | None. |
| `temperature`, `top_p`, `top_k` removed from types (1.0.0) | No | Not sent (`anthropic.ts:57-64`) | None. |
| `MessageParam` a union by role (1.0.0) | No | One user text block typechecks (gateway `tsc --noEmit` exit 0) | None. |
| `betas` off non-beta Models; `compactionControl` off tool runner (1.0.0) | No | Neither used | None. |
| Licence MIT -> Apache-2.0 (1.0.0; `npm view`, LICENSE; not in CHANGELOG) | Yes | `pnpm licenses:check`: 185 production packages allowed | Record. |
| Native OpenTelemetry tracing, on by default; new dep `@opentelemetry/api ^1.4.1` (0.134.0) | Yes | §3.4 | `openTelemetry: { traces: false, propagation: false }` (D2). |
| No redirects on token requests; `proxy-authorization` sensitive; tolerant streaming (0.134.0) | No / harmless | No streaming, no token requests | None. |
| `speed` param, `usage.speed` field; unread streams closed (0.135.0) | Field only | zod parse in `messages.ts:29-33` ignores unknown fields | None. |
| `x-amz-security-token` sensitive (0.136.0); empty path param throws (0.132.1); hardcoded query params not sent (1.3.0) | No | No such calls | None. |
| Defaults `maxRetries` 2, timeout 600000 ms unchanged | Overridden | `anthropic.ts:46,65` | None. |
| Error classes, `APIError.generate`, constructors unchanged; `core/error.d.ts` identical bar sourcemap | Yes, unchanged | `anthropicFailure` (`anthropic.ts:25-42`); `providers.test.ts:156-179` pass | None. |
| `StopReason` identical (0.131.0 :2337, 1.3.0 :3887); `OutputConfig.effort`, `JSONOutputFormat`, `MessageCreateParamsNonStreaming` unchanged | Yes, unchanged | 1.3.0 messages.d.ts :3665, :5557 | None. |
| Module format, 52 `exports` keys, no `engines`, `zod` optional peer | Unchanged | package.json of both packs | None. |
| 0.133.0: analytics metric types; Managed Agents workflows and thread filters (CHANGELOG :196-206) | No | API additions only; the gateway calls `messages.create` alone | None. |
| 0.137.0: org webhook endpoints, user-profile enforcement events; credential tests made independent of the caller's environment (:83-93) | No | API additions and test chores | None. |
| 1.1.0: enforcement status, actions and filter on user profiles (:55-59) | No | API addition | None. |
| 1.2.0: message threads, usage and cost reports by dimension; tool-runner fixes (:32-53) | No | API additions; the gateway runs no tool runner and gives the model no tools (ADR 0048) | None. |
| 1.3.0 other items: Tag endpoints for enterprise organizations; long-request error messages link the docs; docs and CI chores (:3-30) | No | API addition; error text only, `anthropicFailure` reads class and status, not message (`anthropic.ts:25-42`) | None. |
| Guide "Upgrade steps" (guide :9-38): (1) take SDK 1.0.0 or later; companion SDKs (`@anthropic-ai/bedrock-sdk` and others) need v1 together; the Bedrock warning that the new API version serves only newer models there; release the upgrade with its fixes. (2) Go through the breaking changes. (3) Test against `2026-10-21` before release | (1) yes; companions no; Bedrock warning no. (2) yes. (3) yes | No companion SDK in any manifest or the lockfile (`git grep '@anthropic-ai/(bedrock|vertex|foundry|aws|google)'` at bce57f16, 17:52Z: none); our Bedrock path uses `@aws-sdk/client-bedrock-runtime` with its own `bedrock-2023-05-31` body (`bedrock.ts:16,49`), so the API-version warning does not reach it | (1) 1.3.0 with the client options in one PR; (2) this table; (3) MOD-18 asserts `anthropic-version: 2026-10-21` on the request; a real-model test against the version waits on people (§3.8). |

**Bedrock is untouched.** `bedrock.ts:16,49` builds its own body with `anthropic_version: 'bedrock-2023-05-31'`; after this
PR the two real paths send different API versions, which the guide shows no difference for in what the gateway sends or
reads. Recorded in the ADR amendment.

**Other importers.** Runtime imports only at `anthropic.ts:1` and `providers.test.ts:5`; strings in
`tools/brand-fonts/lint.test.ts:53,55`, `tools/test/eslint-rules.test.ts:27-52`, a group name in
`tools/test/dependabot-config.test.ts:65`. None changes.

### 3.3 The only code change
```ts
/**
 * The SDK's client, as configuration builds it: the key from the environment's secret, no SDK retries, and nothing else
 * taken from the environment: the API's own host, the SDK's logging off, no webhook key, and its OpenTelemetry tracing
 * and trace-context propagation off, whatever ANTHROPIC_BASE_URL, ANTHROPIC_LOG or ANTHROPIC_OPEN_TELEMETRY* say
 * (docs/adr/0048). ANTHROPIC_CUSTOM_HEADERS, which no option overrides, is refused by readGatewayConfig.
 */
export function anthropicClient(apiKey: string, timeoutMs: number): AnthropicMessages {
  return new Anthropic({
    apiKey,
    baseURL: 'https://api.anthropic.com',
    maxRetries: 0,
    timeout: timeoutMs,
    logLevel: 'off',
    webhookKey: null,
    openTelemetry: { traces: false, propagation: false },
  });
}
```
And in `packages/model-gateway/src/config.ts`, inside `if (provider === 'anthropic')` (`config.ts:115`), before the return,
in the form of the `MODEL_PROVIDER=local` refusal (`config.ts:109-110`):
```ts
    if (value(env, 'ANTHROPIC_CUSTOM_HEADERS') !== undefined) {
      throw new GatewayConfigError('ANTHROPIC_CUSTOM_HEADERS is refused: the Anthropic path sends only the headers the gateway sets');
    }
```
Why each option (1.3.0 pack, fold 17:48Z): `baseURL` explicit wins over `readEnv('ANTHROPIC_BASE_URL')` and stops a
profile's host (`client.mjs:102,141-147`); `logLevel` is parsed before `ANTHROPIC_LOG` (`client.mjs:159-162`) and `'off'`
is a level (`internal/utils/log.mjs:5`); `webhookKey: null` keeps `ANTHROPIC_WEBHOOK_SIGNING_KEY` unread (`client.mjs:102`,
default only when `undefined`; webhooks unused); `openTelemetry: false` would settle `propagation: true`
(`internal/tracing.mjs:61-65`), harmless today only because no span exists to inject (`client.mjs:624`), so propagation is
set off too and a later SDK that injected the ambient context would still fail MOD-18. Passing `apiKey` already leaves
`ANTHROPIC_AUTH_TOKEN` and the profile and federation chain (`core/credentials.mjs`) unread (`client.mjs:127-135`). The
other `readEnv` calls in the pack (`lib/environments/worker.mjs:238-244`) belong to an entry point the gateway does not import.
`ANTHROPIC_API_KEY` is read by `config.ts` itself, never by the SDK.

### 3.4 Tracing, and the test that proves it off
From `pack-1.3.0/internal/tracing.mjs` (449 lines, read whole): defaults spans on, propagation on, content mode
`metadata_only` (L59-74); a client given no option reads `ANTHROPIC_OPEN_TELEMETRY`, `…_PROPAGATION`,
`…_TRACES_CONTENT_MODE`, `…_TRACES_MAX_CONTENT_BYTES` at construction (L76-88). With nothing registered nothing is emitted
(L161-166, L424-428; scout run-time check with a fake fetch). With any global provider or propagator in the process, each
`messages.create` starts `anthropic.messages.create` and injects `traceparent`/`tracestate`/`baggage` on every attempt.
`openTelemetry: false` is `{traces:false}`: no tracer, untraced request path, no header injection; `withOptions()` keeps it.
The fold sets `{ traces: false, propagation: false }` (§3.3), so propagation is off as well, not only idle.
Nothing in the repository registers OpenTelemetry today (only `apps/web/src/client-boundary.test.ts:199` names an
`instrumentation.ts` that does not exist). Not verified: whether a third-party package registers a global provider on
import; with the flag set it no longer matters.

Tests (new file `packages/model-gateway/src/providers/anthropic-client.test.ts`, its own file so the global
OpenTelemetry state it registers stays within one Vitest file; template `tmp/scout-sdk/trial.diff`), synthetic key
`sk-synthetic-not-a-key`, a fake `fetch` returning a synthetic message, `afterEach`: `trace.disable()`,
`propagation.disable()`, `vi.unstubAllEnvs()`:
- **MOD-17:** with `ANTHROPIC_OPEN_TELEMETRY=true`, `…_PROPAGATION=true`, `…_TRACES_CONTENT_MODE=content`,
  `ANTHROPIC_LOG=debug` and `ANTHROPIC_BASE_URL=https://example.invalid` stubbed, `anthropicClient(…)` has
  `openTelemetry.traces.enabled === false`, `openTelemetry.propagation === false`, `logLevel === 'off'`,
  `baseURL === 'https://api.anthropic.com'`, `maxRetries === 0`, `timeout` the gateway's (absorbs the existing
  `providers.test.ts:181-185` assertions; that test stays).
- **MOD-18:** with the same variables stubbed, a recording `TracerProvider` and a propagator registered
  (`trace.setGlobalTracerProvider`, `propagation.setGlobalPropagator`), and spies on `console.debug`, `.info`, `.warn`,
  `.log` and `.error`, one request through `anthropicClient(…).withOptions({fetch})`: the fake fetch is called once, for
  host `api.anthropic.com`; zero spans; no `traceparent`, `tracestate` or `baggage`; `anthropic-version: 2026-10-21`;
  `authorization: Bearer sk-synthetic-not-a-key`; no `x-api-key`; every request header is in the set the SDK and the
  gateway set (`content-type`, `accept`, `anthropic-version`, `authorization`, `user-agent`, `x-stainless-*` and the
  retry and timeout headers; the builder lists the exact set from the first green run and pins it); every console spy
  silent. **Control:** a client left at the SDK default starts `anthropic.messages.create`, sends `traceparent`, and with
  `ANTHROPIC_LOG=debug` writes to `console.debug`, proving the harness bites.
- **Configuration** (in the gateway's existing config tests, `packages/model-gateway/src/config.test.ts`, under MOD-17's
  id): `ANTHROPIC_CUSTOM_HEADERS` set with `MODEL_PROVIDER=anthropic` makes `readGatewayConfig` throw
  `GatewayConfigError` naming the variable; the same variable with `MODEL_PROVIDER=bedrock` or `local` does not throw.
  `config.test.ts` exists at bce57f16 and is the file that tests `readGatewayConfig` (`git grep`, 17:53Z); MOD-17's
  `registry.ts` entry lists it beside the new test file.
- Scout result (tracing only, before the fold widened the tests): tsc exit 0; providers directory 37 tests pass; with the
  flag removed MOD-17 and MOD-18 fail. **Not run:** the widened MOD-17/MOD-18 and the configuration test; commit A(2)
  shows them failing first on the base client.
- Needs `@opentelemetry/api: ^1.9.1` in the gateway's `devDependencies`; the lockfile gains only an importer entry at 1.9.1.

### 3.5 Matrix rows and synth entries (exact text)
`docs/product/test-matrix.md`, after the MOD-14 row (bce57f16 :233):
```
| MOD-17 | The Anthropic client as configuration builds it, with the environment asking for the SDK's tracing and its content, debug logging and another host; and the configuration with extra headers asked for on the Anthropic path | SDK retries off and the gateway's timeout; the SDK's OpenTelemetry tracing and propagation off, its logging off and the host the API's own, whatever `ANTHROPIC_OPEN_TELEMETRY`, its content mode, `ANTHROPIC_LOG` and `ANTHROPIC_BASE_URL` say; `ANTHROPIC_CUSTOM_HEADERS` is refused on the Anthropic path and ignored on the others |
| MOD-18 | A request through that client while the process has a tracer provider and a trace-context propagator registered and the environment asks for debug logging and another host | One request, to the API's own host; no span is started; no `traceparent`, `tracestate` or `baggage` header and no header outside the gateway's set is sent; nothing is written to the console; the request carries API version `2026-10-21` and the key as `Authorization: Bearer`, with no `X-Api-Key`; a client left at the SDK's default does trace and log (the control) |
```
and after the "MOD-13 and MOD-14 were added…" note (:239-240): "MOD-17 and MOD-18 were added with SDK 1.x on the Anthropic
path (docs/adr/0048, amendment of 2026-11-01): the client's tracing, logging and host are held whatever the environment says,
and extra headers from the environment are refused."
`packages/synth/src/cases/matrix.ts`, after MOD-14 (:378-382), the same id, title and assertion word for word (held equal by
`packages/synth/src/fixtures.test.ts:33-43`). `packages/synth/src/cases/registry.ts`, after `'MOD-14'` (:580), in the
`none(10, …)` form of MOD-13/14 (`completesIn` 10, `registry.ts:27`):
```ts
  // SDK 1.x on the Anthropic path: the client's tracing, logging and host held, extra headers refused (docs/adr/0048, amendment of 2026-11-01).
  'MOD-17': none(10, 'The client and the configuration are built in memory with a synthetic key; no file.', ['packages/model-gateway/src/providers/anthropic-client.test.ts', 'packages/model-gateway/src/config.test.ts']),
  'MOD-18': none(10, 'A fake fetch answers a synthetic message in memory; no request leaves the process; no file.', ['packages/model-gateway/src/providers/anthropic-client.test.ts']),
```
Then `pnpm synth --all` writes `fixtures/synthetic/MOD-17/expected.json` and `MOD-18/expected.json`. MOD-15 and MOD-16
belong to redact-ssn-phone; whichever PR merges second keeps both (LANES.md rule 6).

### 3.6 Lockfile moves and mutation
The replacement moves only the SDK (and its edge to the existing 1.9.1). The writer committed the trial diff's tracked
changes (bump, devDependency, flag) as scratch commit edccdf03 on 83d71fd6 and ran
`pnpm -s exec tsx tools/stryker/affected.ts --event pull_request --base 83d71fd6…` (17:25Z): money, pricing, ledger and
packets "not affected", `shards=[]`. No mutation closure imports `@tp/model-gateway` (only `apps/web` and `apps/worker`
depend on it). **So CI will select no Stryker shard, and the fix round runs none**, unlike the bot's 7, which came only from
its 1.10.0 re-keying the `vitest@5.0.5(@opentelemetry/api@…)` snapshot (`TEST_TOOLING`, `affected.ts:118`). The builder
re-runs `affected.ts` on the committed head; if it selects shards (for example a regeneration moved `@opentelemetry/api`),
all selected shards run in full.

### 3.7 ADR 0048 amendment (text)
Appended after "Revisit when", in the form of ADR 0054's amendments:

> ## Amendment (`co-001/deps-anthropic-sdk-1`, 2026-11-01): SDK 1.x on the Anthropic path, nothing taken from the environment
>
> Dependabot's #87 moved `@anthropic-ai/sdk` from 0.131.0 to the 1.x line; the build took 1.3.0 in its own pull request.
> Nothing in the gateway's design changes; five things about the Anthropic path are recorded.
>
> - **The SDK's OpenTelemetry tracing is off.** Since 0.134.0 the SDK starts a span for each request through any tracer
>   provider registered in the process, and sends `traceparent`, `tracestate` and `baggage` to the provider; environment
>   variables alone (`ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content`) put prompts and outputs into those spans.
>   `anthropicClient` builds the client with tracing and propagation off, which no environment variable overrides: the
>   gateway logs references only (above), PRD 14 keeps model calls out of any model-observability service, trace ids
>   would reach the provider, and the traces PRD's observability row asks for would otherwise switch the SDK's on
>   silently. Propagation is set off as well, so no trace context reaches the provider even from a span the SDK did
>   not start. MOD-17 and MOD-18 hold it, with a default client as the control.
> - **Nothing else is taken from the environment.** The SDK also reads `ANTHROPIC_LOG` (at `debug` it logs each
>   request's body, the prompt, to the console and so to the log group), `ANTHROPIC_BASE_URL` (the host the key and
>   prompts go to) and `ANTHROPIC_CUSTOM_HEADERS` (extra request headers). Client options fix the host
>   (`https://api.anthropic.com`), logging off and tracing off; `webhookKey: null` leaves the webhook key unread; and
>   configuration refuses `ANTHROPIC_CUSTOM_HEADERS` on the Anthropic path, since no client option overrides it. These
>   reads were already in 0.x; the amendment closes them with the major.
> - **API version.** The Anthropic path now sends `anthropic-version: 2026-10-21`; the Bedrock path still sends
>   `bedrock-2023-05-31` in its body. Nothing the gateway sends or reads differs between them (the migration guide's
>   Messages changes touch no field the gateway uses). The first real-model record on the Anthropic path will be made on
>   SDK 1.x and this version.
> - **Credential.** The key goes as `Authorization: Bearer`, not `X-Api-Key`, and is the client's only credential: a
>   credential passed in code means the SDK reads none from the environment or disk.
> - **Licence.** The SDK is Apache-2.0 from 1.0.0 (was MIT); the licence allowlist already allows it.
>
> Alternatives: leaving the SDK's tracing and logging to environment variables (one forgotten variable undoes it; a
> client option cannot be overridden from outside); recording `ANTHROPIC_CUSTOM_HEADERS` instead of refusing it (it
> would send headers no one sees).
>
> Revisit when: the product registers a tracer provider or HTTP/fetch instrumentation (keep the SDK's spans and
> propagation off, or record why not); the SDK reads a new environment variable (read its `readEnv` calls at each
> major); the SDK's next major or API version.

Also in the body: lines 37-39 gain ", its OpenTelemetry tracing and logging off and its host fixed" after "the SDK's retries off and its timeout at the
gateway's"; the Alternatives list gains, after "Provider-side retries" (:153-154): "- **The SDK's own tracing.** It would
send trace context to the provider and, by one environment variable, prompts and outputs to whatever records spans; it is
off on the client, as are the SDK's logging and its host's environment variable (amendment of 2026-11-01)." The header's test-matrix list (:10-11) gains MOD-17 and MOD-18.
**ADR 0089 is released** (no decision of its own).

### 3.8 The gate and what it shows
The gate the build can run (item correction 6): `pnpm test:golden` (scout 17:06:06-30Z: 5 files, 376 tests pass,
`gate.golden.test.ts` included) plus the gateway's tests (`vitest run --project unit packages/model-gateway`: 24 files,
461 pass; with the tracing tests 37 in the providers directory). `eval/baseline.json` holds two `local` entries and all 24
floors in `eval/floors.json` are null, so no real provider is served; the gate proves the local path and the provider's
request shape, not the model. **Waits on people:** a real-model evaluation on the Anthropic path (`model-evaluation.md:7-11`);
it does not block. The PR description says so in those words.

## 4. #88: aws-cdk-lib and the aws-cdk CLI

### 4.1 Versions (`npm view <pkg> time --json`, 17:02Z; `minimumReleaseAge: 4320`, `pnpm-workspace.yaml:44`)
| Package | Version | Published (UTC) | Usable |
|---|---|---|---|
| aws-cdk-lib | 2.275.0 (latest) | 10-26 19:32 | now |
| aws-cdk CLI | 2.1146.1 | 10-22 17:45 | now |
| aws-cdk CLI | 2.1147.0 (latest) | 10-30 18:57:11 | from 11-02 18:57:11 |
| constructs | 10.8.1 (latest) | 08-03 | already the floor (`infra/package.json:15`) |
| `@aws-cdk/cloud-assembly-schema` (transitive) | 55.2.0 / 55.3.0 | 10-22 00:20 / 10-30 18:22 | now / from 11-02 18:22 |

Engines unchanged (lib node >= 20, CLI >= 18). Trust: aws-cdk-lib never had provenance (no downgrade); CLI and schema
carry trusted-publisher SLSA provenance. The CLI and library move together: lib 2.275's `manifest.json` declares
`minimumCliVersion` 2.1146.1 (synth comparison). Item correction 3 holds.

### 4.2 Library notes (raw `aws/aws-cdk/v2.275.0/CHANGELOG.v2.md`, 17:03Z)
- 2.274 breaking: CloudFormation resource type changes in CloudWatch AnomalyDetector, Glue, IoT, QuickSight; 2.275 the
  same kind in bedrockagentcore, codebuild, dax, dms, emr, fsx, medialive, mediapackagev2. `infra/lib` uses none of them
  (module list: scout-cdk §2; on base and #42's be63bdc2).
- CloudFront origin-access-control signing: not used (`edge.ts:243`, `HttpOrigin`).
- 2.275's App setting to turn off built-in CloudFormation validation: not set; validation is on since 2.262.0.
- 2.274 Tags fix: `Tags.of` takes literals only (`platform-stack.ts:74-75`).
- Two new feature flags (`aws-apigateway:logGroupDestinationArnWithoutWildcard`,
  `aws-stepfunctions-tasks:evaluateExpressionDedicatedFunction`): neither module used; `infra/cdk.json` context is empty.
  CI's "85 feature flags are not configured" (84 on 2.273) is the new one; set neither.
- No deprecations. Infra typecheck exit 0, tests 24 files, 602 pass on the bump.

### 4.3 CLI notes (blobless clone of aws/aws-cdk-cli, 17:05Z; `packages/aws-cdk` and its bundled packages)
- 2.1145.0 -> 2.1146.0: rollback triggers; `diff --parameters`; change-set diff fixes (our diff is `--method template`,
  `cdk-diff-plan.ts:25`); drift pagination, duplicate-key templates, `AWS_EC2_METADATA_DISABLED` region lookup, hotswap.
- 2.1146.0 -> 2.1146.1: one commit, deploy approval diff for `--method=execute-change-set`.
- 2.1146.1 -> 2.1147.0: `cdk explore` (local web explorer, only when invoked), abortable synthesis, new toolkit entry
  point, deploy-approval diff fix, opt-in stricter evaluation, no subprocess for the library-version lookup. Nothing on
  our synth or template-diff path.
- Bootstrap template: no diff 2.1145.0 -> 2.1147.0. Node engine >= 18 throughout. Notices: unchanged.
- **Telemetry on by default** in all three; off only by `CDK_DISABLE_CLI_TELEMETRY`, context `cli-telemetry: false`,
  `--no-version-reporting`, or `cli-telemetry --disable` (writer confirmed the context test in the installed 2.1145.0
  `lib/index.js`: `["false", false].includes(context.get("cli-telemetry"))`, 17:28Z). Posts to
  `https://cdk-cli-telemetry.us-east-1.api.aws/metrics`. `pnpm cdk:diff` sets the variable (`infra/scripts/cdk-diff.ts:8`)
  and `--no-notices` (`cdk-diff-plan.ts:25,29`); `infra/package.json:8` and `infra/cdk.json` do neither. Not new; D6 fixes it
  without a context key (below).

D6's change (folded from review B1; the context key of the first draft is dropped):
- `infra/package.json:8`: `"synth": "CDK_DISABLE_CLI_TELEMETRY=true cdk synth --quiet --no-notices"`. pnpm runs scripts
  through `sh` on the Linux CI and dev hosts; the variable is the one `infra/scripts/cdk-diff.ts:8` already sets, which
  stays as it is.
- `infra/cdk.json`: a top-level `"notices": false` beside `"context": {}`, so bare `cdk` commands run from `infra/` (the
  deploy runbook's) stop fetching notices too. It is a CLI **setting**, not app context: the installed CLI 2.1145.0 reads
  it as `configuration.settings.get(["notices"])` when no `--notices` flag is given, and calls `notices.refresh()` (the
  network fetch) only when notices are shown (`node_modules/.pnpm/aws-cdk@2.1145.0/node_modules/aws-cdk/lib/index.js:
  370158-370168, 370177-370181`). Telemetry is off on `CDK_DISABLE_CLI_TELEMETRY` "true"/"1" (`index.js:303029-303031`).
  `context` stays `{}`, so `infra/test/deploy-parameters.test.ts:338-342` (#42's file) and ADR 0012:23-26, :127 hold.
  Keep the file's existing formatting (one added line); do not re-serialize it.
- **Fold's trial (17:50:07-13Z,** bce57f16 with both edits, under flock): `pnpm --filter @tp/infra synth` rc 0, the three
  stack templates byte-identical to the scout's base synth (`tmp/cdk/base`), no `notices` key anywhere in `cdk.out/*.json`;
  `cdk synth -v` shows `disableCliTelemetry: 'true'` and the setting `notices: false` read. So the builder's former checks
  (a) and (b) are done; the builder re-runs the synth comparison on the committed head anyway (§4.4).
- Test: a **new** `infra/test/cli-settings.test.ts` (not `deploy-parameters.test.ts`, which is #42's; not
  `cdk-diff-plan.test.ts`, which tests `planCdkDiff`) reads `infra/package.json` and `infra/cdk.json` and asserts: the
  `synth` script contains `CDK_DISABLE_CLI_TELEMETRY=true` and `--no-notices`; `notices === false`; `context` equals `{}`.
  It is commit B(2), failing first. Infra unit tests have no test-matrix rows (`git grep "infra/test|cdk"
  docs/product/test-matrix.md` at bce57f16: none), so no row and no COUNTER REQUEST.
- Record: an ADR 0012 amendment in PR B (ADR 0012 is the CDK foundation's record, touched by no open PR: `git diff
  --name-only` of #42, #75, #83, #84, #85 and #86 against their merge-bases, 17:48Z; ADR 0066 is not used because #86 and
  PR C both change it). Text, appended after "Revisit when":

  > ## Amendment (`co-001/deps-aws-cdk-minor-patch`, 2026-11-01): the CDK CLI's telemetry and notices off
  >
  > The CDK CLI posts usage telemetry to an AWS endpoint and fetches notices on every command by default. `pnpm cdk:diff`
  > already ran with `CDK_DISABLE_CLI_TELEMETRY=true` and `--no-notices`; now `pnpm --filter @tp/infra synth` does too,
  > and `cdk.json`'s top-level `notices: false` turns notices off for any `cdk` command run from `infra/`. Both are CLI
  > settings, not context: `context` stays empty, as the Decision above requires, and `infra/test/cli-settings.test.ts`
  > holds all three. `versionReporting` stays on: turning it off would remove `AWS::CDK::Metadata` from every template,
  > a stack change. Alternatives: the `cli-telemetry: false` context key (context the app reads, against this ADR's
  > empty `cdk.json`). Revisit when: a deploy is run through a repository script (set the variable there), or the CLI
  > changes how it reads either setting (read `canCollectTelemetry` and the notices setting at each CLI bump).

  The header gains "amended 2026-11-01 (CDK CLI telemetry and notices)". One sentence in the runbook's AWS paragraph
  (`dependency-upgrades.md:321-323` at bce57f16): "After a CDK CLI bump, confirm it still honours
  `CDK_DISABLE_CLI_TELEMETRY` and the `notices` setting (`lib/index.js`, `canCollectTelemetry` and the notices setting)."
- Still open (proposal P7, after #42): a person's bare `cdk deploy` (`docs/runbooks/deploy-and-rollback.md:13,112,207`, a
  #42 file) still sends telemetry, and an older global CLI refuses lib 2.275's assembly (fails safe, no stack change).

### 4.4 The synth comparison in place of `cdk:diff`
CI's `cdk:diff` on #88 (`ci.yml:488-489`; job 123266121153, read 17:06Z) synthesized with "no usable AWS credentials" and
diffed nothing. The scout synthesized base (lib 2.273.0, CLI 2.1145.0) and bump (lib 2.275.0, CLI 2.1146.1) with
`CDK_DISABLE_CLI_TELEMETRY=true … cdk synth --quiet --no-notices` and compared them (`tmp/cdk/{base,bump}`):

| File | Difference | Why |
|---|---|---|
| tp-dev, tp-staging, tp-production `.template.json` | one line each: `CDKMetadata` Analytics `2.273.0!aws-cdk-lib` -> `2.275.0!aws-cdk-lib`; no resource, property, parameter, rule, condition or output change | library version in `AWS::CDK::Metadata` |
| `*.assets.json` | template asset hash and destination id; version 54.0.0 -> 55.0.0 | template bytes; schema 55 |
| `manifest.json` | two new flags in the report; template URL hashes; `minimumCliVersion` 2.1144.0 -> 2.1146.1; version 55.0.0 | lib 2.275 |
| `*.metadata.json` | a new `aws:cdk:templateFile` entry per stack; stack-trace paths | a 2.274 core change (probably the tracing fix; not verified) |
| `tree.json`, `validation-report.json`, `cdk.out` | version strings | lib and schema |

File assets (`asset.02b51ab5…`, `asset.9b8fce7a…`, `asset.e16ffb3b…`) byte-identical. A deploy would be a metadata-only
stack update; bootstrap requirement and asset bucket and role names unchanged. Not done: synth with CLI 2.1147.0, or with
#42's stacks. Builders re-run this comparison on their tree, again on the merged tree after #42 (with
`address-validation-stack.ts`), and paste the table in the PR (runbook 321-322 at bce57f16).

### 4.5 #42
#88's files are `infra/package.json` (ranges and the synth script) and `pnpm-lock.yaml`, plus D6's top-level `notices` key
in `infra/cdk.json`, the new `infra/test/cli-settings.test.ts`, the ADR 0012 amendment and the runbook sentence. #42
(be63bdc2) touches none of `infra/package.json`, `infra/cdk.json` or ADR 0012 (`git diff --name-only`, 17:48Z); no
note-driven change lands in a #42 file. The shared lockfile and #42's new stack
are why the bundle merges after #42.

## 5. #89: nine `@aws-sdk/*` and stripe

### 5.1 Ranges
On the base every direct `@aws-sdk/*` is `^3.1152.0`: gateway `package.json:17` (client-bedrock-runtime), db `:17`
(client-kms), contracts `:16` (client-textract), web `:15-17` (client-cognito-identity-provider, client-s3,
s3-request-presigner), worker `:36-38` (client-rds, client-s3, client-sesv2), infra `:18` (client-sts, devDependency).
stripe `^23.0.0` at `packages/billing/package.json:19`. Nine `@aws-sdk` names in **10 ranges across 6 manifests**, plus
stripe in `packages/billing`: 11 ranges in 7 manifests (`git grep '"@aws-sdk/' -- '*package.json'` at bce57f16, 17:48Z);
#89 moves them all.
If #42 has merged by build or merge time, its three new ranges move to the same version: web `client-sesv2` and
`client-sts`, worker `client-sqs` (a tenth name).

### 5.2 Ages and the deprecation (npm view 17:12Z)
| Version | Usable from (UTC) | Note |
|---|---|---|
| 3.1159.0 | 10-31 18:55 | newest usable now |
| 3.1160.0 | 11-01 18:53:13 (base clients); 18:55:06 with #42's client-sqs | corrects item correction 7's "about 18:53" for the #42 case |
| 3.1161.0 (latest) | 11-02 18:52:27 | |
| `@smithy/core` 3.38.1 | 11-02 23:11:40 | first not deprecated |
| stripe 23.0.1 / 23.1.0 | 10-25 / 11-01 19:58:14 | 23.1.0 is what limits a build "at about 20:00" |

Every `@smithy/core` 3.24.0-3.38.0 is npm-deprecated ("a bug in custom logger data redaction", aws-sdk-js-v3 issue 8393;
registry 17:13Z), including the base's 3.36.0 (`pnpm-lock.yaml:2195`). We are not exposed: no AWS client sets a `logger`
(gateway `config.ts:137`; web `services.ts:107,207,229`, `uploads/targets.ts:63`; worker `platform/wiring.ts:20,30,41`,
`mail/mail.ts:85`, `intake/wiring.ts:19`; contracts `evidence/scan.ts:92`; db `crypto/kms-key-provider.ts:44`; infra
`cdk-diff-plan.ts:39`); the SDK default logger is a no-op (not verified against SDK source). No release-age exclude for
3.38.1: no advisory, and an exclude is only for an advisory fix (`check.ts:439,467-487`).

### 5.3 Notes read (raw `aws-sdk-js-v3/v3.1161.0` CHANGELOGs, 17:14Z; `npm pack` 3.1152.0 vs 3.1161.0, `dist-cjs` diffed)
- Version string only: client-bedrock-runtime (AwsRestJson), client-s3 (3.1158 e2e test keys only), client-sts,
  client-sesv2, client-textract, client-cognito-identity-provider, client-sqs; `s3-request-presigner` dist identical.
- client-kms 3.1157 adds ML-KEM shapes; client-rds 3.1154 adds On-Demand Capacity Reservation shapes and a fault. No
  endpoint ruleset changed.
- Shared runtime: SSO refresh awaits in-flight (3.1153); S3 Express cache by identity (3.1159; not used, not verified in
  infra); checksums add xxHash and SHA-512 with defaults unchanged (CRC32, `WHEN_SUPPORTED`; `@aws-sdk/checksums`
  3.1001.7 and 3.1002.1); RPCv2 JSON codegen (none of ours switched); clock skew excludes server time (3.1161);
  `@smithy/core` 3.38.0 service-default idle timeout and signing of prototype-named headers; 3.38.1 the redaction fix;
  node-http-handler 4.14.x idle timeout and one agent for concurrent first requests.
- **Bedrock runtime (the default model path):** only `InvokeModelCommand` with `modelId`, `contentType`/`accept`
  `application/json`, the `bedrock-2023-05-31` body and `abortSignal` (`bedrock.ts:51-54`); client `region`, `endpoint`,
  `maxAttempts: 1` (`config.ts:137`); failures by `error.name` (`bedrock.ts:23-41`). Nothing changes on that path.
- Presigned uploads: `targets.ts:63` sets `requestChecksumCalculation: 'WHEN_REQUIRED'`, `:84-89` explicit signable and
  unhoistable headers; shape unchanged; `targets.test.ts` passes on 3.1159 and 3.1161.
- **No code change** for any AWS client.
- **ADR 0070's set-change rule applies to the client-textract bump, and its condition is checked mechanically.** The
  bump is a Textract-reader bump under ADR 0070:259-264 and :374 (also `model-evaluation.md:4`, :123): `scan.ts:1`
  imports `TextractClient` and the text-detection commands from `@aws-sdk/client-textract`, and the evaluation reads its
  scans through `TextractPageReader` over a recorded client (`eval/sets.ts:85-91`). The rule bites only if the pages as
  read change. That is tested, not argued: `gate.golden.test.ts:311` and `:316` assert each `eval/baseline.json` entry's
  `set_sha256` equals the live set hash (`loadContractSet`, `:80`), which covers every case's pages as read
  (`sets.ts:270-278`). So `pnpm test:golden` on the committed head of PR B, after the lockfile change, is a named gate
  step, and its pass goes in the description; the dist diff (version string only) is supporting evidence. Separately,
  `baseline.json` holds only the two `local` entries, so no people-run re-baseline would be needed in any case; but if
  `test:golden` ever shows `set_changed` after a reader bump, the bump does not merge until the local entries are
  re-recorded with `--new-set` under `model-evaluation.md` §5. Having no real-provider entry alone does not exempt the
  bump. (Not verified: whether the scouts' `test:golden` run was on a bumped tree; the builder's is.)

### 5.4 stripe
23.0.1: whitespace-only webhook secrets rejected; v2 search; async notification verification; fetch responses disposed
before retry; `lastResponse.statusCode`. 23.1.0: pinned API version `2026-09-30.endive` -> `2026-10-28.endive`, additive
types, `SubscriptionSchedule.pause_schedules` required (types only; billing uses no schedules). `stripe.ts:50-52` passes
no `apiVersion` by design (comment at :50), consistent with ADR 0050:48, so D8 takes 23.1.0 when usable. Same-release
monthly versions being non-breaking is Stripe's policy (not verified here). The webhook endpoint's API version is set in
Stripe: a person checks it; does not block.

### 5.5 Trials and mutation
Trial A (now: `^3.1159.0`, client-sts included, stripe `^23.0.1`): lockfile-only and frozen install rc 0;
`BASE=origin/claude/build-platform pnpm toolchain:check` 0 errors, 32 added versions (one warning, pnpm 10.34.9), **run
with the checker at 83d71fd6, before #82 rewrote `tools/check-toolchain`** (`check.ts`, `registry.ts`, `tree.ts`, new
`images.ts`, `exclude-window.ts`, `policy.ts`). **Re-run on #82's checker by the fold:** bce57f16 plus the same ten
ranges and stripe, `pnpm install --lockfile-only --ignore-scripts` rc 0 (510 lockfile lines; warns of the deprecated
`@smithy/core` 3.38.0), then `BASE=origin/claude/build-platform tsx tools/check-toolchain/index.ts` under flock,
2026-11-01T17:49:36-39Z: "passed, 0 error(s), 1 warning(s)" (pnpm 10.34.9); 32 added versions, each with age, integrity
and trust ok; images "no image is new against the base"; 0 audit exceptions; 0 excludes. A's trial
(scout-sdk `trial.diff`) was re-run on #82's checker by the review's skeptic: rc 0 at 17:46:59Z, 0 errors, 1 warning,
images ok. `licenses:check` and `watched.ts` are not stale: #82 changed neither tool nor their inputs (`git diff
--name-only 83d71fd6 bce57f16`). Anyone re-running in a scratch worktree symlinks the checkout's `node_modules` and
`tools/node_modules` first, or the run fails with `ERR_MODULE_NOT_FOUND 'yaml'` (a harness artifact, not a checker failure);
`licenses:check` ok; `watched.ts --write` no diff; `pnpm typecheck` rc 0; unit on gateway, billing, db, contracts, web and
worker client modules, infra, eslint-rules: 103 files, 1,752 pass. Variant D (11-02 23:15 simulated, `^3.1161.0`,
`^23.1.0`): `@smithy/core` 3.38.1, no deprecation warning; integrity and trust ok for all 33; typecheck rc 0; 104 files,
1,757 pass. Not run: test:db, test:golden, e2e, Stryker. Lockfile moves only `@aws-sdk`, `@smithy` and stripe.

Mutation (`affected.ts:21-33,624-664,681`, reproduced with `affected()`): packets and pricing affected (closures import
`@tp/contracts` and `@tp/db`; reasons both their manifests and the lockfile moves); money and ledger not; stripe selects
nothing. **6 shards:** packets-scan, packets-rest, packets-explain, pricing-engine, pricing-recompute, pricing-rest
(`stryker/shards.json:38-96`), run in full. The CDK half selects none.

## 6. The group routing fix

### 6.1 Root cause (dependabot-core 85379652, 2026-10-30)
- A group with no `patterns` contains every dependency not excluded (`common/lib/dependabot/dependency_group.rb:64-70,109-122`).
- Each containing group gives a dependency up to a strictly higher-scoring group, but a group with no patterns, or scoring
  1000+, never checks (`updater/lib/dependabot/dependency_group_engine.rb:189-225`;
  `updater/lib/dependabot/updater/pattern_specificity_calculator.rb:99-126`).
- Scores (`pattern_specificity_calculator.rb:19-37,182-207`): exact name 1000; no-wildcard name 500; **no patterns 500**;
  wildcard `100 - 10*wildcards + max(len-5,0)` (`@aws-sdk/*` 95, `@next/*` 92); `*` 1; excluded 0.
- Groups run in file order and a handled dependency is skipped (`group_update_all_versions.rb:106-110`,
  `group_update_creation.rb:360-372`); on a refresh that skip does not apply (`:364-367`), so a refresh of #89 could pull
  in aws-cdk-lib, next or pg-boss minors (read from code, not seen in a run).
- So `@aws-sdk/*` and `@next/*` lose to minor-and-patch; exact names keep their group only by file order. Behaviour since
  September 2025 (#13044, #13098, #13180, #13714). GitHub's docs (github/docs 33b1f4a6,
  `dependabot-options-reference.md:326`) say "the first group that it matches"; the fix must route the same under both.

### 6.2 The change (`.github/dependabot.yml`, lines 48 and 68-69; `tmp/scout-routing/routing-fix.diff`)
```yaml
    # Each dependency belongs to one group: minor-and-patch excludes every pattern the groups above it name. Without the
    # exclusions, Dependabot ranks a group with no patterns above a wildcard pattern, so "@aws-sdk/*" and "@next/*" lost
    # their packages to minor-and-patch (run 40818560725), and only the file's order kept an exact name in its group.
    # dependabot-config.test.ts holds the list equal to those patterns and routes every direct dependency.
    groups:
      …
      # Everything no group above takes, minor and patch.
      minor-and-patch:
        exclude-patterns:
          - "@playwright/test"
          - playwright
          - playwright-core
          - "@axe-core/playwright"
          - axe-core
          - "@anthropic-ai/sdk"
          - pg-boss
          - next
          - "@next/*"
          - "@aws-sdk/*"
          - aws-cdk
          - aws-cdk-lib
          - constructs
        update-types: [minor, patch]
```
`exclude-patterns` is documented (options reference :334, :374-376) and honoured (`dependency_group.rb:67`). Result over
every direct dependency (root, apps, packages, tools, infra; scout model `tmp/scout-routing/model.mjs`): each specific group
keeps exactly its names; `next` now holds `@next/eslint-plugin-next`; `aws-sdk` holds the nine `@aws-sdk/*`, infra's
client-sts included; everything else minor-and-patch. `security`, majors, ignores and the limit of 8 unchanged. Rejected:
`patterns: ["*"]` (undocumented constants; same as today under the documented rule).

### 6.3 The test (CI-12, `tools/test/dependabot-config.test.ts`; `tmp/scout-routing/dependabot-config.test.ts.proposed`)
(a) line 70 expects minor-and-patch's `exclude-patterns`; (b) new: minor-and-patch has no `patterns` and its exclusions
equal the in-order concatenation of the specific groups' patterns (a new group without an exclusion fails); (c) a
TypeScript port of the assignment citing the files at 85379652; (d) every direct dependency, read from `repositoryRoot`
(as lines 116-117 do, not `CI_TREE`), plus named cases, has exactly one group, the first-match owner; (e) on the old
config the model reproduces run 40818560725; (f) header (9-15) and titles reworded. Scout run under flock: 10 pass on the
fix; 3 fail on the base config (`CI_TREE=/home/user/PhysicalTherapy`): failing-first shown. `workflows.test.ts`'s simulated
rewrite passes; eslint clean; `pnpm typecheck` **not run** (the builder runs it).
(g) Folded from review N5: `directDependencies()` in the proposed test (`dependabot-config.test.ts.proposed:101-102`)
hard-codes root, `apps/*`, `packages/*`, `tools` and `infra`; the workspace also has `tools/stryker/canary/lib`
(`pnpm-workspace.yaml:7`, no dependencies today). The builder derives the manifest list from `pnpm-workspace.yaml`'s
`packages` globs (plus the root), so a new workspace member cannot escape "every direct dependency"; the `yaml` package
is already a `tools` dependency (`tools/package.json:41`).

### 6.4 CI-12 row (no new ID; `registry.ts:617` unchanged since the test files are the same)
New assertion, in `docs/product/test-matrix.md` (bce57f16 :279), `packages/synth/src/cases/matrix.ts:430` word for word,
and `fixtures/synthetic/CI-12/expected.json` by `pnpm synth --all`:
"Groups in order, each dependency in one: minor-and-patch excludes every pattern a specific group names, and a model of
Dependabot's group assignment routes every direct dependency to its group; majors ignored for the Node image, its types,
TypeScript, Next and pg-boss, and for the compose file's postgres; cooldowns; staggered days; and an entry per ecosystem in use"

### 6.5 Runbook and ADR 0066 Part 2 (at bce57f16)
Runbook `docs/runbooks/dependency-upgrades.md`:
- line 28, after the group list: "; each dependency is in exactly one group (minor-and-patch excludes the others' patterns)".
- step 1 (49-61), new last sentence: "In the npm run's log, `belongs to more specific group` naming any group but a
  specific one means the routing broke: fix `.github/dependabot.yml` (CI-12)."
- step 2 (62-69), new item: "- check that each group's pull request holds only its group's members; a replacement taken
  as the build's own pull request closes the bot's with a comment naming it and its merge commit, once it merges (never
  `@dependabot ignore`)."
- a closing line after step 6: "Each triage is recorded in the item's design (`designs/` on build-ops), steps 1-6 in order."
- Headings stay word for word: "The release age (F2 (b))", "Base images and PostgreSQL" and "pnpm itself" are quoted by
  `tools/check-toolchain/check.ts:454` and its tests (critic: `check.test.ts:265`, `:342`, `images.test.ts:45`). PR C
  adds sentences only and renames no heading.
- line 321-323 ("AWS"): "`@aws-sdk/*` come in their groups" becomes "`@aws-sdk/*` come in the `aws-sdk` group, which
  minor-and-patch's exclusions keep theirs"; and "reaches pricing and packets through the lockfile" becomes "through
  `packages/contracts` and `packages/db`'s manifests and the lockfile". Add: "The CLI moves with the library: a library's
  cloud assembly names the oldest CLI that reads it (`minimumCliVersion`)."

ADR 0066, a new subsection closing Part 2, before `## Part 3` (bce57f16 :731):
> ### Amendment (`co-001/dependabot-group-routing`, 2026-11-01): each dependency in one group
> "In this order" (above) did not route. Dependabot ranks a group with no patterns (500) above a wildcard pattern
> (`@aws-sdk/*` 95, `@next/*` 92) and the empty group never gives a dependency up (dependabot-core 85379652,
> `pattern_specificity_calculator.rb`, `dependency_group_engine.rb`), so npm run 40818560725 put the nine `@aws-sdk/*`
> packages and `@next/eslint-plugin-next` in minor-and-patch (#89), and only the file's order kept an exact name in its
> group. GitHub's documentation says the first matching group wins. minor-and-patch now excludes every pattern the
> specific groups name, which routes each dependency to one group under both rules; CI-12 ports the assignment and
> routes every direct dependency. Alternative: `patterns: ["*"]` on minor-and-patch (rests on undocumented scores; routes
> as before under the documented rule). Revisit when: Dependabot documents its group precedence, or a group is added
> (the test fails until it is excluded).

## 7. The versions rule
"Take the newest each range allows under the 3-day release age at build time, and again at the merge regeneration." The
builder decides with `npm view <pkg> time --json` for each direct package and, as the arbiter, `BASE=origin/claude/build-platform
pnpm toolchain:check` on the committed lockfile (release age, registry integrity, no trust downgrade; `check.ts:605-760`).
Never a release-age exclude (only for an advisory fix). Read the notes of any version newer than this design read.

| Window (UTC) | SDK | aws-cdk-lib / CLI | `@aws-sdk/*` | stripe | `@smithy/core` |
|---|---|---|---|---|---|
| now to 11-01 18:53 | 1.3.0 | 2.275.0 / 2.1146.1 | 3.1159.0 | 23.0.1 | 3.38.0 (deprecated) |
| 11-01 18:53 (18:55:06 with #42's client-sqs) to 19:58 | 1.3.0 | 2.275.0 / 2.1146.1 | 3.1160.0 | 23.0.1 | 3.38.0 |
| 11-01 19:59 to 11-02 18:52 | 1.3.0 | 2.275.0 / 2.1146.1 | 3.1160.0 | 23.1.0 | 3.38.0 |
| 11-02 18:58 to 23:11 | 1.3.0 | 2.275.0 / 2.1147.0 | 3.1161.0 | 23.1.0 | 3.38.0 |
| from 11-02 23:12 | 1.3.0 | 2.275.0 / 2.1147.0 | 3.1161.0 | 23.1.0 | **3.38.1** |

Newer releases after 17:25Z today were not seen. If the bundle's merge regeneration falls after 11-02 23:12, the PR must
show `@smithy/core` 3.38.1 in the lockfile; if pnpm keeps an older transitive, re-resolve it with pnpm's update command
(lockfile only), never by hand. Not verified: that `pnpm update` on the transitive `@smithy/core` leaves every direct
range alone. The builder diffs every `package.json` after it (no change allowed) and lets the lockfile diff and
`toolchain:check` decide; a direct range is never changed by accident. The PR description lists each added version's publish time and age.

## 8. PR plan

Stages in the item's order (item "Exact next step" 3-9): claim and records (8.0), build (8.1-8.2), draft PRs with their
descriptions and subscriptions (8.3), two adversarial reviews per PR (8.4), the fix round with the full suite and one
push (8.5), fresh-clone verification (8.6), merge (8.7), closing the bot PRs and the clean-up (8.8). Three PRs, A, B and C.

### 8.0 Before the build: the claim and the status-file lines
Item sessions do not edit LANES.md (item "Status file"; session brief §7), and rule 3 needs the claim before work starts
(LANES.md:19-24). The fold changed no status file; the session adds these lines to
`approval-summaries/lane-b-dependabot-batch-status.md` before the builders start:
1. At the top, in the form of its "COUNTER REQUEST" convention (status :12): "CLAIM REQUEST: add
   `co-001/dependabot-group-routing` (design D10, PR C: the Dependabot group-routing fix; amends CI-12, no new number) to
   the claim row 'Dependabot's batch of 2026-10-29' (LANES.md:202); it must merge before 2026-11-05T04:31Z."
2. At the top: "ORDER ASK: (a) PR C merges first, before the matrix PRs #83 and #85 that the item orders ahead of any
   CI-12 change (item :187), because Dependabot reads the default branch on 2026-11-05T04:31Z; C's trial merges with
   every open head add no conflict (design §8.7). (b) C does not wait for #86 although both amend ADR 0066 (item :182;
   design §8.7). (c) While #42 waits on the founder's line, may A, B or C merge at all (item :178)?"
3. In "Now": the base moved to bce57f16 (#82 merged 2026-11-01T17:19:46Z); **ADR 0089 is released, unused** (§9); MOD-17 and
   MOD-18 are used; CI-12 amended, no new ID; no COUNTER REQUEST.
4. In "Corrections": item correction 4 is wrong (the replacement keeps `@opentelemetry/api` 1.9.1, so A selects no
   Stryker shard); correction 7's 3.1160.0 time is 18:55:06 with #42's client-sqs, and stripe 23.1.0 (19:58:14) limits an
   "about 20:00" build; #85's head is 90ec40ab.
5. In "Waiting on someone": the API version of Stripe's webhook endpoint (§5.4), a person's check in Stripe.
6. In the log: the design folded, with the totals of the last section.

If the claim has not come back by 2026-11-02T17:00Z, or the orchestrator refuses it, D10's fallback applies: C's commits
go on `co-001/deps-aws-cdk-minor-patch` as separate commits, cut out by 2026-11-04 if #42 is still open. Record the outcome
in the status file's log.

### 8.1 Branches, worktrees and files
| PR | Branch | Replaces | Files |
|---|---|---|---|
| A | `co-001/deps-anthropic-sdk-1` (exists; worktree `/home/user/deps-anthropic-sdk-1`) | #87 | `packages/model-gateway/package.json`, `pnpm-lock.yaml`, `src/providers/anthropic.ts`, `src/config.ts`, `src/config.test.ts`, new `src/providers/anthropic-client.test.ts`, ADR 0048, `test-matrix.md`, synth `matrix.ts`, `registry.ts`, `fixtures/synthetic/MOD-17/`, `MOD-18/`, `watched-paths.txt` if `watched.ts --write` changes it |
| B | `co-001/deps-aws-cdk-minor-patch` (exists; worktree `/home/user/deps-aws-cdk-minor-patch`) | #88, #89 | `infra/package.json` (ranges and the synth script), `infra/cdk.json` (top-level `notices` only), new `infra/test/cli-settings.test.ts`, ADR 0012 amendment, runbook AWS paragraph (one sentence, §4.3), the six manifests holding the ten `@aws-sdk` ranges, `packages/billing/package.json`, `pnpm-lock.yaml`, `watched-paths.txt` if changed; after #42 also its three ranges |
| C | `co-001/dependabot-group-routing` (new, once claimed) | none (fix) | `.github/dependabot.yml`, `tools/test/dependabot-config.test.ts`, `test-matrix.md` CI-12, synth `matrix.ts` CI-12, `fixtures/synthetic/CI-12/expected.json`, runbook (§6.5), ADR 0066 Part 2 amendment (subsection only, §8.7) |

C's branch and worktree, only after the orchestrator has added it to the claim row and pushed that to `claude/build-ops`
(no push before, rule 3):
```
PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin origin/claude/build-platform:refs/heads/co-001/dependabot-group-routing
bash /tmp/setup-container.sh co-001/dependabot-group-routing:/home/user/dependabot-group-routing
```
(the setup script refuses a branch not on origin, `tools/setup-container.sh:767-771` on build-ops 41add776; the worktree
path follows LANES.md rule 5).

Each branch merges the current base (bce57f16 or later) in first with a merge commit.

### 8.2 Commits (failing-first where a test is new)
- A: (1) SDK range + `pnpm install --lockfile-only`; (2) `@opentelemetry/api` devDependency, the MOD-17/MOD-18 test file
  and the `ANTHROPIC_CUSTOM_HEADERS` config test (fail on the base client and config: tracing and propagation on, logging
  and host from the environment, no refusal); (3) the client options, the config refusal and the doc comment (pass);
  (4) matrix rows, synth entries, `pnpm synth --all`; (5) ADR 0048 amendment.
- B: (1) CDK ranges + lockfile; (2) `infra/test/cli-settings.test.ts` (fails); (3) the synth script and `cdk.json`'s
  `notices` (passes; synth templates unchanged, fold trial §4.3); (4) `@aws-sdk` ranges and stripe + lockfile; (5) ADR
  0012 amendment and the runbook sentence; (6) after #42: its ranges, regenerated lockfile, redone synth comparison.
- C: (1) the CI-12 test changes, the manifest list derived from `pnpm-workspace.yaml` (3 fail on the old config); (2)
  `dependabot.yml` (pass); (3) CI-12 row, `matrix.ts`, `pnpm synth --all`; (4) runbook and ADR 0066 amendment.

Every heavy step under `flock /tmp/laneb-heavy.lock` with `PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`;
the lockfile is never edited by hand. After the ranges: `pnpm exec tsx tools/screening-capacity/watched.ts --write`,
`pnpm licenses:check`, `BASE=origin/claude/build-platform pnpm toolchain:check`.

Not yet run by anyone, so each builder runs it before the draft opens: A, repo-wide `pnpm typecheck` and `pnpm lint`,
`watched.ts --write`, `pnpm synth --all`, and the widened MOD-17/MOD-18 and config tests; B, `pnpm test:golden` on the
bumped tree (§5.3), the synth comparison with the CLI version taken; C, `pnpm typecheck` and `pnpm synth --all`.

### 8.3 Draft PRs at once, descriptions and subscriptions
Open A, B and C as **drafts** into `claude/build-platform` as soon as each first push lands. Fill the description from
`.github/pull_request_template.md` (bce57f16, identical at 83d71fd6), every section, under 65,536 characters; write it
with MCP `update_pull_request` and read it back, confirming all eight headings are present with "None" where a section
has nothing. End it with the session's attribution footer (8.8). Then call `subscribe_pr_activity` (owner
PureTideWater, repo PhysicalTherapy) for each. If the result says another agent is already watching, record that in the
status file and poll the PR's checks and comments instead; do not count on events arriving.

Per section:
- **What changes / Why.**
  - A: SDK 1.3.0 and what was read (CHANGELOG 0.131.0-1.3.0, the migration guide with its fetch time, §3.2's table), each
    version's age and the provenance line (§3.1), the client options and the config refusal with MOD-17/MOD-18 and the
    failing-first commit, the gate results (§3.8), the affected-shards output, "a real-model evaluation is people only
    and waits on the founder". Why: #87, runbook 319-320 (bce57f16).
  - B: notes read (lib 2.274/2.275, CLI to the version taken, `@aws-sdk` 3.1153 to the version taken, stripe), ages, the
    synth comparison table with every change explained, "CI's `cdk:diff` has no credentials and only proves the stacks
    synthesize; a credentialed diff against tp-staging waits on a person and does not block", the CLI-library coupling,
    D6 and its test, the `@smithy/core` deprecation and the no-logger evidence, stripe's API version move, ADR 0070's
    set-change rule and the `test:golden` pass (§5.3), the 6 shards' results. Why: #88 and #89, runbook 321-323.
  - C: root cause with dependabot-core cites, the failing-first evidence, the routing table of every direct dependency.
    Why: run 40818560725, item correction 2.
- **What it does not change.** For all three: Pricing engine: None. Ledger: None. Database schema and migrations: None.
  Content releases: None. Domain model, its approval line and `approvers.json`: None. "CI and the GitHub settings":
  - A: no workflow or GitHub setting changes; only test-matrix MOD-17/MOD-18 and `watched-paths.txt` (an input to the
    screening-capacity check) if `watched.ts --write` moves it. Also: no other model provider, no prompt and no gateway
    routing changes.
  - B: no workflow or GitHub setting changes; CI's `cdk:diff` already ran with telemetry and notices off, and the infra
    synth now does too; `watched-paths.txt` if it moved. Also: stack templates change only as the §4.4 table shows.
  - C: **Yes:** `.github/dependabot.yml` changes Dependabot's grouping (`exclude-patterns` on minor-and-patch); no
    workflow, branch protection or ruleset changes; the CI-12 test and row are amended. Also: no package version changes.
- **Checks.** The §8.5 commands as table rows, each with its result on the head commit; the required-checks line stays as
  the template gives it.
- **Reviewer agents' findings.** One row per finding from §8.4's reviews and agents, each with its resolution (commit, not
  a defect and why, or deferred and where), and the "Not run" rows of §8.4.
- **Freeze exception.** All three: "No: it changes none of them" (Change Order 001 rule 4, `change-order-001.md:10`; the
  security-program checks at `reconciliation-001.md:486-494`). A and B add one sentence: their settings (the SDK's
  environment reads, CDK CLI telemetry and notices) only reduce what leaves the product, and touch none of the RLS,
  catalog, role, header or `test:db` checks.
- **Domain model.** All three: "No migration; the document is unchanged."
- **The founder's approval.** The template's text, unedited.

### 8.4 Adversarial reviews: two per PR, and the reviewer agents
After the drafts open and before the fix round, six reviews (item step 5): for each of A, B and C, one on CI and test
infrastructure and one on security and supply chain. Adapt `workflow-scripts/lane-b-ci-browser-reviews-wf_7b903031-7ca.js`
(no UX review: no person sees the change), archived as `workflow-scripts/lane-b-dependabot-batch-reviews-<runId>.js` with
`SP` and the record paths rewritten.
1. **Where.** Each review gets its own fresh blobless clone of the PR head under the scratchpad's tmp directory, with
   `pnpm install --frozen-lockfile` under flock; GitHub read only.
2. **Records.** Modelled on `approval-summaries/lane-b-ci-pin-age-review-ci-infra.md` and `-review-security-supply.md`:
   a B/S/N verdict, then findings with file:line at the PR head and UTC times. Named
   `approval-summaries/lane-b-dependabot-batch-review-{A,B,C}-{ci-infra,security-supply}.md`, plus a findings JSON. One
   skeptic per B or S finding before the fix round.
3. **CI and test infrastructure inputs.** A: the failing-first commit A(2), the isolation of global OpenTelemetry state
   and console spies in the test file, `affected.ts` selecting no shard, the golden gate (§3.8), the `watched-paths.txt`
   and synth entries. B: `cli-settings.test.ts`, the §4.4 synth comparison in place of a credentialed `cdk:diff`, the 6
   selected Stryker shards, lockfile regeneration only through `--lockfile-only`, `toolchain:check`, `screening:capacity`,
   `test:golden` as the ADR 0070 check. C: the three CI-12 tests that fail on the old config, whether they really pin the
   routing, the manifest list from `pnpm-workspace.yaml`, the CI-12 matrix, synth and fixture amendments.
4. **Security and supply-chain inputs** (each given `.claude/agents/security-reviewer.md`). A: also ADR 0048, ADR 0070, D2
   and §3.3-§3.4 (every SDK environment read closed or refused; no prompt, output or trace id leaving the product), §3.2's
   table, the licence and auth-header changes, release age (D1), the provenance workflow change (§3.1), the lockfile's
   transitive diff. B: also D6, the `@smithy/core` 3.38.0 deprecation and the no-logger evidence (D7, §5.2), the stripe API
   version move (D8, ADR 0050:48), every new transitive package and its age, the CLI and library coupling. C: also the
   routing change under dependabot-core's specificity rule (§6.1) and GitHub's documented first-match, whether any direct
   dependency loses its group or its cooldown, and the effect on the 2026-11-05T04:31Z run.
5. **Reviewer agents** (template :39-51), each on the committed head in a fresh clone, findings in the table:
   - A: `security-reviewer` (the model path against ADR 0048, ADR 0070 and D2; no model call or provider import outside
     the gateway); this is the security review of item 4 above, recorded in the table. `payment-engine-reviewer`, limited
     to whether any changed gateway response type or field can reach a number or a stage. `edi-reviewer`: "Not run:
     `packages/edi835` and its dependency closure are unchanged and the lockfile does not move them."
   - B: `security-reviewer` on the client-kms move (`packages/db/src/crypto/kms-key-provider.ts`, the per-practice key
     path), the client-textract move (`packages/contracts/src/evidence/scan.ts`), the web and worker AWS clients and the
     synth diff: no new logging of bodies or keys, no tenancy or key-per-practice change. `payment-engine-reviewer`:
     Stryker selects pricing and packets through `@tp/contracts` and `@tp/db`, and ledger depends on `@tp/db`; it confirms
     no source change in pricing, ledger or packets and records the 6 shards' scores. `edi-reviewer`: "Not run: no change
     under `packages/edi835` or its dependency closure."
   - C: all three "Not run: the change is `.github/dependabot.yml`, its config test, the CI-12 row and synth entries; no
     money, tenancy or parsing code." The security and supply-chain review still runs (item 4) and is its own row.
6. **Gate.** Before the fix round, every B and S finding is fixed in scope or answered in the record; one outside the
   item goes to §10 as a proposal.

### 8.5 Fix round: the full local suite once, then one push
Folds §8.4's findings (failing-first where a test is new), then runs: unit (`pnpm test`); `pnpm test:golden` (with the
evaluation gate; for B it is also the ADR 0070 check, §5.3); `pnpm test:oracle`; `pnpm test:db` in 4 shards; build, stamp,
e2e with `E2E_PREBUILT=1`; Stryker: `tools/stryker/affected.ts --event pull_request --base origin/claude/build-platform` on
the committed head and every selected shard in full (`tools/stryker/shards.ts <shard>`, then `gate.ts --shard`): A none
expected (all 7 if `@opentelemetry/api` or vitest moved), B the 6 packets and pricing shards, C none; if a review finding
was fixed, `affected.ts` and the selected shards again on the new head; `pnpm verify-content` and synth's check (`pnpm
synth --all` for A and C); `pnpm lint`, `pnpm typecheck`, `pnpm lint:logs`; `pnpm actions:check` and `pnpm
toolchain:check`; `pnpm screening:capacity` (manifests and lockfile are watched, `watched-paths.txt:9-23`); for B, the
synth comparison of §4.4. One push per PR. Adapt `workflow-scripts/lane-b-ci-pin-age-fix-round-wf_dfb43bb4-b4c.js`.

### 8.6 Fresh-clone verification (item step 7; LANES.md rule 7: no merge before it passes)
Per PR, after the fix round's push and after CI has finished on that head, adapt
`workflow-scripts/lane-b-ci-pin-age-verify-wf_4dac1326-48a.js`:
1. **Verify.** One agent clones fresh (`git clone --filter=blob:none`, the head SHA detached, under the scratchpad's tmp
   directory, not `/home/user`) and runs `flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile`. It checks the
   lockfile is unchanged by a re-resolve and each new version meets the 4320-minute age (§7); reruns the PR's own checks
   (A: MOD-17/MOD-18, the config test and the golden gate; B: the §4.4 synth comparison, `cli-settings.test.ts`,
   `test:golden` and the selected shards' gate output; C: the CI-12 test against the new config and the routing table);
   and reads every required check and run on that exact head (`ci`, `screening-capacity`, `mutation`, `release-dry-run`,
   `approval-of-record`) through the read-only GitHub tools, with run IDs and job logs for any failure. It writes
   `approval-summaries/lane-b-dependabot-batch-verify-{A,B,C}.md`, PASS or FAIL with file:line cites.
2. **Describe.** Apply the verifier's description corrections and the head's CI run IDs with `update_pull_request`, then
   read the description back.
A FAIL goes back to a fix round (failing-first, one push) and verification again on the new head. Verification is re-run
on the resolved head whenever a base merge-in carries a conflict resolution or a lockfile or synth regeneration (B after
#42; A after #75, #84 or a MOD-row PR).

### 8.7 Merge order (LANES.md rule 6: the PR merged second resolves and keeps both)
Superseded by Lane B's standing rule of 2026-11-01 20:36 UTC (status file): each PR merges when verified and green; the
order applies only against a conflicting unmerged PR (A: #94, `packages/model-gateway/package.json`; B: C, the runbook's AWS
paragraph; C: #86, ADR 0066).

**First, for every merge (A, B and C):** while #42 waits on the founder's approval line, ask the orchestrator before
merging any of them (item :178; status-file ORDER ASK (c), §8.0). A changes #42's files `pnpm-lock.yaml`, `test-matrix.md`,
synth `matrix.ts` and `registry.ts`, and `watched-paths.txt` when it is regenerated; B and C change #42 files too
(`git diff --name-only` of #42, 17:48Z). A base move means another base merge into #42, and a commit after the founder's
line dismisses the approval (LANES.md:229).

Trial merges on current heads (fold, 2026-11-01T17:49:07Z, `git merge-tree --write-tree` on bce57f16; C =
`tmp/scout-routing/routing-fix.diff`, A = `tmp/scout-sdk/trial.diff` without its trial test): A and C each merge cleanly
with #42 (be63bdc2), #84 (e3299ea2) and #85 (90ec40ab). With #75 (871faff9), #83 (f4a97668) and #86 (83167b8f) each
conflicts only in the files the base itself already conflicts in with that PR (#75: the three uploads files; #83:
`test-matrix.md` and `registry.ts`; #86: ADR 0066 header, reconciliation-001, `tools/test/workflows.test.ts`), so neither
adds a conflict. A's MOD rows and ADR text were not in its trial diff (A is not built yet): its MOD-14 insertion points
(test-matrix :233/:239, `matrix.ts`:378-382, `registry.ts`:580) do not overlap #42's hunks at 83d71fd6 (review C-S4). The
builders redo these trial merges on the real heads before each merge.

- **C first,** before Thursday 2026-11-05T04:31Z, once §8.6 has passed, subject to the orchestrator's answer to ORDER ASK
  (a). The orchestrator weighs missing the deadline (Dependabot's next npm run opens misrouted PRs again, more to close)
  against a base move under #42.
- **#86 and C.** Item :182 says to merge after #86 when amending ADR 0066; C departs from it openly. At bce57f16, `git
  merge-tree` of C's ADR 0066 amendment (a new subsection before `## Part 3`) against #86 (83167b8f) adds no conflict
  (review skeptic, 17:44Z); #86 already conflicts with the base in the ADR 0066 header (line 28), reconciliation-001 and
  `tools/test/workflows.test.ts` because of #82's merge, which is #86's to resolve. So C does not wait for #86, on two
  conditions: C leaves ADR 0066's header (the Parts amends list and the "Date:" line) alone and records the amendment only
  in the subsection closing Part 2 (if it must touch the header, whichever of C and #86 merges second resolves that line,
  keeping both); and C records nothing in reconciliation-001. Before merging C, re-run `git merge-tree` against #86's
  current head and the moved base, and give the result with the #42 question to the orchestrator.
- **A** after #75 and #84 (gateway and golden files; run the gateway tests and the golden gate on the merged tree), and
  after #42, #83, #85 and redact-ssn-phone for the MOD rows if they merge first (whoever is second resolves; A need not
  wait for #42). If the orchestrator holds A until #42 merges, A merges the new base in, regenerates the lockfile and
  `watched-paths.txt`, re-runs `pnpm synth --all` keeping #42's rows (rule 6), and re-runs the gateway tests and the golden
  gate.
- **B** after #42 (conflicts in both app manifests and the lockfile): regenerate the lockfile, align #42's three ranges,
  redo the synth comparison with #42's stacks. #82 merged at 17:19:46Z (base bce57f16).
- A and B conflict only in `packages/model-gateway/package.json` (adjacent lines); the second regenerates the lockfile.
- **At each merge:** the orchestrator's answer while #42 is open; merge the base in with a merge commit; regenerate the
  lockfile (re-reading §7's window), `watched-paths.txt`, and `pnpm synth --all` if matrix files changed; fresh-clone
  verification PASS on a head whose tree differs from the merge head only by a clean base merge-in (else §8.6 again);
  four required checks green; ready; approval-of-record re-run; then `merge_pull_request` (merge, `expectedHeadSha`).

### 8.8 Closing the bot PRs, and after
When A merges, close #87; when B merges, close #88 and #89 (MCP `update_pull_request`, state closed), each with one comment
(if Dependabot already closed one as up to date, comment only). Draft, ending with the session's attribution footer:

> Taken as the build's own pull request #<n> (merged as <merge commit>), as `docs/runbooks/dependency-upgrades.md` asks:
> no Dependabot pull request merges as it stands. #<n> takes <package> <version> (<what it added: the SDK's environment
> settings and their tests / the synth comparison of the three stacks / the aligned `@aws-sdk` ranges>). Closing this
> pull request ignores nothing; the next run opens a new one when a newer version is due.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
>
> https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx

Note for the next run: if C has merged and B has not by 11-05T04:31Z, Dependabot will open an `aws-sdk` group PR and
refresh #89 down to stripe; close the duplicates the same way once B merges.

After each of A, B and C merges (C has no bot PR to close but runs these too):
1. After the merge and the bot-PR close and comment where there is one, `unsubscribe_pr_activity` for that PR.
2. Read the runs the merge commit's push started on `claude/build-platform` (MCP `actions_list` filtered to the merge SHA;
   `get_job_logs` for a failure). Report a red run to the orchestrator at once; no follow-up PR without asking.
3. Once the branch has merged and no more work is planned on it, remove its item worktree with `git worktree remove`
   (`/home/user/deps-anthropic-sdk-1`, `/home/user/deps-aws-cdk-minor-patch`, `/home/user/dependabot-group-routing`) and
   any scratch trial trees. Only the session does this, never with uncommitted work.
4. Update the status file: each PR's number, merge commit, its push runs' result, which bot PRs were closed with a comment
   or only commented on, and what still waits (B on #42; the 11-05T04:31Z duplicate note).
The item is done only when all three PRs have finished these four steps.

**Never:** merge, push to or build on a bot branch; `@dependabot ignore` (stored outside the file); write files through
the GitHub connector; push with `--no-verify`; edit the lockfile by hand; a release-age exclude for these versions;
approve or review any pull request.

## 9. Numbers
- **ADR 0089: released** (unused; the SDK change is an ADR 0048 amendment).
- **MOD-17 and MOD-18: used** (§3.5), with synth cases in module MOD (`expected/types.ts:9`), `completesIn` 10.
- **CI-12: amended**, no new ID; `registry.ts:617` unchanged.
- **MOD-17's registry entry** names `config.test.ts` beside the new test file (§3.5); no new ID.
- ADR amendments need no number: ADR 0048 (A), ADR 0012 (B, D6), ADR 0066 Part 2 (C).
- No new CI row, synth module, fixture release or migration; infra unit tests carry no matrix row. **No COUNTER
  REQUEST.** The release of ADR 0089 goes in the status file (§8.0 line 3) so the orchestrator can free it.

## 10. Engineering choices made here, and proposals outside this item
Choices: the tracing tests in their own file (global OpenTelemetry state isolated per Vitest file); MOD-18 asserts the API
version so the next version change is deliberate; every SDK environment read closed on the client or refused in
configuration, not only tracing (review S1); the routing fix split out for Thursday's deadline; D6's telemetry and notices
off through the synth script and a top-level CLI setting, with `context` left empty (review B1); D6 recorded in ADR 0012
rather than ADR 0066, which #86 and C both change; shards chosen by `affected.ts` rather than by the bot's run; two
adversarial reviews per PR and the template's reviewer agents mapped per PR (§8.4); C not waiting for #86, on the trial
evidence and two conditions (§8.7).

Corrections to the item file: correction 4 (the replacement keeps `@opentelemetry/api` 1.9.1, so no shard runs for A);
correction 7 (3.1160.0 from 18:55:06 with #42's client-sqs; stripe 23.1.0 at 19:58:14 limits an "about 20:00" build);
"#82 first" is done (merged 17:19:46Z, base bce57f16); rule 6 resolves conflicts but does not order merges; the line-48
comment is wrong for exact names too (they sit in two groups, only order separates them); log lines 160-226 and 2367 were
not re-read here; the refresh pull-in comes from the code, not from a run; #85's head is 90ec40ab, not 29dded52; the
item's "routing fix goes in the #88/#89 PR" (item :140) is replaced by D10, with the bundle as fallback.

Proposals (outside this item):
- P1. ADR 0070's baseline key records neither the API version nor the SDK major; record the version sent beside each
  baseline entry (for #75's owner).
- P2. No test names `model_context_window_exceeded` or `pause_turn`, which `messages.ts:35` maps to `other`.
- P3. Both SDK versions send `x-stainless-*` platform headers (not PHI); noted only.
- P4. A `packageManager` PR to pnpm 10.34.9 (triage step 5).
- P5. `toolchain:check` could warn on an added version npm marks deprecated (the registry document is already fetched,
  `check.ts:605-622`).
- P6. When a tracer provider is added for PRD.md:254's traces, check every SDK in the process for default-on tracing (the
  AWS SDK and stripe included).
- P7. After #42 merges (`docs/runbooks/deploy-and-rollback.md` is its file): deploy through the repository's CLI with
  `CDK_DISABLE_CLI_TELEMETRY=true` (a script like `cdk-diff.ts`), rather than a bare global `cdk deploy`
  (deploy-and-rollback.md:13, :112, :207 at 83d71fd6). That turns telemetry off for deploys, and lib 2.275's assembly
  needs CLI 2.1146.1 or later (`minimumCliVersion`, §4.1), which an older global CLI refuses (fails safe, no stack change).
- P8. The critic's "the read-only checkout's `tools/node_modules` lacks `yaml`" does not hold: it is a working symlink to
  `node_modules/.pnpm/yaml@2.9.1` (`ls`, 17:45Z skeptic, 17:56Z fold). The failure came from a fresh worktree without
  `node_modules`. Proposal only: the trial-tree recipe in the session's scripts links `node_modules` and
  `tools/node_modules` (§5.5).

## Review of the design (2026-11-01)

**Totals:** 33 findings (3 blocking, 12 should-fix, 18 nits; 15 B/S verified real by one skeptic each, nits unverified):
28 Fixed, 4 Fixed by another means, 1 Not taken. Review: `designs/lane-b-dependabot-batch-review.md`; critic and skeptics
in the session's scratchpad `design/`. The fold changed no status file (not a file its task names): the lines it calls for
are drafted in §8.0 for the session to add.

| ID | Sev | Disposition | Reason |
|---|---|---|---|
| B1 | B | Fixed | Context key dropped; telemetry off through the synth script's variable, notices through a top-level CLI setting, `context` still `{}`; new `infra/test/cli-settings.test.ts`; fold synth trial 17:50Z: templates unchanged (D6, §4.3, §4.5, §8.1-8.2); deploy telemetry as P7. |
| S1 | S | Fixed | `baseURL`, `logLevel: 'off'`, `webhookKey: null` and tracing/propagation off on the client; `ANTHROPIC_CUSTOM_HEADERS` refused in `readGatewayConfig` (the safer of record or refuse); MOD-17/MOD-18 and a config test widened; ADR 0048 amendment widened (D2, §3.3-§3.5, §3.7). |
| S2 | S | Fixed | One rule for every merge while #42 is open, with A's path if held (§8.7); C's deadline not called soft: the orchestrator weighs it. |
| C-B1 | B | Fixed | §8.4: six reviews, inputs per PR, records, skeptics, gate before the fix round. |
| C-B2 | B | Fixed by another means | CLAIM REQUEST drafted for the session to put in the status file (the fold may not edit it), with a 2026-11-02T17:00Z deadline and D10's fallback (§8.0); hook push and setup-script worktree commands in §8.1. |
| C-S1 | S | Fixed | §8.6 verify and describe phases; re-verify after a resolved base merge-in; in the merge checklist (§8.7). |
| C-S2 | S | Fixed | Drafts, `subscribe_pr_activity` (§8.3); unsubscribe, push runs, worktree clean-up and status update for A, B and C (§8.8). |
| C-S3 | S | Fixed | #86 named; C departs from item :182 openly on the trial evidence, with two conditions and a re-check before merging (§8.7), rather than waiting for #86. |
| C-S4 | S | Fixed | #42 in A's MOD-row list without making A wait; the ask-the-orchestrator rule covers A, B and C (§8.7). |
| C-S5 | S | Fixed | Every template section answered per PR, C's "CI and the GitHub settings" a yes (§8.3). |
| C-S6 | S | Fixed | Reviewer agents named per PR, with "Not run" reasons (§8.4 item 5). |
| C-S7 | S | Fixed | ADR 0070's rule applied to client-textract; the condition tested by `gate.golden.test.ts:311,:316`; `test:golden` on B's head a named step (§5.3). |
| C-S8 | S | Fixed | Batch 1 of 4 queue and A1′ table in §2 step 2 (skeptic's `gh api` numbers, 17:45Z; not re-run by the fold); where batches 2-4 go. |
| C-S9 | S | Fixed by another means | Recorded as an ADR 0012 amendment, not ADR 0066 Part 5 (ADR 0012 is the CDK record and no open PR touches it; #86 and C change ADR 0066), and without the context key B1 rejects; one test (`cli-settings.test.ts`); notices setting verified in the CLI; no matrix row, no COUNTER REQUEST (§4.3). |
| C-S10 | S | Fixed | Pre-#82 label; A's re-run (skeptic 17:46:59Z) and B's re-run by the fold (17:49:36-39Z, passed) recorded; `licenses:check`/`watched.ts` not stale (§5.5). |
| N1 | N | Fixed | `openTelemetry: { traces: false, propagation: false }`, both asserted; HTTP/fetch instrumentation in Revisit-when (§3.3, §3.7). |
| N2 | N | Fixed | Provenance workflow change verified (registry, 17:51:39Z) and recorded (§3.1, §8.3). |
| N3 | N | Fixed | 10 `@aws-sdk` ranges in 6 manifests, plus stripe: 11 in 7 (§5.1, §8.1). |
| N4 | N | Fixed | #86 in the merge order; #85 at 90ec40ab (header, §8.7). |
| N5 | N | Fixed | CI-12's manifest list from `pnpm-workspace.yaml` (§6.3 (g), §8.2). |
| N6 | N | Fixed | 3.1160.0 + stripe 23.0.1 window row; `pnpm update` range check (§7). |
| N7 | N | Fixed | C's worktree through the setup script (§8.1). |
| N8 | N | Fixed | As the proposal it asks for: P7 (§10), after #42. |
| C-N1 | N | Fixed | Rows for 0.133.0, 0.137.0, 1.1.0, 1.2.0, 1.3.0's rest and the guide's upgrade steps (§3.2). |
| C-N2 | N | Fixed | Three exception files `entries: []` (fold 17:48Z), audit exceptions added; the moved-tag warning marked not verified, for the builder (§2 steps 4-5). |
| C-N3 | N | Fixed | Trial merges redone on current heads at 17:49:07Z: A and C add no conflict (§8.7). |
| C-N4 | N | Fixed by another means | ORDER ASK (a) drafted for the status file (§8.0). |
| C-N5 | N | Fixed | Stripe webhook API version in the waiting list (§2) and status-file line 5 (§8.0). |
| C-N6 | N | Fixed by another means | ADR 0089 release and the corrections drafted as status-file lines 3-4 (§8.0). |
| C-N7 | N | Fixed | Runbook headings kept word for word (§6.5). |
| C-N8 | N | Fixed | Not-yet-run checks per PR listed for the builders (§8.2). |
| C-N9 | N | Fixed | Closing comment ends with the session's attribution footer (§8.8). |
| C-N10 | N | Not taken | Refuted: `tools/node_modules/yaml` is a working symlink in the read-only checkout (skeptic 17:45Z, fold 17:56Z); the failure was a fresh worktree's (P8). |

