export const meta = {
  name: 'lane-b-dependabot-batch-design',
  description: 'Design for Dependabot #87/#88/#89 taken as the build own PRs: four scouts, a writer, an adversarial reviewer and a completeness critic, per-finding refutation, a fold',
  phases: [
    { title: 'Scout', detail: 'SDK 1.x (#87); aws-cdk (#88); @aws-sdk and stripe (#89); routing fix and triage records' },
    { title: 'Write', detail: 'designs/lane-b-dependabot-batch.md' },
    { title: 'Review', detail: 'one adversarial reviewer and one completeness critic' },
    { title: 'Verify', detail: 'each B/S finding checked by a skeptic' },
    { title: 'Fold', detail: 'apply every confirmed finding, record dispositions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/design'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'
const REVIEW = '/home/user/ops/designs/lane-b-dependabot-batch-review.md'
const STATUS = '/home/user/ops/approval-summaries/lane-b-dependabot-batch-status.md'
const ITEM = '/home/user/ops/lanes/lane-b-item-prompts-2026-11-01/dependabot-batch.md'
const NOW = args && args.now ? args.now : '2026-11-01T17:00Z'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for a Lane B item session (session_01FcouKRD17iBBR4HhnYcQQx) that owns the item "dependabot-batch": Dependabot PRs #87 (@anthropic-ai/sdk 0.131.0 -> 1.3.0, a major, behind packages/model-gateway/src/providers/anthropic.ts), #88 (aws-cdk-lib 2.273.0 -> 2.274.0 and the aws-cdk CLI 2.1145.0 -> 2.1146.1) and #89 (minor-and-patch: nine @aws-sdk/* 3.1152.0 -> 3.1156.0 and stripe 23.0.0 -> 23.0.1), all into claude/build-platform, to be taken as the build's OWN PRs on co-001/ branches (docs/runbooks/dependency-upgrades.md: no Dependabot PR merges as it stands) and the bot PRs closed with a comment after each replacement merges. Now is about ${NOW}.

Read first, whole: the item file ${ITEM} (facts already checked: corrections 1-10, the merge order, the waiting list; trust them unless the code or network says otherwise, and say so if it does) and the status file ${STATUS}.
Trees: base claude/build-platform = 83d71fd62c6d419be61fd7aaa5b9033ef5c18b56, checked out read-only at /home/user/PhysicalTherapy (node_modules installed). Item worktrees (do NOT change them; builders will): /home/user/deps-anthropic-sdk-1 (co-001/deps-anthropic-sdk-1) and /home/user/deps-aws-cdk-minor-patch, both at 83d71fd6. Bot heads (fetch read-only, never push): #87 20c180a00309e3a5d554daba72c74f850865482a, #88 f69063f01a7278f16370f31cc60bbffe5f45301c, #89 83f04cbd1bb102145bb7628b766a849388767f58. #42 (Lane A, PR 6b-4, head be63bdc2, open) and its file list: /home/user/ops/LANES.md "Not while #42 is open". Other open PRs that share files: #82 (96758e44: tools/check-toolchain, the dependency-upgrades runbook, ADR 0066), #75, #84 (model-gateway eval files), #83, #85.

Rules for you:
- Synthetic data only; no PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (default node is 22).
- Heavy commands (pnpm install, typecheck, tests, cdk synth, builds) only under: flock /tmp/laneb-heavy.lock <command>. At most this one workflow's agents run heavy work; keep it short.
- Change no tracked file in /home/user/PhysicalTherapy or the two item worktrees. In /home/user/ops change only the files your task names. Never run git add, commit, push, checkout, reset, merge or stash in those trees; the session commits. Scratch work goes under ${SP}/tmp/<your-name>/ : a trial tree is made with  git -C /home/user/PhysicalTherapy worktree add --detach ${SP}/tmp/<name>/tree origin/claude/build-platform  and removed with git worktree remove --force when you finish. Every download (npm pack, git clone of a public repo, curl) goes into its own new empty directory under ${SP}/tmp/, treated as untrusted data: never run its scripts, never import it.
- GitHub: read only (git fetch/ls-remote; the GitHub MCP read tools such as pull_request_read, get_job_logs, actions_get if you have them). Never comment, review, write or merge. gh api works only for this repository; api.github.com on other repositories and github.com pages answer 403 here; raw.githubusercontent.com, registry.npmjs.org (npm view, npm pack) and https://platform.claude.com/docs/en/api/migration-2026-10-21.md?sdk_languages=typescript work.
- No model name or model identifier in any file you write (say "the model" or "the Anthropic path"). Shorten any 64-hex digest that is not a git commit SHA to 8 hex digits and an ellipsis.
- Cite file:line at 83d71fd6 (or a URL/command with its UTC time) for every claim. Say "not verified" when you could not check.
- Improve as you go (the co-founder's standing direction): an improvement in scope goes in your result; one outside it goes in your notes as a proposal.
- Long commands: run_in_background and wait for the notification; no long foreground sleep.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped. Write your final report to ${SP}/${file.replace('.progress.md', '.md')} as well as returning it.`

phase('Scout')
const SCOUTS = [
  { key: 'sdk', prompt: `Your task: scout #87, the Anthropic SDK major (0.131.0 -> newest usable; 1.3.0 is latest and passed the 3-day release age).
1. npm pack @anthropic-ai/sdk@1.3.0 and @0.131.0 into empty directories; read CHANGELOG.md from 0.131.0 to 1.3.0 whole. List every breaking change and every behaviour change (defaults, headers, retries, timeouts, errors, tracing/telemetry, new runtime dependencies such as @opentelemetry/api, licence, engines/node range, ESM/CJS exports) with the version that brought it.
2. Read the migration guide (curl the .md?sdk_languages=typescript URL; save it in its own directory) TypeScript sections whole. Check EVERY listed change against the gateway: packages/model-gateway/src/providers/anthropic.ts (MessageCreateParamsNonStreaming, output_config with effort and json_schema format, stream:false, the error classes used in anthropicFailure, maxRetries:0, timeout, the per-request options), messages.ts (how the response is read: content blocks, stop_reason, usage fields), providers.test.ts (around lines 150-170: APIError.generate and the error constructors, and how the client is mocked), and every other import of '@anthropic-ai/sdk' in the repository (grep apps packages tools eval). Check the API-version change (2026-10-21): what it changes in request/response shape for what the gateway sends and reads (e.g. output_config, effort, stop reasons, usage), and the auth header change (Authorization: Bearer): confirm no baseURL, proxy or allowlist in the repo reads X-Api-Key (grep infra, apps, packages, tools, docs).
3. Tracing: read the SDK source in the 1.3.0 tarball for the OpenTelemetry integration: what is on by default, what it emits with no tracer provider registered, whether it injects traceparent/tracestate headers onto requests even with no provider, what env vars and client options control it (openTelemetry: false, ANTHROPIC_OPEN_TELEMETRY, content mode), and whether a client option fully disables it including header propagation. Grep apps/ and packages/ for any OpenTelemetry registration (none expected). Read ADR 0048 lines 25-47 and 153 and any logging/redaction rule (references-only logging; PRD 14's ban on model-observability services: grep docs/product for it) and ADR 0070. Recommend the tracing decision (expected: openTelemetry: false in anthropicClient plus a provider test that pins it, and an ADR 0048 amendment), and say exactly how a test can prove it (the client's options, or an actual request through a fake fetch showing no traceparent header and no span).
4. Trial: make a trial tree (see rules), set packages/model-gateway's range to ^1.3.0, run  flock /tmp/laneb-heavy.lock pnpm install --lockfile-only  then  flock /tmp/laneb-heavy.lock pnpm install --frozen-lockfile  (or --offline if needed), then under the lock: pnpm --filter ./packages/model-gateway typecheck (or the repo's typecheck for that package), pnpm exec vitest run --project unit packages/model-gateway, pnpm test:golden (report counts), pnpm toolchain:check with BASE=origin/claude/build-platform, pnpm licenses:check. Report what the lockfile moved (git diff --stat and the changed package versions, notably @opentelemetry/api and anything else transitive) and whether any of it fails the 3-day age. Also try the tracing fix in the trial tree (openTelemetry: false) and confirm it typechecks. Remove the trial tree after.
5. Decide whether ADR 0048 needs more than the tracing amendment, whether ADR 0089 is needed (expected not), and which tests MOD-17/MOD-18 would be (e.g. MOD-17 the client is built with tracing off and no SDK retries; MOD-18 the request carries no trace-context header / the API version the SDK sends is recorded). Read docs/product/test-matrix.md's MOD rows and packages/synth's MOD module (module 9) to see how a MOD row and its synth case look.
${SAVE('scout-sdk.progress.md', 'each numbered item with findings as you finish it')}
Return a markdown report with sections 1-5 and a final "What the design must say" list.` },
  { key: 'cdk', prompt: `Your task: scout #88, the aws-cdk group.
1. npm view aws-cdk-lib and aws-cdk time/versions: list versions newer than 2.273.0 / 2.1145.0 with publish times, and which pass the 3-day release age now and at about 20:00 UTC today and at 2026-11-02 19:00 UTC. Check constructs too (the runbook groups it).
2. Read the aws-cdk-lib notes for every version taken (raw.githubusercontent.com/aws/aws-cdk/v2.275.0/CHANGELOG.v2.md, and any later usable): breaking changes, feature flags, deprecations, and every change to a module infra/lib uses (grep infra/lib for 'aws-cdk-lib/aws-*' imports and list the modules). Say for each whether it changes anything we synthesize.
3. The CLI: blobless clone of https://github.com/aws/aws-cdk-cli into an empty directory; git log between tags aws-cdk@v2.1145.0 and the newest usable (aws-cdk@v2.1146.1, and aws-cdk@v2.1147.0 if usable by build time), path packages/aws-cdk and anything it bundles; list breaking or behaviour changes (notices, telemetry, diff output, synth output, bootstrap version, node engine range). Check whether the CLI sends telemetry by default and whether infra/cdk.json or the cdk:diff script disables it (grep infra/cdk.json, package.json scripts, the ci.yml build job). Read infra/package.json and the root package.json cdk scripts.
4. Synth diff: on the base (/home/user/PhysicalTherapy, read-only; synth output goes to a directory you pass with -o under ${SP}/tmp/cdk/base, never into the tree if you can avoid it; if the infra synth script writes infra/cdk.out, run it in a trial tree instead) run the repository's synth (find the script: pnpm --filter @tp/infra synth or the cdk:diff fallback) under the lock; then in a trial tree with aws-cdk-lib and aws-cdk set to the newest usable versions (pnpm install --lockfile-only then --frozen-lockfile, under the lock), synth again. Diff the templates of tp-dev, tp-staging and tp-production (and every other stack/asset manifest): report every difference (expected: only CDK metadata/version strings, possibly bootstrap-version or asset hashes); explain each.
5. Read the ci.yml build job's cdk:diff step and its log on #88's CI (build job 123266121153 if your GitHub MCP get_job_logs can read it; else not verified) and what the item file says. Say what "the stack diff read before taking it" (runbook lines 273-277) means for this PR's description.
6. #42 overlap: list #42's infra files (LANES.md) and whether any change the notes call for lands in one of them (then it waits for #42's merge).
Remove trial trees after.
${SAVE('scout-cdk.progress.md', 'each numbered item with findings as you finish it')}
Return a markdown report with sections 1-6 and a final "What the design must say" list.` },
  { key: 'awssdk', prompt: `Your task: scout #89, the @aws-sdk packages and stripe.
1. Every @aws-sdk/* direct dependency in the repository's manifests on the base (apps/*, packages/*, infra, tools) with its range, and #42's three new ones (apps/web client-sesv2 and client-sts, apps/worker client-sqs: read #42's head be63bdc2 manifests via git fetch origin pull/42/head or the branch name from git ls-remote). Note: #89 moves nine; is @aws-sdk/client-sts in infra (^3.1152.0) among them or not, and why (group routing?). Explain every package #89 moves and every one it leaves.
2. npm view times for each @aws-sdk package's versions 3.1153.0 .. latest, and stripe 23.0.1 / 23.1.0 / later: which pass the 3-day release age now (${NOW}), at about 20:00 UTC today, and at 2026-11-02 19:00 UTC. Note the transitive @smithy/* and @aws-sdk/* (core, credential providers, middleware) the newest versions pull and their ages (pnpm toolchain:check decides; read tools/check-toolchain to know exactly what it checks: age of every lockfile-added version? exclusions? the trust policy).
3. Release notes: read the aws-sdk-js-v3 CHANGELOG entries (raw.githubusercontent.com/aws/aws-sdk-js-v3/v3.<n>.0/clients/client-bedrock-runtime/CHANGELOG.md and the top-level CHANGELOG.md, and the same for each client we use) from 3.1152.0 to the newest usable; flag anything in client-bedrock-runtime (the default model path: read packages/model-gateway/src/providers/bedrock.ts to see exactly which commands, body shape bedrock-2023-05-31, and options it uses), client-s3/s3-request-presigner (presigned URL shape, checksum defaults), client-kms, client-textract, client-cognito-identity-provider, client-rds, client-sesv2, client-sts. stripe: read its CHANGELOG 23.0.0 -> newest usable (23.1.0 is a minor), and packages/billing's use of it (API version pinned? read the client construction).
4. Trial: a trial tree with every @aws-sdk range (including client-sts in infra if the group should have moved it) and stripe raised to the newest usable today, pnpm install --lockfile-only then --frozen-lockfile under the lock; run pnpm typecheck (under the lock), the unit project for model-gateway, billing, db, contracts and apps' tests that import these clients, pnpm toolchain:check (BASE=origin/claude/build-platform), pnpm licenses:check, and pnpm exec tsx tools/screening-capacity/watched.ts --write (report the watched-paths diff). Report the lockfile's moves. Remove the tree after.
5. Mutation: runbook line ~277 says @aws-sdk reaches pricing and packets through the lockfile; read stryker/shards.json and the CI mutation selection logic to say which shards a lockfile change selects (and why #89 ran 6 shards and #87 7) and what the fix round must run locally.
${SAVE('scout-awssdk.progress.md', 'each numbered item with findings as you finish it')}
Return a markdown report with sections 1-5 and a final "What the design must say" list.` },
  { key: 'routing', prompt: `Your task: scout the TRIAGE RECORD and the GROUP ROUTING FIX.
1. Read docs/runbooks/dependency-upgrades.md whole, docs/runbooks/model-evaluation.md lines 1-80, .github/dependabot.yml whole, tools/test/dependabot-config.test.ts whole (test-matrix CI-12), ADR 0066 Part 2 (line 271 on; find where Part 2 ends), ADR 0048 lines 25-47 and 153, ADR 0070 (skim; what it says about provider or SDK changes and the gate), /home/user/ops/approval-summaries/lane-b-ci-deps-dependabot-2026-10-28.md and /home/user/ops/designs/lane-b-ci/scout-dependency-policy.md. Summarize what each requires of this item.
2. Dependabot's routing: clone https://github.com/dependabot/dependabot-core blobless into an empty directory and find where groups are matched (search updater/lib and common/lib for "belongs to more specific group", "most specific", DependencyGroup, specificity). Explain exactly how Dependabot picks a group when several match: how specificity is computed (exact names vs wildcard patterns vs update-types), why '@aws-sdk/*' and '@next/eslint-plugin-next' lose to minor-and-patch, and why exact names keep theirs. Cite file:line at the commit you read (give its SHA). Confirm with run 40818560725's log if your GitHub MCP get_job_logs can read job 123265353642 (lines 160-226, 2367); else rely on the item file.
3. Design the fix. Candidates: exclude-patterns on minor-and-patch listing every pattern a specific group owns; or restructuring. Check dependabot.yml's documented keys (patterns, exclude-patterns, dependency-type, update-types, applies-to) in dependabot-core's config parser and the docs (github/docs blobless sparse clone of content/code-security/dependabot; cite). Recommend the exact new YAML, and check that with it every currently-intended group membership holds (list each group's intended members from the file's comments) and that the security group and applies-to semantics are unchanged. Fix the comment at line ~48. Then the test: what tools/test/dependabot-config.test.ts must assert so the bug cannot return (e.g. every pattern of a specific npm group appears in minor-and-patch's exclude-patterns; a pure-JS model of Dependabot's specificity rule applied to the repository's direct dependencies gives each the intended group). Write the failing-first test idea.
4. CI-12 amendment: read docs/product/test-matrix.md's CI section and CI-12's row, packages/synth's CI module (matrix.ts and registry.ts entries for CI-12; how synth --all checks them; fixtures?) and say exactly what changes. Check whether #82, #83, #85, #75, #84 or #42 change the same rows/files (git fetch their heads read-only: git ls-remote origin to find branch names) so the design names the rule-6 resolution.
5. Triage steps 1-6 as they apply to these PRs: step 1 (Dependabot runs since 2026-10-28; read the list with gh api repos/PureTideWater/PhysicalTherapy/actions/runs?event=dynamic&created=>=2026-10-28 if it works, else the item file's 40818560725, 40634046721, 40634047077), step 2 (each PR's checks: read through pull_request_read get_status/get_check_runs if available), step 3 (alerts: the API answers 403, item 8), steps 4-6 as the runbook defines them. Also: whether the runbook itself needs an edit (e.g. the routing claim, "Each open Dependabot pull request" process, the record) and whether ADR 0066 Part 2 needs an amendment for the routing fix (and whether #82 also edits those files: then merge after #82, keeping both).
6. One PR or two for #88 and #89: trial-merge the two bot heads (git merge-tree) and against #42's head; recommend.
${SAVE('scout-routing.progress.md', 'each numbered item with findings as you finish it')}
Return a markdown report with sections 1-6 and a final "What the design must say" list.` },
]

const scouts = await parallel(SCOUTS.map(s => () => agent(`${COMMON}\n\n${s.prompt}`, { label: `scout:${s.key}`, phase: 'Scout' })))
const [sdk, cdk, awssdk, routing] = scouts.map((r, i) => r || `(scout ${SCOUTS[i].key} returned nothing; read ${SP}/scout-${SCOUTS[i].key}.md or its progress file if present)`)

phase('Write')
const written = await agent(`${COMMON}

Your task: WRITE the design ${DESIGN} from the four scout reports below (also in ${SP}/scout-*.md). Re-check any claim you rely on that looks shaky.

=== #87 SDK ===
${sdk}

=== #88 CDK ===
${cdk}

=== #89 @aws-sdk and stripe ===
${awssdk}

=== TRIAGE AND ROUTING ===
${routing}

The design is the weekly triage record (dependency-upgrades.md "The weekly triage" steps 1-6) applied to #87, #88 and #89, and the build plan for the two (or three) replacement PRs. Sections:
1. Summary and decisions (each decision: the options, the recommended one, why; security the safer option; the founder's standing rule: best option, never weighted by effort).
2. The triage, steps 1-6, with evidence and what waits on a person (alerts: 403; a real-model evaluation; a credentialed cdk:diff).
3. #87: versions taken and ages; every changelog and migration-guide item checked against the gateway (a table: change, applies?, evidence, action); the API version; auth header; tracing decision with its test; the lockfile's transitive moves (@opentelemetry/api etc.) and why mutation runs all shards; ADR 0048 amendment text (or ADR 0089 if truly needed; say why not); MOD-17/MOD-18 rows and synth cases if added (exact row text); what the gate (pnpm test:golden plus the provider tests) shows; the real-model record waiting on people.
4. #88: versions; notes read; CLI changes (and telemetry); the synth diff stand-in for cdk:diff with its results; #42 interplay.
5. #89: versions; notes read per client; bedrock-runtime specifics; stripe; #42's three new ranges aligned if #42 has merged by build/merge time; the mutation shards.
6. The routing fix: the root cause with dependabot-core cites, the exact YAML, the comment fix, the test change (failing first), CI-12's matrix row, synth matrix.ts/registry.ts entries, runbook/ADR 0066 Part 2 text if any; whether it goes in the #88/#89 PR.
7. Versions rule: "the newest each range allows under the 3-day release age at build time", with the expected versions per time window, and how the builder decides (npm view times plus pnpm toolchain:check; never an exclude).
8. PR plan: branches (one PR for #88+#89 unless the scouts show a reason to split), files per PR, commits (failing-first test commits for the routing test and the tracing test), the full local suite for the fix round (unit; golden; oracle; test:db in 4 shards; build, stamp, e2e with E2E_PREBUILT=1; the affected Stryker shards: all 7 for #87 while @opentelemetry/api moves, and the pricing/packets shards (6) for #89 as CI selects; verify-content and synth (synth --all if CI-12's row changes); actions:check and toolchain:check; screening:capacity), the PR description contents (what was read, ages, the template diff, the gate and tracing results), merge order (#87's PR after #75 and #84; the #88/#89 PR after #42 and #82, rule 6), regeneration of generated files at merge, closing the bot PRs with a comment (wording draft, ending with the Claude Code footer: "\\n\\n---\\n_Generated by [Claude Code](https://claude.ai/code)_"), and what never happens (never merge or push a bot branch; never @dependabot ignore).
9. Numbers used (ADR 0089 used or released; MOD-17/18; CI-12 amended) and any COUNTER REQUEST.
10. Engineering choices made here, and proposals outside this item.
Plain sentences, file:line cites, no model names.
${SAVE('write.progress.md', 'which sections are written')}
Return a summary of the design: every decision in one line each, and the PR plan.`, { label: 'write', phase: 'Write' })

phase('Review')
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      id: { type: 'string', description: 'B1, S2, N3 ... (B blocking, S should fix, N nit)' },
      severity: { type: 'string', enum: ['B', 'S', 'N'] },
      title: { type: 'string' },
      claim: { type: 'string', description: 'what is wrong, with the design text it concerns' },
      evidence: { type: 'string', description: 'file:line, command output or URL with UTC time' },
      fix: { type: 'string' },
    }, required: ['id', 'severity', 'title', 'claim', 'evidence', 'fix'] } },
    text: { type: 'string', description: 'the review as markdown' },
  },
  required: ['findings', 'text'],
}
const [review, critic] = await parallel([
  () => agent(`${COMMON}

Your task: ADVERSARIAL REVIEW of the design ${DESIGN}, as a security and supply-chain reviewer (.claude/agents/security-reviewer.md's lens, plus ADR 0048 and ADR 0070 for the SDK) and a CI-infrastructure reviewer at once. The writer's summary:
${written}

Read the design whole, then check every claim against the base tree, the network (npm view, npm pack, the changelogs, dependabot-core) and the scouts' reports in ${SP}/scout-*.md. Hunt for: a breaking change in SDK 1.x the gateway would hit that the design missed (errors, headers, API version, response fields, retries, timeout, tracing, ESM/CJS, Node range); a tracing decision that leaves header propagation or spans on; any path where prompts or responses could leave the process (logging, spans); a version that would fail the 3-day release age or the trust policy, or a transitive move unaccounted for; a CDK change that alters a stack; an @aws-sdk change that alters a request the app sends (Bedrock body, presigned URL, checksums); a routing fix that silently moves a dependency to the wrong group, breaks the security group, or that Dependabot's config parser rejects; a test that cannot fail first; counts or matrix IDs that collide (MOD-17/18 reserved; CI-12 amended); a merge-order or rule-6 conflict missed (#42, #82, #75, #84, #83, #85); anything that needs a migration, a founder-kept decision, a secret, or touches a "Not while #42 is open" file; anything the pipeline (draft PR, two adversarial reviews, the fix round with the full suite, the fresh-clone verification, the merge rules) would trip on.
${SAVE('review.progress.md', 'findings so far')}
Write the review to ${REVIEW} (numbered findings B/S/N, each with evidence and fix), and return it in the schema.`, { label: 'review', phase: 'Review', schema: FINDINGS }),
  () => agent(`${COMMON}

Your task: COMPLETENESS CRITIC of the design ${DESIGN}. Do not re-review correctness line by line; ask what is MISSING: a source not read (a changelog version range skipped, a client not checked, a migration-guide item not mapped), a modality not run (a trial install, a typecheck, the golden gate, a synth diff, toolchain:check, licenses:check, watched.ts), a claim not verified, a triage step not covered, a file the PRs must touch that the plan omits (test-matrix, synth matrix/registry, ADR, runbook, watched-paths.txt, the PR template's sections), a record the item file asks for that the design lacks, an item-file instruction not followed. Check the design against ${ITEM} point by point ("Exact next step" 2 to 9, "Merge order and dependencies", "Waiting on someone").
${SAVE('critic.progress.md', 'gaps found so far')}
Return the gaps in the schema (severity B if the pipeline cannot proceed without it, S if it should be in the design, N otherwise); text is the markdown list.`, { label: 'critic', phase: 'Review', schema: FINDINGS }),
])

const all = [...((review && review.findings) || []).map(f => ({ ...f, src: 'review' })), ...((critic && critic.findings) || []).map(f => ({ ...f, id: 'C-' + f.id, src: 'critic' }))]
const toVerify = all.filter(f => f.severity !== 'N')
log(`${all.length} findings (${toVerify.length} B/S to verify; ${all.length - toVerify.length} nits go straight to the fold)`)

phase('Verify')
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, reason: { type: 'string' }, correctedFix: { type: 'string' } }, required: ['real', 'reason'] }
const verdicts = await parallel(toVerify.map(f => () => agent(`${COMMON}

Your task: try to REFUTE this finding against the design ${DESIGN}. Check it yourself against the code, the network or the docs; default to real=true only if you confirm it. If it is real but the proposed fix is wrong or not the best option, give correctedFix.
Finding ${f.id} (${f.severity}, from the ${f.src}): ${f.title}
Claim: ${f.claim}
Evidence given: ${f.evidence}
Proposed fix: ${f.fix}`, { label: `verify:${f.id}`, phase: 'Verify', schema: VERDICT }).then(v => ({ ...f, verdict: v }))))

phase('Fold')
const judged = verdicts.filter(Boolean)
const fold = await agent(`${COMMON}

Your task: FOLD the review into the design ${DESIGN}. The findings, each with a skeptic's verdict:
${JSON.stringify(judged, null, 1)}
Nits (unverified; apply if right):
${JSON.stringify(all.filter(f => f.severity === 'N'), null, 1)}
Full review: ${REVIEW}. Critic's text:
${critic ? critic.text : '(none)'}

Fix every finding whose verdict is real (use correctedFix where given), taking the recommended option (security: the safer one). For a refuted one, answer it with the skeptic's evidence. If a finding needs work the scouts did not do (a trial, a read), do it now. Then append a final section "Review of the design (${NOW.slice(0, 10)})": one line of totals and, per finding, its disposition (Fixed / Fixed by another means / Not taken) with the reason. Also copy the four scout reports from ${SP}/scout-*.md to /home/user/ops/designs/lane-b-dependabot-batch/scout-{sdk,cdk,awssdk,routing}.md (shorten non-commit 64-hex digests as the rules say).
${SAVE('fold.progress.md', 'each finding and its disposition as you go')}
Return: the totals, each disposition in one line, and the design's final PR plan section verbatim.`, { label: 'fold', phase: 'Fold' })

return { written, reviewCount: all.length, verified: judged.map(f => ({ id: f.id, real: f.verdict && f.verdict.real })), fold }