# PR #90 (dependabot-batch, PR A: Anthropic SDK 1.3.0) review: security and supply chain

Written 2026-11-01 at 21:12Z (`date -u`: Sun Nov 1 21:12:04 UTC 2026). It records the adversarial reviewer for security
and supply chain across three rounds (18:31Z to 20:58Z) and the skeptics' verdicts (20:11Z to 21:03Z). This file is not
committed.

- **Pull request:** #90, `co-001/deps-anthropic-sdk-1`, replacing Dependabot #87 (`@anthropic-ai/sdk` 0.131.0 to
  `^1.3.0`; the client built with tracing, propagation and SDK logging off, a fixed `baseURL`, `webhookKey: null`, no SDK
  retries; `ANTHROPIC_CUSTOM_HEADERS` refused in configuration; MOD-17/MOD-18; `@opentelemetry/api` `^1.9.1` as a
  devDependency; an ADR 0048 amendment).
- **Head:** `06f79c079e91e01c4f62616613a94b96ec1f6cd9`. `git ls-remote` at 21:10:22Z shows it unchanged.
- **Base:** `claude/build-platform` at `bce57f16`. It is now `43565235`, after #83 merged at 20:40:34Z.
  `pull_request_read get` at about 21:11Z: draft, `mergeable_state: behind`.
- **Lens:** security and supply chain (design §8.4 item 4), with `.claude/agents/security-reviewer.md`:
  - ADR 0048, ADR 0070 and D2: every SDK environment read closed or refused, and no prompt, output or trace id leaving
    the product;
  - §3.2's table, the licence and auth-header changes, release age (D1), the provenance workflow change (§3.1), and the
    lockfile's transitive diff.

  Rounds 2 and 3 added the critic's areas: the payment-engine question, the failure mapping, D2, build and images, the
  audit, the Status line, trial merges, older provenance, the base move, a whole-package diff, the eligibility page and
  the operator docs.

How the review was done:
- **Clones.** Each round used its own fresh blobless clone under `review-A/` (`clone-sec`, `clone-sec2`,
  `clone-sec-r3`), with `pnpm install --frozen-lockfile` under `flock /tmp/laneb-heavy.lock`. All clones and worktrees
  are removed. The r1 probe is kept at `review-A/scripts-sec/zz-reviewer-probe.test.ts`.
- **Downloads.** Registry tarballs, attestations and the provider's pages went into their own new directories under
  `review-A/tmp`, treated as untrusted. Tarball sha512 values matched `pnpm-lock.yaml:876`.
- **GitHub, read only.** No push, comment, review or approval.
- **Writer's spot check** (21:10Z to 21:12Z, fresh clone `review-A/clone-writer` at 06f79c07, removed afterwards).
  Every line cited below matched:
  - `anthropic-client.test.ts:19-25, 84-96, 117-168`; `config.ts:20, 116-118`; `anthropic.ts:6-12, 50-60, 75`;
  - `package.json:16, 28`; `dependabot.yml:54-55` (no update-types);
  - ADR 0048 `:3, 183-216`; `test-matrix.md:234-245`; `path.ts:80-98, 129-131`;
  - `dependency-upgrades.md:319-320`; `model-evaluation.md:51`; `README.md:452`.
- **Paths.** `review-A` means
  `/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/review-A`. Commit hashes
  are 8 hex; any other 64-hex digest is 8 hex and an ellipsis. All data and keys are synthetic
  (`sk-synthetic-not-a-key`).

## Verdict

**0 B, 3 S, 11 N** (raised as 4 S and 10 N; the skeptic rerated one S to N). Nothing blocks the merge: the client takes
nothing from the environment that reaches a request, and the code closes every read it names.

The three S findings are about the record and how it holds over time:
- **S1.** The ADR re-checks the SDK's environment reads only "at each major", but `^1.3.0` and the `anthropic-sdk` group
  take minors, and nothing automatic notices a new read. MOD-17 should pin the list.
- **S2.** The amendment does not say that an API-version change (an SDK major, or Bedrock's version) is a model change
  under ADR 0070, so a moved MOD-18 pin could keep serving on an evaluation made under the old version.
- **S3.** The description's "Merge order" is stale against the 20:36 UTC standing rule.

The N findings are wording and record gaps, plus one test gap (N9: the failure mapping is never driven through the real
1.3.0 client).

Several findings were also raised by the CI and test-infrastructure lens
(`lane-b-dependabot-batch-A-review-ci-infra.md`); each is cross-referenced. Where the two lenses rated the same issue
differently, the fix round takes the higher rating:
- D2 at startup (here N5, there S2);
- the merge order (here S3, there N8).

## Findings

### S1 (security-supply-r1-SEC-S1). The SDK's environment reads are re-checked only "at each major", but `^1.3.0` and the `anthropic-sdk` group bring minors, and nothing automatic notices a new read

**Where:** ADR 0048 (`docs/adr/0048-call-models-only-through-the-gateway-…-feature-flags.md`) `:214-216`;
`packages/model-gateway/src/providers/anthropic-client.test.ts:117` (the MOD-17 describe).

**Scenario:** Dependabot's `anthropic-sdk` group opens `@anthropic-ai/sdk` 1.4.0. The group sets no update-types
(`.github/dependabot.yml:54-55`), so minors arrive there. Suppose 1.4.0 adds a new opt-in `readEnv('ANTHROPIC_...')`
that adds a header, changes the host or records content.
- A semver minor may do that. 0.134.0 added four `ANTHROPIC_OPEN_TELEMETRY*` reads and default-on tracing in a minor
  (1.3.0 `CHANGELOG.md:148`, `:156`).
- CI's environment does not set the new variable, so MOD-17 and MOD-18 still pass.
- The ADR asks for the reads to be re-read only at the next major.

A task definition or developer shell that sets the variable then gets the behaviour, and no one has reviewed it.

**Evidence:**
- **The ADR.** ADR 0048 `:215-216` says "the SDK reads a new environment variable (read its `readEnv` calls at each
  major)". The range is `^1.3.0` (`package.json:16`).
- **The tests.** MOD-17 and MOD-18 stub only the five variables known today (`anthropic-client.test.ts:19-25`), plus
  the webhook key at `:131` and the custom headers at `:158`. `git grep 'readEnv|ANTHROPIC_'` finds no inventory of what
  the SDK reads.
- **The inventory.** It was run under vitest in the r1 clone at 20:07:00Z (`review-A/scripts-sec/zz-reviewer-probe.test.ts`,
  output `progress/sec-logs/probe-out.txt`) and reproduced by the skeptic at 20:12:32Z: 30 names.
  - 24 `ANTHROPIC_*`: API_KEY, AUTH_TOKEN, BASE_URL, CONFIG_DIR, CUSTOM_HEADERS, ENVIRONMENT_ID, ENVIRONMENT_KEY,
    FEDERATION_RULE_ID, IDENTITY_TOKEN, IDENTITY_TOKEN_FILE, LOG, OPEN_TELEMETRY, OPEN_TELEMETRY_PROPAGATION,
    OPEN_TELEMETRY_TRACES_CONTENT_MODE, OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES, ORGANIZATION_ID, PROFILE, SCOPE,
    SERVICE_ACCOUNT_ID, SESSION_ID, WEBHOOK_SIGNING_KEY, WORKSPACE_ID, WORK_ID, WORK_SECRET;
  - APPDATA, HOME, PATH, USERPROFILE and XDG_CONFIG_HOME;
  - HOSTNAME, through `env?.['HOSTNAME']` (`lib/environments/poller.mjs:251`).

  All `readEnv` arguments are literal.
- **The vendor adds reads in minors** (the skeptic's scan, 20:13:05Z): 0.131.0 and 0.133.0 read 26 names; 0.135.0,
  0.137.0, 1.0.0 and 1.3.0 read 30. 1.0.0 to 1.3.0 added none, so this is a gap waiting to be hit, not a live leak.
- **The human check misses it too.** `dependency-upgrades.md:63` asks for every minor's release notes to be read. But
  the 1.3.0 CHANGELOG (3,643 lines) names only `ANTHROPIC_OPEN_TELEMETRY`, once (`:158`). It never names the other three
  variables 0.134.0 added.

**Fix (the skeptic's corrected fix):** In `anthropic-client.test.ts`, under the MOD-17 describe (`:117`), add one test:
"the SDK reads no environment variable and touches the environment nowhere but where this file lists, each closed".
- **How it reads the SDK.** Find the package directory with
  `dirname(createRequire(import.meta.url).resolve('@anthropic-ai/sdk'))`; its `package.json` is not in `exports`. Walk
  every `.js`, `.mjs` and `.cjs` file, skipping `src/` and `node_modules`. Strip comments before matching, because JSDoc
  mentions `process.env['…']`.
- **Name regex:**
  ``/(?:readEnv\)?\(|process\??\.env(?:\?\.)?\[|env\?\.\[|Deno\??\.env\??\.get\??\.?\()\s*(['"`])([A-Z0-9_]+)\1|process\??\.env\.([A-Z][A-Z0-9_]*)/g``.
- **Site regex** (any other touch of the environment object):
  ``/\breadEnv\)?\(\s*(?!['"`][A-Z0-9_]+['"`])[^)\s]|(?:process\??\.env|Deno\??\.env)(?!(?:\?\.)?\[\s*['"`][A-Z0-9_]+['"`]|\.[A-Z][A-Z0-9_]*)/g``.
  Record each site by its path relative to the package, with the extension stripped.
- **(a) Names.** The sorted name set equals `SDK_ENV_READS`, with one comment per group saying how it is closed:

  | Group | Names |
  | --- | --- |
  | Closed by a client option | `ANTHROPIC_BASE_URL`, `_LOG`, `_OPEN_TELEMETRY`, `_OPEN_TELEMETRY_PROPAGATION`, `_OPEN_TELEMETRY_TRACES_CONTENT_MODE`, `_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES`, `_WEBHOOK_SIGNING_KEY` |
  | Refused by `readGatewayConfig` | `ANTHROPIC_CUSTOM_HEADERS` |
  | Unread because `apiKey` is passed (the credential chain) | `ANTHROPIC_API_KEY`, `_AUTH_TOKEN`, `_CONFIG_DIR`, `_FEDERATION_RULE_ID`, `_IDENTITY_TOKEN`, `_IDENTITY_TOKEN_FILE`, `_ORGANIZATION_ID`, `_PROFILE`, `_SCOPE`, `_SERVICE_ACCOUNT_ID`, `_WORKSPACE_ID`, `APPDATA`, `HOME`, `USERPROFILE`, `XDG_CONFIG_HOME` |
  | Entry points the gateway never imports | `ANTHROPIC_ENVIRONMENT_ID`, `_ENVIRONMENT_KEY`, `_SESSION_ID`, `_WORK_ID`, `_WORK_SECRET`, `HOSTNAME` (lib/environments), `PATH` (tools/agent-toolset) |

- **(b) Sites.** The sorted site set equals `SDK_ENV_SITES`:
  - `internal/utils/env`, readEnv's own definition;
  - `lib/environments/poller`, an alias of `process.env` for HOSTNAME;
  - `tools/agent-toolset/node`, `Object.entries(process.env)` scrubbing a child shell's environment.

  A new alias, enumeration or computed name then fails, even where the name regex cannot see it.
- **(c) Runtime dependencies.** The sorted keys of the SDK's `package.json` `dependencies`, read with fs, equal
  `['@opentelemetry/api', 'json-schema-to-ts', 'standardwebhooks']`. None of the three touches the environment at its
  locked version (checked at 20:15Z). A new runtime dependency fails the test until it is read.
- **Matrix and fixtures.** Extend MOD-17's assertion in `test-matrix.md:234` and `matrix.ts` with "; the environment
  variables the SDK reads, the other places it touches the environment and its runtime dependencies are the reviewed
  lists, each closed". Regenerate with `pnpm synth`, in the same run as ci-infra N2's webhook wording.
- **ADR 0048 `:215-216`.** Replace "the SDK reads a new environment variable (read its `readEnv` calls at each major)"
  with:

  > the SDK reads a new environment variable, touches the environment in a new place or gains a runtime dependency
  > (MOD-17 pins all three, so any version taken that changes one fails until the new read is closed by a client option,
  > refused in readGatewayConfig, or recorded as unreachable from the gateway); its default-on telemetry or default
  > headers change (read at each version taken)

- **Prototype** of (a) and (b): `review-A/scripts-refute-S1/scan.mjs` (20:14:50Z). It reports 30 names and 3 sites for
  1.3.0 and 1.0.0, and 26 names for 0.133.0, so it would have failed when 0.134.0 added its reads.

**Skeptic:** Confirmed; could not refute. Checked read-only after `git fetch` at 20:11:30Z, against registry tarballs
whose sha512 matches the lockfile. The design's "Review of the design" does not take up this check; design `:201` reads
only `lib/environments/worker.mjs`.

The reviewer's original fix was right in direction but incomplete:
- its regex missed `process?.env`, aliases, template-literal names and whole-environment enumeration
  (`tools/agent-toolset/node.mjs:161`);
- it did not cover new runtime dependencies;
- it left out the matrix and fixture rows.

The corrected fix above covers all three.

### S2 (security-supply-r1-SEC-S2). The amendment does not say what a change of API version means for ADR 0070's evaluation gate

**Where:** ADR 0048 `:202-205` (the "API version" bullet) and `:216`; `anthropic-client.test.ts:147`.

**Scenario:** The founder's floors are set, and the first Anthropic entry is recorded under `anthropic-version`
`2026-10-21`. Then:
1. A later SDK major sends a new API version, and MOD-18's pin at `:147` fails.
2. The builder moves the pinned string, a one-line test edit, and CI goes green.
3. The baseline key (purpose, prompt version and hash, provider, model, variant; ADR 0070 `:187`,
   `baseline-format.ts:71-91`, `:145`) still matches, and the set hash does not move (ADR 0070 `:180-181`).
4. So `servingDecisions` keeps serving the Anthropic features on an evaluation made under the old version.

ADR 0070 has a merge-blocking re-record rule only for set changes, the pdf.js and Textract-reader bumps (`:259-264`,
`:374-375`; `model-evaluation.md:3-5`, `:123-124`, `:207`). ADR 0048's "Revisit when … the SDK's next major or API
version" names a trigger, not what must happen.

**Evidence:**
- ADR 0048 `:204-205` says only "The first real-model record on the Anthropic path will be made on SDK 1.x and this
  version".
- `eval/baseline.json` at 06f79c07 holds 2 entries, both `provider: local`, so nothing is served on a real provider and
  this does not block today.
- The strongest counter, `dependency-upgrades.md:319-320` ("passes the evaluation gate first … in a deliberate pull
  request"), fails. The design treats CI's `test:golden` as "the evaluation gate" for this very pull request (design
  `:788-789`), and that gate runs only the local provider (`model-evaluation.md:7-9`).
- The migration guide (local copy `scratchpad/design/tmp/scout-sdk/guide/migration-2026-10-21.md`, sha256 `f712cb39…`,
  untrusted) shows that a version can change what a request means (`:57-67`) and which models it serves (`:24`).

**Fix (the skeptic's corrected fix):**
- **ADR 0048, the "API version" bullet (`:202-205`).** Keep its text and append, rewrapped to 120 columns:

  > From the first real-model entry of a provider on, a change of the API version that path sends is a model change
  > under ADR 0070, though no baseline key or set hash sees it. On the Anthropic path that is an SDK major, which fails
  > MOD-18's pin. On Bedrock it is `BEDROCK_ANTHROPIC_VERSION`. The pull request that makes it does not merge until a
  > person has run every entry of that provider (each purpose and variant) under the new version. Each run is recorded
  > against the held entry on the same set with every regression rule in force (`eval --record`, without `--new-set`,
  > since the set, prompt and model are the held entry's; docs/runbooks/model-evaluation.md), and committed in that pull
  > request. Each contract entry is then `permitted: 'pending'` until its permitted run is recorded, so that feature is
  > entered by hand meanwhile. While a provider has no real entry (as at this amendment: `eval/baseline.json` holds
  > `local` entries only), CI's gate suffices.

- **`anthropic-client.test.ts:147`.** Add above the `anthropic-version` assertion:
  `// Moving this pin is a model change once the Anthropic path has a real entry: re-record it first (docs/adr/0048, amendment, API version).`

**Skeptic:** Confirmed; could not refute. Checked read-only with `git show 06f79c07:<path>` from 20:13Z to 20:16Z; the
merge base is `bce57f16`. Severity S: it is a rule missing from this pull request's own record, and it does not block
now.

The reviewer's original fix borrowed the pdf.js "two-step re-baseline". That procedure exists because the set moved,
so its step 1 records with `--new-set` and computes no regressions (ADR 0070 `:259-262`). An API-version change moves no
set, prompt or model, so a single gated `eval --record` against the held entry is the stronger check
(`eval/baseline.ts:316-336`). The corrected fix also adds two things the original left out:
- the `pending` permitted state (`eval/baseline.ts:406-407`);
- Bedrock's same blind spot (`bedrock.ts:16`, `:49`).

Two inaccuracies in the finding, neither changing the verdict:
- design P1 is at `:912-913`, not `:907-908`;
- the guide's `:57-67` say a request that leaves out the sampling parameters samples exactly as under `2023-06-01`;
  only a request that sends them gets a 400. `git grep -E 'temperature|top_p|top_k'` over the gateway's sources returned
  nothing at 20:16:02Z, so this version changes nothing for the gateway's requests.

### S3 (security-supply-r3-SEC3-S1). The "Merge order" section is stale against the 20:36 UTC standing rule

Also raised by ci-infra as N8.

**Where:** PR #90 description, `### Merge order`, read with `pull_request_read get` at about 20:46Z, 21:00Z and 21:11Z;
the rule is at `lane-b-dependabot-batch-status.md:25-31`.

**Scenario:** The person merging A reads the section, which follows design §8.7 (`:815-855`). The 20:36 ruling
supersedes it: order applies only between conflicting pull requests, "Never jump a PR already green and waiting with a
conflicting file", and "A merges when ready". The description falls behind that ruling in four places:
1. It keeps the 18:00 wording "never ahead of a pull request already green and waiting to merge", with no conflict
   condition.
2. It keeps "While #42 is open, ask Lane B's orchestrator before merging", which the 20:36 ruling has answered.
3. It lists #83, which merged at 20:40:34Z.
4. It names "the CDK and AWS SDK one" without its number (#94, `484e9f06`), and "the redact-ssn-phone pull request",
   which does not exist yet (no such branch in `git ls-remote`; LANES.md:200 holds only a claim).

**Evidence:**
- **Merge-tree.** `git merge-tree --write-tree 06f79c07 pr/94` (20:47:19Z) reports one conflict, in
  `packages/model-gateway/package.json`. It is two adjacent lines: `'@anthropic-ai/sdk'` `^1.3.0` against `^0.131.0`,
  and `'@aws-sdk/client-bedrock-runtime'` `^3.1152.0` against `^3.1160.0`. `pnpm-lock.yaml` auto-merges.
- **Lockfile.** On A + `43565235` + #94 with both ranges kept, `pnpm install --lockfile-only` changed nothing (20:58:18Z;
  the skeptic again at 21:03:10Z).
- **Trial merges** (20:48Z to 20:55Z, `review-A/progress/sec3-logs/`): A + `43565235` (tree `2dd53e47`), then +#93
  (`af3b6d89`), then +#42 (`6c28d6a2`). Each tree passed:
  - lockfile-only with no diff, and the frozen install;
  - `pnpm synth --all`, 0 written (267, 271 and 272 cases);
  - synth and gateway `fixtures.test.ts` (30 passed), synth unit (185), gateway unit (466), `test:golden` (376);
  - `watched.ts --write` with no diff (541, 542 and 549 lines).
- **The skeptic's merge-tree** of A against every open head (21:01:46Z to 21:01:58Z): only #94 conflicts. #75 and #86
  conflict only where they already conflict with the base. #42, #84, #85, #91, #92 and #93 merge cleanly.

**Fix (the skeptic's corrected fix):** Replace the whole section. The fix round fills each `<placeholder>` from the
checks it runs at its own head:

> ### Merge order
> - **The rule.** This PR merges when ready under Lane B's standing rule of 2026-11-01 20:36 UTC, which replaces the
>   18:00 ruling's "never ahead of a pull request already green". (1) Merge the latest claude/build-platform in with a
>   merge commit; it now holds #83 (43565235). (2) Regenerate pnpm-lock.yaml and watched-paths.txt on the merged tree
>   and run `pnpm synth --all` there (LANES.md rule 6). (3) CI green on that head, then ready, then approval-of-record
>   re-run, then merge with expectedHeadSha.
> - **When order matters.** Only against a PR that conflicts. Never merge ahead of a conflicting PR that is already
>   green and waiting.
> - **Conflicts: #94 only** (the CDK and AWS SDK PR of this item), in packages/model-gateway/package.json lines 16-17
>   (adjacent ranges). Whichever merges second keeps `@anthropic-ai/sdk` `^1.3.0` and `@aws-sdk/client-bedrock-runtime`
>   from #94, then runs `pnpm install --lockfile-only`; that changed nothing at <UTC time> on <A head> + <base> +
>   #94 <head>. pnpm-lock.yaml merges cleanly.
> - **No conflict added** (`git merge-tree` on this head merged with the base, at <UTC time>): #42, #84, #85, #91, #92
>   and #93 merge cleanly; #75 and #86 conflict only where they already conflict with the base (#75 in the three uploads
>   files; #86 in ADR 0066, reconciliation-001 and tools/test/workflows.test.ts).
> - **Shared record files.** #42, #75, #84, #85, #92 and #93 also edit test-matrix.md and synth matrix.ts and
>   registry.ts; #91 edits test-matrix.md and matrix.ts. Whichever merges second keeps both PRs' MOD rows and re-runs
>   `pnpm synth --all`.
> - **Semantic checks.** Record each merged-tree run with its time and the PR heads, and only the runs actually made.
> - **Before merging.** Re-run these merge-tree checks against the current heads just before the merge, and record the
>   result in the status file, not here. Do not pin other PRs' head SHAs in this section.

**Skeptic:** Confirmed; could not refute. The section is stale, but the finding overstates one point: it dropped "if
they merge first: whichever merges second resolves", so the #75/#84 sentence is conditional and does not by itself hold
A back. The unconditional "never ahead of a pull request already green" sentence still could.

The reviewer's own fix needed correcting in six ways:
1. It pinned #93 at `af3b6d89`, but #93's head is now `87691be4` (20:43:35Z).
2. It claimed merged-tree runs with #75, #84 and #92 that were only merge-tree checks.
3. It said "no semantic conflict", which is more than the checks show.
4. It left out #85, #86 and #91.
5. Its "a no-op on today's heads" had no heads or time attached.
6. It left out rule 6's steps.

Not verified by the skeptic: the reviewer's synth, fixtures, gateway and golden runs on the trial trees.

### N1 (security-supply-r3-SEC3-S2, raised as S; the skeptic rerates N). The operator docs do not say that `ANTHROPIC_CUSTOM_HEADERS` is refused or that `ANTHROPIC_BASE_URL`, `ANTHROPIC_LOG` and `ANTHROPIC_OPEN_TELEMETRY*` are ignored

Also raised by ci-infra as N9.

**Where:** `packages/model-gateway/src/config.ts:20` and `:117`. Outside the PR's files: `model-evaluation.md:51`,
`README.md:452` and `eval/cli.ts:165-169`, `:216`.

**Scenario:** A person runs the people-only real-model evaluation as `model-evaluation.md:51` says.
- With `ANTHROPIC_CUSTOM_HEADERS` set in the shell, the run dies before any call with an uncaught `GatewayConfigError`.
  The message names the variable and ADR 0048 but not the remedy.
- With `ANTHROPIC_BASE_URL` set (egress only through a proxy), the client silently goes to `api.anthropic.com`, and
  every call fails as `unavailable`.

**Evidence:**
- **The refusal, reproduced** on the merged tree at 20:52:34Z: `MODEL_PROVIDER=anthropic
  ANTHROPIC_API_KEY=sk-synthetic-not-a-key ANTHROPIC_CUSTOM_HEADERS='x-synthetic-extra: 1' pnpm --filter
  @tp/model-gateway eval --provider configured --only narratives`.
  - It gave the `GatewayConfigError`, a stack through `cli.ts:165` and `:216`, and `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`
    exit 1.
  - Nothing was sent, and the message does not echo the value.
- **The docs.** `config.ts:20` still reads "anthropic: ANTHROPIC_API_KEY, from the environment's secret."; README `:452`
  and `model-evaluation.md:51` name only the key.
- **The skeptic's checks** (21:00Z to 21:02Z):
  - `git grep -E 'ANTHROPIC_[A-Z_]+'` finds the refusal and the ignored variables only in ADR 0048, `anthropic.ts:44-49`,
    the tests, the MOD-17 row and its fixture;
  - before this pull request, SDK 0.x honoured `ANTHROPIC_BASE_URL`;
  - this sandbox has `ANTHROPIC_BASE_URL` set (`env | cut -d= -f1`, 21:01Z).

**Fix (the skeptic's corrected fix):**
1. **`config.ts:20`.** Do not list every ignored variable; such a list drifts. Write:
   ` * - anthropic: ANTHROPIC_API_KEY, from the environment's secret, and nothing else from the environment: anthropicClient fixes the host, the SDK's logging and its tracing whatever other ANTHROPIC_* variables say, and ANTHROPIC_CUSTOM_HEADERS, which no client option overrides, is refused (docs/adr/0048, amendment of 2026-11-01).`
   Wrap it at the file's width.
2. **`config.ts:117`.** Add the remedy:
   `'ANTHROPIC_CUSTOM_HEADERS is refused: the Anthropic path sends only the headers the gateway sets; unset it (docs/adr/0048)'`.
   `config.test.ts:86-87` matches only the class and `/ANTHROPIC_CUSTOM_HEADERS/`, so nothing else changes.
3. **`model-evaluation.md:51`.** Extend the parenthesis. The run always goes to `https://api.anthropic.com` with the
   SDK's logging and tracing off, whatever `ANTHROPIC_BASE_URL`, `ANTHROPIC_LOG` or `ANTHROPIC_OPEN_TELEMETRY*` say, so
   it needs direct HTTPS egress to that host. `ANTHROPIC_CUSTOM_HEADERS` is refused before any call: unset it first.
   Cite ADR 0048, amendment of 2026-11-01.
   - This does not conflict with #75, whose hunks are near `:161` and `:175`.
4. **`README.md:452`.** One short clause: `anthropic` (`ANTHROPIC_API_KEY`; no other variable the SDK reads from the
   environment is used, and `ANTHROPIC_CUSTOM_HEADERS` is refused, ADR 0048).

The fix round runs the gateway unit tests after these edits. No open pull request touches `config.ts` or the README
(21:02:51Z).

**Skeptic:** Real, but N, not S.
- The stack trace is the CLI's existing convention for every configuration and usage error (`config.ts:119`,
  `cli.ts:153`, `:208`).
- The refusal stops before any call, and it names the variable.
- "A paid run" was wrong: a call that cannot reach the API is never billed. It fails as `unavailable` or `timeout`
  (`anthropic.ts:29-37`), and the run is then unmeasured and unrecorded (`model-evaluation.md:78-79`).
- The decision itself is recorded in the ADR and at `anthropic.ts:44-49`.
- The CLI's output change is proposal P10, not this pull request's.

### N2 (security-supply-r1-SEC-N1). The ADR understates two of the risks it closes and overstates one guarantee

**Where:** ADR 0048 `:194-195`, `:196-198` and `:210-212`.

**Scenario:** The code already closes all three; only the record is imprecise.
- **(a) Trace context.** "so no trace context reaches the provider even from a span the SDK did not start" (`:194-195`)
  is true of the SDK only. An application HTTP or fetch instrumentation would inject `traceparent` whatever the SDK's
  settings. "Revisit when" (`:214`) names that case, but the sentence reads as a guarantee.
- **(b) Debug logging.** `ANTHROPIC_LOG=debug` logs each response body (the model's output, which holds the extracted
  fields) as well as the request body.
- **(c) Custom headers.** `ANTHROPIC_CUSTOM_HEADERS` is described as "extra request headers" (`:198`) that "would send
  headers no one sees" (`:212`). It can also replace `Authorization`, so the gateway's key is swapped for another, and
  prompts go to the API under another organization's account.

**Evidence:**
- (b) 1.3.0 `internal/parse.mjs:43-49` calls `debugLogRequestDetails(... { body })` on the parsed response, and `:8`
  logs `response.body` at debug.
- (c) `client.mjs:962-978` builds headers as platform, then auth, then `defaultHeaders`, so the later source wins.
  `client.mjs:176-185` merges the variable into `defaultHeaders`. The r1 probe (20:07:11Z) bypassed `readGatewayConfig`
  and set `ANTHROPIC_CUSTOM_HEADERS='x-synthetic-extra: 1\nauthorization: Bearer other'`; the request sent
  `authorization: Bearer other`.
- (a) `internal/tracing.mjs:225-227` is the SDK's only `propagation.inject`, and it is reached only through a span.

**Fix:**
- (a) Write "the SDK sends no trace context, even for a span it did not start; an HTTP or fetch instrumentation of the
  application's own would (Revisit when)".
- (b) Write "at `debug` it logs each request's body (the prompt) and each response's body (the output)".
- (c) Write "`ANTHROPIC_CUSTOM_HEADERS` (headers added to every request, `Authorization` included, so it can replace the
  key)". In Alternatives, write "it would send headers no one sees, the credential among them".
- Optionally, add `authorization: Bearer other` to the config test's refused value, recording why the variable is
  refused.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N3 (security-supply-r1-SEC-N2). "Logging off" and "nothing written to the console" do not cover the SDK's two direct `console.warn` calls

**Where:** `anthropic.ts:56` (`logLevel: 'off'`); `test-matrix.md:235` (MOD-18); ADR 0048 `:196-198`.

**Scenario:** A later minor under `^1.3.0` adds a model the prompts pin to the SDK's deprecated list. From then on every
Anthropic call writes a `console.warn`, and so a line in the log group, whatever `logLevel` says. MOD-18 stays green,
because it sends a synthetic model id. The line holds a model id and an end-of-life date, never request content, so this
is not a PHI leak. It does contradict "logging off".

**Evidence:**
- 1.3.0 `resources/messages/messages.mjs:20-27` calls `console.warn` directly, outside `loggerFor`, for a deprecated
  model, and for a listed model with `thinking.type` `enabled`. The gateway never sends `thinking`.
- A count-only script at 20:02:06Z found none of the 2 models the prompts pin for the anthropic provider on either list.
- Every other SDK log path goes through `loggerFor` or is gated by it (`internal/utils/log.mjs:21-60`).
  `client.mjs:156-162` parses `'off'` first, so `ANTHROPIC_LOG` is never read.

**Fix:** Add a clause to the ADR's logging sentence and to MOD-18's assertion: "the SDK's own deprecation warning aside
(a model id and date written straight to console.warn, no request content)". Optionally, add a MOD-18 case that reads
the SDK's deprecated-model map, if a later version exports it, and fails when a pinned model appears on it.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N4 (security-supply-r1-SEC-N3). MOD-18 sends through a `withOptions()` clone, not the client that `anthropicClient` returns

**Where:** `anthropic-client.test.ts:84-90` (`send`), the call at `:86`.

**Scenario:** `withOptions` re-runs the constructor with settings forwarded from the parent (1.3.0
`client.mjs:310-351`). It re-reads `ANTHROPIC_CUSTOM_HEADERS` at `:176` and settles `openTelemetry` from the parent at
`:345`. So the request MOD-18 inspects is built by a second object. If a later SDK forwarded the host, logging or
tracing differently from how the constructor settles them, the test would no longer prove what the gateway's own client
sends.

**Evidence:** Today the two agree. The r1 probe at 20:07:00Z used the returned client directly, with `globalThis.fetch`
stubbed before construction; the SDK takes the global fetch at construction (`client.mjs:173`, `internal/shims.mjs:1-6`).
- It ran with the same environment plus `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_PROFILE`, a recording provider and a
  propagator.
- Results: host `api.anthropic.com`; exactly the `GATEWAY_HEADERS` set; Bearer carrying the gateway's key; 0 spans; 0
  console calls.

**Fix:** In `send()`, call `vi.stubGlobal('fetch', fetch)` before `built()`, call `client.messages.create` on that
client, and add `vi.unstubAllGlobals()` to `afterEach`. Keep `withOptions` only in the control test, or drop it there
too. This is the same change N9's failure tests need.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N5 (security-supply-r2-SEC2-N1). D2 says the refusal "fails closed at startup"; the web reads the configuration only on its first model request

Also raised by ci-infra as S2, where it was confirmed at S. The fix round takes it at S.

**Where:** PR #90 description, Decisions table, row D2; design `:36`; `apps/web/src/lib/models/path.ts:93-97`,
`:129-131`.

**Scenario:** A production web task runs with `MODEL_PROVIDER=anthropic` and `ANTHROPIC_CUSTOM_HEADERS` set by mistake.
1. The container starts, and `/api/health` returns 200, because it checks only the database
   (`apps/web/src/app/api/health/route.ts:5-6`). The deploy goes green.
2. The first request that reads the model path runs `readGatewayConfig`. That can be `modelFeatures`
   (`abstraction.ts:152`), `gatewayFor`, or the console models page (`console-models.ts:113`).
3. The `GatewayConfigError` is logged as `MODEL_PATH_UNAVAILABLE`, and `{kind:'unavailable'}` is cached for the life of
   the process.

The path does fail closed: no client is built and no request is sent. It just does not fail at startup.

**Evidence:**
- `path.ts:130`: `configured ??= modelPathFromEnv(process.env, services.logger)`. `path.ts:94-96` catches the error,
  warns and returns `unavailable`.
- The console shows the reason, which names the variable and not its value (`console-models.ts:113-117`;
  `config.ts:116-117`).
- The built worker CLI, run at 20:33:07Z (`env -i … MODEL_PROVIDER=anthropic ANTHROPIC_CUSTOM_HEADERS='x-synthetic: 1'
  node apps/worker/dist/evaluate-permitted.js --practice <uuid>`), exited 2 with the refusal (`permitted-cli.ts:36`,
  `:62-67`).
- The ADR never says "startup" (`grep` of `docs/adr/0048-*.md`).

**Fix:** Use ci-infra S2's corrected wording for the D2 row and design `:36`; it also names the evaluation CLI.
Proposal P2 below would make the original wording true.

**Skeptic:** Confirmed as a nit at this lens. ci-infra's skeptic confirmed the same facts at S (20:38Z to 20:40:37Z).

### N6 (security-supply-r2-SEC2-N2). ADR 0048's Status line does not record the 2026-11-01 amendment

Also raised by ci-infra as N4.

**Where:** ADR 0048 `:3`.

**Scenario:** A reader of the header, or anyone grepping Status lines for amendments, sees "accepted for the build; the
model path is provisional until counsel's read of both agreements (PRD 20)". Nothing tells them that the SDK's tracing,
logging and host are now fixed, or that `ANTHROPIC_CUSTOM_HEADERS` is refused. Design §3.7 asks for ADR 0054's form,
which records each amendment in Status.

**Evidence:**
- ADR 0048 `:3` is unchanged from the base.
- ADR 0054 `:3-6` records "amended 2026-10-26 by [0070]… ("Amendment (`co-001/model-eval-gate`, 2026-10-26)", below);
  amended 2026-10-27: …". ADRs 0037, 0051, 0052 and 0063 follow the same form.
- No tool checks Status lines.

**Fix:** Change line 3 to the following, wrapped at 120 columns, with one wording shared with ci-infra N4:

> - **Status:** accepted for the build; the model path is provisional until counsel's read of both agreements (PRD 20);
>   amended 2026-11-01: SDK 1.x on the Anthropic path, its tracing, propagation, logging and host fixed on the client
>   and ANTHROPIC_CUSTOM_HEADERS refused ("Amendment (`co-001/deps-anthropic-sdk-1`, 2026-11-01)", below)

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N7 (security-supply-r2-SEC2-N3). The provenance claim names the wrong version: the workflow and trusted-publisher config changed at 0.132.1, not 1.0.0

Also raised by ci-infra as N5.

**Where:** PR #90 description, "What was read", the Provenance bullet; design `:122-126` (§3.1).

**Scenario:** An auditor checks the record against the registry, where 0.132.1 to 0.137.0 already publish from
`publish-npm.yml`. The conclusion still holds: same repository, `refs/heads/main`, a GitHub-hosted builder, SLSA v1, no
downgrade.

**Evidence:** Registry attestations were fetched at 20:28:42Z to 20:28:57Z, each into its own directory under
`review-A/tmp/attest-<v>-*`.

| Versions | Workflow | `oidcConfigId` (registry document, 20:28:51Z) |
| --- | --- | --- |
| 0.131.0, 0.132.0 | `.github/workflows/create-releases.yml` | `6b0a6fbc-…` |
| 0.132.1 (published 2026-10-08T03:20:39Z), 0.133.0, 0.134.0, 0.137.0, 1.0.0, 1.3.0 | `.github/workflows/publish-npm.yml` | `b3b2dec9-…` |

Across 0.131.0 to 1.3.0:
- No version has preinstall, install, postinstall or prepare scripts.
- The only dependency added is `@opentelemetry/api` `^1.4.1`, from 0.134.0.
- The licence is MIT through 0.137.0 and Apache-2.0 from 1.0.0.
- None is deprecated.

**Fix:**

> From 0.132.1 (2026-10-08) the publishing workflow moved from create-releases.yml to publish-npm.yml in the same
> repository, under a new trusted-publisher config (oidcConfigId b3b2dec9…); 1.0.0 and 1.3.0 publish from it.

Fix design §3.1 the same way.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N8 (security-supply-r2-SEC2-N4). The "1 moderate alert" can be identified: a development-only minimatch advisory this pull request neither clears nor adds

Also raised by ci-infra as N6.

**Where:** PR #90 description, "What waits on a person", first bullet; CI static job 124938275024 (`ci.yml:77`, `:80`).

**Scenario:** The description sends the founder to the alerts page without saying whether this pull request touches
the alert. A reader could assume the bump clears an advisory against 0.131.0, or adds one.

**Evidence:**
- **CI.** The static job printed "No known vulnerabilities found" for `pnpm audit --prod` (18:28:58Z), and
  "1 vulnerabilities found / Severity: 1 moderate" for `--audit-level=high`, without naming the package.
- **Local `pnpm audit --json`** at 06f79c07 (20:28:16Z), and with the base's lockfile and manifest at `bce57f16`
  (20:28:28Z), both return exactly GHSA-g3hv-75wg-m249: minimatch 10.2.6, moderate, patched `>=11.0.1`, path
  `.>@stryker-mutator/core>minimatch` (development only).
- **The bulk advisory endpoint** (20:28:29Z) returned `{}` for the SDK 0.131.0, 1.0.0 and 1.3.0, `@opentelemetry/api`
  1.9.1, json-schema-to-ts 3.1.1 and standardwebhooks 1.1.1.
- **No exceptions.** `audit-exceptions.json` has `entries: []`, and toolchain:check reports "0 audit exception(s)".
- **Not verified:** that the GitHub alert is this advisory. `dependabot/alerts` answers 403.

**Fix:**

> `pnpm audit` at base and head shows one moderate advisory, GHSA-g3hv-75wg-m249 (minimatch 10.2.6 via
> @stryker-mutator/core, development only), unchanged by this pull request; no advisory touches @anthropic-ai/sdk or
> @opentelemetry/api; the Dependabot alerts page (403 to the build) is the founder's to confirm.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N9 (security-supply-r2-SEC2-N5). The failure mapping that drives the gateway's one retry is tested only against hand-built SDK errors

Also raised by ci-infra as N7.

**Where:** `providers.test.ts:156-179`; `anthropic.ts:25-42`; the fix belongs in `anthropic-client.test.ts`.

**Scenario:** SDK 1.x added middleware. When middleware is present, a fetch rejection propagates as the raw error, not as
`APIConnectionError` (1.3.0 `client.mjs:654-663`, `:687-689`). Today `backendMiddleware()` returns `[]` (`:555-557`).
- Suppose a minor under `^1.3.0` makes it non-empty, or the client is given middleware.
- A connection failure then reaches `anthropicFailure` as a `TypeError` and maps to `rejected`, which is not retried.
- The gateway's one retry on `unavailable` is silently lost, and `providers.test.ts` still passes because it builds
  `APIConnectionError` by hand.

**Evidence:** Probe at 20:24:55Z (`scripts-sec2/zz-r2-failure-probe.test.ts`, removed afterwards; log
`progress/sec2-logs/failure-probe2.txt`). It used the real client with fetch stubbed before construction, inside
`AnthropicProvider`.

| Input | SDK error | Mapped to |
| --- | --- | --- |
| 429 | `RateLimitError` | `throttled` |
| 529 `overloaded_error`, 500, 503 with no body, 500 with `x-should-retry: false` | `InternalServerError` | `unavailable` |
| 400, 401, 408 | | `rejected` |
| a fetch `TypeError`, with or without an ECONNRESET cause | `APIConnectionError` | `unavailable` |
| an undici "Connect Timeout Error" cause; the SDK's own timeout | `APIConnectionTimeoutError` | `timeout` |
| the gateway aborting during the fetch | `APIUserAbortError` | `timeout` |
| the gateway aborting during the body | `AbortError` | `timeout` |
| a 200 with a non-JSON body | `SyntaxError` | `rejected` |

Each call made exactly one fetch, and the console stayed silent.

The SDK's timeout covers only the headers (`client.mjs:785-792`, the same in 0.131.0 `:669-674`), so a stalled body is
ended by the gateway's race timer alone. That is unchanged.

**Fix:** An `it.each` in `anthropic-client.test.ts`:
- stub `globalThis.fetch` with `vi.stubGlobal` before `built()`;
- send `REQUEST` through `new AnthropicProvider({ client: built(), timeoutMs })`;
- cover 429 `throttled`; 529, 500 and 503 `unavailable`; `TypeError('fetch failed')` `unavailable`; a "Connect Timeout
  Error" cause `timeout`; a fetch rejecting `AbortError` on its signal with `timeoutMs` 50, `timeout`; the caller's
  abort mid-fetch, `timeout`; 400 `rejected`;
- assert one fetch per case.

Name it in the MOD-17 row or the providers' own row. ci-infra N7 gives the same fix.

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N10 (security-supply-r3-SEC3-N1). The eligibility record names Messages and structured outputs but not effort, which every Anthropic request sends

**Where:** `anthropic.ts:7-11` and `:75` (`output_config.effort`); ADR 0048 `:202-205`.

**Scenario:** A reviewer checking PRD 14's eligibility for the fallback path reads "Only the Messages API with structured
outputs is used, both eligible there". The request also carries `output_config.effort`. PRD.md:571's eligible list
leaves out effort too. Nothing records that eligibility was re-read for API version `2026-10-21` and the Bearer header.

**Evidence:**
- The provider's data-retention page, fetched 20:54:04Z (HTTP 200, 309 lines, untrusted copy):
  - HIPAA readiness applies to the provider's API at `api.anthropic.com` "for eligible features" (`:58`);
  - the table marks Effort (`:183`), Structured outputs (`:194`) and Messages API (`:212`) eligible;
  - there is no API-version or auth-method qualifier.
- The migration guide, fetched 20:54:45Z (625 lines), does not mention HIPAA, BAA or retention.
- So the behaviour stays eligible; only the record is incomplete. Effort predates this pull request (`bce57f16`
  `anthropic.ts:9`, `:62`) but sits in a file it changes.

**Fix:**
- `anthropic.ts:9`: "Only the Messages API with structured outputs and effort is used, each listed as eligible there
  (feature eligibility table, read 2026-11-01)."
- ADR 0048's API-version bullet: "HIPAA readiness is per organization and feature; the eligibility table names no API
  version or credential header, and Messages, structured outputs and effort stay eligible (read 2026-11-01T20:54Z)."
- PRD.md:571 is the founder's (proposal P8).

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

### N11 (security-supply-r3-SEC3-N2). "Nothing taken from the environment", yet every request carries the SDK's process-derived platform headers; keeping them is right, but the decision is not recorded

Also raised by ci-infra as N10.

**Where:** ADR 0048 `:183` and `:196`; `anthropic-client.test.ts:27-45`.

**Scenario:** Either of two things can go wrong:
- a later reader takes the amendment's title literally and treats `x-stainless-os`, `-arch`, `-runtime` and
  `-runtime-version` (read from `process.platform`, `process.arch` and `process.version`) as a breach of D2;
- a later SDK adds a platform header, and someone weakens MOD-18's pinned set to let it through, because no one wrote
  down why the set holds what it does.

**Evidence:**
- **Header probe** at 20:50:48Z, on an SDK copy byte-identical to the registry tarball. The request carried exactly:
  - `accept`, `anthropic-version` `2026-10-21`, `authorization` Bearer, `content-type`;
  - `user-agent` `Anthropic/JS 1.3.0`;
  - `x-stainless` arch, lang, os, package-version, retry-count, runtime, runtime-version and timeout.
- They hold no PHI and no practice material, and they go only to the API that already receives the prompts.
- Bedrock's AWS user agent carries as much or more (`@aws-sdk/core` `dist-cjs/submodules/client/index.js:743`, `:763`).
- They could be stripped with `defaultHeaders: null` (`internal/headers.mjs`; `client.mjs:975`). Stripping is not the
  best option: there is no privacy gain over Bedrock, the provider's support loses its diagnostics, and retry-count and
  timeout are functional.
- MOD-18 (`:150`) already pins the full set.

**Fix:** In the bullet at `:196` add:

> The SDK's own platform headers (x-stainless-os, -arch, -runtime, -runtime-version, -package-version, -lang,
> -retry-count, -timeout; user-agent) are kept: they carry no PHI and describe the runtime as Bedrock's user agent does;
> MOD-18 pins the set, so a header a later SDK adds fails the test and is decided then.

Optionally, put the same sentence above `GATEWAY_HEADERS` (`anthropic-client.test.ts:27-30`), and add "or a new
platform header" to "Revisit when" (ci-infra N10).

**Skeptic:** Confirmed as a nit. Not verified by a skeptic; the fix round checks it.

## Refuted findings

None. Every finding this lens raised was confirmed. What the skeptics changed:
- **S1.** The fix was replaced by a fuller one: names, sites and runtime dependencies, with the matrix and fixture
  rows.
- **S2.** The fix was replaced: a single gated re-record, not the two-step re-baseline; Bedrock and the `pending` state
  added. Two inaccuracies in the finding were corrected (design P1's line; what the guide says about sampling).
- **S3.** The fix was replaced: no pinned heads of other pull requests, claims limited to the runs actually made, and
  #85, #86 and #91 named.
- **N1.** Raised as S and rerated N, with "a paid run" withdrawn. The fix was narrowed (no full variable list in
  `config.ts`; the remedy in the message; the CLI's output left alone).

## What I checked and found sound

### Supply chain (r1, at 06f79c07)

- **The lockfile.** It adds exactly one version, `@anthropic-ai/sdk@1.3.0` (`pnpm-lock.yaml:875-876`, snapshot
  `:3926-3928`). `@opentelemetry/api` 1.9.1 was already locked as next's and vitest's peer (`:115`, `:193`); the
  snapshot only gains the edge.
- **Integrity** (20:04:40Z). The registry's `dist.integrity`, the sha512 of the downloaded tgz, the lockfile line and
  both attestations' subject digests are identical. One attestation is npm publish v0.1; the other is SLSA v1 from
  `anthropics/anthropic-sdk-typescript` `refs/heads/main`, `publish-npm.yml`. Not verified: the Sigstore signature itself
  (proposal P11).
- **Publisher and age.** `_npmUser` is the GitHub Actions trusted publisher. Two maintainers were added against
  0.131.0, both with anthropic.com addresses. Published 2026-10-23T23:31:47Z, about 8.9 days before the review, above
  the 3-day floor. Neither the SDK nor otel 1.9.1 is deprecated (`npm view`, 20:02:49Z).
- **Licence and scripts.** Apache-2.0 (LICENSE-MIT kept for the older code), and the otel API is Apache-2.0. Neither
  0.131.0 nor 1.3.0 has an install script. `bin/cli` is byte-identical. The only new dependency is
  `@opentelemetry/api` `^1.4.1`, which has no dependencies of its own.
- **Local runs on the head** (18:33Z, `progress/sec-logs/`):
  - `BASE=origin/claude/build-platform pnpm toolchain:check`: 0 errors, 1 warning (pnpm 10.34.9);
  - `pnpm licenses:check`: 185 production packages allowed;
  - `--frozen-lockfile`: pass; gateway tests 3 files / 53 passed.
- **CI.** All 22 check runs on 06f79c07 succeeded or were skipped by design.

### Tracing, logging, environment, retries and auth (r1, proven from the 1.3.0 source)

- **Tracing.** With an `openTelemetry` option given, `resolveOpenTelemetryOptions` never calls `optionFromEnv`
  (`internal/tracing.mjs:55-88`).
  - `traces: false` makes `getTracer` return undefined (`:96-102`), so `client._tracer` is undefined (`client.mjs:172`),
    and `request()` takes the untraced path (`:579-580`).
  - Every span start is gated on `client._tracer`.
  - The only `propagation.inject` (`tracing.mjs:225-227`) needs a span.
  - `messages.create` spreads the caller's options before `__span: call`, so a caller cannot inject a span.
  - The control shows that registration does reach the SDK, which rules out a split API instance.
- **Logging.** `logLevel 'off'` is parsed first, and `??` short-circuits `ANTHROPIC_LOG` (`client.mjs:156-162`).
  - `loggerFor` makes every level a no-op at `'off'` (`log.mjs:21-60`).
  - The key-and-token warning cannot fire, because env is null when `apiKey` is passed.
  - The only exception is N3's direct `console.warn`.
- **Environment.**
  - Passing `apiKey` means the credential chain is never read (`client.mjs:121-135`, `:213-235`).
  - An explicit `baseURL` wins over `ANTHROPIC_BASE_URL` and a profile host (`:102`, `:141-147`).
  - `webhookKey: null` skips the default (`:102`).
  - `lib/environments/worker.mjs` is imported at load (`resources/beta/environments/work.mjs:7`), contrary to check-A's
    "not imported", but its reads run only inside `handleItem` (`:238-244`).
  - `readEnv` trims and treats an empty value as unset (`internal/utils/env.mjs:8-15`), the same as the gateway's
    `value()` (`config.ts:61-64`).
  - Every place a provider is built passes `process.env` through `readGatewayConfig` first (`path.ts:82`,
    `permitted-cli.ts:36`, `eval/cli.ts:165`).
- **Retries.** `maxRetries` is 0 at both client and request level, and `retryRequest` needs retries remaining
  (`client.mjs:671-673`, `:710-712`). The 401 refresh needs a token cache, which an `apiKey` client lacks.
- **Auth and API version.**
  - `Authorization: Bearer` (`client.mjs:436-441`) and `anthropic-version` `2026-10-21` (`:972`).
  - Nothing in the repo reads `x-api-key`, and the SDK's debug formatter masks `authorization`.
  - Message, TextBlock, OutputConfig and JSONOutputFormat are identical between 0.131.0 and 1.3.0.
  - The migration guide (20:00:16Z, HTTP 200, 625 lines) changes nothing the gateway's request uses
    (`anthropic.ts:70-78`).

### Repo rules

- No schema, query, route, job or log line changes.
- Fixtures and keys are synthetic, and no model identifier appears in the new files beyond the synthetic placeholder.
- The SDK import stays in the gateway, enforced by ESLint (`tools/test/eslint-rules.test.ts:27-52`).
- Vitest isolates per file.
- The amendment's facts check out: tracing since 0.134.0 (CHANGELOG `:156`); the four reads already in 0.131.0
  (`client.mjs:71`, `:110`, `:117`); the licence change in LICENSE-MIT.

### The payment-engine question and the security-reviewer checklist (r2)

- **No field changed under 1.x reaches a number or a stage.**
  - `anthropic.ts:79` passes the SDK value as unknown to zod (`messages.ts:29-33`, `:43-57`).
  - `Usage` gains only `speed`, which needs a request parameter the gateway never sends. `StopReason` is identical
    (0.131.0 `messages.d.ts:2337`, 1.3.0 `:3887`).
  - Tokens flow only into bigint `callCost` (`prices.ts:71-74`) and the `model_call` cost and budget
    (`gateway.ts:291-298`).
  - pricing, ledger, packets and triage import nothing from the gateway.
  - Model text stays a proposal behind `spec.output` and `verify` (`gateway.ts:312-321`).
- **The security-reviewer lens finds nothing.** The refusal names the variable, never its value, and is logged as a
  code only (`path.ts:95`). `ProviderFailure` carries a code only (`provider.ts:60-70`).

### Build, images and bundles (r2)

- **Build.** CI's `pnpm build` (job 124938274844) and a local build (20:29:45Z to 20:31:21Z) passed.
- **Worker.** The SDK is bundled only into `dist/evaluate-permitted.js`. The built CLI exited 2 with the refusal at
  20:33:07Z, so the bundle loads the SDK and the refusal.
- **Web.** Three server chunks carry `VERSION "1.3.0"`, the API host, `logLevel:"off"` and `propagation:!1`.
- **Images.** The images job (124938275032) succeeded, with Trivy set to fail on fixed HIGH or CRITICAL findings
  (`ci.yml:694-731`). Not verified by this lens: the Trivy tables (the CI-infra lens read 0 for both images). Trivy
  cannot see bundled JavaScript (proposal P3).

### Trial merges and the base move (r2 at 20:30Z, r3 at 20:48Z to 20:55Z)

- **R2.** A merges cleanly with #42, #83, #84, #85, #91 and #92; #75 and #86 conflict only where they already conflict
  with the base. No other open head touches `config.ts`, `providers/`, the gateway's `package.json`, ADR 0048 or the two
  CLIs. A+#75 gave 42 files / 752 tests and synth 0 written (20:35:36Z).
- **R3.** A + `43565235` (`2dd53e47`) is a clean merge-in. On it:
  - `--lockfile-only` no diff; synth 267 cases, 0 written; fixtures 30; synth unit 185; gateway 466; golden 376;
  - watched 541 lines, no diff; `verify-content`, toolchain:check (0 errors) and licenses:check (185) pass.

  So design §8.6 needs no new verification, though the new CI run on the merged head is still required. No ID
  collisions with #93 (HOM-01 to 04) or #42 (SEC-18/19, SCR-21/22, JOB-05).

### Whole package and runtime probe (r3)

- **Package diff.** The node built-in imports are identical, with no new child_process, http, https, net or tls. An
  acorn scan finds no new top-level I/O. The static graph grows from 187 to 223 modules, with nothing new outside the
  package.
- **Dynamic probe.** It wrapped child_process, net, tls, http, https, dgram, dns, fs, timers, `process.on` and
  `process.env`, with every `ANTHROPIC_*` variable set and a global tracer provider, propagator and context manager
  registered.
  - At import: no `ANTHROPIC_*` read.
  - At construction: only `ANTHROPIC_CUSTOM_HEADERS`.
  - On the request: exactly one fetch, to `api.anthropic.com/v1/messages`; no span, no inject, no console output, no fs
    write and no new listener.
- **Custom headers.** Unrefused, `ANTHROPIC_CUSTOM_HEADERS` could replace `Authorization` or the API version
  (`client.mjs:963-977`), so the refusal covers what matters.
- **Other telemetry.** No OpenTelemetry provider is registered anywhere in the product. Next 16.4.3's patched fetch
  creates only no-op spans and injects no trace context.

### Mutants, the hook and the commits (r3)

- **Mutants.** Eleven mutants of the client options and the refusal were each caught, including the refusal made
  untrimmed (the blank-value case fails).
- **Pre-push hook** at 20:56:59Z, against a remote holding only `bce57f16`: "8 commits checked: 0 file(s) read by the
  fixture guard, 16 text file(s) searched for an X12 header, and gitleaks found no secret", exit 0. The gitleaks 8.24.3
  archive matches the sha256 in `tools/gitleaks/release.txt`.
- **The commits.** `27a2d97d` is a clean merge. The other seven touch only the files their messages name, all eight
  carry the two required trailers, and none holds a model identifier or real data.

## Proposals outside PR A's files (not built)

- **P1. `dependency-upgrades.md:319-320` ("The Anthropic SDK").** Add:
  - re-read the SDK's environment reads, default-on telemetry and default headers at every version taken (MOD-17 pins
    the list);
  - a red MOD-17 inventory names a new environment read: close it before updating the constants;
  - once a real Anthropic entry exists, "passes the evaluation gate" for an SDK major means the people-run re-record of
    S2, not CI's local gate.

  This pairs with S1 and S2.
- **P2. Design P1, for #75's owner.** Record the API version each provider path sends in each baseline entry, and have
  `servingDecisions` refuse an entry whose version differs. The rule in S2 is then enforced in code. Also add "an API
  version change" to `model-evaluation.md:3-5` and `:199-207`.
- **P3. Trivy cannot see bundled JavaScript.** The web image bundles the SDK into `.next/standalone` chunks with no
  `package.json` (`apps/web/Dockerfile:38-42`), and the worker image carries `dist/` (`apps/worker/Dockerfile:33-43`).
  Options:
  - run `trivy fs` on `pnpm-lock.yaml`, or on an SBOM of each image's production closure;
  - or record in ADR 0010 that `pnpm audit --prod` covers the bundled closure.
- **P4. Read the model configuration once at web start** (an instrumentation `register()`), and pair it with the
  `MODEL_PATH_REFUSED` code. This would make D2's original "at startup" true.
- **P5. A built-artifact smoke in the build job:** `env -i … MODEL_PROVIDER=anthropic ANTHROPIC_CUSTOM_HEADERS='x: 1'
  node apps/worker/dist/evaluate-permitted.js --practice <uuid>`, expecting exit 2 and the refusal text.
- **P6. Cost beyond token counts.** `usage.service_tier`, `inference_geo` and (from 1.x) `speed` mark responses billed at
  other rates, and `callCost` assumes one price per provider and model. Record them in `model_call`, or refuse to price
  a response whose tier, speed or geo differs from what `config/models.json` assumes.
- **P7. Shorten the images job's log** by passing only the digest fields to the identity step, or writing scan summaries
  to `$GITHUB_STEP_SUMMARY`. Its METADATA dumps bury the Trivy tables in about 5,400 lines.
- **P8. PRD.md:571** (the founder's): add effort to the eligible list, and the page's caveat "Do not include PHI in JSON
  schema definitions". A gateway test could assert that `output_config.format.schema` is exactly the prompt version's
  committed schema. Today `messages.ts` copies `request.outputSchema`, and not every caller was checked.
- **P9. Next's patched fetch.** If the product ever registers an OpenTelemetry provider, Next's patched global fetch would
  emit a `fetch POST https://api.anthropic.com/v1/messages` span even with the SDK's tracing off. Name this in the ADR's
  revisit trigger, or pass the SDK a fetch captured before Next patches the global. The fetch dependency also carries
  Next's cache semantics. Not verified: how Next 16.4.3 treats an external POST in a server action.
- **P10. `eval/cli.ts`.** Add a top-level catch for `GatewayConfigError` that prints only the message and exits 2, as
  `permitted-cli.ts:63` does, with a unit test.
- **P11. Verify Sigstore signatures.** Run `npm audit signatures` in CI or in toolchain:check, so the signatures of
  added versions are verified, not only the presence and kind of provenance.
- **P12. Correct check-A's note.** It says "`lib/environments/worker.mjs` (not imported)". The module is imported at
  load; its reads run only inside `handleItem`.
- **P13. Design P6 stands.** When PRD.md:254's traces add a tracer provider, check every SDK in the process for
  default-on tracing, and keep trace context off the API and the Bedrock endpoint with an instrumentation filter.
- **P14 (writer's). Design §8.4 item 2's record names.** The design writes
  `lane-b-dependabot-batch-review-{A,B,C}-{lens}.md`, but these records are `lane-b-dependabot-batch-A-review-{lens}.md`.
  Align the design with the files.

## Commands and logs

All under `review-A/`:
- **Progress notes:** `progress/security-supply-r1.progress.md`, `-r2.progress.md`, `-r3.progress.md`.
- **Logs:** `progress/sec-logs/` (install, licenses, toolchain, tests, probe output), `progress/sec2-logs/` (audit at
  base and head, build, failure probes, merge-tree, trial with #75, worker-bundle smoke) and `progress/sec3-logs/`
  (trial trees with #93 and #42, mutants, the eval refusal, toolchain, licenses and verify on the merged base).
- **Scripts:** `scripts-sec/zz-reviewer-probe.test.ts` (the environment inventory, the direct-client probe, the
  custom-headers authorization probe); `scripts-sec2/` (failure probe); `scripts-sec-r3/` (trial, whole-package diff,
  dynamic probe); `scripts-refute-S1/scan.mjs` (the skeptic's inventory prototype).
- **Downloads:** each in its own directory under `tmp/` (tarballs, attestations, the provider's pages), treated as
  untrusted.
- **The writer's clone:** `clone-writer`, used 21:10Z to 21:12Z; clean, and removed at 21:17:49Z.
