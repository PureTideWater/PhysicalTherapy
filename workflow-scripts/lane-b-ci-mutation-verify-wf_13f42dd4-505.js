export const meta = {
  name: 'lane-b-ci-mutation-verify',
  description: 'Lane B ci-mutation (PR #44): fresh-clone verification at 7542aae that reads CI',
  phases: [{ title: 'Verify', detail: 'fresh clone, design 3.4.4, the gate both ways, CI read from the logs, adversarial read of the fix round' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-mutation'
const HEAD = '7542aae9abda004b97b04d8e93b6d2e0d079b8b9'
phase('Verify')
const v = await agent(`PaidWhole, repo PureTideWater/PhysicalTherapy. CLAUDE.md is in your context. You are the fresh-clone verifier of PR #44 (co-001/ci-mutation, head ${HEAD.slice(0, 7)}, base claude/build-platform at 9c57d2d, which it has merged): CI 4 of 4, audit #54, mutation testing on every money package. Design: /home/user/ops/designs/lane-b-ci.md section 3.4 (3.4.4 is the acceptance) and section 1's A7. Build summary ${OUT}/build-summary.md; fix round ${OUT}/fix-fa.md, ${OUT}/fix-fb.md, ${OUT}/fix-suite.md. CI on ${HEAD.slice(0, 7)} is all green (ci run 40219164530; mutation run 40219164294). Assume nothing the reports say; check it.

Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 localhost:5433 (postgres:test). MACHINE SAFETY (a container restart stopped runs earlier today): run every command that starts vitest, tsc, eslint, Stryker or a database suite under flock /tmp/laneb-heavy.lock, one at a time, never in parallel or in the background; another workflow shares the machine. GitHub reads: mcp__github__* tools (ToolSearch "select:mcp__github__get_job_logs,mcp__github__actions_list,mcp__github__pull_request_read"), get_job_logs with return_content and a large tail_lines; gh api for reads. Read-only: no commit, push or GitHub post.

1. git clone -q https://github.com/PureTideWater/PhysicalTherapy ${OUT}/verify && cd ${OUT}/verify && git checkout -q ${HEAD}; pnpm install --frozen-lockfile --prefer-offline. Remove the clone at the end.
2. Design 3.4.4 step 1, scope against the merge base: pricing non-test diff empty and nothing under packages/pricing outside src; packages/ledger/src only *.test.ts with 0 deletions against 9c57d2d; packages/money/src's non-test diff exactly cents.ts:85; fixtures/golden unchanged; no migration or domain-model change. The freeze: pnpm -s exec tsx tools/engine-freeze/check.ts <merge base> with PR_NUMBER=44.
3. Steps 2 and 3: pnpm test:golden (188, the claim-set test green); the ledger db tests and the ledger oracle with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (LED-01 to LED-11 passing); the canary (5 of 5).
4. Step 4: the money-ledger shard (pnpm stryker run stryker/money.config.mjs and the ledger's, or tools/stryker/shards.ts for that shard) then the gate over it: passes. Then the negative proof in a scratch copy: delete one killing assertion, rerun, the gate fails naming the survivor and its file; restore.
5. pnpm typecheck; pnpm lint; actionlint; pnpm exec vitest run tools/stryker tools/test tools/screening-capacity tools/golden-worksheet packages/synth; pnpm synth --all with a clean diff.
6. Step 5, from CI's own logs: every shard's canary verdict 5 of 5 in its log and each shard at or under 15 minutes (note packets-rest's time); the mutation gate passes with the local scores (money 96.58, ledger 98.13, pricing 98.67, packets 95.87; 164 recorded equivalents, none unexplained); the ci run's jobs green, with A1 (first job start to all green's end) and which job set it; A1-prime with the check that finished last. Compare e2e (2/2)'s 14:36 on this run with 9c57d2d's push run (40201435875) and with PR #43's runs: is the slowdown this PR's (what changed in e2e?) or the runner's? Say which, with evidence.
7. An adversarial read of the fix round (git diff 9099fac..${HEAD.slice(0, 7)}): every disposition holds in the code; nothing weakened a check or a test beyond the recorded moves; is anything in the PR description now false (read it with pull_request_read).
8. Write the approval summary to ${OUT}/verify-summary.md in the house format of /home/user/ops/approval-summaries/pr6b3-verify-summary.md. Verdict pass only if every check passes and no blocking or should_fix finding stands. Return: the verdict, every check with its result, the CI figures, and every finding with severity, evidence and fix.`, { label: 'verify', phase: 'Verify', schema: {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] }, head_verified: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, result: { type: 'string' }, pass: { type: 'boolean' } }, required: ['check', 'result', 'pass'] } },
    ci: { type: 'string' },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } },
  },
  required: ['verdict', 'head_verified', 'checks', 'ci', 'findings'],
} })
if (!v) throw new Error('The verifier returned nothing; PR #44 is not verified.')
return v
