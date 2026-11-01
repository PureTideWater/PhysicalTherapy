# Adversarial review: designs/lane-b-dependabot-batch.md (security and supply chain, and CI infrastructure)

Reviewer for item "dependabot-batch" (session_01FcouKRD17iBBR4HhnYcQQx), 2026-11-01 17:33-17:42Z. The design was read
whole (576 lines). Each claim was checked against 83d71fd6 / bce57f16 (`git ls-remote origin` 17:34:16Z: base still
bce57f16), the scouts' packs and clones under the scratchpad `design/tmp/`, `npm view` (17:36:10Z) and the registry's
attestations (17:38Z). I changed no tracked file and made no trial tree.

**Verdict: one blocking finding (B1), two should-fix (S1, S2), eight nits.** The SDK analysis holds: the tracing decision
does stop spans and header injection; every version, age and trust claim I re-checked holds; the routing fix is sound
under dependabot-core; MOD-17/18 and CI-12 collide with nothing open. B1 and S1 change PR B and PR A before the build.

## Blocking

### B1. D6's `cli-telemetry` context key breaks an existing infra test, goes against ADR 0012, and edits a #42 file
- **Claim (design D6, §4.3 lines 276-280, §8.2 B(2)-(3)):** put `"cli-telemetry": false` in `infra/cdk.json` `context`,
  with an infra test.
- **Evidence:**
  - `infra/test/deploy-parameters.test.ts:338-342` (83d71fd6), "the repository holds no deploy-time value / keeps
    cdk.json free of context", asserts `expect(cdk.context).toEqual({})`. D6 fails it at once.
  - ADR 0012:23-26 and its table at :127 keep `cdk.json` free of settings the tests' `new App()` would not see.
  - `infra/test/deploy-parameters.test.ts` is in #42's diff (`git diff --name-only <merge-base> review/pr42`, 17:35Z).
    Changing the test or its rule touches a #42 file, against LANES.md:84 ("leave alone every file PR 6b-4 changes").
  - The app also reads every context key (`infra/lib/app.ts:49`, `refuseHandTypedLaunch(Object.keys(app.node.getAllContext()))`).
    A committed context key reaches that path too.
  - The design's "builder confirms synth unchanged" would not have caught any of this. The infra unit project would.
- **What does work (checked in the installed CLI, `node_modules/.pnpm/aws-cdk@2.1145.0/node_modules/aws-cdk/lib/index.js`):**
  - :303030 turns telemetry off on `CDK_DISABLE_CLI_TELEMETRY` "true"/"1", context `cli-telemetry` false,
    `--no-version-reporting`, or `cli-telemetry --disable`.
  - :370158-370167 reads the top-level **setting** `notices` (`configuration.settings.get(["notices"])`) and drops
    notices when it is false. This settles the design's "the `notices` key is not verified in the CLI source": it is honoured.
    A top-level key is not context, so `deploy-parameters.test.ts` still passes with it.
- **Fix:**
  - Drop the context key.
  - Set the variable in the script that runs synth: `infra/package.json` `"synth": "CDK_DISABLE_CLI_TELEMETRY=true cdk
    synth --quiet --no-notices"`. `infra/package.json` is not a #42 file. `cdk-diff.ts:8` already does this for `cdk:diff`.
  - Optionally add top-level `"notices": false` in `cdk.json`.
  - Put the test in a **new** file (for example `infra/test/cli-settings.test.ts`), never in `deploy-parameters.test.ts`.
    It asserts the synth script's variable, `notices: false` if taken, and `context` still `{}`.
  - Keep D6's rejection of `versionReporting: false`. It is right: `--no-version-reporting` also strips `AWS::CDK::Metadata`.
  - What stays open: a person's `cdk deploy` (`docs/runbooks/deploy-and-rollback.md:13,112,207`, bare `cdk`) still sends
    telemetry. That runbook is a #42 file. Record it as a proposal after #42 merges: run the repository's CLI with the
    variable set.

## Should fix

### S1. The SDK's environment can still log prompts, or send the key and prompts to another host; D2's own reasoning covers both
- **Claim (D2, §3.3, §3.7):** "a client option wins over every env var; an env var does not protect against a forgotten
  one". The amendment says prompts and outputs must not leave the product's own records.
- **Evidence (1.3.0 pack):**
  - `client.mjs:158-162`: `ANTHROPIC_LOG` sets the level when no `logLevel` is given, and the logger is `console` (:157).
  - `client.mjs:821` calls `debugLogRequestDetails(... 'sending request', {options, ...})`.
  - `internal/utils/log.mjs:90-107` removes headers and masks auth, but keeps `options.body`: the prompt, which can hold
    contract terms and a letter's PHI.
  - So `ANTHROPIC_LOG=debug` in a task's environment writes every prompt to stdout and from there to the log group.
    ADR 0048:150-151 forbids this ("text in the log would hold contract terms and letters' PHI").
  - `client.mjs:102` defaults `baseURL` to `ANTHROPIC_BASE_URL`. A stray value sends the key and every prompt elsewhere,
    and egress is plain HTTPS (`network.ts:149-154`, as the design itself cites).
  - `client.mjs:176-185`: `ANTHROPIC_CUSTOM_HEADERS` adds request headers.
  - All three already exist in 0.131.0 (`client.mjs:110,117`; baseURL in its constructor), so this is not a regression.
    But `anthropicClient` is the function this PR changes and pins, and the design's safety argument is exactly this one.
    Nobody checked it (scout-sdk.md:80 checked only that the repository sets no base URL).
- **Fix (in scope, no new number):**
  - `new Anthropic({ apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 0, timeout: timeoutMs, logLevel: 'off',
    openTelemetry: false })`. `'off'` is a valid level (`log.mjs:4-5`), and `withOptions` keeps both (`client.mjs:335-349`).
  - MOD-17 additionally stubs `ANTHROPIC_LOG=debug` and `ANTHROPIC_BASE_URL=https://example.invalid`, then asserts
    `logLevel === 'off'` and `baseURL`.
  - MOD-18 asserts that the fetch URL's host is `api.anthropic.com` and that a spy `console.debug` saw nothing.
  - Widen both rows' wording and the ADR 0048 amendment ("tracing, logging and host held on the client, whatever the
    environment says").
  - Record `ANTHROPIC_CUSTOM_HEADERS` as the one remaining variable read: it cannot be switched off by an option and
    carries no content. Add a P-proposal for the Bedrock client's environment endpoint override, which `config.ts:137`
    `endpoint` already pins (not verified for every environment).

### S2. PR A also changes #42's files, but the design asks the orchestrator only before merging PR C
- **Claim (§8.5):** A merges "after #75 and #84". Only C asks the orchestrator while #42 waits.
- **Evidence:**
  - A changes `pnpm-lock.yaml`, and `tools/screening-capacity/watched-paths.txt` if regenerated. Both are in #42's diff
    (17:35Z).
  - LANES.md:84 says "every file PR 6b-4 changes".
  - The item file says: "While #42 waits for the founder's approval line, ask the orchestrator before merging anything."
  - Any base move means another base merge into #42, after the founder's line.
- **Fix:**
  - §8.5 A: "ask the orchestrator before merging while #42 is open, as for C; otherwise merge after #42 and regenerate
    the lockfile."
  - State plainly that B already waits for #42.
  - Say that Thursday's deadline for C is soft: if C is refused, the cost is one more mis-grouped bot PR to close. No
    merge depends on it.

## Nits

- **N1. Ask for `propagation: false` explicitly as well.**
  - `openTelemetry: false` resolves to `{traces:false}`, and `propagation` defaults to **true** (`internal/tracing.mjs:59-65`).
  - That is safe in 1.3.0: with no tracer there is no span (`client.mjs:579-581`), and injection needs one (`:624`).
  - Still, `client.openTelemetry.propagation` reads `true`, and a later SDK that propagates the ambient context would
    pass MOD-18, which has no active app span.
  - Use `openTelemetry: { traces: false, propagation: false }` and assert both fields in MOD-17.
  - Add to the amendment's "Revisit when": "or HTTP/fetch instrumentation is registered: it injects trace context into
    every outbound request, the provider's included, whatever the SDK says."
- **N2. Record the SDK's trust evidence the way §4.1 records CDK's.**
  - 0.131.0 and 1.3.0 both carry trusted-publisher SLSA provenance from `anthropics/anthropic-sdk-typescript` `main`.
  - From 1.0.0 the publishing workflow changed from `create-releases.yml` to `publish-npm.yml`, and `oidcConfigId`
    changed with it (npm attestations and `_npmUser`, 17:38Z).
  - This is no downgrade; toolchain:check passed (`tmp/scout-sdk/toolchain.log`). Add one line to §3.1 and the PR description.
- **N3. Counts.**
  - On the base, `@aws-sdk/*` has **10 ranges in 6 manifests**, plus stripe: 11 ranges in 7 manifests (`git grep` of
    `package.json`).
  - §5.1 runs the two together, and §8.1 B says "the seven `@aws-sdk` manifests". It is six.
- **N4. Open PRs.**
  - #86 (83167b8f, open) changes ADR 0066 at hunks 25, 35 and 963. PR C amends ADR 0066 Part 2 before `## Part 3`
    (bce57f16 :731). The edits are textually apart, but rule 6 applies: add #86 to §8.5.
  - #85's head is now 90ec40ab (the item had 29dded52).
  - MOD-15 to MOD-19 appear on no open head (#42, #75, #83, #84, #85, #86); CI-12 only as its row. No collision.
- **N5. The proposed CI-12 test hard-codes its manifest list.**
  - `dependabot-config.test.ts.proposed:102` reads root, `apps/*`, `packages/*`, `tools` and `infra`.
  - The workspace also has `tools/stryker/canary/lib` (`pnpm-workspace.yaml:7`; no dependencies today).
  - Derive the list from `pnpm-workspace.yaml` `packages`, so a new member cannot escape the "every direct dependency" claim.
- **N6. The §7 window table lacks a row.**
  - 11-01 18:53 (18:55:06 with client-sqs) to 19:58: `@aws-sdk` 3.1160.0 with stripe 23.0.1.
  - "pnpm's update command" for a transitive `@smithy/core` is not verified to leave ranges alone. Have toolchain:check
    and the lockfile diff decide, and never `pnpm update` a direct range by accident.
- **N7. PR C needs a worktree before any build.**
  - The new branch `co-001/dependabot-group-routing` needs `/home/user/dependabot-group-routing` (LANES.md rule 5), made
    by the setup script's worktree step after the branch is pushed through the hook.
  - §8.1 says only "pushed from origin/claude/build-platform through the hook".
- **N8. Note the CLI-library coupling where deploys happen.**
  - Library 2.275's assembly needs CLI 2.1146.1 or later (§4.1). The deploy runbook's bare `cdk` would then refuse with
    an older global CLI. That fails safe, with no stack change.
  - That runbook is a #42 file. Make it a proposal, with B1's telemetry line: "deploy with the repository's CLI".

## Checked and holding (no finding)
- **SDK tracing.**
  - `openTelemetry: false` gives no tracer (`tracing.mjs:96-100`) and the untraced request path (`client.mjs:579-581`).
  - No environment variable overrides a given option (`tracing.mjs:47-58,76`), and `withOptions` keeps the setting (`client.mjs:345`).
  - The scout's control test proves the harness bites (`tmp/scout-sdk/trial.diff`).
- **SDK 1.x against the gateway.**
  - API version, Bearer auth, one credential (`client.mjs:120-140`: `apiKey` from `config.ts:116` means no env/disk/profile read).
  - Sampling parameters are not sent. Bedrock stays on `bedrock-2023-05-31`, which matches the guide's Bedrock warning
    (guide L22-24).
  - No `engines`. `bin` is unchanged from 0.131.0, and there are no install scripts (`onlyBuiltDependencies: [esbuild]`).
- **Ages (npm view 17:36Z).** Every version and time in §3.1, §4.1 and §5.2 matches. Nothing newer is published than
  the design saw.
- **`@smithy/core` 3.38.x idle timeout.** No 3.1161.0 client we use offers one (no `idle`/`updateHttpClientConfig` in
  any `dist-cjs`), so Bedrock, presign and checksum requests are unchanged.
- **Routing.**
  - `exclude-patterns` is honoured (`dependency_group.rb:65-70,116-121`) and documented (options reference :326, :334, :374-376).
  - `security` (applies-to security-updates) is untouched. Excluding the groups' exact names also closes the file-order dependence.
  - Not verified: GitHub's own config validator on `exclude-patterns` without `patterns`. It is documented, and
    minor-and-patch keeps `update-types`.
- **Mutation.**
  - No mutation package's test set or closure names `@tp/model-gateway` (`vitest.mutation.config.ts`, `stryker/base.mjs`,
    `packages/{money,pricing,ledger,packets}/src`). A's `shards=[]` is credible.
  - #88 showed that an empty selection passes the required `mutation` check.
- **Screening-capacity.** `pnpm-lock.yaml`, `packages/*/package.json` and the gateway's `config.ts` are watched
  (`watched-paths.txt:9-23,364`), so both A and B run that required gate. §8.3 already runs it.
