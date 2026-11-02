# PR #90 (dependabot-batch, PR A: Anthropic SDK 1.3.0) review: CI and test infrastructure

Written 2026-11-01 at 21:12Z (`date -u`: Sun Nov 1 21:12:04 UTC 2026). It records the adversarial reviewer for CI and
test infrastructure across three rounds (18:31Z to 20:59Z) and the skeptics' verdicts (20:11Z to 21:03Z). This file is
not committed.

- **Pull request:** #90, `co-001/deps-anthropic-sdk-1`, replacing Dependabot #87 (`@anthropic-ai/sdk` 0.131.0 to
  `^1.3.0` in packages/model-gateway). Draft, 8 commits, 12 files, +307/-11.
- **Head:** `06f79c079e91e01c4f62616613a94b96ec1f6cd9` (committed 2026-11-01T18:22:19Z). `git ls-remote` at 21:10:22Z
  shows it unchanged.
- **Base:** `claude/build-platform` at `bce57f16`. The branch has since moved to `43565235`, because #83 merged at
  20:40:34Z. `pull_request_read get` at about 21:11Z shows `mergeable_state: behind`.
- **Lens:** CI and test infrastructure (design `designs/lane-b-dependabot-batch.md` §8.4 item 3):
  - the failing-first commit;
  - the isolation of the global OpenTelemetry state and the console spies;
  - `affected.ts` selecting no shard;
  - the golden gate;
  - `watched-paths.txt`, the synth and matrix entries.

  Rounds 2 and 3 added the areas the completeness critic named: the agent rows, the failure mapping, D2's claim, build
  output, the audit, the Status line, trial merges, provenance, the base move, the operator docs and the platform
  headers.

How the review was done:
- **Clones.** Each round worked in its own fresh blobless clone under `review-A/` (`clone-ci`, `clone-ci-r2`,
  `clone-ci-r3`), installed with `pnpm install --frozen-lockfile`. Every heavy command ran under
  `flock /tmp/laneb-heavy.lock`. All clones, worktrees and the scratch bare remote are removed; each tree was clean at
  06f79c07 before removal (r1 at 20:09:10Z).
- **GitHub, read only.** `pull_request_read` (get, get_check_runs) and job logs saved to
  `review-A/tmp/ci-logs-r1-1793563078` and `tmp/ci-logs-r2-*`. Nothing was pushed, commented, reviewed, approved or
  merged.
- **Writer's spot check (21:10Z to 21:12Z).** Every line cited below was re-read in a fresh blobless clone
  (`review-A/clone-writer`, checked out at 06f79c07 at 21:10:17Z, removed afterwards), and every one matched:
  - `anthropic-client.test.ts:19-25, 84-96, 117-133, 136-168`;
  - `config.ts:20, 116-118`; `anthropic.ts:6-12, 50-60, 75`;
  - `package.json:16, 28`; `dependabot.yml:54-55`;
  - ADR 0048 `:3, 183-216`; `test-matrix.md:234-245`; `matrix.ts:384-388`; `MOD-17/expected.json:5`;
  - `path.ts:35-38, 80-98, 129-131`; `model-evaluation.md:51`; `README.md:452`.
- **Paths.** `review-A` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-A`. Commit hashes
  are shortened to 8 hex; any other 64-hex digest to 8 hex and an ellipsis. All data is synthetic.

## Verdict

**0 B, 2 S, 10 N.** Nothing blocks the merge. Both S findings are cheap to fix inside PR A's files or its description.
- **S1.** MOD-18's main test depends on the runner's environment, so a developer with `ANTHROPIC_CUSTOM_HEADERS` set
  gets a red test that blames the client.
- **S2.** D2's "fails closed at startup" is false for the web app. The refusal fails closed at the first model request.

The ten N findings are records and descriptions, plus one test gap (N7: the failure mapping is never driven through
the real 1.3.0 client).

Several findings were also raised by the security and supply-chain lens
(`lane-b-dependabot-batch-A-review-security-supply.md`); each is cross-referenced below. Where the two lenses rated the
same issue differently, the fix round should take the higher rating:
- D2 (here S2, there N5);
- the merge order (here N8, there S3).

## Findings

### S1 (ci-infra-r1-S1). MOD-18's main test fails whenever the runner's environment sets `ANTHROPIC_CUSTOM_HEADERS`, and the failure blames the client

**Where:** `packages/model-gateway/src/providers/anthropic-client.test.ts:92-96` (`stubEnvironment`), assertion at
`:150`.

**Scenario:** A developer's shell or a coding-agent session runs `pnpm test` with
`ANTHROPIC_CUSTOM_HEADERS='x-synthetic-extra: 1'` in its environment. This sandbox already carries `ANTHROPIC_BASE_URL`,
so ambient `ANTHROPIC_*` variables are real.
1. The MOD-18 test sends through `anthropicClient()` directly (`:141`), so `readGatewayConfig`'s refusal
   (`config.ts:116-117`) never runs.
2. SDK 1.3.0 reads the variable when it builds the client (`client.mjs:176-185`).
3. The request therefore carries `x-synthetic-extra`, and the exact header-set assertion at `:150` fails.

The failure reads as a client defect, although configuration refuses the variable wherever a provider is built
(`path.ts:82`, `permitted-cli.ts:36`, `eval/cli.ts:165`). CI's environment has no `ANTHROPIC_*` variable (`grep -rn ANTHROPIC .github/` returned nothing), so CI stays green.

**Evidence:**
- **Reproduced.** At 06f79c07 the command was
  `ANTHROPIC_CUSTOM_HEADERS='x-synthetic-extra: 1' pnpm exec vitest run --project unit packages/model-gateway/src/providers/anthropic-client.test.ts`.
  - 18:33:55Z, 20:01:20Z to 20:02:10Z, and the skeptic at 20:12:16Z: `Tests 1 failed | 3 passed (4)`, exit 1. The
    failure is at `:150:40` with diff `+ "x-synthetic-extra"`.
  - With the variable unset (20:12:18Z): 4 passed.
- **No other ambient variable changes the headers.**
  - The only header-affecting environment read in the SDK's client is `ANTHROPIC_CUSTOM_HEADERS`.
  - With `apiKey` passed, the client never reads `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` or the profile chain
    (`client.mjs:127-136`).
- **Precedent.** The repo already blanks ambient variables in tests: `infra/test/deploy-parameters.test.ts:324`,
  `vi.stubEnv('CDK_DEFAULT_ACCOUNT', '')`.

**Fix:** At the end of `stubEnvironment()` add `vi.stubEnv('ANTHROPIC_CUSTOM_HEADERS', '');`, with a comment that
configuration refuses the variable (config.test.ts) and the test must not depend on the runner's environment.
- The SDK's `readEnv` (`internal/utils/env.mjs`) trims an empty value to undefined.
- The control still re-stubs the variable after `stubEnvironment()` (`:157-158`), so it still proves the SDK honours
  it.
- Tried in a scratch copy:
  - 20:08:18Z, with the variable set: 1 file, 4 passed.
  - Skeptic, 20:12:43Z, with the variable plus synthetic `ANTHROPIC_API_KEY`, `_AUTH_TOKEN`, `_PROFILE`,
    `_WEBHOOK_SIGNING_KEY` and `_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`: 4 passed.
  - With config.test.ts (20:12:45Z): 2 files, 19 passed.
  - eslint exited 0. Reverted; the tree was clean.

**Skeptic:** Real; could not refute (fresh clone, removed 20:13:07Z). Severity S is fair: CI stays green, but local runs
give a misleading failure.
- Putting the blank in `ENVIRONMENT` would be worse, because that constant means what the environment asks of the SDK.
- `vi.stubEnv(name, undefined)` would also work, but `''` matches the repo's pattern.
- The fix stands as written.
- Not verified: how the coding-agent tool itself handles the variable.

### S2 (ci-infra-r2-S1). D2 says the `ANTHROPIC_CUSTOM_HEADERS` refusal "fails closed at startup", which is false for the web app, the only long-running process that makes model calls

Also raised by security-supply as SEC2-N1 (N5 there).

**Where:**
- PR #90 description, Decisions table, row D2;
- `/home/user/ops/designs/lane-b-dependabot-batch.md:36`;
- the code at 06f79c07: `apps/web/src/lib/models/path.ts:93-97` and `:129-131`, and
  `apps/worker/src/models/permitted-cli.ts:36`.

**Scenario:** An operator sets `ANTHROPIC_CUSTOM_HEADERS` on the web task with `MODEL_PROVIDER=anthropic` and deploys.
1. The deploy goes green and the health check passes, because nothing reads the gateway configuration at boot:
   - the Dockerfile's CMD is `node apps/web/server.js`;
   - there is no instrumentation file;
   - `start-standalone.sh` only execs `server.js`;
   - `/api/health` checks only the database (`route.ts:5`).
2. On the first model request, `modelPathOf` caches `configured ??= modelPathFromEnv(...)` for the life of the process
   (`path.ts:130`).
3. The `GatewayConfigError` is caught (`:94-96`). One warning says the path is "not configured"
   (`MODEL_PATH_UNAVAILABLE`), and every model feature turns off while the process keeps serving.

Only the command-line runs refuse at start: the permitted CLI exits 2 (`permitted-cli.ts:36`, `:62-68`), and
`eval/cli.ts:165` throws. The worker's main bundle never reads the gateway configuration: its `main.js` sourcemap has no
`config.ts` and no SDK source.

**Evidence:**
- **Probe**, a vitest file placed in `apps/web/src/lib/models` and removed afterwards, run at 20:33:41Z (reviewer) and
  20:40:23Z to 20:40:37Z (skeptic).
  - Input: `modelPathFromEnv({MODEL_PROVIDER:'anthropic', ANTHROPIC_API_KEY:'sk-synthetic-not-a-key',
    ANTHROPIC_CUSTOM_HEADERS:'x-synthetic: 1'}, logger)`.
  - It returned `{"kind":"unavailable","reason":"ANTHROPIC_CUSTOM_HEADERS is refused: ..."}`.
  - It logged exactly one `warn('model features are off: the model path is not configured', {error_code:
    'MODEL_PATH_UNAVAILABLE'})` and did not throw (1 passed).
- **Callers.** `readGatewayConfig` is called only at `path.ts:82`, `permitted-cli.ts:36` and `eval/cli.ts:165`.
  `modelPathOf` is called only at request time (`console-models.ts:113`, `gatewayFor` `:140`, `modelFeatures` `:165`, and
  the narrative, evidence and contract-proposal modules).
- **No test.** No test exercises `modelPathFromEnv` (`git grep` over `*.test.ts`).
- **ADR wording.** ADR 0048's amendment says only "configuration refuses" (`:199-200`), which is accurate.

**Fix (the skeptic's corrected fix):** Reword D2's last clause in the PR description and in design `:36`:

> The one variable no option overrides is refused by configuration and fails closed. The web turns every model feature
> off when it first reads the model path, at its first model request. It logs MODEL_PATH_UNAVAILABLE once, shows the
> refusal as the reason on /console/models and keeps serving with hand entry. The evaluate-permitted task exits 2 and the
> evaluation CLI (eval/cli.ts --provider configured) throws, both before any call.

Keep ADR 0048's wording. Do not make the web exit at boot: `path.ts:35-38` makes the product never depend on a model.

**Skeptic:** Real; could not refute. "Fails closed" is accurate: features turn off, and the reason shows on
`/console/models` (`page.tsx:48`). Only "at startup" is false. This is intended behaviour, so the fix is the text, not
the code.
- Mitigating, not refuting: the deployed task sets `MODEL_PROVIDER` `bedrock` (`infra/lib/constructs/compute.ts:195`),
  so the scenario needs that changed too.
- The original fix left out the evaluation CLI; the corrected fix above includes it.

### N1 (ci-infra-r1-N2). The description defers the checker's N2 without saying where it is tracked

**Where:** PR #90 description, "Reviewer agents' findings" row 2; `.github/pull_request_template.md:46`.

**Scenario:** The template's line 46 says a deferred finding names "where it is tracked". Row 2 says only "Deferred:
outside this pull request's files; proposed for a later pull request (a separate code such as `MODEL_PATH_REFUSED`)".
Once #90 merges, the deferral can be lost.

**Evidence:**
- Template line 46: "fixed (with the commit), not a defect (with why), or deferred (with where it is tracked)".
- `grep -rln MODEL_PATH_REFUSED /home/user/ops` at 20:06Z found nothing.
- Design §10 lists P1 to P8, and none of them is this item.
- The PR body was re-read at about 21:11Z; row 2 is unchanged.

**Fix:** Record the proposal first, as design §10 P9, in the item's status file, or as an issue. Then name that place in
the row, for example "Deferred: design lane-b-dependabot-batch §10 P9". Pair it with proposal P5 below.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N2 (ci-infra-r1-N3). MOD-17's matrix row leaves out the webhook key that MOD-17's own test asserts

**Where:** `docs/product/test-matrix.md:234`; `packages/synth/src/cases/matrix.ts:384-388`;
`fixtures/synthetic/MOD-17/expected.json:5`.

**Scenario:** MOD-17's second test, "leaves the webhook signing key in the environment unread"
(`anthropic-client.test.ts:130-133`), asserts `webhookKey` is null with `ANTHROPIC_WEBHOOK_SIGNING_KEY` set.
- The row's assertion names retries, timeout, tracing, propagation, logging, host and the custom-headers refusal, but
  not the webhook key.
- So someone deleting `webhookKey: null` or that test would find no row naming it.
- The PR description and ADR 0048 (`:199`) both name it.

**Evidence:**
- `test-matrix.md:234` has no "webhook".
- `anthropic-client.test.ts:131-132` stubs the variable and expects null.
- The checker's mutant table, reproduced in r3 at 20:53Z to 20:56Z, shows the `webhookKey` mutant is caught only by this
  test.

**Fix:** Add "no webhook key, whatever `ANTHROPIC_WEBHOOK_SIGNING_KEY` says" to MOD-17's assertion, identically in
`test-matrix.md` and `matrix.ts`. Then run `pnpm synth --all`, which rewrites `MOD-17/expected.json`; `fixtures.test.ts`
holds the three equal. Do this together with the MOD-17 text that security-supply S1 adds, in one synth run.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N3 (ci-infra-r1-N4). The test matrix gives no reason for the jump from MOD-14 to MOD-17

**Where:** `docs/product/test-matrix.md:237-245`.

**Scenario:** If #90 merges before the redact-ssn-phone pull request, the MOD table runs MOD-14 then MOD-17 with no
explanation. The same prose records MOD-12's reservation (`:238-239`), so a reader or a later ID allocator expects one
for MOD-15 and MOD-16 too.

**Evidence:**
- `test-matrix.md:238-239` records MOD-12's reservation.
- LANES.md:200 (the redact-ssn-phone claim row) reads "MOD-15 to MOD-16 (kept)".
- Design §3.5 says "MOD-15 and MOD-16 belong to redact-ssn-phone".
- No branch of that name exists (`git ls-remote`, security-supply r3 skeptic, about 21:00Z).

**Fix:** Extend the note at `:244-245` with "MOD-15 and MOD-16 are reserved for the redact-ssn-phone pull request, which
adds them." Whichever pull request merges second drops or keeps the sentence under LANES.md rule 6.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N4 (ci-infra-r2-N1). ADR 0048's Status line does not record the amendment

Also raised by security-supply as SEC2-N2 (N6 there).

**Where:** ADR 0048 (`docs/adr/0048-call-models-only-through-the-gateway-…-feature-flags.md`) `:3`, with the amendment
at `:183-216`. Compare ADR 0054 `:3-6` and ADR 0037 `:3`.

**Scenario:** A reader of ADR 0048's header cannot tell that it was amended on 2026-11-01 under
`co-001/deps-anthropic-sdk-1`, nor that SDK 1.x and the environment-read closure now apply. Design §3.7 (`:275`) asks
for the amendment "in the form of ADR 0054's amendments", and that form records each amendment in the Status line.

**Evidence:**
- ADR 0048 `:3` at 06f79c07 reads "accepted for the build; the model path is provisional until counsel's read of both
  agreements (PRD 20)", unchanged from the base.
- Survey of docs/adr at 20:30Z: of 15 ADRs with a `## Amendment` heading, 12 record it in Status. Only 0048, 0058 and
  0064 do not.
- No tool checks Status lines, so CI cannot catch this.

**Fix:** Append to `:3`, wrapped at 120 columns. Use one wording for both lenses; security-supply N6 has the longer
form. The short form:

> ; amended 2026-11-01 (`co-001/deps-anthropic-sdk-1`): SDK 1.x on the Anthropic path, nothing taken from the
> environment ("Amendment (`co-001/deps-anthropic-sdk-1`, 2026-11-01)", below)

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N5 (ci-infra-r2-N2). The provenance claim dates the publishing-workflow change to 1.0.0; it changed at 0.132.1

Also raised by security-supply as SEC2-N3 (N7 there).

**Where:** PR #90 description, "What was read", the Provenance bullet; design `:122-126` (§3.1, the Trust paragraph).

**Scenario:** The record says the SDK's trusted publisher moved to `publish-npm.yml` "from 1.0.0". A later reviewer
comparing provenance across versions would look for the change at the wrong release.

**Evidence:** npm attestations were fetched at 20:29:32Z to 20:29:59Z into `review-A/tmp/attest-r2-*`, and their SLSA
predicates were decoded with `scripts-ci-r2/prov.py`.
- 0.131.0 and 0.132.0 come from `.github/workflows/create-releases.yml`.
- 0.132.1 (published 2026-10-08T03:20:39Z) and every release after it, through 1.3.0, come from `publish-npm.yml`.
- Every version is `anthropics/anthropic-sdk-typescript` at `refs/heads/main`.

The substance holds: same repository and branch, provenance throughout, no downgrade.

**Fix:**

> 0.131.0 (create-releases.yml) and 1.3.0 (publish-npm.yml) both carry trusted-publisher SLSA provenance from
> anthropics/anthropic-sdk-typescript refs/heads/main. The publishing workflow moved to publish-npm.yml at 0.132.1
> (2026-10-08), and every release since has used it, 1.0.0 included.

Make the same change at design `:122-126`.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N6 (ci-infra-r2-N3). The description leaves the "1 moderate alert" unidentified, though the audit identifies it and it is not this pull request's

Also raised by security-supply as SEC2-N4 (N8 there).

**Where:** PR #90 description, "What waits on a person", first bullet; `.github/workflows/ci.yml:80`
(`pnpm audit --audit-level=high`).

**Scenario:** The founder reads that an unidentified moderate alert waits on a person. They cannot tell whether this SDK
pull request clears it, causes it or leaves it.

**Evidence:**
- **CI static job** on 06f79c07 (`tmp/ci-logs-r2-1793564819/static.log:415-441`):
  - `pnpm audit --prod` printed "No known vulnerabilities found" (18:28:58Z);
  - `pnpm audit --audit-level=high` printed "1 vulnerabilities found / Severity: 1 moderate" (18:28:59Z).
- **Local `pnpm audit --json`** at 06f79c07 (20:27:17Z) found only GHSA-g3hv-75wg-m249: minimatch 10.2.6 via
  `.>@stryker-mutator/core`, development only. The same entries are in the base lockfile.
- **npm's bulk advisory endpoint** (20:27:37Z) has nothing for the SDK 0.131.0, 1.0.0 or 1.3.0, `@opentelemetry/api`
  1.9.1 or 1.10.0, json-schema-to-ts 3.1.1, or standardwebhooks 1.0.0 or 1.1.1.
- **No exceptions.** `audit-exceptions.json` has `"entries": []`.
- **Not verified:** that the GitHub alert is the same advisory. `dependabot/alerts` answered 403 at 20:34:40Z.

**Fix:** In "What waits on a person", add:

> pnpm audit's only finding at the base and the head is GHSA-g3hv-75wg-m249 (minimatch 10.2.6 via @stryker-mutator/core,
> dev tooling, moderate). No advisory names @anthropic-ai/sdk or @opentelemetry/api. This pull request neither clears
> nor adds it. The Dependabot alert is most likely the same, which the founder confirms on the alerts page.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N7 (ci-infra-r2-N4). The failure mapping behind the gateway's one retry is tested only with hand-built SDK errors, never with errors the 1.3.0 client throws

Also raised by security-supply as SEC2-N5 (N9 there).

**Where:** `packages/model-gateway/src/providers/providers.test.ts:156-179`, where every error is built with
`APIError.generate` or a constructor; `anthropic.ts:25-42`; the fix belongs in `anthropic-client.test.ts`.

**Scenario:** A later SDK minor, taken under `^1.3.0` by the `anthropic-sdk` group, changes how the client surfaces a
failure. Two examples:
- a 529 gets its own class;
- a fetch rejection is wrapped differently on the middleware path (`client.mjs:654-694`).

A 429, 529 or connection failure would then map to `rejected`, and the gateway would stop retrying failures it can cure.
Every unit test would still pass, because no test puts a response through the real client.

**Evidence:** The mapping holds today. Probe at 20:25:40Z: `scripts-ci-r2/zz-r2-failure-probe.test.ts`, removed
afterwards; log `progress/ci-r2-probe.log`, 17/17 passed. It used the real `anthropicClient(KEY, timeout)` behind
`AnthropicProvider`, with `vi.stubGlobal('fetch')` set before construction.

| Input | Mapped to |
| --- | --- |
| 429 (also with `retry-after` and `x-should-retry: true`) | `throttled` |
| 529, 500, a non-JSON 503 | `unavailable` |
| 408, 409, 400, 401 | `rejected` |
| a rejected fetch (TypeError, ECONNRESET cause) | `unavailable` |
| a connect-timeout cause; the SDK's own 50 ms timeout (52 ms, one fetch) | `timeout` |
| the gateway's abort, before the fetch (zero fetches), mid-request or during the body | `timeout` |
| a 200 with a non-JSON body | `rejected` |

Each made exactly one fetch. Every `ProviderFailure` message is only "the model provider failed: <code>".

**Fix:** Add a describe block to `anthropic-client.test.ts`, "the failures the client throws, as the gateway reads them":
- stub the global fetch before `built()`, and add `vi.unstubAllGlobals()` to `afterEach`;
- cover 429 to `throttled`; 529 and 500 to `unavailable`; 401 to `rejected`; a rejected fetch to `unavailable`; the SDK
  timeout (a short timeout) to `timeout`; the gateway's abort to `timeout`;
- assert exactly one fetch per case;
- name it in MOD-17's note or the provider row, in `test-matrix.md` and `matrix.ts`.

The same `stubGlobal` change serves security-supply N4 (send through the client `anthropicClient` returns).

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N8 (ci-infra-r3-N1). The description's "Merge order" predates the 20:36 UTC standing rule

Also raised by security-supply as SEC3-S1 (S3 there, confirmed S). Fix it at S, with the corrected text recorded there.

**Where:** PR #90 description, `### Merge order`. The rule is at `lane-b-dependabot-batch-status.md:25-31`.

**Scenario:** A merger reads the section as written. It has three problems:
- It orders A after #75 and #84 and says to "ask Lane B's orchestrator before merging". The 20:36 rule says instead that
  A merges when ready, and that order applies only between conflicting pull requests.
- It lists #83 as one that may merge first; #83 merged at 20:40:34Z.
- It calls PR B "the CDK and AWS SDK one", although B is open as #94.

**Evidence:**
- The body (re-read about 21:11Z) cites only the 18:00 ruling.
- `git ls-remote` at 20:46:40Z: base `43565235`.
- Trial merge of A into `43565235` (`4412b2e6`, 20:47:37Z): no conflict; `--lockfile-only` no diff; synth 267 cases,
  0 written / 659 unchanged, tree clean; synth unit 13/185; gateway unit 25/466; golden 5/376; `watched.ts --write`
  no diff.
- `git merge-tree 06f79c07` with #94 (`484e9f06`, 20:52:55Z) conflicts only in `packages/model-gateway/package.json`,
  on the adjacent SDK and client-bedrock-runtime lines.
- On A + base + #94, resolved (`c17c3557`, 20:54Z to 20:56Z):
  - `--lockfile-only` showed no diff;
  - synth clean; gateway unit 25/466; golden 5/376; gateway `tsc` exit 0;
  - `affected.ts` selected B's 6 shards (`progress/ci-r3-trial-b94.log`).

**Fix:** Replace the section with security-supply S3's corrected text, which supersedes this lens's draft. That draft
pinned other pull requests' heads, and those heads have moved: #93 is now `87691be4`.

**Skeptic:** Confirmed (through SEC3-S1's skeptic, about 21:00Z to 21:03Z). This lens's rating stays N.

### N9 (ci-infra-r3-N2). The configuration comment and the operator docs still say the Anthropic path needs only `ANTHROPIC_API_KEY`

Also raised by security-supply as SEC3-S2 (N1 there, which its skeptic rerated from S to N).

**Where:** `packages/model-gateway/src/config.ts:20`. Outside the PR's files: `docs/runbooks/model-evaluation.md:51` and
`README.md:452`.

**Scenario:** A person runs the people-only evaluation from a shell set up for a proxy or a coding agent:
`MODEL_PROVIDER=anthropic pnpm --filter @tp/model-gateway eval --provider configured`.
- If `ANTHROPIC_CUSTOM_HEADERS` is set, the run dies with an uncaught `GatewayConfigError` and a Node stack. Its exit
  code is 1, the same code as "gate: FAILED" (`eval/cli.ts:199`).
- If `ANTHROPIC_BASE_URL` is set, there is no message: the run goes straight to `api.anthropic.com`, past the proxy
  the person relies on.

None of the three documents they would read says either.

**Evidence:**
- 20:51:03Z, on the merged tree: `env MODEL_PROVIDER=anthropic ANTHROPIC_API_KEY=sk-synthetic-not-a-key
  ANTHROPIC_CUSTOM_HEADERS='x-synthetic-extra: 1' pnpm --filter @tp/model-gateway eval --provider configured --only
  narratives`. It gave exit 1 with the `GatewayConfigError`, thrown at `config.ts:117` via `eval/cli.ts:165`
  (`progress/ci-r3-evalcli.log`).
- The `ANTHROPIC_BASE_URL` case was not run, to avoid a real call. It follows from the fixed `baseURL`
  (`anthropic.ts:53`), which MOD-17 asserts.
- `config.ts:20` reads " * - anthropic: ANTHROPIC_API_KEY, from the environment's secret."
- A grep of docs/ and README.md for these variables finds only `test-matrix.md:234` and ADR 0048.

**Fix:** Use security-supply N1's corrected fix, which is one fix for both lenses:
- reword `config.ts:20` without listing every ignored variable;
- give the remedy in the `config.ts:117` message ("unset it");
- add one sentence each at `model-evaluation.md:51` and `README.md:452`.

The CLI's uncaught output is left alone here (proposal P11).

**Skeptic:** Confirmed as a nit. Not verified by a skeptic for this lens. The security-supply skeptic checked the same
facts at 21:00Z to 21:02Z.

### N10 (ci-infra-r3-N3). ADR 0048's "nothing taken from the environment" does not record the SDK's platform headers, which the request carries

Also raised by security-supply as SEC3-N2 (N11 there).

**Where:** ADR 0048 `:196` (the bullet "Nothing else is taken from the environment") and `:214` ("Revisit when");
`anthropic-client.test.ts:27-30`.

**Scenario:** The founder reads the amendment's title and "only the gateway's header set". They conclude that the
request carries nothing about the host. In fact every call sends:
- `x-stainless-os` Linux, `-arch` x64, `-runtime` node, `-runtime-version` v24.22.0, `-package-version` 1.3.0, `-lang`
  js;
- `user-agent` `Anthropic/JS 1.3.0`.

Design §10 P3 only "noted" these; no review weighed them.

**Evidence:**
- Header probe at 20:56:17Z on SDK 1.3.0 with the gateway's options (`progress/ci-r3-header-probe.json`) gave exactly
  those values.
- With `defaultHeaders` set to null for the six, all six are removed (`client.mjs:961-977`, `buildHeaders` honours
  null).
- Keeping them is right:
  - they are process facts, not environment variables that steer the SDK;
  - they go over TLS only to the vendor under the agreement;
  - the Bedrock path's AWS user agent carries the same and more (`@aws-sdk/core` 3.978.3
    `dist-cjs/submodules/client/index.js:743`, `:763-775`).
- The test comment at `:28-30` is the only place that names them.

**Fix:** Add one sentence to the bullet at `:196`, using security-supply N11's list, which also names `-retry-count` and
`-timeout`:

> The SDK still sends its platform headers (X-Stainless-OS, -Arch, -Runtime, -Runtime-Version, -Package-Version, -Lang,
> -Retry-Count, -Timeout and its User-Agent), read from the process rather than its environment variables. They carry no
> practice material, and the Bedrock path's AWS user agent carries the same and more, so they are kept. MOD-18 pins
> their names, so a new one fails it.

Add "or a new platform header" to "Revisit when" at `:214`.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. What the skeptics corrected:
- **S1.** The fix stands as written.
- **S2.** The fix gained the evaluation CLI; the code is not to change.
- **N8.** The fix is replaced by security-supply S3's corrected text: no pinned heads of other pull requests, claims
  limited to the runs actually made, and #85, #86 and #91 named.
- **N9.** The fix is replaced by security-supply N1's corrected fix, which does not list every ignored variable in
  `config.ts`.

## What I checked and found sound

### CI on the head

Read through `get_check_runs` and the job logs. There are 22 runs; all succeeded, except `notify` (skipped after the
gate passed) and the stryker matrix (skipped by design). R3 re-read them at about 20:46Z: unchanged.

The four required checks:
- **`all green`:** success, 18:37:50Z.
- **`mutation`:** success. Its job logs `CHANGES=success STRYKER=skipped ANY=false SHARDS=[]` and "No money path changed:
  no mutation run". The changes job ran `affected.ts` at 18:29:17Z: money, pricing, ledger and packets "not affected".
- **`screening-capacity gate`:** success. The watched paths matched (gateway package.json, config.ts,
  providers/anthropic.ts, synth matrix.ts and registry.ts, pnpm-lock.yaml). The capacity job measured S1 to S5, ran S4
  three times and gave "verdict: pass (time advisory)".
- **`approval-of-record`:** two runs, both success, each "needs no review of record".

The other jobs:
- **`build`:** `cdk:diff` synthesized every stack, with the expected no-credentials warning. Infra is untouched.
- **`static`:**
  - `pnpm synth --all`: 263 cases, 0 written, 655 unchanged.
  - `test:golden`: 5 files (`gate.golden.test.ts` 52 tests).
  - `lint:logs`: 1,086 files.
  - check-toolchain: 0 errors, 1 warning (pnpm 10.34.9).
  - `verify-content`: pass.
- **`lint`:** 1,677 files, 0 errors.
- **`unit`:** `anthropic-client.test.ts` ran in project `unit` (4 tests), and `config.test.ts` (15). Totals: 405 files,
  6,898 passed, 1 skipped.
- **`release-dry-run`:** correctly not run; its path filter names no changed file.

### Local at the head (r1, 18:31Z to 18:34Z)

- `pnpm install --frozen-lockfile`: up to date. `--lockfile-only`: tree clean.
- `pnpm synth --all`: 0 written, 655 unchanged, clean.
- `watched.ts --write`: no change, 539 lines. `affected.ts`: shards none.
- Gateway unit 25 files / 466 passed; `test:golden` 5 / 376; synth unit 13 / 185.

### The tests are real and isolated

- **Failing first.** With base `anthropic.ts` and `config.ts` restored (18:33:49Z): 4 failed, 15 passed. The test file
  at `03d497fb` differs from the head only by the lint cast (`git diff 03d497fb..HEAD`), so the failing-first evidence
  applies to the final test.
- **Every mutant caught** (r3, 20:53Z to 20:56Z; baseline 19/19; clone restored clean afterwards):

  | Mutant | Fails |
  | --- | --- |
  | `logLevel` removed | MOD-17 test 1 and MOD-18 |
  | `baseURL` removed | MOD-17 test 1 and MOD-18 |
  | `webhookKey` removed | MOD-17 test 2 |
  | `maxRetries` removed | MOD-17 test 1 |
  | timeout dropped (r1) | MOD-17 test 1 |
  | `openTelemetry: false` | MOD-17 test 1 |
  | `openTelemetry` unset, or `traces: true` | MOD-17 test 1 and MOD-18 |
  | `propagation: true` | MOD-17 test 1 |
  | refusal removed | the config.test MOD-17 case |

- **Stable and isolated.** Three repeats passed 19/19. Shuffled runs with `--no-isolate --pool=threads --maxWorkers=1`
  over `providers/` and `config.test.ts`, seeds 1 to 3 (20:02Z to 20:05Z), each passed 3 files / 53 tests. So the global
  OpenTelemetry state and the console spies do not leak. The tests are in the `unit` project (`vitest.config.ts`
  include and exclude), and the default forks pool isolates files.

### Records

- Matrix rows, `matrix.ts`, `registry.ts` and the `expected.json` files agree; `fixtures.test.ts` holds them equal.
  The `assertedBy` files exist and name the IDs.
- `completesIn` 10 matches MOD-13/14 and `CODE_BUILT_THROUGH_MILESTONE=10`. MOD-17/18 are allocated in LANES.md:202.
- `@opentelemetry/api` 1.10.0 is absent from the lockfile, and the vitest snapshot key is unchanged, which is why no
  shard is selected. #87's own CI ran 7 stryker shards, as the description says.
- The PR body has every template heading. Its counts (25/466, 376, 4 failed / 15 passed then 19, 13/185, 539 lines,
  shards none) match these runs and CI.
- Nothing breaks ADR 0066's CI rules or the dependency-upgrades and ci runbooks:
  - no workflow change, new job, pin or image;
  - the lockfile changed only through `--lockfile-only`;
  - a deliberate pull request for the `anthropic-sdk` group, as `dependency-upgrades.md:319-320` requires.
- The pre-push hook row reproduced at 20:55:38Z: `.githooks/pre-push` against a bare remote holding only `bce57f16`,
  with the pinned gitleaks 8.24.3. It printed "8 commits checked … gitleaks found no secret", exit 0.
- The eight commits, read one by one:
  - each message matches its diff (for example `1825913e` is +7/-6, exactly the lockfile lines it names);
  - every commit carries the two required trailers;
  - merge `27a2d97d` has the tree of a clean merge-tree (empty remerge-diff);
  - `git diff --check` is clean.

### The payment-engine question and the security-reviewer checklist (r2)

- **No route from a changed response type or field to a number or a stage.**
  - The SDK is imported only in `anthropic.ts:1` and tests.
  - `messagesResponse(raw: unknown)` parses with its own zod schema (`messages.ts:29-33`, `:43-57`).
  - Between the 0.131.0 and 1.3.0 type declarations, `Usage` only gains `speed`, and `StopReason` is identical.
  - Token counts reach only `callCost` in bigint (`prices.ts:71-74`) and the `model_call` cost and budget
    (`gateway.ts:291-297`).
  - `stop_reason` maps through `STOP_CODES` (`gateway.ts:125`) to a failed outcome.
- **`.claude/agents/security-reviewer.md` (41 lines) applied to the diff finds nothing:**
  - no migration, table, query, job, route or log-line change;
  - the refusal names the variable, not its value (`config.ts:117`);
  - `ProviderFailure` carries only the code;
  - no model call outside the gateway.

### Build output and images (r2)

- **Build.** CI's `pnpm build` passed, and so did a local build (20:28:37Z to 20:30:00Z).
- **Worker.** The SDK is bundled only into `dist/evaluate-permitted.js`. `main.js` has no SDK; its OpenTelemetry API copy
  comes from pg-boss and drizzle, as before.
- **Bundle smoke** with `build.ts`'s options (20:31:40Z): the refusal throws. With `ANTHROPIC_LOG=debug`,
  `ANTHROPIC_BASE_URL` and `ANTHROPIC_OPEN_TELEMETRY` set, the request goes to `https://api.anthropic.com/v1/messages`
  with only the gateway's headers and no console output.
- **Web.** The SDK and the OpenTelemetry API are bundled into server chunks, with no runtime external require.
- **Trivy** (HIGH and CRITICAL): 0 for web.tar and worker.tar (`images.log:1875-2001`, `:4028-4033`).
- **e2e.** e2e runs the standalone build with `MODEL_PROVIDER=local` (`playwright.config.ts:141`); `models.spec.ts:91`
  passed at 18:33:36Z.
- Not verified: the Anthropic client constructed in e2e or the Turbopack bundle (it never is).

### The base move and trial merges (r2 at 20:28Z to 20:35Z; r3 at 20:46Z to 20:56Z)

- **R2, against the old base.** A merges cleanly with #42, #83, #84, #85, #91 and #92. #75 and #86 conflict only where
  they already conflict with the base. No ID collides.
- **R2 merged-tree runs** (`progress/ci-r2-trial.log`, finished 20:35:31Z):

  | Tree | Results |
  | --- | --- |
  | A+#84 | synth clean, gateway 25 / 467, golden 5 / 376, synth unit 13 / 185 |
  | A+#75 | gateway 28 / 560, golden 5 / 381, synth unit 14 / 192 |
  | A+#92 | synth clean, synth unit 13 / 185 |
  | A+#42 | `--lockfile-only` no change |

- **R3, against the new base `43565235`.** A + base is a clean merge-in needing no regeneration, so design §8.6's
  re-verification trigger is not met. With #93 and #42 on top:

  | Tree | Results |
  | --- | --- |
  | +#93 (`06ca88b1`) | synth 271 cases, 0 written; 13/185, 25/466, 5/376; watched no diff |
  | +#42@`6c28d6a2` (`ddcae032`) | `--lockfile-only` no diff; synth 272 / 0 written; all green |
  | +#93+#42 (`c2516264`) | synth 276 / 0 written; all green |

  No duplicate IDs in any tree.

### The SDK as a whole package, 0.131.0 against 1.3.0 (r3)

- Both tarballs' sha512 equals the lockfile integrity.
- Node built-in imports are the same set in both versions; `internal/node.mjs` is byte-identical.
- `index.mjs`'s static closure grows from 187 to 223 files. `@opentelemetry/api` is the only new external, with no
  http, https, net, tls or child_process.
- `sideEffects` is false in both, and the bin is unchanged.
- Runtime probe at 20:50:31Z:
  - no new built-ins at import, build or call;
  - process listeners and active handles unchanged;
  - only read-only module opens;
  - exactly one client fetch, to `api.anthropic.com/v1/messages`.

  Nothing bypasses fetch, so MOD-18's fake fetch sees everything the client sends.

### PRD 14 eligibility (r3)

The data-retention page, fetched 20:52:23Z (HTTP 200), marks Messages, structured outputs, effort, prompt caching,
citations and PDF as eligible, and nothing on it conditions eligibility on the API version or the auth header. The
signed agreement itself is for a person: not verified.

## Proposals outside PR A's files (not built)

- **P1. An environment scrub for the unit project** (`vitest.config.ts`): `test.env` or a setup file blanking every
  `ANTHROPIC_*` variable, so no gateway test depends on the developer's environment. S1's one line stays in the pull
  request either way.
- **P2. `dependency-upgrades.md:319-320`.** Say that MOD-18 pins the API version and the exact header set, so an SDK bump
  that moves either turns MOD-18 red by design. The deliberate pull request then updates `GATEWAY_HEADERS` and the
  version with ADR 0048's amendment.
- **P3. `fixtures.test.ts`.** Check that each `assertedBy` file contains its case ID, not only that it exists. MOD-17
  and MOD-18 already pass this.
- **P4. Track the checker's N2** (a `MODEL_PATH_REFUSED` code at `path.ts:93-95`) as design §10 P9, so finding N1 can
  name it.
- **P5. An apps/web unit test pinning `modelPathFromEnv`'s refusal** to `unavailable`, with the reason and a single warn.
  `review-A/scripts-ci-r2/zz-r2-path.test.ts` is reusable. Pair it with P4.
- **P6. Read the model path once at web start** (an instrumentation `register()` calling `modelPathFromEnv`), so a
  refusal is logged at deploy time. Features would still turn off rather than the server failing. This would make D2's
  original wording true.
- **P7. A bundle smoke in the CI build job:** `node dist/evaluate-permitted.js` with `MODEL_PROVIDER=anthropic` and
  `ANTHROPIC_CUSTOM_HEADERS` set, expecting exit 2, plus the fake-fetch request check in
  `review-A/scripts-ci-r2/zz-r2-smoke.ts`. Nothing in CI constructs the bundled Anthropic client today.
- **P8. Text for the pull request's two Pending agent rows**, from "The payment-engine question" above:
  - payment-engine-reviewer: "no route to a number or a stage";
  - security-reviewer: "no table, query, job, route or log change; the refusal names the variable, not its value;
    `ProviderFailure` carries only the code; no model call outside the gateway".
- **P9. Map 408 differently** (pre-existing): `anthropicFailure` maps 408 to `rejected`, which is not retried, while the
  SDK classes 408 as retryable. Consider `timeout` or `unavailable`.
- **P10. The design's §3.1 and D2 text** need the same corrections as N5 and S2. Those are design records, not the pull
  request's files.
- **P11. `eval/cli.ts`: catch `GatewayConfigError`**, print its message without a stack and exit 2, as
  `permitted-cli.ts:63` does, so a refused configuration is told apart from "gate: FAILED" (exit 1). Add a unit test.
- **P12. PRD 14:** add effort to the eligible list, and the page's caveat that JSON schemas are cached outside the PHI
  protections, so a schema never holds PHI.
- **P13. Re-run `git merge-tree` before the merge**, against the then-current heads of #42, #93, #94 and #75, as the
  20:36 rule requires. If #94 merges first, A's base merge-in carries the `package.json` resolution, which triggers
  §8.6 re-verification. A+base+#94 already passes locally, so the re-verification should be quick.
- **P14 (writer's). Record naming.** Design §8.4 item 2 names the records
  `lane-b-dependabot-batch-review-{A,B,C}-{ci-infra,security-supply}.md`, while these are written as
  `lane-b-dependabot-batch-A-review-*.md`. Align the design's name with the files, so the fix round and the status file
  cite one name.

## Commands and logs

All under `review-A/`:
- **Progress notes:** `progress/ci-infra-r1.progress.md`, `ci-infra-r2.progress.md`, `ci-infra-r3.progress.md`.
- **Local runs:** `progress/ci-unit.log`, `ci-golden.log`, `ci-synth.log`, `ci-watched.log`, `ci-lockonly.log` (r1);
  `ci-r2-*.log` (probe, build, path probe, audit, trial merges); `ci-r3-*.log/json` (trials, mutants, eval CLI, header
  and import probes, pre-push).
- **Scripts:** `scripts-ci-r2/` (failure probe, path probe, bundle smoke, `prov.py`, `trial.sh`) and `scripts-ci-r3/`
  (`trial.sh`, `trial-b94.sh`, `mutants.sh`, `import-probe.mjs`, `header-probe.mjs`, `closure.py`, `toplevel.py`).
- **CI logs:** `tmp/ci-logs-r1-1793563078`, `tmp/ci-logs-r2-1793564819`.
- **The writer's clone:** `clone-writer`, used 21:10Z to 21:12Z; clean, and removed at 21:17:49Z.
