export const meta = {
  name: 'lane-b-ci-speed-verify',
  description: 'Lane B ci-speed (PR #43): fresh-clone verification at b5ff4c7 that reads CI, then the PR description brought current',
  phases: [
    { title: 'Verify', detail: 'fresh clone, scope, freeze, static checks, bounded db proofs, CI read from the logs, adversarial read of the fix round' },
    { title: 'Describe', detail: 'the PR description brought current' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/187d32c5-f7cc-5438-90dc-a8051538d984/scratchpad'
const OUT = SP + '/ci-speed'
const HEAD = 'b5ff4c7401a3ce4a877a7fc158ef92c319901a4d'

const CTX = `
CONTEXT (your whole brief).
- PaidWhole, repo PureTideWater/PhysicalTherapy. Draft PR #43 (co-001/ci-speed, head ${HEAD.slice(0, 7)}, into claude/build-platform at 49514e8): CI 1 of 4, audit #109. CLAUDE.md is in your context. Design: /home/user/ops/designs/lane-b-ci.md section 3.1 (3.1.7 is the acceptance a fresh-clone verifier runs; section 1's A1 to A3). Build summary ${OUT}/build-summary.md; fix round ${OUT}/fix-round.md and ${OUT}/fix-suite.md. CI run 40196871490 on ${HEAD.slice(0, 7)}: every job green, all green in 6:17.
- Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PG18 at localhost:5433 (postgres:test). Playwright Chromium 1194 in /opt/pw-browsers. Another workflow shares the machine: wrap EVERY heavy command in flock /tmp/laneb-heavy.lock <command>. GitHub reads: the mcp__github__* tools (ToolSearch "select:mcp__github__actions_list,mcp__github__get_job_logs,mcp__github__pull_request_read,mcp__github__update_pull_request"); get_job_logs with return_content true and a large tail_lines; gh api for reads.
- Never change /home/user/PhysicalTherapy, /home/user/ops or /home/user/ci-speed; no commit, no push, no GitHub post (except the Describe agent's PR description edit).`

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    head_verified: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { check: { type: 'string' }, result: { type: 'string' }, pass: { type: 'boolean' } }, required: ['check', 'result', 'pass'] } },
    ci: { type: 'string', description: 'A1, A1-prime with the check that finished last, A2 counts vs 49514e8, the shard union, A3 per-file durations, all green log, domain model summary, differential test ran' },
    findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] }, issue: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'issue', 'evidence', 'fix'] } },
    summary_path: { type: 'string' },
  },
  required: ['verdict', 'head_verified', 'checks', 'ci', 'findings', 'summary_path'],
}

phase('Verify')
const v = await agent(`${CTX}

You are the fresh-clone verifier of PR #43 at ${HEAD}. Assume nothing the build or fix reports say; check it.
1. git clone -q https://github.com/PureTideWater/PhysicalTherapy ${OUT}/verify && cd ${OUT}/verify && git checkout -q ${HEAD}; pnpm install --frozen-lockfile --prefer-offline. Remove the clone at the end.
2. Run design section 3.1.7 steps 2 to 5 exactly (scope against the merge base, the forbidden paths empty; PR_NUMBER=43 pnpm -s exec tsx tools/engine-freeze/check.ts <merge base>; pnpm typecheck twice, the second warm; pnpm lint; actionlint; the named vitest set; pnpm synth --all with a clean diff; the stale-name search; the bounded db proofs on PG18 with DATABASE_URL=postgres://postgres:test@localhost:5433/postgres).
3. Step 6, from CI's own logs for run 40196871490 (and the check runs of ${HEAD.slice(0, 7)}): A1 (first job start to the gate's end) and runner-minutes; A1-prime with the check that finished last; A2 (unit, the four db shards, golden, e2e totals against 49514e8's unit 4,524 + 1 skipped, golden 38, db 9,041 + 1 skipped, e2e 51, accounting for the named moves and new tests); the shard union (the four "Files this shard ran" lists are disjoint and together equal pnpm -s vitest list --project db --filesOnly at the head; compare their printed SHA-256 and counts); A3 (no db file over 240 s; each route file at or under 90 s); all green's log lists every job; domain model green with its summary against origin/claude/build-platform; unit's differential test ran, not skipped.
4. An adversarial read of the fix round, git diff 9144b56..${HEAD.slice(0, 7)}: does every disposition in ${OUT}/fix-round.md hold in the code; did any fix weaken a check, skip a test or widen the PR's scope; is anything in the description now false.
5. Write the approval summary to ${OUT}/verify-summary.md in the house format of /home/user/ops/approval-summaries/pr6b3-verify-summary.md: every check with its result, the CI figures, every finding, the verdict. Verdict pass only if every check passes and no blocking or should_fix finding stands.
Return the structured result.`, { label: 'verify', phase: 'Verify', schema: VERIFY_SCHEMA })
if (!v) throw new Error('The verifier returned nothing; the PR is not verified.')

phase('Describe')
const d = await agent(`${CTX}

You bring PR #43's description current. Read it (pull_request_read get) and ${OUT}/fix-suite.md's open items: parts of the description outside the fix round's rows still describe the state before the fix round (for example the departures list's "pg_isready wait before the quiet-logs step", now service health checks; "harnesses create their temporary directories when a file opens", now beforeAll; the stale-name grep's line numbers). Also add a "Verification" section from ${OUT}/verify-summary.md (verdict ${v.verdict}, the head ${HEAD.slice(0, 7)}, every check and the CI figures in one table). Change nothing else. Keep the body's ending exactly:

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012JSUcTRpwofpy5vcyY31Z4
Update with update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 43, body only), read it back and confirm it matches, footer included. Return one line saying what changed.`, { label: 'describe', phase: 'Describe' })

return { verify: v, describe: d }
