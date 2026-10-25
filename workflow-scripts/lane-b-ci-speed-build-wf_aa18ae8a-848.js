export const meta = {
  name: 'lane-b-ci-speed-build',
  description: 'Lane B ci-speed (audit #109): builders S1/S2/S3 in parallel, integrator opens the draft PR, then two adversarial reviews in fresh clones',
  phases: [
    { title: 'Build', detail: 'S1 workflows/gate/docs, S2 db and e2e suites, S3 lint and typecheck runners' },
    { title: 'Integrate', detail: 'merge, checks, one push, draft PR' },
    { title: 'Review', detail: 'two adversarial reviews (CI and test infrastructure; security and supply chain)' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-speed'
const DESIGN = '/home/user/ops/designs/lane-b-ci.md'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4'

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy. claude/build-platform is at 49514e8. CLAUDE.md is in your context; follow it.
- You build part of Lane B's PR "co-001/ci-speed" (combined audit #109: CI in about 10 minutes instead of 35), PR 1 of the four-PR CI series. The design contract is ${DESIGN} (1,665 lines; read the sections named below, not the whole file unless you need it): section 0 (overview), 1 (acceptance A1-A3), 2 (split, parallelism), 3.1 (all of ci-speed: 3.1.1 job graph, 3.1.2 what makes it fast, 3.1.3 files, 3.1.4 tests, 3.1.5 documents, 3.1.6 required checks, 3.1.7 acceptance), 3.5 (test-matrix rows CI-01 to CI-10), 4 (builders and file ownership), 5 (Lane A interplay), 6 (local limits), 13 (the review's dispositions; follow the fixed ones). The scout reports are in /home/user/ops/designs/lane-b-ci/ (scout-ci-structure.md is [S1]); the probe diff for the route-test page-read memo is ${SP}/ci-design/contract-world.probe.diff.
- The founder's standing rule: build only the best option, never weighted by build effort, never sacrificing quality. Where the design is wrong or incomplete, do the best thing and record the deviation and why.
- Hard rules: no migration; nothing under packages/db/migrations, docs/product/domain-model.md, packages/db/domain-model, packages/pricing (any file), content/releases, fixtures/golden; synthetic releases 900001-900004 unchanged; no test weakened, skipped or deleted except the moves the design names (route tests split; SCR-19 moved; the domain-model approval case moved to its own CI job); the catalog and cross-tenant tests run on every PR; no PHI; no model identifier in any repository file, code comment or commit subject/body other than the attribution lines below.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 at localhost:5433 (postgres:test; socket /tmp): DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (the db tests create their own scratch databases). Playwright 1.56.1's Chromium (revision 1194, laid out from Chrome for Testing 141.0.7390.37, which renders the committed baselines byte for byte) is in /opt/pw-browsers (PLAYWRIGHT_BROWSERS_PATH is set). actionlint on PATH. No Docker daemon.
- The machine has 4 CPUs and 15 GB shared by several agents. Wrap EVERY heavy command in the shared lock, so only one runs at a time: flock /tmp/laneb-heavy.lock <command> (this covers pnpm typecheck, pnpm lint, pnpm test, any vitest --project db run, pnpm synth --all, pnpm build or next build, any Playwright run). Never run the full test:db or the full e2e suite at build time. Keep each locked run under about 15 minutes; split it if needed.
- Commits: in your own worktree, on your own branch, in the repository's commit style (git log --format=%B -5 origin/claude/build-platform shows it: "area: what changes and why", in full sentences). End every commit message with these two lines, exactly:
${ATTRIB}
- Never push (except the integrator), never force, never use --no-verify, never post on GitHub (except the integrator's draft PR). Never change /home/user/PhysicalTherapy's or /home/user/ops's working trees.
- Report: write your full report to the file named below; return the structured summary (short). Every check with its command and result.`

const BUILDER_SCHEMA = {
  type: 'object',
  properties: {
    role: { type: 'string' },
    branch: { type: 'string' },
    head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    files_changed: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    failing_first: { type: 'array', items: { type: 'object', properties: { test: { type: 'string' }, failed_before: { type: 'boolean' }, passes_after: { type: 'boolean' } }, required: ['test', 'failed_before', 'passes_after'] } },
    requests_for_integrator: { type: 'array', items: { type: 'string' } },
    deviations_from_design: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] } },
    open_items: { type: 'array', items: { type: 'string' } },
    report_path: { type: 'string' },
  },
  required: ['role', 'branch', 'head', 'commits', 'files_changed', 'checks', 'failing_first', 'requests_for_integrator', 'deviations_from_design', 'open_items', 'report_path'],
}

const BUILDERS = [
  {
    key: 's1',
    title: 'S1, workflows, gate and documents',
    brief: `You are builder S1 ("workflows, gate and documents" in the design's section 4 table). Worktree /home/user/ci-speed-s1, branch co-001/ci-speed-s1 (at 49514e8, installed). You own exactly the files the section 4 table gives S1: every line of ci.yml (rewritten to section 3.1.1's job graph: static, lint, unit, db (k/N), domain model, build, e2e (k/M), images, all green; triggers, concurrency, push ranges, timeouts, artifacts with overwrite: true, per-shard "Files this shard ran", the gate's jq check); supply-chain.yml (deleted, its jobs folded in); large-zip.yml's Chromium step; the comment at screening-capacity.yml:146; the comments at apps/web/Dockerfile:24, apps/worker/Dockerfile:19 and tools/check-licenses/index.ts:11; tools/test/{workflows,ci-gate,codeowners,required-checks}.test.ts; tools/required-checks.ts; tools/engine-freeze/check.test.ts (its ci-step asserts only); packages/compliance/src/{controls.ts,controls.test.ts} (with the definedIn rule, no rule loosened); packages/db/src/domain-model/domain-model.db.test.ts (the approval case removed, the drift case kept); .github/pull_request_template.md; section 3.1.5's documents (ADR 0066 Part 1 at the exact file name the design gives; ADR 0010 and 0063 amendments; docs/runbooks/ci.md new; github-governance.md, screening-capacity.md:308-320, docs/policies/change-management.md, README.md; reconciliation-001's series entry before PR 7 and the *Amended* note on test:db; the required-checks markers); docs/product/test-matrix.md (CI-01 to CI-10 under a new "Continuous integration (CI)" heading, rows from section 3.5); packages/synth/src/{expected/types.ts, cases/matrix.ts, cases/registry.ts} (module CI, CI-01 to CI-10, and assertedBy moves for SEC-02, SEC-15, SCR-08, SCR-19) and the fixtures pnpm synth --all generates.
Interfaces fixed by the design that other builders implement: S2 makes apps/web/src/lib/routes/route-tests/{define.ts,partition.ts,route-tests.0..11.db.test.ts,snapshot.db.test.ts}, apps/worker/src/screening/consumer-lease.db.test.ts, tools/test/{ci-chromium.ts,db-shards.ts}, E2E_PREBUILT=1 and apps/web/.next/BUILD_COMMIT; S3 makes tools/lint/run.ts and tools/typecheck/run.ts and changes the root package.json scripts "typecheck" and "lint". Reference their paths exactly; tests of yours that need their files to exist (controls definedIn, synth assertedBy) will pass only after integration: say which in requests_for_integrator.
Failing first where the design's section 3.1.4 says so (the gate test, the concurrency and Chromium rules on a fixture workflow, required-checks, the controls definedIn rule). Checks before you finish: actionlint .github/workflows/*.yml; pnpm exec vitest run tools/test tools/engine-freeze/check.test.ts packages/compliance packages/synth (under the lock); flock /tmp/laneb-heavy.lock pnpm typecheck; flock /tmp/laneb-heavy.lock pnpm lint (today's lint, one process; S3 replaces it); flock /tmp/laneb-heavy.lock pnpm synth --all then git status clean apart from your intended fixtures; the stale-name git grep of section 3.1.6 (record what remains and why). Report: ${OUT}/s1.md.`,
  },
  {
    key: 's2',
    title: 'S2, database and e2e suites',
    brief: `You are builder S2 ("database and e2e suites" in the design's section 4 table). Worktree /home/user/ci-speed-s2, branch co-001/ci-speed-s2 (at 49514e8, installed). You own exactly: apps/web/src/lib/routes/route-tests*/** (route-tests.db.test.ts deleted; route-tests/{define.ts, partition.ts, partition.test.ts, snapshot.db.test.ts, route-tests.0.db.test.ts ... route-tests.11.db.test.ts}); apps/web/src/lib/routes/test-support/contract-world.ts (the page-read memo keyed by SHA-256; probe diff at ${SP}/ci-design/contract-world.probe.diff); the three comment lines naming the old file (apps/web/src/lib/routes/index.ts:44, apps/web/src/lib/http/route.ts:144, apps/web/src/lib/routes/uploads.db.test.ts:30); apps/worker/src/screening/{consumer.db.test.ts, consumer-lease.db.test.ts (new, SCR-19 moved there)}, apps/worker/src/screening/test-support/consumer.ts (new: consumerBoss, timedConsumer); vitest.config.ts (globalSetup tools/test/ci-chromium.ts for the unit and db projects; the db results-cache/sequence settings); tools/test/{ci-chromium.ts, ci-chromium.test.ts, db-shards.ts, db-shards.test.ts}; apps/web/playwright.config.ts (failOnFlakyTests on CI, the github reporter on CI, E2E_PREBUILT=1 runs tsx scripts/build-stamp.ts --expect "$(git rev-parse HEAD)" instead of pnpm run build); apps/web/scripts/build-stamp{,.test}.ts.
Section 3.1.2 says how: the snapshot folded into one prepared statement built from tenantTables(), returning exactly the per-table function's string, read in one statement snapshot; 12 files with a deterministic cost-balanced partition; the partition test absorbs "generates tests for every registered route, and every authenticated route has a sample"; the snapshot-equivalence test. Count every test before and after: the 12 route files together must hold exactly the old file's tests (A2); state the counts with their commands. Failing first per section 3.1.4 (partition before the split; snapshot equivalence; ci-chromium; build-stamp; db-shards against a fixture sequencer that drops a file).
Checks before you finish (each heavy one under flock /tmp/laneb-heavy.lock): the partition test; snapshot.db.test.ts; two of the twelve route files (record each file's duration; the design's target is each at or under 90 s on CI); consumer-lease.db.test.ts once and consumer.db.test.ts once; db-shards.test.ts; ci-chromium.test.ts; build-stamp.test.ts; the web and worker unit tests; pnpm typecheck; pnpm lint; and one bounded proof of E2E_PREBUILT: pnpm build (web), write the stamp, then run ONE short e2e spec (for example font-hosts.spec.ts) with E2E_PREBUILT=1 against a scratch database as playwright.config.ts's webServer prepares it, showing that no second build ran and that a wrong stamp is refused. Report: ${OUT}/s2.md.`,
  },
  {
    key: 's3',
    title: 'S3, lint and typecheck runners',
    brief: `You are builder S3 ("lint and typecheck runners" in the design's section 4 table). Worktree /home/user/ci-speed-s3, branch co-001/ci-speed-s3 (at 49514e8, installed). You own exactly: tools/lint/** (run.ts, groups.ts, groups.test.ts: three groups, apps/web, packages and the complement ".", with the other roots ignored so coverage is total by construction; each group its own node --max-old-space-size=<heap> eslint process with --max-warnings=0; the memory-bounded scheduler of section 3.1.2: budget os.totalmem() minus 2 GiB, each heap the smaller of nominal (6,144 MB web, 4,096 MB others) and the budget, largest first, within os.availableParallelism(), always at least one running; each group prints its file count, peak RSS and duration); tools/typecheck/** (run.ts, run.test.ts: the root tsc --noEmit -p tsconfig.json plus every workspace's tsc --noEmit -p <dir>/tsconfig.json --incremental --tsBuildInfoFile node_modules/.cache/tsc/<slug>.tsbuildinfo, slowest first, concurrency bounded by cores and memory about 2 GB each; the workspace list derived from pnpm-workspace.yaml's globs; a check that every workspace's own typecheck script is tsc --noEmit; never edit any workspace's tsconfig or package.json, because tools/engine-freeze/check.ts freezes packages/pricing's); and the root package.json's "typecheck" and "lint" scripts only.
Prove equivalence: the new lint finds exactly the files and the problems the old single process finds (run both on the base tree, and on a tree with one deliberate lint error in each group, then revert it); the new typecheck fails on a deliberate type error in each of web, a package and tools (then revert), and the warm run reports its cache use. Record cold and warm typecheck times and each lint group's peak RSS and duration (under flock /tmp/laneb-heavy.lock). Failing first per section 3.1.4 (groups.test.ts, run.test.ts). Checks: your tests; pnpm typecheck (new runner, cold and warm); pnpm lint (new runner); the old commands for comparison. Report: ${OUT}/s3.md.`,
  },
]

phase('Build')
const built = await parallel(BUILDERS.map(b => () =>
  agent(`${CTX}\n\n${b.brief}\n\nReturn the structured summary.`, { label: `build:${b.key}`, phase: 'Build', schema: BUILDER_SCHEMA })))
const missing = BUILDERS.filter((b, i) => !built[i]).map(b => b.key)
if (missing.length) throw new Error('A builder returned nothing: ' + missing.join(', ') + '. Not integrating a partial build.')
log('Builders done: ' + built.map(b => `${b.role} ${b.head.slice(0, 7)} (${b.commits.length} commits)`).join('; '))

const INTEGRATOR_SCHEMA = {
  type: 'object',
  properties: {
    pr_number: { type: 'number' },
    pr_url: { type: 'string' },
    head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    seams_fixed: { type: 'array', items: { type: 'string' } },
    counts: { type: 'string', description: 'unit, db, golden, e2e test counts vs base, with commands' },
    deviations_from_design: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, why: { type: 'string' } }, required: ['what', 'why'] } },
    open_items: { type: 'array', items: { type: 'string' } },
    summary_path: { type: 'string' },
  },
  required: ['pr_number', 'pr_url', 'head', 'commits', 'checks', 'seams_fixed', 'counts', 'deviations_from_design', 'open_items', 'summary_path'],
}

phase('Integrate')
const integ = await agent(`${CTX}

You are the integrator of co-001/ci-speed. Worktree /home/user/ci-speed, branch co-001/ci-speed (at 49514e8, installed, no upstream). The three builders finished on local branches co-001/ci-speed-s1, co-001/ci-speed-s2 and co-001/ci-speed-s3 (worktrees /home/user/ci-speed-s1..s3); their reports are ${OUT}/s1.md, s2.md, s3.md and their summaries:
${JSON.stringify(built, null, 1)}

1. Merge the three branches into co-001/ci-speed (git merge --no-ff, one at a time), then fix every seam: each builder's requests_for_integrator, interfaces that disagree, tests that needed another builder's files. Check the merged tree against the design's section 3.1.3 file list and 3.1.6's required-check names; anything missing from the design gets built now.
2. Checks on the merged head, every heavy one under flock /tmp/laneb-heavy.lock, each recorded with its result: pnpm typecheck (the new runner, cold then warm); pnpm lint (the new runner); actionlint .github/workflows/*.yml; the full unit suite pnpm test (with its coverage gate); pnpm exec vitest run tools/test tools/lint tools/typecheck packages/compliance packages/synth apps/web/scripts apps/web/src/lib/routes/route-tests/partition.test.ts; pnpm synth --all && git diff --exit-code -- fixtures/synthetic; the section 3.1.6 stale-name git grep (empty but for listed history lines); bounded db proofs with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres: snapshot.db.test.ts, route-tests.0.db.test.ts, consumer-lease.db.test.ts, domain-model.db.test.ts; pnpm db:domain-model --check --strict --require-approval against a freshly migrated scratch database tp_laneb_cispeed_dm (drop it after); PR_NUMBER unset run of tools/engine-freeze/check.ts against 49514e8 for the engine diff stat (empty); the scope check of section 3.1.7 step 2 (no file under packages/db/migrations, docs/product/domain-model.md, packages/db/domain-model, packages/pricing). Count tests against the base (A2): unit via the full run; db by summing vitest list --project db over files (both trees); state the route tests' count before and after the split.
3. Push once: git push -u origin co-001/ci-speed (the pre-push hook runs the fixture check and gitleaks; if it refuses, rewrite only the unpushed commit and push again; never force, never --no-verify).
4. Open the draft PR into claude/build-platform with the GitHub MCP tool create_pull_request (load it with ToolSearch "select:mcp__github__create_pull_request"; owner PureTideWater, repo PhysicalTherapy, head co-001/ci-speed, base claude/build-platform, draft true). Title: "CI 1 of 4, ci-speed: parallel jobs behind one gate, CI in about 10 minutes (audit #109; ADR 0066)". Body: fill every section of .github/pull_request_template.md as it stands at your head (What changes; Why: audit #109, Lane B's claim in claude/build-ops LANES.md, the design designs/lane-b-ci.md; What it does not change: answer each line; Checks: every command above with its result; Reviewer agents' findings: "Two adversarial reviews run next; findings and resolutions follow in the fix round"; Freeze exception: No; Domain model: "No migration; the document is unchanged." plus the output of pnpm db:domain-model --summary-since origin/claude/build-platform; The founder's approval: as the template says). No PHI. End the body with exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
5. Write the build summary to ${OUT}/build-summary.md in the house format of /home/user/ops/approval-summaries/pr6b4-build-summary.md (every check with its result, every builder deviation with its reason, every open item).
Return the structured summary.`, { label: 'integrate', phase: 'Integrate', schema: INTEGRATOR_SCHEMA })
if (!integ) throw new Error('The integrator returned nothing.')
log(`Draft PR #${integ.pr_number} at ${integ.head.slice(0, 7)}`)

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    reviewer: { type: 'string' },
    head_reviewed: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, file: { type: 'string' }, line: { type: 'string' }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'issue', 'evidence', 'fix'] } },
    checks_done: { type: 'array', items: { type: 'string' } },
    ci_read: { type: 'string', description: 'what CI on the head showed when you read it (job names, results, durations) or "not finished"' },
  },
  required: ['reviewer', 'head_reviewed', 'findings', 'checks_done', 'ci_read'],
}

const REVIEWS = [
  {
    key: 'ci-infra',
    lens: `CI and test infrastructure. Use .claude/agents/payment-engine-reviewer.md and .claude/agents/security-reviewer.md only for their general method; your checklist is: (1) A2, no test lost: count unit, db, golden and e2e tests at the head against 49514e8 yourself (vitest list; Playwright --list), including the route tests' 6,293 cases and the moved SCR-19 and approval case; (2) the db shards: disjoint and complete for N = 4 and N = 6 through vitest's own sequencer, every shard running migrations, the catalog and cross-tenant tests in some shard on every PR, no shared cluster state across shard jobs; (3) the snapshot fold: prove by reading and by running snapshot.db.test.ts that it returns exactly the per-table function's string in one statement snapshot and that new tables join it; (4) the partition: every route in exactly one file, deterministic, balanced; (5) the gate: all green fails on failure, skip and cancel, its needs equal every other job, and a job added later cannot escape it (is there a test?); (6) E2E_PREBUILT: the journeys run the production build that ships; a stale build is refused; the brand journey's pixel baselines still compare under the same Chromium; (7) timeouts, caches (keys, restore prefixes, what a stale cache can do), concurrency groups and cancel rules, push runs and github.event.before ranges including the zero SHA; (8) the lint and typecheck runners: total coverage by construction, equivalence to the old commands, memory on 16 GiB and 8 GiB; (9) every place that named the old checks updated (the stale-name grep), and the required-checks test really reads every listing; (10) A1: will the graph meet 10 minutes; read CI on the head if it has run (get_job_logs) and use its real durations.`,
  },
  {
    key: 'security-supply',
    lens: `Security and the supply chain, with the checklist in .claude/agents/security-reviewer.md applied to what this PR touches. Specifically: (1) workflow permissions minimal per job and nothing gained over 49514e8; no pull_request_target; no secret or token reaches a step that runs PR code; (2) artifacts passed between jobs (web-build, playwright-<k>): can a PR poison anything a privileged workflow (release.yml, publish-content.yml, approval-of-record.yml) later trusts; caches (tsc, vitest, pnpm): can a PR's cache entry reach the build branch's or a release's runs; (3) the supply-chain gates moved from supply-chain.yml (licences, image scan) and the secret scan, audit, fixture check, releases-immutable and the engine freeze still run on every PR and every push and block through all green; nothing weakened, including the ranges on push runs; (4) the domain model approval as its own job still enforces CO-02 (pnpm db:domain-model --check --strict --require-approval) and still fails a schema PR without the founder's line; the approval-of-record workflow untouched in effect; (5) the compliance controls (packages/compliance) still map every control to real evidence, with no rule loosened by definedIn; (6) the test-support page-read memo and the snapshot fold cannot hide a tenant-isolation regression (CLAUDE.md rule 4: the cross-tenant and catalog tests); (7) no PHI, no real file, no model identifier, gitleaks clean over the PR's commits; (8) the documents (ADR 0066 Part 1, ADR 0063/0010 amendments, the governance runbook, change-management policy) state exactly what the workflows now do. Read CI on the head if it has run.`,
  },
]

phase('Review')
const reviews = await parallel(REVIEWS.map(r => () =>
  agent(`${CTX}

You are an adversarial reviewer of draft PR #${integ.pr_number} (co-001/ci-speed, head ${integ.head}) against claude/build-platform (49514e8). Assume it is wrong somewhere and find where. Work in your own fresh clone: git clone -q https://github.com/PureTideWater/PhysicalTherapy ${OUT}/review-${r.key} && cd ${OUT}/review-${r.key} && git checkout -q ${integ.head}, then pnpm install --frozen-lockfile --prefer-offline; remove the clone when you finish. Read-only: no commit, no push, no GitHub comment. The build summary is ${OUT}/build-summary.md; the design is ${DESIGN} (section 3.1). Verify claims yourself; do not trust the summary.

Your lens: ${r.lens}

Every finding with evidence (file:line, a command and its output, or a CI job id) and a concrete fix. Severity: blocking (wrong, unsafe, or a test lost), should_fix (a real defect or gap), nit. Write your full review to ${OUT}/review-${r.key}.md and return the structured result.`,
    { label: `review:${r.key}`, phase: 'Review', schema: FINDINGS_SCHEMA })))
const missingR = REVIEWS.filter((r, i) => !reviews[i]).map(r => r.key)
if (missingR.length) throw new Error('A review returned nothing: ' + missingR.join(', ') + '. Refusing to report an unreviewed PR as reviewed.')

return {
  pr: { number: integ.pr_number, url: integ.pr_url, head: integ.head, checks: integ.checks, counts: integ.counts, deviations: integ.deviations_from_design, open_items: integ.open_items, summary_path: integ.summary_path },
  builders: built.map(b => ({ role: b.role, head: b.head, deviations: b.deviations_from_design, open_items: b.open_items })),
  reviews: reviews.map(r => ({ reviewer: r.reviewer, head: r.head_reviewed, ci_read: r.ci_read, counts: { blocking: r.findings.filter(f => f.severity === 'blocking').length, should_fix: r.findings.filter(f => f.severity === 'should_fix').length, nit: r.findings.filter(f => f.severity === 'nit').length }, findings: r.findings })),
}
