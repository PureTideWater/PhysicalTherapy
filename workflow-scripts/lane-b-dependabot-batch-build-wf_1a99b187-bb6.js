export const meta = {
  name: 'lane-b-dependabot-batch-build',
  description: 'Build PR A (#87, SDK 1.x) and PR B (#88+#89, CDK, @aws-sdk, stripe) per the design: builder, then integrator (base merge, checks, push, draft PR read back), each with an adversarial check of the builder',
  phases: [
    { title: 'Build', detail: 'builder A and builder B, commits per design §8.2' },
    { title: 'Check', detail: 'one skeptic per branch re-runs the failing-first and checks the commits against the design' },
    { title: 'Integrate', detail: 'merge the base, the not-yet-run checks, push, draft PR with template body read back' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/scratchpad/build'
const DESIGN = '/home/user/ops/designs/lane-b-dependabot-batch.md'
const SESSION = 'https://claude.ai/code/session_01FcouKRD17iBBR4HhnYcQQx'

const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the Lane B item session "dependabot-batch" (${SESSION}), which takes Dependabot #87, #88 and #89 as the build's own PRs. The design is ${DESIGN}: read section 1 (decisions D1-D12), section 8 (the PR plan: 8.1 files, 8.2 commits, 8.3 draft PRs) and the final "Review of the design" section whole, then the section for your PR (A: section 3; B: sections 4, 5 and 7). Where the design and its review section differ, the review section's disposition wins. The base claude/build-platform is now bce57f16 (or later: git fetch origin claude/build-platform); the item branches are at 83d71fd6.

Rules for you:
- Synthetic data only. No PHI, real 835, contract or export anywhere.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH (the default node is 22).
- Heavy commands (pnpm install, typecheck, lint, tests, cdk synth, builds) only under: flock /tmp/laneb-heavy.lock <command>. Two builders share this 4-CPU machine.
- Commits: in your own worktree and branch only, one concern each, as design 8.2 numbers them, every message ending with a blank line and then exactly these two lines:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}
  Never amend, rebase, reset --hard, force or --no-verify. Push only if your task says so.
- Generated files are never hand-edited: pnpm-lock.yaml only by pnpm install (--lockfile-only then --frozen-lockfile); fixtures/synthetic only by pnpm synth --all; tools/screening-capacity/watched-paths.txt only by pnpm exec tsx tools/screening-capacity/watched.ts --write.
- Never a release-age exclude, never an edit to an exception file, never a migration, never docs/product/domain-model.md, never a file in LANES.md's "Not while #42 is open" list (/home/user/ops/LANES.md) except the rule-6 shared documents.
- No model name or model identifier in any file, commit or PR text. Shorten any 64-hex digest that is not a git commit SHA to 8 hex digits and an ellipsis.
- Failing first: a commit that adds a test before its fix must be red on behaviour; save the red and green runs' logs in ${SP}/logs/ with command and UTC time.
- Improve as you go (the co-founder's standing direction): an improvement inside your PR's files goes in with its test and is named in your result; one outside goes in your result's notes as a proposal.
- Long commands, and any wait for a time: run_in_background and wait for the notification, or a Monitor until-loop; no long foreground sleep.
- Change nothing under /home/user/ops; write only under ${SP}.`

const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption (the account's 5-hour limit can stop you) loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless git and the files say otherwise, and continue from where it stopped (git log shows your commits).`

const PRS = [
  {
    key: 'A', wt: '/home/user/deps-anthropic-sdk-1', branch: 'co-001/deps-anthropic-sdk-1', bot: '#87',
    title: 'Anthropic SDK 1.3.0 with its tracing, propagation and logging off (replaces Dependabot #87)',
    build: `You are BUILDER A, in /home/user/deps-anthropic-sdk-1 (branch co-001/deps-anthropic-sdk-1, at 83d71fd6, node_modules installed). First merge the current origin/claude/build-platform in with a merge commit (git merge --no-ff origin/claude/build-platform; message "Merge claude/build-platform into co-001/deps-anthropic-sdk-1" plus the two attribution lines), then pnpm install --frozen-lockfile under the lock. Then build design 8.2's commits for A, (1) to (5), exactly as the design and its review section say: the SDK range ^1.3.0 and the lockfile (confirm @opentelemetry/api stays 1.9.1 in the lockfile, and list every package the lockfile moved); the @opentelemetry/api devDependency and the new failing tests (MOD-17 and MOD-18 in src/providers/anthropic-client.test.ts, and the ANTHROPIC_CUSTOM_HEADERS config test), red on behaviour; the client options (openTelemetry traces and propagation off, logLevel off, fixed baseURL, webhookKey null, maxRetries 0, timeout), the config refusal and the doc comment naming ADR 0048 (green); the test-matrix MOD-17/MOD-18 rows and the synth matrix.ts and registry.ts entries, then pnpm synth --all (commit what it writes); the ADR 0048 amendment (text in design 3.7 as folded). Check the SDK's real option names in node_modules/@anthropic-ai/sdk (the type of ClientOptions) before writing them; if the design names an option the SDK does not have, use what the SDK has and record the deviation.
Then under the lock, on your head: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm exec vitest run --project unit packages/model-gateway (counts); pnpm test:golden (counts); pnpm exec tsx tools/screening-capacity/watched.ts --write (commit any change as its own commit "regenerate watched paths"); pnpm licenses:check; BASE=origin/claude/build-platform pnpm toolchain:check; pnpm verify-content; and pnpm exec tsx on the repo's mutation selector (tools/stryker or wherever affected.ts lives; the design names it) against origin/claude/build-platform to record which Stryker shards CI will select (expected none).`,
  },
  {
    key: 'B', wt: '/home/user/deps-aws-cdk-minor-patch', branch: 'co-001/deps-aws-cdk-minor-patch', bot: '#88 and #89',
    title: 'aws-cdk-lib 2.275 with its CLI, CLI telemetry off, @aws-sdk and stripe (replaces Dependabot #88 and #89)',
    build: `You are BUILDER B, in /home/user/deps-aws-cdk-minor-patch (branch co-001/deps-aws-cdk-minor-patch, at 83d71fd6, node_modules installed). First merge the current origin/claude/build-platform in with a merge commit (git merge --no-ff origin/claude/build-platform; message "Merge claude/build-platform into co-001/deps-aws-cdk-minor-patch" plus the two attribution lines), then pnpm install --frozen-lockfile under the lock. Then build design 8.2's commits for B, (1) to (5) (commit (6) waits for #42's merge: check with git ls-remote origin and the GitHub MCP pull_request_read on #42; if #42 has merged, merge the base again and do (6) too):
(1) aws-cdk-lib and the aws-cdk CLI at the newest versions at least three days old at the moment you resolve (npm view <pkg> time --json; aws-cdk 2.1147.0 only from 2026-11-02T18:57:11Z; the lib and CLI move together) and the lockfile;
(2) infra/test/cli-settings.test.ts, red; (3) the synth script and cdk.json as the review section's B1 disposition says (CDK_DISABLE_CLI_TELEMETRY=true and --no-notices in the synth script, a top-level "notices": false, context unchanged), green, and the synth comparison: synth on origin/claude/build-platform (in a temporary worktree under ${SP}/tmp, removed after) and on your head into directories under ${SP}/synth/{base,head}, diff the tp-dev, tp-staging and tp-production templates and every manifest, and save the diff and an explanation of every difference in ${SP}/synth/compare.md;
(4) the nine @aws-sdk ranges (all six manifests the design names, infra's client-sts included) at the newest @aws-sdk version whose every package is at least three days old, and stripe ^23.1.0. stripe 23.1.0 becomes usable at 2026-11-01T19:58:14Z: if you reach this commit before 19:59:00Z, do commit (5) first, then wait (a Monitor until-loop on date) until 19:59:00Z, then resolve. Run pnpm install --lockfile-only and --frozen-lockfile; list every package the lockfile moved with its publish time and age;
(5) the ADR 0012 amendment and the runbook's one sentence (design 4.3 and its review section).
Then under the lock, on your head: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm --filter @tp/infra test (counts); pnpm exec vitest run --project unit for packages/model-gateway packages/billing packages/db packages/contracts (counts); pnpm test:golden (counts; design 5.3 and C-S7: ADR 0070's set-change rule for client-textract); pnpm exec tsx tools/screening-capacity/watched.ts --write (commit any change as its own commit); pnpm licenses:check; BASE=origin/claude/build-platform pnpm toolchain:check; pnpm verify-content; and the repo's mutation selector against origin/claude/build-platform to record which Stryker shards CI will select (expected the six packets and pricing shards).`,
  },
]

const BUILT = {
  type: 'object',
  properties: {
    head: { type: 'string', description: 'full sha of the branch head after your commits (not pushed)' },
    commits: { type: 'array', items: { type: 'string' }, description: 'each: full sha and subject, in order' },
    versions: { type: 'string', description: 'each package moved, from and to, publish time UTC and age at resolution; every transitive lockfile move' },
    failingFirst: { type: 'string', description: 'each red test at its commit and green at the head, with log paths' },
    checks: { type: 'string', description: 'each check run with its command, result and counts' },
    deviations: { type: 'string', description: 'every deviation from the design and why; None if none' },
    proposals: { type: 'string' },
    report: { type: 'string', description: 'the full markdown report' },
  },
  required: ['head', 'commits', 'versions', 'failingFirst', 'checks', 'deviations', 'proposals', 'report'],
}

const results = await pipeline(PRS,
  (p) => agent(`${COMMON}\n\n${p.build}\n${SAVE(`builder-${p.key}.progress.md`, 'each commit, red and green logs, each check result')}\nWrite your report to ${SP}/builder-${p.key}.md too. Do NOT push.`, { label: `builder:${p.key}`, phase: 'Build', schema: BUILT }),
  (b, p) => agent(`${COMMON}

You are an ADVERSARIAL CHECKER of builder ${p.key}'s commits in ${p.wt} (branch ${p.branch}; not pushed yet). Do not commit or change tracked files; work in a temporary worktree under ${SP}/tmp/check-${p.key} if you need to run an old commit (remove it after). The builder's report:
${JSON.stringify(b, null, 1)}

Try to break it. Check each commit against design 8.2 and the design's review section: the right files only (no "Not while #42 is open" file, no exception file, no hand-edited generated file: re-run pnpm install --frozen-lockfile, pnpm synth --all and watched.ts --write and confirm git status stays clean); the versions are the newest at least three days old (npm view times) and the lockfile moves are all accounted for; each red commit is red on behaviour (run the red tests at the red commit yourself, under the lock) and green at the head; for A, that the SDK option names exist in the installed SDK's types and that MOD-18 really proves no traceparent/tracestate/baggage header and no span against a registered provider and propagator (would it pass if tracing were on? flip the option in a scratch copy and run it: it must fail); for B, that the synth comparison shows only version strings and that cdk.json's change and the synth script do not alter templates. Report every defect with severity (B blocking / S should fix / N nit), evidence and fix, in ${SP}/check-${p.key}.md.
${SAVE(`check-${p.key}.progress.md`, 'what you checked and found')}
Return the review as markdown, ending with a line "VERDICT: clean" or "VERDICT: defects".`, { label: `check:${p.key}`, phase: 'Check' }).then(c => ({ b, c })),
  ({ b, c }, p) => agent(`${COMMON}

You are INTEGRATOR ${p.key}, in ${p.wt} (branch ${p.branch}). Builder ${p.key}'s report:
${JSON.stringify(b, null, 1)}
The adversarial checker's review of it:
${c}

Steps:
1. Fix every real defect the checker found (check each yourself first), in small commits with tests, under the rules. Re-run what the fix touches.
2. git fetch origin claude/build-platform; if it moved since the builder's base merge, merge it in again (merge commit; regenerate the lockfile with pnpm install, never hand-merge).
3. Scope check: list every file the branch changes against origin/claude/build-platform; confirm none is a migration, domain-model.md, an exception file, or a "Not while #42 is open" file other than rule-6 shared documents.
4. Push: git push -u origin ${p.branch} (the pre-push hook runs the fixture check and gitleaks; never --no-verify, never force; a refused push of unpushed commits: git reset --soft to the last pushed commit, remove the flagged text, commit again, push).
5. Open the DRAFT pull request with the GitHub MCP tools (load them with ToolSearch "select:mcp__github__create_pull_request,mcp__github__update_pull_request,mcp__github__pull_request_read"): owner PureTideWater, repo PhysicalTherapy, title "${p.title}", head ${p.branch}, base claude/build-platform, draft true. The description follows ${p.wt}/.github/pull_request_template.md section by section, every section, "None" rather than omitted, any required-checks markers kept exactly, under 65,536 characters. It says: that it replaces Dependabot ${p.bot} (never merged; closed with a comment when this merges); what was read (changelogs and versions, the migration guide for A, the CDK and CLI notes and the synth comparison for B, the @aws-sdk and stripe notes); each version taken with its publish time and age; the lockfile's moves; the gate results (A: test:golden and the provider tests, the tracing decision and MOD-17/MOD-18; B: the synth comparison standing in for the credentialed cdk:diff, test:golden for client-textract); the Stryker shards CI selects; the decisions with reasons (design section 1); what waits on a person (design section 2 and the status file: alerts 403, a real-model evaluation on the Anthropic path, a credentialed cdk:diff, the Stripe webhook endpoint's API version); the merge order (A after #75 and #84; B after #42; both ask Lane B's orchestrator while #42 is open). End the body with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

${SESSION}
Write the body to ${SP}/pr-${p.key}-body.md first; create the PR with it (if create_pull_request cannot set the body exactly, create it and then set the body with update_pull_request); then read it back with pull_request_read (method get), write the returned body to ${SP}/pr-${p.key}-body-readback.md and cmp the two files: identical, or fix with update_pull_request and read back again. Never comment, review, approve or merge. Do not touch any Dependabot PR.
${SAVE(`integrate-${p.key}.progress.md`, 'each step done, the pushed head and the PR number')}
Return: the PR number and URL, the pushed head sha, the commits on top of the base, every check with its result, the checker's findings and their dispositions, and anything the session must decide.`, { label: `integrator:${p.key}`, phase: 'Integrate' }),
)

return results