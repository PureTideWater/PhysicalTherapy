export const meta = {
  name: 'co-001-pr-06-round-3-review',
  description: 'PR 6 round 3: merge 82035ae, fix the result-page heap blocker and the case registry, open the draft PR; three independent reviews; fix round with the full suite and the domain model regenerated',
  phases: [{ title: 'Prepare' }, { title: 'Review' }, { title: 'Fix' }],
}
const WT = '/home/user/pr6'
const BR = 'co-001/pr-06-free-screening'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad'
const DESIGN = `${SP}/design/pr6-53-57-screening.md`
const DECISIONS = `${SP}/design/decisions-2026-10-20.md`
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks. Postgres 18 is postgres://postgres:test@localhost:5433/postgres and Postgres 16 is on 5432 (never stop either; never leave a cluster-wide role behind). Scratch databases tp_pr6r3b_<role>_<n>, dropped after use; e2e ports 4731 (prepare), 4741 (fix). Logs in ${SP}/pr6-r3b/<role>/. The edit hooks are live: a migration edit needs ${WT}/.claude/.allow-protected-edit for the edit only (shell-created, removed in a trap, never committed).`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`
const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head bef9f3b. PR 6 is the free screening (CO-04): migration 20261104090000_free_screening.sql, unmerged, awaiting the founder's approval; PR 5 merges first and PR 6 regenerates its domain model after that. This round built audit #57's schema and day-one writes (the counts-only screening_outcome, screening_lead and its products, marketing_campaign, source and campaign attribution with the first-party pw_first_touch cookie, referring firm, lost reasons on decline, a 'result opened' signal, the plain list of what is kept on every surface) and audit #53 parts 1 and 2 (the synthetic scale release 900100, the capacity harness tools/screening-capacity and .github/workflows/screening-capacity.yml, the per-release keyed read with its oracle), to the reviewed design ${DESIGN} and the founder's answers to decisions 7 to 19 in ${DECISIONS}. Earlier rounds, all verified: the 11-claim-line floor in three layers, the rows hash computed by the database, one accepted screening per practice. Rules: CLAUDE.md; screening data holds no PHI; catalog and cross-tenant tests pass; nothing under packages/pricing/src, fixtures/golden, content/releases or the ledger changes; never write the domain model's approval line or touch approvers.json; main is never touched. Pushes: 'git push origin ${BR}' with the 2/4/8/16 s retry (if the pre-push launcher refuses because the branch lacks .githooks/pre-push, push from the main checkout: 'git -C /home/user/PhysicalTherapy push origin ${BR}'). Keep returned summaries short: what changed, every check with its result, every open item.`
const RESULT = { type: 'object', properties: { summary: { type: 'string' }, head: { type: 'string' }, pr_number: { type: 'number' }, checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } }, open_items: { type: 'array', items: { type: 'string' } } }, required: ['summary', 'head', 'checks'] }
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'failure_path', 'fix'] } }, verdict: { type: 'string' } }, required: ['findings', 'verdict'] }

phase('Prepare')
const prep = await agent(`${CONTEXT}

${ENV}

Your task:
1. Merge origin/claude/build-platform (82035ae: #24's runner pin and #25's governance: CODEOWNERS, approvers.json format 2, approval-of-record, .claude hooks, .githooks/pre-push, job timeouts, pinned gitleaks in CI, the PR template, CLAUDE.md lines) with a merge commit; resolve conflicts keeping both sides (expect .github/workflows, tools/test/workflows.test.ts, docs/adr and docs/product); the new screening-capacity.yml must satisfy #25's workflow tests (pinned runner, timeout-minutes, permissions) and actionlint.
2. Fix the blocker the capacity run found: the screening result page renders all of screening_result_groups(), and a worst-shape result (20,507 groups) exhausts the web task's 512 MiB heap, so the link does not open and the task exits. Best option, not the smallest: the page's memory must be bounded whatever the result's size. Compute the totals and the shown rows in SQL (if a new or changed function is needed, it goes in PR 6's migration), render a bounded, ordered first page of groups (by the largest difference, with the rest summarised and reachable by server-side pagination or a download the page already offers), and keep every figure computed by code. Prove it: a test that renders the worst shape under a 512 MiB heap, and the harness's result-page scenario passes locally.
3. The case registry: SCR-03's rewording and SCR-10 to SCR-14 in packages/synth/src/cases/matrix.ts and registry.ts, with 'pnpm synth --all' fixtures regenerated and fixtures.test.ts passing.
4. Whole-repository pnpm typecheck clean, lint, lint:copy, lint:logs; the unit and db tests of the packages you touched; the screening e2e (port 4731).
5. Push, then open a DRAFT pull request into claude/build-platform from ${BR} with the GitHub tools (ToolSearch for mcp__github__create_pull_request; owner puretidewater, repo physicaltherapy, draft true), its body following .github/pull_request_template.md's sections briefly (what changes, why, what it does not change, checks so far, 'reviews in progress', freeze exception: no, domain model: regenerated after PR 5 merges and awaiting the founder's approval). Return the PR number.
${ATTR} Return the summary, the head, the PR number, every check and the open items.`, { label: 'prepare: merge, heap fix, registry, draft PR', phase: 'Prepare', schema: RESULT })
if (!prep) throw new Error('prepare failed')

phase('Review')
const brief = `${CONTEXT}

The prepare step pushed ${prep.head} and opened draft PR #${prep.pr_number}: ${prep.summary}
You are an independent adversarial reviewer of this round's changes (git -C ${WT} diff 3c1b289...origin/${BR}, minus what 82035ae brought). Do not edit, stage or commit in ${WT}; clone into ${SP}/pr6-r3b/<your-label> to run anything. Report each finding with file, line, a concrete failure path and a fix; if nothing is wrong, say so with what you checked.`
const reviews = await parallel([
  () => agent(`${brief}

Your angle: privacy and the data. Can two counts-only outcomes, an outcome and a lead, or an outcome and a request be subtracted or joined to reveal a row of fewer than 11 claim lines, a practice, an email or a ZIP? Does any outcome, lead or campaign column hold PHI or a person's details beyond what decision 7's wording says is kept? Do expiry, replacement, withdrawal and conversion unlink and delete exactly as the rulings say, under concurrency? Is the pw_first_touch cookie first-party, HttpOnly, 30 days, first touch, never holding the click ID, and does proxy.ts set it without breaking caching or the CSP? Does every surface that promises deletion now say what is kept, in plain words? Are RLS, the PHI registry decisions and grants right for each new table (the catalog and cross-tenant tests)?`, { label: 'review: privacy and data', phase: 'Review', schema: FINDINGS }),
  () => agent(`${brief}

Your angle: the SQL and its races. Read every new or changed function, trigger and CHECK in the migration: forged arguments from tp_app, a caller outside its practice or prospect, NULL and boundary values, two submissions or conversions at once, a decline without a reason, the 'result opened' signal forged or replayed, campaign registration abuse, the keyed run reads (#53) returning the wrong rows or leaking another run's. Check the result-page fix: is memory bounded for any size, are the totals and the first page computed in SQL with the same figures the old path showed, and is ordering stable?`, { label: 'review: SQL, forge and race', phase: 'Review', schema: FINDINGS }),
  () => agent(`${brief}

Your angle: the capacity test and CI. Does tools/screening-capacity prove what decisions 13 to 16 say (three 50,000-row uploads at once, a small one behind, cold cache, production task sizes, fail at 48 s on the runner until RUNNER_TO_FARGATE is set, timing 'open, PR 6b' until environments.ts declares compute.screening)? Can it pass without proving anything (a skipped scenario, a mocked timer, a cache warmed by an earlier step)? Is the oracle comparison of the per-release keyed read real and complete? Will screening-capacity.yml pass on GitHub's ubuntu-24.04 runner (Docker, memory, the 1.8 GB Actions cache, timeouts), and what does it cost in minutes per week and per pull request? Would anything here turn ci's check red?`, { label: 'review: capacity test and CI', phase: 'Review', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${all.length} review findings`)

phase('Fix')
const fix = await agent(`${CONTEXT}

${ENV}

You are the fix round for PR 6 (draft PR #${prep.pr_number}, head ${prep.head}). Three independent reviewers reported the findings below. Each is a claim to verify, not an order: reproduce it or trace a realistic path; fix the real ones in proportion; for each one you do not fix, say why. Anything that needs a decision the founder has not made goes in open_items as a question with the recommended answer first.

Findings: ${JSON.stringify(all, null, 2)}
Verdicts: ${reviews.filter(Boolean).map(r => r.verdict).join(' | ')}

Then run the full local suite once: pnpm install --frozen-lockfile; check:fixtures; typecheck; lint; lint:logs; lint:copy; pnpm test (CI=true); test:golden; test:oracle; on a fresh PG18 database db:migrate and pnpm test:db; test:e2e (port 4741); pnpm build. Regenerate docs/product/domain-model.md LAST with pnpm db:domain-model (unapproved: no approval line), so that exactly one test:db case fails, the founder's approval; print its SHA-256. For a timing-bound test that fails only under load, rerun that file alone and report both. Commit in the repository's style, push, and return the summary, the head, the domain model's SHA-256 in the summary, every check and the open items.`, { label: 'fix review findings and full suite', phase: 'Fix', schema: RESULT })
return { prep, reviews, fix }
