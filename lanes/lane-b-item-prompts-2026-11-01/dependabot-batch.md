## Your item
This item covers Dependabot's batch of 2026-10-29: three bot PRs into `claude/build-platform`, all untouched until now.
- **#87:** `@anthropic-ai/sdk` 0.131.0 → 1.3.0. This is a major version of the SDK behind the model gateway's Anthropic path (`packages/model-gateway/src/providers/anthropic.ts`).
- **#88:** the aws-cdk group. `aws-cdk-lib` goes 2.273.0 → 2.274.0 and the `aws-cdk` CLI goes 2.1145.0 → 2.1146.1.
- **#89:** the minor-and-patch group, 10 updates. Nine `@aws-sdk/*` packages go 3.1152.0 → 3.1156.0: eight clients, including `client-bedrock-runtime` (the default model path), plus `s3-request-presigner`. `stripe` goes 23.0.0 → 23.0.1.

`docs/runbooks/dependency-upgrades.md` says no Dependabot PR merges as it stands (lines 10–12 and 62–68). Lines 273–277 add that the `anthropic-sdk` group passes the evaluation gate in a deliberate PR, and that a CDK bump has its stack diff read before it is taken. So you take each one as the build's own PR on a `co-001/` branch, then close the bot PRs with a comment. #88 and #89 may become one PR once their notes are read. #87 is a PR of its own, decided by the evaluation gate the build can run and by the gateway's tests.

Why now: all three have been open since 2026-10-29. Thursday's npm run (2026-11-05 04:31 UTC) will refresh them or open new ones.

### Branch and head
Checked with `ls-remote` at 2026-11-01 16:38 UTC.
- **No build branch exists for this item, and there are no WIP refs.** The only `*dep*` branches are the bot heads, `co-001/ci-deps` (7b6b10be, merged as #48) and `co-001/main-dependabot-template` (07e78d20, #27's leftover into `main`). Neither of the last two is this item's.
- **Base** `claude/build-platform`: `83d71fd62c6d419be61fd7aaa5b9033ef5c18b56`.
- **Bot heads.** Each is one commit on 83d71fd6. Never push to them, merge them or build on them:
  - #87 `dependabot/npm_and_yarn/anthropic-sdk-0108099cd9`: `20c180a00309e3a5d554daba72c74f850865482a`
  - #88 `dependabot/npm_and_yarn/aws-cdk-aa56e09301`: `f69063f01a7278f16370f31cc60bbffe5f45301c`
  - #89 `dependabot/npm_and_yarn/minor-and-patch-b784602af0`: `83f04cbd1bb102145bb7628b766a849388767f58`
- **Branches to create** from `origin/claude/build-platform`:
  - `co-001/deps-anthropic-sdk-1` for #87;
  - `co-001/deps-aws-cdk-minor-patch` for #88 and #89. If the design splits them, use `co-001/deps-aws-cdk` and `co-001/deps-minor-patch`.

### PR
- **Bot PRs #87, #88 and #89:** open, not drafts, mergeable `clean`, base 83d71fd6, no comments.
- **CI on each head is green**, including the four required checks (`all green`, `mutation`, `screening-capacity gate`, `approval-of-record`):

  | PR | Check runs | Result | Stryker shards |
  |---|---|---|---|
  | #87 | 27 | 26 success, 1 skipped (`notify`) | 7 |
  | #88 | 21 | 19 success, 2 skipped (`notify`, `stryker`) | none |
  | #89 | 26 | 25 success, 1 skipped (`notify`) | 6 (packets ×3, pricing ×3) |

  #87's 7 shards are all of `stryker/shards.json`.
- **Build PRs:** none yet. Open a draft PR into `claude/build-platform` for each branch at the build stage.

### Design
None exists on build-ops at 15725ba2. Write `designs/lane-b-dependabot-batch.md` as stage 1. Read first:
- `docs/runbooks/dependency-upgrades.md` (whole), and `docs/runbooks/model-evaluation.md` lines 1–80 (lines 7–10: people only).
- `.github/dependabot.yml`, and `tools/test/dependabot-config.test.ts`, which is test-matrix CI-12 and pins every group's shape.
- ADR 0048: lines 25–47 (both SDKs; mocked-client tests) and line 153 (provider retries off).
- ADR 0066 Part 2 (line 271 on), and ADR 0070.
- `approval-summaries/lane-b-ci-deps-dependabot-2026-10-28.md`, the previous read of Dependabot's runs.
- `designs/lane-b-ci/scout-dependency-policy.md`, the 2026-10-24 scout, which cloned dependabot-core.

### Status file
`approval-summaries/lane-b-dependabot-batch-status.md` does not exist at 15725ba2. The orchestrator creates it; if it is still absent when you start, create it. There is no LANES.md claim row for this item at 15725ba2. Item sessions do not edit LANES.md (session brief §7), and rule 3 needs the claim before design work, so confirm the row first.

Records that live state contradicts. Correct these first:
1. **Wrong home.** The handoff files this item under "Lane B's CI triage (ci-deps)". `lane-b-ci-deps-status.md` is the CI series' file and now #82's (P1, then P2 and P4) live status file. Do not write this item in it.
2. **Wrong group.** #89 holds the nine `@aws-sdk/*` packages that `.github/dependabot.yml` routes to the `aws-sdk` group.
   - Dependabot run 40818560725 (job 123265353642), lines 168–226, says for each of the nine: "Skipping … for group 'aws-sdk' - belongs to more specific group 'minor-and-patch'".
   - Line 160 says the same for `@next/eslint-plugin-next` against `next`.
   - Line 2367: "Skipping update group for 'aws-sdk' as it does not match any allowed dependencies".
   - Exact names kept their groups: `next` itself, `pg-boss`, `@anthropic-ai/sdk`, `aws-cdk`, `aws-cdk-lib`, and the browser-tests names. Only wildcard patterns lost.
   - So the file's comment "A dependency joins the first group that matches it" (line 48) is false for wildcard patterns.
3. **#88 moves more than `aws-cdk-lib`.** It also moves the `aws-cdk` CLI, 2.1145.0 → 2.1146.1.
   - CI's `pnpm cdk:diff` produced no diff. Build job 123266121153, line 463: "no usable AWS credentials, so every stack was synthesized instead".
   - 2.274's breaking notes are L1 schema changes only: CloudWatch AnomalyDetector, Glue Table, IoT PolicyPrincipalAttachment, QuickSight. None of them appears in `infra/lib` on the base or on #42's be63bdc2.
   - Of the modules 2.274's notes touch, only cloudfront is used here (`infra/lib/constructs/edge.ts`; feature additions only).
4. **#87 moves more than the SDK.**
   - SDK 1.x newly depends on `@opentelemetry/api ^1.4.1` (0.131.0 did not). The lockfile therefore moves `@opentelemetry/api` 1.9.1 → 1.10.0 (published 2026-10-20), the peer of next 16.4.3, pg-boss 12.38.0, drizzle-orm 0.45.4 and vitest 5.0.5.
   - That is why #87's mutation ran all 7 shards (money-ledger as well), where #89 ran 6. The gateway has no Stryker shard.
   - #87's `static` and `unit` passed on the unchanged gateway code.
5. **What #87 also brings** (SDK CHANGELOG, `npm pack`):
   - **1.0.0's breaking change is API version `2026-10-21`.** Per the claude-api skill's API-version guide, 1.0.0 is the first TypeScript release that sends it by default.
   - **0.134.0 added native OpenTelemetry tracing, on by default.** It makes spans through any globally registered tracer provider and puts trace-context headers on requests. `ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE=content` puts prompts and responses into those spans. It is turned off by `openTelemetry: false` on the client, or by `ANTHROPIC_OPEN_TELEMETRY=false`. Nothing in `apps` or `packages` registers a tracer today.
   - **The licence is now Apache-2.0** (was MIT). `tools/check-licenses/allowlist.json` already allows it.
6. **"Decided by the model-eval gate" needs care.**
   - A real-model evaluation is people only; no build session or CI job runs one (`model-evaluation.md` lines 7–10).
   - `eval/baseline.json` holds 2 entries, both `local`. All 24 floors in `eval/floors.json` are `null`.
   - So the gate the build can run is the local one: `pnpm test:golden` (the Vitest `golden` project, including `packages/model-gateway/eval/gate.golden.test.ts`), plus the gateway's provider tests.
7. **Newer versions exist.** Published times from `npm view`, and when each passes the 3-day release age:

   | Package | Version | Published (UTC) | Usable |
   |---|---|---|---|
   | `@anthropic-ai/sdk` | 1.3.0 (latest) | 2026-10-23 23:31 | now |
   | `aws-cdk-lib` | 2.275.0 | 2026-10-26 19:32 | now |
   | `aws-cdk` | 2.1147.0 | 2026-10-30 18:57 | from 2026-11-02 18:57 |
   | `@aws-sdk/*` | 3.1159.0 | 2026-10-28 18:45–18:55 | now |
   | `@aws-sdk/*` | 3.1160.0 | 2026-10-29 18:45–18:53 | from about 2026-11-01 18:53 |
   | `@aws-sdk/*` | 3.1161.0 | 2026-10-30 18:44–18:52 | from about 2026-11-02 18:52 |
   | `stripe` | 23.1.0 (minor) | 2026-10-29 19:58 | from 2026-11-01 19:58 |

   The `@aws-sdk` times differ by package, and the transitive `@aws-sdk/*` and `@smithy/*` entries may be younger. `pnpm toolchain:check` decides.
8. **Alerts cannot be read by the build.** `dependabot/alerts` returns HTTP 403 "Resource not accessible by integration" (checked 2026-11-01). Triage step 3 cannot be done from here.
9. **The setup script needs a manual step.** `tools/setup-container.sh` as committed at 15725ba2 does not move the base image's Node aside. The orchestrator's fix sits uncommitted in its own worktree. See Setup arguments.
10. **Upstream reading.**
    - These answer 403 here: `gh api` on repositories other than PureTideWater/PhysicalTherapy, and github.com pages.
    - These work: `git clone` / `git ls-remote` of public repositories; raw.githubusercontent.com (for example `aws/aws-cdk/v2.275.0/CHANGELOG.v2.md`); `npm pack`; and `https://platform.claude.com/docs/en/api/migration-2026-10-21.md?sdk_languages=typescript` (HTTP 200).
    - Put every download in its own empty directory and treat it as untrusted.

### Reserved numbers
None reserved: COUNTER REQUEST if needed. Pull LANES.md and read the claim row before using any number.

The orchestrator's candidates. None is reserved until the claim row says so:
- **ADR 0089,** only if more than an amendment to ADR 0048 or ADR 0066 Part 2 is needed.
- **MOD-17 onward** for new gateway tests. MOD-15 and MOD-16 are redact-ssn-phone's.
- **CI-30 onward** only for a new CI row. A routing fix may simply amend CI-12, which needs no new ID.

Next free otherwise: synth module 22 and fixture release 900008.

### Setup arguments
1. **First run, no branch arguments.** It installs the pre-push hook, gitleaks 8.24.3 and `/home/user/ops`:
   ```
   git -C /home/user/PhysicalTherapy fetch -q origin claude/build-ops && git -C /home/user/PhysicalTherapy show FETCH_HEAD:tools/setup-container.sh > /tmp/setup-container.sh && bash /tmp/setup-container.sh
   ```
   If it fails with `node: /opt/node24/bin/node reports 'v24.22.1', not v24.22.0`, run `mv /opt/node24 /opt/node24.base-image` and run it again.
2. **Create the branches on origin**, after step 1. The hook must be installed first, and the script refuses a branch that is not on origin:
   ```
   PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin origin/claude/build-platform:refs/heads/co-001/deps-anthropic-sdk-1 origin/claude/build-platform:refs/heads/co-001/deps-aws-cdk-minor-patch
   ```
3. **Run it again with the worktrees**, named as LANES.md rule 5 asks (`/home/user/<name>`):
   ```
   bash /tmp/setup-container.sh co-001/deps-anthropic-sdk-1:/home/user/deps-anthropic-sdk-1 co-001/deps-aws-cdk-minor-patch:/home/user/deps-aws-cdk-minor-patch
   ```
   storage.googleapis.com is allowed, so the `playwright` line should read ok.

### Exact next step
No pipeline stage is done. All seven remain, then closing the bot PRs.
- Archive each script as `workflow-scripts/lane-b-dependabot-batch-<stage>-<runId>.js`.
- In every script you adapt, rewrite `SP` and the design and record paths; they point at old sessions' scratchpads.
- Run every heavy command under `flock /tmp/laneb-heavy.lock` with `PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH`.
- Before each heavy workflow, schedule a `send_later` about 5 h 10 min ahead. Usage: the co-founder said at 14:40 UTC that weekly use is under 20% and to go wide. This 5-hour window resets at 19:10 UTC.

1. **Machine and records.**
   - Run the setup steps above. Record what `gh api user --jq .login` prints (expected: PureTideWater).
   - Pull build-ops and confirm LANES.md has this item's claim row. If it does not, write "CLAIM ROW MISSING" at the top of the status file and start no design until it appears.
   - Correct or create the status file with the facts above.
2. **Design, with one reviewer.** Adapt `workflow-scripts/lane-b-ci-pin-age-reread-wf_05b5c43a-d57.js` (scouts, write, one adversarial reviewer, fold). The design is the triage record, "The weekly triage" steps 1–6, applied to these PRs. Step 1 (runs since 2026-10-28): 40818560725, 40634046721 and 40634047077, all success, no "release-age block". Step 3 waits on a person (below).
   - **#87.** Read the SDK CHANGELOG from 0.131.0 to 1.3.0 (`npm pack @anthropic-ai/sdk@1.3.0` into an empty directory). Read the migration guide's TypeScript section through the `.md?sdk_languages=typescript` URL above.
     - Check each change against `anthropic.ts`: `MessageCreateParamsNonStreaming`, `output_config` (effort and `json_schema` format), the error classes, `maxRetries: 0`, `timeout`.
     - Check it against `packages/model-gateway/src/providers/providers.test.ts` lines 156–166 (`APIError.generate` and the error constructors).
     - Check every change the guide lists against the gateway's code. The gateway sends no `temperature`, `top_p` or `top_k`, and one user text block (no assistant documents, no `citations`). The guide also lists: `MessageParam` is a union with one type per role; a client holds one credential; Text Completions is removed; the API key is sent as `Authorization: Bearer`. On the last, check that nothing between the gateway and the API reads `X-Api-Key`; on the base the client sets no `baseURL`.
     - The Bedrock path builds its own body (`bedrock.ts`, `bedrock-2023-05-31`), and the SDK does not move it.
     - **Decide SDK tracing.** The safer option is `openTelemetry: false` in `anthropicClient`, with a provider test, because of ADR 0048's references-only logging and PRD 14's ban on model-observability services. Record it in an ADR 0048 amendment.
     - Decide whether ADR 0048 needs anything more.
   - **#88.** Read the 2.274 and 2.275 notes (raw `CHANGELOG.v2.md`). Read the CLI changes from 2.1145.0 to the version you take: a blobless clone of aws/aws-cdk-cli, the log between tags `aws-cdk@v2.1145.0` … `aws-cdk@v2.1147.0`, path `packages/aws-cdk`. Then run `pnpm --filter @tp/infra synth` on the base and on the bump, and diff the `infra/cdk.out` templates for `tp-dev`, `tp-staging` and `tp-production`. That diff stands in for the credentialed `cdk:diff`. Any change the notes call for in a file #42 changes (`infra/lib/{mail,deploy-parameters,platform-stack}.ts`, `infra/lib/constructs/{compute,database,…}.ts`) waits for #42's merge (LANES.md "Not while #42 is open").
   - **#89.** Read the `@aws-sdk` notes for the nine packages (`client-bedrock-runtime` with care) and stripe's notes (23.1.0 is a minor).
   - **Versions.** Take the newest each range allows under the 3-day release age at build time. Read every taken version's notes. Say so in the design.
   - **Routing fix.** Find in dependabot-core (clone it into an empty directory) why wildcard patterns lose to `minor-and-patch`, and fix the config. One candidate is `exclude-patterns` on `minor-and-patch`. Then fix the line-48 comment and amend CI-12: `dependabot-config.test.ts`, its test-matrix row, and the synth `matrix.ts` and `registry.ts` entries. It goes in the #88/#89 PR.
   - **One PR or two.** Decide whether #88 and #89 are one PR. The default is one: both touch `infra/package.json` and the lockfile, and their trial merge is clean.
3. **Builders, one per branch.** Adapt `workflow-scripts/lane-b-ci-pin-age-build-wf_6cbdbf9d-9c3.js`.
   - Set the ranges, then `pnpm install --lockfile-only`. Never edit the lockfile by hand.
   - Then run `pnpm exec tsx tools/screening-capacity/watched.ts --write`, `pnpm licenses:check`, and `pnpm toolchain:check` with `BASE=origin/claude/build-platform`.
   - If #42 has merged by then, move its new ranges to the same version: `@aws-sdk/client-sesv2` and `client-sts` in `apps/web`, `client-sqs` in `apps/worker`.
4. **Draft PRs at once.** Fill the description from `.github/pull_request_template.md`, every section, under 65,536 characters. Say what was read, each version's age, the template diff, and the gate and tracing results. Write it with MCP `update_pull_request` and read it back. Call `subscribe_pr_activity`.
5. **Two adversarial reviews per PR,** each in a fresh clone:
   - CI and test infrastructure;
   - security and supply chain, given `.claude/agents/security-reviewer.md` (for #87, also ADR 0048, ADR 0070 and the tracing decision).

   Adapt `workflow-scripts/lane-b-ci-browser-reviews-wf_7b903031-7ca.js`. Model the records on #82's `approval-summaries/lane-b-ci-pin-age-review-ci-infra.md` and `-review-security-supply.md`. No person sees the change, so there is no UX review.
6. **Fix round, with the full local suite once,** then one push. Adapt `workflow-scripts/lane-b-ci-pin-age-fix-round-wf_dfb43bb4-b4c.js`. The suite:
   - unit; `pnpm test:golden` (with the evaluation gate); `pnpm test:oracle`;
   - `test:db` in 4 shards;
   - build, stamp, e2e with `E2E_PREBUILT=1`;
   - the affected Stryker shards: pricing and packets for `@aws-sdk` (runbook line 277; 6 on #89); all 7 (in full, runbook line 69) while `@opentelemetry/api` moves;
   - `pnpm verify-content` and synth's check (`pnpm synth --all` if CI-12's row changes);
   - `pnpm actions:check` and `pnpm toolchain:check`;
   - `pnpm screening:capacity`: `pnpm-lock.yaml`, `package.json`, `apps/*/package.json` and `packages/*/package.json` are watched (`watched-paths.txt` lines 9–23).
7. **Fresh-clone verification** that reads CI on the head. Adapt `workflow-scripts/lane-b-ci-pin-age-verify-wf_4dac1326-48a.js`.
8. **Merge,** in the order below.
   - Merge the base in with a merge commit.
   - Regenerate the lockfile and `watched-paths.txt`, and run `pnpm synth --all` if matrix files changed.
   - Get CI green on all four required checks, mark ready, and wait for approval-of-record's re-run.
   - Then `merge_pull_request` with method merge and `expectedHeadSha`.
9. **Close the bot PRs.**
   - When each replacement merges, close the bot PR(s) it replaces (MCP `update_pull_request`, state closed). Add one comment naming the build PR and its merge commit, ending with the Claude Code footer.
   - Dependabot says closing a group PR ignores nothing (its comment on #33). If Dependabot has already closed one as up to date, only comment.
   - Never use `@dependabot ignore` (it is stored outside the file). Never merge or push a bot branch. Never write files through the GitHub connector.
   - Then unsubscribe, read the push runs, clean the worktrees and update the status file.

### Merge order and dependencies
These overlaps were found by trial merges with `git merge-tree` on the bot heads.
- **#42 (be63bdc2) first, for the #88/#89 PR.**
  - #42 × #89 conflicts in `apps/web/package.json`, `apps/worker/package.json` and `pnpm-lock.yaml`. These are #42's files ("Not while #42 is open"), and #42 also changes 31 `infra/` files.
  - This PR merges after #42 and resolves: regenerate the lockfile, align #42's three new `@aws-sdk` ranges, and redo the synth diff with #42's stacks.
  - #88 alone and #87 alone merge cleanly with #42.
  - While #42 waits for the founder's approval line, ask the orchestrator before merging anything. Any base move means another base merge into #42, and a commit after the founder's committed line falls after the approval.
- **#82 (96758e44) first.**
  - It changes `tools/check-toolchain/*` (registry reads that gate this item's lockfile), `docs/runbooks/dependency-upgrades.md`, ADR 0066, reconciliation-001 and `tools/test/workflows.test.ts`. Its merge with every bot head is clean.
  - If you edit that runbook, ADR 0066 or reconciliation-001, merge after #82 and resolve, keeping both.
- **#86 (83167b8f):** no shared file with the bot heads. If you amend ADR 0066 or record in reconciliation-001, merge after it and resolve, keeping both.
- **#75 (871faff9, WIP 7f77cb19) and #84 (e3299ea2) before the #87 PR.**
  - #75 changes `gateway.ts`, `gateway.test.ts`, `redact.ts`, `narrative.ts`, `gate.golden.test.ts`, ADR 0070, `model-evaluation.md` and `watched-paths.txt`.
  - #84 changes `gate.golden.test.ts`, `narrative.ts`, `narrative-roles*` and `watched-paths.txt`.
  - Neither conflicts textually with #87. Run the gateway tests and the golden gate against SDK 1.x on the merged tree. If you touch ADR 0070 or `model-evaluation.md`, resolve after #75.
- **#83 (f4a97668, WIP f5e0ceba) and #85 (29dded52):** no shared file with the bot heads. Amending CI-12, or adding any test-matrix row, touches `docs/product/test-matrix.md` and synth `matrix.ts` and `registry.ts`, as #42, #82, #75, #84, #83 and #85 do. Merge after them and resolve, keeping both (rule 6).
- **The schema chain** (SS-01 f897a282, 1b 358dc53f, interest e0646746) carries #42's three `@aws-sdk` additions and `infra/` changes. It conflicts with #89 in both app manifests and the lockfile. Do not wait for it: whichever merges second regenerates the lockfile.
- **Your own two PRs** conflict textually only in `packages/model-gateway/package.json` (adjacent lines). The lockfile merges textually but is regenerated anyway; the PR merged second does it.

### Waiting on someone
- **Dependabot alerts (triage step 3).** The API gives the build 403. The founder or co-founder reads the alerts page. This does not block the merge.
- **A real-model evaluation on the Anthropic path.** This is the founder's, people only. It does not block the merge: no real provider is served while the floors (the founder's F1, tracked under #75) are null. Record that the path's first real-model record will be made on SDK 1.x.
- **A credentialed `cdk:diff` against `tp-staging`.** The build has no AWS credentials. The person runs it if a staging stack exists. This does not block the merge.
- **A trust-policy failure on a recent version, should one appear.** That is the founder's security question (runbook "The trust policy"). It blocks only that version.
- **Runbook 3i and `APPROVAL_REVIEW_REQUIRED`.** Until the founder approves as his own account, merge on green checks after verification (LANES.md rule 7). This does not block.

### Follow-on
The next weekly triage, if this session is still running, through the same pipeline:
- the actions run, Tuesday 2026-11-03 04:37 UTC;
- the images run, Wednesday 2026-11-04 04:43 UTC;
- the npm run, Thursday 2026-11-05 04:31 UTC. It runs under the fixed group routing only if the routing fix has merged into `claude/build-platform` by then, because Dependabot reads the default branch.

If the routing fix is kept out of the #88/#89 PR, it becomes the first follow-on, as its own PR.

### Resume
Resume from your status file: it is your handoff. Do not message the old sessions.
