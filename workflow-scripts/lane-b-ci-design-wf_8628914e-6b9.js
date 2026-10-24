export const meta = {
  name: 'lane-b-ci-design',
  description: 'Lane B CI PR design: four scouts (CI structure, mutation, Playwright/runner, dependency policy), one design author, one adversarial reviewer, one revision',
  phases: [
    { title: 'Understand', detail: 'four read-only scouts, one per audit item (#109, #54, #19, #112)' },
    { title: 'Design', detail: 'the design contract from the four reports' },
    { title: 'Review', detail: 'one adversarial reviewer of the contract' },
    { title: 'Revise', detail: 'apply findings, record dispositions, final founder questions' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-design'
const DESIGN = '/home/user/ops/designs/lane-b-ci.md'

const CTX = `
CONTEXT (read carefully; it is the whole brief you get).
- Product: PaidWhole, a therapy contract-payment platform. Repo: /home/user/PhysicalTherapy, the main checkout of claude/build-platform at 49514e8. CLAUDE.md there is already in your context.
- You are part of Lane B (the co-founder's sessions), designing "the CI PR": Lane B's first queue item. It covers combined-audit items #19 (its upgrade part), #54, #109 and #112, the open Dependabot PRs #40 (GitHub Actions), #38 (npm minor and patch) and #33 (Docker base images), the Dependabot versions dismissed on 2026-10-18 (node 26-slim images, actions/checkout 7, pnpm/action-setup 6, docker/build-push-action 7, docker/login-action 4, actions/upload-artifact 7, typescript 7.0.2, @types/node), and Dependabot coverage for the postgres and minio images.
- Operating docs (branch claude/build-ops, checked out at /home/user/ops): LANES.md (the two-lane rules), HANDOFF.md (Lane A's log and the founder's rulings), audits/combined/combined-report.md (300 KB: read only the item sections: #19 lines 364-372, #54 lines 679-687, #109 lines 1176-1184, #112 lines 1203-1211; the at-a-glance table is lines 55-197). PRD: docs/product/PRD.md (section 18 testing, around lines 740-770). reconciliation-001's checks: docs/product/reconciliation-001.md lines 423-467.
- The founder's standing rule: recommend and build only the best option, never weighted by build effort, never sacrificing quality. When a choice belongs to the founder, recommend the best option first and say plainly what each option gives up.
- Hard rules: Lane B never opens a PR that adds a migration or regenerates docs/product/domain-model.md (that goes to Lane A). No PR into main without a founder ruling (main has 11 files; Dependabot reads .github/dependabot.yml from main, the default branch). Never create a release tag. Never approve, request changes on, or merge a Dependabot PR as it stands. Synthetic data only. No model identifier in any repository artifact. Runners stay free GitHub-hosted (founder, 2026-10-23: a personal account cannot have larger runners; issue #41). Engine freeze: no non-test change under packages/pricing/src (tools/engine-freeze). The repository is public today (free 4-vCPU/16 GB ubuntu runners); the founder may make it private later.
- You must NOT change /home/user/PhysicalTherapy's working tree or /home/user/ops, create or move any branch, commit, push, or post anything on GitHub. For any experiment, make your own worktree: git -C /home/user/PhysicalTherapy worktree add --detach ${SP}/<yourname>-wt origin/claude/build-platform, then pnpm install --frozen-lockfile --prefer-offline inside it; remove it when done (git -C /home/user/PhysicalTherapy worktree remove --force <path>).
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on localhost:5433 (postgres:test; socket /tmp); name any database you create tp_laneb_<yourname>_<x> and drop it afterwards. The machine has 4 CPUs shared with three other agents: keep local runs bounded (no full test:db or e2e suite, nothing over about 30 minutes). Local Playwright: the repository's pinned 1.56.1 browser (chromium-1194) is not installed and its download hosts (cdn.playwright.dev, playwright.download.prss.microsoft.com) are refused by the network policy (the co-founder is being asked to allow them); /opt/pw-browsers holds only chromium-1243 (Playwright 1.63.0's, from the base image). gitleaks 8.24.3 at /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks; actionlint on PATH.
- GitHub: read through the mcp__github__* tools (load with ToolSearch, e.g. "select:mcp__github__actions_list,mcp__github__actions_get,mcp__github__get_job_logs,mcp__github__pull_request_read"); read job logs with get_job_logs (return_content true, a large tail_lines). gh api also works through the proxy for reads. The proxy refuses raw log URLs and the Actions artifact blob host. Owner PureTideWater, repo PhysicalTherapy.
- Web: WebSearch and WebFetch (load with ToolSearch) for current upstream versions and docs. Today is 2026-10-24; verify anything time-sensitive (versions, runner images, Dependabot features) against current sources and cite the URL.
- Report style: every claim with evidence (file:line, run/job id, or URL); measurements with their command; short narrative.`

const SCOUT_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    report_path: { type: 'string' },
    current_state: { type: 'string', description: 'what exists today, 5-15 lines' },
    key_facts: { type: 'array', items: { type: 'object', properties: { claim: { type: 'string' }, evidence: { type: 'string' } }, required: ['claim', 'evidence'] } },
    recommended_design: { type: 'string', description: 'the best option for this area, concrete: files, jobs, configs, tests' },
    alternatives_rejected: { type: 'array', items: { type: 'object', properties: { option: { type: 'string' }, why_not: { type: 'string' } }, required: ['option', 'why_not'] } },
    founder_questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, recommended: { type: 'string' }, alternatives: { type: 'string' }, gives_up: { type: 'string' } }, required: ['question', 'recommended', 'alternatives', 'gives_up'] } },
    migration_needed: { type: 'boolean' },
    files_to_change: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'report_path', 'current_state', 'key_facts', 'recommended_design', 'founder_questions', 'migration_needed', 'files_to_change', 'risks', 'open_items'],
}

const SCOUTS = [
  {
    key: 'ci-structure',
    item: '#109 (CI in about 10 minutes instead of 35)',
    brief: `Your area: CI's structure and duration (audit #109), and every required-check name.
1. Read .github/workflows/*.yml (all eight), tools/test/workflows.test.ts (the workflow asserts), vitest.config.ts (the unit, db and golden projects), the root package.json scripts, eslint.config.js, tsconfig.json and the per-workspace typecheck scripts, apps/web/playwright.config.ts (its webServer runs prepare.ts and a full Next build), and docs/runbooks/github-governance.md's lines on which checks a ruleset should require.
2. Measure from GitHub, not locally: the step timings of the latest completed ci.yml runs on PR #39 (head 6441c5a, green) and PR #42 (head 13f59b1). Give each step's duration and the job total.
3. Find the slow test file the audit describes (about 6,293 route cases, 611 worlds built one after another, about 390,000 sequential snapshot queries, 13-16 minutes; likely under apps/web/src/lib/routes/). Explain how its worlds and snapshots work, how each snapshot folds into one query without weakening what it asserts, and how to split it into about 12 files with a test that every route lands in exactly one file. You may time one bounded run of part of it locally in your worktree against PG18 (5433) with a tp_laneb_ci_* database if that helps; say what you ran.
4. Sharding the database suite in 4: what global state db tests share (migrations, cluster-wide roles, extensions, advisory locks, the catalog test); whether shards need one Postgres service each (separate jobs do) and how vitest's --shard splits files; the catalog and cross-tenant tests must still run on every PR (CLAUDE.md rule 4).
5. e2e in 2 shards over one build: Playwright --shard, building Next once and sharing the build between jobs (actions/upload-artifact within one workflow run is fine; only our proxy can't download artifacts), the database prepare per shard, the brand journey's pixel baselines.
6. Lint per workspace in parallel (today one process with an 8 GB heap, which a private repository's free runner could not hold), incremental type-checking with a cached tsbuildinfo, the pnpm store and Playwright browser caches, timeouts on every job, Playwright reporting flaky tests instead of hiding them behind retries: 1.
7. The schema-approval check (domain model approval case, today inside test:db) as its own named check, and one "all green" gate job to require. List every place that names today's job "check" or a required check (workflows, tests, runbooks, ADR 0063, approval-of-record.yml, release.yml), since renames break them.
8. Propose the target job graph with an estimated wall clock per job and in total, on free 4-vCPU ubuntu runners, and say how it holds if the repository goes private (check GitHub's current hosted-runner specs for private repositories).
Write the full report to ${OUT}/scout-ci-structure.md.`,
  },
  {
    key: 'mutation',
    item: '#54 (mutation testing that really runs on the money code)',
    brief: `Your area: mutation testing on the money code (audit #54) and the coverage gates.
1. Read stryker.config.mjs, stryker.verifier.config.mjs, vitest.stryker.config.ts, vitest.stryker.packets.config.ts, tools/stryker/** (the canary and runner.test.ts), patches/@stryker-mutator__vitest-runner@10.0.0.patch, .github/workflows/mutation.yml, the mutation notes in docs/adr/0064*, PRD section 18 (docs/product/PRD.md around lines 740-770: "Mutation score above 85% before Monitoring v1"), vitest.config.ts's BRANCH_GATED coverage list. Find the money package (integer-cents rounding code; likely packages/money or similar) and the packet verifier's interest and calculation code the audit says should be mutated too.
2. Establish the true current state by measurement, in your own worktree: run the canary (pnpm stryker run tools/stryker/canary/stryker.config.mjs) and one bounded Stryker run on one small money module (pick one whose run fits in about 20 minutes; restrict mutate to it). Does the patched vitest runner now give correct scores, or does it still score 0% on mutants the tests kill, as the audit found? Report the numbers and commands.
3. Count the mutants of the full money-path set (a dry run or Stryker's instrumentation output) and estimate a full run's duration on a free 4-vCPU runner, per package.
4. Decide the best runner by evidence: the fixed vitest runner with perTest coverage, Stryker's command runner per package (the audit's suggestion; it runs the whole command per mutant), or another. Weigh faithfulness first, then time.
5. Design the triggers: a full run on every push to claude/build-platform, failing below 85%; on pull requests that touch those paths, mutating the changed files (in full when a test file in those packages changes, since incremental mode cannot see a weakened test); schedules only once the default branch carries the workflows (the founder's choice of default branch); a workflow test asserting the triggers. Sharding by package across jobs.
6. The coverage gate: add the money package's rounding code to the branch-coverage gate if it is missing; check the current coverage numbers.
7. Survivors: estimate how many survivors exist per package (from your bounded run and any reports), and how they are killed with tests only, never with a non-test change to the engine (engine freeze; tools/engine-freeze/check.ts).
8. 85% as an exit condition of milestone 6 and Gate 1: where milestones and their checks live (PRD 17), and whether reconciliation-001's check "The fourteen milestones and their checks in PRD 17 are unchanged" conflicts; the founder adopted the combined audit in full on 2026-10-20 (HANDOFF.md "Founder rulings of 2026-10-20 ~15:10 UTC"), so say whether that covers it or a founder question is needed.
Write the full report to ${OUT}/scout-mutation.md.`,
  },
  {
    key: 'playwright-runner',
    item: '#19 upgrade part (Playwright, axe, ubuntu-26.04, baselines, licences, exact-version asserts)',
    brief: `Your area: audit #19's upgrade part: Playwright and the accessibility checker, the move to ubuntu-26.04, the brand baselines, the licence exception and the exact-version asserts.
1. Current upstream (web search, cite URLs): the latest stable Playwright and the Chromium revision/version it uses; whether it supports Ubuntu 26.04 hosts; the latest @axe-core/playwright and axe-core; the status of GitHub's ubuntu-26.04 runner image and of ubuntu-latest's move to 26.04 (runner-images issue #14748); Python and PostgreSQL client availability on 26.04.
2. Read docs/adr/0058* (pixel baselines, text rendering, why moving CI into Playwright's container was rejected), apps/web/playwright.config.ts, apps/web/e2e/brand.spec.ts and its brand.spec.ts-snapshots, e2e/a11y.ts, e2e/fonts.conf, tools/check-licenses/** (find the stale licence exception), and the tests that pin exact action versions (tools/test/workflows.test.ts and any other). Find which worker or web tests print reports through Chromium and whether the production images carry a browser (apps/web/Dockerfile, apps/worker/Dockerfile).
3. Dependabot #38 (Playwright 1.64.1, axe 4.14.0 and eight more): read its latest ci run's job log and list exactly what failed and why (WCAG findings the newer checker reports, pixel diffs, the licence check, anything else). Same for #40 and #33 if they ran.
4. How to regenerate the seven brand baselines faithfully with the new Chromium build: locally with that exact build (which needs the two Playwright download hosts allowed), or on CI (for example a step that prints each new baseline as base64 to the log, as ci.yml's failure step already does, since the proxy refuses artifact downloads). Recommend the best and the fallback, and how a person inspects them (ADR 0058).
5. Moving every job to ubuntu-26.04: what changes per workflow, and the screening capacity measurement (screening-capacity.yml, release.yml, tools/screening-capacity: the runner layout, runnerTooSmall, the report format and launchCheck, which binds the release's measured runner); whether moving release.yml's capacity runner needs a founder decision (issue #41; the capacity decision is "kept in view").
6. Fix list: the WCAG findings to fix (real ones), the licence exception, the two exact-version asserts loosened so action updates can merge while still guarding what they were meant to guard.
Write the full report to ${OUT}/scout-playwright-runner.md.`,
  },
  {
    key: 'dependency-policy',
    item: '#112 (dependency-update policy) and the open and dismissed Dependabot versions',
    brief: `Your area: the dependency-update policy (audit #112), the three open Dependabot PRs and the versions dismissed on 2026-10-18, and Dependabot coverage for the postgres and minio images.
1. main's Dependabot config (git -C /home/user/PhysicalTherapy show origin/main:.github/dependabot.yml) is the only one Dependabot reads (default branch main). Any change to it needs a PR into main, which needs a founder ruling (CLAUDE.md "Merging"; docs/adr/0063*; docs/runbooks/github-governance.md; the precedent PR #27, merged 2026-10-20 on the founder's ruling). Lay out the options (a PR into main on the founder's ruling; a copy kept on claude/build-platform with a test that it matches; changing the default branch) and recommend.
2. The three open Dependabot PRs: #40 (actions group, 11 updates), #38 (npm minor-and-patch, 10 updates: Playwright 1.64.1, axe 4.14.0, @anthropic-ai/sdk 0.135.0, next 16.4.2, vitest 5.0.5, eslint 10.13.0, and more), #33 (node:24-slim to node:25-slim; Node 25 is not an LTS line). Read each diff (git diff origin/<branch>^ origin/<branch>) and its CI result, and judge each version: take in the CI PR, take in its own deliberate PR later, or ignore, with the reason.
3. The versions dismissed on 2026-10-18 (node 26-slim images, actions/checkout 7, pnpm/action-setup 6, docker/build-push-action 7, docker/login-action 4, actions/upload-artifact 7, typescript 7.0.2, @types/node): judge each the same way, checking upstream release notes for breaking changes (cite URLs). Note Node's release schedule (is 26 LTS yet? when?) and TypeScript 7's state with typescript-eslint.
4. Action pinning: some workflows pin actions by commit SHA with a version comment and ci.yml uses tags (@v4). Recommend one policy (supply-chain best practice) and the test that enforces it; check supply-chain.yml.
5. Security updates (a repository setting, the founder's) and Dependabot alerts: current state if readable via gh api (repos/PureTideWater/PhysicalTherapy/vulnerability-alerts, automated-security-fixes) and the recommendation.
6. postgres:18 and minio coverage: docker-compose.yml, ci.yml's and large-zip.yml's service images. Check current Dependabot docs for the docker-compose ecosystem and whether workflow service images are covered; recommend pinning (tag, digest) and the config.
7. Groups and ignores: semver-major ignores for the Node image, Node types, TypeScript, Next and pg-boss; own groups for Playwright plus axe, the AWS SDK, the Anthropic SDK.
8. The dependency-upgrade runbook's content (docs/runbooks/): Next minors; Node 24 to 26 on a plan; pg-boss majors migrated in the pre-traffic migration task with workers not migrating (find how pg-boss is started in apps/worker and whether it migrates its own schema today); Playwright with its baselines; TypeScript 7 when the linter supports it.
9. pnpm audit --prod, the licence check and supply-chain.yml: anything the policy should add.
Write the full report to ${OUT}/scout-dependency-policy.md.`,
  },
]

phase('Understand')
const scouts = await parallel(SCOUTS.map(s => () =>
  agent(`${CTX}\n\nYou are the "${s.key}" scout for the CI PR's design, covering ${s.item}. Read-only research and bounded measurement; you design nothing final, but you recommend the best option for your area with evidence.\n\n${s.brief}\n\nReturn the structured summary. Keep it short; the full detail goes in your report file.`,
    { label: `scout:${s.key}`, phase: 'Understand', schema: SCOUT_SCHEMA })))

const missing = SCOUTS.filter((s, i) => !scouts[i]).map(s => s.key)
if (missing.length) throw new Error('A scout returned nothing: ' + missing.join(', ') + '. Not designing on a partial picture.')
log('Scouts done: ' + scouts.map(s => s.area).join('; '))

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    design_path: { type: 'string' },
    summary: { type: 'string' },
    prs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, branch: { type: 'string' }, scope: { type: 'string' }, depends_on: { type: 'string' }, ci_rows: { type: 'string' } }, required: ['name', 'branch', 'scope', 'depends_on', 'ci_rows'] } },
    founder_questions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, question: { type: 'string' }, recommended: { type: 'string' }, alternatives: { type: 'string' }, gives_up: { type: 'string' }, blocks: { type: 'string' } }, required: ['id', 'question', 'recommended', 'alternatives', 'gives_up', 'blocks'] } },
    migration_needed: { type: 'boolean' },
    test_matrix_rows: { type: 'array', items: { type: 'string' } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['design_path', 'summary', 'prs', 'founder_questions', 'migration_needed', 'test_matrix_rows', 'open_items'],
}

phase('Design')
const reports = SCOUTS.map(s => `${OUT}/scout-${s.key}.md`).join(', ')
const design = await agent(`${CTX}

You are the design author for the CI PR. Four scouts researched it; their full reports are ${reports}, and their structured summaries are:
${JSON.stringify(scouts, null, 1)}

Read the four reports in full, the four audit item sections, LANES.md (rules 1-12 and the Lane B queue), reconciliation-001's checks (lines 423-467), and HANDOFF.md's "How this session worked" (lines 73-91) and "Founder ruling of 2026-10-20 ~18:30 UTC: the efficient pipeline". For the house format, look at /home/user/ops/designs/pr6b-plan.md (how PR 6b was split into four PRs, each with scope, files, tests, docs and acceptance) and /home/user/ops/designs/pr6b-email-streams.md.

Write the design contract to ${DESIGN} (you may create this one file; nothing else outside ${OUT}). It must hold:
1. Goal and acceptance, measurable: CI wall clock target and how it is measured; mutation score per package and the gate; Dependabot PRs green by construction; ubuntu-26.04 everywhere it should be; the baselines regenerated and inspected.
2. The split: one PR or a short series, each independently mergeable on green CI, none with a migration, each into claude/build-platform from a branch named co-001/ci or co-001/ci-<part>. Order them so the fastest wins land first (faster CI speeds both lanes) and say what each depends on. Justify the split against "group audit items that change the same code into one PR" and "one PR per change".
3. Per PR: exact scope by audit item, files to change, new and changed tests (failing first where a behaviour is fixed), docs (runbooks, ADR 0066 for the CI PR's decisions and any amendments to ADR 0058, 0063, 0064; reconciliation-001; PRD 18 if the mutation trigger changes; test-matrix rows from the reserved CI-01 to CI-20, each titled), the required-check names and every place that names them, and the acceptance checks a fresh-clone verifier can run.
4. The builder plan: builders working in parallel with disjoint file ownership (name the files each owns), what each checks locally (typecheck for the whole repo, lint, the tests of the packages they change; no full test:db or e2e at build time), and an integrator.
5. Interplay with Lane A: #42 (PR 6b-4) is open and touches pnpm-lock.yaml; rule 6 (the PR merged second resolves the conflict keeping both). The founder's pending ruleset offer (requiring the CI checks on claude/build-platform) and how the new gate job's name fits it.
6. Local verification limits: the pinned Playwright browser cannot be installed locally until the network policy allows the two hosts; say exactly what the fix round and verifier can and cannot run locally, and how CI covers the rest.
7. Founder questions, one batch, each with an id (F1, F2, ...), the recommended option first, the alternatives, what each gives up, and which PR it blocks. Include at least: the PR into main for the Dependabot config (or the alternative); the default branch for schedules (mutation weekly, the 2 GB intake check); security updates; any runner question for the capacity measurement (only if moving its runner image changes what the release measures; runners stay free); anything else the scouts raised. Keep only true founder decisions (product, cost, wording, legal, security trade-offs, approvals, repository settings); decide engineering choices yourself, by the standing rule.
8. Migration check: confirm no part needs a migration or regenerates the domain model; if any does, mark it "hand to Lane A".
9. Risks and rollback.
Recommend only the best option throughout, never weighted by build effort.

Return the structured summary.`, { label: 'design:author', phase: 'Design', schema: DESIGN_SCHEMA })
if (!design) throw new Error('The design author returned nothing.')

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'revise'] },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, section: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'section', 'issue', 'evidence', 'fix'] } },
    checks_done: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'checks_done'],
}

phase('Review')
const review = await agent(`${CTX}

You are the one adversarial reviewer of the CI PR's design contract, ${DESIGN}. The scouts' reports are ${reports}. Assume the design is wrong somewhere and find where. Verify claims against the repository and current upstream docs yourself; do not trust the design or the scouts.

Check at least:
- Coverage: every part of audit #19's upgrade part, #54, #109 and #112 (their "Best option" text), each open Dependabot PR (#40, #38, #33), each dismissed version, and the postgres/minio coverage is designed, or explicitly deferred with a reason that meets the standing rule. Nothing weakened for build effort.
- The rules: no migration and no domain-model regeneration; no PR into main without a founder ruling; Dependabot PRs never merged as they stand; free runners only; the engine freeze (no non-test change under packages/pricing/src); golden fixtures and synthetic releases 900001-900004 unchanged; test:db's catalog and cross-tenant tests still run on every PR, in every shard plan; LED-01 to LED-11 unchanged.
- Correctness of the CI design: will sharded db tests really be isolated (cluster-wide roles, migrations, advisory locks)? Does building Next once and sharing it across e2e shards match what playwright.config.ts's webServer does? Are the timing estimates grounded in the measured step timings? Does the 10-minute target hold? Does anything still name the old "check" job (workflows, tests, runbooks, ADRs, approval-of-record.yml, the governance runbook's ruleset list)?
- Mutation: is the chosen runner justified by measurement? Do PR-time incremental runs see a weakened test? Is 85% enforced where the audit says, and are survivors killed by tests only?
- Security of the workflows: permissions minimal per job; no pull_request_target with checkout of PR code; artifacts passed between jobs cannot be poisoned by a PR into a privileged job; actions pinned by SHA; caches cannot carry state into release.yml.
- Playwright/runner: the baselines regenerated with exactly the build CI compares under (ADR 0058); WCAG findings fixed rather than suppressed; the licence fix; the asserts loosened without losing their guard; the capacity measurement's runner change and its effect on launchCheck.
- The split: each PR independently green and mergeable; order sensible; file ownership for parallel builders truly disjoint; acceptance checks runnable by a fresh-clone verifier.
- Founder questions: only true founder decisions; each recommends the best first and states honestly what each option gives up; no engineering choice pushed to the founder.
- Lane A interplay and the pnpm-lock conflict with #42.

Write your full review to ${OUT}/design-review.md and return the structured result. Every finding with evidence and a concrete fix.`, { label: 'review:design', phase: 'Review', schema: REVIEW_SCHEMA })
if (!review) throw new Error('The design reviewer returned nothing; refusing to go on unreviewed.')
log(`Review: ${review.verdict}, ${review.findings.length} findings (${review.findings.filter(f => f.severity === 'blocking').length} blocking)`)

phase('Revise')
const FINAL_SCHEMA = {
  type: 'object',
  properties: {
    ...DESIGN_SCHEMA.properties,
    dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'rejected'] }, note: { type: 'string' } }, required: ['id', 'disposition', 'note'] } },
  },
  required: [...DESIGN_SCHEMA.required, 'dispositions'],
}
const final = await agent(`${CTX}

You revise the CI PR's design contract, ${DESIGN}, after its adversarial review. The review is ${OUT}/design-review.md; its findings:
${JSON.stringify(review.findings, null, 1)}

For each finding: verify it yourself, then fix the design, or reject it only with evidence that it is wrong. Blocking and should_fix findings that hold are fixed, not deferred. Add a section "Review (${'2026-10-24'})" at the end of the design listing every finding id, its severity, and its disposition with one line. Keep the founder questions to true founder decisions, each with the recommended option first and what each option gives up. Edit only ${DESIGN}.

Return the structured summary of the final design, with the dispositions.`, { label: 'design:revise', phase: 'Revise', schema: FINAL_SCHEMA })
if (!final) throw new Error('The reviser returned nothing.')

return { scouts: scouts.map(s => ({ area: s.area, migration_needed: s.migration_needed, open_items: s.open_items })), review: { verdict: review.verdict, counts: { blocking: review.findings.filter(f => f.severity === 'blocking').length, should_fix: review.findings.filter(f => f.severity === 'should_fix').length, nit: review.findings.filter(f => f.severity === 'nit').length } }, final }
