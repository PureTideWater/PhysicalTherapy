export const meta = {
  name: 'lane-b-ci-deps-reread',
  description: 'ci-deps (CI 2 of 4): re-read designs/lane-b-ci.md section 3.2 against claude/build-platform 6ddd587, bring it current, one adversarial review, then every finding resolved',
  phases: [
    { title: 'Scout', detail: 'two scouts: the files section 3.2 changes as they stand now; the versions, pins and policies as they stand now' },
    { title: 'Revise', detail: 'one author brings section 3.2 current at 6ddd587' },
    { title: 'Review', detail: 'one adversarial reviewer' },
    { title: 'Fix', detail: 'every finding verified and resolved in the design' },
  ],
}

const D = '/home/user/ops/designs/lane-b-ci.md'
const DD = '/home/user/ops/designs/lane-b-ci'
const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context; lane rules /home/user/ops/LANES.md; Lane B's state /home/user/ops/lanes/lane-b.md "Start here (Lane B)", step 3). The design is ${D}; its section 3.2 (from "### 3.2" to "### 3.3") is the contract for ci-deps, the second of four CI pull requests (audit #112; #19's assert loosening, Dependabot groups and licence fix; Dependabot #40, #38's tooling and #33). Section 3.2 was written and reviewed on 2026-10-24 at claude/build-platform 49514e8. Since then ci-speed (#43, 9c57d2d) and ci-mutation (#44, de8f9b5) and PR 15 (#45) merged; the head is 6ddd587. The main checkout /home/user/PhysicalTherapy is at 6ddd587 (git history has 49514e8).
Rulings that bind it (lanes/lane-b.md and HANDOFF.md record each): the founder's F1 (a) default branch becomes claude/build-platform when ci-deps merges; F2 (a) Dependabot alerts and security updates with F1; F2 (b) pnpm minimumReleaseAge 4320 with dated exact-version excludes of at most 7 days, enforced by check-toolchain (test its exclude path; Stryker 10.1.1 was held by it); F3 SHA pinning after ci-deps; F4 publish-content.yml may change only its uses: refs and version comments, and once its runs-on and a timeout-minutes, held to a frozen copy; F5 the release's capacity chain stays on ubuntu-24.04. The co-founder's Q2 (2026-10-25): the files ci-deps shares with Lane A's open #42 (the lockfile, manifests, tools/screening-capacity/watched-paths.txt, ADR 0062) go under LANES rule 6, the PR merged second keeps both, the lockfile re-resolved and never hand-merged. The co-founder's Q3: engineering-only choices inside this already-ruled design are pre-approved (record each as such); a choice with a cost, security, product or wording trade-off goes to him, recommended option first.
New fact: the F7 ruleset is applied (2026-10-25 21:14 UTC): "Protect the build branch" on claude/build-platform requires all green, mutation, screening-capacity gate and approval-of-record from GitHub Actions, branches up to date, a PR with 0 approvals, no force push or deletion, no bypass. Documents that still say the ruleset is not yet applied, or call a check required only by ADR 0063, are now stale.
Rules for you: read-only on /home/user/PhysicalTherapy and on GitHub (gh api GET only; never comment, review or change anything there). Write only the files your task names, under ${DD}/ or ${D}. Never run git add, commit, push, checkout, reset or stash: the orchestrator commits. No heavy command (no install, build or test runs). Network reads (git ls-remote, gh api, the npm registry through pnpm view, raw.githubusercontent.com) are fine. Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. No model name in any file. Keep the design's plain style: short sentences, file:line evidence, lines near 120 characters.`

const SCOUT = { type: 'object', properties: { report: { type: 'string', description: 'path of the report written' }, changesNeeded: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'string' } } }, required: ['report', 'changesNeeded', 'questions'] }

phase('Scout')
const [files, versions] = await parallel([
  () => agent(`${RULES}

Task: scout the files. Write ${DD}/scout-ci-deps-reread-files.md.
For every file section 3.2.2 lists and every place 3.2.1 changes:
- git -C /home/user/PhysicalTherapy diff 49514e8 6ddd587 -- <file>: what ci-speed, ci-mutation and PR 15 changed there; every file:line that 3.2 cites, as it reads now (for example workflows.test.ts's PINNED, cited at :46-58, is near :77 now);
- what is already done, what moved, and new places the change must now reach: mutation.yml's jobs (pins, timeout-minutes, the release-age rules, Stryker 10.1.1), ci.yml's new parallel jobs and the all-green gate, the e2e and db shards, any new workflow or tools file since 49514e8 (git diff --stat 49514e8 6ddd587 -- .github tools package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc docker-compose.yml '*Dockerfile*');
- the plan to replace the Postgres services: with compose: ci-speed gave the services health checks; is replacing them still the best option, and what would it cost or gain now? Evidence either way;
- the carry-in nits, as they read now: ADR 0066:333 (the mutation gate's wording; now required by the applied ruleset), ADR 0066:179 (Part 1's Measured: should be 146 new tests less 12 renamed, 4,658 and 1 skipped on CI at b5ff4c7), .github/dependabot.yml:4 ("about 45 runner minutes"; measured 36-38, 43-44 billed), and the capacity-gate time "13 to 16 minutes" at docs/runbooks/ci.md:97, docs/runbooks/github-governance.md:66 and ADR 0066:175 (measured since: 11:59, 15:52, 18:28, 18:32, 17:30);
- every place in the repository that says the ruleset is not yet applied or that a check is required only by ADR 0063's merge rule (grep docs, ADRs, runbooks, README, CLAUDE.md, tools), now stale under F7;
- the files ci-deps shares with #42 (gh api 'repos/PureTideWater/PhysicalTherapy/pulls/42/files?per_page=100&page=1' and page=2): which ones, and how rule 6 resolves each.
Return the changes the design needs and any question that is not engineering-only.`, { label: 'scout:files', phase: 'Scout', schema: SCOUT }),
  () => agent(`${RULES}

Task: scout the versions, pins and policies. Write ${DD}/scout-ci-deps-reread-versions.md.
- Each action in 3.2.1's table: the latest release tag today (git ls-remote --tags https://github.com/<owner>/<repo>), its peeled SHA (refs/tags/vX.Y.Z^{}), its release date (gh api repos/<owner>/<repo>/releases/tags/<tag>), and any action ci-speed or ci-mutation added since (actions/cache, etc.). Say where the table is stale and whether any newer major has breaking changes for our usage (read its release notes and action.yml inputs at the SHA).
- Dependabot #40 (gh api repos/PureTideWater/PhysicalTherapy/pulls/40 and its files): its updates now; how ci-deps' own pins supersede each. #33: what it proposes now (node:26-slim, head bc82651) and the plan (an ignore rule; both images to Debian trixie digests on Node 24; Node 26 in its own PR, N8). Find the current digests the builder will pin (node 24 trixie-slim, the postgres image, any other image in docker-compose.yml, Dockerfiles and workflows), or the exact way to read them through this proxy if the registry refuses.
- #38's versions (closed by Dependabot on 2026-10-25 because Stryker 10.1.1 was under three days old): every direct dependency that is behind at 6ddd587 (vitest and @vitest/coverage, eslint, postcss, next, typescript and the rest of the manifests), with the latest version and its publish time (pnpm view <pkg> time --json); which are older than three days on 2026-10-26 and 2026-10-27, and which would need a dated exclude under F2 (b). Leave Playwright and axe to ci-browser.
- pnpm: the version 3.2 targets (10.34.8, open item O3) against the latest 10.x today; whether the 23 advisories of 10.28.0 are fixed in it; how minimumReleaseAge behaves on a frozen install, under Dependabot (which passed --config.minimum-release-age=4320 and failed on Stryker), and with minimumReleaseAgeExclude (exact syntax; cite pnpm's documentation or source).
- When Dependabot's npm updates resume (Stryker 10.1.1 three days old, about 2026-10-26 19:50 UTC) and what ci-deps should do so its own versions and Dependabot's next PR do not fight.
Return the changes the design needs and any question that is not engineering-only.`, { label: 'scout:versions', phase: 'Scout', schema: SCOUT }),
])
if (!files || !versions) throw new Error('A scout returned nothing.')

phase('Revise')
const revise = await agent(`${RULES}

Task: bring section 3.2 of ${D} current at 6ddd587, from the two scout reports ${files.report} and ${versions.report} (read both whole) and the code itself.
Their summaries: files ${JSON.stringify(files.changesNeeded)}; versions ${JSON.stringify(versions.changesNeeded)}.
Revise 3.2.1 to 3.2.5 in place so they are the contract a builder follows today: every file:line current, every version current and old enough for F2 (b) on the day the builder pins it (or a dated exclude), the places ci-speed and ci-mutation added, what they already did removed, the carry-in nits, the stale ruleset wording now that F7 is applied, the #42 overlap under Q2, and the services-versus-compose decision made on evidence. Keep the CI-11 to CI-14 test-matrix rows and ADR 0066 Part 2 (no new ADR number). Change other sections only where a cross-reference must follow (section 0's ci-deps line, section 5, section 11, and line 662's stale "Node 25" for #33).
Then add "#### 3.2.6 Re-read at 6ddd587 (2026-10-25)" at the end of 3.2: each change from the 2026-10-24 text with its evidence; each engineering-only choice you made, marked "pre-approved (the co-founder's Q3, 2026-10-25)"; and any choice with a cost, security, product or wording trade-off, as a question for the co-founder with the recommended option first. Confirm in one line that ci-deps still needs no migration and changes no engine, ledger or content-pipeline code beyond F4.
Return what you changed and the open questions.`, { label: 'revise', phase: 'Revise', schema: { type: 'object', properties: { changed: { type: 'array', items: { type: 'string' } }, questions: { type: 'array', items: { type: 'string' } } }, required: ['changed', 'questions'] } })
if (!revise) throw new Error('The author returned nothing.')

phase('Review')
const review = await agent(`${RULES}

Task: adversarially review the revised section 3.2 of ${D} (from "### 3.2" to "### 3.3", including the new 3.2.6). Assume it is wrong until the code and the network prove it right.
Check: every file:line against /home/user/PhysicalTherapy at 6ddd587; every version, tag, SHA and date against the network; that each ruling above is honoured exactly (F1 to F5, Q2, Q3); that nothing ci-speed or ci-mutation built is undone or missed (mutation.yml, the gate, the shards); that every test is specified failing-first where it fixes a behaviour and the acceptance is measurable by a fresh-clone verifier; that the scouts' facts (${files.report}, ${versions.report}) were carried in correctly; that no migration, no engine, ledger or content-pipeline change beyond F4 slips in; that the #42 overlap is resolved under rule 6; that audit #112 is still delivered whole (read its item in /home/user/ops/audits/combined/combined-report.md); and that every "pre-approved" choice really is engineering-only.
Write ${DD}/ci-deps-reread-review.md: findings ranked blocking, should_fix, nit, each with evidence and the fix. Return them.`, { label: 'review', phase: 'Review', schema: {
  type: 'object',
  properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, claim: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'claim', 'evidence', 'fix'] } }, verdict: { type: 'string' } },
  required: ['findings', 'verdict'],
} })
if (!review) throw new Error('The reviewer returned nothing.')

phase('Fix')
const fix = await agent(`${RULES}

Task: resolve every finding of the review of section 3.2 of ${D}. The review: ${DD}/ci-deps-reread-review.md. Findings:
${JSON.stringify(review.findings, null, 1)}
For each: verify it against the code and the network yourself. If it is right, fix the design; if it is wrong, reject it with the evidence. Nits included. Record every disposition in a new "#### 3.2.7 Review of the re-read (2026-10-25)" at the end of 3.2 (finding, verdict, what changed or why not). Update 3.2.6's open questions if a fix adds or settles one.
Return the dispositions and the questions still open for the co-founder (recommended option first).`, { label: 'fix', phase: 'Fix', schema: {
  type: 'object',
  properties: { dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, verdict: { type: 'string', enum: ['fixed', 'rejected'] }, note: { type: 'string' } }, required: ['id', 'verdict', 'note'] } }, openQuestions: { type: 'array', items: { type: 'string' } }, readyForBuilders: { type: 'boolean' }, notes: { type: 'string' } },
  required: ['dispositions', 'openQuestions', 'readyForBuilders', 'notes'],
} })

return { files, versions, revise, review: { verdict: review.verdict, counts: ['blocking', 'should_fix', 'nit'].map(s => `${s} ${review.findings.filter(f => f.severity === s).length}`).join(', ') }, fix }