# Scout: #87, the Anthropic SDK major (0.131.0 -> 1.3.0)

Scout-sdk, 2026-11-01 17:02-17:10 UTC. The base is `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56`, and every file:line below is at that commit. Downloads are in `scratchpad/design/tmp/scout-sdk/` (`pack-0.131.0/`, `pack-1.3.0/`, `guide/`), and the trial diff is `tmp/scout-sdk/trial.diff`. The trial tree has been removed. No tracked file changed in `/home/user/PhysicalTherapy` or in either item worktree.

**Correction to the item file (correction 4).** The build's own PR does not move `@opentelemetry/api`. With `pnpm install --lockfile-only` the lockfile keeps `@opentelemetry/api` at **1.9.1**, which is already in the lockfile and was published 2026-03-25. The SDK snapshot simply gains an edge to 1.9.1. Only the bot's lockfile (20c180a0, 87 lines) moved it to 1.10.0 across the next, pg-boss, drizzle-orm and vitest peers. So the all-7-Stryker-shards reason in correction 4 does not hold for the replacement PR: the "while `@opentelemetry/api` moves" condition in step 6 of the item file is false.

## 1. CHANGELOG 0.131.0 -> 1.3.0 (`pack-1.3.0/package/CHANGELOG.md` lines 1-290, read whole)

Publish times come from `npm view @anthropic-ai/sdk time` at 17:02Z. 1.0.0 was published 2026-10-21T16:00Z and 1.3.0 on 2026-10-23T23:31Z, so 1.3.0 passes the 3-day age now. It is the newest version.

**Breaking changes**
| Version | Change | Evidence |
|---|---|---|
| 1.0.0 | API version `2026-10-21`: the `anthropic-version` header goes from `2023-06-01` to `2026-10-21` | CHANGELOG L61-67; `pack-0.131.0/package/client.mjs:842`, `pack-1.3.0/package/client.mjs:972` |
| 1.0.0 | The API key is sent as `Authorization: Bearer`, no longer as `X-Api-Key`. `apiKeyAuth` changed, and auth headers are now built bearer first. | Not in the CHANGELOG. Seen in the client.mjs diff (1.3.0 ~L446-452) and in the guide L399-448 |
| 1.0.0 | A client holds one credential. Passing two of apiKey/authToken/credentials/config/profile throws a `TypeError`. A credential passed in code means the env and disk are not read. A warning is logged once if both env vars are set. | Not in the CHANGELOG. Seen in the client.mjs diff (CREDENTIAL_OPTIONS) and in the guide L450-476 |
| 1.0.0 | Text Completions removed (`client.completions`, `HUMAN_PROMPT`, `AI_PROMPT`). It was deprecated in 0.132.0. | client.mjs diff; guide L377-379; CHANGELOG L263 |
| 1.0.0 | `temperature`, `top_p` and `top_k` removed from `MessageCreateParamsBase` | `pack-1.3.0/.../resources/messages/messages.d.ts` (absent; 0.131.0 had them at L3657/L3759) |
| 1.0.0 | `MessageParam` becomes a union of User/Assistant/SystemMessageParam | 1.3.0 messages.d.ts:3633; guide L108-152 |
| 1.0.0 | `betas` removed from the non-beta Models methods; tool-runner `compactionControl` removed | guide L344-397 |
| 1.0.0 | **Licence MIT -> Apache-2.0** | `npm view` (0.137.0 MIT, 1.0.0 Apache-2.0); `pack-1.3.0/package/LICENSE`, `LICENSE-MIT` note; guide L619-625 |

**Behaviour changes**
| Version | Change |
|---|---|
| 0.134.0 | **Native OpenTelemetry tracing, on by default** (CHANGELOG L148-161). New runtime dependency `@opentelemetry/api ^1.4.1`: `npm view` shows 0.133.0 without it and 0.134.0 with it. |
| 0.134.0 | No redirects followed on token requests. `proxy-authorization` treated as a sensitive header (masked in the SDK's debug logging). Streaming tolerates unknown or early events. |
| 0.135.0 | `speed` parameter, and a `usage.speed` field in the response (1.3.0 messages.d.ts:4502). Streams dropped without being read are closed. |
| 0.136.0 | `x-amz-security-token` treated as a sensitive header. Unknown SSE event names are yielded. |
| 0.132.1 | Throws before sending a request with an empty path parameter |
| 1.3.0 | Query parameters hardcoded in endpoint paths are no longer sent. Long-request error text now links to the docs. |

**Unchanged:**
- The default `maxRetries` is 2 (1.3.0 client.mjs:168) and `DEFAULT_TIMEOUT` is 600000 (:1042). The gateway overrides both.
- `"type": "commonjs"`, `main`, `types` and all 52 `exports` keys are identical.
- There is no `engines` field in either version.
- The peer is `zod` (optional).
- `bin` is unchanged.
- `core/error.d.ts` is identical apart from its sourcemap comment.
- The `x-stainless-*` platform headers are sent by both versions.

## 2. Migration guide checked against the gateway

The guide was fetched with `curl` from `https://platform.claude.com/docs/en/api/migration-2026-10-21.md?sdk_languages=typescript` (HTTP 200, 2026-11-01T17:02:21Z, 625 lines) and saved as `tmp/scout-sdk/guide/migration-2026-10-21.md`. I read every TypeScript and general section.

| Guide item | Gateway | Verdict |
|---|---|---|
| A `document` block in an assistant message returns 400 (L45-49) | One user text block only (`anthropic.ts:61`, `messages.ts:24`) | No effect |
| `citations` on user text returns 400 (L51-55) | No citations are sent | No effect |
| `temperature`/`top_p`/`top_k` return 400 and are gone from the types (L57-67) | None is sent (`anthropic.ts:57-64`, `messages.ts:20-27`) | No effect. Sampling defaults are as before. |
| Admin/Analytics field renames, API-key `workspace_id` (L69-102) | Not used | No effect |
| `MessageParam` union (L108-152) | Literal `{ role: 'user', … }` in a `MessageCreateParamsNonStreaming` (`anthropic.ts:57-61`) | Typechecks (trial, below) |
| Tool-runner compaction, Text Completions, Models `betas` (L344-397) | Not used | No effect |
| `Authorization: Bearer` (L399-448) | No `baseURL` (`anthropic.ts:46`) | See the auth note below |
| One credential (L450-476) | `apiKey` only (`anthropic.ts:46`, from `config.ts:139`) | Safer than before (see the auth note below) |
| Licence Apache-2.0 (L619-625) | `licenses:check` passes | OK |

**Request shape under 2026-10-21.** The gateway sends `model`, `max_tokens`, a `system` string, one user text block, `output_config` (`effort` and `format: {type:'json_schema', schema}`) and `stream:false` (`anthropic.ts:57-64`). In 1.3.0 the types are unchanged for every one of these:
- `system?: string | Array<TextBlockParam>` (MessageCreateParamsBase L174);
- `OutputConfig.effort` is the same enum, `'low'|'medium'|'high'|'xhigh'|'max'|null` (0.131.0 messages.d.ts:2115, 1.3.0 :3665);
- `JSONOutputFormat` is `{schema, type:'json_schema'}` in both;
- `MessageCreateParamsNonStreaming` still exists (1.3.0 :5557).

The guide lists no change to `output_config`, effort or structured outputs.

**Response shape.** The guide lists no Messages response change.
- `StopReason` is byte-identical in both versions (0.131.0 :2337, 1.3.0 :3887).
- `Usage` gains `speed` (0.135.0). `messages.ts:29-33` reads `content[].type/text`, `usage.input_tokens/output_tokens` and `stop_reason` with zod, which ignores extra keys.
- The mapping `end_turn/stop_sequence/max_tokens/refusal` (`messages.ts:35`) is unaffected.

**Error classes** (`anthropic.ts:29-38`; `providers.test.ts:156-166`, 172-178, 181-185):
- `APIConnectionTimeoutError`, `RateLimitError`, `APIConnectionError`, `InternalServerError`, `APIError`, `APIUserAbortError` are unchanged.
- `APIError.generate(status, body, message, headers)` and every constructor signature are unchanged (`core/error.d.ts` identical; 1.3.0 L15, L17).
- The tests mock the client as `{ messages: { create } }` (`providers.test.ts:131-134`), so the SDK's request layer is not exercised there.
- `providers.test.ts:181-185` reads `client.maxRetries` and `client.timeout`, which still exist.

**Per-request options.** `{ signal, maxRetries: 0, timeout }` (`anthropic.ts:65`) are still `RequestOptions` fields. Typecheck passes.

**Auth header.** No `X-Api-Key` or `x-api-key` appears anywhere in the repository. I grepped apps, packages, infra, tools, docs, eval and .github, excluding node_modules, .git and cdk.out.
- There is no `baseURL` and no `ANTHROPIC_BASE_URL`.
- No proxy sits on the path. App egress is "HTTPS to the VPC endpoints, S3 and the NAT gateways" with no header inspection (`infra/lib/constructs/network.ts:149-154`).
- The only Anthropic env var is `ANTHROPIC_API_KEY`, read by `config.ts:116`.

The one-credential rule is an improvement here. Under 0.131.0 a stray `ANTHROPIC_AUTH_TOKEN` in the environment would have been sent as well (0.131.0 client.mjs ~L78-80, both read). Under 1.x the passed `apiKey` is the only credential.

**Other imports of `@anthropic-ai/sdk`:**
- `providers.test.ts:5` and `anthropic.ts:1` (the only runtime imports).
- Lint fixtures, which are strings only: `tools/brand-fonts/lint.test.ts:53,55` and `tools/test/eslint-rules.test.ts:27-52`.
- `tools/test/dependabot-config.test.ts:65` (group name).

None of these is affected.

**Bedrock path.** The Bedrock path builds its own body with `anthropic_version: 'bedrock-2023-05-31'` (`bedrock.ts:16,49`) through `@aws-sdk/client-bedrock-runtime`, and the SDK does not move it. After this PR the two real paths send different API versions (`2026-10-21` against `bedrock-2023-05-31`). For what the gateway sends and reads, the guide lists no difference.

The guide's Bedrock warning (L23-25: 2026-10-21 is only for Claude 4.7+ on Bedrock) applies to SDK-based Bedrock clients. It does not apply to `InvokeModel` with an explicit `anthropic_version`. Not verified against the Bedrock docs.

## 3. Tracing

Source: `pack-1.3.0/package/internal/tracing.mjs` (449 lines, read whole), `client.mjs`, `client.d.ts:156-176` and `lib/internal/tracing/api-call.mjs`.

**Defaults.** `resolveOpenTelemetryOptions` (tracing.mjs:59-74) settles `traces.enabled: true`, `propagation: true` and `contentMode: 'metadata_only'`.
- A client given no option reads the env vars once at construction (L76-88): `ANTHROPIC_OPEN_TELEMETRY`, `ANTHROPIC_OPEN_TELEMETRY_PROPAGATION`, `ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE` (`content` puts prompts and outputs in spans) and `ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`.
- A client given the option ignores the env entirely (L50-53; client.d.ts:162-169).
- **Content-mode risk:** the gateway passes no option today, so an environment variable alone could turn content capture on.

**With no tracer provider registered:**
- `getTracer` returns the global (no-op) provider's tracer (L96-102). `startApiCallSpan` drops a span that neither records nor propagates (L161-166).
- With no global propagator, `injectContext` (L424-428) writes nothing, so no span is kept and no header is added.
- Checked at run time: the default 1.3.0 client, given a fake fetch with nothing registered, sent only `accept, anthropic-version, authorization, content-type, user-agent, x-stainless-*` and no `traceparent` (script `tmp/scout-sdk/scripts/noprovider.mjs`, 17:09Z).

**With a provider or propagator registered** anywhere in the process (the `@opentelemetry/api` global is shared):
- Each `messages.create` makes a CLIENT span `anthropic.messages.create` with model, max_tokens, effort, output type, usage, server address and response-header ids (api-call.mjs).
- `traceparent`/`tracestate`/`baggage` are injected on every attempt (client.mjs ~L624, `if (span && propagation)`), after `prepareRequest`.

**`openTelemetry: false`** means `{ traces: false }`. `getTracer` returns `undefined`, so `request()` takes the untraced `makeRequest` path (client.mjs ~L579) with no `__span`, and injection happens only when a span exists. **It fully disables both spans and header propagation, whatever the env says.** Note that `propagation` still reads `true` in the settled object, but nothing is injected without a span. `withOptions()` keeps the setting (client.mjs ~L345).

**Repository state:**
- No OpenTelemetry registration exists in apps, packages, tools, infra or eval. The only hit is `apps/web/src/client-boundary.test.ts:199`, which names an `instrumentation.ts`, and no such file exists.
- `apps/web/next.config.*:22` has no instrumentation.
- PRD.md:254 (section 6) lists "traces" as a v0 observability requirement. A future tracer provider would therefore switch the SDK's spans and propagation on silently, unless the client pins tracing off.

**Rules that apply:**
- ADR 0048:150-152 says no logging of prompts and outputs and no model-observability service (PRD 14). PRD.md:583, in section 14 "AI gateway" (L558), says "never in a model-observability service".
- ADR 0048:153-154 has provider-side retries off.
- ADR 0048:25-47 covers both SDKs, tested with mocked clients.
- ADR 0070 governs the evaluation gate and floors and does not mention SDK telemetry. Its baseline key is provider, model and variant; neither the API version nor the SDK version is recorded (grep in packages/model-gateway and ADR 0070).

**Recommendation.**
1. Set `openTelemetry: false` in `anthropicClient` (`anthropic.ts:46`).
2. Add a provider test that pins it.
3. Add an ADR 0048 amendment. Its reasoning: tracing would be a second, unaudited record of each call outside `model_call`, the env could switch content capture on, and the SDK would send our trace ids to the provider. If traces are wanted later, a new decision would enable them in code with `metadata_only` and `propagation: false`. That is not this PR.

**How a test proves it.** Tried in the trial tree; it passes, and it fails when the flag is removed:
- (a) **Options.** Stub `ANTHROPIC_OPEN_TELEMETRY=true` and `…_CONTENT_MODE=content`, then assert `anthropicClient(...).openTelemetry.traces.enabled === false`, together with `maxRetries === 0`.
- (b) **A real request through a fake fetch.**
  - Register a recording `TracerProvider` and a `TextMapPropagator` that writes `traceparent`/`tracestate`, using `trace.setGlobalTracerProvider` and `propagation.setGlobalPropagator`.
  - Send through `(anthropicClient(...) as Anthropic).withOptions({ fetch })`.
  - Assert: zero spans started; no `traceparent`, `tracestate` or `baggage`; `anthropic-version: 2026-10-21`; `authorization: Bearer <synthetic key>`; no `x-api-key`.
  - In `afterEach`: `trace.disable()`, `propagation.disable()`, `vi.unstubAllEnvs()`.
- (c) **Control.** A `new Anthropic({ apiKey, maxRetries: 0 })` built the same way does start `anthropic.messages.create` and does send `traceparent`. This proves the harness bites.

Removing `openTelemetry: false` made (a) and (b) fail ("expected true to be false"; "expected ['anthropic.messages.create'] to deeply equal []").

The test needs `@opentelemetry/api` as a **devDependency** of `packages/model-gateway` (`^1.9.1`). The lockfile then gains only an importer entry resolving to the existing 1.9.1, so no new version is added.

## 4. Trial

The trial tree was `tmp/scout-sdk/tree` at 83d71fd6, and it has been removed.

| Step | Result |
|---|---|
| Range `^1.3.0`; `pnpm install --lockfile-only` (17:04:51-17:05:01Z) | 2 files changed, 7+/6-. Lockfile: `@anthropic-ai/sdk` 0.131.0 -> 1.3.0, sha512 `k7z9BlLL…`. The snapshot adds `'@opentelemetry/api': 1.9.1`. **Nothing else moves** (see the correction at the top). |
| `pnpm install --frozen-lockfile` | OK (3.3 s); 1.3.0 resolved |
| `pnpm --filter ./packages/model-gateway typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm exec vitest run --project unit packages/model-gateway` (17:05:41Z) | 24 files, **461 tests passed** |
| `pnpm test:golden` (17:06:06-30Z) | 5 files, **376 tests passed**, exit 0 (includes `gate.golden.test.ts`) |
| `BASE=origin/claude/build-platform pnpm toolchain:check` (17:06:38Z) | passed, 0 errors, 1 warning (pnpm 10.34.9 newer than packageManager; unrelated). Also: "lockfile adds 1 version(s) … each at least three days old", integrity and trust ok |
| `pnpm licenses:check` | 185 production packages, all allowed (Apache-2.0 included) |
| Tracing fix: `openTelemetry: false`, plus devDep `@opentelemetry/api ^1.9.1`, plus the 3-test trial file | tsc exit 0; providers dir 2 files, 37 tests passed; removing the flag fails 2 of them (section 3) |

All three age questions are fine:
- 1.3.0 was published 2026-10-23T23:31Z.
- `@opentelemetry/api` 1.9.1 was published 2026-03-25.
- 1.10.0 (the bot's choice) was published 2026-10-20T18:23Z.

## 5. ADRs and tests

**ADR 0048** needs one amendment. Besides tracing it should record:
- the Anthropic path now sends API version `2026-10-21` while Bedrock stays `bedrock-2023-05-31` (`bedrock.ts:16`), with no difference for the body the gateway sends or reads;
- the key goes as `Authorization: Bearer` and is the client's only credential;
- the SDK licence is Apache-2.0.

These are facts about the provider path that line 37-39 describes ("the SDK's retries off and its timeout at the gateway's"). Line 37-39 should gain "and its OpenTelemetry tracing off". Line 153-154's alternative ("Provider-side retries") is mirrored by a new alternative, "SDK tracing", with the reasons in section 3.

**ADR 0089** is not needed. No new decision is made: this is the same provider and the same request, and the tracing-off rule follows from 0048's existing references-only and no-observability rules.

**Tests.** MOD-17 and MOD-18 are in `docs/product/test-matrix.md` after MOD-14 (L233). In `packages/synth/src/cases/matrix.ts` they go after the MOD-13/14 entries (~L372), and in `registry.ts` as `none(10, '<reason>; no file.', ['packages/model-gateway/src/providers/providers.test.ts'])`, like MOD-05 (registry.ts:548). Module 9 is `MOD` (`expected/types.ts:9`). Neither row needs a synth fixture.
- **MOD-17**, "The Anthropic client as configuration builds it": SDK retries off (`maxRetries` 0), the gateway's timeout, and SDK tracing off (`openTelemetry.traces.enabled` false) even with `ANTHROPIC_OPEN_TELEMETRY*` set to on or content. This extends the existing test at `providers.test.ts:181-185`.
- **MOD-18**, "A request through the built client with an application tracer provider and propagator registered": no span is started, no `traceparent`/`tracestate`/`baggage` is sent, the API version sent is `2026-10-21`, and the key goes as `Authorization: Bearer` with no `X-Api-Key`. The control is a default-built client that does trace. This uses a fake `fetch` through `withOptions`, so there is no network.

## What the design must say
1. Take `@anthropic-ai/sdk` **1.3.0** (newest, older than 3 days) as `^1.3.0` in `packages/model-gateway/package.json`. Regenerate the lockfile with `pnpm install --lockfile-only`. **`@opentelemetry/api` stays 1.9.1**, which corrects correction 4. Only the SDK version is added, so the mutation-shard scope is that of an SDK-only change, not all 7 shards for `@opentelemetry/api`. The design should state which shards it runs.
2. `anthropicClient` becomes `new Anthropic({ apiKey, maxRetries: 0, timeout: timeoutMs, openTelemetry: false })`, with a doc comment naming ADR 0048. No other gateway code changes: typecheck, 461 unit tests and 376 golden tests pass on 1.3.0 unchanged.
3. Add `@opentelemetry/api: ^1.9.1` as a gateway **devDependency**. MOD-17 and MOD-18 go in `providers.test.ts` (the trial in `tmp/scout-sdk/trial.diff` is the template), with matrix and synth registry rows as `none(10, …)`, after #75/#84/#83/#85 per the merge order.
4. The ADR 0048 amendment covers: tracing off and why (references-only logging; PRD 14 / PRD.md:583's observability ban; the env-switchable content mode; trace ids sent to the provider; the latent switch-on once PRD.md:254's traces arrive); API version 2026-10-21 on the Anthropic path, against Bedrock's `bedrock-2023-05-31`; the Bearer header with one credential; Apache-2.0. No ADR 0089: release the reservation.
5. Record the checks that found nothing to change: no `X-Api-Key` reader, `baseURL` or header-inspecting proxy in the repo; no `temperature`/`top_p`/`top_k`, assistant documents or user citations sent; error classes and `APIError.generate` unchanged; `StopReason` unchanged; `usage.speed` ignored by `messages.ts`.
6. The local gate the build can run is `pnpm test:golden` plus the provider tests. Record that the first real-model record on the Anthropic path (people only) will be made on SDK 1.x and API version 2026-10-21.
7. Re-run `toolchain:check` and `licenses:check` on the PR head. Re-run `screening:capacity`/`watched.ts --write`, because `packages/model-gateway/package.json` and the lockfile are watched (not run by this scout).

## Notes and proposals (outside this PR)
- **P1.** ADR 0070's baseline key (provider, model, variant) records neither the API version nor the SDK major. Recording the `anthropic-version` sent beside each real-provider baseline entry would make an API-version change visible to the gate. This is for #75's owner, not this PR.
- **P2.** `messages.ts:35` maps `model_context_window_exceeded` and `pause_turn` to `other`. This is the same in both versions, and probably correct, but it is not asserted by name. That is a possible line in MOD-17's neighbour test. Not this PR.
- **P3.** The default SDK's `x-stainless-*` headers (OS, arch, runtime version) are sent by both versions. They are pre-existing, not PHI, and not changed here. Noted only.
- **Not verified:** whether any third-party package in `node_modules` registers a global OpenTelemetry provider or propagator at import. The repo's own code registers none, and `openTelemetry: false` makes the question moot for the SDK.
