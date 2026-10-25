export const meta = {
  name: 'lane-b-ci-speed-fix',
  description: 'Lane B ci-speed (PR #43) fix round: every review finding verified and fixed, then the full local suite once, one push, the PR body updated',
  phases: [
    { title: 'Fix', detail: 'verify and fix the 4 should_fix and 11 nits' },
    { title: 'Suite', detail: 'adversarial re-read, the full local suite once, one push, PR body' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-speed'
const ATTRIB = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4'

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy. Draft PR #43 (co-001/ci-speed, head 9144b56, into claude/build-platform at 49514e8): CI 1 of 4, audit #109, parallel CI jobs behind one gate. CLAUDE.md is in your context; follow it. Design: /home/user/ops/designs/lane-b-ci.md section 3.1. Build summary: ${OUT}/build-summary.md. CI on 9144b56 is fully green (run 40166129200, all green in 7:26).
- Two adversarial reviews found 0 blocking, 4 should_fix and 11 nits: the findings are ${OUT}/findings.json (each with reviewer, id, severity, file, line, issue, evidence, fix); the full reviews are ${OUT}/review-ci-infra.md and ${OUT}/review-security-supply.md.
- The founder's standing rule: only the best option, never weighted by build effort, never sacrificing quality. The co-founder asks that every recommended fix be made.
- Hard rules: no migration; nothing under packages/db/migrations, docs/product/domain-model.md, packages/db/domain-model, packages/pricing, content/releases, fixtures/golden; no test weakened, skipped or deleted; the catalog and cross-tenant tests run on every PR; no PHI; no model identifier in any repository file or commit other than the attribution lines.
- Worktree /home/user/ci-speed, branch co-001/ci-speed tracking origin/co-001/ci-speed (installed). Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test), DATABASE_URL=postgres://postgres:test@localhost:5433/postgres; Playwright's Chromium 1194 (Chrome for Testing 141.0.7390.37, byte-identical baselines) in /opt/pw-browsers; actionlint on PATH; no Docker daemon. Another workflow shares the machine: wrap EVERY heavy command in flock /tmp/laneb-heavy.lock <command>.
- Commits in the repository's style (git log --format=%B -5), each ending with exactly:
${ATTRIB}
- Never force, never --no-verify. Only the Suite agent pushes and edits the PR. Never change /home/user/PhysicalTherapy's or /home/user/ops's working trees.`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    head: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    dispositions: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string' }, disposition: { type: 'string', enum: ['fixed', 'rejected'] }, commit: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'severity', 'disposition', 'commit', 'note'] } },
    failing_first: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['head', 'commits', 'dispositions', 'failing_first', 'checks', 'open_items'],
}

phase('Fix')
const fix = await agent(`${CTX}

You are the fixer. For every one of the 15 findings: verify it yourself against the code at 9144b56; then fix it the best way (the reviewer's fix is a suggestion, not an order), or reject it only with evidence that it is wrong. Every should_fix that holds is fixed; every nit that holds is fixed too (the co-founder asked for every recommended fix), including N-1's critical-path balance if a sound fix exists (for example caching Playwright's browsers keyed by its version, or a shard split that does not depend on test count), recording the measured or reasoned effect. A behaviour fix gets a test that fails first (show it failing before the fix): at least SF-1 (no job or step in a workflow the gate needs may mask a failure, continue-on-error included), SF-2 (the required-checks sweep reads every Markdown file and every listing of old or new names), SF-3 (the build-stamp's passing verdict reaches the CI log), S1 (no job in any workflow reports a required check's name but its own), N-5 (the stamp also refuses a dirty tree, or the runbook's local flow is made safe some other sound way), N-6 (no temp directory leaked at collection), S4 (definedIn requires a call, not just an import, if that is the sound reading). Keep each fix minimal and in scope. Run, under the lock, the checks of what you touched (the changed tests, tools/test, actionlint, pnpm typecheck, pnpm lint). Commit (one commit per coherent group is fine). Do not push. Write ${OUT}/fix-round.md with each finding's disposition. Return the structured summary.`, { label: 'fix', phase: 'Fix', schema: FIX_SCHEMA })
if (!fix) throw new Error('The fixer returned nothing.')

const SUITE_SCHEMA = {
  type: 'object',
  properties: {
    head: { type: 'string' },
    pushed: { type: 'boolean' },
    suite: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, result: { type: 'string' } }, required: ['command', 'result'] } },
    adversarial_reread: { type: 'string' },
    fixed_in_suite: { type: 'array', items: { type: 'string' } },
    pr_body_updated: { type: 'boolean' },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['head', 'pushed', 'suite', 'adversarial_reread', 'fixed_in_suite', 'pr_body_updated', 'open_items'],
}

phase('Suite')
const suite = await agent(`${CTX}

You are the fix round's suite runner. The fixer committed on co-001/ci-speed (head ${fix.head}); its dispositions:
${JSON.stringify(fix.dispositions, null, 1)}
(details in ${OUT}/fix-round.md).
1. Re-read git diff 9144b56..HEAD adversarially: what would make CI reject it, or a reviewer find it wrong? Fix what you find (commit), and say what you checked.
2. Run the FULL local suite once on the head, each step under flock /tmp/laneb-heavy.lock, recording each command's result: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm verify-content; tools/check-releases-immutable.sh 49514e8; env -u PR_NUMBER pnpm -s exec tsx tools/engine-freeze/check.ts 49514e8; pnpm synth --all && git diff --exit-code -- fixtures/synthetic; pnpm synth --large; pnpm test (with coverage); pnpm test:golden; pnpm test:oracle; pnpm licenses:check; actionlint .github/workflows/*.yml; the full database suite with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres: pnpm db:migrate then pnpm test:db (all of it, not sharded; record the count against CI's shard totals); pnpm db:domain-model --check --strict --require-approval on a freshly migrated scratch database tp_laneb_cispeed_fix (dropped after); the full e2e suite: pnpm test:e2e (all journeys, the brand journey's pixel baselines included, on the Chromium in /opt/pw-browsers; find from apps/web/e2e/env.ts which database and port it uses and give it PG18; record the count, 51 expected); and once E2E_PREBUILT=1 with a stamped build to show the prebuilt path; the stale-name git grep of design 3.1.6. Every step must pass; if one fails, root-cause and fix it (commit), then rerun that step and anything it affects.
3. Push once: git push origin co-001/ci-speed (the hook runs the fixture check and gitleaks; never force, never --no-verify).
4. Update PR #43's body with the GitHub MCP tool update_pull_request (load with ToolSearch "select:mcp__github__update_pull_request,mcp__github__pull_request_read"; read the current body first and change only what follows): the "Reviewer agents' findings" table becomes one row per finding (reviewer: "CI and test infrastructure (adversarial, fresh clone)" or "Security and supply chain (adversarial, fresh clone)"; the finding in one line with its id and severity; the resolution: fixed in <commit> with what changed, or not a defect with why); the Checks section gains a "Fix round, head <sha>" table with every suite command and its result; the commits list gains the fix round's commits. Keep the body's ending lines exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
Then read the body back and confirm it is what you wrote, footer included.
Write ${OUT}/fix-suite.md. Return the structured summary.`, { label: 'suite', phase: 'Suite', schema: SUITE_SCHEMA })
if (!suite) throw new Error('The suite runner returned nothing.')
return { fix, suite }
